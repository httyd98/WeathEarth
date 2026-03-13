/**
 * Country polygon loader — fetches and decodes world-atlas 110m topojson.
 *
 * Returns polygon rings per ISO 3166-1 alpha-2 country code.
 * Each entry is an array of polygons (for MultiPolygon countries like USA/Russia),
 * where each polygon is an array of rings ([0]=outer, [1..n]=holes),
 * where each ring is an array of [lon, lat] coordinate pairs.
 *
 * Data cached in IndexedDB for 7 days.
 */

import { saveGeoData, loadGeoData } from "../weather/cacheDB.js";

const TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
const CACHE_KEY = "world_atlas_110m_v2";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ISO 3166-1 alpha-2 → numeric (for the countries in our dataset)
const ISO2_TO_NUMERIC = {
  US: 840, CA: 124, MX: 484,
  BR:  76, AR:  32, CL: 152, CO: 170, PE: 604, EC: 218, VE: 862,
  DE: 276, GB: 826, FR: 250, IT: 380, ES: 724, NL: 528, CH: 756,
  SE: 752, BE:  56, PL: 616, NO: 578, AT:  40, DK: 208, IE: 372,
  FI: 246, PT: 620, GR: 300, CZ: 203, RO: 642, HU: 348, UA: 804,
  RU: 643,
  CN: 156, JP: 392, IN: 356, KR: 410, ID: 360, SA: 682, TR: 792,
  TH: 764, AE: 784, IL: 376, MY: 458, SG: 702, PH: 608, BD:  50,
  VN: 704, PK: 586, IQ: 368, EG: 818, KZ: 398, HK: 344,
  AU:  36, NZ: 554,
  NG: 566, ZA: 710, MA: 504, ET: 231, KE: 404, GH: 288, CD: 180, DZ:  12,
};

const NUMERIC_TO_ISO2 = Object.fromEntries(
  Object.entries(ISO2_TO_NUMERIC).map(([iso2, num]) => [num, iso2])
);

/** Map<iso2, polygon[][]> — populated after loadCountryPolygons() */
let _polygonMap = null;

// ---------------------------------------------------------------------------
// Minimal topojson decoder (no external dependency)
// ---------------------------------------------------------------------------

function _decodeTopo(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;

  // Decode delta-encoded quantized arcs → [lon, lat] coordinates
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(pt => {
      x += pt[0]; y += pt[1];
      return [x * sx + tx, y * sy + ty];
    });
  });

  function stitchRing(refs) {
    const coords = [];
    for (const ref of refs) {
      const arc = ref < 0 ? arcs[~ref].slice().reverse() : arcs[ref].slice();
      if (coords.length > 0) arc.shift(); // drop duplicate junction point
      coords.push(...arc);
    }
    return coords;
  }

  // Build Map<numericId, polygons[][]>
  const result = new Map();
  for (const geom of topo.objects.countries.geometries) {
    const id = geom.id;
    const polys = [];
    if (geom.type === "Polygon") {
      polys.push(geom.arcs.map(stitchRing));
    } else if (geom.type === "MultiPolygon") {
      for (const mp of geom.arcs) polys.push(mp.map(stitchRing));
    }
    if (polys.length > 0) result.set(id, polys);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load (from IndexedDB cache or CDN) and decode the country polygons.
 * Must be awaited before getPolygons() is usable.
 * Returns the polygon map on success, null on failure.
 */
export async function loadCountryPolygons() {
  if (_polygonMap) return _polygonMap;

  let topo = await loadGeoData(CACHE_KEY);
  if (!topo) {
    try {
      const resp = await fetch(TOPOJSON_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      topo = await resp.json();
      await saveGeoData(CACHE_KEY, topo, CACHE_TTL);
    } catch (e) {
      console.warn("countryPolygons: failed to fetch topojson", e);
      return null;
    }
  }

  const numericMap = _decodeTopo(topo);
  _polygonMap = new Map();
  for (const [numId, polys] of numericMap) {
    const iso2 = NUMERIC_TO_ISO2[numId];
    if (iso2) _polygonMap.set(iso2, polys);
  }
  return _polygonMap;
}

/**
 * Returns polygon array for an ISO2 code, or null if not available.
 * Each polygon: [[outerRing, ...holes]] where ring = [[lon,lat],...]
 */
export function getPolygons(iso2) {
  return _polygonMap?.get(iso2) ?? null;
}
