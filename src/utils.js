import * as THREE from "three";
import { SUMMARY_LATITUDES } from "./constants.js";
import { weatherState } from "./state.js";

export function latLonToVector3(lat, lon, radius, target) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  target.set(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return target;
}

export function vector3ToLatLon(vector) {
  const radius = vector.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(vector.y / radius));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(-vector.z, vector.x));

  if (lon > 180) {
    lon -= 360;
  }

  if (lon < -180) {
    lon += 360;
  }

  return { lat, lon };
}

export function buildSamplePoints() {
  const points = [];
  const BASE_LON_COUNT = 72;
  const latitudes = Array.from({ length: 33 }, (_, i) => -80 + i * 5);
  latitudes.forEach((lat, latIndex) => {
    const lonCount = Math.max(6, Math.round(BASE_LON_COUNT * Math.cos((lat * Math.PI) / 180)));
    const lonStep = 360 / lonCount;
    const offset = latIndex % 2 === 1 ? lonStep / 2 : 0;
    for (let j = 0; j < lonCount; j++) {
      const lon = (((-180 + j * lonStep + offset) + 180) % 360) - 180;
      points.push({ lat, lon, label: formatLocationName(lat, lon) });
    }
  });

  // Polar extensions: ±85° rings + single pole points
  for (const lat of [-85, 85]) {
    const lonCount = Math.max(6, Math.round(BASE_LON_COUNT * Math.cos((lat * Math.PI) / 180)));
    const lonStep = 360 / lonCount;
    for (let j = 0; j < lonCount; j++) {
      const lon = (((-180 + j * lonStep) + 180) % 360) - 180;
      points.push({ lat, lon, label: formatLocationName(lat, lon) });
    }
  }
  points.push({ lat: 90, lon: 0, label: formatLocationName(90, 0) });
  points.push({ lat: -90, lon: 0, label: formatLocationName(-90, 0) });

  return points;
}

export function buildSummaryPoints() {
  const points = [];
  const BASE_LON_COUNT = 18;
  SUMMARY_LATITUDES.forEach((lat, latIndex) => {
    const lonCount = Math.max(3, Math.round(BASE_LON_COUNT * Math.cos((lat * Math.PI) / 180)));
    const lonStep = 360 / lonCount;
    const offset = latIndex % 2 === 1 ? lonStep / 2 : 0;
    for (let j = 0; j < lonCount; j++) {
      const lon = (((-180 + j * lonStep + offset) + 180) % 360) - 180;
      points.push({ lat, lon, label: formatLocationName(lat, lon) });
    }
  });
  return points;
}

export function formatLocationName(lat, lon) {
  const latAbs = Math.abs(lat).toFixed(2);
  const lonAbs = Math.abs(lon).toFixed(2);
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${latAbs}°${latCardinal}, ${lonAbs}°${lonCardinal}`;
}

export function formatCoordinates(lat, lon) {
  const latCardinal = lat >= 0 ? "N" : "S";
  const lonCardinal = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latCardinal}, ${Math.abs(lon).toFixed(2)}°${lonCardinal}`;
}

export function formatGeocodingLabel(result) {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return parts.join(", ");
}

export function formatDateTime(date) {
  const locale = (weatherState.language ?? "it") === "en" ? "en-GB" : "it-IT";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function formatForecastDate(value) {
  const locale = (weatherState.language ?? "it") === "en" ? "en-GB" : "it-IT";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

export function capitalize(value) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createStarField() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const sizes = [];
  const color = new THREE.Color();

  // Stellar spectral type distribution (approximate real distribution)
  // Colors: O=blue, B=blue-white, A=white-blue, F=white, G=yellow-white, K=orange, M=red-orange
  const SPECTRAL_TYPES = [
    { maxRand: 0.000003, h: 0.617, s: 0.8, lMin: 0.75, lMax: 0.9  }, // O (blue)
    { maxRand: 0.0014,   h: 0.622, s: 0.6, lMin: 0.72, lMax: 0.88 }, // B (blue-white)
    { maxRand: 0.0074,   h: 0.632, s: 0.3, lMin: 0.82, lMax: 0.95 }, // A (white-blue)
    { maxRand: 0.037,    h: 0.107, s: 0.2, lMin: 0.88, lMax: 0.98 }, // F (white)
    { maxRand: 0.113,    h: 0.1,   s: 0.4, lMin: 0.82, lMax: 0.95 }, // G (yellow-white)
    { maxRand: 0.234,    h: 0.08,  s: 0.6, lMin: 0.72, lMax: 0.88 }, // K (orange)
    { maxRand: 1.0,      h: 0.06,  s: 0.7, lMin: 0.62, lMax: 0.82 }, // M (red-orange, most common)
  ];

  const STAR_COUNT = 7000;

  for (let i = 0; i < STAR_COUNT; i++) {
    // Place on sphere at fixed radius (so stars don't zoom-scale strangely)
    // Use two different radii to give slight depth variation
    const radius = 70 + Math.random() * 20; // 70-90 units
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    // Slight Milky Way concentration: higher density near galactic equator
    // Galactic equator is tilted ~60° from celestial equator
    const galacticWeight = 1 + 1.5 * Math.pow(Math.abs(Math.sin(phi * 0.7 + 0.3)), 2);
    if (Math.random() > galacticWeight / 2.5) {
      // Reject some stars outside Milky Way band for concentration effect
      // (not all rejected, just thinned out)
    }

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    positions.push(x, y, z);

    // Pick spectral type by cumulative probability
    const rand = Math.random();
    let type = SPECTRAL_TYPES[SPECTRAL_TYPES.length - 1];
    for (const t of SPECTRAL_TYPES) {
      if (rand <= t.maxRand) { type = t; break; }
    }
    const lightness = type.lMin + Math.random() * (type.lMax - type.lMin);
    color.setHSL(type.h, type.s, lightness);
    colors.push(color.r, color.g, color.b);

    // Size: log-normal distribution so most stars are small, a few are bright/large
    // Bright stars: size 0.4-1.2, dim stars: size 0.05-0.2
    const brightness = Math.pow(Math.random(), 3); // heavily skewed toward dim
    sizes.push(0.05 + brightness * 1.2);
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // Note: THREE.PointsMaterial doesn't support per-vertex size directly without ShaderMaterial.
  // We use a single size but use alphaMap for softness.

  // Create a soft circular sprite texture for stars
  const starCanvas = document.createElement("canvas");
  starCanvas.width = 32;
  starCanvas.height = 32;
  const starCtx = starCanvas.getContext("2d");
  const starGrad = starCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  starGrad.addColorStop(0,   "rgba(255,255,255,1)");
  starGrad.addColorStop(0.3, "rgba(255,255,255,0.8)");
  starGrad.addColorStop(0.7, "rgba(255,255,255,0.2)");
  starGrad.addColorStop(1,   "rgba(255,255,255,0)");
  starCtx.fillStyle = starGrad;
  starCtx.fillRect(0, 0, 32, 32);
  const starTexture = new THREE.CanvasTexture(starCanvas);

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false,           // CRITICAL: don't fog the stars
      alphaMap: starTexture,
      alphaTest: 0.001,
    })
  );
}

export function colorForTemperature(temperature) {
  if (temperature === null) {
    return new THREE.Color("#5f7396");
  }

  const clamped = THREE.MathUtils.clamp((temperature + 25) / 65, 0, 1);
  const hue = THREE.MathUtils.lerp(0.62, 0.04, clamped);
  const saturation = THREE.MathUtils.lerp(0.62, 0.88, clamped);
  const lightness = THREE.MathUtils.lerp(0.56, 0.62, clamped);
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

export function tempToRgb(temp) {
  const stops = [
    [-30, [20, 0, 180]],
    [-15, [0, 100, 255]],
    [0,   [0, 230, 200]],
    [10,  [80, 255, 60]],
    [20,  [255, 230, 0]],
    [30,  [255, 80, 0]],
    [40,  [200, 0, 0]]
  ];
  const t = Math.max(-30, Math.min(40, temp));
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return stops[i][1].map((c, j) => Math.round(c + f * (stops[i + 1][1][j] - c)));
    }
  }
  return stops[stops.length - 1][1];
}

export function conditionIconMarkup(weatherCode, label) {
  if (weatherCode === 0 || /sereno|sun/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;
  }

  if ((weatherCode !== null && weatherCode >= 61) || /piogg|rovesc|tempor|rain/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a4 4 0 1 1 .5-8a5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 1 1 17.5 15H7Z" fill="currentColor"/>
        <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;
  }

  if ((weatherCode !== null && weatherCode >= 71) || /neve|snow/i.test(label)) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 14.8a4 4 0 1 1 .5-8a5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 1 1 17.5 14.8H7Z" fill="currentColor"/>
        <path d="M9 18.2h6M12 15.2v6M9.7 16.1l4.6 4.6M14.3 16.1l-4.6 4.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 16a4.5 4.5 0 1 1 .6-9a5.8 5.8 0 0 1 11 1.9A3.4 3.4 0 1 1 18.5 16H7Z" fill="currentColor"/>
    </svg>
  `;
}

export function markerIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Zm-7 12a2 2 0 1 1 0 4a2 2 0 0 1 0-4Zm14 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4Zm-7 1.2a2.8 2.8 0 1 1 0 5.6a2.8 2.8 0 0 1 0-5.6Z" fill="currentColor"/>
    </svg>
  `;
}

export function terminatorIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18V3Z" fill="currentColor"/>
      <path d="M12 3a9 9 0 0 1 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  `;
}

export function cloudIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18a4.2 4.2 0 1 1 .5-8.4a5.4 5.4 0 0 1 10.2 1.9A3.3 3.3 0 1 1 18 18H7.2Z" fill="currentColor"/>
    </svg>
  `;
}

export function cloudCoverIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 17a4.2 4.2 0 1 1 .5-8.4A5.4 5.4 0 0 1 17.9 10.5a3.3 3.3 0 1 1 .1 6.5H7.2Z" fill="currentColor" opacity="0.5"/>
      <path d="M5 19a3.5 3.5 0 1 1 .4-7 4.5 4.5 0 0 1 8.5 1.5A2.7 2.7 0 1 1 14 19H5Z" fill="currentColor"/>
      <text x="14" y="22" font-size="7" font-weight="bold" fill="currentColor" font-family="sans-serif">%</text>
    </svg>
  `;
}

export function buttonMarkup(icon, label) {
  return `<span class="button-content">${icon}<span>${label}</span></span>`;
}
