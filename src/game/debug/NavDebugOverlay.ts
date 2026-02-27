import { Container, Graphics } from 'pixi.js';
import type { TilePoint } from '../nav/NavGrid';
import { TILE_SIZE } from '../../../data/map';

interface CharacterDebugPath {
  agentId: string;
  path: TilePoint[];
}

export class NavDebugOverlay extends Container {
  private blockedGraphics = new Graphics();
  private reservedGraphics = new Graphics();
  private pathGraphics = new Graphics();

  constructor() {
    super();
    this.eventMode = 'none';
    this.label = 'NavDebugOverlay';
    this.addChild(this.blockedGraphics);
    this.addChild(this.reservedGraphics);
    this.addChild(this.pathGraphics);
  }

  setBlockedTiles(blocked: TilePoint[]): void {
    this.blockedGraphics.clear();
    this.blockedGraphics.rect(0, 0, 0, 0);
    for (const tile of blocked) {
      this.blockedGraphics.rect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    this.blockedGraphics.fill({ color: 0xff3b30, alpha: 0.16 });
  }

  setReservedTiles(points: TilePoint[]): void {
    this.reservedGraphics.clear();
    for (const tile of points) {
      this.reservedGraphics.rect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    this.reservedGraphics.fill({ color: 0x3b82f6, alpha: 0.22 });
  }

  setCharacterPaths(paths: CharacterDebugPath[]): void {
    this.pathGraphics.clear();
    const palette = [0x2ecc71, 0xffd60a, 0xaf52de, 0x0abdc6, 0xff9f0a, 0x64d2ff];
    paths.forEach((entry, index) => {
      const color = palette[index % palette.length];
      if (entry.path.length === 0) {
        return;
      }
      this.pathGraphics.moveTo(entry.path[0].x * TILE_SIZE + TILE_SIZE / 2, entry.path[0].y * TILE_SIZE + TILE_SIZE / 2);
      for (let i = 1; i < entry.path.length; i += 1) {
        this.pathGraphics.lineTo(entry.path[i].x * TILE_SIZE + TILE_SIZE / 2, entry.path[i].y * TILE_SIZE + TILE_SIZE / 2);
      }
      this.pathGraphics.stroke({ color, alpha: 0.9, width: 1.5 });
    });
  }
}
