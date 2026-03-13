import { weatherState } from "../state.js";
import { cloudCoverCanvas, cloudCoverTexture } from "./scene.js";

/**
 * Renders a cloud-cover overlay using Gaussian IDW interpolation over the
 * global weather points, mirroring buildHeatmapCanvas from markers.js.
 *
 * Cloud cover is stored as a 0-100 percentage in point.current.cloudCover.
 * The canvas paints white-ish pixels whose alpha is proportional to coverage:
 *   0% → alpha 0 (transparent), 100% → alpha 200 (~78% opacity)
 */
export function buildCloudCanvas(points) {
  const W = 512, H = 256;
  const canvas = cloudCoverCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const valid = points
    .filter((p) => p.current?.cloudCover != null)
    .map((p) => ({ lat: p.lat, lon: p.lon, cover: p.current.cloudCover }));

  if (valid.length === 0) return;

  const imageData = ctx.createImageData(W, H);
  const d = imageData.data;

  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;
      let num = 0, den = 0;
      for (const pt of valid) {
        let dlat = lat - pt.lat;
        let dlon = lon - pt.lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist2 = dlat * dlat + dlon * dlon;
        // Gaussian kernel σ=18° — same as heatmap for visual consistency
        const w = Math.exp(-dist2 / 324);
        num += w * pt.cover;
        den += w;
      }
      const cover = den > 0 ? num / den : 0; // 0-100
      const alpha = Math.round((cover / 100) * 200); // 0→0, 100→200
      const idx = (py * W + px) * 4;
      d[idx]     = 230; // R — slightly cool white
      d[idx + 1] = 235; // G
      d[idx + 2] = 255; // B
      d[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  cloudCoverTexture.needsUpdate = true;
}

/**
 * Compute cloud cover ImageData from weather station points using Gaussian IDW.
 * Returns the ImageData without writing to any canvas — lets callers blend it.
 */
export function buildCloudImageData(points) {
  const W = 512, H = 256;
  const imageData = new ImageData(W, H);
  const d = imageData.data;

  const valid = points
    .filter((p) => p.current?.cloudCover != null)
    .map((p) => ({ lat: p.lat, lon: p.lon, cover: p.current.cloudCover }));

  if (valid.length === 0) return imageData;

  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / H) * 180;
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * 360 - 180;
      let num = 0, den = 0;
      for (const pt of valid) {
        let dlat = lat - pt.lat;
        let dlon = lon - pt.lon;
        if (dlon > 180) dlon -= 360;
        if (dlon < -180) dlon += 360;
        const dist2 = dlat * dlat + dlon * dlon;
        const w = Math.exp(-dist2 / 324); // σ=18°
        num += w * pt.cover;
        den += w;
      }
      const cover = den > 0 ? num / den : 0;
      const alpha = Math.round((cover / 100) * 190);
      const idx = (py * W + px) * 4;
      d[idx]     = 228;
      d[idx + 1] = 233;
      d[idx + 2] = 255;
      d[idx + 3] = alpha;
    }
  }

  return imageData;
}

export function updateCloudLayer() {
  if (!weatherState.showCloudCover) return;
  setTimeout(() => buildCloudCanvas(weatherState.points), 0);
}
