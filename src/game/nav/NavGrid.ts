export interface TilePoint {
  x: number;
  y: number;
}

export class NavGrid {
  readonly width: number;
  readonly height: number;
  private blocked: Uint8Array;

  constructor(width: number, height: number, blockedKeys: Iterable<string>) {
    this.width = width;
    this.height = height;
    this.blocked = new Uint8Array(width * height);
    for (const key of blockedKeys) {
      const parsed = parseTileKey(key);
      if (!parsed) {
        continue;
      }
      if (!this.inBounds(parsed.x, parsed.y)) {
        continue;
      }
      this.blocked[this.index(parsed.x, parsed.y)] = 1;
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) {
      return true;
    }
    return this.blocked[this.index(x, y)] === 1;
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.isBlocked(x, y);
  }

  getNeighbors(point: TilePoint): TilePoint[] {
    const deltas = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const result: TilePoint[] = [];
    for (const delta of deltas) {
      const nx = point.x + delta.x;
      const ny = point.y + delta.y;
      if (this.isWalkable(nx, ny)) {
        result.push({ x: nx, y: ny });
      }
    }
    return result;
  }

  closestWalkable(target: TilePoint, maxRadius = 24): TilePoint | null {
    if (this.isWalkable(target.x, target.y)) {
      return target;
    }
    for (let radius = 1; radius <= maxRadius; radius += 1) {
      const minX = target.x - radius;
      const maxX = target.x + radius;
      const minY = target.y - radius;
      const maxY = target.y + radius;
      for (let x = minX; x <= maxX; x += 1) {
        if (this.isWalkable(x, minY)) {
          return { x, y: minY };
        }
        if (this.isWalkable(x, maxY)) {
          return { x, y: maxY };
        }
      }
      for (let y = minY + 1; y < maxY; y += 1) {
        if (this.isWalkable(minX, y)) {
          return { x: minX, y };
        }
        if (this.isWalkable(maxX, y)) {
          return { x: maxX, y };
        }
      }
    }
    return null;
  }

  blockedKeys(): string[] {
    const result: string[] = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.isBlocked(x, y)) {
          result.push(tileKey(x, y));
        }
      }
    }
    return result;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }
}

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseTileKey(value: string): TilePoint | null {
  const [xs, ys] = value.split(',');
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }
  return { x, y };
}
