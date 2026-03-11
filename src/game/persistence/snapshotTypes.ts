import type { AgentMemoryEntry, AgentRuntimeState } from '../../agent/types';
import type { SelfNarrative } from '../../../data/characters';
import type { EpisodicMemoryEntry } from '../memory/memoryEngine';

export const SAVE_SCHEMA_VERSION = 1;

export type SaveSlotId = 'autosave' | 'slot1' | 'slot2' | 'slot3';
export type SaveMapEntries<T> = Array<[string, T]>;

export type CharacterScheduleMode = 'weekday' | 'weekend';
export type CharacterFacing = 'down' | 'left' | 'right' | 'up';

export interface ScheduleSnapshot {
  gameMinutes: number;
  gameDays: number;
  realSecondsAccum: number;
  timeScale: number;
  paused: boolean;
}

export interface CharacterRuntimeSnapshot {
  id: string;
  posX: number;
  posY: number;
  facing: CharacterFacing;
  runtimeState: AgentRuntimeState;
  statusText: string;
  activeTaskId?: string;
  deskTarget?: { tileX: number; tileY: number };
  returnTarget?: { tileX: number; tileY: number };
  cooldownMinutesLeft: number;
  scheduleMode: CharacterScheduleMode;
  currentWaypointIndex: number;
  waypointProgressMinutes: number;
  lifeMinutes: number;
  forcedScheduleRecoverySteps: number;
  activityFatigue: SaveMapEntries<number>;
  preferredActivity?: string;
  preferredActivityMinutesLeft?: number;
  recentAutonomyRooms?: string[];
  recentAutonomyActivities?: string[];
  goalStreak?: number;
  needs?: {
    energy: number;
    hunger: number;
    socialNeed: number;
    noveltyNeed: number;
    stress: number;
  };
}

export interface ActiveConversationSnapshot {
  id: string;
  a: string;
  b: string;
  depth: 'smalltalk' | 'deep';
  cause: 'proximity' | 'memory' | 'schedule' | 'authority' | 'task' | 'other';
  pairKey: string;
  remainingMinutes: number;
  nextUtteranceAt: number;
  turnIndex: number;
  topicEnergyCost: number;
  nextSpeakerId?: string;
  successfulTurns?: number;
  silentFailures?: number;
}

export interface RightPanelEntrySnapshot {
  mode: 'dialogues' | 'thoughts';
  html: string;
  conversationId?: string;
  pairKey?: string;
  pairLabel?: string;
}

export interface SaveGameSnapshot {
  meta: {
    schemaVersion: number;
    savedAt: number;
    slotId: SaveSlotId;
    buildTag: string;
  };
  schedule: ScheduleSnapshot;
  characters: CharacterRuntimeSnapshot[];
  simulationMaps: {
    relationshipAffinity: SaveMapEntries<number>;
    memoryByAgent: SaveMapEntries<AgentMemoryEntry[]>;
    episodicMemoryByAgent: SaveMapEntries<EpisodicMemoryEntry[]>;
    selfNarrativesByAgent: SaveMapEntries<SelfNarrative[]>;
    activeConversations: ActiveConversationSnapshot[];
    socialCooldownUntil: SaveMapEntries<number>;
    pairCooldownUntil: SaveMapEntries<number>;
    topicEnergyByPair: SaveMapEntries<number>;
    dialogueLogCooldownUntil: SaveMapEntries<number>;
    cognitionByAgent?: SaveMapEntries<{
      thoughtText: string;
      dialogueText?: string;
      planIntent: {
        action: string;
        activity?: string;
        targetAgentId?: string;
        roomId?: string;
        reason?: string;
        urgency?: number;
      };
      confidence?: number;
      priority?: number;
      updatedAt: number;
    }>;
    agendaByAgent?: SaveMapEntries<{
      day: number;
      focus: string;
      roomId?: string;
      activity?: string;
    }>;
    degradedMode?: {
      active: boolean;
      reason: string | null;
    };
    metrics?: {
      talkIntentSuccess: number;
      talkIntentFailure: number;
      talkFailureReasons: SaveMapEntries<number>;
      cognitionFailures: number;
      classComplianceMinutes: number;
      sleepComplianceMinutes: number;
      dailyPlanRequests?: number;
      dailyPlanFailures?: number;
      dailyPlanFallbacks?: number;
      outcomeRequests?: number;
      outcomeFailures?: number;
      outcomeFallbacks?: number;
      dialogueRequests?: number;
      dialogueSuccess?: number;
      dialogueFailures?: number;
      dialogueFallbacks?: number;
      conversationStarts?: number;
      dialogueSuppressed?: number;
    };
  };
  ui?: {
    selectedCharacterId: string | null;
    rightPanelMode: 'dialogues' | 'thoughts';
    rightPanelEntries?: RightPanelEntrySnapshot[];
  };
}

export function serializeMap<T>(map: Map<string, T>): SaveMapEntries<T> {
  return Array.from(map.entries());
}

export function deserializeMap<T>(entries: SaveMapEntries<T> | undefined): Map<string, T> {
  const map = new Map<string, T>();
  if (!entries || !Array.isArray(entries)) return map;
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, value] = entry;
    if (typeof key !== 'string') continue;
    map.set(key, value);
  }
  return map;
}

