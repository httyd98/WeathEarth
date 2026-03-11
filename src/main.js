import "./style.css";

// State & constants
import { weatherState, interactionState, dom } from "./state.js";
import { CLICK_DISTANCE_THRESHOLD, REFRESH_INTERVAL_MS } from "./constants.js";
import { buildSamplePoints, buildSummaryPoints, vector3ToLatLon, formatLocationName } from "./utils.js";
import { PROVIDERS } from "./providers.js";

// Globe modules
import {
  renderer, scene, camera, controls, globeGroup,
  earth, clouds, heatmapMesh, cloudCoverMesh,
  pointer, raycaster,
  initMarkers
} from "./globe/scene.js";
import { applyLightingMode, updateSunDirection } from "./globe/lighting.js";
import { updateMarkerMeshes, updateMarkerVisibility, buildHeatmapCanvas, updateSelectedMarker } from "./globe/markers.js";
import { buildCloudCanvas } from "./globe/cloudLayer.js";
import { loadEarthTextures, updateControlsForZoom } from "./globe/textures.js";

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
  setOnProviderChange
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
  updateRefreshCountdown,
  setGetActiveProvider,
  setGetStoredApiKey,
  setUpdateMarkerVisibilityCallback
} from "./ui/index.js";

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
  setStatus(
    newProvider.supportsGlobal
      ? `Provider: ${newProvider.name} (layer globale + dettaglio locale).`
      : `Provider locale: ${newProvider.name}. Dati globali via Open-Meteo.`
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
dom.toggleCloudsButton.addEventListener("click", handleToggleClouds);
dom.toggleProviderBoxButton.addEventListener("click", handleToggleProviderBox);
dom.toggleHeatmapButton?.addEventListener("click", () => {
  weatherState.showHeatmap = !weatherState.showHeatmap;
  heatmapMesh.visible = weatherState.showHeatmap;
  if (weatherState.showHeatmap) {
    setTimeout(() => buildHeatmapCanvas(weatherState.points), 0);
    dom.toggleHeatmapButton.classList.add("active");
  } else {
    dom.toggleHeatmapButton.classList.remove("active");
  }
});
dom.toggleCloudCoverButton?.addEventListener("click", () => {
  weatherState.showCloudCover = !weatherState.showCloudCover;
  cloudCoverMesh.visible = weatherState.showCloudCover;
  if (weatherState.showCloudCover) {
    setTimeout(() => buildCloudCanvas(weatherState.points), 0);
  }
  updateToggleButtons();
});
dom.toggleLanguageButton?.addEventListener('click', () => {
  weatherState.language = weatherState.language === 'it' ? 'en' : 'it';
  localStorage.setItem('terracast:language', weatherState.language);
  updateToggleButtons();
  // If there's a selected point, re-fetch to get labels in the new language
  if (weatherState.selectedPoint) {
    refreshSelectedPointWeather(true);
  }
});

// Initial data fetch
refreshGlobalWeather(false, samplePoints, summaryPoints);
requestCurrentLocationSelection(false);
window.setInterval(() => {
  updateSunDirection();
  updateRefreshCountdown();
}, 1000);
window.setInterval(() => {
  refreshGlobalWeather(false, samplePoints, summaryPoints);
}, REFRESH_INTERVAL_MS);

function animate() {
  requestAnimationFrame(animate);
  updateControlsForZoom();
  clouds.rotation.y += 0.00008;
  controls.update();
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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

function handleToggleClouds() {
  weatherState.showClouds = !weatherState.showClouds;
  clouds.visible = weatherState.showClouds;
  updateToggleButtons();
}

function handleToggleProviderBox() {
  weatherState.showProviderDock = !weatherState.showProviderDock;
  dom.providerDockContent.hidden = !weatherState.showProviderDock;
  updateToggleButtons();
}
