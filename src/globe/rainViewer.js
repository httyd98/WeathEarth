/**
 * RainViewer Radar + GPM IMERG Composite Precipitation Layer
 *
 * Two real data sources combined:
 *
 * 1. RainViewer global radar composite
 *    ─ Aggregates radar networks from US, Europe, Japan, Australia, and others
 *    ─ Very accurate where radar exists (limited to ~80% of populated land)
 *    ─ Missing: Africa, most of South America, Central Asia, open ocean
 *
 * 2. GPM IMERG (Global Precipitation Measurement)
 *    ─ NASA/JAXA satellite constellation measuring precipitation globally
 *    ─ Coverage: 60°S–60°N (true global, no gaps)
 *    ─ ~3.5 h latency (Early Run), updated every 30 min
 *    ─ Less precise than radar but fills ALL areas without radar networks
 *
 * Compositing rule:
 *   ─ Where RainViewer has radar data (non-dark pixel): use RainViewer
 *   ─ Where RainViewer has nothing: overlay IMERG data
 *   ─ Polar regions (>85° lat, beyond Mercator): IMERG only
 *
 * Auto-refreshes every 10 minutes when active.
 */

import { precipCanvas, precipTexture } from "./scene.js";
import { fetchImergImageData } from "./gpmImergLayer.js";

const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const TILE_SIZE = 512;
const STITCHED = TILE_SIZE * 2; // 1024×1024 Mercator canvas
const OUT_W = 512, OUT_H = 256;
const COLOR = 6;  // RainViewer vivid color scheme
const REFRESH_MS = 10 * 60 * 1000;

// Off-DOM stitch canvas (reused across calls)
const _stitchCanvas = document.createElement("canvas");
_stitchCanvas.width  = STITCHED;
_stitchCanvas.height = STITCHED;
const _stitchCtx = _stitchCanvas.getContext("2d");

let _intervalId = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the latest RainViewer radar, reproject it, then fill no-radar areas
 * with GPM IMERG satellite precipitation estimates.
 *
 * Returns { timestamp, ageMinutes } on success; null on failure.
 * On failure, IMERG-only data is applied as a complete fallback.
 */
export async function fetchAndApplyRainViewer() {
  let rainviewerImgData = null;
  let timestamp = null;

  try {
    const res = await fetch(RAINVIEWER_API);
    if (!res.ok) throw new Error(`RainViewer meta HTTP ${res.status}`);
    const meta = await res.json();

    const past = meta?.radar?.past;
    if (!past?.length) throw new Error("No radar data in RainViewer response");

    const latest = past[past.length - 1];
    const path   = latest.path;
    timestamp    = latest.time;

    // Fetch the 4 z=1 Mercator tiles in parallel
    const [t00, t10, t01, t11] = await Promise.all([
      _loadTile(path, 0, 0),
      _loadTile(path, 1, 0),
      _loadTile(path, 0, 1),
      _loadTile(path, 1, 1),
    ]);

    _stitchCtx.clearRect(0, 0, STITCHED, STITCHED);
    _stitchCtx.drawImage(t00, 0,         0        );
    _stitchCtx.drawImage(t10, TILE_SIZE, 0        );
    _stitchCtx.drawImage(t01, 0,         TILE_SIZE);
    _stitchCtx.drawImage(t11, TILE_SIZE, TILE_SIZE);

    rainviewerImgData = _reproject();
  } catch (err) {
    console.warn("[RainViewer] Radar unavailable:", err.message);
  }

  // Fill no-radar areas (or full canvas if RainViewer failed) with IMERG
  await _blendImerg(rainviewerImgData);

  if (timestamp != null) {
    const ageMinutes = Math.round((Date.now() / 1000 - timestamp) / 60);
    return { timestamp, ageMinutes };
  }

  // RainViewer failed but IMERG may have been applied — signal partial success
  return null;
}

export function startRainViewerRefresh(onSuccess, onFail) {
  stopRainViewerRefresh();
  _intervalId = setInterval(async () => {
    if (!weatherState?.showPrecipitation) return;
    const result = await fetchAndApplyRainViewer();
    if (result) onSuccess(result);
    else onFail();
  }, REFRESH_MS);
}

export function stopRainViewerRefresh() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

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
 * Returns the reprojected ImageData without writing to precipCanvas yet
 * (blending with IMERG happens first).
 */
function _reproject() {
  const srcData = _stitchCtx.getImageData(0, 0, STITCHED, STITCHED).data;
  const outCtx  = precipCanvas.getContext("2d");
  const outImg  = outCtx.createImageData(OUT_W, OUT_H);
  const dst     = outImg.data;

  for (let py = 0; py < OUT_H; py++) {
    const lat    = 90 - (py / OUT_H) * 180;
    const latRad = lat * (Math.PI / 180);
    const mercY  = 0.5 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI);
    if (mercY < 0 || mercY > 1) continue; // polar rows beyond Mercator ±85°

    const srcY = Math.min(Math.round(mercY * (STITCHED - 1)), STITCHED - 1);
    for (let px = 0; px < OUT_W; px++) {
      const srcX = Math.round((px / OUT_W) * (STITCHED - 1));
      const s = (srcY * STITCHED + srcX) * 4;
      const d = (py   * OUT_W   + px)   * 4;
      dst[d]     = srcData[s];
      dst[d + 1] = srcData[s + 1];
      dst[d + 2] = srcData[s + 2];
      dst[d + 3] = srcData[s + 3];
    }
  }

  return outImg; // not yet written to canvas
}

/**
 * Fetch GPM IMERG data and composite it with RainViewer.
 *
 * Where RainViewer has data (non-dark pixel), it is preserved.
 * Where RainViewer has nothing (dark tile background or polar gap),
 * IMERG data is placed instead.
 *
 * @param {ImageData|null} rainviewerImgData  Reprojected RainViewer data, or
 *                                            null if RainViewer is unavailable.
 */
async function _blendImerg(rainviewerImgData) {
  const imergID = await fetchImergImageData();

  const outCtx = precipCanvas.getContext("2d");

  // Build the final composited image
  const finalImg = outCtx.createImageData(OUT_W, OUT_H);
  const dst      = finalImg.data;
  const rvSrc    = rainviewerImgData?.data ?? null;
  const imSrc    = imergID?.data ?? null;

  for (let i = 0; i < dst.length; i += 4) {
    let placed = false;

    // First try: RainViewer
    if (rvSrc) {
      const r = rvSrc[i], g = rvSrc[i + 1], b = rvSrc[i + 2], a = rvSrc[i + 3];
      // "Has radar data" = not the empty tile background (which is very dark)
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      const hasRadar = a > 0 && luma >= 8;
      if (hasRadar) {
        dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = a;
        placed = true;
      }
    }

    // Second: IMERG for any pixel without radar data
    if (!placed && imSrc && imSrc[i + 3] > 0) {
      dst[i]     = imSrc[i];
      dst[i + 1] = imSrc[i + 1];
      dst[i + 2] = imSrc[i + 2];
      dst[i + 3] = imSrc[i + 3];
    }
  }

  outCtx.putImageData(finalImg, 0, 0);
  precipTexture.needsUpdate = true;
}

// weatherState reference (imported lazily to avoid circular dep)
import { weatherState } from "../state.js";
