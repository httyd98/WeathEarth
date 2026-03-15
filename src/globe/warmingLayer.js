/**
 * Warming Layer — country choropleth by temperature anomaly.
 * Extruded country polygons colored by °C anomaly for a selected year.
 * Supports year selection across the WARMING_YEARS timeline.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { COUNTRIES } from "../data/countriesData.js";
import { loadCountryPolygons, getPolygons } from "./countryPolygons.js";
import { WARMING_DATA, WARMING_YEARS } from "../data/hazardsData.js";

const BAR_MAX_H = 0.45;
const BASE_R    = GLOBE_RADIUS;

// Currently selected year (actual calendar year, e.g. 2023)
let _year = 2023;

let _active         = false;
let _meshes         = [];
let _polygonsLoaded = false;
const _color        = new THREE.Color();

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

// ── Color helper ─────────────────────────────────────────────────────────────

function _anomalyColor(anomaly) {
  if (anomaly < 0) {
    _color.set(0x2255ff);         // blue
  } else if (anomaly < 0.5) {
    _color.set(0x88ddff);         // cyan-white
  } else if (anomaly < 1.0) {
    _color.set(0xffdd44);         // yellow
  } else if (anomaly < 1.5) {
    _color.set(0xff8822);         // orange
  } else if (anomaly < 2.0) {
    _color.set(0xff3300);         // red
  } else {
    _color.set(0x880000);         // deep red
  }
}

// ── Data helpers ─────────────────────────────────────────────────────────────

function _getAnomalyForCountry(code) {
  const series = WARMING_DATA[code];
  if (!series) return 0;
  const idx = WARMING_YEARS.indexOf(_year);
  if (idx === -1) return 0;
  return series[idx] ?? 0;
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

  for (let ci = 0; ci < COUNTRIES.length; ci++) {
    const c     = COUNTRIES[ci];
    const polys = getPolygons(c[0]);
    if (!polys) continue;

    const anomaly = _getAnomalyForCountry(c[0]);
    _anomalyColor(anomaly);

    const col    = _color.clone();
    const height = Math.max(0.004, Math.abs(anomaly) / 3 * BAR_MAX_H);

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

export async function enableWarming() {
  _active = true;
  if (!_polygonsLoaded) {
    await loadCountryPolygons();
    _polygonsLoaded = true;
  }
  if (!_active) return;
  _buildMeshes();
  for (const { mesh } of _meshes) mesh.visible = true;
}

export function disableWarming() {
  _active = false;
  for (const { mesh } of _meshes) mesh.visible = false;
}

/** Select a year from WARMING_YEARS and rebuild the visualization */
export function setWarmingYear(year) {
  _year = year;
  if (_active) _buildMeshes();
}

export function getWarmingYear() { return _year; }

export function getWarmingMeshes() {
  return _meshes.map(m => m.mesh);
}

export function getWarmingCountry(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  const yearIndex = WARMING_YEARS.indexOf(_year);
  const anomaly   = _getAnomalyForCountry(c[0]);
  return {
    code:      c[0],
    flag:      c[1],
    name:      c[2],
    lat:       c[3],
    lon:       c[4],
    anomaly,
    yearIndex,
    year:      _year,
  };
}

export { WARMING_YEARS };
