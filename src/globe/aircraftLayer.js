/**
 * Aircraft Layer — OpenSky Network
 *
 * Dual-mesh system:
 * - _meshHit:    invisible SphereGeometry InstancedMesh for reliable raycasting
 * - _meshVisual: PlaneGeometry InstancedMesh with PNG airplane icon, oriented by heading
 *
 * Both meshes share the same positions. getAircraftMesh() returns _meshHit for click detection.
 */

import * as THREE from "three";
import { scene, globeGroup, camera, textureLoader } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";
import { weatherState } from "../state.js";

const EARTH_RADIUS_KM = 6371;
const MAX_AIRCRAFT = 8000;
const REFRESH_INTERVAL = 15; // seconds
const OPENSKY_URL = "https://opensky-network.org/api/states/all";
const ICON_SIZE = 0.045; // visual plane size in scene units

const _limiter = createFetchLimiter(2);

let _meshHit = null;    // invisible spheres for raycasting
let _meshVisual = null;  // visible airplane icons
let _iconTexture = null;
let _lastFetch = 0;
let _visible = false;
let _aircraft = []; // raw state vectors
// Maps visible instance index → _aircraft array index
let _visibleToDataIndex = [];

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function _altColor(altM) {
  const altKm = (altM ?? 0) / 1000;
  if (altKm < 3) {
    _color.setRGB(0.4, 0.6, 1.2);
  } else if (altKm < 8) {
    const f = (altKm - 3) / 5;
    _color.setRGB(0.4 + f * 0.8, 0.6 + f * 0.6, 1.2);
  } else {
    const f = Math.min((altKm - 8) / 5, 1);
    _color.setRGB(1.2, 1.2 - f * 0.4, 1.2 - f * 0.9);
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

function _loadIconTexture() {
  if (_iconTexture) return;
  _iconTexture = textureLoader.load("/textures/airplane-icon.png");
  _iconTexture.colorSpace = THREE.SRGBColorSpace;
}

function _createMeshes() {
  _loadIconTexture();

  // Hit mesh: invisible spheres for reliable raycasting
  if (_meshHit) {
    scene.remove(_meshHit);
    _meshHit.geometry.dispose();
    _meshHit.material.dispose();
  }
  const hitGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const hitMat = new THREE.MeshBasicMaterial({
    visible: false, // invisible but raycastable
  });
  _meshHit = new THREE.InstancedMesh(hitGeo, hitMat, MAX_AIRCRAFT);
  _meshHit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _meshHit.frustumCulled = false;
  scene.add(_meshHit);

  // Visual mesh: airplane icon on PlaneGeometry
  if (_meshVisual) {
    scene.remove(_meshVisual);
    _meshVisual.geometry.dispose();
    _meshVisual.material.dispose();
  }
  const visGeo = new THREE.PlaneGeometry(ICON_SIZE, ICON_SIZE);
  const visMat = new THREE.MeshBasicMaterial({
    map: _iconTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  _meshVisual = new THREE.InstancedMesh(visGeo, visMat, MAX_AIRCRAFT);
  _meshVisual.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _meshVisual.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_AIRCRAFT * 3), 3
  );
  _meshVisual.instanceColor.setUsage(THREE.DynamicDrawUsage);
  _meshVisual.frustumCulled = false;
  _meshVisual.visible = false;
  scene.add(_meshVisual);
}

async function _fetchAircraft() {
  try {
    const resp = await _limiter.fetch(OPENSKY_URL);
    if (!resp.ok) return;
    const data = await resp.json();
    _aircraft = (data.states ?? []).filter(s => {
      return s[5] != null && s[6] != null && !s[8];
    });
  } catch {
    // Silently fail — keep old data
  }
}

function _updatePositions() {
  if (!_meshHit || !_meshVisual || _aircraft.length === 0) {
    if (_meshHit) _meshHit.count = 0;
    if (_meshVisual) _meshVisual.count = 0;
    return;
  }

  const globeWorldMatrix = globeGroup.matrixWorld;
  const globeQuat = new THREE.Quaternion();
  globeGroup.getWorldQuaternion(globeQuat);

  // Camera direction for billboard orientation
  const camPos = camera.position.clone();


  _visibleToDataIndex = [];
  let count = 0;

  for (let i = 0; i < Math.min(_aircraft.length, MAX_AIRCRAFT); i++) {
    const s = _aircraft[i];
    const lon = s[5];
    const lat = s[6];
    const baroAlt = s[7];
    const trueTrack = s[10];

    if (lat == null || lon == null) continue;

    const localPos = _latLonAltToWorld(lat, lon, baroAlt ?? 10000);
    const worldPos = localPos.clone().applyMatrix4(globeWorldMatrix);

    // ── Hit mesh (sphere, no rotation needed) ──
    _dummy.position.copy(worldPos);
    _dummy.scale.setScalar(1);
    _dummy.quaternion.identity();
    _dummy.updateMatrix();
    _meshHit.setMatrixAt(count, _dummy.matrix);

    // ── Visual mesh (billboard facing camera, rotated by heading) ──
    // Simple billboard: make plane face the camera, then rotate by heading
    _dummy.position.copy(worldPos);
    _dummy.lookAt(camPos);
    // Apply heading rotation around the local Z axis (which now points at camera)
    const headingRad = THREE.MathUtils.degToRad(-(trueTrack ?? 0));
    _dummy.rotateZ(headingRad);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    _meshVisual.setMatrixAt(count, _dummy.matrix);

    // Color by altitude + filter dimming
    _altColor(baroAlt);
    const altKm = (baroAlt ?? 0) / 1000;
    const band = altKm < 3 ? "low" : altKm < 8 ? "mid" : "high";
    const dim = weatherState.aircraftFilters[band] ? 1.0 : 0.15;
    _meshVisual.instanceColor.setXYZ(count, _color.r * dim, _color.g * dim, _color.b * dim);

    _visibleToDataIndex.push(i);
    count++;
  }

  _meshHit.count = count;
  _meshVisual.count = count;
  _meshHit.instanceMatrix.needsUpdate = true;
  _meshVisual.instanceMatrix.needsUpdate = true;
  _meshVisual.instanceColor.needsUpdate = true;
  // Recompute bounding spheres so raycasting works with updated positions
  _meshHit.computeBoundingSphere();
}

// ── Public API ──────────────────────────────────────────────────────────────

export function enableAircraft() {
  _visible = true;
  if (!_meshHit) _createMeshes();
  // Hit mesh stays always "visible" to Three.js (material.visible=false handles rendering)
  // Only toggle the visual mesh
  _meshVisual.visible = true;
  _fetchAircraft().then(_updatePositions);
}

export function disableAircraft() {
  _visible = false;
  if (_meshHit) _meshHit.count = 0; // hide by zeroing count, keep mesh visible for cleanup
  if (_meshVisual) _meshVisual.visible = false;
}

let _lastVisualUpdate = 0;
const VISUAL_UPDATE_INTERVAL = 0.5; // seconds — billboard reorientation

export function updateAircraft(time) {
  if (!_visible) return;
  if (time - _lastFetch > REFRESH_INTERVAL) {
    _lastFetch = time;
    _fetchAircraft().then(_updatePositions);
  }
  // Only update billboard orientations periodically (not every frame)
  if (time - _lastVisualUpdate > VISUAL_UPDATE_INTERVAL) {
    _lastVisualUpdate = time;
    _updatePositions();
  }
}

export function getAircraftCount() {
  return _aircraft.length;
}

/** Returns the invisible hit mesh for raycasting */
export function getAircraftMesh() {
  return _meshHit;
}

/**
 * Returns aircraft data for a given instance index.
 * Uses the visible→data mapping to get the correct aircraft.
 */
export function getAircraftData(instanceIndex) {
  const dataIdx = _visibleToDataIndex[instanceIndex];
  if (dataIdx == null || dataIdx < 0 || dataIdx >= _aircraft.length) return null;
  const s = _aircraft[dataIdx];
  return {
    icao24: s[0],
    callsign: (s[1] ?? "").trim(),
    originCountry: s[2],
    lon: s[5],
    lat: s[6],
    baroAltitude: s[7],
    onGround: s[8],
    velocity: s[9],
    trueTrack: s[10],
    verticalRate: s[11],
    geoAltitude: s[13],
    squawk: s[14],
  };
}

/**
 * Projects a great-circle route forward from an aircraft's current position.
 * Returns an array of 10 THREE.Vector3 points in world space (~500 km total).
 * @param {number} instanceIndex - visible instance index
 * @returns {THREE.Vector3[]|null}
 */
export function getAircraftProjectedRoute(instanceIndex) {
  const dataIdx = _visibleToDataIndex[instanceIndex];
  if (dataIdx == null || dataIdx < 0 || dataIdx >= _aircraft.length) return null;

  const s = _aircraft[dataIdx];
  const lat = s[6];
  const lon = s[5];
  const bearing = s[10]; // trueTrack in degrees
  const altM = s[7] ?? 10000;

  if (lat == null || lon == null || bearing == null) return null;

  const R = EARTH_RADIUS_KM; // 6371 km
  const totalDist = 8000; // km — approximate full remaining flight
  const numPoints = 80;
  const stepDist = totalDist / numPoints;

  const lat1 = THREE.MathUtils.degToRad(lat);
  const lon1 = THREE.MathUtils.degToRad(lon);
  const brng = THREE.MathUtils.degToRad(bearing);

  // Include current position as first point
  const points = [_latLonAltToWorld(lat, lon, altM).applyMatrix4(globeGroup.matrixWorld)];

  for (let i = 1; i <= numPoints; i++) {
    const d = stepDist * i;
    const dOverR = d / R;

    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDR = Math.sin(dOverR);
    const cosDR = Math.cos(dOverR);

    const lat2 = Math.asin(
      sinLat1 * cosDR + cosLat1 * sinDR * Math.cos(brng)
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * sinDR * cosLat1,
        cosDR - sinLat1 * Math.sin(lat2)
      );

    const latDeg = THREE.MathUtils.radToDeg(lat2);
    const lonDeg = THREE.MathUtils.radToDeg(lon2);

    const localPos = _latLonAltToWorld(latDeg, lonDeg, altM);
    const worldPos = localPos.applyMatrix4(globeGroup.matrixWorld);
    points.push(worldPos);
  }

  return points;
}
