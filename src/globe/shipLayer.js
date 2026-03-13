/**
 * Ship Layer — Simulated global shipping traffic
 *
 * Ships move along hardcoded real-world shipping lane waypoints.
 * No external API or key required.
 *
 * Features:
 * - Ship icon (canvas texture, billboard toward camera)
 * - Color by vessel type: cargo=blue, tanker=orange, passenger=green
 * - Click a ship to see its full lane route
 * - Dual-mesh: hit sphere (invisible) + visual plane (icon)
 */

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { scene, globeGroup, camera } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

const MAX_SHIPS = 2000;
const ICON_W = 0.04;
const ICON_H = 0.06;
const SHIP_ALT_OFFSET = GLOBE_RADIUS * 1.002;

const KM_PER_GLOBE_UNIT = 6371 / GLOBE_RADIUS;
const KMH_PER_KNOT = 1.852;

let _meshHit = null;
let _meshVisual = null;
let _routeLine = null;
let _visible = false;
let _ships = [];
let _visibleToDataIndex = [];
let _initialized = false;
let _selectedShipIndex = -1;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Reusable vectors for COG orientation
const _nrm        = new THREE.Vector3();
const _worldNorth = new THREE.Vector3(0, 1, 0);
const _northTgt   = new THREE.Vector3();
const _headingDir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Global shipping lanes — [lat, lon] waypoints
// ---------------------------------------------------------------------------

const SHIPPING_LANES = [
  // ── Atlantic ─────────────────────────────────────────────────────────────
  { name: "N Atlantic W→E",  type: "cargo",
    wpts: [[40.7,-74],[41,-65],[43,-50],[48,-35],[50,-20],[51.5,2],[51.9,4.5]] },
  { name: "N Atlantic E→W",  type: "cargo",
    wpts: [[51.9,4.5],[51.5,2],[50,-20],[48,-35],[43,-50],[41,-65],[40.7,-74]] },
  { name: "S Atlantic N→E",  type: "cargo",
    wpts: [[-23.5,-46.6],[-15,-35],[-5,-30],[5,-25],[15,-25],[28,-15],[36.1,-5.3]] },
  { name: "S Atlantic E→W",  type: "cargo",
    wpts: [[36.1,-5.3],[28,-15],[15,-25],[5,-25],[-5,-30],[-15,-35],[-23.5,-46.6]] },

  // ── Mediterranean / Suez ─────────────────────────────────────────────────
  { name: "Suez W→E",  type: "tanker",
    wpts: [[36.1,-5.3],[37,3],[35,12],[33,25],[31.5,32.3],[28,33.5],[22,37],[15,43],[12,45],[11,51],[6,47],[0,47]] },
  { name: "Suez E→W",  type: "tanker",
    wpts: [[0,47],[6,47],[11,51],[12,45],[15,43],[22,37],[28,33.5],[31.5,32.3],[33,25],[35,12],[37,3],[36.1,-5.3]] },
  { name: "Mediterranean",  type: "cargo",
    wpts: [[36.1,-5.3],[37,3],[38,12],[37,15],[35,23],[33,27],[31.5,32.3]] },
  { name: "Mediterranean return", type: "cargo",
    wpts: [[31.5,32.3],[33,27],[35,23],[37,15],[38,12],[37,3],[36.1,-5.3]] },
  { name: "W Mediterranean", type: "cargo",
    wpts: [[36.1,-5.3],[37,3],[43,5],[44,8.9],[37.5,15],[36,15]] },

  // ── Cape of Good Hope ────────────────────────────────────────────────────
  { name: "Cape W→E",  type: "cargo",
    wpts: [[51.9,4.5],[40,-12],[20,-20],[0,-10],[-15,5],[-34.4,18.5],[-38,26],[-34,32],[-20,38],[0,47],[10,55],[22,60],[5.5,80],[1.3,103.8]] },
  { name: "Cape E→W",  type: "cargo",
    wpts: [[1.3,103.8],[5.5,80],[22,60],[10,55],[0,47],[-20,38],[-34,32],[-38,26],[-34.4,18.5],[-15,5],[0,-10],[20,-20],[40,-12],[51.9,4.5]] },
  { name: "Cape tanker W→E", type: "tanker",
    wpts: [[-33.8,151],[-35,130],[-38,80],[-38,50],[-34.4,18.5],[0,-10],[36.1,-5.3]] },

  // ── Pacific ───────────────────────────────────────────────────────────────
  { name: "Trans-Pacific E→W",  type: "cargo",
    wpts: [[33.7,-118.2],[35,-135],[38,-150],[40,-165],[38,-175],[35,165],[33,145],[35.6,139.7]] },
  { name: "Trans-Pacific W→E",  type: "cargo",
    wpts: [[35.6,139.7],[33,145],[35,165],[38,-175],[40,-165],[38,-150],[35,-135],[33.7,-118.2]] },
  { name: "Japan-US containers", type: "cargo",
    wpts: [[34.6,135.4],[33,138],[35,148],[38,160],[40,170],[41,-175],[40,-165],[37.8,-122]] },
  { name: "US-Japan containers", type: "cargo",
    wpts: [[37.8,-122],[40,-165],[41,-175],[40,170],[38,160],[35,148],[33,138],[34.6,135.4]] },
  { name: "US West Coast",  type: "cargo",
    wpts: [[33.7,-118.2],[37.8,-122],[47.6,-122],[49.3,-123]] },
  { name: "US West Coast S", type: "cargo",
    wpts: [[49.3,-123],[47.6,-122],[37.8,-122],[33.7,-118.2]] },
  { name: "Pacific S→N", type: "tanker",
    wpts: [[-33.8,151],[-20,170],[-10,-175],[10,-140],[22,-158],[20,-157],[21,157],[37.8,-122]] },

  // ── Malacca / Indian Ocean ────────────────────────────────────────────────
  { name: "Malacca W→E",  type: "tanker",
    wpts: [[0,47],[5.5,80],[6,80],[3,100],[1.3,103.8],[1,105],[5,110],[10,115],[22.3,114]] },
  { name: "Malacca E→W",  type: "tanker",
    wpts: [[22.3,114],[10,115],[5,110],[1,105],[1.3,103.8],[3,100],[6,80],[5.5,80],[0,47]] },
  { name: "Indian Ocean cross", type: "cargo",
    wpts: [[-33.8,151],[0,110],[5.5,80],[-20,57],[-20,44],[-10,40]] },

  // ── Persian Gulf ──────────────────────────────────────────────────────────
  { name: "Persian Gulf",  type: "tanker",
    wpts: [[26,56],[24,57],[22,58],[20,60],[15,52],[12,45],[11,51]] },
  { name: "Persian Gulf return",  type: "tanker",
    wpts: [[11,51],[12,45],[15,52],[20,60],[22,58],[24,57],[26,56]] },
  { name: "Persian Gulf short", type: "tanker",
    wpts: [[26,56],[25,56.5],[24,57],[23,58],[26.5,56.5]] },

  // ── N Sea / English Channel ───────────────────────────────────────────────
  { name: "North Sea",  type: "cargo",
    wpts: [[51.5,1.3],[52,4],[53,5],[54,6],[55,7],[57,10]] },
  { name: "North Sea return",  type: "cargo",
    wpts: [[57,10],[55,7],[54,6],[53,5],[52,4],[51.5,1.3]] },
  { name: "Baltic",  type: "cargo",
    wpts: [[57,10],[57,12],[57,18],[59,18],[60,24],[60,25]] },
  { name: "Baltic return", type: "cargo",
    wpts: [[60,25],[60,24],[59,18],[57,18],[57,12],[57,10]] },

  // ── Caribbean / Gulf of Mexico ────────────────────────────────────────────
  { name: "Caribbean",  type: "tanker",
    wpts: [[29.7,-95],[25,-90],[22,-85],[20,-80],[18,-75],[15,-70],[13,-60]] },
  { name: "Caribbean return",  type: "tanker",
    wpts: [[13,-60],[15,-70],[18,-75],[20,-80],[22,-85],[25,-90],[29.7,-95]] },
  { name: "Caribbean-Atlantic", type: "cargo",
    wpts: [[13,-60],[15,-50],[20,-40],[25,-35],[35,-25],[43,-50],[40.7,-74]] },

  // ── China coast ───────────────────────────────────────────────────────────
  { name: "China coast N",  type: "cargo",
    wpts: [[22.3,114],[25,121],[31,122],[36,120],[39,121]] },
  { name: "China coast S",  type: "cargo",
    wpts: [[39,121],[36,120],[31,122],[25,121],[22.3,114]] },
  { name: "Taiwan Strait", type: "cargo",
    wpts: [[22.3,114],[23,117],[25,121],[22.3,114]] },

  // ── Australia ─────────────────────────────────────────────────────────────
  { name: "Australia→Asia",  type: "cargo",
    wpts: [[-33.8,151],[-20,150],[-10,142],[-5,135],[0,120],[1.3,103.8]] },
  { name: "Asia→Australia",  type: "cargo",
    wpts: [[1.3,103.8],[0,120],[-5,135],[-10,142],[-20,150],[-33.8,151]] },
  { name: "Australia→Europe",  type: "cargo",
    wpts: [[-33.8,151],[-35,130],[-36,110],[-38,80],[-38,50],[-34.4,18.5],[-20,8],[0,-5],[20,-20],[40,-12],[51.9,4.5]] },
  { name: "Australia coast N", type: "cargo",
    wpts: [[-33.8,151],[-27,153],[-23,150],[-17,146],[-12,136]] },

  // ── East Africa / Red Sea ─────────────────────────────────────────────────
  { name: "East Africa",  type: "tanker",
    wpts: [[-10,40],[-5,40],[0,41],[5,42],[11,51],[12,45]] },
  { name: "East Africa return", type: "tanker",
    wpts: [[12,45],[11,51],[5,42],[0,41],[-5,40],[-10,40]] },

  // ── South America coast ───────────────────────────────────────────────────
  { name: "S America W coast", type: "cargo",
    wpts: [[-33.5,-70.7],[-23,-43],[-10,-76],[-1,-80],[4,-77]] },
  { name: "Brazil→Europe", type: "cargo",
    wpts: [[-23.5,-46.6],[-15,-35],[0,-25],[15,-20],[28,-15],[36.1,-5.3]] },
];

// ---------------------------------------------------------------------------
// Ship type metadata
// ---------------------------------------------------------------------------

const FLAG_EMOJIS = ["🇵🇦","🇱🇷","🇲🇭","🇧🇸","🇨🇾","🇨🇳","🇬🇷","🇸🇬","🇮🇹","🇬🇧","🇩🇪","🇳🇴","🇩🇰","🇯🇵","🇰🇷","🇺🇸"];

const LANE_META = {
  cargo: {
    aisTypes: [70,71,72,74,79],
    names: ["MSC OSCAR","MAERSK ALBERTA","EVER GIVEN","CMA CGM JULES VERNE","HAPAG LLOYD BERLIN","ONE OLYMPUS","YANG MING WIND","MOL TRIUMPH","COSCO SHIPPING","GENEVA MAERSK","OOCL HONG KONG","MSC GÜLSÜN","MADRID MAERSK","EVER ACE","HMM ALGECIRAS"],
    speedKts: [14, 20],
  },
  tanker: {
    aisTypes: [80,81,82,84,89],
    names: ["PIONEER","ATLANTIC TITAN","ARABIAN SEA","GULF SPIRIT","OCEAN VENUS","PACIFIC GLORY","NORD SPIRIT","ADRIATIC SEA","STENA EMPIRE","TOVE KNUTSEN","MARIA ENERGY","DELTA NAVIGATOR","CRUDE CARRIER","ABQAIQ"],
    speedKts: [8, 14],
  },
  passenger: {
    aisTypes: [60,61,69],
    names: ["MSC SEASIDE","COSTA LUMINOSA","SYMPHONY OF THE SEAS","CARNIVAL BREEZE","PRINCESS DIAMOND","CELEBRITY EDGE","NORWEGIAN JOY"],
    speedKts: [18, 24],
  },
};

function _rand(min, max) { return min + Math.random() * (max - min); }

// ---------------------------------------------------------------------------
// Lane geometry helpers
// ---------------------------------------------------------------------------

function _segLenGlobeUnits(a, b) {
  const dlat = (b[0] - a[0]) * (GLOBE_RADIUS / 57.3);
  const midLat = THREE.MathUtils.degToRad((a[0] + b[0]) / 2);
  const dlon = (b[1] - a[1]) * (GLOBE_RADIUS / 57.3) * Math.cos(midLat);
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

function _bearing(a, b) {
  const dLon = THREE.MathUtils.degToRad(b[1] - a[1]);
  const lat1 = THREE.MathUtils.degToRad(a[0]);
  const lat2 = THREE.MathUtils.degToRad(b[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
}

function _posFromSegment(wpts, segIdx, segT) {
  const a = wpts[segIdx];
  const b = wpts[segIdx + 1];
  return {
    lat: a[0] + (b[0] - a[0]) * segT,
    lon: a[1] + (b[1] - a[1]) * segT,
    cog: _bearing(a, b),
  };
}

// ---------------------------------------------------------------------------
// Ship generation
// ---------------------------------------------------------------------------

function _generateShips() {
  const ships = [];
  let id = 1;

  for (const lane of SHIPPING_LANES) {
    const wpts = lane.wpts;
    if (wpts.length < 2) continue;

    let totalLen = 0;
    for (let i = 0; i < wpts.length - 1; i++) totalLen += _segLenGlobeUnits(wpts[i], wpts[i+1]);

    const meta = LANE_META[lane.type] ?? LANE_META.cargo;
    const count = Math.max(3, Math.round(totalLen * 14));

    for (let s = 0; s < count; s++) {
      if (ships.length >= MAX_SHIPS) break;

      const progress = Math.random();
      const totalSegs = wpts.length - 1;
      const scaled = progress * totalSegs;
      const segIdx = Math.min(Math.floor(scaled), totalSegs - 1);
      const segT = scaled - segIdx;

      const { lat, lon, cog } = _posFromSegment(wpts, segIdx, segT);
      const speed = _rand(meta.speedKts[0], meta.speedKts[1]);

      ships.push({
        id: id++,
        name: meta.names[Math.floor(Math.random() * meta.names.length)],
        flag: FLAG_EMOJIS[Math.floor(Math.random() * FLAG_EMOJIS.length)],
        lane,
        segIdx,
        segT,
        speed,
        shipType: meta.aisTypes[Math.floor(Math.random() * meta.aisTypes.length)],
        lat, lon, cog,
        sog: speed,
      });
    }

    if (ships.length >= MAX_SHIPS) break;
  }

  return ships;
}

// ---------------------------------------------------------------------------
// Advance ship positions
// ---------------------------------------------------------------------------

function _advanceShips(dt) {
  for (const ship of _ships) {
    const wpts = ship.lane.wpts;
    const totalSegs = wpts.length - 1;

    const speedGlobe = (ship.speed * KMH_PER_KNOT / 3600) / KM_PER_GLOBE_UNIT;
    const segLen = _segLenGlobeUnits(wpts[ship.segIdx], wpts[ship.segIdx + 1]);

    if (segLen > 0.0001) ship.segT += (speedGlobe * dt) / segLen;

    while (ship.segT >= 1) {
      ship.segT -= 1;
      ship.segIdx++;
      if (ship.segIdx >= totalSegs) { ship.segIdx = 0; ship.segT = 0; }
    }

    const { lat, lon, cog } = _posFromSegment(wpts, ship.segIdx, ship.segT);
    ship.lat = lat;
    ship.lon = lon;
    ship.cog = cog;
  }
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

function _latLonToWorld(lat, lon) {
  const r = SHIP_ALT_OFFSET;
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    -(r * sinPhi * Math.cos(theta)),
    r * Math.cos(phi),
    r * sinPhi * Math.sin(theta)
  );
}

// ---------------------------------------------------------------------------
// Ship icon texture (canvas, synchronous)
// ---------------------------------------------------------------------------

function _makeShipTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  // White ship silhouette: bow at top, wider at midship, narrow stern
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(cx, 3);               // bow tip
  ctx.lineTo(cx + 10, 22);         // bow starboard
  ctx.lineTo(cx + 13, 48);         // midship starboard
  ctx.lineTo(cx + 10, 58);         // stern starboard
  ctx.lineTo(cx - 10, 58);         // stern port
  ctx.lineTo(cx - 13, 48);         // midship port
  ctx.lineTo(cx - 10, 22);         // bow port
  ctx.closePath();
  ctx.fill();

  // Small superstructure rectangle
  ctx.fillRect(cx - 7, 24, 14, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Mesh creation / disposal
// ---------------------------------------------------------------------------

let _iconTexture = null;

function _createMeshes() {
  if (!_iconTexture) _iconTexture = _makeShipTexture();

  if (_meshHit) { scene.remove(_meshHit); _meshHit.geometry.dispose(); _meshHit.material.dispose(); }
  const hitGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  _meshHit = new THREE.InstancedMesh(hitGeo, hitMat, MAX_SHIPS);
  _meshHit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _meshHit.frustumCulled = false;
  scene.add(_meshHit);

  if (_meshVisual) { scene.remove(_meshVisual); _meshVisual.geometry.dispose(); _meshVisual.material.dispose(); }
  const visGeo = new THREE.PlaneGeometry(ICON_W, ICON_H);
  const visMat = new THREE.MeshBasicMaterial({
    map: _iconTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  _meshVisual = new THREE.InstancedMesh(visGeo, visMat, MAX_SHIPS);
  _meshVisual.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _meshVisual.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHIPS * 3), 3);
  _meshVisual.instanceColor.setUsage(THREE.DynamicDrawUsage);
  _meshVisual.frustumCulled = false;
  _meshVisual.visible = false;
  scene.add(_meshVisual);
}

function _shipColor(shipType) {
  const t = shipType ?? 0;
  if (t >= 60 && t <= 69) _color.setRGB(0.3, 1.5, 0.6);       // Passenger — bright green
  else if (t >= 70 && t <= 79) _color.setRGB(0.5, 0.8, 1.5);  // Cargo — bright blue
  else if (t >= 80 && t <= 89) _color.setRGB(1.5, 0.9, 0.3);  // Tanker — bright orange
  else _color.setRGB(1.2, 1.2, 1.2);                            // Other — bright white
}

// ---------------------------------------------------------------------------
// Route line
// ---------------------------------------------------------------------------

function _showRoute(shipIndex) {
  _disposeRoute();
  _selectedShipIndex = shipIndex;

  const ship = _ships[shipIndex];
  if (!ship) return;

  const wpts = ship.lane.wpts;
  const globeWorldMatrix = globeGroup.matrixWorld;

  const positions = [];
  for (const [lat, lon] of wpts) {
    const localPos = _latLonToWorld(lat, lon);
    const worldPos = localPos.clone().applyMatrix4(globeWorldMatrix);
    positions.push(worldPos.x, worldPos.y, worldPos.z);
  }

  if (positions.length < 6) return; // need at least 2 points (6 floats)

  const geo = new LineGeometry();
  geo.setPositions(positions);
  const mat = new LineMaterial({
    color: 0x44aaff,
    linewidth: 3,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  _routeLine = new Line2(geo, mat);
  _routeLine.computeLineDistances();
  scene.add(_routeLine);
}

function _disposeRoute() {
  if (_routeLine) {
    scene.remove(_routeLine);
    _routeLine.geometry?.dispose();
    _routeLine.material?.dispose();
    _routeLine = null;
  }
  _selectedShipIndex = -1;
}

// ---------------------------------------------------------------------------
// Position update
// ---------------------------------------------------------------------------

function _updatePositions(dt) {
  if (!_meshHit || !_meshVisual) return;

  _advanceShips(dt);

  const globeWorldMatrix = globeGroup.matrixWorld;
  const camPos = camera.position.clone();

  _visibleToDataIndex = [];
  let count = 0;

  for (const ship of _ships) {
    if (count >= MAX_SHIPS) break;

    const localPos = _latLonToWorld(ship.lat, ship.lon);
    const worldPos = localPos.clone().applyMatrix4(globeWorldMatrix);

    // Hit sphere — just position, no rotation needed
    _dummy.position.copy(worldPos);
    _dummy.scale.setScalar(1);
    _dummy.quaternion.identity();
    _dummy.updateMatrix();
    _meshHit.setMatrixAt(count, _dummy.matrix);

    // Visual plane — billboard toward camera, oriented by COG
    // Compute heading direction in world space:
    // 1. Surface normal at ship position
    _nrm.subVectors(worldPos, globeGroup.position).normalize();
    // 2. Project world-north onto tangent plane → "north" on surface
    const d = _worldNorth.dot(_nrm);
    _northTgt.copy(_worldNorth).addScaledVector(_nrm, -d);
    if (_northTgt.lengthSq() < 0.001) {
      // Near pole fallback: use east direction
      _northTgt.set(1, 0, 0).addScaledVector(_nrm, -_nrm.x).normalize();
    } else {
      _northTgt.normalize();
    }
    // 3. Rotate north by COG degrees around surface normal → heading direction
    _headingDir.copy(_northTgt).applyAxisAngle(_nrm, THREE.MathUtils.degToRad(ship.cog));
    // 4. Use heading as billboard "up" so the icon points forward
    _dummy.up.copy(_headingDir);
    _dummy.position.copy(worldPos);
    _dummy.lookAt(camPos);
    _dummy.up.set(0, 1, 0); // restore after lookAt
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    _meshVisual.setMatrixAt(count, _dummy.matrix);

    _shipColor(ship.shipType);
    _meshVisual.instanceColor.setXYZ(count, _color.r, _color.g, _color.b);

    _visibleToDataIndex.push(count);
    count++;
  }

  _meshHit.count = count;
  _meshVisual.count = count;
  _meshHit.instanceMatrix.needsUpdate = true;
  _meshVisual.instanceMatrix.needsUpdate = true;
  _meshVisual.instanceColor.needsUpdate = true;
  _meshHit.computeBoundingSphere();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enableShips() {
  _visible = true;
  if (!_meshHit) _createMeshes();
  if (!_initialized) {
    _ships = _generateShips();
    _initialized = true;
  }
  _meshVisual.visible = true;
}

export function disableShips() {
  _visible = false;
  if (_meshHit) _meshHit.count = 0;
  if (_meshVisual) _meshVisual.visible = false;
  _disposeRoute();
}

export function updateShips(dt) {
  if (!_visible) return;
  _updatePositions(dt);
}

export function getShipCount() { return _ships.length; }

export function getShipMesh() { return _meshHit; }

export function getShipData(instanceIndex) {
  const ship = _ships[instanceIndex];
  if (!ship) return null;
  return {
    mmsi: `SIM-${ship.id}`,
    name: ship.name,
    flag: ship.flag,
    lat: ship.lat,
    lon: ship.lon,
    cog: ship.cog,
    sog: ship.sog,
    shipType: ship.shipType,
    lane: ship.lane.name,
    simulated: true,
  };
}

/** Shows the full lane route for a ship, called by main.js on click */
export function showShipRoute(instanceIndex) {
  _showRoute(instanceIndex);
}

/** Hides the ship route line */
export function disposeShipRoute() {
  _disposeRoute();
}
