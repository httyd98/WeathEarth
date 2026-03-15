/**
 * Ice Layer — canvas-based glow patches for polar ice and glacier regions.
 * Draws radial gradient circles on an equirectangular canvas texture,
 * mapped onto a sphere slightly above Earth's surface.
 * Uses AdditiveBlending for a luminous, halo-like appearance.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { ICE_REGIONS } from "../data/hazardsData.js";

// Sphere altitude: 20 km above Earth (Earth radius ~6371 km)
const ICE_SPHERE_R = GLOBE_RADIUS * (1 + 20 / 6371);

const CANVAS_W = 2048;
const CANVAS_H = 1024;

// Status → RGBA base color
const STATUS_COLORS = {
  stable:   [68,  153, 255],
  melting:  [255, 170, 34],
  critical: [255, 34,  34],
};

let _active = false;
let _mesh   = null;

// ── Canvas drawing ───────────────────────────────────────────────────────────

function _drawIce(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  for (const region of ICE_REGIONS) {
    const { lat, lon, radiusDeg, status } = region;

    // Convert lat/lon to equirectangular pixel coordinates
    const x       = ((lon + 180) / 360) * CANVAS_W;
    const y       = ((90 - lat) / 180) * CANVAS_H;
    const radiusPx = (radiusDeg / 360) * CANVAS_W;

    const [r, g, b] = STATUS_COLORS[status] ?? STATUS_COLORS.melting;

    // Radial gradient: opaque center → transparent edge
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radiusPx);
    grad.addColorStop(0,   `rgba(${r},${g},${b},0.8)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
    grad.addColorStop(0.75,`rgba(${r},${g},${b},0.2)`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);

    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Soft blur pass for smoother glow edges
  ctx.filter = "blur(8px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
}

// ── Build / dispose ──────────────────────────────────────────────────────────

function _disposeMesh() {
  if (_mesh) {
    globeGroup.remove(_mesh);
    _mesh.geometry.dispose();
    if (_mesh.material.map) _mesh.material.map.dispose();
    _mesh.material.dispose();
    _mesh = null;
  }
}

function _buildMesh() {
  _disposeMesh();

  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;

  _drawIce(canvas);

  const texture = new THREE.CanvasTexture(canvas);

  const geo = new THREE.SphereGeometry(ICE_SPHERE_R, 128, 64);
  const mat = new THREE.MeshBasicMaterial({
    map:         texture,
    transparent: true,
    opacity:     0.7,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    side:        THREE.FrontSide,
    toneMapped:  false,
  });

  _mesh = new THREE.Mesh(geo, mat);
  _mesh.renderOrder = 10;
  globeGroup.add(_mesh);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function enableIce() {
  _active = true;
  _buildMesh();
  if (_mesh) _mesh.visible = true;
}

export function disableIce() {
  _active = false;
  if (_mesh) _mesh.visible = false;
}
