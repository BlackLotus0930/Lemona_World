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
  profile: CharacterProfile;
  hobbies?: HobbyPreference[];
  spawnTileX?: number;
  spawnTileY?: number;
  spawnFacing?: 'down' | 'left' | 'right' | 'up';
  startWaypointIndex?: number;
  startWaypointProgressMinutes?: number;
  weekdaySchedule?: ScheduleWaypoint[];
  weekendSchedule?: ScheduleWaypoint[];
  schedule: ScheduleWaypoint[];
  dialogueStyle?: {
    tone?: string;
    avoidTopics?: string[];
    signaturePhrases?: string[];
  };
  needsProfile?: {
    hungerRate?: number;
    socialRate?: number;
    noveltyRate?: number;
    stressRate?: number;
    energyRecoveryRate?: number;
  };
}

export type NeedType = 'competence' | 'autonomy' | 'belonging' | 'safety' | 'novelty' | 'status';
export type ObserverBias = 'romanticized' | 'suspicious' | 'pragmatic' | 'idealizing' | 'guarded';
export type InitialRelationshipType = 'friend' | 'rival' | 'family_expectation' | 'former_acquaintance';
export type SocialEdgeType = 'preBond' | 'authorityBias';
export type BehaviorAction = 'socialize' | 'avoid' | 'explore' | 'study' | 'compete';

export interface TraitVector {
  openness: number; // 0-100
  sociability: number; // 0-100
  impulseControl: number; // 0-100
  sensitivity: number; // 0-100
  boundaryStrength: number; // 0-100
  /**
   * @deprecated Use impulseControl.
   * Kept for migration compatibility with older data.
   */
  selfControl?: number;
}

export interface WeightedNeed {
  type: NeedType;
  weight: number; // 0-100
}

export interface NeedStructure {
  primaryType: NeedType;
  secondaryType: NeedType;
  secondaryRatio: number; // secondary / primary
  normalized: {
    primary: number; // 0-100
    secondary: number; // 0-100
  };
}

export interface EmotionState {
  label: string;
  intensity: number; // 0-1
}

export interface DynamicState {
  currentEmotion: EmotionState;
  currentGoal: string;
  currentFocus: string;
}

export interface BehaviorPolicy {
  baseActionWeights: Record<BehaviorAction, number>; // 0-100 relative weights
  // Legacy knobs kept for data compatibility; runtime behavior is now cognition-driven.
  actionThreshold: number; // if top action < threshold, fallback to schedule behavior
  fallbackToScheduleWhenBelowThreshold: boolean;
  notes: string;
}

export interface SimulationLayer {
  traits: TraitVector;
  needs: NeedStructure;
  dynamicState: DynamicState;
  behaviorPolicy: BehaviorPolicy;
}

export interface ObserverInference {
  hypothesis: string;
  confidence: number; // 0-1, updated slowly over time
}

export interface ConfidenceHook {
  baseStep: number;
  evidenceQualityFactor: number;
  maxStep: number;
}

export interface SelfNarrative {
  id: string;
  text: string;
  orientation: 'approach' | 'defensive';
  confidence: number; // 0-1
  dominance: number; // 0-1, normalized among narratives
  resistance: number; // 0-1
  lastUpdatedTs?: number;
}

export interface ObserverLayer {
  observerBias: ObserverBias;
  readText: string;
  inferences: ObserverInference[];
  confidenceHook: ConfidenceHook;
  selfNarratives: [SelfNarrative, SelfNarrative];
}

export interface IdentityStructure {
  socialExperience: string;
  abilityExperience: string;
  relationshipStart: {
    type: InitialRelationshipType;
    detail: string;
  };
  initialGoalOrAnxiety: string;
}

export interface CharacterProfile {
  observerLayer: ObserverLayer;
  simulationLayer: SimulationLayer;
  identityStructure: IdentityStructure;
}

export interface CharacterRelationshipEdge {
  id: string;
  type: SocialEdgeType;
  fromId: string;
  toId: string;
  valence: number; // -100 to 100
  trust: number; // 0 to 100
  obligation: number; // 0 to 100
  volatility: number; // 0 to 100
  secrecy: number; // 0 to 100, 100 means highly secret
  detail: string;
  reciprocal?: boolean;
}

export interface HobbyPreference {
  activity: ScheduleWaypoint['activity'];
  weight: number; // 0..1, higher means more likely to pick this activity when options exist
}

export const DEFAULT_CONFIDENCE_HOOK: ConfidenceHook = {
  baseStep: 0.012,
  evidenceQualityFactor: 0.55,
  maxStep: 0.035,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function buildNeedStructure(
  primaryType: NeedType,
  secondaryType: NeedType,
  secondaryRatio: number,
): NeedStructure {
  const ratio = Math.max(0, secondaryRatio);
  const total = 1 + ratio;
  return {
    primaryType,
    secondaryType,
    secondaryRatio: ratio,
    normalized: {
      primary: Math.round((1 / total) * 100),
      secondary: Math.round((ratio / total) * 100),
    },
  };
}

export function updateInferenceConfidence(
  confidence: number,
  signal: 'support' | 'contradict',
  evidenceQuality: number,
  hook: ConfidenceHook = DEFAULT_CONFIDENCE_HOOK,
): number {
  const quality = clamp(evidenceQuality, 0, 1);
  const signed = signal === 'support' ? 1 : -1;
  const delta = Math.min(hook.maxStep, hook.baseStep * (1 + quality * hook.evidenceQualityFactor));
  return clamp(confidence + signed * delta, 0.1, 0.9);
}

export function getDominantSelfNarrative(
  observerLayer: ObserverLayer,
): SelfNarrative {
  const sorted = [...observerLayer.selfNarratives].sort((a, b) => b.dominance - a.dominance);
  return sorted[0];
}

export type ScheduleSlotKind = 'class' | 'break' | 'free' | 'private' | 'sleep';

export interface ScheduleWaypoint {
  roomId: string;
  tileX: number;
  tileY: number;
  activity:
    | 'sleep'
    | 'eat'
    | 'study'
    | 'class_study'
    | 'library_study'
    | 'read'
    | 'exercise'
    | 'sports_ball'
    | 'social'
    | 'rest'
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
  durationMinutes: number;
  slotKind?: ScheduleSlotKind;
  strictness?: number; // 0..1, higher means stronger schedule adherence
}

interface SchoolWeekdayAnchor {
  dormRoomId: string;
  dormTileX: number;
  dormTileY: number;
  morningPrepRoomId?: string;
  morningPrepTileX?: number;
  morningPrepTileY?: number;
  morningPrepActivity?: ScheduleWaypoint['activity'];
  classRoomId: string;
  classTileX: number;
  classTileY: number;
  breakRoomId: string;
  breakTileX: number;
  breakTileY: number;
  middayStudyRoomId: string;
  middayStudyTileX: number;
  middayStudyTileY: number;
  lunchRoomId: string;
  lunchTileX: number;
  lunchTileY: number;
  exerciseRoomId: string;
  exerciseTileX: number;
  exerciseTileY: number;
  freeTimeRoomId: string;
  freeTimeTileX: number;
  freeTimeTileY: number;
  freeTimeActivity: ScheduleWaypoint['activity'];
  eveningStudyRoomId: string;
  eveningStudyTileX: number;
  eveningStudyTileY: number;
  privateRoomId: string;
  privateTileX: number;
  privateTileY: number;
  privateActivity?: ScheduleWaypoint['activity'];
}

function resolveStudyActivity(roomId: string): ScheduleWaypoint['activity'] {
  return roomId === 'library' ? 'library_study' : 'class_study';
}

function buildSchoolWeekdaySchedule(anchor: SchoolWeekdayAnchor): ScheduleWaypoint[] {
  const morningPrepRoomId = anchor.morningPrepRoomId ?? anchor.dormRoomId;
  const morningPrepTileX = anchor.morningPrepTileX ?? anchor.dormTileX;
  const morningPrepTileY = anchor.morningPrepTileY ?? anchor.dormTileY;
  return [
    { roomId: morningPrepRoomId, tileX: morningPrepTileX, tileY: morningPrepTileY, activity: 'rest', durationMinutes: 360, slotKind: 'free', strictness: 0.08 }, // 07:30-13:30 autonomy window
    { roomId: anchor.classRoomId, tileX: anchor.classTileX, tileY: anchor.classTileY, activity: resolveStudyActivity(anchor.classRoomId), durationMinutes: 90, slotKind: 'class', strictness: 0.96 }, // 13:30-15:00 class block A
    { roomId: anchor.breakRoomId, tileX: anchor.breakTileX, tileY: anchor.breakTileY, activity: 'rest', durationMinutes: 15, slotKind: 'break', strictness: 0.24 }, // 15:00-15:15 class break
    { roomId: anchor.classRoomId, tileX: anchor.classTileX, tileY: anchor.classTileY, activity: resolveStudyActivity(anchor.classRoomId), durationMinutes: 75, slotKind: 'class', strictness: 0.96 }, // 15:15-16:30 class block B
    { roomId: anchor.freeTimeRoomId, tileX: anchor.freeTimeTileX, tileY: anchor.freeTimeTileY, activity: 'rest', durationMinutes: 360, slotKind: 'free', strictness: 0.08 }, // 16:30-22:30 autonomy window
    { roomId: anchor.dormRoomId, tileX: anchor.dormTileX, tileY: anchor.dormTileY, activity: 'sleep', durationMinutes: 540, slotKind: 'sleep', strictness: 0.97 }, // 22:30-07:30 sleep
  ];
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
    profile: {
      observerLayer: {
        observerBias: 'guarded',
        readText:
          'A cute-looking boy with a composed, distant first impression; he scans people before committing to interaction.',
        inferences: [
          { hypothesis: 'He may prefer depth over popularity.', confidence: 0.56 },
          { hypothesis: 'He protects himself with silence when uncertain.', confidence: 0.61 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'iris_autonomy',
            text: 'I stay true to myself even when others misunderstand me.',
            orientation: 'approach',
            confidence: 0.66,
            dominance: 0.58,
            resistance: 0.64,
          },
          {
            id: 'iris_guard',
            text: 'Keeping distance protects me from being reduced to a label.',
            orientation: 'defensive',
            confidence: 0.71,
            dominance: 0.42,
            resistance: 0.69,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 86,
          sociability: 34,
          impulseControl: 79,
          sensitivity: 72,
          boundaryStrength: 78,
        },
        needs: buildNeedStructure('autonomy', 'belonging', 0.32),
        dynamicState: {
          currentEmotion: { label: 'cautious curiosity', intensity: 0.52 },
          currentGoal: 'identify one person he can speak honestly with',
          currentFocus: 'Zero',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 22, avoid: 33, explore: 28, study: 41, compete: 18 },
          actionThreshold: 36,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Defaults to observe-first behavior; opens up after repeated safe interactions.',
        },
      },
      identityStructure: {
        socialExperience:
          'In his previous school he was often treated as "the strange one" because of his elf-like ears, which taught him to protect himself with distance and composure.',
        abilityExperience:
          'He once completed a difficult solo music performance despite intense social pressure, and learned to trust his own competence.',
        relationshipStart: {
          type: 'former_acquaintance',
          detail: 'He intentionally cut ties with almost everyone from his old school when entering this boarding school.',
        },
        initialGoalOrAnxiety:
          'He wants a fresh start but worries he will again be reduced to a symbol instead of seen as a person.',
      },
    },
    hobbies: [
      { activity: 'read', weight: 0.82 },
      { activity: 'music', weight: 0.72 },
    ],
    spawnTileX: 25,
    spawnTileY: 8,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm1',
      dormTileX: 25,
      dormTileY: 8,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 32,
      morningPrepTileY: 10,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 14,
      classTileY: 8,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'library',
      middayStudyTileX: 16,
      middayStudyTileY: 27,
      lunchRoomId: 'canteen',
      lunchTileX: 27,
      lunchTileY: 28,
      exerciseRoomId: 'gym',
      exerciseTileX: 38,
      exerciseTileY: 8,
      freeTimeRoomId: 'library',
      freeTimeTileX: 16,
      freeTimeTileY: 27,
      freeTimeActivity: 'read',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 14,
      eveningStudyTileY: 8,
      privateRoomId: 'dorm1',
      privateTileX: 27,
      privateTileY: 10,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm1', tileX: 25, tileY: 8, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 27, tileY: 28, activity: 'eat', durationMinutes: 30 },
      { roomId: 'class1', tileX: 14, tileY: 8, activity: 'study', durationMinutes: 90 },
      { roomId: 'class1', tileX: 12, tileY: 7, activity: 'music', durationMinutes: 25 },
      { roomId: 'library', tileX: 16, tileY: 27, activity: 'read', durationMinutes: 45 },
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
    profile: {
      observerLayer: {
        observerBias: 'idealizing',
        readText:
          'A more handsome young man now, projecting high energy and social ease; brief pauses suggest he may still be running from self-doubt.',
        inferences: [
          { hypothesis: 'He seeks fast connection to reduce uncertainty.', confidence: 0.58 },
          { hypothesis: 'He may hide failure memories behind humor.', confidence: 0.47 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'fern_connection',
            text: 'People connect faster when I bring energy first.',
            orientation: 'approach',
            confidence: 0.67,
            dominance: 0.62,
            resistance: 0.41,
          },
          {
            id: 'fern_escape',
            text: 'If I stop, disappointment will catch up with me.',
            orientation: 'defensive',
            confidence: 0.58,
            dominance: 0.38,
            resistance: 0.47,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 78,
          sociability: 93,
          impulseControl: 42,
          sensitivity: 57,
          boundaryStrength: 31,
        },
        needs: buildNeedStructure('novelty', 'belonging', 0.35),
        dynamicState: {
          currentEmotion: { label: 'excited anticipation', intensity: 0.76 },
          currentGoal: 'build instant rapport with at least one roommate',
          currentFocus: 'Rina',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 56, avoid: 10, explore: 48, study: 20, compete: 15 },
          actionThreshold: 34,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Approaches quickly, then stabilizes if the other side responds warmly.',
        },
      },
      identityStructure: {
        socialExperience:
          'He was known as the class mood-lifter, but gradually realized being liked by many is not the same as being deeply known.',
        abilityExperience:
          'He once made a rushed decision in a team competition and caused a loss, which left him with hidden fear of letting people down.',
        relationshipStart: {
          type: 'friend',
          detail: 'A close friend did not transfer with him, so he arrives carrying unresolved loneliness behind his energy.',
        },
        initialGoalOrAnxiety:
          'He wants to make friends fast, but is quietly afraid of being excluded once first impressions fade.',
      },
    },
    hobbies: [
      { activity: 'perform', weight: 0.86 },
      { activity: 'sports_ball', weight: 0.72 },
    ],
    spawnTileX: 23,
    spawnTileY: 6,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm1',
      dormTileX: 23,
      dormTileY: 6,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 33,
      morningPrepTileY: 10,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 8,
      classTileY: 5,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'class1',
      middayStudyTileX: 8,
      middayStudyTileY: 6,
      lunchRoomId: 'canteen',
      lunchTileX: 29,
      lunchTileY: 28,
      exerciseRoomId: 'gym',
      exerciseTileX: 43,
      exerciseTileY: 8,
      freeTimeRoomId: 'class1',
      freeTimeTileX: 8,
      freeTimeTileY: 5,
      freeTimeActivity: 'perform',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 8,
      eveningStudyTileY: 6,
      privateRoomId: 'dorm1',
      privateTileX: 22,
      privateTileY: 8,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm1', tileX: 23, tileY: 6, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 29, tileY: 28, activity: 'eat', durationMinutes: 30 },
      { roomId: 'class1', tileX: 8, tileY: 5, activity: 'perform', durationMinutes: 90 },
      { roomId: 'bathroom1', tileX: 42, tileY: 17, activity: 'shower', durationMinutes: 20 },
      { roomId: 'gym', tileX: 43, tileY: 8, activity: 'sports_ball', durationMinutes: 45 },
      { roomId: 'dorm1', tileX: 22, tileY: 8, activity: 'rest', durationMinutes: 180 },
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
    profile: {
      observerLayer: {
        observerBias: 'romanticized',
        readText:
          'Appears calm, considerate, and emotionally tuned-in; may over-function when others are distressed.',
        inferences: [
          { hypothesis: 'She tends to self-sacrifice to preserve group stability.', confidence: 0.62 },
          { hypothesis: 'She wants reciprocity, not one-way caretaking.', confidence: 0.52 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'mio_harmony',
            text: 'I can keep this place gentle if I notice tension early.',
            orientation: 'approach',
            confidence: 0.69,
            dominance: 0.61,
            resistance: 0.52,
          },
          {
            id: 'mio_overload',
            text: 'If I do not hold things together, everything may fall apart.',
            orientation: 'defensive',
            confidence: 0.62,
            dominance: 0.39,
            resistance: 0.56,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 69,
          sociability: 64,
          impulseControl: 73,
          sensitivity: 78,
          boundaryStrength: 44,
        },
        needs: buildNeedStructure('belonging', 'safety', 0.3),
        dynamicState: {
          currentEmotion: { label: 'gentle vigilance', intensity: 0.48 },
          currentGoal: 'reduce tension in shared spaces before conflicts form',
          currentFocus: 'Saki',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 40, avoid: 20, explore: 24, study: 33, compete: 8 },
          actionThreshold: 36,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Intervenes early in interpersonal friction, but avoids open confrontation.',
        },
      },
      identityStructure: {
        socialExperience:
          'She often acted as mediator in family and school conflicts, becoming skilled at soothing others while suppressing her own needs.',
        abilityExperience:
          'She independently mastered a physically demanding routine and discovered she is not only a supporter but also capable on her own.',
        relationshipStart: {
          type: 'family_expectation',
          detail: 'Her family encouraged her to "take care of herself first," a message she still struggles to follow.',
        },
        initialGoalOrAnxiety:
          'She wants the dorm to feel emotionally safe, but fears becoming everyone\'s emotional caretaker again.',
      },
    },
    hobbies: [
      { activity: 'read', weight: 0.77 },
      { activity: 'decorate', weight: 0.61 },
    ],
    spawnTileX: 38,
    spawnTileY: 28,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm2',
      dormTileX: 38,
      dormTileY: 28,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 34,
      morningPrepTileY: 10,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 16,
      classTileY: 9,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'library',
      middayStudyTileX: 16,
      middayStudyTileY: 29,
      lunchRoomId: 'canteen',
      lunchTileX: 26,
      lunchTileY: 29,
      exerciseRoomId: 'gym',
      exerciseTileX: 40,
      exerciseTileY: 9,
      freeTimeRoomId: 'dorm2',
      freeTimeTileX: 39,
      freeTimeTileY: 30,
      freeTimeActivity: 'decorate',
      eveningStudyRoomId: 'library',
      eveningStudyTileX: 16,
      eveningStudyTileY: 29,
      privateRoomId: 'dorm2',
      privateTileX: 39,
      privateTileY: 30,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm2', tileX: 38, tileY: 28, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 16, tileY: 9, activity: 'study', durationMinutes: 120 },
      { roomId: 'library', tileX: 16, tileY: 29, activity: 'read', durationMinutes: 30 },
      { roomId: 'canteen', tileX: 26, tileY: 29, activity: 'eat', durationMinutes: 45 },
      { roomId: 'gym', tileX: 40, tileY: 9, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'dorm2', tileX: 39, tileY: 30, activity: 'rest', durationMinutes: 120 },
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
    profile: {
      observerLayer: {
        observerBias: 'suspicious',
        readText:
          'Carries high social presence and style control; can read as confident, but her scanning gaze is tactical.',
        inferences: [
          { hypothesis: 'She tracks hierarchy quickly in new groups.', confidence: 0.65 },
          { hypothesis: 'Rejection may trigger defensive dominance behavior.', confidence: 0.55 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'momo_status',
            text: 'I maintain my position by choosing alliances deliberately.',
            orientation: 'approach',
            confidence: 0.68,
            dominance: 0.57,
            resistance: 0.6,
          },
          {
            id: 'momo_reject',
            text: 'If I let others define me, I become replaceable.',
            orientation: 'defensive',
            confidence: 0.65,
            dominance: 0.43,
            resistance: 0.62,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 74,
          sociability: 81,
          impulseControl: 58,
          sensitivity: 62,
          boundaryStrength: 69,
        },
        needs: buildNeedStructure('status', 'autonomy', 0.28),
        dynamicState: {
          currentEmotion: { label: 'strategic alertness', intensity: 0.64 },
          currentGoal: 'decode the school\'s social hierarchy before committing to alliances',
          currentFocus: 'Saki',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 49, avoid: 16, explore: 29, study: 19, compete: 43 },
          actionThreshold: 35,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Uses social initiative as position management when uncertainty is high.',
        },
      },
      identityStructure: {
        socialExperience:
          'She previously held central social status, but those ties depended on image management and gave her little real trust.',
        abilityExperience:
          'She unexpectedly failed in a high-visibility evaluation and learned that confidence does not eliminate vulnerability.',
        relationshipStart: {
          type: 'rival',
          detail: 'She enters new groups by quickly mapping influence and identifying who might challenge her position.',
        },
        initialGoalOrAnxiety:
          'She wants to control her social narrative early, while hiding fear of becoming replaceable.',
      },
    },
    hobbies: [
      { activity: 'decorate', weight: 0.9 },
      { activity: 'watch_tv', weight: 0.66 },
    ],
    spawnTileX: 40,
    spawnTileY: 28,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm2',
      dormTileX: 40,
      dormTileY: 28,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 32,
      morningPrepTileY: 11,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 16,
      classTileY: 9,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'class1',
      middayStudyTileX: 16,
      middayStudyTileY: 9,
      lunchRoomId: 'canteen',
      lunchTileX: 30,
      lunchTileY: 28,
      exerciseRoomId: 'gym',
      exerciseTileX: 42,
      exerciseTileY: 10,
      freeTimeRoomId: 'dorm2',
      freeTimeTileX: 38,
      freeTimeTileY: 25,
      freeTimeActivity: 'decorate',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 16,
      eveningStudyTileY: 9,
      privateRoomId: 'dorm2',
      privateTileX: 40,
      privateTileY: 28,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm2', tileX: 40, tileY: 28, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'canteen', tileX: 30, tileY: 28, activity: 'eat', durationMinutes: 45 },
      { roomId: 'class1', tileX: 16, tileY: 9, activity: 'study', durationMinutes: 90 },
      { roomId: 'dorm2', tileX: 38, tileY: 25, activity: 'decorate', durationMinutes: 20 },
      { roomId: 'gym', tileX: 42, tileY: 10, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 31, tileY: 25, activity: 'cook', durationMinutes: 75 },
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
    profile: {
      observerLayer: {
        observerBias: 'pragmatic',
        readText:
          'Presents as controlled and focused, with little performative emotion. Looks goal-locked rather than aloof.',
        inferences: [
          { hypothesis: 'He protects dignity through measurable achievement.', confidence: 0.63 },
          { hypothesis: 'Challenge can energize him more than comfort.', confidence: 0.58 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'edward_mastery',
            text: 'Discipline and training are the way I earn freedom.',
            orientation: 'approach',
            confidence: 0.73,
            dominance: 0.64,
            resistance: 0.66,
          },
          {
            id: 'edward_avoid_shame',
            text: 'If I fail publicly, I lose control of my own worth.',
            orientation: 'defensive',
            confidence: 0.57,
            dominance: 0.36,
            resistance: 0.59,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 61,
          sociability: 49,
          impulseControl: 84,
          sensitivity: 48,
          boundaryStrength: 72,
        },
        needs: buildNeedStructure('competence', 'status', 0.28),
        dynamicState: {
          currentEmotion: { label: 'quiet determination', intensity: 0.58 },
          currentGoal: 'find the school\'s hardest meaningful challenge',
          currentFocus: 'Zero',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 21, avoid: 19, explore: 26, study: 54, compete: 37 },
          actionThreshold: 38,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Optimizes for hard tasks and skill progression before social comfort.',
        },
      },
      identityStructure: {
        socialExperience:
          'A public criticism by an authority figure made him cautious about judgment and motivated him to rely on results over explanations.',
        abilityExperience:
          'He once exceeded his own training limit in a difficult challenge, creating a strong identity around disciplined growth.',
        relationshipStart: {
          type: 'family_expectation',
          detail: 'He grew up in comparison with a high-achieving family member and wants a domain that is truly his own.',
        },
        initialGoalOrAnxiety:
          'He aims to prove himself quickly, but worries he may define his worth only through performance.',
      },
    },
    hobbies: [
      { activity: 'sports_ball', weight: 0.83 },
      { activity: 'exercise', weight: 0.7 },
    ],
    spawnTileX: 29,
    spawnTileY: 8,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm1',
      dormTileX: 29,
      dormTileY: 8,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 33,
      morningPrepTileY: 11,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 18,
      classTileY: 9,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'class1',
      middayStudyTileX: 18,
      middayStudyTileY: 9,
      lunchRoomId: 'canteen',
      lunchTileX: 27,
      lunchTileY: 29,
      exerciseRoomId: 'gym',
      exerciseTileX: 43,
      exerciseTileY: 8,
      freeTimeRoomId: 'gym',
      freeTimeTileX: 43,
      freeTimeTileY: 8,
      freeTimeActivity: 'sports_ball',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 18,
      eveningStudyTileY: 9,
      privateRoomId: 'dorm1',
      privateTileX: 24,
      privateTileY: 10,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm1', tileX: 29, tileY: 8, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 18, tileY: 9, activity: 'study', durationMinutes: 80 },
      { roomId: 'bathroom1', tileX: 42, tileY: 14, activity: 'toilet', durationMinutes: 18 },
      { roomId: 'canteen', tileX: 27, tileY: 29, activity: 'eat', durationMinutes: 40 },
      { roomId: 'gym', tileX: 43, tileY: 8, activity: 'sports_ball', durationMinutes: 50 },
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
    profile: {
      observerLayer: {
        observerBias: 'guarded',
        readText:
          'Composed but closed posture. Gives signals of high self-management and selective engagement.',
        inferences: [
          { hypothesis: 'She scans for emotional safety before interaction.', confidence: 0.67 },
          { hypothesis: 'Withdrawal here is protective, not necessarily hostile.', confidence: 0.59 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'saki_safety',
            text: 'I can stay safe by revealing myself slowly and selectively.',
            orientation: 'approach',
            confidence: 0.71,
            dominance: 0.6,
            resistance: 0.75,
          },
          {
            id: 'saki_betrayal',
            text: 'Trusting too soon invites harm.',
            orientation: 'defensive',
            confidence: 0.74,
            dominance: 0.4,
            resistance: 0.8,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 58,
          sociability: 27,
          impulseControl: 82,
          sensitivity: 83,
          boundaryStrength: 87,
        },
        needs: buildNeedStructure('safety', 'autonomy', 0.32),
        dynamicState: {
          currentEmotion: { label: 'low-intensity vigilance', intensity: 0.46 },
          currentGoal: 'preserve boundaries while observing others',
          currentFocus: 'Mio',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 12, avoid: 58, explore: 18, study: 36, compete: 11 },
          actionThreshold: 39,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Avoids rapid intimacy; participates more when predictability rises.',
        },
      },
      identityStructure: {
        socialExperience:
          'A private confidence was once exposed by someone she trusted, leading her to treat intimacy as high risk.',
        abilityExperience:
          'She endured a difficult period mostly alone and developed strong private resilience with low reliance on external help.',
        relationshipStart: {
          type: 'former_acquaintance',
          detail: 'She arrives by necessity rather than preference and assumes most people are unsafe until proven otherwise.',
        },
        initialGoalOrAnxiety:
          'She wants to remain unnoticed until she can assess whether this environment is emotionally survivable.',
      },
    },
    hobbies: [
      { activity: 'read', weight: 0.81 },
      { activity: 'bathe', weight: 0.62 },
    ],
    spawnTileX: 43,
    spawnTileY: 29,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm2',
      dormTileX: 43,
      dormTileY: 29,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 34,
      morningPrepTileY: 11,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 14,
      classTileY: 11,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'library',
      middayStudyTileX: 16,
      middayStudyTileY: 27,
      lunchRoomId: 'canteen',
      lunchTileX: 31,
      lunchTileY: 29,
      exerciseRoomId: 'gym',
      exerciseTileX: 40,
      exerciseTileY: 9,
      freeTimeRoomId: 'library',
      freeTimeTileX: 16,
      freeTimeTileY: 27,
      freeTimeActivity: 'read',
      eveningStudyRoomId: 'library',
      eveningStudyTileX: 16,
      eveningStudyTileY: 27,
      privateRoomId: 'dorm2',
      privateTileX: 37,
      privateTileY: 30,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm2', tileX: 43, tileY: 29, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 14, tileY: 11, activity: 'study', durationMinutes: 80 },
      { roomId: 'library', tileX: 16, tileY: 27, activity: 'study', durationMinutes: 30 },
      { roomId: 'bathroom2', tileX: 43, tileY: 23, activity: 'bathe', durationMinutes: 20 },
      { roomId: 'canteen', tileX: 31, tileY: 29, activity: 'eat', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 29, tileY: 29, activity: 'watch_tv', durationMinutes: 45 },
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
    profile: {
      observerLayer: {
        observerBias: 'idealizing',
        readText:
          'Openly expressive and upbeat. Looks playful, but routines suggest she values structure and follow-through.',
        inferences: [
          { hypothesis: 'She tries to convert anxiety into action energy.', confidence: 0.54 },
          { hypothesis: 'She may over-commit to maintain a positive identity.', confidence: 0.48 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'rina_growth',
            text: 'Trying boldly helps me grow and brings people together.',
            orientation: 'approach',
            confidence: 0.7,
            dominance: 0.63,
            resistance: 0.46,
          },
          {
            id: 'rina_fix',
            text: 'If I miss a chance to help, I might fail someone important.',
            orientation: 'defensive',
            confidence: 0.55,
            dominance: 0.37,
            resistance: 0.44,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 83,
          sociability: 88,
          impulseControl: 61,
          sensitivity: 52,
          boundaryStrength: 41,
        },
        needs: buildNeedStructure('novelty', 'competence', 0.3),
        dynamicState: {
          currentEmotion: { label: 'bright curiosity', intensity: 0.71 },
          currentGoal: 'find a partner to explore campus routines with',
          currentFocus: 'Fern',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 52, avoid: 12, explore: 51, study: 27, compete: 19 },
          actionThreshold: 34,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'High initiative and positive framing; can shift to focused mode under challenge.',
        },
      },
      identityStructure: {
        socialExperience:
          'She once tried to defend an isolated classmate but misread the situation and unintentionally made it worse.',
        abilityExperience:
          'A high-stakes music win taught her that nervousness can be transformed into performance energy when channeled well.',
        relationshipStart: {
          type: 'friend',
          detail: 'She tends to approach new peers quickly and assumes good intent until evidence says otherwise.',
        },
        initialGoalOrAnxiety:
          'She wants to stay authentically cheerful in a new environment while proving she can also be dependable.',
      },
    },
    hobbies: [
      { activity: 'perform', weight: 0.74 },
      { activity: 'sports_ball', weight: 0.7 },
    ],
    spawnTileX: 41,
    spawnTileY: 28,
    spawnFacing: 'right',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'dorm2',
      dormTileX: 41,
      dormTileY: 28,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 33,
      morningPrepTileY: 12,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 16,
      classTileY: 7,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'class1',
      middayStudyTileX: 16,
      middayStudyTileY: 7,
      lunchRoomId: 'canteen',
      lunchTileX: 28,
      lunchTileY: 28,
      exerciseRoomId: 'gym',
      exerciseTileX: 44,
      exerciseTileY: 9,
      freeTimeRoomId: 'class1',
      freeTimeTileX: 8,
      freeTimeTileY: 5,
      freeTimeActivity: 'perform',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 16,
      eveningStudyTileY: 7,
      privateRoomId: 'dorm2',
      privateTileX: 42,
      privateTileY: 30,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'dorm2', tileX: 41, tileY: 28, activity: 'sleep', durationMinutes: 55 },
      { roomId: 'class1', tileX: 12, tileY: 11, activity: 'study', durationMinutes: 75 },
      { roomId: 'gym', tileX: 44, tileY: 9, activity: 'sports_ball', durationMinutes: 22 },
      { roomId: 'canteen', tileX: 28, tileY: 28, activity: 'eat', durationMinutes: 42 },
      { roomId: 'class1', tileX: 8, tileY: 5, activity: 'perform', durationMinutes: 28 },
      { roomId: 'dorm2', tileX: 42, tileY: 30, activity: 'rest', durationMinutes: 110 },
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
    profile: {
      observerLayer: {
        observerBias: 'pragmatic',
        readText:
          'Composed authority presence. Keeps emotional distance while tracking everyone in the room.',
        inferences: [
          { hypothesis: 'He values duty over approval.', confidence: 0.66 },
          { hypothesis: 'He may over-monitor vulnerable students.', confidence: 0.51 },
        ],
        confidenceHook: DEFAULT_CONFIDENCE_HOOK,
        selfNarratives: [
          {
            id: 'zero_duty',
            text: 'Responsibility gives my past a constructive direction.',
            orientation: 'approach',
            confidence: 0.76,
            dominance: 0.66,
            resistance: 0.72,
          },
          {
            id: 'zero_guarded',
            text: 'If I loosen control, people under me may get hurt.',
            orientation: 'defensive',
            confidence: 0.67,
            dominance: 0.34,
            resistance: 0.74,
          },
        ],
      },
      simulationLayer: {
        traits: {
          openness: 64,
          sociability: 38,
          impulseControl: 91,
          sensitivity: 63,
          boundaryStrength: 82,
        },
        needs: buildNeedStructure('safety', 'competence', 0.29),
        dynamicState: {
          currentEmotion: { label: 'controlled vigilance', intensity: 0.55 },
          currentGoal: 'establish trust without losing authority',
          currentFocus: 'Iris',
        },
        behaviorPolicy: {
          baseActionWeights: { socialize: 18, avoid: 22, explore: 20, study: 38, compete: 14 },
          actionThreshold: 37,
          fallbackToScheduleWhenBelowThreshold: true,
          notes: 'Prioritizes supervision and risk reduction over social popularity.',
        },
      },
      identityStructure: {
        socialExperience:
          'A critical breach of trust in his past made him highly selective about dependence and public vulnerability.',
        abilityExperience:
          'He once stabilized a severe crisis under pressure, reinforcing an identity of endurance and practical action.',
        relationshipStart: {
          type: 'former_acquaintance',
          detail: 'The school accepted him with caution; he enters as both mentor and monitored outsider.',
        },
        initialGoalOrAnxiety:
          'He wants these first-year students to avoid repeating his mistakes, but is unsure how much truth to reveal.',
      },
    },
    hobbies: [
      { activity: 'cook', weight: 0.68 },
      { activity: 'laundry', weight: 0.52 },
    ],
    spawnTileX: 14,
    spawnTileY: 14,
    spawnFacing: 'left',
    startWaypointIndex: 2,
    startWaypointProgressMinutes: 0,
    weekdaySchedule: buildSchoolWeekdaySchedule({
      dormRoomId: 'teacher_dorm',
      dormTileX: 14,
      dormTileY: 14,
      morningPrepRoomId: 'hall2',
      morningPrepTileX: 33,
      morningPrepTileY: 14,
      morningPrepActivity: 'rest',
      classRoomId: 'class1',
      classTileX: 18,
      classTileY: 8,
      breakRoomId: 'hall1',
      breakTileX: 23,
      breakTileY: 17,
      middayStudyRoomId: 'class1',
      middayStudyTileX: 18,
      middayStudyTileY: 8,
      lunchRoomId: 'canteen',
      lunchTileX: 31,
      lunchTileY: 25,
      exerciseRoomId: 'gym',
      exerciseTileX: 39,
      exerciseTileY: 9,
      freeTimeRoomId: 'hall1',
      freeTimeTileX: 23,
      freeTimeTileY: 17,
      freeTimeActivity: 'watch_tv',
      eveningStudyRoomId: 'class1',
      eveningStudyTileX: 18,
      eveningStudyTileY: 8,
      privateRoomId: 'teacher_dorm',
      privateTileX: 12,
      privateTileY: 19,
      privateActivity: 'rest',
    }),
    schedule: [
      { roomId: 'teacher_dorm', tileX: 14, tileY: 14, activity: 'sleep', durationMinutes: 60 },
      { roomId: 'class1', tileX: 18, tileY: 8, activity: 'study', durationMinutes: 85 },
      { roomId: 'bathroom1', tileX: 39, tileY: 12, activity: 'laundry', durationMinutes: 16 },
      { roomId: 'gym', tileX: 39, tileY: 9, activity: 'exercise', durationMinutes: 45 },
      { roomId: 'canteen', tileX: 31, tileY: 25, activity: 'cook', durationMinutes: 40 },
      { roomId: 'teacher_dorm', tileX: 12, tileY: 19, activity: 'rest', durationMinutes: 90 },
    ],
  },
];

export const CHARACTER_RELATIONSHIP_EDGES: CharacterRelationshipEdge[] = [
  {
    id: 'edge_prebond_fern_rina',
    type: 'preBond',
    fromId: 'npc2',
    toId: 'npc7',
    valence: 34,
    trust: 47,
    obligation: 12,
    volatility: 36,
    secrecy: 18,
    detail: 'Fern and Rina met in a regional youth camp and remember each other positively.',
    reciprocal: true,
  },
  {
    id: 'edge_prebond_momo_edward',
    type: 'preBond',
    fromId: 'npc4',
    toId: 'npc5',
    valence: -39,
    trust: 22,
    obligation: 8,
    volatility: 63,
    secrecy: 42,
    detail: 'Momo and Edward were minor rivals in a public competition before enrollment.',
    reciprocal: true,
  },
  {
    id: 'edge_prebond_iris_mio',
    type: 'preBond',
    fromId: 'npc1',
    toId: 'npc3',
    valence: 21,
    trust: 35,
    obligation: 16,
    volatility: 27,
    secrecy: 68,
    detail: 'Iris and Mio briefly crossed paths in a music workshop, but neither mentions it openly.',
    reciprocal: true,
  },
  {
    id: 'edge_authority_zero_iris',
    type: 'authorityBias',
    fromId: 'npc8',
    toId: 'npc1',
    valence: 12,
    trust: 33,
    obligation: 59,
    volatility: 19,
    secrecy: 71,
    detail: 'Zero keeps extra watch on Iris due to concern, while avoiding obvious favoritism.',
    reciprocal: false,
  },
];
