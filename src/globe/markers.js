import * as THREE from "three";
import { GLOBE_RADIUS, MARKER_ALTITUDE } from "../constants.js";
import { weatherState } from "../state.js";
import { latLonToVector3, colorForTemperature, tempToRgb } from "../utils.js";
import {
  markers,
  selectedMarker,
  dummyObject,
  worldPosition,
  localPoint,
  tempColor,
  controls,
  heatmapCanvas,
  heatmapTexture
} from "./scene.js";

export function updateMarkerMeshes() {
  let totalScale = 0;
  const zoomScale = getMarkerZoomScale();

  weatherState.points.forEach((point, index) => {
    latLonToVector3(point.lat, point.lon, GLOBE_RADIUS + MARKER_ALTITUDE, worldPosition);
    dummyObject.position.copy(worldPosition);
    dummyObject.lookAt(0, 0, 0);
    const scale = markerScaleForPoint(point) * zoomScale;
    totalScale += scale;
    dummyObject.scale.setScalar(scale);
    dummyObject.updateMatrix();
    markers.setMatrixAt(index, dummyObject.matrix);
    tempColor.copy(colorForTemperature(point.current?.temperature ?? null));
    markers.setColorAt(index, tempColor);
  });

  weatherState.averageMarkerScale =
    totalScale / Math.max(weatherState.points.length, 1);

  markers.instanceColor.needsUpdate = true;
  markers.instanceMatrix.needsUpdate = true;
  updateMarkerVisibility();
  updateSelectedMarker();
}

export function markerScaleForPoint(point) {
  if (!point.current) {
    return 1;
  }

  if (point.current.weatherCode >= 95) {
    return 1.35;
  }

  if (point.current.weatherCode >= 80) {
    return 1.18;
  }

  return 1;
}

export function updateSelectedMarker() {
  if (!weatherState.selectedPoint) {
    selectedMarker.visible = false;
    return;
  }

  // Scale marker altitude with camera distance to avoid parallax offset at close zoom.
  // Formula: keep visual "float angle" ≈ constant by scaling altitude with height above surface.
  const camDist = controls.getDistance();
  const heightAboveSurface = camDist - GLOBE_RADIUS;
  const dynamicAlt = Math.max(0.02, heightAboveSurface * 0.018);

  latLonToVector3(
    weatherState.selectedPoint.lat,
    weatherState.selectedPoint.lon,
    GLOBE_RADIUS + dynamicAlt,
    localPoint
  );
  selectedMarker.position.copy(localPoint);
  selectedMarker.scale.setScalar(weatherState.averageMarkerScale * 1.5);
  selectedMarker.visible = true; // always visible when a point is selected, regardless of global markers toggle
}

export function updateMarkerVisibility() {
  markers.visible = weatherState.showMarkers;
  selectedMarker.visible = Boolean(weatherState.selectedPoint);
}

export function getMarkerZoomScale() {
  const distance = controls.getDistance();
  return THREE.MathUtils.clamp(distance / 24, 0.12, 0.68);
}

export function buildHeatmapCanvas(points) {
  const W = 512, H = 256;
  const canvas = heatmapCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const valid = points
    .filter((p) => p.current?.temperature != null)
    .map((p) => ({ lat: p.lat, lon: p.lon, temp: p.current.temperature }));

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
        // Gaussian kernel: smooth falloff with σ=18°
        // w approaches 1 at dist=0, ~0.37 at 18°, ~0.02 at 36°
        const w = Math.exp(-dist2 / 324); // 324 = 18² = sigma²
        num += w * pt.temp;
        den += w;
      }
      const temp = den > 0 ? num / den : 0;
      const [r, g, b] = tempToRgb(temp);
      const idx = (py * W + px) * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 195; // leggermente più trasparente per vedere il globo
    }
  }

  ctx.putImageData(imageData, 0, 0);
  heatmapTexture.needsUpdate = true;
}

export function updateHeatmap() {
  if (!weatherState.showHeatmap) return;
  setTimeout(() => buildHeatmapCanvas(weatherState.points), 0);
}
