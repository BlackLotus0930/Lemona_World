# Lemona OpenClaw Bridge

Local adapter service that translates OpenClaw-style execution updates into Lemona protocol events.

## What It Does

- Exposes a WebSocket endpoint for the game client (`ws://localhost:8787` by default).
- Accepts game-side `PUBLISH_TASK` messages from `WebSocketProvider`.
- Emits protocol events (`TASK_ASSIGNED`, `AGENT_THINKING`, `AGENT_TOOL_CALL`, `AGENT_RESULT`, `TASK_DONE`, `TASK_FAILED`).
- Accepts webhook-style OpenClaw events over HTTP (`POST /openclaw/event`) and rebroadcasts them to all connected clients.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Start bridge:
   - `npm run dev`
3. Run Lemona with websocket mode:
   - `npm run dev -- --host`
   - Open app with query string: `?bridge=ws&bridgeUrl=ws://localhost:8787`

## Modes

- `BRIDGE_MODE=simulate` (default): emits staged demo events for each published task.
- `BRIDGE_MODE=passthrough`: only emits assignment event; intended when external OpenClaw events are pushed via webhook.

## HTTP Endpoints

- `GET /health`
- `POST /openclaw/event`

Example payload:

```json
{
  "type": "agent.tool_call",
  "taskId": "task_123",
  "agentId": "npc1",
  "summary": "Running OpenClaw tool call"
}
```
