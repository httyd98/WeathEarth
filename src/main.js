import "./style.css";
import * as THREE from "three";

// State & constants
import { weatherState, interactionState, dom } from "./state.js";
import { CLICK_DISTANCE_THRESHOLD, REFRESH_INTERVAL_MS } from "./constants.js";
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
import { buildWindField, updateWindParticles, initWindParticles, windParticles, isWindFieldEmpty, setWindTrailsVisible } from "./globe/windParticles.js";
import { lightningMesh, buildLightningField, updateLightning } from "./globe/lightningLayer.js";
import { timeZoneMesh, buildTimeZoneCanvas, updateTimeZoneLayer, highlightZoneAtUV, clearTimeZoneHighlight } from "./globe/timeZoneLayer.js";
import { initEarthInterior, enableEarthInterior, disableEarthInterior, updateEarthInterior, toggleLayerVisibility, hasActiveFullSphereLayers } from "./globe/earthInterior.js";
import { enableEmField, disableEmField } from "./globe/emFieldLayer.js";
import { waterBodiesMesh, buildWaterBodiesCanvas } from "./globe/waterBodiesLayer.js";
import { loadEarthTextures, updateControlsForZoom } from "./globe/textures.js";
import { updateOSMTileLayer, addDataZoom, resetDataZoom, getDataZoom, getOSMZoom } from "./globe/osmTileLayer.js";
import { initMoon, updateMoon } from "./globe/moonLayer.js";
import { initSkyBackground, updateSkyRotation, setSkyDimming, updateSkyDimming, isSkyDimming } from "./globe/skyBackground.js";
import { enableSatellites, disableSatellites, updateSatellites, getSatelliteCount, getSatelliteMesh, getSatelliteData, showSatelliteOrbit, setHoveredSatellite, disposeOrbitLine } from "./globe/satelliteLayer.js";
import { enableAircraft, disableAircraft, updateAircraft, getAircraftCount, getAircraftMesh, getAircraftData, getAircraftProjectedRoute } from "./globe/aircraftLayer.js";
import { enableShips, disableShips, updateShips, getShipCount, getShipMesh, getShipData, showShipRoute, disposeShipRoute } from "./globe/shipLayer.js";
import { enableTraffic, disableTraffic, updateTraffic, getTrafficVehicleCount } from "./globe/trafficLayer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { enableEconomy, disableEconomy, setEconomyMetric, getEconomyMeshes, getEconomyCountry, getEconomyCountryPos, ECONOMY_METRICS } from "./globe/economyLayer.js";
import { enableAnthropology, disableAnthropology, setAnthroMetric, getAnthroMeshes, getAnthroCountry, getAnthroCountryPos, ANTHRO_METRICS } from "./globe/anthropologyLayer.js";
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
const _sbZoom = document.getElementById("sb-zoom");
const _sbWeather = document.getElementById("sb-weather");
const _sbWind = document.getElementById("sb-wind");
const _sbSatellites = document.getElementById("sb-satellites");
const _sbAircraft = document.getElementById("sb-aircraft");
const _sbLightning = document.getElementById("sb-lightning");
const _sbClouds = document.getElementById("sb-clouds");
const _sbOsm = document.getElementById("sb-osm");
const _sbShips = document.getElementById("sb-ships");
const _sbTraffic = document.getElementById("sb-traffic");
let _sbUpdateCounter = 0;

// ── Aircraft route line + hexdb.io data ──
let _aircraftRouteLine = null;
const _hexdbLimiter = createFetchLimiter(2);
let _hexdbFetchId = 0; // guard against stale fetches

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
}

function _showAircraftRoute(instanceIndex) {
  _disposeAircraftRoute();
  const points = getAircraftProjectedRoute(instanceIndex);
  if (!points || points.length < 2) return;

  const positions = [];
  for (const p of points) positions.push(p.x, p.y, p.z);

  const geo = new LineGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color: 0x00ffcc,
    linewidth: 3,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  _aircraftRouteLine = new Line2(geo, mat);
  _aircraftRouteLine.computeLineDistances();
  scene.add(_aircraftRouteLine);
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

  // Show projected route line
  _showAircraftRoute(_selectedEntityIndex);

  // Async fetch aircraft type + photo from hexdb.io
  const fetchId = ++_hexdbFetchId;
  const icao = data.icao24;
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
        .then(({ date, layer }) => {
          const nrt = layer?.includes("_NRT") ? " · NRT" : "";
          setStatus(t("status.satelliteLoaded", { date, nrt }));
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
// Levels supported by Open-Meteo API: 10m, 1000–10 hPa
// Levels beyond API support (5hPa, 1hPa, 0.4hPa, 0.1hPa, 0.01hPa) use extrapolation
const WIND_LEVELS = [
  "10m",
  "1000hPa","925hPa","850hPa","700hPa","600hPa","500hPa","400hPa",
  "300hPa","250hPa","200hPa","150hPa","100hPa","70hPa","50hPa",
  "30hPa","20hPa","10hPa",
  "5hPa","1hPa","0.4hPa","0.1hPa","0.01hPa"
];

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

function _updateWindAltLabel() {
  const lvl = WIND_LEVELS[parseInt(dom.windAltRange?.value ?? "0", 10)];
  const alt = WIND_LEVEL_ALT_KM[lvl] ?? "";
  if (dom.windAltValue) dom.windAltValue.textContent = `${lvl} ${alt}`;
}

// Wind altitude slider change
dom.windAltRange?.addEventListener("input", () => {
  const lvl = WIND_LEVELS[parseInt(dom.windAltRange.value, 10)];
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
  // Rebuild field on demand if no data yet (e.g., enabled before first refresh)
  if (weatherState.showWind && isWindFieldEmpty()) {
    buildWindField(weatherState.points, weatherState.windAltitudeLevel);
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
      setStatus(t("status.radarLoaded", { age: result.ageMinutes }));
      startRainViewerRefresh(
        ({ ageMinutes }) => setStatus(t("status.radarLoaded", { age: ageMinutes })),
        () => setStatus(t("status.radarError"))
      );
    } else {
      // RainViewer unavailable — use Gaussian interpolation from station data
      setStatus(t("status.radarError"));
      const hadData = buildPrecipitationCanvas(weatherState.points);
      if (!hadData) setStatus(t("status.noPrecipitation"));
    }
  } else {
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

// Refresh buttons — force re-download data for specific features
document.getElementById("refresh-heatmap")?.addEventListener("click", () => {
  if (weatherState.showHeatmap) {
    buildHeatmapCanvas(weatherState.points);
    showSnackbar(t("status.feedUpdated", { count: "", provider: "Heatmap" }), "info");
  }
});

document.getElementById("refresh-wind")?.addEventListener("click", async () => {
  if (weatherState.showWind) {
    setStatus(t("status.updating"));
    await refreshGlobalWeather(true, samplePoints, summaryPoints);
    buildWindField(weatherState.points, weatherState.windAltitudeLevel);
  }
});

document.getElementById("refresh-precipitation")?.addEventListener("click", async () => {
  if (weatherState.showPrecipitation) {
    setStatus(t("status.radarLoading"));
    const result = await fetchAndApplyRainViewer();
    if (result) {
      setStatus(t("status.radarLoaded", { age: result.ageMinutes }));
    } else {
      setStatus(t("status.radarError"));
      buildPrecipitationCanvas(weatherState.points);
    }
  }
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
  if (_sbUpdateCounter >= 30) {
    _sbUpdateCounter = 0;
    // Weather points
    const nPts = weatherState.points?.length ?? 0;
    if (nPts > 0 && weatherState.showMarkers) {
      _sbWeather.textContent = `METEO ${nPts}`;
      _sbWeather.style.display = "";
    } else { _sbWeather.style.display = "none"; }
    // Wind
    if (weatherState.showWind) {
      _sbWind.textContent = `VENTO ${weatherState.windAltitudeLevel}`;
      _sbWind.style.display = "";
    } else { _sbWind.style.display = "none"; }
    // Satellites
    if (weatherState.showSatellites) {
      _sbSatellites.textContent = `SAT ${getSatelliteCount()}`;
      _sbSatellites.style.display = "";
    } else { _sbSatellites.style.display = "none"; }
    // Aircraft
    if (weatherState.showAircraft) {
      _sbAircraft.textContent = `AEREI ${getAircraftCount()}`;
      _sbAircraft.style.display = "";
    } else { _sbAircraft.style.display = "none"; }
    // Ships
    if (weatherState.showShips) {
      _sbShips.textContent = `NAVI ${getShipCount()}`;
      _sbShips.style.display = "";
    } else { _sbShips.style.display = "none"; }
    // Traffic
    if (weatherState.showTraffic) {
      _sbTraffic.textContent = `TRAFFICO ${getTrafficVehicleCount()}`;
      _sbTraffic.style.display = "";
    } else { _sbTraffic.style.display = "none"; }
    // Lightning
    if (weatherState.showLightning) {
      _sbLightning.textContent = "FULMINI";
      _sbLightning.style.display = "";
    } else { _sbLightning.style.display = "none"; }
    // Clouds
    if (weatherState.cloudMode !== "off") {
      _sbClouds.textContent = `NUVOLE ${weatherState.cloudMode === "aesthetic" ? "EST" : "SAT"}`;
      _sbClouds.style.display = "";
    } else { _sbClouds.style.display = "none"; }
    // OSM tiles
    if (_camDist < 6.0 || getDataZoom() > 0) {
      const dz = getDataZoom();
      _sbOsm.textContent = dz > 0 ? `OSM z${getOSMZoom()}+${dz}` : `OSM z${getOSMZoom()}`;
      _sbOsm.style.display = "";
    } else { _sbOsm.style.display = "none"; }
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

  // Animated earth interior layers — update when cross-section or full-sphere layers are active
  if (weatherState.showEarthInterior || hasActiveFullSphereLayers()) {
    updateEarthInterior(dt);
  }

  // Smooth globe centering — skip when already at target
  const dx = weatherState.globeTargetX - globeGroup.position.x;
  if (Math.abs(dx) > 0.001) {
    globeGroup.position.x += dx * 0.06;
  }
  // Keep OrbitControls target in sync so rotation is always around the globe center
  controls.target.x = globeGroup.position.x;

  // Smooth axial tilt — skip slerp when already at target (saves per-frame quaternion math)
  if (1 - globeGroup.quaternion.dot(_targetQuat) > 0.00001) {
    globeGroup.quaternion.slerp(_targetQuat, 0.04);
  }

  controls.update();
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateGlobeCenter();
}

function handlePointerDown(event) {
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
  const leftW = weatherState.leftSidebarOpen ? Math.min(430, vw) : 0;
  const rightW = weatherState.rightSidebarOpen ? Math.min(340, vw) : 44;
  const center = leftW + (vw - leftW - rightW) / 2;
  const screenCenter = vw / 2;
  const offsetPx = center - screenCenter;
  weatherState.globeTargetX = offsetPx * 0.012;
}
