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

export interface EngagementContext {
  objectId?: string;
  objectName?: string;
  affordance?: AffordanceType;
  pose?: InteractionPose;
  immediateSituation: string;
}

const ACTIVITY_TO_AFFORDANCE: Record<ScheduleWaypoint['activity'], AffordanceType> = {
  sleep: 'sleep',
  eat: 'eat',
  study: 'study',
  class_study: 'study',
  library_study: 'study',
  read: 'read',
  exercise: 'exercise',
  sports_ball: 'sports_ball',
  social: 'social',
  rest: 'rest',
  music: 'music',
  perform: 'perform',
  watch_tv: 'watch_tv',
  toilet: 'toilet',
  shower: 'shower',
  bathe: 'bathe',
  clean: 'clean',
  cook: 'cook',
  laundry: 'laundry',
  decorate: 'decorate',
};

const ACTIVITY_OBJECT_PREFERENCES: Partial<Record<ScheduleWaypoint['activity'], string[]>> = {
  sleep: ['bed'],
  eat: ['table', 'chair'],
  study: ['desk', 'computer', 'class', 'study_table', 'table', 'blackboard', 'bookshelf'],
  class_study: ['class', 'blackboard', 'teacher', 'desk', 'study_table', 'table'],
  library_study: ['library', 'bookshelf', 'book_stand', 'table'],
  read: ['bookshelf', 'book', 'library', 'book_stand', 'table'],
  exercise: ['treadmill', 'punching', 'bench', 'gym'],
  sports_ball: ['basketball', 'yoga_ball', 'ball', 'gym_ball', 'bench'],
  social: ['sofa', 'chair', 'table'],
  rest: ['sofa', 'bed', 'bench', 'chair'],
  music: ['music', 'piano', 'instrument', 'microphone'],
  perform: ['microphone', 'guitar', 'piano', 'instrument', 'music'],
  watch_tv: ['tv', 'television', 'sofa'],
  toilet: ['toilet'],
  shower: ['shower'],
  bathe: ['bathtub', 'bath'],
  clean: ['sink', 'kitchen', 'stove', 'fridge', 'kitchen_appliance', 'cabinet'],
  cook: ['stove', 'microwave', 'bread', 'coffee', 'kitchen'],
  laundry: ['washing_machine', 'sink', 'bathroom'],
  decorate: ['dressing_table', 'mirror', 'figurine', 'lamp', 'dashboard', 'camera', 'bottles'],
};

const ROOM_ACTIVITY_OVERRIDES: Record<string, Partial<Record<ScheduleWaypoint['activity'], string[]>>> = {
  canteen: {
    eat: ['table', 'chair'],
    clean: ['sink', 'stove', 'fridge', 'kitchen'],
    cook: ['stove', 'microwave', 'coffee', 'bread', 'kitchen'],
  },
  hall1: {
    rest: ['sofa'],
    watch_tv: ['tv', 'sofa'],
    social: ['sofa'],
  },
  gym: {
    exercise: ['treadmill', 'punching', 'bench'],
    sports_ball: ['ball', 'yoga_ball', 'basketball'],
  },
  library: {
    library_study: ['library', 'bookshelf', 'book'],
    read: ['bookshelf', 'book', 'library'],
  },
  class1: {
    class_study: ['class', 'blackboard', 'teacher', 'desk'],
  },
  bathroom1: {
    laundry: ['washing_machine', 'sink'],
    bathe: ['bathtub', 'shower'],
  },
  bathroom2: {
    laundry: ['washing_machine', 'sink'],
    bathe: ['bathtub', 'shower'],
  },
  dorm2: {
    decorate: ['dressing_table', 'mirror', 'figurine'],
  },
};

const QUEUE_FALLBACK_ACTIVITIES = new Set<ScheduleWaypoint['activity']>([
  'eat',
  'cook',
  'clean',
  'laundry',
  'toilet',
  'shower',
  'bathe',
]);

/** Only these activities allow "next to" furniture when the exact spot is taken. Others require the exact interaction point. */
const ADJACENT_FALLBACK_ACTIVITIES = new Set<ScheduleWaypoint['activity']>([
  'rest',
  'social',
  'watch_tv',
  'read',
  'decorate',
]);

const CLASS1_STUDENT_SEAT_BY_AGENT: Record<string, string> = {
  npc1: 'class1_seat_a',
  npc2: 'class1_seat_b',
  npc3: 'class1_seat_i',
  npc4: 'class1_seat_d',
  npc5: 'class1_seat_e',
  npc6: 'class1_seat_f',
  npc7: 'class1_seat_c',
};
const CLASS1_TEACHER_FRONT_BY_AGENT: Record<string, string> = {
  npc8: 'class1_front_1',
};

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

  describeEngagement(
    waypoint: Pick<ScheduleWaypoint, 'activity' | 'roomId'> | undefined,
    target: Pick<ResolvedTarget, 'tileX' | 'tileY' | 'pose'> | undefined,
  ): EngagementContext {
    const activity = waypoint?.activity;
    const roomId = waypoint?.roomId;
    const affordance = activity ? ACTIVITY_TO_AFFORDANCE[activity] : undefined;
    const object = roomId && target
      ? this.findObjectByTile(roomId, target.tileX, target.tileY)
      : undefined;
    const objectName = object?.name;
    const pose = target?.pose;
    return {
      objectId: object?.id,
      objectName,
      affordance,
      pose,
      immediateSituation: this.buildImmediateSituation(activity, roomId, objectName, pose),
    };
  }

  private chooseBestPoint(
    waypoint: ScheduleWaypoint,
    objects: typeof WORLD_OBJECTS,
    agentId: string,
    currentTile: TilePoint,
  ): ResolvedTarget | null {
    const fixedSeat = this.resolveFixedClassSeat(waypoint, objects, agentId);
    if (fixedSeat) {
      return fixedSeat;
    }

    const narrowedObjects = this.filterObjectsForRole(waypoint, objects, agentId);
    const candidates: Array<{ object: WorldObjectDefinition; point: InteractionPoint; isQueue: boolean }> = [];
    for (const object of narrowedObjects) {
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

  private filterObjectsForRole(
    waypoint: ScheduleWaypoint,
    objects: typeof WORLD_OBJECTS,
    agentId: string,
  ): typeof WORLD_OBJECTS {
    if (waypoint.roomId === 'class1' && waypoint.activity !== 'class_study') {
      const nonSeat = objects.filter((object) =>
        !object.id.startsWith('class1_seat_') && object.id !== 'class1_teacher_front');
      if (nonSeat.length > 0) return nonSeat;
    }
    if (waypoint.activity !== 'class_study' || waypoint.roomId !== 'class1') {
      return objects;
    }
    if (agentId === 'npc8') {
      const teacherFront = objects.filter((object) => object.id === 'class1_teacher_front');
      return teacherFront.length > 0 ? teacherFront : objects;
    }
    const studentOnly = objects.filter((object) => object.id !== 'class1_teacher_front');
    return studentOnly.length > 0 ? studentOnly : objects;
  }

  private resolveFixedClassSeat(
    waypoint: ScheduleWaypoint,
    objects: typeof WORLD_OBJECTS,
    agentId: string,
  ): ResolvedTarget | null {
    if (waypoint.activity !== 'class_study' || waypoint.roomId !== 'class1') {
      return null;
    }
    const studentSeatId = CLASS1_STUDENT_SEAT_BY_AGENT[agentId];
    const teacherFrontId = CLASS1_TEACHER_FRONT_BY_AGENT[agentId];
    const wantedPointId = teacherFrontId ?? studentSeatId;
    if (!wantedPointId) return null;

    for (const object of objects) {
      for (const point of object.interactionPoints) {
        if (point.id !== wantedPointId) continue;
        // Class seat points can become temporarily non-walkable depending on map collision data.
        // Reserve a nearby walkable tile first to keep class movement robust.
        const near = this.findAndReserveNearTile(point.tileX, point.tileY, agentId);
        if (near) {
          this.rememberObjectForActivity(agentId, waypoint.activity, object.id);
          return {
            ...near,
            facing: point.facing,
            pose: point.pose ?? near.pose,
          };
        }
        return null;
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

  private findObjectByTile(roomId: string, tileX: number, tileY: number): WorldObjectDefinition | undefined {
    return WORLD_OBJECTS.find((object) =>
      object.roomId === roomId
      && (
        object.interactionPoints.some((point) => point.tileX === tileX && point.tileY === tileY)
        || object.queuePoints?.some((point) => point.tileX === tileX && point.tileY === tileY)
      ));
  }

  private buildImmediateSituation(
    activity: ScheduleWaypoint['activity'] | undefined,
    roomId: string | undefined,
    objectName: string | undefined,
    pose: InteractionPose | undefined,
  ): string {
    const action = activity ? this.describeActivityVerb(activity) : 'going about the day';
    const objectPhrase = objectName ? `at ${objectName}` : undefined;
    const posePhrase = pose ? this.describePosePhrase(pose) : undefined;
    const roomPhrase = roomId ? `in ${roomId}` : undefined;
    return [action, objectPhrase, posePhrase, roomPhrase].filter(Boolean).join(' ');
  }

  private describeActivityVerb(activity: ScheduleWaypoint['activity']): string {
    const map: Record<ScheduleWaypoint['activity'], string> = {
      sleep: 'trying to sleep',
      eat: 'eating',
      study: 'studying',
      class_study: 'following class',
      library_study: 'settling into quiet study',
      read: 'reading quietly',
      exercise: 'working out',
      sports_ball: 'practicing with a ball',
      social: 'lingering socially',
      rest: 'taking a breather',
      music: 'practicing music',
      perform: 'performing',
      watch_tv: 'watching something',
      toilet: 'using the bathroom',
      shower: 'getting cleaned up',
      bathe: 'taking a bath',
      clean: 'cleaning up',
      cook: 'making something to eat',
      laundry: 'doing laundry',
      decorate: 'adjusting personal things',
    };
    return map[activity] ?? 'going about the day';
  }

  private describePosePhrase(pose: InteractionPose): string {
    if (pose === 'sit') return 'while seated';
    if (pose === 'lie') return 'while lying down';
    return 'while standing';
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
