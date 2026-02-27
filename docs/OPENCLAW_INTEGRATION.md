# OpenClaw Integration Notes

This project integrates OpenClaw through a local bridge service rather than coupling OpenClaw logic directly into the game.

## Why a Bridge

- Keeps `src/` independent from any single agent stack.
- Allows mock mode and other agent runtimes to reuse the same protocol.
- Makes open-source contributions cleaner by splitting concerns.

## Current Bridge Endpoints

- WebSocket endpoint: `ws://localhost:8787`
- Health check: `GET http://localhost:8787/health`
- Inbound OpenClaw webhook: `POST http://localhost:8787/openclaw/event`

## Event Translation

Incoming OpenClaw-like events map into Lemona protocol events in `bridge/src/openclawAdapter.js`.

Examples:

- `task.assigned` -> `TASK_ASSIGNED`
- `agent.thinking` -> `AGENT_THINKING`
- `agent.tool_call` -> `AGENT_TOOL_CALL`
- `agent.result` -> `AGENT_RESULT`
- `task.done` -> `TASK_DONE`
- `task.failed` -> `TASK_FAILED`

## Security Model (Important)

- Intended for localhost development and demos.
- Do not expose bridge endpoints publicly without authentication and request signing.
- Run OpenClaw with sandboxed permissions when possible.
