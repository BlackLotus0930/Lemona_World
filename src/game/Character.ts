import { AnimatedSprite, Assets, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { TILE_SIZE } from '../../data/map';
import type { CharacterConfig, ScheduleWaypoint } from '../../data/characters';
import type { AgentRuntimeState, TaskId } from '../agent/types';
import type { NavGrid, TilePoint } from './nav/NavGrid';
import { findPath } from './nav/AStar';
import { PathFollower } from './nav/PathFollower';
import type { ResolvedTarget } from './world/WorldSemantics';

type FacingDirection = 'down' | 'left' | 'right' | 'up';
type AnimationMode = 'idle' | 'walk' | 'work';

const UI_SPRITESHEET_PATH = '/assets/user_interface/popupemotes.png';
const SINGLE_LINE_SPEECH_BUBBLE_PATH = '/assets/user_interface/single-line-bubble.png';
const MULTI_LINE_SPEECH_BUBBLE_PATH = '/assets/user_interface/multi-line-bubble.png';

type SpeechBubbleVariant = 'single' | 'multi';

const BUBBLE_LAYOUT: Record<
  SpeechBubbleVariant,
  { scale: number; textCenterYRatio: number; textWidthRatio: number; fontSize: number }
> = {
  single: { scale: 0.24, textCenterYRatio: 0.61, textWidthRatio: 0.9, fontSize: 24 },
  multi: { scale: 0.22, textCenterYRatio: 0.59, textWidthRatio: 0.82, fontSize: 23 },
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
  exercise: 'sweat',
  social: 'heart',
  rest: 'moon',
  music: 'music',
  watch_tv: 'idea',
  toilet: 'question',
  shower: 'water',
  clean: 'hammer',
};

const MAX_REPLANS = 5;
const COOLDOWN_DURATION = 20;
const SOFT_STUCK_MINUTES = 1.5;
const HARD_STUCK_MINUTES = 3.5;
const TARGET_JITTER_RADIUS = 1;
const CROWD_SOFT_LIMIT = 1;
const MOVEMENT_EPSILON = 0.05;

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
  private lifeMinutes = 0;

  private activitySprite: Sprite | null = null;
  private singleLineSpeechBubbleTexture: Texture | null = null;
  private multiLineSpeechBubbleTexture: Texture | null = null;
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
    this.currentWaypointIndex = config.startWaypointIndex
      ? Math.max(0, Math.min(config.startWaypointIndex, this.waypoints.length - 1))
      : 0;
    this.waypointProgressMinutes = config.startWaypointProgressMinutes ?? 0;

    const first = this.waypoints[this.currentWaypointIndex];
    this.posX = first.tileX * TILE_SIZE + TILE_SIZE / 2;
    this.posY = first.tileY * TILE_SIZE + TILE_SIZE / 2;
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

  update(deltaMinutes: number): void {
    this.lifeMinutes += deltaMinutes;
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
    if (!this.speechBubbleSprite || !this.speechBubbleText) {
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
      this.speechBubbleSprite.addChild(this.speechBubbleText);
      this.addChild(this.speechBubbleSprite);
    }

    this.speechBubbleVariant = variant;
    this.speechBubbleSprite.texture = texture;
    this.speechBubbleText.text = cleanedText;
    this.applySpeechBubbleLayout();
    this.speechBubbleSprite.visible = true;
    this.positionSpeechBubble();
  }

  hideSpeechBubble(): void {
    this.speechBubbleMinutesLeft = 0;
    if (!this.speechBubbleSprite) return;
    if (this.speechBubbleText) {
      this.speechBubbleSprite.removeChild(this.speechBubbleText);
      this.speechBubbleText.destroy();
      this.speechBubbleText = null;
    }
    this.removeChild(this.speechBubbleSprite);
    this.speechBubbleSprite.destroy();
    this.speechBubbleSprite = null;
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

  getCooldownProgress(): number {
    if (this.runtimeState !== 'cooldown') return 1;
    return 1 - this.cooldownMinutesLeft / COOLDOWN_DURATION;
  }

  private updateScheduleMovement(deltaMinutes: number): void {
    const wp = this.waypoints[this.currentWaypointIndex];
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
    this.updateActivityIcon(reached ? ACTIVITY_TO_EMOTE[wp.activity] : null);

    if (reached) {
      this.waypointProgressMinutes += deltaMinutes;
      if (this.waypointProgressMinutes >= wp.durationMinutes) {
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

  private replanPathTo(target: TilePoint): void {
    if (!this.navGrid) return;
    const start = this.getCurrentTile();
    const path = findPath(this.navGrid, start, target, {
      tileCost: (point) => {
        if (!this.crowdProbe) return 0;
        const crowd = this.crowdProbe(point, this.id);
        return crowd > CROWD_SOFT_LIMIT ? Math.min(3, (crowd - CROWD_SOFT_LIMIT) * 0.4) : 0;
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
    if (activity === this.displayedActivity) return;
    this.displayedActivity = activity;

    if (this.activitySprite) {
      this.removeChild(this.activitySprite);
      this.activitySprite = null;
    }

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
    if (!this.speechBubbleSprite) return;
    const baseY = this.sprite ? -(this.sprite.height * this.sprite.anchor.y) - 4 : -8;
    const iconOffset = this.activitySprite ? 18 : 0;
    this.speechBubbleSprite.y = baseY - iconOffset;
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
    if (!this.speechBubbleSprite || !this.speechBubbleText) return;
    const layout = BUBBLE_LAYOUT[this.speechBubbleVariant];
    const bubbleTextureWidth = this.speechBubbleSprite.texture.width;
    const bubbleTextureHeight = this.speechBubbleSprite.texture.height;
    const textStyle = new TextStyle({
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: layout.fontSize,
      fill: 0x1b1b1b,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: Math.floor(bubbleTextureWidth * layout.textWidthRatio),
      breakWords: true,
    });
    this.speechBubbleText.style = textStyle;
    this.speechBubbleText.y = -bubbleTextureHeight * layout.textCenterYRatio;

    let bubbleScale = layout.scale;
    if (this.speechBubbleVariant === 'multi') {
      const approxCharsPerLine = Math.max(8, Math.floor((textStyle.wordWrapWidth ?? 200) / (layout.fontSize * 0.62)));
      const estimatedLines = this.speechBubbleText.text
        .split('\n')
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / approxCharsPerLine)), 0);
      const extraLines = Math.max(0, estimatedLines - 3);
      // Gradually enlarge multiline bubbles so long dialogue stays readable.
      bubbleScale = Math.min(layout.scale * 1.35, layout.scale * (1 + extraLines * 0.1));
    }
    this.speechBubbleSprite.scale.set(bubbleScale);
  }

  getDisplayPosition(): { x: number; y: number } {
    return { x: this.posX, y: this.posY };
  }

  getCurrentActivity(): string {
    return this.waypoints[this.currentWaypointIndex]?.activity ?? 'rest';
  }

  getCurrentTile(): TilePoint {
    return {
      x: Math.floor(this.posX / TILE_SIZE),
      y: Math.floor(this.posY / TILE_SIZE),
    };
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
    if (this.deterministicBehavior) {
      return (this.currentWaypointIndex + 1) % this.waypoints.length;
    }
    const current = this.currentWaypointIndex;
    let bestIndex = (current + 1) % this.waypoints.length;
    let bestScore = -Infinity;
    for (let i = 0; i < this.waypoints.length; i += 1) {
      if (i === current) continue;
      const waypoint = this.waypoints[i];
      const fatigue = this.activityFatigue.get(waypoint.activity) ?? 0;
      const recencyPenalty = i === (current + this.waypoints.length - 1) % this.waypoints.length ? 0.6 : 0;
      const randomness = Math.random() * 0.45;
      const score = 1.2 - fatigue - recencyPenalty + randomness;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
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
    const current = this.getCurrentTile();
    const fallback = this.navGrid.closestWalkable(current, 2) ?? this.navGrid.closestWalkable(target, 6);
    if (!fallback) return;
    this.pathFollower.clear();
    this.pathDestination = null;
    this.replanCount = 0;
    this.stuckMinutes = 0;
    this.fallbackCount += 1;
    this.replanPathTo(fallback);
    this.statusText = 'Re-routing around congestion';
  }
}
