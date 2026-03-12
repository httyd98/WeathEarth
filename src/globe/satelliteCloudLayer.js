/**
 * Satellite Cloud Layer — NASA GIBS WMS
 *
 * Fetches a near-real-time global cloud image from NASA GIBS (Global Imagery
 * Browse Services) in EPSG:4326 equirectangular projection, post-processes it
 * to extract cloud-only pixels with transparency, then applies the result as
 * a canvas texture to the Three.js cloud-cover mesh.
 *
 * Layer priority:
 *   NRT (Near-Real-Time) layers — updated within ~3 h of satellite overpass,
 *   available same day. Tried first with today + yesterday.
 *     1. VIIRS NOAA-20 NRT  (~375 m)
 *     2. VIIRS SNPP NRT      (~375 m)
 *     3. MODIS Terra NRT     (~500 m)
 *     4. MODIS Aqua NRT      (~500 m)
 *   Standard daily composites — fallback when NRT is unavailable (1-2 day delay).
 *     5. VIIRS NOAA-20       (~375 m)
 *     6. MODIS Terra         (~500 m)
 *
 * Cloud extraction: pixels that are bright (mean > 0.42) AND desaturated
 * (saturation < 0.38) are classified as cloud/snow/ice and kept in white;
 * everything else is made transparent.
 */

import { cloudCoverCanvas, cloudCoverTexture } from "./scene.js";

const GIBS_WMS =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/**
 * Layer candidates in priority order.
 * Each entry specifies the layer name and how many days back to try.
 *   nDays=2  → try today + yesterday  (NRT: same-day available)
 *   nDays=4  → try today … 3 days ago (standard: 1-2 day delay)
 */
const LAYER_CANDIDATES = [
  // ── NRT layers (same-day, ~3 h post-overpass) ─────────────────────────────
  { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor_NRT", nDays: 2 },
  { layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor_NRT",   nDays: 2 },
  { layer: "MODIS_Terra_CorrectedReflectance_TrueColor_NRT",  nDays: 2 },
  { layer: "MODIS_Aqua_CorrectedReflectance_TrueColor_NRT",   nDays: 2 },
  // ── Standard daily composites (fallback, 1-2 day delay) ──────────────────
  { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",     nDays: 4 },
  { layer: "MODIS_Terra_CorrectedReflectance_TrueColor",      nDays: 4 },
];

// Higher resolution for sharper cloud detail on the globe
const FETCH_W = 2048;
const FETCH_H = 1024;

/**
 * Returns ISO date strings starting from today (UTC) for n days.
 * Index 0 = today, 1 = yesterday, etc.
 */
function candidateDates(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

/** Fetch a single GIBS WMS image as an HTMLImageElement */
function fetchGibsImage(layer, date) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/jpeg",
    TRANSPARENT: "false",
    LAYERS: layer,
    STYLES: "",
    CRS: "CRS:84",
    WIDTH: String(FETCH_W),
    HEIGHT: String(FETCH_H),
    BBOX: "-180,-90,180,90",
    TIME: date,
  });
  const url = `${GIBS_WMS}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, layer, date });
    img.onerror = () => reject(new Error(`GIBS: ${layer} @ ${date}`));
    img.src = url;
  });
}

/**
 * Process a satellite true-colour image and extract cloud pixels.
 *
 * Algorithm (per pixel):
 *   brightness = (R + G + B) / 3
 *   saturation = (max - min) / max
 *   if brightness > 0.42 && saturation < 0.38 → cloud
 *     alpha = clamp((brightness - 0.42) / 0.58 * 1.35, 0, 1) * 240
 *     colour = (245, 248, 255)  — slightly cool white
 *   else → transparent (alpha = 0)
 *
 * The processed image is drawn scaled into cloudCoverCanvas and the Three.js
 * texture is flagged for update.
 */
function extractAndApplyClouds({ img }) {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const sCtx = srcCanvas.getContext("2d");
  sCtx.drawImage(img, 0, 0);

  const { data } = sCtx.getImageData(0, 0, img.width, img.height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const brightness = (r + g + b) / 3;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (brightness > 0.42 && saturation < 0.38) {
      const rawAlpha = (brightness - 0.42) / 0.58;
      const alpha = Math.round(Math.min(rawAlpha * 1.35, 1) * 240);
      data[i]     = 245; // slightly cool white
      data[i + 1] = 248;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    } else {
      data[i + 3] = 0;
    }
  }

  // Write the processed RGBA data back to srcCanvas
  const out = new ImageData(data, img.width, img.height);
  sCtx.putImageData(out, 0, 0);

  // Scale and copy into the Three.js cloud-cover canvas
  const dCtx = cloudCoverCanvas.getContext("2d");
  dCtx.clearRect(0, 0, cloudCoverCanvas.width, cloudCoverCanvas.height);
  dCtx.drawImage(srcCanvas, 0, 0, cloudCoverCanvas.width, cloudCoverCanvas.height);

  cloudCoverTexture.needsUpdate = true;
}

/**
 * Try all layer × date combinations in priority order until one succeeds.
 * NRT layers (same-day) are tried before standard composites.
 * Resolves with `{ layer, date }` on success, rejects if all fail.
 */
export async function loadSatelliteCloudTexture() {
  for (const { layer, nDays } of LAYER_CANDIDATES) {
    for (const date of candidateDates(nDays)) {
      try {
        const result = await fetchGibsImage(layer, date);
        extractAndApplyClouds(result);
        return { ok: true, layer, date };
      } catch {
        // try next candidate
      }
    }
  }
  throw new Error("No GIBS satellite imagery available");
}
