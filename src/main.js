import "./style.css";
import * as THREE from "three";

// State & constants
import { weatherState, interactionState, dom } from "./state.js";
import { CLICK_DISTANCE_THRESHOLD, REFRESH_INTERVAL_MS, GLOBE_RADIUS } from "./constants.js";
import { buildSamplePoints, buildSummaryPoints, vector3ToLatLon, formatLocationName } from "./utils.js";
import { PROVIDERS } from "./providers.js";
import { t, renderAllI18n } from "./i18n.js";

// Globe modules
import {
  renderer, scene, camera, controls, globeGroup,
  earth, clouds, heatmapMesh, cloudCoverMesh, precipMesh,
  pointer, raycaster,
  initMarkers, equatorialRing, starField
} from "./globe/scene.js";
import { applyLightingMode, updateSunDirection, getSunDirection } from "./globe/lighting.js";
import { updateMarkerMeshes, updateMarkerVisibility, buildHeatmapCanvas, updateSelectedMarker } from "./globe/markers.js";
import { buildCloudCanvas } from "./globe/cloudLayer.js";
import { loadSatelliteCloudTexture } from "./globe/satelliteCloudLayer.js";
import { buildPrecipitationCanvas } from "./globe/precipitationLayer.js";
import { fetchAndApplyRainViewer, startRainViewerRefresh, stopRainViewerRefresh } from "./globe/rainViewer.js";
import { buildWindField, updateWindParticles, initWindParticles, windParticles, isWindFieldEmpty, setWindTrailsVisible, getAvailableLevels } from "./globe/windParticles.js";
import { lightningMesh, buildLightningField, updateLightning, disableLightning, refreshLightning } from "./globe/lightningLayer.js";
import { timeZoneMesh, buildTimeZoneCanvas, updateTimeZoneLayer, highlightZoneAtUV, clearTimeZoneHighlight } from "./globe/timeZoneLayer.js";
import { initEarthInterior, enableEarthInterior, disableEarthInterior, updateEarthInterior, toggleLayerVisibility, hasActiveFullSphereLayers } from "./globe/earthInterior.js";
import { enableEmField, disableEmField } from "./globe/emFieldLayer.js";
import { waterBodiesMesh, buildWaterBodiesCanvas } from "./globe/waterBodiesLayer.js";
import { loadEarthTextures, updateControlsForZoom } from "./globe/textures.js";
import { updateOSMTileLayer, addDataZoom, resetDataZoom, getDataZoom, getOSMZoom } from "./globe/osmTileLayer.js";
import { initMoon, updateMoon } from "./globe/moonLayer.js";
import { initSkyBackground, updateSkyRotation, setSkyDimming, updateSkyDimming, isSkyDimming } from "./globe/skyBackground.js";
import { enableSatellites, disableSatellites, updateSatellites, getSatelliteCount, getSatelliteMesh, getSatelliteData, showSatelliteOrbit, setHoveredSatellite, disposeOrbitLine, refreshSatellites } from "./globe/satelliteLayer.js";
import { enableAircraft, disableAircraft, updateAircraft, getAircraftCount, getAircraftMesh, getAircraftData, getAircraftProjectedRoute, refreshAircraft } from "./globe/aircraftLayer.js";
import { enableShips, disableShips, updateShips, getShipCount, getShipMesh, getShipData, showShipRoute, disposeShipRoute } from "./globe/shipLayer.js";
import { enableTraffic, disableTraffic, updateTraffic, getTrafficVehicleCount } from "./globe/trafficLayer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { enableEconomy, disableEconomy, setEconomyMetric, getEconomyMeshes, getEconomyCountry, getEconomyCountryPos, ECONOMY_METRICS } from "./globe/economyLayer.js";
import { enableAnthropology, disableAnthropology, setAnthroMetric, getAnthroMeshes, getAnthroCountry, getAnthroCountryPos, ANTHRO_METRICS } from "./globe/anthropologyLayer.js";
import { enableTectonic, disableTectonic, TECTONIC_TYPES, setTectonicFilter, getTectonicFilter, updateTectonicResolution } from "./globe/tectonicLayer.js";
import { enableVolcanoes, disableVolcanoes, getVolcanoMesh, getVolcanoData, VOLCANO_STATUS_COLORS, setVolcanoStatusFilter, getVolcanoStatusFilter } from "./globe/volcanoLayer.js";
import { enableMinerals, disableMinerals, getMineralMesh, getMineralData, toggleMineralFilter, getMineralFilter, MINERAL_CATEGORIES } from "./globe/mineralsLayer.js";
import { enableReligion, disableReligion, getReligionMeshes, getReligionCountry, setReligionMode, getReligionMode, RELIGION_META } from "./globe/religionLayer.js";
import { enableEnergy, disableEnergy, getEnergyMeshes, getEnergyCountry, setEnergyMode, getEnergyMode, ENERGY_SOURCES } from "./globe/energyLayer.js";
import { enableAurora, disableAurora, updateAurora, refreshAurora } from "./globe/auroraLayer.js";
import { enableDeforestation, disableDeforestation, setDeforestationMode, getDeforestationMeshes, getDeforestationCountry, DEFORESTATION_CAUSES, DEFORESTATION_TRENDS } from "./globe/deforestationLayer.js";
import { enableDesertification, disableDesertification, getDesertificationMeshes, getDesertificationCountry, DESERTIFICATION_RISK_META } from "./globe/desertificationLayer.js";
import { enableIce, disableIce } from "./globe/iceLayer.js";
import { enableWarming, disableWarming, setWarmingYear, getWarmingMeshes, getWarmingCountry, WARMING_YEARS } from "./globe/warmingLayer.js";
import { enableCctv, disableCctv, updateCctv, getCctvMesh, getCctvData, getCctvPreviewUrl, refreshCctv } from "./globe/cctvLayer.js";
import { enableNato, disableNato, getNatoMesh, getNatoBaseData, setNatoFilter, getNatoFilter, NATO_NATIONS } from "./globe/natoLayer.js";
import { enableSeas, disableSeas } from "./globe/seasLayer.js";
import { enableFishing, disableFishing, getFishingZoneAt, FISHING_ZONES } from "./globe/fishingLayer.js";
import { enableOilGas, disableOilGas, getOilGasMesh, getDepositData, setGlobeTransparency, setOilGasFilter, OIL_GAS_DEPOSITS } from "./globe/oilGasLayer.js";
import { createFetchLimiter } from "./utils/fetchLimiter.js";

// UI — mode bar
import { initModeBar } from "./ui/modeBar.js";

// Weather modules
import {
  fetchOpenMeteoGlobal,
  refreshGlobalWeather,
  refreshSelectedPointWeather,
  selectLocation,
  clearSelection,
  geocodeLocation,
  requestCurrentLocationSelection,
  handleSearchSubmit,
  getActiveProvider,
  setProviderQuota,
  handleProviderChange,
  setUpdateSelectedMarkerCallback,
  setOnProviderChange,
  setOnWeatherRefreshed
} from "./weather/api.js";
import {
  loadStoredProviderId,
  storeApiKey,
  getStoredApiKey,
  loadWeatherCache,
  loadWeatherSnapshot,
  applyCachedWeather
} from "./weather/cache.js";

// UI
import {
  setStatus,
  showSnackbar,
  updateHud,
  updateSelectionPanel,
  resetSelectionPanel,
  renderForecast,
  renderForecastLoading,
  updateProviderPanel,
  updateToggleButtons,
  updateFeatureVisibility,
  updateLegend,
  updateRefreshCountdown,
  setGetActiveProvider,
  setGetStoredApiKey,
  setUpdateMarkerVisibilityCallback
} from "./ui/index.js";

// ── Camera navigation controller ──
const CAM_ORBIT_SPEED   = 1.2;  // radians / sec
const CAM_ROTATE_SPEED  = 0.8;  // radians / sec — earth axis
const CAM_ZOOM_SPEED    = 3.0;  // distance units / sec
const _activeInputs     = new Set(); // currently held actions
const _CAM_KEY_MAP = {
  w: "orbit-up", s: "orbit-down", a: "orbit-left", d: "orbit-right",
  q: "rotate-left", e: "rotate-right",
  ArrowUp: "zoom-in", ArrowDown: "zoom-out",
};
const _CAM_SPHERICAL = new THREE.Spherical();

// IndexedDB cache
import { initCacheDB, saveWeatherDB, clearExpired } from "./weather/cacheDB.js";
initCacheDB().then(ok => {
  if (ok) clearExpired();
});

// Providers - wire up late binding to break circular dep
import { setFetchOpenMeteoGlobal } from "./providers.js";
setFetchOpenMeteoGlobal(fetchOpenMeteoGlobal);

// Wire up callbacks to break circular dependencies
setGetActiveProvider(getActiveProvider);
setGetStoredApiKey(getStoredApiKey);
setUpdateMarkerVisibilityCallback(updateMarkerVisibility);
setUpdateSelectedMarkerCallback(updateSelectedMarker);

// Build sample points and initialize weatherState
const samplePoints = buildSamplePoints();
const summaryPoints = buildSummaryPoints();
weatherState.points = samplePoints.map((point) => ({
  ...point,
  current: null
}));
weatherState.providerId = loadStoredProviderId();
weatherState.globalDataProvider = PROVIDERS.openMeteo.name;

// Initialize markers (now that weatherState.points is populated)
initMarkers(weatherState.points.length);

// Wire up provider change callback
setOnProviderChange(() => {
  const newProvider = getActiveProvider();

  // Changing provider never triggers a global data re-fetch.
  // Global data (Open-Meteo batch) is loaded only at page load and by the timer.
  // Provider choice only affects single-point detail queries.
  updateProviderPanel();
  updateFeatureVisibility();
  setStatus(
    newProvider.supportsGlobal
      ? t("status.providerGlobal", { provider: newProvider.name })
      : t("status.providerLocal", { provider: newProvider.name })
  );

  // Refresh the selected point with the new local provider
  if (weatherState.selectedPoint) {
    refreshSelectedPointWeather(true);
  }
});

// Pre-populate from cache (or snapshot) so globe shows data immediately before first fetch.
// refreshGlobalWeather will then fetch live data and overwrite only on success.
{
  const cached = loadWeatherCache() ?? loadWeatherSnapshot();
  if (cached) {
    applyCachedWeather(cached);
    updateMarkerMeshes();
    updateHud();
  }
}

// Initial setup calls
updateSunDirection();
applyLightingMode();
resetSelectionPanel();
updateMarkerMeshes();
updateHud();
loadEarthTextures();
updateProviderPanel();
updateToggleButtons();
updateFeatureVisibility();
updateGlobeCenter();

// Apply initial cloud mode from default state
clouds.visible = weatherState.cloudMode === "aesthetic";
cloudCoverMesh.visible = weatherState.cloudMode === "real";
document.querySelectorAll("#cloud-switch .cloud-option").forEach(b => {
  b.classList.toggle("active", b.dataset.cloud === weatherState.cloudMode);
});

// Initialize wind particle system (particles pre-seeded at random positions)
initWindParticles();

// Initialize earth interior module (creates layer spheres + cap geometries lazily)
initEarthInterior();

// Initialize moon with real astronomical position
initMoon(scene);

// Initialize photorealistic sky background (replaces particle starfield)
initSkyBackground(scene, starField);

// On each successful global weather refresh: rebuild wind field + update toggle labels
setOnWeatherRefreshed(() => {
  buildWindField(weatherState.points, weatherState.windAltitudeLevel);
  if (weatherState.showWind) _syncWindSlider(); // sync slider to available data
  if (weatherState.showLightning) buildLightningField(weatherState.points);
  updateToggleButtons();
  // Also save to IndexedDB for larger/persistent cache
  const validPoints = weatherState.points.filter(p => p.current);
  if (validPoints.length > 0) {
    saveWeatherDB({ data: validPoints.map(p => ({ lat: p.lat, lon: p.lon, current: p.current })) });
  }
});

// Initialize mode bar (Ora / Modelli switcher)
initModeBar({
  onModeChange: (mode) => {
    // Re-fetch with new model param already in weatherState.dataMode
    refreshGlobalWeather(true, samplePoints, summaryPoints);
    if (mode === "realtime") updateToggleButtons();
  },
  onModelChange: (_model, _param) => {
    refreshGlobalWeather(true, samplePoints, summaryPoints);
  },
  onHoursChange: (_hours) => {
    // Re-fetch and rebuild visualizations using forecast hour offset
    refreshGlobalWeather(true, samplePoints, summaryPoints);
  },
});

// Earth axial tilt: 23.44 degrees = 0.40928 radians
const EARTH_TILT_RAD = 23.44 * Math.PI / 180;

// Target quaternion for smooth tilt animation — written by _computeTiltQuat()
const _targetQuat = new THREE.Quaternion();
// User-applied rotation via Q/E keys — composed ON TOP of _targetQuat
const _userRotQuat = new THREE.Quaternion();
// Combined target = _targetQuat * _userRotQuat
const _combinedQuat = new THREE.Quaternion();

/**
 * Compute and store in _targetQuat the target orientation for the globe given tiltMode.
 *
 * "simple"   — fixed 23.44° tilt around Z-axis (north pole tilts visually to the right).
 *              Always the same visible appearance regardless of time of year.
 *
 * "seasonal" — full 23.44° tilt with the axis oriented in the correct astronomical direction:
 *              the north pole tilts TOWARD the sun at summer solstice and AWAY at winter solstice.
 *              Near equinoxes the axis is perpendicular to the sun-Earth line (sideways tilt),
 *              which correctly shows equal day/night. The tilt magnitude is ALWAYS 23.44°.
 *
 * "none"     — identity (upright globe).
 */
function _computeTiltQuat(mode) {
  if (mode === "none") {
    _targetQuat.identity();
    return;
  }
  if (mode === "simple") {
    // Fixed tilt: rotate globe around Z-axis by 23.44° (north pole tilts right)
    _targetQuat.setFromEuler(new THREE.Euler(0, 0, EARTH_TILT_RAD));
    return;
  }
  if (mode === "seasonal") {
    // True astronomical tilt: north pole tilted 23.44° toward the current sun direction.
    // The tilt axis is the cross product of Y+ (north) and the sun's XZ projection.
    const sunDir = getSunDirection(new Date());
    const sunXZ = new THREE.Vector3(sunDir.x, 0, sunDir.z);
    const len = sunXZ.length();
    if (len < 0.001) {
      // Sun directly above/below — degenerate, keep current
      return;
    }
    sunXZ.divideScalar(len);
    // tiltAxis = cross(Y, sunXZ) = [sunXZ.z, 0, -sunXZ.x]
    // Rotating around this axis by EARTH_TILT_RAD tilts north pole toward the sun.
    const tiltAxis = new THREE.Vector3(sunXZ.z, 0, -sunXZ.x);
    _targetQuat.setFromAxisAngle(tiltAxis, EARTH_TILT_RAD);
    return;
  }
  _targetQuat.identity();
}

function handleToggleTiltSimple() {
  weatherState.tiltMode = weatherState.tiltMode === "simple" ? "none" : "simple";
  _computeTiltQuat(weatherState.tiltMode);
  equatorialRing.visible = weatherState.tiltMode !== "none";
  updateToggleButtons();
}

function handleToggleTiltSeasonal() {
  weatherState.tiltMode = weatherState.tiltMode === "seasonal" ? "none" : "seasonal";
  _computeTiltQuat(weatherState.tiltMode);
  equatorialRing.visible = weatherState.tiltMode !== "none";
  updateToggleButtons();
}

function handleToggleTimeZones() {
  weatherState.showTimeZones = !weatherState.showTimeZones;
  timeZoneMesh.visible = weatherState.showTimeZones;
  if (weatherState.showTimeZones) {
    buildTimeZoneCanvas(new Date());
  } else {
    clearTimeZoneHighlight();
  }
  dom.toggleTimeZonesButton?.classList.toggle("active", weatherState.showTimeZones);
  updateToggleButtons();
}

function handleToggleEarthInterior() {
  weatherState.showEarthInterior = !weatherState.showEarthInterior;
  if (weatherState.showEarthInterior) {
    enableEarthInterior();
  } else {
    disableEarthInterior();
  }
  dom.toggleEarthInteriorButton?.classList.toggle("active", weatherState.showEarthInterior);
  // Show/hide per-layer toggles
  const layerToggles = document.getElementById("earth-layer-toggles");
  if (layerToggles) layerToggles.style.display = weatherState.showEarthInterior ? "" : "none";
  updateToggleButtons();
}

// Must be declared BEFORE animate() is called to avoid temporal dead zone error
let _lastFrameTime = performance.now();
let _compassResetting = false;
let _compassResetTarget = null;
const _compassCanvas = document.getElementById("compass-canvas");
const _compassCtx = _compassCanvas?.getContext("2d");
const _compassCardinals = [
  { label: "N", axis: new THREE.Vector3(0, 1, 0), color: "#ff4444", size: 16 },
  { label: "S", axis: new THREE.Vector3(0, -1, 0), color: "rgba(140,180,255,0.6)", size: 12 },
  { label: "E", axis: new THREE.Vector3(1, 0, 0), color: "rgba(160,200,255,0.8)", size: 13 },
  { label: "W", axis: new THREE.Vector3(-1, 0, 0), color: "rgba(160,200,255,0.8)", size: 13 },
];
function _finishCompassReset() {
  // Only fix camera.up — do NOT move camera.position
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  _compassResetting = false;
  _compassResetTarget = null;
  // Re-enable OrbitControls and force it to sync with current camera state
  controls.enabled = true;
  const prevDamping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = prevDamping;
}

function _cancelCompassReset() {
  if (_compassResetting) {
    _compassResetting = false;
    _compassResetTarget = null;
    controls.enabled = true;
  }
}

const _sbZoom = document.getElementById("sb-zoom");
const _sbGroups = document.getElementById("sb-groups");
let _sbUpdateCounter = 0;

function _updateStatusBarGroups(camDist) {
  const groups = [];

  // ── METEO ──
  {
    const items = [];
    const nPts = weatherState.points?.length ?? 0;
    if (nPts > 0 && weatherState.showMarkers) items.push(`${nPts} punti`);
    if (weatherState.showHeatmap) items.push("Heatmap");
    if (weatherState.showWind) items.push(`Vento ${weatherState.windAltitudeLevel}`);
    if (weatherState.showPrecipitation) items.push(weatherState.useRainViewer ? "Precip. RainViewer" : "Precip.");
    if (weatherState.showLightning) items.push("Fulmini");
    if (weatherState.cloudMode !== "off") items.push(`Nuvole ${weatherState.cloudMode === "aesthetic" ? "estetiche" : "satellite"}`);
    if (items.length) groups.push({ label: "METEO", items: items.join(" · ") });
  }

  // ── ASTRONOMIA ──
  {
    const items = [];
    if (weatherState.showTerminator) items.push("Terminatore");
    if (weatherState.tiltMode === "simple") items.push("Asse 23.4°");
    else if (weatherState.tiltMode === "seasonal") items.push("Asse stagionale");
    if (weatherState.showSatellites) {
      const cnt = getSatelliteCount();
      const sf = weatherState.satelliteFilters;
      const active = ["leo","meo","geo","heo"].filter(k => sf[k]);
      const filterStr = active.length < 4 ? ` [${active.join(",")}]` : "";
      items.push(`Sat ${cnt}${filterStr}`);
    }
    if (weatherState.showAurora) items.push("Aurora");
    if (items.length) groups.push({ label: "ASTRO", items: items.join(" · ") });
  }

  // ── TRASPORTI ──
  {
    const items = [];
    if (weatherState.showAircraft) {
      const cnt = getAircraftCount();
      const af = weatherState.aircraftFilters;
      const active = ["low","mid","high"].filter(k => af[k]);
      const filterStr = active.length < 3 ? ` [${active.join(",")}]` : "";
      items.push(`Aerei ${cnt}${filterStr}`);
    }
    if (weatherState.showShips) items.push(`Navi ${getShipCount()}`);
    if (weatherState.showTraffic) items.push(`Traffico ${getTrafficVehicleCount()}`);
    if (items.length) groups.push({ label: "TRASP", items: items.join(" · ") });
  }

  // ── ECONOMIA ──
  if (weatherState.showEconomy) {
    const chip = document.querySelector("#economy-filters .filter-chip.active");
    const metric = chip?.textContent?.trim() ?? "";
    groups.push({ label: "ECON", items: metric || "Dati economici" });
  }

  // ── ANTROPOLOGIA ──
  {
    const items = [];
    if (weatherState.showAnthropology) {
      const chip = document.querySelector("#anthropology-filters .filter-chip.active");
      items.push(chip?.textContent?.trim() ?? "Demografia");
    }
    if (weatherState.showReligion) {
      const mode = getReligionMode();
      items.push(`Religioni: ${mode}`);
    }
    if (items.length) groups.push({ label: "ANTRO", items: items.join(" · ") });
  }

  // ── ENERGIA ──
  if (weatherState.showEnergy) {
    const mode = getEnergyMode();
    groups.push({ label: "ENERG", items: mode === "dominant" ? "Dominante" : mode });
  }

  // ── PERICOLI ──
  {
    const items = [];
    if (weatherState.showDeforestation) {
      const chip = document.querySelector("#deforestation-filters .filter-chip.active");
      items.push(`Deforest.: ${chip?.textContent?.trim() ?? ""}`);
    }
    if (weatherState.showDesertification) items.push("Desertificazione");
    if (weatherState.showIce) items.push("Ghiacci");
    if (weatherState.showWarming) {
      const lbl = document.getElementById("warming-year-label")?.textContent ?? "";
      items.push(`Riscald. ${lbl}`);
    }
    if (items.length) groups.push({ label: "PERIC", items: items.join(" · ") });
  }

  // ── GEO ──
  {
    const items = [];
    if (weatherState.showEarthInterior) items.push("Strati interni");
    if (weatherState.showEmField) items.push("Campo EM");
    if (weatherState.showWaterBodies) items.push("Laghi/fiumi");
    if (weatherState.showTectonic) {
      const off = Object.entries(TECTONIC_TYPES).filter(([k]) => !getTectonicFilter(k));
      items.push(off.length ? `Tettoniche [-${off.length}]` : "Tettoniche");
    }
    if (weatherState.showVolcanoes) items.push("Vulcani");
    if (weatherState.showMinerals) items.push("Minerali");
    if (weatherState.showOilGas) items.push("Petrolio/Gas");
    if (items.length) groups.push({ label: "GEO", items: items.join(" · ") });
  }

  // ── GEOPOLITICA ──
  if (weatherState.showNato) {
    groups.push({ label: "GEOPOL", items: "Basi NATO" });
  }

  // ── MARE ──
  {
    const items = [];
    if (weatherState.showSeas) items.push("Mari/Oceani");
    if (weatherState.showFishing) items.push("Zone pesca FAO");
    if (items.length) groups.push({ label: "MARE", items: items.join(" · ") });
  }

  // ── SITUAZIONI ──
  {
    const items = [];
    if (weatherState.showTimeZones) items.push("Fusi orari");
    if (weatherState.showCctv) items.push("Webcam");
    if (items.length) groups.push({ label: "LIVE", items: items.join(" · ") });
  }

  // ── SISTEMA ──
  {
    const items = [];
    if (camDist < 6.0 || getDataZoom() > 0) {
      const dz = getDataZoom();
      items.push(dz > 0 ? `OSM z${getOSMZoom()}+${dz}` : `OSM z${getOSMZoom()}`);
    }
    if (items.length) groups.push({ label: "SYS", items: items.join(" · ") });
  }

  // Build HTML
  if (groups.length === 0) {
    _sbGroups.innerHTML = "";
    return;
  }
  _sbGroups.innerHTML = groups.map(g =>
    `<span class="sb-group"><span class="sb-group-label">${g.label}</span> <span class="sb-group-items">${g.items}</span></span>`
  ).join("");
}

// ── Aircraft route line + hexdb.io data ──
let _aircraftRouteLine = null;
let _aircraftAirportMarkers = []; // sprites + dots for departure/arrival airports
const _hexdbLimiter = createFetchLimiter(2);
let _hexdbFetchId = 0; // guard against stale fetches
let _adsbdbFetchId = 0; // guard against stale adsbdb.com fetches

// ── Entity card (floating info for aircraft/satellite selection) ──
const _entityCard = document.getElementById("entity-card");
const _entityCardTitle = document.getElementById("entity-card-title");
const _entityCardSubtitle = document.getElementById("entity-card-subtitle");
const _entityCardBody = document.getElementById("entity-card-body");
let _selectedEntityType = null; // "aircraft" | "satellite" | null
let _selectedEntityIndex = -1;

document.getElementById("entity-card-close")?.addEventListener("click", () => {
  _hideEntityCard();
});

// ── Draggable entity card ──
let _cardDragging = false;
let _cardDragOffX = 0;
let _cardDragOffY = 0;

_entityCard?.addEventListener("pointerdown", (e) => {
  // Only drag from title bar area (top 36px)
  const rect = _entityCard.getBoundingClientRect();
  if (e.clientY - rect.top > 36) return;
  _cardDragging = true;
  _cardDragOffX = e.clientX - rect.left;
  _cardDragOffY = e.clientY - rect.top;
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener("pointermove", (e) => {
  if (!_cardDragging || !_entityCard) return;
  _entityCard.style.left = (e.clientX - _cardDragOffX) + "px";
  _entityCard.style.top = (e.clientY - _cardDragOffY) + "px";
});

window.addEventListener("pointerup", () => {
  _cardDragging = false;
});

function _hideEntityCard() {
  if (_entityCard) _entityCard.style.display = "none";
  if (_selectedEntityType === "satellite") disposeOrbitLine();
  if (_selectedEntityType === "aircraft") _disposeAircraftRoute();
  if (_selectedEntityType === "ship") disposeShipRoute();
  _selectedEntityType = null;
  _selectedEntityIndex = -1;
}

function _disposeAircraftRoute() {
  if (_aircraftRouteLine) {
    scene.remove(_aircraftRouteLine);
    _aircraftRouteLine.geometry?.dispose();
    _aircraftRouteLine.material?.dispose();
    _aircraftRouteLine = null;
  }
  for (const m of _aircraftAirportMarkers) {
    scene.remove(m);
    m.geometry?.dispose();
    if (m.material) {
      m.material.map?.dispose();
      m.material.dispose();
    }
  }
  _aircraftAirportMarkers = [];
}

/** Convert lat/lon/altM to world-space Vector3 (applies globeGroup transform). */
function _routeLatLonToWorld(lat, lon, altM = 0) {
  const altKm = altM / 1000;
  const r = GLOBE_RADIUS * (1 + altKm / 6371);
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    -(r * sinPhi * Math.cos(theta)),
    r * Math.cos(phi),
    r * sinPhi * Math.sin(theta)
  ).applyMatrix4(globeGroup.matrixWorld);
}

/** Generate great-circle arc from (lat1,lon1) to (lat2,lon2) at altM, numPts steps. */
function _greatCircleArc(lat1, lon1, lat2, lon2, altM, numPts = 80) {
  const toR = THREE.MathUtils.degToRad;
  const toDeg = THREE.MathUtils.radToDeg;
  const la1 = toR(lat1), lo1 = toR(lon1);
  const la2 = toR(lat2), lo2 = toR(lon2);
  const d = Math.acos(Math.max(-1, Math.min(1,
    Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(lo2 - lo1)
  )));
  const points = [];
  for (let i = 0; i <= numPts; i++) {
    const f = i / numPts;
    if (d < 1e-6) {
      points.push(_routeLatLonToWorld(lat1, lon1, altM));
      continue;
    }
    const sinD = Math.sin(d);
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));
    points.push(_routeLatLonToWorld(lat, lon, altM));
  }
  return points;
}

/** Create a small dot + label sprite at an airport position. */
function _addAirportMarker(lat, lon, label) {
  // Dot at surface
  const dotGeo = new THREE.SphereGeometry(0.022, 8, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthWrite: false });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.copy(_routeLatLonToWorld(lat, lon, 8000));
  scene.add(dot);
  _aircraftAirportMarkers.push(dot);

  // Label sprite
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 56;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.beginPath();
  ctx.roundRect(0, 0, 320, 56, 8);
  ctx.fill();
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 160, 36);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(_routeLatLonToWorld(lat, lon, 120000));
  sprite.scale.set(0.65, 0.12, 1);
  scene.add(sprite);
  _aircraftAirportMarkers.push(sprite);
}

/** Draw a route line from the given world-space points array. Caller must have called _disposeAircraftRoute first. */
function _drawRouteLine(points, color = 0x00ffcc, opacity = 0.85) {
  if (!points || points.length < 2) return;
  const positions = [];
  for (const p of points) positions.push(p.x, p.y, p.z);
  const geo = new LineGeometry();
  geo.setPositions(positions);
  const mat = new LineMaterial({
    color,
    linewidth: 3,
    transparent: true,
    opacity,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });
  _aircraftRouteLine = new Line2(geo, mat);
  _aircraftRouteLine.computeLineDistances();
  scene.add(_aircraftRouteLine);
}

function _showAircraftRoute(instanceIndex, realRoute = null) {
  _disposeAircraftRoute();

  if (realRoute) {
    const { depLat, depLon, depName, arrLat, arrLon, arrName, altM } = realRoute;
    const points = _greatCircleArc(depLat, depLon, arrLat, arrLon, altM ?? 10000);
    _drawRouteLine(points, 0x00ffcc, 0.85);
    _addAirportMarker(depLat, depLon, depName);
    _addAirportMarker(arrLat, arrLon, arrName);
    return;
  }

  // Fallback: projected great-circle in current heading direction
  const points = getAircraftProjectedRoute(instanceIndex);
  _drawRouteLine(points, 0x00ffcc, 0.6);
}

function _showEntityCard(screenX, screenY) {
  if (!_entityCard) return;
  _entityCard.style.display = "";
  // Position near click, clamped to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = screenX + 15;
  let y = screenY - 20;
  if (x + 280 > vw) x = screenX - 290;
  if (y + 200 > vh) y = vh - 210;
  if (y < 10) y = 10;
  _entityCard.style.left = x + "px";
  _entityCard.style.top = y + "px";
}

function _cardRow(label, value) {
  return `<span class="label">${label}</span><span class="value">${value}</span>`;
}

function _showAircraftCard(data, screenX, screenY) {
  _selectedEntityType = "aircraft";
  const name = data.callsign || data.icao24;
  _entityCardTitle.textContent = name;
  _entityCardSubtitle.textContent = `${data.originCountry} · ICAO ${data.icao24.toUpperCase()}`;
  const altFt = data.baroAltitude != null ? Math.round(data.baroAltitude * 3.281) : "—";
  const altM = data.baroAltitude != null ? Math.round(data.baroAltitude) : "—";
  const spdKts = data.velocity != null ? Math.round(data.velocity * 1.944) : "—";
  const vr = data.verticalRate != null ? (data.verticalRate > 0 ? "+" : "") + Math.round(data.verticalRate) + " m/s" : "—";
  const hdg = data.trueTrack != null ? Math.round(data.trueTrack) + "°" : "—";
  const sqk = data.squawk ?? "—";
  _entityCardBody.innerHTML = [
    _cardRow("ALT", `${altM} m / ${altFt} ft`),
    _cardRow("SPD", `${spdKts} kts`),
    _cardRow("HDG", hdg),
    _cardRow("V/S", vr),
    _cardRow("SQWK", sqk),
    _cardRow("POS", `${data.lat?.toFixed(3)}, ${data.lon?.toFixed(3)}`),
  ].join("");
  _showEntityCard(screenX, screenY);

  // Show projected route line initially (updated to real route once adsbdb responds)
  _showAircraftRoute(_selectedEntityIndex);

  const fetchId = ++_hexdbFetchId;
  const adsbId = ++_adsbdbFetchId;
  const icao = data.icao24;
  const callsign = data.callsign?.trim();

  // Async fetch aircraft type + photo from hexdb.io
  (async () => {
    try {
      const [typeResp, imgResp] = await Promise.all([
        _hexdbLimiter.fetch(`https://hexdb.io/hex-type?hex=${icao}`),
        _hexdbLimiter.fetch(`https://hexdb.io/hex-image-thumb?hex=${icao}`),
      ]);
      if (fetchId !== _hexdbFetchId) return; // stale
      const typeText = typeResp.ok ? (await typeResp.text()).trim() : "";
      const imgUrl = imgResp.ok ? (await imgResp.text()).trim() : "";
      if (fetchId !== _hexdbFetchId) return;
      if (typeText) {
        _entityCardBody.innerHTML += _cardRow(t("aircraft.type"), typeText);
      }
      if (imgUrl && imgUrl.startsWith("http")) {
        _entityCardBody.innerHTML += `<img src="${imgUrl}" alt="${icao}" style="width:100%;border-radius:6px;margin-top:6px;" />`;
      }
    } catch { /* hexdb.io unavailable — graceful degradation */ }
  })();

  // Async fetch real route from adsbdb.com
  if (callsign) {
    (async () => {
      try {
        const resp = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`);
        if (adsbId !== _adsbdbFetchId) return; // stale
        if (!resp.ok) return;
        const json = await resp.json();
        if (adsbId !== _adsbdbFetchId) return;
        const route = json?.response?.flightroute;
        if (!route) return;
        const dep = route.origin;
        const arr = route.destination;
        if (!dep?.latitude || !dep?.longitude || !arr?.latitude || !arr?.longitude) return;
        const depLat = parseFloat(dep.latitude);
        const depLon = parseFloat(dep.longitude);
        const arrLat = parseFloat(arr.latitude);
        const arrLon = parseFloat(arr.longitude);
        if (isNaN(depLat) || isNaN(depLon) || isNaN(arrLat) || isNaN(arrLon)) return;
        const depName = `${dep.iata_code ?? dep.icao_code ?? ""} ${dep.municipality ?? ""}`.trim();
        const arrName = `${arr.iata_code ?? arr.icao_code ?? ""} ${arr.municipality ?? ""}`.trim();
        // Update card with airport info
        _entityCardBody.innerHTML =
          _cardRow("FROM", depName || dep.name) +
          _cardRow("TO", arrName || arr.name) +
          _entityCardBody.innerHTML;
        // Replace projected route with real departure→arrival great-circle
        _showAircraftRoute(_selectedEntityIndex, {
          depLat, depLon, depName: depName || dep.name,
          arrLat, arrLon, arrName: arrName || arr.name,
          altM: data.baroAltitude ?? 10000,
        });
      } catch { /* adsbdb.com unavailable — keep projected route */ }
    })();
  }
}

function _showSatelliteCard(data, screenX, screenY) {
  _selectedEntityType = "satellite";
  _entityCardTitle.textContent = data.name;
  _entityCardSubtitle.textContent = `NORAD ${data.noradId ?? "—"} · ${data.orbitType}${data.isISS ? " · ISS" : ""}`;
  const altStr = data.altitude != null ? `${Math.round(data.altitude)} km` : "—";
  const velStr = data.velocityKmS != null ? `${data.velocityKmS.toFixed(1)} km/s` : "—";
  const perStr = data.periodMin != null ? `${Math.round(data.periodMin)} min` : "—";
  const incStr = data.inclinationDeg != null ? `${data.inclinationDeg.toFixed(1)}°` : "—";
  const posStr = data.lat != null ? `${data.lat.toFixed(2)}, ${data.lon.toFixed(2)}` : "—";
  const epochStr = data.epochYear != null ? `${data.epochYear}` : "—";
  _entityCardBody.innerHTML = [
    _cardRow("ALT", altStr),
    _cardRow("VEL", velStr),
    _cardRow("PERIODO", perStr),
    _cardRow("INCL", incStr),
    _cardRow("POS", posStr),
    _cardRow("EPOCA TLE", epochStr),
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showShipCard(data, screenX, screenY) {
  _selectedEntityType = "ship";
  _entityCardTitle.textContent = (data.flag ? data.flag + " " : "") + (data.name || `MMSI ${data.mmsi}`);
  _entityCardSubtitle.textContent = data.lane ? `${data.lane}` : `MMSI ${data.mmsi}`;
  const sogStr = data.sog != null ? `${data.sog.toFixed(1)} kts` : "—";
  const cogStr = data.cog != null ? `${Math.round(data.cog)}°` : "—";
  const posStr = data.lat != null ? `${data.lat.toFixed(3)}, ${data.lon.toFixed(3)}` : "—";
  _entityCardBody.innerHTML = [
    _cardRow("SOG", sogStr),
    _cardRow("COG", cogStr),
    _cardRow("POS", posStr),
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showEconomyCard(data, screenX, screenY) {
  _selectedEntityType = "economy";
  _entityCardTitle.textContent = `${data.flag} ${data.name}`;
  _entityCardSubtitle.textContent = data.code;
  _entityCardBody.innerHTML = [
    _cardRow("PIB totale", `$${(data.gdpB / 1000).toFixed(1)}T`),
    _cardRow("PIB pro capite", `$${data.gdpPcUSD.toLocaleString()}`),
    _cardRow("Quota mondiale", `${data.worldSharePct.toFixed(2)}%`),
    _cardRow("Crescita PIL", `${data.gdpGrowthPct > 0 ? "+" : ""}${data.gdpGrowthPct.toFixed(1)}%`),
    _cardRow("Export", `$${data.exportB}B`),
    _cardRow("Import", `$${data.importB}B`),
    _cardRow("Bilancia", `$${(data.exportB - data.importB).toFixed(0)}B`),
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showAnthropologyCard(data, screenX, screenY) {
  _selectedEntityType = "anthropology";
  _entityCardTitle.textContent = `${data.flag} ${data.name}`;
  _entityCardSubtitle.textContent = data.code;
  _entityCardBody.innerHTML = [
    _cardRow("Popolazione", `${data.popM.toFixed(1)}M`),
    _cardRow("Tasso natalità", `${data.birthRate.toFixed(1)}/1000`),
    _cardRow("Maschi / Femmine", `${data.malePct.toFixed(1)}% / ${data.femalePct.toFixed(1)}%`),
    _cardRow("Età mediana", `${data.medianAge.toFixed(1)} anni`),
    _cardRow("0–14 anni", `${data.u14pct.toFixed(1)}%`),
    _cardRow("15–64 anni", `${data.mid1564pct.toFixed(1)}%`),
    _cardRow("65+ anni", `${data.plus65pct.toFixed(1)}%`),
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showVolcanoCard(data, screenX, screenY) {
  _selectedEntityType = "volcano";
  const statusColor = VOLCANO_STATUS_COLORS[data.status] ?? 0xffffff;
  const hexColor    = "#" + statusColor.toString(16).padStart(6, "0");
  _entityCardTitle.textContent  = `🌋 ${data.name}`;
  _entityCardSubtitle.innerHTML = `${data.country} &nbsp;·&nbsp; <span style="color:${hexColor}">● ${data.status}</span>`;
  const veiStr = data.vei > 0 ? `VEI ${data.vei}` : "—";
  const elStr  = data.elevation > 0 ? `${data.elevation.toLocaleString()} m` : `${Math.abs(data.elevation)} m (sottomarino)`;
  _entityCardBody.innerHTML = [
    _cardRow("Tipo",         data.type),
    _cardRow("Quota",        elStr),
    _cardRow("Ultima erupt.", data.lastErupt),
    _cardRow("VEI max",      veiStr),
    _cardRow("Pos.",         `${data.lat.toFixed(2)}, ${data.lon.toFixed(2)}`),
  ].join("") + `<p style="margin:8px 0 0;font-size:11px;opacity:0.85;grid-column:1/-1">${data.description}</p>`;
  _showEntityCard(screenX, screenY);
}

function _showMineralCard(data, screenX, screenY) {
  _selectedEntityType = "mineral";
  _entityCardTitle.textContent    = data.name;
  _entityCardSubtitle.textContent = `${data.category} · ${data.country}`;
  const sizeLabel = { major:"Principale", significant:"Significativo", minor:"Minore" }[data.size] ?? data.size;
  _entityCardBody.innerHTML = [
    _cardRow("Minerale / Elemento", data.label),
    _cardRow("Dimensione",           sizeLabel),
    _cardRow("Posizione",            `${data.lat.toFixed(2)}, ${data.lon.toFixed(2)}`),
  ].join("") + `<p style="margin:8px 0 0;font-size:11px;opacity:0.85;grid-column:1/-1">${data.notes}</p>`;
  _showEntityCard(screenX, screenY);
}

function _showEnergyCard(data, screenX, screenY) {
  _selectedEntityType = "energy";
  _entityCardTitle.textContent    = `${data.flag} ${data.name}`;
  const twhStr = data.twh != null ? `${data.twh.toLocaleString("it-IT")} TWh/anno` : "Nessun dato";
  _entityCardSubtitle.textContent = `${data.code} · ${data.domLabel} · ${twhStr}`;
  const sorted = Object.entries(data.breakdown)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0);
  _entityCardBody.innerHTML = sorted.map(([key, pct]) => {
    const src = ENERGY_SOURCES[key];
    const col = src?.color ?? "#888";
    return `<span class="label" style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:${col};display:inline-block"></span>${src?.label ?? key}</span><span class="value">${pct.toFixed(1)}%</span>`;
  }).join("");
  _showEntityCard(screenX, screenY);
}

function _showDeforestationCard(data, screenX, screenY) {
  _selectedEntityType = "deforestation";
  _entityCardTitle.textContent    = `${data.flag} ${data.name}`;
  const loss = data.annualLossKha > 0 ? `${data.annualLossKha.toLocaleString("it-IT")} kha/anno` : "Dati non disp.";
  _entityCardSubtitle.textContent = `${data.code} · ${data.causeLabel} · ${loss}`;
  _entityCardBody.innerHTML = [
    `<span class="label">Copertura forestale</span><span class="value">${data.forestPct.toFixed(1)}%</span>`,
    `<span class="label">Copertura storica</span><span class="value">${data.peakPct.toFixed(1)}%</span>`,
    `<span class="label">Perdita relativa</span><span class="value">${((data.peakPct - data.forestPct) / Math.max(data.peakPct, 1) * 100).toFixed(1)}%</span>`,
    `<span class="label">Tendenza</span><span class="value" style="color:${data.trendColor}">${data.trendLabel}</span>`,
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showDesertificationCard(data, screenX, screenY) {
  _selectedEntityType = "desertification";
  _entityCardTitle.textContent    = `${data.flag} ${data.name}`;
  _entityCardSubtitle.textContent = `${data.code} · ${data.riskLabel}`;
  _entityCardBody.innerHTML = [
    `<span class="label">Livello rischio</span><span class="value" style="color:${data.riskColor}">${data.riskLevel}/4</span>`,
    `<span class="label">Superficie arida</span><span class="value">${data.drylandPct.toFixed(0)}%</span>`,
    `<span class="label">Area degradata</span><span class="value">${data.degradedPct.toFixed(0)}%</span>`,
  ].join("");
  _showEntityCard(screenX, screenY);
}

function _showWarmingCard(data, screenX, screenY) {
  _selectedEntityType = "warming";
  _entityCardTitle.textContent    = `${data.flag} ${data.name}`;
  const sign = data.anomaly >= 0 ? "+" : "";
  _entityCardSubtitle.textContent = `${data.code} · ${data.year} · Anomalia ${sign}${data.anomaly.toFixed(2)}°C`;
  _entityCardBody.innerHTML = `<span class="label">vs. baseline 1950–80</span><span class="value">${sign}${data.anomaly.toFixed(2)} °C</span>`;
  _showEntityCard(screenX, screenY);
}

function _showReligionCard(data, screenX, screenY) {
  _selectedEntityType = "religion";
  _entityCardTitle.textContent    = `${data.flag} ${data.name}`;
  _entityCardSubtitle.textContent = `${data.code} · Religione prevalente: ${data.domLabel}`;
  // Sort breakdown by percentage descending
  const sorted = Object.entries(data.breakdown)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0);
  _entityCardBody.innerHTML = sorted.map(([key, pct]) => {
    const meta = RELIGION_META[key];
    const hexCol = "#" + ((meta?.color ?? 0xaabbcc).toString(16).padStart(6, "0"));
    return `<span class="label" style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:${hexCol};display:inline-block"></span>${meta?.label ?? key}</span><span class="value">${pct.toFixed(1)}%</span>`;
  }).join("");
  _showEntityCard(screenX, screenY);
}

animate();

// Event listeners
window.addEventListener("resize", handleResize);
renderer.domElement.addEventListener("pointerdown", handlePointerDown);
renderer.domElement.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp);

// Data zoom: intercept scroll when camera is at surface stop
// Runs in capture phase so it fires before OrbitControls' wheel handler
renderer.domElement.addEventListener("wheel", (e) => {
  const camDist = camera.position.distanceTo(globeGroup.position);
  const atSurface = camDist <= controls.minDistance + 0.04;
  if (!atSurface) return; // let OrbitControls handle normal zoom
  const zoomIn = e.deltaY < 0;
  if (zoomIn) {
    // Scroll in at surface → increase tile detail, block camera move
    addDataZoom(1);
    e.stopImmediatePropagation();
    e.preventDefault();
  } else if (getDataZoom() > 0) {
    // Scroll out with data zoom → reduce detail first, block camera move
    addDataZoom(-1);
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  // else: scroll out with no data zoom → let OrbitControls move camera away
}, { capture: true, passive: false });
// ── Camera controller: keyboard ──
window.addEventListener("keydown", (e) => {
  // Skip when typing in form fields
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const action = _CAM_KEY_MAP[e.key];
  if (action) {
    e.preventDefault();
    _cancelCompassReset();
    _activeInputs.add(action);
  }
});
window.addEventListener("keyup", (e) => {
  const action = _CAM_KEY_MAP[e.key];
  if (action) _activeInputs.delete(action);
});
// Clear all keys on blur (tab switch, window focus loss)
window.addEventListener("blur", () => _activeInputs.clear());

// ── Camera controller: on-screen buttons ──
for (const btn of document.querySelectorAll("#camera-controls .cam-btn")) {
  const action = btn.dataset.action;
  if (!action) continue;
  const start = () => { _activeInputs.add(action); btn.classList.add("pressed"); };
  const stop  = () => { _activeInputs.delete(action); btn.classList.remove("pressed"); };
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); start(); });
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  // Prevent context menu on long press (mobile)
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

document.getElementById("compass")?.addEventListener("click", () => {
  // Reset earth rotation and orient north upward — do NOT move camera position
  _userRotQuat.identity();
  _compassResetting = true;
  _compassResetTarget = { up: new THREE.Vector3(0, 1, 0) };
});

// ── Screenshot mode ──
document.getElementById("screenshot-enter")?.addEventListener("click", () => {
  document.body.classList.add("screenshot-mode");
});

document.getElementById("screenshot-exit")?.addEventListener("click", () => {
  document.body.classList.remove("screenshot-mode");
});

document.getElementById("screenshot-capture")?.addEventListener("click", () => {
  // Hide toolbar briefly for clean capture
  const toolbar = document.getElementById("screenshot-toolbar");
  toolbar.style.visibility = "hidden";
  requestAnimationFrame(() => {
    // Must render immediately before toDataURL (preserveDrawingBuffer is false)
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    toolbar.style.visibility = "";
    // Download
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `TerraCast_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
});

dom.locateMeButton.addEventListener("click", () => requestCurrentLocationSelection(true));
dom.searchForm.addEventListener("submit", handleSearchSubmit);

// Populate provider select dynamically from PROVIDERS so new entries are always visible
Object.values(PROVIDERS).forEach((provider) => {
  const option = document.createElement("option");
  option.value = provider.id;
  option.textContent = provider.name;
  dom.providerSelect.appendChild(option);
});
dom.providerSelect.value = loadStoredProviderId();
dom.providerSelect.addEventListener("change", handleProviderChange);
dom.providerSaveButton.addEventListener("click", handleProviderSave);
dom.toggleMarkersButton.addEventListener("click", handleToggleMarkers);
dom.toggleTerminatorButton.addEventListener("click", handleToggleTerminator);
dom.toggleTiltSimpleButton?.addEventListener("click", handleToggleTiltSimple);
dom.toggleTiltSeasonalButton?.addEventListener("click", handleToggleTiltSeasonal);
dom.toggleTimeZonesButton?.addEventListener("click", handleToggleTimeZones);
dom.toggleEarthInteriorButton?.addEventListener("click", handleToggleEarthInterior);

dom.toggleEmFieldButton?.addEventListener("click", () => {
  weatherState.showEmField = !weatherState.showEmField;
  if (weatherState.showEmField) {
    enableEmField();
  } else {
    disableEmField();
  }
  dom.toggleEmFieldButton.classList.toggle("active", weatherState.showEmField);
  updateToggleButtons();
  updateLegend();
});

dom.toggleWaterBodiesButton?.addEventListener("click", async () => {
  weatherState.showWaterBodies = !weatherState.showWaterBodies;
  if (weatherState.showWaterBodies) {
    showSnackbar(t("status.waterBodiesLoading"));
    const ok = await buildWaterBodiesCanvas();
    if (ok) {
      waterBodiesMesh.visible = true;
      showSnackbar(t("status.waterBodiesLoaded"));
    } else {
      weatherState.showWaterBodies = false;
      showSnackbar(t("status.waterBodiesError"));
    }
  } else {
    waterBodiesMesh.visible = false;
  }
  dom.toggleWaterBodiesButton.classList.toggle("active", weatherState.showWaterBodies);
  dom.toggleWaterBodiesButton.textContent = t(weatherState.showWaterBodies ? "btn.hideWaterBodies" : "btn.waterBodies");
});

// Per-layer visibility toggles (earth interior)
document.querySelectorAll("#earth-layer-toggles .layer-toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const idx = parseInt(btn.dataset.layer, 10);
    btn.classList.toggle("active");
    toggleLayerVisibility(idx, btn.classList.contains("active"));
  });
});

// Sidebar toggle
dom.sidebarToggle.addEventListener("click", () => {
  weatherState.rightSidebarOpen = !weatherState.rightSidebarOpen;
  dom.rightSidebar.classList.toggle("collapsed", !weatherState.rightSidebarOpen);
  updateGlobeCenter();
});

// Left sidebar toggle
dom.leftSidebarToggle?.addEventListener("click", () => {
  weatherState.leftSidebarOpen = !weatherState.leftSidebarOpen;
  document.querySelector(".hud").classList.toggle("collapsed", !weatherState.leftSidebarOpen);
  dom.leftSidebarToggle.classList.toggle("collapsed", !weatherState.leftSidebarOpen);
  updateGlobeCenter();
});

// Cloud 3-state switch
document.querySelectorAll("#cloud-switch .cloud-option").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.cloud;
    weatherState.cloudMode = mode;
    clouds.visible = mode === "aesthetic";
    cloudCoverMesh.visible = mode === "real";

    if (mode === "real") {
      // Load actual satellite cloud imagery from NASA GIBS
      setStatus(t("status.satelliteLoading"));
      loadSatelliteCloudTexture()
        .then(({ date, sources, providers, syncWindowMinutes }) => {
          const detail = [];
          if (sources > 1) detail.push(`${sources} sorgenti`);
          if (providers > 1) detail.push(`${providers} provider`);
          if (syncWindowMinutes) detail.push(`sync ±${syncWindowMinutes}m`);
          setStatus(t("status.satelliteLoaded", { date, nrt: detail.length ? ` · ${detail.join(" · ")}` : "" }));
        })
        .catch(() => {
          // Fallback: IDW interpolation from weather data
          setStatus(t("status.satelliteError"));
          setTimeout(() => buildCloudCanvas(weatherState.points), 0);
        });
    }

    document.querySelectorAll("#cloud-switch .cloud-option").forEach(b => {
      b.classList.toggle("active", b.dataset.cloud === mode);
    });
  });
});

// Heatmap toggle
dom.toggleHeatmapButton?.addEventListener("click", () => {
  weatherState.showHeatmap = !weatherState.showHeatmap;
  heatmapMesh.visible = weatherState.showHeatmap;
  if (weatherState.showHeatmap) {
    setTimeout(() => buildHeatmapCanvas(weatherState.points), 0);
  }
  dom.toggleHeatmapButton.classList.toggle("active", weatherState.showHeatmap);
  updateToggleButtons();
  updateLegend();
});

// Wind altitude levels mapping (slider index → param key)
// All possible levels — the slider will only show levels with real data
const ALL_WIND_LEVELS = [
  "10m",
  "1000hPa","925hPa","850hPa","700hPa","600hPa","500hPa","400hPa",
  "300hPa","250hPa","200hPa","150hPa","100hPa","70hPa","50hPa",
  "30hPa","20hPa","10hPa",
  "5hPa","1hPa","0.4hPa","0.1hPa","0.01hPa"
];

// Currently active (filtered) levels for the slider — rebuilt when data updates
let _activeWindLevels = ["10m"];

// Approximate altitudes in km for each level
const WIND_LEVEL_ALT_KM = {
  "10m": "~0 km",
  "1000hPa": "~0.1 km",  "925hPa": "~0.8 km",  "850hPa": "~1.5 km",
  "700hPa": "~3 km",     "600hPa": "~4.2 km",   "500hPa": "~5.5 km",
  "400hPa": "~7.2 km",   "300hPa": "~9.2 km",   "250hPa": "~10.4 km",
  "200hPa": "~11.8 km",  "150hPa": "~13.5 km",  "100hPa": "~16 km",
  "70hPa": "~18.5 km",   "50hPa": "~20.5 km",   "30hPa": "~24 km",
  "20hPa": "~26 km",     "10hPa": "~31 km",     "5hPa": "~36 km",
  "1hPa": "~48 km",      "0.4hPa": "~55 km",    "0.1hPa": "~65 km",
  "0.01hPa": "~80 km"
};

/** Sync the wind slider max/labels to match only levels that have real data. */
function _syncWindSlider() {
  const available = getAvailableLevels();
  // Filter ALL_WIND_LEVELS preserving order, keeping only those with data
  _activeWindLevels = ALL_WIND_LEVELS.filter(l => available.has(l));
  if (_activeWindLevels.length === 0) _activeWindLevels = ["10m"];

  if (dom.windAltRange) {
    dom.windAltRange.max = String(_activeWindLevels.length - 1);
    // Clamp current value
    const cur = parseInt(dom.windAltRange.value, 10);
    if (cur >= _activeWindLevels.length) {
      dom.windAltRange.value = "0";
      weatherState.windAltitudeLevel = _activeWindLevels[0];
    }
    // If current level is no longer available, reset to 10m
    if (!available.has(weatherState.windAltitudeLevel)) {
      dom.windAltRange.value = "0";
      weatherState.windAltitudeLevel = _activeWindLevels[0];
    }
  }
  _updateWindAltLabel();
}

function _updateWindAltLabel() {
  const idx = parseInt(dom.windAltRange?.value ?? "0", 10);
  const lvl = _activeWindLevels[idx] ?? "10m";
  const alt = WIND_LEVEL_ALT_KM[lvl] ?? "";
  if (dom.windAltValue) dom.windAltValue.textContent = `${lvl} ${alt}`;
}

// Wind altitude slider change
dom.windAltRange?.addEventListener("input", () => {
  const idx = parseInt(dom.windAltRange.value, 10);
  const lvl = _activeWindLevels[idx] ?? "10m";
  weatherState.windAltitudeLevel = lvl;
  _updateWindAltLabel();
  buildWindField(weatherState.points, lvl);
});

// Wind toggle
dom.toggleWindButton?.addEventListener("click", () => {
  weatherState.showWind = !weatherState.showWind;
  windParticles.visible = weatherState.showWind;
  setWindTrailsVisible(weatherState.showWind);
  // Show/hide altitude slider
  if (dom.windAltitudeSlider) {
    dom.windAltitudeSlider.style.display = weatherState.showWind ? "" : "none";
  }
  if (weatherState.showWind) {
    // Rebuild field on demand if no data yet
    if (isWindFieldEmpty()) {
      buildWindField(weatherState.points, weatherState.windAltitudeLevel);
    }
    // Sync slider to show only levels with data
    _syncWindSlider();
  }
  dom.toggleWindButton.classList.toggle("active", weatherState.showWind);
  updateToggleButtons();
  updateLegend();
});

// Precipitation toggle — tries RainViewer first, falls back to Gaussian blobs
dom.togglePrecipitationButton?.addEventListener("click", async () => {
  weatherState.showPrecipitation = !weatherState.showPrecipitation;
  precipMesh.visible = weatherState.showPrecipitation;

  if (weatherState.showPrecipitation) {
    setStatus(t("status.radarLoading"));
    const result = await fetchAndApplyRainViewer();
    if (result) {
      weatherState.useRainViewer = true;
      setStatus(t("status.radarLoaded", { age: result.ageMinutes }));
      startRainViewerRefresh(
        ({ ageMinutes }) => setStatus(t("status.radarLoaded", { age: ageMinutes })),
        () => setStatus(t("status.radarError"))
      );
    } else {
      // RainViewer + IMERG unavailable — fall back to Gaussian blobs from station data
      weatherState.useRainViewer = false;
      setStatus(t("status.radarError"));
      const hadData = buildPrecipitationCanvas(weatherState.points);
      if (!hadData) setStatus(t("status.noPrecipitation"));
    }
  } else {
    weatherState.useRainViewer = false;
    stopRainViewerRefresh();
  }

  dom.togglePrecipitationButton.classList.toggle("active", weatherState.showPrecipitation);
  updateToggleButtons();
  updateLegend();
});

// Lightning toggle
document.getElementById("toggle-lightning-button")?.addEventListener("click", () => {
  weatherState.showLightning = !weatherState.showLightning;
  lightningMesh.visible = weatherState.showLightning;
  if (weatherState.showLightning) {
    buildLightningField(weatherState.points);
  } else {
    disableLightning();
  }
  const btn = document.getElementById("toggle-lightning-button");
  btn?.classList.toggle("active", weatherState.showLightning);
  if (btn) btn.textContent = t(weatherState.showLightning ? "btn.hideLightning" : "btn.lightning");
});

// Satellite toggle
document.getElementById("toggle-satellites-button")?.addEventListener("click", () => {
  weatherState.showSatellites = !weatherState.showSatellites;
  if (weatherState.showSatellites) {
    enableSatellites();
    setSkyDimming(0.15); // dim stars so satellites stand out
  } else {
    disableSatellites();
    setSkyDimming(1.0); // restore stars
  }
  const btn = document.getElementById("toggle-satellites-button");
  btn?.classList.toggle("active", weatherState.showSatellites);
  if (btn) btn.textContent = t(weatherState.showSatellites ? "btn.hideSatellites" : "btn.satellites");
  const satFilters = document.getElementById("satellite-filters");
  if (satFilters) satFilters.style.display = weatherState.showSatellites ? "" : "none";
});

// Satellite filter chips
document.querySelectorAll("#satellite-filters .filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.filter;
    weatherState.satelliteFilters[key] = !weatherState.satelliteFilters[key];
    chip.classList.toggle("active", weatherState.satelliteFilters[key]);
  });
});

// Aircraft toggle
document.getElementById("toggle-aircraft-button")?.addEventListener("click", () => {
  weatherState.showAircraft = !weatherState.showAircraft;
  if (weatherState.showAircraft) {
    enableAircraft();
  } else {
    disableAircraft();
  }
  const btn = document.getElementById("toggle-aircraft-button");
  btn?.classList.toggle("active", weatherState.showAircraft);
  if (btn) btn.textContent = t(weatherState.showAircraft ? "btn.hideAircraft" : "btn.aircraft");
  const acFilters = document.getElementById("aircraft-filters");
  if (acFilters) acFilters.style.display = weatherState.showAircraft ? "" : "none";
});

// Aircraft filter chips
document.querySelectorAll("#aircraft-filters .filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.filter;
    weatherState.aircraftFilters[key] = !weatherState.aircraftFilters[key];
    chip.classList.toggle("active", weatherState.aircraftFilters[key]);
  });
});

// Ship toggle
document.getElementById("toggle-ships-button")?.addEventListener("click", () => {
  weatherState.showShips = !weatherState.showShips;
  if (weatherState.showShips) {
    enableShips();
    showSnackbar(t("status.shipsConnected"));
  } else {
    disableShips();
  }
  const btn = document.getElementById("toggle-ships-button");
  btn?.classList.toggle("active", weatherState.showShips);
  if (btn) btn.textContent = t(weatherState.showShips ? "btn.hideShips" : "btn.ships");
});

// Traffic toggle
document.getElementById("toggle-traffic-button")?.addEventListener("click", () => {
  weatherState.showTraffic = !weatherState.showTraffic;
  if (weatherState.showTraffic) {
    showSnackbar(t("status.trafficLoading"));
    enableTraffic();
  } else {
    disableTraffic();
  }
  const btn = document.getElementById("toggle-traffic-button");
  btn?.classList.toggle("active", weatherState.showTraffic);
  if (btn) btn.textContent = t(weatherState.showTraffic ? "btn.hideTraffic" : "btn.traffic");
});

// Economy toggle
document.getElementById("toggle-economy-button")?.addEventListener("click", () => {
  weatherState.showEconomy = !weatherState.showEconomy;
  if (weatherState.showEconomy) {
    enableEconomy();
  } else {
    disableEconomy();
  }
  const btn = document.getElementById("toggle-economy-button");
  btn?.classList.toggle("active", weatherState.showEconomy);
  if (btn) btn.textContent = t(weatherState.showEconomy ? "btn.hideEconomy" : "btn.economy");
  const filters = document.getElementById("economy-filters");
  if (filters) filters.style.display = weatherState.showEconomy ? "flex" : "none";
});

document.getElementById("economy-filters")?.addEventListener("click", (e) => {
  const metric = e.target.dataset.ecoMetric;
  if (!metric) return;
  setEconomyMetric(metric);
  document.querySelectorAll("#economy-filters .filter-chip").forEach(b => b.classList.toggle("active", b.dataset.ecoMetric === metric));
});

// Anthropology toggle
document.getElementById("toggle-anthropology-button")?.addEventListener("click", () => {
  weatherState.showAnthropology = !weatherState.showAnthropology;
  if (weatherState.showAnthropology) {
    enableAnthropology();
  } else {
    disableAnthropology();
  }
  const btn = document.getElementById("toggle-anthropology-button");
  btn?.classList.toggle("active", weatherState.showAnthropology);
  if (btn) btn.textContent = t(weatherState.showAnthropology ? "btn.hideAnthropology" : "btn.anthropology");
  const filters = document.getElementById("anthropology-filters");
  if (filters) filters.style.display = weatherState.showAnthropology ? "flex" : "none";
});

document.getElementById("anthropology-filters")?.addEventListener("click", (e) => {
  const metric = e.target.dataset.anthroMetric;
  if (!metric) return;
  setAnthroMetric(metric);
  document.querySelectorAll("#anthropology-filters .filter-chip").forEach(b => b.classList.toggle("active", b.dataset.anthroMetric === metric));
});

// ── Tectonic toggle ─────────────────────────────────────────────────────────
document.getElementById("toggle-tectonic-button")?.addEventListener("click", async () => {
  weatherState.showTectonic = !weatherState.showTectonic;
  const btn    = document.getElementById("toggle-tectonic-button");
  const legend = document.getElementById("tectonic-legend");
  if (weatherState.showTectonic) {
    if (btn) btn.textContent = "Caricamento faglie…";
    showSnackbar("Caricamento faglie tettoniche…");
    const ok = await enableTectonic();
    if (!ok) {
      weatherState.showTectonic = false;
      showSnackbar("Errore caricamento faglie tettoniche", "error");
      if (btn) btn.textContent = "Faglie tettoniche";
      btn?.classList.remove("active");
      return;
    }
    if (btn) btn.textContent = "Nascondi faglie";
    showSnackbar("Faglie tettoniche caricate");
  } else {
    disableTectonic();
    if (btn) btn.textContent = "Faglie tettoniche";
  }
  btn?.classList.toggle("active", weatherState.showTectonic);
  if (legend) legend.style.display = weatherState.showTectonic ? "" : "none";
});

document.getElementById("tectonic-legend")?.addEventListener("click", (e) => {
  const type = e.target.dataset.tectonicType;
  if (!type) return;
  const nowActive = !getTectonicFilter(type);
  setTectonicFilter(type, nowActive);
  e.target.classList.toggle("active", nowActive);
});

// ── Volcanoes toggle ──────────────────────────────────────────────────────
document.getElementById("toggle-volcanoes-button")?.addEventListener("click", () => {
  weatherState.showVolcanoes = !weatherState.showVolcanoes;
  if (weatherState.showVolcanoes) {
    enableVolcanoes();
    showSnackbar(`${160} vulcani attivi caricati`);
  } else {
    disableVolcanoes();
  }
  const btn    = document.getElementById("toggle-volcanoes-button");
  const legend = document.getElementById("volcano-legend");
  btn?.classList.toggle("active", weatherState.showVolcanoes);
  if (btn) btn.textContent = weatherState.showVolcanoes ? "Nascondi vulcani" : "Vulcani attivi";
  if (legend) legend.style.display = weatherState.showVolcanoes ? "" : "none";
});

document.getElementById("volcano-legend")?.addEventListener("click", (e) => {
  const status = e.target.dataset.volcanoStatus;
  if (!status) return;
  const nowActive = !getVolcanoStatusFilter(status);
  setVolcanoStatusFilter(status, nowActive);
  e.target.classList.toggle("active", nowActive);
});

// ── Minerals toggle ───────────────────────────────────────────────────────
document.getElementById("toggle-minerals-button")?.addEventListener("click", () => {
  weatherState.showMinerals = !weatherState.showMinerals;
  if (weatherState.showMinerals) {
    enableMinerals();
    showSnackbar("Giacimenti minerali caricati");
  } else {
    disableMinerals();
  }
  const btn     = document.getElementById("toggle-minerals-button");
  const filters = document.getElementById("minerals-filters");
  btn?.classList.toggle("active", weatherState.showMinerals);
  if (btn) btn.textContent = weatherState.showMinerals ? "Nascondi giacimenti" : "Giacimenti minerali";
  if (filters) filters.style.display = weatherState.showMinerals ? "" : "none";
});

// Mineral filter chips
document.getElementById("minerals-filters")?.addEventListener("click", (e) => {
  const key = e.target.dataset.mineral;
  if (!key) return;
  const nowOn = !getMineralFilter(key);
  toggleMineralFilter(key);
  e.target.classList.toggle("active", nowOn);
});

// ── Religion toggle ───────────────────────────────────────────────────────
document.getElementById("toggle-religion-button")?.addEventListener("click", async () => {
  weatherState.showReligion = !weatherState.showReligion;
  const btn     = document.getElementById("toggle-religion-button");
  const filters = document.getElementById("religion-filters");
  if (weatherState.showReligion) {
    if (btn) btn.textContent = "Caricamento religioni…";
    await enableReligion();
    if (btn) btn.textContent = "Nascondi religioni";
    showSnackbar("Mappa religioni caricata");
  } else {
    disableReligion();
    if (btn) btn.textContent = "Religioni del mondo";
  }
  btn?.classList.toggle("active", weatherState.showReligion);
  if (filters) filters.style.display = weatherState.showReligion ? "" : "none";
});

// Religion mode filter chips
document.getElementById("religion-filters")?.addEventListener("click", (e) => {
  const mode = e.target.dataset.religionMode;
  if (!mode) return;
  setReligionMode(mode);
  document.querySelectorAll("#religion-filters .filter-chip").forEach(b =>
    b.classList.toggle("active", b.dataset.religionMode === mode)
  );
});

// ── Energy toggle ─────────────────────────────────────────────────────────
document.getElementById("toggle-energy-button")?.addEventListener("click", async () => {
  weatherState.showEnergy = !weatherState.showEnergy;
  const btn     = document.getElementById("toggle-energy-button");
  const filters = document.getElementById("energy-filters");
  if (weatherState.showEnergy) {
    if (btn) btn.textContent = "Caricamento energia…";
    await enableEnergy();
    if (btn) btn.textContent = "Nascondi energia";
    showSnackbar("Mappa energetica caricata");
  } else {
    disableEnergy();
    if (btn) btn.textContent = "Produzione energetica";
  }
  btn?.classList.toggle("active", weatherState.showEnergy);
  if (filters) filters.style.display = weatherState.showEnergy ? "" : "none";
});

// Energy mode filter chips
document.getElementById("energy-filters")?.addEventListener("click", (e) => {
  const mode = e.target.dataset.energyMode;
  if (!mode) return;
  setEnergyMode(mode);
  document.querySelectorAll("#energy-filters .filter-chip").forEach(b =>
    b.classList.toggle("active", b.dataset.energyMode === mode)
  );
});

// ── Aurora toggle ─────────────────────────────────────────────────────────
document.getElementById("toggle-aurora-button")?.addEventListener("click", async () => {
  weatherState.showAurora = !weatherState.showAurora;
  const btn = document.getElementById("toggle-aurora-button");
  if (weatherState.showAurora) {
    if (btn) btn.textContent = "Caricamento aurora…";
    await enableAurora();
    if (btn) btn.textContent = "Nascondi aurora";
    showSnackbar("Aurora caricata (dati NOAA SWPC)");
  } else {
    disableAurora();
    if (btn) btn.textContent = "Aurore boreali / australi";
  }
  btn?.classList.toggle("active", weatherState.showAurora);
});

// ── Deforestation toggle ───────────────────────────────────────────────────
document.getElementById("toggle-deforestation-button")?.addEventListener("click", async () => {
  weatherState.showDeforestation = !weatherState.showDeforestation;
  const btn = document.getElementById("toggle-deforestation-button");
  const filters = document.getElementById("deforestation-filters");
  if (weatherState.showDeforestation) {
    if (btn) btn.textContent = "Caricamento…";
    await enableDeforestation();
    if (btn) btn.textContent = "Nascondi deforestazione";
    showSnackbar("Mappa deforestazione caricata");
  } else {
    disableDeforestation();
    if (btn) btn.textContent = "Deforestazione";
  }
  btn?.classList.toggle("active", weatherState.showDeforestation);
  if (filters) filters.style.display = weatherState.showDeforestation ? "" : "none";
});

document.getElementById("deforestation-filters")?.addEventListener("click", (e) => {
  const mode = e.target.dataset.deforestationMode;
  if (!mode) return;
  setDeforestationMode(mode);
  document.querySelectorAll("#deforestation-filters .filter-chip").forEach(b =>
    b.classList.toggle("active", b.dataset.deforestationMode === mode)
  );
});

// ── Desertification toggle ─────────────────────────────────────────────────
document.getElementById("toggle-desertification-button")?.addEventListener("click", async () => {
  weatherState.showDesertification = !weatherState.showDesertification;
  const btn = document.getElementById("toggle-desertification-button");
  if (weatherState.showDesertification) {
    if (btn) btn.textContent = "Caricamento…";
    await enableDesertification();
    if (btn) btn.textContent = "Nascondi desertificazione";
    showSnackbar("Mappa desertificazione caricata");
  } else {
    disableDesertification();
    if (btn) btn.textContent = "Desertificazione";
  }
  btn?.classList.toggle("active", weatherState.showDesertification);
});

// ── Ice / glacier toggle ───────────────────────────────────────────────────
document.getElementById("toggle-ice-button")?.addEventListener("click", () => {
  weatherState.showIce = !weatherState.showIce;
  const btn = document.getElementById("toggle-ice-button");
  if (weatherState.showIce) {
    enableIce();
    if (btn) btn.textContent = "Nascondi ghiacci";
    showSnackbar("Mappa scioglimento ghiacci caricata");
  } else {
    disableIce();
    if (btn) btn.textContent = "Scioglimento ghiacci";
  }
  btn?.classList.toggle("active", weatherState.showIce);
});

// ── Global warming toggle ──────────────────────────────────────────────────
document.getElementById("toggle-warming-button")?.addEventListener("click", async () => {
  weatherState.showWarming = !weatherState.showWarming;
  const btn = document.getElementById("toggle-warming-button");
  const yearRow = document.getElementById("warming-year-row");
  if (weatherState.showWarming) {
    if (btn) btn.textContent = "Caricamento…";
    await enableWarming();
    if (btn) btn.textContent = "Nascondi surriscaldamento";
    showSnackbar("Mappa anomalie di temperatura caricata");
  } else {
    disableWarming();
    if (btn) btn.textContent = "Surriscaldamento globale";
  }
  btn?.classList.toggle("active", weatherState.showWarming);
  if (yearRow) yearRow.style.display = weatherState.showWarming ? "flex" : "none";
});

// Warming year slider
document.getElementById("warming-year-slider")?.addEventListener("input", (e) => {
  const idx = parseInt(e.target.value);
  const year = WARMING_YEARS[idx];
  const label = document.getElementById("warming-year-label");
  if (label) label.textContent = year;
  if (weatherState.showWarming) setWarmingYear(year);
});

// ── CCTV toggle ────────────────────────────────────────────────────────────
document.getElementById("toggle-cctv-button")?.addEventListener("click", async () => {
  weatherState.showCctv = !weatherState.showCctv;
  const btn = document.getElementById("toggle-cctv-button");
  if (weatherState.showCctv) {
    if (btn) btn.textContent = "Caricamento webcam…";
    await enableCctv();
    if (btn) btn.textContent = "Nascondi Webcam & CCTV";
    showSnackbar("Webcam pubbliche caricate");
  } else {
    disableCctv();
    if (btn) btn.textContent = "Webcam & CCTV";
  }
  btn?.classList.toggle("active", weatherState.showCctv);
});

// ── NATO toggle ─────────────────────────────────────────────────────────────
document.getElementById("toggle-nato-button")?.addEventListener("click", () => {
  weatherState.showNato = !weatherState.showNato;
  const btn = document.getElementById("toggle-nato-button");
  const filters = document.getElementById("nato-filters");
  if (weatherState.showNato) {
    enableNato();
    if (btn) btn.textContent = "Nascondi basi NATO";
    showSnackbar(`${NATO_NATIONS ? Object.keys(NATO_NATIONS).length : ""} nazioni NATO — ${document.querySelectorAll("#nato-filters .filter-chip.active").length} filtri attivi`);
  } else {
    disableNato();
    if (btn) btn.textContent = "Basi NATO";
  }
  btn?.classList.toggle("active", weatherState.showNato);
  if (filters) filters.style.display = weatherState.showNato ? "" : "none";
});

document.getElementById("nato-filters")?.addEventListener("click", (e) => {
  const nation = e.target.dataset.natoNation;
  if (!nation) return;
  const nowActive = !e.target.classList.contains("active");
  e.target.classList.toggle("active", nowActive);
  setNatoFilter(nation, nowActive);
});

// ── Seas toggle ─────────────────────────────────────────────────────────────
document.getElementById("toggle-seas-button")?.addEventListener("click", () => {
  weatherState.showSeas = !weatherState.showSeas;
  const btn = document.getElementById("toggle-seas-button");
  if (weatherState.showSeas) {
    enableSeas();
    if (btn) btn.textContent = "Nascondi mari e oceani";
    showSnackbar("Mappa mari e oceani caricata");
  } else {
    disableSeas();
    if (btn) btn.textContent = "Mari e oceani";
  }
  btn?.classList.toggle("active", weatherState.showSeas);
});

// ── Fishing toggle ──────────────────────────────────────────────────────────
document.getElementById("toggle-fishing-button")?.addEventListener("click", () => {
  weatherState.showFishing = !weatherState.showFishing;
  const btn = document.getElementById("toggle-fishing-button");
  if (weatherState.showFishing) {
    enableFishing();
    if (btn) btn.textContent = "Nascondi zone di pesca";
    showSnackbar("Zone di pesca FAO caricate");
  } else {
    disableFishing();
    if (btn) btn.textContent = "Zone di pesca (FAO)";
  }
  btn?.classList.toggle("active", weatherState.showFishing);
});

// ── Oil/Gas toggle ──────────────────────────────────────────────────────────
document.getElementById("toggle-oilgas-button")?.addEventListener("click", () => {
  weatherState.showOilGas = !weatherState.showOilGas;
  const btn = document.getElementById("toggle-oilgas-button");
  const oilgasFilters = document.getElementById("oilgas-filters");
  if (weatherState.showOilGas) {
    enableOilGas(earth);
    setSkyDimming(0.15);
    if (btn) btn.textContent = "Nascondi petrolio & gas";
    if (oilgasFilters) oilgasFilters.style.display = "flex";
    showSnackbar(`${OIL_GAS_DEPOSITS.length} giacimenti caricati — trasparenza globo attiva`);
  } else {
    disableOilGas(earth);
    setSkyDimming(1.0);
    if (btn) btn.textContent = "Giacimenti petrolio & gas";
    if (oilgasFilters) oilgasFilters.style.display = "none";
  }
  btn?.classList.toggle("active", weatherState.showOilGas);
});

// ── Oil/Gas filter chips ─────────────────────────────────────────────────────
document.querySelectorAll("#oilgas-filters .filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const type = chip.dataset.oilgas;
    if (!type) return;
    chip.classList.toggle("active");
    setOilGasFilter(type, chip.classList.contains("active"));
  });
});

// Refresh buttons — force re-download data for specific features

/** Spin a refresh button while an async action runs. */
async function _doRefresh(id, fn) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.add("spinning");
  try { await fn(); } finally { btn.classList.remove("spinning"); }
}

/** Generic re-render helper for static layers: disable+enable if active. Awaits async enables. */
async function _rerender(isActive, disable, enable) {
  if (!isActive) return;
  disable();
  await enable();
}

document.getElementById("refresh-heatmap")?.addEventListener("click", () => {
  _doRefresh("refresh-heatmap", async () => {
    if (weatherState.showHeatmap) buildHeatmapCanvas(weatherState.points);
  });
});

document.getElementById("refresh-wind")?.addEventListener("click", () => {
  _doRefresh("refresh-wind", async () => {
    if (weatherState.showWind) {
      setStatus(t("status.updating"));
      await refreshGlobalWeather(true, samplePoints, summaryPoints);
      buildWindField(weatherState.points, weatherState.windAltitudeLevel);
    }
  });
});

document.getElementById("refresh-precipitation")?.addEventListener("click", () => {
  _doRefresh("refresh-precipitation", async () => {
    if (weatherState.showPrecipitation) {
      setStatus(t("status.radarLoading"));
      const result = await fetchAndApplyRainViewer();
      if (result) {
        weatherState.useRainViewer = true;
        setStatus(t("status.radarLoaded", { age: result.ageMinutes }));
      } else {
        weatherState.useRainViewer = false;
        setStatus(t("status.radarError"));
        buildPrecipitationCanvas(weatherState.points);
      }
    }
  });
});

// ── Remaining refresh buttons ──────────────────────────────────────────────────

document.getElementById("refresh-markers")?.addEventListener("click", () => {
  _doRefresh("refresh-markers", async () => {
    if (!weatherState.showMarkers) updateMarkerVisibility(weatherState.points, true);
  });
});

document.getElementById("refresh-lightning")?.addEventListener("click", () => {
  _doRefresh("refresh-lightning", async () => {
    if (weatherState.showLightning) refreshLightning();
  });
});

document.getElementById("refresh-terminator")?.addEventListener("click", () => {
  _doRefresh("refresh-terminator", async () => {
    if (weatherState.showTerminator) updateSunDirection(Date.now());
  });
});

document.getElementById("refresh-tilt-simple")?.addEventListener("click", () => {
  _doRefresh("refresh-tilt-simple", async () => {
    if (weatherState.tiltMode === "simple") _computeTiltQuat("simple");
  });
});

document.getElementById("refresh-tilt-seasonal")?.addEventListener("click", () => {
  _doRefresh("refresh-tilt-seasonal", async () => {
    if (weatherState.tiltMode === "seasonal") _computeTiltQuat("seasonal");
  });
});

document.getElementById("refresh-satellites")?.addEventListener("click", () => {
  _doRefresh("refresh-satellites", async () => {
    if (weatherState.showSatellites) await refreshSatellites();
  });
});

document.getElementById("refresh-aurora")?.addEventListener("click", () => {
  _doRefresh("refresh-aurora", async () => {
    if (weatherState.showAurora) await refreshAurora();
  });
});

document.getElementById("refresh-aircraft")?.addEventListener("click", () => {
  _doRefresh("refresh-aircraft", async () => {
    if (weatherState.showAircraft) await refreshAircraft();
  });
});

document.getElementById("refresh-ships")?.addEventListener("click", () => {
  _doRefresh("refresh-ships", async () => {
    _rerender(weatherState.showShips, disableShips, enableShips);
  });
});

document.getElementById("refresh-traffic")?.addEventListener("click", () => {
  _doRefresh("refresh-traffic", async () => {
    _rerender(weatherState.showTraffic, disableTraffic, enableTraffic);
  });
});

document.getElementById("refresh-economy")?.addEventListener("click", () => {
  _doRefresh("refresh-economy", async () => {
    _rerender(weatherState.showEconomy, disableEconomy, enableEconomy);
  });
});

document.getElementById("refresh-anthropology")?.addEventListener("click", () => {
  _doRefresh("refresh-anthropology", async () => {
    _rerender(weatherState.showAnthropology, disableAnthropology, enableAnthropology);
  });
});

document.getElementById("refresh-religion")?.addEventListener("click", () => {
  _doRefresh("refresh-religion", async () => {
    _rerender(weatherState.showReligion, disableReligion, () => enableReligion());
  });
});

document.getElementById("refresh-energy")?.addEventListener("click", () => {
  _doRefresh("refresh-energy", async () => {
    _rerender(weatherState.showEnergy, disableEnergy, () => enableEnergy());
  });
});

document.getElementById("refresh-deforestation")?.addEventListener("click", () => {
  _doRefresh("refresh-deforestation", async () => {
    _rerender(weatherState.showDeforestation, disableDeforestation, enableDeforestation);
  });
});

document.getElementById("refresh-desertification")?.addEventListener("click", () => {
  _doRefresh("refresh-desertification", async () => {
    _rerender(weatherState.showDesertification, disableDesertification, enableDesertification);
  });
});

document.getElementById("refresh-ice")?.addEventListener("click", () => {
  _doRefresh("refresh-ice", async () => {
    _rerender(weatherState.showIce, disableIce, enableIce);
  });
});

document.getElementById("refresh-warming")?.addEventListener("click", () => {
  _doRefresh("refresh-warming", async () => {
    _rerender(weatherState.showWarming, disableWarming, () => enableWarming());
  });
});

document.getElementById("refresh-nato")?.addEventListener("click", () => {
  _doRefresh("refresh-nato", async () => {
    _rerender(weatherState.showNato, disableNato, enableNato);
  });
});

document.getElementById("refresh-seas")?.addEventListener("click", () => {
  _doRefresh("refresh-seas", async () => {
    _rerender(weatherState.showSeas, disableSeas, enableSeas);
  });
});

document.getElementById("refresh-fishing")?.addEventListener("click", () => {
  _doRefresh("refresh-fishing", async () => {
    _rerender(weatherState.showFishing, disableFishing, enableFishing);
  });
});

document.getElementById("refresh-time-zones")?.addEventListener("click", () => {
  _doRefresh("refresh-time-zones", async () => {
    if (weatherState.showTimeZones) buildTimeZoneCanvas(new Date());
  });
});

document.getElementById("refresh-cctv")?.addEventListener("click", () => {
  _doRefresh("refresh-cctv", async () => {
    if (weatherState.showCctv) await refreshCctv();
  });
});

document.getElementById("refresh-earth-interior")?.addEventListener("click", () => {
  _doRefresh("refresh-earth-interior", async () => {
    _rerender(weatherState.showEarthInterior, disableEarthInterior, enableEarthInterior);
  });
});

document.getElementById("refresh-em-field")?.addEventListener("click", () => {
  _doRefresh("refresh-em-field", async () => {
    _rerender(weatherState.showEmField, disableEmField, enableEmField);
  });
});

document.getElementById("refresh-water-bodies")?.addEventListener("click", () => {
  _doRefresh("refresh-water-bodies", async () => {
    if (weatherState.showWaterBodies) await buildWaterBodiesCanvas();
  });
});

document.getElementById("refresh-tectonic")?.addEventListener("click", () => {
  _doRefresh("refresh-tectonic", async () => {
    _rerender(weatherState.showTectonic, disableTectonic, () => enableTectonic());
  });
});

document.getElementById("refresh-volcanoes")?.addEventListener("click", () => {
  _doRefresh("refresh-volcanoes", async () => {
    _rerender(weatherState.showVolcanoes, disableVolcanoes, enableVolcanoes);
  });
});

document.getElementById("refresh-minerals")?.addEventListener("click", () => {
  _doRefresh("refresh-minerals", async () => {
    _rerender(weatherState.showMinerals, disableMinerals, enableMinerals);
  });
});

document.getElementById("refresh-oilgas")?.addEventListener("click", () => {
  _doRefresh("refresh-oilgas", async () => {
    _rerender(weatherState.showOilGas, disableOilGas, () => enableOilGas(earth));
  });
});

// Language selector
dom.languageSelect.value = weatherState.language;
dom.languageSelect.addEventListener("change", () => {
  weatherState.language = dom.languageSelect.value;
  localStorage.setItem('terracast:language', weatherState.language);
  document.documentElement.lang = weatherState.language;
  renderAllI18n();
  updateToggleButtons();
  updateLegend();
  updateProviderPanel();
  resetSelectionPanel();
  updateHud();
  if (weatherState.selectedPoint) {
    refreshSelectedPointWeather(true);
  }
});

// ── Accordion active highlight ─────────────────────────────────────────────
// Whenever a feature button gains/loses "active", update the parent accordion-item
function _syncAccordionHighlights() {
  document.querySelectorAll(".accordion-item").forEach(item => {
    const hasActive = item.querySelector(".feature-button.active, .layer-toggle-btn.active") !== null;
    item.classList.toggle("has-active", hasActive);
  });
}

// Use MutationObserver so updates happen automatically for every toggle
const _accordionObserver = new MutationObserver(_syncAccordionHighlights);
const _leftSidebar = document.querySelector(".hud");
if (_leftSidebar) {
  _accordionObserver.observe(_leftSidebar, { attributes: true, attributeFilter: ["class"], subtree: true });
}

// Initial data fetch
refreshGlobalWeather(false, samplePoints, summaryPoints);
requestCurrentLocationSelection(false);
let _moonUpdateCounter = 0;
let _tzUpdateCounter = 0;
window.setInterval(() => {
  updateSunDirection();
  updateRefreshCountdown();
  // Keep seasonal tilt axis in sync with the moving sun (sun moves ~0.25°/min)
  if (weatherState.tiltMode === "seasonal") {
    _computeTiltQuat("seasonal");
  }
  // Update moon position every 60 seconds (moon moves slowly)
  _moonUpdateCounter++;
  if (_moonUpdateCounter >= 60) {
    _moonUpdateCounter = 0;
    updateMoon(new Date());
    updateSkyRotation(new Date());
  }
  // Refresh time zone canvas every 30 seconds when visible
  _tzUpdateCounter++;
  if (_tzUpdateCounter >= 30) {
    _tzUpdateCounter = 0;
    updateTimeZoneLayer();
  }
}, 1000);
window.setInterval(() => {
  refreshGlobalWeather(false, samplePoints, summaryPoints);
}, REFRESH_INTERVAL_MS);

function animate() {
  requestAnimationFrame(animate);

  // Delta time — capped at 100 ms to avoid huge jumps after tab inactivity
  const now = performance.now();
  const dt = Math.min((now - _lastFrameTime) / 1000, 0.1);
  _lastFrameTime = now;

  // Skip rendering entirely when tab is hidden (saves CPU/GPU)
  if (document.hidden) {
    return;
  }

  updateControlsForZoom();

  // Status bar — zoom % (4.55=surface=100%, 150=far=0%)
  const _camDist = camera.position.distanceTo(globeGroup.position);
  const zoomPct = Math.round(((150 - _camDist) / (150 - 4.55)) * 100);
  const modeTag = weatherState.dataMode === "forecast" && weatherState.forecastHours > 0
    ? ` · ${weatherState.forecastModel.toUpperCase()} +${weatherState.forecastHours}h`
    : "";
  if (_sbZoom) _sbZoom.textContent = `ZOOM ${Math.max(0, Math.min(100, zoomPct))}%${modeTag}`;

  // Status bar — layer stats (update every 30 frames to avoid thrashing)
  _sbUpdateCounter++;
  if (_sbUpdateCounter >= 30 && _sbGroups) {
    _sbUpdateCounter = 0;
    _updateStatusBarGroups(_camDist);
  }

  // Sky dimming (smooth transition — only run while animating)
  if (isSkyDimming()) updateSkyDimming();

  // OSM tile layer — only relevant when zoomed in close
  if (_camDist < 8) updateOSMTileLayer(dt);

  // Only rotate clouds when they're visible
  if (clouds.visible) {
    clouds.rotation.y += 0.00008;
  }

  // Wind particles — only update when visible
  if (windParticles.visible) {
    updateWindParticles(dt);
  }

  // Lightning flashes
  if (lightningMesh.visible) {
    updateLightning(now / 1000);
  }

  // Satellites
  if (weatherState.showSatellites) {
    updateSatellites(now / 1000);
  }

  // Aircraft
  if (weatherState.showAircraft) {
    updateAircraft(now / 1000);
  }

  // Ships
  if (weatherState.showShips) {
    updateShips(dt);
  }

  // Traffic
  if (weatherState.showTraffic) {
    updateTraffic(dt, _camDist);
  }

  // Aurora
  if (weatherState.showAurora) {
    updateAurora(dt);
  }

  // CCTV overlay update
  if (weatherState.showCctv) {
    updateCctv();
  }

  // Animated earth interior layers — update when cross-section or full-sphere layers are active
  if (weatherState.showEarthInterior || hasActiveFullSphereLayers()) {
    updateEarthInterior(dt);
  }

  // Smooth sidebar zoom — animate camera.zoom toward target, then update projection
  const dz = weatherState.globeTargetZoom - camera.zoom;
  if (Math.abs(dz) > 0.001) {
    camera.zoom += dz * 0.08;
    camera.updateProjectionMatrix();
  }
  // Globe always at center — keep OrbitControls target at origin
  globeGroup.position.x = 0;
  controls.target.x = 0;

  // ── Camera controller: continuous per-frame movement ──
  if (_activeInputs.size > 0) {
    let orbitChanged = false;

    // Scale orbit speed with distance (like OrbitControls drag): slower when zoomed in
    // Quadratic scaling so very close zoom (99-100%) is dramatically slower
    const CAM_ORBIT_REFERENCE_DIST = 12.8; // default camera distance = 1× speed
    const distScale = Math.min(Math.pow(_camDist / CAM_ORBIT_REFERENCE_DIST, 2), 8.0); // cap at 8×

    // Orbit: WASD — quaternion-based rotation (no polar limits, free movement over poles)
    const orbitH = ((_activeInputs.has("orbit-left") ? 1 : 0) - (_activeInputs.has("orbit-right") ? 1 : 0)) * CAM_ORBIT_SPEED * distScale * dt;
    const orbitV = ((_activeInputs.has("orbit-down") ? 1 : 0) - (_activeInputs.has("orbit-up") ? 1 : 0)) * CAM_ORBIT_SPEED * distScale * dt;

    if (orbitH !== 0 || orbitV !== 0) {
      const offset = camera.position.clone().sub(controls.target);
      // Horizontal: rotate around world Y
      if (orbitH !== 0) {
        const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -orbitH);
        offset.applyQuaternion(qH);
        camera.up.applyQuaternion(qH);
      }
      // Vertical: rotate around camera's local right axis
      if (orbitV !== 0) {
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const qV = new THREE.Quaternion().setFromAxisAngle(right, orbitV);
        offset.applyQuaternion(qV);
        camera.up.applyQuaternion(qV);
      }
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      orbitChanged = true;
    }

    // Zoom: ↑/↓
    if (_activeInputs.has("zoom-in") || _activeInputs.has("zoom-out")) {
      const offset = camera.position.clone().sub(controls.target);
      let r = offset.length();
      if (_activeInputs.has("zoom-in"))  r -= CAM_ZOOM_SPEED * dt;
      if (_activeInputs.has("zoom-out")) r += CAM_ZOOM_SPEED * dt;
      r = Math.max(controls.minDistance, Math.min(controls.maxDistance, r));
      offset.normalize().multiplyScalar(r);
      camera.position.copy(controls.target).add(offset);
      orbitChanged = true;
    }

    // Earth axis tilt: Q/E — accumulate into _userRotQuat (free rotation, no snap-back)
    if (_activeInputs.has("rotate-left") || _activeInputs.has("rotate-right")) {
      const viewAxis = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
      const angle = CAM_ROTATE_SPEED * dt * (_activeInputs.has("rotate-left") ? -1 : 1);
      const delta = new THREE.Quaternion().setFromAxisAngle(viewAxis, angle);
      _userRotQuat.premultiply(delta);
      _userRotQuat.normalize();
    }
  }

  // Smooth axial tilt — combine tilt preset + user rotation, slerp toward combined target
  _combinedQuat.copy(_targetQuat).multiply(_userRotQuat);
  if (1 - globeGroup.quaternion.dot(_combinedQuat) > 0.00001) {
    globeGroup.quaternion.slerp(_combinedQuat, 0.08);
  }

  // Compass reset: smoothly orient camera.up to world Y without moving camera position
  if (_compassResetting && _compassResetTarget) {
    controls.enabled = false;
    camera.up.lerp(_compassResetTarget.up, 0.12);
    camera.up.normalize();
    camera.lookAt(controls.target);
    if (camera.up.distanceTo(_compassResetTarget.up) < 0.005) {
      _finishCompassReset();
    }
  }

  // Update 2D compass — project cardinal directions onto compass canvas
  if (_compassCtx) {
    const cx = 64, cy = 64, r = 28; // canvas center & sphere radius
    const dpr = window.devicePixelRatio || 1;
    _compassCanvas.width = 128 * dpr;
    _compassCanvas.height = 128 * dpr;
    _compassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    _compassCtx.clearRect(0, 0, 128, 128);

    // Globe background circle
    _compassCtx.beginPath();
    _compassCtx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    _compassCtx.fillStyle = "rgba(5,12,28,0.7)";
    _compassCtx.fill();
    _compassCtx.strokeStyle = "rgba(100,160,255,0.25)";
    _compassCtx.lineWidth = 1.5;
    _compassCtx.stroke();

    // Combined rotation: camera-inverse * globe
    const invCamQ = camera.quaternion.clone().invert();
    const combinedQ = invCamQ.clone().multiply(globeGroup.quaternion);

    // Sort cardinals by depth (z) — draw back-to-front
    const projected = _compassCardinals.map(c => {
      const v = c.axis.clone().applyQuaternion(combinedQ);
      return { ...c, sx: cx + v.x * r, sy: cy - v.y * r, z: v.z };
    }).sort((a, b) => a.z - b.z);

    _compassCtx.textAlign = "center";
    _compassCtx.textBaseline = "middle";

    for (const p of projected) {
      const alpha = 0.3 + 0.7 * Math.max(0, p.z); // fade when behind
      const scale = 0.8 + 0.4 * Math.max(0, p.z);
      _compassCtx.globalAlpha = alpha;

      // Dot
      _compassCtx.beginPath();
      _compassCtx.arc(p.sx, p.sy, 3 * scale, 0, Math.PI * 2);
      _compassCtx.fillStyle = p.color;
      _compassCtx.fill();

      // Label
      _compassCtx.font = `bold ${Math.round(p.size * scale)}px sans-serif`;
      _compassCtx.fillStyle = p.color;
      _compassCtx.fillText(p.label, p.sx, p.sy - 10 * scale);
    }
    _compassCtx.globalAlpha = 1;
  }

  controls.update();
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateGlobeCenter();
  updateTectonicResolution();
}

function handlePointerDown(event) {
  _cancelCompassReset();
  updatePointer(event);
  interactionState.isPointerDown = true;
  interactionState.downX = event.clientX;
  interactionState.downY = event.clientY;
  interactionState.dragDistance = 0;
}

function handlePointerMove(event) {
  updatePointer(event);

  // Timezone hover highlighting (only when not dragging)
  if (!interactionState.isPointerDown && weatherState.showTimeZones) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(timeZoneMesh);
    if (hits.length > 0 && hits[0].uv) {
      const uv = hits[0].uv;
      highlightZoneAtUV(uv.x, 1 - uv.y);
    } else {
      clearTimeZoneHighlight();
    }
  }

  // Satellite hover highlighting (only when not dragging)
  if (!interactionState.isPointerDown && weatherState.showSatellites) {
    raycaster.setFromCamera(pointer, camera);
    const satMesh = getSatelliteMesh();
    if (satMesh) {
      const hits = raycaster.intersectObject(satMesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        setHoveredSatellite(hits[0].instanceId);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHoveredSatellite(-1);
        renderer.domElement.style.cursor = "";
      }
    }
  } else if (!interactionState.isPointerDown) {
    setHoveredSatellite(-1);
  }

  if (!interactionState.isPointerDown) {
    return;
  }

  interactionState.dragDistance = Math.hypot(
    event.clientX - interactionState.downX,
    event.clientY - interactionState.downY
  );
}

function handlePointerUp(event) {
  updatePointer(event);

  if (!interactionState.isPointerDown) {
    return;
  }

  const wasClick = interactionState.dragDistance <= CLICK_DISTANCE_THRESHOLD;
  interactionState.isPointerDown = false;
  interactionState.dragDistance = 0;

  if (!wasClick) {
    return;
  }

  raycaster.setFromCamera(pointer, camera);

  // Priority 1: Aircraft (when visible)
  const acMesh = weatherState.showAircraft ? getAircraftMesh() : null;
  if (acMesh) {
    const hits = raycaster.intersectObject(acMesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const data = getAircraftData(hits[0].instanceId);
      if (data) {
        _selectedEntityIndex = hits[0].instanceId;
        _showAircraftCard(data, event.clientX, event.clientY);
        return;
      }
    }
  }

  // Priority 1.5: Ships (when visible)
  const shipMesh = weatherState.showShips ? getShipMesh() : null;
  if (shipMesh) {
    const hits = raycaster.intersectObject(shipMesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const data = getShipData(hits[0].instanceId);
      if (data) {
        _selectedEntityIndex = hits[0].instanceId;
        showShipRoute(hits[0].instanceId);
        _showShipCard(data, event.clientX, event.clientY);
        return;
      }
    }
  }

  // Priority 1.5: Volcanoes (when visible)
  if (weatherState.showVolcanoes) {
    const volMesh = getVolcanoMesh();
    if (volMesh) {
      const hits = raycaster.intersectObject(volMesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const data = getVolcanoData(hits[0].instanceId);
        if (data) {
          _selectedEntityIndex = hits[0].instanceId;
          _showVolcanoCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.5: Minerals (when visible)
  if (weatherState.showMinerals) {
    const minMesh = getMineralMesh();
    if (minMesh) {
      const hits = raycaster.intersectObject(minMesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const data = getMineralData(hits[0].instanceId);
        if (data) {
          _selectedEntityIndex = hits[0].instanceId;
          _showMineralCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.5: Economy polygons
  if (weatherState.showEconomy) {
    const ecoMeshes = getEconomyMeshes();
    if (ecoMeshes.length > 0) {
      const hits = raycaster.intersectObjects(ecoMeshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getEconomyCountry(ci);
        if (data) {
          _selectedEntityIndex = ci;
          _showEconomyCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.5: Anthropology polygons
  if (weatherState.showAnthropology) {
    const anthroMeshes = getAnthroMeshes();
    if (anthroMeshes.length > 0) {
      const hits = raycaster.intersectObjects(anthroMeshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getAnthroCountry(ci);
        if (data) {
          _selectedEntityIndex = ci;
          _showAnthropologyCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.5: Religion polygons
  if (weatherState.showReligion) {
    const relMeshes = getReligionMeshes();
    if (relMeshes.length > 0) {
      const hits = raycaster.intersectObjects(relMeshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getReligionCountry(ci);
        if (data) {
          _selectedEntityIndex = ci;
          _showReligionCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.6: Energy polygons
  if (weatherState.showEnergy) {
    const enMeshes = getEnergyMeshes();
    if (enMeshes.length > 0) {
      const hits = raycaster.intersectObjects(enMeshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getEnergyCountry(ci);
        if (data) {
          _selectedEntityIndex = ci;
          _showEnergyCard(data, event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.65: CCTV markers
  if (weatherState.showCctv) {
    const mesh = getCctvMesh();
    if (mesh) {
      const hits = raycaster.intersectObject(mesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const data = getCctvData(hits[0].instanceId);
        if (data) {
          const latDir = data.lat >= 0 ? "N" : "S";
          const lonDir = data.lon >= 0 ? "E" : "W";
          const previewUrl = getCctvPreviewUrl(data);
          _selectedEntityType = "cctv";
          _entityCardTitle.textContent = `📷 ${data.title}`;
          _entityCardSubtitle.textContent = `${Math.abs(data.lat).toFixed(4)}° ${latDir}, ${Math.abs(data.lon).toFixed(4)}° ${lonDir}`;
          _entityCardBody.innerHTML = previewUrl
            ? [
                `<div class="entity-cctv-media">`,
                `<img class="entity-cctv-preview" src="${previewUrl}" alt="Anteprima CCTV" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`,
                `<div class="entity-cctv-fallback">Anteprima non disponibile</div>`,
                `</div>`,
                `<span class="label">Stato</span><span class="value" style="color:#0f0">● Live</span>`,
              ].join("")
            : `<span class="label">Feed</span><span class="value">Nessuna anteprima</span>`;
          _showEntityCard(event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.65: NATO markers
  if (weatherState.showNato) {
    const mesh = getNatoMesh();
    if (mesh) {
      const hits = raycaster.intersectObject(mesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const data = getNatoBaseData(hits[0].instanceId);
        if (data) {
          _selectedEntityType = "nato";
          _entityCardTitle.textContent = `${data.nationFlag} ${data.name}`;
          _entityCardSubtitle.textContent = `${data.type} · ${data.country}`;
          _entityCardBody.innerHTML = [
            `<span class="label">Nazione operante</span><span class="value" style="color:${data.nationColor}">${data.nationLabel}</span>`,
            `<span class="label">Personale</span><span class="value">${data.personnelStr}</span>`,
            `<span class="label">Tipo</span><span class="value">${data.type}</span>`,
          ].join("");
          _showEntityCard(event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.66: Oil/gas deposit markers
  if (weatherState.showOilGas) {
    const mesh = getOilGasMesh();
    if (mesh) {
      const hits = raycaster.intersectObject(mesh);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const data = getDepositData(hits[0].instanceId);
        if (data) {
          _selectedEntityType = "oilgas";
          const typeIcon = data.type === "oil" ? "🛢️" : data.type === "gas" ? "💨" : "⚡";
          _entityCardTitle.textContent = `${typeIcon} ${data.name}`;
          _entityCardSubtitle.textContent = `${data.country} · ${data.type === "oil" ? "Petrolio" : data.type === "gas" ? "Gas naturale" : "Misto"}`;
          _entityCardBody.innerHTML = [
            `<span class="label">Riserve</span><span class="value">${data.reserves.toLocaleString("it-IT")} ${data.type === "gas" ? "tcf" : "Mld barili"}</span>`,
            `<span class="label">Coordinate</span><span class="value">${data.lat.toFixed(2)}°, ${data.lon.toFixed(2)}°</span>`,
          ].join("");
          _showEntityCard(event.clientX, event.clientY);
          return;
        }
      }
    }
  }

  // Priority 1.7: Deforestation polygons
  if (weatherState.showDeforestation) {
    const meshes = getDeforestationMeshes();
    if (meshes.length > 0) {
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getDeforestationCountry(ci);
        if (data) { _selectedEntityIndex = ci; _showDeforestationCard(data, event.clientX, event.clientY); return; }
      }
    }
  }

  // Priority 1.7: Desertification polygons
  if (weatherState.showDesertification) {
    const meshes = getDesertificationMeshes();
    if (meshes.length > 0) {
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getDesertificationCountry(ci);
        if (data) { _selectedEntityIndex = ci; _showDesertificationCard(data, event.clientX, event.clientY); return; }
      }
    }
  }

  // Priority 1.7: Warming polygons
  if (weatherState.showWarming) {
    const meshes = getWarmingMeshes();
    if (meshes.length > 0) {
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const ci = hits[0].object.userData.countryIndex;
        const data = getWarmingCountry(ci);
        if (data) { _selectedEntityIndex = ci; _showWarmingCard(data, event.clientX, event.clientY); return; }
      }
    }
  }

  // Priority 2: Satellites (when visible)
  const satMesh = weatherState.showSatellites ? getSatelliteMesh() : null;
  if (satMesh) {
    const hits = raycaster.intersectObject(satMesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const data = getSatelliteData(hits[0].instanceId);
      if (data) {
        _selectedEntityIndex = hits[0].instanceId;
        _showSatelliteCard(data, event.clientX, event.clientY);
        showSatelliteOrbit(hits[0].instanceId);
        return;
      }
    }
  }

  // Priority 3: Earth surface for weather selection
  _hideEntityCard();
  const earthHit = intersectEarth();
  if (!earthHit) {
    clearSelection();
    return;
  }

  const hitLocalPoint = globeGroup.worldToLocal(earthHit.point.clone());
  const { lat, lon } = vector3ToLatLon(hitLocalPoint);
  selectLocation({ lat, lon, label: formatLocationName(lat, lon) });
}

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersectEarth() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(earth);
  return intersections[0] ?? null;
}

function handleProviderSave() {
  const provider = getActiveProvider();
  if (!provider.requiresKey) {
    return;
  }

  storeApiKey(provider.id, dom.providerApiKey.value.trim());
  updateProviderPanel();

  if (weatherState.selectedPoint) {
    refreshSelectedPointWeather(true);
  }
}

function handleToggleMarkers() {
  weatherState.showMarkers = !weatherState.showMarkers;
  // Markers only display data already in memory (cache, snapshot, or live).
  // Data loading is triggered exclusively by page load and the auto-refresh timer.
  updateMarkerVisibility();
  updateMarkerMeshes();
  updateHud();
  updateToggleButtons();
}

function handleToggleTerminator() {
  weatherState.showTerminator = !weatherState.showTerminator;
  applyLightingMode();
  updateToggleButtons();
}

function updateGlobeCenter() {
  const vw = window.innerWidth;
  const leftW  = weatherState.leftSidebarOpen  ? Math.min(430, vw) : 0;
  const rightW = weatherState.rightSidebarOpen ? Math.min(340, vw) : 0;
  const available = vw - leftW - rightW;
  const baseline  = vw; // collapsed sidebar takes no space (toggle is overlay)
  // Globe stays at X=0 (always centered). Adjust zoom proportionally.
  weatherState.globeTargetX    = 0;
  weatherState.globeTargetZoom = Math.max(0.55, available / baseline);
}
