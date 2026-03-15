/**
 * Satellite Cloud Layer — real-time multi-provider composite via NASA GIBS WMS
 *
 * Main goals:
 * - Use multiple live providers (GOES East/West + Himawari + polar orbiters)
 * - Keep sources temporally coherent ("same moment-ish")
 * - Build high-detail global cloud texture for the globe
 *
 * Temporal coherence strategy:
 * - Parse WMS GetCapabilities and read each layer `default` time.
 * - Use the median geostationary timestamp as anchor.
 * - Keep only geo layers within ±2h from anchor.
 * - Keep polar layers on the anchor UTC day (or at most ±1 day).
 */

import { cloudCoverCanvas, cloudCoverTexture } from "./scene.js";

const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const GIBS_CAPABILITIES_URL = `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetCapabilities`;

const CAPABILITIES_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SYNC_DRIFT_MS = 2 * 60 * 60 * 1000; // ±2h

// Fetch sizes for source imagery (downsampled later on cloudCoverCanvas).
const POLAR_W = 3072;
const POLAR_H = 1536;
const GEO_W = 2048;
const GEO_H = 1024;

const POLAR_REALTIME_LAYERS = [
  { name: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", type: "color", family: "VIIRS-NOAA20" },
  { name: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", type: "color", family: "VIIRS-NOAA21" },
  { name: "VIIRS_SNPP_CorrectedReflectance_TrueColor",   type: "color", family: "VIIRS-SNPP" },
  { name: "MODIS_Terra_CorrectedReflectance_TrueColor",  type: "color", family: "MODIS-Terra" },
  { name: "MODIS_Aqua_CorrectedReflectance_TrueColor",   type: "color", family: "MODIS-Aqua" },
];

const GEO_REALTIME_LAYERS = [
  { name: "GOES-East_ABI_GeoColor",             type: "color", family: "GOES-East" },
  { name: "GOES-West_ABI_GeoColor",             type: "color", family: "GOES-West" },
  { name: "Himawari_AHI_Band3_Red_Visible_1km", type: "gray",  family: "Himawari" },
  { name: "GOES-East_ABI_Band13_Clean_Infrared", type: "ir",   family: "GOES-East-IR" },
  { name: "GOES-West_ABI_Band13_Clean_Infrared", type: "ir",   family: "GOES-West-IR" },
  { name: "Himawari_AHI_Band13_Clean_Infrared",  type: "ir",   family: "Himawari-IR" },
];

const POLAR_FALLBACK_LAYERS = [
  { name: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", nDays: 4 },
  { name: "MODIS_Terra_CorrectedReflectance_TrueColor",  nDays: 4 },
];

let _capabilitiesCacheAt = 0;
let _capabilitiesCacheXml = "";

function _escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _toUtcDateString(value) {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
}

function _toMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function _median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function _absDayDiff(dayA, dayB) {
  const a = Date.parse(`${dayA}T00:00:00Z`);
  const b = Date.parse(`${dayB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a - b) / 86400000));
}

/** ISO date strings for the last n UTC days (0 = today). */
function candidateDates(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

async function _getCapabilitiesXml() {
  const now = Date.now();
  if (_capabilitiesCacheXml && now - _capabilitiesCacheAt < CAPABILITIES_CACHE_TTL_MS) {
    return _capabilitiesCacheXml;
  }

  const resp = await fetch(GIBS_CAPABILITIES_URL);
  if (!resp.ok) throw new Error(`GIBS capabilities error: ${resp.status}`);
  _capabilitiesCacheXml = await resp.text();
  _capabilitiesCacheAt = now;
  return _capabilitiesCacheXml;
}

function _extractDefaultTime(capabilitiesXml, layerName) {
  const escaped = _escapeRegExp(layerName);
  const re = new RegExp(
    `<Name>${escaped}<\\/Name>[\\s\\S]*?<Dimension name="time"[^>]*default="([^"]+)"`,
    "i"
  );
  const match = capabilitiesXml.match(re);
  return match?.[1] ?? null;
}

async function _getLayerDefaultTimes(layerNames) {
  const xml = await _getCapabilitiesXml();
  const defaults = new Map();
  for (const layerName of layerNames) {
    defaults.set(layerName, _extractDefaultTime(xml, layerName));
  }
  return defaults;
}

function _buildRealtimePlans(defaultTimes) {
  const today = candidateDates(1)[0];

  const geoCandidates = GEO_REALTIME_LAYERS.map((layer) => ({
    ...layer,
    defaultTime: defaultTimes.get(layer.name) ?? null,
  }));

  const geoTimes = geoCandidates
    .map((layer) => _toMs(layer.defaultTime))
    .filter((v) => v != null);
  const anchorMs = _median(geoTimes);
  const anchorDate = anchorMs != null ? new Date(anchorMs).toISOString().slice(0, 10) : today;

  const geoPlan = geoCandidates
    .filter((layer) => {
      if (anchorMs == null) return true;
      const ms = _toMs(layer.defaultTime);
      if (ms == null) return true;
      return Math.abs(ms - anchorMs) <= MAX_SYNC_DRIFT_MS;
    })
    .map((layer) => ({
      ...layer,
      time: layer.defaultTime ?? null,
      width: GEO_W,
      height: GEO_H,
    }));

  const polarPlan = POLAR_REALTIME_LAYERS
    .map((layer) => {
      const defaultTime = defaultTimes.get(layer.name) ?? anchorDate;
      const date = _toUtcDateString(defaultTime) ?? anchorDate;
      return {
        ...layer,
        defaultTime,
        time: date,
        width: POLAR_W,
        height: POLAR_H,
      };
    })
    .filter((layer) => _absDayDiff(layer.time, anchorDate) <= 1);

  return { geoPlan, polarPlan, anchorDate };
}

/** Fetch one GIBS WMS layer. */
function fetchGibsLayer(layer, { time, w, h } = {}) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: layer,
    STYLES: "",
    CRS: "CRS:84",
    WIDTH: String(w ?? POLAR_W),
    HEIGHT: String(h ?? POLAR_H),
    BBOX: "-180,-90,180,90",
  });

  if (time) params.set("TIME", time);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, layer, time: time ?? null });
    img.onerror = () => reject(new Error(`GIBS layer unavailable: ${layer}${time ? ` @ ${time}` : ""}`));
    img.src = `${GIBS_WMS}?${params}`;
  });
}

// ── Cloud extraction ───────────────────────────────────────────────────────

/**
 * Extract cloud pixels from satellite imagery.
 * `type`: "color" | "gray" | "ir"
 */
function extractCloudPixels(img, type = "color") {
  const W = img.width;
  const H = img.height;
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = W;
  srcCanvas.height = H;
  const sCtx = srcCanvas.getContext("2d");
  sCtx.drawImage(img, 0, 0);
  const { data } = sCtx.getImageData(0, 0, W, H);

  const out = new Uint8ClampedArray(W * H * 4);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;

    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const brightness = (r + g + b) / 3;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    let alpha = 0;

    if (type === "gray") {
      if (brightness > 0.38) {
        alpha = Math.round(Math.min((brightness - 0.38) / 0.62 * 1.5, 1) * 240);
      }
    } else if (type === "ir") {
      // Infrared palettes are generally near-grayscale in these layers:
      // keep bright and low-saturation pixels (cold cloud tops).
      if (brightness > 0.34 && saturation < 0.24) {
        alpha = Math.round(Math.min((brightness - 0.34) / 0.66 * 1.6, 1) * 238);
      }
    } else {
      if (brightness > 0.30 && saturation < 0.44) {
        alpha = Math.round(Math.min((brightness - 0.30) / 0.70 * 1.65, 1) * 245);
      }
    }

    if (alpha > 8) {
      out[i] = 245;
      out[i + 1] = 248;
      out[i + 2] = 255;
      out[i + 3] = alpha;
    }
  }

  return new ImageData(out, W, H);
}

function hasCloudData(imgData) {
  const d = imgData.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) return true;
  }
  return false;
}

// ── Compositing ────────────────────────────────────────────────────────────

function compositeAndApply(cloudDatas) {
  const CW = cloudCoverCanvas.width;
  const CH = cloudCoverCanvas.height;
  const outData = new Uint8ClampedArray(CW * CH * 4);

  for (const src of cloudDatas) {
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = src.width;
    tmpCanvas.height = src.height;
    tmpCanvas.getContext("2d").putImageData(src, 0, 0);

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = CW;
    scaledCanvas.height = CH;
    const scaledCtx = scaledCanvas.getContext("2d");
    scaledCtx.drawImage(tmpCanvas, 0, 0, CW, CH);
    const scaledD = scaledCtx.getImageData(0, 0, CW, CH).data;

    for (let i = 0; i < outData.length; i += 4) {
      const srcAlpha = scaledD[i + 3];
      if (srcAlpha > outData[i + 3]) {
        outData[i] = scaledD[i];
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

export async function loadSatelliteCloudTexture() {
  const allLayerNames = [
    ...POLAR_REALTIME_LAYERS.map((l) => l.name),
    ...GEO_REALTIME_LAYERS.map((l) => l.name),
  ];

  let defaultTimes = new Map();
  try {
    defaultTimes = await _getLayerDefaultTimes(allLayerNames);
  } catch (err) {
    console.warn("[Clouds] GIBS capabilities parse failed, fallback to unsynced fetch:", err.message);
  }

  const { geoPlan, polarPlan, anchorDate } = _buildRealtimePlans(defaultTimes);
  const realtimePlan = [...geoPlan, ...polarPlan];

  const realtimeResults = await Promise.allSettled(
    realtimePlan.map((layer) =>
      fetchGibsLayer(layer.name, {
        time: layer.time,
        w: layer.width,
        h: layer.height,
      }).then((res) => ({
        ...res,
        cloudType: layer.type,
        family: layer.family,
      }))
    )
  );

  const cloudDatas = [];
  const familySet = new Set();
  const usedLayers = [];

  for (const res of realtimeResults) {
    if (res.status !== "fulfilled") continue;
    const { img, layer, cloudType, family } = res.value;
    const cloudData = extractCloudPixels(img, cloudType ?? "color");
    if (!hasCloudData(cloudData)) continue;
    cloudDatas.push(cloudData);
    familySet.add(family ?? layer);
    usedLayers.push(layer);
  }

  if (cloudDatas.length > 0) {
    compositeAndApply(cloudDatas);
    cloudCoverTexture.needsUpdate = true;
    console.log(`[Clouds] Realtime composite: ${cloudDatas.length} layers, ${familySet.size} providers`);
    return {
      ok: true,
      sources: cloudDatas.length,
      providers: familySet.size,
      layers: usedLayers.join("+"),
      date: anchorDate,
      syncWindowMinutes: Math.round(MAX_SYNC_DRIFT_MS / 60000),
    };
  }

  // Fallback: daily polar composites on recent dates
  for (const { name, nDays } of POLAR_FALLBACK_LAYERS) {
    for (const date of candidateDates(nDays)) {
      try {
        const { img } = await fetchGibsLayer(name, { time: date, w: POLAR_W, h: POLAR_H });
        const cloudData = extractCloudPixels(img, "color");
        if (!hasCloudData(cloudData)) continue;
        compositeAndApply([cloudData]);
        cloudCoverTexture.needsUpdate = true;
        return {
          ok: true,
          sources: 1,
          providers: 1,
          layers: name,
          date,
          syncWindowMinutes: null,
        };
      } catch {
        // try next date/layer
      }
    }
  }

  throw new Error("No GIBS satellite imagery available");
}
