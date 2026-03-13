/**
 * GPM IMERG Precipitation Layer — NASA GIBS WMS
 *
 * Global Precipitation Measurement (GPM) IMERG merges precipitation
 * estimates from the full GPM satellite constellation (passive microwave
 * sensors + IR-based morphing from geostationary satellites) to produce
 * near-global maps (60°S–60°N) updated every 30 minutes.
 *
 * Two products tried in order (via GIBS layer names):
 *   IMERG_Precipitation_Rate_30min  — 30-min resolution, most recent
 *   IMERG_Precipitation_Rate        — hourly product, slightly older
 *
 * GIBS returns a colorized precipitation-rate PNG (TRANSPARENT=true):
 *   transparent / alpha=0         → no precipitation / land/sea without rain
 *   colored pixels                → precipitation (IMERG palette below)
 *
 * Approximate IMERG color→rate mapping (used for alpha scaling):
 *   dark blue  (#3333FF) ~0.1 mm/hr  — drizzle
 *   cyan       (#00FFFF) ~0.5 mm/hr  — light rain
 *   green      (#00FF00) ~1   mm/hr
 *   yellow     (#FFFF00) ~2   mm/hr
 *   orange     (#FF8800) ~5   mm/hr
 *   red        (#FF0000) ~10  mm/hr
 *   pink       (#FF00FF) ~20+ mm/hr  — heavy
 *
 * The returned ImageData is composited into the precipitation canvas
 * wherever RainViewer has no radar data.
 */

const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

const IMERG_LAYERS = [
  "IMERG_Precipitation_Rate_30min", // 30-min product — most recent available
  "IMERG_Precipitation_Rate",       // hourly product — slightly older but accurate
];

const OUT_W = 512, OUT_H = 256;

function _fetchImergLayer(layer) {
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap",
    FORMAT: "image/png", TRANSPARENT: "true",
    LAYERS: layer, STYLES: "",
    CRS: "CRS:84",
    WIDTH:  String(OUT_W),
    HEIGHT: String(OUT_H),
    BBOX:   "-180,-90,180,90",
    // No TIME — GIBS defaults to the most recently available composite
  });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve({ img, layer });
    img.onerror = () => reject(new Error(`IMERG: ${layer}`));
    img.src = `${GIBS_WMS}?${params}`;
  });
}

/**
 * Re-color IMERG source pixels to the same standard radar palette
 * used by RainViewer / precipitationLayer.js for visual consistency.
 *
 * IMERG hue → approximate precipitation rate → precipitation color scale
 */
function _imergPixelToRadarColor(r, g, b) {
  // Estimate precipitation intensity from IMERG color
  // IMERG uses a spectral palette: blue → cyan → green → yellow → orange → red → pink
  // We use hue as a proxy for intensity.

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return null; // transparent / no data

  // Rough intensity: position along the spectral ramp
  // Low end (cold blue) = light rain; high end (pink/magenta) = heavy

  // Convert to HSL hue (0–360°)
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }

  // Map IMERG hue to approximate precipitation rate (mm/hr)
  // IMERG spectral ramp: blue(240°) → cyan(180°) → green(120°) → yellow(60°)
  //                    → orange(30°) → red(0°/360°) → pink(300°/magenta)
  // Lower hue (toward red/orange) = heavier precipitation
  let rate;
  if (hue >= 200 && hue <= 260) {
    // Blue range → 0.1–0.5 mm/hr drizzle
    rate = 0.1 + (260 - hue) / 60 * 0.4;
  } else if (hue > 140 && hue < 200) {
    // Cyan → 0.5–1.5 mm/hr
    rate = 0.5 + (200 - hue) / 60 * 1.0;
  } else if (hue >= 90 && hue <= 140) {
    // Green → 1.5–3 mm/hr
    rate = 1.5 + (140 - hue) / 50 * 1.5;
  } else if (hue >= 40 && hue < 90) {
    // Yellow → 3–8 mm/hr
    rate = 3 + (90 - hue) / 50 * 5;
  } else if (hue >= 10 && hue < 40) {
    // Orange → 8–20 mm/hr
    rate = 8 + (40 - hue) / 30 * 12;
  } else if ((hue >= 0 && hue < 10) || hue > 350) {
    // Red → 20–30 mm/hr
    rate = 20;
  } else if (hue >= 280 && hue <= 350) {
    // Magenta/pink → 30+ mm/hr extreme
    rate = 30 + (350 - hue) / 70 * 20;
  } else {
    return null; // unrecognized
  }

  if (rate < 0.05) return null;

  // Apply the same radar color scale as precipitationLayer.js
  const alpha = Math.round(Math.min(Math.sqrt(rate / 5), 1) * 230);
  if (alpha < 6) return null;

  let or, og, ob;
  const p = rate;
  if (p < 1) {
    const f = (p - 0.05) / 0.95;
    or = Math.round(40 - f * 10); og = Math.round(100 + f * 60); ob = 255;
  } else if (p < 3) {
    const f = (p - 1) / 2;
    or = Math.round(30 - f * 30); og = Math.round(160 + f * 50); ob = 255;
  } else if (p < 7) {
    const f = (p - 3) / 4;
    or = Math.round(f * 255); og = Math.round(210 + f * 10); ob = Math.round(255 * (1 - f));
  } else if (p < 15) {
    const f = (p - 7) / 8;
    or = 255; og = Math.round(140 - f * 110); ob = 0;
  } else if (p < 30) {
    const f = (p - 15) / 15;
    or = Math.round(255 - f * 55); og = Math.round(30 - f * 30); ob = Math.round(f * 80);
  } else {
    or = 200; og = 0; ob = 180;
  }

  return { r: or, g: og, b: ob, a: alpha };
}

/**
 * Try to load GPM IMERG precipitation data from GIBS.
 *
 * Returns ImageData (512×256) using the standard radar color palette,
 * or null if both IMERG products are unavailable / have no data.
 *
 * Transparent pixels (alpha=0) = no precipitation.
 * Colored pixels use the same scale as precipitationLayer.js and RainViewer.
 */
export async function fetchImergImageData() {
  const results = await Promise.allSettled(IMERG_LAYERS.map(_fetchImergLayer));

  for (const res of results) {
    if (res.status !== "fulfilled") continue;

    const { img, layer } = res.value;
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width  = img.width  || OUT_W;
    srcCanvas.height = img.height || OUT_H;
    const sCtx = srcCanvas.getContext("2d");
    sCtx.drawImage(img, 0, 0, OUT_W, OUT_H);
    const srcData = sCtx.getImageData(0, 0, OUT_W, OUT_H).data;

    // Re-color IMERG pixels to standard radar palette and check for data
    const outData = new Uint8ClampedArray(OUT_W * OUT_H * 4);
    let hasData = false;

    for (let i = 0; i < srcData.length; i += 4) {
      if (srcData[i + 3] < 10) continue; // transparent = no data

      const mapped = _imergPixelToRadarColor(srcData[i], srcData[i + 1], srcData[i + 2]);
      if (mapped) {
        outData[i]     = mapped.r;
        outData[i + 1] = mapped.g;
        outData[i + 2] = mapped.b;
        outData[i + 3] = mapped.a;
        hasData = true;
      }
    }

    if (hasData) {
      console.log(`[GPM IMERG] ${layer} loaded`);
      return new ImageData(outData, OUT_W, OUT_H);
    }
  }

  console.warn("[GPM IMERG] No data available from GIBS");
  return null;
}
