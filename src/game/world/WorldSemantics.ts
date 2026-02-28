import { ROOMS } from '../../../data/map';
import {
  WORLD_OBJECTS,
  type AffordanceType,
  type FacingDirection,
  type InteractionPoint,
  type InteractionPose,
  type WorldObjectDefinition,
} from '../../../data/world_objects';
import type { ScheduleWaypoint } from '../../../data/characters';
import { tileKey, type TilePoint } from '../nav/NavGrid';
import type { NavGrid } from '../nav/NavGrid';
import type { ReservationManager } from './ReservationManager';

export interface ResolvedTarget {
  tileX: number;
  tileY: number;
  pointKey?: string;
  facing?: FacingDirection;
  pose?: InteractionPose;
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

const ACTIVITY_OBJECT_PREFERENCES: Partial<Record<ScheduleWaypoint['activity'], string[]>> = {
  sleep: ['bed'],
  eat: ['table', 'chair'],
  study: ['desk', 'computer', 'class', 'study_table', 'table'],
  exercise: ['treadmill', 'punching', 'bench'],
  social: ['sofa', 'chair', 'table'],
  rest: ['sofa', 'bed', 'bench', 'chair'],
  music: ['music', 'piano', 'instrument', 'microphone'],
  watch_tv: ['tv', 'television', 'sofa'],
  toilet: ['toilet'],
  shower: ['shower', 'bath'],
  clean: ['sink', 'kitchen', 'stove', 'fridge', 'kitchen_appliance'],
};

const ROOM_ACTIVITY_OVERRIDES: Record<string, Partial<Record<ScheduleWaypoint['activity'], string[]>>> = {
  canteen: {
    eat: ['table', 'chair'],
    clean: ['sink', 'stove', 'fridge', 'kitchen'],
  },
  hall1: {
    rest: ['sofa'],
    watch_tv: ['tv', 'sofa'],
    social: ['sofa'],
  },
  gym: {
    exercise: ['treadmill', 'punching', 'bench'],
  },
};

const QUEUE_FALLBACK_ACTIVITIES = new Set<ScheduleWaypoint['activity']>([
  'eat',
  'clean',
  'toilet',
  'shower',
]);

/** Only these activities allow "next to" furniture when the exact spot is taken. Others require the exact interaction point. */
const ADJACENT_FALLBACK_ACTIVITIES = new Set<ScheduleWaypoint['activity']>([
  'rest',
  'social',
  'watch_tv',
]);

export class WorldSemantics {
  private reservationManager: ReservationManager;
  private navGrid?: NavGrid;
  private lastObjectByAgent = new Map<string, Partial<Record<ScheduleWaypoint['activity'], string>>>();

  constructor(reservationManager: ReservationManager) {
    this.reservationManager = reservationManager;
  }

  setNavGrid(navGrid: NavGrid): void {
    this.navGrid = navGrid;
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
      const selected = this.chooseBestPoint(waypoint, objects, agentId, currentTile);
      if (selected) {
        return selected;
      }
    }

    if (Number.isFinite(waypoint.tileX) && Number.isFinite(waypoint.tileY)) {
      const reserved = this.findAndReserveNearTile(
        waypoint.tileX,
        waypoint.tileY,
        agentId,
      );
      return reserved ?? { tileX: waypoint.tileX, tileY: waypoint.tileY };
    }

    const room = ROOMS.find((entry) => entry.id === waypoint.roomId);
    if (room) {
      const [x, y, w, h] = room.bounds;
      const cx = x + Math.floor(w / 2);
      const cy = y + Math.floor(h / 2);
      const reserved = this.findAndReserveNearTile(cx, cy, agentId);
      return reserved ?? { tileX: cx, tileY: cy };
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
    waypoint: ScheduleWaypoint,
    objects: typeof WORLD_OBJECTS,
    agentId: string,
    currentTile: TilePoint,
  ): ResolvedTarget | null {
    const candidates: Array<{ object: WorldObjectDefinition; point: InteractionPoint; isQueue: boolean }> = [];
    for (const object of objects) {
      object.interactionPoints.forEach((point) => candidates.push({ object, point, isQueue: false }));
      object.queuePoints?.forEach((point) => candidates.push({ object, point, isQueue: true }));
    }

    const allowQueueFallback = QUEUE_FALLBACK_ACTIVITIES.has(waypoint.activity);
    const lastObjectUsed = this.lastObjectByAgent.get(agentId)?.[waypoint.activity];

    candidates.sort((a, b) => {
      const objectPreference = this.compareObjectSuitability(waypoint, a.object, b.object);
      if (objectPreference !== 0) {
        return objectPreference;
      }
      if (lastObjectUsed) {
        const aIsRepeat = a.object.id === lastObjectUsed;
        const bIsRepeat = b.object.id === lastObjectUsed;
        if (aIsRepeat !== bIsRepeat) {
          return Number(aIsRepeat) - Number(bIsRepeat);
        }
      }
      if (a.isQueue !== b.isQueue) {
        return Number(a.isQueue) - Number(b.isQueue);
      }
      const da = Math.abs(a.point.tileX - currentTile.x) + Math.abs(a.point.tileY - currentTile.y);
      const db = Math.abs(b.point.tileX - currentTile.x) + Math.abs(b.point.tileY - currentTile.y);
      return da - db;
    });

    const primaryCandidates = candidates.filter((candidate) => !candidate.isQueue);
    const queueCandidates = candidates.filter((candidate) => candidate.isQueue);

    for (const candidate of primaryCandidates) {
      const key = tileKey(candidate.point.tileX, candidate.point.tileY);
      if (this.reservationManager.tryReserve(key, agentId)) {
        this.rememberObjectForActivity(agentId, waypoint.activity, candidate.object.id);
        return {
          tileX: candidate.point.tileX,
          tileY: candidate.point.tileY,
          pointKey: key,
          facing: candidate.point.facing,
          pose: candidate.point.pose,
        };
      }
    }

    // Only use adjacent fallback for activities where "near" is acceptable (rest, social, watch_tv).
    // For music, study, eat, sleep, exercise, toilet, shower: require the exact spot.
    if (
      ADJACENT_FALLBACK_ACTIVITIES.has(waypoint.activity) &&
      primaryCandidates.length > 0 &&
      this.navGrid
    ) {
      const adjacent = this.findAndReserveAdjacentToFurniture(
        primaryCandidates.map((c) => ({ point: c.point, facing: c.point.facing })),
        agentId,
      );
      if (adjacent) {
        this.rememberObjectForActivity(agentId, waypoint.activity, primaryCandidates[0].object.id);
        return adjacent;
      }
    }

    if (allowQueueFallback) {
      for (const candidate of queueCandidates) {
        const key = tileKey(candidate.point.tileX, candidate.point.tileY);
        if (this.reservationManager.tryReserve(key, agentId)) {
          this.rememberObjectForActivity(agentId, waypoint.activity, candidate.object.id);
          return {
            tileX: candidate.point.tileX,
            tileY: candidate.point.tileY,
            pointKey: key,
            facing: candidate.point.facing,
            pose: candidate.point.pose,
          };
        }
      }
    }

    return null;
  }

  private compareObjectSuitability(
    waypoint: ScheduleWaypoint,
    a: WorldObjectDefinition,
    b: WorldObjectDefinition,
  ): number {
    const scoreA = this.objectSuitabilityScore(waypoint, a);
    const scoreB = this.objectSuitabilityScore(waypoint, b);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.id.localeCompare(b.id);
  }

  private objectSuitabilityScore(
    waypoint: ScheduleWaypoint,
    object: WorldObjectDefinition,
  ): number {
    const roomOverrides = ROOM_ACTIVITY_OVERRIDES[waypoint.roomId]?.[waypoint.activity] ?? [];
    const generic = ACTIVITY_OBJECT_PREFERENCES[waypoint.activity] ?? [];
    const terms = [...roomOverrides, ...generic];
    if (terms.length === 0) return 0;
    const idName = `${object.id} ${object.name}`.toLowerCase();
    let score = 0;
    for (let i = 0; i < terms.length; i += 1) {
      const term = terms[i];
      if (!term) continue;
      if (idName.includes(term.toLowerCase())) {
        // Earlier terms are stronger intent (e.g. treadmill before punching bag).
        score += Math.max(1, 100 - i * 8);
      }
    }
    return score;
  }

  private rememberObjectForActivity(
    agentId: string,
    activity: ScheduleWaypoint['activity'],
    objectId: string,
  ): void {
    const perAgent = this.lastObjectByAgent.get(agentId) ?? {};
    perAgent[activity] = objectId;
    this.lastObjectByAgent.set(agentId, perAgent);
  }

  private findAndReserveAdjacentToFurniture(
    points: Array<{ point: InteractionPoint; facing?: FacingDirection }>,
    agentId: string,
  ): ResolvedTarget | null {
    if (!this.navGrid) return null;
    for (const { point, facing } of points) {
      const neighbors = this.navGrid.getNeighbors({ x: point.tileX, y: point.tileY });
      for (const n of neighbors) {
        const key = tileKey(n.x, n.y);
        if (!this.reservationManager.isReservedByOther(key, agentId) &&
            this.reservationManager.tryReserve(key, agentId)) {
          return {
            tileX: n.x,
            tileY: n.y,
            pointKey: key,
            facing: facing ?? point.facing,
            pose: point.pose,
          };
        }
      }
    }
    return null;
  }

  private findAndReserveNearTile(
    centerX: number,
    centerY: number,
    agentId: string,
  ): ResolvedTarget | null {
    if (!this.navGrid) return null;
    const key = tileKey(centerX, centerY);
    if (
      this.navGrid.isWalkable(centerX, centerY) &&
      !this.reservationManager.isReservedByOther(key, agentId) &&
      this.reservationManager.tryReserve(key, agentId)
    ) {
      return { tileX: centerX, tileY: centerY, pointKey: key, pose: 'stand' };
    }
    const neighbors = this.navGrid.getNeighbors({ x: centerX, y: centerY });
    for (const n of neighbors) {
      const k = tileKey(n.x, n.y);
      if (
        !this.reservationManager.isReservedByOther(k, agentId) &&
        this.reservationManager.tryReserve(k, agentId)
      ) {
        return { tileX: n.x, tileY: n.y, pointKey: k, pose: 'stand' };
      }
    }
    for (let r = 2; r <= 4; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = centerX + dx;
          const y = centerY + dy;
          if (!this.navGrid.isWalkable(x, y)) continue;
          const k = tileKey(x, y);
          if (
            !this.reservationManager.isReservedByOther(k, agentId) &&
            this.reservationManager.tryReserve(k, agentId)
          ) {
            return { tileX: x, tileY: y, pointKey: k, pose: 'stand' };
          }
        }
      }
    }
    return null;
  }
}
