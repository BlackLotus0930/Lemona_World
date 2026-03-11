import type { Schedule } from '../game/Schedule';

const TIMESTAMP_BANNER_PATH = '/assets/user_interface/timestamp_banner.png';
const CLOCK_SPRITE_PATH = '/assets/user_interface/clock.png';
const CLOCK_SPRITE_COLS = 6;
const CLOCK_SPRITE_ROWS = 3;
const WEEKDAY_ABBR: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

export class TimeControls {
  private schedule: Schedule;
  private container: HTMLDivElement;
  private iconCanvas: HTMLCanvasElement;
  private iconCtx: CanvasRenderingContext2D;
  private timeEl: HTMLDivElement;
  private daySpan: HTMLSpanElement;
  private clockSpan: HTMLSpanElement;
  private clockSprite = new Image();
  private clockSpriteReady = false;

  constructor(schedule: Schedule) {
    this.schedule = schedule;
    this.container = document.createElement('div');
    this.container.id = 'time-controls';
    this.container.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      width: 160px;
      min-height: 58px;
      padding: 8px 12px 8px 12px;
      box-sizing: border-box;
      background-image: url('${TIMESTAMP_BANNER_PATH}');
      background-repeat: no-repeat;
      background-size: 100% 100%;
      color: #4a2f1b;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 11px;
      z-index: 1000;
      transform: rotate(-0.35deg);
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    `;

    this.iconCanvas = document.createElement('canvas');
    this.iconCanvas.width = 26;
    this.iconCanvas.height = 26;
    this.iconCanvas.style.cssText = `
      width: 26px;
      height: 26px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      margin-left: 2px;
    `;
    const iconCtx = this.iconCanvas.getContext('2d');
    if (!iconCtx) {
      throw new Error('Unable to initialize timestamp clock canvas context');
    }
    iconCtx.imageSmoothingEnabled = false;
    this.iconCtx = iconCtx;

    this.timeEl = document.createElement('div');
    this.timeEl.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px;';

    this.daySpan = document.createElement('span');
    this.daySpan.style.cssText = `
      font-size: 10px;
      line-height: 1.1;
      letter-spacing: 0.3px;
      color: #6f4526;
      text-shadow: 1px 1px 0 #f6d6a8;
      transform: translateX(1px);
    `;
    this.timeEl.appendChild(this.daySpan);

    this.clockSpan = document.createElement('span');
    this.clockSpan.style.cssText = `
      font-size: 14px;
      line-height: 1;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.4px;
      color: #4a2f1b;
      text-shadow: 1px 1px 0 #f6d6a8;
    `;
    this.timeEl.appendChild(this.clockSpan);

    this.container.appendChild(this.iconCanvas);
    this.container.appendChild(this.timeEl);

    this.clockSprite.src = CLOCK_SPRITE_PATH;
    this.clockSprite.onload = () => {
      this.clockSpriteReady = true;
      this.renderClockIcon(8);
    };
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.container);
  }

  update() {
    const { hours, minutes, year, month, dayOfMonth, weekdayName } = this.schedule.getGameTime();
    const h12 = hours % 12 || 12;
    const h = h12.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const ampm = hours < 12 ? 'AM' : 'PM';
    const mm = month.toString().padStart(2, '0');
    const dd = dayOfMonth.toString().padStart(2, '0');
    const weekdayAbbr = WEEKDAY_ABBR[weekdayName] ?? weekdayName.slice(0, 3);
    this.daySpan.textContent = `${weekdayAbbr} ${mm}-${dd}-${year}`;
    this.clockSpan.textContent = `${h}:${m} ${ampm}`;
    this.renderClockIcon(hours);
  }

  private renderClockIcon(hours24: number): void {
    if (!this.clockSpriteReady) return;
    const row = this.getClockRowForTime(hours24);
    const col = Math.floor((((hours24 % 24) + 24) % 24) / 4);
    const frameW = Math.floor(this.clockSprite.width / CLOCK_SPRITE_COLS);
    const frameH = Math.floor(this.clockSprite.height / CLOCK_SPRITE_ROWS);
    const sx = Math.max(0, Math.min(CLOCK_SPRITE_COLS - 1, col)) * frameW;
    const sy = Math.max(0, Math.min(CLOCK_SPRITE_ROWS - 1, row)) * frameH;

    this.iconCtx.clearRect(0, 0, this.iconCanvas.width, this.iconCanvas.height);
    this.iconCtx.drawImage(
      this.clockSprite,
      sx,
      sy,
      frameW,
      frameH,
      0,
      0,
      this.iconCanvas.width,
      this.iconCanvas.height,
    );
  }

  private getClockRowForTime(hours24: number): number {
    // Top row: daytime, middle row: sunset/evening, bottom row: night.
    if (hours24 >= 7 && hours24 < 17) return 0;
    if (hours24 >= 17 && hours24 < 21) return 1;
    return 2;
  }
}
