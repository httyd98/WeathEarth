/**
 * Anthropology Layer — extruded country polygon 3D choropleth.
 *
 * Same visual approach as economyLayer.js (polygon extrusion via world-atlas 110m).
 * Shows: population, birth rate, gender ratio, median age, age distribution.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { COUNTRIES } from "../data/countriesData.js";
import { loadCountryPolygons, getPolygons } from "./countryPolygons.js";

const BAR_MAX_H = 0.9;
const BASE_R    = GLOBE_RADIUS;

const METRICS = {
  popM:       { label: "Popolazione",    idx: 10, fmt: v => `${v.toFixed(1)}M`,      higherIsBetter: null },
  birthRate:  { label: "Tasso natalità", idx: 11, fmt: v => `${v.toFixed(1)}/1000`,  higherIsBetter: null },
  malePct:    { label: "% Maschi",       idx: 12, fmt: v => `${v.toFixed(1)}%`,      higherIsBetter: null },
  medianAge:  { label: "Età mediana",    idx: 13, fmt: v => `${v.toFixed(1)} anni`,  higherIsBetter: null },
  u14pct:     { label: "0–14 anni %",   idx: 14, fmt: v => `${v.toFixed(1)}%`,      higherIsBetter: null },
  plus65pct:  { label: "65+ anni %",    idx: 16, fmt: v => `${v.toFixed(1)}%`,      higherIsBetter: null },
};

let _active = false;
let _meshes = [];
let _currentMetric = "popM";
let _polygonsLoaded = false;
const _color = new THREE.Color();

// ---------------------------------------------------------------------------
// Helpers (shared logic with economyLayer)
// ---------------------------------------------------------------------------

function _latLonToNormal(lat, lon) {
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const s = Math.sin(phi);
  return new THREE.Vector3(-(s * Math.cos(theta)), Math.cos(phi), s * Math.sin(theta));
}

function _unwrapRing(ring) {
  let sumLon = 0;
  for (const [lon] of ring) sumLon += lon;
  const center = sumLon / ring.length;
  return ring.map(([lon, lat]) => {
    let l = lon;
    while (l - center > 180) l -= 360;
    while (center - l > 180) l += 360;
    return [l, lat];
  });
}

function _normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => (v - min) / range);
}

function _gradientColor(t) {
  // Purple (low) → teal → green → yellow → orange (high)
  if (t < 0.33) {
    const u = t / 0.33;
    _color.setRGB(0.5 - u * 0.4, 0.2 + u * 0.6, 0.8 - u * 0.1);
  } else if (t < 0.66) {
    const u = (t - 0.33) / 0.33;
    _color.setRGB(0.1 + u * 0.5, 0.8 - u * 0.1, 0.7 - u * 0.5);
  } else {
    const u = (t - 0.66) / 0.34;
    _color.setRGB(0.6 + u * 0.4, 0.7 - u * 0.4, 0.2 - u * 0.1);
  }
}

function _buildPolyGeo(outerRing, height) {
  const ring = _unwrapRing(outerRing);
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (Math.abs(last[0] - first[0]) < 1e-6 && Math.abs(last[1] - first[1]) < 1e-6) {
    ring.pop();
  }
  if (ring.length < 3) return null;

  const R_top  = BASE_R + Math.max(height, 0.005);
  const R_base = BASE_R;

  let faces;
  try {
    const contour2D = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    faces = THREE.ShapeUtils.triangulateShape(contour2D, []);
  } catch {
    return null;
  }
  if (!faces || faces.length === 0) return null;

  const N = ring.length;
  const positions = [];
  const normals   = [];

  for (const [lon, lat] of ring) {
    const n = _latLonToNormal(lat, lon);
    const p = n.clone().multiplyScalar(R_top);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
  }

  for (const [lon, lat] of ring) {
    const n = _latLonToNormal(lat, lon);
    const p = n.clone().multiplyScalar(R_base);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
  }

  const indices = [];
  for (const [a, b, c] of faces) indices.push(a, b, c);

  for (let i = 0; i < N; i++) {
    const t0 = i, t1 = (i + 1) % N;
    const b0 = N + i, b1 = N + (i + 1) % N;
    indices.push(t0, b0, t1);
    indices.push(t1, b0, b1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Build / rebuild
// ---------------------------------------------------------------------------

function _disposeMeshes() {
  for (const { mesh } of _meshes) {
    globeGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  _meshes = [];
}

function _buildMeshes() {
  _disposeMeshes();

  const values     = COUNTRIES.map(c => c[METRICS[_currentMetric].idx] ?? 0);
  const normalized = _normalize(values);
  const colorNorm  = _normalize(values);

  for (let ci = 0; ci < COUNTRIES.length; ci++) {
    const c     = COUNTRIES[ci];
    const polys = getPolygons(c[0]);
    if (!polys) continue;

    const height = Math.max(0.01, normalized[ci] * BAR_MAX_H);
    _gradientColor(colorNorm[ci]);
    const col = _color.clone();

    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.55,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    for (const polyRings of polys) {
      const outerRing = polyRings[0];
      if (!outerRing || outerRing.length < 3) continue;

      const geo = _buildPolyGeo(outerRing, height);
      if (!geo) continue;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.countryIndex = ci;
      mesh.renderOrder = 10;
      globeGroup.add(mesh);
      _meshes.push({ mesh, countryIndex: ci });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function enableAnthropology() {
  _active = true;
  if (!_polygonsLoaded) {
    await loadCountryPolygons();
    _polygonsLoaded = true;
  }
  if (!_active) return; // disabled while loading
  _buildMeshes();
  for (const { mesh } of _meshes) mesh.visible = true;
}

export function disableAnthropology() {
  _active = false;
  for (const { mesh } of _meshes) mesh.visible = false;
}

export function setAnthroMetric(key) {
  if (!METRICS[key]) return;
  _currentMetric = key;
  if (_active) _buildMeshes();
}

export function getAnthroMetric() { return _currentMetric; }

export function getAnthroMeshes() {
  return _meshes.map(m => m.mesh);
}

export function getAnthroCountry(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  return {
    code: c[0], flag: c[1], name: c[2], lat: c[3], lon: c[4],
    popM:       c[10],
    birthRate:  c[11],
    malePct:    c[12],
    femalePct:  100 - c[12],
    medianAge:  c[13],
    u14pct:     c[14],
    mid1564pct: c[15],
    plus65pct:  c[16],
  };
}

export function getAnthroCountryPos(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  return _latLonToNormal(c[3], c[4]).multiplyScalar(GLOBE_RADIUS * 1.05);
}

export const ANTHRO_METRICS = METRICS;
