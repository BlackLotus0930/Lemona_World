export type AffordanceType =
  | 'sleep'
  | 'eat'
  | 'study'
  | 'exercise'
  | 'social'
  | 'rest'
  | 'work'
  | 'music'
  | 'watch_tv'
  | 'toilet'
  | 'shower'
  | 'clean';

export interface InteractionPoint {
  id: string;
  tileX: number;
  tileY: number;
}

export interface WorldObjectDefinition {
  id: string;
  roomId: string;
  name: string;
  affordances: AffordanceType[];
  interactionPoints: InteractionPoint[];
  queuePoints?: InteractionPoint[];
}

export const WORLD_OBJECTS: WorldObjectDefinition[] = [
  {
    id: 'dormA_beds',
    roomId: 'dorm1',
    name: 'Dorm A Beds',
    affordances: ['sleep', 'rest'],
    interactionPoints: [
      { id: 'dormA_bed_1', tileX: 24, tileY: 8 },
      { id: 'dormA_bed_2', tileX: 26, tileY: 8 },
      { id: 'dormA_bed_3', tileX: 28, tileY: 8 },
      { id: 'dormA_bed_4', tileX: 30, tileY: 9 },
    ],
  },
  {
    id: 'dormB_beds',
    roomId: 'dorm2',
    name: 'Dorm B Beds',
    affordances: ['sleep', 'rest'],
    interactionPoints: [
      { id: 'dormB_bed_1', tileX: 37, tileY: 28 },
      { id: 'dormB_bed_2', tileX: 39, tileY: 28 },
      { id: 'dormB_bed_3', tileX: 41, tileY: 28 },
      { id: 'dormB_bed_4', tileX: 43, tileY: 29 },
    ],
  },
  {
    id: 'canteen_tables',
    roomId: 'canteen',
    name: 'Canteen Tables',
    affordances: ['eat', 'social', 'rest'],
    interactionPoints: [
      { id: 'canteen_a', tileX: 27, tileY: 28 },
      { id: 'canteen_b', tileX: 29, tileY: 28 },
      { id: 'canteen_c', tileX: 31, tileY: 28 },
      { id: 'canteen_d', tileX: 28, tileY: 29 },
      { id: 'canteen_e', tileX: 30, tileY: 29 },
    ],
    queuePoints: [
      { id: 'canteen_q1', tileX: 25, tileY: 28 },
      { id: 'canteen_q2', tileX: 25, tileY: 29 },
    ],
  },
  {
    id: 'class1_desks',
    roomId: 'class1',
    name: 'Class 1 Desks',
    affordances: ['study', 'work'],
    interactionPoints: [
      { id: 'class1_a', tileX: 14, tileY: 8 },
      { id: 'class1_b', tileX: 16, tileY: 8 },
      { id: 'class1_c', tileX: 18, tileY: 9 },
    ],
    queuePoints: [{ id: 'class1_q1', tileX: 12, tileY: 8 }],
  },
  {
    id: 'class2_desks',
    roomId: 'class2',
    name: 'Class 2 Desks',
    affordances: ['study', 'work'],
    interactionPoints: [
      { id: 'class2_a', tileX: 14, tileY: 28 },
      { id: 'class2_b', tileX: 16, tileY: 28 },
      { id: 'class2_c', tileX: 18, tileY: 29 },
    ],
    queuePoints: [{ id: 'class2_q1', tileX: 12, tileY: 28 }],
  },
  {
    id: 'gym_stations',
    roomId: 'gym',
    name: 'Gym Stations',
    affordances: ['exercise', 'rest'],
    interactionPoints: [
      { id: 'gym_a', tileX: 38, tileY: 8 },
      { id: 'gym_b', tileX: 40, tileY: 8 },
      { id: 'gym_c', tileX: 42, tileY: 9 },
      { id: 'gym_d', tileX: 39, tileY: 10 },
    ],
    queuePoints: [{ id: 'gym_q1', tileX: 36, tileY: 8 }],
  },
  {
    id: 'bathroom1_fixtures',
    roomId: 'bathroom1',
    name: 'Bathroom A Fixtures',
    affordances: ['rest'],
    interactionPoints: [
      { id: 'bath1_a', tileX: 41, tileY: 14 },
      { id: 'bath1_b', tileX: 43, tileY: 15 },
    ],
  },
  {
    id: 'bathroom2_fixtures',
    roomId: 'bathroom2',
    name: 'Bathroom B Fixtures',
    affordances: ['rest', 'toilet', 'shower'],
    interactionPoints: [
      { id: 'bath2_a', tileX: 41, tileY: 20 },
      { id: 'bath2_b', tileX: 43, tileY: 21 },
    ],
  },
  {
    id: 'bathroom1_facilities',
    roomId: 'bathroom1',
    name: 'Bathroom A Facilities',
    affordances: ['toilet', 'shower', 'rest'],
    interactionPoints: [
      { id: 'bath1_toilet', tileX: 42, tileY: 14 },
      { id: 'bath1_shower', tileX: 42, tileY: 15 },
    ],
  },
  {
    id: 'hall_tv_and_sofa',
    roomId: 'hall1',
    name: 'Living Room TV',
    affordances: ['watch_tv', 'social', 'rest'],
    interactionPoints: [
      { id: 'hall_tv_a', tileX: 27, tileY: 17 },
      { id: 'hall_sofa_a', tileX: 23, tileY: 17 },
      { id: 'hall_sofa_b', tileX: 22, tileY: 18 },
    ],
  },
  {
    id: 'class_music_corner',
    roomId: 'class1',
    name: 'Music Corner',
    affordances: ['music', 'study'],
    interactionPoints: [
      { id: 'class_music_1', tileX: 12, tileY: 7 },
      { id: 'class_music_2', tileX: 13, tileY: 7 },
    ],
  },
  {
    id: 'kitchen_cleaning_zone',
    roomId: 'canteen',
    name: 'Kitchen Cleaning Zone',
    affordances: ['clean', 'eat', 'social'],
    interactionPoints: [
      { id: 'kitchen_clean_1', tileX: 30, tileY: 28 },
      { id: 'kitchen_clean_2', tileX: 29, tileY: 28 },
    ],
  },
];
