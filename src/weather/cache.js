import { STORAGE_PREFIX } from "../constants.js";
import { weatherState, dom } from "../state.js";
import { PROVIDERS } from "../providers.js";

export const WEATHER_CACHE_KEY = `${STORAGE_PREFIX}:weather_v1`;
export const WEATHER_CACHE_MAX_AGE_MS = 25 * 60 * 60 * 1000; // 25h — survives one full cycle
export const WEATHER_SNAPSHOT_KEY = `${STORAGE_PREFIX}:weather_snapshot_v1`;

export function saveWeatherCache(points) {
  try {
    const validPoints = points.filter((p) => p.current !== null && p.current !== undefined);
    const validCount = validPoints.length;

    // If 0 valid points, skip both writes to preserve any existing snapshot
    if (validCount === 0) return;

    const payload = {
      ts: Date.now(),
      data: validPoints.map((p) => ({ lat: p.lat, lon: p.lon, current: p.current }))
    };

    if (validCount >= 50) {
      // Meaningful data: save to both regular cache and snapshot
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
      localStorage.setItem(WEATHER_SNAPSHOT_KEY, JSON.stringify(payload)); // persistent snapshot, no TTL
    } else {
      // Partial data: save to regular cache only, do NOT overwrite snapshot
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

export function loadWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.ts || Date.now() - payload.ts > WEATHER_CACHE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function loadWeatherSnapshot() {
  try {
    const raw = localStorage.getItem(WEATHER_SNAPSHOT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.data ? payload : null;
  } catch {
    return null;
  }
}

export function applyCachedWeather(cache) {
  const byKey = new Map(cache.data.map((d) => [`${d.lat},${d.lon}`, d.current]));
  weatherState.points.forEach((point) => {
    const cached = byKey.get(`${point.lat},${point.lon}`);
    if (cached) {
      point.current = cached;
    }
  });
  const cacheDate = new Date(cache.ts);
  const formatted = cacheDate.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  dom.lastRefresh.textContent = `${formatted} (cache)`;
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
