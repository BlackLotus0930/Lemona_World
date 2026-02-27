import type { TilePoint } from './NavGrid';

export class PathFollower {
  private path: TilePoint[] = [];
  private index = 0;

  setPath(path: TilePoint[] | null): void {
    this.path = path ? [...path] : [];
    this.index = 0;
  }

  hasPath(): boolean {
    return this.path.length > 0 && this.index < this.path.length;
  }

  peekCurrent(): TilePoint | null {
    if (!this.hasPath()) {
      return null;
    }
    return this.path[this.index] ?? null;
  }

  advanceIfReached(tileX: number, tileY: number): void {
    const current = this.peekCurrent();
    if (!current) {
      return;
    }
    if (current.x !== tileX || current.y !== tileY) {
      return;
    }
    this.index += 1;
  }

  isComplete(): boolean {
    return this.path.length > 0 && this.index >= this.path.length;
  }

  clear(): void {
    this.path = [];
    this.index = 0;
  }

  snapshot(): TilePoint[] {
    return this.path.slice(this.index);
  }
}
