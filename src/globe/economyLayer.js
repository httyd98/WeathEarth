/**
 * Economy Layer — extruded country polygon 3D choropleth.
 *
 * Uses real country borders from world-atlas 110m topojson.
 * Each country is raised by a height proportional to the selected metric.
 * One Mesh per country piece (supports MultiPolygon countries).
 * Meshes are added to globeGroup so they rotate with the globe.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { COUNTRIES } from "../data/countriesData.js";
import { loadCountryPolygons, getPolygons } from "./countryPolygons.js";

const BAR_MAX_H = 0.9;  // max extrusion height (globe units)
const BASE_R    = GLOBE_RADIUS;

const METRICS = {
  gdpB:          { label: "PIB",             idx: 5,    fmt: v => `$${(v/1000).toFixed(1)}T`,        higherIsBetter: true },
  gdpPcUSD:      { label: "PIB pro capite",  idx: 6,    fmt: v => `$${v.toLocaleString()}`,           higherIsBetter: true },
  worldSharePct: { label: "Quota mondiale",  idx: null, fmt: v => `${v.toFixed(2)}%`,                higherIsBetter: true },
  exportB:       { label: "Export",          idx: 8,    fmt: v => `$${v}B`,                           higherIsBetter: true },
  importB:       { label: "Import",          idx: 9,    fmt: v => `$${v}B`,                           higherIsBetter: false },
  gdpGrowthPct:  { label: "Crescita PIL",    idx: 7,    fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, higherIsBetter: true },
};

let _active = false;
let _meshes = [];          // { mesh, countryIndex }[]
let _currentMetric = "gdpB";
let _polygonsLoaded = false;
const _color = new THREE.Color();

// ---------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------

function _latLonToNormal(lat, lon) {
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const s = Math.sin(phi);
  return new THREE.Vector3(-(s * Math.cos(theta)), Math.cos(phi), s * Math.sin(theta));
}

/** Shift all longitudes to be within ±180° of the centroid (unwrap date line). */
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
  if (t < 0.25) {
    _color.setRGB(0.1, 0.4 + t * 2.4, 0.9);
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    _color.setRGB(0.1 + u * 0.3, 0.9 - u * 0.3, 0.9 - u * 0.6);
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    _color.setRGB(0.4 + u * 0.5, 0.7 - u * 0.1, 0.3 - u * 0.2);
  } else {
    const u = (t - 0.75) / 0.25;
    _color.setRGB(0.9 + u * 0.1, 0.6 - u * 0.5, 0.1);
  }
}

/**
 * Build extruded sphere-surface geometry for one polygon ring.
 * outerRing: [[lon,lat],...] — outer boundary
 * height:    radial extrusion in globe units
 */
function _buildPolyGeo(outerRing, height) {
  const ring = _unwrapRing(outerRing);
  // Remove closing duplicate
  const last = ring[ring.length - 1];
  const first = ring[0];
  if (Math.abs(last[0] - first[0]) < 1e-6 && Math.abs(last[1] - first[1]) < 1e-6) {
    ring.pop();
  }
  if (ring.length < 3) return null;

  const R_top  = BASE_R + Math.max(height, 0.005);
  const R_base = BASE_R;

  // Triangulate in lon/lat 2D space
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

  // Top face vertices (extruded)
  for (const [lon, lat] of ring) {
    const n = _latLonToNormal(lat, lon);
    const p = n.clone().multiplyScalar(R_top);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
  }

  // Base face vertices (at surface level — used for side walls)
  for (const [lon, lat] of ring) {
    const n = _latLonToNormal(lat, lon);
    const p = n.clone().multiplyScalar(R_base);
    positions.push(p.x, p.y, p.z);
    normals.push(n.x, n.y, n.z);
  }

  const indices = [];

  // Top face triangles
  for (const [a, b, c] of faces) {
    indices.push(a, b, c);
  }

  // Side wall quads (top perimeter → base perimeter)
  for (let i = 0; i < N; i++) {
    const t0 = i;
    const t1 = (i + 1) % N;
    const b0 = N + i;
    const b1 = N + (i + 1) % N;
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
// Build / rebuild all country meshes
// ---------------------------------------------------------------------------

function _disposeMeshes() {
  for (const { mesh } of _meshes) {
    globeGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  _meshes = [];
}

function _getValue(country, metricKey) {
  if (metricKey === "worldSharePct") return country._worldSharePct ?? 0;
  return country[METRICS[metricKey].idx] ?? 0;
}

function _buildMeshes() {
  _disposeMeshes();

  const metric  = METRICS[_currentMetric];
  const values  = COUNTRIES.map(c => _getValue(c, _currentMetric));
  const colorVals = metric.higherIsBetter ? values : values.map(v => -v);
  const normalized  = _normalize(values);
  const colorNorm   = _normalize(colorVals);

  for (let ci = 0; ci < COUNTRIES.length; ci++) {
    const c     = COUNTRIES[ci];
    const polys = getPolygons(c[0]); // c[0] = ISO2
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

    // Each polygon piece gets its own mesh (supports MultiPolygon countries)
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

export async function enableEconomy() {
  _active = true;
  if (!_polygonsLoaded) {
    await loadCountryPolygons();
    _polygonsLoaded = true;
  }
  if (!_active) return; // disabled while loading
  _buildMeshes();
  for (const { mesh } of _meshes) mesh.visible = true;
}

export function disableEconomy() {
  _active = false;
  for (const { mesh } of _meshes) mesh.visible = false;
}

export function setEconomyMetric(key) {
  if (!METRICS[key]) return;
  _currentMetric = key;
  if (_active) _buildMeshes();
}

export function getEconomyMetric() { return _currentMetric; }

/** Returns all country meshes for raycasting */
export function getEconomyMeshes() {
  return _meshes.map(m => m.mesh);
}

/** Returns country data for a given country index (from mesh.userData.countryIndex) */
export function getEconomyCountry(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  return {
    code: c[0], flag: c[1], name: c[2], lat: c[3], lon: c[4],
    gdpB:          c[5],
    gdpPcUSD:      c[6],
    gdpGrowthPct:  c[7],
    exportB:       c[8],
    importB:       c[9],
    worldSharePct: c._worldSharePct,
  };
}

export function getEconomyCountryPos(countryIndex) {
  const c = COUNTRIES[countryIndex];
  if (!c) return null;
  return _latLonToNormal(c[3], c[4]).multiplyScalar(GLOBE_RADIUS * 1.05);
}

export const ECONOMY_METRICS = METRICS;
