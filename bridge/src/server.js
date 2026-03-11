import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createSimulatedRunEvents, mapOpenClawWebhookToEvents } from './openclawAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(relativePath, override = false) {
  dotenv.config({
    path: path.resolve(__dirname, relativePath),
    override,
  });
}

// Permanent env loading:
// 1) project root .env
// 2) bridge/.env overrides project-level defaults when present
loadEnvFile('../../.env');
loadEnvFile('../.env', true);

const port = Number(process.env.PORT ?? 8787);
const mode = process.env.BRIDGE_MODE ?? 'simulate';
const agentPool = (process.env.AGENT_IDS ?? 'npc1,npc2,npc3,npc4,npc5,npc6,npc7,npc8')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
const openRouterBaseUrl = (process.env.OPENROUTER_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://openrouter.ai/api/v1')
  .replace(/\/+$/, '');
const openRouterModel = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
const openRouterAppName = process.env.OPENROUTER_APP_NAME ?? 'Lemona_Game';
const openRouterSiteUrl = process.env.OPENROUTER_SITE_URL ?? 'http://localhost:5173';
const openRouterTemperature = Number(process.env.OPENROUTER_TEMPERATURE ?? 0.9);
const openRouterMaxTokens = Math.max(120, Number(process.env.OPENROUTER_MAX_TOKENS ?? 700) || 700);
const openRouterReadyReason = !openRouterApiKey ? 'missing_api_key' : null;

let roundRobinIndex = 0;

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.writeHead(400).end('Bad Request');
    return;
  }
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      mode,
      openRouterEnabled: Boolean(openRouterApiKey),
      openRouterReady: openRouterReadyReason == null,
      openRouterReason: openRouterReadyReason,
      model: openRouterModel,
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/openclaw/event') {
    const body = await readJsonBody(req);
    const events = mapOpenClawWebhookToEvents(body);
    events.forEach((event) => broadcast(event));
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, emitted: events.length }));
    return;
  }

  if (req.method === 'POST' && pathname === '/tasks/publish') {
    const body = await readJsonBody(req);
    const task = body?.task;
    if (!task || typeof task.id !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, error: 'Missing task payload' }));
      return;
    }
    handlePublishedTask(task);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
    return;
  }

  if (req.method === 'POST' && pathname === '/npc/cognition') {
    const body = await readJsonBody(req);
    const context = body?.context;
    if (!context || typeof context.agentId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cognition: null, error: 'Missing cognition context' }));
      return;
    }
    if (!openRouterApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        cognition: null,
        error: 'OpenRouter API key missing',
        code: 'OPENROUTER_KEY_MISSING',
      }));
      return;
    }
    try {
      const cognition = await generateCognitionPayload(context);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cognition }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        cognition: null,
        error: error instanceof Error ? error.message : 'Upstream cognition provider failed',
        code: 'OPENROUTER_UPSTREAM_ERROR',
      }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/npc/dialogue') {
    const body = await readJsonBody(req);
    const context = body?.context;
    if (!context || typeof context.speakerId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ line: null, error: 'Missing dialogue context' }));
      return;
    }
    if (!openRouterApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        line: null,
        error: 'OpenRouter API key missing',
        code: 'OPENROUTER_KEY_MISSING',
      }));
      return;
    }
    try {
      const line = await generateDialogueLinePayload(context);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ line }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        line: null,
        error: error instanceof Error ? error.message : 'Upstream dialogue provider failed',
        code: 'OPENROUTER_UPSTREAM_ERROR',
      }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/npc/daily-plan') {
    const body = await readJsonBody(req);
    const context = body?.context;
    if (!context || typeof context.agentId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plan: null, error: 'Missing daily plan context' }));
      return;
    }
    if (!openRouterApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        plan: null,
        error: 'OpenRouter API key missing',
        code: 'OPENROUTER_KEY_MISSING',
      }));
      return;
    }
    try {
      const plan = await generateDailyPlanPayload(context);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plan }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        plan: null,
        error: error instanceof Error ? error.message : 'Upstream daily-plan provider failed',
        code: 'OPENROUTER_UPSTREAM_ERROR',
      }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/npc/conversation-outcome') {
    const body = await readJsonBody(req);
    const context = body?.context;
    if (!context || typeof context.speakerAId !== 'string' || typeof context.speakerBId !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ outcome: null, error: 'Missing conversation outcome context' }));
      return;
    }
    if (!openRouterApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        outcome: null,
        error: 'OpenRouter API key missing',
        code: 'OPENROUTER_KEY_MISSING',
      }));
      return;
    }
    try {
      const outcome = await generateConversationOutcomePayload(context);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ outcome }));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        outcome: null,
        error: error instanceof Error ? error.message : 'Upstream conversation outcome provider failed',
        code: 'OPENROUTER_UPSTREAM_ERROR',
      }));
    }
    return;
  }

  res.writeHead(404).end('Not Found');
});

const wsServer = new WebSocketServer({ server });

wsServer.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message?.type === 'PUBLISH_TASK' && message?.task) {
        handlePublishedTask(message.task);
      }
    } catch {
      // Ignore malformed messages from clients.
    }
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[bridge] listening on ws/http localhost:${port} mode=${mode} openRouter=${openRouterApiKey ? 'on' : 'off'}`,
  );
});

function handlePublishedTask(task) {
  const agentId = agentPool[roundRobinIndex % agentPool.length] ?? 'npc1';
  roundRobinIndex += 1;

  const simulatedEvents = createSimulatedRunEvents(task, agentId);
  if (mode === 'passthrough') {
    broadcast(simulatedEvents[0].event);
    return;
  }

  simulatedEvents.forEach(({ delayMs, event }) => {
    setTimeout(() => broadcast(event), delayMs);
  });
}

function broadcast(event) {
  const json = JSON.stringify(event);
  wsServer.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(json);
    }
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function generateCognitionPayload(context) {
  const prompt = [
    'You are an NPC cognition planner for a life simulation.',
    'Output strict JSON only, no markdown.',
    'Return object: {"thoughtText": string, "dialogueText"?: string, "planIntent": {"action":"stay|talk|shift_activity|reflect","activity"?:string,"targetAgentId"?:string,"roomId"?:string,"reason"?:string,"urgency"?:number},"confidence"?:number,"priority"?:number}',
    'Keep thoughtText short (<= 18 words).',
    'If action is "talk", include targetAgentId from nearbyAgents.',
    'If action is "shift_activity", choose an activity plausible for this moment.',
    'Never output unsupported actions.',
    '',
    `Context JSON: ${JSON.stringify(context)}`,
  ].join('\n');
  try {
    const raw = await callOpenRouter(prompt, Math.max(220, openRouterMaxTokens), openRouterTemperature);
    return normalizeCognitionPayload(raw, context);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'OpenRouter request failed');
  }
}

async function generateDialogueLinePayload(context) {
  const compactContext = {
    speakerId: context?.speakerId,
    listenerId: context?.listenerId,
    depth: context?.depth,
    turnIndex: context?.turnIndex,
    place: context?.place,
    relationshipStage: context?.semantic?.relationshipStage,
    promptFocus: context?.semantic?.promptFocus,
    speakerActivity: context?.semantic?.speakerActivity,
    listenerActivity: context?.semantic?.listenerActivity,
    speakerNeedsLevel: context?.semantic?.speakerNeedsLevel,
    listenerNeedsLevel: context?.semantic?.listenerNeedsLevel,
    sharedRecentTopics: context?.semantic?.sharedRecentTopics ?? [],
    narratives: Array.isArray(context?.speakerNarratives)
      ? context.speakerNarratives.slice(0, 2)
      : [],
    memories: Array.isArray(context?.retrievedMemories)
      ? context.retrievedMemories.slice(0, 2)
      : [],
    previousLines: Array.isArray(context?.previousLines)
      ? context.previousLines.slice(-4)
      : [],
    styleHints: context?.styleHints ?? {},
  };
  const systemPrompt = [
    'You generate exactly one dialogue line for an NPC in a simulation.',
    'Output strict JSON only with schema {"text": string}.',
    'Hard constraints:',
    '- Keep text <= 24 words.',
    '- Must sound like a direct response in an ongoing conversation (not a generic opener).',
    '- Keep it grounded in current activity/place/promptFocus.',
    '- Avoid repeating sharedRecentTopics and previousLines phrasing.',
    '- Respect styleHints tone/avoidTopics/signaturePhrases if provided.',
    '- Prefer specific, situational wording over generic small talk.',
    '',
    'Freedom:',
    '- You may choose any concrete wording and micro-detail, as long as constraints are respected.',
  ].join('\n');
  const userPrompt = [
    'Use this compact context:',
    JSON.stringify(compactContext),
  ].join('\n');
  const raw = await callOpenRouter(
    userPrompt,
    Math.min(220, openRouterMaxTokens),
    Math.min(1.0, openRouterTemperature),
    systemPrompt,
  );
  return normalizeDialogueLinePayload(raw);
}

async function generateDailyPlanPayload(context) {
  const prompt = [
    'You are planning one NPC day schedule for a life simulation.',
    'Output strict JSON only, no markdown.',
    'Schema: {"day":number,"blocks":[{"startMinute":number,"endMinute":number,"activity":string,"roomId"?:string,"focus":string,"commitment"?:number,"reason"?:string}],"reason"?:string}',
    'Rules:',
    '- Respect provided windows and keep blocks non-overlapping.',
    '- Use only allowedActivities.',
    '- Keep 3-6 blocks.',
    '- Keep each block at least 20 minutes.',
    '',
    `Context JSON: ${JSON.stringify(context)}`,
  ].join('\n');
  const raw = await callOpenRouter(prompt, Math.max(320, openRouterMaxTokens), Math.min(1.0, openRouterTemperature));
  return normalizeDailyPlanPayload(raw, context);
}

async function generateConversationOutcomePayload(context) {
  const prompt = [
    'You evaluate one finished NPC conversation and output structured consequences.',
    'Output strict JSON only, no markdown.',
    'Schema: {"relationshipDeltas":[{"fromId":string,"toId":string,"delta":number,"reason"?:string}],"memoryAppraisals":[{"agentId":string,"targetAgentId":string,"kind":"conflict|support|social_contact|task_success|task_failure|reflection|observation","affect":number,"importance":number,"confidence"?:number,"summary"?:string,"content"?:string,"where"?:string}]}',
    'Rules:',
    '- Keep relationship delta conservative (around -8..8).',
    '- Provide appraisals for both participants.',
    '- affect must be in -1..1 and importance in 0..1.',
    '',
    `Context JSON: ${JSON.stringify(context)}`,
  ].join('\n');
  const raw = await callOpenRouter(prompt, Math.max(320, openRouterMaxTokens), Math.min(1.0, openRouterTemperature));
  return normalizeConversationOutcomePayload(raw, context);
}

async function callOpenRouter(prompt, maxTokens, temperature, systemInstruction = 'You output JSON only.') {
  const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': openRouterSiteUrl,
      'X-Title': openRouterAppName,
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: Math.max(0, Math.min(1.2, Number(temperature) || 0.8)),
      max_tokens: Math.max(80, Number(maxTokens) || 220),
      messages: [
        {
          role: 'system',
          content: systemInstruction,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter responded ${response.status}`);
  }
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') {
    throw new Error('OpenRouter returned empty content');
  }
  return raw;
}

function normalizeCognitionPayload(rawJson, context) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid cognition JSON payload');
  }
  const thoughtText = typeof parsed.thoughtText === 'string' && parsed.thoughtText.trim()
    ? parsed.thoughtText.trim().slice(0, 180)
    : '';
  if (!thoughtText) {
    throw new Error('Missing thoughtText in cognition payload');
  }
  const dialogueText = typeof parsed.dialogueText === 'string' && parsed.dialogueText.trim()
    ? parsed.dialogueText.trim().slice(0, 180)
    : undefined;
  const intent = normalizePlanIntent(parsed.planIntent, context);
  return {
    thoughtText,
    dialogueText,
    planIntent: intent,
    confidence: clamp01(parsed.confidence ?? 0.6),
    priority: clamp01(parsed.priority ?? 0.5),
  };
}

function normalizeDialogueLinePayload(rawJson) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    const directText = extractDialogueText(rawJson);
    if (!directText) {
      throw new Error('Invalid dialogue JSON payload');
    }
    return { text: directText };
  }
  const text = typeof parsed.text === 'string' ? parsed.text.trim().slice(0, 180) : '';
  if (!text) {
    const nested = extractDialogueText(rawJson);
    if (!nested) {
      throw new Error('Missing dialogue text in payload');
    }
    return { text: nested };
  }
  return { text };
}

function extractDialogueText(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const strippedFence = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!strippedFence) return '';
  const firstLine = strippedFence
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';
  const candidate = firstLine
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .trim()
    .slice(0, 180);
  if (!candidate) return '';
  if (candidate.startsWith('{') || candidate.startsWith('[')) return '';
  return candidate;
}

function normalizePlanIntent(candidate, context) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Missing planIntent');
  }
  const action = typeof candidate.action === 'string' ? candidate.action : '';
  const allowed = new Set(['stay', 'talk', 'shift_activity', 'reflect']);
  if (!allowed.has(action)) {
    throw new Error(`Invalid planIntent.action: ${String(candidate.action)}`);
  }
  const intent = {
    action,
    urgency: clamp01(candidate.urgency ?? 0.4),
  };
  if (typeof candidate.reason === 'string' && candidate.reason.trim()) {
    intent.reason = candidate.reason.trim().slice(0, 120);
  }
  if (action === 'talk') {
    const nearby = Array.isArray(context?.runtime?.nearbyAgents) ? context.runtime.nearbyAgents : [];
    const targetAgentId = typeof candidate.targetAgentId === 'string' ? candidate.targetAgentId : '';
    const exists = nearby.some((entry) => entry?.id === targetAgentId);
    if (exists && targetAgentId) {
      intent.targetAgentId = targetAgentId;
    }
    if (!intent.targetAgentId) {
      throw new Error('Invalid talk intent: targetAgentId missing or not nearby');
    }
  }
  if (action === 'shift_activity') {
    if (typeof candidate.activity === 'string' && candidate.activity.trim()) {
      intent.activity = candidate.activity.trim().slice(0, 40);
    }
    if (!intent.activity) {
      throw new Error('Invalid shift_activity intent: missing activity');
    }
    if (typeof candidate.roomId === 'string' && candidate.roomId.trim()) {
      intent.roomId = candidate.roomId.trim().slice(0, 40);
    }
  }
  return intent;
}

function normalizeDailyPlanPayload(rawJson, context) {
  const parsed = parseJsonObject(rawJson, 'daily plan');
  const allowedActivities = new Set(
    Array.isArray(context?.allowedActivities)
      ? context.allowedActivities.filter((entry) => typeof entry === 'string' && entry.trim())
      : [],
  );
  const windows = Array.isArray(context?.windows) ? context.windows : [];
  const blocksRaw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  if (blocksRaw.length === 0) {
    throw new Error('Daily plan must contain at least one block');
  }
  const blocks = blocksRaw.map((block) => {
    const startMinute = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(block?.startMinute))));
    const endMinute = Math.max(0, Math.min(24 * 60, Math.floor(Number(block?.endMinute))));
    const activity = typeof block?.activity === 'string' ? block.activity.trim().slice(0, 40) : '';
    if (!activity) throw new Error('Daily plan block missing activity');
    if (allowedActivities.size > 0 && !allowedActivities.has(activity)) {
      throw new Error(`Daily plan activity not allowed: ${activity}`);
    }
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
      throw new Error('Daily plan block has invalid time range');
    }
    return {
      startMinute,
      endMinute,
      activity,
      roomId: typeof block?.roomId === 'string' && block.roomId.trim()
        ? block.roomId.trim().slice(0, 40)
        : undefined,
      focus: typeof block?.focus === 'string' && block.focus.trim()
        ? block.focus.trim().slice(0, 60)
        : activity,
      commitment: block?.commitment === undefined ? undefined : clamp01(block.commitment),
      reason: typeof block?.reason === 'string' && block.reason.trim()
        ? block.reason.trim().slice(0, 120)
        : undefined,
    };
  }).sort((a, b) => a.startMinute - b.startMinute);

  for (let i = 1; i < blocks.length; i += 1) {
    if (blocks[i].startMinute < blocks[i - 1].endMinute) {
      throw new Error('Daily plan blocks overlap');
    }
  }
  if (windows.length > 0) {
    const inAnyWindow = (block) => windows.some((window) =>
      Number.isFinite(Number(window?.startMinute))
      && Number.isFinite(Number(window?.endMinute))
      && block.startMinute >= Number(window.startMinute)
      && block.endMinute <= Number(window.endMinute));
    if (!blocks.every(inAnyWindow)) {
      throw new Error('Daily plan blocks must fit in provided windows');
    }
  }
  return {
    day: Number.isFinite(Number(parsed.day)) ? Math.floor(Number(parsed.day)) : Math.floor(Number(context?.gameTime?.day) || 1),
    blocks,
    source: 'llm',
    reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 140) : undefined,
  };
}

function normalizeConversationOutcomePayload(rawJson, context) {
  const parsed = parseJsonObject(rawJson, 'conversation outcome');
  const participants = new Set([context.speakerAId, context.speakerBId]);
  const deltasRaw = Array.isArray(parsed.relationshipDeltas) ? parsed.relationshipDeltas : [];
  const appraisalsRaw = Array.isArray(parsed.memoryAppraisals) ? parsed.memoryAppraisals : [];
  if (deltasRaw.length === 0 || appraisalsRaw.length === 0) {
    throw new Error('Conversation outcome missing required arrays');
  }
  const relationshipDeltas = deltasRaw.map((entry) => {
    const fromId = typeof entry?.fromId === 'string' ? entry.fromId.trim() : '';
    const toId = typeof entry?.toId === 'string' ? entry.toId.trim() : '';
    if (!fromId || !toId || !participants.has(fromId) || !participants.has(toId)) {
      throw new Error('Conversation outcome includes invalid participant in relationship delta');
    }
    return {
      fromId,
      toId,
      delta: clampRange(Number(entry?.delta), -8, 8),
      reason: typeof entry?.reason === 'string' && entry.reason.trim() ? entry.reason.trim().slice(0, 120) : undefined,
    };
  });

  const allowedKinds = new Set(['conflict', 'support', 'social_contact', 'task_success', 'task_failure', 'reflection', 'observation']);
  const memoryAppraisals = appraisalsRaw.map((entry) => {
    const agentId = typeof entry?.agentId === 'string' ? entry.agentId.trim() : '';
    const targetAgentId = typeof entry?.targetAgentId === 'string' ? entry.targetAgentId.trim() : '';
    const kind = typeof entry?.kind === 'string' ? entry.kind.trim() : '';
    if (!agentId || !targetAgentId || !participants.has(agentId) || !participants.has(targetAgentId)) {
      throw new Error('Conversation outcome includes invalid participant in memory appraisal');
    }
    if (!allowedKinds.has(kind)) {
      throw new Error(`Conversation outcome has invalid memory kind: ${kind}`);
    }
    return {
      agentId,
      targetAgentId,
      kind,
      affect: clampRange(Number(entry?.affect), -1, 1),
      importance: clampRange(Number(entry?.importance), 0, 1),
      confidence: entry?.confidence === undefined ? undefined : clamp01(entry.confidence),
      summary: typeof entry?.summary === 'string' && entry.summary.trim() ? entry.summary.trim().slice(0, 120) : undefined,
      content: typeof entry?.content === 'string' && entry.content.trim() ? entry.content.trim().slice(0, 200) : undefined,
      where: typeof entry?.where === 'string' && entry.where.trim() ? entry.where.trim().slice(0, 40) : undefined,
    };
  });
  return { relationshipDeltas, memoryAppraisals };
}

function parseJsonObject(rawJson, label) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid ${label} JSON payload`);
  }
  return parsed;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function clampRange(value, min, max) {
  if (!Number.isFinite(value)) {
    return (min + max) / 2;
  }
  return Math.max(min, Math.min(max, value));
}
