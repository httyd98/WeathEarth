/**
 * OSM Tile Layer
 *
 * When zoomed close to the surface, loads OpenStreetMap tiles for the visible
 * area and renders them on a partial sphere segment above the globe.
 * The layer is fully opaque, hiding the earth texture underneath.
 *
 * Features:
 * - Raycast center to find lat/lon under camera
 * - Adaptive zoom: picks OSM zoom level so 8x8 grid fills the visible area
 * - Partial sphere geometry covering only the tile area
 * - Smooth fade in/out with hysteresis
 * - LRU memory cache (96 tiles)
 * - IndexedDB tile cache with 7-day TTL
 * - Max 4 concurrent fetches via shared limiter
 */

import * as THREE from "three";
import { globeGroup, camera, raycaster, earth, earthMaterial, nightLights } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { saveTileBlob, loadTileBlob } from "../weather/cacheDB.js";
import { createFetchLimiter } from "../utils/fetchLimiter.js";

const OSM_LAYER_RADIUS = GLOBE_RADIUS * 1.0003;
const ENTER_DISTANCE = 5.2;   // start fading in earlier for smooth transition
const EXIT_DISTANCE  = 5.5;
const SURFACE_STOP   = 4.36;  // matches controls.minDistance — camera stops here
const TILE_SIZE = 256;
const GRID_SIZE = 8;
const CANVAS_SIZE = GRID_SIZE * TILE_SIZE; // 2048px
const FADE_SPEED = 2.5; // opacity per second
const DATA_ZOOM_MAX = 5;  // extra zoom levels on top of camera-based zoom

const _limiter = createFetchLimiter(4);

// LRU cache for tile images
const _tileCache = new Map();
const MAX_CACHE_TILES = 256;

// State
let _mesh = null;
let _canvas = null;
let _ctx = null;
let _texture = null;
let _opacity = 0;
let _active = false;
let _lastTileKey = "";
let _loading = false;
let _nightLightsWereVisible = false;
let _dataZoom = 0;          // extra zoom levels accumulated via scroll at surface
let _earthOpacityOrig = -1; // saved earthMaterial opacity for restore

function _lruGet(key) {
  if (!_tileCache.has(key)) return null;
  const val = _tileCache.get(key);
  _tileCache.delete(key);
  _tileCache.set(key, val);
  return val;
}

function _lruSet(key, val) {
  if (_tileCache.size >= MAX_CACHE_TILES) {
    const oldest = _tileCache.keys().next().value;
    _tileCache.delete(oldest);
  }
  _tileCache.set(key, val);
}

function _lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function _latToTileY(lat, z) {
  const latRad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, z));
}

function _tileXToLon(x, z) {
  return x / Math.pow(2, z) * 360 - 180;
}

function _tileYToLat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Pick OSM zoom so that GRID_SIZE tiles span roughly the visible globe area.
 * Visible span (degrees) decreases as camera gets closer.
 */
function _camDistToZoom(dist) {
  // dist=5.2 → z9, dist=4.8 → z12, dist=4.5 → z15, dist=4.36 → z17
  const aboveSurface = Math.max(0.005, dist - GLOBE_RADIUS);
  const z = Math.round(10 + (Math.log(0.6) - Math.log(aboveSurface)) / Math.log(0.6 / 0.01) * 9);
  return THREE.MathUtils.clamp(z, 8, 19);
}

/** Effective zoom = camera-based + data zoom bonus. */
function _effectiveZoom(dist) {
  return Math.min(19, _camDistToZoom(dist) + _dataZoom);
}

// ── Data zoom public API ──────────────────────────────────────────────────────

/** Add delta (+1/-1) to data zoom. Call from wheel handler when at surface. */
export function addDataZoom(delta) {
  _dataZoom = Math.max(0, Math.min(DATA_ZOOM_MAX, _dataZoom + delta));
  _lastTileKey = ""; // force tile reload at new zoom
}

/** Reset data zoom (called when camera leaves surface). */
export function resetDataZoom() {
  if (_dataZoom === 0) return;
  _dataZoom = 0;
  _lastTileKey = "";
}

/** Current data zoom level (0 = none). */
export function getDataZoom() { return _dataZoom; }

async function _fetchTile(z, x, y) {
  const key = `osm/${z}/${x}/${y}`;

  const cached = _lruGet(key);
  if (cached) return cached;

  const idbBlob = await loadTileBlob(key);
  if (idbBlob) {
    const img = await createImageBitmap(idbBlob);
    _lruSet(key, img);
    return img;
  }

  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const resp = await _limiter.fetch(url);
  if (!resp.ok) return null;
  const blob = await resp.blob();

  saveTileBlob(key, blob, 7 * 24 * 60 * 60 * 1000);

  const img = await createImageBitmap(blob);
  _lruSet(key, img);
  return img;
}

function _getCenterLatLon() {
  const centerNDC = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(centerNDC, camera);
  const hits = raycaster.intersectObject(earth);
  if (hits.length === 0) return null;

  const localPt = globeGroup.worldToLocal(hits[0].point.clone());
  const r = localPt.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(localPt.y / r));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(-localPt.z, localPt.x));
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

function _ensureMesh() {
  if (_mesh) return;

  _canvas = document.createElement("canvas");
  _canvas.width = CANVAS_SIZE;
  _canvas.height = CANVAS_SIZE;
  _ctx = _canvas.getContext("2d");

  _texture = new THREE.CanvasTexture(_canvas);
  _texture.colorSpace = THREE.SRGBColorSpace;
  _texture.minFilter = THREE.LinearFilter;
  _texture.magFilter = THREE.LinearFilter;

  const geo = new THREE.SphereGeometry(OSM_LAYER_RADIUS, 64, 64);

  const mat = new THREE.MeshBasicMaterial({
    map: _texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  _mesh = new THREE.Mesh(geo, mat);
  _mesh.renderOrder = 1.5;
  _mesh.visible = false;
  globeGroup.add(_mesh);
}

function _buildPartialGeometry(lonMin, lonMax, latMin, latMax) {
  const phiStart = THREE.MathUtils.degToRad(90 - latMax);
  const phiLength = THREE.MathUtils.degToRad(latMax - latMin);
  const thetaStart = THREE.MathUtils.degToRad(lonMin + 180);
  const thetaLength = THREE.MathUtils.degToRad(lonMax - lonMin);

  const geo = new THREE.SphereGeometry(
    OSM_LAYER_RADIUS, 48, 48,
    thetaStart, thetaLength,
    phiStart, phiLength
  );

  if (_mesh.geometry) _mesh.geometry.dispose();
  _mesh.geometry = geo;
}

async function _loadVisibleTiles(centerLat, centerLon, zoom, dataZoomSnapshot) {
  const cx = _lonToTileX(centerLon, zoom);
  const cy = _latToTileY(centerLat, zoom);
  const half = Math.floor(GRID_SIZE / 2);
  const maxTile = Math.pow(2, zoom) - 1;

  const startX = cx - half;
  const startY = Math.max(0, cy - half);
  const endY = Math.min(maxTile, cy + half - 1);

  const lonMin = _tileXToLon(startX, zoom);
  const lonMax = _tileXToLon(startX + GRID_SIZE, zoom);
  const latMax = _tileYToLat(startY, zoom);
  const latMin = _tileYToLat(endY + 1, zoom);

  const tileKey = `${zoom}/${startX}/${startY}/${dataZoomSnapshot}`;
  if (tileKey === _lastTileKey) return;
  _lastTileKey = tileKey;

  _buildPartialGeometry(lonMin, lonMax, latMin, latMax);

  _ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const tasks = [];
  for (let dy = 0; dy < GRID_SIZE; dy++) {
    const ty = startY + dy;
    if (ty < 0 || ty > maxTile) continue;
    for (let dx = 0; dx < GRID_SIZE; dx++) {
      let tx = startX + dx;
      if (tx < 0) tx += maxTile + 1;
      if (tx > maxTile) tx -= maxTile + 1;
      tasks.push({ dx, dy, z: zoom, x: tx, y: ty });
    }
  }

  await Promise.all(tasks.map(async (task) => {
    try {
      const img = await _fetchTile(task.z, task.x, task.y);
      if (img) {
        _ctx.drawImage(img, task.dx * TILE_SIZE, task.dy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        _texture.needsUpdate = true;
      }
    } catch { /* skip failed tile */ }
  }));
}

/**
 * Call every frame from the animate loop.
 */
export function updateOSMTileLayer(dt) {
  const camDist = camera.position.distanceTo(globeGroup.position);

  // Activate / deactivate OSM zone
  if (camDist < ENTER_DISTANCE && !_active) {
    _active = true;
    _ensureMesh();
    _mesh.visible = true;
    if (nightLights) {
      _nightLightsWereVisible = nightLights.visible;
      nightLights.visible = false;
    }
    // Enable earth transparency for smooth crossfade
    if (earthMaterial) earthMaterial.transparent = true;
  } else if (camDist > EXIT_DISTANCE && _active) {
    _active = false;
    _lastTileKey = "";
    resetDataZoom();
    if (nightLights && _nightLightsWereVisible) {
      nightLights.visible = true;
    }
  }

  if (!_mesh) return;

  // OSM opacity: fades in as camera approaches
  const targetOpacity = _active ? 0.97 : 0;
  if (Math.abs(_opacity - targetOpacity) > 0.001) {
    _opacity += (targetOpacity > _opacity ? 1 : -1) * FADE_SPEED * dt;
    _opacity = THREE.MathUtils.clamp(_opacity, 0, 0.97);
    _mesh.material.opacity = _opacity;
  }

  // Earth crossfade: tied to OSM opacity so transitions are always smooth
  if (earthMaterial) {
    if (_opacity > 0) {
      earthMaterial.transparent = true;
      // Earth fades out as OSM fades in
      earthMaterial.opacity = Math.max(0.04, 1.0 - _opacity);
    } else {
      // Fully restored when OSM is gone
      earthMaterial.opacity = 1.0;
      earthMaterial.transparent = false;
    }
  }

  if (_opacity <= 0 && !_active) {
    _mesh.visible = false;
    return;
  }

  // When camera leaves surface zone, reset data zoom
  if (_active && camDist > SURFACE_STOP + 0.15 && _dataZoom > 0) {
    resetDataZoom();
  }

  // Load tiles — guard against concurrent loads
  if (_active && !_loading) {
    const center = _getCenterLatLon();
    if (center) {
      const zoom = _effectiveZoom(camDist);
      const dz = _dataZoom;
      _loading = true;
      _loadVisibleTiles(center.lat, center.lon, zoom, dz).finally(() => {
        _loading = false;
      });
    }
  }
}

/** Returns current effective zoom for status display. */
export function getOSMZoom() {
  const camDist = camera.position.distanceTo(globeGroup.position);
  return _effectiveZoom(camDist);
}

/**
 * Dispose all resources.
 */
export function disposeOSMTileLayer() {
  if (_mesh) {
    _mesh.geometry?.dispose();
    _mesh.material?.dispose();
    _texture?.dispose();
    globeGroup.remove(_mesh);
    _mesh = null;
  }
  _tileCache.clear();
}
