import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import { World } from './World';
import { Character } from './Character';
import { Schedule } from './Schedule';
import { TimeControls } from '../ui/TimeControls';
import { CHARACTERS } from '../../data/characters';
import type {
  AgentMemoryEntry,
  AgentPlan,
  AgentStatusSnapshot,
  AgentTask,
} from '../agent/types';
import { createProtocolEvent, TaskEventBus, type AgentProtocolEvent } from '../agent/protocol';
import type { AgentBridgeClient } from '../agent/bridge/AgentBridgeClient';
import { MockProvider } from '../agent/bridge/providers/MockProvider';
import { WebSocketProvider } from '../agent/bridge/providers/WebSocketProvider';
import { NavGrid, type TilePoint } from './nav/NavGrid';
import { ReservationManager } from './world/ReservationManager';
import { WorldSemantics } from './world/WorldSemantics';
import { NavDebugOverlay } from './debug/NavDebugOverlay';

const WORK_DESKS = [
  { tileX: 23, tileY: 19 },
  { tileX: 24, tileY: 19 },
  { tileX: 25, tileY: 19 },
  { tileX: 26, tileY: 19 },
  { tileX: 23, tileY: 20 },
  { tileX: 24, tileY: 20 },
  { tileX: 25, tileY: 20 },
  { tileX: 26, tileY: 20 },
];

const UI_UPDATE_INTERVAL_MS = 200;
const CAMPUS_FOCUS_ZOOM = 1.24;
type RightPanelMode = 'dialogues' | 'thoughts';
type RightPanelEntry = {
  mode: RightPanelMode;
  html: string;
};
const DEFAULT_BEHAVIOR_CONFIG = {
  deterministicMovement: false,
  socialRadiusTiles: 2,
  socialCooldownMinutes: 30,
  socialChancePerTick: 0.16,
  conversationDurationMinutes: 14,
  llmTimeoutMs: 4500,
};

export class GameView {
  private app: Application;
  private worldContainer: Container;
  private world: World;
  private characters: Character[] = [];
  private schedule: Schedule;
  private timeControls: TimeControls;
  private tasks = new Map<string, AgentTask>();
  private eventBus = new TaskEventBus();
  private bridge: AgentBridgeClient;
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
  private activeConversations = new Map<string, {
    id: string;
    a: string;
    b: string;
    remainingMinutes: number;
    nextUtteranceAt: number;
  }>();
  private socialCooldownUntil = new Map<string, number>();
  private memoryByAgent = new Map<string, AgentMemoryEntry[]>();
  private planByAgent = new Map<string, AgentPlan>();
  private behaviorConfig = { ...DEFAULT_BEHAVIOR_CONFIG };
  private lastReflectionMinute = -1;
  private rightPanelMode: RightPanelMode = 'dialogues';
  private rightPanelEntries: RightPanelEntry[] = [];

  constructor(app: Application) {
    this.app = app;
    this.schedule = new Schedule();
    this.worldContainer = new Container();
    this.world = new World();
    this.behaviorConfig = this.readBehaviorConfigFromQuery();

    this.worldContainer.addChild(this.world);

    for (const config of CHARACTERS) {
      const char = new Character(config);
      this.worldContainer.addChild(char);
      this.characters.push(char);
      this.characterNameMap.set(config.id, config.name);
    }

    this.app.stage.addChild(this.worldContainer);
    this.timeControls = new TimeControls(this.schedule);
    this.bridge = this.createBridgeProvider();

    this.eventBus.subscribe((event) => this.handleProtocolEvent(event));
    this.bridge.subscribeEvents((event) => this.eventBus.publish(event));

    // Hook up the new UI task input
    const taskInput = document.querySelector('.task-input') as HTMLInputElement;
    if (taskInput) {
      taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && taskInput.value.trim()) {
          this.createTask(taskInput.value.trim());
          taskInput.value = '';
        }
      });
    }
    this.setupRightPanelSwitch();
  }

  async start() {
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
      character.startRoutineImmediately();
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
    } catch {
      this.bridge = new MockProvider();
      await this.bridge.connect();
      this.bridge.subscribeEvents((event) => this.eventBus.publish(event));
      this.logToActivityPanel('[System] WebSocket bridge unavailable; running mock provider.');
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
    this.schedule.update(deltaMs);

    const deltaMinutes = (deltaMs / 1000) * this.schedule.getTimeScale();
    if (!this.schedule.isPaused()) {
      this.rebuildCrowdMap();
      for (const char of this.characters) {
        char.update(deltaMinutes);
      }
      this.updateSocialConversations(deltaMinutes);
      this.maybeStartSocialConversation();
      this.maybeEmitReflection();
    }

    this.uiTickMs += deltaMs;
    if (this.uiTickMs >= UI_UPDATE_INTERVAL_MS) {
      this.uiTickMs = 0;
      this.timeControls.update();
      this.updateSidebars();
    }

    this.updateDebugOverlay(deltaMs);
  }

  private createTask(prompt: string): void {
    const task: AgentTask = {
      id: this.createTaskId(),
      title: this.deriveTitle(prompt),
      prompt,
      status: 'created',
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.eventBus.publish(createProtocolEvent('TASK_CREATED', {
      taskId: task.id,
      task,
      summary: `Task posted: ${task.title}`,
    }));

    void this.publishTaskWithFallback(task).catch((error) => {
      this.eventBus.publish(createProtocolEvent('TASK_FAILED', {
        taskId: task.id,
        summary: 'Bridge failed to publish task',
        error: error instanceof Error ? error.message : String(error),
      }));
    });
  }

  private handleProtocolEvent(event: AgentProtocolEvent): void {
    this.logProtocolEvent(event);
    this.ingestCognitionEvent(event);
    if (event.type === 'AGENT_CONVERSATION_START' || event.type === 'AGENT_DIALOGUE') {
      if (event.dialogue?.speakerId) {
        const speaker = this.getCharacterById(event.dialogue.speakerId);
        if (speaker && event.dialogue.text) {
          speaker.setStatusText(event.dialogue.text);
          speaker.showSpeechBubble(event.dialogue.text);
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

    if (event.type === 'AGENT_MEMORY' || event.type === 'AGENT_PLAN' || event.type === 'AGENT_REFLECTION') {
      if (event.agentId && event.summary) {
        this.getCharacterById(event.agentId)?.setStatusText(event.summary);
      }
      return;
    }

    const task = this.tasks.get(event.taskId);

    if (event.type === 'TASK_CREATED' && event.task) {
      this.tasks.set(event.task.id, event.task);
      return;
    }

    if (!task) return;

    if (event.type === 'TASK_ASSIGNED') {
      task.status = 'assigned';
      task.assignedAgentId = event.agentId;
      if (event.agentId) {
        const agent = this.getCharacterById(event.agentId);
        this.reservationManager.releaseAllForAgent(event.agentId);
        const desk = this.getDeskForAgent(event.agentId);
        agent?.assignTask(task.id, desk.tileX, desk.tileY);
        if (event.summary) {
          agent?.setStatusText(event.summary);
        }
      }
      return;
    }

    if (event.type === 'AGENT_THINKING' || event.type === 'AGENT_TOOL_CALL') {
      task.status = 'running';
      if (event.summary && event.agentId) {
        this.getCharacterById(event.agentId)?.setStatusText(event.summary);
      }
      return;
    }

    if (event.type === 'AGENT_RESULT') {
      task.resultSummary = event.summary ?? 'Result ready';
      if (event.agentId) {
        const agent = this.getCharacterById(event.agentId);
        if (event.summary) {
          agent?.setStatusText(event.summary);
        }
        agent?.beginReturnToLife();
      }
      return;
    }

    if (event.type === 'TASK_DONE') {
      task.status = 'done';
      task.resultSummary = event.summary ?? task.resultSummary ?? 'Completed';
      if (event.agentId) {
        const agent = this.getCharacterById(event.agentId);
        if (event.summary) {
          agent?.setStatusText(event.summary);
        }
        agent?.beginReturnToLife();
      }
      return;
    }

    if (event.type === 'TASK_FAILED') {
      task.status = 'failed';
      task.errorMessage = event.error ?? event.summary ?? 'Task failed';
      if (event.agentId) {
        const agent = this.getCharacterById(event.agentId);
        agent?.setStatusText(task.errorMessage);
        agent?.beginReturnToLife();
      }
    }
  }

  private getCharacterById(agentId: string): Character | undefined {
    return this.characters.find((character) => character.id === agentId);
  }

  private getDeskForAgent(agentId: string): { tileX: number; tileY: number } {
    const index = this.characters.findIndex((character) => character.id === agentId);
    if (index < 0) return WORK_DESKS[0];
    return WORK_DESKS[index % WORK_DESKS.length];
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

    if (event.type === 'AGENT_DIALOGUE' || event.type === 'AGENT_CONVERSATION_START' || event.type === 'AGENT_CONVERSATION_END') {
      const text = event.dialogue?.text ?? event.summary ?? event.type;
      this.appendRightPanelEntry(
        'dialogues',
        `<span class="agent">${this.escapeHtml(agentName)}</span>: ${this.escapeHtml(text)}`,
      );
      return;
    }

    if (event.type === 'AGENT_THINKING') {
      this.appendRightPanelEntry(
        'thoughts',
        `<span class="agent">${this.escapeHtml(agentName)}</span> thinks: ${this.escapeHtml(event.summary ?? 'Thinking...')}`,
      );
      return;
    }

    if (event.type === 'AGENT_MEMORY') {
      const thoughtText = event.memory?.content ?? event.summary ?? 'Memory update';
      this.appendRightPanelEntry(
        'thoughts',
        `<span class="agent">${this.escapeHtml(agentName)}</span> recalls: ${this.escapeHtml(thoughtText)}`,
      );
      return;
    }

    if (event.type === 'AGENT_REFLECTION') {
      this.appendRightPanelEntry(
        'thoughts',
        `<span class="agent">${this.escapeHtml(agentName)}</span> reflects: ${this.escapeHtml(event.summary ?? 'Reflecting...')}`,
      );
    }
  }

  private setupRightPanelSwitch(): void {
    const tabs = Array.from(document.querySelectorAll('.sidebar.right .stream-tab')) as HTMLButtonElement[];
    if (tabs.length === 0) return;
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.stream === 'thoughts' ? 'thoughts' : 'dialogues';
        this.rightPanelMode = mode;
        this.renderRightPanelEntries();
        tabs.forEach((button) => {
          button.classList.toggle('active', button === tab);
        });
      });
    }
    this.renderRightPanelEntries();
  }

  private appendRightPanelEntry(mode: RightPanelMode, html: string): void {
    this.rightPanelEntries.push({ mode, html });
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
      const label = this.rightPanelMode === 'dialogues' ? 'No dialogue yet' : 'No thoughts yet';
      const hint = this.rightPanelMode === 'dialogues'
        ? 'Post a task and agent conversations will appear here.'
        : 'Post a task and agent reflections will appear here.';
      placeholder.innerHTML = `<strong>${label}</strong>${hint}`;
      logContainer.appendChild(placeholder);
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
    
    rosterContainer.innerHTML = '';
    const statuses = this.getAgentStatuses();
    
    for (const status of statuses) {
      const card = document.createElement('div');
      card.className = 'agent-card';
      
      const stateColor = this.getSidebarStateColor(status);
      const statusText = status.statusText || 'Idle';
      const profileUrl = `./assets/characters_profile_pictures/${status.agentName}_profile.png`;
      
      card.innerHTML = `
        <div class="agent-avatar" style="padding:0;overflow:hidden;border-radius:50%;background:#e5e7eb;">
          <img
            src="${profileUrl}"
            alt="${status.agentName}"
            style="width:100%;height:100%;object-fit:cover;display:block;"
            onerror="this.style.display='none'; this.parentElement.textContent='${status.agentName.charAt(0)}'; this.parentElement.style.display='flex'; this.parentElement.style.alignItems='center'; this.parentElement.style.justifyContent='center';"
          />
        </div>
        <div class="agent-info">
          <h3>${status.agentName}</h3>
          <div class="agent-status" style="color:${stateColor};"><span class="status-dot" style="background:${stateColor};"></span> ${statusText}</div>
        </div>
      `;
      
      rosterContainer.appendChild(card);
    }
  }

  private getAgentStatuses(): AgentStatusSnapshot[] {
    return this.characters.map((character) => ({
      agentId: character.id,
      agentName: character.name,
      state: character.getRuntimeState(),
      statusText: this.getSidebarStatusText(character),
      currentActivity: character.getCurrentActivity(),
      taskId: character.getActiveTaskId(),
      cooldownProgress: character.getCooldownProgress(),
      debugMetrics: character.getDebugMetrics(),
    }));
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
      exercise: 'Exercising',
      social: 'Socializing',
      rest: 'Resting',
      music: 'Music practice',
      watch_tv: 'Watching TV',
      toilet: 'Bathroom',
      shower: 'Showering',
      clean: 'Cleaning',
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
      exercise: '#ef4444',
      social: '#f472b6',
      rest: '#a78bfa',
      music: '#2dd4bf',
      watch_tv: '#06b6d4',
      toilet: '#94a3b8',
      shower: '#38bdf8',
      clean: '#f97316',
    };
    return activity ? (colorByActivity[activity] ?? '#e5e7eb') : '#e5e7eb';
  }

  private createBridgeProvider(): AgentBridgeClient {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('bridge');
    const wsUrl = params.get('bridgeUrl') ?? 'ws://localhost:8787';

    if (mode === 'ws') {
      return new WebSocketProvider({ wsUrl });
    }

    return new MockProvider();
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
    };
  }

  private async publishTaskWithFallback(task: AgentTask): Promise<void> {
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('LLM bridge timed out')), this.behaviorConfig.llmTimeoutMs);
    });
    try {
      await Promise.race([this.bridge.publishTask(task), timeout]);
    } catch {
      this.logToActivityPanel('[System] Switching to local fallback behavior (mock cognition).');
      this.bridge.disconnect();
      this.bridge = new MockProvider();
      await this.bridge.connect();
      this.bridge.subscribeEvents((event) => this.eventBus.publish(event));
      await this.bridge.publishTask(task);
    }
  }

  private createTaskId(): string {
    const suffix = Math.random().toString(16).slice(2, 8);
    return `task_${Date.now()}_${suffix}`;
  }

  private deriveTitle(prompt: string): string {
    const trimmed = prompt.trim();
    if (trimmed.length <= 42) return trimmed;
    return `${trimmed.slice(0, 42)}...`;
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

  private maybeStartSocialConversation(): void {
    const now = this.schedule.getTotalMinutes();
    const candidates = this.characters.filter((character) => {
      if (character.getRuntimeState() !== 'idle_life') return false;
      const cooldown = this.socialCooldownUntil.get(character.id) ?? 0;
      return now >= cooldown;
    });
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i];
        const b = candidates[j];
        if (this.isInConversation(a.id) || this.isInConversation(b.id)) continue;
        const ta = a.getCurrentTile();
        const tb = b.getCurrentTile();
        const dist = Math.abs(ta.x - tb.x) + Math.abs(ta.y - tb.y);
        if (dist > this.behaviorConfig.socialRadiusTiles) continue;
        if (Math.random() > this.behaviorConfig.socialChancePerTick) continue;
        this.startConversation(a.id, b.id);
        return;
      }
    }
  }

  private startConversation(agentA: string, agentB: string): void {
    const id = `conv_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const conv = {
      id,
      a: agentA,
      b: agentB,
      remainingMinutes: this.behaviorConfig.conversationDurationMinutes,
      nextUtteranceAt: this.schedule.getTotalMinutes() + 2,
    };
    this.activeConversations.set(id, conv);
    this.eventBus.publish(createProtocolEvent('AGENT_CONVERSATION_START', {
      taskId: '__social__',
      agentId: agentA,
      summary: `${this.characterNameMap.get(agentA)} and ${this.characterNameMap.get(agentB)} started chatting`,
      dialogue: {
        speakerId: agentA,
        listenerId: agentB,
        text: 'Hey, got a minute to talk?',
        conversationId: id,
      },
    }));
  }

  private updateSocialConversations(deltaMinutes: number): void {
    const now = this.schedule.getTotalMinutes();
    for (const [id, conv] of this.activeConversations) {
      conv.remainingMinutes -= deltaMinutes;
      if (now >= conv.nextUtteranceAt && conv.remainingMinutes > 0) {
        conv.nextUtteranceAt = now + 2 + Math.random() * 4;
        const speakerId = Math.random() < 0.5 ? conv.a : conv.b;
        const listenerId = speakerId === conv.a ? conv.b : conv.a;
        const snippets = [
          'How is your task going?',
          'We should sync before class.',
          'Let us regroup at the kitchen later.',
          'I found a faster route through the hall.',
        ];
        const text = snippets[Math.floor(Math.random() * snippets.length)];
        this.eventBus.publish(createProtocolEvent('AGENT_DIALOGUE', {
          taskId: '__social__',
          agentId: speakerId,
          summary: text,
          dialogue: { speakerId, listenerId, text, conversationId: id },
        }));
      }
      if (conv.remainingMinutes <= 0) {
        this.activeConversations.delete(id);
        const cooldownEnd = now + this.behaviorConfig.socialCooldownMinutes;
        this.socialCooldownUntil.set(conv.a, cooldownEnd);
        this.socialCooldownUntil.set(conv.b, cooldownEnd);
        this.eventBus.publish(createProtocolEvent('AGENT_CONVERSATION_END', {
          taskId: '__social__',
          agentId: conv.a,
          summary: 'Conversation ended',
          dialogue: {
            speakerId: conv.a,
            listenerId: conv.b,
            text: 'Talk later!',
            conversationId: id,
          },
        }));
      }
    }
  }

  private isInConversation(agentId: string): boolean {
    for (const conv of this.activeConversations.values()) {
      if (conv.a === agentId || conv.b === agentId) return true;
    }
    return false;
  }

  private ingestCognitionEvent(event: AgentProtocolEvent): void {
    if (!event.agentId) return;
    if (event.memory) {
      const entries = this.memoryByAgent.get(event.agentId) ?? [];
      entries.push(event.memory);
      if (entries.length > 100) {
        entries.splice(0, entries.length - 100);
      }
      this.memoryByAgent.set(event.agentId, entries);
    }
    if (event.plan) {
      this.planByAgent.set(event.agentId, event.plan);
    }
  }

  private maybeEmitReflection(): void {
    const minute = this.schedule.getTotalMinutes();
    if (minute === this.lastReflectionMinute) return;
    this.lastReflectionMinute = minute;
    if (minute % 120 !== 0) return;
    for (const character of this.characters) {
      const memories = this.memoryByAgent.get(character.id) ?? [];
      if (memories.length === 0) continue;
      const recent = memories.slice(-5).map((entry) => entry.content).join('; ');
      this.eventBus.publish(createProtocolEvent('AGENT_REFLECTION', {
        taskId: '__reflection__',
        agentId: character.id,
        summary: `Reflecting on recent experiences: ${recent.slice(0, 120)}`,
      }));
    }
  }
}

function parseKey(value: string): TilePoint {
  const [xs, ys] = value.split(',');
  return { x: Number(xs), y: Number(ys) };
}
