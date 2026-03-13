import * as THREE from "three";
import { globeGroup, camera } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";
import { weatherState } from "../state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const MAX_VEHICLES = 2000;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const VEHICLE_UPDATE_INTERVAL = 2; // seconds between road data refetch checks
const OVERPASS_COOLDOWN = 15; // min seconds between Overpass queries
const SCALE_FACTOR = 200; // exaggeration for vehicle visibility

// Vehicle dimensions in globe units (exaggerated)
const CAR_SIZE = (4.5 / (EARTH_RADIUS_KM * 1000)) * GLOBE_RADIUS * SCALE_FACTOR;

// Road density: vehicles per world unit of road length
const DENSITY_BY_TYPE = {
  motorway: 1 / 0.002,
  trunk: 1 / 0.003,
  primary: 1 / 0.005,
  secondary: 1 / 0.008,
  tertiary: 1 / 0.012,
};

// Speed multipliers (world units / second) — motorway fastest
const SPEED_BY_TYPE = {
  motorway: 0.012,
  trunk: 0.010,
  primary: 0.008,
  secondary: 0.006,
  tertiary: 0.004,
};

// Overlay colors by road type
const OVERLAY_COLORS = {
  motorway: "red",
  trunk: "orange",
  primary: "yellow",
  secondary: "green",
  tertiary: "lightgreen",
};

const OVERLAY_LINE_WIDTHS = {
  motorway: 4,
  trunk: 3,
  primary: 2,
  secondary: 1.5,
  tertiary: 1,
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _vehicles = []; // { roadIdx, segIdx, segT, speed, type, colorR, colorG, colorB }
let _vehicleMesh = null; // InstancedMesh
let _roads = []; // current road data
let _active = false;
let _lastOverpassFetch = 0;
let _lastBbox = "";
let _lastVehicleUpdate = 0;
const _roadCache = new Map();
const _limiter = createFetchLimiter(2);
const _dummy = new THREE.Object3D();
const _raycaster = new THREE.Raycaster();

// Overlay state
let _overlayMesh = null;
let _overlayCanvas = null;
let _overlayTexture = null;
let _overlayBuilt = false;

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function _latLonAltToWorld(lat, lon) {
  const r = GLOBE_RADIUS * 1.003;
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    -(r * sinPhi * Math.cos(theta)),
    r * Math.cos(phi),
    r * sinPhi * Math.sin(theta)
  );
}

function _getCenterLatLon() {
  const ndc = new THREE.Vector2(0, 0);
  _raycaster.setFromCamera(ndc, camera);

  const sphere = new THREE.Sphere(globeGroup.position.clone(), GLOBE_RADIUS);
  const hitPoint = new THREE.Vector3();
  const ray = _raycaster.ray;

  if (!ray.intersectSphere(sphere, hitPoint)) return null;

  const local = globeGroup.worldToLocal(hitPoint.clone());
  const r = local.length();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(local.y / r));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(local.z, -local.x)) - 180;

  return { lat, lon };
}

// ---------------------------------------------------------------------------
// Road data fetching
// ---------------------------------------------------------------------------

async function _fetchRoads(south, west, north, east) {
  const key = `${south.toFixed(3)},${west.toFixed(3)},${north.toFixed(3)},${east.toFixed(3)}`;
  if (_roadCache.has(key)) return _roadCache.get(key);

  const query = `[out:json][timeout:10];way["highway"~"motorway|trunk|primary|secondary|tertiary"](${south},${west},${north},${east});out geom;`;

  try {
    const resp = await _limiter.fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!resp.ok) {
      console.warn(`[trafficLayer] Overpass responded ${resp.status}`);
      return [];
    }

    const json = await resp.json();
    const roads = [];

    for (const el of json.elements || []) {
      if (!el.geometry || el.geometry.length < 2) continue;
      const type = el.tags?.highway || "tertiary";
      const nodes = el.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
      const worldPoints = nodes.map((n) => _latLonAltToWorld(n.lat, n.lon));
      roads.push({ type, nodes, worldPoints });
    }

    _roadCache.set(key, roads);
    return roads;
  } catch (err) {
    console.warn("[trafficLayer] Overpass fetch error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vehicle simulation
// ---------------------------------------------------------------------------

function _getTimeOfDayFactor(lon) {
  const utcHour = new Date().getUTCHours();
  const localHour = ((utcHour + lon / 15) % 24 + 24) % 24;
  // Night: 0-6, 22-24 -> factor 0.3; Day: 7-21 -> factor 1.0
  if (localHour < 6 || localHour >= 22) return 0.3;
  return 1.0;
}

function _roadPathLength(worldPoints) {
  let len = 0;
  for (let i = 0; i < worldPoints.length - 1; i++) {
    len += worldPoints[i].distanceTo(worldPoints[i + 1]);
  }
  return len;
}

function _spawnVehicles(roads) {
  _vehicles = [];

  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    if (road.worldPoints.length < 2) continue;

    const pathLen = _roadPathLength(road.worldPoints);
    if (pathLen < 0.0001) continue;

    const baseDensity = DENSITY_BY_TYPE[road.type] || DENSITY_BY_TYPE.tertiary;
    const avgLon = road.nodes.reduce((s, n) => s + n.lon, 0) / road.nodes.length;
    const timeFactor = _getTimeOfDayFactor(avgLon);
    const count = Math.max(1, Math.round(pathLen * baseDensity * timeFactor));

    for (let v = 0; v < count; v++) {
      if (_vehicles.length >= MAX_VEHICLES) break;

      // Random position along the road
      const totalSegs = road.worldPoints.length - 1;
      const segIdx = Math.floor(Math.random() * totalSegs);
      const segT = Math.random();

      // Speed
      const speed = (SPEED_BY_TYPE[road.type] || SPEED_BY_TYPE.tertiary) * (0.8 + Math.random() * 0.4);

      // Vehicle type and color
      const roll = Math.random();
      let type, colorR, colorG, colorB;

      if (roll < 0.85) {
        // Car — random muted colors
        type = "car";
        colorR = 0.3 + Math.random() * 0.5;
        colorG = 0.3 + Math.random() * 0.5;
        colorB = 0.3 + Math.random() * 0.5;
      } else if (roll < 0.95) {
        // Truck — dark gray
        type = "truck";
        colorR = 0.25;
        colorG = 0.25;
        colorB = 0.28;
      } else {
        // Bus — yellow
        type = "bus";
        colorR = 0.95;
        colorG = 0.85;
        colorB = 0.15;
      }

      _vehicles.push({ roadIdx: ri, segIdx, segT, speed, type, colorR, colorG, colorB });
    }

    if (_vehicles.length >= MAX_VEHICLES) break;
  }
}

function _createVehicleMesh() {
  if (_vehicleMesh) return;

  const geo = new THREE.BoxGeometry(CAR_SIZE, CAR_SIZE * 0.45, CAR_SIZE * 0.33);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  _vehicleMesh = new THREE.InstancedMesh(geo, mat, MAX_VEHICLES);
  _vehicleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _vehicleMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_VEHICLES * 3),
    3
  );
  _vehicleMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  _vehicleMesh.frustumCulled = false;
  _vehicleMesh.count = 0;
  // Add to globeGroup so vehicle positions (in globe-local space) are correct
  globeGroup.add(_vehicleMesh);
}

const _tangent = new THREE.Vector3();

function _updateVehiclePositions(dt) {
  if (!_vehicleMesh || _vehicles.length === 0 || _roads.length === 0) return;

  for (let i = 0; i < _vehicles.length; i++) {
    const v = _vehicles[i];
    const road = _roads[v.roadIdx];
    if (!road || road.worldPoints.length < 2) continue;

    const totalSegs = road.worldPoints.length - 1;

    // Advance
    const segLen = road.worldPoints[v.segIdx].distanceTo(road.worldPoints[v.segIdx + 1]);
    if (segLen > 0) {
      v.segT += (v.speed * dt) / segLen;
    }

    // Move to next segment(s)
    while (v.segT >= 1) {
      v.segT -= 1;
      v.segIdx++;
      if (v.segIdx >= totalSegs) {
        v.segIdx = 0;
        v.segT = 0;
      }
    }

    // Interpolate position
    const a = road.worldPoints[v.segIdx];
    const b = road.worldPoints[v.segIdx + 1];
    if (!a || !b) continue;

    _dummy.position.lerpVectors(a, b, v.segT);

    // Orientation along tangent
    _tangent.subVectors(b, a).normalize();
    _dummy.lookAt(_dummy.position.x + _tangent.x, _dummy.position.y + _tangent.y, _dummy.position.z + _tangent.z);

    // Scale — trucks slightly larger
    const s = v.type === "truck" ? 1.4 : v.type === "bus" ? 1.6 : 1.0;
    _dummy.scale.set(s, s, s);

    _dummy.updateMatrix();
    _vehicleMesh.setMatrixAt(i, _dummy.matrix);

    // Color
    _vehicleMesh.instanceColor.setXYZ(i, v.colorR, v.colorG, v.colorB);
  }

  _vehicleMesh.count = _vehicles.length;
  _vehicleMesh.instanceMatrix.needsUpdate = true;
  _vehicleMesh.instanceColor.needsUpdate = true;
}

function _disposeMesh() {
  if (_vehicleMesh) {
    globeGroup.remove(_vehicleMesh);
    _vehicleMesh.geometry.dispose();
    _vehicleMesh.material.dispose();
    _vehicleMesh = null;
  }
}

// ---------------------------------------------------------------------------
// Globe-level overlay (camDist 8-15)
// ---------------------------------------------------------------------------

function _buildOverlay(roads) {
  if (!_overlayCanvas) {
    _overlayCanvas = document.createElement("canvas");
    _overlayCanvas.width = 4096;
    _overlayCanvas.height = 2048;
  }

  const ctx = _overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, 4096, 2048);

  for (const road of roads) {
    if (road.nodes.length < 2) continue;

    ctx.strokeStyle = OVERLAY_COLORS[road.type] || OVERLAY_COLORS.tertiary;
    ctx.lineWidth = OVERLAY_LINE_WIDTHS[road.type] || 1;
    ctx.beginPath();

    for (let i = 0; i < road.nodes.length; i++) {
      const n = road.nodes[i];
      // Equirectangular projection to canvas
      const x = ((n.lon + 180) / 360) * 4096;
      const y = ((90 - n.lat) / 180) * 2048;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (!_overlayTexture) {
    _overlayTexture = new THREE.CanvasTexture(_overlayCanvas);
    _overlayTexture.wrapS = THREE.ClampToEdgeWrapping;
    _overlayTexture.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    _overlayTexture.needsUpdate = true;
  }

  if (!_overlayMesh) {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.004, 128, 64);
    const mat = new THREE.MeshBasicMaterial({
      map: _overlayTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    _overlayMesh = new THREE.Mesh(geo, mat);
    _overlayMesh.renderOrder = 9;
    globeGroup.add(_overlayMesh);
  }

  _overlayBuilt = true;
}

function _disposeOverlay() {
  if (_overlayMesh) {
    globeGroup.remove(_overlayMesh);
    _overlayMesh.geometry.dispose();
    _overlayMesh.material.dispose();
    _overlayMesh = null;
  }
  if (_overlayTexture) {
    _overlayTexture.dispose();
    _overlayTexture = null;
  }
  _overlayCanvas = null;
  _overlayBuilt = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enableTraffic() {
  _active = true;
  _createVehicleMesh();
}

export function disableTraffic() {
  _active = false;
  _disposeMesh();
  _disposeOverlay();
  _roadCache.clear();
  _vehicles = [];
  _roads = [];
}

export function updateTraffic(dt, camDist) {
  if (!_active) return;

  if (camDist < 8) {
    // --- Close zoom: 3D vehicles on roads ---

    // Hide overlay, show vehicles
    if (_overlayMesh) _overlayMesh.visible = false;
    if (_vehicleMesh) _vehicleMesh.visible = true;

    const now = performance.now() / 1000;

    // Check if we should refetch roads
    if (now - _lastVehicleUpdate >= VEHICLE_UPDATE_INTERVAL) {
      _lastVehicleUpdate = now;

      const center = _getCenterLatLon();
      if (center) {
        const halfDeg = 0.5;
        const south = center.lat - halfDeg;
        const north = center.lat + halfDeg;
        const west = center.lon - halfDeg;
        const east = center.lon + halfDeg;
        const bboxKey = `${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;

        if (bboxKey !== _lastBbox && now - _lastOverpassFetch >= OVERPASS_COOLDOWN) {
          _lastBbox = bboxKey;
          _lastOverpassFetch = now;

          _fetchRoads(south, west, north, east).then((roads) => {
            if (roads.length > 0) {
              _roads = roads;
              _spawnVehicles(roads);
            }
          });
        }
      }
    }

    // Smooth animation every frame
    _updateVehiclePositions(dt);

  } else if (camDist >= 8 && camDist < 15) {
    // --- Medium zoom: colored road overlay ---

    if (_vehicleMesh) _vehicleMesh.visible = false;

    // Fetch roads with a larger bbox for this zoom level
    const now = performance.now() / 1000;
    if (now - _lastVehicleUpdate >= VEHICLE_UPDATE_INTERVAL * 3) {
      _lastVehicleUpdate = now;

      const center = _getCenterLatLon();
      if (center) {
        const halfDeg = 5;
        const south = center.lat - halfDeg;
        const north = center.lat + halfDeg;
        const west = center.lon - halfDeg;
        const east = center.lon + halfDeg;
        const bboxKey = `${south.toFixed(1)},${west.toFixed(1)},${north.toFixed(1)},${east.toFixed(1)}`;

        if (bboxKey !== _lastBbox && now - _lastOverpassFetch >= OVERPASS_COOLDOWN) {
          _lastBbox = bboxKey;
          _lastOverpassFetch = now;
          _overlayBuilt = false;

          _fetchRoads(south, west, north, east).then((roads) => {
            if (roads.length > 0) {
              _roads = roads;
            }
          });
        }
      }
    }

    if (_roads.length > 0) {
      if (!_overlayBuilt) _buildOverlay(_roads);
      if (_overlayMesh) _overlayMesh.visible = true;
    }

  } else {
    // --- Far zoom: hide everything ---
    if (_vehicleMesh) _vehicleMesh.visible = false;
    if (_overlayMesh) _overlayMesh.visible = false;
  }
}

export function getTrafficVehicleCount() {
  return _vehicles.length;
}
