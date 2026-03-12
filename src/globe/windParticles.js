/**
 * Wind Particle System
 *
 * Animates 50,000 massless particles advected by a 128×64 IDW wind field
 * interpolated from weather station data. Particles are displayed as
 * additive-blended points on the sphere surface, colored by wind speed.
 *
 * Wind field is rebuilt whenever weather data refreshes (buildWindField).
 * Per-frame update (updateWindParticles) advances all particles by dt seconds.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { latLonToVector3 } from "../utils.js";

// Wind field grid dimensions
const GRID_W = 128;
const GRID_H = 64;
const GRID_SIZE = GRID_W * GRID_H;

// Particle count
const N = 50_000;

// VISUAL scale: how many degrees of lat/lon to move per second per m/s of wind speed
// Physical would be 1/111320 ≈ 0.000009, but that's invisible.
// Use 0.4 degrees/s per m/s for a visible, comprehensible effect.
const VIS_SPEED_SCALE = 0.4;

// Particle surface radius (just above the globe)
const PARTICLE_RADIUS = GLOBE_RADIUS * 1.042;

// IDW power parameter
const IDW_P = 2;
// IDW search radius in degrees (ignore stations beyond this)
const IDW_MAX_DIST = 30;

// Float32Arrays for the wind field: u (east), v (north), speed
const _fieldU     = new Float32Array(GRID_SIZE);
const _fieldV     = new Float32Array(GRID_SIZE);
const _fieldSpeed = new Float32Array(GRID_SIZE);

// Per-particle state (Float32Array for efficiency)
const _lat  = new Float32Array(N);  // degrees
const _lon  = new Float32Array(N);  // degrees
const _age  = new Float32Array(N);  // [0, 1]
const _life = new Float32Array(N);  // lifetime in seconds [3, 9]

// THREE.js geometry buffers
const _positions = new Float32Array(N * 3);
const _colors    = new Float32Array(N * 3);

// Scratch vector for latLonToVector3
const _vec = new THREE.Vector3();

// Color palette by wind speed (m/s)
// 0→3 = blue, 3→8 = cyan, 8→15 = green, 15→20 = yellow, 20→30 = orange, >30 = red
const _color = new THREE.Color();

function _speedToColor(speed_ms) {
  if (speed_ms < 3) {
    // blue
    const f = speed_ms / 3;
    _color.setRGB(0.1 + f * 0.1, 0.2 + f * 0.4, 1.0);
  } else if (speed_ms < 8) {
    // blue → cyan
    const f = (speed_ms - 3) / 5;
    _color.setRGB(0.2 - f * 0.2, 0.6 + f * 0.4, 1.0);
  } else if (speed_ms < 15) {
    // cyan → green
    const f = (speed_ms - 8) / 7;
    _color.setRGB(0.0, 1.0, 1.0 - f);
  } else if (speed_ms < 20) {
    // green → yellow
    const f = (speed_ms - 15) / 5;
    _color.setRGB(f, 1.0, 0.0);
  } else if (speed_ms < 30) {
    // yellow → orange
    const f = (speed_ms - 20) / 10;
    _color.setRGB(1.0, 1.0 - f * 0.5, 0.0);
  } else {
    // orange → red
    const f = Math.min((speed_ms - 30) / 20, 1);
    _color.setRGB(1.0, 0.5 - f * 0.5, 0.0);
  }
}

/** Sample the wind field at arbitrary (lat, lon) using bilinear interpolation. */
function _sampleField(lat, lon) {
  // Clamp lat to [-90, 90]
  lat = Math.max(-90, Math.min(90, lat));
  // Wrap lon to [-180, 180)
  lon = ((lon + 180) % 360 + 360) % 360 - 180;

  // Map to grid coords: lat 90→-90 maps to row 0→GRID_H-1
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

  const u = (1 - fx) * (1 - fy) * _fieldU[i00]
           + fx     * (1 - fy) * _fieldU[i10]
           + (1 - fx) * fy     * _fieldU[i01]
           + fx     * fy       * _fieldU[i11];

  const v = (1 - fx) * (1 - fy) * _fieldV[i00]
           + fx     * (1 - fy) * _fieldV[i10]
           + (1 - fx) * fy     * _fieldV[i01]
           + fx     * fy       * _fieldV[i11];

  const speed = (1 - fx) * (1 - fy) * _fieldSpeed[i00]
               + fx     * (1 - fy) * _fieldSpeed[i10]
               + (1 - fx) * fy     * _fieldSpeed[i01]
               + fx     * fy       * _fieldSpeed[i11];

  return { u, v, speed };
}

/** Reset a single particle to a random position with staggered age. */
function _resetParticle(i, randomAge) {
  _lat[i]  = Math.random() * 180 - 90;
  _lon[i]  = Math.random() * 360 - 180;
  _age[i]  = randomAge ? Math.random() : 0;
  _life[i] = 6 + Math.random() * 8; // 6–14 seconds
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
  size: 0.009,
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

/**
 * Build the 128×64 IDW wind field from weather station points.
 * Each point must have: { lat, lon, current: { windSpeed (km/h), windDirection (deg) } }
 */
export function buildWindField(points) {
  // Collect valid wind observations
  const stations = [];
  for (const p of points) {
    const ws = p.current?.windSpeed;
    const wd = p.current?.windDirection;
    if (ws == null || wd == null) continue;
    const speed_ms = ws / 3.6; // km/h → m/s
    const dir_rad  = wd * (Math.PI / 180);
    // Meteorological "from" direction → wind component vectors
    const u = -speed_ms * Math.sin(dir_rad);
    const v = -speed_ms * Math.cos(dir_rad);
    stations.push({ lat: p.lat, lon: p.lon, u, v, speed: speed_ms });
  }

  if (stations.length === 0) {
    _fieldU.fill(0);
    _fieldV.fill(0);
    _fieldSpeed.fill(0);
    return;
  }

  // Fill each grid cell using IDW
  for (let gy = 0; gy < GRID_H; gy++) {
    const cellLat = 90 - (gy / (GRID_H - 1)) * 180;

    for (let gx = 0; gx < GRID_W; gx++) {
      const cellLon = (gx / (GRID_W - 1)) * 360 - 180;
      const idx = gy * GRID_W + gx;

      let wSum = 0, uSum = 0, vSum = 0;

      for (const st of stations) {
        let dlat = cellLat - st.lat;
        let dlon = cellLon - st.lon;
        // Wrap longitude
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
        _fieldU[idx]     = 0;
        _fieldV[idx]     = 0;
        _fieldSpeed[idx] = 0;
      }
    }
  }
}

/** Initialize all particles with random positions and staggered ages. */
export function initWindParticles() {
  for (let i = 0; i < N; i++) {
    _resetParticle(i, true);
  }
  // Initial position write so the buffer is populated before first frame
  _updatePositions(false);
}

/**
 * Update all wind particles for one frame.
 * @param {number} dt - delta time in seconds
 */
export function updateWindParticles(dt) {
  const posAttr   = _geometry.attributes.position;
  const colorAttr = _geometry.attributes.color;

  for (let i = 0; i < N; i++) {
    // Advance age
    _age[i] += dt / _life[i];

    if (_age[i] >= 1) {
      // Respawn
      _resetParticle(i, false);
    }

    const lat = _lat[i];
    const lon = _lon[i];

    // Sample wind field
    const { u, v, speed } = _sampleField(lat, lon);

    // Advect: use visual speed scale (degrees/s per m/s) for visible movement
    const cosLat = Math.cos(lat * (Math.PI / 180));
    const dlat = v * VIS_SPEED_SCALE * dt;
    const dlon = cosLat > 0.001 ? (u * VIS_SPEED_SCALE / cosLat) * dt : 0;

    _lat[i] = Math.max(-89.9, Math.min(89.9, lat + dlat));
    _lon[i] = ((lon + dlon + 180) % 360 + 360) % 360 - 180;

    // Compute 3D position
    latLonToVector3(_lat[i], _lon[i], PARTICLE_RADIUS, _vec);
    const pi3 = i * 3;
    _positions[pi3]     = _vec.x;
    _positions[pi3 + 1] = _vec.y;
    _positions[pi3 + 2] = _vec.z;

    // Parabolic alpha fade: sin(π * age)
    const alpha = Math.sin(Math.PI * _age[i]);

    // Color by wind speed, modulated by alpha
    _speedToColor(speed);
    _colors[pi3]     = _color.r * alpha;
    _colors[pi3 + 1] = _color.g * alpha;
    _colors[pi3 + 2] = _color.b * alpha;
  }

  posAttr.needsUpdate   = true;
  colorAttr.needsUpdate = true;
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
