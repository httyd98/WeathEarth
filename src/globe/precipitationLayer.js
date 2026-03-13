import { weatherState } from "../state.js";
import { precipCanvas, precipTexture } from "./scene.js";

/**
 * Precipitation overlay — radar-style colour scale.
 *
 * Uses a max-weighted Gaussian kernel (σ=10°) instead of IDW mean.
 *
 * WHY MAX, NOT MEAN:
 *   IDW mean-averaging without dry-point normalization creates artificial
 *   precipitation everywhere (every pixel is weakly influenced by distant
 *   rain events, making the entire globe appear to drizzle). Using the
 *   MAX contribution from any single rainy point instead:
 *     • produces zero alpha at pixels far from all rain events  ✓
 *     • preserves the true intensity at each rain location        ✓
 *     • creates smooth, focused Gaussian blobs per event          ✓
 *
 * Colour scale:
 *   0.05–1 mm/h   → azzurro  (drizzle — soft azure blue)
 *   1–3   mm/h   → celeste   (light rain — bright cyan)
 *   3–7   mm/h   → yellow    (moderate)
 *   7–15  mm/h   → orange    (heavy)
 *   15–30 mm/h   → red       (very heavy)
 *   >30   mm/h   → magenta   (extreme / storm)
 *
 * Alpha: sqrt scale — 0.05 mm → ~15, 1 mm → ~100, 5 mm → ~220.
 */
export function buildPrecipitationCanvas(points) {
  const W = 512, H = 256;
  const ctx = precipCanvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const valid = points
    .filter(p => p.current?.precipitation != null && p.current.precipitation >= 0.05)
    .map(p => ({ lat: p.lat, lon: p.lon, precip: p.current.precipitation }));

  if (valid.length === 0) return false; // signal: nothing to show

  const imageData = ctx.createImageData(W, H);
  const d = imageData.data;

  // σ² = 64 (σ = 8°): tighter blobs, less overlap between nearby events
  const SIGMA2 = 64;

  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;

      // MAX-weighted: take the strongest single contribution from any rain point.
      // This avoids dilution from distant events while still blurring each event.
      let maxContrib = 0;
      let dominantPrecip = 0;

      for (const pt of valid) {
        let dlat = lat - pt.lat;
        let dlon = lon - pt.lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist2 = dlat * dlat + dlon * dlon;
        const w = Math.exp(-dist2 / SIGMA2);
        const contrib = w * pt.precip;
        if (contrib > maxContrib) {
          maxContrib = contrib;
          dominantPrecip = contrib;
        }
      }

      if (dominantPrecip < 0.05) continue;

      // Alpha: sqrt scale — more responsive to light rain than linear
      const alpha = Math.round(Math.min(Math.sqrt(dominantPrecip / 5), 1) * 230);
      if (alpha < 6) continue;

      // Radar colour scale
      let r, g, b;
      const p = dominantPrecip;
      if (p < 1) {
        // Drizzle: azzurro — pure blue, low green channel to avoid teal
        const f = (p - 0.05) / 0.95;
        r = Math.round(40 - f * 10);   // 40 → 30
        g = Math.round(100 + f * 60);  // 100 → 160
        b = 255;
      } else if (p < 3) {
        // Light rain: celeste — transition blue → bright cyan
        const f = (p - 1) / 2;
        r = Math.round(30 - f * 30);   // 30 → 0
        g = Math.round(160 + f * 50);  // 160 → 210
        b = 255;
      } else if (p < 7) {
        // Moderate: yellow (transition from cyan → yellow)
        const f = (p - 3) / 4;
        r = Math.round(f * 255);         // 0 → 255
        g = Math.round(210 + f * 10);    // 210 → 220
        b = Math.round(255 * (1 - f));   // 255 → 0
      } else if (p < 15) {
        // Heavy: orange
        const f = (p - 7) / 8;
        r = 255;
        g = Math.round(140 - f * 110);
        b = 0;
      } else if (p < 30) {
        // Very heavy: red
        const f = (p - 15) / 15;
        r = Math.round(255 - f * 55);
        g = Math.round(30 - f * 30);
        b = Math.round(f * 80);
      } else {
        // Extreme / storm: magenta
        r = 200; g = 0; b = 180;
      }

      const idx = (py * W + px) * 4;
      d[idx]     = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  precipTexture.needsUpdate = true;
  return true; // signal: data painted
}

/**
 * Build precipitation ImageData from weather station points WITHOUT writing to canvas.
 * Returns ImageData or null if no valid precipitation data exists.
 * Used by rainViewer.js to blend into no-radar areas.
 */
export function getPrecipitationImageData(points) {
  const W = 512, H = 256;
  const SIGMA2 = 64;

  const valid = points
    .filter(p => p.current?.precipitation != null && p.current.precipitation >= 0.05)
    .map(p => ({ lat: p.lat, lon: p.lon, precip: p.current.precipitation }));

  if (valid.length === 0) return null;

  const imageData = new ImageData(W, H);
  const d = imageData.data;

  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;

      let maxContrib = 0;
      let dominantPrecip = 0;

      for (const pt of valid) {
        let dlat = lat - pt.lat;
        let dlon = lon - pt.lon;
        if (dlon > 180)  dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist2 = dlat * dlat + dlon * dlon;
        const w = Math.exp(-dist2 / SIGMA2);
        const contrib = w * pt.precip;
        if (contrib > maxContrib) { maxContrib = contrib; dominantPrecip = contrib; }
      }

      if (dominantPrecip < 0.05) continue;

      const alpha = Math.round(Math.min(Math.sqrt(dominantPrecip / 5), 1) * 230);
      if (alpha < 6) continue;

      let r, g, b;
      const p = dominantPrecip;
      if (p < 1) {
        const f = (p - 0.05) / 0.95;
        r = Math.round(40 - f * 10); g = Math.round(100 + f * 60); b = 255;
      } else if (p < 3) {
        const f = (p - 1) / 2;
        r = Math.round(30 - f * 30); g = Math.round(160 + f * 50); b = 255;
      } else if (p < 7) {
        const f = (p - 3) / 4;
        r = Math.round(f * 255); g = Math.round(210 + f * 10); b = Math.round(255 * (1 - f));
      } else if (p < 15) {
        const f = (p - 7) / 8;
        r = 255; g = Math.round(140 - f * 110); b = 0;
      } else if (p < 30) {
        const f = (p - 15) / 15;
        r = Math.round(255 - f * 55); g = Math.round(30 - f * 30); b = Math.round(f * 80);
      } else {
        r = 200; g = 0; b = 180;
      }

      const idx = (py * W + px) * 4;
      d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = alpha;
    }
  }

  return imageData;
}

export function updatePrecipitationLayer() {
  if (!weatherState.showPrecipitation) return;
  // If RainViewer is active it manages its own updates; skip Gaussian fallback.
  if (weatherState.useRainViewer) return;
  setTimeout(() => buildPrecipitationCanvas(weatherState.points), 0);
}
