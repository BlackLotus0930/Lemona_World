# Smoothness Validation Checklist

Use this checklist before recording demos or merging nav/AI behavior changes.

## Scenario 1: Passive Simulation (6 NPC)

- Run for 5-10 in-game minutes at `1x`.
- No NPC should phase through collider walls.
- No NPC should remain stuck in place for more than 3 real-time seconds.
- NPCs should still animate facing and walk cycles while moving.

## Scenario 2: Task Burst (2-3 concurrent tasks)

- Post 2-3 tasks in quick succession.
- Assigned NPCs should route to work desks without clipping through blockers.
- Non-assigned NPCs should continue normal schedule flow.
- Reservation conflicts should resolve via alternate or queue points.

## Scenario 3: Navigation Recovery

- Place NPC near narrow routes and run with `debugNav=1`.
- Confirm replan occurs when a route dead-ends or stalls.
- Path lines should eventually converge toward target, not oscillate.

## Scenario 4: World Semantics

- Activities (`eat/study/exercise/social/rest/sleep`) should resolve to semantically matching points.
- Characters should not all stack on the exact same interaction point unless queue points are exhausted.

## Debug Flags

- Add `?debugNav=1` to URL to enable blocked/reserved/path overlays.
