/**
 * Lightning Layer
 *
 * Visualizes thunderstorm activity using already-fetched weather_code data:
 *   95 = thunderstorm, 96 = thunderstorm + hail, 99 = severe thunderstorm
 *
 * Also uses CAPE (Convective Available Potential Energy) when available:
 *   CAPE > 1000 J/kg = significant thunderstorm risk
 *
 * Rendering: THREE.Points with additive blending, yellow/white flash pulse,
 * positioned at weather stations reporting thunderstorm conditions.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { latLonToVector3 } from "../utils.js";

const LIGHTNING_RADIUS = GLOBE_RADIUS * 1.005;
const MAX_BOLTS = 500;
const THUNDERSTORM_CODES = new Set([95, 96, 99]);

const _positions = new Float32Array(MAX_BOLTS * 3);
const _colors = new Float32Array(MAX_BOLTS * 3);
const _phases = new Float32Array(MAX_BOLTS); // random phase offset for flash timing
const _intensities = new Float32Array(MAX_BOLTS); // 0-1 based on severity
let _activeCount = 0;

const _vec = new THREE.Vector3();

function _createFlashTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(255,255,200,0.9)");
  gradient.addColorStop(0.5, "rgba(255,220,100,0.4)");
  gradient.addColorStop(1, "rgba(255,200,50,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const _geometry = new THREE.BufferGeometry();
_geometry.setAttribute("position", new THREE.BufferAttribute(_positions, 3).setUsage(THREE.DynamicDrawUsage));
_geometry.setAttribute("color", new THREE.BufferAttribute(_colors, 3).setUsage(THREE.DynamicDrawUsage));

const _material = new THREE.PointsMaterial({
  size: 0.12,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
  alphaMap: _createFlashTexture(),
  alphaTest: 0.001,
});

export const lightningMesh = new THREE.Points(_geometry, _material);
lightningMesh.renderOrder = 8;
lightningMesh.visible = false;
globeGroup.add(lightningMesh);

/**
 * Rebuild lightning points from weather data.
 * @param {Array} points - weatherState.points with current data
 */
export function buildLightningField(points) {
  _activeCount = 0;

  for (const p of points) {
    if (_activeCount >= MAX_BOLTS) break;
    const wc = p.current?.weatherCode;
    const cape = p.current?.cape;
    const isThunderstorm = THUNDERSTORM_CODES.has(wc);
    const isHighCAPE = cape != null && cape > 1000;

    if (!isThunderstorm && !isHighCAPE) continue;

    latLonToVector3(p.lat, p.lon, LIGHTNING_RADIUS, _vec);
    const i3 = _activeCount * 3;
    _positions[i3] = _vec.x;
    _positions[i3 + 1] = _vec.y;
    _positions[i3 + 2] = _vec.z;

    _phases[_activeCount] = Math.random() * Math.PI * 2;

    // Intensity: severe > normal > CAPE-only
    if (wc === 99) _intensities[_activeCount] = 1.0;
    else if (isThunderstorm) _intensities[_activeCount] = 0.7;
    else _intensities[_activeCount] = 0.4;

    _activeCount++;
  }

  _geometry.setDrawRange(0, _activeCount);
  _geometry.attributes.position.needsUpdate = true;
  _geometry.attributes.color.needsUpdate = true;
}

/**
 * Animate lightning flashes. Call each frame.
 * @param {number} time - elapsed time in seconds (e.g. performance.now()/1000)
 */
export function updateLightning(time) {
  if (_activeCount === 0) return;

  for (let i = 0; i < _activeCount; i++) {
    // Flash pattern: sharp pulse with random frequency (1-2 Hz)
    const freq = 1.0 + (_phases[i] % 1.0);
    const t = (time * freq + _phases[i]) % (Math.PI * 2);
    // Sharp flash: pow(sin, 8) creates brief bright pulses
    const flash = Math.pow(Math.max(0, Math.sin(t)), 8);
    const bright = flash * _intensities[i];

    const i3 = i * 3;
    // Yellow-white flash color
    _colors[i3] = 1.0 * bright;
    _colors[i3 + 1] = (0.85 + 0.15 * flash) * bright;
    _colors[i3 + 2] = (0.3 + 0.4 * flash) * bright;
  }

  _geometry.attributes.color.needsUpdate = true;
}
