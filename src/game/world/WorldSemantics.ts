import { ROOMS } from '../../../data/map';
import { WORLD_OBJECTS, type AffordanceType, type InteractionPoint } from '../../../data/world_objects';
import type { ScheduleWaypoint } from '../../../data/characters';
import { tileKey, type TilePoint } from '../nav/NavGrid';
import type { ReservationManager } from './ReservationManager';

export interface ResolvedTarget {
  tileX: number;
  tileY: number;
  pointKey?: string;
}

const ACTIVITY_TO_AFFORDANCE: Record<ScheduleWaypoint['activity'], AffordanceType> = {
  sleep: 'sleep',
  eat: 'eat',
  study: 'study',
  exercise: 'exercise',
  social: 'social',
  rest: 'rest',
  music: 'music',
  watch_tv: 'watch_tv',
  toilet: 'toilet',
  shower: 'shower',
  clean: 'clean',
};

export class WorldSemantics {
  private reservationManager: ReservationManager;

  constructor(reservationManager: ReservationManager) {
    this.reservationManager = reservationManager;
  }

  resolveWaypointTarget(
    waypoint: ScheduleWaypoint,
    agentId: string,
    currentTile: TilePoint,
  ): ResolvedTarget {
    const affordance = ACTIVITY_TO_AFFORDANCE[waypoint.activity];
    const objects = WORLD_OBJECTS.filter(
      (object) => object.roomId === waypoint.roomId && object.affordances.includes(affordance),
    );

    if (objects.length > 0) {
      const selected = this.chooseBestPoint(objects, agentId, currentTile);
      if (selected) {
        return selected;
      }
    }

    const room = ROOMS.find((entry) => entry.id === waypoint.roomId);
    if (room) {
      const [x, y, w, h] = room.bounds;
      return {
        tileX: x + Math.floor(w / 2),
        tileY: y + Math.floor(h / 2),
      };
    }

    return {
      tileX: waypoint.tileX,
      tileY: waypoint.tileY,
    };
  }

  releasePoint(pointKey: string | undefined, agentId: string): void {
    if (!pointKey) {
      return;
    }
    this.reservationManager.release(pointKey, agentId);
  }

  private chooseBestPoint(
    objects: typeof WORLD_OBJECTS,
    agentId: string,
    currentTile: TilePoint,
  ): ResolvedTarget | null {
    const candidates: Array<{ point: InteractionPoint; isQueue: boolean }> = [];
    for (const object of objects) {
      object.interactionPoints.forEach((point) => candidates.push({ point, isQueue: false }));
      object.queuePoints?.forEach((point) => candidates.push({ point, isQueue: true }));
    }

    candidates.sort((a, b) => {
      if (a.isQueue !== b.isQueue) {
        return Number(a.isQueue) - Number(b.isQueue);
      }
      const da = Math.abs(a.point.tileX - currentTile.x) + Math.abs(a.point.tileY - currentTile.y);
      const db = Math.abs(b.point.tileX - currentTile.x) + Math.abs(b.point.tileY - currentTile.y);
      return da - db;
    });

    for (const candidate of candidates) {
      const key = tileKey(candidate.point.tileX, candidate.point.tileY);
      if (this.reservationManager.tryReserve(key, agentId)) {
        return {
          tileX: candidate.point.tileX,
          tileY: candidate.point.tileY,
          pointKey: key,
        };
      }
    }

    return null;
  }
}
