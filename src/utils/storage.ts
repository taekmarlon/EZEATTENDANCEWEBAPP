import { QueryPreset, School } from '../types';

export const LEGACY_SCHOOLS_KEY = 'ez-center-portal-data';
export const LEGACY_PRESETS_KEY = 'ez-center-portal-query-presets';

const DB_NAME = 'ez-center-portal-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const IDB_SCHOOLS_KEY = 'schools';
const IDB_PRESETS_KEY = 'queryPresets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('IndexedDB write failed'));
    };
  });
}

function readLegacyLocalStorage<T>(key: string): T | undefined {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return undefined;
    }
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function loadPersistedSchools(): Promise<School[]> {
  try {
    const stored = await idbGet<School[]>(IDB_SCHOOLS_KEY);
    if (Array.isArray(stored)) {
      return stored;
    }
    const legacy = readLegacyLocalStorage<School[]>(LEGACY_SCHOOLS_KEY);
    if (Array.isArray(legacy) && legacy.length > 0) {
      await idbSet(IDB_SCHOOLS_KEY, legacy);
      try {
        localStorage.removeItem(LEGACY_SCHOOLS_KEY);
      } catch {
        // ignore cleanup error
      }
      return legacy;
    }
    return [];
  } catch {
    const fallback = readLegacyLocalStorage<School[]>(LEGACY_SCHOOLS_KEY);
    return Array.isArray(fallback) ? fallback : [];
  }
}

export async function savePersistedSchools(schools: School[]): Promise<void> {
  try {
    await idbSet(IDB_SCHOOLS_KEY, schools);
  } catch (err) {
    try {
      localStorage.setItem(LEGACY_SCHOOLS_KEY, JSON.stringify(schools));
    } catch {
      throw err instanceof Error ? err : new Error('Storage quota exceeded.');
    }
  }
}

export async function loadPersistedPresets(): Promise<QueryPreset[]> {
  try {
    const stored = await idbGet<QueryPreset[]>(IDB_PRESETS_KEY);
    if (Array.isArray(stored)) {
      return stored;
    }
    const legacy = readLegacyLocalStorage<QueryPreset[]>(LEGACY_PRESETS_KEY);
    if (Array.isArray(legacy) && legacy.length > 0) {
      await idbSet(IDB_PRESETS_KEY, legacy);
      try {
        localStorage.removeItem(LEGACY_PRESETS_KEY);
      } catch {
        // ignore cleanup error
      }
      return legacy;
    }
    return [];
  } catch {
    const fallback = readLegacyLocalStorage<QueryPreset[]>(LEGACY_PRESETS_KEY);
    return Array.isArray(fallback) ? fallback : [];
  }
}

export async function savePersistedPresets(presets: QueryPreset[]): Promise<void> {
  try {
    await idbSet(IDB_PRESETS_KEY, presets);
  } catch (err) {
    try {
      localStorage.setItem(LEGACY_PRESETS_KEY, JSON.stringify(presets));
    } catch {
      throw err instanceof Error ? err : new Error('Storage quota exceeded.');
    }
  }
}

export async function clearPersistedData(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to clear IndexedDB'));
      };
    });
  } catch {
    // ignore if unavailable
  }
}
