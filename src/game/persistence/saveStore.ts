import { migrateSnapshot } from './migrations';
import type { SaveGameSnapshot, SaveSlotId } from './snapshotTypes';

const DB_NAME = 'lemona-save-db';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const KEY_AUTOSAVE_LATEST = 'autosave_latest';
const KEY_AUTOSAVE_PREV = 'autosave_prev';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open save database'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result: T;
    let hasResult = false;
    Promise.resolve(run(store, tx))
      .then((value) => {
        result = value;
        hasResult = true;
      })
      .catch(reject);
    tx.onabort = () => reject(tx.error ?? new Error('Save transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Save transaction failed'));
    tx.oncomplete = () => {
      db.close();
      if (hasResult) {
        resolve(result);
      }
    };
  }));
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function slotKey(slotId: SaveSlotId): string {
  return slotId === 'autosave' ? KEY_AUTOSAVE_LATEST : `slot_${slotId}`;
}

export class SaveStore {
  async saveAutosave(snapshot: SaveGameSnapshot): Promise<void> {
    await withStore('readwrite', async (store) => {
      const latest = await requestToPromise(store.get(KEY_AUTOSAVE_LATEST));
      if (latest) {
        store.put(latest, KEY_AUTOSAVE_PREV);
      }
      store.put(snapshot, KEY_AUTOSAVE_LATEST);
    });
  }

  async saveToSlot(slotId: SaveSlotId, snapshot: SaveGameSnapshot): Promise<void> {
    if (slotId === 'autosave') {
      await this.saveAutosave(snapshot);
      return;
    }
    await withStore('readwrite', (store) => {
      store.put(snapshot, slotKey(slotId));
    });
  }

  async loadLatestAutosaveWithRollback(): Promise<SaveGameSnapshot | null> {
    const latestRaw = await withStore('readonly', (store) => requestToPromise(store.get(KEY_AUTOSAVE_LATEST)));
    const latest = migrateSnapshot(latestRaw);
    if (latest) return latest;
    const prevRaw = await withStore('readonly', (store) => requestToPromise(store.get(KEY_AUTOSAVE_PREV)));
    return migrateSnapshot(prevRaw);
  }

  async loadFromSlot(slotId: SaveSlotId): Promise<SaveGameSnapshot | null> {
    if (slotId === 'autosave') {
      return this.loadLatestAutosaveWithRollback();
    }
    const raw = await withStore('readonly', (store) => requestToPromise(store.get(slotKey(slotId))));
    return migrateSnapshot(raw);
  }

  async clearAll(): Promise<void> {
    await withStore('readwrite', (store) => {
      store.clear();
    });
  }
}

