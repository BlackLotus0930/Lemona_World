import type { AgentProtocolEvent } from '../agent/protocol';

const EVENT_LABELS: Record<string, string> = {
  TASK_CREATED: 'Task posted',
  TASK_ASSIGNED: 'Assigned',
  AGENT_THINKING: 'Thinking',
  AGENT_TOOL_CALL: 'Using tool',
  AGENT_RESULT: 'Result ready',
  TASK_DONE: 'Completed',
  TASK_FAILED: 'Failed',
};

const EVENT_COLORS: Record<string, string> = {
  TASK_CREATED: '#a0aec0',
  TASK_ASSIGNED: '#f6ad55',
  AGENT_THINKING: '#90cdf4',
  AGENT_TOOL_CALL: '#b794f4',
  AGENT_RESULT: '#68d391',
  TASK_DONE: '#63b3ed',
  TASK_FAILED: '#fc8181',
};

export class AgentTimeline {
  private root: HTMLDivElement;
  private list: HTMLDivElement;
  private maxEntries = 60;
  private collapsed = false;
  private nameMap: Map<string, string>;

  constructor(nameMap: Map<string, string>) {
    this.nameMap = nameMap;

    this.root = document.createElement('div');
    this.root.id = 'agent-timeline';
    this.root.style.cssText = `
      position: fixed;
      right: 12px;
      top: 12px;
      width: 300px;
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: rgba(10, 8, 18, 0.88);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      color: #f7f2ff;
      font-family: system-ui, sans-serif;
      padding: 10px;
      z-index: 1100;
      backdrop-filter: blur(3px);
      font-size: 12px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:8px;';

    const title = document.createElement('span');
    title.textContent = 'Timeline';
    title.style.cssText = 'font-size:14px;font-weight:700;';
    header.appendChild(title);

    const arrow = document.createElement('span');
    arrow.textContent = '▾';
    arrow.style.cssText = 'font-size:10px;opacity:0.6;transition:transform 0.15s;';
    header.appendChild(arrow);

    header.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.list.style.display = this.collapsed ? 'none' : 'grid';
      arrow.style.transform = this.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.style.cssText = 'display:grid;gap:5px;';
    this.root.appendChild(this.list);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  appendEvent(event: AgentProtocolEvent): void {
    const item = document.createElement('div');
    item.style.cssText = `
      border:1px solid rgba(255,255,255,0.10);
      border-radius:7px;
      padding:5px 8px;
      background: rgba(255,255,255,0.03);
      line-height:1.4;
    `;

    const label = EVENT_LABELS[event.type] ?? event.type;
    const color = EVENT_COLORS[event.type] ?? '#999';
    const agentName = event.agentId ? (this.nameMap.get(event.agentId) ?? event.agentId) : '';
    const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:11px;';
    topRow.innerHTML = `<span style="color:${color};font-weight:600">${escapeHtml(label)}</span><span style="opacity:0.5;font-size:10px">${time}</span>`;
    item.appendChild(topRow);

    if (agentName) {
      const agentRow = document.createElement('div');
      agentRow.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;opacity:0.85;margin-top:3px;';
      
      const avatar = document.createElement('img');
      avatar.src = `./assets/characters_profile_pictures/${agentName}_profile.png`;
      avatar.style.cssText = 'width:16px;height:16px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = agentName;
      nameSpan.style.cssText = 'font-weight:600;';
      
      agentRow.appendChild(avatar);
      agentRow.appendChild(nameSpan);
      item.appendChild(agentRow);
    }

    if (event.summary) {
      const summaryRow = document.createElement('div');
      summaryRow.style.cssText = 'font-size:11px;opacity:0.6;margin-top:1px;';
      summaryRow.textContent = event.summary;
      item.appendChild(summaryRow);
    }

    this.list.prepend(item);
    while (this.list.children.length > this.maxEntries) {
      this.list.removeChild(this.list.lastElementChild as ChildNode);
    }
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
