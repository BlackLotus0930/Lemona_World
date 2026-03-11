import { AnimatedSprite, Assets, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { TILE_SIZE } from '../../data/map';
import type { CharacterConfig, ScheduleWaypoint } from '../../data/characters';
import type { AgentRuntimeState, TaskId } from '../agent/types';
import type { NavGrid, TilePoint } from './nav/NavGrid';
import { findPath } from './nav/AStar';
import { PathFollower } from './nav/PathFollower';
import type { ResolvedTarget } from './world/WorldSemantics';
import type {
  CharacterRuntimeSnapshot,
  CharacterScheduleMode,
} from './persistence/snapshotTypes';

type FacingDirection = 'down' | 'left' | 'right' | 'up';
type AnimationMode = 'idle' | 'walk' | 'work';
type ScheduleMode = 'weekday' | 'weekend';

const UI_SPRITESHEET_PATH = '/assets/user_interface/popupemotes.png';
const SINGLE_LINE_SPEECH_BUBBLE_PATH = '/assets/user_interface/single-line-bubble.png';
const MULTI_LINE_SPEECH_BUBBLE_PATH = '/assets/user_interface/multi-line-bubble.png';

type SpeechBubbleVariant = 'single' | 'multi';

const BUBBLE_LAYOUT: Record<
  SpeechBubbleVariant,
  {
    scale: number;
    textCenterYRatio: number;
    textWidthRatio: number;
    textHeightRatio: number;
    fontSize: number;
    minFontSize: number;
  }
> = {
  single: {
    scale: 0.275,
    textCenterYRatio: 0.61,
    textWidthRatio: 0.9,
    textHeightRatio: 0.58,
    fontSize: 27,
    minFontSize: 20,
  },
  // Multi-line bubble now has a wider ratio; keep text in a stricter safe box.
  multi: {
    scale: 0.255,
    textCenterYRatio: 0.56,
    textWidthRatio: 0.86,
    textHeightRatio: 0.6,
    fontSize: 25,
    minFontSize: 17,
  },
};

const EMOTE_CELL_SIZE = 32;

const ACTIVITY_ICON_FRAMES: Record<string, { x: number; y: number; w: number; h: number }> = {
  // popupemotes.png grid: 10 rows × 11 cols, 32×32 per cell. Row/Col 1-based -> pixel (col-1)*32, (row-1)*32
  exclamation:    { x: 0,   y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 1
  question:       { x: 32,  y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 2
  exclaim_question: { x: 64,  y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 3
  surprise:       { x: 96,  y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 4
  music:          { x: 128, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 5
  sparkles:       { x: 160, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 6
  star:           { x: 192, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 7
  dust:           { x: 224, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 8
  heart:          { x: 256, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 9
  broken_heart:   { x: 288, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 10
  event:          { x: 320, y: 0,   w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 1 Col 11
  blush:          { x: 0,   y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 1
  kiss:           { x: 32,  y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 2
  flower:         { x: 64,  y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 3
  spiral:         { x: 96,  y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 4
  confetti:       { x: 128, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 5
  target:         { x: 160, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 6
  idea:           { x: 192, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 7 - lightbulb
  ellipsis:       { x: 224, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 8
  scribble:       { x: 256, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 9
  dizzy:          { x: 288, y: 32,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 2 Col 10
  sleep:          { x: 0,   y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 1 - Zzz
  anger:          { x: 32,  y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 2
  water:          { x: 64,  y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 3 - splashing water
  sigh:           { x: 96,  y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 4
  stress:         { x: 128, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 5
  teardrop:       { x: 160, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 6
  sweat:          { x: 192, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 7
  skull:          { x: 224, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 8
  impact:         { x: 256, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 9
  rock:           { x: 288, y: 64,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 3 Col 10
  star_eyes:      { x: 0,   y: 96,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 4 Col 1
  closed_eyes:    { x: 32,  y: 96,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 4 Col 2
  crossed_eyes:   { x: 64,  y: 96,  w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 4 Col 3
  swords:         { x: 96,  y: 128, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 5 Col 4
  music_notes:    { x: 288, y: 128, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 5 Col 10
  sun:            { x: 64,  y: 160, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 6 Col 3
  cloud:          { x: 96,  y: 160, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 6 Col 4
  moon:           { x: 256, y: 160, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 6 Col 9 - crescent
  bread:          { x: 288, y: 160, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 6 Col 10
  meat:           { x: 0,   y: 192, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 7 Col 1
  apple:          { x: 96,  y: 192, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 7 Col 4
  cake:           { x: 128, y: 192, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 7 Col 5
  tea:            { x: 160, y: 192, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 7 Col 6
  book:           { x: 256, y: 192, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 7 Col 9
  hammer:        { x: 0,   y: 224, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 8 Col 1
  coin:           { x: 96,  y: 224, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 8 Col 4
  clock:          { x: 64,  y: 224, w: EMOTE_CELL_SIZE, h: EMOTE_CELL_SIZE }, // Row 8 Col 3
};

const ACTIVITY_TO_EMOTE: Record<ScheduleWaypoint['activity'], keyof typeof ACTIVITY_ICON_FRAMES> = {
  sleep: 'sleep',
  eat: 'bread',
  study: 'book',
  class_study: 'book',
  library_study: 'book',
  read: 'book',
  exercise: 'sweat',
  sports_ball: 'target',
  social: 'heart',
  rest: 'moon',
  music: 'music',
  perform: 'music_notes',
  watch_tv: 'idea',
  toilet: 'question',
  shower: 'water',
  bathe: 'water',
  clean: 'hammer',
  cook: 'bread',
  laundry: 'water',
  decorate: 'sparkles',
};

const MAX_REPLANS = 16;
const COOLDOWN_DURATION = 20;
const SOFT_STUCK_MINUTES = 1.5;
const HARD_STUCK_MINUTES = 3.5;
const TARGET_JITTER_RADIUS = 1;
const CROWD_SOFT_LIMIT = 1;
const MOVEMENT_EPSILON = 0.05;
const SPEECH_BUBBLE_VERTICAL_OFFSET = -2;
const SINGLE_LINE_BUBBLE_EXTRA_DOWN = 8;
const SCHEDULE_DAY_START_MINUTES = 7 * 60 + 30;
const AUTONOMY_RECENT_WINDOW = 6;
const AUTONOMY_RESELECT_MINUTES = 12;
const AUTONOMY_MIN_DWELL_MINUTES = 48;
const AUTONOMY_ROOM_ACTIVITY_CANDIDATES: Record<string, Array<ScheduleWaypoint['activity']>> = {
  dorm1: ['rest', 'read', 'music', 'decorate', 'watch_tv'],
  dorm2: ['rest', 'read', 'decorate', 'music', 'watch_tv'],
  hall1: ['rest', 'watch_tv', 'read', 'music'],
  hall2: ['rest', 'read'],
  teacher_dorm: ['rest', 'read', 'music', 'watch_tv'],
  canteen: ['eat', 'cook', 'clean', 'rest'],
  library: ['read', 'library_study', 'rest'],
  gym: ['exercise', 'sports_ball', 'rest', 'music'],
  bathroom1: ['shower', 'bathe', 'toilet', 'laundry'],
  bathroom2: ['shower', 'bathe', 'toilet', 'laundry'],
};

export class Character extends Container {
  readonly id: string;
  readonly name: string;
  private config: CharacterConfig;
  private waypoints: ScheduleWaypoint[];
  private currentWaypointIndex = 0;
  private waypointProgressMinutes = 0;
  private body: Graphics;
  private sprite?: AnimatedSprite;
  private spriteSets: Record<FacingDirection, { idle: Texture[]; walk: Texture[] }> | null = null;
  private posX: number;
  private posY: number;
  private speed = 2;
  private runtimeState: AgentRuntimeState = 'idle_life';
  private statusText = 'Living normally';
  private activeTaskId?: TaskId;
  private deskTarget?: { tileX: number; tileY: number };
  private returnTarget?: { tileX: number; tileY: number };
  private cooldownMinutesLeft = 0;
  private facing: FacingDirection = 'down';
  private animationMode: AnimationMode = 'idle';
  private navGrid?: NavGrid;
  private crowdProbe?: (point: TilePoint, agentId: string) => number;
  private deterministicBehavior = false;
  private pathFollower = new PathFollower();
  private pathDestination: TilePoint | null = null;
  private scheduleMode: ScheduleMode = 'weekend';
  private waypointResolver?: (
    waypoint: ScheduleWaypoint,
    agentId: string,
    currentTile: TilePoint,
  ) => ResolvedTarget;
  private releaseReservedPoint?: (pointKey: string | undefined, agentId: string) => void;
  private activeWaypointTarget?: ResolvedTarget & { waypointIndex: number };
  private lastPosForStuck = { x: 0, y: 0 };
  private stuckMinutes = 0;
  private replanCount = 0;
  private stuckCount = 0;
  private fallbackCount = 0;
  private totalReplans = 0;
  private activityFatigue = new Map<ScheduleWaypoint['activity'], number>();
  private hobbyBias = new Map<ScheduleWaypoint['activity'], number>();
  private lifeMinutes = 0;
  private forcedScheduleRecoverySteps = 0;
  private preferredActivity?: ScheduleWaypoint['activity'];
  private preferredRoomId?: string;
  private preferredActivityMinutesLeft = 0;
  private useClockDrivenSchedule = true;
  private autonomyPool: ScheduleWaypoint[];
  private autonomousWaypoint?: ScheduleWaypoint;
  private recentAutonomyRooms: string[] = [];
  private recentAutonomyActivities: Array<ScheduleWaypoint['activity']> = [];
  private goalStreak = 0;
  private pursuitTarget?: { tileX: number; tileY: number; roomId?: string };
  private lastAutonomyPickLifeMinutes = -9999;
  private autonomyCommitUntilLifeMinutes = -9999;
  private needs = {
    energy: 0.66,
    hunger: 0.28,
    socialNeed: 0.42,
    noveltyNeed: 0.46,
    stress: 0.24,
  };
  private needsRates = {
    hungerRate: 1,
    socialRate: 1,
    noveltyRate: 1,
    stressRate: 1,
    energyRecoveryRate: 1,
  };

  private activitySprite: Sprite | null = null;
  private singleLineSpeechBubbleTexture: Texture | null = null;
  private multiLineSpeechBubbleTexture: Texture | null = null;
  private speechBubbleContainer: Container | null = null;
  private speechBubbleSprite: Sprite | null = null;
  private speechBubbleText: Text | null = null;
  private speechBubbleVariant: SpeechBubbleVariant = 'single';
  private speechBubbleMinutesLeft = 0;
  private uiSpritesheet: Texture | null = null;
  private displayedActivity: string | null = null;
  private iconTextures = new Map<string, Texture>();

  constructor(config: CharacterConfig) {
    super();
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.waypoints = [...config.schedule];
    this.autonomyPool = this.buildAutonomyPool(config);
    this.currentWaypointIndex = config.startWaypointIndex
      ? Math.max(0, Math.min(config.startWaypointIndex, this.waypoints.length - 1))
      : 0;
    this.waypointProgressMinutes = config.startWaypointProgressMinutes ?? 0;
    (config.hobbies ?? []).forEach((hobby) => {
      const clampedWeight = Math.max(0, Math.min(1, hobby.weight));
      this.hobbyBias.set(hobby.activity, clampedWeight);
    });
    this.needsRates = this.deriveNeedsRates(config);
    this.needs = this.seedInitialNeeds(config);

    const first = this.waypoints[this.currentWaypointIndex];
    const spawnTileX = config.spawnTileX ?? first.tileX;
    const spawnTileY = config.spawnTileY ?? first.tileY;
    this.posX = spawnTileX * TILE_SIZE + TILE_SIZE / 2;
    this.posY = spawnTileY * TILE_SIZE + TILE_SIZE / 2;
    this.facing = config.spawnFacing ?? this.facing;
    this.x = this.posX;
    this.y = this.posY;
    this.lastPosForStuck = { x: this.posX, y: this.posY };

    this.body = new Graphics();
    this.body.circle(0, 0, 5);
    this.body.fill({ color: config.color, alpha: 1 });
    this.body.stroke({ color: 0x333333, width: 1 });
    this.addChild(this.body);

  }

  async loadVisuals(): Promise<void> {
    try {
      const uiTex = (await Assets.load(UI_SPRITESHEET_PATH)) as Texture;
      uiTex.source.scaleMode = 'nearest';
      this.uiSpritesheet = uiTex;
      this.buildIconTextures();
    } catch {
      // Icons unavailable -- fallback to no indicators.
    }

    await this.loadSpeechBubbleTextures();

    if (!this.config.spritePath) return;

    try {
      const baseTexture = (await Assets.load(this.config.spritePath)) as Texture;
      baseTexture.source.scaleMode = 'nearest';
      const cols = this.config.spriteColumns ?? 3;
      const rows = this.config.spriteRows ?? 4;
      if (cols <= 0 || rows <= 0) return;

      const frameW = Math.floor(baseTexture.source.width / cols);
      const frameH = Math.floor(baseTexture.source.height / rows);
      if (frameW <= 0 || frameH <= 0) return;

      const frames: Texture[][] = [];
      for (let row = 0; row < rows; row += 1) {
        const rowTextures: Texture[] = [];
        for (let col = 0; col < cols; col += 1) {
          rowTextures.push(new Texture({
            source: baseTexture.source,
            frame: new Rectangle(col * frameW, row * frameH, frameW, frameH),
          }));
        }
        frames.push(rowTextures);
      }

      const safeFrame = (rowIndex: number, frameIndex: number): Texture | null => {
        const row = frames[rowIndex];
        if (!row || row.length === 0) return null;
        const index = Math.max(0, Math.min(frameIndex, row.length - 1));
        return row[index] ?? null;
      };

      const buildSet = (rowIndex: number): { idle: Texture[]; walk: Texture[] } => {
        const walk = frames[rowIndex] && frames[rowIndex].length > 0
          ? frames[rowIndex]
          : [baseTexture];
        const idleFrame = safeFrame(rowIndex, 1) ?? walk[0];
        return { idle: [idleFrame], walk };
      };

      this.spriteSets = {
        down: buildSet(0),
        left: buildSet(1),
        right: buildSet(2),
        up: buildSet(3),
      };

      const initialTextures = this.spriteSets.down.idle;
      this.sprite = new AnimatedSprite(initialTextures);
      this.sprite.anchor.set(0.5, 0.75);
      this.sprite.animationSpeed = (this.config.spriteFps ?? 8) / 60;
      this.sprite.roundPixels = true;
      this.sprite.loop = true;
      this.sprite.play();
      this.body.visible = false;
      this.addChild(this.sprite);
      this.updateAnimationVisual();

    } catch {
      // Keep fallback circle if sprite loading fails.
    }
  }

  update(deltaMinutes: number, scheduleMode?: ScheduleMode, scheduleTotalMinutes?: number): void {
    if (scheduleMode) {
      this.ensureScheduleMode(scheduleMode);
    }
    if (this.useClockDrivenSchedule && this.runtimeState === 'idle_life' && Number.isFinite(scheduleTotalMinutes)) {
      this.syncWaypointWithClock(scheduleTotalMinutes as number);
    }
    this.lifeMinutes += deltaMinutes;
    if (this.preferredActivityMinutesLeft > 0) {
      this.preferredActivityMinutesLeft = Math.max(0, this.preferredActivityMinutesLeft - deltaMinutes);
      if (this.preferredActivityMinutesLeft <= 0) {
        this.preferredActivity = undefined;
        this.preferredRoomId = undefined;
        this.autonomousWaypoint = undefined;
      }
    }
    if (this.speechBubbleMinutesLeft > 0) {
      this.speechBubbleMinutesLeft = Math.max(0, this.speechBubbleMinutesLeft - deltaMinutes);
      if (this.speechBubbleMinutesLeft === 0) {
        this.hideSpeechBubble();
      }
    }
    if (this.runtimeState === 'moving_to_desk' && this.deskTarget) {
      const reached = this.moveTowardsTile(this.deskTarget.tileX, this.deskTarget.tileY, deltaMinutes);
      if (reached) {
        this.runtimeState = 'working';
        if (this.statusText === 'Heading to work desk') {
          this.statusText = 'Working on task';
        }
      }
      this.animationMode = 'walk';
      this.updateAnimationVisual();
      this.updateActivityIcon(null);
      return;
    }

    if (this.runtimeState === 'working') {
      this.animationMode = 'work';
      this.updateAnimationVisual();
      this.updateActivityIcon('hammer');
      return;
    }

    if (this.runtimeState === 'returning_result' && this.returnTarget) {
      const reached = this.moveTowardsTile(this.returnTarget.tileX, this.returnTarget.tileY, deltaMinutes);
      if (reached) {
        this.runtimeState = 'cooldown';
        this.cooldownMinutesLeft = COOLDOWN_DURATION;
        if (this.statusText === 'Returning with result') {
          this.statusText = 'Cooldown';
        }
      }
      this.animationMode = 'walk';
      this.updateAnimationVisual();
      this.updateActivityIcon(null);
      return;
    }

    if (this.runtimeState === 'cooldown') {
      this.cooldownMinutesLeft = Math.max(0, this.cooldownMinutesLeft - deltaMinutes);
      if (this.cooldownMinutesLeft <= 0) {
        this.runtimeState = 'idle_life';
        this.activeTaskId = undefined;
        this.statusText = 'Living normally';
      }
      this.animationMode = 'idle';
      this.updateAnimationVisual();
      this.updateActivityIcon(null);
      return;
    }

    this.updateScheduleMovement(deltaMinutes);
  }

  assignTask(taskId: TaskId, deskTileX: number, deskTileY: number): void {
    this.releaseCurrentWaypointTarget();
    this.activeTaskId = taskId;
    this.runtimeState = 'moving_to_desk';
    this.statusText = 'Heading to work desk';
    this.deskTarget = { tileX: deskTileX, tileY: deskTileY };
    const current = this.waypoints[this.currentWaypointIndex];
    this.returnTarget = { tileX: current.tileX, tileY: current.tileY };
    this.cooldownMinutesLeft = 0;
    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
  }

  beginReturnToLife(): void {
    this.runtimeState = 'returning_result';
    this.statusText = 'Returning with result';
    this.replanCount = 0;
  }

  startRoutineImmediately(): void {
    if (this.runtimeState !== 'idle_life') {
      return;
    }
    const waypoint = this.waypoints[this.currentWaypointIndex];
    if (!waypoint) {
      return;
    }
    // Prime current waypoint so first updates immediately advance to movement.
    this.waypointProgressMinutes = Math.max(this.waypointProgressMinutes, waypoint.durationMinutes);
  }

  setStatusText(statusText: string): void {
    this.statusText = statusText;
  }

  showSpeechBubble(text: string, durationMinutes = 2): void {
    const cleanedText = text.trim();
    if (!cleanedText) {
      this.hideSpeechBubble();
      return;
    }

    const variant: SpeechBubbleVariant = cleanedText.includes('\n') || cleanedText.length > 34 ? 'multi' : 'single';
    const texture = variant === 'multi'
      ? (this.multiLineSpeechBubbleTexture ?? this.singleLineSpeechBubbleTexture)
      : (this.singleLineSpeechBubbleTexture ?? this.multiLineSpeechBubbleTexture);
    if (!texture) return;

    this.speechBubbleMinutesLeft = Math.max(this.speechBubbleMinutesLeft, durationMinutes);
    if (!this.speechBubbleContainer || !this.speechBubbleSprite || !this.speechBubbleText) {
      this.speechBubbleContainer = new Container();
      this.speechBubbleSprite = new Sprite(texture);
      this.speechBubbleSprite.anchor.set(0.5, 1);
      this.speechBubbleSprite.roundPixels = true;
      this.speechBubbleText = new Text({
        text: cleanedText,
        style: new TextStyle({
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fill: 0x1b1b1b,
          align: 'center',
        }),
      });
      this.speechBubbleText.anchor.set(0.5, 0.5);
      this.speechBubbleContainer.addChild(this.speechBubbleSprite);
      this.speechBubbleContainer.addChild(this.speechBubbleText);
      this.addChild(this.speechBubbleContainer);
    }

    this.speechBubbleVariant = variant;
    this.speechBubbleSprite.texture = texture;
    this.speechBubbleText.text = cleanedText;
    this.applySpeechBubbleLayout();
    this.speechBubbleContainer.visible = true;
    // Speech bubble takes precedence over activity icon.
    this.clearActivityIcon();
    this.positionSpeechBubble();
  }

  hideSpeechBubble(): void {
    this.speechBubbleMinutesLeft = 0;
    if (!this.speechBubbleContainer) return;
    if (this.speechBubbleText) {
      this.speechBubbleText.destroy();
      this.speechBubbleText = null;
    }
    this.speechBubbleSprite = null;
    this.removeChild(this.speechBubbleContainer);
    this.speechBubbleContainer.destroy();
    this.speechBubbleContainer = null;
  }

  getRuntimeState(): AgentRuntimeState {
    return this.runtimeState;
  }

  getStatusText(): string {
    return this.statusText;
  }

  getActiveTaskId(): TaskId | undefined {
    return this.activeTaskId;
  }

  setAutonomyDirective(
    activity?: string,
    roomId?: string,
    durationMinutes = 90,
  ): boolean {
    this.preferredActivity = activity ? (activity as ScheduleWaypoint['activity']) : undefined;
    this.preferredRoomId = roomId || undefined;
    this.preferredActivityMinutesLeft = Math.max(10, durationMinutes);
    return this.selectAutonomousWaypoint();
  }

  getCooldownProgress(): number {
    if (this.runtimeState !== 'cooldown') return 1;
    return 1 - this.cooldownMinutesLeft / COOLDOWN_DURATION;
  }

  private updateScheduleMovement(deltaMinutes: number): void {
    const wp = this.getActiveWaypoint();
    if (!wp) return;
    const resolved = this.resolveWaypointTarget(wp);
    const beforeX = this.posX;
    const beforeY = this.posY;
    const reached = this.moveTowardsTile(resolved.tileX, resolved.tileY, deltaMinutes);
    const movedDistance = Math.abs(this.posX - beforeX) + Math.abs(this.posY - beforeY);
    const isMoving = movedDistance > MOVEMENT_EPSILON;
    if (reached && resolved.facing) {
      this.facing = resolved.facing;
    }
    this.animationMode = reached || !isMoving ? 'idle' : 'walk';
    this.updateAnimationVisual();
    const shouldHideEmoteForScene = this.shouldHideEmoteForScene(wp);
    this.updateActivityIcon(
      reached && !shouldHideEmoteForScene
        ? ACTIVITY_TO_EMOTE[wp.activity]
        : null,
    );

    if (reached) {
      this.waypointProgressMinutes += deltaMinutes;
      this.applyNeedsForActivity(wp.activity, deltaMinutes);
      if (!this.useClockDrivenSchedule && this.waypointProgressMinutes >= wp.durationMinutes) {
        this.waypointProgressMinutes = 0;
        this.releaseCurrentWaypointTarget();
        this.bumpActivityFatigue(wp.activity, 0.5);
        this.currentWaypointIndex = this.chooseNextWaypointIndex();
        this.replanCount = 0;
      }
    } else {
      this.bumpActivityFatigue(wp.activity, -0.02 * deltaMinutes);
    }
  }

  private shouldHideEmoteForScene(waypoint: ScheduleWaypoint): boolean {
    const isCorridorScene = waypoint.roomId === 'hall2' && waypoint.activity === 'watch_tv';
    if (!isCorridorScene) return false;
    // Keep life logic consistent across students/teacher.
    return false;
  }

  private moveTowardsTile(tileX: number, tileY: number, deltaMinutes: number): boolean {
    if (this.navGrid) {
      return this.moveWithPathfinding(tileX, tileY, deltaMinutes);
    }

    const px = this.posX;
    const py = this.posY;
    const tx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const ty = tileY * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      this.posX = tx;
      this.posY = ty;
      this.x = this.posX;
      this.y = this.posY;
      return true;
    }

    const moveDist = Math.min(dist, this.speed * deltaMinutes * TILE_SIZE);
    const t = moveDist / dist;
    this.updateFacing(dx, dy);
    this.posX = px + dx * t;
    this.posY = py + dy * t;
    this.x = this.posX;
    this.y = this.posY;
    return false;
  }

  private moveWithPathfinding(tileX: number, tileY: number, deltaMinutes: number): boolean {
    if (!this.navGrid) return false;

    const target = this.navGrid.closestWalkable({ x: tileX, y: tileY }) ?? { x: tileX, y: tileY };
    if (
      !this.pathDestination ||
      this.pathDestination.x !== target.x ||
      this.pathDestination.y !== target.y ||
      !this.pathFollower.hasPath()
    ) {
      if (this.replanCount < MAX_REPLANS) {
        this.replanPathTo(target);
      }
    }

    const currentTile = this.getCurrentTile();
    this.pathFollower.advanceIfReached(currentTile.x, currentTile.y);
    const next = this.pathFollower.peekCurrent();
    if (!next) {
      this.pathDestination = target;
      const atTarget = currentTile.x === target.x && currentTile.y === target.y;
      if (atTarget) {
        return true;
      }
      // Never move directly through geometry if path is unavailable.
      if (this.replanCount < MAX_REPLANS) {
        this.replanPathTo(target);
      } else {
        const rescue = this.navGrid.closestWalkable(currentTile, 2);
        if (rescue && (rescue.x !== currentTile.x || rescue.y !== currentTile.y)) {
          this.replanPathTo(rescue);
        }
      }
      // Keep stuck recovery active even when no path segment exists.
      this.updateStuckTracker(deltaMinutes, target);
      return false;
    }

    const reached = this.moveDirectlyTo(next.x, next.y, deltaMinutes);
    if (reached) {
      this.pathFollower.advanceIfReached(next.x, next.y);
    }

    this.updateStuckTracker(deltaMinutes, target);
    if (this.pathFollower.isComplete()) {
      const tile = this.getCurrentTile();
      return tile.x === target.x && tile.y === target.y;
    }

    return false;
  }

  private moveDirectlyTo(tileX: number, tileY: number, deltaMinutes: number): boolean {
    const px = this.posX;
    const py = this.posY;
    const tx = tileX * TILE_SIZE + TILE_SIZE / 2;
    const ty = tileY * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.2) {
      this.posX = tx;
      this.posY = ty;
      this.x = this.posX;
      this.y = this.posY;
      return true;
    }

    const moveDist = Math.min(dist, this.speed * deltaMinutes * TILE_SIZE);
    const t = moveDist / dist;
    this.updateFacing(dx, dy);
    this.posX = px + dx * t;
    this.posY = py + dy * t;
    this.x = this.posX;
    this.y = this.posY;
    return false;
  }

  private replanPathTo(target: TilePoint, ignoreCrowd = false): void {
    if (!this.navGrid) return;
    const start = this.getCurrentTile();
    const path = findPath(this.navGrid, start, target, {
      tileCost: ignoreCrowd ? undefined : (point) => {
        if (!this.crowdProbe) return 0;
        const crowd = this.crowdProbe(point, this.id);
        return crowd > CROWD_SOFT_LIMIT ? Math.min(1.5, (crowd - CROWD_SOFT_LIMIT) * 0.2) : 0;
      },
    });
    this.pathFollower.setPath(path);
    this.pathDestination = target;
    this.stuckMinutes = 0;
    this.lastPosForStuck = { x: this.posX, y: this.posY };
    this.replanCount += 1;
    this.totalReplans += 1;
  }

  private updateStuckTracker(deltaMinutes: number, target: TilePoint): void {
    const moved = Math.abs(this.posX - this.lastPosForStuck.x) + Math.abs(this.posY - this.lastPosForStuck.y);
    if (moved < 0.08) {
      this.stuckMinutes += deltaMinutes;
    } else {
      this.stuckMinutes = 0;
      this.lastPosForStuck = { x: this.posX, y: this.posY };
    }

    if (this.stuckMinutes >= SOFT_STUCK_MINUTES && this.replanCount < MAX_REPLANS) {
      this.replanPathTo(target);
      this.stuckCount += 1;
    }
    if (this.stuckMinutes >= HARD_STUCK_MINUTES) {
      this.tryHardFallback(target);
    }
  }

  private updateFacing(dx: number, dy: number): void {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx >= 0 ? 'right' : 'left';
      return;
    }
    this.facing = dy >= 0 ? 'down' : 'up';
  }

  private updateAnimationVisual(): void {
    if (!this.sprite || !this.spriteSets) return;
    const set = this.spriteSets[this.facing];
    const textures = this.animationMode === 'walk' ? set.walk : set.idle;
    if (this.sprite.textures !== textures) {
      this.sprite.textures = textures;
      this.sprite.gotoAndPlay(0);
    }
    if (this.animationMode === 'idle' || this.animationMode === 'work') {
      this.sprite.animationSpeed = 0.08;
    } else {
      this.sprite.animationSpeed = (this.config.spriteFps ?? 8) / 60;
    }
    this.positionSpeechBubble();
  }

  private buildIconTextures(): void {
    if (!this.uiSpritesheet) return;
    for (const [key, frame] of Object.entries(ACTIVITY_ICON_FRAMES)) {
      if (
        frame.x + frame.w > this.uiSpritesheet.source.width ||
        frame.y + frame.h > this.uiSpritesheet.source.height
      ) {
        continue;
      }
      this.iconTextures.set(key, new Texture({
        source: this.uiSpritesheet.source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      }));
    }
  }

  private updateActivityIcon(activity: string | null): void {
    // Never render both speech and activity bubbles at once.
    if (this.speechBubbleSprite) {
      this.clearActivityIcon();
      return;
    }

    if (activity === this.displayedActivity) return;
    this.displayedActivity = activity;
    this.clearActivityIcon();

    if (!activity) {
      return;
    }
    const texture = this.iconTextures.get(activity);
    if (!texture) return;

    this.activitySprite = new Sprite(texture);
    this.activitySprite.anchor.set(0.5, 1);
    this.activitySprite.scale.set(0.65);
    // Place icon directly above character head (no overhead name label).
    this.activitySprite.y = this.sprite ? -(this.sprite.height * this.sprite.anchor.y) - 2 : -8;
    this.addChild(this.activitySprite);
    this.positionSpeechBubble();
  }

  private positionSpeechBubble(): void {
    if (!this.speechBubbleContainer) return;
    // Bubble textures have transparent padding; compensate so visible bubble sits closer to the head.
    const baseY = this.sprite
      ? -(this.sprite.height * this.sprite.anchor.y) + SPEECH_BUBBLE_VERTICAL_OFFSET
      : -4 + SPEECH_BUBBLE_VERTICAL_OFFSET;
    const variantOffset = this.speechBubbleVariant === 'single' ? SINGLE_LINE_BUBBLE_EXTRA_DOWN : 0;
    const iconOffset = this.activitySprite ? 18 : 0;
    this.speechBubbleContainer.y = baseY + variantOffset - iconOffset;
  }

  private clearActivityIcon(): void {
    if (this.activitySprite) {
      this.removeChild(this.activitySprite);
      this.activitySprite = null;
    }
    this.displayedActivity = null;
  }

  private async loadSpeechBubbleTextures(): Promise<void> {
    try {
      const singleLineBase = (await Assets.load(SINGLE_LINE_SPEECH_BUBBLE_PATH)) as Texture;
      // Use linear sampling for dialogue UI so contour appears less heavy.
      singleLineBase.source.scaleMode = 'linear';
      this.singleLineSpeechBubbleTexture = singleLineBase;
    } catch {
      this.singleLineSpeechBubbleTexture = null;
    }

    try {
      const multiLineBase = (await Assets.load(MULTI_LINE_SPEECH_BUBBLE_PATH)) as Texture;
      // Use linear sampling for dialogue UI so contour appears less heavy.
      multiLineBase.source.scaleMode = 'linear';
      this.multiLineSpeechBubbleTexture = multiLineBase;
    } catch {
      this.multiLineSpeechBubbleTexture = null;
    }
  }

  private applySpeechBubbleLayout(): void {
    if (!this.speechBubbleContainer || !this.speechBubbleSprite || !this.speechBubbleText) return;
    const layout = BUBBLE_LAYOUT[this.speechBubbleVariant];
    const bubbleTextureWidth = this.speechBubbleSprite.texture.width;
    const bubbleTextureHeight = this.speechBubbleSprite.texture.height;
    const maxTextWidth = Math.max(72, Math.floor(bubbleTextureWidth * layout.textWidthRatio));
    const maxTextHeight = Math.max(28, Math.floor(bubbleTextureHeight * layout.textHeightRatio));

    let fittedFontSize = layout.fontSize;
    let textStyle: TextStyle | null = null;
    for (let size = layout.fontSize; size >= layout.minFontSize; size -= 1) {
      const candidateStyle = new TextStyle({
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: size,
        fill: 0x1b1b1b,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: maxTextWidth,
        breakWords: true,
      });
      this.speechBubbleText.style = candidateStyle;
      if (this.speechBubbleText.height <= maxTextHeight) {
        fittedFontSize = size;
        textStyle = candidateStyle;
        break;
      }
      textStyle = candidateStyle;
      fittedFontSize = size;
    }
    if (textStyle) {
      this.speechBubbleText.style = textStyle;
    }
    this.speechBubbleText.text = this.fitTextToBubble(this.speechBubbleText.text, maxTextHeight);

    this.speechBubbleText.x = 0;
    this.speechBubbleText.y = -bubbleTextureHeight * layout.textCenterYRatio;

    let bubbleScale = layout.scale;
    if (this.speechBubbleVariant === 'multi') {
      const approxCharsPerLine = Math.max(8, Math.floor(maxTextWidth / (fittedFontSize * 0.62)));
      const estimatedLines = this.speechBubbleText.text
        .split('\n')
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / approxCharsPerLine)), 0);
      const extraLines = Math.max(0, estimatedLines - 3);
      // Gradually enlarge multiline bubbles so long dialogue stays readable.
      bubbleScale = Math.min(layout.scale * 1.35, layout.scale * (1 + extraLines * 0.1));
    }
    // Keep bubble and text in the same coordinate space so text stays inside after scaling.
    this.speechBubbleSprite.scale.set(1);
    this.speechBubbleContainer.scale.set(bubbleScale);
  }

  private fitTextToBubble(rawText: string, maxTextHeight: number): string {
    this.speechBubbleText!.text = rawText;
    if (this.speechBubbleText!.height <= maxTextHeight) {
      return rawText;
    }

    const normalized = rawText.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '...';
    }

    let low = 0;
    let high = normalized.length;
    let best = '...';

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${normalized.slice(0, mid).trimEnd()}...`;
      this.speechBubbleText!.text = candidate;
      if (this.speechBubbleText!.height <= maxTextHeight) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }

  getDisplayPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  getCurrentActivity(): string {
    return this.getActiveWaypoint()?.activity ?? 'rest';
  }

  getCurrentWaypoint(): ScheduleWaypoint | undefined {
    return this.getActiveWaypoint();
  }

  getCurrentTile(): TilePoint {
    return {
      x: Math.floor(this.posX / TILE_SIZE),
      y: Math.floor(this.posY / TILE_SIZE),
    };
  }

  getNeedSnapshot(): {
    energy: number;
    hunger: number;
    socialNeed: number;
    noveltyNeed: number;
    stress: number;
  } {
    return { ...this.needs };
  }

  applySocialOutcomeDelta(delta: {
    energy?: number;
    socialNeed?: number;
    stress?: number;
    noveltyNeed?: number;
  }): void {
    if (delta.energy !== undefined) {
      this.needs.energy = this.clamp01(this.needs.energy + delta.energy);
    }
    if (delta.socialNeed !== undefined) {
      this.needs.socialNeed = this.clamp01(this.needs.socialNeed + delta.socialNeed);
    }
    if (delta.stress !== undefined) {
      this.needs.stress = this.clamp01(this.needs.stress + delta.stress);
    }
    if (delta.noveltyNeed !== undefined) {
      this.needs.noveltyNeed = this.clamp01(this.needs.noveltyNeed + delta.noveltyNeed);
    }
  }

  exportState(): CharacterRuntimeSnapshot {
    return {
      id: this.id,
      posX: this.posX,
      posY: this.posY,
      facing: this.facing,
      runtimeState: this.runtimeState,
      statusText: this.statusText,
      activeTaskId: this.activeTaskId,
      deskTarget: this.deskTarget ? { ...this.deskTarget } : undefined,
      returnTarget: this.returnTarget ? { ...this.returnTarget } : undefined,
      cooldownMinutesLeft: this.cooldownMinutesLeft,
      scheduleMode: this.scheduleMode,
      currentWaypointIndex: this.currentWaypointIndex,
      waypointProgressMinutes: this.waypointProgressMinutes,
      lifeMinutes: this.lifeMinutes,
      forcedScheduleRecoverySteps: this.forcedScheduleRecoverySteps,
      activityFatigue: Array.from(this.activityFatigue.entries()),
      preferredActivity: this.preferredActivity,
      preferredActivityMinutesLeft: this.preferredActivityMinutesLeft,
      recentAutonomyRooms: [...this.recentAutonomyRooms],
      recentAutonomyActivities: [...this.recentAutonomyActivities],
      goalStreak: this.goalStreak,
      needs: { ...this.needs },
    };
  }

  importState(state: CharacterRuntimeSnapshot): void {
    const mode: CharacterScheduleMode = state.scheduleMode === 'weekday' ? 'weekday' : 'weekend';
    const source = this.getScheduleSource(mode);
    if (!source || source.length === 0) {
      return;
    }

    this.releaseCurrentWaypointTarget();
    this.scheduleMode = mode;
    this.waypoints = [...source];
    this.currentWaypointIndex = Math.max(0, Math.min(source.length - 1, Math.floor(state.currentWaypointIndex)));
    this.waypointProgressMinutes = Math.max(0, Number(state.waypointProgressMinutes) || 0);

    this.posX = Number.isFinite(state.posX) ? state.posX : this.posX;
    this.posY = Number.isFinite(state.posY) ? state.posY : this.posY;
    if (this.navGrid) {
      const tile = {
        x: Math.floor(this.posX / TILE_SIZE),
        y: Math.floor(this.posY / TILE_SIZE),
      };
      const safe = this.navGrid.closestWalkable(tile, 8) ?? this.navGrid.closestWalkable(tile, 20);
      if (safe) {
        this.posX = safe.x * TILE_SIZE + TILE_SIZE / 2;
        this.posY = safe.y * TILE_SIZE + TILE_SIZE / 2;
      }
    }
    this.x = this.posX;
    this.y = this.posY;
    this.lastPosForStuck = { x: this.posX, y: this.posY };

    this.facing = state.facing;
    this.runtimeState = state.runtimeState;
    this.statusText = state.statusText || this.statusText;
    this.activeTaskId = state.activeTaskId;
    this.deskTarget = state.deskTarget ? { ...state.deskTarget } : undefined;
    this.returnTarget = state.returnTarget ? { ...state.returnTarget } : undefined;
    this.cooldownMinutesLeft = Math.max(0, Number(state.cooldownMinutesLeft) || 0);
    this.lifeMinutes = Math.max(0, Number(state.lifeMinutes) || 0);
    this.forcedScheduleRecoverySteps = Math.max(0, Math.floor(state.forcedScheduleRecoverySteps || 0));
    this.preferredActivity = state.preferredActivity as ScheduleWaypoint['activity'] | undefined;
    this.preferredRoomId = undefined;
    this.preferredActivityMinutesLeft = Math.max(0, Number(state.preferredActivityMinutesLeft) || 0);
    this.autonomousWaypoint = undefined;
    this.recentAutonomyRooms = [...(state.recentAutonomyRooms ?? [])].slice(0, AUTONOMY_RECENT_WINDOW);
    this.recentAutonomyActivities = [...(state.recentAutonomyActivities ?? [])]
      .slice(0, AUTONOMY_RECENT_WINDOW) as Array<ScheduleWaypoint['activity']>;
    this.goalStreak = Math.max(0, Math.floor(state.goalStreak ?? 0));
    if (state.needs) {
      this.needs = {
        energy: this.clamp01(state.needs.energy),
        hunger: this.clamp01(state.needs.hunger),
        socialNeed: this.clamp01(state.needs.socialNeed),
        noveltyNeed: this.clamp01(state.needs.noveltyNeed),
        stress: this.clamp01(state.needs.stress),
      };
    }

    this.activityFatigue = new Map();
    for (const [activity, value] of state.activityFatigue ?? []) {
      this.activityFatigue.set(activity as ScheduleWaypoint['activity'], Math.max(0, Math.min(1.5, Number(value) || 0)));
    }

    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
    this.stuckMinutes = 0;
    this.hideSpeechBubble();
    this.updateAnimationVisual();
  }

  getDebugPath(): TilePoint[] {
    return this.pathFollower.snapshot();
  }

  getDebugMetrics(): { replanCount: number; stuckCount: number; fallbackCount: number } {
    return {
      replanCount: this.totalReplans,
      stuckCount: this.stuckCount,
      fallbackCount: this.fallbackCount,
    };
  }

  setNavGrid(navGrid: NavGrid): void {
    this.navGrid = navGrid;
    // If configured spawn is inside blocked geometry, relocate to nearest walkable tile.
    const spawnTile = this.getCurrentTile();
    let safeSpawn = this.navGrid.closestWalkable(spawnTile, 10);
    if (!safeSpawn) {
      safeSpawn = this.navGrid.closestWalkable(spawnTile, 24);
    }
    if (safeSpawn && (safeSpawn.x !== spawnTile.x || safeSpawn.y !== spawnTile.y)) {
      this.posX = safeSpawn.x * TILE_SIZE + TILE_SIZE / 2;
      this.posY = safeSpawn.y * TILE_SIZE + TILE_SIZE / 2;
      this.x = this.posX;
      this.y = this.posY;
      this.lastPosForStuck = { x: this.posX, y: this.posY };
    }
    this.pathFollower.clear();
    this.pathDestination = null;
  }

  setMovementContext(
    crowdProbe: (point: TilePoint, agentId: string) => number,
    deterministicBehavior: boolean,
  ): void {
    this.crowdProbe = crowdProbe;
    this.deterministicBehavior = deterministicBehavior;
  }

  setWaypointResolver(
    resolver: (waypoint: ScheduleWaypoint, agentId: string, currentTile: TilePoint) => ResolvedTarget,
    releaseReservedPoint: (pointKey: string | undefined, agentId: string) => void,
  ): void {
    this.waypointResolver = resolver;
    this.releaseReservedPoint = releaseReservedPoint;
  }

  setPursuitTarget(tileX: number, tileY: number, roomId?: string): void {
    this.pursuitTarget = { tileX, tileY, roomId };
    this.setAutonomyDirective('rest', roomId, 45);
  }

  private resolveWaypointTarget(waypoint: ScheduleWaypoint): ResolvedTarget {
    if (
      this.activeWaypointTarget &&
      this.activeWaypointTarget.waypointIndex === this.currentWaypointIndex
    ) {
      return this.activeWaypointTarget;
    }

    const resolved = this.waypointResolver
      ? this.waypointResolver(waypoint, this.id, this.getCurrentTile())
      : { tileX: waypoint.tileX, tileY: waypoint.tileY };
    const adjusted = this.selectLocalTarget(resolved);

    this.activeWaypointTarget = {
      ...adjusted,
      waypointIndex: this.currentWaypointIndex,
    };
    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
    return this.activeWaypointTarget;
  }

  private releaseCurrentWaypointTarget(): void {
    if (!this.activeWaypointTarget) return;
    this.releaseReservedPoint?.(this.activeWaypointTarget.pointKey, this.id);
    this.activeWaypointTarget = undefined;
  }

  private chooseNextWaypointIndex(): number {
    if (this.waypoints.length <= 1) return this.currentWaypointIndex;
    const current = this.currentWaypointIndex;
    const nextSequential = (current + 1) % this.waypoints.length;
    // v1 design: disable truancy/deviation from authored schedule order.
    return nextSequential;
  }

  private ensureScheduleMode(nextMode: ScheduleMode): void {
    if (this.scheduleMode === nextMode) return;
    const source = this.getScheduleSource(nextMode);
    if (!source || source.length === 0) return;

    this.scheduleMode = nextMode;
    this.releaseCurrentWaypointTarget();
    this.waypoints = [...source];
    this.currentWaypointIndex = this.findClosestWaypointIndex();
    this.waypointProgressMinutes = 0;
    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
    this.forcedScheduleRecoverySteps = 0;
    this.autonomousWaypoint = undefined;
  }

  private getScheduleSource(mode: ScheduleMode): ScheduleWaypoint[] {
    if (mode === 'weekday') {
      if (this.config.weekdaySchedule && this.config.weekdaySchedule.length > 0) {
        return this.config.weekdaySchedule;
      }
      return this.config.schedule;
    }
    if (this.config.weekendSchedule && this.config.weekendSchedule.length > 0) {
      return this.config.weekendSchedule;
    }
    if (this.config.weekdaySchedule && this.config.weekdaySchedule.length > 0) {
      return this.buildWeekendFrameworkFromWeekday(this.config.weekdaySchedule);
    }
    return this.config.schedule;
  }

  private buildWeekendFrameworkFromWeekday(weekday: ScheduleWaypoint[]): ScheduleWaypoint[] {
    const morning = weekday[0];
    const firstClass = weekday.find((entry) => entry.slotKind === 'class') ?? weekday[1] ?? morning;
    const lunch = weekday.find((entry) => entry.activity === 'eat') ?? weekday[6] ?? firstClass;
    const exercise = weekday.find((entry) => entry.activity === 'exercise' || entry.activity === 'sports_ball') ?? weekday[10] ?? firstClass;
    const social = weekday.find((entry) => entry.activity === 'watch_tv') ?? weekday[2] ?? morning;
    const free = weekday.find((entry) => entry.slotKind === 'free' && entry.activity !== 'eat') ?? weekday[11] ?? social;
    const privateSlot = weekday.find((entry) => entry.slotKind === 'private') ?? weekday[12] ?? free;
    const sleep = weekday.find((entry) => entry.activity === 'sleep') ?? weekday[weekday.length - 1] ?? privateSlot;

    return [
      { roomId: morning.roomId, tileX: morning.tileX, tileY: morning.tileY, activity: 'rest', durationMinutes: 60, slotKind: 'break', strictness: 0.62 }, // 08:00-09:00
      { roomId: firstClass.roomId, tileX: firstClass.tileX, tileY: firstClass.tileY, activity: this.resolveWeekendStudyActivity(firstClass.roomId), durationMinutes: 150, slotKind: 'class', strictness: 0.88 }, // 09:00-11:30
      { roomId: lunch.roomId, tileX: lunch.tileX, tileY: lunch.tileY, activity: 'eat', durationMinutes: 90, slotKind: 'free', strictness: 0.55 }, // 11:30-13:00
      { roomId: free.roomId, tileX: free.tileX, tileY: free.tileY, activity: free.activity, durationMinutes: 120, slotKind: 'free', strictness: 0.42 }, // 13:00-15:00
      { roomId: exercise.roomId, tileX: exercise.tileX, tileY: exercise.tileY, activity: exercise.activity === 'sports_ball' ? 'sports_ball' : 'exercise', durationMinutes: 90, slotKind: 'free', strictness: 0.46 }, // 15:00-16:30
      { roomId: social.roomId, tileX: social.tileX, tileY: social.tileY, activity: 'watch_tv', durationMinutes: 120, slotKind: 'break', strictness: 0.5 }, // 16:30-18:30
      { roomId: privateSlot.roomId, tileX: privateSlot.tileX, tileY: privateSlot.tileY, activity: privateSlot.activity, durationMinutes: 210, slotKind: 'private', strictness: 0.35 }, // 18:30-22:00
      { roomId: sleep.roomId, tileX: sleep.tileX, tileY: sleep.tileY, activity: 'sleep', durationMinutes: 600, slotKind: 'sleep', strictness: 0.95 }, // 22:00-08:00
    ];
  }

  private resolveWeekendStudyActivity(roomId: string): ScheduleWaypoint['activity'] {
    return roomId === 'library' ? 'library_study' : 'class_study';
  }

  private syncWaypointWithClock(totalMinutes: number): void {
    if (this.waypoints.length === 0) return;
    const durationCycle = this.waypoints.reduce((sum, waypoint) => sum + Math.max(1, Math.floor(waypoint.durationMinutes)), 0);
    if (durationCycle <= 0) return;

    // Weekday/weekend schedules are authored from 07:30 -> next day 07:30.
    // Align clock-driven indexing to that anchor instead of midnight.
    const relativeToScheduleStart = Math.floor(totalMinutes) - SCHEDULE_DAY_START_MINUTES;
    const normalizedMinutes = ((relativeToScheduleStart % durationCycle) + durationCycle) % durationCycle;
    let cumulative = 0;
    let nextIndex = 0;
    for (let i = 0; i < this.waypoints.length; i += 1) {
      const span = Math.max(1, Math.floor(this.waypoints[i].durationMinutes));
      if (normalizedMinutes < cumulative + span) {
        nextIndex = i;
        break;
      }
      cumulative += span;
    }
    const progress = Math.max(0, normalizedMinutes - cumulative);
    const clockWaypoint = this.waypoints[nextIndex];
    const strictness = this.resolveWaypointStrictness(clockWaypoint);
    if (strictness < 0.72) {
      const directiveActive = this.preferredActivityMinutesLeft > 0;
      const commitElapsed = this.lifeMinutes >= this.autonomyCommitUntilLifeMinutes;
      const shouldReselect =
        !this.autonomousWaypoint
        || (
          !directiveActive
          && commitElapsed
          && (
            this.goalStreak >= 2
            || (this.lifeMinutes - this.lastAutonomyPickLifeMinutes) >= AUTONOMY_RESELECT_MINUTES
          )
        );
      if (shouldReselect) {
        this.goalStreak = 0;
        this.selectAutonomousWaypoint();
      }
    } else if (strictness >= 0.72 && this.autonomousWaypoint) {
      this.releaseCurrentWaypointTarget();
      this.autonomousWaypoint = undefined;
      this.pursuitTarget = undefined;
      this.pathFollower.clear();
      this.pathDestination = null;
      this.replanCount = 0;
    }
    if (nextIndex !== this.currentWaypointIndex) {
      this.releaseCurrentWaypointTarget();
      this.currentWaypointIndex = nextIndex;
      this.pathFollower.clear();
      this.pathDestination = null;
      this.replanCount = 0;
    }
    this.waypointProgressMinutes = progress;
  }

  private findClosestWaypointIndex(): number {
    if (this.waypoints.length === 0) return 0;
    const currentTile = this.getCurrentTile();
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.waypoints.length; i += 1) {
      const waypoint = this.waypoints[i];
      const distance =
        Math.abs(waypoint.tileX - currentTile.x) + Math.abs(waypoint.tileY - currentTile.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private getActiveWaypoint(): ScheduleWaypoint | undefined {
    return this.autonomousWaypoint ?? this.waypoints[this.currentWaypointIndex];
  }

  private resolveWaypointStrictness(waypoint: ScheduleWaypoint | undefined): number {
    if (!waypoint) return 0.5;
    if (waypoint.strictness !== undefined) {
      return Math.max(0, Math.min(1, waypoint.strictness));
    }
    if (waypoint.slotKind === 'class') return 0.9;
    if (waypoint.slotKind === 'sleep') return 0.96;
    if (waypoint.slotKind === 'break') return 0.58;
    if (waypoint.slotKind === 'free') return 0.42;
    if (waypoint.slotKind === 'private') return 0.38;
    return waypoint.activity === 'study' ? 0.82 : 0.5;
  }

  private buildAutonomyPool(config: CharacterConfig): ScheduleWaypoint[] {
    const combined = [
      ...config.schedule,
      ...(config.weekdaySchedule ?? []),
      ...(config.weekendSchedule ?? []),
    ];
    const byKey = new Map<string, ScheduleWaypoint>();
    for (const waypoint of combined) {
      if (waypoint.slotKind === 'class' || waypoint.slotKind === 'sleep') continue;
      const activityCandidates = this.getAutonomyActivitiesForRoom(waypoint.roomId, waypoint.activity);
      for (const activity of activityCandidates) {
        const key = `${waypoint.roomId}:${waypoint.tileX}:${waypoint.tileY}:${activity}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          roomId: waypoint.roomId,
          tileX: waypoint.tileX,
          tileY: waypoint.tileY,
          activity,
          durationMinutes: 60,
          strictness: 0.12,
          slotKind: 'free',
        });
      }
    }
    return Array.from(byKey.values());
  }

  private getAutonomyActivitiesForRoom(
    roomId: string,
    fallbackActivity: ScheduleWaypoint['activity'],
  ): Array<ScheduleWaypoint['activity']> {
    const roomCandidates = AUTONOMY_ROOM_ACTIVITY_CANDIDATES[roomId] ?? [fallbackActivity, 'watch_tv', 'rest'];
    const hobbyTop = [...this.hobbyBias.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([activity]) => activity);
    const deduped = new Set<ScheduleWaypoint['activity']>([
      ...roomCandidates,
      ...hobbyTop,
      fallbackActivity,
    ]);
    return Array.from(deduped);
  }

  private selectAutonomousWaypoint(): boolean {
    const current = this.getCurrentTile();
    const pool = this.autonomyPool.filter((waypoint) => {
      if (this.preferredRoomId && waypoint.roomId !== this.preferredRoomId) return false;
      if (this.preferredActivity && waypoint.activity !== this.preferredActivity) return false;
      return true;
    });
    const candidates = pool.length > 0
      ? pool
      : this.autonomyPool.filter((waypoint) => !this.preferredRoomId || waypoint.roomId === this.preferredRoomId);
    if (candidates.length === 0) {
      return false;
    }
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const waypoint of candidates) {
      const distance = Math.abs(waypoint.tileX - current.x) + Math.abs(waypoint.tileY - current.y);
      const score = this.autonomyCandidateScore(waypoint, distance);
      if (score > bestScore) {
        best = waypoint;
        bestScore = score;
      }
    }
    const changed = !this.autonomousWaypoint
      || this.autonomousWaypoint.roomId !== best.roomId
      || this.autonomousWaypoint.tileX !== best.tileX
      || this.autonomousWaypoint.tileY !== best.tileY
      || this.autonomousWaypoint.activity !== best.activity;
    this.autonomousWaypoint = best;
    if (changed) {
      this.recordAutonomyHistory(best);
      this.goalStreak += 1;
      this.lastAutonomyPickLifeMinutes = this.lifeMinutes;
      this.autonomyCommitUntilLifeMinutes = this.lifeMinutes + AUTONOMY_MIN_DWELL_MINUTES;
      this.releaseCurrentWaypointTarget();
      this.pathFollower.clear();
      this.pathDestination = null;
      this.replanCount = 0;
    }
    return true;
  }

  private autonomyCandidateScore(waypoint: ScheduleWaypoint, distance: number): number {
    const classroomPenalty = 0;
    const roomRepeat = this.recentAutonomyRooms.filter((roomId) => roomId === waypoint.roomId).length;
    const activityRepeat = this.recentAutonomyActivities.filter((activity) => activity === waypoint.activity).length;
    const noveltyReward = roomRepeat === 0 ? 0.36 : roomRepeat === 1 ? 0.14 : -0.2;
    const activityNovelty = activityRepeat === 0 ? 0.3 : activityRepeat === 1 ? 0.08 : -0.18;
    const travelBand = distance < 4 ? -0.22 : distance <= 26 ? 0.2 : -0.16;
    const hobbyBoost = (this.hobbyBias.get(waypoint.activity) ?? 0) * 0.24;
    const needBoost = this.needBoostForActivity(waypoint.activity);
    const fatiguePenalty = (this.activityFatigue.get(waypoint.activity) ?? 0) * 0.2;
    const pursuitBonus = this.pursuitTarget && this.pursuitTarget.roomId === waypoint.roomId ? 0.32 : 0;
    return noveltyReward
      + activityNovelty
      + travelBand
      + hobbyBoost
      + needBoost
      + pursuitBonus
      - classroomPenalty
      - fatiguePenalty
      + Math.random() * 0.08;
  }

  private needBoostForActivity(activity: ScheduleWaypoint['activity']): number {
    if (activity === 'eat' || activity === 'cook') return this.needs.hunger * 0.42;
    if (activity === 'watch_tv' || activity === 'perform') return this.needs.socialNeed * 0.38;
    if (activity === 'rest' || activity === 'sleep') return (1 - this.needs.energy) * 0.48;
    if (activity === 'exercise') return this.needs.stress * 0.2 + this.needs.noveltyNeed * 0.16;
    if (activity === 'read' || activity === 'library_study') return this.needs.noveltyNeed * 0.22;
    return this.needs.noveltyNeed * 0.12;
  }

  private applyNeedsForActivity(activity: ScheduleWaypoint['activity'], deltaMinutes: number): void {
    const scale = Math.max(0, deltaMinutes / 60);
    const profile = this.config.needsProfile;
    const hungerRate = profile?.hungerRate ?? this.needsRates.hungerRate;
    const socialRate = profile?.socialRate ?? this.needsRates.socialRate;
    const noveltyRate = profile?.noveltyRate ?? this.needsRates.noveltyRate;
    const stressRate = profile?.stressRate ?? this.needsRates.stressRate;
    const energyRecoveryRate = profile?.energyRecoveryRate ?? this.needsRates.energyRecoveryRate;
    this.needs.hunger = this.clamp01(this.needs.hunger + 0.2 * scale * hungerRate);
    this.needs.socialNeed = this.clamp01(this.needs.socialNeed + 0.14 * scale * socialRate);
    this.needs.noveltyNeed = this.clamp01(this.needs.noveltyNeed + 0.1 * scale * noveltyRate);
    if (activity === 'eat' || activity === 'cook') this.needs.hunger = this.clamp01(this.needs.hunger - 0.5 * scale * hungerRate);
    if (activity === 'watch_tv' || activity === 'perform') this.needs.socialNeed = this.clamp01(this.needs.socialNeed - 0.45 * scale * socialRate);
    if (activity === 'rest' || activity === 'sleep') this.needs.energy = this.clamp01(this.needs.energy + 0.36 * scale * energyRecoveryRate);
    else this.needs.energy = this.clamp01(this.needs.energy - 0.06 * scale);
    if (activity === 'exercise') this.needs.stress = this.clamp01(this.needs.stress - 0.25 * scale * stressRate);
    this.needs.stress = this.clamp01(this.needs.stress + Math.max(0, this.needs.hunger - 0.72) * 0.04 * scale * stressRate);
  }

  private recordAutonomyHistory(waypoint: ScheduleWaypoint): void {
    this.recentAutonomyRooms.push(waypoint.roomId);
    if (this.recentAutonomyRooms.length > AUTONOMY_RECENT_WINDOW) {
      this.recentAutonomyRooms.shift();
    }
    this.recentAutonomyActivities.push(waypoint.activity);
    if (this.recentAutonomyActivities.length > AUTONOMY_RECENT_WINDOW) {
      this.recentAutonomyActivities.shift();
    }
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0.5;
    return Math.max(0, Math.min(1, value));
  }

  private deriveNeedsRates(config: CharacterConfig): {
    hungerRate: number;
    socialRate: number;
    noveltyRate: number;
    stressRate: number;
    energyRecoveryRate: number;
  } {
    const traits = config.profile.simulationLayer.traits;
    const openness = Math.max(0, Math.min(100, traits.openness)) / 100;
    const sociability = Math.max(0, Math.min(100, traits.sociability)) / 100;
    const impulseControl = Math.max(0, Math.min(100, traits.impulseControl)) / 100;
    const sensitivity = Math.max(0, Math.min(100, traits.sensitivity)) / 100;
    return {
      hungerRate: 0.9 + (1 - impulseControl) * 0.3,
      socialRate: 0.82 + sociability * 0.36,
      noveltyRate: 0.8 + openness * 0.4,
      stressRate: 0.8 + sensitivity * 0.45,
      energyRecoveryRate: 0.9 + impulseControl * 0.28,
    };
  }

  private seedInitialNeeds(config: CharacterConfig): {
    energy: number;
    hunger: number;
    socialNeed: number;
    noveltyNeed: number;
    stress: number;
  } {
    const traits = config.profile.simulationLayer.traits;
    const openness = Math.max(0, Math.min(100, traits.openness)) / 100;
    const sociability = Math.max(0, Math.min(100, traits.sociability)) / 100;
    const impulseControl = Math.max(0, Math.min(100, traits.impulseControl)) / 100;
    const sensitivity = Math.max(0, Math.min(100, traits.sensitivity)) / 100;
    const noise = (salt: string, amplitude = 0.08): number =>
      ((this.seedUnit(`${config.id}:${salt}`) - 0.5) * 2) * amplitude;
    return {
      energy: this.clamp01(0.64 + impulseControl * 0.14 - sensitivity * 0.08 + noise('energy')),
      hunger: this.clamp01(0.24 + (1 - impulseControl) * 0.2 + noise('hunger')),
      socialNeed: this.clamp01(0.22 + sociability * 0.5 + noise('social')),
      noveltyNeed: this.clamp01(0.24 + openness * 0.44 + noise('novelty')),
      stress: this.clamp01(0.12 + sensitivity * 0.32 + (1 - impulseControl) * 0.12 + noise('stress', 0.06)),
    };
  }

  private seedUnit(seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  private bumpActivityFatigue(activity: ScheduleWaypoint['activity'], delta: number): void {
    const current = this.activityFatigue.get(activity) ?? 0;
    const next = Math.max(0, Math.min(1.5, current + delta));
    this.activityFatigue.set(activity, next);
  }

  private selectLocalTarget(base: ResolvedTarget): ResolvedTarget {
    // Keep exact object anchor when a semantic point provides facing/pose.
    if (base.facing || base.pose) return base;
    if (!this.navGrid || this.deterministicBehavior) return base;
    let best = { x: base.tileX, y: base.tileY };
    let bestScore = Number.POSITIVE_INFINITY;
    for (let dy = -TARGET_JITTER_RADIUS; dy <= TARGET_JITTER_RADIUS; dy += 1) {
      for (let dx = -TARGET_JITTER_RADIUS; dx <= TARGET_JITTER_RADIUS; dx += 1) {
        const x = base.tileX + dx;
        const y = base.tileY + dy;
        if (!this.navGrid.isWalkable(x, y)) continue;
        const crowdPenalty = this.crowdProbe ? this.crowdProbe({ x, y }, this.id) * 0.7 : 0;
        const centerPenalty = Math.abs(dx) + Math.abs(dy);
        const score = crowdPenalty + centerPenalty + Math.random() * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return {
      ...base,
      tileX: best.x,
      tileY: best.y,
    };
  }

  private tryHardFallback(target: TilePoint): void {
    if (!this.navGrid) return;
    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
    this.stuckMinutes = 0;
    this.fallbackCount += 1;
    // Try routing directly to the actual destination ignoring crowd pressure first.
    this.replanPathTo(target, true);
    if (!this.pathFollower.hasPath()) {
      // No path found even without crowd pressure – jitter locally and retry next tick.
      const current = this.getCurrentTile();
      const rescue = this.navGrid.closestWalkable(current, 2) ?? this.navGrid.closestWalkable(target, 6);
      if (rescue) {
        this.replanCount = 0;
        this.replanPathTo(rescue, true);
      }
    }
    this.statusText = 'Re-routing around congestion';
  }
}
