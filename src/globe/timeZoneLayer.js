/**
 * Global Time Zones Layer
 *
 * Renders a canvas-textured sphere overlay showing:
 *  - Real timezone boundaries fetched from Natural Earth GeoJSON (lazy-loaded)
 *  - UTC offset label (e.g. "UTC+9", "UTC+5:30") at polygon centroid
 *  - Current local time (HH:MM) for each zone
 *  - Hover highlighting: the zone under the mouse cursor is filled with cyan
 *
 * No background color fills — only boundary strokes, labels, and the hover highlight.
 * Falls back to approximate 15° bands if the GeoJSON fetch fails.
 * The canvas is 2048×1024 equirectangular. Updated every ~30 seconds.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

// Canvas resolution
const W = 2048;
const H = 1024;

// Natural Earth 10m timezone GeoJSON (via jsDelivr CDN).
const GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_time_zones.geojson";

// ── Fallback: approximate 15° bands ──────────────────────────────────────────
const FALLBACK_ZONES = [
  { lonMin: -180,   lonMax: -172.5, offset: -12,  label: "UTC-12" },
  { lonMin: -172.5, lonMax: -157.5, offset: -11,  label: "UTC-11" },
  { lonMin: -157.5, lonMax: -142.5, offset: -10,  label: "UTC-10" },
  { lonMin: -142.5, lonMax: -127.5, offset: -9,   label: "UTC-9"  },
  { lonMin: -127.5, lonMax: -112.5, offset: -8,   label: "UTC-8"  },
  { lonMin: -112.5, lonMax: -97.5,  offset: -7,   label: "UTC-7"  },
  { lonMin: -97.5,  lonMax: -82.5,  offset: -6,   label: "UTC-6"  },
  { lonMin: -82.5,  lonMax: -67.5,  offset: -5,   label: "UTC-5"  },
  { lonMin: -67.5,  lonMax: -52.5,  offset: -4,   label: "UTC-4"  },
  { lonMin: -52.5,  lonMax: -37.5,  offset: -3,   label: "UTC-3"  },
  { lonMin: -37.5,  lonMax: -22.5,  offset: -2,   label: "UTC-2"  },
  { lonMin: -22.5,  lonMax: -7.5,   offset: -1,   label: "UTC-1"  },
  { lonMin: -7.5,   lonMax:  7.5,   offset:  0,   label: "UTC+0"  },
  { lonMin:  7.5,   lonMax:  22.5,  offset:  1,   label: "UTC+1"  },
  { lonMin:  22.5,  lonMax:  37.5,  offset:  2,   label: "UTC+2"  },
  { lonMin:  37.5,  lonMax:  52.5,  offset:  3,   label: "UTC+3"  },
  { lonMin:  52.5,  lonMax:  60,    offset:  4,   label: "UTC+4"  },
  { lonMin:  60,    lonMax:  67.5,  offset:  5,   label: "UTC+5"  },
  { lonMin:  67.5,  lonMax:  97.5,  offset:  5.5, label: "UTC+5:30" },
  { lonMin:  97.5,  lonMax: 112.5,  offset:  7,   label: "UTC+7"  },
  { lonMin: 112.5,  lonMax: 127.5,  offset:  8,   label: "UTC+8"  },
  { lonMin: 127.5,  lonMax: 142.5,  offset:  9,   label: "UTC+9"  },
  { lonMin: 142.5,  lonMax: 157.5,  offset: 10,   label: "UTC+10" },
  { lonMin: 157.5,  lonMax: 172.5,  offset: 11,   label: "UTC+11" },
  { lonMin: 172.5,  lonMax: 180,    offset: 12,   label: "UTC+12" },
];

// ── GeoJSON state ─────────────────────────────────────────────────────────────
let _geoJSON = null;
let _fetchPromise = null;
let _fetchFailed = false;

// ── Hover state ───────────────────────────────────────────────────────────────
let _highlightedIndex = -1;   // feature index currently highlighted (-1 = none)
let _lastBuildTime = new Date();

// ── Main display canvas + texture ─────────────────────────────────────────────
const _canvas = document.createElement("canvas");
_canvas.width  = W;
_canvas.height = H;
const _texture = new THREE.CanvasTexture(_canvas);
_texture.colorSpace = THREE.SRGBColorSpace;

// ── Zone ID picking canvas (offscreen) ────────────────────────────────────────
// Each zone polygon is filled with a unique color: R = index & 0xFF, G = (index >> 8) & 0xFF, B = 1
// Background is (0,0,0) — B=0 means "no zone"
const _idCanvas = document.createElement("canvas");
_idCanvas.width  = W;
_idCanvas.height = H;
let _idImageData = null; // cached ImageData for fast pixel reads

// ── Sphere mesh ──────────────────────────────────────────────────────────────
export const timeZoneMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.042, 64, 32),
  new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  })
);
timeZoneMesh.renderOrder = 9;
timeZoneMesh.visible = false;
globeGroup.add(timeZoneMesh);

// ── Helpers ──────────────────────────────────────────────────────────────────

function _parseOffset(props) {
  if (typeof props.zone === "number" && !isNaN(props.zone)) return props.zone;
  if (typeof props.zone === "string") {
    const n = parseFloat(props.zone);
    if (!isNaN(n)) return n;
  }
  const fmtStr = String(props.utc_format ?? props.time_zone ?? "");
  const cleaned = fmtStr.replace(/^UTC/, "");
  const m = cleaned.match(/^([+-]?)(\d{1,2})(?::(\d{2}))?$/);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0));
  }
  return 0;
}

function _offsetLabel(offset) {
  if (offset === 0) return "UTC";
  const sign  = offset >= 0 ? "+" : "-";
  const abs   = Math.abs(offset);
  const h     = Math.floor(abs);
  const m     = Math.round((abs - h) * 60);
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

function _localHour(offset, now) {
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  return (((utcMins + offset * 60) % 1440) + 1440) % 1440 / 60;
}

function _formatTime(offset, now) {
  const h  = _localHour(offset, now);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}

/** Encode a feature index as a CSS color for the ID canvas. */
function _idColor(index) {
  const r = index & 0xFF;
  const g = (index >> 8) & 0xFF;
  return `rgb(${r},${g},1)`;
}

/** Decode a pixel from the ID canvas back to a feature index. Returns -1 if no zone. */
function _decodeId(r, g, b) {
  if (b === 0) return -1; // background = no zone
  return r + (g << 8);
}

// ── GeoJSON rendering helpers ─────────────────────────────────────────────────

function _drawRing(ctx, ring) {
  if (ring.length < 2) return;
  ctx.moveTo(((ring[0][0] + 180) / 360) * W, ((90 - ring[0][1]) / 180) * H);
  for (let j = 1; j < ring.length; j++) {
    const lon0 = ring[j - 1][0];
    const lon1 = ring[j][0];
    const x1   = ((lon1 + 180) / 360) * W;
    const y1   = ((90  - ring[j][1]) / 180) * H;
    if (Math.abs(lon1 - lon0) > 180) {
      ctx.moveTo(x1, y1);
    } else {
      ctx.lineTo(x1, y1);
    }
  }
}

function _drawGeometry(ctx, geometry, doFill, doStroke) {
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    ctx.beginPath();
    for (const ring of coordinates) _drawRing(ctx, ring);
    ctx.closePath();
    if (doFill) ctx.fill();
    if (doStroke) ctx.stroke();
  } else if (type === "MultiPolygon") {
    for (const polygon of coordinates) {
      ctx.beginPath();
      for (const ring of polygon) _drawRing(ctx, ring);
      ctx.closePath();
      if (doFill) ctx.fill();
      if (doStroke) ctx.stroke();
    }
  }
}

function _ringCentroid(ring) {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
  return [sumLon / ring.length, sumLat / ring.length];
}

function _lonSpan(geometry) {
  let minLon = Infinity, maxLon = -Infinity;
  const scan = (ring) => {
    for (const [lon] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  };
  if (geometry.type === "Polygon") {
    scan(geometry.coordinates[0]);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) scan(poly[0]);
  }
  const span = maxLon - minLon;
  return span > 200 ? 30 : span;
}

function _labelPos(geometry) {
  if (geometry.type === "Polygon") {
    return _ringCentroid(geometry.coordinates[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let bestArea = -1, bestRing = null;
    for (const poly of geometry.coordinates) {
      const ring = poly[0];
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      }
      const area = (maxLon - minLon) * (maxLat - minLat);
      if (area > bestArea) { bestArea = area; bestRing = ring; }
    }
    return bestRing ? _ringCentroid(bestRing) : null;
  }
  return null;
}

// ── ID canvas builders ────────────────────────────────────────────────────────

function _buildIdFromGeoJSON(geojson) {
  const ctx = _idCanvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < geojson.features.length; i++) {
    ctx.fillStyle = _idColor(i);
    ctx.strokeStyle = _idColor(i);
    ctx.lineWidth = 1;
    _drawGeometry(ctx, geojson.features[i].geometry, true, true);
  }
  _idImageData = ctx.getImageData(0, 0, W, H);
}

function _buildIdFromFallback() {
  const ctx = _idCanvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < FALLBACK_ZONES.length; i++) {
    const zone = FALLBACK_ZONES[i];
    const x0 = Math.round((zone.lonMin + 180) / 360 * W);
    const x1 = Math.round((zone.lonMax + 180) / 360 * W);
    ctx.fillStyle = _idColor(i);
    ctx.fillRect(x0, 0, x1 - x0, H);
  }
  _idImageData = ctx.getImageData(0, 0, W, H);
}

// ── Display canvas builders ──────────────────────────────────────────────────

function _drawLabelsGeoJSON(ctx, geojson, now) {
  for (const feature of geojson.features) {
    const geo    = feature.geometry;
    const props  = feature.properties ?? {};
    const offset = _parseOffset(props);
    const span   = _lonSpan(geo);
    if (span < 8) continue;

    const pos = _labelPos(geo);
    if (!pos) continue;
    const lx = ((pos[0] + 180) / 360) * W;
    const ly = ((90 - pos[1]) / 180) * H;
    if (lx < 0 || lx > W || ly < 0 || ly > H) continue;

    const bandPx   = (span / 360) * W;
    const fontSize = Math.max(9, Math.min(15, bandPx / 6));
    const timeSize = Math.max(8, Math.min(12, bandPx / 8));

    ctx.save();
    ctx.textAlign   = "center";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur  = 4;

    ctx.font      = `bold ${fontSize}px Arial,sans-serif`;
    ctx.fillStyle = "rgba(210,235,255,0.90)";
    ctx.fillText(_offsetLabel(offset), lx, ly - fontSize * 0.6);

    ctx.font      = `${timeSize}px Arial,sans-serif`;
    ctx.fillStyle = "rgba(170,210,255,0.80)";
    ctx.fillText(_formatTime(offset, now), lx, ly + timeSize * 0.8);

    ctx.restore();
  }
}

function _buildFromGeoJSON(geojson, now, highlightIndex = -1) {
  const ctx = _canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  // Draw highlight fill for the hovered zone (before boundaries so strokes draw on top)
  if (highlightIndex >= 0 && highlightIndex < geojson.features.length) {
    ctx.fillStyle = "rgba(60,220,255,0.18)";
    _drawGeometry(ctx, geojson.features[highlightIndex].geometry, true, false);
  }

  // Boundary strokes only (no fill)
  ctx.lineWidth   = 0.5;
  ctx.strokeStyle = "rgba(120,160,255,0.18)";
  for (const feature of geojson.features) {
    _drawGeometry(ctx, feature.geometry, false, true);
  }

  // Labels
  _drawLabelsGeoJSON(ctx, geojson, now);

  // Equator guide line
  ctx.strokeStyle = "rgba(180,210,255,0.08)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  _texture.needsUpdate = true;
}

function _buildFromFallback(now, highlightIndex = -1) {
  const ctx       = _canvas.getContext("2d");
  const equatorY  = H / 2;
  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i < FALLBACK_ZONES.length; i++) {
    const zone  = FALLBACK_ZONES[i];
    const x0    = Math.round((zone.lonMin + 180) / 360 * W);
    const x1    = Math.round((zone.lonMax + 180) / 360 * W);
    const bandW = x1 - x0;
    const cx    = (x0 + x1) / 2;

    // Highlight fill for hovered zone
    if (i === highlightIndex) {
      ctx.fillStyle = "rgba(60,220,255,0.18)";
      ctx.fillRect(x0, 0, bandW, H);
    }

    // Boundary stroke
    ctx.strokeStyle = "rgba(120,160,255,0.18)";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, H);
    ctx.stroke();

    if (bandW < 35) continue;

    const fontSize = Math.max(10, Math.min(15, bandW / 4.5));
    const timeSize = Math.max(8,  Math.min(12, bandW / 5.5));

    ctx.save();
    ctx.textAlign   = "center";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur  = 4;

    ctx.font      = `bold ${fontSize}px Arial,sans-serif`;
    ctx.fillStyle = "rgba(210,235,255,0.90)";
    ctx.fillText(zone.label, cx, equatorY - 18);

    ctx.font      = `${timeSize}px Arial,sans-serif`;
    ctx.fillStyle = "rgba(170,210,255,0.80)";
    ctx.fillText(_formatTime(zone.offset, now), cx, equatorY + 4);

    ctx.restore();
  }

  ctx.strokeStyle = "rgba(180,210,255,0.08)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, equatorY);
  ctx.lineTo(W, equatorY);
  ctx.stroke();

  _texture.needsUpdate = true;
}

// ── GeoJSON lazy-fetch ────────────────────────────────────────────────────────

function _fetchGeoJSON() {
  if (_geoJSON)        return Promise.resolve(_geoJSON);
  if (_fetchPromise)   return _fetchPromise;

  _fetchPromise = fetch(GEOJSON_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`GeoJSON fetch failed: ${r.status}`);
      return r.json();
    })
    .then((data) => {
      _geoJSON = data;
      _fetchPromise = null;
      return data;
    })
    .catch((err) => {
      console.warn("[timeZoneLayer] GeoJSON fetch failed, using fallback bands:", err.message);
      _fetchFailed  = true;
      _fetchPromise = null;
      return null;
    });

  return _fetchPromise;
}

// ── Internal redraw (used by both periodic updates and hover) ─────────────────

function _redraw(now, highlightIndex) {
  if (_geoJSON) {
    _buildFromGeoJSON(_geoJSON, now, highlightIndex);
  } else {
    _buildFromFallback(now, highlightIndex);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildTimeZoneCanvas(now = new Date()) {
  _lastBuildTime = now;

  if (_geoJSON) {
    _buildFromGeoJSON(_geoJSON, now, _highlightedIndex);
    // ID canvas only needs rebuilding once per GeoJSON load
    if (!_idImageData) _buildIdFromGeoJSON(_geoJSON);
    return;
  }

  _buildFromFallback(now, _highlightedIndex);
  if (!_idImageData) _buildIdFromFallback();

  if (!_fetchFailed) {
    _fetchGeoJSON().then((data) => {
      if (data && timeZoneMesh.visible) {
        _buildIdFromGeoJSON(data);
        _buildFromGeoJSON(data, new Date(), _highlightedIndex);
      }
    });
  }
}

export function updateTimeZoneLayer() {
  if (timeZoneMesh.visible) {
    buildTimeZoneCanvas(new Date());
  }
}

/**
 * Highlight the timezone zone at the given UV coordinates.
 * u,v are in [0,1] range (equirectangular texture coordinates).
 * Call with u=-1 or v=-1 to clear the highlight.
 */
export function highlightZoneAtUV(u, v) {
  if (!_idImageData || !timeZoneMesh.visible) {
    if (_highlightedIndex !== -1) {
      _highlightedIndex = -1;
      _redraw(_lastBuildTime, -1);
    }
    return;
  }

  let newIndex = -1;
  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    const px = Math.floor(u * (W - 1));
    const py = Math.floor(v * (H - 1));
    const off = (py * W + px) * 4;
    const r = _idImageData.data[off];
    const g = _idImageData.data[off + 1];
    const b = _idImageData.data[off + 2];
    newIndex = _decodeId(r, g, b);
  }

  if (newIndex === _highlightedIndex) return; // no change

  _highlightedIndex = newIndex;
  _redraw(_lastBuildTime, newIndex);
}

/**
 * Clear any timezone hover highlight.
 */
export function clearTimeZoneHighlight() {
  highlightZoneAtUV(-1, -1);
}
