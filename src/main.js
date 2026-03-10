import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DAILY_FORECAST_DAYS = 5;
const REQUEST_BATCH_SIZE = 170;
const MAX_BATCH_CONCURRENCY = 1;
const MAX_BATCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1200;
const ROTATE_SPEED_NEAR = 0.06;
const ROTATE_SPEED_FAR = 0.95;
const MARKER_SCALE_NEAR = 0.16;
const MARKER_SCALE_FAR = 1;
const GLOBE_RADIUS = 4.2;
const MARKER_ALTITUDE = 0.16;
const TERRAIN_MAP_WIDTH = 2048;
const TERRAIN_MAP_HEIGHT = 1024;
const EARTH_DAY_TEXTURE_URL = "/textures/earth-day-8k.jpg";
const LATITUDES = Array.from({ length: 17 }, (_, index) => 80 - index * 10);
const LONGITUDES = Array.from({ length: 36 }, (_, index) => -180 + index * 10);
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
  selectionFeelsLike: document.querySelector("#selection-feels-like"),
  selectionGusts: document.querySelector("#selection-gusts"),
  selectionHumidity: document.querySelector("#selection-humidity"),
  selectionPressure: document.querySelector("#selection-pressure"),
  selectionCloudCover: document.querySelector("#selection-cloud-cover"),
  selectionPrecipitation: document.querySelector("#selection-precipitation"),
  selectionCoordinates: document.querySelector("#selection-coordinates"),
  selectionDaylight: document.querySelector("#selection-daylight"),
  selectionTimezone: document.querySelector("#selection-timezone"),
  forecastList: document.querySelector("#forecast-list"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  toggleMarkersButton: document.querySelector("#toggle-markers-button"),
  toggleDayNightButton: document.querySelector("#toggle-daynight-button")
};

const samplePoints = buildSamplePoints();
const weatherState = {
  points: samplePoints.map((point) => ({
    ...point,
    current: null,
    currentUnits: null,
    daily: null,
    dailyUnits: null
  })),
  selectedIndex: null,
  customSelection: null,
  selectionRequestId: 0,
  isRefreshing: false,
  lastUpdatedAt: null,
  nextRefreshAt: null
};
const sceneState = {
  markersVisible: true,
  dayNightEnabled: true,
  zoomFactor: 1,
  markerZoomScale: 1
};

const pointer = new THREE.Vector2(2, 2);
const raycaster = new THREE.Raycaster();
const worldPosition = new THREE.Vector3();
const localPosition = new THREE.Vector3();
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
renderer.toneMappingExposure = 1.12;
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
controls.dampingFactor = 0.06;
controls.minDistance = 4.7;
controls.maxDistance = 24;
controls.autoRotate = false;

const ambientLight = new THREE.AmbientLight(0x97b3d5, 0.2);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xb7d8ff, 0x091220, 0.25);
scene.add(hemisphereLight);

const sunlight = new THREE.DirectionalLight(0xf8fcff, 3.3);
sunlight.position.set(12, 2, 8);
scene.add(sunlight);

const fillLight = new THREE.DirectionalLight(0x3a4b67, 0.22);
fillLight.position.set(-10, 1, -8);
scene.add(fillLight);

const globeGroup = new THREE.Group();
scene.add(globeGroup);
controls.target.copy(globeGroup.position);
controls.update();

const earthMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.74,
  metalness: 0.04,
  emissive: new THREE.Color("#08111c"),
  emissiveIntensity: 0.05,
  displacementScale: 0.18,
  displacementBias: -0.09
});
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 192, 192),
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

const markerGeometry = new THREE.SphereGeometry(0.045, 10, 10);
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
  new THREE.SphereGeometry(0.09, 14, 14),
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
glowSprite.scale.setScalar(0.35);
highlight.add(glowSprite);

updateSunDirection();
updateMarkerMeshes({ updateColors: true });
updateHud();
applyMarkerVisibility();
applyDayNightMode();
syncToggleButtons();
loadEarthTextures();
animate();

window.addEventListener("resize", handleResize);
renderer.domElement.addEventListener("pointermove", handlePointerMove);
renderer.domElement.addEventListener("click", handlePointerSelect);
dom.refreshButton.addEventListener("click", () => refreshWeather(true));
dom.searchForm.addEventListener("submit", handleSearchSubmit);
dom.toggleMarkersButton.addEventListener("click", toggleMarkersVisibility);
dom.toggleDayNightButton.addEventListener("click", toggleDayNightMode);

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
  updateDynamicSceneFromZoom();
  controls.update();
  renderInteraction();
  renderer.render(scene, camera);
}

function updateDynamicSceneFromZoom() {
  const distance = controls.getDistance();
  const zoomFactor = getZoomFactor(distance);
  sceneState.zoomFactor = zoomFactor;
  const rotateCurve = Math.pow(zoomFactor, 1.55);
  controls.rotateSpeed = THREE.MathUtils.lerp(ROTATE_SPEED_NEAR, ROTATE_SPEED_FAR, rotateCurve);

  const markerCurve = Math.pow(zoomFactor, 1.8);
  const markerZoomScale = THREE.MathUtils.lerp(
    MARKER_SCALE_NEAR,
    MARKER_SCALE_FAR,
    markerCurve
  );
  if (Math.abs(markerZoomScale - sceneState.markerZoomScale) > 0.012) {
    sceneState.markerZoomScale = markerZoomScale;
    updateMarkerMeshes({ updateColors: false });
  }
}

function getZoomFactor(distance) {
  const span = Math.max(controls.maxDistance - controls.minDistance, 0.001);
  return THREE.MathUtils.clamp((distance - controls.minDistance) / span, 0, 1);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function handlePointerMove(event) {
  updatePointerFromEvent(event);
}

async function handlePointerSelect(event) {
  updatePointerFromEvent(event);

  const index = intersectMarkerIndex();
  if (index === null) {
    const globeIntersection = intersectGlobeSurface();
    if (!globeIntersection) {
      return;
    }

    await selectCustomPoint(globeIntersection.point);
    return;
  }

  weatherState.selectionRequestId += 1;
  weatherState.selectedIndex = index;
  weatherState.customSelection = null;
  updateSelection(weatherState.points[index]);
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  const query = dom.searchInput.value.trim();
  if (!query) {
    return;
  }

  dom.searchButton.disabled = true;
  setStatus("Ricerca località...");

  try {
    const parsedCoordinates = parseCoordinateQuery(query);
    if (parsedCoordinates) {
      await selectCustomCoordinates(parsedCoordinates.lat, parsedCoordinates.lon, query);
      return;
    }

    const candidate = await geocodeLocationQuery(query);
    if (!candidate) {
      setStatus("Località non trovata. Prova con un indirizzo più completo.");
      return;
    }

    const locationLabel = [candidate.name, candidate.admin1, candidate.country]
      .filter(Boolean)
      .join(", ");
    await selectCustomCoordinates(candidate.latitude, candidate.longitude, locationLabel);
  } catch (error) {
    console.error(error);
    setStatus("Errore durante la ricerca della località.");
  } finally {
    dom.searchButton.disabled = false;
  }
}

function parseCoordinateQuery(query) {
  const coordinateMatch = query.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/
  );
  if (!coordinateMatch) {
    return null;
  }

  const lat = Number.parseFloat(coordinateMatch[1]);
  const lon = Number.parseFloat(coordinateMatch[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  return { lat, lon };
}

async function geocodeLocationQuery(query) {
  const url = new URL(GEOCODING_ENDPOINT);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "it");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo geocoding failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.results?.[0] ?? null;
}

function toggleMarkersVisibility() {
  sceneState.markersVisible = !sceneState.markersVisible;
  applyMarkerVisibility();
  syncToggleButtons();
}

function toggleDayNightMode() {
  sceneState.dayNightEnabled = !sceneState.dayNightEnabled;
  applyDayNightMode();
  syncToggleButtons();
}

function applyMarkerVisibility() {
  markers.visible = sceneState.markersVisible;
}

function applyDayNightMode() {
  if (sceneState.dayNightEnabled) {
    ambientLight.intensity = 0.2;
    hemisphereLight.intensity = 0.25;
    sunlight.intensity = 3.3;
    fillLight.intensity = 0.22;
    earthMaterial.emissiveIntensity = 0.05;
    updateSunDirection();
    return;
  }

  ambientLight.intensity = 0.58;
  hemisphereLight.intensity = 0.62;
  sunlight.intensity = 1.18;
  fillLight.intensity = 0.92;
  sunlight.position.set(11, 5, 9);
  fillLight.position.set(-9, -2, -7);
  earthMaterial.emissiveIntensity = 0.14;
}

function syncToggleButtons() {
  dom.toggleMarkersButton.textContent = sceneState.markersVisible
    ? "Punti meteo: ON"
    : "Punti meteo: OFF";
  dom.toggleDayNightButton.textContent = sceneState.dayNightEnabled
    ? "Vista giorno/notte: ON"
    : "Vista giorno/notte: OFF";

  dom.toggleMarkersButton.classList.toggle("is-off", !sceneState.markersVisible);
  dom.toggleDayNightButton.classList.toggle("is-off", !sceneState.dayNightEnabled);
}

function renderInteraction() {
  const hoveredIndex = sceneState.markersVisible ? intersectMarkerIndex() : null;
  const selectedMarkerPoint =
    weatherState.selectedIndex !== null && sceneState.markersVisible
      ? weatherState.points[weatherState.selectedIndex]
      : null;
  const activePoint =
    selectedMarkerPoint ??
    weatherState.customSelection ??
    (hoveredIndex !== null ? weatherState.points[hoveredIndex] : null);

  if (!activePoint) {
    highlight.visible = false;
    return;
  }

  latLonToVector3(
    activePoint.lat,
    activePoint.lon,
    GLOBE_RADIUS + MARKER_ALTITUDE + 0.03,
    worldPosition
  );
  highlight.position.copy(worldPosition);
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.14;
  const highlightZoomScale = THREE.MathUtils.lerp(0.46, 1, sceneState.zoomFactor);
  highlight.scale.setScalar(pulse * highlightZoomScale);
  highlight.visible = true;

  if (
    weatherState.selectedIndex === null &&
    weatherState.customSelection === null &&
    hoveredIndex !== null
  ) {
    updateSelection(activePoint);
  }
}

function intersectMarkerIndex() {
  if (!sceneState.markersVisible) {
    return null;
  }

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(markers);
  if (!intersections.length) {
    return null;
  }

  const [intersection] = intersections;
  return intersection.instanceId ?? null;
}

function intersectGlobeSurface() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObject(earth);
  if (!intersections.length) {
    return null;
  }

  return intersections[0];
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
  const latAbs = Math.abs(lat);
  const lonAbs = Math.abs(lon);
  const latLabel = Number.isInteger(latAbs) ? latAbs.toFixed(0) : latAbs.toFixed(1);
  const lonLabel = Number.isInteger(lonAbs) ? lonAbs.toFixed(0) : lonAbs.toFixed(1);
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${latLabel}°${latCardinal}, ${lonLabel}°${lonCardinal}`;
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

function updateMarkerMeshes({ updateColors = true } = {}) {
  weatherState.points.forEach((point, index) => {
    latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + MARKER_ALTITUDE, worldPosition);
    dummyObject.position.copy(worldPosition);
    dummyObject.lookAt(0, 0, 0);
    const weatherScale =
      point.current?.weather_code >= 95
        ? 1.35
        : point.current?.weather_code >= 80
          ? 1.18
          : 1;
    const zoomScale = sceneState.markerZoomScale;
    dummyObject.scale.setScalar(weatherScale * zoomScale);
    dummyObject.updateMatrix();
    markers.setMatrixAt(index, dummyObject.matrix);

    if (updateColors) {
      tempColor.copy(colorForTemperature(point.current?.temperature_2m ?? null));
      markers.setColorAt(index, tempColor);
    }
  });

  if (updateColors) {
    markers.instanceColor.needsUpdate = true;
  }
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
  if (!sceneState.dayNightEnabled) {
    return;
  }

  const now = new Date();
  const physicalSunVector = getSunDirection(now);
  sunlight.position.copy(physicalSunVector.clone().multiplyScalar(20));
  fillLight.position.copy(physicalSunVector.clone().multiplyScalar(-16));
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
  if (weatherState.isRefreshing) {
    if (forceStatus) {
      setStatus("Aggiornamento già in corso...");
    }
    return;
  }

  weatherState.isRefreshing = true;
  dom.refreshButton.disabled = true;
  setStatus("Aggiornamento dati meteorologici globali...");

  try {
    const batches = chunk(samplePoints, REQUEST_BATCH_SIZE).map((points, batchIndex) => ({
      points,
      offset: batchIndex * REQUEST_BATCH_SIZE
    }));
    let successBatches = 0;
    let failedBatches = 0;

    for (let index = 0; index < batches.length; index += MAX_BATCH_CONCURRENCY) {
      const group = batches.slice(index, index + MAX_BATCH_CONCURRENCY);
      const settledGroup = await Promise.allSettled(
        group.map((batch) =>
          fetchWeatherBatchWithRetry(batch.points, {
            timezone: "auto"
          })
        )
      );

      settledGroup.forEach((result, groupIndex) => {
        const batch = group[groupIndex];

        if (result.status === "rejected") {
          failedBatches += 1;
          console.error(result.reason);
          return;
        }

        const payload = result.value;
        payload.forEach((entry, entryIndex) => {
          const point = weatherState.points[batch.offset + entryIndex];
          if (!point || !entry) {
            return;
          }
          applyPayloadToPoint(point, entry);
        });
        successBatches += 1;
      });
    }

    if (!successBatches) {
      throw new Error("All weather batches failed");
    }

    weatherState.lastUpdatedAt = new Date();
    weatherState.nextRefreshAt = new Date(Date.now() + REFRESH_INTERVAL_MS);

    updateMarkerMeshes({ updateColors: true });
    updateHud();

    const selectedPoint =
      weatherState.selectedIndex !== null
        ? weatherState.points[weatherState.selectedIndex]
        : weatherState.customSelection ?? weatherState.points[findWarmestPointIndex()];
    if (selectedPoint && !selectedPoint.current) {
      try {
        const payload = await fetchWeatherPoint(selectedPoint.lat, selectedPoint.lon);
        applyPayloadToPoint(selectedPoint, payload);
      } catch (selectionError) {
        console.error(selectionError);
      }
    }
    updateSelection(selectedPoint);

    if (failedBatches > 0) {
      setStatus(
        `Aggiornamento parziale: ${successBatches}/${batches.length} batch caricati.`
      );
    } else {
      setStatus(
        forceStatus
          ? "Refresh manuale completato."
          : "Feed pubblico sincronizzato. Nuovi dati disponibili."
      );
    }
  } catch (error) {
    console.error(error);
    setStatus("Errore nel refresh. Mantengo l'ultimo dataset valido.");
  } finally {
    weatherState.isRefreshing = false;
    dom.refreshButton.disabled = false;
  }
}

async function fetchWeatherBatch(points, { timezone = "auto" } = {}) {
  const latitude = points.map((point) => point.lat).join(",");
  const longitude = points.map((point) => point.lon).join(",");
  const url = new URL(WEATHER_ENDPOINT);

  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,apparent_temperature,pressure_msl,cloud_cover,precipitation,is_day"
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset"
  );
  url.searchParams.set("forecast_days", String(DAILY_FORECAST_DAYS));
  url.searchParams.set("timezone", timezone);

  const response = await fetch(url);
  if (!response.ok) {
    const reason = await response.text();
    const error = new Error(`Open-Meteo request failed: ${response.status} ${reason}`);
    error.status = response.status;
    error.reason = reason;
    const retryAfterHeader = Number.parseFloat(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
      error.retryAfterSeconds = retryAfterHeader;
    }
    throw error;
  }

  const payload = await response.json();
  if (!Array.isArray(payload) && payload?.error) {
    const error = new Error(`Open-Meteo payload error: ${payload.reason ?? "unknown"}`);
    error.status = 502;
    throw error;
  }
  return Array.isArray(payload) ? payload : [payload];
}

async function fetchWeatherPoint(lat, lon) {
  const [payload] = await fetchWeatherBatchWithRetry([{ lat, lon }], {
    timezone: "auto"
  });
  return payload;
}

function applyPayloadToPoint(point, payload) {
  if (!point || !payload) {
    return;
  }

  point.current = payload.current ?? null;
  point.currentUnits = payload.current_units ?? null;
  point.daily = payload.daily ?? null;
  point.dailyUnits = payload.daily_units ?? null;
  point.timezone = payload.timezone ?? point.timezone ?? null;
}

async function fetchWeatherBatchWithRetry(
  points,
  { timezone = "auto", maxRetries = MAX_BATCH_RETRIES } = {}
) {
  let attempt = 0;

  while (true) {
    try {
      return await fetchWeatherBatch(points, { timezone });
    } catch (error) {
      const canRetry = isRetryableWeatherError(error) && attempt < maxRetries;
      if (!canRetry) {
        throw error;
      }

      const retryAfterMs = Number.isFinite(error.retryAfterSeconds)
        ? error.retryAfterSeconds * 1000
        : RETRY_BASE_DELAY_MS * 2 ** attempt;
      await sleep(retryAfterMs + Math.random() * 300);
      attempt += 1;
    }
  }
}

function isRetryableWeatherError(error) {
  const status = error?.status;
  return status === 429 || status === 408 || status >= 500;
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
  dom.selectionCoordinates.textContent = `${point.lat.toFixed(1)}°, ${point.lon.toFixed(1)}°`;
  dom.selectionTimezone.textContent = point.timezone ?? "-";

  if (!current) {
    dom.selectionCondition.textContent = "In caricamento...";
    dom.selectionTemperature.textContent = "-";
    dom.selectionFeelsLike.textContent = "-";
    dom.selectionWind.textContent = "-";
    dom.selectionGusts.textContent = "-";
    dom.selectionHumidity.textContent = "-";
    dom.selectionPressure.textContent = "-";
    dom.selectionCloudCover.textContent = "-";
    dom.selectionPrecipitation.textContent = "-";
    dom.selectionDaylight.textContent = "-";
    renderForecast(point);
    return;
  }

  dom.selectionCondition.textContent = WEATHER_CODE_LABELS[current.weather_code] ?? "Condizione non classificata";
  dom.selectionTemperature.textContent = `${formatNumber(current.temperature_2m, 1)} ${point.currentUnits?.temperature_2m ?? "°C"}`;
  dom.selectionFeelsLike.textContent = `${formatNumber(current.apparent_temperature, 1)} ${point.currentUnits?.apparent_temperature ?? "°C"}`;
  dom.selectionWind.textContent = `${formatNumber(current.wind_speed_10m, 1)} ${point.currentUnits?.wind_speed_10m ?? "km/h"}`;
  dom.selectionGusts.textContent = `${formatNumber(current.wind_gusts_10m, 1)} ${point.currentUnits?.wind_gusts_10m ?? "km/h"}`;
  dom.selectionHumidity.textContent = `${formatNumber(current.relative_humidity_2m, 0)} ${point.currentUnits?.relative_humidity_2m ?? "%"}`;
  dom.selectionPressure.textContent = `${formatNumber(current.pressure_msl, 0)} ${point.currentUnits?.pressure_msl ?? "hPa"}`;
  dom.selectionCloudCover.textContent = `${formatNumber(current.cloud_cover, 0)} ${point.currentUnits?.cloud_cover ?? "%"}`;
  dom.selectionPrecipitation.textContent = `${formatNumber(current.precipitation, 1)} ${point.currentUnits?.precipitation ?? "mm"}`;
  dom.selectionDaylight.textContent = current.is_day ? "Giorno" : "Notte";
  renderForecast(point);
}

async function selectCustomPoint(worldPoint) {
  const { lat, lon } = worldPointToLatLon(worldPoint);
  await selectCustomCoordinates(lat, lon);
}

async function selectCustomCoordinates(lat, lon, label = null) {
  const requestId = weatherState.selectionRequestId + 1;
  weatherState.selectionRequestId = requestId;
  weatherState.selectedIndex = null;

  const customPoint = {
    lat,
    lon,
    label: label ?? formatLocationName(lat, lon),
    current: null,
    currentUnits: null,
    daily: null,
    dailyUnits: null
  };

  weatherState.customSelection = customPoint;
  updateSelection(customPoint);
  setStatus("Recupero dati meteo per il punto selezionato...");

  try {
    const payload = await fetchWeatherPoint(lat, lon);
    if (weatherState.selectionRequestId !== requestId) {
      return;
    }

    applyPayloadToPoint(customPoint, payload);
    weatherState.customSelection = customPoint;
    updateSelection(customPoint);
    setStatus("Dati meteo locali aggiornati.");
  } catch (error) {
    console.error(error);
    if (weatherState.selectionRequestId === requestId) {
      setStatus("Impossibile recuperare i dati sul punto selezionato.");
    }
  }
}

function worldPointToLatLon(worldPoint) {
  localPosition.copy(worldPoint);
  globeGroup.worldToLocal(localPosition);
  localPosition.normalize();

  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(localPosition.y, -1, 1)));
  const rawLon = THREE.MathUtils.radToDeg(Math.atan2(-localPosition.z, localPosition.x));
  const lon = THREE.MathUtils.euclideanModulo(rawLon + 180, 360) - 180;

  return { lat, lon };
}

function renderForecast(point) {
  dom.forecastList.textContent = "";
  const daily = point.daily;
  const dailyUnits = point.dailyUnits;
  const days = daily?.time ?? [];

  if (!days.length) {
    const item = document.createElement("li");
    item.textContent = "Previsioni non disponibili per il punto selezionato.";
    dom.forecastList.append(item);
    return;
  }

  days.slice(0, DAILY_FORECAST_DAYS).forEach((day, index) => {
    const code = daily.weather_code?.[index];
    const conditionLabel = WEATHER_CODE_LABELS[code] ?? "Condizione variabile";
    const minTemp = daily.temperature_2m_min?.[index];
    const maxTemp = daily.temperature_2m_max?.[index];
    const rainProbability = daily.precipitation_probability_max?.[index];
    const windMax = daily.wind_speed_10m_max?.[index];
    const sunrise = daily.sunrise?.[index];
    const sunset = daily.sunset?.[index];

    const item = document.createElement("li");
    item.className = "forecast-item";

    const header = document.createElement("div");
    header.className = "forecast-head";

    const dayTag = document.createElement("span");
    dayTag.className = "forecast-day";
    dayTag.textContent = formatForecastDay(day);

    const iconTag = document.createElement("span");
    iconTag.className = "forecast-icon";
    iconTag.textContent = weatherCodeToIcon(code);

    const conditionTag = document.createElement("span");
    conditionTag.className = "forecast-condition";
    conditionTag.textContent = conditionLabel;

    header.append(dayTag, iconTag, conditionTag);

    const metrics = document.createElement("div");
    metrics.className = "forecast-metrics";
    metrics.append(
      createForecastMetric(
        "Temp",
        `${formatNumber(minTemp, 1)} / ${formatNumber(maxTemp, 1)} ${dailyUnits?.temperature_2m_max ?? "°C"}`
      ),
      createForecastMetric(
        "Pioggia",
        `${formatNumber(rainProbability, 0)} ${dailyUnits?.precipitation_probability_max ?? "%"}`
      ),
      createForecastMetric(
        "Vento",
        `${formatNumber(windMax, 1)} ${dailyUnits?.wind_speed_10m_max ?? "km/h"}`
      ),
      createForecastMetric(
        "Sole",
        `${formatClock(sunrise)} / ${formatClock(sunset)}`
      )
    );

    item.append(header, metrics);
    dom.forecastList.append(item);
  });
}

function createForecastMetric(label, value) {
  const chip = document.createElement("div");
  chip.className = "forecast-metric";

  const chipLabel = document.createElement("span");
  chipLabel.className = "forecast-metric-label";
  chipLabel.textContent = label;

  const chipValue = document.createElement("span");
  chipValue.className = "forecast-metric-value";
  chipValue.textContent = value;

  chip.append(chipLabel, chipValue);
  return chip;
}

function formatForecastDay(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function formatNumber(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function formatClock(dateTimeString) {
  if (!dateTimeString) {
    return "-";
  }

  const date = new Date(dateTimeString);
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function weatherCodeToIcon(code) {
  if (code === 0) {
    return "☀️";
  }
  if (code === 1 || code === 2) {
    return "⛅";
  }
  if (code === 3) {
    return "☁️";
  }
  if (code === 45 || code === 48) {
    return "🌫️";
  }
  if (code >= 51 && code <= 67) {
    return "🌧️";
  }
  if (code >= 71 && code <= 77) {
    return "❄️";
  }
  if (code >= 80 && code <= 86) {
    return "🌦️";
  }
  if (code >= 95) {
    return "⛈️";
  }
  return "🌍";
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

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function loadEarthTextures() {
  setStatus("Caricamento texture Terra 8K...");

  try {
    const dayTexture = await textureLoader.loadAsync(EARTH_DAY_TEXTURE_URL);
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.wrapS = THREE.RepeatWrapping;
    dayTexture.wrapT = THREE.ClampToEdgeWrapping;
    dayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    dayTexture.needsUpdate = true;

    setStatus("Generazione rilievi terrestri e oceanici...");
    const terrainMaps = createTerrainMaps(dayTexture.image);
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    terrainMaps.displacementMap.anisotropy = maxAnisotropy;
    terrainMaps.normalMap.anisotropy = maxAnisotropy;
    terrainMaps.roughnessMap.anisotropy = maxAnisotropy;

    earthMaterial.map = dayTexture;
    earthMaterial.displacementMap = terrainMaps.displacementMap;
    earthMaterial.normalMap = terrainMaps.normalMap;
    earthMaterial.roughnessMap = terrainMaps.roughnessMap;
    earthMaterial.normalScale.set(1.35, 1.35);
    earthMaterial.displacementScale = 0.19;
    earthMaterial.displacementBias = -0.095;
    earthMaterial.roughness = 0.78;
    earthMaterial.metalness = 0.02;
    earthMaterial.needsUpdate = true;

    setStatus("Texture Terra fotorealistica con rilievi caricata.");
  } catch (error) {
    console.error(error);
    setStatus("Texture 8K non disponibile. Rimane il rendering base del globo.");
  }
}

function createTerrainMaps(sourceImage) {
  const mapWidth = TERRAIN_MAP_WIDTH;
  const mapHeight = TERRAIN_MAP_HEIGHT;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = mapWidth;
  sourceCanvas.height = mapHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(sourceImage, 0, 0, mapWidth, mapHeight);
  const sourceData = sourceContext.getImageData(0, 0, mapWidth, mapHeight).data;

  const displacementCanvas = document.createElement("canvas");
  displacementCanvas.width = mapWidth;
  displacementCanvas.height = mapHeight;
  const displacementContext = displacementCanvas.getContext("2d");
  const displacementImage = displacementContext.createImageData(mapWidth, mapHeight);
  const displacementData = displacementImage.data;

  const roughnessCanvas = document.createElement("canvas");
  roughnessCanvas.width = mapWidth;
  roughnessCanvas.height = mapHeight;
  const roughnessContext = roughnessCanvas.getContext("2d");
  const roughnessImage = roughnessContext.createImageData(mapWidth, mapHeight);
  const roughnessData = roughnessImage.data;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = mapWidth;
  normalCanvas.height = mapHeight;
  const normalContext = normalCanvas.getContext("2d");
  const normalImage = normalContext.createImageData(mapWidth, mapHeight);
  const normalData = normalImage.data;

  const heights = new Float32Array(mapWidth * mapHeight);

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = y * mapWidth + x;
      const offset = index * 4;
      const r = sourceData[offset] / 255;
      const g = sourceData[offset + 1] / 255;
      const b = sourceData[offset + 2] / 255;
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel - minChannel;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const blueDominance = b - (r * 0.54 + g * 0.46);
      const oceanMask = smoothstep(0.01, 0.22, blueDominance + saturation * 0.28);
      const landMask = 1 - oceanMask;
      const u = x / mapWidth;
      const v = y / mapHeight;
      const continentalNoise = ridgeNoise(u, v, 9.5);
      const mountainNoise = ridgeNoise(u, v, 22.0);
      const oceanRelief = oceanFloorNoise(u, v);
      const landHeight = 0.5 + THREE.MathUtils.clamp((luminance - 0.3) * 1.45, 0, 1) * 0.33;
      const oceanHeight = 0.37 + oceanRelief * 0.13;
      const height = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
          landHeight + continentalNoise * 0.1 + mountainNoise * 0.07,
          oceanHeight,
          oceanMask
        ),
        0,
        1
      );

      heights[index] = height;

      const displacementValue = Math.round(height * 255);
      displacementData[offset] = displacementValue;
      displacementData[offset + 1] = displacementValue;
      displacementData[offset + 2] = displacementValue;
      displacementData[offset + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        0.2 * oceanMask + (0.88 - landHeight * 0.26) * landMask,
        0.14,
        0.95
      );
      const roughnessValue = Math.round(roughness * 255);
      roughnessData[offset] = roughnessValue;
      roughnessData[offset + 1] = roughnessValue;
      roughnessData[offset + 2] = roughnessValue;
      roughnessData[offset + 3] = 255;
    }
  }

  displacementContext.putImageData(displacementImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  for (let y = 0; y < mapHeight; y += 1) {
    const yDown = y === 0 ? y : y - 1;
    const yUp = y === mapHeight - 1 ? y : y + 1;

    for (let x = 0; x < mapWidth; x += 1) {
      const xLeft = x === 0 ? mapWidth - 1 : x - 1;
      const xRight = x === mapWidth - 1 ? 0 : x + 1;
      const index = y * mapWidth + x;
      const offset = index * 4;
      const hL = heights[y * mapWidth + xLeft];
      const hR = heights[y * mapWidth + xRight];
      const hD = heights[yDown * mapWidth + x];
      const hU = heights[yUp * mapWidth + x];
      const nx = -(hR - hL) * 2.4;
      const ny = -(hU - hD) * 2.4;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;

      normalData[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
    }
  }

  normalContext.putImageData(normalImage, 0, 0);

  const displacementMap = new THREE.CanvasTexture(displacementCanvas);
  displacementMap.colorSpace = THREE.NoColorSpace;
  displacementMap.wrapS = THREE.RepeatWrapping;
  displacementMap.wrapT = THREE.ClampToEdgeWrapping;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;

  return { displacementMap, normalMap, roughnessMap };
}

function ridgeNoise(u, v, frequency) {
  const x = u * Math.PI * 2 * frequency;
  const y = v * Math.PI * frequency;
  const waveA = Math.sin(x + Math.cos(y * 0.75) * 0.8);
  const waveB = Math.sin(x * 0.58 - y * 1.9) * 0.42;
  const waveC = Math.cos(x * 1.55 + y * 0.95) * 0.32;
  return Math.abs(waveA * 0.56 + waveB + waveC);
}

function oceanFloorNoise(u, v) {
  const x = u * Math.PI * 2;
  const y = v * Math.PI;
  const ridgeA = Math.sin((x + y * 0.22) * 16);
  const ridgeB = Math.sin((x * 0.64 - y * 1.76) * 12);
  const fault = Math.sin((x * 1.9 + y * 0.95) * 24) * Math.cos((x - y * 1.35) * 9);
  return (ridgeA * 0.4 + ridgeB * 0.33 + fault * 0.27 + 1) * 0.5;
}

function smoothstep(min, max, value) {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }

  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}
