# Lemona

Playable multi-agent world interface: publish tasks, watch NPCs pick them up, work through agent states, and return results.

## What Makes It Different

Lemona is not only a simulation and not only an agent CLI. It is a game-like UI for agent workflows:

- User posts a task from an in-world mission board.
- NPCs switch from daily life to work mode.
- A protocol timeline shows execution progress (`thinking`, `tool_call`, `result`).
- The same protocol works with mock mode or OpenClaw bridge mode.

## Current Features

- Pixel-art world rendering with stable layer ordering (`Pixi.js`).
- Autonomous NPC daily schedule and movement.
- Runtime state transitions for work mode:
  - `idle_life` -> `moving_to_desk` -> `working` -> `returning_result` -> `cooldown`
- Task UI (`Mission Board`) + event observability (`Agent Timeline`).
- Agent-agnostic event protocol in `src/agent`.
- Optional local bridge service for OpenClaw event translation.

## Quick Start

### 1) Install game dependencies

```bash
npm install
```

### 2) Demo profile: mock agent mode

```bash
npm run demo:mock
```

This runs the game with internal mock agent events.

### 3) Demo profile: OpenClaw bridge mode

In terminal A:

```bash
cd bridge
npm install
npm run dev
```

In terminal B:

```bash
npm run demo:openclaw
```

Then open:

`http://localhost:5173/?bridge=ws&bridgeUrl=ws://localhost:8787`

## Repository Layout

```text
Lemona_Game/
├── src/
│   ├── agent/            # Protocol, task types, bridge providers
│   ├── game/             # World, character runtime, schedule
│   └── ui/               # Time controls, task panel, event timeline
├── bridge/               # OpenClaw adapter service (local)
└── docs/                 # Architecture, protocol, integration notes
```

## Docs

- Architecture: `docs/ARCHITECTURE.md`
- Protocol: `docs/PROTOCOL.md`
- OpenClaw integration: `docs/OPENCLAW_INTEGRATION.md`

## Security Notes

- Bridge mode is intended for local development.
- Do not expose the bridge publicly without auth/signing.
- If connecting to real agent execution, prefer sandboxed runtime permissions.
