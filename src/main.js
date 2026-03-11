import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_WEATHER_CURRENT_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather";
const OPEN_WEATHER_FORECAST_ENDPOINT = "https://api.openweathermap.org/data/2.5/forecast";
const WEATHER_API_CURRENT_ENDPOINT = "https://api.weatherapi.com/v1/current.json";
const WEATHER_API_FORECAST_ENDPOINT = "https://api.weatherapi.com/v1/forecast.json";
const YR_FORECAST_ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const VISUAL_CROSSING_ENDPOINT = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
// Quota analysis (Open-Meteo free tier ~10,000 calls/day):
// Lat-proportional grid: ~1638 points (72 max at equator, ~13 at ±80°)
// Batches per refresh: ceil(1638/150) ≈ 11 batches
// 24 refreshes/day (1/h) × 11 batches = 264 calls/day (2.6% of quota)
// Fewer points near poles = more uniform spherical coverage
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — 24 refreshes/day
const REQUEST_BATCH_SIZE = 150;
const BATCH_DELAY_MS = 400;
const MAX_BATCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const GLOBE_RADIUS = 4.2;
const MARKER_ALTITUDE = 0.16;
const BASE_MARKER_RADIUS = 0.034;
const EARTH_DAY_TEXTURE_URL = "/textures/earth-topo-bathy.jpg";
const EARTH_NIGHT_TEXTURE_URL = "/textures/earth-night-8k.jpg";
const EARTH_CLOUDS_TEXTURE_URL = "/textures/earth-clouds-8k.jpg";
const EARTH_NORMAL_TEXTURE_URL = "/textures/earth-normal-8k.jpg";
const EARTH_SPECULAR_TEXTURE_URL = "/textures/earth-specular-8k.jpg";
const EARTH_HEIGHT_TEXTURE_URL = "/textures/earth-height.jpg";
const CLICK_DISTANCE_THRESHOLD = 7;
const STORAGE_PREFIX = "terracast";
const SUMMARY_LATITUDES = Array.from({ length: 9 }, (_, index) => 80 - index * 20);
const SUMMARY_LONGITUDES = Array.from({ length: 18 }, (_, index) => -180 + index * 20);

const WEATHER_CODE_LABELS = {
  0: "Sereno",
  1: "Quasi sereno",
  2: "Parzialmente nuvoloso",
  3: "Coperto",
  45: "Nebbia",
  48: "Galaverna",
  51: "Pioviggine leggera",
  53: "Pioviggine moderata",
  55: "Pioviggine intensa",
  56: "Pioviggine gelata leggera",
  57: "Pioviggine gelata intensa",
  61: "Pioggia debole",
  63: "Pioggia moderata",
  65: "Pioggia intensa",
  66: "Pioggia gelata leggera",
  67: "Pioggia gelata intensa",
  71: "Neve debole",
  73: "Neve moderata",
  75: "Neve intensa",
  77: "Granelli di neve",
  80: "Rovesci deboli",
  81: "Rovesci moderati",
  82: "Rovesci violenti",
  85: "Rovesci nevosi deboli",
  86: "Rovesci nevosi intensi",
  95: "Temporale",
  96: "Temporale con grandine lieve",
  99: "Temporale con grandine forte"
};

const dom = {
  sceneRoot: document.querySelector("#scene-root"),
  locateMeButton: document.querySelector("#locate-me-button"),
  searchForm: document.querySelector("#location-search-form"),
  searchInput: document.querySelector("#location-search"),
  statusLine: document.querySelector("#status-line"),
  lastRefresh: document.querySelector("#last-refresh"),
  nextRefresh: document.querySelector("#next-refresh"),
  stationCount: document.querySelector("#station-count"),
  avgTemp: document.querySelector("#avg-temp"),
  selectionName: document.querySelector("#selection-name"),
  selectionCondition: document.querySelector("#selection-condition"),
  selectionTemperature: document.querySelector("#selection-temperature"),
  selectionWind: document.querySelector("#selection-wind"),
  selectionHumidity: document.querySelector("#selection-humidity"),
  selectionPressure: document.querySelector("#selection-pressure"),
  selectionCoordinates: document.querySelector("#selection-coordinates"),
  selectionDaylight: document.querySelector("#selection-daylight"),
  selectionProvider: document.querySelector("#selection-provider"),
  providerSelect: document.querySelector("#provider-select"),
  providerApiKey: document.querySelector("#provider-api-key"),
  providerSaveButton: document.querySelector("#provider-save-button"),
  providerCapability: document.querySelector("#provider-capability"),
  quotaLimit: document.querySelector("#quota-limit"),
  quotaUsed: document.querySelector("#quota-used"),
  quotaRemaining: document.querySelector("#quota-remaining"),
  quotaNote: document.querySelector("#quota-note"),
  forecastList: document.querySelector("#forecast-list"),
  providerDock: document.querySelector("#provider-dock"),
  providerDockContent: document.querySelector("#provider-dock-content"),
  toggleMarkersButton: document.querySelector("#toggle-markers-button"),
  toggleTerminatorButton: document.querySelector("#toggle-terminator-button"),
  toggleCloudsButton: document.querySelector("#toggle-clouds-button"),
  toggleProviderBoxButton: document.querySelector("#toggle-provider-box-button"),
  snackbar: document.querySelector("#snackbar"),
  toggleHeatmapButton: document.querySelector("#toggle-heatmap-button")
};

const PROVIDERS = {
  openMeteo: {
    id: "openMeteo",
    name: "Open-Meteo",
    requiresKey: false,
    supportsGlobal: true,
    quotaNote: "Quota gratuita non esposta dal provider.",
    async fetchCurrent({ lat, lon }) {
      const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
      url.searchParams.set("latitude", `${lat}`);
      url.searchParams.set("longitude", `${lon}`);
      url.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,pressure_msl,weather_code,wind_speed_10m,is_day"
      );
      url.searchParams.set("timezone", "GMT");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo current request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        current: normalizeOpenMeteoEntry(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon }) {
      const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
      url.searchParams.set("latitude", `${lat}`);
      url.searchParams.set("longitude", `${lon}`);
      url.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min"
      );
      url.searchParams.set("forecast_days", "5");
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo forecast request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        forecast: normalizeOpenMeteoForecast(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchGlobal(points) {
      const { entries, failedBatches } = await fetchOpenMeteoGlobal(points);

      return {
        entries: entries.map((entry) => (entry ? normalizeOpenMeteoEntry(entry) : null)),
        quota: { note: this.quotaNote },
        failedBatches
      };
    }
  },
  openWeather: {
    id: "openWeather",
    name: "OpenWeather",
    requiresKey: true,
    supportsGlobal: false,
    quotaNote: "Quota non esposta dal provider o non leggibile dal browser.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(OPEN_WEATHER_CURRENT_ENDPOINT);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("lang", "it");
      url.searchParams.set("appid", apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OpenWeather current request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        current: normalizeOpenWeatherEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const url = new URL(OPEN_WEATHER_FORECAST_ENDPOINT);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("lang", "it");
      url.searchParams.set("appid", apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OpenWeather forecast request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        forecast: normalizeOpenWeatherForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  },
  weatherApi: {
    id: "weatherApi",
    name: "WeatherAPI",
    requiresKey: true,
    supportsGlobal: false,
    quotaNote: "Quota non esposta dal provider o non leggibile dal browser.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(WEATHER_API_CURRENT_ENDPOINT);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${lat},${lon}`);
      url.searchParams.set("lang", "it");
      url.searchParams.set("aqi", "no");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`WeatherAPI current request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        current: normalizeWeatherApiEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const url = new URL(WEATHER_API_FORECAST_ENDPOINT);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${lat},${lon}`);
      url.searchParams.set("lang", "it");
      url.searchParams.set("days", "5");
      url.searchParams.set("aqi", "no");
      url.searchParams.set("alerts", "no");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`WeatherAPI forecast request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        forecast: normalizeWeatherApiForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  },
  yr: {
    id: "yr",
    name: "Yr.no (Met.no)",
    requiresKey: false,
    supportsGlobal: false,
    quotaNote: "Quota gratuita, nessuna chiave richiesta. Rispettare le linee guida d'uso di Met.no.",
    async fetchCurrent({ lat, lon }) {
      const url = new URL(YR_FORECAST_ENDPOINT);
      url.searchParams.set("lat", String(Math.round(lat * 10000) / 10000));
      url.searchParams.set("lon", String(Math.round(lon * 10000) / 10000));
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Yr.no current request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        current: normalizeYrEntry(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon }) {
      const url = new URL(YR_FORECAST_ENDPOINT);
      url.searchParams.set("lat", String(Math.round(lat * 10000) / 10000));
      url.searchParams.set("lon", String(Math.round(lon * 10000) / 10000));
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Yr.no forecast request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        forecast: normalizeYrForecast(payload),
        quota: { note: this.quotaNote }
      };
    }
  },
  visualCrossing: {
    id: "visualCrossing",
    name: "Visual Crossing",
    requiresKey: true,
    supportsGlobal: false,
    quotaNote: "Quota gratuita: 1000 record/giorno.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}/today?unitGroup=metric&include=current&key=${apiKey}&contentType=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Visual Crossing current request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        current: normalizeVisualCrossingEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}?unitGroup=metric&include=days&key=${apiKey}&contentType=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Visual Crossing forecast request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        forecast: normalizeVisualCrossingForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  }
};

const samplePoints = buildSamplePoints();
const summaryPoints = buildSummaryPoints();
const weatherState = {
  points: samplePoints.map((point) => ({
    ...point,
    current: null
  })),
  showHeatmap: false,
  selectedPoint: null,
  averageMarkerScale: 1,
  lastUpdatedAt: null,
  nextRefreshAt: null,
  providerId: loadStoredProviderId(),
  providerQuotas: {},
  globalDataProvider: PROVIDERS.openMeteo.name,
  selectionRequestToken: 0,
  showMarkers: true,
  showTerminator: true,
  showClouds: true,
  showProviderDock: true,
  summaryStats: null,
  lastDistanceForScale: null
};

const interactionState = {
  isPointerDown: false,
  downX: 0,
  downY: 0,
  dragDistance: 0
};

const pointer = new THREE.Vector2(2, 2);
const raycaster = new THREE.Raycaster();
const worldPosition = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const dummyObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const textureLoader = new THREE.TextureLoader();

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
dom.sceneRoot.append(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040b, 0.009);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  150
);
camera.position.set(1.6, 1.5, 12.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.minDistance = 5.35;
controls.maxDistance = 20;
controls.autoRotate = false;
controls.rotateSpeed = 0.42;

const ambientLight = new THREE.AmbientLight(0xb6d5ff, 0.46);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xdff4ff, 0x173457, 0.4);
scene.add(hemisphereLight);

const sunlight = new THREE.DirectionalLight(0xf8fcff, 3.4);
sunlight.position.set(10, 3, 8);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0x8ed8ff, 0.28);
fillLight.position.set(-4, 1.5, 8);
scene.add(fillLight);

const globeGroup = new THREE.Group();
globeGroup.position.x = 1.6;
scene.add(globeGroup);
controls.target.copy(globeGroup.position);

const earthMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.72,
  metalness: 0.02,
  emissive: new THREE.Color("#0a1a30"),
  emissiveIntensity: 0.08,
  normalScale: new THREE.Vector2(3.5, 3.5)
});

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 256, 256),
  earthMaterial
);
earth.renderOrder = 1;
globeGroup.add(earth);

const nightLights = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 64),
  createNightLightsMaterial()
);
nightLights.renderOrder = 2;
globeGroup.add(nightLights);

const terminatorOverlay = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 64),
  createTerminatorMaterial()
);
terminatorOverlay.renderOrder = 3;
globeGroup.add(terminatorOverlay);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uGlowColor: { value: new THREE.Color("#57c7ff") }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uGlowColor;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        float intensity = pow(0.8 - dot(normalize(vViewPosition), normalize(vNormal)), 3.2);
        gl_FragColor = vec4(uGlowColor, intensity * 0.5);
      }
    `
  })
);
globeGroup.add(atmosphere);

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 80, 80),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    roughness: 1,
    metalness: 0
  })
);
clouds.renderOrder = 4;
globeGroup.add(clouds);
clouds.visible = weatherState.showClouds;

const heatmapCanvas = document.createElement("canvas");
heatmapCanvas.width = 512;
heatmapCanvas.height = 256;
const heatmapTexture = new THREE.CanvasTexture(heatmapCanvas);
heatmapTexture.colorSpace = THREE.SRGBColorSpace;
const heatmapMaterial = new THREE.MeshBasicMaterial({
  map: heatmapTexture,
  transparent: true,
  opacity: 0.82,
  depthWrite: false
});
const heatmapMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 32),
  heatmapMaterial
);
heatmapMesh.renderOrder = 3;
heatmapMesh.visible = false;
globeGroup.add(heatmapMesh);

const starField = createStarField();
scene.add(starField);

const markerGeometry = new THREE.SphereGeometry(BASE_MARKER_RADIUS, 12, 12);
const markerMaterial = new THREE.MeshBasicMaterial({
  toneMapped: false
});
const markers = new THREE.InstancedMesh(
  markerGeometry,
  markerMaterial,
  weatherState.points.length
);
markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
globeGroup.add(markers);

const selectedMarker = new THREE.Mesh(
  new THREE.SphereGeometry(BASE_MARKER_RADIUS, 16, 16),
  new THREE.MeshBasicMaterial({
    color: "#e8fbff",
    toneMapped: false
  })
);
selectedMarker.visible = false;
globeGroup.add(selectedMarker);

updateSunDirection();
applyLightingMode();
resetSelectionPanel();
updateMarkerMeshes();
updateHud();
loadEarthTextures();
updateProviderPanel();
updateToggleButtons();
animate();

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

refreshGlobalWeather(false);
requestCurrentLocationSelection(false);
window.setInterval(() => {
  updateSunDirection();
  updateRefreshCountdown();
}, 1000);
window.setInterval(() => {
  refreshGlobalWeather(false);
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

  const localPoint = globeGroup.worldToLocal(earthHit.point.clone());
  const { lat, lon } = vector3ToLatLon(localPoint);

  // Use exact click coordinates — all providers support arbitrary lat/lon
  selectLocation({ lat, lon, label: formatLocationName(lat, lon) });
}

async function handleSearchSubmit(event) {
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

function handleProviderChange() {
  weatherState.providerId = dom.providerSelect.value;
  storeProviderId(weatherState.providerId);
  updateProviderPanel();
  refreshGlobalWeather(false);

  if (weatherState.selectedPoint) {
    refreshSelectedPointWeather(true);
  }
}

function handleToggleMarkers() {
  weatherState.showMarkers = !weatherState.showMarkers;
  updateMarkerVisibility();
  updateHud();
  updateToggleButtons();

  if (weatherState.showMarkers) {
    refreshGlobalWeather(false);
  }
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

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersectMarkerIndex() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(markers);
  if (!intersections.length) {
    return null;
  }

  return intersections[0].instanceId ?? null;
}

function intersectEarth() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(earth);
  return intersections[0] ?? null;
}

function findNearestSamplePoint(lat, lon) {
  let nearest = null;
  let minDist2 = Infinity;
  for (const point of weatherState.points) {
    let dlat = lat - point.lat;
    let dlon = lon - point.lon;
    if (dlon > 180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    const dist2 = dlat * dlat + dlon * dlon;
    if (dist2 < minDist2) {
      minDist2 = dist2;
      nearest = point;
    }
  }
  return nearest;
}

function createStarField() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const color = new THREE.Color();

  for (let index = 0; index < 2600; index += 1) {
    const radius = THREE.MathUtils.randFloat(34, 78);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    positions.push(x, y, z);

    color.setHSL(0.58 + Math.random() * 0.1, 0.55, 0.78 + Math.random() * 0.18);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false
    })
  );
}

function createTerminatorMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0.2, 0.2).normalize() }
    },
    vertexShader: `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      varying vec3 vNormal;

      void main() {
        float sun = dot(normalize(vNormal), normalize(uSunDirection));
        float night = 1.0 - smoothstep(-0.16, 0.08, sun);
        float edge = 1.0 - smoothstep(0.0, 0.08, abs(sun));
        vec3 color = vec3(0.01, 0.03, 0.08) * night + vec3(0.18, 0.32, 0.46) * edge * 0.08;
        float alpha = night * 0.32 + edge * 0.04;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function createNightLightsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0.2, 0.2).normalize() },
      uNightTexture: { value: null }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform sampler2D uNightTexture;
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        float sun = dot(normalize(vNormal), normalize(uSunDirection));
        float night = 1.0 - smoothstep(-0.12, 0.04, sun);
        vec3 lights = texture2D(uNightTexture, vUv).rgb;
        gl_FragColor = vec4(lights * 0.95, night * 0.48);
      }
    `
  });
}

function buildSamplePoints() {
  const points = [];
  const BASE_LON_COUNT = 72;
  const latitudes = Array.from({ length: 33 }, (_, i) => -80 + i * 5);
  latitudes.forEach((lat, latIndex) => {
    const lonCount = Math.max(6, Math.round(BASE_LON_COUNT * Math.cos((lat * Math.PI) / 180)));
    const lonStep = 360 / lonCount;
    const offset = latIndex % 2 === 1 ? lonStep / 2 : 0;
    for (let j = 0; j < lonCount; j++) {
      const lon = (((-180 + j * lonStep + offset) + 180) % 360) - 180;
      points.push({ lat, lon, label: formatLocationName(lat, lon) });
    }
  });
  return points;
}

function buildSummaryPoints() {
  const points = [];
  const BASE_LON_COUNT = 18;
  SUMMARY_LATITUDES.forEach((lat, latIndex) => {
    const lonCount = Math.max(3, Math.round(BASE_LON_COUNT * Math.cos((lat * Math.PI) / 180)));
    const lonStep = 360 / lonCount;
    const offset = latIndex % 2 === 1 ? lonStep / 2 : 0;
    for (let j = 0; j < lonCount; j++) {
      const lon = (((-180 + j * lonStep + offset) + 180) % 360) - 180;
      points.push({ lat, lon, label: formatLocationName(lat, lon) });
    }
  });
  return points;
}

function latLonToVector3(lat, lon, radius, target) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  target.set(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return target;
}

function vector3ToLatLon(vector) {
  const radius = vector.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(vector.y / radius));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(-vector.z, vector.x));

  if (lon > 180) {
    lon -= 360;
  }

  if (lon < -180) {
    lon += 360;
  }

  return { lat, lon };
}

function updateMarkerMeshes() {
  let totalScale = 0;
  const zoomScale = getMarkerZoomScale();

  weatherState.points.forEach((point, index) => {
    latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + MARKER_ALTITUDE, worldPosition);
    dummyObject.position.copy(worldPosition);
    dummyObject.lookAt(0, 0, 0);
    const scale = markerScaleForPoint(point) * zoomScale;
    totalScale += scale;
    dummyObject.scale.setScalar(scale);
    dummyObject.updateMatrix();
    markers.setMatrixAt(index, dummyObject.matrix);
    tempColor.copy(colorForTemperature(point.current?.temperature ?? null));
    markers.setColorAt(index, tempColor);
  });

  weatherState.averageMarkerScale =
    totalScale / Math.max(weatherState.points.length, 1);

  markers.instanceColor.needsUpdate = true;
  markers.instanceMatrix.needsUpdate = true;
  updateMarkerVisibility();
  updateSelectedMarker();
}

function markerScaleForPoint(point) {
  if (!point.current) {
    return 1;
  }

  if (point.current.weatherCode >= 95) {
    return 1.35;
  }

  if (point.current.weatherCode >= 80) {
    return 1.18;
  }

  return 1;
}

function updateSelectedMarker() {
  if (!weatherState.selectedPoint) {
    selectedMarker.visible = false;
    return;
  }

  // Scale marker altitude with camera distance to avoid parallax offset at close zoom.
  // Formula: keep visual "float angle" ≈ constant by scaling altitude with height above surface.
  const camDist = controls.getDistance();
  const heightAboveSurface = camDist - GLOBE_RADIUS;
  const dynamicAlt = Math.max(0.02, heightAboveSurface * 0.018);

  latLonToVector3(
    weatherState.selectedPoint.lat,
    weatherState.selectedPoint.lon,
    GLOBE_RADIUS + dynamicAlt,
    localPoint
  );
  selectedMarker.position.copy(localPoint);
  selectedMarker.scale.setScalar(weatherState.averageMarkerScale * 1.5);
  selectedMarker.visible = true; // always visible when a point is selected, regardless of global markers toggle
}

function colorForTemperature(temperature) {
  if (temperature === null) {
    return new THREE.Color("#5f7396");
  }

  const clamped = THREE.MathUtils.clamp((temperature + 25) / 65, 0, 1);
  const hue = THREE.MathUtils.lerp(0.62, 0.04, clamped);
  const saturation = THREE.MathUtils.lerp(0.62, 0.88, clamped);
  const lightness = THREE.MathUtils.lerp(0.56, 0.62, clamped);
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

function updateSunDirection() {
  const now = new Date();
  const physicalSunVector = getSunDirection(now);
  const cameraBias = camera.position.clone().sub(globeGroup.position).normalize();
  terminatorOverlay.material.uniforms.uSunDirection.value.copy(physicalSunVector);
  nightLights.material.uniforms.uSunDirection.value.copy(physicalSunVector);

  if (weatherState.showTerminator) {
    sunlight.position.copy(physicalSunVector.clone().multiplyScalar(18));
    fillLight.position.copy(cameraBias.clone().multiplyScalar(8));
  } else {
    sunlight.position.copy(cameraBias.clone().multiplyScalar(16));
    fillLight.position.set(-5, 2, 7);
  }
}

function applyLightingMode() {
  if (weatherState.showTerminator) {
    ambientLight.intensity = 0.38;
    hemisphereLight.intensity = 0.28;
    sunlight.intensity = 2.65;
    fillLight.intensity = 0;
    earthMaterial.emissiveIntensity = 0.08;
    terminatorOverlay.visible = true;
    nightLights.visible = true;
  } else {
    ambientLight.intensity = 1.05;
    hemisphereLight.intensity = 0.8;
    sunlight.intensity = 1.5;
    fillLight.intensity = 0.28;
    earthMaterial.emissiveIntensity = 0.12;
    terminatorOverlay.visible = false;
    nightLights.visible = false;
  }
}

function getSunDirection(date) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const currentDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const dayOfYear = (currentDay - startOfYear) / 86400000;
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const subsolarLongitudeDegrees = (720 - utcMinutes - equationOfTime) / 4;
  const subsolarLongitude = THREE.MathUtils.degToRad(subsolarLongitudeDegrees);
  const cosDeclination = Math.cos(declination);

  return new THREE.Vector3(
    cosDeclination * Math.cos(subsolarLongitude),
    Math.sin(declination),
    -cosDeclination * Math.sin(subsolarLongitude)
  ).normalize();
}

async function refreshGlobalWeather(forceStatus) {
  setStatus(weatherState.showMarkers ? "Aggiornamento dati globali..." : "Aggiornamento riepilogo globale...");

  try {
    if (!weatherState.showMarkers) {
      const summary = await fetchGlobalSummary();
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

    saveWeatherCache(weatherState.points);
    updateMarkerMeshes();
    updateHeatmap();
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

async function refreshSelectedPointWeather(forceStatus = false) {
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
      const primaryMsg = error?.message ?? String(error);
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
          note: `${activeProvider.name} non disponibile (${primaryMsg}). Dati via Open-Meteo.`
        });
        setProviderQuota(fallback.id, quota ?? { note: fallback.quotaNote });
        updateSelectionPanel();
        renderForecast(forecast);
        setStatus(`${activeProvider.name} non disponibile — dati locali via ${fallback.name}.`);
        return;
      } catch (fallbackError) {
        console.error("[Open-Meteo fallback] failed:", fallbackError);
        const fallbackMsg = fallbackError?.message ?? String(fallbackError);
        const isFallbackQuota =
          fallbackError?.status === 429 || fallbackMsg.includes("429");
        weatherState.selectedPoint.current = null;
        weatherState.selectedPoint.forecast = null;
        weatherState.selectedPoint.providerName = activeProvider.name;
        updateSelectionPanel();
        renderForecast([]);
        if (isFallbackQuota) {
          setStatus(
            `${activeProvider.name} non disponibile e quota Open-Meteo esaurita. Riprova domani o dopo mezzanotte UTC.`
          );
        } else {
          setStatus(
            `${activeProvider.name} non disponibile (${primaryMsg}) e Open-Meteo fallback fallito (${fallbackMsg}).`
          );
        }
        return;
      }
    }

    // Active provider IS Open-Meteo — show specific error
    const isQuota = error?.status === 429 || String(error?.message).includes("429");
    weatherState.selectedPoint.current = null;
    weatherState.selectedPoint.forecast = null;
    weatherState.selectedPoint.providerName = activeProvider.name;
    updateSelectionPanel();
    renderForecast([]);
    if (isQuota) {
      setStatus("Quota Open-Meteo esaurita. Dati locali non disponibili. Riprova domani o dopo mezzanotte UTC.");
    } else {
      setStatus(`Errore nel caricamento locale con ${activeProvider.name}: ${error?.message ?? error}`);
    }
  }
}

function selectLocation({ lat, lon, label }) {
  weatherState.selectedPoint = {
    lat,
    lon,
    label,
    current: null,
    forecast: null,
    providerName: getActiveProvider().name
  };
  updateSelectedMarker();
  updateSelectionPanel();
  renderForecast([]);
  refreshSelectedPointWeather(false);
}

function clearSelection() {
  weatherState.selectionRequestToken += 1;
  weatherState.selectedPoint = null;
  updateSelectedMarker();
  resetSelectionPanel();
  renderForecast([]);
  setStatus("Selezione rimossa.");
}

async function requestCurrentLocationSelection(forceStatus) {
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

async function geocodeLocation(query) {
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

async function fetchOpenMeteoBatch(points) {
  const latitude = points.map((point) => point.lat).join(",");
  const longitude = points.map((point) => point.lon).join(",");
  const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);

  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,pressure_msl,weather_code,wind_speed_10m,is_day"
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

async function fetchOpenMeteoGlobal(points) {
  const result = [];
  const batches = chunk(points, REQUEST_BATCH_SIZE);
  let failedBatches = 0;
  let quotaExhausted = false;

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

        if (isRateLimited && hasRetriesLeft) {
          const retryDelay = RETRY_BASE_DELAY_MS * (attempt + 1);
          console.warn(
            `Open-Meteo 429 on batch ${batchIndex + 1}/${batches.length}, ` +
            `retry ${attempt + 1}/${MAX_BATCH_RETRIES} in ${retryDelay}ms`
          );
          await sleep(retryDelay);
        } else {
          if (isRateLimited) quotaExhausted = true;
          console.error(
            `Open-Meteo batch ${batchIndex + 1}/${batches.length} failed:`,
            error
          );
          break;
        }
      }
    }

    if (!success) {
      failedBatches += 1;
      result.push(batch.map(() => null));
    }

    // Quota exhausted — fill remaining batches with nulls and stop immediately
    if (quotaExhausted) {
      const remaining = batches.slice(batchIndex + 1);
      if (remaining.length > 0) {
        console.warn(
          `Open-Meteo quota esaurita al batch ${batchIndex + 1}/${batches.length}. ` +
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

  return {
    entries: result.flat(),
    failedBatches
  };
}

async function fetchGlobalSummary() {
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

function normalizeOpenMeteoEntry(entry) {
  return {
    temperature: entry.current.temperature_2m,
    humidity: entry.current.relative_humidity_2m,
    pressure: entry.current.pressure_msl ?? null,
    weatherCode: entry.current.weather_code,
    conditionLabel: WEATHER_CODE_LABELS[entry.current.weather_code] ?? "Condizione non classificata",
    windSpeed: entry.current.wind_speed_10m,
    isDay: Boolean(entry.current.is_day),
    units: {
      temperature: entry.current_units.temperature_2m,
      humidity: entry.current_units.relative_humidity_2m,
      pressure: entry.current_units.pressure_msl ?? "hPa",
      wind: entry.current_units.wind_speed_10m
    }
  };
}

function normalizeOpenMeteoForecast(entry) {
  return entry.daily.time.map((time, index) => ({
    label: formatForecastDate(time),
    weatherCode: entry.daily.weather_code[index],
    conditionLabel:
      WEATHER_CODE_LABELS[entry.daily.weather_code[index]] ?? "Condizione non classificata",
    min: entry.daily.temperature_2m_min[index],
    max: entry.daily.temperature_2m_max[index],
    unit: entry.daily_units.temperature_2m_max
  }));
}

function normalizeOpenWeatherEntry(entry) {
  return {
    temperature: entry.main.temp,
    humidity: entry.main.humidity,
    pressure: entry.main.pressure,
    weatherCode: null,
    conditionLabel: capitalize(entry.weather?.[0]?.description ?? "Condizione non disponibile"),
    windSpeed: (entry.wind?.speed ?? 0) * 3.6,
    isDay: entry.weather?.[0]?.icon?.includes("d") ?? true,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h"
    }
  };
}

function normalizeOpenWeatherForecast(entry) {
  const dayMap = new Map();

  entry.list.forEach((item) => {
    const dateKey = item.dt_txt.slice(0, 10);
    const hour = Number(item.dt_txt.slice(11, 13));
    const score = Math.abs(hour - 12);
    const previous = dayMap.get(dateKey);
    if (!previous || score < previous.score) {
      dayMap.set(dateKey, {
        score,
        item
      });
    }
  });

  return Array.from(dayMap.entries())
    .slice(0, 5)
    .map(([dateKey, value]) => ({
      label: formatForecastDate(dateKey),
      weatherCode: null,
      conditionLabel: capitalize(value.item.weather?.[0]?.description ?? "Condizione non disponibile"),
      min: value.item.main.temp_min,
      max: value.item.main.temp_max,
      unit: "°C"
    }));
}

function normalizeWeatherApiEntry(entry) {
  return {
    temperature: entry.current.temp_c,
    humidity: entry.current.humidity,
    pressure: entry.current.pressure_mb,
    weatherCode: null,
    conditionLabel: entry.current.condition.text,
    windSpeed: entry.current.wind_kph,
    isDay: entry.current.is_day === 1,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h"
    }
  };
}

function normalizeWeatherApiForecast(entry) {
  return entry.forecast.forecastday.map((day) => ({
    label: formatForecastDate(day.date),
    weatherCode: null,
    conditionLabel: day.day.condition.text,
    min: day.day.mintemp_c,
    max: day.day.maxtemp_c,
    unit: "°C"
  }));
}

function normalizeYrEntry(payload) {
  const instant = payload?.properties?.timeseries?.[0]?.data?.instant?.details ?? {};
  const next1h = payload?.properties?.timeseries?.[0]?.data?.next_1_hours ?? {};
  const symbol = next1h?.summary?.symbol_code ?? "fair_day";
  const isDay = !symbol.includes("night");
  return {
    temperature: instant.air_temperature ?? null,
    humidity: instant.relative_humidity ?? null,
    pressure: instant.air_pressure_at_sea_level ?? null,
    windSpeed: instant.wind_speed ?? null,
    weatherCode: null,
    conditionLabel: symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "m/s" }
  };
}

function normalizeYrForecast(payload) {
  const timeseries = payload?.properties?.timeseries ?? [];
  const daily = new Map();
  for (const entry of timeseries) {
    const date = entry.time.slice(0, 10);
    if (!daily.has(date)) {
      daily.set(date, { temps: [], symbol: entry.data?.next_6_hours?.summary?.symbol_code ?? null });
    }
    const temp = entry.data?.instant?.details?.air_temperature;
    if (temp != null) daily.get(date).temps.push(temp);
  }
  return Array.from(daily.entries()).slice(0, 5).map(([date, { temps, symbol }]) => ({
    label: formatForecastDate(date),
    weatherCode: null,
    conditionLabel: symbol ? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "–",
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
    unit: "°C"
  }));
}

function normalizeVisualCrossingEntry(payload) {
  const cc = payload?.currentConditions ?? {};
  const icon = cc.icon ?? "";
  const isDay = !icon.includes("night") && icon !== "";
  return {
    temperature: cc.temp ?? null,
    humidity: cc.humidity ?? null,
    pressure: cc.pressure ?? null,
    windSpeed: cc.windspeed ?? null,
    weatherCode: null,
    conditionLabel: cc.conditions ?? "–",
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "km/h" }
  };
}

function normalizeVisualCrossingForecast(payload) {
  return (payload?.days ?? []).slice(0, 5).map((day) => ({
    label: formatForecastDate(day.datetime),
    weatherCode: null,
    conditionLabel: day.conditions ?? "–",
    min: day.tempmin ?? null,
    max: day.tempmax ?? null,
    unit: "°C"
  }));
}

function parseQuotaFromHeaders(headers) {
  const limit = readHeader(headers, [
    "x-ratelimit-limit",
    "x-rate-limit-limit",
    "ratelimit-limit"
  ]);
  const remaining = readHeader(headers, [
    "x-ratelimit-remaining",
    "x-rate-limit-remaining",
    "ratelimit-remaining"
  ]);
  let used = readHeader(headers, [
    "x-ratelimit-used",
    "x-rate-limit-used",
    "ratelimit-used"
  ]);

  if (!used && limit && remaining) {
    const numericUsed = Number(limit) - Number(remaining);
    if (Number.isFinite(numericUsed)) {
      used = `${numericUsed}`;
    }
  }

  if (!limit && !remaining && !used) {
    return null;
  }

  return {
    limit: limit ?? "-",
    used: used ?? "-",
    remaining: remaining ?? "-",
    note: "Quota rilevata dai response header del provider."
  };
}

function readHeader(headers, names) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) {
      return value;
    }
  }

  return null;
}

function updateHud() {
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

function updateRefreshCountdown() {
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

function updateSelectionPanel() {
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

function resetSelectionPanel() {
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

function updateProviderPanel() {
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

function updateMarkerVisibility() {
  markers.visible = weatherState.showMarkers;
  selectedMarker.visible = Boolean(weatherState.selectedPoint);
}

function updateToggleButtons() {
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

function setProviderQuota(providerId, quota) {
  weatherState.providerQuotas[providerId] = quota;
  if (providerId === weatherState.providerId) {
    updateProviderPanel();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempToRgb(temp) {
  const stops = [
    [-30, [20, 0, 180]],
    [-15, [0, 100, 255]],
    [0,   [0, 230, 200]],
    [10,  [80, 255, 60]],
    [20,  [255, 230, 0]],
    [30,  [255, 80, 0]],
    [40,  [200, 0, 0]]
  ];
  const t = Math.max(-30, Math.min(40, temp));
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return stops[i][1].map((c, j) => Math.round(c + f * (stops[i + 1][1][j] - c)));
    }
  }
  return stops[stops.length - 1][1];
}

function buildHeatmapCanvas(points) {
  const W = 512, H = 256;
  const canvas = heatmapCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const valid = points
    .filter((p) => p.current?.temperature != null)
    .map((p) => ({ lat: p.lat, lon: p.lon, temp: p.current.temperature }));

  if (valid.length === 0) return;

  const imageData = ctx.createImageData(W, H);
  const d = imageData.data;

  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;
      let num = 0, den = 0;
      for (const pt of valid) {
        let dlat = lat - pt.lat;
        let dlon = lon - pt.lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist2 = dlat * dlat + dlon * dlon;
        if (dist2 < 0.001) { num = pt.temp; den = 1; break; }
        const w = 1 / dist2;
        num += w * pt.temp;
        den += w;
      }
      const temp = den > 0 ? num / den : 0;
      const [r, g, b] = tempToRgb(temp);
      const idx = (py * W + px) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 210;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  heatmapTexture.needsUpdate = true;
}

function updateHeatmap() {
  if (!weatherState.showHeatmap) return;
  setTimeout(() => buildHeatmapCanvas(weatherState.points), 0);
}

let snackbarTimer = null;

function showSnackbar(message, type = "info", duration = 4500) {
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

function setStatus(message) {
  dom.statusLine.textContent = message;
}

function getActiveProvider() {
  return PROVIDERS[weatherState.providerId] ?? PROVIDERS.openMeteo;
}

const WEATHER_CACHE_KEY = `${STORAGE_PREFIX}:weather_v1`;
const WEATHER_CACHE_MAX_AGE_MS = 25 * 60 * 60 * 1000; // 25h — survives one full cycle
const WEATHER_SNAPSHOT_KEY = `${STORAGE_PREFIX}:weather_snapshot_v1`;

function saveWeatherCache(points) {
  try {
    const payload = {
      ts: Date.now(),
      data: points
        .filter((p) => p.current !== null)
        .map((p) => ({ lat: p.lat, lon: p.lon, current: p.current }))
    };
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(WEATHER_SNAPSHOT_KEY, JSON.stringify(payload)); // persistent snapshot, no TTL
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

function loadWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.ts || Date.now() - payload.ts > WEATHER_CACHE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function loadWeatherSnapshot() {
  try {
    const raw = localStorage.getItem(WEATHER_SNAPSHOT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.data ? payload : null;
  } catch {
    return null;
  }
}

function applyCachedWeather(cache) {
  const byKey = new Map(cache.data.map((d) => [`${d.lat},${d.lon}`, d.current]));
  weatherState.points.forEach((point) => {
    const cached = byKey.get(`${point.lat},${point.lon}`);
    if (cached) {
      point.current = cached;
    }
  });
  const cacheDate = new Date(cache.ts);
  const formatted = cacheDate.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  dom.lastRefresh.textContent = `${formatted} (cache)`;
}

function loadStoredProviderId() {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}:provider`);
  return stored && PROVIDERS[stored] ? stored : PROVIDERS.openMeteo.id;
}

function storeProviderId(providerId) {
  localStorage.setItem(`${STORAGE_PREFIX}:provider`, providerId);
}

function getStoredApiKey(providerId) {
  return localStorage.getItem(`${STORAGE_PREFIX}:api-key:${providerId}`) ?? "";
}

function storeApiKey(providerId, apiKey) {
  localStorage.setItem(`${STORAGE_PREFIX}:api-key:${providerId}`, apiKey);
}

async function loadEarthTextures() {
  try {
    const [
      dayTexture,
      nightTexture,
      cloudsTexture,
      normalTexture,
      specularTexture,
      heightTexture
    ] = await Promise.all([
      textureLoader.loadAsync(EARTH_DAY_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_NIGHT_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_CLOUDS_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_NORMAL_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_SPECULAR_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_HEIGHT_TEXTURE_URL)
    ]);

    [dayTexture, nightTexture, cloudsTexture].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    specularTexture.colorSpace = THREE.LinearSRGBColorSpace;
    specularTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    normalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    heightTexture.colorSpace = THREE.NoColorSpace;
    heightTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    earthMaterial.map = dayTexture;
    earthMaterial.normalMap = normalTexture;
    earthMaterial.roughnessMap = specularTexture;
    earthMaterial.displacementMap = heightTexture;
    earthMaterial.displacementScale = 0.10;
    earthMaterial.displacementBias = -0.02;
    earthMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= 1.0 - texelRoughness.g * 0.40;
          roughnessFactor = max(roughnessFactor, 0.44);
        #endif
        `
      );
    };
    earthMaterial.needsUpdate = true;

    clouds.material.map = cloudsTexture;
    clouds.material.needsUpdate = true;

    nightLights.material.uniforms.uNightTexture.value = nightTexture;
    nightLights.material.needsUpdate = true;
  } catch (error) {
    console.error(error);
    setStatus("Texture Terra HD non disponibili. Rimane il rendering base del globo.");
  }
}

function getMarkerZoomScale() {
  const distance = controls.getDistance();
  return THREE.MathUtils.clamp(distance / 24, 0.12, 0.68);
}

function updateControlsForZoom() {
  const distance = controls.getDistance();
  controls.rotateSpeed = THREE.MathUtils.clamp(distance / 68, 0.018, 0.24);
  if (
    weatherState.lastDistanceForScale === null ||
    Math.abs(distance - weatherState.lastDistanceForScale) > 0.01
  ) {
    weatherState.lastDistanceForScale = distance;
    updateMarkerMeshes();
  }
}

function formatLocationName(lat, lon) {
  const latAbs = Math.abs(lat).toFixed(2);
  const lonAbs = Math.abs(lon).toFixed(2);
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${latAbs}°${latCardinal}, ${lonAbs}°${lonCardinal}`;
}

function formatCoordinates(lat, lon) {
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latCardinal}, ${Math.abs(lon).toFixed(2)}°${lonCardinal}`;
}

function formatGeocodingLabel(result) {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return parts.join(", ");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatForecastDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function capitalize(value) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function renderForecast(items) {
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

function renderForecastLoading() {
  dom.forecastList.innerHTML =
    '<p class="provider-note">Caricamento previsioni in corso...</p>';
}

function buttonMarkup(icon, label) {
  return `<span class="button-content">${icon}<span>${label}</span></span>`;
}

function markerIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Zm-7 12a2 2 0 1 1 0 4a2 2 0 0 1 0-4Zm14 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4Zm-7 1.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6Z" fill="currentColor"/>
    </svg>
  `;
}

function terminatorIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18V3Z" fill="currentColor"/>
      <path d="M12 3a9 9 0 0 1 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  `;
}

function cloudIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18a4.2 4.2 0 1 1 .5-8.4a5.4 5.4 0 0 1 10.2 1.9A3.3 3.3 0 1 1 18 18H7.2Z" fill="currentColor"/>
    </svg>
  `;
}

function conditionIconMarkup(weatherCode, label) {
  if (weatherCode === 0 || /sereno|sun/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;
  }

  if ((weatherCode !== null && weatherCode >= 61) || /piogg|rovesc|tempor|rain/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a4 4 0 1 1 .5-8a5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 1 1 17.5 15H7Z" fill="currentColor"/>
        <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;
  }

  if ((weatherCode !== null && weatherCode >= 71) || /neve|snow/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 14.8a4 4 0 1 1 .5-8a5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 1 1 17.5 14.8H7Z" fill="currentColor"/>
        <path d="M9 18.2h6M12 15.2v6M9.7 16.1l4.6 4.6M14.3 16.1l-4.6 4.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 16a4.5 4.5 0 1 1 .6-9a5.8 5.8 0 0 1 11 1.9A3.4 3.4 0 1 1 18.5 16H7Z" fill="currentColor"/>
    </svg>
  `;
}
