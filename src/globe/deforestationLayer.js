/**
 * Deforestation Layer — country choropleth by deforestation metrics.
 * Extruded country polygons colored/sized by forest cover loss, cause, or trend.
 * Supports modes: "cover", "loss", "cause", "trend".
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { COUNTRIES } from "../data/countriesData.js";
import { loadCountryPolygons, getPolygons } from "./countryPolygons.js";
import {
  DEFORESTATION_DATA,
  DEFORESTATION_CAUSES,
  DEFORESTATION_TRENDS,
} from "../data/hazardsData.js";

const BAR_MAX_H = 0.5;
const BASE_R    = GLOBE_RADIUS;

// Current display mode:
//   "cover" → color/height by forest loss ratio
//   "loss"  → height by annual loss (kha), color by loss ratio
//   "cause" → color by primary deforestation cause
//   "trend" → color by trend direction
let _mode = "cover";

let _active         = false;
let _meshes         = [];
let _polygonsLoaded = false;
const _color        = new THREE.Color();

// Precomputed max annual loss for normalization
let _maxAnnualLoss = 1;

// ── Geometry helpers (identical to religionLayer.js) ────────────────────────

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

function _coverColor(lossRatio) {
  // Green (high cover) → Red (high loss)
  _color.setRGB(lossRatio, 1 - lossRatio * 0.8, 0.1);
}

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

  // Precompute max annual loss (positive only) for normalization
  _maxAnnualLoss = 1;
  for (const d of Object.values(DEFORESTATION_DATA)) {
    if (d.annualLossKha > _maxAnnualLoss) _maxAnnualLoss = d.annualLossKha;
  }

  for (let ci = 0; ci < COUNTRIES.length; ci++) {
    const c     = COUNTRIES[ci];
    const polys = getPolygons(c[0]);
    if (!polys) continue;

    const d = DEFORESTATION_DATA[c[0]];
    if (!d) continue;

    const { forestPct, peakPct, annualLossKha, cause, trend } = d;
    const lossRatio = (peakPct - forestPct) / Math.max(peakPct, 1);

    let height;

    if (_mode === "cover") {
      _coverColor(lossRatio);
      height = lossRatio * BAR_MAX_H;
    } else if (_mode === "loss") {
      _coverColor(lossRatio);
      height = (Math.max(0, annualLossKha) / _maxAnnualLoss) * BAR_MAX_H;
    } else if (_mode === "cause") {
      const meta = DEFORESTATION_CAUSES[cause];
      _color.set(meta ? meta.color : "#888888");
      height = lossRatio * BAR_MAX_H;
    } else if (_mode === "trend") {
      const meta = DEFORESTATION_TRENDS[trend];
      _color.set(meta ? meta.color : "#888888");
      height = lossRatio * BAR_MAX_H;
    } else {
      _coverColor(lossRatio);
      height = lossRatio * BAR_MAX_H;
    }

    const col = _color.clone();
    const h   = Math.max(0.004, height);

    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    for (const polyRings of polys) {
      const outerRing = polyRings[0];
      if (!outerRing || outerRing.length < 3) continue;
      const geo = _buildPolyGeo(outerRing, h);
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

export async function enableDeforestation() {
  _active = true;
  if (!_polygonsLoaded) {
    await loadCountryPolygons();
    _polygonsLoaded = true;
  }
  if (!_active) return;
  _buildMeshes();
  for (const { mesh } of _meshes) mesh.visible = true;
}

export function disableDeforestation() {
  _active = false;
  for (const { mesh } of _meshes) mesh.visible = false;
}

/** Set display mode: "cover" | "loss" | "cause" | "trend" */
export function setDeforestationMode(mode) {
  _mode = mode;
  if (_active) _buildMeshes();
}

export function getDeforestationMode() { return _mode; }

export function getDeforestationMeshes() {
  return _meshes.map(m => m.mesh);
}

export function getDeforestationCountry(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  const d = DEFORESTATION_DATA[c[0]];
  if (!d) return null;
  const { forestPct, peakPct, annualLossKha, cause, trend } = d;
  const causeMeta = DEFORESTATION_CAUSES[cause];
  const trendMeta = DEFORESTATION_TRENDS[trend];
  return {
    code:          c[0],
    flag:          c[1],
    name:          c[2],
    lat:           c[3],
    lon:           c[4],
    forestPct,
    peakPct,
    annualLossKha,
    cause,
    causeLabel:    causeMeta?.label ?? cause,
    trend,
    trendLabel:    trendMeta?.label ?? trend,
    trendColor:    trendMeta?.color ?? "#888888",
  };
}

export { DEFORESTATION_CAUSES, DEFORESTATION_TRENDS };
