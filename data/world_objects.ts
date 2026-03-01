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

export type FacingDirection = 'down' | 'left' | 'right' | 'up';
export type InteractionPose = 'stand' | 'sit' | 'lie';

export interface InteractionPoint {
  id: string;
  tileX: number;
  tileY: number;
  facing?: FacingDirection;
  pose?: InteractionPose;
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
    id: 'dorm1_beds',
    roomId: 'dorm1',
    name: 'Dorm Boy Beds',
    affordances: ['sleep', 'rest'],
    interactionPoints: [
      { id: 'dorm1_bed_1', tileX: 22, tileY: 5, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_2', tileX: 23, tileY: 6, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_3', tileX: 22, tileY: 8, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_4', tileX: 23, tileY: 9, facing: 'right', pose: 'lie' },
    ],
  },
  {
    id: 'dorm1_computer_desk',
    roomId: 'dorm1',
    name: 'Dorm Boy Computer',
    affordances: ['study', 'work'],
    interactionPoints: [
      { id: 'dorm1_pc_chair_1', tileX: 28, tileY: 9, facing: 'up', pose: 'sit' },
      { id: 'dorm1_pc_chair_2', tileX: 29, tileY: 10, facing: 'up', pose: 'sit' },
    ],
  },
  {
    id: 'dorm2_beds',
    roomId: 'dorm2',
    name: 'Dorm Girl Beds',
    affordances: ['sleep', 'rest'],
    interactionPoints: [
      { id: 'dorm2_bed_1', tileX: 45, tileY: 26, facing: 'left', pose: 'lie' },
      { id: 'dorm2_bed_2', tileX: 45, tileY: 27, facing: 'left', pose: 'lie' },
      { id: 'dorm2_bed_3', tileX: 45, tileY: 29, facing: 'left', pose: 'lie' },
      { id: 'dorm2_bed_4', tileX: 45, tileY: 30, facing: 'left', pose: 'lie' },
    ],
  },
  {
    id: 'dorm2_vanity_and_desk',
    roomId: 'dorm2',
    name: 'Dorm Girl Vanity and Desk',
    affordances: ['study', 'rest', 'social'],
    interactionPoints: [
      { id: 'dorm2_desk_1', tileX: 37, tileY: 30, facing: 'up', pose: 'sit' },
      { id: 'dorm2_desk_2', tileX: 40, tileY: 29, facing: 'up', pose: 'sit' },
      { id: 'dorm2_desk_3', tileX: 41, tileY: 29, facing: 'down', pose: 'sit' },
    ],
  },
  {
    id: 'class1_desks',
    roomId: 'class1',
    name: 'Class 1 Tables and Chairs',
    affordances: ['study', 'work'],
    interactionPoints: [
      // Updated from map object chairs (3x3 seating in class 1).
      { id: 'class1_seat_a', tileX: 12, tileY: 7, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_b', tileX: 14, tileY: 7, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_c', tileX: 16, tileY: 7, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_d', tileX: 12, tileY: 9, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_e', tileX: 14, tileY: 9, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_f', tileX: 16, tileY: 9, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_g', tileX: 12, tileY: 11, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_h', tileX: 14, tileY: 11, facing: 'right', pose: 'sit' },
      { id: 'class1_seat_i', tileX: 16, tileY: 11, facing: 'right', pose: 'sit' },
    ],
    queuePoints: [{ id: 'class1_queue_1', tileX: 12, tileY: 8 }],
  },
  {
    id: 'class1_music_corner',
    roomId: 'class1',
    name: 'Class 1 Piano and Music',
    affordances: ['music', 'study'],
    interactionPoints: [
      { id: 'class1_music_1', tileX: 8, tileY: 5, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'class2_desks',
    roomId: 'class2',
    name: 'Class 2 Desks',
    affordances: ['study', 'work'],
    interactionPoints: [
      { id: 'class2_seat_a', tileX: 16, tileY: 28, facing: 'left', pose: 'sit' },
      { id: 'class2_seat_b', tileX: 18, tileY: 28, facing: 'left', pose: 'sit' },
      { id: 'class2_seat_c', tileX: 16, tileY: 30, facing: 'left', pose: 'sit' },
      { id: 'class2_seat_d', tileX: 18, tileY: 30, facing: 'left', pose: 'sit' },
    ],
    queuePoints: [{ id: 'class2_queue_1', tileX: 12, tileY: 28 }],
  },
  {
    id: 'canteen_tables',
    roomId: 'canteen',
    name: 'Kitchen Table and Chairs',
    affordances: ['eat', 'social', 'rest'],
    interactionPoints: [
      { id: 'canteen_seat_a', tileX: 29, tileY: 30, facing: 'right', pose: 'sit' },
      { id: 'canteen_seat_b', tileX: 29, tileY: 31, facing: 'right', pose: 'sit' },
      { id: 'canteen_seat_c', tileX: 32, tileY: 29, facing: 'left', pose: 'sit' },
      { id: 'canteen_seat_d', tileX: 32, tileY: 30, facing: 'left', pose: 'sit' },
    ],
    queuePoints: [
      { id: 'canteen_queue_1', tileX: 27, tileY: 28 },
      { id: 'canteen_queue_2', tileX: 30, tileY: 28 },
    ],
  },
  {
    id: 'canteen_kitchen_appliances',
    roomId: 'canteen',
    name: 'Kitchen Appliances',
    affordances: ['clean', 'eat'],
    interactionPoints: [
      { id: 'kitchen_fridge_1', tileX: 25, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_stove_1', tileX: 26, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_sink_1', tileX: 28, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_sink_2', tileX: 29, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_bread_1', tileX: 30, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_coffee_1', tileX: 31, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_microwave_1', tileX: 32, tileY: 27, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'hall_tv',
    roomId: 'hall1',
    name: 'Living Room TV',
    affordances: ['watch_tv', 'social', 'rest'],
    interactionPoints: [
      { id: 'hall_tv_1', tileX: 21, tileY: 17, facing: 'right', pose: 'stand' },
      { id: 'hall_tv_2', tileX: 24, tileY: 18, facing: 'right', pose: 'stand' },
      { id: 'hall_tv_3', tileX: 26, tileY: 19, facing: 'right', pose: 'stand' },
    ],
  },
  {
    id: 'hall_sofas',
    roomId: 'hall1',
    name: 'Living Room Sofas',
    affordances: ['social', 'rest', 'watch_tv'],
    interactionPoints: [
      // Sofa 108: horizontal (336,261 96x26) - main sofa, tiles (21-27, 16-17), facing right toward TV
      { id: 'hall_sofa_1', tileX: 21, tileY: 17, facing: 'right', pose: 'sit' },
      { id: 'hall_sofa_2', tileX: 23, tileY: 17, facing: 'right', pose: 'sit' },
      { id: 'hall_sofa_3', tileX: 25, tileY: 17, facing: 'right', pose: 'sit' },
      { id: 'hall_sofa_4', tileX: 26, tileY: 17, facing: 'right', pose: 'sit' },
      // Sofa 109: vertical (303.5,277 24.5x59.5) - L-corner, tiles (18-20, 17-21), facing right
      { id: 'hall_sofa_5', tileX: 20, tileY: 18, facing: 'right', pose: 'sit' },
      { id: 'hall_sofa_6', tileX: 20, tileY: 20, facing: 'right', pose: 'sit' },
      // sofa_chair 207: (335,306 16x12) - small chair, tile (21,19), facing up
      { id: 'hall_sofa_7', tileX: 21, tileY: 19, facing: 'up', pose: 'sit' },
    ],
  },
  {
    id: 'hall_computer_corner',
    roomId: 'hall1',
    name: 'Hall Computer Desk',
    affordances: ['study', 'work'],
    interactionPoints: [
      { id: 'hall_pc_1', tileX: 31, tileY: 19, facing: 'up', pose: 'sit' },
      { id: 'hall_pc_2', tileX: 33, tileY: 19, facing: 'up', pose: 'sit' },
      { id: 'hall_pc_3', tileX: 35, tileY: 19, facing: 'up', pose: 'sit' },
    ],
    queuePoints: [
      { id: 'hall_pc_queue_1', tileX: 30, tileY: 19 },
      { id: 'hall_pc_queue_2', tileX: 29, tileY: 19 },
    ],
  },
  {
    id: 'gym_treadmills',
    roomId: 'gym',
    name: 'Gym Treadmills',
    affordances: ['exercise'],
    interactionPoints: [
      { id: 'gym_treadmill_1', tileX: 43, tileY: 6, facing: 'up', pose: 'stand' },
      { id: 'gym_treadmill_2', tileX: 45, tileY: 6, facing: 'up', pose: 'stand' },
    ],
    queuePoints: [
      { id: 'gym_treadmill_queue_1', tileX: 41, tileY: 9 },
      { id: 'gym_treadmill_queue_2', tileX: 41, tileY: 10 },
    ],
  },
  {
    id: 'gym_punching_bag',
    roomId: 'gym',
    name: 'Gym Punching Bag',
    affordances: ['exercise'],
    interactionPoints: [
      { id: 'gym_bag_1', tileX: 40, tileY: 7, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'gym_bench_area',
    roomId: 'gym',
    name: 'Gym Bench Area',
    affordances: ['exercise', 'rest'],
    interactionPoints: [
      { id: 'gym_bench_1', tileX: 36, tileY: 6, facing: 'down', pose: 'sit' },
    ],
  },
  {
    id: 'bathroom1_fixtures',
    roomId: 'bathroom1',
    name: 'Bathroom A Fixtures',
    affordances: ['toilet', 'shower', 'rest'],
    interactionPoints: [
      { id: 'bath1_toilet_1', tileX: 41, tileY: 14, facing: 'down', pose: 'sit' },
      { id: 'bath1_shower_1', tileX: 42, tileY: 17, facing: 'up', pose: 'stand' },
      { id: 'bath1_sink_1', tileX: 40, tileY: 14, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'bathroom2_fixtures',
    roomId: 'bathroom2',
    name: 'Bathroom B Fixtures',
    affordances: ['rest', 'toilet', 'shower'],
    interactionPoints: [
      { id: 'bath2_toilet_1', tileX: 42, tileY: 19, facing: 'down', pose: 'sit' },
      { id: 'bath2_shower_1', tileX: 43, tileY: 23, facing: 'up', pose: 'stand' },
      { id: 'bath2_sink_1', tileX: 41, tileY: 19, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'kitchen_cleaning_zone',
    roomId: 'canteen',
    name: 'Kitchen Sink and Prep',
    affordances: ['clean', 'eat'],
    interactionPoints: [
      { id: 'kitchen_clean_1', tileX: 28, tileY: 26, facing: 'up', pose: 'stand' },
      { id: 'kitchen_clean_2', tileX: 29, tileY: 26, facing: 'up', pose: 'stand' },
      { id: 'kitchen_clean_3', tileX: 24, tileY: 26, facing: 'up', pose: 'stand' },
    ],
  },
];
