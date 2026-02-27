/**
 * Campus map layout - rooms and buildings.
 * Each room is a rectangle [x, y, width, height] in tile units.
 * TILE_SIZE is used to convert to pixels.
 */

export const TILE_SIZE = 16;
export const MAP_WIDTH_TILES = 58;
export const MAP_HEIGHT_TILES = 36;
export const MAP_WIDTH = MAP_WIDTH_TILES * TILE_SIZE;
export const MAP_HEIGHT = MAP_HEIGHT_TILES * TILE_SIZE;

export type RoomType = 'dorm' | 'canteen' | 'classroom' | 'gym' | 'bathroom' | 'outdoor' | 'hallway';

export interface Room {
  id: string;
  type: RoomType;
  bounds: [number, number, number, number]; // x, y, w, h in tiles
  label: string;
}

export const ROOMS: Room[] = [
  // Bounds aligned to object regions from public/assets/map/map.tmx
  { id: 'dorm1', type: 'dorm', bounds: [22, 6, 10, 7], label: 'Dorm Boy' },
  { id: 'dorm2', type: 'dorm', bounds: [35, 26, 11, 6], label: 'Dorm Girl' },
  { id: 'canteen', type: 'canteen', bounds: [23, 26, 12, 6], label: 'Kitchen' },
  { id: 'class1', type: 'classroom', bounds: [11, 6, 11, 7], label: 'Class 1' },
  { id: 'class2', type: 'classroom', bounds: [11, 26, 12, 6], label: 'Class 2' },
  { id: 'gym', type: 'gym', bounds: [35, 6, 11, 7], label: 'Gym' },
  { id: 'bathroom1', type: 'bathroom', bounds: [39, 13, 7, 4], label: 'Toilet 1' },
  { id: 'bathroom2', type: 'bathroom', bounds: [39, 19, 7, 5], label: 'Toilet 2' },
  // Indoor connector areas seen in TMX living_room / dorm_teacher objects
  { id: 'hall1', type: 'hallway', bounds: [18, 15, 21, 9], label: 'Living Room' },
  { id: 'hall2', type: 'hallway', bounds: [32, 6, 3, 9], label: 'Connector' },
  { id: 'hall3', type: 'hallway', bounds: [11, 15, 7, 9], label: 'Dorm Teacher' },
  { id: 'hall4', type: 'hallway', bounds: [1, 1, 57, 35], label: 'Courtyard' },
];

export const ROOM_COLORS: Record<RoomType, number> = {
  dorm: 0xa8d5ba,
  canteen: 0xf7dc6f,
  classroom: 0xbbd4e7,
  gym: 0xea9abb,
  bathroom: 0x85c1e9,
  outdoor: 0x82e0aa,
  hallway: 0xe8e8e8,
};
