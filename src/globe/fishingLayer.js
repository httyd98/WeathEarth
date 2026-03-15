/**
 * Fishing Layer — FAO Major Fishing Areas
 *
 * Renders a canvas-textured sphere overlay showing the 19 FAO major fishing
 * areas as labeled boundary polygons with semi-transparent fills.
 *
 * Canvas resolution: 2048×1024
 * Sphere offset: GLOBE_RADIUS + 0.003
 *
 * getFishingZoneAt(lat, lon) returns the FAO zone that contains the point,
 * or null if none match.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

const W = 2048;
const H = 1024;

// ── FAO Fishing Zones data ───────────────────────────────────────────────────
// polygons: array of rings, each ring is [[lon, lat], ...]
// Polygons are approximate bounding-box representations of the real FAO areas.

export const FISHING_ZONES = [
  {
    code: "FAO-18",
    name: "Area Artica",
    species: "Merluzzo, Halibut, Capelin",
    color: "rgba(120,200,255,0.9)",
    polygons: [[
      [-180,  90], [180,  90],
      [ 180,  73], [ 80,  68],
      [   0,  70], [-80,  68],
      [-180,  73],
    ]],
  },
  {
    code: "FAO-21",
    name: "Atlantico nord-ovest",
    species: "Merluzzo atlantico, Aringhe, Gamberi",
    color: "rgba(60,130,255,0.9)",
    polygons: [[
      [-70,  78], [-40,  78],
      [-40,  35], [-70,  35],
      [-80,  45], [-80,  60],
    ]],
  },
  {
    code: "FAO-27",
    name: "Atlantico nord-est",
    species: "Aringa, Merluzzo, Sgombro, Sardina",
    color: "rgba(30,100,220,0.9)",
    polygons: [[
      [-44,  84], [ 68,  84],
      [ 68,  36], [ 10,  36],
      [-20,  36], [-44,  48],
    ]],
  },
  {
    code: "FAO-31",
    name: "Atlantico centro-ovest",
    species: "Tonno tropicale, Delfino, Squalo",
    color: "rgba(0,200,180,0.9)",
    polygons: [[
      [-98,  35], [-60,  35],
      [-50,  20], [-60,   0],
      [-80,   0], [-98,  15],
    ]],
  },
  {
    code: "FAO-34",
    name: "Atlantico centro-est",
    species: "Sardine, Acciughe, Tonno tropicale",
    color: "rgba(0,180,120,0.9)",
    polygons: [[
      [-20,  36], [ 20,  36],
      [ 20,   0], [  5,  -7],
      [-20,  -7], [-20,  10],
    ]],
  },
  {
    code: "FAO-37",
    name: "Mar Mediterraneo e Mar Nero",
    species: "Sardina, Acciugha, Tonno pinna azzurra",
    color: "rgba(80,160,255,0.9)",
    polygons: [[
      [ -6,  48], [ 42,  48],
      [ 42,  30], [  6,  30],
      [ -6,  35],
    ]],
  },
  {
    code: "FAO-41",
    name: "Atlantico sud-ovest",
    species: "Calamaro, Tonno, Merluzzo del Pacifico",
    color: "rgba(0,150,220,0.9)",
    polygons: [[
      [-80,   0], [-25,   0],
      [-20, -60], [-65, -60],
      [-80, -40],
    ]],
  },
  {
    code: "FAO-47",
    name: "Atlantico sud-est",
    species: "Tonno, Pesce spada, Nasello",
    color: "rgba(20,120,180,0.9)",
    polygons: [[
      [ -7,   0], [ 30,   0],
      [ 30, -50], [  5, -50],
      [ -7, -30],
    ]],
  },
  {
    code: "FAO-48",
    name: "Atlantico antartico",
    species: "Krill, Toothfish, Calamaro",
    color: "rgba(160,220,255,0.9)",
    polygons: [[
      [-70, -50], [ 30, -50],
      [ 30, -80], [-70, -80],
    ]],
  },
  {
    code: "FAO-51",
    name: "Oceano Indiano occidentale",
    species: "Tonno, Pesce vela, Calamaro",
    color: "rgba(255,180,30,0.9)",
    polygons: [[
      [ 30,  32], [ 80,  32],
      [ 80, -40], [ 30, -40],
    ]],
  },
  {
    code: "FAO-57",
    name: "Oceano Indiano orientale",
    species: "Tonno, Gamberi, Pesci demersali",
    color: "rgba(255,140,0,0.9)",
    polygons: [[
      [ 80,  32], [150,  32],
      [150, -40], [ 80, -40],
    ]],
  },
  {
    code: "FAO-58",
    name: "Oceano Indiano antartico",
    species: "Toothfish, Krill",
    color: "rgba(200,240,255,0.9)",
    polygons: [[
      [ 30, -50], [150, -50],
      [150, -90], [ 30, -90],
    ]],
  },
  {
    code: "FAO-61",
    name: "Pacifico nord-ovest",
    species: "Pollock, Crab, Salmone",
    color: "rgba(100,220,130,0.9)",
    polygons: [[
      [105,  65], [180,  65],
      [180,  20], [105,  20],
    ]],
  },
  {
    code: "FAO-67",
    name: "Pacifico nord-est",
    species: "Salmone del Pacifico, Halibut, Pollock",
    color: "rgba(60,190,100,0.9)",
    polygons: [[
      [-180,  65], [-110,  65],
      [-110,  30], [-150,  30],
      [-180,  38],
    ]],
  },
  {
    code: "FAO-71",
    name: "Pacifico centro-ovest",
    species: "Tonno tropicale, Gamberi, Pesci corallini",
    color: "rgba(255,220,0,0.9)",
    polygons: [[
      [105,  20], [180,  20],
      [180, -40], [105, -40],
    ]],
  },
  {
    code: "FAO-77",
    name: "Pacifico centro-est",
    species: "Tonno tropicale, Merluzzo, Gamberi",
    color: "rgba(255,200,50,0.9)",
    polygons: [[
      [-180,  40], [-110,  40],
      [-110, -15], [-150, -15],
      [-180, -10],
    ]],
  },
  {
    code: "FAO-81",
    name: "Pacifico sud-ovest",
    species: "Tonno, Calamaro, Pesce spada",
    color: "rgba(180,100,255,0.9)",
    polygons: [[
      [150, -10], [180, -10],
      [180, -60], [150, -60],
    ]],
  },
  {
    code: "FAO-87",
    name: "Pacifico sud-est",
    species: "Sardina, Acciugha, Tonno",
    color: "rgba(220,80,200,0.9)",
    polygons: [[
      [-180, -10], [-70, -10],
      [ -70, -60], [-180, -60],
    ]],
  },
  {
    code: "FAO-88",
    name: "Pacifico antartico",
    species: "Toothfish, Krill",
    color: "rgba(230,245,255,0.9)",
    polygons: [[
      [-180, -60], [150, -60],
      [ 150, -90], [-180, -90],
    ]],
  },
];

// ── Canvas + Texture + Mesh ─────────────────────────────────────────────────

const _canvas = document.createElement("canvas");
_canvas.width  = W;
_canvas.height = H;
const _ctx = _canvas.getContext("2d");

const _texture = new THREE.CanvasTexture(_canvas);
_texture.colorSpace = THREE.SRGBColorSpace;

const _mesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS + 0.003, 128, 64),
  new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity: 0.7,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  })
);
_mesh.renderOrder = 10;
_mesh.visible = false;
globeGroup.add(_mesh);

// ── State ────────────────────────────────────────────────────────────────────

let _built = false;

// ── Coordinate helpers ───────────────────────────────────────────────────────

function _lonToX(lon) { return ((lon + 180) / 360) * W; }
function _latToY(lat) { return ((90 - lat) / 180) * H; }

// ── Polygon centroid ─────────────────────────────────────────────────────────

function _polygonCentroid(ring) {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lon: sumLon / ring.length, lat: sumLat / ring.length };
}

// Point-in-polygon test (ray casting, geographic coords)
function _pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function _drawFishing(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const zone of FISHING_ZONES) {
    const baseColor   = zone.color;
    const fillColor   = baseColor.replace(/[\d.]+\)$/, "0.12)");
    const strokeColor = baseColor.replace(/[\d.]+\)$/, "0.90)");

    for (const ring of zone.polygons) {
      ctx.beginPath();
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const x = _lonToX(lon);
        const y = _latToY(lat);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevLon = ring[i - 1][0];
          if (Math.abs(lon - prevLon) > 180) { ctx.moveTo(x, y); }
          else { ctx.lineTo(x, y); }
        }
      }
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      // Solid border — thick enough to be visible on globe
      ctx.lineWidth   = 3;
      ctx.lineJoin    = "round";
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }

    // Label at centroid of first polygon
    const centroid = _polygonCentroid(zone.polygons[0]);
    const cx = _lonToX(centroid.lon);
    const cy = _latToY(centroid.lat);

    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    // Zone code — bold, readable
    const codeFs = 22;
    ctx.font = `bold ${codeFs}px Arial, sans-serif`;
    ctx.lineWidth   = codeFs * 0.35;
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "rgba(0,5,20,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur  = 10;
    ctx.strokeText(zone.code, cx, cy - 14);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = strokeColor;
    ctx.fillText(zone.code, cx, cy - 14);

    // Zone name
    const nameFs = 17;
    ctx.font = `${nameFs}px Arial, sans-serif`;
    ctx.lineWidth   = nameFs * 0.35;
    ctx.strokeStyle = "rgba(0,5,20,0.95)";
    ctx.shadowBlur  = 8;
    ctx.strokeText(zone.name, cx, cy + 10);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = "rgba(230,240,255,0.95)";
    ctx.fillText(zone.name, cx, cy + 10);
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable the fishing layer. Draws the canvas on first call.
 */
export function enableFishing() {
  if (!_built) {
    _drawFishing(_canvas);
    _texture.needsUpdate = true;
    _built = true;
  }
  _mesh.visible = true;
}

/**
 * Disable (hide) the fishing layer.
 */
export function disableFishing() {
  _mesh.visible = false;
}

/**
 * Return the FAO zone that contains (lat, lon), or null.
 * @param {number} lat  Geographic latitude  (−90 … 90)
 * @param {number} lon  Geographic longitude (−180 … 180)
 * @returns {object|null}
 */
export function getFishingZoneAt(lat, lon) {
  for (const zone of FISHING_ZONES) {
    for (const ring of zone.polygons) {
      if (_pointInPolygon(lon, lat, ring)) return zone;
    }
  }
  return null;
}
