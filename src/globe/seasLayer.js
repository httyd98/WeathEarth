/**
 * Seas Layer — Named Seas and Oceans
 *
 * Renders a canvas-textured sphere overlay showing the names of major seas
 * and oceans of the world in Italian, using equirectangular text placement.
 *
 * Canvas resolution: 2048×1024
 * Sphere offset: GLOBE_RADIUS + 0.002 (barely above surface)
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

const W = 2048;
const H = 1024;

// ── Seas / Oceans data ───────────────────────────────────────────────────────
// Each entry: { name, lat, lon, fontSize }
// Coordinates are the label anchor point in geographic degrees.

const SEAS_DATA = [
  // Major oceans
  { name: "Oceano Pacifico",            lat:   0, lon: -160, fontSize: 28 },
  { name: "Oceano Atlantico",           lat:  10, lon:  -30, fontSize: 26 },
  { name: "Oceano Indiano",             lat: -20, lon:   80, fontSize: 24 },
  { name: "Oceano Artico",              lat:  82, lon:    0, fontSize: 20 },
  { name: "Oceano Antartico",           lat: -68, lon:    0, fontSize: 18 },

  // Atlantic seas and gulfs
  { name: "Mar dei Caraibi",            lat:  15, lon:  -75, fontSize: 15 },
  { name: "Golfo del Messico",          lat:  24, lon:  -90, fontSize: 14 },
  { name: "Mare del Nord",              lat:  56, lon:    4, fontSize: 13 },
  { name: "Mar Baltico",                lat:  58, lon:   20, fontSize: 12 },
  { name: "Baia di Hudson",             lat:  60, lon:  -85, fontSize: 13 },
  { name: "Mare di Norvegia",           lat:  70, lon:    5, fontSize: 13 },
  { name: "Mare di Barents",            lat:  74, lon:   40, fontSize: 13 },
  { name: "Golfo di Guinea",            lat:   2, lon:    5, fontSize: 13 },

  // Mediterranean and marginal seas
  { name: "Mar Mediterraneo",           lat:  36, lon:   14, fontSize: 15 },
  { name: "Mar Nero",                   lat:  43, lon:   34, fontSize: 12 },
  { name: "Mar Caspio",                 lat:  42, lon:   52, fontSize: 12 },
  { name: "Mare Adriatico",             lat:  43, lon:   15, fontSize: 11 },
  { name: "Mar Egeo",                   lat:  38, lon:   25, fontSize: 11 },
  { name: "Mar Rosso",                  lat:  20, lon:   38, fontSize: 13 },

  // Indian Ocean seas and gulfs
  { name: "Mare Arabico",               lat:  15, lon:   65, fontSize: 16 },
  { name: "Baia del Bengala",           lat:  15, lon:   90, fontSize: 15 },
  { name: "Golfo Persico",              lat:  27, lon:   52, fontSize: 11 },
  { name: "Golfo di Aden",              lat:  13, lon:   47, fontSize: 11 },
  { name: "Canale del Mozambico",       lat: -18, lon:   42, fontSize: 11 },

  // Pacific seas
  { name: "Mar Cinese Meridionale",     lat:  12, lon:  114, fontSize: 15 },
  { name: "Mar Cinese Orientale",       lat:  30, lon:  125, fontSize: 13 },
  { name: "Mar del Giappone",           lat:  40, lon:  134, fontSize: 13 },
  { name: "Mare dei Coralli",           lat: -20, lon:  155, fontSize: 14 },
  { name: "Mare di Tasman",             lat: -40, lon:  160, fontSize: 13 },
  { name: "Mare di Bering",             lat:  58, lon: -175, fontSize: 14 },
  { name: "Golfo dell'Alaska",          lat:  57, lon: -148, fontSize: 12 },
  { name: "Mare delle Filippine",       lat:  18, lon:  132, fontSize: 13 },
];

// ── Canvas + Texture + Mesh ─────────────────────────────────────────────────

const _canvas = document.createElement("canvas");
_canvas.width  = W;
_canvas.height = H;
const _ctx = _canvas.getContext("2d");

const _texture = new THREE.CanvasTexture(_canvas);
_texture.colorSpace = THREE.SRGBColorSpace;

const _mesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS + 0.002, 128, 64),
  new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity: 0.92,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  })
);
_mesh.renderOrder = 9;
_mesh.visible = false;
globeGroup.add(_mesh);

// ── State ────────────────────────────────────────────────────────────────────

let _built = false;

// ── Coordinate helpers ───────────────────────────────────────────────────────

function _lonToX(lon) { return ((lon + 180) / 360) * W; }
function _latToY(lat) { return ((90 - lat) / 180) * H; }

// ── Drawing ──────────────────────────────────────────────────────────────────

function _drawSeas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  for (const entry of SEAS_DATA) {
    const x  = _lonToX(entry.lon);
    const y  = _latToY(entry.lat);
    const fs = entry.fontSize;

    ctx.font = `${fs >= 40 ? "900" : "bold"} ${fs}px 'Arial Narrow', Arial, sans-serif`;

    // Dark halo for contrast (draw stroke first, then fill on top)
    ctx.lineWidth   = Math.max(3, fs * 0.3);
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "rgba(0,10,30,0.95)";
    ctx.shadowColor = "rgba(0,5,20,0.9)";
    ctx.shadowBlur  = fs * 0.6;
    ctx.strokeText(entry.name, x, y);

    // Bright fill
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = "rgba(210,235,255,0.95)";
    ctx.fillText(entry.name, x, y);
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable the seas layer. Draws the canvas on first call.
 */
export function enableSeas() {
  if (!_built) {
    _drawSeas(_canvas);
    _texture.needsUpdate = true;
    _built = true;
  }
  _mesh.visible = true;
}

/**
 * Disable (hide) the seas layer.
 */
export function disableSeas() {
  _mesh.visible = false;
}
