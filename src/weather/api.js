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
import { updateMarkerMeshes, updateHeatmap } from "../globe/markers.js";
import { updateCloudLayer } from "../globe/cloudLayer.js";
import { applyLightingMode } from "../globe/lighting.js";
import {
  saveWeatherCache,
  loadWeatherCache,
  loadWeatherSnapshot,
  applyCachedWeather,
  getStoredApiKey,
  storeApiKey,
  storeProviderId,
  loadStoredProviderId
} from "./cache.js";
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

export async function fetchOpenMeteoBatch(points) {
  const latitude = points.map((point) => point.lat).join(",");
  const longitude = points.map((point) => point.lon).join(",");
  const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);

  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,pressure_msl,weather_code,wind_speed_10m,is_day,cloud_cover"
  );
  url.searchParams.set("timezone", "GMT");

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Open-Meteo batch request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [payload];
}

export async function fetchOpenMeteoGlobal(points) {
  const result = [];
  const batches = chunk(points, REQUEST_BATCH_SIZE);
  let failedBatches = 0;
  let quotaExhausted = false;
  let consecutiveQuotaFails = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    let success = false;

    for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
      try {
        const batchEntries = await fetchOpenMeteoBatch(batch);
        result.push(batchEntries);
        success = true;
        break;
      } catch (error) {
        const isRateLimited = error.status === 429;
        const hasRetriesLeft = attempt < MAX_BATCH_RETRIES;

        if (hasRetriesLeft) {
          // Retry ALL errors: 429 with backoff, network errors with short delay
          const retryDelay = isRateLimited
            ? RETRY_BASE_DELAY_MS * (attempt + 1)
            : 700;
          console.warn(
            `Open-Meteo batch ${batchIndex + 1}/${batches.length} ` +
            `error (${isRateLimited ? "429" : error.message?.slice(0, 40)}), ` +
            `retry ${attempt + 1}/${MAX_BATCH_RETRIES} in ${retryDelay}ms`
          );
          await sleep(retryDelay);
        } else {
          if (isRateLimited) consecutiveQuotaFails++;
          else consecutiveQuotaFails = 0; // reset on non-429 failure
          console.error(
            `Open-Meteo batch ${batchIndex + 1}/${batches.length} failed permanently:`,
            error
          );
          break;
        }
      }
    }

    if (!success) {
      failedBatches += 1;
      result.push(batch.map(() => null));
    } else {
      consecutiveQuotaFails = 0;
    }

    // Only bail out after 2+ consecutive 429-exhausted batches
    // (single 429 may be transient rate limiting, not quota exhaustion)
    if (consecutiveQuotaFails >= 2) {
      quotaExhausted = true;
      const remaining = batches.slice(batchIndex + 1);
      if (remaining.length > 0) {
        console.warn(
          `Open-Meteo quota esaurita (${consecutiveQuotaFails} fallimenti consecutivi). ` +
          `Salto i ${remaining.length} batch rimanenti.`
        );
        for (const rem of remaining) {
          failedBatches += 1;
          result.push(rem.map(() => null));
        }
      }
      break;
    }

    if (batchIndex < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  if (quotaExhausted) {
    const quotaError = new Error("Open-Meteo quota esaurita (429 consecutivi su più batch)");
    quotaError.status = 429;
    throw quotaError;
  }

  return {
    entries: result.flat(),
    failedBatches
  };
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

export async function refreshGlobalWeather(forceStatus, samplePoints, summaryPoints) {
  setStatus(weatherState.showMarkers ? "Aggiornamento dati globali..." : "Aggiornamento riepilogo globale...");

  try {
    if (!weatherState.showMarkers) {
      const summary = await fetchGlobalSummary(summaryPoints);
      weatherState.summaryStats = summary;
      weatherState.lastUpdatedAt = new Date();
      weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);
      updateHud();
      setStatus("Riepilogo globale aggiornato senza ricaricare i punti meteo.");
      return;
    }

    const activeProvider = getActiveProvider();
    const globalProvider = activeProvider.supportsGlobal
      ? activeProvider
      : PROVIDERS.openMeteo;
    const apiKey = getStoredApiKey(activeProvider.id);

    if (!activeProvider.supportsGlobal && activeProvider.id !== PROVIDERS.openMeteo.id) {
      setStatus(`Layer globale: Open-Meteo (${activeProvider.name} non supporta i dati globali). Caricamento...`);
    }

    const { entries, quota, failedBatches = 0 } = await globalProvider.fetchGlobal(samplePoints, apiKey);

    let updatedCount = 0;
    entries.forEach((entry, index) => {
      if (!entry) {
        return;
      }
      weatherState.points[index].current = entry;
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
      // All batches failed but no quota error was thrown — treat as network failure
      throw new Error(`Tutti i ${failedBatches} batch Open-Meteo falliti (errori di rete)`);
    }

    if (updatedCount > 0) {
      saveWeatherCache(weatherState.points);
    }
    updateMarkerMeshes();
    updateHeatmap();
    updateCloudLayer();
    updateHud();

    if (forceStatus) {
      setStatus(`Feed globale aggiornato. Layer: ${globalProvider.name}.`);
    } else if (failedBatches > 0) {
      setStatus(
        `Aggiornamento globale parziale: ${updatedCount}/${samplePoints.length} punti caricati con ${globalProvider.name}.`
      );
    } else if (globalProvider.id !== activeProvider.id) {
      setStatus(
        `Layer globale via ${globalProvider.name}. Dettaglio locale via ${activeProvider.name}.`
      );
    } else {
      setStatus(`Feed globale sincronizzato tramite ${globalProvider.name}.`);
    }
  } catch (error) {
    console.error(error);
    const isQuota = error?.status === 429 || String(error?.message).includes("429");
    const cache = loadWeatherCache();
    if (cache) {
      applyCachedWeather(cache);
      updateMarkerMeshes();
      updateHud();
      const reason = isQuota
        ? "Quota Open-Meteo esaurita. Visualizzo gli ultimi dati dalla cache."
        : "Errore di rete. Visualizzo gli ultimi dati dalla cache.";
      setStatus(reason);
      if (forceStatus) showSnackbar(reason, "warn");
    } else {
      const snapshot = loadWeatherSnapshot();
      if (snapshot) {
        applyCachedWeather(snapshot);
        updateMarkerMeshes();
        updateHud();
        const snapshotDate = new Date(snapshot.ts).toLocaleString("it-IT", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        const reason = isQuota
          ? `Quota esaurita. Dati dal ${snapshotDate} (snapshot).`
          : `Errore di rete. Dati dal ${snapshotDate} (snapshot).`;
        setStatus(reason);
        if (forceStatus) showSnackbar(reason, "warn");
      } else {
        const reason = isQuota
          ? "Quota Open-Meteo esaurita. Riprova domani o dopo mezzanotte UTC."
          : "Errore di rete nel refresh globale. Nessun dato disponibile.";
        setStatus(reason);
        if (forceStatus) showSnackbar(reason, "error");
      }
    }
  } finally {
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
      note: `Chiave API non configurata per ${requestedProvider.name}. Dettaglio locale via Open-Meteo. Inserisci la chiave nel pannello Provider.`
    });
    setStatus(`Chiave API assente per ${requestedProvider.name} — uso Open-Meteo come fallback.`);
  }

  const requestToken = ++weatherState.selectionRequestToken;
  weatherState.selectedPoint.current = null;
  weatherState.selectedPoint.forecast = null;
  weatherState.selectedPoint.providerName = activeProvider.name;
  updateSelectionPanel();
  renderForecastLoading();
  setStatus(`Caricamento meteo puntuale tramite ${activeProvider.name}...`);

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
        ? `Dettaglio locale aggiornato tramite ${activeProvider.name}.`
        : `Punto selezionato aggiornato tramite ${activeProvider.name}.`
    );
  } catch (error) {
    console.error(`[${activeProvider.name}] fetchCurrent/fetchForecast failed:`, error);

    if (activeProvider.id !== PROVIDERS.openMeteo.id) {
      const primaryErrorStatus = error?.status ?? 0;
      let primaryErrorNote;
      if (primaryErrorStatus === 401 || primaryErrorStatus === 403) {
        primaryErrorNote = `Chiave API non valida o non autorizzata per ${activeProvider.name}. Verifica la chiave nel pannello Provider.`;
      } else if (primaryErrorStatus === 429) {
        primaryErrorNote = `Quota ${activeProvider.name} esaurita. Riprova più tardi.`;
      } else if (primaryErrorStatus >= 500) {
        primaryErrorNote = `Servizio ${activeProvider.name} temporaneamente non disponibile (errore ${primaryErrorStatus}).`;
      } else if (primaryErrorStatus === 404) {
        primaryErrorNote = `Dati non disponibili per questa località tramite ${activeProvider.name}.`;
      } else {
        primaryErrorNote = `Errore nel caricamento meteo locale tramite ${activeProvider.name}.`;
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
        setStatus(`${activeProvider.name} non disponibile — dati locali via ${fallback.name}.`);
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
          fallbackMsg = `Quota ${PROVIDERS.openMeteo.name} esaurita. Riprova più tardi.`;
        } else if (fallbackErrorStatus >= 500) {
          fallbackMsg = `Servizio ${PROVIDERS.openMeteo.name} temporaneamente non disponibile (errore ${fallbackErrorStatus}).`;
        } else {
          fallbackMsg = `Errore nel caricamento meteo locale tramite ${PROVIDERS.openMeteo.name}.`;
        }
        setStatus(`${primaryErrorNote} Fallback: ${fallbackMsg}`);
        return;
      }
    }

    // Active provider IS Open-Meteo — show specific error
    weatherState.selectedPoint.current = null;
    weatherState.selectedPoint.forecast = null;
    weatherState.selectedPoint.providerName = activeProvider.name;
    updateSelectionPanel();
    renderForecast([]);
    const errorStatus = error?.status ?? 0;
    let errorMsg;
    if (errorStatus === 401 || errorStatus === 403) {
      errorMsg = `Chiave API non valida o non autorizzata per ${activeProvider.name}. Verifica la chiave nel pannello Provider.`;
    } else if (errorStatus === 429) {
      errorMsg = `Quota ${activeProvider.name} esaurita. Riprova più tardi.`;
    } else if (errorStatus >= 500) {
      errorMsg = `Servizio ${activeProvider.name} temporaneamente non disponibile (errore ${errorStatus}).`;
    } else if (errorStatus === 404) {
      errorMsg = `Dati non disponibili per questa località tramite ${activeProvider.name}.`;
    } else {
      errorMsg = `Errore nel caricamento meteo locale tramite ${activeProvider.name}.`;
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
  setStatus("Selezione rimossa.");
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
  url.searchParams.set("language", "it");
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
  setStatus(`Ricerca località: ${query}...`);

  try {
    const result = await geocodeLocation(query);
    if (!result) {
      setStatus("Località non trovata.");
      return;
    }

    selectLocation({
      lat: result.latitude,
      lon: result.longitude,
      label: formatGeocodingLabel(result)
    });
  } catch (error) {
    console.error(error);
    setStatus("Errore durante la ricerca della località.");
  } finally {
    dom.searchInput.disabled = false;
  }
}

export async function requestCurrentLocationSelection(forceStatus) {
  if (!("geolocation" in navigator)) {
    if (forceStatus) {
      setStatus("Geolocalizzazione non supportata dal browser.");
    }
    return;
  }

  dom.locateMeButton.disabled = true;
  if (forceStatus) {
    setStatus("Richiesta posizione attuale al browser...");
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      dom.locateMeButton.disabled = false;
      selectLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: "Posizione attuale"
      });
    },
    (error) => {
      dom.locateMeButton.disabled = false;
      if (forceStatus) {
        setStatus(`Geolocalizzazione non disponibile: ${error.message}`);
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
