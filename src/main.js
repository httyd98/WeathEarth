import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_BATCH_SIZE = 60;
const GLOBE_RADIUS = 4.2;
const MARKER_ALTITUDE = 0.16;
const EARTH_DAY_TEXTURE_URL = "/textures/earth-day-8k.jpg";
const LATITUDES = Array.from({ length: 11 }, (_, index) => 75 - index * 15);
const LONGITUDES = Array.from({ length: 24 }, (_, index) => -180 + index * 15);
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
  selectionCoordinates: document.querySelector("#selection-coordinates"),
  selectionDaylight: document.querySelector("#selection-daylight")
};

const samplePoints = buildSamplePoints();
const weatherState = {
  points: samplePoints.map((point) => ({
    ...point,
    current: null,
    currentUnits: null
  })),
  selectedIndex: null,
  lastUpdatedAt: null,
  nextRefreshAt: null
};

const pointer = new THREE.Vector2(2, 2);
const raycaster = new THREE.Raycaster();
const worldPosition = new THREE.Vector3();
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
renderer.toneMappingExposure = 1.45;
dom.sceneRoot.append(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040b, 0.012);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  150
);
camera.position.set(0, 2.4, 12.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.minDistance = 6.2;
controls.maxDistance = 20;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;

const ambientLight = new THREE.AmbientLight(0xb6d5ff, 0.95);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xdff4ff, 0x173457, 1.35);
scene.add(hemisphereLight);

const sunlight = new THREE.DirectionalLight(0xf8fcff, 4.8);
sunlight.position.set(10, 3, 8);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0x8ed8ff, 1.2);
fillLight.position.set(-4, 1.5, 8);
scene.add(fillLight);

const globeGroup = new THREE.Group();
globeGroup.position.x = 1.6;
scene.add(globeGroup);

const earthMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  shininess: 28,
  specular: new THREE.Color("#9eb6d5"),
  emissive: new THREE.Color("#123d68"),
  emissiveIntensity: 0.18
});
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 128, 128),
  earthMaterial
);
globeGroup.add(earth);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 128, 128),
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

const starField = createStarField();
scene.add(starField);

const markerGeometry = new THREE.SphereGeometry(0.08, 12, 12);
const markerMaterial = new THREE.MeshBasicMaterial({
  toneMapped: false
});
const markers = new THREE.InstancedMesh(
  markerGeometry,
  markerMaterial,
  weatherState.points.length
);
markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
markers.userData.isWeatherMarkers = true;
globeGroup.add(markers);

const highlight = new THREE.Mesh(
  new THREE.SphereGeometry(0.13, 16, 16),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92
  })
);
highlight.visible = false;
globeGroup.add(highlight);

const glowSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: "#aef2ff",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
glowSprite.scale.setScalar(0.5);
highlight.add(glowSprite);

updateSunDirection();
updateMarkerMeshes();
updateHud();
loadEarthTextures();
animate();

window.addEventListener("resize", handleResize);
renderer.domElement.addEventListener("pointermove", handlePointerMove);
renderer.domElement.addEventListener("click", handlePointerSelect);
dom.refreshButton.addEventListener("click", () => refreshWeather(true));

refreshWeather(false);
window.setInterval(() => {
  updateSunDirection();
  updateRefreshCountdown();
}, 1000);
window.setInterval(() => {
  refreshWeather(false);
}, REFRESH_INTERVAL_MS);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderInteraction();
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function handlePointerMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function handlePointerSelect() {
  const index = intersectMarkerIndex();
  if (index === null) {
    return;
  }

  weatherState.selectedIndex = index;
  updateSelection(weatherState.points[index]);
}

function renderInteraction() {
  const hoveredIndex = intersectMarkerIndex();
  const activeIndex = weatherState.selectedIndex ?? hoveredIndex;

  if (activeIndex === null) {
    highlight.visible = false;
    return;
  }

  const point = weatherState.points[activeIndex];
  latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + MARKER_ALTITUDE + 0.03, worldPosition);
  highlight.position.copy(worldPosition);
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.14;
  highlight.scale.setScalar(pulse);
  highlight.visible = true;

  if (weatherState.selectedIndex === null && hoveredIndex !== null) {
    updateSelection(point);
  }
}

function intersectMarkerIndex() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(markers);
  if (!intersections.length) {
    return null;
  }

  const [intersection] = intersections;
  return intersection.instanceId ?? null;
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

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(168,238,255,0.85)");
  gradient.addColorStop(1, "rgba(168,238,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
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

function formatLocationName(lat, lon) {
  const latAbs = Math.abs(lat).toFixed(0);
  const lonAbs = Math.abs(lon).toFixed(0);
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${latAbs}°${latCardinal}, ${lonAbs}°${lonCardinal}`;
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

function updateMarkerMeshes() {
  weatherState.points.forEach((point, index) => {
    latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + MARKER_ALTITUDE, worldPosition);
    dummyObject.position.copy(worldPosition);
    dummyObject.lookAt(0, 0, 0);
    const scale =
      point.current?.weather_code >= 95
        ? 1.35
        : point.current?.weather_code >= 80
          ? 1.18
          : 1;
    dummyObject.scale.setScalar(scale);
    dummyObject.updateMatrix();
    markers.setMatrixAt(index, dummyObject.matrix);
    tempColor.copy(colorForTemperature(point.current?.temperature_2m ?? null));
    markers.setColorAt(index, tempColor);
  });

  markers.instanceColor.needsUpdate = true;
  markers.instanceMatrix.needsUpdate = true;
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
  const displaySunVector = physicalSunVector.lerp(cameraBias, 0.38).normalize();
  sunlight.position.copy(displaySunVector.clone().multiplyScalar(18));
  fillLight.position.copy(cameraBias.clone().multiplyScalar(12));
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

async function refreshWeather(forceStatus) {
  dom.refreshButton.disabled = true;
  setStatus("Aggiornamento dati meteorologici globali...");

  try {
    const responses = await Promise.all(
      chunk(samplePoints, REQUEST_BATCH_SIZE).map((points) => fetchWeatherBatch(points))
    );
    const payloads = responses.flat();

    payloads.forEach((entry, index) => {
      const point = weatherState.points[index];
      point.current = entry.current;
      point.currentUnits = entry.current_units;
      point.timezone = entry.timezone;
    });

    weatherState.lastUpdatedAt = new Date();
    weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);

    updateMarkerMeshes();
    updateHud();

    const selectedPoint =
      weatherState.selectedIndex !== null
        ? weatherState.points[weatherState.selectedIndex]
        : weatherState.points[findWarmestPointIndex()];
    updateSelection(selectedPoint);

    setStatus(
      forceStatus
        ? "Refresh manuale completato."
        : "Feed pubblico sincronizzato. Nuovi dati disponibili."
    );
  } catch (error) {
    console.error(error);
    setStatus("Errore nel refresh. Mantengo l'ultimo dataset valido.");
  } finally {
    dom.refreshButton.disabled = false;
  }
}

async function fetchWeatherBatch(points) {
  const latitude = points.map((point) => point.lat).join(",");
  const longitude = points.map((point) => point.lon).join(",");
  const url = new URL(WEATHER_ENDPOINT);

  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day"
  );
  url.searchParams.set("timezone", "GMT");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [payload];
}

function updateHud() {
  const availablePoints = weatherState.points.filter((point) => point.current);
  const temperatureValues = availablePoints.map((point) => point.current.temperature_2m);
  const averageTemperature =
    temperatureValues.reduce((sum, value) => sum + value, 0) /
    Math.max(temperatureValues.length, 1);

  dom.stationCount.textContent = `${availablePoints.length}`;
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

function updateSelection(point) {
  if (!point) {
    return;
  }

  const current = point.current;
  dom.selectionName.textContent = point.label;
  dom.selectionCoordinates.textContent = `${point.lat.toFixed(0)}°, ${point.lon.toFixed(0)}°`;

  if (!current) {
    dom.selectionCondition.textContent = "In caricamento...";
    dom.selectionTemperature.textContent = "-";
    dom.selectionWind.textContent = "-";
    dom.selectionHumidity.textContent = "-";
    dom.selectionDaylight.textContent = "-";
    return;
  }

  dom.selectionCondition.textContent = WEATHER_CODE_LABELS[current.weather_code] ?? "Condizione non classificata";
  dom.selectionTemperature.textContent = `${current.temperature_2m.toFixed(1)} ${point.currentUnits.temperature_2m}`;
  dom.selectionWind.textContent = `${current.wind_speed_10m.toFixed(1)} ${point.currentUnits.wind_speed_10m}`;
  dom.selectionHumidity.textContent = `${current.relative_humidity_2m.toFixed(0)} ${point.currentUnits.relative_humidity_2m}`;
  dom.selectionDaylight.textContent = current.is_day ? "Giorno" : "Notte";
}

function setStatus(message) {
  dom.statusLine.textContent = message;
}

function findWarmestPointIndex() {
  let bestIndex = 0;
  let bestTemperature = -Infinity;

  weatherState.points.forEach((point, index) => {
    const temperature = point.current?.temperature_2m ?? -Infinity;
    if (temperature > bestTemperature) {
      bestTemperature = temperature;
      bestIndex = index;
    }
  });

  return bestIndex;
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

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function loadEarthTextures() {
  setStatus("Caricamento texture Terra 8K...");

  try {
    const dayTexture = await textureLoader.loadAsync(EARTH_DAY_TEXTURE_URL);
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    earthMaterial.map = dayTexture;
    earthMaterial.emissiveMap = dayTexture;
    earthMaterial.needsUpdate = true;

    setStatus("Texture Terra 8K caricata. Globo illuminato.");
  } catch (error) {
    console.error(error);
    setStatus("Texture 8K non disponibile. Rimane il rendering base del globo.");
  }
}
