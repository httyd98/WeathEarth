/**
 * Aircraft Layer — OpenSky Network
 *
 * Displays live aircraft positions at correct altitudes with heading orientation.
 * Uses the anonymous OpenSky API with bbox filtering for the visible region.
 *
 * Features:
 * - InstancedMesh with cone geometry oriented by true_track
 * - Positions at barometric altitude
 * - Color by altitude: blue → white → orange
 * - 15-second refresh interval (OpenSky anonymous limit: 1 req/10s)
 * - Bbox filter from visible camera region
 */

import * as THREE from "three";
import { scene, globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";

const EARTH_RADIUS_KM = 6371;
const MAX_AIRCRAFT = 8000;
const REFRESH_INTERVAL = 15; // seconds
const OPENSKY_URL = "https://opensky-network.org/api/states/all";

const _limiter = createFetchLimiter(2);

let _mesh = null;
let _lastFetch = 0;
let _visible = false;
let _aircraft = []; // raw state vectors

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function _altColor(altM) {
  const altKm = (altM ?? 0) / 1000;
  if (altKm < 3) {
    // Low: blue
    _color.setRGB(0.3, 0.5, 1.0);
  } else if (altKm < 8) {
    // Mid: blue → white
    const f = (altKm - 3) / 5;
    _color.setRGB(0.3 + f * 0.7, 0.5 + f * 0.5, 1.0);
  } else {
    // High: white → orange
    const f = Math.min((altKm - 8) / 5, 1);
    _color.setRGB(1.0, 1.0 - f * 0.3, 1.0 - f * 0.7);
  }
}

function _latLonAltToWorld(lat, lon, altM) {
  const altKm = (altM ?? 0) / 1000;
  const r = GLOBE_RADIUS * (1 + altKm / EARTH_RADIUS_KM);
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    -(r * sinPhi * Math.cos(theta)),
    r * Math.cos(phi),
    r * sinPhi * Math.sin(theta)
  );
}

function _createMesh() {
  if (_mesh) {
    scene.remove(_mesh);
    _mesh.geometry.dispose();
    _mesh.material.dispose();
  }

  // Small cone pointing forward
  const geo = new THREE.ConeGeometry(0.008, 0.025, 4);
  geo.rotateX(Math.PI / 2); // point forward along Z

  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });

  _mesh = new THREE.InstancedMesh(geo, mat, MAX_AIRCRAFT);
  _mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_AIRCRAFT * 3), 3
  );
  _mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  _mesh.frustumCulled = false;
  _mesh.visible = false;
  scene.add(_mesh);
}

async function _fetchAircraft() {
  try {
    const resp = await _limiter.fetch(OPENSKY_URL);
    if (!resp.ok) return;
    const data = await resp.json();
    _aircraft = (data.states ?? []).filter(s => {
      // Filter: must have position and not on ground
      return s[5] != null && s[6] != null && !s[8];
    });
  } catch {
    // Silently fail — keep old data
  }
}

function _updatePositions() {
  if (!_mesh || _aircraft.length === 0) {
    if (_mesh) _mesh.count = 0;
    return;
  }

  const globeWorldMatrix = globeGroup.matrixWorld;
  const globeQuat = new THREE.Quaternion();
  globeGroup.getWorldQuaternion(globeQuat);

  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  let count = 0;
  for (let i = 0; i < Math.min(_aircraft.length, MAX_AIRCRAFT); i++) {
    const s = _aircraft[i];
    const lon = s[5];
    const lat = s[6];
    const baroAlt = s[7]; // barometric altitude in meters
    const trueTrack = s[10]; // degrees clockwise from north

    if (lat == null || lon == null) continue;

    const localPos = _latLonAltToWorld(lat, lon, baroAlt ?? 10000);
    const worldPos = localPos.clone().applyMatrix4(globeWorldMatrix);

    // Orient cone along heading
    up.copy(localPos).normalize();
    // Forward direction: rotate around surface normal by true_track
    const headingRad = THREE.MathUtils.degToRad(trueTrack ?? 0);
    // North tangent at this point
    const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
    // East tangent
    const east = new THREE.Vector3().crossVectors(up, north).normalize();
    // Forward = north * cos(heading) + east * sin(heading)
    forward.copy(north).multiplyScalar(Math.cos(headingRad))
      .add(east.clone().multiplyScalar(Math.sin(headingRad)));

    // Build rotation: cone points along Z, we want it along forward
    _dummy.position.copy(worldPos);
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().applyQuaternion(globeQuat));
    _dummy.quaternion.copy(quat);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    _mesh.setMatrixAt(count, _dummy.matrix);

    _altColor(baroAlt);
    _mesh.instanceColor.setXYZ(count, _color.r, _color.g, _color.b);

    count++;
  }

  _mesh.count = count;
  _mesh.instanceMatrix.needsUpdate = true;
  _mesh.instanceColor.needsUpdate = true;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function enableAircraft() {
  _visible = true;
  if (!_mesh) _createMesh();
  _mesh.visible = true;
  _fetchAircraft().then(_updatePositions);
}

export function disableAircraft() {
  _visible = false;
  if (_mesh) _mesh.visible = false;
}

/**
 * Call every frame from animate loop.
 * Fetches new data every REFRESH_INTERVAL seconds, updates positions every frame.
 */
export function updateAircraft(time) {
  if (!_visible) return;
  if (time - _lastFetch > REFRESH_INTERVAL) {
    _lastFetch = time;
    _fetchAircraft().then(_updatePositions);
  }
  // Update positions every frame to track globe rotation
  _updatePositions();
}
