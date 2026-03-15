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
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from "satellite.js";
import { scene, camera, globeGroup, renderer } from "./scene.js";
import { weatherState } from "../state.js";
import { GLOBE_RADIUS } from "../constants.js";
import { saveGeoData, loadGeoData } from "../weather/cacheDB.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";

const EARTH_RADIUS_KM = 6371;
const TLE_CACHE_KEY = "tle_all_groups";
const TLE_TTL = 24 * 60 * 60 * 1000; // 24h
const UPDATE_INTERVAL = 10; // seconds between position updates
const MAX_SATELLITES = 15000;

// TLE sources — fetch multiple groups and merge with deduplication
const TLE_URLS = [
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=analyst&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle",
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
let _currentLODCount = 0; // hysteresis: current LOD level
// Maps visible instance index → _satellites array index
let _visibleToSatIndex = [];
let _hoveredInstance = -1; // currently hovered instance (-1 = none)
let _selectedSatIndex = -1; // satellite with active orbit line

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
    _color.setRGB(0.6, 1.4, 1.4); // LEO = very bright cyan (>1 for HDR bloom)
  } else if (altKm < 20000) {
    _color.setRGB(0.6, 1.4, 0.7); // MEO = very bright green
  } else if (altKm > 33000 && altKm < 37000) {
    _color.setRGB(1.4, 1.0, 0.4); // GEO = very bright orange
  } else {
    _color.setRGB(1.4, 0.6, 0.6); // HEO/other = very bright red
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

  // Larger base geometry for easier click targeting (bounding sphere used by raycaster)
  const geo = new THREE.SphereGeometry(0.07, 8, 8);
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

  // Fetch all TLE groups in parallel, merge and deduplicate
  const results = await Promise.allSettled(
    TLE_URLS.map(url =>
      _limiter.fetch(url).then(resp => resp.ok ? resp.text() : "")
    )
  );

  const allText = results
    .filter(r => r.status === "fulfilled" && r.value.length > 100)
    .map(r => r.value);

  if (allText.length === 0) return null;

  // Parse all, deduplicate by NORAD catalog number (satnum), then rebuild TLE text
  const seen = new Set();
  const dedupedLines = [];
  for (const text of allText) {
    const lines = text.trim().split("\n").map(l => l.trim());
    for (let i = 0; i < lines.length - 2; i++) {
      if (lines[i + 1]?.[0] === "1" && lines[i + 2]?.[0] === "2") {
        // Extract NORAD catalog number from line 2 columns 3-7
        const satnum = lines[i + 2].substring(2, 7).trim();
        if (!seen.has(satnum)) {
          seen.add(satnum);
          dedupedLines.push(lines[i], lines[i + 1], lines[i + 2]);
        }
        i += 2;
      }
    }
  }

  const merged = dedupedLines.join("\n");
  if (merged.length > 100) {
    await saveGeoData(TLE_CACHE_KEY, merged, TLE_TTL);
  }
  return merged;
}

function _getLODCount() {
  // No LOD — always render all satellites to avoid pop-in/pop-out artefacts
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

  _visibleToSatIndex = [];
  let visibleCount = 0;
  for (let i = 0; i < count; i++) {
    const sat = _satellites[i];
    const pos = _altitudeKm(sat.satrec, now);
    if (!pos || pos.alt < 100 || pos.alt > 60000) continue;

    // Position in globe-local space, then transform to world
    const localPos = _latLonAltToWorld(pos.lat, pos.lon, pos.alt);
    localPos.applyMatrix4(globeWorldMatrix);

    // ISS largest, GEO/HEO bigger than LEO for visibility at distance
    const isHovered = visibleCount === _hoveredInstance;
    const isSelected = i === _selectedSatIndex;
    const baseScale = sat.isISS ? 0.09 : pos.alt > 20000 ? 0.07 : 0.05;
    const scale = isSelected ? baseScale * 4.0 : isHovered ? baseScale * 2.0 : baseScale;
    _dummy.position.copy(localPos);
    _dummy.scale.setScalar(scale / 0.07);
    _dummy.updateMatrix();
    _mesh.setMatrixAt(visibleCount, _dummy.matrix);

    _orbitTypeColor(pos.alt);
    if (sat.isISS) _color.setRGB(1.5, 1.5, 0.7);
    // Selected: bright white-yellow so it stands out from orbit line
    if (isSelected) {
      _color.setRGB(2.0, 2.0, 0.5);
    } else if (isHovered) {
      _color.r = Math.min(2.0, _color.r * 1.6);
      _color.g = Math.min(2.0, _color.g * 1.6);
      _color.b = Math.min(2.0, _color.b * 1.6);
    }
    // Filter dimming by orbit type
    const f = weatherState.satelliteFilters;
    const orbitBand = pos.alt < 2000 ? "leo" : pos.alt < 20000 ? "meo" : (pos.alt > 33000 && pos.alt < 37000) ? "geo" : "heo";
    const dim = f[orbitBand] ? 1.0 : 0.12;
    _mesh.instanceColor.setXYZ(visibleCount, _color.r * dim, _color.g * dim, _color.b * dim);

    _visibleToSatIndex.push(i);
    visibleCount++;
  }

  _mesh.count = visibleCount;
  _mesh.instanceMatrix.needsUpdate = true;
  _mesh.instanceColor.needsUpdate = true;
  // Recompute bounding sphere so raycasting works with updated positions
  _mesh.computeBoundingSphere();
}

/**
 * Compute and display one full orbit for a satellite.
 */
function _showOrbit(satIndex) {
  disposeOrbitLine();
  _selectedSatIndex = satIndex;

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

  // Use Line2 for actual thick lines (LineBasicMaterial linewidth >1 is not supported in WebGL)
  const positions = [];
  for (const p of points) {
    positions.push(p.x, p.y, p.z);
  }
  const geo = new LineGeometry();
  geo.setPositions(positions);
  const mat = new LineMaterial({
    color: 0xffee44,   // bright yellow — distinguishable from cyan/blue satellites
    linewidth: 4,      // pixels
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  _orbitLine = new Line2(geo, mat);
  _orbitLine.computeLineDistances();
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
  disposeOrbitLine();
}

/** Re-fetch TLE data, merge by NORAD ID (keep existing satellites without a match). */
export async function refreshSatellites() {
  if (!_visible) return;
  const tleText = await _fetchTLEData();
  if (!tleText) return;
  const fresh = _parseTLE(tleText);
  // Build lookup by NORAD ID from fresh data
  const freshMap = new Map(fresh.map(s => [s.satrec.satnum, s]));
  // Replace matching, keep orphans
  _satellites = _satellites.map(old => freshMap.get(old.satrec.satnum) ?? old);
  // Add brand-new satellites not previously tracked
  for (const s of fresh) {
    if (!_satellites.find(o => o.satrec.satnum === s.satrec.satnum)) {
      _satellites.push(s);
    }
  }
  _updatePositions();
}

export function disposeOrbitLine() {
  if (_orbitLine) {
    scene.remove(_orbitLine);
    _orbitLine.geometry?.dispose();
    _orbitLine.material?.dispose();
    _orbitLine = null;
  }
  _selectedSatIndex = -1;
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

/** Returns the InstancedMesh for raycasting */
export function getSatelliteMesh() {
  return _mesh;
}

/** Returns satellite data for a given visible instance index */
export function getSatelliteData(instanceIndex) {
  const satIdx = _visibleToSatIndex[instanceIndex];
  if (satIdx == null || satIdx < 0 || satIdx >= _satellites.length) return null;
  const sat = _satellites[satIdx];
  const pos = _altitudeKm(sat.satrec, new Date());
  // Orbital period from mean motion (rev/day)
  const meanMotion = sat.satrec.no * 1440 / (2 * Math.PI); // rev/day
  const periodMin = meanMotion > 0 ? 1440 / meanMotion : null;
  // Orbital velocity (approximate: v = sqrt(GM/r))
  const rKm = pos ? (EARTH_RADIUS_KM + pos.alt) : null;
  const velocityKmS = rKm ? Math.sqrt(398600.4418 / rKm) : null;
  // Orbit type
  const alt = pos?.alt ?? 0;
  const orbitType = alt < 2000 ? "LEO" : alt < 20000 ? "MEO" : (alt > 33000 && alt < 37000) ? "GEO" : "HEO";
  // Inclination from satrec (radians → degrees)
  const inclinationDeg = sat.satrec.inclo != null ? (sat.satrec.inclo * 180 / Math.PI) : null;
  // Epoch year from satrec
  const epochYear = sat.satrec.epochyr != null ? (sat.satrec.epochyr < 57 ? 2000 + sat.satrec.epochyr : 1900 + sat.satrec.epochyr) : null;

  return {
    name: sat.name,
    isISS: sat.isISS,
    noradId: sat.satrec?.satnum,
    altitude: pos?.alt ?? null,
    lat: pos?.lat ?? null,
    lon: pos?.lon ?? null,
    velocityKmS,
    periodMin,
    orbitType,
    inclinationDeg,
    epochYear,
  };
}

/** Shows the orbit for a given visible instance index */
export function showSatelliteOrbit(instanceIndex) {
  const satIdx = _visibleToSatIndex[instanceIndex];
  if (satIdx != null) _showOrbit(satIdx);
}

/** Set hovered instance index (triggers visual highlight on next update) */
export function setHoveredSatellite(instanceIndex) {
  if (_hoveredInstance !== instanceIndex) {
    _hoveredInstance = instanceIndex;
    // Force immediate visual update for responsive hover
    if (_visible && _loaded) _updatePositions();
  }
}
