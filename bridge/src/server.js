import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createProtocolEvent, createSimulatedRunEvents, mapOpenClawWebhookToEvents } from './openclawAdapter.js';

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

const openClawGatewayUrl = (process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789').replace(/\/+$/, '');
const openClawGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? '';

let roundRobinIndex = 0;
const upstreamRunIdByTaskId = new Map();
const taskIdByUpstreamRunId = new Map();

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
      openClawGateway: openClawGatewayUrl,
      openClawAuth: openClawGatewayToken ? 'configured' : 'none',
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/openclaw/event') {
    const body = await readJsonBody(req);
    const normalized = normalizeOpenClawWebhookPayload(body);
    const events = mapOpenClawWebhookToEvents(normalized);
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
    `[bridge] listening on ws/http localhost:${port} mode=${mode} openRouter=${openRouterApiKey ? 'on' : 'off'}`
    + (mode === 'passthrough' ? ` openClaw=${openClawGatewayUrl}` : ''),
  );
});

function handlePublishedTask(task) {
  const preferredAgentId = typeof task?.assignedAgentId === 'string' ? task.assignedAgentId.trim() : '';
  const agentId = resolveAssignedAgentId(preferredAgentId);
  if (typeof task?.upstreamRunId === 'string' && task.upstreamRunId.trim()) {
    rememberTaskRunMapping(String(task.id), task.upstreamRunId.trim());
  }

  const simulatedEvents = createSimulatedRunEvents(task, agentId);
  if (mode === 'passthrough') {
    broadcast(simulatedEvents[0].event);
    callOpenClawAgent(task, agentId);
    return;
  }

  simulatedEvents.forEach(({ delayMs, event }) => {
    setTimeout(() => broadcast(event), delayMs);
  });
}

async function callOpenClawAgent(task, agentId) {
  const taskId = String(task.id);
  const prompt = task.prompt || task.title || 'Hello';

  broadcast(createProtocolEvent('AGENT_THINKING', {
    taskId,
    agentId,
    summary: `Working on: "${prompt.slice(0, 60)}"`,
  }));

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (openClawGatewayToken) {
      headers['Authorization'] = `Bearer ${openClawGatewayToken}`;
    }

    const response = await fetch(`${openClawGatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'openclaw',
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenClaw gateway ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            broadcast(createProtocolEvent('AGENT_STREAM_CHUNK', {
              taskId,
              agentId,
              summary: delta,
            }));
          }
        } catch { /* ignore SSE parse errors */ }
      }
    }

    if (!fullText) {
      throw new Error('OpenClaw returned empty content');
    }

    broadcast(createProtocolEvent('TASK_DONE', {
      taskId,
      agentId,
      summary: 'Task completed',
    }));

    // eslint-disable-next-line no-console
    console.log(`[bridge] OpenClaw task ${taskId} completed (${fullText.length} chars)`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[bridge] OpenClaw agent call failed for ${taskId}:`, error.message);
    broadcast(createProtocolEvent('TASK_FAILED', {
      taskId,
      agentId,
      summary: 'OpenClaw call failed',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function resolveAssignedAgentId(preferredAgentId) {
  if (preferredAgentId && agentPool.includes(preferredAgentId)) {
    return preferredAgentId;
  }
  const agentId = agentPool[roundRobinIndex % agentPool.length] ?? 'npc1';
  roundRobinIndex += 1;
  return agentId;
}

function rememberTaskRunMapping(taskId, upstreamRunId) {
  if (!taskId || !upstreamRunId) return;
  upstreamRunIdByTaskId.set(taskId, upstreamRunId);
  taskIdByUpstreamRunId.set(upstreamRunId, taskId);
}

function normalizeOpenClawWebhookPayload(payload) {
  const normalized = payload && typeof payload === 'object' ? { ...payload } : {};
  const clientTaskId = typeof normalized.clientTaskId === 'string' ? normalized.clientTaskId.trim() : '';
  const incomingTaskId = typeof normalized.taskId === 'string' ? normalized.taskId.trim() : '';
  const runId = typeof normalized.runId === 'string' ? normalized.runId.trim() : '';
  const mappedTaskIdFromRun = runId ? taskIdByUpstreamRunId.get(runId) : undefined;
  const mappedTaskIdFromTask = incomingTaskId ? taskIdByUpstreamRunId.get(incomingTaskId) : undefined;

  if (clientTaskId && runId) {
    rememberTaskRunMapping(clientTaskId, runId);
  } else if (incomingTaskId && runId && !mappedTaskIdFromRun) {
    rememberTaskRunMapping(incomingTaskId, runId);
  }

  normalized.taskId = clientTaskId || mappedTaskIdFromRun || mappedTaskIdFromTask || incomingTaskId || 'unknown';
  if (runId) {
    normalized.upstreamRunId = runId;
  }
  return normalized;
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
    'Return object: {"privateReason": string, "feltThought": string, "surfaceLine"?: string, "emotionTone"?: "guarded|warm|uneasy|playful|flat|tense", "subtext"?: "seeking_contact|avoiding_exposure|testing|masking|reassuring", "planIntent": {"action":"stay|talk|shift_activity|reflect","activity"?:string,"targetAgentId"?:string,"roomId"?:string,"reason"?:string,"urgency"?:number},"confidence"?:number,"priority"?:number}',
    'privateReason is internal planner text; do not write for players.',
    'feltThought is what players can observe in thought panel.',
    'Keep feltThought concise (2-12 words), fragment-like, emotionally colored, and human.',
    'Use surfaceLine only when it sounds like natural speech to another person.',
    'Avoid robotic labels like "observing", "processing", "executing", "updating memory".',
    'Do not include JSON/meta words or bracketed tags in any text field.',
    'Use runtime.currentObjectName, runtime.currentAffordance, and runtime.immediateSituation when provided to stay concretely grounded.',
    'If action is "talk", include targetAgentId from nearbyAgents.',
    'Prefer "stay" or "reflect" unless there is a strong reason to change activity.',
    'Use "shift_activity" rarely.',
    'If action is "shift_activity", make it personal and practical, not social choreography.',
    'Do not use "shift_activity" just because another person is nearby or because a conversation happened.',
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
    speakerObjectName: context?.semantic?.speakerObjectName,
    listenerObjectName: context?.semantic?.listenerObjectName,
    speakerImmediateSituation: context?.semantic?.speakerImmediateSituation,
    listenerImmediateSituation: context?.semantic?.listenerImmediateSituation,
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
    'Output strict JSON only with schema {"surfaceLine": string, "emotionTone"?: "guarded|warm|uneasy|playful|flat|tense", "subtext"?: "seeking_contact|avoiding_exposure|testing|masking|reassuring"}.',
    'Hard constraints:',
    '- Keep surfaceLine <= 24 words.',
    '- It should feel like a natural next utterance in an ongoing exchange.',
    '- Keep it grounded in the immediate moment, place, relationship, and recent exchange.',
    '- Use speakerObjectName, listenerObjectName, speakerImmediateSituation, and listenerImmediateSituation when provided.',
    '- Avoid repeating sharedRecentTopics and previousLines phrasing.',
    '- Respect styleHints tone/avoidTopics/signaturePhrases if provided.',
    '- Do not explain plans or psychology directly.',
    '- Relationship stage matters. Do not skip straight to easy familiarity.',
    '- If relationshipStage is "stranger", assume little shared history: keep it tentative, surface-level, lightly awkward, polite, guarded, or merely situational.',
    '- If relationshipStage is "stranger", do not imply prior knowledge, inside jokes, unusual ease, or emotional closeness.',
    '- If relationshipStage is "familiar", some ease is fine, but keep intimacy limited and let specificity grow gradually.',
    '- Most turns should stay in the present moment rather than turning into a shared plan.',
    '- Prefer reaction, observation, question, or brief personal remark over invitation.',
    '- In most turns, do not suggest changing locations or starting a joint activity.',
    '',
    'Freedom:',
    '- It may be a fragment, a small reaction, a partial answer, a deflection, an observation, or a fuller sentence.',
    '- Do not make every turn equally complete or equally informative.',
    '- Everyday conversation can be brief, indirect, lightly reactive, and unfinished.',
    '- Let comfort, tension, familiarity, and mood shape how much is said.',
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
  const privateReason = typeof parsed.privateReason === 'string' && parsed.privateReason.trim()
    ? parsed.privateReason.trim().slice(0, 220)
    : (typeof parsed.thoughtText === 'string' && parsed.thoughtText.trim()
      ? parsed.thoughtText.trim().slice(0, 220)
      : '');
  const feltThought = typeof parsed.feltThought === 'string' && parsed.feltThought.trim()
    ? parsed.feltThought.trim().slice(0, 180)
    : (typeof parsed.thoughtText === 'string' && parsed.thoughtText.trim()
      ? parsed.thoughtText.trim().slice(0, 180)
      : '');
  if (!privateReason || !feltThought) {
    throw new Error('Missing privateReason/feltThought in cognition payload');
  }
  const surfaceLine = typeof parsed.surfaceLine === 'string' && parsed.surfaceLine.trim()
    ? parsed.surfaceLine.trim().slice(0, 180)
    : (typeof parsed.dialogueText === 'string' && parsed.dialogueText.trim()
      ? parsed.dialogueText.trim().slice(0, 180)
      : undefined);
  const intent = normalizePlanIntent(parsed.planIntent, context);
  return {
    privateReason,
    feltThought,
    surfaceLine,
    thoughtText: feltThought,
    dialogueText: surfaceLine,
    emotionTone: normalizeEmotionTone(parsed.emotionTone),
    subtext: normalizeSubtext(parsed.subtext),
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
    return {
      text: directText,
      surfaceLine: directText,
    };
  }
  const surfaceLine = typeof parsed.surfaceLine === 'string' ? parsed.surfaceLine.trim().slice(0, 180) : '';
  const text = typeof parsed.text === 'string' ? parsed.text.trim().slice(0, 180) : '';
  const resolved = surfaceLine || text;
  if (!resolved) {
    const nested = extractDialogueText(rawJson);
    if (!nested) {
      throw new Error('Missing dialogue text in payload');
    }
    return {
      text: nested,
      surfaceLine: nested,
      emotionTone: normalizeEmotionTone(parsed?.emotionTone),
      subtext: normalizeSubtext(parsed?.subtext),
    };
  }
  return {
    text: resolved,
    surfaceLine: resolved,
    emotionTone: normalizeEmotionTone(parsed.emotionTone),
    subtext: normalizeSubtext(parsed.subtext),
  };
}

function normalizeEmotionTone(value) {
  const allowed = new Set(['guarded', 'warm', 'uneasy', 'playful', 'flat', 'tense']);
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return allowed.has(normalized) ? normalized : undefined;
}

function normalizeSubtext(value) {
  const allowed = new Set(['seeking_contact', 'avoiding_exposure', 'testing', 'masking', 'reassuring']);
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return allowed.has(normalized) ? normalized : undefined;
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
