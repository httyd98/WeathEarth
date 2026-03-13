/**
 * IndexedDB cache layer for TerraCast.
 *
 * Stores: weather data, tile blobs, GeoJSON payloads.
 * Falls back gracefully if IndexedDB is unavailable.
 */

const DB_NAME = "terracast";
const DB_VERSION = 1;

const STORE_WEATHER = "weather";
const STORE_TILES   = "tiles";
const STORE_GEODATA = "geodata";

let _db = null;
let _dbReady = null;

export function initCacheDB() {
  if (_dbReady) return _dbReady;

  _dbReady = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_WEATHER)) {
          db.createObjectStore(STORE_WEATHER);
        }
        if (!db.objectStoreNames.contains(STORE_TILES)) {
          db.createObjectStore(STORE_TILES);
        }
        if (!db.objectStoreNames.contains(STORE_GEODATA)) {
          db.createObjectStore(STORE_GEODATA);
        }
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(true);
      };
      req.onerror = () => {
        console.warn("IndexedDB open failed, cache disabled");
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
  return _dbReady;
}

function _getStore(storeName, mode = "readonly") {
  if (!_db) return null;
  try {
    const tx = _db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  } catch {
    return null;
  }
}

function _idbGet(storeName, key) {
  return new Promise((resolve) => {
    const store = _getStore(storeName);
    if (!store) return resolve(null);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

function _idbPut(storeName, key, value) {
  return new Promise((resolve) => {
    const store = _getStore(storeName, "readwrite");
    if (!store) return resolve(false);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

function _idbDelete(storeName, key) {
  return new Promise((resolve) => {
    const store = _getStore(storeName, "readwrite");
    if (!store) return resolve(false);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

// ── Weather store ──────────────────────────────────────────────────────────

export async function saveWeatherDB(payload) {
  await _idbPut(STORE_WEATHER, "current", { ts: Date.now(), ...payload });
}

export async function loadWeatherDB(maxAgeMs = 25 * 60 * 60 * 1000) {
  const data = await _idbGet(STORE_WEATHER, "current");
  if (!data?.ts) return null;
  if (maxAgeMs > 0 && Date.now() - data.ts > maxAgeMs) return null;
  return data;
}

// ── Tile store (blobs) ──────────────────────────────────────────────────────

export async function saveTileBlob(key, blob, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  await _idbPut(STORE_TILES, key, { blob, ts: Date.now(), ttl: ttlMs });
}

export async function loadTileBlob(key) {
  const entry = await _idbGet(STORE_TILES, key);
  if (!entry?.blob) return null;
  if (entry.ttl && Date.now() - entry.ts > entry.ttl) {
    _idbDelete(STORE_TILES, key);
    return null;
  }
  return entry.blob;
}

// ── GeoData store ──────────────────────────────────────────────────────────

export async function saveGeoData(key, data, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  await _idbPut(STORE_GEODATA, key, { data, ts: Date.now(), ttl: ttlMs });
}

export async function loadGeoData(key) {
  const entry = await _idbGet(STORE_GEODATA, key);
  if (!entry?.data) return null;
  if (entry.ttl && Date.now() - entry.ts > entry.ttl) {
    _idbDelete(STORE_GEODATA, key);
    return null;
  }
  return entry.data;
}

// ── Cleanup ────────────────────────────────────────────────────────────────

export async function clearExpired() {
  if (!_db) return;
  for (const storeName of [STORE_TILES, STORE_GEODATA]) {
    try {
      const tx = _db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        const entry = cursor.value;
        if (entry?.ts && entry?.ttl && Date.now() - entry.ts > entry.ttl) {
          cursor.delete();
        }
        cursor.continue();
      };
    } catch { /* ignore */ }
  }
}
