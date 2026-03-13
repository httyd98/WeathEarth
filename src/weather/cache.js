import { STORAGE_PREFIX, CACHE_FRESHNESS_MS } from "../constants.js";
import { weatherState, dom } from "../state.js";
import { PROVIDERS } from "../providers.js";

export const WEATHER_CACHE_KEY = `${STORAGE_PREFIX}:weather_v1`;
export const WEATHER_CACHE_MAX_AGE_MS = 25 * 60 * 60 * 1000; // 25h — survives one full cycle
export const WEATHER_SNAPSHOT_KEY = `${STORAGE_PREFIX}:weather_snapshot_v1`;

/**
 * Save weather data to cache. Uses a merge strategy:
 * - Always merge new data INTO existing cache (never lose existing points)
 * - Only overwrite a point's data if the new data is more complete
 * - Update the snapshot only if we have substantial data (≥50 points)
 */
export function saveWeatherCache(points) {
  try {
    const validPoints = points.filter((p) => p.current !== null && p.current !== undefined);
    const validCount = validPoints.length;

    // If 0 valid points, skip both writes to preserve any existing snapshot
    if (validCount === 0) return;

    // Try to merge with existing cache data to avoid losing points
    let existingData = null;
    try {
      const raw = localStorage.getItem(WEATHER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.data) existingData = parsed.data;
      }
    } catch { /* ignore parse errors */ }

    // Build a Map of existing cached data keyed by lat,lon
    const mergedMap = new Map();
    if (existingData) {
      for (const d of existingData) {
        if (d.current) {
          mergedMap.set(`${d.lat},${d.lon}`, d);
        }
      }
    }

    // Overwrite/add new data
    for (const p of validPoints) {
      mergedMap.set(`${p.lat},${p.lon}`, { lat: p.lat, lon: p.lon, current: p.current });
    }

    const mergedData = Array.from(mergedMap.values());

    const payload = {
      ts: Date.now(),
      data: mergedData
    };

    if (mergedData.length >= 50) {
      // Meaningful data: save to both regular cache and snapshot
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
      localStorage.setItem(WEATHER_SNAPSHOT_KEY, JSON.stringify(payload)); // persistent snapshot, no TTL
    } else {
      // Partial data: save to regular cache only, do NOT overwrite snapshot
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
    }

    console.log(`[Cache] Saved ${mergedData.length} points (${validCount} new, ${existingData?.length ?? 0} existing)`);
  } catch (err) {
    // localStorage might be full — try to clear old entries and retry once
    console.warn("[Cache] Save failed:", err.message);
    try {
      // Try clearing just the main cache and saving fresh
      localStorage.removeItem(WEATHER_CACHE_KEY);
      const freshPayload = {
        ts: Date.now(),
        data: points.filter((p) => p.current).map((p) => ({ lat: p.lat, lon: p.lon, current: p.current }))
      };
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(freshPayload));
    } catch {
      console.error("[Cache] Storage full, cannot save weather cache");
    }
  }
}

export function loadWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.ts || !payload?.data) return null;
    if (Date.now() - payload.ts > WEATHER_CACHE_MAX_AGE_MS) {
      console.log(`[Cache] Cache expired (age: ${Math.round((Date.now() - payload.ts) / 60000)}min)`);
      return null;
    }
    console.log(`[Cache] Loaded ${payload.data.length} points (age: ${Math.round((Date.now() - payload.ts) / 60000)}min)`);
    return payload;
  } catch (err) {
    console.warn("[Cache] Failed to load cache:", err.message);
    return null;
  }
}

export function loadWeatherSnapshot() {
  try {
    const raw = localStorage.getItem(WEATHER_SNAPSHOT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.data) return null;
    console.log(`[Cache] Loaded snapshot: ${payload.data.length} points`);
    return payload;
  } catch (err) {
    console.warn("[Cache] Failed to load snapshot:", err.message);
    return null;
  }
}

/**
 * Apply cached weather data to in-memory points.
 * Merges by lat,lon key — only overwrites if point currently has no data.
 */
export function applyCachedWeather(cache) {
  if (!cache?.data) return;
  const byKey = new Map(cache.data.map((d) => [`${d.lat},${d.lon}`, d.current]));
  let applied = 0;
  weatherState.points.forEach((point) => {
    // Only apply cached data if the point doesn't already have fresher data
    if (point.current) return;
    const cached = byKey.get(`${point.lat},${point.lon}`);
    if (cached) {
      point.current = cached;
      applied++;
    }
  });
  // Store the cache timestamp so updateHud() can format it with the current locale
  if (cache.ts) {
    weatherState.lastUpdatedAt = new Date(cache.ts);
  }
  console.log(`[Cache] Applied ${applied} cached points to ${weatherState.points.length} total points`);
}

export function isCacheFresh() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    const fresh = payload?.ts && (Date.now() - payload.ts < CACHE_FRESHNESS_MS);
    return fresh;
  } catch { return false; }
}

export function loadStoredProviderId() {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}:provider`);
  return stored && PROVIDERS[stored] ? stored : PROVIDERS.openMeteo.id;
}

export function storeProviderId(providerId) {
  localStorage.setItem(`${STORAGE_PREFIX}:provider`, providerId);
}

export function getStoredApiKey(providerId) {
  return localStorage.getItem(`${STORAGE_PREFIX}:api-key:${providerId}`) ?? "";
}

export function storeApiKey(providerId, apiKey) {
  localStorage.setItem(`${STORAGE_PREFIX}:api-key:${providerId}`, apiKey);
}
