import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createSimulatedRunEvents, mapOpenClawWebhookToEvents } from './openclawAdapter.js';

const port = Number(process.env.PORT ?? 8787);
const mode = process.env.BRIDGE_MODE ?? 'simulate';
const agentPool = (process.env.AGENT_IDS ?? 'npc1,npc2,npc3,npc4,npc5,npc6,npc7,npc8')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

let roundRobinIndex = 0;

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mode }));
    return;
  }

  if (req.method === 'POST' && req.url === '/openclaw/event') {
    const body = await readJsonBody(req);
    const events = mapOpenClawWebhookToEvents(body);
    events.forEach((event) => broadcast(event));
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, emitted: events.length }));
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
  console.log(`[bridge] listening on ws/http localhost:${port} mode=${mode}`);
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
