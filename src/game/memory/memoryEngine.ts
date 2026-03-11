import type { SelfNarrative } from '../../../data/characters';

export type EpisodicMemoryKind =
  | 'conflict'
  | 'support'
  | 'social_contact'
  | 'task_success'
  | 'task_failure'
  | 'reflection'
  | 'observation';

export interface EpisodicMemoryEntry {
  ts: number;
  kind: EpisodicMemoryKind;
  who: string;
  where: string;
  affect: number; // -1..1
  importance: number; // 0..1
}

export interface RetrievedMemory {
  kind: EpisodicMemoryKind;
  who: string;
  where: string;
  affect: number;
  importance: number;
  score: number;
}

export interface NarrativeEngineConfig {
  retentionHours: number;
  maxEntries: number;
  cooldownHours: number;
  thresholdBase: number;
  confidenceStep: number;
  dominanceStep: number; // blend factor toward confidence-derived dominance
  recencyHalfLifeHours: number;
  salientReserveCount: number; // preserve top salient events against spam
  spamWindowMinutes: number;
}

export const DEFAULT_NARRATIVE_ENGINE_CONFIG: NarrativeEngineConfig = {
  retentionHours: 48,
  maxEntries: 20,
  cooldownHours: 3,
  thresholdBase: 0.24,
  confidenceStep: 0.08,
  dominanceStep: 0.35,
  recencyHalfLifeHours: 12,
  salientReserveCount: 4,
  spamWindowMinutes: 20,
};

const KIND_EVIDENCE_QUALITY: Record<EpisodicMemoryKind, number> = {
  conflict: 0.9,
  support: 0.8,
  social_contact: 0.6,
  task_success: 0.72,
  task_failure: 0.72,
  reflection: 0.55,
  observation: 0.5,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function recencyWeight(entryTs: number, nowTs: number, halfLifeHours: number): number {
  const ageHours = Math.max(0, (nowTs - entryTs) / (1000 * 60 * 60));
  if (halfLifeHours <= 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

function eventSalience(entry: EpisodicMemoryEntry): number {
  const quality = KIND_EVIDENCE_QUALITY[entry.kind] ?? 0.5;
  return Math.abs(clamp(entry.affect, -1, 1)) * clamp(entry.importance, 0, 1) * quality;
}

function collapseSpamByWindow(
  entries: EpisodicMemoryEntry[],
  windowMinutes: number,
): EpisodicMemoryEntry[] {
  if (windowMinutes <= 0) return entries;
  const windowMs = windowMinutes * 60 * 1000;
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  const byKey = new Map<string, EpisodicMemoryEntry>();
  const out: EpisodicMemoryEntry[] = [];
  for (const entry of sorted) {
    const key = `${entry.kind}:${entry.who}:${entry.where}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, entry);
      out.push(entry);
      continue;
    }
    const closeInTime = Math.abs(prev.ts - entry.ts) <= windowMs;
    const isLikelySpam = closeInTime && eventSalience(entry) <= 0.62;
    if (isLikelySpam) {
      continue;
    }
    byKey.set(key, entry);
    out.push(entry);
  }
  return out;
}

export function pruneEpisodicMemory(
  entries: EpisodicMemoryEntry[],
  nowTs: number,
  config: NarrativeEngineConfig = DEFAULT_NARRATIVE_ENGINE_CONFIG,
): EpisodicMemoryEntry[] {
  const retentionMs = config.retentionHours * 60 * 60 * 1000;
  const retained = [...entries]
    .filter((entry) => nowTs - entry.ts <= retentionMs)
    .sort((a, b) => b.ts - a.ts);
  const deduped = collapseSpamByWindow(retained, config.spamWindowMinutes);

  // Keep a small salient reserve so high-frequency low-value events cannot evict key episodes.
  const salientReserve = [...deduped]
    .sort((a, b) => eventSalience(b) - eventSalience(a))
    .slice(0, Math.max(0, config.salientReserveCount));
  const reservedSet = new Set(salientReserve.map((entry) => `${entry.ts}:${entry.kind}:${entry.who}:${entry.where}`));
  const recentFill = deduped.filter((entry) => !reservedSet.has(`${entry.ts}:${entry.kind}:${entry.who}:${entry.where}`));

  return [...salientReserve, ...recentFill]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, config.maxEntries);
}

export function appendEpisodicMemory(
  entries: EpisodicMemoryEntry[],
  nextEntry: EpisodicMemoryEntry,
  nowTs: number,
  config: NarrativeEngineConfig = DEFAULT_NARRATIVE_ENGINE_CONFIG,
): EpisodicMemoryEntry[] {
  const merged = [nextEntry, ...entries];
  return pruneEpisodicMemory(merged, nowTs, config);
}

function computeAggregateEvidence(
  narrative: SelfNarrative,
  episodicMemory: EpisodicMemoryEntry[],
  nowTs: number,
  config: NarrativeEngineConfig,
): number {
  if (episodicMemory.length === 0) return 0;
  const signedSeries: number[] = [];
  for (const entry of episodicMemory) {
    const affect = clamp(entry.affect, -1, 1);
    const eventDirection = affect === 0 ? 0 : affect > 0 ? 1 : -1;
    if (eventDirection === 0) continue;
    const importance = clamp(entry.importance, 0, 1);
    const quality = KIND_EVIDENCE_QUALITY[entry.kind] ?? 0.5;
    const recency = recencyWeight(entry.ts, nowTs, config.recencyHalfLifeHours);
    // Keep semantics separate:
    // - eventDirection from affect
    // - narrativeCongruence from orientation
    // - magnitude from absolute affect * importance * quality * recency
    const narrativeCongruence =
      narrative.orientation === 'approach'
        ? (eventDirection > 0 ? 1 : -1)
        : (eventDirection < 0 ? 1 : -1);
    const magnitude = Math.abs(affect) * importance * quality * recency;
    signedSeries.push(magnitude * narrativeCongruence);
  }
  if (signedSeries.length === 0) return 0;
  const meanSigned = signedSeries.reduce((sum, score) => sum + score, 0) / signedSeries.length;
  const peakSigned = signedSeries.reduce((best, score) => (Math.abs(score) > Math.abs(best) ? score : best), 0);
  // Blend sustained trend with strongest salient episode to avoid excessive dullness.
  return meanSigned * 0.7 + peakSigned * 0.3;
}

function normalizeDominance(narratives: SelfNarrative[]): SelfNarrative[] {
  const floored = narratives.map((entry) => ({ ...entry, dominance: clamp(entry.dominance, 0.05, 0.95) }));
  const total = floored.reduce((sum, entry) => sum + entry.dominance, 0);
  if (total <= 0) {
    const fallback = 1 / Math.max(1, floored.length);
    return floored.map((entry) => ({ ...entry, dominance: fallback }));
  }
  return floored.map((entry) => ({ ...entry, dominance: entry.dominance / total }));
}

function deriveDominanceTargets(narratives: SelfNarrative[]): Record<string, number> {
  const totalConfidence = narratives.reduce((sum, narrative) => sum + clamp(narrative.confidence, 0.05, 0.95), 0);
  if (totalConfidence <= 0) {
    const fallback = 1 / Math.max(1, narratives.length);
    return Object.fromEntries(narratives.map((narrative) => [narrative.id, fallback]));
  }
  return Object.fromEntries(
    narratives.map((narrative) => [narrative.id, clamp(narrative.confidence, 0.05, 0.95) / totalConfidence]),
  );
}

export function evaluateSelfNarratives(
  narratives: SelfNarrative[],
  episodicMemory: EpisodicMemoryEntry[],
  nowTs: number,
  config: NarrativeEngineConfig = DEFAULT_NARRATIVE_ENGINE_CONFIG,
): SelfNarrative[] {
  const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
  const prunedMemory = pruneEpisodicMemory(episodicMemory, nowTs, config);
  const next = narratives.map((narrative) => ({ ...narrative }));

  for (const narrative of next) {
    const evidence = computeAggregateEvidence(narrative, prunedMemory, nowTs, config);
    const resistance = clamp(narrative.resistance, 0, 1);
    const threshold = config.thresholdBase * (1 + resistance * 0.45);
    const hasLastUpdate = typeof narrative.lastUpdatedTs === 'number' && Number.isFinite(narrative.lastUpdatedTs);
    const futureSkewMs = hasLastUpdate ? Math.max(0, (narrative.lastUpdatedTs as number) - nowTs) : 0;
    const skewLooksCorrupt = futureSkewMs > cooldownMs * 4;
    const timeSinceUpdate = !hasLastUpdate || skewLooksCorrupt
      ? Number.POSITIVE_INFINITY
      : nowTs - (narrative.lastUpdatedTs as number);
    if (Math.abs(evidence) < threshold || (cooldownMs > 0 && timeSinceUpdate < cooldownMs)) {
      continue;
    }

    const magnitude = clamp((Math.abs(evidence) - threshold) / (1 - threshold + 1e-6), 0, 1);
    const direction = evidence >= 0 ? 1 : -1;
    narrative.confidence = clamp(narrative.confidence + direction * config.confidenceStep * magnitude, 0.05, 0.95);
    narrative.lastUpdatedTs = nowTs;
  }

  // Dominance follows relative confidence (anchored semantics), blended to avoid jitter.
  const targets = deriveDominanceTargets(next);
  for (const narrative of next) {
    const target = targets[narrative.id] ?? narrative.dominance;
    const blend = clamp(config.dominanceStep, 0, 1);
    narrative.dominance = clamp(
      narrative.dominance + (target - narrative.dominance) * blend,
      0.05,
      0.95,
    );
  }
  return normalizeDominance(next);
}

export function scoreMemoryRelevance(
  entry: EpisodicMemoryEntry,
  nowTs: number,
  options: {
    relatedAgentId?: string;
    currentRoomId?: string;
    relationshipAffinity?: number;
    recencyHalfLifeHours?: number;
  } = {},
): number {
  const recency = recencyWeight(entry.ts, nowTs, options.recencyHalfLifeHours ?? 18);
  const affectWeight = Math.abs(clamp(entry.affect, -1, 1));
  const relationshipBoost = Math.max(0, (options.relationshipAffinity ?? 0) / 100) * 0.2;
  const actorBoost = options.relatedAgentId && entry.who === options.relatedAgentId ? 0.28 : 0;
  const locationBoost = options.currentRoomId && entry.where === options.currentRoomId ? 0.12 : 0;
  return clamp(
    recency * 0.42 +
      clamp(entry.importance, 0, 1) * 0.3 +
      affectWeight * 0.18 +
      relationshipBoost +
      actorBoost +
      locationBoost,
    0,
    1.5,
  );
}

export function retrieveTopMemories(
  entries: EpisodicMemoryEntry[],
  nowTs: number,
  topK = 4,
  options: {
    relatedAgentId?: string;
    currentRoomId?: string;
    relationshipAffinity?: number;
  } = {},
): RetrievedMemory[] {
  return [...entries]
    .map((entry) => ({
      kind: entry.kind,
      who: entry.who,
      where: entry.where,
      affect: clamp(entry.affect, -1, 1),
      importance: clamp(entry.importance, 0, 1),
      score: scoreMemoryRelevance(entry, nowTs, options),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK));
}
