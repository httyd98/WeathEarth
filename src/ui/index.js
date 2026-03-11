import { weatherState, dom } from "../state.js";
import { WEATHER_CODE_LABELS } from "../constants.js";
import { formatCoordinates, formatDateTime, conditionIconMarkup, markerIcon, terminatorIcon, cloudIcon, cloudCoverIcon, buttonMarkup } from "../utils.js";
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
    if (dom.selectionCloudCover) dom.selectionCloudCover.textContent = "-";
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
  if (dom.selectionCloudCover) {
    dom.selectionCloudCover.textContent = point.current.cloudCover != null
      ? `${point.current.cloudCover.toFixed(0)} %`
      : "-";
  }
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
  if (dom.selectionCloudCover) dom.selectionCloudCover.textContent = "-";
  renderForecast([]);
}

export function updateProviderPanel() {
  const provider = getActiveProvider();
  dom.providerSelect.value = provider.id;
  dom.providerApiKey.value = getStoredApiKey(provider.id);

  // Key group visibility and styling
  const hasKey = getStoredApiKey(provider.id).trim().length > 0;
  const needsKey = provider.keyRequired !== false && provider.requiresKey; // backward compat
  const isOptional = provider.keyOptional === true;

  const keyLabel = document.querySelector('label[for="provider-api-key"]');

  if (!needsKey && !isOptional) {
    // No key needed — hide the entire key group
    if (dom.providerKeyGroup) dom.providerKeyGroup.style.display = 'none';
    if (dom.providerKeyNote) dom.providerKeyNote.textContent = provider.keyNote ?? '';
    if (keyLabel) keyLabel.style.display = 'none';
  } else {
    // Key is needed (required or optional) — show the group
    if (dom.providerKeyGroup) dom.providerKeyGroup.style.display = '';

    // Clear previous state classes
    dom.providerApiKey.classList.remove('key-state-required', 'key-state-optional');

    if (isOptional) {
      dom.providerApiKey.classList.add('key-state-optional');
      dom.providerApiKey.placeholder = `Chiave API opzionale per ${provider.name}`;
    } else if (!hasKey) {
      // Required but missing
      dom.providerApiKey.classList.add('key-state-required');
      dom.providerApiKey.placeholder = `Chiave API obbligatoria per ${provider.name}`;
    } else {
      dom.providerApiKey.placeholder = `Chiave API per ${provider.name}`;
    }

    if (dom.providerKeyNote) dom.providerKeyNote.textContent = provider.keyNote ?? '';

    if (keyLabel) {
      keyLabel.style.display = '';
      keyLabel.textContent = isOptional ? 'Chiave API (opzionale)'
        : (needsKey && !hasKey) ? 'Chiave API (obbligatoria ⚠)'
        : 'Chiave API';
    }
  }

  dom.providerApiKey.disabled = !provider.requiresKey;
  dom.providerSaveButton.disabled = !provider.requiresKey;

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
  if (dom.toggleCloudCoverButton) {
    dom.toggleCloudCoverButton.innerHTML = buttonMarkup(
      cloudCoverIcon(),
      weatherState.showCloudCover ? "Nascondi copertura nuvole" : "Copertura nuvole"
    );
    dom.toggleCloudCoverButton.classList.toggle("active", weatherState.showCloudCover);
  }
  if (dom.toggleLanguageButton) {
    const langLabel = weatherState.language === 'it' ? 'Italiano' : 'English';
    dom.toggleLanguageButton.innerHTML = buttonMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 1.5C8 1.5 5.5 4 5.5 8s2.5 6.5 2.5 6.5M8 1.5C8 1.5 10.5 4 10.5 8S8 14.5 8 14.5M1.5 8h13"/></svg>`,
      `Lingua: ${langLabel}`
    );
  }
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
