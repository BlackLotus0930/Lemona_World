/**
 * Character definitions and initial schedule waypoints.
 */

export interface CharacterConfig {
  spritePath?: string;
  spriteColumns?: number;
  spriteRows?: number;
  spriteFps?: number;
  id: string;
  name: string;
  color: number;
  startWaypointIndex?: number;
  startWaypointProgressMinutes?: number;
  schedule: ScheduleWaypoint[];
}

export interface ScheduleWaypoint {
  roomId: string;
  tileX: number;
  tileY: number;
  activity:
    | 'sleep'
    | 'eat'
    | 'study'
    | 'exercise'
    | 'social'
    | 'rest'
    | 'music'
    | 'watch_tv'
    | 'toilet'
    | 'shower'
    | 'clean';
  durationMinutes: number;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    spritePath: '/assets/characters_sprite_sheet/Iris.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc1',
    name: 'Iris',
    color: 0x3498db,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 0,
    schedule: [
      { roomId: 'dorm1', tileX: 25, tileY: 8, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 27, tileY: 28, activity: 'eat', durationMinutes: 30 },
      { roomId: 'class1', tileX: 14, tileY: 8, activity: 'study', durationMinutes: 90 },
      { roomId: 'class1', tileX: 12, tileY: 7, activity: 'music', durationMinutes: 25 },
      { roomId: 'canteen', tileX: 30, tileY: 29, activity: 'eat', durationMinutes: 45 },
      { roomId: 'gym', tileX: 38, tileY: 8, activity: 'exercise', durationMinutes: 60 },
      { roomId: 'dorm1', tileX: 27, tileY: 10, activity: 'rest', durationMinutes: 120 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Fern.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc2',
    name: 'Fern',
    color: 0xe74c3c,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 15,
    schedule: [
      { roomId: 'dorm2', tileX: 38, tileY: 28, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 29, tileY: 28, activity: 'eat', durationMinutes: 30 },
      { roomId: 'class2', tileX: 14, tileY: 28, activity: 'study', durationMinutes: 90 },
      { roomId: 'bathroom2', tileX: 42, tileY: 22, activity: 'shower', durationMinutes: 20 },
      { roomId: 'canteen', tileX: 31, tileY: 29, activity: 'social', durationMinutes: 45 },
      { roomId: 'dorm2', tileX: 40, tileY: 29, activity: 'rest', durationMinutes: 180 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Mio.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc3',
    name: 'Mio',
    color: 0x2ecc71,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 30,
    schedule: [
      { roomId: 'dorm1', tileX: 27, tileY: 8, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 16, tileY: 9, activity: 'study', durationMinutes: 120 },
      { roomId: 'hall1', tileX: 27, tileY: 17, activity: 'watch_tv', durationMinutes: 30 },
      { roomId: 'canteen', tileX: 26, tileY: 29, activity: 'eat', durationMinutes: 45 },
      { roomId: 'gym', tileX: 40, tileY: 9, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'dorm1', tileX: 29, tileY: 10, activity: 'rest', durationMinutes: 120 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Momo.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc4',
    name: 'Momo',
    color: 0xf39c12,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 45,
    schedule: [
      { roomId: 'dorm2', tileX: 40, tileY: 28, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 30, tileY: 28, activity: 'eat', durationMinutes: 45 },
      { roomId: 'class2', tileX: 16, tileY: 28, activity: 'study', durationMinutes: 90 },
      { roomId: 'canteen', tileX: 30, tileY: 28, activity: 'clean', durationMinutes: 20 },
      { roomId: 'gym', tileX: 42, tileY: 10, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 28, tileY: 29, activity: 'social', durationMinutes: 75 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Edward.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc5',
    name: 'Edward',
    color: 0x9b59b6,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 10,
    schedule: [
      { roomId: 'dorm1', tileX: 29, tileY: 8, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 18, tileY: 9, activity: 'study', durationMinutes: 80 },
      { roomId: 'bathroom1', tileX: 42, tileY: 14, activity: 'toilet', durationMinutes: 18 },
      { roomId: 'canteen', tileX: 27, tileY: 29, activity: 'eat', durationMinutes: 40 },
      { roomId: 'gym', tileX: 41, tileY: 9, activity: 'exercise', durationMinutes: 50 },
      { roomId: 'dorm1', tileX: 24, tileY: 10, activity: 'rest', durationMinutes: 120 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Saki.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc6',
    name: 'Saki',
    color: 0x1abc9c,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 25,
    schedule: [
      { roomId: 'dorm2', tileX: 43, tileY: 29, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class2', tileX: 18, tileY: 28, activity: 'study', durationMinutes: 80 },
      { roomId: 'hall1', tileX: 22, tileY: 17, activity: 'social', durationMinutes: 30 },
      { roomId: 'hall1', tileX: 24, tileY: 17, activity: 'watch_tv', durationMinutes: 20 },
      { roomId: 'canteen', tileX: 31, tileY: 29, activity: 'eat', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 29, tileY: 29, activity: 'social', durationMinutes: 45 },
      { roomId: 'dorm2', tileX: 37, tileY: 30, activity: 'rest', durationMinutes: 120 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Rina.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc7',
    name: 'Rina',
    color: 0x7ed957,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 8,
    schedule: [
      { roomId: 'dorm1', tileX: 23, tileY: 8, activity: 'sleep', durationMinutes: 55 },
      { roomId: 'class2', tileX: 15, tileY: 28, activity: 'study', durationMinutes: 75 },
      { roomId: 'hall1', tileX: 27, tileY: 17, activity: 'watch_tv', durationMinutes: 22 },
      { roomId: 'canteen', tileX: 28, tileY: 28, activity: 'eat', durationMinutes: 42 },
      { roomId: 'class1', tileX: 13, tileY: 7, activity: 'music', durationMinutes: 28 },
      { roomId: 'dorm1', tileX: 25, tileY: 10, activity: 'rest', durationMinutes: 110 },
    ],
  },
  {
    spritePath: '/assets/characters_sprite_sheet/Zero.png',
    spriteColumns: 3,
    spriteRows: 4,
    spriteFps: 8,
    id: 'npc8',
    name: 'Zero',
    color: 0xe2e8f0,
    startWaypointIndex: 0,
    startWaypointProgressMinutes: 18,
    schedule: [
      { roomId: 'dorm1', tileX: 28, tileY: 9, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 18, tileY: 8, activity: 'study', durationMinutes: 85 },
      { roomId: 'bathroom1', tileX: 43, tileY: 15, activity: 'toilet', durationMinutes: 16 },
      { roomId: 'gym', tileX: 39, tileY: 9, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 30, tileY: 29, activity: 'social', durationMinutes: 40 },
      { roomId: 'hall1', tileX: 23, tileY: 17, activity: 'rest', durationMinutes: 90 },
    ],
  },
];
