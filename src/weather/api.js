import {
  OPEN_METEO_FORECAST_ENDPOINT,
  OPEN_METEO_GEOCODING_ENDPOINT,
  REFRESH_INTERVAL_MS,
  REQUEST_BATCH_SIZE,
  BATCH_DELAY_MS,
  MAX_BATCH_RETRIES,
  RETRY_BASE_DELAY_MS
} from "../constants.js";
import { weatherState, dom } from "../state.js";
import { chunk, sleep, formatGeocodingLabel, formatLocationName } from "../utils.js";
import { PROVIDERS, normalizeOpenMeteoEntry } from "../providers.js";
import { t } from "../i18n.js";
import { updateMarkerMeshes, updateHeatmap } from "../globe/markers.js";
import { updateCloudLayer } from "../globe/cloudLayer.js";
import { updatePrecipitationLayer } from "../globe/precipitationLayer.js";
import { applyLightingMode } from "../globe/lighting.js";
import {
  saveWeatherCache,
  loadWeatherCache,
  loadWeatherSnapshot,
  applyCachedWeather,
  isCacheFresh,
  getStoredApiKey,
  storeApiKey,
  storeProviderId,
  loadStoredProviderId
} from "./cache.js";
import { loadWeatherDB } from "./cacheDB.js";
import {
  setStatus,
  showSnackbar,
  updateHud,
  updateSelectionPanel,
  resetSelectionPanel,
  renderForecast,
  renderForecastLoading,
  updateProviderPanel,
  updateToggleButtons
} from "../ui/index.js";

export { loadStoredProviderId, storeProviderId, getStoredApiKey, storeApiKey };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Select `count` evenly-spaced items from an array */
function _evenlySpaced(arr, count) {
  if (count >= arr.length) return arr;
  const result = [];
  const step = arr.length / count;
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

// ── Daily limit cooldown ────────────────────────────────────────────────────
// When Open-Meteo daily limit is hit, remember it and don't retry until next UTC day.
let _dailyLimitHitAt = 0; // timestamp (ms) when daily limit was detected

function _isDailyLimitCooldownActive() {
  if (!_dailyLimitHitAt) return false;
  // Check if we're still on the same UTC day
  const hitDate = new Date(_dailyLimitHitAt).toISOString().slice(0, 10);
  const nowDate = new Date().toISOString().slice(0, 10);
  if (hitDate !== nowDate) {
    // New day — reset cooldown
    _dailyLimitHitAt = 0;
    console.log("[Open-Meteo] New UTC day — daily limit cooldown reset.");
    return false;
  }
  return true;
}

function _setDailyLimitCooldown() {
  _dailyLimitHitAt = Date.now();
  // Persist to localStorage so it survives page reload
  try {
    localStorage.setItem("terracast:dailyLimitHitAt", String(_dailyLimitHitAt));
  } catch { /* ignore */ }
}

// Restore cooldown from localStorage on module load
try {
  const stored = localStorage.getItem("terracast:dailyLimitHitAt");
  if (stored) _dailyLimitHitAt = parseInt(stored, 10) || 0;
} catch { /* ignore */ }

export async function fetchOpenMeteoBatch(points) {
  // Open-Meteo's global NWP grids don't extend to the exact geographic poles.
  // Clamp lat to ±89.9 to ensure valid grid lookups for polar sample points.
  const latitude  = points.map((p) => Math.max(-89.9, Math.min(89.9, p.lat))).join(",");
  const longitude = points.map((p) => p.lon).join(",");
  const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);

  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    [
      "temperature_2m","relative_humidity_2m","pressure_msl","weather_code",
      "wind_speed_10m","wind_direction_10m","is_day","cloud_cover","precipitation",
      "wind_speed_1000hPa","wind_direction_1000hPa",
      "wind_speed_925hPa","wind_direction_925hPa",
      "wind_speed_850hPa","wind_direction_850hPa",
      "wind_speed_700hPa","wind_direction_700hPa",
      "wind_speed_600hPa","wind_direction_600hPa",
      "wind_speed_500hPa","wind_direction_500hPa",
      "wind_speed_400hPa","wind_direction_400hPa",
      "wind_speed_300hPa","wind_direction_300hPa",
      "wind_speed_250hPa","wind_direction_250hPa",
      "wind_speed_200hPa","wind_direction_200hPa",
      "wind_speed_150hPa","wind_direction_150hPa",
      "wind_speed_100hPa","wind_direction_100hPa",
      "wind_speed_70hPa","wind_direction_70hPa",
      "wind_speed_50hPa","wind_direction_50hPa",
      "wind_speed_30hPa","wind_direction_30hPa",
      "wind_speed_20hPa","wind_direction_20hPa",
      "wind_speed_10hPa","wind_direction_10hPa",
      "cape"
    ].join(",")
  );
  url.searchParams.set("timezone", "GMT");

  // NWP model selection for forecast mode (Open-Meteo supports seamless blends)
  const _MODEL_PARAMS = {
    gfs: "gfs_seamless",
    icon: "icon_seamless",
    meteofrance: "meteofrance_seamless",
    gem: "gem_seamless",
  };
  if (weatherState.forecastModel && weatherState.forecastModel !== "auto") {
    const mp = _MODEL_PARAMS[weatherState.forecastModel];
    if (mp) url.searchParams.set("models", mp);
  }

  // Forecast mode: also request hourly data for the forecast offset
  if (weatherState.dataMode === "forecast" && weatherState.forecastHours > 0) {
    url.searchParams.set("hourly", [
      "temperature_2m","relative_humidity_2m","pressure_msl","weather_code",
      "wind_speed_10m","wind_direction_10m","cloud_cover","precipitation",
      "wind_speed_850hPa","wind_direction_850hPa",
      "wind_speed_500hPa","wind_direction_500hPa",
      "wind_speed_300hPa","wind_direction_300hPa",
      "wind_speed_200hPa","wind_direction_200hPa",
      "cape"
    ].join(","));
    url.searchParams.set("forecast_hours", Math.min(weatherState.forecastHours + 1, 168));
  }

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Open-Meteo batch request failed: ${response.status}`);
    error.status = response.status;
    if (response.status === 429) {
      try {
        const body = await response.json();
        error.reason = body?.reason ?? "Rate limit exceeded";
      } catch {
        error.reason = "Rate limit exceeded";
      }
    }
    throw error;
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [payload];
}

/**
 * Detect if a 429 error is a daily limit exhaustion (no point retrying)
 * vs a per-minute rate limit (worth retrying after backoff).
 */
function _isDailyLimitExhausted(error) {
  const reason = (error?.reason ?? "").toLowerCase();
  return reason.includes("daily") || reason.includes("tomorrow") || reason.includes("limit exceeded");
}

export async function fetchOpenMeteoGlobal(points) {
  // Check daily limit cooldown — don't even try if we already hit it today
  if (_isDailyLimitCooldownActive()) {
    const err = new Error("Open-Meteo daily limit still active (cooldown until next UTC day)");
    err.status = 429;
    err.isDailyLimit = true;
    throw err;
  }

  const result = [];
  const batches = chunk(points, REQUEST_BATCH_SIZE);
  let failedBatches = 0;
  let quotaExhausted = false;
  let dailyLimitHit = false;
  let consecutiveQuotaFails = 0;

  // Adaptive delay: starts at BATCH_DELAY_MS, doubles each time a 429 is seen
  let currentDelay = BATCH_DELAY_MS;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    let success = false;
    let saw429 = false;

    for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
      try {
        const batchEntries = await fetchOpenMeteoBatch(batch);
        result.push(batchEntries);
        success = true;
        break;
      } catch (error) {
        const isRateLimited = error.status === 429;
        if (isRateLimited) saw429 = true;

        // If daily limit is exhausted, don't bother retrying — bail immediately
        if (isRateLimited && _isDailyLimitExhausted(error)) {
          dailyLimitHit = true;
          _setDailyLimitCooldown();
          console.warn(
            `[Open-Meteo] Daily API limit exhausted on batch ${batchIndex + 1}/${batches.length}. ` +
            `Skipping all remaining batches.`
          );
          consecutiveQuotaFails = 99; // force bail
          break;
        }

        const hasRetriesLeft = attempt < MAX_BATCH_RETRIES;

        if (hasRetriesLeft) {
          const retryDelay = isRateLimited
            ? RETRY_BASE_DELAY_MS * (attempt + 1)
            : 700;
          const errorDetail = isRateLimited
            ? `429: ${error.reason ?? "rate limited"}`
            : error.message?.slice(0, 40);
          console.warn(
            `[Open-Meteo] batch ${batchIndex + 1}/${batches.length} ` +
            `error (${errorDetail}), ` +
            `retry ${attempt + 1}/${MAX_BATCH_RETRIES} in ${retryDelay}ms`
          );
          await sleep(retryDelay);
        } else {
          if (isRateLimited) consecutiveQuotaFails++;
          else consecutiveQuotaFails = 0;
          console.error(
            `[Open-Meteo] batch ${batchIndex + 1}/${batches.length} failed permanently:`,
            error
          );
          break;
        }
      }
    }

    // Adaptive backoff: if we saw any 429 on this batch (even if retry succeeded),
    // double the inter-batch delay to avoid hitting the rate limit again.
    if (saw429) {
      currentDelay = Math.min(currentDelay * 2, 10000);
    }

    if (!success) {
      failedBatches += 1;
      result.push(batch.map(() => null));
    } else {
      consecutiveQuotaFails = 0;
    }

    // Bail out after 2+ consecutive 429-exhausted batches or daily limit hit
    if (consecutiveQuotaFails >= 2 || dailyLimitHit) {
      quotaExhausted = true;
      const remaining = batches.slice(batchIndex + 1);
      if (remaining.length > 0) {
        console.warn(
          `[Open-Meteo] Quota exhausted. Skipping ${remaining.length} remaining batches.`
        );
        for (const rem of remaining) {
          failedBatches += 1;
          result.push(rem.map(() => null));
        }
      }
      break;
    }

    if (batchIndex < batches.length - 1) {
      await sleep(currentDelay);
    }
  }

  // Only throw if we have ZERO usable data.  When some batches succeeded,
  // return partial results so the caller can display what we have.
  const entries = result.flat();
  const hasAnyData = entries.some(Boolean);

  if (quotaExhausted && !hasAnyData) {
    const quotaError = new Error(
      dailyLimitHit
        ? "Open-Meteo daily API limit exceeded"
        : "Open-Meteo quota exhausted (consecutive 429s)"
    );
    quotaError.status = 429;
    quotaError.isDailyLimit = dailyLimitHit;
    throw quotaError;
  }

  if (quotaExhausted) {
    console.warn(
      `[Open-Meteo] Quota reached but ${entries.filter(Boolean).length}/${entries.length} points retrieved. Returning partial data.`
    );
  }

  return { entries, failedBatches };
}

export async function fetchGlobalSummary(summaryPoints) {
  const { entries } = await fetchOpenMeteoGlobal(summaryPoints);
  const validEntries = entries.filter(Boolean).map((entry) => normalizeOpenMeteoEntry(entry));
  const temperatures = validEntries.map((entry) => entry.temperature);
  const averageTemperature =
    temperatures.reduce((sum, value) => sum + value, 0) /
    Math.max(temperatures.length, 1);

  return {
    stationCount: validEntries.length,
    averageTemperature: Number.isFinite(averageTemperature) ? averageTemperature : null
  };
}

let _globalRefreshInFlight = false;

export async function refreshGlobalWeather(forceStatus, samplePoints, summaryPoints) {
  // Prevent concurrent refreshes — HMR reloads can trigger duplicates
  if (_globalRefreshInFlight) {
    console.warn("refreshGlobalWeather: already in flight, skipping.");
    return;
  }
  _globalRefreshInFlight = true;

  try {
    await _doRefreshGlobalWeather(forceStatus, samplePoints, summaryPoints);
  } finally {
    _globalRefreshInFlight = false;
  }
}

async function _doRefreshGlobalWeather(forceStatus, samplePoints, summaryPoints) {
  // ── Phase 1: Stale-while-revalidate ─────────────────────────────────
  // Show cached/local data immediately so the UI is never empty while
  // the live fetch runs.  Only overwrite if the live fetch succeeds.
  const hasDataInMemory = weatherState.points.some((p) => p.current !== null);

  if (!hasDataInMemory) {
    const cache = loadWeatherCache();
    const snapshot = !cache ? loadWeatherSnapshot() : null;
    const cachedPayload = cache ?? snapshot;

    if (cachedPayload) {
      applyCachedWeather(cachedPayload);
      updateMarkerMeshes();
      updateHeatmap();
      updateCloudLayer();
      updatePrecipitationLayer();
      updateHud();
      const source = cache ? "cache" : "snapshot";
      setStatus(t("status.cacheLoaded", { source }));
    } else {
      setStatus(
        weatherState.showMarkers
          ? t("status.firstLoad")
          : t("status.firstLoadSummary")
      );
    }
  } else {
    setStatus(t("status.updating"));
  }

  // ── Freshness gate ──────────────────────────────────────────────────
  // Skip only if cache is fresh AND data is substantially complete (≥95%).
  // If a previous load was rate-limited and left gaps, fill them even when fresh.
  const pointsWithData = weatherState.points.filter(p => p.current !== null).length;
  const isDataComplete = pointsWithData >= weatherState.points.length * 0.95;

  if (!forceStatus && hasDataInMemory && isCacheFresh() && isDataComplete) {
    weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
    setStatus(t("status.fresh"));
    return;
  }

  // Partial-refresh mode: cache timestamp is still valid but some points are missing.
  // Only fetch the missing coordinates to avoid re-downloading everything.
  const missingIndices = (!forceStatus && hasDataInMemory && isCacheFresh() && !isDataComplete)
    ? weatherState.points.map((p, i) => (p.current ? null : i)).filter(i => i !== null)
    : null;

  const pointsToFetch = missingIndices
    ? missingIndices.map(i => samplePoints[i])
    : samplePoints;

  if (missingIndices) {
    setStatus(t("status.fetchingMissing", { count: missingIndices.length }));
  }

  // ── Phase 2: Fetch live data ────────────────────────────────────────
  // If Open-Meteo daily limit is active, try Yr.no as fallback provider
  if (_isDailyLimitCooldownActive()) {
    const yrProvider = PROVIDERS.yr;
    if (yrProvider?.supportsGlobal) {
      // Find indices of points that don't have data yet
      const missingIndices = [];
      for (let i = 0; i < weatherState.points.length; i++) {
        if (!weatherState.points[i].current) missingIndices.push(i);
      }
      // Cap at 300 points to avoid overwhelming Yr.no (single-point API)
      const YR_FALLBACK_LIMIT = 300;
      const indicesToFetch = missingIndices.length > YR_FALLBACK_LIMIT
        ? _evenlySpaced(missingIndices, YR_FALLBACK_LIMIT)
        : missingIndices;

      if (indicesToFetch.length > 0) {
        console.log(`[Fallback] Open-Meteo daily limit active. Trying Yr.no for ${indicesToFetch.length}/${missingIndices.length} missing points...`);
        setStatus(`Open-Meteo esaurito. Recupero ${indicesToFetch.length} punti da Yr.no...`);
        try {
          const pointsToFetchYr = indicesToFetch.map(i => samplePoints[i]);
          const { entries } = await yrProvider.fetchGlobal(pointsToFetchYr);
          let updatedCount = 0;
          entries.forEach((entry, fetchIdx) => {
            if (!entry) return;
            const globalIdx = indicesToFetch[fetchIdx];
            weatherState.points[globalIdx].current = entry;
            updatedCount++;
          });
          if (updatedCount > 0) {
            saveWeatherCache(weatherState.points);
            weatherState.lastUpdatedAt = new Date();
            weatherState.globalDataProvider = yrProvider.name;
            updateMarkerMeshes();
            updateHeatmap();
            updateCloudLayer();
            updatePrecipitationLayer();
            updateHud();
            _onWeatherRefreshed?.();
            const totalWithData = weatherState.points.filter(p => p.current).length;
            setStatus(`Yr.no fallback: ${updatedCount} punti aggiornati (${totalWithData}/${weatherState.points.length} totali)`);
          } else {
            setStatus("Yr.no fallback: nessun nuovo dato. Dati precedenti mantenuti.");
          }
          weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
          return;
        } catch (yrErr) {
          console.warn("[Yr.no fallback] Failed:", yrErr.message);
          // Fall through to show cached data status
        }
      }
    }
    // No fallback possible — show cached data status
    const stillHasData = weatherState.points.some((p) => p.current !== null);
    if (stillHasData) {
      weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
      setStatus("Limite Open-Meteo: quota esaurita. Dati precedenti mantenuti.");
    } else {
      setStatus("Limite Open-Meteo: quota esaurita. Nessun dato disponibile.");
    }
    return;
  }

  try {
    if (!weatherState.showMarkers) {
      const summary = await fetchGlobalSummary(summaryPoints);
      weatherState.summaryStats = summary;
      weatherState.lastUpdatedAt = new Date();
      weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
      updateHud();
      setStatus(t("status.summaryUpdated"));
      return;
    }

    const activeProvider = getActiveProvider();
    const globalProvider = activeProvider.supportsGlobal
      ? activeProvider
      : PROVIDERS.openMeteo;
    const apiKey = getStoredApiKey(activeProvider.id);

    if (!activeProvider.supportsGlobal && activeProvider.id !== PROVIDERS.openMeteo.id) {
      setStatus(t("status.globalNotSupported", { provider: activeProvider.name }));
    }

    const { entries, quota, failedBatches = 0 } = await globalProvider.fetchGlobal(pointsToFetch, apiKey);

    let updatedCount = 0;
    entries.forEach((entry, fetchIndex) => {
      if (!entry) return;
      // Map back: if partial refresh, fetchIndex → missingIndices[fetchIndex]; else 1:1
      const globalIndex = missingIndices ? missingIndices[fetchIndex] : fetchIndex;
      weatherState.points[globalIndex].current = entry;
      updatedCount += 1;
    });
    weatherState.summaryStats = null;

    weatherState.lastUpdatedAt = new Date();
    weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
    weatherState.globalDataProvider = globalProvider.name;

    if (quota && globalProvider.id === activeProvider.id) {
      setProviderQuota(activeProvider.id, quota);
    }

    if (updatedCount === 0 && failedBatches > 0) {
      throw new Error(t("status.allBatchesFailed", { count: failedBatches }));
    }

    // ── Phase 3: Live data succeeded — save + update visualizations ───
    if (updatedCount > 0) {
      saveWeatherCache(weatherState.points);
    }
    updateMarkerMeshes();
    updateHeatmap();
    updateCloudLayer();
    updatePrecipitationLayer();
    updateHud();
    _onWeatherRefreshed?.();

    if (forceStatus) {
      setStatus(t("status.feedUpdated", { count: updatedCount, provider: globalProvider.name }));
    } else if (failedBatches > 0) {
      setStatus(t("status.partialUpdate", { count: updatedCount, total: pointsToFetch.length, provider: globalProvider.name }));
    } else if (globalProvider.id !== activeProvider.id) {
      setStatus(t("status.dualProvider", { globalProvider: globalProvider.name, localProvider: activeProvider.name }));
    } else {
      setStatus(t("status.feedSynced", { count: updatedCount, provider: globalProvider.name }));
    }
  } catch (error) {
    const isQuota = error?.status === 429 || String(error?.message).includes("429");
    if (isQuota) {
      console.warn("[Open-Meteo] Quota/rate limit during refresh:", error.message);
    } else {
      console.error("refreshGlobalWeather live fetch failed:", error);
    }

    // ── Yr.no fallback on quota errors ────────────────────────────────
    if (isQuota && PROVIDERS.yr?.supportsGlobal) {
      try {
        console.log("[Fallback] Attempting Yr.no fallback after Open-Meteo 429...");
        setStatus("Open-Meteo esaurito. Recupero dati da Yr.no...");
        const missingPoints = samplePoints.filter((_, i) => !weatherState.points[i]?.current);
        if (missingPoints.length > 0) {
          const { entries } = await PROVIDERS.yr.fetchGlobal(missingPoints);
          let yrUpdated = 0;
          let missingIdx = 0;
          for (let i = 0; i < samplePoints.length; i++) {
            if (weatherState.points[i]?.current) continue;
            const entry = entries[missingIdx++];
            if (entry) {
              weatherState.points[i].current = entry;
              yrUpdated++;
            }
          }
          if (yrUpdated > 0) {
            saveWeatherCache(weatherState.points);
            weatherState.lastUpdatedAt = new Date();
            weatherState.globalDataProvider = "Yr.no (fallback)";
            updateMarkerMeshes();
            updateHeatmap();
            updateCloudLayer();
            updatePrecipitationLayer();
            updateHud();
            _onWeatherRefreshed?.();
            setStatus(`Yr.no fallback: ${yrUpdated} punti aggiornati`);
            weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
            return;
          }
        }
      } catch (yrErr) {
        console.warn("[Yr.no fallback] Failed:", yrErr.message);
      }
    }

    // If we already have data in memory (from Phase 1 or a previous fetch),
    // keep it and just warn — no need to reload from cache.
    const stillHasData = weatherState.points.some((p) => p.current !== null);

    if (stillHasData) {
      const quotaReason = error?.reason ?? "quota exhausted";
      const reason = isQuota
        ? t("status.quotaExhausted", { reason: quotaReason })
        : t("status.networkError");
      setStatus(reason);
      if (forceStatus) showSnackbar(reason, "warn");
    } else {
      // Nothing in memory — last-resort cache/snapshot/IndexedDB attempt
      const cache = loadWeatherCache();
      const snapshot = !cache ? loadWeatherSnapshot() : null;
      let fallbackPayload = cache ?? snapshot;
      // Try IndexedDB if localStorage caches are empty
      if (!fallbackPayload) {
        try { fallbackPayload = await loadWeatherDB(); } catch { /* ignore */ }
      }

      if (fallbackPayload) {
        applyCachedWeather(fallbackPayload);
        updateMarkerMeshes();
        updateHeatmap();
        updateCloudLayer();
        updatePrecipitationLayer();
        updateHud();
        const quotaReason = error?.reason ?? "quota exhausted";
        const reason = isQuota
          ? t("status.quotaCache", { reason: quotaReason })
          : t("status.networkCache");
        setStatus(reason);
        if (forceStatus) showSnackbar(reason, "warn");
      } else {
        const quotaReason = error?.reason ?? "quota exhausted";
        const reason = isQuota
          ? t("status.quotaNoData", { reason: quotaReason })
          : t("status.networkNoData");
        setStatus(reason);
        if (forceStatus) showSnackbar(reason, "error");
      }
    }
  }
}

export async function refreshSelectedPointWeather(forceStatus = false) {
  if (!weatherState.selectedPoint) {
    return;
  }

  const requestedProvider = getActiveProvider();
  let activeProvider = requestedProvider;
  let apiKey = getStoredApiKey(activeProvider.id);

  if (activeProvider.requiresKey && !apiKey) {
    activeProvider = PROVIDERS.openMeteo;
    apiKey = "";
    setProviderQuota(requestedProvider.id, {
      note: t("status.keyMissingNote", { provider: requestedProvider.name })
    });
    setStatus(t("status.keyMissing", { provider: requestedProvider.name }));
  }

  const requestToken = ++weatherState.selectionRequestToken;
  weatherState.selectedPoint.current = null;
  weatherState.selectedPoint.forecast = null;
  weatherState.selectedPoint.providerName = activeProvider.name;
  updateSelectionPanel();
  renderForecastLoading();
  setStatus(t("status.loadingPoint", { provider: activeProvider.name }));

  try {
    const [currentResult, forecastResult] = await Promise.allSettled([
      activeProvider.fetchCurrent({
        lat: weatherState.selectedPoint.lat,
        lon: weatherState.selectedPoint.lon,
        apiKey
      }),
      activeProvider.fetchForecast({
        lat: weatherState.selectedPoint.lat,
        lon: weatherState.selectedPoint.lon,
        apiKey
      })
    ]);

    if (requestToken !== weatherState.selectionRequestToken) {
      return;
    }

    if (currentResult.status === "fulfilled") {
      weatherState.selectedPoint.current = currentResult.value.current;
      setProviderQuota(
        activeProvider.id,
        currentResult.value.quota ?? { note: activeProvider.quotaNote }
      );
    }

    if (forecastResult.status === "fulfilled") {
      weatherState.selectedPoint.forecast = forecastResult.value.forecast;
      renderForecast(forecastResult.value.forecast);
    } else {
      renderForecast([]);
    }

    weatherState.selectedPoint.providerName = activeProvider.name;
    updateSelectionPanel();

    if (
      currentResult.status === "rejected" &&
      forecastResult.status === "rejected"
    ) {
      throw currentResult.reason;
    }

    setStatus(
      forceStatus
        ? t("status.pointUpdated", { provider: activeProvider.name })
        : t("status.pointSelected", { provider: activeProvider.name })
    );
  } catch (error) {
    if (error?.status === 429) {
      console.warn(`[${activeProvider.name}] fetchCurrent/fetchForecast 429 — trying fallback`);
    } else {
      console.error(`[${activeProvider.name}] fetchCurrent/fetchForecast failed:`, error);
    }

    if (activeProvider.id !== PROVIDERS.openMeteo.id) {
      const primaryErrorStatus = error?.status ?? 0;
      let primaryErrorNote;
      if (primaryErrorStatus === 401 || primaryErrorStatus === 403) {
        primaryErrorNote = t("status.keyInvalid", { provider: activeProvider.name });
      } else if (primaryErrorStatus === 429) {
        primaryErrorNote = t("status.providerQuotaExhausted", { provider: activeProvider.name });
      } else if (primaryErrorStatus >= 500) {
        primaryErrorNote = t("status.providerUnavailable", { provider: activeProvider.name, status: primaryErrorStatus });
      } else if (primaryErrorStatus === 404) {
        primaryErrorNote = t("status.providerNoData", { provider: activeProvider.name });
      } else {
        primaryErrorNote = t("status.providerError", { provider: activeProvider.name });
      }
      try {
        const fallback = PROVIDERS.openMeteo;
        const [{ current, quota }, { forecast }] = await Promise.all([
          fallback.fetchCurrent({
            lat: weatherState.selectedPoint.lat,
            lon: weatherState.selectedPoint.lon,
            apiKey: ""
          }),
          fallback.fetchForecast({
            lat: weatherState.selectedPoint.lat,
            lon: weatherState.selectedPoint.lon,
            apiKey: ""
          })
        ]);

        if (requestToken !== weatherState.selectionRequestToken) {
          return;
        }

        weatherState.selectedPoint.current = current;
        weatherState.selectedPoint.forecast = forecast;
        weatherState.selectedPoint.providerName = `${fallback.name} (fallback)`;
        setProviderQuota(activeProvider.id, {
          note: `${primaryErrorNote} Dati via Open-Meteo.`
        });
        setProviderQuota(fallback.id, quota ?? { note: fallback.quotaNote });
        updateSelectionPanel();
        renderForecast(forecast);
        setStatus(t("status.fallback", { provider: activeProvider.name, fallback: fallback.name }));
        return;
      } catch (fallbackError) {
        console.error("[Open-Meteo fallback] failed:", fallbackError);
        const fallbackErrorStatus = fallbackError?.status ?? 0;
        weatherState.selectedPoint.current = null;
        weatherState.selectedPoint.forecast = null;
        weatherState.selectedPoint.providerName = activeProvider.name;
        updateSelectionPanel();
        renderForecast([]);
        let fallbackMsg;
        if (fallbackErrorStatus === 429) {
          fallbackMsg = t("status.fallbackQuotaExhausted", { provider: PROVIDERS.openMeteo.name });
        } else if (fallbackErrorStatus >= 500) {
          fallbackMsg = t("status.fallbackUnavailable", { provider: PROVIDERS.openMeteo.name, status: fallbackErrorStatus });
        } else {
          fallbackMsg = t("status.fallbackError", { provider: PROVIDERS.openMeteo.name });
        }
        setStatus(`${primaryErrorNote} Fallback: ${fallbackMsg}`);
        return;
      }
    }

    // Active provider IS Open-Meteo — try Yr.no fallback on 429
    const errorStatus = error?.status ?? 0;
    if (errorStatus === 429 && PROVIDERS.yr) {
      try {
        console.log("[Fallback] Open-Meteo 429 on point query, trying Yr.no...");
        const yrFallback = PROVIDERS.yr;
        const [yrCurrentResult, yrForecastResult] = await Promise.allSettled([
          yrFallback.fetchCurrent({
            lat: weatherState.selectedPoint.lat,
            lon: weatherState.selectedPoint.lon
          }),
          yrFallback.fetchForecast({
            lat: weatherState.selectedPoint.lat,
            lon: weatherState.selectedPoint.lon
          })
        ]);

        if (requestToken !== weatherState.selectionRequestToken) return;

        if (yrCurrentResult.status === "fulfilled") {
          weatherState.selectedPoint.current = yrCurrentResult.value.current;
        }
        if (yrForecastResult.status === "fulfilled") {
          weatherState.selectedPoint.forecast = yrForecastResult.value.forecast;
          renderForecast(yrForecastResult.value.forecast);
        } else {
          renderForecast([]);
        }

        if (yrCurrentResult.status === "fulfilled") {
          weatherState.selectedPoint.providerName = `${yrFallback.name} (fallback)`;
          updateSelectionPanel();
          setStatus(`Dati da Yr.no (Open-Meteo quota esaurita)`);
          return;
        }
      } catch (yrErr) {
        console.warn("[Yr.no point fallback] Failed:", yrErr.message);
      }
    }

    // No fallback worked — show error
    weatherState.selectedPoint.current = null;
    weatherState.selectedPoint.forecast = null;
    weatherState.selectedPoint.providerName = activeProvider.name;
    updateSelectionPanel();
    renderForecast([]);
    let errorMsg;
    if (errorStatus === 401 || errorStatus === 403) {
      errorMsg = t("status.keyInvalid", { provider: activeProvider.name });
    } else if (errorStatus === 429) {
      errorMsg = t("status.providerQuotaExhausted", { provider: activeProvider.name });
    } else if (errorStatus >= 500) {
      errorMsg = t("status.providerUnavailable", { provider: activeProvider.name, status: errorStatus });
    } else if (errorStatus === 404) {
      errorMsg = t("status.providerNoData", { provider: activeProvider.name });
    } else {
      errorMsg = t("status.providerError", { provider: activeProvider.name });
    }
    setStatus(errorMsg);
  }
}

export function selectLocation({ lat, lon, label }) {
  weatherState.selectedPoint = {
    lat,
    lon,
    label,
    current: null,
    forecast: null,
    providerName: getActiveProvider().name
  };
  updateSelectedMarkerFromSelection();
  updateSelectionPanel();
  renderForecast([]);
  refreshSelectedPointWeather(false);
}

export function clearSelection() {
  weatherState.selectionRequestToken += 1;
  weatherState.selectedPoint = null;
  updateSelectedMarkerFromSelection();
  resetSelectionPanel();
  renderForecast([]);
  setStatus(t("status.selectionRemoved"));
}

// updateSelectedMarker is called via import in main.js to avoid circular deps
// We use a callback pattern
let _updateSelectedMarker = null;
export function setUpdateSelectedMarkerCallback(fn) {
  _updateSelectedMarker = fn;
}
function updateSelectedMarkerFromSelection() {
  if (_updateSelectedMarker) _updateSelectedMarker();
}

export async function geocodeLocation(query) {
  const url = new URL(OPEN_METEO_GEOCODING_ENDPOINT);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", weatherState.language ?? "it");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.results?.[0] ?? null;
}

export async function handleSearchSubmit(event) {
  event.preventDefault();
  const query = dom.searchInput.value.trim();

  if (!query) {
    return;
  }

  dom.searchInput.disabled = true;
  setStatus(t("status.searchingLocation", { query }));

  try {
    const result = await geocodeLocation(query);
    if (!result) {
      setStatus(t("status.locationNotFound"));
      return;
    }

    selectLocation({
      lat: result.latitude,
      lon: result.longitude,
      label: formatGeocodingLabel(result)
    });
  } catch (error) {
    console.error(error);
    setStatus(t("status.searchError"));
  } finally {
    dom.searchInput.disabled = false;
  }
}

export async function requestCurrentLocationSelection(forceStatus) {
  if (!("geolocation" in navigator)) {
    if (forceStatus) {
      setStatus(t("status.geoNotSupported"));
    }
    return;
  }

  dom.locateMeButton.disabled = true;
  if (forceStatus) {
    setStatus(t("status.geoRequesting"));
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      dom.locateMeButton.disabled = false;
      selectLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: t("status.currentPosition")
      });
    },
    (error) => {
      dom.locateMeButton.disabled = false;
      if (forceStatus) {
        setStatus(t("status.geoError", { message: error.message }));
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 900000,
      timeout: 10000
    }
  );
}

export function handleProviderChange() {
  weatherState.providerId = dom.providerSelect.value;
  storeProviderId(weatherState.providerId);
  updateProviderPanel();
  // refreshGlobalWeather needs samplePoints — called from main.js via callback
  _onProviderChange && _onProviderChange();
}

let _onProviderChange = null;
export function setOnProviderChange(fn) {
  _onProviderChange = fn;
}

export function getActiveProvider() {
  return PROVIDERS[weatherState.providerId] ?? PROVIDERS.openMeteo;
}

export function setProviderQuota(providerId, quota) {
  weatherState.providerQuotas[providerId] = quota;
  if (providerId === weatherState.providerId) {
    updateProviderPanel();
  }
}

// Callback fired after each successful global weather refresh.
// Used by main.js to rebuild wind field, update RainViewer, etc.
let _onWeatherRefreshed = null;
export function setOnWeatherRefreshed(fn) {
  _onWeatherRefreshed = fn;
}
