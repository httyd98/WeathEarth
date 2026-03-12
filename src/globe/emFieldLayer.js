/**
 * Electromagnetic Field Visualization
 *
 * Uses an analytical tilted magnetic dipole model for clean pole-to-pole field lines,
 * with the `geomagnetism` package (WMM2025) providing real field intensity for coloring.
 *
 * The Earth's magnetic dipole axis is tilted ~11.5° from the rotation axis.
 * Field lines follow the dipole equation: r = L·R·sin²(θ), where L is the
 * equatorial crossing distance in Earth radii and θ is colatitude from the dipole axis.
 *
 * Only computed when the feature is toggled visible — no background work.
 */

import * as THREE from "three";
import geomagnetism from "geomagnetism";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

// ── Constants ────────────────────────────────────────────────────────────────
const R = GLOBE_RADIUS; // 4.2 scene units

// Magnetic dipole axis — geomagnetic north pole at ~80.7°N, 72.6°W (WMM2025 approx)
const MAG_POLE_LAT = 80.7 * (Math.PI / 180);
const MAG_POLE_LON = -72.6 * (Math.PI / 180);

// Dipole axis unit vector in scene space (points toward geomagnetic north)
const DIPOLE_AXIS = new THREE.Vector3(
  Math.cos(MAG_POLE_LAT) * Math.cos(MAG_POLE_LON),
  Math.sin(MAG_POLE_LAT),
  -Math.cos(MAG_POLE_LAT) * Math.sin(MAG_POLE_LON)
).normalize();

// L-shell values: how far each field line extends at the magnetic equator (in Earth radii)
// L=1 is the surface; higher L = bigger arcs
const L_SHELLS = [1.3, 1.6, 2.0, 2.5, 3.2];
const LONGITUDES_COUNT = 12; // base field lines per L-shell
const POINTS_PER_LINE = 100; // smoothness of each arc

const TUBE_RADIUS = 0.012;
const TUBE_SEGMENTS = 4;

// ── Module state ─────────────────────────────────────────────────────────────
let _built = false;
let _fieldGroup = null;
let _model = null;

// ── Dipole coordinate system ─────────────────────────────────────────────────

// Build an orthonormal basis for the dipole: Z_d = dipole axis, X_d and Y_d in equatorial plane
const _dipoleZ = DIPOLE_AXIS.clone();
// Choose X_d perpendicular to dipole axis (cross with world Y, unless parallel)
let _dipoleX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), _dipoleZ);
if (_dipoleX.lengthSq() < 0.001) {
  _dipoleX.crossVectors(new THREE.Vector3(1, 0, 0), _dipoleZ);
}
_dipoleX.normalize();
const _dipoleY = new THREE.Vector3().crossVectors(_dipoleZ, _dipoleX).normalize();

/**
 * Generate points along a single dipole field line.
 *
 * @param {number} L - L-shell value (equatorial crossing distance / R)
 * @param {number} phi - magnetic longitude (radians around dipole axis)
 * @returns {THREE.Vector3[]} points in scene space
 */
function _dipoleFieldLinePoints(L, phi) {
  const points = [];
  // θ ranges from θ_min (north footpoint) to π - θ_min (south footpoint)
  // At surface: r = R, so sin²(θ) = 1/L → θ_min = arcsin(1/√L)
  const sinThMin = 1 / Math.sqrt(L);
  const thetaMin = Math.asin(sinThMin);
  const thetaMax = Math.PI - thetaMin;

  for (let i = 0; i <= POINTS_PER_LINE; i++) {
    const t = i / POINTS_PER_LINE;
    const theta = thetaMin + t * (thetaMax - thetaMin);
    const sinTh = Math.sin(theta);
    const r = L * R * sinTh * sinTh;

    // Convert dipole spherical (r, theta, phi) to dipole Cartesian
    const dX = r * sinTh * Math.cos(phi);
    const dY = r * sinTh * Math.sin(phi);
    const dZ = r * Math.cos(theta);

    // Transform from dipole frame to scene frame
    const scenePos = new THREE.Vector3()
      .addScaledVector(_dipoleX, dX)
      .addScaledVector(_dipoleY, dY)
      .addScaledVector(_dipoleZ, dZ);

    points.push(scenePos);
  }

  return points;
}

/**
 * Get WMM field intensity at a geographic point (for coloring).
 */
function _getFieldIntensity(lat, lon) {
  if (!_model) _model = geomagnetism.model();
  const clampedLat = Math.max(-89, Math.min(89, lat));
  const info = _model.point([clampedLat, lon]);
  return info.f; // total field intensity in nT
}

/**
 * Convert scene position to geographic lat/lon.
 */
function _sceneToLatLon(pos) {
  const r = pos.length();
  if (r < 0.001) return { lat: 0, lon: 0 };
  const lat = Math.asin(pos.y / r) * (180 / Math.PI);
  const lon = Math.atan2(-pos.z, pos.x) * (180 / Math.PI);
  return { lat, lon };
}

// ── Build field lines ────────────────────────────────────────────────────────

// Seeded pseudo-random for reproducible "natural" look
function _seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function _buildFieldLines() {
  if (!_model) _model = geomagnetism.model();

  _fieldGroup = new THREE.Group();
  _fieldGroup.name = "emField";

  const rng = _seededRandom(42);

  for (let li = 0; li < L_SHELLS.length; li++) {
    const L = L_SHELLS[li];
    // Fewer lines for outer shells, more for inner
    const count = li < 2 ? LONGITUDES_COUNT + 2 : LONGITUDES_COUNT - li;

    for (let i = 0; i < count; i++) {
      // Add jitter to longitude placement (+/- ~15°) for natural asymmetry
      const basePhi = (i / count) * Math.PI * 2;
      const jitter = (rng() - 0.5) * 0.5; // ±0.25 rad ≈ ±14°
      const phi = basePhi + jitter;

      // Slight L variation per line (±5%) for non-uniform arcs
      const Lvar = L * (0.95 + rng() * 0.10);

      const points = _dipoleFieldLinePoints(Lvar, phi);
      if (points.length < 10) continue;

      // Get field intensity at the north footpoint for coloring
      const footpoint = points[0];
      const { lat, lon } = _sceneToLatLon(footpoint);
      const intensity = _getFieldIntensity(lat, lon);

      _createFieldLineMesh(points, Lvar, intensity);
    }
  }

  globeGroup.add(_fieldGroup);
}

function _createFieldLineMesh(points, L, intensity) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.min(points.length * 2, 160);
  const geometry = new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, TUBE_SEGMENTS, false);

  // Color based on field intensity (typically 25000–65000 nT)
  // Low intensity → cyan (#00ffff, hue=0.50), high intensity → fuschia (#ff00ff, hue=0.833)
  const normIntensity = Math.max(0, Math.min(1, (intensity - 25000) / 40000));
  const hue = 0.50 + normIntensity * 0.333; // 0.50 (cyan) → 0.833 (fuschia)
  const saturation = 0.85 + normIntensity * 0.15;
  const lightness = 0.60 - normIntensity * 0.10; // cyan slightly brighter, fuschia slightly deeper

  const color = new THREE.Color().setHSL(hue, saturation, lightness);

  // Opacity: inner lines (smaller L) are brighter, outer lines more transparent
  const opacity = 0.45 + (1 - (L - 1.4) / 1.6) * 0.35;

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 15;
  _fieldGroup.add(mesh);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function enableEmField() {
  if (!_built) {
    _buildFieldLines();
    _built = true;
  }
  _fieldGroup.visible = true;
}

export function disableEmField() {
  if (_fieldGroup) _fieldGroup.visible = false;
}
