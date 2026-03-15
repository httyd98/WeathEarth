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

  const stationCountText = `${stationCount}`;
  const avgTempText = Number.isFinite(averageTemperature)
    ? `${averageTemperature.toFixed(1)} °C`
    : "-";
  const lastRefreshText = weatherState.lastUpdatedAt
    ? formatDateTime(weatherState.lastUpdatedAt)
    : t("metrics.waiting");

  // Left HUD
  dom.stationCount.textContent = stationCountText;
  dom.avgTemp.textContent = avgTempText;
  dom.lastRefresh.textContent = lastRefreshText;

  // Right sidebar — Statistiche accordion
  if (dom.sidebarStationCount) dom.sidebarStationCount.textContent = stationCountText;
  if (dom.sidebarAvgTemp)      dom.sidebarAvgTemp.textContent      = avgTempText;
  if (dom.sidebarLastRefresh)  dom.sidebarLastRefresh.textContent  = lastRefreshText;

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
  const countdownText = `${minutes}:${seconds}`;
  dom.nextRefresh.textContent = countdownText;
  if (dom.sidebarNextRefresh) dom.sidebarNextRefresh.textContent = countdownText;
}

export function updateSelectionPanel() {
  if (!weatherState.selectedPoint) {
    resetSelectionPanel();
    return;
  }

  document.getElementById("selection-panel")?.style.setProperty("display", "");
  document.getElementById("forecast-panel")?.style.setProperty("display", "");

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
  document.getElementById("selection-panel")?.style.setProperty("display", "none");
  document.getElementById("forecast-panel")?.style.setProperty("display", "none");
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

  if (dom.toggleTimeZonesButton) {
    dom.toggleTimeZonesButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3v9.5l3.5 2.5"/><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="3 2"/><path d="M3 7.5h4M17 7.5h4M3 16.5h4M17 16.5h4" stroke-width="1" opacity="0.5"/></svg>`,
      weatherState.showTimeZones ? t("btn.hideTimeZones") : t("btn.timeZones")
    );
    dom.toggleTimeZonesButton.classList.toggle("active", weatherState.showTimeZones);
  }

  if (dom.toggleEarthInteriorButton) {
    dom.toggleEarthInteriorButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6" stroke-width="1.1"/><circle cx="12" cy="12" r="3.2" stroke-width="1"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`,
      weatherState.showEarthInterior ? t("btn.earthInteriorOff") : t("btn.earthInterior")
    );
    dom.toggleEarthInteriorButton.classList.toggle("active", weatherState.showEarthInterior);
  }

  if (dom.toggleEmFieldButton) {
    dom.toggleEmFieldButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M6 12c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6" stroke-dasharray="3 2"/><path d="M2.5 12c0-5.2 4.3-9.5 9.5-9.5s9.5 4.3 9.5 9.5-4.3 9.5-9.5 9.5" stroke-dasharray="4 3" stroke-width="1.2"/></svg>`,
      weatherState.showEmField ? t("btn.emFieldOff") : t("btn.emField")
    );
    dom.toggleEmFieldButton.classList.toggle("active", weatherState.showEmField);
  }

  if (dom.toggleWaterBodiesButton) {
    dom.toggleWaterBodiesButton.innerHTML = buttonMarkup(
      `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 7c2-2 4 2 6 0s4-2 6 0s4 2 6 0"/><path d="M3 12c2-2 4 2 6 0s4-2 6 0s4 2 6 0"/><path d="M3 17c2-2 4 2 6 0s4-2 6 0s4 2 6 0"/></svg>`,
      weatherState.showWaterBodies ? t("btn.hideWaterBodies") : t("btn.waterBodies")
    );
    dom.toggleWaterBodiesButton.classList.toggle("active", weatherState.showWaterBodies);
  }
}

// ── Dynamic legend ──────────────────────────────────────────────────────────

const LEGEND_CONFIGS = {
  default: {
    titleKey: "legend.title",
    footnoteKey: "legend.footnote",
    gradient: "linear-gradient(90deg, #335cff 0%, #58d8ff 35%, #f7f08e 65%, #ff7a4c 100%)",
    labels: ["-25°C", "0°C", "20°C", "40°C"],
  },
  heatmap: {
    titleKey: "legend.title.heatmap",
    footnoteKey: "legend.footnote.heatmap",
    gradient: "linear-gradient(90deg, #1400b4 0%, #0064ff 15%, #00e6c8 30%, #50ff3c 45%, #ffe600 60%, #ff5000 80%, #c80000 100%)",
    labels: ["-30°C", "-15°C", "0°C", "10°C", "20°C", "30°C", "40°C"],
  },
  wind: {
    titleKey: "legend.title.wind",
    footnoteKey: "legend.footnote.wind",
    gradient: "linear-gradient(90deg, #2650ff 0%, #00ccff 35%, #00ffcc 55%, #ff9933 85%, #ff3300 100%)",
    labels: ["0 m/s", "5", "15", "35+"],
  },
  precipitation: {
    titleKey: "legend.title.precipitation",
    footnoteKey: "legend.footnote.precipitation",
    gradient: "linear-gradient(90deg, #6699ff 0%, #00ddff 20%, #ffff00 40%, #ff9900 60%, #ff0000 80%, #cc00cc 100%)",
    labels: ["0.05", "1", "3", "7", "15", "30+ mm/h"],
  },
  emField: {
    titleKey: "legend.title.emField",
    footnoteKey: "legend.footnote.emField",
    gradient: "linear-gradient(90deg, #00ffff 0%, #8844ff 50%, #ff00ff 100%)",
    labels: ["25 000 nT", "45 000 nT", "65 000 nT"],
  },
};

/**
 * Update the legend panel to reflect the currently active colored feature.
 * Priority: emField > precipitation > wind > heatmap > default (markers).
 */
export function updateLegend() {
  const legendPanel = document.querySelector(".legend-panel");
  if (!legendPanel) return;

  let key = "default";
  if (weatherState.showEmField) key = "emField";
  else if (weatherState.showPrecipitation) key = "precipitation";
  else if (weatherState.showWind) key = "wind";
  else if (weatherState.showHeatmap) key = "heatmap";

  const cfg = LEGEND_CONFIGS[key];

  const titleEl = legendPanel.querySelector(".section-title");
  const footnoteEl = legendPanel.querySelector(".footnote");
  const barEl = legendPanel.querySelector(".legend-bar");
  const scaleEl = legendPanel.querySelector(".legend-scale");

  if (titleEl) titleEl.textContent = t(cfg.titleKey);
  if (footnoteEl) footnoteEl.textContent = t(cfg.footnoteKey);
  if (barEl) barEl.style.background = cfg.gradient;
  if (scaleEl) scaleEl.innerHTML = cfg.labels.map(l => `<span>${l}</span>`).join("");
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
