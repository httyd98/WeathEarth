/**
 * Water Bodies Layer — Lakes & Rivers
 *
 * Renders a canvas-textured sphere overlay showing worldwide lakes and rivers
 * using Natural Earth 10m GeoJSON data (lazy-loaded from CDN).
 *
 * Lakes: filled semi-transparent blue polygons
 * Rivers: stroked blue lines with width by importance (strokeweig)
 *
 * Canvas resolution: 4096×2048 for HD river detail.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

const W = 8192;
const H = 4096;

const LAKES_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_lakes.geojson";
const RIVERS_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_rivers_lake_centerlines.geojson";

// ── Canvas + Texture + Mesh ─────────────────────────────────────────────────

const _canvas = document.createElement("canvas");
_canvas.width = W;
_canvas.height = H;
const _ctx = _canvas.getContext("2d");

const _texture = new THREE.CanvasTexture(_canvas);
_texture.colorSpace = THREE.SRGBColorSpace;

export const waterBodiesMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.003, 128, 64),
  new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
);
waterBodiesMesh.renderOrder = 8;
waterBodiesMesh.visible = false;
globeGroup.add(waterBodiesMesh);

// ── State ───────────────────────────────────────────────────────────────────

let _built = false;
let _loading = false;
let _lakesData = null;
let _riversData = null;

// ── Coordinate helpers ──────────────────────────────────────────────────────

function _lonToX(lon) { return ((lon + 180) / 360) * W; }
function _latToY(lat) { return ((90 - lat) / 180) * H; }

/**
 * Draw a polygon ring (array of [lon, lat] coordinates) on the canvas.
 * Handles antimeridian crossing by using moveTo when |Δlon| > 180.
 */
function _tracePath(coords) {
  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i];
    const x = _lonToX(lon);
    const y = _latToY(lat);
    if (i === 0) {
      _ctx.moveTo(x, y);
    } else {
      const prevLon = coords[i - 1][0];
      if (Math.abs(lon - prevLon) > 180) {
        _ctx.moveTo(x, y); // antimeridian jump
      } else {
        _ctx.lineTo(x, y);
      }
    }
  }
}

function _drawPolygon(rings) {
  _ctx.beginPath();
  for (const ring of rings) {
    _tracePath(ring);
  }
  _ctx.fill();
  _ctx.stroke();
}

function _drawLineString(coords, lineWidth) {
  _ctx.lineWidth = lineWidth;
  _ctx.beginPath();
  _tracePath(coords);
  _ctx.stroke();
}

// ── Render ──────────────────────────────────────────────────────────────────

function _render() {
  _ctx.clearRect(0, 0, W, H);

  // ── Lakes ──
  if (_lakesData) {
    _ctx.fillStyle = "rgba(40, 160, 220, 0.55)";
    _ctx.strokeStyle = "rgba(30, 130, 200, 0.7)";
    _ctx.lineWidth = 2;
    _ctx.lineJoin = "round";

    for (const feature of _lakesData.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      if (geom.type === "Polygon") {
        _drawPolygon(geom.coordinates);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) {
          _drawPolygon(poly);
        }
      }
    }
  }

  // ── Rivers ──
  if (_riversData) {
    _ctx.strokeStyle = "rgba(50, 180, 240, 0.75)";
    _ctx.lineCap = "round";
    _ctx.lineJoin = "round";

    for (const feature of _riversData.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const sw = feature.properties?.strokeweig ?? 0.3;
      const lw = sw >= 0.8 ? 6.0 : sw >= 0.5 ? 4.0 : sw >= 0.3 ? 2.5 : 1.6;

      if (geom.type === "LineString") {
        _drawLineString(geom.coordinates, lw);
      } else if (geom.type === "MultiLineString") {
        for (const line of geom.coordinates) {
          _drawLineString(line, lw);
        }
      }
    }
  }

  _texture.needsUpdate = true;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) the water bodies canvas.
 * Lazily fetches GeoJSON data on first call.
 * @returns {Promise<boolean>} true if data was loaded and rendered
 */
export async function buildWaterBodiesCanvas() {
  if (_built) {
    _render();
    return true;
  }
  if (_loading) return false;
  _loading = true;

  try {
    const [lakesResp, riversResp] = await Promise.all([
      fetch(LAKES_URL),
      fetch(RIVERS_URL),
    ]);

    if (lakesResp.ok) _lakesData = await lakesResp.json();
    if (riversResp.ok) _riversData = await riversResp.json();

    if (_lakesData || _riversData) {
      _built = true;
      _render();
      return true;
    }
  } catch (err) {
    console.error("[WaterBodies] Fetch failed:", err);
  } finally {
    _loading = false;
  }
  return false;
}
