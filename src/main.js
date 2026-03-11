import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_WEATHER_CURRENT_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather";
const OPEN_WEATHER_FORECAST_ENDPOINT = "https://api.openweathermap.org/data/2.5/forecast";
const WEATHER_API_CURRENT_ENDPOINT = "https://api.weatherapi.com/v1/current.json";
const WEATHER_API_FORECAST_ENDPOINT = "https://api.weatherapi.com/v1/forecast.json";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_BATCH_SIZE = 80;
const GLOBE_RADIUS = 4.2;
const MARKER_ALTITUDE = 0.16;
const BASE_MARKER_RADIUS = 0.034;
const EARTH_DAY_TEXTURE_URL = "/textures/earth-day-8k.jpg";
const EARTH_NIGHT_TEXTURE_URL = "/textures/earth-night-8k.jpg";
const EARTH_CLOUDS_TEXTURE_URL = "/textures/earth-clouds-8k.jpg";
const EARTH_NORMAL_TEXTURE_URL = "/textures/earth-normal-8k.jpg";
const EARTH_SPECULAR_TEXTURE_URL = "/textures/earth-specular-8k.jpg";
const CLICK_DISTANCE_THRESHOLD = 7;
const STORAGE_PREFIX = "wheath-earth";
const LATITUDES = Array.from({ length: 23 }, (_, index) => 82.5 - index * 7.5);
const LONGITUDES = Array.from({ length: 48 }, (_, index) => -180 + index * 7.5);
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
  refreshButton: document.querySelector("#refresh-button"),
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
  toggleProviderBoxButton: document.querySelector("#toggle-provider-box-button")
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
  }
};

const samplePoints = buildSamplePoints();
const summaryPoints = buildSummaryPoints();
const weatherState = {
  points: samplePoints.map((point) => ({
    ...point,
    current: null
  })),
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

const sunlight = new THREE.DirectionalLight(0xf8fcff, 3.15);
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
  roughness: 0.78,
  metalness: 0.02,
  emissive: new THREE.Color("#0a1a30"),
  emissiveIntensity: 0.08,
  normalScale: new THREE.Vector2(1.05, 1.05)
});

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 128, 128),
  earthMaterial
);
earth.renderOrder = 1;
globeGroup.add(earth);

const nightLights = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.004, 64, 64),
  createNightLightsMaterial()
);
nightLights.renderOrder = 2;
globeGroup.add(nightLights);

const terminatorOverlay = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 64, 64),
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
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.018, 80, 80),
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
dom.refreshButton.addEventListener("click", () => refreshGlobalWeather(true));
dom.locateMeButton.addEventListener("click", () => requestCurrentLocationSelection(true));
dom.searchForm.addEventListener("submit", handleSearchSubmit);
dom.providerSelect.addEventListener("change", handleProviderChange);
dom.providerSaveButton.addEventListener("click", handleProviderSave);
dom.toggleMarkersButton.addEventListener("click", handleToggleMarkers);
dom.toggleTerminatorButton.addEventListener("click", handleToggleTerminator);
dom.toggleCloudsButton.addEventListener("click", handleToggleClouds);
dom.toggleProviderBoxButton.addEventListener("click", handleToggleProviderBox);

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

  const markerIndex = intersectMarkerIndex();
  if (markerIndex !== null) {
    const point = weatherState.points[markerIndex];
    selectLocation({
      lat: point.lat,
      lon: point.lon,
      label: point.label
    });
    return;
  }

  const earthHit = intersectEarth();
  if (earthHit) {
    const point = globeGroup.worldToLocal(earthHit.point.clone());
    const { lat, lon } = vector3ToLatLon(point);
    selectLocation({
      lat,
      lon,
      label: formatLocationName(lat, lon)
    });
    return;
  }

  clearSelection();
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
        float alpha = night * 0.38 + edge * 0.04;
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
  return LATITUDES.flatMap((lat) =>
    LONGITUDES.map((lon) => ({
      lat,
      lon,
      label: formatLocationName(lat, lon)
    }))
  );
}

function buildSummaryPoints() {
  return SUMMARY_LATITUDES.flatMap((lat) =>
    SUMMARY_LONGITUDES.map((lon) => ({
      lat,
      lon,
      label: formatLocationName(lat, lon)
    }))
  );
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

  latLonToVector3(
    weatherState.selectedPoint.lat,
    weatherState.selectedPoint.lon,
    GLOBE_RADIUS + MARKER_ALTITUDE + 0.04,
    localPoint
  );
  selectedMarker.position.copy(localPoint);
  selectedMarker.scale.setScalar(weatherState.averageMarkerScale * 1.5);
  selectedMarker.visible = weatherState.showMarkers;
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
    fillLight.position.copy(cameraBias.clone().multiplyScalar(11));
  }
}

function applyLightingMode() {
  if (weatherState.showTerminator) {
    ambientLight.intensity = 0.38;
    hemisphereLight.intensity = 0.28;
    sunlight.intensity = 2.65;
    fillLight.intensity = 0.15;
    earthMaterial.emissiveIntensity = 0.08;
    terminatorOverlay.visible = true;
    nightLights.visible = true;
  } else {
    ambientLight.intensity = 0.95;
    hemisphereLight.intensity = 0.8;
    sunlight.intensity = 1.35;
    fillLight.intensity = 0.55;
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
  dom.refreshButton.disabled = true;
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

    updateMarkerMeshes();
    updateHud();

    if (forceStatus) {
      setStatus(`Refresh manuale completato. Layer globale: ${globalProvider.name}.`);
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
    setStatus("Errore nel refresh globale. Mantengo l'ultimo dataset valido.");
  } finally {
    dom.refreshButton.disabled = false;
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
      note: `Chiave assente. Dettaglio locale in fallback su ${activeProvider.name}.`
    });
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
    console.error(error);

    if (activeProvider.id !== PROVIDERS.openMeteo.id) {
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
          note: `Provider fallito. Dettaglio locale in fallback su ${fallback.name}.`
        });
        setProviderQuota(fallback.id, quota ?? { note: fallback.quotaNote });
        updateSelectionPanel();
        renderForecast(forecast);
        setStatus(`Fallback locale attivo: ${fallback.name}.`);
        return;
      } catch (fallbackError) {
        console.error(fallbackError);
      }
    }

    weatherState.selectedPoint.current = null;
    weatherState.selectedPoint.forecast = null;
    weatherState.selectedPoint.providerName = activeProvider.name;
    updateSelectionPanel();
    renderForecast([]);
    setStatus(`Errore nel caricamento locale con ${activeProvider.name}.`);
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
    throw new Error(`Open-Meteo batch request failed: ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [payload];
}

async function fetchOpenMeteoGlobal(points) {
  const result = [];
  const batches = chunk(points, REQUEST_BATCH_SIZE);
  let failedBatches = 0;

  for (const batch of batches) {
    try {
      const batchEntries = await fetchOpenMeteoBatch(batch);
      result.push(batchEntries);
    } catch (error) {
      console.error(error);
      failedBatches += 1;
      result.push(batch.map(() => null));
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
  selectedMarker.visible = weatherState.showMarkers && Boolean(weatherState.selectedPoint);
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

function setStatus(message) {
  dom.statusLine.textContent = message;
}

function getActiveProvider() {
  return PROVIDERS[weatherState.providerId] ?? PROVIDERS.openMeteo;
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
      specularTexture
    ] = await Promise.all([
      textureLoader.loadAsync(EARTH_DAY_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_NIGHT_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_CLOUDS_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_NORMAL_TEXTURE_URL),
      textureLoader.loadAsync(EARTH_SPECULAR_TEXTURE_URL)
    ]);

    [dayTexture, nightTexture, cloudsTexture].forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    specularTexture.colorSpace = THREE.LinearSRGBColorSpace;
    specularTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    normalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    earthMaterial.map = dayTexture;
    earthMaterial.normalMap = normalTexture;
    earthMaterial.roughnessMap = specularTexture;
    earthMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= 1.0 - texelRoughness.g;
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
