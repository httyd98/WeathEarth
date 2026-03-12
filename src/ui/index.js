import { weatherState, dom } from "../state.js";
import { formatCoordinates, formatDateTime, conditionIconMarkup, markerIcon, terminatorIcon, buttonMarkup } from "../utils.js";
import { PROVIDERS } from "../providers.js";
import { t } from "../i18n.js";

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
    : t("metrics.waiting");
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
    dom.selectionCondition.textContent = t("selection.loading");
    dom.selectionTemperature.textContent = "-";
    dom.selectionWind.textContent = "-";
    dom.selectionHumidity.textContent = "-";
    dom.selectionPressure.textContent = "-";
    dom.selectionDaylight.textContent = "-";
    if (dom.selectionCloudCover) dom.selectionCloudCover.textContent = "-";
    if (dom.selectionPrecipitation) dom.selectionPrecipitation.textContent = "-";
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
  dom.selectionDaylight.textContent = point.current.isDay ? t("selection.day") : t("selection.night");
  if (dom.selectionCloudCover) {
    dom.selectionCloudCover.textContent = point.current.cloudCover != null
      ? `${point.current.cloudCover.toFixed(0)} %`
      : "-";
  }
  if (dom.selectionPrecipitation) {
    dom.selectionPrecipitation.textContent = point.current.precipitation != null
      ? `${point.current.precipitation.toFixed(1)} mm`
      : "-";
  }
}

export function resetSelectionPanel() {
  dom.selectionName.textContent = t("selection.none");
  dom.selectionCondition.textContent = "-";
  dom.selectionTemperature.textContent = "-";
  dom.selectionWind.textContent = "-";
  dom.selectionHumidity.textContent = "-";
  dom.selectionPressure.textContent = "-";
  dom.selectionCoordinates.textContent = "-";
  dom.selectionDaylight.textContent = "-";
  dom.selectionProvider.textContent = "-";
  if (dom.selectionCloudCover) dom.selectionCloudCover.textContent = "-";
  if (dom.selectionPrecipitation) dom.selectionPrecipitation.textContent = "-";
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
      dom.providerApiKey.placeholder = t("provider.apiKeyPlaceholderOptional", { provider: provider.name });
    } else if (!hasKey) {
      // Required but missing
      dom.providerApiKey.classList.add('key-state-required');
      dom.providerApiKey.placeholder = t("provider.apiKeyPlaceholderRequired", { provider: provider.name });
    } else {
      dom.providerApiKey.placeholder = t("provider.apiKeyPlaceholder", { provider: provider.name });
    }

    if (dom.providerKeyNote) dom.providerKeyNote.textContent = provider.keyNote ?? '';

    if (keyLabel) {
      keyLabel.style.display = '';
      keyLabel.textContent = isOptional ? t("provider.apiKeyOptional")
        : (needsKey && !hasKey) ? t("provider.apiKeyRequired")
        : t("provider.apiKey");
    }
  }

  dom.providerApiKey.disabled = !provider.requiresKey;
  dom.providerSaveButton.disabled = !provider.requiresKey;

  dom.providerCapability.textContent = provider.supportsGlobal
    ? t("provider.supportsGlobal", { provider: provider.name })
    : t("provider.localOnly", { provider: provider.name, fallback: PROVIDERS.openMeteo.name });

  const quota = weatherState.providerQuotas[provider.id] ?? { note: provider.quotaNote };
  dom.quotaLimit.textContent = quota.limit ?? "-";
  dom.quotaUsed.textContent = quota.used ?? "-";
  dom.quotaRemaining.textContent = quota.remaining ?? "-";
  dom.quotaNote.textContent = quota.note ?? provider.quotaNote;
}

export function updateToggleButtons() {
  dom.toggleMarkersButton.innerHTML = buttonMarkup(
    markerIcon(),
    weatherState.showMarkers ? t("btn.hideMarkers") : t("btn.showMarkers")
  );
  dom.toggleMarkersButton.classList.toggle("active", weatherState.showMarkers);

  dom.toggleTerminatorButton.innerHTML = buttonMarkup(
    terminatorIcon(),
    weatherState.showTerminator ? t("btn.hideTerminator") : t("btn.showTerminator")
  );
  dom.toggleTerminatorButton.classList.toggle("active", weatherState.showTerminator);

  if (dom.toggleHeatmapButton) {
    dom.toggleHeatmapButton.innerHTML = buttonMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1464e0"/><stop offset="50%" stop-color="#22dd55"/><stop offset="100%" stop-color="#dd2200"/></linearGradient></defs><circle cx="8" cy="8" r="6.5" stroke="url(#hg)"/><path d="M4.5 11 Q6 5 8 8 Q10 11 11.5 5" stroke="currentColor" stroke-linecap="round"/></svg>`,
      weatherState.showHeatmap ? t("btn.hideHeatmap") : t("btn.showHeatmap")
    );
  }

  if (dom.togglePrecipitationButton) {
    dom.togglePrecipitationButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15a4 4 0 1 1 .5-8a5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 1 1 17.5 15H7Z" fill="currentColor"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      weatherState.showPrecipitation ? t("btn.hidePrecipitation") : t("btn.precipitation")
    );
  }

  if (dom.toggleWindButton) {
    dom.toggleWindButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a4 4 0 1 1-4 4"/><path d="M3 16h7"/></svg>`,
      weatherState.showWind ? t("btn.hideWind") : t("btn.showWind")
    );
    dom.toggleWindButton.classList.toggle("active", weatherState.showWind);
  }

  // Update cloud switch labels with current language
  document.querySelectorAll("#cloud-switch .cloud-option").forEach(btn => {
    const key = `clouds.${btn.dataset.cloud}`;
    btn.textContent = t(key);
  });

  if (dom.toggleTiltSimpleButton) {
    dom.toggleTiltSimpleButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 3"/><line x1="7" y1="4" x2="17" y2="20" stroke="rgba(100,180,255,0.8)"/></svg>`,
      weatherState.tiltMode === "simple" ? t("btn.tiltSimpleOff") : t("btn.tiltSimple")
    );
    dom.toggleTiltSimpleButton.classList.toggle("active", weatherState.tiltMode === "simple");
  }

  if (dom.toggleTiltSeasonalButton) {
    dom.toggleTiltSeasonalButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3 Q16 8 12 12 Q8 16 12 21" stroke="rgba(100,180,255,0.8)"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 3"/></svg>`,
      weatherState.tiltMode === "seasonal" ? t("btn.tiltSeasonalOff") : t("btn.tiltSeasonal")
    );
    dom.toggleTiltSeasonalButton.classList.toggle("active", weatherState.tiltMode === "seasonal");
  }
}

export function updateFeatureVisibility() {
  const provider = getActiveProvider();
  const caps = provider.capabilities ?? {};

  // Cloud "real" option — hide if provider doesn't support cloud cover
  const realOption = document.querySelector('[data-cloud="real"]');
  if (realOption) {
    const hasCloudCover = caps.cloudCover !== false; // default true
    realOption.classList.toggle("hidden", !hasCloudCover);
    if (!hasCloudCover && weatherState.cloudMode === "real") {
      weatherState.cloudMode = "off";
      document.querySelectorAll("#cloud-switch .cloud-option").forEach(b => {
        b.classList.toggle("active", b.dataset.cloud === "off");
      });
    }
  }

  // Precipitation button
  if (dom.togglePrecipitationButton) {
    const hasPrecip = caps.precipitation !== false;
    dom.togglePrecipitationButton.style.display = hasPrecip ? "" : "none";
  }
}

export function renderForecast(items) {
  if (!items.length) {
    dom.forecastList.innerHTML =
      `<p class="provider-note">${t("forecast.empty")}</p>`;
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
    `<p class="provider-note">${t("forecast.loading")}</p>`;
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
