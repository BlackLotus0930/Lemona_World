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

## Relay Cognition Endpoint

The bridge also exposes relay-style HTTP endpoints used by `RelayProvider`:

- `POST /tasks/publish`
- `POST /npc/cognition`
- `POST /npc/dialogue`
- `POST /npc/daily-plan`
- `POST /npc/conversation-outcome`

Launch game with:

- `http://localhost:5173/?bridge=relay&bridgeUrl=http://localhost:8787`

### OpenRouter Environment Variables

Set these in the shell that starts the bridge service (or in a `.env` loader of your choice):

- `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) **required for LLM relay endpoints**
- `OPENROUTER_BASE_URL` (optional, default `https://openrouter.ai/api/v1`)
- `OPENROUTER_MODEL` (optional)
- `OPENROUTER_APP_NAME` (optional)
- `OPENROUTER_SITE_URL` (optional)
- `OPENROUTER_TEMPERATURE` (optional)
- `OPENROUTER_MAX_TOKENS` (optional)

Bridge now auto-loads env files on startup in this order:

1. project root `.env` (`Lemona_Game/.env`)
2. `bridge/.env` (overrides root values when present)

Relay cognition is OpenRouter-required:

- Missing key -> `POST /npc/cognition` returns `503` with `code: OPENROUTER_KEY_MISSING`
- Upstream model failures/invalid payloads -> `POST /npc/cognition` returns `502` with `code: OPENROUTER_UPSTREAM_ERROR`
- Missing key -> `POST /npc/dialogue` returns `503` with `code: OPENROUTER_KEY_MISSING`
- Upstream model failures/invalid payloads -> `POST /npc/dialogue` returns `502` with `code: OPENROUTER_UPSTREAM_ERROR`
- Missing key -> `POST /npc/daily-plan` returns `503` with `code: OPENROUTER_KEY_MISSING`
- Upstream model failures/invalid payloads -> `POST /npc/daily-plan` returns `502` with `code: OPENROUTER_UPSTREAM_ERROR`
- Missing key -> `POST /npc/conversation-outcome` returns `503` with `code: OPENROUTER_KEY_MISSING`
- Upstream model failures/invalid payloads -> `POST /npc/conversation-outcome` returns `502` with `code: OPENROUTER_UPSTREAM_ERROR`
- `GET /health` includes `openRouterReady` and `openRouterReason` for readiness checks

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
