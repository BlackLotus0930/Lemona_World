export class ReservationManager {
  private reservedByPoint = new Map<string, string>();
  private pointsByAgent = new Map<string, Set<string>>();

  isReservedByOther(pointKey: string, agentId: string): boolean {
    const owner = this.reservedByPoint.get(pointKey);
    return owner != null && owner !== agentId;
  }

  tryReserve(pointKey: string, agentId: string): boolean {
    if (this.isReservedByOther(pointKey, agentId)) {
      return false;
    }

    this.reservedByPoint.set(pointKey, agentId);
    let owned = this.pointsByAgent.get(agentId);
    if (!owned) {
      owned = new Set<string>();
      this.pointsByAgent.set(agentId, owned);
    }
    owned.add(pointKey);
    return true;
  }

  release(pointKey: string, agentId: string): void {
    const owner = this.reservedByPoint.get(pointKey);
    if (owner !== agentId) {
      return;
    }
    this.reservedByPoint.delete(pointKey);
    const owned = this.pointsByAgent.get(agentId);
    if (!owned) {
      return;
    }
    owned.delete(pointKey);
    if (owned.size === 0) {
      this.pointsByAgent.delete(agentId);
    }
  }

  releaseAllForAgent(agentId: string): void {
    const owned = this.pointsByAgent.get(agentId);
    if (!owned) {
      return;
    }
    for (const key of owned) {
      const owner = this.reservedByPoint.get(key);
      if (owner === agentId) {
        this.reservedByPoint.delete(key);
      }
    }
    this.pointsByAgent.delete(agentId);
  }

  getReservedEntries(): Array<{ pointKey: string; agentId: string }> {
    return [...this.reservedByPoint.entries()].map(([pointKey, agentId]) => ({ pointKey, agentId }));
  }
}
