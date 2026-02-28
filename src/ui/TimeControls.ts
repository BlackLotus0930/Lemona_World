import type { Schedule } from '../game/Schedule';

export class TimeControls {
  private schedule: Schedule;
  private container: HTMLDivElement;
  private timeEl: HTMLDivElement;
  private daySpan: HTMLSpanElement;
  private clockSpan: HTMLSpanElement;

  constructor(schedule: Schedule) {
    this.schedule = schedule;
    this.container = document.createElement('div');
    this.container.id = 'time-controls';
    this.container.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: 8px 12px;
      background: rgba(8, 12, 18, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.4);
      color: rgba(255, 255, 255, 0.95);
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10px;
      z-index: 1000;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    `;

    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 4px;';

    this.daySpan = document.createElement('span');
    this.daySpan.style.cssText = 'font-size: 6px; color: rgba(255, 255, 255, 0.75);';
    this.timeEl.appendChild(this.daySpan);

    this.clockSpan = document.createElement('span');
    this.clockSpan.style.cssText = 'font-size: 12px; font-variant-numeric: tabular-nums;';
    this.timeEl.appendChild(this.clockSpan);

    this.container.appendChild(this.timeEl);
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.container);
  }

  update() {
    const { hours, minutes, year, month, dayOfMonth } = this.schedule.getGameTime();
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const mm = month.toString().padStart(2, '0');
    const dd = dayOfMonth.toString().padStart(2, '0');
    this.daySpan.textContent = `${mm}-${dd}-${year}`;
    this.clockSpan.textContent = `${h}:${m}`;
  }
}
