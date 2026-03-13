/**
 * Wind Particle System
 *
 * Animates 30,000 massless particles advected by a 128×64 IDW wind field
 * interpolated from weather station data. Particles are displayed as
 * additive-blended points on the sphere surface, colored by wind speed.
 *
 * Wind field is rebuilt whenever weather data refreshes (buildWindField).
 * Per-frame update (updateWindParticles) advances all particles by dt seconds.
 *
 * Where IDW has no station coverage (e.g. open ocean), a climatological
 * zonal wind fallback (trade winds / westerlies) ensures particles always move.
 */

import * as THREE from "three";
import { globeGroup, camera } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { latLonToVector3 } from "../utils.js";

// Wind field grid dimensions
const GRID_W = 128;
const GRID_H = 64;
const GRID_SIZE = GRID_W * GRID_H;

// Particle count (30K: good visual density, half the CPU cost of 60K)
const N = 30_000;

// VISUAL scale: how many degrees of lat/lon to move per second per m/s of wind speed.
// 1.0 = clearly visible flowing movement.
const VIS_SPEED_SCALE = 1.0;

// Particle surface radius (just above the globe)
const PARTICLE_RADIUS = GLOBE_RADIUS * 1.042;

// Typical camera distance (used for zoom-based size scaling)
const NOMINAL_CAM_DIST = 12.0;

// Base particle size
const BASE_PARTICLE_SIZE = 0.022;

// IDW power parameter
const IDW_P = 2;
// IDW search radius in degrees — large enough to cover ocean gaps
const IDW_MAX_DIST = 120;

// Float32Arrays for the wind field: u (east), v (north), speed
const _fieldU     = new Float32Array(GRID_SIZE);
const _fieldV     = new Float32Array(GRID_SIZE);
const _fieldSpeed = new Float32Array(GRID_SIZE);

// Per-particle state (Float32Array for efficiency)
const _lat  = new Float32Array(N);  // degrees
const _lon  = new Float32Array(N);  // degrees
const _age  = new Float32Array(N);  // [0, 1]
const _life = new Float32Array(N);  // lifetime in seconds [3, 7]

// Trail length (number of previous frames to keep)
const TRAIL_LEN = 3;

// THREE.js geometry buffers
const _positions = new Float32Array(N * 3);
const _colors    = new Float32Array(N * 3);

// Trail buffers: store previous positions and colors for each trail frame
const _trailPositions = [];
const _trailColors = [];
for (let t = 0; t < TRAIL_LEN; t++) {
  _trailPositions.push(new Float32Array(N * 3));
  _trailColors.push(new Float32Array(N * 3));
}

// Scratch vector for latLonToVector3
const _vec = new THREE.Vector3();

// Precomputed trig for latLonToVector3 inlining
const DEG2RAD = Math.PI / 180;

// Color palette by wind speed (m/s) — simplified 3-stop: blue → cyan → orange
const _color = new THREE.Color();

function _speedToColor(speed_ms) {
  if (speed_ms < 5) {
    // Calm: soft blue
    const f = speed_ms / 5;
    _color.setRGB(0.15 + f * 0.1, 0.3 + f * 0.5, 1.0);
  } else if (speed_ms < 15) {
    // Moderate: blue → cyan
    const f = (speed_ms - 5) / 10;
    _color.setRGB(0.25 - f * 0.25, 0.8 + f * 0.2, 1.0);
  } else {
    // Strong: cyan → orange/red
    const f = Math.min((speed_ms - 15) / 20, 1);
    _color.setRGB(f, 1.0 - f * 0.4, 1.0 - f);
  }
}

/** Sample the wind field at arbitrary (lat, lon) using bilinear interpolation. */
function _sampleField(lat, lon) {
  lat = Math.max(-90, Math.min(90, lat));
  lon = ((lon + 180) % 360 + 360) % 360 - 180;

  const gx = ((lon + 180) / 360) * (GRID_W - 1);
  const gy = ((90 - lat) / 180) * (GRID_H - 1);

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, GRID_W - 1);
  const y1 = Math.min(y0 + 1, GRID_H - 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const i00 = y0 * GRID_W + x0;
  const i10 = y0 * GRID_W + x1;
  const i01 = y1 * GRID_W + x0;
  const i11 = y1 * GRID_W + x1;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const u = w00 * _fieldU[i00] + w10 * _fieldU[i10] + w01 * _fieldU[i01] + w11 * _fieldU[i11];
  const v = w00 * _fieldV[i00] + w10 * _fieldV[i10] + w01 * _fieldV[i01] + w11 * _fieldV[i11];
  const speed = w00 * _fieldSpeed[i00] + w10 * _fieldSpeed[i10] + w01 * _fieldSpeed[i01] + w11 * _fieldSpeed[i11];

  return { u, v, speed };
}

/**
 * Climatological zonal wind fallback (m/s, eastward component only).
 * Approximate global circulation:
 *   0-30° lat: Trade winds (easterly, ~5 m/s)
 *  30-60° lat: Westerlies (~7 m/s)
 *  60-90° lat: Polar easterlies (~3 m/s)
 */
function _zonalFallback(lat) {
  const absLat = Math.abs(lat);
  if (absLat < 30) {
    // Trade winds: blow from east to west (u negative)
    const f = absLat / 30;
    return -5 * (1 - f * 0.3); // -5 to -3.5 m/s
  } else if (absLat < 60) {
    // Westerlies: blow from west to east (u positive)
    const f = (absLat - 30) / 30;
    return 7 * Math.sin(f * Math.PI); // 0→7→0 m/s
  } else {
    // Polar easterlies (weak)
    return -3 * ((absLat - 60) / 30);
  }
}

/**
 * Reset a single particle to a random position on the sphere.
 * Uses cosine-weighted latitude for uniform area distribution.
 */
function _resetParticle(i, randomAge) {
  _lat[i] = Math.acos(2 * Math.random() - 1) * (180 / Math.PI) - 90;
  _lon[i] = Math.random() * 360 - 180;
  _age[i]  = randomAge ? Math.random() : 0;
  _life[i] = 3 + Math.random() * 4; // 3–7 seconds
}

function _createCircleTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
const _circleTexture = _createCircleTexture();

// Geometry and Points mesh (created once)
const _geometry = new THREE.BufferGeometry();
_geometry.setAttribute("position", new THREE.BufferAttribute(_positions, 3).setUsage(THREE.DynamicDrawUsage));
_geometry.setAttribute("color",    new THREE.BufferAttribute(_colors,    3).setUsage(THREE.DynamicDrawUsage));

const _material = new THREE.PointsMaterial({
  size: BASE_PARTICLE_SIZE,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
  alphaMap: _circleTexture,
  alphaTest: 0.001,
});

export const windParticles = new THREE.Points(_geometry, _material);
windParticles.renderOrder = 7;
windParticles.visible = false;
globeGroup.add(windParticles);

// Trail meshes — progressively fainter copies of the particle positions
const _trailGeometries = [];
const _trailMeshes = [];
for (let t = 0; t < TRAIL_LEN; t++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(_trailPositions[t], 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color",    new THREE.BufferAttribute(_trailColors[t],    3).setUsage(THREE.DynamicDrawUsage));
  _trailGeometries.push(geo);

  const trailMat = new THREE.PointsMaterial({
    size: BASE_PARTICLE_SIZE * (0.7 - t * 0.15),
    vertexColors: true,
    transparent: true,
    opacity: 0.5 - t * 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    alphaMap: _circleTexture,
    alphaTest: 0.001,
  });

  const trailMesh = new THREE.Points(geo, trailMat);
  trailMesh.renderOrder = 7;
  trailMesh.visible = false;
  globeGroup.add(trailMesh);
  _trailMeshes.push(trailMesh);
}

/**
 * Build the 128×64 IDW wind field from weather station points.
 * Each point must have: { lat, lon, current: { windSpeed (km/h), windDirection (deg) } }
 *
 * Where no station data exists within IDW_MAX_DIST, a climatological zonal wind
 * fallback is used so particles always show movement.
 */
export function buildWindField(points, level = '10m') {
  const stations = [];
  for (const p of points) {
    // Try altitude-specific wind data first, fall back to surface 10m data
    const wl = p.current?.windLevels?.[level];
    const ws = wl?.speed ?? p.current?.windSpeed ?? null;
    const wd = wl?.direction ?? p.current?.windDirection ?? null;
    if (ws == null || wd == null) continue;
    const speed_ms = ws / 3.6;
    const dir_rad  = wd * (Math.PI / 180);
    const u = -speed_ms * Math.sin(dir_rad);
    const v = -speed_ms * Math.cos(dir_rad);
    if (isNaN(u) || isNaN(v)) continue;
    stations.push({ lat: p.lat, lon: p.lon, u, v, speed: speed_ms });
  }

  for (let gy = 0; gy < GRID_H; gy++) {
    const cellLat = 90 - (gy / (GRID_H - 1)) * 180;

    for (let gx = 0; gx < GRID_W; gx++) {
      const cellLon = (gx / (GRID_W - 1)) * 360 - 180;
      const idx = gy * GRID_W + gx;

      let wSum = 0, uSum = 0, vSum = 0;

      for (const st of stations) {
        let dlat = cellLat - st.lat;
        let dlon = cellLon - st.lon;
        if (dlon > 180)  dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        if (dist > IDW_MAX_DIST) continue;

        const w = dist < 0.001 ? 1e6 : Math.pow(1 / dist, IDW_P);
        wSum += w;
        uSum += w * st.u;
        vSum += w * st.v;
      }

      if (wSum > 0) {
        const u = uSum / wSum;
        const v = vSum / wSum;
        _fieldU[idx]     = u;
        _fieldV[idx]     = v;
        _fieldSpeed[idx] = Math.sqrt(u * u + v * v);
      } else {
        // Fallback: climatological zonal wind so particles always move
        const zu = _zonalFallback(cellLat);
        _fieldU[idx]     = zu;
        _fieldV[idx]     = 0;
        _fieldSpeed[idx] = Math.abs(zu);
      }
    }
  }
}

/** Initialize all particles with random positions and staggered ages. */
export function initWindParticles() {
  for (let i = 0; i < N; i++) {
    _resetParticle(i, true);
  }
  _updatePositions(false);
}

/**
 * Update all wind particles for one frame.
 * @param {number} dt - delta time in seconds
 */
export function updateWindParticles(dt) {
  const posAttr   = _geometry.attributes.position;
  const colorAttr = _geometry.attributes.color;

  // Particle size: smaller when zoomed in for visual consistency
  const camDist = camera.position.distanceTo(globeGroup.position);
  const sizeMult = Math.min(Math.max(camDist / NOMINAL_CAM_DIST, 0.35), 2.5);
  _material.size = BASE_PARTICLE_SIZE * sizeMult;

  // Shift trail buffers: oldest trail drops off, newest gets current positions
  for (let t = TRAIL_LEN - 1; t > 0; t--) {
    _trailPositions[t].set(_trailPositions[t - 1]);
    _trailColors[t].set(_trailColors[t - 1]);
  }
  _trailPositions[0].set(_positions);
  _trailColors[0].set(_colors);

  for (let i = 0; i < N; i++) {
    _age[i] += dt / _life[i];

    if (_age[i] >= 1) {
      _resetParticle(i, false);
    }

    const lat = _lat[i];
    const lon = _lon[i];

    const { u, v, speed } = _sampleField(lat, lon);

    // Advect particle position
    const cosLat = Math.cos(lat * DEG2RAD);
    const dlat = v * VIS_SPEED_SCALE * dt;
    const dlon = cosLat > 0.001 ? (u * VIS_SPEED_SCALE / cosLat) * dt : 0;

    _lat[i] = Math.max(-89.9, Math.min(89.9, lat + dlat));
    _lon[i] = ((lon + dlon + 180) % 360 + 360) % 360 - 180;

    // Compute 3D position on sphere surface (inlined for performance)
    const phi = (90 - _lat[i]) * DEG2RAD;
    const theta = (_lon[i] + 180) * DEG2RAD;
    const sinPhi = Math.sin(phi);

    const pi3 = i * 3;
    _positions[pi3]     = -(PARTICLE_RADIUS * sinPhi * Math.cos(theta));
    _positions[pi3 + 1] = PARTICLE_RADIUS * Math.cos(phi);
    _positions[pi3 + 2] = PARTICLE_RADIUS * sinPhi * Math.sin(theta);

    // Parabolic alpha fade: sin(π * age), with a brightness boost
    const alpha = Math.sin(Math.PI * _age[i]);
    const bright = 0.4 + alpha * 0.6; // never fully dark

    _speedToColor(speed);
    _colors[pi3]     = _color.r * bright;
    _colors[pi3 + 1] = _color.g * bright;
    _colors[pi3 + 2] = _color.b * bright;
  }

  posAttr.needsUpdate   = true;
  colorAttr.needsUpdate = true;

  // Update trail geometries
  for (let t = 0; t < TRAIL_LEN; t++) {
    _trailGeometries[t].attributes.position.needsUpdate = true;
    _trailGeometries[t].attributes.color.needsUpdate = true;
    _trailMeshes[t].visible = windParticles.visible;
    _trailMeshes[t].material.size = _material.size * (0.7 - t * 0.15);
  }
}

/** Internal: only write positions (used for initial buffer population). */
function _updatePositions(withColor) {
  for (let i = 0; i < N; i++) {
    latLonToVector3(_lat[i], _lon[i], PARTICLE_RADIUS, _vec);
    const pi3 = i * 3;
    _positions[pi3]     = _vec.x;
    _positions[pi3 + 1] = _vec.y;
    _positions[pi3 + 2] = _vec.z;
    if (withColor) {
      _colors[pi3]     = 0.2;
      _colors[pi3 + 1] = 0.5;
      _colors[pi3 + 2] = 1.0;
    }
  }
  _geometry.attributes.position.needsUpdate = true;
  if (withColor) _geometry.attributes.color.needsUpdate = true;
}

/** Set visibility of all trail meshes (call when toggling wind on/off). */
export function setWindTrailsVisible(visible) {
  for (let t = 0; t < TRAIL_LEN; t++) {
    _trailMeshes[t].visible = visible;
  }
}

/** Returns true if the wind field has no data (all zeros). */
export function isWindFieldEmpty() {
  for (let i = 0; i < 100; i++) {
    if (_fieldSpeed[i] > 0) return false;
  }
  return true;
}
