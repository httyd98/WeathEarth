/**
 * Satellite Cloud Layer — Multi-source composite via NASA GIBS WMS
 *
 * Sources composited (all free, no authentication):
 *
 * ── Polar orbiters (NRT, same-day, global ~4–6 passes/day) ─────────────────
 *   VIIRS NOAA-20   375 m   every ~100 min polar pass
 *   VIIRS NOAA-21   375 m   newest satellite (launched 2023)
 *   VIIRS SNPP      375 m
 *   MODIS Terra     500 m
 *   MODIS Aqua      500 m
 *
 * ── Geostationary (NRT, CONTINUOUS — full-disk every 10–15 min) ────────────
 *   GOES-East       Americas + Atlantic + W. Europe/Africa  (GOES-16 @ 76°W)
 *   GOES-West       Pacific + Americas + Hawaii             (GOES-18 @ 137°W)
 *   Himawari        E. Asia + Australia + W. Pacific        (Himawari-9 @ 141°E)
 *
 * Compositing: for each pixel take the source with the highest cloud alpha.
 * Geostationary satellites provide continuous coverage of their hemisphere
 * while polar orbiters fill in gaps globally (especially polar regions and
 * the Indian Ocean / Africa region not well covered by geostationary).
 *
 * Cloud extraction algorithm (per pixel — true color sources):
 *   brightness = (R + G + B) / 3
 *   saturation = (max - min) / max
 *   cloud  →  brightness > 0.30 && saturation < 0.44
 *   alpha  →  clamp((brightness-0.30)/0.70 × 1.65, 0, 1) × 245
 *
 * For gray-band sources (Himawari Band3):
 *   cloud  →  brightness > 0.38
 *   alpha  →  clamp((brightness-0.38)/0.62 × 1.5,  0, 1) × 240
 */

import { cloudCoverCanvas, cloudCoverTexture } from "./scene.js";

const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

// ── Polar NRT layers — fetched for today in parallel ──────────────────────
// Up to 5 satellites, different swath positions throughout the day.
const POLAR_NRT_LAYERS = [
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor_NRT",
  "VIIRS_NOAA21_CorrectedReflectance_TrueColor_NRT",
  "VIIRS_SNPP_CorrectedReflectance_TrueColor_NRT",
  "MODIS_Terra_CorrectedReflectance_TrueColor_NRT",
  "MODIS_Aqua_CorrectedReflectance_TrueColor_NRT",
];

// ── Polar standard composites — sequential fallback ────────────────────────
const POLAR_STANDARD_LAYERS = [
  { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", nDays: 4 },
  { layer: "MODIS_Terra_CorrectedReflectance_TrueColor",  nDays: 4 },
];

// ── Geostationary NRT layers — no TIME needed (GIBS defaults to latest) ───
// These satellites image their full disk every 10–15 minutes continuously.
// Fetched without TIME so GIBS returns the most recent composite available.
const GEO_LAYERS = [
  { name: "GOES-East_ABI_GeoColor",              type: "color" }, // Americas + Atlantic
  { name: "GOES-West_ABI_GeoColor",              type: "color" }, // Pacific + W. Americas
  { name: "Himawari_AHI_Band3_Red_Visible_1km",  type: "gray"  }, // East Asia + Australia
];

const POLAR_W = 2048, POLAR_H = 1024;
const GEO_W   = 1024, GEO_H   = 512;  // slightly lower — supplementary source

/** ISO date strings for the last n UTC days (0 = today). */
function candidateDates(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

/** Fetch one GIBS WMS layer. Omit `time` for latest-available geostationary. */
function fetchGibsLayer(layer, { date, w, h } = {}) {
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap",
    FORMAT: "image/png", TRANSPARENT: "true",
    LAYERS: layer, STYLES: "",
    CRS: "CRS:84",
    WIDTH:  String(w ?? POLAR_W),
    HEIGHT: String(h ?? POLAR_H),
    BBOX: "-180,-90,180,90",
  });
  if (date) params.set("TIME", date);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve({ img, layer });
    img.onerror = () => reject(new Error(`GIBS: ${layer}${date ? " @ " + date : ""}`));
    img.src = `${GIBS_WMS}?${params}`;
  });
}

// ── Cloud extraction ───────────────────────────────────────────────────────

/**
 * Extract cloud pixels from a satellite image.
 * `type` = "color" (true-color RGB) | "gray" (single-band reflectance).
 * Returns an ImageData with white cloud pixels and transparent non-cloud.
 */
function extractCloudPixels(img, type = "color") {
  const W = img.width, H = img.height;
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = W; srcCanvas.height = H;
  const sCtx = srcCanvas.getContext("2d");
  sCtx.drawImage(img, 0, 0);
  const { data } = sCtx.getImageData(0, 0, W, H);

  const out = new Uint8ClampedArray(W * H * 4);

  for (let i = 0; i < data.length; i += 4) {
    // Skip fully transparent pixels (outside satellite disk / no data)
    if (data[i + 3] < 10) continue;

    const r = data[i]     / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const brightness = (r + g + b) / 3;

    let alpha = 0;

    if (type === "gray") {
      // Single-band reflectance: bright = cloud/snow/ice
      if (brightness > 0.38) {
        alpha = Math.round(Math.min((brightness - 0.38) / 0.62 * 1.5, 1) * 240);
      }
    } else {
      // True-color RGB: bright + desaturated = cloud/snow
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (brightness > 0.30 && saturation < 0.44) {
        alpha = Math.round(Math.min((brightness - 0.30) / 0.70 * 1.65, 1) * 245);
      }
    }

    if (alpha > 8) {
      out[i]     = 245;
      out[i + 1] = 248;
      out[i + 2] = 255;
      out[i + 3] = alpha;
    }
  }

  return new ImageData(out, W, H);
}

/** True if the ImageData contains any cloud pixels (non-zero alpha). */
function hasCloudData(imgData) {
  const d = imgData.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) return true;
  }
  return false;
}

// ── Compositing ────────────────────────────────────────────────────────────

/**
 * Composite multiple extracted-cloud ImageDatas into cloudCoverCanvas.
 * Per-pixel: take the source with the highest alpha (most confident cloud).
 * All sources are scaled to the output canvas dimensions via an offscreen canvas.
 */
function compositeAndApply(cloudDatas) {
  // Resample each source to canvas output size
  const CW = cloudCoverCanvas.width;
  const CH = cloudCoverCanvas.height;

  const outData = new Uint8ClampedArray(CW * CH * 4);

  for (const src of cloudDatas) {
    // Scale source down to output canvas size
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width  = src.width;
    tmpCanvas.height = src.height;
    tmpCanvas.getContext("2d").putImageData(src, 0, 0);

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width  = CW;
    scaledCanvas.height = CH;
    scaledCanvas.getContext("2d").drawImage(tmpCanvas, 0, 0, CW, CH);
    const scaledD = scaledCanvas.getContext("2d").getImageData(0, 0, CW, CH).data;

    for (let i = 0; i < outData.length; i += 4) {
      const srcAlpha = scaledD[i + 3];
      if (srcAlpha > outData[i + 3]) {
        outData[i]     = scaledD[i];
        outData[i + 1] = scaledD[i + 1];
        outData[i + 2] = scaledD[i + 2];
        outData[i + 3] = srcAlpha;
      }
    }
  }

  const ctx = cloudCoverCanvas.getContext("2d");
  ctx.putImageData(new ImageData(outData, CW, CH), 0, 0);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Load and composite all available satellite cloud sources.
 *
 * Pipeline:
 *   1. Fetch 5 polar NRT layers for today in parallel.
 *   2. Fetch 3 geostationary NRT layers (no date — GIBS returns latest).
 *   3. Composite all successful sources (max-alpha per pixel).
 *   4. If no NRT polar data: fall back to standard daily composites.
 *
 * Returns { ok, sources, date } on success; throws if everything fails.
 */
export async function loadSatelliteCloudTexture() {
  const today = candidateDates(1)[0];

  const cloudDatas = [];
  let successCount = 0;
  let layerNames = [];

  // ── Fetch polar NRT + geostationary simultaneously ──────────────────────
  const [polarResults, geoResults] = await Promise.all([
    // Polar: today's date
    Promise.allSettled(
      POLAR_NRT_LAYERS.map(layer =>
        fetchGibsLayer(layer, { date: today, w: POLAR_W, h: POLAR_H })
      )
    ),
    // Geostationary: no TIME — GIBS returns the latest full-disk image
    Promise.allSettled(
      GEO_LAYERS.map(({ name, type }) =>
        fetchGibsLayer(name, { w: GEO_W, h: GEO_H })
          .then(r => ({ ...r, cloudType: type }))
      )
    ),
  ]);

  // Process polar NRT results
  for (const res of polarResults) {
    if (res.status !== "fulfilled") continue;
    const { img, layer } = res.value;
    const cloudData = extractCloudPixels(img, "color");
    if (hasCloudData(cloudData)) {
      cloudDatas.push(cloudData);
      successCount++;
      layerNames.push(layer.split("_")[1]); // e.g. "NOAA20", "SNPP", "Terra"
    }
  }

  // Process geostationary results
  for (const res of geoResults) {
    if (res.status !== "fulfilled") continue;
    const { img, layer, cloudType } = res.value;
    const cloudData = extractCloudPixels(img, cloudType ?? "color");
    if (hasCloudData(cloudData)) {
      cloudDatas.push(cloudData);
      successCount++;
      layerNames.push(layer.includes("East") ? "GOES-E" :
                      layer.includes("West") ? "GOES-W" :
                      layer.includes("Himawari") ? "Himawari" : layer);
    }
  }

  if (cloudDatas.length > 0) {
    compositeAndApply(cloudDatas);
    cloudCoverTexture.needsUpdate = true;
    console.log(`[Clouds] Composite: ${successCount} sources (${layerNames.join(", ")})`);
    return { ok: true, sources: successCount, layers: layerNames.join("+"), date: today };
  }

  // ── Fallback: standard daily composites (older dates, sequential) ────────
  for (const { layer, nDays } of POLAR_STANDARD_LAYERS) {
    for (const date of candidateDates(nDays)) {
      try {
        const { img } = await fetchGibsLayer(layer, { date, w: POLAR_W, h: POLAR_H });
        const cloudData = extractCloudPixels(img, "color");
        if (hasCloudData(cloudData)) {
          compositeAndApply([cloudData]);
          cloudCoverTexture.needsUpdate = true;
          console.log(`[Clouds] Fallback: ${layer} @ ${date}`);
          return { ok: true, sources: 1, layers: layer, date };
        }
      } catch {
        // try next
      }
    }
  }

  throw new Error("No GIBS satellite imagery available");
}
