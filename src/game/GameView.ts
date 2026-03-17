import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import { World } from './World';
import { Character } from './Character';
import { Schedule } from './Schedule';
import { TimeControls } from '../ui/TimeControls';
import {
  CHARACTERS,
  CHARACTER_RELATIONSHIP_EDGES,
  getDominantSelfNarrative,
} from '../../data/characters';
import type { CharacterConfig, ScheduleWaypoint } from '../../data/characters';
import type { SelfNarrative } from '../../data/characters';
import type {
  AgentCognitionContext,
  AgentCognitionPayload,
  AgentConversationOutcomeContext,
  AgentConversationOutcomePayload,
  AgentDailyPlanContext,
  AgentDailyPlanPayload,
  AgentDialogueContext,
  AgentDialogueLine,
  AgentEmotionTone,
  AgentDailyPlanWindow,
  AgentPlanIntentAction,
  AgentMemoryEntry,
  AgentStatusSnapshot,
  AgentTask,
} from '../agent/types';
import { createProtocolEvent, TaskEventBus, type AgentProtocolEvent } from '../agent/protocol';
import type { AgentBridgeClient } from '../agent/bridge/AgentBridgeClient';
import type { OpenClawBridgeClient } from '../agent/bridge/OpenClawBridgeClient';
import { RelayProvider } from '../agent/bridge/providers/RelayProvider';
import { WebSocketProvider } from '../agent/bridge/providers/WebSocketProvider';
import { OpenClawWebSocketProvider } from '../agent/bridge/providers/OpenClawWebSocketProvider';
import { NavGrid, type TilePoint } from './nav/NavGrid';
import { ReservationManager } from './world/ReservationManager';
import { WorldSemantics } from './world/WorldSemantics';
import { NavDebugOverlay } from './debug/NavDebugOverlay';
import {
  appendEpisodicMemory,
  evaluateSelfNarratives,
  retrieveTopMemories,
  type EpisodicMemoryEntry,
  type EpisodicMemoryKind,
  type RetrievedMemory,
} from './memory/memoryEngine';
import { SaveStore } from './persistence/saveStore';
import {
  SAVE_SCHEMA_VERSION,
  deserializeMap,
  serializeMap,
  type SaveGameSnapshot,
} from './persistence/snapshotTypes';

const UI_UPDATE_INTERVAL_MS = 200;
const CAMPUS_FOCUS_ZOOM = 1.34;
const DEFAULT_CLOCK_SCALE = 1.5;
const CONVERSATION_PACING_SCALE = 1.35;
type RightPanelMode = 'dialogues' | 'thoughts' | 'openclaw';
type RightPanelEntry = {
  mode: RightPanelMode;
  html: string;
  agentId?: string;
  conversationId?: string;
  pairKey?: string;
  pairLabel?: string;
  streamId?: string;
};
type OpenClawJobStatus = 'queued' | 'walking_to_terminal' | 'waiting_for_events' | 'running' | 'done' | 'failed';
type OpenClawJob = {
  clientTaskId: string;
  prompt: string;
  agentId: string;
  status: OpenClawJobStatus;
  seatPointId?: 'hall_pc_1' | 'hall_pc_2' | 'hall_pc_3';
  seatTileX?: number;
  seatTileY?: number;
  upstreamRunId?: string;
  createdAtMinutes: number;
  publishedAtMinutes?: number;
  completedAtMinutes?: number;
  lastEventAtMinutes?: number;
  errorMessage?: string;
};
type ConversationDepth = 'smalltalk' | 'deep';
type ActiveConversation = {
  id: string;
  a: string;
  b: string;
  depth: ConversationDepth;
  cause: 'proximity' | 'memory' | 'schedule' | 'authority' | 'task' | 'other';
  pairKey: string;
  remainingMinutes: number;
  nextUtteranceAt: number;
  turnIndex: number;
  topicEnergyCost: number;
  nextSpeakerId: string;
  successfulTurns: number;
  silentFailures: number;
  failureReason?: 'target_busy' | 'path_blocked' | 'strictness_interrupt';
  recentLines?: Array<{ speakerId: string; text: string }>;
};
type DailyPlanBlock = {
  startMinute: number;
  endMinute: number;
  activity: ScheduleWaypoint['activity'];
  roomId?: string;
  focus: string;
};
type DailyPlan = {
  day: number;
  blocks: DailyPlanBlock[];
  replansLeft: number;
  source?: 'formula' | 'llm' | 'fallback';
};
type GameStartOptions = {
  saveStore?: SaveStore | null;
  initialSnapshot?: SaveGameSnapshot | null;
};
const DEFAULT_BEHAVIOR_CONFIG = {
  deterministicMovement: false,
  socialRadiusTiles: 2,
  socialCooldownMinutes: 30,
  socialChancePerTick: 0.16,
  conversationDurationMinutes: 14,
  llmTimeoutMs: 4500,
  dialogueTimeoutMs: 6500,
  dailyPlanTimeoutMs: 12000,
  cognitionTimeoutMs: 5200,
  outcomeTimeoutMs: 7000,
  dialogueRetryCount: 2,
};
const MAX_CONCURRENT_CONVERSATIONS = 2;
const SMALLTALK_BASE_COOLDOWN_MINUTES = 15;
const DEEP_BASE_COOLDOWN_MINUTES = 120;
const DIALOGUE_LOG_COOLDOWN_MINUTES = 0.8;
const VISIBLE_THOUGHT_COOLDOWN_MINUTES = 14;
const AUTOSAVE_INTERVAL_MS = 10_000;
const COGNITION_INTERVAL_MINUTES = 24;
const COGNITION_INTERVAL_JITTER_MINUTES = 12;
const AUTONOMY_VALIDATION_INTERVAL_MINUTES = 30;
const DIALOGUE_MAX_IN_FLIGHT = 1;
const DIALOGUE_REQUEST_SPACING_MINUTES = 0.35;
const DIALOGUE_BACKOFF_BASE_MINUTES = 0.6;
const DIALOGUE_BACKOFF_MAX_MINUTES = 9;
const CONVERSATION_OPENING_DELAY_SMALLTALK_MIN = 1.9 * CONVERSATION_PACING_SCALE;
const CONVERSATION_OPENING_DELAY_DEEP_MIN = 2.8 * CONVERSATION_PACING_SCALE;
const CONVERSATION_REPLY_DELAY_SMALLTALK_MIN = 2.2 * CONVERSATION_PACING_SCALE;
const CONVERSATION_REPLY_DELAY_DEEP_MIN = 3.1 * CONVERSATION_PACING_SCALE;
const MIN_SUCCESS_TURNS_SMALLTALK = 4;
const MIN_SUCCESS_TURNS_DEEP = 6;
const MAX_SILENT_FAILURES_PER_CONVERSATION = 6;
const SHIFT_ACTIVITY_MIN_CONFIDENCE = 0.72;
const SHIFT_ACTIVITY_MIN_URGENCY = 0.68;
const SHIFT_ACTIVITY_COOLDOWN_MINUTES = 90;
const SHIFT_ACTIVITY_MIN_MINUTES = 26;
const SHIFT_ACTIVITY_MAX_MINUTES = 122;
const DAILY_PLAN_CHECK_INTERVAL_MINUTES = 12;
const DAILY_PLAN_BLOCK_MIN_DURATION = 30;
const DAILY_PLAN_REPLAN_COOLDOWN_MINUTES = 210;
const DAILY_PLAN_MAX_LLM_REQUESTS_PER_CYCLE = 2;
const FORMULA_CONVERSATION_BASE = 0.18;
const FORMULA_CONVERSATION_THRESHOLD = 0.42;
const FORMULA_CONVERSATION_ROLL_SCALE = 0.35;
const DAILY_CONVERSATION_BUDGET = 7;
const DAILY_PLAN_ALLOWED_ACTIVITIES: ScheduleWaypoint['activity'][] = [
  'eat',
  'rest',
  'read',
  'library_study',
  'exercise',
  'sports_ball',
  'music',
  'watch_tv',
  'cook',
  'clean',
  'laundry',
  'decorate',
  'shower',
];
const DAILY_PLAN_ROOM_HINTS: Record<string, string[]> = {
  canteen: ['eat', 'cook', 'clean'],
  hall1: ['watch_tv', 'rest'],
  library: ['read', 'library_study'],
  gym: ['exercise', 'sports_ball'],
  dorm1: ['rest', 'music', 'decorate', 'clean'],
  dorm2: ['rest', 'music', 'decorate', 'clean'],
  teacher_dorm: ['rest', 'music', 'read', 'clean'],
  bathroom1: ['shower', 'laundry'],
  bathroom2: ['shower', 'laundry'],
};
const HALL_PC_SEATS: Array<{ id: 'hall_pc_1' | 'hall_pc_2' | 'hall_pc_3'; tileX: number; tileY: number }> = [
  { id: 'hall_pc_1', tileX: 31, tileY: 20 },
  { id: 'hall_pc_2', tileX: 33, tileY: 20 },
  { id: 'hall_pc_3', tileX: 35, tileY: 20 },
];
const OPENCLAW_WALK_TIMEOUT_MINUTES = 40;
const OPENCLAW_WAIT_EVENTS_TIMEOUT_MINUTES = 120;
const OPENCLAW_RUNNING_TIMEOUT_MINUTES = 180;

export class GameView {
  private app: Application;
  private worldContainer: Container;
  private world: World;
  private characters: Character[] = [];
  private schedule: Schedule;
  private timeControls: TimeControls;
  private eventBus = new TaskEventBus();
  private bridge: AgentBridgeClient;
  private openClawBridge: OpenClawBridgeClient;
  private navGrid?: NavGrid;
  private reservationManager = new ReservationManager();
  private worldSemantics = new WorldSemantics(this.reservationManager);
  private navDebugOverlay = new NavDebugOverlay();
  private debugEnabled = false;
  private debugTickMs = 0;
  private uiTickMs = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private characterNameMap = new Map<string, string>();
  private crowdTileCounts = new Map<string, number>();
  private activeConversations = new Map<string, ActiveConversation>();
  private socialCooldownUntil = new Map<string, number>();
  private pairCooldownUntil = new Map<string, number>();
  private topicEnergyByPair = new Map<string, number>();
  private conversationBudgetByAgent = new Map<string, { day: number; remaining: number }>();
  private dialogueLogCooldownUntil = new Map<string, number>();
  private memoryByAgent = new Map<string, AgentMemoryEntry[]>();
  private episodicMemoryByAgent = new Map<string, EpisodicMemoryEntry[]>();
  private selfNarrativesByAgent = new Map<string, SelfNarrative[]>();
  private behaviorConfig = { ...DEFAULT_BEHAVIOR_CONFIG };
  private rightPanelMode: RightPanelMode = 'dialogues';
  private rightPanelEntries: RightPanelEntry[] = [];
  private visibleThoughtCooldownUntil = new Map<string, number>();
  private lastVisibleThoughtByAgent = new Map<string, string>();
  private selectedCharacterId: string | null = null;
  private sidebarViewMode: 'list' | 'detail' | null = null;
  private sidebarRenderSignature = '';
  private relationshipAffinity = new Map<string, number>();
  private saveStore: SaveStore | null = null;
  private autosaveTickMs = 0;
  private autosaveInFlight = false;
  private sleepFastForwardActive = false;
  private sleepFastForwardPrevClockScale = DEFAULT_CLOCK_SCALE;
  private cognitionByAgent = new Map<string, AgentCognitionPayload & { updatedAt: number }>();
  private cognitionCooldownUntil = new Map<string, number>();
  private shiftActivityCooldownUntil = new Map<string, number>();
  private cognitionInFlight = new Set<string>();
  private degradedModeActive = false;
  private degradedModeReason: string | null = null;
  private degradedStatusLogged = false;
  private agendaByAgent = new Map<string, { day: number; focus: string; roomId?: string; activity?: string }>();
  private dailyPlanByAgent = new Map<string, DailyPlan>();
  private activeDailyPlanBlockKeyByAgent = new Map<string, string>();
  private nextDailyPlanCheckAt = 0;
  private dailyPlanInFlight = new Set<string>();
  private dailyPlanRequestQueue: string[] = [];
  private dailyPlanQueueFallbackByAgent = new Map<string, DailyPlan>();
  private dailyPlanReplanCooldownUntil = new Map<string, number>();
  private lastNeedsByAgent = new Map<string, { energy: number; hunger: number; socialNeed: number; noveltyNeed: number; stress: number }>();
  private llmDailyPlanEnabled = true;
  private llmConversationOutcomeEnabled = true;
  private dialogueRequestsInFlight = 0;
  private nextDialogueRequestAt = 0;
  private dialogueBackoffUntil = 0;
  private dialogueFailureStreak = 0;
  private metrics = {
    talkIntentSuccess: 0,
    talkIntentFailure: 0,
    talkFailureReasons: new Map<string, number>(),
    cognitionFailures: 0,
    classComplianceMinutes: 0,
    sleepComplianceMinutes: 0,
    dailyPlanRequests: 0,
    dailyPlanFailures: 0,
    dailyPlanFallbacks: 0,
    outcomeRequests: 0,
    outcomeFailures: 0,
    outcomeFallbacks: 0,
    dialogueRequests: 0,
    dialogueSuccess: 0,
    dialogueFailures: 0,
    dialogueFallbacks: 0,
    conversationStarts: 0,
    dialogueSuppressed: 0,
  };
  private autonomyValidationEnabled = false;
  private nextAutonomyValidationAt = 0;
  private autonomyHistoryByAgent = new Map<string, Array<{ roomId: string; activity: string }>>();
  private autonomyValidationCooldownUntil = new Map<string, number>();
  private openClawJobs: OpenClawJob[] = [];
  private lastOpenClawAgentId: string | null = null;
  private openClawStreamAccumulator = new Map<string, string>();

  constructor(app: Application) {
    this.app = app;
    this.schedule = new Schedule();
    this.schedule.setClockScale(DEFAULT_CLOCK_SCALE);
    this.worldContainer = new Container();
    this.world = new World();
    this.behaviorConfig = this.readBehaviorConfigFromQuery();
    this.autonomyValidationEnabled = new URLSearchParams(window.location.search).get('validateAutonomy') === '1';
    const query = new URLSearchParams(window.location.search);
    // Daily planning is formula-first for stability and predictable simulation pacing.
    this.llmDailyPlanEnabled = false;
    this.llmConversationOutcomeEnabled = query.get('llmConversationOutcome') !== '0';

    this.worldContainer.addChild(this.world);

    for (const config of CHARACTERS) {
      const char = new Character(config);
      this.worldContainer.addChild(char);
      this.characters.push(char);
      this.characterNameMap.set(config.id, config.name);
      this.selfNarrativesByAgent.set(
        config.id,
        config.profile.observerLayer.selfNarratives.map((entry) => ({ ...entry })),
      );
    }
    this.seedRelationshipAffinityFromEdges();

    this.app.stage.addChild(this.worldContainer);
    this.timeControls = new TimeControls(this.schedule);
    this.bridge = this.createBridgeProvider();
    this.openClawBridge = this.createOpenClawBridgeProvider();

    this.eventBus.subscribe((event) => this.handleProtocolEvent(event));
    this.bridge.subscribeEvents((event) => this.eventBus.publish(event));
    this.openClawBridge.subscribeEvents((event) => this.handleOpenClawBridgeEvent(event));

    // Hook up the new UI task input
    const taskInput = document.querySelector('.task-input') as HTMLInputElement;
    if (taskInput) {
      taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && taskInput.value.trim()) {
          this.logToActivityPanel('[System] Task pipeline is disabled in life-sim mode.');
          taskInput.value = '';
        }
      });
    }
    this.setupOpenClawComposer();
    this.setupRightPanelSwitch();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.selectedCharacterId) {
        this.selectedCharacterId = null;
        this.updateSidebars();
      }
    });
  }

  setTimeScaleForTesting(multiplier: number): void {
    this.schedule.setTimeScale(multiplier);
    this.timeControls.update();
  }

  togglePauseForTesting(): void {
    this.schedule.togglePause();
    this.timeControls.update();
  }

  isPausedForTesting(): boolean {
    return this.schedule.isPaused();
  }

  async start(options: GameStartOptions = {}) {
    this.saveStore = options.saveStore ?? null;
    await this.world.loadFromMap('/assets/map/map.json', '/assets/map/spritesheet.png', '/assets/map/map.tmx');
    const colliderKeys = new Set(this.world.getColliderTileKeys());
    this.navGrid = new NavGrid(
      this.world.tileWidth,
      this.world.tileHeight,
      colliderKeys,
    );
    this.worldSemantics.setNavGrid(this.navGrid);
    for (const character of this.characters) {
      character.setNavGrid(this.navGrid);
      character.setMovementContext(
        (point, agentId) => this.getCrowdPressure(point, agentId),
        this.behaviorConfig.deterministicMovement,
      );
      character.setWaypointResolver(
        (waypoint, agentId, currentTile) =>
          this.worldSemantics.resolveWaypointTarget(waypoint, agentId, currentTile),
        (pointKey, agentId) => this.worldSemantics.releasePoint(pointKey, agentId),
      );
    }
    await Promise.all(this.characters.map((char) => char.loadVisuals()));
    this.timeControls.mount(document.getElementById('game-container')!.parentElement!);
    this.debugEnabled = new URLSearchParams(window.location.search).get('debugNav') === '1';
    if (this.debugEnabled) {
      this.worldContainer.addChild(this.navDebugOverlay);
      this.navDebugOverlay.setBlockedTiles(this.world.getColliderTiles());
    }

    try {
      await this.bridge.connect();
      this.degradedModeActive = false;
      this.degradedModeReason = null;
    } catch {
      this.degradedModeActive = true;
      this.degradedModeReason = 'bridge_unavailable';
      this.logToActivityPanel('[System] Bridge unavailable. Running in degraded autonomous mode.');
    }
    try {
      await this.openClawBridge.connect();
    } catch {
      this.appendOpenClawEntry('System', 'OpenClaw bridge unavailable. OpenClaw tasks are paused.');
    }

    if (options.initialSnapshot) {
      this.applySnapshot(options.initialSnapshot);
    }

    this.layoutWorld();
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));

    window.addEventListener('resize', () => {
      if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        const el = document.getElementById('game-container');
        if (el) {
          this.app.renderer.resize(el.clientWidth, el.clientHeight);
        }
        this.layoutWorld();
      }, 80);
    });
  }

  private layoutWorld() {
    if (this.world.pixelWidth <= 0 || this.world.pixelHeight <= 0) return;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const containScale = Math.min(screenW / this.world.pixelWidth, screenH / this.world.pixelHeight);
    const focusScale = containScale * CAMPUS_FOCUS_ZOOM;
    const scale = Math.max(1 / 16, Math.floor(focusScale * 16) / 16);

    this.worldContainer.scale.set(scale);
    this.worldContainer.x = Math.round((screenW - this.world.pixelWidth * scale) / 2);
    this.worldContainer.y = Math.round((screenH - this.world.pixelHeight * scale) / 2);
  }

  private update(deltaMs: number) {
    const clockDeltaMs = deltaMs * this.schedule.getClockScale();
    this.schedule.update(clockDeltaMs);

    const deltaMinutes = (deltaMs / 1000) * this.schedule.getTimeScale();
    if (!this.schedule.isPaused()) {
      this.rebuildCrowdMap();
      const scheduleMode = this.getCurrentScheduleMode();
      const scheduleTotalMinutes = this.schedule.getTotalMinutes();
      for (const char of this.characters) {
        char.update(deltaMinutes, scheduleMode, scheduleTotalMinutes);
      }
      this.updateComplianceMetrics(deltaMinutes);
      this.updateDailyPlans(scheduleTotalMinutes);
      this.updateCognition(scheduleTotalMinutes);
      this.maybeStartFormulaConversation(scheduleTotalMinutes);
      this.runAutonomyValidation(scheduleTotalMinutes);
      this.updateSocialConversations(deltaMinutes);
      this.updateOpenClawSimulation(scheduleTotalMinutes);
      this.updateSleepFastForward();
    }

    this.uiTickMs += deltaMs;
    if (this.uiTickMs >= UI_UPDATE_INTERVAL_MS) {
      this.uiTickMs = 0;
      this.timeControls.update();
      this.updateSidebars();
    }

    this.updateDebugOverlay(deltaMs);
    this.autosaveTickMs += deltaMs;
    if (this.autosaveTickMs >= AUTOSAVE_INTERVAL_MS) {
      this.autosaveTickMs = 0;
      this.triggerAutosave();
    }
  }

  private triggerAutosave(): void {
    if (!this.saveStore || this.autosaveInFlight) return;
    this.autosaveInFlight = true;
    const snapshot = this.buildSnapshot();
    this.saveStore.saveAutosave(snapshot)
      .catch(() => {
        // Keep simulation running even if autosave fails.
      })
      .finally(() => {
        this.autosaveInFlight = false;
      });
  }

  private updateSleepFastForward(): void {
    const allSleeping = this.characters.length > 0 && this.characters.every((character) => {
      const waypoint = character.getCurrentWaypoint();
      return waypoint?.slotKind === 'sleep' || waypoint?.activity === 'sleep';
    });
    if (allSleeping) {
      if (!this.sleepFastForwardActive) {
        this.sleepFastForwardPrevClockScale = this.schedule.getClockScale();
      }
      this.sleepFastForwardActive = true;
      if (this.schedule.getClockScale() !== 32) {
        this.schedule.setClockScale(32);
      }
      return;
    }
    if (!this.sleepFastForwardActive) return;
    this.sleepFastForwardActive = false;
    const restoreScale = this.sleepFastForwardPrevClockScale > 0 ? this.sleepFastForwardPrevClockScale : DEFAULT_CLOCK_SCALE;
    if (this.schedule.getClockScale() !== restoreScale) {
      this.schedule.setClockScale(restoreScale);
    }
  }

  private buildSnapshot(): SaveGameSnapshot {
    return {
      meta: {
        schemaVersion: SAVE_SCHEMA_VERSION,
        savedAt: Date.now(),
        slotId: 'autosave',
        buildTag: 'life-sim-v1',
      },
      schedule: this.schedule.exportState(),
      characters: this.characters.map((character) => character.exportState()),
      simulationMaps: {
        relationshipAffinity: serializeMap(this.relationshipAffinity),
        memoryByAgent: serializeMap(this.memoryByAgent),
        episodicMemoryByAgent: serializeMap(this.episodicMemoryByAgent),
        selfNarrativesByAgent: serializeMap(this.selfNarrativesByAgent),
        activeConversations: Array.from(this.activeConversations.values()).map((entry) => ({ ...entry })),
        socialCooldownUntil: serializeMap(this.socialCooldownUntil),
        pairCooldownUntil: serializeMap(this.pairCooldownUntil),
        topicEnergyByPair: serializeMap(this.topicEnergyByPair),
        dialogueLogCooldownUntil: serializeMap(this.dialogueLogCooldownUntil),
        cognitionByAgent: serializeMap(this.cognitionByAgent),
        agendaByAgent: serializeMap(this.agendaByAgent),
        degradedMode: {
          active: this.degradedModeActive,
          reason: this.degradedModeReason,
        },
        metrics: {
          talkIntentSuccess: this.metrics.talkIntentSuccess,
          talkIntentFailure: this.metrics.talkIntentFailure,
          talkFailureReasons: serializeMap(this.metrics.talkFailureReasons),
          cognitionFailures: this.metrics.cognitionFailures,
          classComplianceMinutes: this.metrics.classComplianceMinutes,
          sleepComplianceMinutes: this.metrics.sleepComplianceMinutes,
          dailyPlanRequests: this.metrics.dailyPlanRequests,
          dailyPlanFailures: this.metrics.dailyPlanFailures,
          dailyPlanFallbacks: this.metrics.dailyPlanFallbacks,
          outcomeRequests: this.metrics.outcomeRequests,
          outcomeFailures: this.metrics.outcomeFailures,
          outcomeFallbacks: this.metrics.outcomeFallbacks,
        },
      },
      ui: {
        selectedCharacterId: this.selectedCharacterId,
        rightPanelMode: this.rightPanelMode,
        rightPanelEntries: this.rightPanelEntries.map((entry) => ({ ...entry })),
      },
    };
  }

  private applySnapshot(snapshot: SaveGameSnapshot): void {
    this.schedule.importState(snapshot.schedule);

    for (const charState of snapshot.characters) {
      this.getCharacterById(charState.id)?.importState(charState);
    }

    this.relationshipAffinity = deserializeMap(snapshot.simulationMaps.relationshipAffinity);
    this.memoryByAgent = deserializeMap(snapshot.simulationMaps.memoryByAgent);
    this.episodicMemoryByAgent = deserializeMap(snapshot.simulationMaps.episodicMemoryByAgent);
    this.selfNarrativesByAgent = deserializeMap(snapshot.simulationMaps.selfNarrativesByAgent);
    this.socialCooldownUntil = deserializeMap(snapshot.simulationMaps.socialCooldownUntil);
    this.pairCooldownUntil = deserializeMap(snapshot.simulationMaps.pairCooldownUntil);
    this.topicEnergyByPair = deserializeMap(snapshot.simulationMaps.topicEnergyByPair);
    this.dialogueLogCooldownUntil = deserializeMap(snapshot.simulationMaps.dialogueLogCooldownUntil);
    this.agendaByAgent = deserializeMap(snapshot.simulationMaps.agendaByAgent);
    this.degradedModeActive = Boolean(snapshot.simulationMaps.degradedMode?.active);
    this.degradedModeReason = snapshot.simulationMaps.degradedMode?.reason ?? null;
    const loadedMetrics = snapshot.simulationMaps.metrics;
    if (loadedMetrics) {
      this.metrics = {
        talkIntentSuccess: Number(loadedMetrics.talkIntentSuccess) || 0,
        talkIntentFailure: Number(loadedMetrics.talkIntentFailure) || 0,
        talkFailureReasons: deserializeMap(loadedMetrics.talkFailureReasons),
        cognitionFailures: Number(loadedMetrics.cognitionFailures) || 0,
        classComplianceMinutes: Number(loadedMetrics.classComplianceMinutes) || 0,
        sleepComplianceMinutes: Number(loadedMetrics.sleepComplianceMinutes) || 0,
        dailyPlanRequests: Number(loadedMetrics.dailyPlanRequests) || 0,
        dailyPlanFailures: Number(loadedMetrics.dailyPlanFailures) || 0,
        dailyPlanFallbacks: Number(loadedMetrics.dailyPlanFallbacks) || 0,
        outcomeRequests: Number(loadedMetrics.outcomeRequests) || 0,
        outcomeFailures: Number(loadedMetrics.outcomeFailures) || 0,
        outcomeFallbacks: Number(loadedMetrics.outcomeFallbacks) || 0,
        dialogueRequests: 0,
        dialogueSuccess: 0,
        dialogueFailures: 0,
        dialogueFallbacks: 0,
        conversationStarts: 0,
        dialogueSuppressed: 0,
      };
    }
    this.cognitionByAgent = this.normalizeLoadedCognitionMap(
      deserializeMap(snapshot.simulationMaps.cognitionByAgent),
    );

    this.activeConversations = new Map();
    for (const conversation of snapshot.simulationMaps.activeConversations ?? []) {
      this.activeConversations.set(conversation.id, {
        ...conversation,
        nextSpeakerId: conversation.nextSpeakerId ?? conversation.a,
        successfulTurns: Number(conversation.successfulTurns) || 0,
        silentFailures: Number(conversation.silentFailures) || 0,
      });
    }

    this.cognitionInFlight.clear();
    this.cognitionCooldownUntil.clear();
    this.shiftActivityCooldownUntil.clear();
    this.dailyPlanInFlight.clear();
    this.dailyPlanRequestQueue = [];
    this.dailyPlanQueueFallbackByAgent.clear();
    this.dialogueRequestsInFlight = 0;
    this.nextDialogueRequestAt = 0;
    this.dialogueBackoffUntil = 0;
    this.dialogueFailureStreak = 0;

    this.selectedCharacterId = snapshot.ui?.selectedCharacterId ?? null;
    this.rightPanelMode =
      snapshot.ui?.rightPanelMode === 'thoughts'
        ? 'thoughts'
        : snapshot.ui?.rightPanelMode === 'openclaw'
          ? 'openclaw'
          : 'dialogues';
    this.rightPanelEntries = (snapshot.ui?.rightPanelEntries ?? []).map((entry) => ({
      mode:
        entry.mode === 'thoughts'
          ? 'thoughts'
          : entry.mode === 'openclaw'
            ? 'openclaw'
            : 'dialogues',
      html: entry.html,
      agentId: typeof entry.agentId === 'string' ? entry.agentId : undefined,
      conversationId: typeof entry.conversationId === 'string' ? entry.conversationId : undefined,
      pairKey: typeof entry.pairKey === 'string' ? entry.pairKey : undefined,
      pairLabel: typeof entry.pairLabel === 'string' ? entry.pairLabel : undefined,
      streamId: typeof entry.streamId === 'string' ? entry.streamId : undefined,
    }));
    this.visibleThoughtCooldownUntil.clear();
    this.lastVisibleThoughtByAgent.clear();
    this.sidebarRenderSignature = '';
    this.updateSidebars();
    this.syncRightPanelTabActiveState();
    this.renderRightPanelEntries();
    this.timeControls.update();
  }

  private syncRightPanelTabActiveState(): void {
    const tabs = Array.from(document.querySelectorAll('.sidebar.right .stream-tab')) as HTMLButtonElement[];
    const targetStream =
      this.rightPanelMode === 'thoughts' ? 'thoughts' : this.rightPanelMode === 'openclaw' ? 'openclaw' : 'dialogues';
    for (const tab of tabs) {
      tab.classList.toggle('active', tab.dataset.stream === targetStream);
    }
    this.updateOpenClawComposerVisibility();
  }

  private setupOpenClawComposer(): void {
    const input = document.querySelector('.openclaw-task-input') as HTMLInputElement | null;
    const submit = document.querySelector('.openclaw-submit') as HTMLButtonElement | null;
    if (!input || !submit) return;

    const submitPrompt = () => {
      const prompt = input.value.trim();
      if (!prompt) return;
      this.submitOpenClawPrompt(prompt);
      input.value = '';
    };
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      submitPrompt();
    });
    submit.addEventListener('click', submitPrompt);
    this.updateOpenClawComposerVisibility();
  }

  private updateOpenClawComposerVisibility(): void {
    const composer = document.querySelector('.openclaw-input-wrapper') as HTMLElement | null;
    if (!composer) return;
    composer.style.display = this.rightPanelMode === 'openclaw' ? 'block' : 'none';
  }

  private submitOpenClawPrompt(prompt: string): void {
    const agent = this.pickOpenClawAgent();
    if (!agent) {
      this.appendOpenClawEntry('System', 'No available NPC for OpenClaw run right now.');
      return;
    }
    const now = this.schedule.getTotalMinutes();
    const job: OpenClawJob = {
      clientTaskId: `openclaw_${Date.now()}_${this.openClawJobs.length}`,
      prompt,
      agentId: agent.id,
      status: 'queued',
      createdAtMinutes: now,
    };
    this.openClawJobs.push(job);
    this.lastOpenClawAgentId = agent.id;
    const taskLabel = `${agent.name} • ${job.clientTaskId.slice(-6)}`;
    this.appendOpenClawEntry('User', prompt, job.clientTaskId, taskLabel);
    this.appendOpenClawEntry('System', `Queued ${agent.name} for OpenClaw task.`, job.clientTaskId, taskLabel);
    this.tryStartNextOpenClawJob();
  }

  private tryStartNextOpenClawJob(): void {
    const activeJob = this.openClawJobs.find((job) =>
      job.status === 'walking_to_terminal'
      || job.status === 'waiting_for_events'
      || job.status === 'running');
    if (activeJob) return;
    const nextQueued = this.openClawJobs.find((job) => job.status === 'queued');
    if (!nextQueued) return;
    const agent = this.getCharacterById(nextQueued.agentId);
    if (!agent) {
      nextQueued.status = 'failed';
      nextQueued.errorMessage = 'Assigned NPC missing';
      nextQueued.completedAtMinutes = this.schedule.getTotalMinutes();
      this.appendOpenClawEntry('System', `Failed to start ${nextQueued.clientTaskId}: assigned NPC missing.`);
      return;
    }
    const seat = this.pickHallPcSeatForAgent(agent);
    nextQueued.status = 'walking_to_terminal';
    nextQueued.seatPointId = seat.id;
    nextQueued.seatTileX = seat.tileX;
    nextQueued.seatTileY = seat.tileY;
    agent.assignTask(nextQueued.clientTaskId, seat.tileX, seat.tileY);
    agent.setStatusText(`Heading to ${seat.id}`);
    this.appendOpenClawEntry(agent.name, `Heading to hall_computer_corner (${seat.id}).`, nextQueued.clientTaskId, this.getOpenClawTaskLabel(nextQueued));
  }

  private pickOpenClawAgent(): Character | null {
    if (this.characters.length === 0) return null;
    const idle = this.characters.filter((character) => character.getRuntimeState() === 'idle_life');
    if (idle.length === 0) return null;
    if (this.lastOpenClawAgentId) {
      const alternate = idle.find((character) => character.id !== this.lastOpenClawAgentId);
      if (alternate) return alternate;
    }
    return idle[0] ?? null;
  }

  private pickHallPcSeatForAgent(agent: Character): { id: 'hall_pc_1' | 'hall_pc_2' | 'hall_pc_3'; tileX: number; tileY: number } {
    const tile = agent.getCurrentTile();
    let best = HALL_PC_SEATS[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const seat of HALL_PC_SEATS) {
      const distance = Math.abs(tile.x - seat.tileX) + Math.abs(tile.y - seat.tileY);
      if (distance < bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }

  private updateOpenClawSimulation(nowMinutes: number): void {
    const job = this.openClawJobs.find((entry) =>
      entry.status === 'walking_to_terminal'
      || entry.status === 'waiting_for_events'
      || entry.status === 'running');
    if (!job) {
      this.tryStartNextOpenClawJob();
      return;
    }
    const agent = this.getCharacterById(job.agentId);
    if (!agent) {
      job.status = 'failed';
      this.appendOpenClawEntry('System', `OpenClaw job failed: NPC ${job.agentId} not found.`, job.clientTaskId, this.getOpenClawTaskLabel(job));
      this.tryStartNextOpenClawJob();
      return;
    }

    if (job.status === 'walking_to_terminal') {
      const seatId = job.seatPointId;
      if (!seatId) {
        job.status = 'failed';
        this.appendOpenClawEntry(agent.name, 'Aborted: OpenClaw seat assignment missing.', job.clientTaskId, this.getOpenClawTaskLabel(job));
        this.tryStartNextOpenClawJob();
        return;
      }
      if ((nowMinutes - job.createdAtMinutes) > OPENCLAW_WALK_TIMEOUT_MINUTES) {
        job.status = 'failed';
        job.errorMessage = 'NPC walk timeout';
        job.completedAtMinutes = nowMinutes;
        this.appendOpenClawEntry(agent.name, `OpenClaw walk timeout for ${job.clientTaskId}.`, job.clientTaskId, this.getOpenClawTaskLabel(job));
        agent.resumeNormalLifeWithRest(18, 'hall1');
        this.tryStartNextOpenClawJob();
        return;
      }
      if (agent.getRuntimeState() !== 'working') return;
      job.status = 'waiting_for_events';
      job.publishedAtMinutes = nowMinutes;
      job.lastEventAtMinutes = nowMinutes;
      agent.setFacingDirection('up');
      agent.setStatusText(`Using ${job.seatPointId ?? 'hall_pc'} for OpenClaw`);
      this.appendOpenClawEntry(agent.name, `Arrived at ${job.seatPointId ?? 'hall_pc'}. Starting OpenClaw run.`, job.clientTaskId, this.getOpenClawTaskLabel(job));
      this.publishOpenClawTask(job, agent, nowMinutes);
      return;
    }

    if (job.status === 'waiting_for_events') {
      const lastTouch = job.lastEventAtMinutes ?? job.publishedAtMinutes ?? nowMinutes;
      if ((nowMinutes - lastTouch) > OPENCLAW_WAIT_EVENTS_TIMEOUT_MINUTES) {
        job.status = 'failed';
        job.errorMessage = 'No OpenClaw events received after publish';
        job.completedAtMinutes = nowMinutes;
        this.appendOpenClawEntry('System', `OpenClaw task ${job.clientTaskId} timed out waiting for events.`, job.clientTaskId, this.getOpenClawTaskLabel(job));
        agent.resumeNormalLifeWithRest(18, 'hall1');
        this.tryStartNextOpenClawJob();
      }
      return;
    }

    if (job.status === 'running') {
      const lastTouch = job.lastEventAtMinutes ?? job.publishedAtMinutes ?? nowMinutes;
      if ((nowMinutes - lastTouch) > OPENCLAW_RUNNING_TIMEOUT_MINUTES) {
        job.status = 'failed';
        job.errorMessage = 'OpenClaw execution timeout';
        job.completedAtMinutes = nowMinutes;
        this.appendOpenClawEntry('System', `OpenClaw task ${job.clientTaskId} timed out during execution.`, job.clientTaskId, this.getOpenClawTaskLabel(job));
        agent.resumeNormalLifeWithRest(18, 'hall1');
        this.tryStartNextOpenClawJob();
      }
      return;
    }
  }

  private appendOpenClawEntry(actor: string, message: string, taskId?: string, taskLabel?: string): void {
    const actorLabel = this.escapeHtml(actor);
    const text = this.escapeHtml(message);
    this.appendRightPanelEntry(
      'openclaw',
      `<span class="agent">${actorLabel}</span>: ${text}`,
      taskId ? { conversationId: taskId, pairLabel: taskLabel ?? taskId } : undefined,
    );
  }

  private appendOpenClawMarkdownEntry(actor: string, markdown: string, taskId?: string, taskLabel?: string): void {
    const actorLabel = this.escapeHtml(actor);
    const rendered = this.renderMarkdownToHtml(markdown);
    this.appendRightPanelEntry(
      'openclaw',
      `<span class="agent">${actorLabel}</span>:<div class="openclaw-md">${rendered}</div>`,
      taskId ? { conversationId: taskId, pairLabel: taskLabel ?? taskId } : undefined,
    );
  }

  private updateOrCreateStreamEntry(taskId: string, taskLabel: string, actor: string, accumulated: string): void {
    const streamId = `stream:${taskId}`;
    const existing = this.rightPanelEntries.find((e) => e.streamId === streamId);
    const actorLabel = this.escapeHtml(actor);
    const rendered = this.renderMarkdownToHtml(accumulated);
    const html = `<span class="agent">${actorLabel}</span>:<div class="openclaw-md">${rendered}</div>`;

    if (existing) {
      existing.html = html;
    } else {
      this.rightPanelEntries.push({
        mode: 'openclaw',
        html,
        conversationId: taskId,
        pairLabel: taskLabel,
        streamId,
      });
    }

    if (this.rightPanelMode !== 'openclaw') return;

    const domEl = document.querySelector(`[data-stream-id="${streamId}"]`);
    if (domEl) {
      domEl.innerHTML = html;
      const logContainer = document.querySelector('.sidebar.right .panel-content');
      if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    } else {
      this.renderRightPanelEntries();
    }
  }

  private getOpenClawTaskLabel(job: OpenClawJob): string {
    const agentName = this.characterNameMap.get(job.agentId) ?? job.agentId;
    return `${agentName} • ${job.clientTaskId.slice(-6)}`;
  }

  private renderMarkdownToHtml(md: string): string {
    const lines = md.split('\n');
    const parts: string[] = [];
    let inCode = false;
    const codeBuf: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const closeList = () => {
      if (listType) { parts.push(listType === 'ul' ? '</ul>' : '</ol>'); listType = null; }
    };

    for (const line of lines) {
      if (line.trimStart().startsWith('```')) {
        if (inCode) {
          parts.push(`<pre><code>${this.escapeHtml(codeBuf.join('\n'))}</code></pre>`);
          codeBuf.length = 0;
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (hMatch) {
        closeList();
        const level = hMatch[1].length + 2;
        parts.push(`<h${level}>${this.renderInlineMd(hMatch[2])}</h${level}>`);
        continue;
      }

      const ulMatch = line.match(/^\s*[*-]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') { closeList(); parts.push('<ul>'); listType = 'ul'; }
        parts.push(`<li>${this.renderInlineMd(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') { closeList(); parts.push('<ol>'); listType = 'ol'; }
        parts.push(`<li>${this.renderInlineMd(olMatch[1])}</li>`);
        continue;
      }

      if (!line.trim()) { closeList(); continue; }

      closeList();
      parts.push(`<p>${this.renderInlineMd(line)}</p>`);
    }

    if (inCode) parts.push(`<pre><code>${this.escapeHtml(codeBuf.join('\n'))}</code></pre>`);
    closeList();
    return parts.join('');
  }

  private renderInlineMd(text: string): string {
    let s = this.escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  private publishOpenClawTask(job: OpenClawJob, agent: Character, nowMinutes: number): void {
    const task: AgentTask = {
      id: job.clientTaskId,
      title: job.prompt.slice(0, 48) || 'OpenClaw task',
      prompt: job.prompt,
      status: 'created',
      createdAt: Date.now(),
      assignedAgentId: agent.id,
    };
    void this.openClawBridge.publishTask(task)
      .then(() => {
        job.lastEventAtMinutes = nowMinutes;
        this.appendOpenClawEntry(
          'System',
          `Published task ${job.clientTaskId} for ${this.characterNameMap.get(agent.id) ?? agent.id}.`,
          job.clientTaskId,
          this.getOpenClawTaskLabel(job),
        );
      })
      .catch((error) => {
        if (job.status === 'done' || job.status === 'failed') return;
        job.status = 'failed';
        job.errorMessage = error instanceof Error ? error.message : 'OpenClaw publish failed';
        job.completedAtMinutes = this.schedule.getTotalMinutes();
        this.appendOpenClawEntry('System', `Publish failed for ${job.clientTaskId}: ${job.errorMessage}`, job.clientTaskId, this.getOpenClawTaskLabel(job));
        agent.resumeNormalLifeWithRest(18, 'hall1');
        this.tryStartNextOpenClawJob();
      });
  }

  private getCurrentScheduleMode(): 'weekday' | 'weekend' {
    const gameTime = this.schedule.getGameTime();
    return gameTime.weekdayIndex >= 5 ? 'weekend' : 'weekday';
  }

  private updateDailyPlans(scheduleTotalMinutes: number): void {
    if (scheduleTotalMinutes < this.nextDailyPlanCheckAt) return;
    this.nextDailyPlanCheckAt = scheduleTotalMinutes + DAILY_PLAN_CHECK_INTERVAL_MINUTES;
    const gameTime = this.schedule.getGameTime();
    for (const character of this.characters) {
      const agentId = character.id;
      const strictness = this.getCurrentSlotStrictness(character);
      let plan = this.dailyPlanByAgent.get(agentId);
      if (!plan || plan.day !== gameTime.day) {
        const fallbackPlan = this.buildDailyPlanForCharacter(character, gameTime.day, gameTime.weekdayIndex);
        this.dailyPlanByAgent.set(agentId, fallbackPlan);
        this.metrics.dailyPlanFallbacks += 1;
        if (this.llmDailyPlanEnabled) {
          this.enqueueDailyPlanRequest(character, fallbackPlan);
        }
        this.activeDailyPlanBlockKeyByAgent.delete(agentId);
        this.lastNeedsByAgent.set(agentId, character.getNeedSnapshot());
        plan = this.dailyPlanByAgent.get(agentId);
      } else if (
        this.shouldTriggerDailyReplan(character, plan, scheduleTotalMinutes)
      ) {
        plan.replansLeft = Math.max(0, plan.replansLeft - 1);
        this.dailyPlanReplanCooldownUntil.set(agentId, scheduleTotalMinutes + DAILY_PLAN_REPLAN_COOLDOWN_MINUTES);
        if (this.llmDailyPlanEnabled) {
          this.enqueueDailyPlanRequest(character, plan);
        } else {
          const formulaPlan = this.buildDailyPlanForCharacter(character, gameTime.day, gameTime.weekdayIndex);
          formulaPlan.replansLeft = plan.replansLeft;
          this.dailyPlanByAgent.set(agentId, formulaPlan);
          this.metrics.dailyPlanFallbacks += 1;
          this.activeDailyPlanBlockKeyByAgent.delete(agentId);
          plan = formulaPlan;
        }
      }
      if (!plan) continue;
      const activeBlock = plan.blocks.find((block) =>
        scheduleTotalMinutes >= block.startMinute && scheduleTotalMinutes < block.endMinute);
      if (!activeBlock) {
        this.activeDailyPlanBlockKeyByAgent.delete(agentId);
        continue;
      }
      this.agendaByAgent.set(agentId, {
        day: gameTime.day,
        focus: activeBlock.focus,
        activity: activeBlock.activity,
        roomId: activeBlock.roomId,
      });
      // Keep current social interaction stable; avoid plan slot switching mid-conversation.
      if (this.isInConversation(agentId)) continue;
      if (strictness >= 0.72) continue;
      const blockKey = `${gameTime.day}:${activeBlock.startMinute}:${activeBlock.activity}:${activeBlock.roomId ?? ''}`;
      if (this.activeDailyPlanBlockKeyByAgent.get(agentId) === blockKey) continue;
      const duration = Math.max(DAILY_PLAN_BLOCK_MIN_DURATION, activeBlock.endMinute - scheduleTotalMinutes);
      character.setAutonomyDirective(activeBlock.activity, activeBlock.roomId, duration);
      this.activeDailyPlanBlockKeyByAgent.set(agentId, blockKey);
      this.lastNeedsByAgent.set(agentId, character.getNeedSnapshot());
    }
    if (this.llmDailyPlanEnabled) {
      this.flushDailyPlanRequestQueue();
    }
  }

  private enqueueDailyPlanRequest(character: Character, fallbackPlan: DailyPlan): void {
    const agentId = character.id;
    if (this.dailyPlanInFlight.has(agentId)) return;
    if (this.dailyPlanRequestQueue.includes(agentId)) return;
    this.dailyPlanQueueFallbackByAgent.set(agentId, fallbackPlan);
    this.dailyPlanRequestQueue.push(agentId);
  }

  private flushDailyPlanRequestQueue(): void {
    let started = 0;
    while (started < DAILY_PLAN_MAX_LLM_REQUESTS_PER_CYCLE && this.dailyPlanRequestQueue.length > 0) {
      const agentId = this.dailyPlanRequestQueue.shift();
      if (!agentId) break;
      const character = this.getCharacterById(agentId);
      const fallbackPlan = this.dailyPlanQueueFallbackByAgent.get(agentId) ?? this.dailyPlanByAgent.get(agentId);
      this.dailyPlanQueueFallbackByAgent.delete(agentId);
      if (!character || !fallbackPlan) continue;
      this.requestDailyPlanForAgent(character, fallbackPlan);
      started += 1;
    }
  }

  private buildDailyPlanForCharacter(character: Character, day: number, weekdayIndex: number): DailyPlan {
    const windows = this.getDailyPlanWindows(weekdayIndex);
    const config = this.getCharacterConfig(character.id);
    const homeRoomId = this.getHomeRoomId(character.id);
    const baseNeeds = character.getNeedSnapshot();
    const simulatedNeeds = { ...baseNeeds };
    const usedActivities = new Set<ScheduleWaypoint['activity']>();
    const blocks: DailyPlanBlock[] = [];
    for (let i = 0; i < windows.length; i += 1) {
      const window = windows[i];
      const candidates: Array<{ activity: ScheduleWaypoint['activity']; roomId?: string; focus: string; score: number }> = DAILY_PLAN_ALLOWED_ACTIVITIES.map((activity) => {
        const roomId = this.getPlanRoomForActivity(activity, homeRoomId);
        let score = this.getPlanActivityScore(activity, simulatedNeeds, config, character.id, day);
        const roomLoad = this.getPlannedRoomLoad(day, window.start, roomId);
        score -= roomLoad * 0.22;
        if (usedActivities.has(activity)) score -= 0.18;
        if (i === 0 && activity === 'watch_tv') score -= 0.2;
        if (i === windows.length - 1 && activity === 'exercise') score -= 0.14;
        return {
          activity,
          roomId,
          focus: this.getPlanFocus(activity),
          score,
        };
      });
      candidates.sort((a, b) => b.score - a.score);
      const picked = candidates[0];
      usedActivities.add(picked.activity);
      blocks.push({
        startMinute: window.start,
        endMinute: window.end,
        activity: picked.activity,
        roomId: picked.roomId,
        focus: picked.focus,
      });
      this.applyPlanningNeedDelta(simulatedNeeds, picked.activity, Math.max(30, window.end - window.start));
    }
    return {
      day,
      blocks,
      replansLeft: 3,
      source: 'formula',
    };
  }

  private requestDailyPlanForAgent(character: Character, fallbackPlan: DailyPlan): void {
    if (!this.llmDailyPlanEnabled) return;
    const agentId = character.id;
    if (this.dailyPlanInFlight.has(agentId)) return;
    if (typeof this.bridge.requestDailyPlan !== 'function') return;
    const context = this.buildDailyPlanContext(character);
    this.dailyPlanInFlight.add(agentId);
    this.metrics.dailyPlanRequests += 1;
    this.bridge.requestDailyPlan(context)
      .then((planPayload) => {
        if (!planPayload) {
          this.metrics.dailyPlanFailures += 1;
          this.metrics.dailyPlanFallbacks += 1;
      return;
        }
        const normalized = this.normalizeDailyPlanPayload(planPayload, fallbackPlan);
        if (!normalized) {
          this.metrics.dailyPlanFailures += 1;
          this.metrics.dailyPlanFallbacks += 1;
          return;
        }
        this.dailyPlanByAgent.set(agentId, normalized);
        this.activeDailyPlanBlockKeyByAgent.delete(agentId);
      })
      .catch(() => {
        this.metrics.dailyPlanFailures += 1;
        this.metrics.dailyPlanFallbacks += 1;
      })
      .finally(() => {
        this.dailyPlanInFlight.delete(agentId);
      });
  }

  private buildDailyPlanContext(character: Character): AgentDailyPlanContext {
    const gameTime = this.schedule.getGameTime();
    const homeRoomId = this.getHomeRoomId(character.id);
    const windows = this.getDailyPlanWindows(gameTime.weekdayIndex).map((window): AgentDailyPlanWindow => ({
      startMinute: window.start,
      endMinute: window.end,
    }));
    const recentMemories = retrieveTopMemories(
      this.episodicMemoryByAgent.get(character.id) ?? [],
      Date.now(),
      4,
      { currentRoomId: character.getCurrentWaypoint()?.roomId },
    );
    return {
      agentId: character.id,
      gameTime: {
        day: gameTime.day,
        weekdayIndex: gameTime.weekdayIndex,
        weekdayName: gameTime.weekdayName,
      },
      runtime: {
        currentActivity: character.getCurrentActivity(),
        currentRoomId: character.getCurrentWaypoint()?.roomId,
        needs: character.getNeedSnapshot(),
      },
      homeRoomId,
      windows,
      allowedActivities: DAILY_PLAN_ALLOWED_ACTIVITIES,
      roomHints: DAILY_PLAN_ROOM_HINTS,
      relationships: this.characters
        .filter((other) => other.id !== character.id)
        .map((other) => ({ otherId: other.id, affinity: this.getRelationshipAffinity(character.id, other.id) }))
        .sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity))
        .slice(0, 6),
      narratives: this.getRuntimeNarratives(
        character.id,
        this.getCharacterConfig(character.id)?.profile.observerLayer.selfNarratives,
      ).map((entry) => ({
        id: entry.id,
        text: entry.text,
        confidence: entry.confidence,
        dominance: entry.dominance,
      })),
      retrievedMemories: recentMemories,
    };
  }

  private normalizeDailyPlanPayload(payload: AgentDailyPlanPayload, fallback: DailyPlan): DailyPlan | null {
    if (!Array.isArray(payload.blocks) || payload.blocks.length === 0) return null;
    const blocks = payload.blocks
      .map((block) => ({
        startMinute: Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(block.startMinute)))),
        endMinute: Math.max(1, Math.min(24 * 60, Math.floor(Number(block.endMinute)))),
        activity: block.activity as ScheduleWaypoint['activity'],
        roomId: typeof block.roomId === 'string' && block.roomId.trim() ? block.roomId.trim() : undefined,
        focus: typeof block.focus === 'string' && block.focus.trim() ? block.focus.trim() : 'routine',
      }))
      .filter((block) =>
        DAILY_PLAN_ALLOWED_ACTIVITIES.includes(block.activity)
        && Number.isFinite(block.startMinute)
        && Number.isFinite(block.endMinute)
        && block.endMinute > block.startMinute)
      .sort((a, b) => a.startMinute - b.startMinute);
    if (blocks.length === 0) return null;
    for (let i = 1; i < blocks.length; i += 1) {
      if (blocks[i].startMinute < blocks[i - 1].endMinute) return null;
    }
    return {
      day: Number.isFinite(payload.day) ? Math.floor(payload.day) : fallback.day,
      blocks,
      replansLeft: fallback.replansLeft,
      source: 'llm',
    };
  }

  private shouldTriggerDailyReplan(character: Character, plan: DailyPlan, scheduleTotalMinutes: number): boolean {
    if (plan.replansLeft <= 0) return false;
    if (this.dailyPlanInFlight.has(character.id)) return false;
    const cooldownUntil = this.dailyPlanReplanCooldownUntil.get(character.id) ?? 0;
    if (scheduleTotalMinutes < cooldownUntil) return false;
    const needs = character.getNeedSnapshot();
    const previous = this.lastNeedsByAgent.get(character.id);
    if (!previous) return false;
    const spike =
      needs.hunger - previous.hunger >= 0.3
      || needs.stress - previous.stress >= 0.3
      || previous.energy - needs.energy >= 0.34;
    const critical = needs.hunger >= 0.9 || needs.stress >= 0.88 || needs.energy <= 0.14;
    return spike || critical;
  }

  private getDailyPlanWindows(weekdayIndex: number): Array<{ start: number; end: number }> {
    return weekdayIndex >= 5
      ? [
        { start: 8 * 60, end: 11 * 60 + 30 },
        { start: 11 * 60 + 30, end: 15 * 60 },
        { start: 15 * 60, end: 18 * 60 + 30 },
        { start: 18 * 60 + 30, end: 22 * 60 },
      ]
      : [
        { start: 7 * 60 + 30, end: 10 * 60 + 30 },
        { start: 10 * 60 + 30, end: 13 * 60 + 30 },
        { start: 16 * 60 + 30, end: 19 * 60 + 30 },
        { start: 19 * 60 + 30, end: 22 * 60 + 30 },
      ];
  }

  private getHomeRoomId(agentId: string): string {
    const config = this.getCharacterConfig(agentId);
    if (!config) return 'dorm1';
    const candidates = [
      ...(config.weekdaySchedule ?? []),
      ...(config.weekendSchedule ?? []),
      ...config.schedule,
    ];
    const sleepSlot = candidates.find((slot) => slot.activity === 'sleep' || slot.slotKind === 'sleep');
    return sleepSlot?.roomId ?? 'dorm1';
  }

  private getPlannedRoomLoad(day: number, startMinute: number, roomId?: string): number {
    if (!roomId) return 0;
    let count = 0;
    for (const plan of this.dailyPlanByAgent.values()) {
      if (plan.day !== day) continue;
      const matched = plan.blocks.find((block) => block.startMinute === startMinute && block.roomId === roomId);
      if (matched) count += 1;
    }
    return count;
  }

  private getPlanRoomForActivity(activity: ScheduleWaypoint['activity'], homeRoomId: string): string | undefined {
    if (activity === 'eat' || activity === 'cook') return 'canteen';
    if (activity === 'watch_tv') return 'hall1';
    if (activity === 'read' || activity === 'library_study') return 'library';
    if (activity === 'exercise' || activity === 'sports_ball') return 'gym';
    if (activity === 'shower' || activity === 'laundry') return homeRoomId === 'dorm2' ? 'bathroom2' : 'bathroom1';
    if (activity === 'clean' || activity === 'decorate' || activity === 'music' || activity === 'rest') return homeRoomId;
    return homeRoomId;
  }

  private getPlanFocus(activity: ScheduleWaypoint['activity']): string {
    if (activity === 'eat' || activity === 'cook') return 'refuel';
    if (activity === 'watch_tv') return 'connect';
    if (activity === 'read' || activity === 'library_study') return 'learn';
    if (activity === 'exercise' || activity === 'sports_ball') return 'reset';
    if (activity === 'rest' || activity === 'shower') return 'recover';
    return 'explore';
  }

  private getPlanActivityScore(
    activity: ScheduleWaypoint['activity'],
    needs: { energy: number; hunger: number; socialNeed: number; noveltyNeed: number; stress: number },
    config: CharacterConfig | undefined,
    agentId: string,
    day: number,
  ): number {
    const traits = config?.profile.simulationLayer.traits;
    const sociability = (traits?.sociability ?? 50) / 100;
    const openness = (traits?.openness ?? 50) / 100;
    const impulseControl = (traits?.impulseControl ?? 50) / 100;
    const sensitivity = (traits?.sensitivity ?? 50) / 100;
    const hobbyWeight = (config?.hobbies ?? [])
      .find((entry) => entry.activity === activity)?.weight ?? 0;
    let score = 0.04 + this.planNoise(agentId, `${day}:${activity}`);
    if (activity === 'eat' || activity === 'cook') score += needs.hunger * 1.22 + (1 - impulseControl) * 0.08;
    if (activity === 'watch_tv') score += needs.socialNeed * 1.08 + sociability * 0.18;
    if (activity === 'rest' || activity === 'shower') score += (1 - needs.energy) * 1.22 + needs.stress * 0.32;
    if (activity === 'read' || activity === 'library_study') score += needs.noveltyNeed * 0.92 + openness * 0.22;
    if (activity === 'exercise' || activity === 'sports_ball') score += needs.stress * 0.72 + openness * 0.18 + (1 - sensitivity) * 0.08;
    if (activity === 'music' || activity === 'decorate') score += needs.noveltyNeed * 0.62 + openness * 0.18;
    if (activity === 'clean' || activity === 'laundry') score += impulseControl * 0.22 + needs.stress * 0.08;
    score += Math.max(0, Math.min(1, hobbyWeight)) * 0.35;
    return score;
  }

  private applyPlanningNeedDelta(
    needs: { energy: number; hunger: number; socialNeed: number; noveltyNeed: number; stress: number },
    activity: ScheduleWaypoint['activity'],
    durationMinutes: number,
  ): void {
    const scale = Math.max(0.2, durationMinutes / 90);
    const clamp = (value: number): number => Math.max(0, Math.min(1, value));
    needs.hunger = clamp(needs.hunger + 0.1 * scale);
    needs.socialNeed = clamp(needs.socialNeed + 0.08 * scale);
    needs.noveltyNeed = clamp(needs.noveltyNeed + 0.06 * scale);
    if (activity === 'eat' || activity === 'cook') needs.hunger = clamp(needs.hunger - 0.55 * scale);
    if (activity === 'watch_tv') needs.socialNeed = clamp(needs.socialNeed - 0.48 * scale);
    if (activity === 'rest' || activity === 'shower') needs.energy = clamp(needs.energy + 0.38 * scale);
    else needs.energy = clamp(needs.energy - 0.09 * scale);
    if (activity === 'exercise' || activity === 'sports_ball') needs.stress = clamp(needs.stress - 0.26 * scale);
    else needs.stress = clamp(needs.stress + 0.05 * scale);
  }

  private planNoise(agentId: string, salt: string): number {
    const seed = `${agentId}:${salt}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (((hash >>> 0) % 1000) / 1000) * 0.16;
  }

  private handleProtocolEvent(event: AgentProtocolEvent): void {
    this.logProtocolEvent(event);
    this.ingestCognitionEvent(event);
    if (event.type === 'AGENT_CONVERSATION_START') {
      if (event.dialogue?.speakerId) {
        const speaker = this.getCharacterById(event.dialogue.speakerId);
        const lineText = event.dialogue.surfaceLine ?? event.dialogue.text;
        if (speaker && lineText && !this.isConversationPlaceholder(lineText)) {
          speaker.setStatusText(lineText);
          speaker.showSpeechBubble(lineText);
        }
      }
      return;
    }

    if (event.type === 'AGENT_CONVERSATION_END') {
      if (event.dialogue?.speakerId) {
        const speaker = this.getCharacterById(event.dialogue.speakerId);
        speaker?.setStatusText('Back to routine');
        speaker?.hideSpeechBubble();
      }
      if (event.dialogue?.listenerId) {
        this.getCharacterById(event.dialogue.listenerId)?.hideSpeechBubble();
      }
      return;
    }

    if (event.type === 'AGENT_MEMORY') {
      if (event.agentId && event.summary) {
        this.getCharacterById(event.agentId)?.setStatusText(event.summary);
      }
    }
  }

  private handleOpenClawBridgeEvent(event: AgentProtocolEvent): void {
    const job = this.openClawJobs.find((entry) => entry.clientTaskId === event.taskId);
    if (!job) return;
    const now = this.schedule.getTotalMinutes();
    job.lastEventAtMinutes = now;
    const actor = this.characterNameMap.get(job.agentId) ?? job.agentId;
    const taskId = job.clientTaskId;
    const taskLabel = this.getOpenClawTaskLabel(job);

    if (event.type === 'TASK_ASSIGNED') {
      if (event.agentId && job.agentId !== event.agentId) {
        this.appendOpenClawEntry('System', `Warning: bridge assigned ${actor} but local job is ${this.characterNameMap.get(job.agentId) ?? job.agentId}.`, taskId, taskLabel);
      }
      job.status = 'running';
      this.appendOpenClawEntry(actor, event.summary ?? 'Accepted task', taskId, taskLabel);
      return;
    }
    if (event.type === 'AGENT_THINKING' || event.type === 'AGENT_TOOL_CALL') {
      job.status = 'running';
      this.appendOpenClawEntry(actor, event.summary ?? event.type, taskId, taskLabel);
      return;
    }
    if (event.type === 'AGENT_STREAM_CHUNK') {
      job.status = 'running';
      const delta = event.summary ?? '';
      if (!delta) return;
      const accum = (this.openClawStreamAccumulator.get(taskId) ?? '') + delta;
      this.openClawStreamAccumulator.set(taskId, accum);
      this.updateOrCreateStreamEntry(taskId, taskLabel, actor, accum);
      return;
    }
    if (event.type === 'AGENT_RESULT') {
      job.status = 'running';
      const text = event.summary ?? '';
      if (this.openClawStreamAccumulator.has(taskId)) {
        this.openClawStreamAccumulator.set(taskId, text);
        this.updateOrCreateStreamEntry(taskId, taskLabel, actor, text);
      } else {
        this.appendOpenClawMarkdownEntry(actor, text, taskId, taskLabel);
      }
      return;
    }
    if (event.type === 'AGENT_PLAN') {
      job.status = 'running';
      const planSummary = event.plan?.steps?.slice(0, 3).map((step) => step.text).join(' -> ');
      this.appendOpenClawEntry(actor, planSummary ? `Plan: ${planSummary}` : (event.summary ?? 'Shared a plan.'), taskId, taskLabel);
      return;
    }
    if (event.type === 'AGENT_REFLECTION') {
      job.status = 'running';
      this.appendOpenClawEntry(actor, event.memory?.content ?? event.summary ?? 'Recorded a reflection.', taskId, taskLabel);
      return;
    }
    if (event.type === 'AGENT_MEMORY') {
      job.status = 'running';
      this.appendOpenClawEntry(actor, event.memory?.content ?? event.summary ?? 'Updated memory.', taskId, taskLabel);
      return;
    }
    if (event.type === 'TASK_DONE') {
      this.openClawStreamAccumulator.delete(taskId);
      this.finishOpenClawJob(job, true, undefined, now);
      return;
    }
    if (event.type === 'TASK_FAILED') {
      this.openClawStreamAccumulator.delete(taskId);
      const errorText = event.error ?? event.summary ?? 'Task failed';
      this.appendOpenClawEntry(actor, `Failed: ${errorText}`, taskId, taskLabel);
      this.finishOpenClawJob(job, false, errorText, now);
    }
  }

  private finishOpenClawJob(job: OpenClawJob, success: boolean, errorMessage: string | undefined, nowMinutes: number): void {
    if (job.status === 'done' || job.status === 'failed') return;
    job.status = success ? 'done' : 'failed';
    job.errorMessage = errorMessage;
    job.completedAtMinutes = nowMinutes;
    const agent = this.getCharacterById(job.agentId);
    if (agent) {
      agent.resumeNormalLifeWithRest(24, 'hall1');
      const agentName = this.characterNameMap.get(job.agentId) ?? job.agentId;
      this.appendOpenClawEntry(agentName, 'Back to normal life and taking a short rest.', job.clientTaskId, this.getOpenClawTaskLabel(job));
    }
    this.tryStartNextOpenClawJob();
  }

  private getCharacterById(agentId: string): Character | undefined {
    return this.characters.find((character) => character.id === agentId);
  }

  private updateDebugOverlay(deltaMs: number): void {
    if (!this.debugEnabled) return;
    this.debugTickMs += deltaMs;
    if (this.debugTickMs < 120) return;
    this.debugTickMs = 0;
    const paths = this.characters.map((character) => ({
      agentId: character.id,
      path: character.getDebugPath(),
    }));
    this.navDebugOverlay.setCharacterPaths(paths);
    this.navDebugOverlay.setReservedTiles(
      this.reservationManager.getReservedEntries().map((entry) => parseKey(entry.pointKey)),
    );
  }

  private logToActivityPanel(message: string): void {
    this.appendRightPanelEntry('thoughts', this.escapeHtml(message));
  }

  private logProtocolEvent(event: AgentProtocolEvent): void {
    const agentName = event.agentId ? (this.characterNameMap.get(event.agentId) || event.agentId) : 'System';

    if (event.type === 'AGENT_CONVERSATION_START' || event.type === 'AGENT_CONVERSATION_END') {
      if (this.shouldThrottleDialogueLog(event)) {
        return;
      }
      const text = event.dialogue?.surfaceLine ?? event.dialogue?.text ?? event.summary ?? event.type;
      if (this.isConversationPlaceholder(text)) {
        return;
      }
      const speakerId = event.dialogue?.speakerId;
      const listenerId = event.dialogue?.listenerId;
      const pairKey = speakerId && listenerId ? this.makePairKey(speakerId, listenerId) : undefined;
      const pairLabel = speakerId && listenerId
        ? `${this.characterNameMap.get(speakerId) ?? speakerId} ↔ ${this.characterNameMap.get(listenerId) ?? listenerId}`
        : undefined;
      this.appendRightPanelEntry(
        'dialogues',
        `<span class="agent">${this.escapeHtml(agentName)}</span>: ${this.escapeHtml(text)}`,
        {
          agentId: speakerId ?? event.agentId,
          conversationId: event.dialogue?.conversationId,
          pairKey,
          pairLabel,
        },
      );
      return;
    }

    if (event.type === 'AGENT_MEMORY') {
      if (event.memory?.kind === 'reflection' && event.taskId === '__cognition__') {
      return;
    }
      const thoughtText = this.formatThoughtTextForPanel(event.memory?.content ?? event.summary ?? 'Memory update');
      if (!thoughtText) return;
      this.appendRightPanelEntry(
        'thoughts',
        `<span class="agent">${this.escapeHtml(agentName)}</span>: ${this.escapeHtml(thoughtText)}`,
        { agentId: event.agentId },
      );
      return;
    }

    if (event.type === 'AGENT_COGNITION') {
      if (!event.agentId || !event.cognition) return;
      const now = this.schedule.getTotalMinutes();
      if (!this.shouldSurfaceThought(event.agentId, event.cognition, now)) {
        return;
      }
      const thoughtSource = event.cognition.feltThought || event.cognition.thoughtText || event.summary || 'Thinking...';
      const thoughtText = this.formatThoughtTextForPanel(thoughtSource);
      if (!thoughtText) return;
      this.appendRightPanelEntry(
        'thoughts',
        `<span class="agent">${this.escapeHtml(agentName)}</span>: ${this.escapeHtml(thoughtText)}`,
        { agentId: event.agentId },
      );
    }
  }

  private formatThoughtTextForPanel(raw: string): string {
    if (!raw) return '';
    let text = raw
      .replace(/\[outcomeTag:[^\]]+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';

    // Convert internal bookkeeping phrases into human-readable inner monologue.
    if (/^memory trace:/i.test(text)) {
      text = text.replace(/^memory trace:\s*/i, '');
    }
    const socialTalk = text.match(/^(smalltalk|deep)\s+talk with\s+(.+)$/i);
    if (socialTalk) {
      const depth = socialTalk[1].toLowerCase() === 'deep' ? 'serious' : 'brief';
      const who = socialTalk[2].trim();
      text = `I just had a ${depth} conversation with ${who}.`;
    }

    if (/^noted social interaction$/i.test(text)) {
      text = 'That interaction might matter later.';
    } else if (/^memory update$/i.test(text)) {
      text = 'Something about that moment feels worth remembering.';
    } else if (/^thinking\.\.\.$/i.test(text)) {
      text = 'I am trying to make sense of what to do next.';
    }

    if (!/[.!?]$/.test(text)) {
      text += '.';
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private shouldSurfaceThought(
    agentId: string,
    cognition: AgentCognitionPayload,
    nowMinutes: number,
  ): boolean {
    const feltRaw = cognition.feltThought || cognition.thoughtText || '';
    const normalizedThought = feltRaw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalizedThought) return false;

    const lastThought = this.lastVisibleThoughtByAgent.get(agentId);
    const cooldownUntil = this.visibleThoughtCooldownUntil.get(agentId) ?? 0;
    const prior = this.cognitionByAgent.get(agentId);
    const staleVisible = nowMinutes >= cooldownUntil;

    const planChanged = !prior
      || prior.planIntent.action !== cognition.planIntent.action
      || prior.planIntent.targetAgentId !== cognition.planIntent.targetAgentId
      || prior.planIntent.activity !== cognition.planIntent.activity;
    const toneChanged = this.normalizeTone(prior?.emotionTone) !== this.normalizeTone(cognition.emotionTone);
    const subtextChanged = prior?.subtext !== cognition.subtext;
    const thoughtChanged = lastThought !== normalizedThought;

    const shouldShow = !lastThought || planChanged || toneChanged || subtextChanged || (thoughtChanged && staleVisible);
    if (!shouldShow) {
      return false;
    }

    this.lastVisibleThoughtByAgent.set(agentId, normalizedThought);
    this.visibleThoughtCooldownUntil.set(agentId, nowMinutes + VISIBLE_THOUGHT_COOLDOWN_MINUTES);
    return true;
  }

  private normalizeTone(tone: AgentEmotionTone | undefined): AgentEmotionTone | 'none' {
    return tone ?? 'none';
  }

  private shouldThrottleDialogueLog(event: AgentProtocolEvent): boolean {
    const conversationId = event.dialogue?.conversationId;
    const speakerId = event.dialogue?.speakerId;
    const listenerId = event.dialogue?.listenerId;
    if (!conversationId && (!speakerId || !listenerId)) {
      return false;
    }
    const key = event.dialogue?.dedupeKey
      ?? (speakerId && listenerId
        ? `${this.makePairKey(speakerId, listenerId)}:${event.type}:${event.dialogue?.surfaceLine ?? event.dialogue?.text ?? ''}`
        : `${conversationId ?? 'dialogue'}:${event.type}:${event.dialogue?.surfaceLine ?? event.dialogue?.text ?? ''}`);
    const now = this.schedule.getTotalMinutes();
    const until = this.dialogueLogCooldownUntil.get(key) ?? 0;
    if (now < until) {
      return true;
    }
    this.dialogueLogCooldownUntil.set(key, now + DIALOGUE_LOG_COOLDOWN_MINUTES);
    return false;
  }

  private isConversationPlaceholder(text: string): boolean {
    return text === '[conversation_start]' || text === '[conversation_end]';
  }

  private setupRightPanelSwitch(): void {
    const tabs = Array.from(document.querySelectorAll('.sidebar.right .stream-tab')) as HTMLButtonElement[];
    if (tabs.length === 0) return;
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const stream = tab.dataset.stream;
        const mode: RightPanelMode =
          stream === 'thoughts' ? 'thoughts' : stream === 'openclaw' ? 'openclaw' : 'dialogues';
        this.rightPanelMode = mode;
        this.renderRightPanelEntries();
        this.updateOpenClawComposerVisibility();
        tabs.forEach((button) => {
          button.classList.toggle('active', button === tab);
        });
      });
    }
    this.renderRightPanelEntries();
    this.updateOpenClawComposerVisibility();
  }

  private appendRightPanelEntry(
    mode: RightPanelMode,
    html: string,
    meta?: { agentId?: string; conversationId?: string; pairKey?: string; pairLabel?: string },
  ): void {
    this.rightPanelEntries.push({
      mode,
      html,
      agentId: meta?.agentId,
      conversationId: meta?.conversationId,
      pairKey: meta?.pairKey,
      pairLabel: meta?.pairLabel,
    });
    if (this.rightPanelEntries.length > 250) {
      this.rightPanelEntries.splice(0, this.rightPanelEntries.length - 250);
    }
    if (mode === this.rightPanelMode) {
      this.renderRightPanelEntries();
    }
  }

  private renderRightPanelEntries(): void {
    const logContainer = document.querySelector('.sidebar.right .panel-content');
    if (!logContainer) return;
    logContainer.innerHTML = '';
    const entries = this.rightPanelEntries.filter((entry) => entry.mode === this.rightPanelMode);

    if (entries.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'log-empty-state';
      const label =
        this.rightPanelMode === 'dialogues'
          ? 'No dialogue yet'
          : this.rightPanelMode === 'thoughts'
            ? 'No thoughts yet'
            : 'No Openclaw yet';
      const hint =
        this.rightPanelMode === 'dialogues'
          ? 'Post a task and agent conversations will appear here.'
          : this.rightPanelMode === 'thoughts'
            ? 'Post a task and agent reflections will appear here.'
            : 'Openclaw output will appear here when connected.';
      placeholder.innerHTML = `<strong>${label}</strong>${hint}`;
      logContainer.appendChild(placeholder);
      return;
    }

    if (this.rightPanelMode === 'openclaw') {
      const threads = new Map<string, { label: string; items: RightPanelEntry[]; lastIndex: number }>();
      entries.forEach((entry, index) => {
        const key = entry.conversationId ?? `openclaw:${index}`;
        const label = entry.pairLabel ?? 'OpenClaw Task';
        const thread = threads.get(key);
        if (thread) {
          thread.items.push(entry);
          thread.lastIndex = index;
        } else {
          threads.set(key, { label, items: [entry], lastIndex: index });
        }
      });
      const orderedThreads = [...threads.values()].sort((a, b) => a.lastIndex - b.lastIndex);
      for (const thread of orderedThreads) {
        const header = document.createElement('div');
        header.className = 'log-entry';
        header.style.fontWeight = '600';
        header.style.background = 'rgba(0, 0, 0, 0.05)';
        header.textContent = thread.label;
        logContainer.appendChild(header);
        for (const line of thread.items) {
          const entry = document.createElement('div');
          entry.className = line.streamId ? 'log-entry openclaw-stream-entry' : 'log-entry';
          if (line.streamId) entry.setAttribute('data-stream-id', line.streamId);
          entry.innerHTML = line.html;
          logContainer.appendChild(entry);
        }
      }
      logContainer.scrollTop = logContainer.scrollHeight;
      return;
    }

    if (this.rightPanelMode === 'dialogues') {
      const threads = new Map<string, { label: string; items: RightPanelEntry[]; lastIndex: number }>();
      entries.forEach((entry, index) => {
        const key = entry.conversationId ?? entry.pairKey ?? `misc:${index}`;
        const label = entry.pairLabel ?? 'Conversation';
        const thread = threads.get(key);
        if (thread) {
          thread.items.push(entry);
          thread.lastIndex = index;
        } else {
          threads.set(key, { label, items: [entry], lastIndex: index });
        }
      });
      const orderedThreads = [...threads.values()].sort((a, b) => a.lastIndex - b.lastIndex);
      for (const thread of orderedThreads) {
        const header = document.createElement('div');
        header.className = 'log-entry';
        header.style.fontWeight = '600';
        header.style.background = 'rgba(0, 0, 0, 0.05)';
        header.textContent = thread.label;
        logContainer.appendChild(header);
        for (const line of thread.items.slice(-6)) {
          const entry = document.createElement('div');
          entry.className = 'log-entry';
          entry.innerHTML = line.html;
          logContainer.appendChild(entry);
        }
      }
      logContainer.scrollTop = logContainer.scrollHeight;
      return;
    }

    for (const entryData of entries) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = entryData.html;
      logContainer.appendChild(entry);
    }
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private updateSidebars(): void {
    const rosterContainer = document.querySelector('.sidebar .panel-content');
    if (!rosterContainer) return;
    const statuses = this.getAgentStatuses();

    if (this.selectedCharacterId) {
      const selectedStatus = statuses.find((entry) => entry.agentId === this.selectedCharacterId);
      if (!selectedStatus) {
        this.selectedCharacterId = null;
      } else {
        const memories = this.memoryByAgent.get(selectedStatus.agentId)?.length ?? 0;
        const relationKeys = statuses
          .filter((s) => s.agentId !== selectedStatus.agentId)
          .map((s) => `${selectedStatus.agentId}_${s.agentId}`)
          .map((k) => `${k}:${this.relationshipAffinity.get(k) ?? 0}`)
          .join(',');
        const narrativeSignature = this.getRuntimeNarratives(
          selectedStatus.agentId,
          this.getCharacterConfig(selectedStatus.agentId)?.profile.observerLayer.selfNarratives,
        )
          .map((n) => `${n.id}:${n.confidence.toFixed(2)}:${n.dominance.toFixed(2)}`)
          .join(',');
        const cognition = this.cognitionByAgent.get(selectedStatus.agentId);
        const cognitionSignature = cognition
          ? [
            cognition.feltThought ?? '',
            cognition.planIntent.action,
            cognition.planIntent.activity ?? '',
            cognition.planIntent.targetAgentId ?? '',
            String(cognition.updatedAt ?? 0),
          ].join(':')
          : 'none';
        const detailSignature = this.buildDetailSidebarSignature(
          selectedStatus,
          memories,
          relationKeys,
          narrativeSignature,
          cognitionSignature,
        );
        if (this.sidebarViewMode === 'detail' && this.sidebarRenderSignature === detailSignature) {
          return;
        }
        this.sidebarViewMode = 'detail';
        this.sidebarRenderSignature = detailSignature;
        this.renderCharacterDetailPanel(
          rosterContainer as HTMLElement,
          selectedStatus,
          memories,
          statuses,
        );
        return;
      }
    }

    const rosterSignature = this.buildRosterSidebarSignature(statuses);
    if (this.sidebarViewMode === 'list' && this.sidebarRenderSignature === rosterSignature) {
      return;
    }
    this.sidebarViewMode = 'list';
    this.sidebarRenderSignature = rosterSignature;

    const prevScrollTop = rosterContainer.scrollTop;
    rosterContainer.innerHTML = '';

    for (const status of statuses) {
      const card = document.createElement('div');
      card.className = 'agent-card';
      card.dataset.agentId = status.agentId;

      const stateColor = this.getSidebarStateColor(status);
      const statusText = status.statusText || 'Idle';
      const profileUrl = `./assets/characters_profile_pictures/${status.agentName}_profile.png`;

      card.innerHTML = `
        <div class="agent-avatar" style="padding:0;overflow:hidden;border-radius:50%;background:#e5e7eb;">
          <img
            src="${profileUrl}"
            alt="${this.escapeHtml(status.agentName)}"
            style="width:100%;height:100%;object-fit:cover;display:block;"
            onerror="this.style.display='none'; this.parentElement.textContent='${this.escapeHtml(status.agentName.charAt(0))}'; this.parentElement.style.display='flex'; this.parentElement.style.alignItems='center'; this.parentElement.style.justifyContent='center';"
          />
        </div>
        <div class="agent-info">
          <h3>${this.escapeHtml(status.agentName)}</h3>
          <div class="agent-status" style="color:${stateColor};"><span class="status-dot" style="background:${stateColor};"></span> ${this.escapeHtml(statusText)}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedCharacterId = status.agentId;
        this.updateSidebars();
      });

      rosterContainer.appendChild(card);
    }
    rosterContainer.scrollTop = prevScrollTop;
  }

  private renderCharacterDetailPanel(
    container: HTMLElement,
    status: AgentStatusSnapshot,
    memories: number,
    statuses: AgentStatusSnapshot[],
  ): void {
    const characterConfig = this.getCharacterConfig(status.agentId);
    const profile = characterConfig?.profile;
    const simulation = profile?.simulationLayer;
    const observer = profile?.observerLayer;
    const runtimeNarratives = this.getRuntimeNarratives(status.agentId, observer?.selfNarratives);
    const profileUrl = `./assets/characters_profile_pictures/${status.agentName}_profile.png`;
    const stateColor = this.getSidebarStateColor(status);
    const description = this.getCharacterDescription(status.agentId);
    const activityLabel = this.formatActivityStatus(status.currentActivity ?? 'rest');
    const cognition = this.cognitionByAgent.get(status.agentId);
    const currentThought = cognition?.feltThought || cognition?.thoughtText || '';
    const currentPlan = this.describePlanIntent(cognition?.planIntent);
    const emotionLabel = simulation?.dynamicState.currentEmotion?.label ?? '';
    const emotionIntensity = simulation?.dynamicState.currentEmotion?.intensity ?? 0;

    const bio = profile
      ? (profile.identityStructure.socialExperience || profile.identityStructure.initialGoalOrAnxiety)
      : '';

    const allRelationships = statuses
      .filter((entry) => entry.agentId !== status.agentId)
      .map((entry) => ({
        name: entry.agentName,
        agentId: entry.agentId,
        value: this.getRelationshipAffinity(status.agentId, entry.agentId),
      }));
    const relationshipBubbles = allRelationships
      .filter((entry) => entry.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6)
      .map((entry) => {
        const ringColor = entry.value >= 20 ? '#22c55e' : entry.value > 0 ? '#86efac' : entry.value <= -20 ? '#ef4444' : '#fca5a5';
        const relUrl = `./assets/characters_profile_pictures/${entry.name}_profile.png`;
        const label = this.getRelationshipLabel(entry.value);
        return `<div class="cd-rel-bubble" title="${this.escapeHtml(entry.name)}: ${this.escapeHtml(label)}">
          <div class="cd-rel-ring" style="border-color:${ringColor}">
            <img src="${relUrl}" alt="${this.escapeHtml(entry.name.charAt(0))}" onerror="this.style.display='none'; this.parentElement.querySelector('.cd-rel-fallback').style.display='flex';" />
            <span class="cd-rel-fallback">${this.escapeHtml(entry.name.charAt(0))}</span>
          </div>
          <span class="cd-rel-name">${this.escapeHtml(entry.name)}</span>
        </div>`;
      })
      .join('');

    const moodEmoji = this.getEmotionEmoji(emotionLabel);
    const moodText = emotionLabel
      ? `${moodEmoji} ${emotionLabel.charAt(0).toUpperCase() + emotionLabel.slice(1)}`
      : 'Neutral';

    const recentVisibleThoughts = this.rightPanelEntries
      .filter((entry) => entry.mode === 'thoughts' && entry.agentId === status.agentId)
      .slice(-3)
      .map((entry) => entry.html);

    const identityLines = profile
      ? [
        profile.identityStructure.socialExperience,
        profile.identityStructure.abilityExperience,
        `Relationship start (${this.formatRelationshipType(profile.identityStructure.relationshipStart.type)}): ${profile.identityStructure.relationshipStart.detail}`,
        `Initial goal/anxiety: ${profile.identityStructure.initialGoalOrAnxiety}`,
      ]
      : ['No role history available yet.'];
    const identityHtml = identityLines
      .map((line) => `<div class="character-detail-memory-placeholder">${this.escapeHtml(line)}</div>`)
      .join('');

    const fullRelationshipHtml = allRelationships
      .filter((entry) => entry.value !== 0)
      .map((entry) => {
        const tone = entry.value > 0 ? 'positive' : 'negative';
        const label = this.getRelationshipLabel(entry.value);
        return `<div class="character-detail-relationship-item">
          <span class="character-detail-relationship-name">${this.escapeHtml(entry.name)}</span>
          <span class="character-detail-relationship-value ${tone}">${this.escapeHtml(label)}</span>
        </div>`;
      })
      .join('');

    const oldDetailContent = container.querySelector('.character-detail-content') as HTMLElement | null;
    const previousScrollTop = oldDetailContent?.scrollTop ?? 0;

    container.innerHTML = `
      <div class="character-detail">
        <div class="character-detail-header">
          <button type="button" class="character-detail-back" aria-label="Back to characters"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
          <span class="character-detail-header-label">${this.escapeHtml(status.agentName)}</span>
        </div>

        <div class="character-detail-content">
          <div class="cd-hero">
            <div class="cd-hero-avatar">
              <span class="avatar-fallback">${this.escapeHtml(status.agentName.charAt(0))}</span>
              <img src="${profileUrl}" alt="${this.escapeHtml(status.agentName)}" onerror="this.style.display='none';" />
              <span class="cd-hero-status-dot" style="background:${stateColor}"></span>
            </div>
            <h2 class="cd-hero-name">${this.escapeHtml(status.agentName)}</h2>
            <div class="cd-hero-desc">${this.escapeHtml(description)}</div>
            ${bio ? `<div class="cd-hero-bio">${this.escapeHtml(bio)}</div>` : ''}
          </div>

          <div class="cd-now">
            <div class="cd-now-row">
              <span class="cd-now-icon" style="color:${stateColor}">●</span>
              <span class="cd-now-text">${this.escapeHtml(activityLabel)}</span>
            </div>
            <div class="cd-now-row">
              <span class="cd-now-icon">${moodEmoji}</span>
              <span class="cd-now-text">${this.escapeHtml(moodText.replace(moodEmoji + ' ', ''))}${emotionIntensity > 0 ? ` <span class="cd-now-dim">${Math.round(emotionIntensity * 100)}%</span>` : ''}</span>
            </div>
            ${currentPlan !== 'No active plan' ? `<div class="cd-now-row">
              <span class="cd-now-icon">→</span>
              <span class="cd-now-text">${this.escapeHtml(currentPlan)}</span>
            </div>` : ''}
          </div>

          ${currentThought ? `<div class="cd-thought">
            <div class="cd-thought-quote">"${this.escapeHtml(this.formatThoughtTextForPanel(currentThought))}"</div>
          </div>` : ''}

          ${relationshipBubbles ? `<div class="cd-section-mini">
            <div class="cd-section-mini-title">Relationships</div>
            <div class="cd-rel-row">${relationshipBubbles}</div>
          </div>` : ''}

          <details class="cd-details-fold">
            <summary class="cd-details-toggle">More details</summary>

            <div class="character-detail-section">
              <div class="character-detail-section-title">State</div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Goal</span>
                <span class="character-detail-stat-value">${this.escapeHtml(simulation?.dynamicState.currentGoal ?? 'Unknown')}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Focus</span>
                <span class="character-detail-stat-value">${this.escapeHtml(simulation?.dynamicState.currentFocus ?? 'Unknown')}</span>
              </div>
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">Traits</div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Openness</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatDimensionScore(simulation?.traits.openness))}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Sociability</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatDimensionScore(simulation?.traits.sociability))}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Impulse control</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatDimensionScore(simulation?.traits.impulseControl ?? simulation?.traits.selfControl))}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Sensitivity</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatDimensionScore(simulation?.traits.sensitivity))}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Boundary strength</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatDimensionScore(simulation?.traits.boundaryStrength))}</span>
              </div>
              <div class="character-detail-stat-row">
                <span class="character-detail-stat-label">Need pair</span>
                <span class="character-detail-stat-value">${this.escapeHtml(this.formatNeeds(simulation))}</span>
              </div>
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">Observer interpretation</div>
              <div class="character-detail-memory-placeholder">${this.escapeHtml(observer?.readText ?? 'No observer text yet.')}</div>
              <div class="character-detail-memory-placeholder">${this.escapeHtml(this.formatObserverBias(observer?.observerBias))}</div>
              ${this.renderInferenceHtml(observer)}
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">Identity structure</div>
              ${identityHtml}
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">All relationships</div>
              ${fullRelationshipHtml || '<div class="character-detail-memory-placeholder">No bonds formed yet.</div>'}
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">Self narrative</div>
              ${this.renderSelfNarrativesHtml(runtimeNarratives)}
            </div>

            <div class="character-detail-section">
              <div class="character-detail-section-title">Memory</div>
              <div class="character-detail-memory-placeholder">${memories} memory entr${memories === 1 ? 'y' : 'ies'}</div>
              ${recentVisibleThoughts.length > 0
                ? recentVisibleThoughts.map((line) => `<div class="character-detail-memory-placeholder">${line}</div>`).join('')
                : '<div class="character-detail-memory-placeholder">No recent visible thoughts.</div>'}
            </div>
          </details>
        </div>
      </div>
    `;

    const backButton = container.querySelector('.character-detail-back');
    if (backButton) {
      backButton.addEventListener('click', () => {
        this.selectedCharacterId = null;
        this.updateSidebars();
      });
    }

    const newDetailContent = container.querySelector('.character-detail-content') as HTMLElement | null;
    if (newDetailContent) {
      newDetailContent.scrollTop = previousScrollTop;
    }
  }

  private getEmotionEmoji(label: string): string {
    const map: Record<string, string> = {
      happy: '😊', content: '😌', excited: '🤩', playful: '😄',
      calm: '😶', relaxed: '😌', neutral: '😐', bored: '😑',
      sad: '😢', lonely: '😔', melancholic: '🥀', nostalgic: '🌅',
      anxious: '😰', nervous: '😬', worried: '😟', stressed: '😣',
      angry: '😠', frustrated: '😤', irritated: '😒',
      curious: '🤔', interested: '👀', thoughtful: '💭',
      tired: '😴', exhausted: '🥱', sleepy: '💤',
      social: '🗣️', friendly: '🤗', warm: '☀️',
      guarded: '🛡️', uneasy: '😕', tense: '😬',
    };
    return map[label.toLowerCase()] ?? '💭';
  }

  private getAgentStatuses(): AgentStatusSnapshot[] {
    const statuses = this.characters.map((character) => ({
      agentId: character.id,
      agentName: character.name,
      state: character.getRuntimeState(),
      statusText: this.getSidebarStatusText(character),
      currentActivity: character.getCurrentActivity(),
      taskId: character.getActiveTaskId(),
      cooldownProgress: character.getCooldownProgress(),
      debugMetrics: character.getDebugMetrics(),
    }));
    // Zero (teacher) at top, rest alphabetically by name
    return [...statuses].sort((a, b) => {
      if (a.agentName === 'Zero') return -1;
      if (b.agentName === 'Zero') return 1;
      return a.agentName.localeCompare(b.agentName);
    });
  }

  private buildRosterSidebarSignature(statuses: AgentStatusSnapshot[]): string {
    return statuses
      .map((status) => `${status.agentId}:${status.state}:${status.currentActivity ?? ''}:${status.statusText ?? ''}`)
      .join('|');
  }

  private buildDetailSidebarSignature(
    status: AgentStatusSnapshot,
    memories: number,
    relationKeys: string,
    narrativeSignature: string,
    cognitionSignature: string,
  ): string {
    return [
      status.agentId,
      status.state,
      status.currentActivity ?? '',
      status.statusText ?? '',
      String(memories),
      relationKeys,
      narrativeSignature,
      cognitionSignature,
    ].join('|');
  }

  private getCharacterDescription(agentId: string): string {
    const config = this.getCharacterConfig(agentId);
    if (!config) return 'Resident of the school dorm simulation.';
    const runtimeNarratives = this.getRuntimeNarratives(agentId, config.profile.observerLayer.selfNarratives);
    const dominant = [...runtimeNarratives].sort((a, b) => b.dominance - a.dominance)[0];
    return dominant?.text ?? getDominantSelfNarrative(config.profile.observerLayer).text;
  }

  private getCharacterConfig(agentId: string): CharacterConfig | undefined {
    return CHARACTERS.find((entry) => entry.id === agentId);
  }

  private formatRelationshipType(type: CharacterConfig['profile']['identityStructure']['relationshipStart']['type']): string {
    const labels: Record<CharacterConfig['profile']['identityStructure']['relationshipStart']['type'], string> = {
      friend: 'friend',
      rival: 'rival',
      family_expectation: 'family expectation',
      former_acquaintance: 'former acquaintance',
    };
    return labels[type];
  }

  private formatDimensionScore(score: number | undefined): string {
    if (score === undefined) return 'Unknown';
    if (score >= 75) return `${score} (high)`;
    if (score >= 45) return `${score} (medium)`;
    return `${score} (low)`;
  }

  private formatNeeds(simulation: CharacterConfig['profile']['simulationLayer'] | undefined): string {
    if (!simulation) return 'Unknown';
    const { primaryType, secondaryType, secondaryRatio, normalized } = simulation.needs;
    return `${primaryType} ${normalized.primary}% / ${secondaryType} ${normalized.secondary}% (ratio ${secondaryRatio.toFixed(2)})`;
  }

  private describePlanIntent(planIntent: AgentCognitionPayload['planIntent'] | undefined): string {
    if (!planIntent) return 'No active plan';
    if (planIntent.action === 'talk') {
      const target = planIntent.targetAgentId
        ? (this.characterNameMap.get(planIntent.targetAgentId) ?? planIntent.targetAgentId)
        : 'someone';
      return `Talk to ${target}`;
    }
    if (planIntent.action === 'shift_activity') {
      const activity = planIntent.activity ? this.formatActivityStatus(planIntent.activity) : 'activity';
      return `Shift to ${activity}`;
    }
    if (planIntent.action === 'reflect') {
      return 'Reflect privately';
    }
    const activity = planIntent.activity ? this.formatActivityStatus(planIntent.activity) : 'current routine';
    return `Stay with ${activity}`;
  }

  private formatObserverBias(bias: CharacterConfig['profile']['observerLayer']['observerBias'] | undefined): string {
    if (!bias) return 'Observer bias: unknown';
    return `Observer bias: ${bias}`;
  }

  private renderInferenceHtml(
    observer: CharacterConfig['profile']['observerLayer'] | undefined,
  ): string {
    if (!observer || observer.inferences.length === 0) {
      return '<div class="character-detail-memory-placeholder">No observer inferences yet.</div>';
    }
    return observer.inferences
      .map((entry) =>
        `<div class="character-detail-memory-placeholder">${this.escapeHtml(`- ${entry.hypothesis} (confidence ${Math.round(entry.confidence * 100)}%)`)}</div>`)
      .join('');
  }

  private getRuntimeNarratives(
    agentId: string,
    fallback: CharacterConfig['profile']['observerLayer']['selfNarratives'] | undefined,
  ): SelfNarrative[] {
    const runtime = this.selfNarrativesByAgent.get(agentId);
    if (runtime && runtime.length > 0) {
      return runtime;
    }
    if (!fallback) {
      return [];
    }
    return fallback.map((entry) => ({ ...entry }));
  }

  private renderSelfNarrativesHtml(narratives: SelfNarrative[]): string {
    if (narratives.length === 0) {
      return '<div class="character-detail-memory-placeholder">No self-narratives available yet.</div>';
    }
    return narratives
      .map((narrative) =>
        `<div class="character-detail-memory-placeholder">${this.escapeHtml(
          `${narrative.text} (conf ${Math.round(narrative.confidence * 100)}%, dom ${Math.round(narrative.dominance * 100)}%)`,
        )}</div>`
      )
      .join('');
  }

  private seedRelationshipAffinityFromEdges(): void {
    this.relationshipAffinity.clear();
    const startWithBonds = new URLSearchParams(window.location.search).get('startWithBonds') === '1';
    for (const from of this.characters) {
      for (const to of this.characters) {
        if (from.id === to.id) continue;
        this.setRelationshipAffinity(from.id, to.id, 0);
      }
    }
    if (!startWithBonds) {
      // Default world starts from strangers; relationships are built through interaction.
      return;
    }
    for (const edge of CHARACTER_RELATIONSHIP_EDGES) {
      this.setRelationshipAffinity(edge.fromId, edge.toId, edge.valence);
      if (edge.type === 'preBond' && edge.reciprocal !== false) {
        this.setRelationshipAffinity(edge.toId, edge.fromId, edge.valence);
      }
    }
  }

  getRelationshipAffinity(fromId: string, toId: string): number {
    const key = `${fromId}_${toId}`;
    return this.relationshipAffinity.get(key) ?? 0;
  }

  setRelationshipAffinity(fromId: string, toId: string, value: number): void {
    const key = `${fromId}_${toId}`;
    const clamped = Math.max(-100, Math.min(100, value));
    this.relationshipAffinity.set(key, clamped);
  }

  private getRecentPairMemories(
    fromId: string,
    toId: string,
    nowTs: number,
    limit = 5,
  ): EpisodicMemoryEntry[] {
    const maxAgeMs = 72 * 60 * 60 * 1000;
    const entries = this.episodicMemoryByAgent.get(fromId) ?? [];
    return entries
      .filter((entry) =>
        entry.who === toId
        && nowTs - entry.ts <= maxAgeMs
        && (
          entry.kind === 'social_contact'
          || entry.kind === 'support'
          || entry.kind === 'conflict'
          || entry.kind === 'observation'
        ))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, Math.max(1, limit));
  }

  private getRelationshipGrowthScale(fromId: string, toId: string, nowTs: number): number {
    const recentA = this.getRecentPairMemories(fromId, toId, nowTs, 5);
    const recentB = this.getRecentPairMemories(toId, fromId, nowTs, 5);
    const combined = [...recentA, ...recentB]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
    if (combined.length === 0) {
      return 0.18;
    }
    const recencyWeighted = combined.reduce((acc, entry) => {
      const ageHours = Math.max(0, (nowTs - entry.ts) / (1000 * 60 * 60));
      const recency = Math.pow(0.5, ageHours / 10);
      return acc + recency;
    }, 0) / combined.length;
    const countStage = Math.min(1, combined.length / 6);
    const stage = Math.max(0, Math.min(1, countStage * 0.65 + recencyWeighted * 0.35));
    if (stage < 0.2) return 0.18;
    if (stage < 0.45) return 0.34;
    if (stage < 0.7) return 0.56;
    if (stage < 0.9) return 0.78;
    return 1;
  }

  private getPairRelationshipStage(aId: string, bId: string): 'stranger' | 'familiar' | 'friendly' | 'close' | 'tense' | 'hostile' {
    const avgAffinity = (this.getRelationshipAffinity(aId, bId) + this.getRelationshipAffinity(bId, aId)) / 2;
    return this.getRelationshipStageLabel(avgAffinity);
  }

  private getConversationWarmupScale(aId: string, bId: string): number {
    const stage = this.getPairRelationshipStage(aId, bId);
    if (stage === 'stranger') return 0.7;
    if (stage === 'familiar') return 0.85;
    return 1;
  }

  private getConversationImpressionScale(aId: string, bId: string): number {
    const stage = this.getPairRelationshipStage(aId, bId);
    if (stage === 'stranger') return 0.55;
    if (stage === 'familiar') return 0.78;
    return 1;
  }

  private applyRelationshipDeltaProgressive(fromId: string, toId: string, rawDelta: number, nowTs: number): void {
    const scale = this.getRelationshipGrowthScale(fromId, toId, nowTs);
    const stagedDelta = rawDelta * scale;
    const current = this.getRelationshipAffinity(fromId, toId);
    this.setRelationshipAffinity(fromId, toId, current + stagedDelta);
  }

  private getRelationshipLabel(value: number): string {
    if (value >= 80) return 'Close friend';
    if (value >= 50) return 'Friend';
    if (value >= 20) return 'Acquaintance';
    if (value > 0) return 'Friendly';
    if (value <= -80) return 'Hostile';
    if (value <= -50) return 'Rival';
    if (value <= -20) return 'Tense';
    return 'Distant';
  }

  private getSidebarStatusText(character: Character): string {
    const runtimeState = character.getRuntimeState();

    if (runtimeState === 'moving_to_desk') return 'Heading to desk';
    if (runtimeState === 'working') return 'Working';
    if (runtimeState === 'returning_result') return 'Returning results';
    if (runtimeState === 'cooldown') return 'Cooldown';

    // idle_life: derive status from their actual scheduled activity.
    return this.formatActivityStatus(character.getCurrentActivity());
  }

  private formatActivityStatus(activity: string): string {
    const labelByActivity: Record<string, string> = {
      sleep: 'Sleeping',
      eat: 'Eating',
      study: 'Studying',
      class_study: 'In class',
      library_study: 'Library study',
      read: 'Reading',
      exercise: 'Exercising',
      sports_ball: 'Ball practice',
      social: 'Socializing',
      rest: 'Resting',
      music: 'Music practice',
      perform: 'Performing',
      watch_tv: 'Watching TV',
      toilet: 'Bathroom',
      shower: 'Showering',
      bathe: 'Bathing',
      clean: 'Cleaning',
      cook: 'Cooking',
      laundry: 'Doing laundry',
      decorate: 'Decorating',
    };
    return labelByActivity[activity] ?? 'Idle';
  }

  private getSidebarStateColor(status: AgentStatusSnapshot): string {
    if (status.state === 'moving_to_desk') return '#fbbf24';
    if (status.state === 'working') return '#60a5fa';
    if (status.state === 'returning_result') return '#c084fc';
    if (status.state === 'cooldown') return '#a3a3a3';

    return this.getActivityStateColor(status.currentActivity);
  }

  private getActivityStateColor(activity?: string): string {
    const colorByActivity: Record<string, string> = {
      sleep: '#93c5fd',
      eat: '#f59e0b',
      study: '#22c55e',
      class_study: '#16a34a',
      library_study: '#0ea5e9',
      read: '#84cc16',
      exercise: '#ef4444',
      sports_ball: '#f97316',
      social: '#f472b6',
      rest: '#a78bfa',
      music: '#2dd4bf',
      perform: '#14b8a6',
      watch_tv: '#06b6d4',
      toilet: '#94a3b8',
      shower: '#38bdf8',
      bathe: '#0ea5e9',
      clean: '#f97316',
      cook: '#f59e0b',
      laundry: '#60a5fa',
      decorate: '#e879f9',
    };
    return activity ? (colorByActivity[activity] ?? '#e5e7eb') : '#e5e7eb';
  }

  private createBridgeProvider(): AgentBridgeClient {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('bridge');
    const bridgeUrl = params.get('bridgeUrl');

    if (mode === 'ws') {
      const wsUrl = bridgeUrl ?? 'ws://localhost:8787';
      return new WebSocketProvider({ wsUrl });
    }
    if (mode === 'relay') {
      const baseUrl = bridgeUrl ?? 'http://localhost:8787';
      return new RelayProvider({
        baseUrl,
        timeoutMs: this.behaviorConfig.llmTimeoutMs,
        dialogueTimeoutMs: this.behaviorConfig.dialogueTimeoutMs,
        dailyPlanTimeoutMs: this.behaviorConfig.dailyPlanTimeoutMs,
        cognitionTimeoutMs: this.behaviorConfig.cognitionTimeoutMs,
        conversationOutcomeTimeoutMs: this.behaviorConfig.outcomeTimeoutMs,
        dialogueRetryCount: this.behaviorConfig.dialogueRetryCount,
      });
    }
    return new RelayProvider({
      baseUrl: bridgeUrl ?? 'http://localhost:8787',
      timeoutMs: this.behaviorConfig.llmTimeoutMs,
      dialogueTimeoutMs: this.behaviorConfig.dialogueTimeoutMs,
      dailyPlanTimeoutMs: this.behaviorConfig.dailyPlanTimeoutMs,
      cognitionTimeoutMs: this.behaviorConfig.cognitionTimeoutMs,
      conversationOutcomeTimeoutMs: this.behaviorConfig.outcomeTimeoutMs,
      dialogueRetryCount: this.behaviorConfig.dialogueRetryCount,
    });
  }

  private createOpenClawBridgeProvider(): OpenClawBridgeClient {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get('openClawBridgeUrl');
    const bridgeUrl = params.get('bridgeUrl');
    const wsUrl = explicit
      ?? (bridgeUrl?.startsWith('ws://') || bridgeUrl?.startsWith('wss://') ? bridgeUrl : undefined)
      ?? 'ws://localhost:8787';
    return new OpenClawWebSocketProvider({ wsUrl });
  }

  private readBehaviorConfigFromQuery(): typeof DEFAULT_BEHAVIOR_CONFIG {
    const params = new URLSearchParams(window.location.search);
    const numberParam = (name: string, fallback: number): number => {
      const raw = params.get(name);
      if (!raw) return fallback;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      deterministicMovement: params.get('deterministicNpc') === '1',
      socialRadiusTiles: Math.max(1, Math.floor(numberParam('socialRadius', DEFAULT_BEHAVIOR_CONFIG.socialRadiusTiles))),
      socialCooldownMinutes: Math.max(5, Math.floor(numberParam('socialCooldown', DEFAULT_BEHAVIOR_CONFIG.socialCooldownMinutes))),
      socialChancePerTick: Math.max(0, Math.min(1, numberParam('socialChance', DEFAULT_BEHAVIOR_CONFIG.socialChancePerTick))),
      conversationDurationMinutes: Math.max(4, numberParam('conversationMinutes', DEFAULT_BEHAVIOR_CONFIG.conversationDurationMinutes)),
      llmTimeoutMs: Math.max(1000, Math.floor(numberParam('llmTimeoutMs', DEFAULT_BEHAVIOR_CONFIG.llmTimeoutMs))),
      dialogueTimeoutMs: Math.max(800, Math.floor(numberParam('dialogueTimeoutMs', DEFAULT_BEHAVIOR_CONFIG.dialogueTimeoutMs))),
      dailyPlanTimeoutMs: Math.max(1500, Math.floor(numberParam('dailyPlanTimeoutMs', DEFAULT_BEHAVIOR_CONFIG.dailyPlanTimeoutMs))),
      cognitionTimeoutMs: Math.max(1200, Math.floor(numberParam('cognitionTimeoutMs', DEFAULT_BEHAVIOR_CONFIG.cognitionTimeoutMs))),
      outcomeTimeoutMs: Math.max(1200, Math.floor(numberParam('outcomeTimeoutMs', DEFAULT_BEHAVIOR_CONFIG.outcomeTimeoutMs))),
      dialogueRetryCount: Math.max(0, Math.min(2, Math.floor(numberParam('dialogueRetryCount', DEFAULT_BEHAVIOR_CONFIG.dialogueRetryCount)))),
    };
  }

  private rebuildCrowdMap(): void {
    this.crowdTileCounts.clear();
    for (const character of this.characters) {
      const tile = character.getCurrentTile();
      const key = `${tile.x},${tile.y}`;
      this.crowdTileCounts.set(key, (this.crowdTileCounts.get(key) ?? 0) + 1);
    }
  }

  private getCrowdPressure(point: TilePoint, agentId: string): number {
    const key = `${point.x},${point.y}`;
    const occupancy = this.crowdTileCounts.get(key) ?? 0;
    const current = this.getCharacterById(agentId)?.getCurrentTile();
    if (current && current.x === point.x && current.y === point.y) {
      return Math.max(0, occupancy - 1);
    }
    return occupancy;
  }

  private startConversation(
    agentA: string,
    agentB: string,
    depth: ConversationDepth,
    cause: ActiveConversation['cause'],
    pairKey: string,
    now: number,
  ): void {
    const id = `conv_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const topicEnergy = this.topicEnergyByPair.get(pairKey) ?? 100;
    const topicEnergyCost = depth === 'deep' ? 42 : 10;
    const duration = depth === 'deep'
      ? this.behaviorConfig.conversationDurationMinutes * 0.95 * CONVERSATION_PACING_SCALE
      : Math.max(3.5 * CONVERSATION_PACING_SCALE, this.behaviorConfig.conversationDurationMinutes * 0.4 * CONVERSATION_PACING_SCALE);
    const conv: ActiveConversation = {
      id,
      a: agentA,
      b: agentB,
      depth,
      cause,
      pairKey,
      remainingMinutes: duration,
      nextUtteranceAt: now + (depth === 'deep'
        ? CONVERSATION_OPENING_DELAY_DEEP_MIN
        : CONVERSATION_OPENING_DELAY_SMALLTALK_MIN),
      turnIndex: 0,
      topicEnergyCost: Math.min(topicEnergy, topicEnergyCost),
      nextSpeakerId: agentA,
      successfulTurns: 0,
      silentFailures: 0,
      recentLines: [],
    };
    this.activeConversations.set(id, conv);
    this.metrics.conversationStarts += 1;
    this.topicEnergyByPair.set(pairKey, Math.max(0, topicEnergy - conv.topicEnergyCost));
    this.consumeConversationBudget(agentA);
    this.consumeConversationBudget(agentB);

    this.eventBus.publish(createProtocolEvent('AGENT_CONVERSATION_START', {
      taskId: '__social__',
      agentId: agentA,
      summary: `${this.characterNameMap.get(agentA)} started a ${depth} conversation`,
      dialogue: {
        speakerId: agentA,
        listenerId: agentB,
        text: '[conversation_start]',
        conversationId: id,
        turnIndex: conv.turnIndex,
        depth,
        cause,
        priority: depth === 'deep' ? 2 : 1,
        dedupeKey: `${id}:start`,
      },
    }));
  }

  private emitConversationTurn(
    conv: ActiveConversation,
    speakerId: string,
    listenerId: string,
    line: AgentDialogueLine,
  ): void {
    const text = line.surfaceLine?.trim() || line.text?.trim() || '';
    if (!text) return;
    const speaker = this.getCharacterById(speakerId);
    if (speaker) {
      speaker.setStatusText(text);
      speaker.showSpeechBubble(text, 2.4);
    }
    const speakerName = this.characterNameMap.get(speakerId) || speakerId;
    const dedupeKey = `${conv.id}:${conv.turnIndex}:${speakerId}:${listenerId}`;
    const pseudoEvent = createProtocolEvent('AGENT_CONVERSATION_START', {
      taskId: '__social__',
      agentId: speakerId,
      summary: text,
      dialogue: {
        speakerId,
        listenerId,
        text,
        surfaceLine: text,
        emotionTone: line.emotionTone,
        subtext: line.subtext,
        conversationId: conv.id,
        dedupeKey,
      },
    });
    if (!this.shouldThrottleDialogueLog(pseudoEvent)) {
      this.appendRightPanelEntry(
        'dialogues',
        `<span class="agent">${this.escapeHtml(speakerName)}</span>: ${this.escapeHtml(text)}`,
        {
          agentId: speakerId,
          conversationId: conv.id,
          pairKey: conv.pairKey,
          pairLabel: `${this.characterNameMap.get(conv.a) ?? conv.a} ↔ ${this.characterNameMap.get(conv.b) ?? conv.b}`,
        },
      );
    }
    const recent = conv.recentLines ?? [];
    recent.push({ speakerId, text });
    if (recent.length > 6) recent.shift();
    conv.recentLines = recent;
  }

  private async requestConversationTurnLine(
    conv: ActiveConversation,
    speakerId: string,
    listenerId: string,
  ): Promise<AgentDialogueLine | null> {
    const speaker = this.getCharacterById(speakerId);
    const listener = this.getCharacterById(listenerId);
    if (!speaker || !listener || typeof this.bridge.requestDialogueLine !== 'function') {
      return null;
    }
    const place = speaker.getCurrentWaypoint()?.roomId;
    const nowTs = Date.now();
    const allMemories = this.episodicMemoryByAgent.get(speakerId) ?? [];
    const options = {
      relatedAgentId: listenerId,
      currentRoomId: place,
      relationshipAffinity: this.getRelationshipAffinity(speakerId, listenerId),
    };
    const directRecent = retrieveTopMemories(
      this.getRecentPairMemories(speakerId, listenerId, nowTs, 5),
      nowTs,
      3,
      options,
    );
    const broader = retrieveTopMemories(
      allMemories,
      nowTs,
      4,
      options,
    );
    const memories = this.mergeRetrievedMemories(directRecent, broader, 4);
    const style = this.getCharacterConfig(speakerId)?.dialogueStyle;
    const speakerNeeds = speaker.getNeedSnapshot();
    const listenerNeeds = listener.getNeedSnapshot();
    const speakerActivity = speaker.getCurrentActivity();
    const listenerActivity = listener.getCurrentActivity();
    const speakerEngagement = this.getCharacterEngagementContext(speaker);
    const listenerEngagement = this.getCharacterEngagementContext(listener);
    const sharedRecentTopics = this.extractRecentTopics(conv);
    const context: AgentDialogueContext = {
      speakerId,
      listenerId,
      depth: conv.depth,
      turnIndex: conv.turnIndex,
      gameTime: this.schedule.getGameTime(),
      place,
      relationshipAffinity: this.getRelationshipAffinity(speakerId, listenerId),
      speakerNarratives: this.getRuntimeNarratives(speakerId, this.getCharacterConfig(speakerId)?.profile.observerLayer.selfNarratives)
        .sort((a, b) => b.dominance - a.dominance)
        .slice(0, 2)
        .map((narrative) => ({
          id: narrative.id,
          text: narrative.text.split(/\s+/).slice(0, 18).join(' '),
          confidence: narrative.confidence,
          dominance: narrative.dominance,
        })),
      speakerNeeds,
      retrievedMemories: memories.slice(0, 2),
      previousLines: (conv.recentLines ?? []).slice(-4),
      styleHints: style
        ? {
          tone: style.tone,
          avoidTopics: style.avoidTopics,
          signaturePhrases: style.signaturePhrases,
        }
        : undefined,
      semantic: {
        relationshipStage: this.getRelationshipStageLabel(this.getRelationshipAffinity(speakerId, listenerId)),
        speakerNeedsLevel: this.getNeedsLevelLabels(speakerNeeds),
        listenerNeedsLevel: this.getNeedsLevelLabels(listenerNeeds),
        speakerActivity,
        listenerActivity,
        speakerObjectName: speakerEngagement.objectName,
        listenerObjectName: listenerEngagement.objectName,
        speakerImmediateSituation: speakerEngagement.immediateSituation,
        listenerImmediateSituation: listenerEngagement.immediateSituation,
        sharedRecentTopics,
        promptFocus: this.getDialoguePromptFocus(conv, speakerActivity, place),
      },
    };
    this.metrics.dialogueRequests += 1;
    const line = await this.bridge.requestDialogueLine(context);
    const surfaceLine = line?.surfaceLine?.trim() || line?.text?.trim() || '';
    if (!surfaceLine) {
      this.metrics.dialogueFailures += 1;
      this.metrics.dialogueFallbacks += 1;
      return null;
    }
    this.metrics.dialogueSuccess += 1;
    return {
      text: surfaceLine.slice(0, 160),
      surfaceLine: surfaceLine.slice(0, 160),
      emotionTone: line?.emotionTone,
      subtext: line?.subtext,
    };
  }

  private getNeedLevel(value: number): 'low' | 'mid' | 'high' {
    if (value < 0.34) return 'low';
    if (value < 0.67) return 'mid';
    return 'high';
  }

  private getNeedsLevelLabels(needs: {
    energy: number;
    hunger: number;
    socialNeed: number;
    noveltyNeed: number;
    stress: number;
  }): {
    energy: 'low' | 'mid' | 'high';
    stress: 'low' | 'mid' | 'high';
    socialNeed: 'low' | 'mid' | 'high';
    noveltyNeed: 'low' | 'mid' | 'high';
    hunger: 'low' | 'mid' | 'high';
  } {
    return {
      energy: this.getNeedLevel(needs.energy),
      stress: this.getNeedLevel(needs.stress),
      socialNeed: this.getNeedLevel(needs.socialNeed),
      noveltyNeed: this.getNeedLevel(needs.noveltyNeed),
      hunger: this.getNeedLevel(needs.hunger),
    };
  }

  private getRelationshipStageLabel(affinity: number): 'stranger' | 'familiar' | 'friendly' | 'close' | 'tense' | 'hostile' {
    if (affinity <= -60) return 'hostile';
    if (affinity <= -20) return 'tense';
    if (affinity < 15) return 'stranger';
    if (affinity < 35) return 'familiar';
    if (affinity < 65) return 'friendly';
    return 'close';
  }

  private extractRecentTopics(conv: ActiveConversation): string[] {
    const lines = conv.recentLines ?? [];
    const stopwords = new Set([
      'the', 'and', 'with', 'have', 'that', 'this', 'your', 'you', 'are', 'for', 'but', 'just',
      'from', 'into', 'about', 'what', 'when', 'where', 'would', 'could', 'should', 'there', 'here',
      'they', 'them', 'then', 'than', 'were', 'been', 'will', 'want', 'like',
    ]);
    const counts = new Map<string, number>();
    for (const line of lines.slice(-4)) {
      for (const tokenRaw of line.text.toLowerCase().split(/[^a-z0-9]+/)) {
        const token = tokenRaw.trim();
        if (!token || token.length < 4 || stopwords.has(token)) continue;
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([token]) => token);
  }

  private getDialoguePromptFocus(conv: ActiveConversation, speakerActivity: string, place?: string): string {
    if (conv.cause === 'task') return 'coordinate something concrete and actionable';
    if (conv.cause === 'authority') return 'manage disagreement while preserving boundaries';
    if (conv.cause === 'memory') return 'build continuity from prior interactions';
    if (place) return `stay grounded in ${place} while discussing ${speakerActivity}`;
    return `stay grounded in current activity: ${speakerActivity}`;
  }

  private getCharacterEngagementContext(character: Character): {
    objectName?: string;
    affordance?: string;
    immediateSituation: string;
  } {
    const waypoint = character.getCurrentWaypoint();
    const target = character.getActiveInteractionTarget();
    const engagement = this.worldSemantics.describeEngagement(
      waypoint
        ? {
          activity: waypoint.activity,
          roomId: waypoint.roomId,
        }
        : undefined,
      target,
    );
    return {
      objectName: engagement.objectName,
      affordance: engagement.affordance,
      immediateSituation: engagement.immediateSituation,
    };
  }

  private mergeRetrievedMemories(
    primary: RetrievedMemory[],
    secondary: RetrievedMemory[],
    topK: number,
  ): RetrievedMemory[] {
    const merged = [...primary, ...secondary];
    const deduped = new Map<string, RetrievedMemory>();
    for (const entry of merged) {
      const key = `${entry.kind}:${entry.who}:${entry.where}`;
      const existing = deduped.get(key);
      if (!existing || entry.score > existing.score) {
        deduped.set(key, entry);
      }
    }
    return [...deduped.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
  }

  private maybeStartFormulaConversation(now: number): void {
    if (this.schedule.isPaused()) return;
    if (this.activeConversations.size >= MAX_CONCURRENT_CONVERSATIONS) return;
    const gameTime = this.schedule.getGameTime();
    type Candidate = {
      a: Character;
      b: Character;
      pairKey: string;
      depth: ConversationDepth;
      cause: ActiveConversation['cause'];
      score: number;
    };
    const candidates: Candidate[] = [];
    const idleCharacters = this.characters.filter((character) => character.getRuntimeState() === 'idle_life');
    for (let i = 0; i < idleCharacters.length; i += 1) {
      for (let j = i + 1; j < idleCharacters.length; j += 1) {
        const a = idleCharacters[i];
        const b = idleCharacters[j];
        if (this.isInConversation(a.id) || this.isInConversation(b.id)) continue;
        if (!this.hasConversationBudget(a.id, gameTime.day) || !this.hasConversationBudget(b.id, gameTime.day)) continue;
        const strictnessA = this.getCurrentSlotStrictness(a);
        const strictnessB = this.getCurrentSlotStrictness(b);
        const maxStrictness = Math.max(strictnessA, strictnessB);
        if (maxStrictness >= 0.72) continue;
        const ta = a.getCurrentTile();
        const tb = b.getCurrentTile();
        const dist = Math.abs(ta.x - tb.x) + Math.abs(ta.y - tb.y);
        if (dist > Math.max(6, this.behaviorConfig.socialRadiusTiles + 2)) continue;
        const pairKey = this.makePairKey(a.id, b.id);
        const pairCooldownUntil = this.pairCooldownUntil.get(`${pairKey}:smalltalk`) ?? 0;
        const aCooldown = this.socialCooldownUntil.get(a.id) ?? 0;
        const bCooldown = this.socialCooldownUntil.get(b.id) ?? 0;
        if (now < pairCooldownUntil || now < aCooldown || now < bCooldown) continue;
        const affinityAB = this.getRelationshipAffinity(a.id, b.id);
        const affinityBA = this.getRelationshipAffinity(b.id, a.id);
        const affinity = (affinityAB + affinityBA) / 2;
        const needsA = a.getNeedSnapshot();
        const needsB = b.getNeedSnapshot();
        const avgSocialNeed = (needsA.socialNeed + needsB.socialNeed) / 2;
        const avgEnergy = (needsA.energy + needsB.energy) / 2;
        const crowdPenalty = Math.max(0, this.getCrowdPressure(ta, a.id) + this.getCrowdPressure(tb, b.id) - 2) * 0.05;
        const proximity = Math.max(0, 0.22 - dist * 0.07);
        const affinityTerm = Math.max(-0.18, Math.min(0.22, affinity / 120));
        const strictnessPenalty = maxStrictness * 0.35;
        const fatiguePenalty = Math.max(0, 0.3 - avgEnergy) * 0.25;
        const score = FORMULA_CONVERSATION_BASE
          + proximity
          + affinityTerm
          + avgSocialNeed * 0.28
          - strictnessPenalty
          - fatiguePenalty
          - crowdPenalty;
        if (score <= FORMULA_CONVERSATION_THRESHOLD) continue;
        const topicEnergy = this.topicEnergyByPair.get(pairKey) ?? 100;
        const depth: ConversationDepth = topicEnergy >= 35 && affinity >= 38 ? 'deep' : 'smalltalk';
        const cause: ActiveConversation['cause'] = affinity <= -35
          ? 'authority'
          : avgSocialNeed >= 0.75 && affinity >= 15
            ? 'memory'
            : Math.abs(needsA.noveltyNeed - needsB.noveltyNeed) <= 0.12 && avgEnergy >= 0.45
              ? 'task'
              : 'proximity';
        candidates.push({
          a,
          b,
          pairKey,
          depth,
          cause,
          score,
        });
      }
    }
    if (candidates.length === 0) return;
    candidates.sort((x, y) => y.score - x.score);
    const best = candidates[0];
    const roll = Math.random();
    const chance = Math.max(0.05, Math.min(0.82, best.score * FORMULA_CONVERSATION_ROLL_SCALE));
    if (roll > chance) return;
    this.startConversation(best.a.id, best.b.id, best.depth, best.cause, best.pairKey, now);
  }

  private hasConversationBudget(agentId: string, day: number): boolean {
    const budget = this.conversationBudgetByAgent.get(agentId);
    if (!budget || budget.day !== day) return true;
    return budget.remaining > 0;
  }

  private consumeConversationBudget(agentId: string): void {
    const day = this.schedule.getGameTime().day;
    const budget = this.conversationBudgetByAgent.get(agentId);
    if (!budget || budget.day !== day) {
      this.conversationBudgetByAgent.set(agentId, { day, remaining: DAILY_CONVERSATION_BUDGET - 1 });
      return;
    }
    this.conversationBudgetByAgent.set(agentId, { day, remaining: Math.max(0, budget.remaining - 1) });
  }

  private getCurrentSlotStrictness(character: Character): number {
    const waypoint = character.getCurrentWaypoint();
    if (waypoint?.strictness !== undefined) {
      return Math.max(0, Math.min(1, waypoint.strictness));
    }
    if (waypoint?.slotKind === 'class') return 0.9;
    if (waypoint?.slotKind === 'sleep') return 0.96;
    if (waypoint?.slotKind === 'break') return 0.58;
    if (waypoint?.slotKind === 'free') return 0.42;
    if (waypoint?.slotKind === 'private') return 0.38;
    return waypoint?.activity === 'study' ? 0.82 : 0.5;
  }

  private isInConversation(agentId: string): boolean {
    for (const conv of this.activeConversations.values()) {
      if (conv.a === agentId || conv.b === agentId) return true;
    }
    return false;
  }

  private makePairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private coerceSoftActivity(activity?: string): ScheduleWaypoint['activity'] {
    if (!activity) return 'rest';
    const normalized = activity.trim().toLowerCase();
    if (normalized === 'social') return 'rest';
    if ((DAILY_PLAN_ALLOWED_ACTIVITIES as string[]).includes(normalized)) {
      return normalized as ScheduleWaypoint['activity'];
    }
    return 'rest';
  }

  private getSoftPlanDurationMinutes(urgency: number): number {
    const t = Math.max(0, Math.min(1, urgency));
    return Math.round(SHIFT_ACTIVITY_MIN_MINUTES + (SHIFT_ACTIVITY_MAX_MINUTES - SHIFT_ACTIVITY_MIN_MINUTES) * t);
  }

  private shouldApplyShiftActivityIntent(
    agentId: string,
    character: Character,
    payload: AgentCognitionPayload,
    activity: ScheduleWaypoint['activity'],
    roomId: string | undefined,
    urgency: number,
  ): boolean {
    const now = this.schedule.getTotalMinutes();
    if ((this.shiftActivityCooldownUntil.get(agentId) ?? 0) > now) return false;
    if ((payload.confidence ?? 0) < SHIFT_ACTIVITY_MIN_CONFIDENCE) return false;
    if (urgency < SHIFT_ACTIVITY_MIN_URGENCY) return false;

    const currentActivity = this.coerceSoftActivity(character.getCurrentActivity());
    const currentRoomId = character.getCurrentWaypoint()?.roomId;
    if (activity === currentActivity && (!roomId || roomId === currentRoomId)) {
      return false;
    }

    return true;
  }

  private updateSocialConversations(deltaMinutes: number): void {
    const now = this.schedule.getTotalMinutes();
    const pairRegeneration = deltaMinutes * 0.35;
    for (const [pairKey, energy] of this.topicEnergyByPair.entries()) {
      this.topicEnergyByPair.set(pairKey, Math.min(100, energy + pairRegeneration));
    }

    for (const [id, conv] of this.activeConversations) {
      const speakerA = this.getCharacterById(conv.a);
      const speakerB = this.getCharacterById(conv.b);
      if (!speakerA || !speakerB) {
        conv.remainingMinutes = 0;
        conv.silentFailures = MAX_SILENT_FAILURES_PER_CONVERSATION;
      } else {
        const tileA = speakerA.getCurrentTile();
        const tileB = speakerB.getCurrentTile();
        const distance = Math.abs(tileA.x - tileB.x) + Math.abs(tileA.y - tileB.y);
        const maxConversationDistance = this.behaviorConfig.socialRadiusTiles + 2;
        if (distance > maxConversationDistance) {
          // Agents walked too far apart; end this thread instead of remote-talking.
          conv.remainingMinutes = 0;
          conv.silentFailures = MAX_SILENT_FAILURES_PER_CONVERSATION;
        } else {
          const anchorRoom = speakerA.getCurrentWaypoint()?.roomId ?? speakerB.getCurrentWaypoint()?.roomId;
          if (this.getCurrentSlotStrictness(speakerA) < 0.88) {
            speakerA.setAutonomyDirective('rest', anchorRoom, Math.max(4, Math.min(14, conv.remainingMinutes + 2)));
          }
          if (this.getCurrentSlotStrictness(speakerB) < 0.88) {
            speakerB.setAutonomyDirective('rest', anchorRoom, Math.max(4, Math.min(14, conv.remainingMinutes + 2)));
          }
        }
      }
      conv.remainingMinutes -= deltaMinutes;
      if (now >= conv.nextUtteranceAt && conv.remainingMinutes > 0) {
        if (!this.tryAcquireDialogueSlot(now)) {
          this.metrics.dialogueSuppressed += 1;
          conv.nextUtteranceAt = now + 1.1 + Math.random() * 1.4;
          continue;
        }
        conv.nextUtteranceAt = now
          + (conv.depth === 'deep' ? CONVERSATION_REPLY_DELAY_DEEP_MIN : CONVERSATION_REPLY_DELAY_SMALLTALK_MIN)
          + Math.random() * (conv.depth === 'deep' ? 2.4 : 1.9);
        const speakerId = conv.nextSpeakerId === conv.b ? conv.b : conv.a;
        const listenerId = speakerId === conv.a ? conv.b : conv.a;
        this.requestConversationTurnLine(conv, speakerId, listenerId)
          .then((line) => {
            if (!this.activeConversations.has(id)) return;
            if (line) {
              conv.turnIndex += 1;
              conv.successfulTurns += 1;
              conv.silentFailures = 0;
              conv.nextSpeakerId = listenerId;
              this.emitConversationTurn(conv, speakerId, listenerId, line);
              this.onDialogueRequestSuccess(now);
            } else {
              conv.silentFailures += 1;
              conv.nextUtteranceAt = now + 1.4 + Math.random() * 1.8;
              this.onDialogueRequestFailure(now);
            }
          })
          .catch(() => {
            if (this.activeConversations.has(id)) {
              conv.silentFailures += 1;
              conv.nextUtteranceAt = now + 1.6 + Math.random() * 1.9;
            }
            this.onDialogueRequestFailure(now);
          })
          .finally(() => {
            this.releaseDialogueSlot();
          });
      }
      const minTurns = conv.depth === 'deep' ? MIN_SUCCESS_TURNS_DEEP : MIN_SUCCESS_TURNS_SMALLTALK;
      const canEndNaturally = conv.successfulTurns >= minTurns;
      const forceEndBySilence = conv.silentFailures >= MAX_SILENT_FAILURES_PER_CONVERSATION;
      if (conv.remainingMinutes <= 0 && !canEndNaturally && !forceEndBySilence) {
        conv.remainingMinutes = 0.9;
      }
      if (conv.remainingMinutes <= 0 && (canEndNaturally || forceEndBySilence)) {
        this.activeConversations.delete(id);
        const pairAffinity = (this.getRelationshipAffinity(conv.a, conv.b) + this.getRelationshipAffinity(conv.b, conv.a)) / 2;
        const deepCooldownMinutes = this.computeDeepCooldownMinutes(pairAffinity, conv.pairKey);
        const cooldownMinutes = conv.depth === 'deep' ? deepCooldownMinutes : SMALLTALK_BASE_COOLDOWN_MINUTES;
        const pairCooldownKey = `${conv.pairKey}:${conv.depth}`;
        const cooldownEnd = now + cooldownMinutes;
        this.pairCooldownUntil.set(pairCooldownKey, cooldownEnd);
        this.socialCooldownUntil.set(conv.a, now + Math.max(5, cooldownMinutes * 0.45));
        this.socialCooldownUntil.set(conv.b, now + Math.max(5, cooldownMinutes * 0.45));
        this.applyConversationOutcome(conv);
        this.eventBus.publish(createProtocolEvent('AGENT_CONVERSATION_END', {
          taskId: '__social__',
          agentId: conv.a,
          summary: 'Conversation ended',
          dialogue: {
            speakerId: conv.a,
            listenerId: conv.b,
            text: '[conversation_end]',
            conversationId: id,
            turnIndex: conv.turnIndex + 1,
            depth: conv.depth,
            cause: conv.cause,
            priority: conv.depth === 'deep' ? 2 : 1,
            dedupeKey: `${id}:end`,
          },
        }));
        this.eventBus.publish(createProtocolEvent('AGENT_CONVERSATION_END', {
          taskId: '__social__',
          agentId: conv.b,
          summary: 'Conversation ended',
          dialogue: {
            speakerId: conv.b,
            listenerId: conv.a,
            text: '[conversation_end]',
            conversationId: id,
            turnIndex: conv.turnIndex + 1,
            depth: conv.depth,
            cause: conv.cause,
            priority: conv.depth === 'deep' ? 2 : 1,
            dedupeKey: `${id}:end:listener`,
          },
        }));
      }
    }
  }

  private tryAcquireDialogueSlot(now: number): boolean {
    if (this.dialogueRequestsInFlight >= DIALOGUE_MAX_IN_FLIGHT) return false;
    if (now < this.nextDialogueRequestAt) return false;
    if (now < this.dialogueBackoffUntil) return false;
    this.dialogueRequestsInFlight += 1;
    this.nextDialogueRequestAt = now + DIALOGUE_REQUEST_SPACING_MINUTES;
    return true;
  }

  private releaseDialogueSlot(): void {
    this.dialogueRequestsInFlight = Math.max(0, this.dialogueRequestsInFlight - 1);
  }

  private onDialogueRequestSuccess(now: number): void {
    this.dialogueFailureStreak = 0;
    if (this.dialogueBackoffUntil > now) {
      this.dialogueBackoffUntil = now;
    }
  }

  private onDialogueRequestFailure(now: number): void {
    this.dialogueFailureStreak = Math.min(7, this.dialogueFailureStreak + 1);
    const backoff = Math.min(
      DIALOGUE_BACKOFF_MAX_MINUTES,
      DIALOGUE_BACKOFF_BASE_MINUTES * Math.pow(1.75, this.dialogueFailureStreak - 1),
    );
    this.dialogueBackoffUntil = Math.max(this.dialogueBackoffUntil, now + backoff);
  }

  private computeDeepCooldownMinutes(pairAffinity: number, pairKey: string): number {
    const topicEnergy = this.topicEnergyByPair.get(pairKey) ?? 100;
    const affinityTerm = pairAffinity >= 0 ? -(pairAffinity * 0.6) : Math.abs(pairAffinity) * 0.2;
    const energyTerm = topicEnergy < 35 ? 26 : 0;
    const spamTerm = 14;
    const cooldown = DEEP_BASE_COOLDOWN_MINUTES + affinityTerm + energyTerm + spamTerm;
    return Math.max(45, Math.min(180, cooldown));
  }

  private applyConversationOutcome(conv: ActiveConversation): void {
    if (
      this.llmConversationOutcomeEnabled
      && typeof this.bridge.requestConversationOutcome === 'function'
      && !this.degradedModeActive
    ) {
      const context = this.buildConversationOutcomeContext(conv);
      this.metrics.outcomeRequests += 1;
      this.bridge.requestConversationOutcome(context)
        .then((outcome) => {
          if (!outcome) {
            this.metrics.outcomeFailures += 1;
            this.metrics.outcomeFallbacks += 1;
            this.applyConversationOutcomeFallback(conv);
            return;
          }
          this.applyConversationOutcomeFromPayload(conv, outcome);
        })
        .catch(() => {
          this.metrics.outcomeFailures += 1;
          this.metrics.outcomeFallbacks += 1;
          this.applyConversationOutcomeFallback(conv);
        });
      return;
    }
    this.metrics.outcomeFallbacks += 1;
    this.applyConversationOutcomeFallback(conv);
  }

  private applyConversationOutcomeFallback(conv: ActiveConversation): void {
    const now = Date.now();
    const pairAffinity = (this.getRelationshipAffinity(conv.a, conv.b) + this.getRelationshipAffinity(conv.b, conv.a)) / 2;
    const baseDelta = conv.depth === 'deep' ? 4 : 2;
    const volatility = Math.max(0.2, Math.min(1.2, 1 - Math.abs(pairAffinity) / 120));
    const warmupScale = this.getConversationWarmupScale(conv.a, conv.b);
    const impressionScale = this.getConversationImpressionScale(conv.a, conv.b);
    const directionalBase = baseDelta * volatility;
    const directional = directionalBase > 0 ? directionalBase * warmupScale : directionalBase;
    this.applyRelationshipDeltaProgressive(conv.a, conv.b, directional, now);
    this.applyRelationshipDeltaProgressive(conv.b, conv.a, directional * 0.9, now);
    const charA = this.getCharacterById(conv.a);
    const charB = this.getCharacterById(conv.b);
    const socialRelief = conv.depth === 'deep' ? -0.09 : -0.06;
    const energyCost = conv.depth === 'deep' ? -0.04 : -0.02;
    const stressDelta = directional >= 0 ? -0.05 : 0.07;
    charA?.applySocialOutcomeDelta({
      socialNeed: socialRelief,
      energy: energyCost,
      stress: stressDelta,
    });
    charB?.applySocialOutcomeDelta({
      socialNeed: socialRelief,
      energy: energyCost,
      stress: stressDelta,
    });

    const memoryImportanceBase = conv.depth === 'deep' ? 0.78 : 0.52;
    const affectBase = conv.depth === 'deep' ? 0.28 : 0.12;
    const memoryImportance = memoryImportanceBase * impressionScale;
    const affect = affectBase * impressionScale;
    this.eventBus.publish(createProtocolEvent('AGENT_MEMORY', {
      taskId: '__social__',
      agentId: conv.a,
      summary: 'Noted social interaction',
      dialogue: {
        speakerId: conv.a,
        listenerId: conv.b,
        text: 'Memory trace: social interaction',
        conversationId: conv.id,
        depth: conv.depth,
        cause: conv.cause,
      },
      memory: {
        id: `mem_social_${now}_${Math.random().toString(16).slice(2, 6)}`,
        agentId: conv.a,
        taskId: '__social__',
        timestamp: now,
        kind: 'dialogue',
        content: `${conv.depth} talk with ${this.characterNameMap.get(conv.b) ?? conv.b} [outcomeTag:social_turn]`,
        importance: memoryImportance,
      },
    }));
    this.eventBus.publish(createProtocolEvent('AGENT_MEMORY', {
      taskId: '__social__',
      agentId: conv.b,
      summary: 'Noted social interaction',
      dialogue: {
        speakerId: conv.b,
        listenerId: conv.a,
        text: 'Memory trace: social interaction',
        conversationId: conv.id,
        depth: conv.depth,
        cause: conv.cause,
      },
      memory: {
        id: `mem_social_${now}_${Math.random().toString(16).slice(2, 6)}_b`,
        agentId: conv.b,
        taskId: '__social__',
        timestamp: now,
        kind: 'dialogue',
        content: `${conv.depth} talk with ${this.characterNameMap.get(conv.a) ?? conv.a} [outcomeTag:social_turn]`,
        importance: memoryImportance,
      },
    }));

    const episodicA = this.episodicMemoryByAgent.get(conv.a) ?? [];
    const episodicB = this.episodicMemoryByAgent.get(conv.b) ?? [];
    const entryA: EpisodicMemoryEntry = {
      ts: now,
      kind: 'social_contact',
      who: conv.b,
      where: '__social__',
      affect,
      importance: memoryImportance,
    };
    const entryB: EpisodicMemoryEntry = {
      ts: now,
      kind: 'social_contact',
      who: conv.a,
      where: '__social__',
      affect,
      importance: memoryImportance,
    };
    this.episodicMemoryByAgent.set(conv.a, appendEpisodicMemory(episodicA, entryA, now));
    this.episodicMemoryByAgent.set(conv.b, appendEpisodicMemory(episodicB, entryB, now));
  }

  private buildConversationOutcomeContext(conv: ActiveConversation): AgentConversationOutcomeContext {
    const now = Date.now();
    const speakerA = this.getCharacterById(conv.a);
    const speakerB = this.getCharacterById(conv.b);
    const place = speakerA?.getCurrentWaypoint()?.roomId ?? speakerB?.getCurrentWaypoint()?.roomId;
    const relationshipAB = this.getRelationshipAffinity(conv.a, conv.b);
    const relationshipBA = this.getRelationshipAffinity(conv.b, conv.a);
    const retrievedA = retrieveTopMemories(
      this.episodicMemoryByAgent.get(conv.a) ?? [],
      now,
      3,
      { relatedAgentId: conv.b, currentRoomId: place, relationshipAffinity: relationshipAB },
    );
    const retrievedB = retrieveTopMemories(
      this.episodicMemoryByAgent.get(conv.b) ?? [],
      now,
      3,
      { relatedAgentId: conv.a, currentRoomId: place, relationshipAffinity: relationshipBA },
    );
    return {
      conversationId: conv.id,
      depth: conv.depth,
      cause: conv.cause,
      speakerAId: conv.a,
      speakerBId: conv.b,
      relationshipAB,
      relationshipBA,
      place,
      gameTime: this.schedule.getGameTime(),
      recentLines: conv.recentLines ?? [],
      speakerANeeds: speakerA?.getNeedSnapshot(),
      speakerBNeeds: speakerB?.getNeedSnapshot(),
      retrievedMemoriesA: retrievedA,
      retrievedMemoriesB: retrievedB,
    };
  }

  private applyConversationOutcomeFromPayload(
    conv: ActiveConversation,
    payload: AgentConversationOutcomePayload,
  ): void {
    const now = Date.now();
    const warmupScale = this.getConversationWarmupScale(conv.a, conv.b);
    const impressionScale = this.getConversationImpressionScale(conv.a, conv.b);
    for (const delta of payload.relationshipDeltas ?? []) {
      const adjustedDelta = delta.delta > 0 ? delta.delta * warmupScale : delta.delta;
      this.applyRelationshipDeltaProgressive(delta.fromId, delta.toId, adjustedDelta, now);
    }
    const speakerA = this.getCharacterById(conv.a);
    const speakerB = this.getCharacterById(conv.b);
    const affectValues = (payload.memoryAppraisals ?? [])
      .map((entry) => {
        const affect = Number(entry.affect);
        if (!Number.isFinite(affect)) return affect;
        return affect > 0 ? affect * impressionScale : affect;
      })
      .filter((value) => Number.isFinite(value));
    const avgAffect = affectValues.length > 0
      ? affectValues.reduce((sum, value) => sum + value, 0) / affectValues.length
      : 0;
    const stressDelta = -Math.max(-0.12, Math.min(0.12, avgAffect * 0.08));
    const socialNeedDelta = -Math.max(0.02, conv.depth === 'deep' ? 0.1 : 0.06);
    const energyDelta = conv.depth === 'deep' ? -0.04 : -0.02;
    speakerA?.applySocialOutcomeDelta({ socialNeed: socialNeedDelta, stress: stressDelta, energy: energyDelta });
    speakerB?.applySocialOutcomeDelta({ socialNeed: socialNeedDelta, stress: stressDelta, energy: energyDelta });
    for (const appraisal of payload.memoryAppraisals ?? []) {
      const summary = appraisal.summary?.trim() || `Noted ${appraisal.kind} interaction`;
      const content = appraisal.content?.trim()
        || `${conv.depth} talk with ${this.characterNameMap.get(appraisal.targetAgentId) ?? appraisal.targetAgentId} [outcomeTag:llm]`;
      const memory: AgentMemoryEntry = {
        id: `mem_social_${now}_${Math.random().toString(16).slice(2, 6)}_${appraisal.agentId}`,
        agentId: appraisal.agentId,
        taskId: '__social__',
        timestamp: now,
        kind: 'dialogue',
        content,
        importance: Math.max(0, Math.min(1, appraisal.importance * (appraisal.affect >= 0 ? impressionScale : 1))),
        appraisal: {
          kind: appraisal.kind,
          affect: Math.max(-1, Math.min(1, appraisal.affect * (appraisal.affect > 0 ? impressionScale : 1))),
          importance: Math.max(0, Math.min(1, appraisal.importance * (appraisal.affect >= 0 ? impressionScale : 1))),
          confidence: appraisal.confidence,
          targetAgentId: appraisal.targetAgentId,
          where: appraisal.where ?? '__social__',
        },
      };
      this.eventBus.publish(createProtocolEvent('AGENT_MEMORY', {
        taskId: '__social__',
        agentId: appraisal.agentId,
        summary,
        dialogue: {
          speakerId: appraisal.agentId,
          listenerId: appraisal.targetAgentId,
          text: content.slice(0, 160),
          conversationId: conv.id,
          depth: conv.depth,
          cause: conv.cause,
        },
        memory,
      }));
      const episodic = this.episodicMemoryByAgent.get(appraisal.agentId) ?? [];
      this.episodicMemoryByAgent.set(
        appraisal.agentId,
        appendEpisodicMemory(episodic, {
          ts: now,
          kind: appraisal.kind as EpisodicMemoryKind,
          who: appraisal.targetAgentId,
          where: appraisal.where ?? '__social__',
          affect: Math.max(-1, Math.min(1, appraisal.affect * (appraisal.affect > 0 ? impressionScale : 1))),
          importance: Math.max(0, Math.min(1, appraisal.importance * (appraisal.affect >= 0 ? impressionScale : 1))),
        }, now),
      );
    }
  }

  private ingestCognitionEvent(event: AgentProtocolEvent): void {
    if (!event.agentId) return;
    const now = event.timestamp || Date.now();
    if (event.cognition) {
      this.cognitionByAgent.set(event.agentId, { ...event.cognition, updatedAt: now });
    }
    if (event.memory) {
      const entries = this.memoryByAgent.get(event.agentId) ?? [];
      entries.push(event.memory);
      if (entries.length > 100) {
        entries.splice(0, entries.length - 100);
      }
      this.memoryByAgent.set(event.agentId, entries);
    }
    const episodic = this.normalizeToEpisodicMemory(event);
    if (episodic) {
      const existing = this.episodicMemoryByAgent.get(event.agentId) ?? [];
      const nextMemory = appendEpisodicMemory(existing, episodic, now);
      this.episodicMemoryByAgent.set(event.agentId, nextMemory);
      const runtimeNarratives = this.getRuntimeNarratives(
        event.agentId,
        this.getCharacterConfig(event.agentId)?.profile.observerLayer.selfNarratives,
      );
      const updatedNarratives = evaluateSelfNarratives(runtimeNarratives, nextMemory, now);
      this.selfNarrativesByAgent.set(event.agentId, updatedNarratives);
    }
  }

  private normalizeToEpisodicMemory(event: AgentProtocolEvent): EpisodicMemoryEntry | null {
    if (!event.agentId) return null;
    const ts = event.timestamp || Date.now();
    const who = event.dialogue?.listenerId ?? event.agentId;
    const where = event.taskId ?? 'campus';
    const appraisal = event.memory?.appraisal;
    if (event.type === 'AGENT_MEMORY' && appraisal) {
      const kind = (appraisal.kind ?? 'observation') as EpisodicMemoryKind;
      return {
        ts,
        kind,
        who: appraisal.targetAgentId ?? who,
        where: appraisal.where ?? where,
        affect: Math.max(-1, Math.min(1, Number(appraisal.affect ?? 0))),
        importance: Math.max(0, Math.min(1, Number(appraisal.importance ?? event.memory?.importance ?? 0.5))),
      };
    }
    if (event.type === 'AGENT_CONVERSATION_START') {
      return { ts, kind: 'social_contact', who, where, affect: 0.2, importance: 0.42 };
    }
    if (event.type === 'AGENT_CONVERSATION_END') {
      return { ts, kind: 'social_contact', who, where, affect: 0.05, importance: 0.35 };
    }
    if (event.type === 'AGENT_MEMORY' && event.memory) {
      const kindMap: Record<AgentMemoryEntry['kind'], EpisodicMemoryKind> = {
        observation: 'observation',
        plan: 'observation',
        dialogue: 'social_contact',
        reflection: 'reflection',
        result: 'task_success',
      };
      const affectByKind: Record<AgentMemoryEntry['kind'], number> = {
        observation: 0,
        plan: 0.05,
        dialogue: 0.15,
        reflection: 0.1,
        result: 0.35,
      };
      return {
        ts,
        kind: kindMap[event.memory.kind],
        who,
        where,
        affect: affectByKind[event.memory.kind],
        importance: Math.max(0, Math.min(1, event.memory.importance ?? 0.5)),
      };
    }
    return null;
  }

  private normalizeLoadedCognitionMap(
    raw: Map<string, {
      privateReason?: string;
      feltThought?: string;
      surfaceLine?: string;
      emotionTone?: string;
      subtext?: string;
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
    }>,
  ): Map<string, AgentCognitionPayload & { updatedAt: number }> {
    const allowedActions = new Set<AgentPlanIntentAction>(['stay', 'talk', 'shift_activity', 'reflect']);
    const result = new Map<string, AgentCognitionPayload & { updatedAt: number }>();
    for (const [agentId, cognition] of raw.entries()) {
      const feltThought = typeof cognition?.feltThought === 'string'
        ? cognition.feltThought.trim()
        : (typeof cognition?.thoughtText === 'string' ? cognition.thoughtText.trim() : '');
      const privateReason = typeof cognition?.privateReason === 'string'
        ? cognition.privateReason.trim()
        : feltThought;
      const action = cognition?.planIntent?.action;
      if (!feltThought || !privateReason || !action || !allowedActions.has(action as AgentPlanIntentAction)) {
        continue;
      }
      result.set(agentId, {
        privateReason,
        feltThought,
        thoughtText: feltThought,
        surfaceLine: typeof cognition.surfaceLine === 'string'
          ? cognition.surfaceLine
          : (typeof cognition.dialogueText === 'string' ? cognition.dialogueText : undefined),
        dialogueText: typeof cognition.dialogueText === 'string'
          ? cognition.dialogueText
          : (typeof cognition.surfaceLine === 'string' ? cognition.surfaceLine : undefined),
        emotionTone: this.normalizeToneToken(cognition.emotionTone),
        subtext: this.normalizeSubtextToken(cognition.subtext),
        planIntent: {
          action: action as AgentPlanIntentAction,
          activity: cognition.planIntent.activity,
          targetAgentId: cognition.planIntent.targetAgentId,
          roomId: cognition.planIntent.roomId,
          reason: cognition.planIntent.reason,
          urgency: cognition.planIntent.urgency,
        },
        confidence: cognition.confidence,
        priority: cognition.priority,
        updatedAt: Number.isFinite(cognition.updatedAt) ? cognition.updatedAt : Date.now(),
      });
    }
    return result;
  }

  private normalizeToneToken(value: string | undefined): AgentEmotionTone | undefined {
    if (!value) return undefined;
    const allowed = new Set<AgentEmotionTone>(['guarded', 'warm', 'uneasy', 'playful', 'flat', 'tense']);
    return allowed.has(value as AgentEmotionTone) ? (value as AgentEmotionTone) : undefined;
  }

  private normalizeSubtextToken(value: string | undefined): AgentCognitionPayload['subtext'] {
    if (!value) return undefined;
    const allowed = new Set<NonNullable<AgentCognitionPayload['subtext']>>([
      'seeking_contact',
      'avoiding_exposure',
      'testing',
      'masking',
      'reassuring',
    ]);
    return allowed.has(value as NonNullable<AgentCognitionPayload['subtext']>)
      ? (value as NonNullable<AgentCognitionPayload['subtext']>)
      : undefined;
  }

  private updateCognition(scheduleTotalMinutes: number): void {
    if (this.schedule.isPaused()) return;
    if (typeof this.bridge.requestCognition !== 'function') return;
    if (this.degradedModeActive) return;
    for (const character of this.characters) {
      if (!this.shouldRequestCognition(character, scheduleTotalMinutes)) continue;
      this.requestAndApplyCognition(character, scheduleTotalMinutes);
    }
  }

  private shouldRequestCognition(character: Character, scheduleTotalMinutes: number): boolean {
    const agentId = character.id;
    if (this.cognitionInFlight.has(agentId)) return false;
    const cooldownUntil = this.cognitionCooldownUntil.get(agentId) ?? 0;
    if (scheduleTotalMinutes < cooldownUntil) return false;
    if (character.getRuntimeState() !== 'idle_life') return false;
    if (this.isInConversation(agentId)) return false;
    const strictness = this.getCurrentSlotStrictness(character);
    if (strictness >= 0.72) return false;
    return true;
  }

  private requestAndApplyCognition(character: Character, scheduleTotalMinutes: number): void {
    const agentId = character.id;
    const jitter = Math.random() * COGNITION_INTERVAL_JITTER_MINUTES;
    this.cognitionCooldownUntil.set(agentId, scheduleTotalMinutes + COGNITION_INTERVAL_MINUTES + jitter);
    this.cognitionInFlight.add(agentId);
    const context = this.buildCognitionContext(character);

    this.bridge.requestCognition?.(context)
      .then((payload) => {
        if (!payload) {
          this.metrics.cognitionFailures += 1;
          this.setDegradedMode('cognition_unavailable');
          return;
        }
        this.degradedModeActive = false;
        this.degradedModeReason = null;
        this.degradedStatusLogged = false;
        this.applyCognition(agentId, payload);
      })
      .catch(() => {
        this.metrics.cognitionFailures += 1;
        this.setDegradedMode('cognition_error');
      })
      .finally(() => {
        this.cognitionInFlight.delete(agentId);
      });
  }

  private buildCognitionContext(character: Character): AgentCognitionContext {
    const gameTime = this.schedule.getGameTime();
    const agentId = character.id;
    const currentTile = character.getCurrentTile();
    const engagement = this.getCharacterEngagementContext(character);
    const nearbyAgents = this.characters
      .filter((other) => other.id !== agentId)
      .map((other) => {
        const tile = other.getCurrentTile();
        return {
          id: other.id,
          name: other.name,
          distanceTiles: Math.abs(tile.x - currentTile.x) + Math.abs(tile.y - currentTile.y),
        };
      })
      .sort((a, b) => a.distanceTiles - b.distanceTiles)
      .slice(0, 4);
    const roomId = character.getCurrentWaypoint()?.roomId;
    const recentThoughts = (this.memoryByAgent.get(agentId) ?? [])
      .slice(-4)
      .map((entry) => entry.content);
    const episodicSummary = (this.episodicMemoryByAgent.get(agentId) ?? [])
      .slice(0, 4)
      .map((entry) => `${entry.kind} with ${entry.who} at ${entry.where}`);
    const primaryRelated = nearbyAgents[0];
    const retrievedMemories = retrieveTopMemories(
      this.episodicMemoryByAgent.get(agentId) ?? [],
      Date.now(),
      4,
      {
        relatedAgentId: primaryRelated?.id,
        currentRoomId: roomId,
        relationshipAffinity: primaryRelated ? this.getRelationshipAffinity(agentId, primaryRelated.id) : 0,
      },
    );
    const relationships = this.characters
      .filter((other) => other.id !== agentId)
      .map((other) => ({ otherId: other.id, affinity: this.getRelationshipAffinity(agentId, other.id) }))
      .sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity))
      .slice(0, 5);
    const narratives = this.getRuntimeNarratives(
      agentId,
      this.getCharacterConfig(agentId)?.profile.observerLayer.selfNarratives,
    ).map((entry) => ({
      id: entry.id,
      text: entry.text,
      confidence: entry.confidence,
      dominance: entry.dominance,
    }));

    return {
      agentId,
      gameTime: {
        day: gameTime.day,
        weekdayName: gameTime.weekdayName,
        hours: gameTime.hours,
        minutes: gameTime.minutes,
      },
      runtime: {
        state: character.getRuntimeState(),
        statusText: character.getStatusText(),
        currentActivity: character.getCurrentActivity(),
        currentRoomId: roomId,
        currentObjectName: engagement.objectName,
        currentAffordance: engagement.affordance,
        immediateSituation: engagement.immediateSituation,
        nearbyAgents,
        needs: character.getNeedSnapshot(),
        degradedMode: this.degradedModeActive,
      },
      memory: {
        recentThoughts,
        episodicSummary,
        retrievedMemories,
      },
      relationships,
      narratives,
    };
  }

  private applyCognition(agentId: string, payload: AgentCognitionPayload): void {
    const now = Date.now();
    const character = this.getCharacterById(agentId);
    const feltThought = payload.feltThought?.trim() || payload.thoughtText?.trim() || '';
    const privateReason = payload.privateReason?.trim() || feltThought;
    const surfaceLine = payload.surfaceLine?.trim() || payload.dialogueText?.trim() || undefined;
    const normalizedPayload: AgentCognitionPayload = {
      ...payload,
      privateReason,
      feltThought,
      thoughtText: feltThought,
      surfaceLine,
      dialogueText: surfaceLine,
    };
    this.cognitionByAgent.set(agentId, { ...normalizedPayload, updatedAt: now });
    this.eventBus.publish(createProtocolEvent('AGENT_COGNITION', {
      taskId: '__cognition__',
      agentId,
      summary: feltThought,
      cognition: normalizedPayload,
    }));
    if (!character || character.getRuntimeState() !== 'idle_life') return;

    character.setStatusText(this.getPlanStatusText(normalizedPayload));
    // Avoid auto-speaking cognition snippets (e.g. generic morning greetings at startup).
    // Spoken bubbles should come from explicit conversation turns only.
    if (normalizedPayload.planIntent.action === 'shift_activity' && this.isInConversation(agentId)) {
      return;
    }

    if (normalizedPayload.planIntent.action === 'talk') {
      if (new URLSearchParams(window.location.search).get('llmTalkIntent') === '1') {
        this.applyTalkIntent(agentId, normalizedPayload);
      }
      // Conversation triggering defaults to formula-driven (non-LLM).
      return;
    }
    if (normalizedPayload.planIntent.action === 'shift_activity') {
      const strictness = this.getCurrentSlotStrictness(character);
      if (strictness >= 0.92) {
        return;
      }
      const activity = this.coerceSoftActivity(normalizedPayload.planIntent.activity);
      const urgency = Math.max(
        0.12,
        Math.min(
          1,
          Number(normalizedPayload.priority ?? 0.5) * 0.55 + Number(normalizedPayload.confidence ?? 0.5) * 0.45,
        ),
      );
      const duration = this.getSoftPlanDurationMinutes(urgency);
      const homeRoom = this.getHomeRoomId(agentId);
      const roomId = normalizedPayload.planIntent.roomId || this.getPlanRoomForActivity(activity, homeRoom);
      if (!this.shouldApplyShiftActivityIntent(agentId, character, normalizedPayload, activity, roomId, urgency)) {
        return;
      }
      character.setAutonomyDirective(activity, roomId, duration);
      this.shiftActivityCooldownUntil.set(agentId, this.schedule.getTotalMinutes() + SHIFT_ACTIVITY_COOLDOWN_MINUTES);
    }
    if (normalizedPayload.planIntent.action === 'reflect') {
      this.eventBus.publish(createProtocolEvent('AGENT_MEMORY', {
        taskId: '__cognition__',
        agentId,
        summary: privateReason,
        memory: {
          id: `mem_reflect_${now}_${Math.random().toString(16).slice(2, 6)}`,
          agentId,
          taskId: '__cognition__',
          timestamp: now,
          kind: 'reflection',
          content: privateReason,
          importance: 0.44,
        },
      }));
    }
  }

  private getPlanStatusText(payload: AgentCognitionPayload): string {
    const action = payload.planIntent.action;
    if (action === 'talk' && payload.planIntent.targetAgentId) {
      const target = this.characterNameMap.get(payload.planIntent.targetAgentId) ?? payload.planIntent.targetAgentId;
      return `Looking for ${target}`;
    }
    if (action === 'shift_activity') {
      const activity = payload.planIntent.activity ? this.formatActivityStatus(payload.planIntent.activity) : 'Activity';
      return `Planning: ${activity}`;
    }
    if (action === 'reflect') {
      return 'Reflecting';
    }
    return `Staying in ${this.formatActivityStatus(payload.planIntent.activity ?? 'rest')}`;
  }

  private applyTalkIntent(agentId: string, payload: AgentCognitionPayload): void {
    const speaker = this.getCharacterById(agentId);
    const targetId = payload.planIntent.targetAgentId;
    if (!speaker || !targetId) return;
    const target = this.getCharacterById(targetId);
    if (!target) {
      this.registerTalkFailure('target_busy');
      return;
    }
    const speakerTile = speaker.getCurrentTile();
    const targetTile = target.getCurrentTile();
    const distance = Math.abs(speakerTile.x - targetTile.x) + Math.abs(speakerTile.y - targetTile.y);
    const now = this.schedule.getTotalMinutes();
    const speakerStrictness = this.getCurrentSlotStrictness(speaker);
    const targetStrictness = this.getCurrentSlotStrictness(target);
    if (speakerStrictness >= 0.93 || targetStrictness >= 0.93) {
      this.registerTalkFailure('strictness_interrupt');
      return;
    }

    if (
      distance <= this.behaviorConfig.socialRadiusTiles &&
      !this.isInConversation(agentId) &&
      !this.isInConversation(targetId) &&
      this.activeConversations.size < MAX_CONCURRENT_CONVERSATIONS &&
      speakerStrictness < 0.93 &&
      targetStrictness < 0.93
    ) {
      const pairKey = this.makePairKey(agentId, targetId);
      const pairCooldownKey = `${pairKey}:smalltalk`;
      const pairCooldownUntil = this.pairCooldownUntil.get(pairCooldownKey) ?? 0;
      const speakerCooldownUntil = this.socialCooldownUntil.get(agentId) ?? 0;
      const targetCooldownUntil = this.socialCooldownUntil.get(targetId) ?? 0;
      if (now >= pairCooldownUntil && now >= speakerCooldownUntil && now >= targetCooldownUntil) {
        this.startConversation(agentId, targetId, 'smalltalk', 'proximity', pairKey, now);
        this.metrics.talkIntentSuccess += 1;
        return;
      }
      this.registerTalkFailure('target_busy');
      return;
    }

    const targetRoom = target.getCurrentWaypoint()?.roomId;
    speaker.setPursuitTarget(targetTile.x, targetTile.y, targetRoom);
    speaker.setAutonomyDirective('rest', targetRoom, 55);
    this.registerTalkFailure(distance > 16 ? 'path_blocked' : 'target_busy');
  }

  private registerTalkFailure(reason: 'target_busy' | 'path_blocked' | 'strictness_interrupt'): void {
    this.metrics.talkIntentFailure += 1;
    this.metrics.talkFailureReasons.set(reason, (this.metrics.talkFailureReasons.get(reason) ?? 0) + 1);
  }

  private setDegradedMode(reason: string): void {
    this.degradedModeActive = true;
    this.degradedModeReason = reason;
    if (this.degradedStatusLogged) return;
    this.degradedStatusLogged = true;
    this.logToActivityPanel(`[System] Degraded mode active (${reason}). Running deterministic autonomy.`);
  }


  private updateComplianceMetrics(deltaMinutes: number): void {
    for (const character of this.characters) {
      const waypoint = character.getCurrentWaypoint();
      if (!waypoint) continue;
      if (waypoint.slotKind === 'class') {
        this.metrics.classComplianceMinutes += deltaMinutes;
      }
      if (waypoint.slotKind === 'sleep') {
        this.metrics.sleepComplianceMinutes += deltaMinutes;
      }
    }
  }

  private runAutonomyValidation(scheduleTotalMinutes: number): void {
    if (!this.autonomyValidationEnabled) return;
    if (scheduleTotalMinutes < this.nextAutonomyValidationAt) return;
    this.nextAutonomyValidationAt = scheduleTotalMinutes + AUTONOMY_VALIDATION_INTERVAL_MINUTES;
    for (const character of this.characters) {
      const waypoint = character.getCurrentWaypoint();
      if (!waypoint) continue;
      const strictness = this.getCurrentSlotStrictness(character);
      if (strictness >= 0.72) continue;

      const history = this.autonomyHistoryByAgent.get(character.id) ?? [];
      history.push({ roomId: waypoint.roomId, activity: waypoint.activity });
      if (history.length > 8) history.shift();
      this.autonomyHistoryByAgent.set(character.id, history);
      if (history.length < 6) continue;

      const uniqueRooms = new Set(history.map((entry) => entry.roomId)).size;
      const uniqueActivities = new Set(history.map((entry) => entry.activity)).size;
      if (uniqueRooms >= 2 && uniqueActivities >= 2) continue;

      const cooldownUntil = this.autonomyValidationCooldownUntil.get(character.id) ?? 0;
      if (scheduleTotalMinutes < cooldownUntil) continue;
      this.autonomyValidationCooldownUntil.set(character.id, scheduleTotalMinutes + 120);
      this.logToActivityPanel(
        `[Validation] ${character.name} shows low autonomy diversity (${uniqueRooms} rooms/${uniqueActivities} activities)`,
      );
    }
    const totalTalk = this.metrics.talkIntentSuccess + this.metrics.talkIntentFailure;
    const successRate = totalTalk > 0 ? Math.round((this.metrics.talkIntentSuccess / totalTalk) * 100) : 0;
    const topFailure = [...this.metrics.talkFailureReasons.entries()]
      .sort((a, b) => b[1] - a[1])[0];
    const dailyPlanFallbackRate = this.metrics.dailyPlanRequests > 0
      ? Math.round((this.metrics.dailyPlanFallbacks / this.metrics.dailyPlanRequests) * 100)
      : 0;
    const outcomeFallbackRate = this.metrics.outcomeRequests > 0
      ? Math.round((this.metrics.outcomeFallbacks / this.metrics.outcomeRequests) * 100)
      : 0;
    const dialogueFallbackRate = this.metrics.dialogueRequests > 0
      ? Math.round((this.metrics.dialogueFallbacks / this.metrics.dialogueRequests) * 100)
      : 0;
    this.logToActivityPanel(
      `[Metrics] talk success=${successRate}% (${this.metrics.talkIntentSuccess}/${totalTalk}), ` +
      `cognitionFailures=${this.metrics.cognitionFailures}, ` +
      `dailyPlan(req/fail/fallback)=${this.metrics.dailyPlanRequests}/${this.metrics.dailyPlanFailures}/${this.metrics.dailyPlanFallbacks} (${dailyPlanFallbackRate}%), ` +
      `conversationOutcome(req/fail/fallback)=${this.metrics.outcomeRequests}/${this.metrics.outcomeFailures}/${this.metrics.outcomeFallbacks} (${outcomeFallbackRate}%), ` +
      `dialogue(req/success/fallback)=${this.metrics.dialogueRequests}/${this.metrics.dialogueSuccess}/${this.metrics.dialogueFallbacks} (${dialogueFallbackRate}%), ` +
      `dialogueCtrl(inFlight=${this.dialogueRequestsInFlight}, suppressed=${this.metrics.dialogueSuppressed}, backoff=${Math.max(0, this.dialogueBackoffUntil - scheduleTotalMinutes).toFixed(2)}m), ` +
      `conversationStarts=${this.metrics.conversationStarts}, ` +
      `dailyPlanQueue=${this.dailyPlanRequestQueue.length}, ` +
      `topTalkFailure=${topFailure ? `${topFailure[0]}:${topFailure[1]}` : 'none'}`,
    );
  }

}

function parseKey(value: string): TilePoint {
  const [xs, ys] = value.split(',');
  return { x: Number(xs), y: Number(ys) };
}
