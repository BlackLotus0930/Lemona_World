# Assets Needed (For Later)

Right now the game uses **placeholder graphics** (colored shapes). When you're ready to add real assets, here's what you'll need:

## Tiles & Map

| Asset | Purpose | Size suggestion |
|-------|---------|-----------------|
| **Floor tiles** | Dorm, canteen, classroom, gym, bathroom floors | 16×16 px per tile |
| **Wall tiles** | Room borders | 16×16 px |
| **Outdoor ground** | Courtyard / grass | 16×16 px |

The map is 40×30 tiles at 16px each (640×480 px world).

## Character Sprites

| Asset | Purpose |
|-------|---------|
| **Character sprites** | Top-down view, 16×16 px. Can be 4-direction or 8-direction for walking. |
| **Idle / activity variants** | Optional: sitting, sleeping, cooking, etc. |

Place in `assets/characters/` — the game will load them by name (e.g. `alex.png`, `sam.png`).

## UI

| Asset | Purpose |
|-------|---------|
| **Panel backgrounds** | Event panel, time controls (or we keep them CSS-styled) |
| **Icons** | Pause, play, speed 1x/2x/3x |

## Optional (Polish)

- **Furniture sprites** — Beds, desks, tables, etc. for rooms
- **Speech bubble** — For AI dialogue display
- **Background music / ambient** — Campus ambience

---

**Current placeholder behavior:**
- Rooms: colored rectangles (different color per room type)
- Characters: colored circles (one color per character)
- All coordinates and schedules work; swapping in sprites is a matter of replacing the Graphics draw calls with Sprite/AnimatedSprite.
