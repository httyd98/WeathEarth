/**
 * RainViewer Radar Layer
 *
 * Fetches the latest global precipitation radar from RainViewer API,
 * stitches 4 z=1 Mercator tiles into a 1024×1024 canvas, then reprojects
 * to equirectangular (512×256) for the globe precipitation texture.
 *
 * Auto-refreshes every 10 minutes when active.
 *
 * Color scheme 6 (vivid) is used for maximum visibility.
 * Smooth=1, snow=1 options enabled.
 */

import { precipCanvas, precipTexture } from "./scene.js";
import { weatherState } from "../state.js";
import { buildPrecipitationCanvas } from "./precipitationLayer.js";

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SIZE = 512;
const STITCHED = TILE_SIZE * 2; // 1024
const OUT_W = 512, OUT_H = 256;
const COLOR = 6;
const REFRESH_MS = 10 * 60 * 1000;

// Off-DOM stitch canvas reused across calls
const _stitchCanvas = document.createElement("canvas");
_stitchCanvas.width = STITCHED;
_stitchCanvas.height = STITCHED;
const _stitchCtx = _stitchCanvas.getContext("2d");

let _intervalId = null;

/**
 * Fetch latest RainViewer radar and apply to precipCanvas.
 * Returns { timestamp, ageMinutes } on success, null on failure.
 */
export async function fetchAndApplyRainViewer() {
  try {
    const res = await fetch(RAINVIEWER_API);
    if (!res.ok) throw new Error(`RainViewer meta HTTP ${res.status}`);
    const meta = await res.json();

    const past = meta?.radar?.past;
    if (!past?.length) throw new Error("No radar data in RainViewer response");

    const latest = past[past.length - 1];
    const path = latest.path;    // e.g. "/v2/radar/1741234567"
    const ts   = latest.time;    // Unix seconds

    // Fetch all 4 z=1 tiles in parallel
    const [t00, t10, t01, t11] = await Promise.all([
      _loadTile(path, 0, 0),
      _loadTile(path, 1, 0),
      _loadTile(path, 0, 1),
      _loadTile(path, 1, 1),
    ]);

    // Stitch into 1024×1024 Mercator canvas
    _stitchCtx.clearRect(0, 0, STITCHED, STITCHED);
    _stitchCtx.drawImage(t00, 0,         0        );
    _stitchCtx.drawImage(t10, TILE_SIZE, 0        );
    _stitchCtx.drawImage(t01, 0,         TILE_SIZE);
    _stitchCtx.drawImage(t11, TILE_SIZE, TILE_SIZE);

    // Reproject Mercator → Equirectangular into precipCanvas
    _reproject();

    const ageMinutes = Math.round((Date.now() / 1000 - ts) / 60);
    weatherState.useRainViewer = true;
    return { timestamp: ts, ageMinutes };
  } catch (err) {
    console.warn("[RainViewer] Failed, falling back to Gaussian blobs:", err.message);
    weatherState.useRainViewer = false;
    return null;
  }
}

export function startRainViewerRefresh(onSuccess, onFail) {
  stopRainViewerRefresh();
  _intervalId = setInterval(async () => {
    if (!weatherState.showPrecipitation) return;
    const result = await fetchAndApplyRainViewer();
    if (result) onSuccess(result);
    else {
      buildPrecipitationCanvas(weatherState.points);
      onFail();
    }
  }, REFRESH_MS);
}

export function stopRainViewerRefresh() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  weatherState.useRainViewer = false;
}

function _loadTile(path, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Tile ${x},${y} failed`));
    img.src = `https://tilecache.rainviewer.com${path}/${TILE_SIZE}/1/${x}/${y}/${COLOR}/1_1.png`;
  });
}

/**
 * Reproject Web Mercator (stitchCanvas 1024×1024) → Equirectangular (512×256).
 *
 * For each output pixel (px, py):
 *   lat = 90 - (py/H)*180
 *   mercY = 0.5 - ln(tan(π/4 + latRad/2)) / (2π)   → [0,1] top=85°N bottom=85°S
 *   mercX = (lon+180)/360                             → [0,1]
 */
function _reproject() {
  const srcData = _stitchCtx.getImageData(0, 0, STITCHED, STITCHED).data;

  const outCtx = precipCanvas.getContext("2d");
  const outImg = outCtx.createImageData(OUT_W, OUT_H);
  const dst = outImg.data;

  for (let py = 0; py < OUT_H; py++) {
    const lat    = 90 - (py / OUT_H) * 180;
    const latRad = lat * (Math.PI / 180);
    const mercY  = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
    if (mercY < 0 || mercY > 1) continue; // beyond Mercator ±85°

    const srcY = Math.min(Math.round(mercY * (STITCHED - 1)), STITCHED - 1);

    for (let px = 0; px < OUT_W; px++) {
      const srcX = Math.round((px / OUT_W) * (STITCHED - 1));
      const s = (srcY * STITCHED + srcX) * 4;
      const d = (py  * OUT_W   + px)    * 4;
      dst[d]     = srcData[s];
      dst[d + 1] = srcData[s + 1];
      dst[d + 2] = srcData[s + 2];
      dst[d + 3] = srcData[s + 3];
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  precipTexture.needsUpdate = true;
}
