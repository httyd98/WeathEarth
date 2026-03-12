/**
 * Mode Bar — Ora / Modelli switcher
 *
 * Manages the mode bar UI at the top of the right sidebar.
 * Handles switching between "realtime" (current conditions) and
 * "forecast" (NWP model predictions) modes.
 */

import { weatherState, dom } from "../state.js";
import { t } from "../i18n.js";

// Open-Meteo model parameter mapping
export const MODEL_PARAMS = {
  auto:        null,
  gfs:         "gfs_seamless",
  icon:        "icon_seamless",
  meteofrance: "meteofrance_seamless",
  gem:         "gem_seamless",
};

let _onModeChange  = null;
let _onModelChange = null;
let _onHoursChange = null;

export function initModeBar({ onModeChange, onModelChange, onHoursChange }) {
  _onModeChange  = onModeChange;
  _onModelChange = onModelChange;
  _onHoursChange = onHoursChange;

  dom.modeRealtimeBtn?.addEventListener("click", () => _setMode("realtime"));
  dom.modeForecastBtn?.addEventListener("click", () => _setMode("forecast"));

  document.querySelectorAll("#model-selector-row .model-option").forEach(btn => {
    btn.addEventListener("click", () => {
      weatherState.forecastModel = btn.dataset.model;
      document.querySelectorAll("#model-selector-row .model-option")
        .forEach(b => b.classList.toggle("active", b.dataset.model === btn.dataset.model));
      _onModelChange?.(btn.dataset.model, MODEL_PARAMS[btn.dataset.model] ?? null);
    });
  });

  dom.forecastTimeSlider?.addEventListener("input", () => {
    const hours = parseInt(dom.forecastTimeSlider.value, 10);
    weatherState.forecastHours = hours;
    if (dom.forecastTimeLabel) {
      dom.forecastTimeLabel.textContent = _fmtHours(hours);
    }
    _onHoursChange?.(hours);
  });
}

function _setMode(mode) {
  weatherState.dataMode = mode;
  const isForecast = mode === "forecast";
  dom.modeRealtimeBtn?.classList.toggle("active", !isForecast);
  dom.modeForecastBtn?.classList.toggle("active",  isForecast);
  if (dom.modelSelectorRow) dom.modelSelectorRow.hidden = !isForecast;
  if (dom.forecastTimeRow)  dom.forecastTimeRow.hidden  = !isForecast;
  if (!isForecast) {
    weatherState.forecastHours = 0;
    if (dom.forecastTimeSlider) dom.forecastTimeSlider.value = "0";
    if (dom.forecastTimeLabel)  dom.forecastTimeLabel.textContent = _fmtHours(0);
  }
  _onModeChange?.(mode);
}

export function getModelParam() {
  return MODEL_PARAMS[weatherState.forecastModel] ?? null;
}

export function updateModeBarI18n() {
  // Update i18n strings that aren't handled by data-i18n attributes
  if (dom.forecastTimeLabel) {
    dom.forecastTimeLabel.textContent = _fmtHours(weatherState.forecastHours ?? 0);
  }
}

function _fmtHours(h) {
  return h === 0 ? t("mode.timeNow") : `+${h}h`;
}
