import { weatherState, dom } from "../state.js";
import { WEATHER_CODE_LABELS } from "../constants.js";
import { formatCoordinates, formatDateTime, conditionIconMarkup, markerIcon, terminatorIcon, cloudIcon, buttonMarkup } from "../utils.js";
import { PROVIDERS } from "../providers.js";

let snackbarTimer = null;

export function showSnackbar(message, type = "info", duration = 4500) {
  const el = dom.snackbar;
  el.textContent = message;
  el.className = `snackbar${type !== "info" ? ` snackbar-${type}` : ""}`;
  // Force reflow so the transition fires even when re-showing
  void el.offsetWidth;
  el.classList.add("snackbar-visible");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => {
    el.classList.remove("snackbar-visible");
  }, duration);
}

export function setStatus(message) {
  dom.statusLine.textContent = message;
}

export function updateHud() {
  let stationCount;
  let averageTemperature;

  if (!weatherState.showMarkers && weatherState.summaryStats) {
    stationCount = weatherState.summaryStats.stationCount;
    averageTemperature = weatherState.summaryStats.averageTemperature;
  } else {
    const availablePoints = weatherState.points.filter((point) => point.current);
    const temperatureValues = availablePoints.map((point) => point.current.temperature);
    averageTemperature =
      temperatureValues.reduce((sum, value) => sum + value, 0) /
      Math.max(temperatureValues.length, 1);
    stationCount = availablePoints.length;
  }

  dom.stationCount.textContent = `${stationCount}`;
  dom.avgTemp.textContent = Number.isFinite(averageTemperature)
    ? `${averageTemperature.toFixed(1)} °C`
    : "-";
  dom.lastRefresh.textContent = weatherState.lastUpdatedAt
    ? formatDateTime(weatherState.lastUpdatedAt)
    : "In attesa...";
  updateRefreshCountdown();
}

export function updateRefreshCountdown() {
  if (!weatherState.nextRefreshAt) {
    dom.nextRefresh.textContent = "-";
    return;
  }

  const remainingMs = Math.max(weatherState.nextRefreshAt.getTime() - Date.now(), 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  dom.nextRefresh.textContent = `${minutes}:${seconds}`;
}

export function updateSelectionPanel() {
  if (!weatherState.selectedPoint) {
    resetSelectionPanel();
    return;
  }

  const point = weatherState.selectedPoint;
  dom.selectionName.textContent = point.label;
  dom.selectionCoordinates.textContent = formatCoordinates(point.lat, point.lon);
  dom.selectionProvider.textContent = point.providerName ?? getActiveProvider().name;

  if (!point.current) {
    dom.selectionCondition.textContent = "In caricamento...";
    dom.selectionTemperature.textContent = "-";
    dom.selectionWind.textContent = "-";
    dom.selectionHumidity.textContent = "-";
    dom.selectionPressure.textContent = "-";
    dom.selectionDaylight.textContent = "-";
    return;
  }

  dom.selectionCondition.textContent = point.current.conditionLabel;
  dom.selectionTemperature.textContent =
    `${point.current.temperature.toFixed(1)} ${point.current.units.temperature}`;
  dom.selectionWind.textContent =
    `${point.current.windSpeed.toFixed(1)} ${point.current.units.wind}`;
  dom.selectionHumidity.textContent =
    `${point.current.humidity.toFixed(0)} ${point.current.units.humidity}`;
  dom.selectionPressure.textContent = point.current.pressure !== null
    ? `${point.current.pressure.toFixed(0)} ${point.current.units.pressure}`
    : "-";
  dom.selectionDaylight.textContent = point.current.isDay ? "Giorno" : "Notte";
}

export function resetSelectionPanel() {
  dom.selectionName.textContent = "Nessun punto selezionato";
  dom.selectionCondition.textContent = "-";
  dom.selectionTemperature.textContent = "-";
  dom.selectionWind.textContent = "-";
  dom.selectionHumidity.textContent = "-";
  dom.selectionPressure.textContent = "-";
  dom.selectionCoordinates.textContent = "-";
  dom.selectionDaylight.textContent = "-";
  dom.selectionProvider.textContent = "-";
  renderForecast([]);
}

export function updateProviderPanel() {
  const provider = getActiveProvider();
  dom.providerSelect.value = provider.id;
  dom.providerApiKey.value = getStoredApiKey(provider.id);
  dom.providerApiKey.disabled = !provider.requiresKey;
  dom.providerSaveButton.disabled = !provider.requiresKey;
  dom.providerApiKey.placeholder = provider.requiresKey
    ? `Chiave API per ${provider.name}`
    : "Questo provider non richiede chiave API";
  dom.providerCapability.textContent = provider.supportsGlobal
    ? `${provider.name} gestisce sia layer globale sia dettaglio locale.`
    : `${provider.name} gestisce il dettaglio locale. Il layer globale usa ${PROVIDERS.openMeteo.name} come fallback.`;

  const quota = weatherState.providerQuotas[provider.id] ?? { note: provider.quotaNote };
  dom.quotaLimit.textContent = quota.limit ?? "-";
  dom.quotaUsed.textContent = quota.used ?? "-";
  dom.quotaRemaining.textContent = quota.remaining ?? "-";
  dom.quotaNote.textContent = quota.note ?? provider.quotaNote;
  dom.providerDockContent.hidden = !weatherState.showProviderDock;
}

export function updateToggleButtons() {
  dom.toggleMarkersButton.innerHTML = buttonMarkup(
    markerIcon(),
    weatherState.showMarkers ? "Nascondi punti meteo" : "Mostra punti meteo"
  );
  dom.toggleTerminatorButton.innerHTML = buttonMarkup(
    terminatorIcon(),
    weatherState.showTerminator ? "Nascondi giorno/notte" : "Mostra giorno/notte"
  );
  dom.toggleCloudsButton.innerHTML = buttonMarkup(
    cloudIcon(),
    weatherState.showClouds ? "Nascondi nuvole" : "Mostra nuvole"
  );
  dom.toggleProviderBoxButton.textContent = weatherState.showProviderDock ? "▾" : "▴";
}

export function renderForecast(items) {
  if (!items.length) {
    dom.forecastList.innerHTML =
      '<p class="provider-note">Seleziona una località per vedere le previsioni.</p>';
    return;
  }

  dom.forecastList.innerHTML = items
    .slice(0, 5)
    .map(
      (item) => `
        <div class="forecast-item">
          <p class="forecast-day">
            <span class="forecast-icon">${conditionIconMarkup(item.weatherCode, item.conditionLabel)}</span>
            ${item.label}
          </p>
          <p>${item.min.toFixed(0)} / ${item.max.toFixed(0)} ${item.unit}</p>
          <p class="forecast-meta">${item.conditionLabel}</p>
        </div>
      `
    )
    .join("");
}

export function renderForecastLoading() {
  dom.forecastList.innerHTML =
    '<p class="provider-note">Caricamento previsioni in corso...</p>';
}

export function updateMarkerVisibility() {
  // This needs markers from scene.js — we use a callback to avoid circular dep
  if (_updateMarkerVisibilityCallback) _updateMarkerVisibilityCallback();
}

let _updateMarkerVisibilityCallback = null;
export function setUpdateMarkerVisibilityCallback(fn) {
  _updateMarkerVisibilityCallback = fn;
}

// getActiveProvider and getStoredApiKey are needed by updateSelectionPanel and updateProviderPanel
// We use callbacks to avoid circular deps with weather/api.js and weather/cache.js
let _getActiveProvider = null;
let _getStoredApiKey = null;
export function setGetActiveProvider(fn) {
  _getActiveProvider = fn;
}
export function setGetStoredApiKey(fn) {
  _getStoredApiKey = fn;
}
function getActiveProvider() {
  return _getActiveProvider ? _getActiveProvider() : (PROVIDERS[weatherState.providerId] ?? PROVIDERS.openMeteo);
}
function getStoredApiKey(providerId) {
  return _getStoredApiKey ? _getStoredApiKey(providerId) : "";
}
