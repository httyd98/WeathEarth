/**
 * CCTV / Webcam Layer — shows public live webcam feeds positioned on the globe.
 *
 * Data sources (multiple providers for maximum coverage):
 *   1. Windy Webcam API v3 (public) — https://api.windy.com/webcams/api/v3/webcams
 *   2. EarthCam public embed URLs — major tourist locations with live streams
 *   3. Alertcalifornia (traffic + nature cameras) — public API
 *   4. Lookr / NPS public cameras
 *   5. Static curated fallback list (150+ cameras)
 *
 * Marker rendering:
 *   - InstancedMesh dots on globe surface (cyan = has stream, gray = thumb only)
 *   - CSS overlay projected from 3D → 2D for dots + hover cards
 *
 * Feed card:
 *   - Cameras with stream URLs: show <iframe> or <video> element
 *   - Cameras with thumbnail only: show refreshing <img> element
 */

import * as THREE from "three";
import { globeGroup, camera, renderer } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

// ── Config ────────────────────────────────────────────────────────────────────

const WINDY_API_KEY = ""; // Set your Windy API key here (optional)
const WINDY_URL     = "https://api.windy.com/webcams/api/v3/webcams";
const WINDY_PARAMS  = "?limit=500&offset=0&fields=webcams.title,webcams.location,webcams.images,webcams.urls,webcams.status&lang=it";
const EARTHCAM_MAPSEARCH_URL = "https://www.earthcam.com/api/mapsearch/get_locations_network.php?r=ecn&a=fetch";
const MARKER_ALTITUDE = GLOBE_RADIUS + 0.015;
const MAX_VISIBLE_OVERLAY = 96;
const PREVIEW_HEIGHT_PX = 228;
const PREVIEW_REFRESH_STEPS_SEC = [5, 30, 60];
const LIVE_BOOT_TIMEOUT_MS = 9000;
const CARD_WIDTH_PX = 420;

// ── Curated static fallback cameras ──────────────────────────────────────────
// Each: { id, title, lat, lon, thumb, stream }
// stream: null | URL string
//   - EarthCam embed: "earthcam:CAMID"
//   - YouTube live:   "youtube:VIDEO_ID"
//   - Direct MJPEG:   full http(s):// URL
//   - HLS m3u8:       full https:// URL (won't embed but card shows link)

const FALLBACK_CAMERAS = [
  // ── North America ──────────────────────────────────────────────────────────
  { id: "ec_times_sq",   title: "Times Square, New York",         lat:  40.7580, lon: -73.9855,  thumb: "https://images.earthcam.com/ec_metros/ourcams/timessquare.jpg",    stream: "earthcam:timessquare" },
  { id: "ec_nashville",  title: "Broadway, Nashville",            lat:  36.1612, lon: -86.7785,  thumb: "https://images.earthcam.com/ec_metros/ourcams/broadway.jpg",        stream: "earthcam:nashvillebroadway" },
  { id: "ec_chicago",    title: "Chicago Riverwalk",              lat:  41.8858, lon: -87.6291,  thumb: "https://images.earthcam.com/ec_metros/ourcams/chicago.jpg",         stream: "earthcam:chicago" },
  { id: "ec_miami",      title: "Miami Beach Ocean Drive",        lat:  25.7825, lon: -80.1300,  thumb: "https://images.earthcam.com/ec_metros/ourcams/miami.jpg",           stream: "earthcam:miami" },
  { id: "ec_newOrleans", title: "Bourbon Street, New Orleans",   lat:  29.9584, lon: -90.0644,  thumb: "https://images.earthcam.com/ec_metros/ourcams/bourbonstreet.jpg",   stream: "earthcam:bourbonstreet" },
  { id: "ec_lasvegas",   title: "Las Vegas Strip",                lat:  36.1146, lon:-115.1728,  thumb: "https://images.earthcam.com/ec_metros/ourcams/lasvegas.jpg",        stream: "earthcam:lasvegas" },
  { id: "ec_sanfran",    title: "Pier 39, San Francisco",         lat:  37.8087, lon:-122.4098,  thumb: "https://images.earthcam.com/ec_metros/ourcams/pier39.jpg",          stream: "earthcam:pier39" },
  { id: "ec_honolulu",   title: "Waikiki Beach, Honolulu",        lat:  21.2793, lon:-157.8293,  thumb: "https://images.earthcam.com/ec_metros/ourcams/waikiki.jpg",         stream: "earthcam:waikiki" },
  { id: "ec_niagara",    title: "Niagara Falls",                  lat:  43.0896, lon: -79.0849,  thumb: "https://images.earthcam.com/ec_metros/ourcams/niagarafalls.jpg",    stream: "earthcam:niagarafalls" },
  { id: "ec_boston",     title: "Faneuil Hall, Boston",           lat:  42.3600, lon: -71.0560,  thumb: "https://images.earthcam.com/ec_metros/ourcams/boston.jpg",          stream: "earthcam:boston" },
  { id: "cam_yellowstone",title:"Yellowstone Old Faithful",       lat:  44.4605, lon:-110.8281,  thumb: null,                                                                 stream: null },
  { id: "cam_grandcanyon",title:"Grand Canyon South Rim",         lat:  36.0544, lon:-112.1401,  thumb: null,                                                                 stream: null },

  // ── Europe ────────────────────────────────────────────────────────────────
  { id: "ec_london",     title: "Tower Bridge, London",           lat:  51.5055, lon:  -0.0754,  thumb: "https://images.earthcam.com/ec_metros/ourcams/london.jpg",          stream: "earthcam:london" },
  { id: "ec_paris",      title: "Eiffel Tower, Paris",            lat:  48.8584, lon:   2.2945,  thumb: "https://images.earthcam.com/ec_metros/ourcams/paris.jpg",           stream: "earthcam:paris" },
  { id: "ec_rome",       title: "Colosseo, Roma",                 lat:  41.8902, lon:  12.4922,  thumb: "https://images.earthcam.com/ec_metros/ourcams/rome.jpg",            stream: "earthcam:rome" },
  { id: "ec_venice",     title: "Piazza San Marco, Venezia",      lat:  45.4340, lon:  12.3388,  thumb: "https://images.earthcam.com/ec_metros/ourcams/venice.jpg",          stream: "earthcam:venice" },
  { id: "ec_amsterdam",  title: "Canal, Amsterdam",               lat:  52.3676, lon:   4.9041,  thumb: "https://images.earthcam.com/ec_metros/ourcams/amsterdam.jpg",       stream: "earthcam:amsterdam" },
  { id: "ec_prague",     title: "Old Town Square, Prague",        lat:  50.0876, lon:  14.4213,  thumb: "https://images.earthcam.com/ec_metros/ourcams/prague.jpg",          stream: "earthcam:prague" },
  { id: "ec_barcelona",  title: "La Rambla, Barcelona",           lat:  41.3784, lon:   2.1741,  thumb: "https://images.earthcam.com/ec_metros/ourcams/barcelona.jpg",       stream: "earthcam:barcelona" },
  { id: "ec_berlin",     title: "Brandenburg Gate, Berlin",       lat:  52.5163, lon:  13.3777,  thumb: null,                                                                 stream: null },
  { id: "cam_snt_peter", title: "Piazza S. Pietro, Vaticano",     lat:  41.9022, lon:  12.4539,  thumb: null,                                                                 stream: null },
  { id: "cam_santorini", title: "Santorini, Grecia",              lat:  36.3932, lon:  25.4615,  thumb: null,                                                                 stream: null },
  { id: "cam_dubrovnik", title: "Dubrovnik, Croazia",             lat:  42.6507, lon:  18.0944,  thumb: null,                                                                 stream: null },
  { id: "cam_edinburgh", title: "Edinburgh Castle, Scozia",       lat:  55.9486, lon:  -3.1999,  thumb: null,                                                                 stream: null },
  { id: "cam_zurich",    title: "Zurich, Svizzera",               lat:  47.3769, lon:   8.5417,  thumb: null,                                                                 stream: null },
  { id: "cam_reykjavik", title: "Reykjavik, Islanda",             lat:  64.1355, lon: -21.8954,  thumb: null,                                                                 stream: null },
  { id: "cam_oslo",      title: "Oslo, Norvegia",                 lat:  59.9139, lon:  10.7522,  thumb: null,                                                                 stream: null },
  { id: "cam_helsinki",  title: "Helsinki, Finlandia",            lat:  60.1699, lon:  24.9384,  thumb: null,                                                                 stream: null },
  { id: "cam_vienna",    title: "Vienna, Austria",                lat:  48.2082, lon:  16.3738,  thumb: null,                                                                 stream: null },
  { id: "cam_budapest",  title: "Budapest, Ungheria",             lat:  47.4979, lon:  19.0402,  thumb: null,                                                                 stream: null },

  // ── Asia ─────────────────────────────────────────────────────────────────
  { id: "ec_tokyo",      title: "Shibuya Crossing, Tokyo",        lat:  35.6595, lon: 139.7004,  thumb: "https://images.earthcam.com/ec_metros/ourcams/shibuya.jpg",         stream: "earthcam:shibuya" },
  { id: "cam_fuji",      title: "Monte Fuji, Giappone",           lat:  35.3606, lon: 138.7274,  thumb: null,                                                                 stream: null },
  { id: "cam_seoul",     title: "Gyeongbokgung, Seoul",           lat:  37.5796, lon: 126.9770,  thumb: null,                                                                 stream: null },
  { id: "cam_shanghai",  title: "The Bund, Shanghai",             lat:  31.2304, lon: 121.4737,  thumb: null,                                                                 stream: null },
  { id: "cam_hongkong",  title: "Victoria Harbour, Hong Kong",    lat:  22.2793, lon: 114.1628,  thumb: null,                                                                 stream: null },
  { id: "cam_bangkok",   title: "Chao Phraya, Bangkok",           lat:  13.7563, lon: 100.5018,  thumb: null,                                                                 stream: null },
  { id: "cam_singapore", title: "Marina Bay, Singapore",          lat:   1.2816, lon: 103.8636,  thumb: null,                                                                 stream: null },
  { id: "cam_delhi",     title: "India Gate, New Delhi",          lat:  28.6129, lon:  77.2295,  thumb: null,                                                                 stream: null },
  { id: "cam_mumbai",    title: "Gateway of India, Mumbai",       lat:  18.9220, lon:  72.8347,  thumb: null,                                                                 stream: null },
  { id: "cam_dubai",     title: "Burj Khalifa, Dubai",            lat:  25.1972, lon:  55.2744,  thumb: null,                                                                 stream: null },
  { id: "cam_istanbul",  title: "Bosforo, Istanbul",              lat:  41.0082, lon:  28.9784,  thumb: null,                                                                 stream: null },
  { id: "cam_jerusalem", title: "Muro del Pianto, Gerusalemme",   lat:  31.7767, lon:  35.2345,  thumb: null,                                                                 stream: null },
  { id: "cam_tehran",    title: "Tehran, Iran",                   lat:  35.6892, lon:  51.3890,  thumb: null,                                                                 stream: null },
  { id: "cam_bali",      title: "Bali, Indonesia",                lat:  -8.3405, lon: 115.0920,  thumb: null,                                                                 stream: null },
  { id: "cam_angkor",    title: "Angkor Wat, Cambogia",           lat:  13.4125, lon: 103.8670,  thumb: null,                                                                 stream: null },
  { id: "cam_kathmandu", title: "Kathmandu, Nepal",               lat:  27.7172, lon:  85.3240,  thumb: null,                                                                 stream: null },
  { id: "cam_mecca",     title: "La Mecca, Arabia Saudita",       lat:  21.4225, lon:  39.8262,  thumb: null,                                                                 stream: null },

  // ── Africa ────────────────────────────────────────────────────────────────
  { id: "cam_cairo",     title: "Piramidi, Giza",                 lat:  29.9792, lon:  31.1342,  thumb: null,                                                                 stream: null },
  { id: "cam_capetown",  title: "Cape Town, Sudafrica",           lat: -33.9249, lon:  18.4241,  thumb: null,                                                                 stream: null },
  { id: "cam_nairobi",   title: "Nairobi, Kenya",                 lat:  -1.2921, lon:  36.8219,  thumb: null,                                                                 stream: null },
  { id: "cam_casablanca",title: "Casablanca, Marocco",            lat:  33.5731, lon:  -7.5898,  thumb: null,                                                                 stream: null },
  { id: "cam_victoria",  title: "Victoria Falls, Zimbabwe",       lat: -17.9243, lon:  25.8572,  thumb: null,                                                                 stream: null },
  { id: "cam_serengeti", title: "Serengeti, Tanzania",            lat:  -2.3333, lon:  34.8333,  thumb: null,                                                                 stream: null },

  // ── South America ─────────────────────────────────────────────────────────
  { id: "ec_rio",        title: "Copacabana, Rio de Janeiro",     lat: -22.9705, lon: -43.1820,  thumb: null,                                                                 stream: null },
  { id: "cam_buenosaires",title:"Buenos Aires, Argentina",        lat: -34.6037, lon: -58.3816,  thumb: null,                                                                 stream: null },
  { id: "cam_machu",     title: "Machu Picchu, Perù",             lat: -13.1631, lon: -72.5450,  thumb: null,                                                                 stream: null },
  { id: "cam_amazonas",  title: "Rio delle Amazzoni, Brasile",    lat:  -3.1000, lon: -60.0254,  thumb: null,                                                                 stream: null },
  { id: "cam_galapagos", title: "Galápagos, Ecuador",             lat:  -0.8000, lon: -91.1000,  thumb: null,                                                                 stream: null },
  { id: "cam_bogota",    title: "Bogotà, Colombia",               lat:   4.7110, lon: -74.0721,  thumb: null,                                                                 stream: null },

  // ── Oceania ───────────────────────────────────────────────────────────────
  { id: "ec_sydney",     title: "Opera House, Sydney",            lat: -33.8568, lon: 151.2153,  thumb: "https://images.earthcam.com/ec_metros/ourcams/sydney.jpg",          stream: "earthcam:sydney" },
  { id: "cam_greatbarrier",title:"Grande Barriera Corallina",     lat: -18.2861, lon: 147.6992,  thumb: null,                                                                 stream: null },
  { id: "cam_auckland",  title: "Auckland, Nuova Zelanda",        lat: -36.8485, lon: 174.7633,  thumb: null,                                                                 stream: null },
  { id: "cam_uluru",     title: "Uluru, Australia",               lat: -25.3444, lon: 131.0369,  thumb: null,                                                                 stream: null },

  // ── Polar / Nature ────────────────────────────────────────────────────────
  { id: "cam_alaska_bears",title:"Katmai Bears, Alaska",          lat:  58.5986, lon:-156.6520,  thumb: null,                                                                 stream: null },
  { id: "cam_antarctica",title: "Stazione McMurdo, Antartide",    lat: -77.8500, lon: 166.6700,  thumb: null,                                                                 stream: null },
  { id: "cam_nthpole",   title: "Zona Artica",                    lat:  89.0000, lon:   0.0000,  thumb: null,                                                                 stream: null },

  // ── More Italy ────────────────────────────────────────────────────────────
  { id: "cam_milan",     title: "Piazza Duomo, Milano",           lat:  45.4642, lon:   9.1900,  thumb: null,                                                                 stream: null },
  { id: "cam_naples",    title: "Napoli, Golfo",                  lat:  40.8518, lon:  14.2681,  thumb: null,                                                                 stream: null },
  { id: "cam_florence",  title: "Firenze, Ponte Vecchio",         lat:  43.7684, lon:  11.2560,  thumb: null,                                                                 stream: null },
  { id: "cam_amalfi",    title: "Costa Amalfitana",               lat:  40.6340, lon:  14.6027,  thumb: null,                                                                 stream: null },
  { id: "cam_cinque",    title: "Cinque Terre, Liguria",          lat:  44.1461, lon:   9.6603,  thumb: null,                                                                 stream: null },
  { id: "cam_dolomites", title: "Dolomiti",                       lat:  46.5100, lon:  11.9700,  thumb: null,                                                                 stream: null },
  { id: "cam_sicily",    title: "Etna, Sicilia",                  lat:  37.7510, lon:  14.9934,  thumb: null,                                                                 stream: null },
  { id: "cam_sardinia",  title: "Sardegna, Costa Smeralda",       lat:  41.1000, lon:   9.5100,  thumb: null,                                                                 stream: null },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _active    = false;
let _cameras   = [];
let _mesh      = null;
let _overlay   = null;
let _pinnedCamId = null;

const _tmpCamDir = new THREE.Vector3();
const _tmpPointDir = new THREE.Vector3();
const _tmpProj = new THREE.Vector3();
const _tmpCenterToCam = new THREE.Vector3();
const _tmpCenterToPoint = new THREE.Vector3();
const _tmpRayToPoint = new THREE.Vector3();
const _tmpRayToCenter = new THREE.Vector3();
const _tmpClosestPoint = new THREE.Vector3();

// ── Coordinate helpers ────────────────────────────────────────────────────────

function _latLonToVec3(lat, lon, r) {
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -(Math.sin(phi) * Math.cos(theta)) * r,
      Math.cos(phi) * r,
      Math.sin(phi) * Math.sin(theta) * r
  );
}

function _toHttps(url) {
  if (typeof url !== "string") return null;
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url.replace(/^http:\/\//i, "https://");
}

function _normalizeTitle(rawTitle, lat, lon, fallbackLabel = "") {
  const clean = String(rawTitle ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean && clean.toLowerCase() !== "null" && clean.toLowerCase() !== "undefined") return clean;

  const alt = String(fallbackLabel ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (alt) return `Webcam ${alt}`;
  return `Webcam ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function _earthCamThumbFromStream(stream) {
  if (typeof stream !== "string" || !stream.startsWith("earthcam:")) return null;
  // Legacy fallback: old IDs cannot be deterministically mapped to current camshots.
  return "https://www.earthcam.com/images/socialnetworking/social-media-thumbnail.jpg";
}

export function getCctvPreviewUrl(cam) {
  if (!cam) return null;
  const thumb = _toHttps(cam.thumb);
  // Legacy host no longer resolves reliably; use stream fallback instead.
  if (thumb && !thumb.includes("images.earthcam.com/")) return thumb;
  return _earthCamThumbFromStream(cam.stream) ?? thumb ?? null;
}

function _normalizeCamera(cam, index = 0) {
  const lat = Number.parseFloat(cam.lat);
  const lon = Number.parseFloat(cam.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const normalized = {
    id: String(cam.id ?? `cam_${index}`),
    title: _normalizeTitle(cam.title, lat, lon, cam.location ?? ""),
    lat,
    lon,
    thumb: _toHttps(cam.thumb ?? null),
    stream: _toHttps(cam.stream ?? null),
  };

  // Hide cameras that cannot show any visual content in card.
  if (!getCctvPreviewUrl(normalized) && !normalized.stream) return null;
  return normalized;
}

function _isDirectVideoUrl(url) {
  return /\.(mp4|webm|ogg|ogv)(?:[?#].*)?$/i.test(String(url ?? ""));
}

function _isLikelyHlsUrl(url) {
  return /\.m3u8(?:[?#].*)?$/i.test(String(url ?? ""));
}

function _toYouTubeEmbed(streamUrl) {
  try {
    const u = new URL(streamUrl);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0];
      if (!id) return null;
      return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
    }

    if (!u.hostname.includes("youtube.com")) return null;

    if (u.pathname.startsWith("/embed/")) {
      const hasAuto = u.searchParams.has("autoplay");
      const hasMute = u.searchParams.has("mute");
      if (!hasAuto) u.searchParams.set("autoplay", "1");
      if (!hasMute) u.searchParams.set("mute", "1");
      u.searchParams.set("playsinline", "1");
      return u.toString();
    }

    const id = u.searchParams.get("v");
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`;
  } catch {
    return null;
  }
}

function _toEmbeddableStream(streamUrl) {
  const u = _toHttps(streamUrl);
  if (!u) return null;
  return _toYouTubeEmbed(u);
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function _fetchEarthCamCameras() {
  try {
    const resp = await fetch(EARTHCAM_MAPSEARCH_URL);
    if (!resp.ok) return [];
    const json = await resp.json();
    const out = [];
    const seen = new Set();

    for (const group of (json.data ?? [])) {
      for (const place of (group.places ?? [])) {
        const lat = Number.parseFloat(place.posn?.[0]);
        const lon = Number.parseFloat(place.posn?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const title = _normalizeTitle(
          place.name,
          lat,
          lon,
          place.location ?? place.city ?? place.country ?? ""
        );
        const key = `${title}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          id: `earthcam_${place.id ?? out.length}`,
          title,
          lat,
          lon,
          thumb: _toHttps(place.thumbnail ?? place.icon?.icon ?? place.image ?? null),
          stream: _toHttps(place.url ?? null),
        });
      }
    }

    return out;
  } catch (e) {
    console.warn("[CCTV] EarthCam API error:", e.message);
    return [];
  }
}

async function _fetchCameras() {
  const cameras = [];
  const earthCamCams = await _fetchEarthCamCameras();
  if (earthCamCams.length > 0) {
    cameras.push(...earthCamCams);
  } else {
    cameras.push(...FALLBACK_CAMERAS.map(c => ({ ...c, stream: c.stream ?? null })));
  }

  if (WINDY_API_KEY) {
    try {
      const resp = await fetch(`${WINDY_URL}${WINDY_PARAMS}`, {
        headers: { "x-windy-api-key": WINDY_API_KEY },
      });
      if (resp.ok) {
        const json = await resp.json();
        const windyCams = (json.webcams ?? []).map(wc => ({
          id:     "windy_" + (wc.id ?? wc.webcamId ?? Math.random()),
          title:  wc.title ?? "Webcam",
          lat:    wc.location?.latitude  ?? 0,
          lon:    wc.location?.longitude ?? 0,
          thumb:  _toHttps(wc.images?.current?.thumbnail ?? null),
          stream: _toHttps(wc.urls?.provider ?? wc.urls?.embed ?? null),
        })).filter(c => c.lat !== 0 || c.lon !== 0);
        cameras.push(...windyCams);
      }
    } catch (e) {
      console.warn("[CCTV] Windy API error:", e.message);
    }
  }

  const normalized = [];
  const seen = new Set();
  for (let i = 0; i < cameras.length; i++) {
    const cam = _normalizeCamera(cameras[i], i);
    if (!cam) continue;
    const key = `${cam.title}|${cam.lat.toFixed(5)}|${cam.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cam);
  }

  return normalized;
}

// ── Three.js marker mesh ──────────────────────────────────────────────────────
// We intentionally keep only one visual marker system (CSS overlay dots)
// to avoid the previous "double-point" look.
function _buildMarkers() {
  if (_mesh) {
    globeGroup.remove(_mesh);
    _mesh.geometry.dispose();
    _mesh.material.dispose();
    _mesh = null;
  }
}

// ── CSS overlay ───────────────────────────────────────────────────────────────

const CCTV_UI_BLOCK_SELECTORS = [
  ".hud",
  "#left-sidebar-toggle",
  "#right-sidebar",
  ".search-dock",
  "#wind-altitude-slider",
];

let _overlayNodes = new Map();
let _screenByCamId = new Map();

function _buildOverlay() {
  if (_overlay) { _overlay.remove(); _overlay = null; }
  _removeConnectorLayer();
  _overlayNodes.clear();
  _screenByCamId.clear();

  _overlay = document.createElement("div");
  _overlay.id = "cctv-overlay";
  Object.assign(_overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2",
    overflow: "hidden",
  });
  document.body.appendChild(_overlay);
  _ensureConnectorLayer();
}

function _ensureConnectorLayer() {
  if (_connectorSvg) return;
  _connectorSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  _connectorSvg.setAttribute("width", "100%");
  _connectorSvg.setAttribute("height", "100%");
  Object.assign(_connectorSvg.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "29",
    overflow: "visible",
  });

  _connectorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  _connectorLine.setAttribute("stroke", "rgba(92, 224, 255, 0.9)");
  _connectorLine.setAttribute("stroke-width", "1.35");
  _connectorLine.setAttribute("stroke-linecap", "round");
  _connectorLine.style.display = "none";
  _connectorSvg.appendChild(_connectorLine);

  _connectorDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  _connectorDot.setAttribute("r", "2.8");
  _connectorDot.setAttribute("fill", "rgba(110, 235, 255, 1)");
  _connectorDot.style.display = "none";
  _connectorSvg.appendChild(_connectorDot);

  document.body.appendChild(_connectorSvg);
}

function _hideConnector() {
  if (_connectorLine) _connectorLine.style.display = "none";
  if (_connectorDot) _connectorDot.style.display = "none";
}

function _removeConnectorLayer() {
  if (_connectorSvg) _connectorSvg.remove();
  _connectorSvg = null;
  _connectorLine = null;
  _connectorDot = null;
}

function _project(worldPos) {
  _tmpProj.copy(worldPos).project(camera);
  if (_tmpProj.z < -1 || _tmpProj.z > 1) return null;
  return {
    x: (_tmpProj.x + 1) / 2 * window.innerWidth,
    y: (-_tmpProj.y + 1) / 2 * window.innerHeight,
  };
}

function _isOccludedByEarth(worldPos) {
  _tmpRayToPoint.copy(worldPos).sub(camera.position);
  const distToPoint = _tmpRayToPoint.length();
  if (distToPoint <= 1e-6) return true;
  _tmpRayToPoint.divideScalar(distToPoint);

  _tmpRayToCenter.copy(globeGroup.position).sub(camera.position);
  const t = _tmpRayToCenter.dot(_tmpRayToPoint);
  if (t <= 0 || t >= distToPoint) return false;

  _tmpClosestPoint.copy(camera.position).addScaledVector(_tmpRayToPoint, t);
  const d = _tmpClosestPoint.distanceTo(globeGroup.position);
  return d < GLOBE_RADIUS * 1.0005;
}

function _isVisible(worldPos) {
  _tmpCenterToCam.copy(camera.position).sub(globeGroup.position).normalize();
  _tmpCenterToPoint.copy(worldPos).sub(globeGroup.position).normalize();
  if (_tmpCenterToCam.dot(_tmpCenterToPoint) <= 0.015) return false;
  return !_isOccludedByEarth(worldPos);
}

function _getUiBlockingRects() {
  const rects = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const sel of CCTV_UI_BLOCK_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue;
    rects.push({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
    });
  }

  return rects;
}

function _isBlockedByUi(screen, rects) {
  const pad = 6;
  for (const r of rects) {
    if (
      screen.x >= r.left - pad &&
      screen.x <= r.right + pad &&
      screen.y >= r.top - pad &&
      screen.y <= r.bottom + pad
    ) {
      return true;
    }
  }
  return false;
}

function _computeCameraScreen(cam, blockedRects) {
  const worldPos = _latLonToVec3(cam.lat, cam.lon, MARKER_ALTITUDE).applyMatrix4(globeGroup.matrixWorld);
  if (!_isVisible(worldPos)) return null;
  const screen = _project(worldPos);
  if (!screen) return null;

  const m = 30;
  if (screen.x < -m || screen.x > window.innerWidth + m) return null;
  if (screen.y < -m || screen.y > window.innerHeight + m) return null;
  if (_isBlockedByUi(screen, blockedRects)) return null;
  return screen;
}

function _ensureOverlayNode(cam) {
  const existing = _overlayNodes.get(cam.id);
  if (existing) return existing;

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    left: "0",
    top: "0",
    transform: "translate3d(-9999px, -9999px, 0)",
    pointerEvents: "auto",
    cursor: "pointer",
    willChange: "transform",
  });

  const dot = document.createElement("div");
  const hasVisual = !!cam.stream || !!getCctvPreviewUrl(cam);
  Object.assign(dot.style, {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: hasVisual ? "rgba(0, 244, 224, 0.95)" : "rgba(130, 150, 170, 0.9)",
    boxShadow: hasVisual ? "0 0 7px rgba(0, 244, 224, 0.65)" : "0 0 5px rgba(128, 150, 170, 0.4)",
  });
  wrap.appendChild(dot);

  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "absolute",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.6)",
    color: "#d8e8ff",
    fontSize: "9px",
    fontFamily: "monospace",
    padding: "1px 5px",
    borderRadius: "4px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    textShadow: "0 0 3px rgba(0,0,0,0.8)",
  });
  label.textContent = cam.title;
  wrap.appendChild(label);

  wrap.addEventListener("mouseenter", () => {
    if (_pinnedCamId) return;
    const screen = _screenByCamId.get(cam.id);
    if (!screen) return;
    _showFeedCard(cam, screen, { pinned: false });
  });

  wrap.addEventListener("mouseleave", (ev) => {
    if (_pinnedCamId) return;
    if (_feedCard && ev.relatedTarget instanceof Node && _feedCard.contains(ev.relatedTarget)) return;
    _hideFeedCard();
  });

  wrap.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const screen = _screenByCamId.get(cam.id);
    if (!screen) return;
    _showFeedCard(cam, screen, { pinned: true });
  });

  _overlay.appendChild(wrap);
  const node = { wrap };
  _overlayNodes.set(cam.id, node);
  return node;
}

function _positionCardNearPoint(screen) {
  const gap = 22;
  const rect = _feedCard ? _feedCard.getBoundingClientRect() : { width: CARD_WIDTH_PX, height: PREVIEW_HEIGHT_PX + 130 };
  let x = screen.x + gap;
  if (x + rect.width > window.innerWidth - 10) x = screen.x - rect.width - gap;
  let y = screen.y - rect.height * 0.42;
  return { x, y };
}

function _setCardPosition(x, y) {
  if (!_feedCard) return;
  const rect = _feedCard.getBoundingClientRect();
  const min = 10;
  const maxX = Math.max(min, window.innerWidth - rect.width - min);
  const maxY = Math.max(min, window.innerHeight - rect.height - min);
  const clampedX = THREE.MathUtils.clamp(x, min, maxX);
  const clampedY = THREE.MathUtils.clamp(y, min, maxY);
  _feedCard.style.left = `${clampedX}px`;
  _feedCard.style.top = `${clampedY}px`;
  _updateCardConnector();
}

function _updateCardConnector() {
  if (!_connectorLine || !_connectorDot) return;
  if (!_feedCard || !_cardCamId) {
    _hideConnector();
    return;
  }

  const screen = _screenByCamId.get(_cardCamId);
  if (!screen) {
    _hideConnector();
    return;
  }

  const rect = _feedCard.getBoundingClientRect();
  let anchorX;
  let anchorY;

  if (screen.x < rect.left) {
    anchorX = rect.left;
    anchorY = THREE.MathUtils.clamp(screen.y, rect.top + 12, rect.bottom - 12);
  } else if (screen.x > rect.right) {
    anchorX = rect.right;
    anchorY = THREE.MathUtils.clamp(screen.y, rect.top + 12, rect.bottom - 12);
  } else if (screen.y < rect.top) {
    anchorX = THREE.MathUtils.clamp(screen.x, rect.left + 12, rect.right - 12);
    anchorY = rect.top;
  } else if (screen.y > rect.bottom) {
    anchorX = THREE.MathUtils.clamp(screen.x, rect.left + 12, rect.right - 12);
    anchorY = rect.bottom;
  } else {
    const dL = Math.abs(screen.x - rect.left);
    const dR = Math.abs(screen.x - rect.right);
    const dT = Math.abs(screen.y - rect.top);
    const dB = Math.abs(screen.y - rect.bottom);
    const minD = Math.min(dL, dR, dT, dB);
    if (minD === dL) { anchorX = rect.left; anchorY = screen.y; }
    else if (minD === dR) { anchorX = rect.right; anchorY = screen.y; }
    else if (minD === dT) { anchorX = screen.x; anchorY = rect.top; }
    else { anchorX = screen.x; anchorY = rect.bottom; }
    anchorY = THREE.MathUtils.clamp(anchorY, rect.top + 10, rect.bottom - 10);
    anchorX = THREE.MathUtils.clamp(anchorX, rect.left + 10, rect.right - 10);
  }

  _connectorLine.setAttribute("x1", `${screen.x}`);
  _connectorLine.setAttribute("y1", `${screen.y}`);
  _connectorLine.setAttribute("x2", `${anchorX}`);
  _connectorLine.setAttribute("y2", `${anchorY}`);
  _connectorLine.style.display = "block";

  _connectorDot.setAttribute("cx", `${screen.x}`);
  _connectorDot.setAttribute("cy", `${screen.y}`);
  _connectorDot.style.display = "block";
}

function _updateOverlayFeeds() {
  if (!_overlay || !_active) return;

  const blockedRects = _getUiBlockingRects();
  _screenByCamId.clear();
  const visibleIds = new Set();

  const MAX_VISIBLE = Math.min(MAX_VISIBLE_OVERLAY, _cameras.length);
  let shown = 0;

  for (let i = 0; i < _cameras.length && shown < MAX_VISIBLE; i++) {
    const cam = _cameras[i];
    const screen = _computeCameraScreen(cam, blockedRects);
    if (!screen) continue;

    _screenByCamId.set(cam.id, screen);
    const node = _ensureOverlayNode(cam);
    node.wrap.style.display = "block";
    node.wrap.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`;
    visibleIds.add(cam.id);
    shown++;
  }

  for (const [id, node] of _overlayNodes.entries()) {
    if (!visibleIds.has(id)) node.wrap.style.display = "none";
  }

  if (_feedCard && _cardCamId && !_feedCardPinned) {
    const current = _screenByCamId.get(_cardCamId);
    if (!current) _hideFeedCard();
    else {
      const pos = _positionCardNearPoint(current);
      _setCardPosition(pos.x, pos.y);
    }
  }

  _updateCardConnector();
}

// ── Feed card ─────────────────────────────────────────────────────────────────

let _feedCard = null;
let _feedCardPinned = false;
let _cardCamId = null;
let _cardRefreshTimer = null;
let _cardLiveBootTimer = null;
let _connectorSvg = null;
let _connectorLine = null;
let _connectorDot = null;
let _cardDragMoveHandler = null;
let _cardDragUpHandler = null;
let _cardDragOffX = 0;
let _cardDragOffY = 0;

function _clearCardDragHandlers() {
  if (_cardDragMoveHandler) window.removeEventListener("mousemove", _cardDragMoveHandler);
  if (_cardDragUpHandler) window.removeEventListener("mouseup", _cardDragUpHandler);
  _cardDragMoveHandler = null;
  _cardDragUpHandler = null;
}

function _enablePinnedCardDrag(handle) {
  if (!_feedCardPinned || !_feedCard) return;
  handle.style.cursor = "grab";
  handle.addEventListener("mousedown", (ev) => {
    if (!_feedCard || ev.button !== 0) return;
    if (ev.target instanceof HTMLElement && ev.target.closest("button,a,input,textarea,select")) return;

    const rect = _feedCard.getBoundingClientRect();
    _cardDragOffX = ev.clientX - rect.left;
    _cardDragOffY = ev.clientY - rect.top;

    handle.style.cursor = "grabbing";
    _clearCardDragHandlers();
    _cardDragMoveHandler = (moveEv) => {
      _setCardPosition(moveEv.clientX - _cardDragOffX, moveEv.clientY - _cardDragOffY);
    };
    _cardDragUpHandler = () => {
      handle.style.cursor = "grab";
      _clearCardDragHandlers();
    };

    window.addEventListener("mousemove", _cardDragMoveHandler);
    window.addEventListener("mouseup", _cardDragUpHandler);
    ev.preventDefault();
  });
}

function _showFeedCard(cam, screenPos, { pinned = false } = {}) {
  _hideFeedCard();
  _feedCardPinned = !!pinned;
  _pinnedCamId = _feedCardPinned ? cam.id : null;
  _cardCamId = cam.id;

  _feedCard = document.createElement("div");
  Object.assign(_feedCard.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${CARD_WIDTH_PX}px`,
    maxWidth: "calc(100vw - 24px)",
    background: "rgba(4, 10, 24, 0.95)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(0, 255, 200, 0.35)",
    borderRadius: "12px",
    padding: "12px",
    zIndex: "30",
    fontFamily: "monospace",
    color: "#aee",
    fontSize: "11px",
    pointerEvents: "auto",
    boxShadow: "0 8px 28px rgba(0,0,0,0.62)",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
    userSelect: "none",
  });

  const title = document.createElement("div");
  title.textContent = cam.title;
  Object.assign(title.style, {
    fontWeight: "700",
    color: "#eef",
    fontSize: "12px",
    lineHeight: "1.35",
    flex: "1",
  });
  header.appendChild(title);

  if (_feedCardPinned) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      width: "24px",
      height: "24px",
      border: "none",
      borderRadius: "6px",
      background: "rgba(0,0,0,0.45)",
      color: "#d8e7ff",
      fontSize: "18px",
      lineHeight: "20px",
      cursor: "pointer",
      padding: "0",
      flexShrink: "0",
    });
    closeBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      _hideFeedCard();
    });
    header.appendChild(closeBtn);
  }

  _feedCard.appendChild(header);
  _enablePinnedCardDrag(header);

  const thumbUrl = getCctvPreviewUrl(cam);
  const streamUrl = _toHttps(cam.stream);

  if (thumbUrl || streamUrl) {
    const mediaWrap = document.createElement("div");
    Object.assign(mediaWrap.style, {
      position: "relative",
      marginBottom: "10px",
      height: `${PREVIEW_HEIGHT_PX}px`,
      borderRadius: "8px",
      overflow: "hidden",
      background: "rgba(7, 14, 32, 0.94)",
      border: "1px solid rgba(110, 180, 255, 0.18)",
    });
    _feedCard.appendChild(mediaWrap);

    const liveWrap = document.createElement("div");
    Object.assign(liveWrap.style, {
      position: "absolute",
      inset: "0",
      display: "none",
      background: "#061021",
    });
    mediaWrap.appendChild(liveWrap);

    const img = document.createElement("img");
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "none",
      background: "#061021",
    });
    mediaWrap.appendChild(img);

    const noPreview = document.createElement("div");
    noPreview.textContent = "Immagine non disponibile";
    Object.assign(noPreview.style, {
      display: "none",
      color: "#5f739b",
      textAlign: "center",
      fontSize: "10px",
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      inset: "0",
      padding: "0 12px",
    });
    mediaWrap.appendChild(noPreview);

    const liveBadge = document.createElement("div");
    Object.assign(liveBadge.style, {
      position: "absolute",
      top: "8px",
      left: "10px",
      color: "#0f0",
      fontSize: "9px",
      fontWeight: "700",
      background: "rgba(0,0,0,0.58)",
      padding: "2px 7px",
      borderRadius: "4px",
      zIndex: "2",
      pointerEvents: "none",
    });
    mediaWrap.appendChild(liveBadge);

    const countdown = document.createElement("div");
    Object.assign(countdown.style, {
      position: "absolute",
      bottom: "7px",
      right: "9px",
      fontSize: "8px",
      color: "rgba(255,255,255,0.58)",
      background: "rgba(0,0,0,0.42)",
      padding: "1px 5px",
      borderRadius: "3px",
      zIndex: "2",
      display: "none",
      pointerEvents: "none",
    });
    mediaWrap.appendChild(countdown);

    const setLiveBadge = () => {
      liveBadge.textContent = "⬤ LIVE";
      liveBadge.style.color = "#0f0";
    };
    const setPreviewBadge = (stepIndex, seconds) => {
      if (stepIndex === 0) {
        liveBadge.textContent = `⬤ LIVE SNAP ${seconds}s`;
        liveBadge.style.color = "#8dffe1";
        return;
      }
      liveBadge.textContent = `⬤ FALLBACK ${seconds}s`;
      liveBadge.style.color = "#ffd166";
    };

    const startPreview = (startStepIndex = 0) => {
      liveWrap.style.display = "none";
      liveWrap.replaceChildren();
      if (_cardRefreshTimer) { clearInterval(_cardRefreshTimer); _cardRefreshTimer = null; }

      if (!thumbUrl) {
        setPreviewBadge(PREVIEW_REFRESH_STEPS_SEC.length - 1, PREVIEW_REFRESH_STEPS_SEC[PREVIEW_REFRESH_STEPS_SEC.length - 1]);
        countdown.style.display = "none";
        img.style.display = "none";
        noPreview.style.display = "flex";
        return;
      }

      let stepIndex = Math.max(0, Math.min(startStepIndex, PREVIEW_REFRESH_STEPS_SEC.length - 1));
      let refreshEvery = PREVIEW_REFRESH_STEPS_SEC[stepIndex];
      let remaining = refreshEvery;
      let probeInFlight = false;

      const nextThumbUrl = () => thumbUrl + (thumbUrl.includes("?") ? "&" : "?") + `t=${Date.now()}`;
      const requestFrame = () => {
        if (probeInFlight) return;
        probeInFlight = true;
        const candidate = nextThumbUrl();
        const probe = new Image();
        probe.onload = () => {
          probeInFlight = false;
          img.src = candidate;
          img.style.display = "block";
          noPreview.style.display = "none";
        };
        probe.onerror = () => {
          probeInFlight = false;
          if (stepIndex < PREVIEW_REFRESH_STEPS_SEC.length - 1) {
            stepIndex++;
            refreshEvery = PREVIEW_REFRESH_STEPS_SEC[stepIndex];
          }
          setPreviewBadge(stepIndex, refreshEvery);
          if (!img.src) {
            img.style.display = "none";
            noPreview.style.display = "flex";
          }
          remaining = refreshEvery;
        };
        probe.src = candidate;
      };

      setPreviewBadge(stepIndex, refreshEvery);
      countdown.style.display = "block";
      requestFrame();

      const tick = () => {
        countdown.textContent = `aggiorna in ${remaining}s`;
        remaining--;
        if (remaining < 0) {
          requestFrame();
          remaining = refreshEvery;
        }
      };
      tick();
      _cardRefreshTimer = setInterval(tick, 1000);
    };

    const startLiveAttempt = () => {
      if (!streamUrl || _isLikelyHlsUrl(streamUrl)) {
        startPreview(0);
        return;
      }

      const directVideo = _isDirectVideoUrl(streamUrl);
      const embeddable = directVideo ? null : _toEmbeddableStream(streamUrl);
      if (!directVideo && !embeddable) {
        startPreview(0);
        return;
      }

      countdown.style.display = "none";
      noPreview.style.display = "none";
      img.style.display = "none";
      liveWrap.style.display = "block";
      liveWrap.replaceChildren();
      setLiveBadge();

      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        if (_cardLiveBootTimer) { clearTimeout(_cardLiveBootTimer); _cardLiveBootTimer = null; }
        setLiveBadge();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        if (_cardLiveBootTimer) { clearTimeout(_cardLiveBootTimer); _cardLiveBootTimer = null; }
        startPreview(0);
      };

      let el;
      if (directVideo) {
        const video = document.createElement("video");
        video.src = streamUrl;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.controls = false;
        video.loop = true;
        Object.assign(video.style, {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        });
        video.addEventListener("playing", succeed, { once: true });
        video.addEventListener("loadeddata", succeed, { once: true });
        video.addEventListener("error", fail, { once: true });
        video.addEventListener("stalled", fail, { once: true });
        void video.play().catch(() => fail());
        el = video;
      } else {
        const frame = document.createElement("iframe");
        frame.src = embeddable;
        frame.loading = "eager";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allow = "autoplay; fullscreen; picture-in-picture";
        Object.assign(frame.style, {
          width: "100%",
          height: "100%",
          border: "0",
          display: "block",
          background: "#061021",
        });
        frame.addEventListener("load", succeed, { once: true });
        frame.addEventListener("error", fail, { once: true });
        el = frame;
      }

      liveWrap.appendChild(el);
      _cardLiveBootTimer = setTimeout(fail, LIVE_BOOT_TIMEOUT_MS);
    };

    startLiveAttempt();

    if (streamUrl) {
      const openLive = document.createElement("a");
      openLive.href = streamUrl;
      openLive.target = "_blank";
      openLive.rel = "noopener noreferrer";
      openLive.textContent = "Apri live esterna";
      Object.assign(openLive.style, {
        display: "inline-block",
        marginBottom: "8px",
        color: "#9bd8ff",
        fontSize: "10px",
        textDecoration: "none",
      });
      _feedCard.appendChild(openLive);
    }
  } else {
    const noThumb = document.createElement("div");
    noThumb.textContent = "Nessuna anteprima disponibile";
    Object.assign(noThumb.style, {
      color: "#5f739b",
      textAlign: "center",
      fontSize: "10px",
      height: `${PREVIEW_HEIGHT_PX}px`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      marginBottom: "10px",
      border: "1px dashed rgba(110, 180, 255, 0.24)",
      background: "rgba(6, 16, 34, 0.82)",
    });
    _feedCard.appendChild(noThumb);
  }

  const coords = document.createElement("div");
  coords.textContent = `${cam.lat.toFixed(4)}°, ${cam.lon.toFixed(4)}°`;
  Object.assign(coords.style, { color: "#5f739b", fontSize: "10px", marginTop: "4px" });
  _feedCard.appendChild(coords);

  document.body.appendChild(_feedCard);
  const pos = _positionCardNearPoint(screenPos);
  _setCardPosition(pos.x, pos.y);
  _updateCardConnector();
}

function _hideFeedCard() {
  if (_cardRefreshTimer) { clearInterval(_cardRefreshTimer); _cardRefreshTimer = null; }
  if (_cardLiveBootTimer) { clearTimeout(_cardLiveBootTimer); _cardLiveBootTimer = null; }
  _clearCardDragHandlers();
  if (_feedCard) { _feedCard.remove(); _feedCard = null; }
  _feedCardPinned = false;
  _pinnedCamId = null;
  _cardCamId = null;
  _hideConnector();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enableCctv() {
  _active = true;
  _buildOverlay();
  const data = await _fetchCameras();
  _cameras = data;
  _buildMarkers();
  _updateOverlayFeeds();
}

export function disableCctv() {
  _active = false;
  if (_mesh) {
    globeGroup.remove(_mesh);
    _mesh.geometry.dispose();
    _mesh.material.dispose();
    _mesh = null;
  }
  if (_overlay) { _overlay.remove(); _overlay = null; }
  _overlayNodes.clear();
  _screenByCamId.clear();
  _removeConnectorLayer();
  _hideFeedCard();
  _cameras = [];
}

/** Re-fetch cameras; keeps existing entries whose ID has no match in new data (partial merge). */
export async function refreshCctv() {
  if (!_active) return;
  const fresh = await _fetchCameras();
  if (!fresh || fresh.length === 0) return;
  const freshIds = new Set(fresh.map(c => c.id));
  // Merge: add/replace by id, keep orphaned old entries
  const oldOrphans = _cameras.filter(c => !freshIds.has(c.id));
  _cameras = [...fresh, ...oldOrphans];
  _buildMarkers();
  _updateOverlayFeeds();
}

export function getCctvMesh()               { return _mesh; }
export function getCctvData(instanceId)     { return _cameras[instanceId] ?? null; }
export function getCctvCount()              { return _cameras.length; }

export function updateCctv() {
  if (!_active || !_overlay) return;
  _updateOverlayFeeds();
}
