/**
 * Game time and schedule management.
 * One game minute = real-time seconds (scaled by timeScale).
 */

export class Schedule {
  private gameMinutes = 7 * 60; // 7:00 AM
  private gameDays = 1;
  private realSecondsAccum = 0;
  private _timeScale = 1;
  private _paused = false;

  setTimeScale(v: number) {
    this._timeScale = Math.max(0, Math.min(5, v));
  }

  getTimeScale(): number {
    return this._timeScale;
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

  getGameTime(): { day: number; hours: number; minutes: number } {
    const h = Math.floor(this.gameMinutes / 60);
    const m = this.gameMinutes % 60;
    return { day: this.gameDays, hours: h, minutes: m };
  }

  getTotalMinutes(): number {
    return this.gameMinutes;
  }
}
