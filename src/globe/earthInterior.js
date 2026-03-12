/**
 * Earth Interior Visualization
 *
 * Clips the globe with a single plane (z=0) to remove the front half,
 * revealing concentric internal layers as a clean half-sphere cross-section.
 *
 * Layer radii (PREM model, scaled to GLOBE_RADIUS = 4.2):
 *   Inner core boundary (ICB):   1220 km → 0.804 u
 *   Core-Mantle Boundary (CMB):  3480 km → 2.293 u
 *   660 km discontinuity:        5711 km → 3.762 u
 *   Mohorovičić discontinuity:   6336 km → 4.177 u
 *   Earth surface:               6371 km → 4.200 u
 *
 * Info labels are floating 3D Sprite cards connected by lines to each layer.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import {
  renderer, globeGroup,
  earth, earthMaterial,
  clouds, heatmapMesh, cloudCoverMesh, precipMesh,
  nightLights, terminatorOverlay
} from "./scene.js";

// ── Scientifically accurate layer radii ──────────────────────────────────────
const EARTH_KM = 6371;
const R = GLOBE_RADIUS; // 4.2
const R_INNER_CORE   = (1220 / EARTH_KM) * R;  // 0.804
const R_OUTER_CORE   = (3480 / EARTH_KM) * R;  // 2.293
const R_LOWER_MANTLE = (5711 / EARTH_KM) * R;  // 3.762
const R_UPPER_MANTLE = (6336 / EARTH_KM) * R;  // 4.177

// ── Dark, muted geological colours ──────────────────────────────────────────
const COL_INNER_CORE   = new THREE.Color(0x8A7228); // dark warm gold
const COL_OUTER_CORE   = new THREE.Color(0x7D3018); // dark burnt sienna
const COL_LOWER_MANTLE = new THREE.Color(0x764222); // dark terracotta
const COL_UPPER_MANTLE = new THREE.Color(0x354E2E); // dark olive

// ── Single clip plane: removes front half (z > 0) ───────────────────────────
const _CLIP_PLANE  = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const _CLIP_PLANES = [_CLIP_PLANE];

// ── Module state ──────────────────────────────────────────────────────────────
let _initialized = false;
let _layerMeshes = [];
let _capMesh     = null;
let _labelSprites = [];
let _labelLines   = [];
let _prevNightLightsVisible = true;
let _prevTerminatorVisible  = true;

// ── Layer info for labels ────────────────────────────────────────────────────
const LAYER_INFO = [
  { name: "Crosta",         km: "0 – 35 km",      temp: "~15 °C",    outerR: R,              innerR: R_UPPER_MANTLE },
  { name: "Mantello sup.",  km: "35 – 660 km",     temp: "~900 °C",   outerR: R_UPPER_MANTLE, innerR: R_LOWER_MANTLE },
  { name: "Mantello inf.",  km: "660 – 2891 km",   temp: "~2000 °C",  outerR: R_LOWER_MANTLE, innerR: R_OUTER_CORE },
  { name: "Nucleo esterno", km: "2891 – 5150 km",  temp: "~4000 °C",  outerR: R_OUTER_CORE,   innerR: R_INNER_CORE },
  { name: "Nucleo interno", km: "5150 – 6371 km",  temp: "~5400 °C",  outerR: R_INNER_CORE,   innerR: 0 },
];

// ── Cap texture (colors only, no text) ──────────────────────────────────────
function _createCapTexture() {
  const SIZE = 1024;
  const canvas = document.createElement("canvas");
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const cx  = SIZE / 2;
  const cy  = SIZE / 2;
  const maxR = SIZE / 2 - 2;

  ctx.clearRect(0, 0, SIZE, SIZE);

  // Concentric layer fills — from outermost to innermost
  // Crust ring boosted from 0.995 → 0.94 for visibility
  const layers = [
    { r: 1.000, color: "#455A64" },  // crust
    { r: 0.940, color: "#354E2E" },  // upper mantle
    { r: R_LOWER_MANTLE / R, color: "#764222" },  // lower mantle
    { r: R_OUTER_CORE / R,   color: "#7D3018" },  // outer core
    { r: R_INNER_CORE / R,   color: "#8A7228" },  // inner core
  ];

  for (const { r, color } of layers) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * maxR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Subtle radial glow toward core
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, (R_OUTER_CORE / R) * maxR);
  grd.addColorStop(0,   "rgba(160, 120, 40, 0.10)");
  grd.addColorStop(0.5, "rgba(120, 50, 20, 0.04)");
  grd.addColorStop(1.0, "rgba(0, 0, 0, 0)");
  ctx.beginPath();
  ctx.arc(cx, cy, (R_OUTER_CORE / R) * maxR, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Boundary rings
  ctx.lineWidth = 1.5;
  for (const { r } of layers.slice(1)) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * maxR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

// ── 3D label sprites ────────────────────────────────────────────────────────

function _createLabelTexture(name, km, temp) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Dark semi-transparent card background
  ctx.fillStyle = "rgba(6, 12, 28, 0.92)";
  _roundRect(ctx, 2, 2, 508, 124, 14);
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = "rgba(100, 160, 240, 0.25)";
  ctx.lineWidth = 1.5;
  _roundRect(ctx, 2, 2, 508, 124, 14);
  ctx.stroke();

  // Layer name
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = 'bold 32px "IBM Plex Mono", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(name, 20, 18);

  // Depth + temperature
  ctx.fillStyle = "rgba(170, 200, 240, 0.72)";
  ctx.font = '24px "IBM Plex Mono", monospace';
  ctx.fillText(`${km}  ·  ${temp}`, 20, 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function _createLabelSprite(info) {
  const tex = _createLabelTexture(info.name, info.km, info.temp);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1); // card aspect ratio 4:1
  sprite.renderOrder = 25;
  sprite.visible = false;
  return sprite;
}

function _createConnectingLine(from, to) {
  const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: 0x7AAAD0,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const line = new THREE.Line(geom, mat);
  line.renderOrder = 24;
  line.visible = false;
  return line;
}

function _buildLabels() {
  // Position labels to the right of the cap face, stacked vertically.
  // Outermost layer (crust) at top, innermost (inner core) at bottom.
  // Lines connect from the layer's mid-radius on the cap edge to the label.
  const labelX = R + 2.0;
  const yTop = 2.0;
  const yStep = -1.0;
  const labelZ = 0.08;

  for (let i = 0; i < LAYER_INFO.length; i++) {
    const info = LAYER_INFO[i];
    const midR = (info.outerR + info.innerR) / 2;
    const labelY = yTop + i * yStep;

    // Anchor on cap face: right side of the layer ring
    const anchor = new THREE.Vector3(midR, 0, labelZ);
    // Label position: to the right, stacked vertically
    const labelPos = new THREE.Vector3(labelX, labelY, labelZ);

    const sprite = _createLabelSprite(info);
    sprite.position.copy(labelPos);
    globeGroup.add(sprite);
    _labelSprites.push(sprite);

    const line = _createConnectingLine(anchor, labelPos);
    globeGroup.add(line);
    _labelLines.push(line);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeLayerSphere(radius, color, emissiveIntensity, renderOrder) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: color === COL_INNER_CORE || color === COL_OUTER_CORE ? 0.30 : 0.05,
    emissive: color,
    emissiveIntensity,
    clippingPlanes: _CLIP_PLANES,
    clipIntersection: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  globeGroup.add(mesh);
  return mesh;
}

function _makeCapDisc() {
  const tex = _createCapTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(R, 256), mat);
  mesh.position.z = 0.01;
  mesh.renderOrder = 20;
  mesh.visible = false;
  globeGroup.add(mesh);
  return mesh;
}

function _setClip(mat, apply) {
  if (!mat) return;
  mat.clippingPlanes  = apply ? _CLIP_PLANES : [];
  mat.clipIntersection = false;
  mat.needsUpdate      = true;
}

function _applyOuterClipping(apply) {
  const targets = [
    earthMaterial,
    clouds.material,
    heatmapMesh.material,
    cloudCoverMesh.material,
    precipMesh.material,
  ];
  for (const mat of targets) _setClip(mat, apply);

  const tzMesh = globeGroup.children.find(
    (c) => c.material?.map && c.geometry?.type === "SphereGeometry" && c.renderOrder === 9
  );
  if (tzMesh) _setClip(tzMesh.material, apply);

  const wpMesh = globeGroup.children.find(
    (c) => c.isPoints && c.renderOrder === 7
  );
  if (wpMesh) _setClip(wpMesh.material, apply);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initEarthInterior() {
  if (_initialized) return;
  _initialized = true;

  _layerMeshes.push(_makeLayerSphere(R_UPPER_MANTLE, COL_UPPER_MANTLE, 0.06, 1));
  _layerMeshes.push(_makeLayerSphere(R_LOWER_MANTLE, COL_LOWER_MANTLE, 0.10, 2));
  _layerMeshes.push(_makeLayerSphere(R_OUTER_CORE,   COL_OUTER_CORE,   0.15, 3));
  _layerMeshes.push(_makeLayerSphere(R_INNER_CORE,   COL_INNER_CORE,   0.22, 4));

  _capMesh = _makeCapDisc();
  _buildLabels();
}

export function enableEarthInterior() {
  if (!_initialized) initEarthInterior();

  renderer.localClippingEnabled = true;
  _applyOuterClipping(true);

  _prevNightLightsVisible  = nightLights.visible;
  _prevTerminatorVisible   = terminatorOverlay.visible;
  nightLights.visible      = false;
  terminatorOverlay.visible = false;

  for (const m of _layerMeshes) m.visible = true;
  _capMesh.visible = true;
  for (const s of _labelSprites) s.visible = true;
  for (const l of _labelLines) l.visible = true;
}

export function disableEarthInterior() {
  if (!_initialized) return;

  _applyOuterClipping(false);

  nightLights.visible       = _prevNightLightsVisible;
  terminatorOverlay.visible = _prevTerminatorVisible;

  for (const m of _layerMeshes) m.visible = false;
  _capMesh.visible = false;
  for (const s of _labelSprites) s.visible = false;
  for (const l of _labelLines) l.visible = false;

  renderer.localClippingEnabled = false;
}
