import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { tileKey } from './nav/NavGrid';

export interface MapTile {
  id: number | string;
  x: number;
  y: number;
}

export interface MapLayer {
  name: string;
  tiles: MapTile[];
  collider: boolean;
}

export interface TileMapData {
  tileSize: number;
  mapWidth: number;
  mapHeight: number;
  layers: MapLayer[];
}

// Match Sprite Fusion layer order: tiles → outside → above_outside → above_above_outside → walls → objects
// objects_behind_wall: interior objects (counters, etc.) render IN FRONT of walls so they're visible through doorways
const LAYER_RENDER_PRIORITY: Record<string, number> = {
  tiles: 0,
  outside_tiles: 1,
  above_outside_tiles: 2,
  above_above_outside_tiles: 3,
  above_tiles: 4,
  objects_behind_wall: 8,
  walls: 10,
  walls_corner: 11,
  objects: 30,
  objects_on_objects: 40,
  objects_above_objects: 41,
  above_table: 50,
};

export class World extends Container {
  private mapWidthPx = 0;
  private mapHeightPx = 0;
  private tileSize = 16;
  private spritesheetTexture?: Texture;
  private tileTextureCache = new Map<number, Texture>();
  private mapData?: TileMapData;
  private blockedTileKeys = new Set<string>();

  get pixelWidth(): number {
    return this.mapWidthPx;
  }

  get pixelHeight(): number {
    return this.mapHeightPx;
  }

  get tileWidth(): number {
    return this.mapData?.mapWidth ?? 0;
  }

  get tileHeight(): number {
    return this.mapData?.mapHeight ?? 0;
  }

  get loadedTileSize(): number {
    return this.tileSize;
  }

  getColliderTileKeys(): Set<string> {
    return new Set(this.blockedTileKeys);
  }

  getColliderTiles(): Array<{ x: number; y: number }> {
    return [...this.blockedTileKeys].map((value) => {
      const [xs, ys] = value.split(',');
      return { x: Number(xs), y: Number(ys) };
    });
  }

  async loadFromMap(mapUrl: string, spritesheetUrl: string, tmxUrl?: string): Promise<void> {
    const mapData = (await fetch(mapUrl).then((r) => r.json())) as TileMapData;
    this.mapData = mapData;
    this.spritesheetTexture = (await Assets.load(spritesheetUrl)) as Texture;
    this.spritesheetTexture.source.scaleMode = 'nearest';
    this.tileTextureCache.clear();
    this.blockedTileKeys.clear();
    this.removeChildren();

    this.tileSize = mapData.tileSize;
    this.mapWidthPx = mapData.mapWidth * mapData.tileSize;
    this.mapHeightPx = mapData.mapHeight * mapData.tileSize;

    const sortedLayers = mapData.layers
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) => {
        const aKey = a.layer.name.toLowerCase();
        const bKey = b.layer.name.toLowerCase();
        const aPriority = LAYER_RENDER_PRIORITY[aKey] ?? 35;
        const bPriority = LAYER_RENDER_PRIORITY[bKey] ?? 35;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // Keep original order for layers with equal priority.
        return a.index - b.index;
      })
      .map((item) => item.layer);

    let usedTmxCollision = false;
    if (tmxUrl) {
      const tmxBlocked = await this.loadCollisionFromTmx(tmxUrl, mapData.tileSize, mapData.mapWidth, mapData.mapHeight);
      if (tmxBlocked.size > 0) {
        usedTmxCollision = true;
        for (const key of tmxBlocked) {
          this.blockedTileKeys.add(key);
        }
      }
    }
    if (!usedTmxCollision) {
      for (const layer of mapData.layers) {
        if (!layer.collider) {
          continue;
        }
        for (const tile of layer.tiles) {
          this.blockedTileKeys.add(tileKey(tile.x, tile.y));
        }
      }
    }

    for (const layer of sortedLayers) {
      const name = layer.name.toLowerCase();
      // SpriteFusion "above_tiles" may contain decorative sparkles/noise
      // that should not appear in the final gameplay view.
      if (name === 'above_tiles') {
        continue;
      }
      // Skip any layer that contains character/NPC tiles (often in top-right).
      if (name.includes('character') || name.includes('npc') || name.includes('actor')) {
        continue;
      }

      const layerContainer = new Container();
      layerContainer.label = layer.name;
      layerContainer.eventMode = 'none';

      for (const tile of layer.tiles) {
        const tileId = Number(tile.id);
        if (!Number.isFinite(tileId) || tileId < 0) {
          continue;
        }
        const texture = this.getTileTexture(tileId);
        if (!texture) {
          continue;
        }

        const sprite = new Sprite(texture);
        sprite.x = tile.x * this.tileSize;
        sprite.y = tile.y * this.tileSize;
        sprite.roundPixels = true;
        // Tiny overlap prevents sub-pixel seams between neighboring tiles.
        sprite.width = this.tileSize + 0.02;
        sprite.height = this.tileSize + 0.02;
        layerContainer.addChild(sprite);
      }

      this.addChild(layerContainer);
    }
  }

  private getTileTexture(tileId: number): Texture | null {
    const cached = this.tileTextureCache.get(tileId);
    if (cached) {
      return cached;
    }
    if (!this.spritesheetTexture) {
      return null;
    }

    const source = this.spritesheetTexture.source;
    const cols = Math.floor(source.width / this.tileSize);
    if (cols <= 0) {
      return null;
    }
    const sx = (tileId % cols) * this.tileSize;
    const sy = Math.floor(tileId / cols) * this.tileSize;

    if (
      sx < 0 ||
      sy < 0 ||
      sx + this.tileSize > source.width ||
      sy + this.tileSize > source.height
    ) {
      return null;
    }

    const texture = new Texture({
      source,
      frame: new Rectangle(sx, sy, this.tileSize, this.tileSize),
    });
    this.tileTextureCache.set(tileId, texture);
    return texture;
  }

  private async loadCollisionFromTmx(
    tmxUrl: string,
    tileSize: number,
    mapWidth: number,
    mapHeight: number,
  ): Promise<Set<string>> {
    try {
      const xmlText = await fetch(tmxUrl).then((r) => r.text());
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');
      if (doc.querySelector('parsererror')) {
        return new Set<string>();
      }

      const blockedTiles = new Set<string>();
      const doorTiles = new Set<string>();
      const objectGroups = Array.from(doc.querySelectorAll('objectgroup'));

      for (const group of objectGroups) {
        const groupName = (group.getAttribute('name') ?? '').toLowerCase().trim();
        const isWallGroup = groupName.includes('wall');
        const isDoorGroup = groupName.includes('door');
        const isRoomsGroup = groupName.includes('room');
        const objects = Array.from(group.querySelectorAll('object'));
        for (const object of objects) {
          const type = normalizeObjectLabel(
            object.getAttribute('type') ?? object.getAttribute('class') ?? '',
          );
          const name = normalizeObjectLabel(object.getAttribute('name') ?? '');
          const isDoor = type === 'door' || name === 'door';
          const blocksOverride = readBooleanObjectProperty(object, 'blocksMovement');
          const shouldBlock = blocksOverride ?? resolveDefaultBlocking({
            type,
            name,
            isWallGroup,
            isDoorGroup,
            isRoomsGroup,
          });
          if (!shouldBlock && !isDoor) {
            continue;
          }

          const x = Number(object.getAttribute('x') ?? '0');
          const y = Number(object.getAttribute('y') ?? '0');
          let width = Number(object.getAttribute('width') ?? '0');
          let height = Number(object.getAttribute('height') ?? '0');
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
            continue;
          }
          if (width <= 0 || height <= 0) {
            const polygon = object.querySelector('polygon');
            if (polygon) {
              const points = (polygon.getAttribute('points') ?? '')
                .split(' ')
                .map((pair) => pair.split(',').map(Number))
                .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
              if (points.length > 0) {
                let minX = points[0][0];
                let maxX = points[0][0];
                let minY = points[0][1];
                let maxY = points[0][1];
                for (const [px, py] of points) {
                  minX = Math.min(minX, px);
                  maxX = Math.max(maxX, px);
                  minY = Math.min(minY, py);
                  maxY = Math.max(maxY, py);
                }
                width = Math.max(width, maxX - minX);
                height = Math.max(height, maxY - minY);
              }
            }
          }
          if (width <= 0 || height <= 0) {
            continue;
          }

          const minTileX = Math.max(0, Math.floor(x / tileSize));
          const minTileY = Math.max(0, Math.floor(y / tileSize));
          const maxTileX = Math.min(mapWidth - 1, Math.ceil((x + width) / tileSize) - 1);
          const maxTileY = Math.min(mapHeight - 1, Math.ceil((y + height) / tileSize) - 1);
          for (let ty = minTileY; ty <= maxTileY; ty += 1) {
            for (let tx = minTileX; tx <= maxTileX; tx += 1) {
              const key = tileKey(tx, ty);
              if (shouldBlock) {
                blockedTiles.add(key);
              }
              if (isDoor) {
                doorTiles.add(key);
              }
            }
          }
        }
      }

      // Door footprints carve passable openings through wall rectangles.
      for (const key of doorTiles) {
        blockedTiles.delete(key);
      }
      return blockedTiles;
    } catch {
      return new Set<string>();
    }
  }
}

const NON_BLOCKING_OBJECT_LABELS = new Set([
  'room',
  'door',
  'spawn',
  'entry',
  'exit',
  'trigger',
  'waypoint',
  'chair',
  'sofa',
  'bed',
  'beds',
  'computer',
  'instrument',
  'toilet',
  'shower',
  'bathtub',
  'gym_equipement',
  'gym_equipements',
  'treadmill',
  'punching_bag',
  'bench_press_chair',
  'class_table',
]);

const BLOCKING_OBJECT_LABELS = new Set([
  'teacher_table',
  'wall',
  'closet',
  'closets',
  'computer_table',
  'book_shelf',
  'book_stand',
  'television',
  'tv',
  'piano',
  'shelf',
  'tv_shelf',
  'kitchen_shelf',
  'dashboard',
  'dressing_table',
  'kitchen_appliance',
  'kitchen_objects',
  'fridge',
  'stove',
  'kitchen_cabinet',
  'washing_machine',
  'mirror',
  'study_table',
  'dorm_table',
  'kitchen_table',
  'living_room_table',
]);

function normalizeObjectLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function readBooleanObjectProperty(object: Element, propertyName: string): boolean | null {
  const properties = object.querySelector('properties');
  if (!properties) return null;
  const propertyNodes = Array.from(properties.querySelectorAll('property'));
  const target = propertyNodes.find((node) => {
    const name = node.getAttribute('name');
    return name?.toLowerCase() === propertyName.toLowerCase();
  });
  if (!target) return null;

  const type = (target.getAttribute('type') ?? '').toLowerCase().trim();
  const rawValue = (target.getAttribute('value') ?? target.textContent ?? '').toLowerCase().trim();
  if (type === 'bool' || rawValue === 'true' || rawValue === 'false' || rawValue === '1' || rawValue === '0') {
    return rawValue === 'true' || rawValue === '1';
  }
  return null;
}

const BLOCKED_EXIT_NAMES = new Set(['door_to_outside']);

function resolveDefaultBlocking(params: {
  type: string;
  name: string;
  isWallGroup: boolean;
  isDoorGroup: boolean;
  isRoomsGroup: boolean;
}): boolean {
  const { type, name, isWallGroup, isDoorGroup, isRoomsGroup } = params;
  if (BLOCKED_EXIT_NAMES.has(name)) return true;
  if (isDoorGroup || type === 'door' || name === 'door') return false;
  // Explicit blocking (tv_shelf, book_shelf, etc.) takes precedence over group type.
  if (BLOCKING_OBJECT_LABELS.has(type) || BLOCKING_OBJECT_LABELS.has(name)) return true;
  if (NON_BLOCKING_OBJECT_LABELS.has(type) || NON_BLOCKING_OBJECT_LABELS.has(name)) return false;
  if (isRoomsGroup) return false;
  if (isWallGroup) return true;
  // For unknown object labels, stay conservative but keep them walkable
  // so NPCs can still reach custom interaction anchors.
  return false;
}
