/**
 * Energy Layer — per-country electricity production choropleth.
 * Extruded country polygons colored by dominant energy source or specific source intensity.
 * Data: COUNTRY_ENERGY from energyData.js
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { COUNTRIES } from "../data/countriesData.js";
import { loadCountryPolygons, getPolygons } from "./countryPolygons.js";
import { COUNTRY_ENERGY, ENERGY_SOURCES, dominantEnergy } from "../data/energyData.js";

const BAR_MAX_H = 0.55;
const BASE_R    = GLOBE_RADIUS;

// Current display mode:
//   "dominant" → color by dominant energy source, height = TWh (normalized)
//   <key>       → color by intensity of that specific source across all countries
let _mode = "dominant";

let _active         = false;
let _meshes         = [];
let _polygonsLoaded = false;
const _color        = new THREE.Color();

// ── Geometry helpers (same pattern as religionLayer.js) ─────────────────────

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
    while (l - center >  180) l -= 360;
    while (center - l >  180) l += 360;
    return [l, lat];
  });
}

function _buildPolyGeo(outerRing, height) {
  const ring = _unwrapRing(outerRing);
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (Math.abs(last[0] - first[0]) < 1e-6 && Math.abs(last[1] - first[1]) < 1e-6) ring.pop();
  if (ring.length < 3) return null;

  const R_top  = BASE_R + Math.max(height, 0.004);
  const R_base = BASE_R;

  let faces;
  try {
    const c2D = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    faces = THREE.ShapeUtils.triangulateShape(c2D, []);
  } catch { return null; }
  if (!faces?.length) return null;

  const N = ring.length;
  const positions = [], normals = [];

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
    indices.push(t0, b0, t1, t1, b0, b1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal",   new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// ── Color helpers ────────────────────────────────────────────────────────────

function _sourceColor(sourceKey) {
  const src = ENERGY_SOURCES[sourceKey];
  if (src) {
    _color.set(src.color);
  } else {
    _color.set(0x888888);
  }
}

function _intensityColor(t) {
  // Low (gray) → medium (yellow) → high (dominant source color)
  if (t < 0.5) {
    const u = t / 0.5;
    _color.setRGB(0.2 + u * 0.8, 0.2 + u * 0.7, 0.2 * (1 - u));
  } else {
    const u = (t - 0.5) / 0.5;
    _color.setRGB(1, 1 - u * 0.85, 0);
  }
}

// Precompute max TWh for normalization
const _maxTwh = Math.max(...Object.values(COUNTRY_ENERGY).map(d => d.twh));

// ── Build / dispose ──────────────────────────────────────────────────────────

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

  // Precompute per-country values for current mode
  const values = COUNTRIES.map(c => {
    const en = COUNTRY_ENERGY[c[0]];
    if (!en) return 0;
    if (_mode === "dominant") {
      const dom = dominantEnergy(en.mix);
      return (en.mix?.[dom] ?? 0) / 100;
    } else {
      return (en.mix?.[_mode] ?? 0) / 100;
    }
  });

  for (let ci = 0; ci < COUNTRIES.length; ci++) {
    const c     = COUNTRIES[ci];
    const polys = getPolygons(c[0]);
    if (!polys) continue;

    const en  = COUNTRY_ENERGY[c[0]];
    const val = values[ci];

    if (_mode === "dominant") {
      if (en) {
        const dom = dominantEnergy(en.mix);
        _sourceColor(dom);
      } else {
        _color.set(0x334455);
      }
    } else {
      _intensityColor(val);
    }

    const col    = _color.clone();
    // Height: in dominant mode, scale by log(TWh)/log(maxTwh) for better visual range
    let height;
    if (_mode === "dominant") {
      const twh = en?.twh ?? 0;
      height = twh > 0 ? (Math.log(twh + 1) / Math.log(_maxTwh + 1)) * BAR_MAX_H : 0.004;
    } else {
      height = Math.max(0.004, val * BAR_MAX_H);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.45,
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

// ── Public API ───────────────────────────────────────────────────────────────

export async function enableEnergy() {
  _active = true;
  if (!_polygonsLoaded) {
    await loadCountryPolygons();
    _polygonsLoaded = true;
  }
  if (!_active) return;
  _buildMeshes();
  for (const { mesh } of _meshes) mesh.visible = true;
}

export function disableEnergy() {
  _active = false;
  for (const { mesh } of _meshes) mesh.visible = false;
}

/** Set display mode: "dominant" | energy source key from ENERGY_SOURCES */
export function setEnergyMode(mode) {
  _mode = mode;
  if (_active) _buildMeshes();
}

export function getEnergyMode() { return _mode; }

export function getEnergyMeshes() {
  return _meshes.map(m => m.mesh);
}

export function getEnergyCountry(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  const en  = COUNTRY_ENERGY[c[0]];
  const dom = en ? dominantEnergy(en.mix) : null;
  return {
    code: c[0],
    flag: c[1],
    name: c[2],
    lat:  c[3],
    lon:  c[4],
    twh:  en?.twh ?? null,
    dom,
    domLabel:  dom ? (ENERGY_SOURCES[dom]?.label ?? dom) : "Nessun dato",
    domColor:  dom ? (ENERGY_SOURCES[dom]?.color ?? "#888") : "#888",
    breakdown: en?.mix ?? {},
  };
}

export { ENERGY_SOURCES };
