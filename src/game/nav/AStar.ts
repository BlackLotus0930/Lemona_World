import type { NavGrid, TilePoint } from './NavGrid';

interface HeapNode {
  point: TilePoint;
  f: number;
}

interface PathOptions {
  tileCost?: (point: TilePoint) => number;
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

export function findPath(
  nav: NavGrid,
  start: TilePoint,
  goal: TilePoint,
  options?: PathOptions,
): TilePoint[] | null {
  if (!nav.isWalkable(start.x, start.y)) return null;
  if (!nav.isWalkable(goal.x, goal.y)) return null;

  const open = new MinHeap();
  open.push({ point: start, f: heuristic(start, goal) });

  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const startKey = key(start);
  gScore.set(startKey, 0);
  const closed = new Set<string>();

  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current.point);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.point.x === goal.x && current.point.y === goal.y) {
      return reconstructPath(cameFrom, current.point);
    }

    const baseG = gScore.get(currentKey) ?? Infinity;
    for (const neighbor of nav.getNeighbors(current.point)) {
      const neighborKey = key(neighbor);
      if (closed.has(neighborKey)) continue;

      const extraCost = Math.max(0, options?.tileCost?.(neighbor) ?? 0);
      const tentativeG = baseG + 1 + extraCost;
      const neighborG = gScore.get(neighborKey) ?? Infinity;
      if (tentativeG >= neighborG) continue;

      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeG);
      open.push({ point: neighbor, f: tentativeG + heuristic(neighbor, goal) });
    }
  }

  return null;
}

function reconstructPath(cameFrom: Map<string, string>, end: TilePoint): TilePoint[] {
  const path: TilePoint[] = [end];
  let currentKey = key(end);
  while (cameFrom.has(currentKey)) {
    const prevKey = cameFrom.get(currentKey)!;
    path.push(pointFromKey(prevKey));
    currentKey = prevKey;
  }
  path.reverse();
  return path;
}

function heuristic(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function key(point: TilePoint): string {
  return `${point.x},${point.y}`;
}

function pointFromKey(value: string): TilePoint {
  const [xs, ys] = value.split(',');
  return { x: Number(xs), y: Number(ys) };
}
