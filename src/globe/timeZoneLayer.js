/**
 * Global Time Zones Layer
 *
 * Renders a canvas-textured sphere overlay showing:
 *  - Approximate time zone bands (25 zones, simplified from real IANA data)
 *  - Night/day tinting: dark blue = midnight, transparent = noon
 *  - UTC offset label (e.g. "+9", "+5:30") at equator height
 *  - Current local time (HH:MM) for each zone
 *
 * The canvas is 2048×1024 equirectangular. Updated every ~30 seconds.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

// Canvas resolution
const W = 2048;
const H = 1024;

// ── Timezone band definitions ─────────────────────────────────────────────────
// Simplified approximations of real IANA timezone boundaries.
// Each entry: { lonMin, lonMax, offset (hours, may be fractional), label }
// Source: standard UTC offset zones + major country exceptions (India +5:30)
const ZONES = [
  { lonMin: -180,   lonMax: -172.5, offset: -12,  label: "-12" },
  { lonMin: -172.5, lonMax: -157.5, offset: -11,  label: "-11" },
  { lonMin: -157.5, lonMax: -142.5, offset: -10,  label: "-10" },
  { lonMin: -142.5, lonMax: -127.5, offset: -9,   label:  "-9" },
  { lonMin: -127.5, lonMax: -112.5, offset: -8,   label:  "-8" },
  { lonMin: -112.5, lonMax: -97.5,  offset: -7,   label:  "-7" },
  { lonMin: -97.5,  lonMax: -82.5,  offset: -6,   label:  "-6" },
  { lonMin: -82.5,  lonMax: -67.5,  offset: -5,   label:  "-5" },
  { lonMin: -67.5,  lonMax: -52.5,  offset: -4,   label:  "-4" },
  { lonMin: -52.5,  lonMax: -37.5,  offset: -3,   label:  "-3" },
  { lonMin: -37.5,  lonMax: -22.5,  offset: -2,   label:  "-2" },
  { lonMin: -22.5,  lonMax: -7.5,   offset: -1,   label:  "-1" },
  { lonMin: -7.5,   lonMax:  7.5,   offset:  0,   label:  "+0" },
  { lonMin:  7.5,   lonMax:  22.5,  offset:  1,   label:  "+1" },
  { lonMin:  22.5,  lonMax:  37.5,  offset:  2,   label:  "+2" },
  { lonMin:  37.5,  lonMax:  52.5,  offset:  3,   label:  "+3" },
  { lonMin:  52.5,  lonMax:  60,    offset:  4,   label:  "+4" },
  { lonMin:  60,    lonMax:  67.5,  offset:  5,   label:  "+5" },
  // India/Sri Lanka: UTC+5:30 — spans ~67°E–97°E, 30° wide
  { lonMin:  67.5,  lonMax:  97.5,  offset:  5.5, label: "+5:30" },
  { lonMin:  97.5,  lonMax: 112.5,  offset:  7,   label:  "+7" },
  { lonMin: 112.5,  lonMax: 127.5,  offset:  8,   label:  "+8" },
  { lonMin: 127.5,  lonMax: 142.5,  offset:  9,   label:  "+9" },
  { lonMin: 142.5,  lonMax: 157.5,  offset: 10,   label: "+10" },
  { lonMin: 157.5,  lonMax: 172.5,  offset: 11,   label: "+11" },
  { lonMin: 172.5,  lonMax: 180,    offset: 12,   label: "+12" },
];

// ── Canvas + texture (created once at module level) ──────────────────────────
const _canvas = document.createElement("canvas");
_canvas.width  = W;
_canvas.height = H;
const _texture = new THREE.CanvasTexture(_canvas);
_texture.colorSpace = THREE.SRGBColorSpace;

// ── Sphere mesh (created at module level like other layers) ──────────────────
export const timeZoneMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.042, 128, 64),
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

/** Get local hour (0–24, fractional) for a given UTC offset and current Date. */
function _localHour(offset, now) {
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  return (((utcMins + offset * 60) % 1440) + 1440) % 1440 / 60;
}

/** Format local time as "HH:MM". */
function _formatTime(offset, now) {
  const h = _localHour(offset, now);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}

/**
 * Night intensity at a given local hour.
 * 0 = full day (noon), 1 = full night (midnight).
 */
function _nightIntensity(localHour) {
  // Smoothstep around midnight: peaks at 0h, zero at 12h
  return 0.5 * (1 + Math.cos((localHour / 12) * Math.PI));
}

// ── Main canvas draw ─────────────────────────────────────────────────────────

/**
 * Rebuild the time zone canvas for the given Date.
 * Called initially and every ~30 seconds while visible.
 */
export function buildTimeZoneCanvas(now = new Date()) {
  const ctx = _canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const equatorY = H / 2;

  for (const zone of ZONES) {
    const x0 = Math.round((zone.lonMin + 180) / 360 * W);
    const x1 = Math.round((zone.lonMax + 180) / 360 * W);
    const bandW = x1 - x0;
    const cx  = (x0 + x1) / 2;

    const lh = _localHour(zone.offset, now);
    const ni = _nightIntensity(lh); // 0 = noon, 1 = midnight

    // ── Band background color based on local time ──────────────────────────
    // Midnight: dark blue (ni ≈ 1)
    // Twilight (6h or 18h): warm orange-red (ni ≈ 0.5)
    // Noon: near-transparent (ni ≈ 0)
    let r, g, b, a;
    if (lh <= 5 || lh >= 19) {
      // Deep night
      r = 5; g = 15; b = 60;
      a = ni * 0.48;
    } else if (lh <= 7 || lh >= 17) {
      // Twilight / civil twilight
      const t = lh <= 7 ? (lh - 5) / 2 : (19 - lh) / 2; // 0=night edge, 1=day edge
      r = Math.round(5   + t * 220);
      g = Math.round(15  + t * 80);
      b = Math.round(60  + t * (-40));
      a = (1 - t) * 0.35 + 0.02;
    } else {
      // Day: nearly transparent
      r = 200; g = 220; b = 255;
      a = 0.015;
    }

    ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(4)})`;
    ctx.fillRect(x0, 0, bandW, H);

    // ── Vertical divider line ──────────────────────────────────────────────
    ctx.strokeStyle = "rgba(120, 160, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, H);
    ctx.stroke();

    // ── Text labels (only if band is wide enough) ──────────────────────────
    if (bandW < 35) continue;

    const fontSize = Math.max(10, Math.min(15, bandW / 4.5));
    const timeSize = Math.max(8, Math.min(12, bandW / 5.5));

    ctx.save();
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.95)";
    ctx.shadowBlur = 4;

    // UTC offset label (above equator)
    ctx.font = `bold ${fontSize}px 'Arial', sans-serif`;
    ctx.fillStyle = "rgba(210, 235, 255, 0.90)";
    ctx.fillText(zone.label, cx, equatorY - 18);

    // Current local time (below offset)
    ctx.font = `${timeSize}px 'Arial', sans-serif`;
    ctx.fillStyle = "rgba(170, 210, 255, 0.80)";
    ctx.fillText(_formatTime(zone.offset, now), cx, equatorY + 4);

    ctx.restore();
  }

  // ── Equator guide line ────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(180, 210, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, equatorY);
  ctx.lineTo(W, equatorY);
  ctx.stroke();

  _texture.needsUpdate = true;
}

/**
 * Update the time zone layer if it is currently visible.
 * Call every ~30 seconds from main.js.
 */
export function updateTimeZoneLayer() {
  if (timeZoneMesh.visible) {
    buildTimeZoneCanvas(new Date());
  }
}
