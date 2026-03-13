/**
 * Satellite Visualization Layer
 *
 * Displays satellites at correct orbital altitudes using TLE data from CelesTrak
 * and SGP4 propagation from satellite.js.
 *
 * Features:
 * - InstancedMesh in world space (like moon pattern)
 * - Color by orbit type: LEO=cyan, MEO=green, GEO=orange, HEO=red
 * - ISS: larger, brighter marker
 * - LOD based on camera distance
 * - Click to show orbit path
 * - Recompute positions every 10 seconds
 * - Cache TLE in IndexedDB (24h TTL)
 */

import * as THREE from "three";
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from "satellite.js";
import { scene, camera, globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { saveGeoData, loadGeoData } from "../weather/cacheDB.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";

const EARTH_RADIUS_KM = 6371;
const TLE_CACHE_KEY = "tle_active";
const TLE_TTL = 24 * 60 * 60 * 1000; // 24h
const UPDATE_INTERVAL = 10; // seconds between position updates
const MAX_SATELLITES = 5000;

// TLE sources — active first (large set), stations as fallback
const TLE_URLS = [
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"
];

const _limiter = createFetchLimiter(2);

// State
let _satellites = []; // { satrec, name, isISS }
let _mesh = null;
let _orbitLine = null;
let _lastUpdate = 0;
let _loaded = false;
let _visible = false;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function _parseTLE(text) {
  const lines = text.trim().split("\n").map(l => l.trim());
  const sats = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i + 1]?.[0] === "1" && lines[i + 2]?.[0] === "2") {
      try {
        const satrec = twoline2satrec(lines[i + 1], lines[i + 2]);
        const name = lines[i];
        const isISS = name.includes("ISS") && name.includes("ZARYA");
        sats.push({ satrec, name, isISS });
        i += 2;
      } catch { /* skip malformed */ }
    }
  }
  return sats;
}

function _altitudeKm(satrec, date) {
  const positionAndVelocity = propagate(satrec, date);
  const positionEci = positionAndVelocity.position;
  if (!positionEci) return null;

  const gmst = gstime(date);
  const geo = eciToGeodetic(positionEci, gmst);
  return {
    lat: degreesLat(geo.latitude),
    lon: degreesLong(geo.longitude),
    alt: geo.height // km
  };
}

function _orbitTypeColor(altKm) {
  if (altKm < 2000) {
    _color.setRGB(0.2, 0.85, 1.0); // LEO = cyan
  } else if (altKm < 20000) {
    _color.setRGB(0.2, 0.9, 0.3); // MEO = green
  } else if (altKm > 33000 && altKm < 37000) {
    _color.setRGB(1.0, 0.65, 0.15); // GEO = orange
  } else {
    _color.setRGB(1.0, 0.3, 0.3); // HEO/other = red
  }
}

function _latLonAltToWorld(lat, lon, altKm) {
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

  const geo = new THREE.SphereGeometry(0.02, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    toneMapped: false,
  });

  _mesh = new THREE.InstancedMesh(geo, mat, MAX_SATELLITES);
  _mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_SATELLITES * 3), 3
  );
  _mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  _mesh.frustumCulled = false;
  _mesh.visible = false;
  // World space (not globeGroup) so positions match globe rotation
  scene.add(_mesh);
}

async function _fetchTLEData() {
  // Try IndexedDB cache first
  const cached = await loadGeoData(TLE_CACHE_KEY);
  if (cached) {
    return cached;
  }

  // Fetch from CelesTrak — try active first (large set), then stations as fallback
  for (const url of TLE_URLS) {
    try {
      const resp = await _limiter.fetch(url);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.length > 100) {
        await saveGeoData(TLE_CACHE_KEY, text, TLE_TTL);
        return text;
      }
    } catch { /* try next */ }
  }
  return null;
}

function _getLODCount() {
  const dist = camera.position.distanceTo(globeGroup.position);
  if (dist > 20) return 50;
  if (dist > 10) return 500;
  return MAX_SATELLITES;
}

function _updatePositions() {
  if (!_mesh || _satellites.length === 0) return;

  const now = new Date();
  const maxVisible = _getLODCount();
  const count = Math.min(_satellites.length, maxVisible);

  // Transform: globeGroup's world matrix for correct orientation
  const globeWorldMatrix = globeGroup.matrixWorld;
  const globeQuat = new THREE.Quaternion();
  globeGroup.getWorldQuaternion(globeQuat);
  const globePos = new THREE.Vector3();
  globeGroup.getWorldPosition(globePos);

  let visibleCount = 0;
  for (let i = 0; i < count; i++) {
    const sat = _satellites[i];
    const pos = _altitudeKm(sat.satrec, now);
    if (!pos || pos.alt < 100 || pos.alt > 50000) continue;

    // Position in globe-local space, then transform to world
    const localPos = _latLonAltToWorld(pos.lat, pos.lon, pos.alt);
    localPos.applyMatrix4(globeWorldMatrix);

    const scale = sat.isISS ? 0.06 : 0.02;
    _dummy.position.copy(localPos);
    _dummy.scale.setScalar(scale / 0.02); // relative to base geo radius
    _dummy.updateMatrix();
    _mesh.setMatrixAt(visibleCount, _dummy.matrix);

    _orbitTypeColor(pos.alt);
    if (sat.isISS) _color.setRGB(1.0, 1.0, 0.5); // ISS = bright yellow
    _mesh.instanceColor.setXYZ(visibleCount, _color.r, _color.g, _color.b);

    visibleCount++;
  }

  _mesh.count = visibleCount;
  _mesh.instanceMatrix.needsUpdate = true;
  _mesh.instanceColor.needsUpdate = true;
}

/**
 * Compute and display one full orbit for a satellite.
 */
function _showOrbit(satIndex) {
  if (_orbitLine) {
    scene.remove(_orbitLine);
    _orbitLine.geometry.dispose();
    _orbitLine.material.dispose();
    _orbitLine = null;
  }

  const sat = _satellites[satIndex];
  if (!sat) return;

  // Compute orbital period from mean motion (rev/day)
  const meanMotion = sat.satrec.no * 1440 / (2 * Math.PI); // rev/day
  const periodMin = 1440 / Math.max(meanMotion, 0.1);
  const periodMs = periodMin * 60 * 1000;

  const now = Date.now();
  const points = [];
  const steps = 120;
  const globeWorldMatrix = globeGroup.matrixWorld;

  for (let i = 0; i <= steps; i++) {
    const t = new Date(now + (i / steps) * periodMs);
    const pos = _altitudeKm(sat.satrec, t);
    if (!pos) continue;
    const localPos = _latLonAltToWorld(pos.lat, pos.lon, pos.alt);
    localPos.applyMatrix4(globeWorldMatrix);
    points.push(localPos);
  }

  if (points.length < 2) return;

  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  _orbitLine = new THREE.Line(geo, mat);
  scene.add(_orbitLine);
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function enableSatellites() {
  _visible = true;
  if (!_loaded) {
    _createMesh();
    const tleText = await _fetchTLEData();
    if (tleText) {
      _satellites = _parseTLE(tleText);
      // Sort: ISS first, then by name
      _satellites.sort((a, b) => {
        if (a.isISS) return -1;
        if (b.isISS) return 1;
        return a.name.localeCompare(b.name);
      });
      _loaded = true;
    }
  }
  if (_mesh) {
    _mesh.visible = true;
    _updatePositions();
  }
}

export function disableSatellites() {
  _visible = false;
  if (_mesh) _mesh.visible = false;
  if (_orbitLine) {
    scene.remove(_orbitLine);
    _orbitLine.geometry.dispose();
    _orbitLine.material.dispose();
    _orbitLine = null;
  }
}

/**
 * Call every frame from animate loop.
 * Only recomputes positions every UPDATE_INTERVAL seconds.
 */
export function updateSatellites(time) {
  if (!_visible || !_loaded) return;
  if (time - _lastUpdate > UPDATE_INTERVAL) {
    _lastUpdate = time;
    _updatePositions();
  }
}

export function getSatelliteCount() {
  return _satellites.length;
}
