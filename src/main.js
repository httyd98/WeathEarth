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
import { loadEarthTextures, updateControlsForZoom } from "./globe/textures.js";
import { updateOSMTileLayer } from "./globe/osmTileLayer.js";
import { initMoon, updateMoon } from "./globe/moonLayer.js";
import { initSkyBackground, updateSkyRotation } from "./globe/skyBackground.js";
import { enableSatellites, disableSatellites, updateSatellites } from "./globe/satelliteLayer.js";
import { enableAircraft, disableAircraft, updateAircraft } from "./globe/aircraftLayer.js";

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
    // Future: animate globe markers to +Xh forecast values
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

animate();

// Event listeners
window.addEventListener("resize", handleResize);
renderer.domElement.addEventListener("pointerdown", handlePointerDown);
renderer.domElement.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp);
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
const WIND_LEVELS = ["10m","1000hPa","850hPa","700hPa","500hPa","300hPa","200hPa"];

function _updateWindAltLabel() {
  const lvl = WIND_LEVELS[parseInt(dom.windAltRange?.value ?? "0", 10)];
  if (dom.windAltValue) dom.windAltValue.textContent = t(`wind.level.${lvl}`);
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
  } else {
    disableSatellites();
  }
  const btn = document.getElementById("toggle-satellites-button");
  btn?.classList.toggle("active", weatherState.showSatellites);
  if (btn) btn.textContent = t(weatherState.showSatellites ? "btn.hideSatellites" : "btn.satellites");
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

  // Status bar — zoom % (4.21=surface=100%, 80=far=0%)
  const _camDist = camera.position.distanceTo(globeGroup.position);
  const zoomPct = Math.round(((80 - _camDist) / (80 - 4.21)) * 100);
  if (_sbZoom) _sbZoom.textContent = `ZOOM ${Math.max(0, Math.min(100, zoomPct))}%`;

  // OSM tile layer — loads tiles when zoomed in close
  updateOSMTileLayer(dt);

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

  // Always raycast the earth sphere for accurate surface position under cursor.
  // This avoids false hits on back-facing InstancedMesh instances and perspective
  // offset issues near the globe limb.
  const earthHit = intersectEarth();
  if (!earthHit) {
    clearSelection();
    return;
  }

  const hitLocalPoint = globeGroup.worldToLocal(earthHit.point.clone());
  const { lat, lon } = vector3ToLatLon(hitLocalPoint);

  // Use exact click coordinates — all providers support arbitrary lat/lon
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
