export type AffordanceType =
  | 'sleep'
  | 'eat'
  | 'study'
  | 'read'
  | 'exercise'
  | 'sports_ball'
  | 'social'
  | 'rest'
  | 'work'
  | 'music'
  | 'perform'
  | 'watch_tv'
  | 'toilet'
  | 'shower'
  | 'bathe'
  | 'clean'
  | 'cook'
  | 'laundry'
  | 'decorate';

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
      { id: 'dorm1_bed_1', tileX: 23, tileY: 5, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_2', tileX: 23, tileY: 6, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_3', tileX: 23, tileY: 8, facing: 'right', pose: 'lie' },
      { id: 'dorm1_bed_4', tileX: 23, tileY: 9, facing: 'right', pose: 'lie' },
    ],
  },
  {
    id: 'dorm1_computer_desk',
    roomId: 'dorm1',
    name: 'Dorm Boy Computer',
    affordances: ['study', 'work'],
    interactionPoints: [
      // Aligned with dorm_table/dorm_chair objects in updated map.
      { id: 'dorm1_pc_chair_1', tileX: 28, tileY: 9, facing: 'up', pose: 'sit' },
      { id: 'dorm1_pc_chair_2', tileX: 27, tileY: 10, facing: 'up', pose: 'sit' },
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
      // Aligned with updated dorm_table/dorm_chair objects near dorm girl room.
      { id: 'dorm2_desk_1', tileX: 35, tileY: 28, facing: 'up', pose: 'sit' },
      { id: 'dorm2_desk_2', tileX: 37, tileY: 28, facing: 'up', pose: 'sit' },
      { id: 'dorm2_desk_3', tileX: 37, tileY: 29, facing: 'down', pose: 'sit' },
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
    affordances: ['music', 'study', 'perform'],
    interactionPoints: [
      { id: 'class1_music_1', tileX: 8, tileY: 5, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'hall3_music_nook',
    roomId: 'teacher_dorm',
    name: 'Dorm Teacher Guitar and Mic',
    affordances: ['music', 'perform', 'social'],
    interactionPoints: [
      // acoustic_guitar (157) near dorm-teacher room.
      { id: 'hall3_guitar_1', tileX: 11, tileY: 16, facing: 'left', pose: 'stand' },
    ],
  },
  {
    id: 'library_tables',
    roomId: 'library',
    name: 'Library Tables and Chairs',
    affordances: ['study', 'work', 'rest', 'read'],
    interactionPoints: [
      // Updated from former class2 table/chair placements in the library zone.
      { id: 'library_seat_a', tileX: 16, tileY: 27, facing: 'right', pose: 'sit' },
      { id: 'library_seat_b', tileX: 16, tileY: 29, facing: 'right', pose: 'sit' },
      { id: 'library_seat_c', tileX: 18, tileY: 27, facing: 'left', pose: 'sit' },
      { id: 'library_seat_d', tileX: 18, tileY: 29, facing: 'left', pose: 'sit' },
    ],
    queuePoints: [{ id: 'library_queue_1', tileX: 14, tileY: 28 }],
  },
  {
    id: 'library_bookshelves',
    roomId: 'library',
    name: 'Library Bookshelves',
    affordances: ['read', 'study', 'rest'],
    interactionPoints: [
      // library_bookshelf objects (279, 281, 282, 283).
      { id: 'library_shelf_1', tileX: 12, tileY: 28, facing: 'up', pose: 'stand' },
      { id: 'library_shelf_2', tileX: 10, tileY: 29, facing: 'right', pose: 'stand' },
      { id: 'library_shelf_3', tileX: 12, tileY: 29, facing: 'right', pose: 'stand' },
      { id: 'library_shelf_4', tileX: 14, tileY: 29, facing: 'right', pose: 'stand' },
    ],
  },
  {
    id: 'canteen_tables',
    roomId: 'canteen',
    name: 'Kitchen Table and Chairs',
    affordances: ['eat', 'social', 'rest'],
    interactionPoints: [
      // kitchen_chair objects (273-276) around kitchen_table (174).
      { id: 'canteen_seat_a', tileX: 28, tileY: 29, facing: 'right', pose: 'sit' },
      { id: 'canteen_seat_b', tileX: 28, tileY: 30, facing: 'right', pose: 'sit' },
      { id: 'canteen_seat_c', tileX: 32, tileY: 29, facing: 'left', pose: 'sit' },
      { id: 'canteen_seat_d', tileX: 32, tileY: 30, facing: 'left', pose: 'sit' },
    ],
    queuePoints: [
      { id: 'canteen_queue_1', tileX: 29, tileY: 28 },
      { id: 'canteen_queue_2', tileX: 31, tileY: 28 },
    ],
  },
  {
    id: 'canteen_kitchen_appliances',
    roomId: 'canteen',
    name: 'Kitchen Appliances',
    affordances: ['clean', 'eat', 'cook'],
    interactionPoints: [
      // fridge/stove/sink/bread/coffee/microwave objects (226,227,229,232,233,235).
      { id: 'kitchen_sink_1', tileX: 28, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_sink_2', tileX: 29, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_bread_1', tileX: 30, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_coffee_1', tileX: 31, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_microwave_1', tileX: 32, tileY: 27, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'hall_sofas',
    roomId: 'hall1',
    name: 'Living Room Sofas',
    affordances: ['social', 'rest', 'watch_tv'],
    interactionPoints: [
      // horizontal_sofa (108) + vertical_sofa (109) + sofa_chair (207).
      { id: 'hall_sofa_1', tileX: 22, tileY: 17, facing: 'down', pose: 'sit' },
      { id: 'hall_sofa_2', tileX: 24, tileY: 17, facing: 'down', pose: 'sit' },
      { id: 'hall_sofa_3', tileX: 25, tileY: 17, facing: 'down', pose: 'sit' },
      { id: 'hall_sofa_4', tileX: 22, tileY: 18, facing: 'right', pose: 'sit' },
      { id: 'hall_sofa_5', tileX: 22, tileY: 20, facing: 'right', pose: 'sit' },
    ],
  },
  {
    id: 'hall_computer_corner',
    roomId: 'hall1',
    name: 'Hall Computer Table',
    affordances: ['study', 'work'],
    interactionPoints: [
      // chair objects (97,100,101) for hall_computer_table (239).
      { id: 'hall_pc_1', tileX: 31, tileY: 20, facing: 'up', pose: 'sit' },
      { id: 'hall_pc_2', tileX: 33, tileY: 20, facing: 'up', pose: 'sit' },
      { id: 'hall_pc_3', tileX: 35, tileY: 20, facing: 'up', pose: 'sit' },
    ],
    queuePoints: [
      { id: 'hall_pc_queue_1', tileX: 30, tileY: 19 },
      { id: 'hall_pc_queue_2', tileX: 29, tileY: 19 },
    ],
  },
  {
    id: 'hall3_teacher_bed',
    roomId: 'teacher_dorm',
    name: 'Dorm Teacher Bed',
    affordances: ['sleep', 'rest'],
    interactionPoints: [
      // dorm_teacher_beds (111).
      { id: 'hall3_bed_1', tileX: 16, tileY: 14, facing: 'down', pose: 'lie' },
      { id: 'hall3_bed_2', tileX: 17, tileY: 15, facing: 'down', pose: 'lie' },
    ],
  },
  {
    id: 'hall3_teacher_desk_and_pc',
    roomId: 'teacher_dorm',
    name: 'Dorm Teacher Desk and Computer',
    affordances: ['work', 'study', 'decorate'],
    interactionPoints: [
      // teacher_table/chair/computer (203/204/155), mirror (191), yellow_figurine (193).
      { id: 'hall3_desk_1', tileX: 11, tileY: 19, facing: 'up', pose: 'sit' },
      { id: 'hall3_pc_1', tileX: 12, tileY: 19, facing: 'up', pose: 'sit' },
      { id: 'hall3_decor_1', tileX: 11, tileY: 22, facing: 'right', pose: 'stand' },
    ],
  },
  {
    id: 'class1_teacher_front',
    roomId: 'class1',
    name: 'Class 1 Blackboard and Teacher Desk',
    affordances: ['study', 'work', 'social'],
    interactionPoints: [
      // blackboard/class_closet/teacher_desk (263/264/265) at class front.
      { id: 'class1_front_1', tileX: 20, tileY: 9, facing: 'left', pose: 'stand' },
    ],
  },
  {
    id: 'dorm1_decor_and_ball',
    roomId: 'dorm1',
    name: 'Dorm Boy Decor and Ball',
    affordances: ['decorate', 'sports_ball', 'social', 'rest'],
    interactionPoints: [
      // miku_figurine (192) + basketball (278) near dorm1/class1 boundary.
      { id: 'dorm1_decor_1', tileX: 22, tileY: 6, facing: 'right', pose: 'stand' },
      { id: 'dorm1_ball_1', tileX: 26, tileY: 6, facing: 'right', pose: 'stand' },
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
    affordances: ['exercise', 'rest', 'sports_ball'],
    interactionPoints: [
      { id: 'gym_bench_1', tileX: 37, tileY: 6, facing: 'down', pose: 'sit' },
    ],
  },
  {
    id: 'gym_ball_zone',
    roomId: 'gym',
    name: 'Gym Ball Corner',
    affordances: ['sports_ball', 'exercise', 'social'],
    interactionPoints: [
      // yoga_ball (277) and nearby open gym lane for ball drills.
      { id: 'gym_ball_1', tileX: 43, tileY: 8, facing: 'right', pose: 'stand' },
    ],
  },
  {
    id: 'bathroom1_fixtures',
    roomId: 'bathroom1',
    name: 'Bathroom A Fixtures',
    affordances: ['toilet', 'shower', 'bathe', 'laundry', 'rest'],
    interactionPoints: [
      { id: 'bath1_toilet_1', tileX: 41, tileY: 14, facing: 'down', pose: 'sit' },
      { id: 'bath1_shower_1', tileX: 43, tileY: 17, facing: 'up', pose: 'stand' },
      { id: 'bath1_sink_1', tileX: 40, tileY: 14, facing: 'up', pose: 'stand' },
      { id: 'bath1_laundry_1', tileX: 41, tileY: 14, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'bathroom2_fixtures',
    roomId: 'bathroom2',
    name: 'Bathroom B Fixtures',
    affordances: ['rest', 'toilet', 'shower', 'bathe', 'laundry'],
    interactionPoints: [
      { id: 'bath2_toilet_1', tileX: 42, tileY: 19, facing: 'down', pose: 'sit' },
      { id: 'bath2_shower_1', tileX: 43, tileY: 23, facing: 'up', pose: 'stand' },
      { id: 'bath2_sink_1', tileX: 41, tileY: 19, facing: 'up', pose: 'stand' },
      { id: 'bath2_laundry_1', tileX: 39, tileY: 17, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'dorm2_style_corner',
    roomId: 'dorm2',
    name: 'Dorm Girl Dressing and Decor',
    affordances: ['decorate', 'social', 'rest'],
    interactionPoints: [
      // dressing_table (180) + mirror (191) + figurines (192, 193).
      { id: 'dorm2_style_1', tileX: 41, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'dorm2_style_2', tileX: 39, tileY: 27, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'kitchen_cleaning_zone',
    roomId: 'canteen',
    name: 'Kitchen Sink and Prep',
    affordances: ['clean', 'eat', 'cook'],
    interactionPoints: [
      { id: 'kitchen_clean_1', tileX: 29, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_clean_2', tileX: 20, tileY: 27, facing: 'up', pose: 'stand' },
      { id: 'kitchen_clean_3', tileX: 31, tileY: 27, facing: 'up', pose: 'stand' },
    ],
  },
  {
    id: 'kitchen_storage_zone',
    roomId: 'canteen',
    name: 'Kitchen Cabinets and Bottles',
    affordances: ['clean', 'cook', 'decorate', 'social'],
    interactionPoints: [
      // kitchen_cabinet (236,237) + bottles (220).
      { id: 'kitchen_storage_1', tileX: 27, tileY: 28, facing: 'up', pose: 'stand' },
      { id: 'kitchen_storage_2', tileX: 27, tileY: 30, facing: 'up', pose: 'stand' },
      { id: 'kitchen_storage_3', tileX: 28, tileY: 30, facing: 'up', pose: 'stand' },
    ],
  },
];
