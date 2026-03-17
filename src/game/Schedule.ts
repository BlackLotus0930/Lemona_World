import type { ScheduleSnapshot } from './persistence/snapshotTypes';

/**
 * Game time and schedule management.
 * One game minute = real-time seconds (scaled by clockScale).
 */

export class Schedule {
  private gameMinutes = 8 * 60 + 30; // 8:30 AM
  private gameDays = 1;
  private readonly startDate = new Date(2019, 8, 1); // 2019-09-01
  private realSecondsAccum = 0;
  private _timeScale = 1;
  private _clockScale = 1;
  private _paused = false;
  private static readonly WEEKDAY_NAMES: Array<
    'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  > = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  setTimeScale(v: number) {
    this._timeScale = Math.max(0, Math.min(32, v));
  }

  getTimeScale(): number {
    return this._timeScale;
  }

  setClockScale(v: number) {
    this._clockScale = Math.max(0, Math.min(64, v));
  }

  getClockScale(): number {
    return this._clockScale;
  }

  isPaused(): boolean {
    return this._paused;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  togglePause(): void {
    this._paused = !this._paused;
  }

  update(deltaMs: number): void {
    if (this._paused) return;
    this.realSecondsAccum += (deltaMs / 1000) * this._timeScale;
    const minutesToAdd = Math.floor(this.realSecondsAccum);
    this.realSecondsAccum -= minutesToAdd;
    this.gameMinutes += minutesToAdd;
    if (this.gameMinutes >= 24 * 60) {
      this.gameMinutes -= 24 * 60;
      this.gameDays += 1;
    }
  }

  getGameTime(): {
    day: number;
    hours: number;
    minutes: number;
    year: number;
    month: number;
    dayOfMonth: number;
    weekdayIndex: number;
    weekdayName: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  } {
    const h = Math.floor(this.gameMinutes / 60);
    const m = this.gameMinutes % 60;
    const currentDate = new Date(this.startDate);
    currentDate.setDate(this.startDate.getDate() + (this.gameDays - 1));
    const weekdayIndex = (this.gameDays - 1) % 7; // Day 1 is always Monday for school-week pacing.
    return {
      day: this.gameDays,
      hours: h,
      minutes: m,
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
      dayOfMonth: currentDate.getDate(),
      weekdayIndex,
      weekdayName: Schedule.WEEKDAY_NAMES[weekdayIndex],
    };
  }

  getTotalMinutes(): number {
    return this.gameMinutes;
  }

  exportState(): ScheduleSnapshot {
    return {
      gameMinutes: this.gameMinutes,
      gameDays: this.gameDays,
      realSecondsAccum: this.realSecondsAccum,
      timeScale: this._timeScale,
      clockScale: this._clockScale,
      paused: this._paused,
    };
  }

  importState(state: ScheduleSnapshot): void {
    this.gameMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(state.gameMinutes)));
    this.gameDays = Math.max(1, Math.floor(state.gameDays));
    this.realSecondsAccum = Math.max(0, Number(state.realSecondsAccum) || 0);
    this.setTimeScale(Number(state.timeScale) || 1);
    if (state.clockScale !== undefined) {
      this.setClockScale(Number(state.clockScale) || 1);
    }
    this._paused = Boolean(state.paused);
  }
}
