import { SAVE_SCHEMA_VERSION, type SaveGameSnapshot } from './snapshotTypes';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function migrateSnapshot(raw: unknown): SaveGameSnapshot | null {
  if (!isObject(raw)) return null;
  const meta = raw.meta;
  if (!isObject(meta)) return null;
  const schemaVersion = Number(meta.schemaVersion);
  if (!Number.isFinite(schemaVersion)) return null;
  if (schemaVersion !== SAVE_SCHEMA_VERSION) {
    return null;
  }
  const schedule = raw.schedule;
  const characters = raw.characters;
  const simulationMaps = raw.simulationMaps;
  if (!isObject(schedule) || !Array.isArray(characters) || !isObject(simulationMaps)) {
    return null;
  }
  return raw as unknown as SaveGameSnapshot;
}

