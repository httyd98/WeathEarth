/**
 * Aurora Layer — photorealistic aurora borealis & australis.
 *
 * Uses NOAA SWPC Ovation aurora nowcast data:
 *   https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
 *
 * Visual approach:
 *   - Equirectangular canvas texture (2048×1024) mapped on a sphere at aurora altitude (~140 km).
 *   - Canvas is painted ONLY at polar latitudes (|lat| > 50°) to avoid DoubleSide mirror artifacts.
 *   - FrontSide only on the sphere: seen from outside, the polar glow is visible at the poles.
 *   - Multiple overlapping intensity shells create a volumetric glow effect.
 *   - NOAA Ovation energy per longitude drives brightness; synthetic oval fallback if fetch fails.
 *   - Animated shimmer per-frame (~12 fps redraw).
 *
 * Why sphere + FrontSide (not DoubleSide):
 *   Looking from outside, FrontSide renders the outer hemisphere face.
 *   The canvas is transparent at equatorial latitudes, so only polar glow is visible.
 *   DoubleSide was the cause of the old equatorial mirror artifact.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

// Aurora altitude in globe units (~140 km mean altitude)
const AURORA_R   = GLOBE_RADIUS * (1 + 110 / 6371);  // lower shell  (~110 km)
const AURORA_R2  = GLOBE_RADIUS * (1 + 180 / 6371);  // upper shell  (~180 km)
const AURORA_R3  = GLOBE_RADIUS * (1 + 260 / 6371);  // diffuse halo (~260 km)

// Auroral oval center latitudes (geomagnetic auroral zone)
const OVAL_LAT_N =  67;
const OVAL_LAT_S = -67;
// Width of the auroral band (degrees latitude)
const OVAL_WIDTH = 12;

// Canvas resolution — small: gradient approach doesn't need high resolution
const CANVAS_W = 512;
const CANVAS_H = 256;

// NOAA Ovation aurora API
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

let _active     = false;
let _mesh1      = null;   // main curtain
let _mesh2      = null;   // upper soft glow
let _mesh3      = null;   // diffuse halo
let _canvas     = null;
let _ctx        = null;
let _texture    = null;
// Per-longitude energy array, LON_SEGS = 360 buckets
const LON_SEGS = 360;
let _lonEnergy  = null;
let _fetchTimer = null;
let _shimmerT   = 0;

// ── Data fetching ─────────────────────────────────────────────────────────────

async function _fetchAuroraData() {
  try {
    const resp = await fetch(OVATION_URL, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    const coords = json["coordinates"];
    if (!Array.isArray(coords)) throw new Error("Unexpected format");

    // Accumulate max energy per 1° longitude bucket at auroral latitudes
    const energy = new Float32Array(LON_SEGS);
    const count  = new Uint16Array(LON_SEGS);

    for (const [lon, lat, e] of coords) {
      if (e == null || e <= 0) continue;
      const absLat = Math.abs(lat);
      if (absLat < 50 || absLat > 85) continue;
      const li = ((Math.round(lon) % 360) + 360) % 360;
      if (e > energy[li]) energy[li] = e;
      count[li]++;
    }

    // Fill gaps via neighbour interpolation
    for (let i = 0; i < LON_SEGS; i++) {
      if (count[i] === 0) {
        energy[i] = (energy[(i - 1 + LON_SEGS) % LON_SEGS] + energy[(i + 1) % LON_SEGS]) / 2;
      }
    }

    // Smooth the per-longitude energy with a 5° running average
    const smoothed = new Float32Array(LON_SEGS);
    for (let i = 0; i < LON_SEGS; i++) {
      let sum = 0;
      for (let d = -2; d <= 2; d++) sum += energy[(i + d + LON_SEGS) % LON_SEGS];
      smoothed[i] = sum / 5;
    }

    _lonEnergy = smoothed;
    const maxE = Math.max(...smoothed);
    console.log(`[AuroraLayer] loaded, maxEnergy=${maxE.toFixed(1)}`);
    _drawCanvas(1.0);
  } catch (e) {
    console.warn("[AuroraLayer] fetch failed:", e.message);
    _makeSyntheticEnergy();
    _drawCanvas(1.0);
  }
}

function _makeSyntheticEnergy() {
  const energy = new Float32Array(LON_SEGS);
  // Use a seeded pseudo-random sequence so the pattern looks irregular but is consistent
  const seed = (n) => { let x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  for (let i = 0; i < LON_SEGS; i++) {
    const t = (i / LON_SEGS) * Math.PI * 2;
    // Night-side boost: strongest aurora on night hemisphere (~180° from solar noon)
    const base  = 3.5 + 2.2 * Math.cos(t + Math.PI);
    // Multiple harmonics for irregular appearance
    const w1    = 2.1 * Math.sin(t * 2 + 0.8);
    const w2    = 1.4 * Math.sin(t * 5 + 1.7);
    const w3    = 0.9 * Math.sin(t * 11 + 2.3);
    const w4    = 0.6 * Math.sin(t * 19 + 0.5);
    // Per-longitude noise burst to create localized bright patches
    const noise = seed(i) * 3.5 - 0.5;
    // Occasional large substorm surge in ~3 random longitude sectors
    const surge = seed(i + 77) > 0.85 ? seed(i + 133) * 8 : 0;
    energy[i] = Math.max(0, base + w1 + w2 + w3 + w4 + noise + surge);
  }
  // Smooth with a 7° window to avoid per-pixel salt-and-pepper
  const smoothed = new Float32Array(LON_SEGS);
  for (let i = 0; i < LON_SEGS; i++) {
    let s = 0;
    for (let d = -3; d <= 3; d++) s += energy[(i + d + LON_SEGS) % LON_SEGS];
    smoothed[i] = s / 7;
  }
  _lonEnergy = smoothed;
}

// ── Canvas texture painting ────────────────────────────────────────────────────
// Per-pixel ImageData approach: realistic aurora with NOAA data.
// Canvas is 512×256 (16× smaller than original 2048×1024) for performance.

function _auroraRGBA(lat, lon, shimmer) {
  const absLat   = Math.abs(lat);
  const ovalLat  = lat >= 0 ? OVAL_LAT_N : OVAL_LAT_S;
  const dist     = Math.abs(absLat - Math.abs(ovalLat));
  if (dist > OVAL_WIDTH) return null;

  const latNorm    = dist / (OVAL_WIDTH * 0.5);
  const latFalloff = Math.exp(-latNorm * latNorm * 2.5);

  const lonI  = ((Math.floor(lon) % 360) + 360) % 360;
  const e     = _lonEnergy?.[lonI] ?? 3;
  const eNorm = Math.min(1, e / 8);
  if (eNorm < 0.02) return null;

  const shimmerFactor = 0.65 + 0.35 * shimmer;
  const latT = Math.min(1, (absLat - (Math.abs(ovalLat) - OVAL_WIDTH * 0.5)) / OVAL_WIDTH);
  const hue  = 120 + eNorm * 80 + latT * 60;
  const sat  = 0.92;
  const lig  = 0.38 + eNorm * 0.18;

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r, g, b;
  const hh = hue % 360;
  if      (hh < 60)  { r = c; g = x; b = 0; }
  else if (hh < 120) { r = x; g = c; b = 0; }
  else if (hh < 180) { r = 0; g = c; b = x; }
  else if (hh < 240) { r = 0; g = x; b = c; }
  else if (hh < 300) { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }

  const alpha = eNorm * latFalloff * shimmerFactor;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    Math.round(Math.min(1, alpha) * 255),
  ];
}

function _drawCanvas(shimmer) {
  if (!_ctx || !_lonEnergy) return;

  _ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const imageData = _ctx.createImageData(CANVAS_W, CANVAS_H);
  const px = imageData.data;

  for (let cy = 0; cy < CANVAS_H; cy++) {
    const lat = 90 - (cy / CANVAS_H) * 180;
    if (Math.abs(lat) < 50) continue;   // skip equatorial belt

    for (let cx = 0; cx < CANVAS_W; cx++) {
      const lon  = (cx / CANVAS_W) * 360;
      const rgba = _auroraRGBA(lat, lon, shimmer);
      if (!rgba) continue;
      const i = (cy * CANVAS_W + cx) * 4;
      px[i]   = rgba[0];
      px[i+1] = rgba[1];
      px[i+2] = rgba[2];
      px[i+3] = rgba[3];
    }
  }

  _ctx.putImageData(imageData, 0, 0);

  // One blur pass for smooth glow
  _ctx.filter = "blur(3px)";
  _ctx.drawImage(_canvas, 0, 0);
  _ctx.filter = "none";

  if (_texture) _texture.needsUpdate = true;
}

// ── Three.js mesh setup ───────────────────────────────────────────────────────

function _makeMat(opacity) {
  return new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,  // FrontSide only — eliminates mirror artifact
  });
}

function _buildMeshes() {
  _canvas = document.createElement("canvas");
  _canvas.width  = CANVAS_W;
  _canvas.height = CANVAS_H;
  _ctx = _canvas.getContext("2d");

  _texture = new THREE.CanvasTexture(_canvas);
  _texture.colorSpace = THREE.SRGBColorSpace;

  // Main aurora shell
  _mesh1 = new THREE.Mesh(new THREE.SphereGeometry(AURORA_R,  96, 48), _makeMat(1.0));
  _mesh1.renderOrder = 12;
  globeGroup.add(_mesh1);

  // Softer upper shell (same texture, lower opacity)
  _mesh2 = new THREE.Mesh(new THREE.SphereGeometry(AURORA_R2, 64, 32), _makeMat(0.45));
  _mesh2.renderOrder = 13;
  globeGroup.add(_mesh2);

  // Diffuse outer halo — lighter geometry
  _mesh3 = new THREE.Mesh(new THREE.SphereGeometry(AURORA_R3, 48, 24), _makeMat(0.2));
  _mesh3.renderOrder = 14;
  globeGroup.add(_mesh3);
}

function _disposeMeshes() {
  for (const mesh of [_mesh1, _mesh2, _mesh3]) {
    if (mesh) { globeGroup.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  _mesh1 = _mesh2 = _mesh3 = null;
  if (_texture) { _texture.dispose(); _texture = null; }
  _canvas = _ctx = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enableAurora() {
  _active = true;
  _buildMeshes();
  _makeSyntheticEnergy();
  _drawCanvas(1.0);
  await _fetchAuroraData();
  _fetchTimer = setInterval(_fetchAuroraData, 10 * 60 * 1000);
}

export function disableAurora() {
  _active = false;
  clearInterval(_fetchTimer);
  _fetchTimer = null;
  _disposeMeshes();
  _lonEnergy = null;
}

/** Re-fetch NOAA data immediately and redraw. Resolves when done. */
export async function refreshAurora() {
  if (!_active) return;
  await _fetchAuroraData();
}

export function updateAurora(dt) {
  if (!_active || !_texture) return;
  _shimmerT += dt;
  // Redraw at ~5 fps — gradient approach is cheap, but no need for more
  if (Math.floor(_shimmerT * 5) > Math.floor((_shimmerT - dt) * 5)) {
    const shimmer = 0.5 + 0.5 * Math.sin(_shimmerT * 1.5)
                  + 0.3 * Math.sin(_shimmerT * 0.8 + 1.2)
                  + 0.15 * Math.sin(_shimmerT * 3.1 + 0.7);
    _drawCanvas(shimmer);
  }
}
