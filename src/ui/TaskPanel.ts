import type { AgentStatusSnapshot, AgentTask } from '../agent/types';

interface TaskPanelOptions {
  onSubmit: (prompt: string) => void;
}

export class TaskPanel {
  private root: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private submitBtn: HTMLButtonElement;
  private tasksList: HTMLDivElement;
  private agentStatusList: HTMLDivElement;
  private onSubmit: (prompt: string) => void;
  private lastTasksHash = '';
  private lastAgentHash = '';
  private agentSection: HTMLDivElement;
  private tasksSection: HTMLDivElement;
  private agentCollapsed = false;
  private tasksCollapsed = false;

  constructor(options: TaskPanelOptions) {
    this.onSubmit = options.onSubmit;
    this.root = document.createElement('div');
    this.root.id = 'task-panel';
    this.root.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      width: 300px;
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 10px;
      color: rgba(0, 0, 0, 0.9);
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      padding: 10px;
      z-index: 1100;
      backdrop-filter: blur(3px);
      font-size: 13px;
    `;

    const title = document.createElement('div');
    title.textContent = 'Mission Board';
    title.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:8px;';
    this.root.appendChild(title);

    this.input = document.createElement('textarea');
    this.input.placeholder = 'Describe a task for the agents...';
    this.input.style.cssText = `
      width: 100%;
      min-height: 56px;
      resize: vertical;
      background: rgba(0,0,0,0.04);
      color: rgba(0,0,0,0.9);
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 8px;
      padding: 8px;
      box-sizing: border-box;
      margin-bottom: 6px;
      font-family: inherit;
      font-size: 13px;
    `;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submitTask();
      }
    });
    this.root.appendChild(this.input);

    this.submitBtn = document.createElement('button');
    this.submitBtn.textContent = 'Post Task';
    this.submitBtn.style.cssText = `
      width: 100%;
      padding: 7px 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      color: white;
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      margin-bottom: 10px;
    `;
    this.submitBtn.addEventListener('click', () => this.submitTask());
    this.root.appendChild(this.submitBtn);

    this.agentSection = this.createCollapsibleSection('Agents', () => {
      this.agentCollapsed = !this.agentCollapsed;
      this.agentStatusList.style.display = this.agentCollapsed ? 'none' : 'grid';
      return this.agentCollapsed;
    });
    this.root.appendChild(this.agentSection);

    this.agentStatusList = document.createElement('div');
    this.agentStatusList.style.cssText = 'display:grid;gap:5px;margin-bottom:10px;';
    this.root.appendChild(this.agentStatusList);

    this.tasksSection = this.createCollapsibleSection('Tasks', () => {
      this.tasksCollapsed = !this.tasksCollapsed;
      this.tasksList.style.display = this.tasksCollapsed ? 'none' : 'grid';
      return this.tasksCollapsed;
    });
    this.root.appendChild(this.tasksSection);

    this.tasksList = document.createElement('div');
    this.tasksList.style.cssText = 'display:grid;gap:5px;';
    this.root.appendChild(this.tasksList);
  }

  private createCollapsibleSection(label: string, toggle: () => boolean): HTMLDivElement {
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      cursor:pointer;user-select:none;margin-bottom:5px;
    `;

    const titleEl = document.createElement('span');
    titleEl.textContent = label;
    titleEl.style.cssText = 'font-size:12px;font-weight:700;opacity:0.92;text-transform:uppercase;letter-spacing:0.04em;';
    header.appendChild(titleEl);

    const arrow = document.createElement('span');
    arrow.textContent = '▾';
    arrow.style.cssText = 'font-size:10px;opacity:0.6;transition:transform 0.15s;';
    header.appendChild(arrow);

    header.addEventListener('click', () => {
      const collapsed = toggle();
      arrow.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    return header;
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  setTasks(tasks: AgentTask[]): void {
    const hash = tasks.map((t) => `${t.id}:${t.status}:${t.resultSummary ?? ''}:${t.errorMessage ?? ''}`).join('|');
    if (hash === this.lastTasksHash) return;
    this.lastTasksHash = hash;

    this.tasksList.innerHTML = '';
    if (tasks.length === 0) {
      const item = document.createElement('div');
      item.textContent = 'No tasks yet';
      item.style.cssText = 'opacity:0.5;font-size:13px;padding:2px 0;';
      this.tasksList.appendChild(item);
      return;
    }

    tasks.slice(0, 10).forEach((task) => {
      const item = document.createElement('div');
      item.style.cssText = `
        border: 1px solid rgba(0,0,0,0.08);
          border-radius: 7px;
          padding: 6px 8px;
          background: rgba(0,0,0,0.02);
      `;

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      titleRow.textContent = task.title;
      item.appendChild(titleRow);

      const statusRow = document.createElement('div');
      statusRow.style.cssText = 'opacity:0.7;font-size:12px;';
      const statusColor = STATUS_COLORS[task.status] ?? '#999';
      statusRow.innerHTML = `<span style="color:${statusColor};font-weight:600">${task.status}</span>`;
      item.appendChild(statusRow);

      const detail = task.resultSummary ?? task.errorMessage;
      if (detail) {
        const detailRow = document.createElement('div');
        detailRow.style.cssText = 'opacity:0.6;font-size:12px;margin-top:2px;';
        detailRow.textContent = detail;
        item.appendChild(detailRow);
      }

      this.tasksList.appendChild(item);
    });
  }

  setAgentStatuses(statuses: AgentStatusSnapshot[]): void {
    const hash = statuses.map((s) => `${s.agentId}:${s.state}:${s.statusText}:${Math.round((s.cooldownProgress ?? 1) * 100)}`).join('|');
    if (hash === this.lastAgentHash) return;
    this.lastAgentHash = hash;

    // If the number of agents changed or it's the first render, rebuild DOM
    if (this.agentStatusList.children.length !== statuses.length) {
      this.agentStatusList.innerHTML = '';
      statuses.forEach((status) => {
        const item = document.createElement('div');
        item.dataset.agentId = status.agentId;
        item.style.cssText = `
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 8px;
          padding: 8px;
          background: rgba(255,255,255,0.04);
          display: flex;
          gap: 10px;
          align-items: center;
        `;

        const avatar = document.createElement('img');
        avatar.src = `./assets/characters_profile_pictures/${status.agentName}_profile.png`;
        avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,0,0,0.12);background:rgba(0,0,0,0.06);flex-shrink:0;box-shadow:0 2px 4px rgba(0,0,0,0.1);';
        item.appendChild(avatar);

        const infoCol = document.createElement('div');
        infoCol.style.cssText = 'display:flex;flex-direction:column;flex-grow:1;min-width:0;';

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;';

        const nameEl = document.createElement('span');
        nameEl.textContent = status.agentName;
        nameEl.style.cssText = 'font-weight:700;font-size:14px;';
        topRow.appendChild(nameEl);

        const stateEl = document.createElement('span');
        stateEl.className = 'agent-state';
        topRow.appendChild(stateEl);
        infoCol.appendChild(topRow);

        const statusLine = document.createElement('div');
        statusLine.className = 'agent-status-text';
        statusLine.style.cssText = 'opacity:0.75;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        infoCol.appendChild(statusLine);

        const barOuter = document.createElement('div');
        barOuter.className = 'agent-cooldown-bar';
        barOuter.style.cssText = 'height:4px;background:rgba(0,0,0,0.08);border-radius:2px;margin-top:5px;overflow:hidden;display:none;';
        const barInner = document.createElement('div');
        barInner.className = 'agent-cooldown-inner';
        barInner.style.cssText = 'height:100%;width:0%;border-radius:2px;transition:width 0.2s;';
        barOuter.appendChild(barInner);
        infoCol.appendChild(barOuter);

        item.appendChild(infoCol);
        this.agentStatusList.appendChild(item);
      });
    }

    // Update existing DOM elements to prevent image reloading/flickering
    statuses.forEach((status, i) => {
      const item = this.agentStatusList.children[i] as HTMLElement;
      if (!item) return;

      const stateEl = item.querySelector('.agent-state') as HTMLElement;
      const statusLine = item.querySelector('.agent-status-text') as HTMLElement;
      const barOuter = item.querySelector('.agent-cooldown-bar') as HTMLElement;
      const barInner = item.querySelector('.agent-cooldown-inner') as HTMLElement;

      const stateColor = STATE_COLORS[status.state] ?? '#888';
      
      if (stateEl) {
        stateEl.textContent = FRIENDLY_STATE[status.state] ?? status.state;
        stateEl.style.cssText = `font-size:11px;color:${stateColor};opacity:0.9;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;`;
      }
      
      if (statusLine) {
        statusLine.textContent = status.statusText;
      }

      if (barOuter && barInner) {
        if (status.state === 'cooldown' && status.cooldownProgress !== undefined) {
          barOuter.style.display = 'block';
          const pct = Math.min(1, Math.max(0, status.cooldownProgress)) * 100;
          barInner.style.width = `${pct}%`;
          barInner.style.background = stateColor;
        } else {
          barOuter.style.display = 'none';
        }
      }
    });
  }

  private submitTask(): void {
    const prompt = this.input.value.trim();
    if (!prompt) return;
    this.onSubmit(prompt);
    this.input.value = '';
  }
}

const STATUS_COLORS: Record<string, string> = {
  created: '#a0aec0',
  assigned: '#f6ad55',
  running: '#68d391',
  done: '#63b3ed',
  failed: '#fc8181',
};

const STATE_COLORS: Record<string, string> = {
  idle_life: '#a0aec0',
  moving_to_desk: '#f6ad55',
  working: '#68d391',
  returning_result: '#90cdf4',
  cooldown: '#b794f4',
};

const FRIENDLY_STATE: Record<string, string> = {
  idle_life: 'idle',
  moving_to_desk: 'en route',
  working: 'working',
  returning_result: 'returning',
  cooldown: 'cooldown',
};
