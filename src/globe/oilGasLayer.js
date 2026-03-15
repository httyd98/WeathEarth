/**
 * Oil & Gas Layer — Major World Deposits
 *
 * Renders instanced flat disk markers on the globe surface for ~50 known major
 * oil and gas deposits. When the layer is active, the globe surface is made
 * semi-transparent so underground deposits feel visible.
 *
 * Marker geometry: CylinderGeometry (flat disk, height = 0.005)
 * Marker radius:   0.015 + log(reserves + 1) / log(1200) * 0.08
 * Color by type:   oil=#ff6600  gas=#ffee00  mixed=#ff9900
 *
 * All markers are stored in a single InstancedMesh; instanceId maps 1-to-1
 * to OIL_GAS_DEPOSITS array index.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { globeGroup } from "./scene.js";

// ── Deposit data ─────────────────────────────────────────────────────────────
// reserves: billion barrels (oil/mixed) or tcf (gas) — used only for sizing

export const OIL_GAS_DEPOSITS = [
  // ── Oil fields ────────────────────────────────────────────────────────────
  { name: "Campo di Ghawar",                lat:  24.5, lon:  49.1, type: "oil",   reserves:  75 },
  { name: "Campo di Burgan",                lat:  29.1, lon:  47.9, type: "oil",   reserves:  70 },
  { name: "Cintura dell'Orinoco",           lat:   8.0, lon: -62.5, type: "oil",   reserves: 220 },
  { name: "Campo di Ahvaz",                 lat:  31.3, lon:  48.7, type: "oil",   reserves:  65 },
  { name: "Campo di Rumaila",               lat:  30.0, lon:  47.2, type: "oil",   reserves:  17 },
  { name: "Campo di Murban",                lat:  23.5, lon:  53.5, type: "oil",   reserves:  40 },
  { name: "Campo di Romashkino",            lat:  54.5, lon:  52.5, type: "oil",   reserves:  17 },
  { name: "Campo di Tengiz",                lat:  46.5, lon:  53.7, type: "oil",   reserves:  26 },
  { name: "Bacino di Sirte",                lat:  29.0, lon:  16.5, type: "oil",   reserves:  43 },
  { name: "Delta del Niger",                lat:   5.0, lon:   6.0, type: "oil",   reserves:  37 },
  { name: "Off-shore Angola",               lat: -10.5, lon:  12.0, type: "oil",   reserves:   9 },
  { name: "Hassi Messaoud",                 lat:  31.7, lon:   6.1, type: "oil",   reserves:  12 },
  { name: "Bacino Permiano",                lat:  32.0, lon:-102.5, type: "oil",   reserves:  46 },
  { name: "Baia di Prudhoe",                lat:  70.3, lon:-148.3, type: "oil",   reserves:  13 },
  { name: "Sabbie bituminose Athabasca",    lat:  57.0, lon:-111.0, type: "oil",   reserves: 170 },
  { name: "Bacino di Santos",               lat: -24.0, lon: -41.0, type: "oil",   reserves:  10 },
  { name: "Campo di Cantarell",             lat:  19.8, lon: -91.8, type: "oil",   reserves:  15 },
  { name: "Campo di Brent",                 lat:  61.0, lon:   1.7, type: "oil",   reserves:   4 },
  { name: "Campo di Daqing",                lat:  46.5, lon: 125.0, type: "oil",   reserves:  16 },
  { name: "Campo di Kashagan",              lat:  46.0, lon:  53.0, type: "oil",   reserves:  13 },
  { name: "Campo di Safaniya",              lat:  27.6, lon:  48.8, type: "oil",   reserves:  37 },
  { name: "Campo di Shaybah",               lat:  22.5, lon:  54.7, type: "oil",   reserves:  18 },
  { name: "Campo di Zakum",                 lat:  24.2, lon:  53.0, type: "oil",   reserves:  21 },
  { name: "Campo di Majnoon",               lat:  31.5, lon:  47.7, type: "oil",   reserves:  12 },
  { name: "Campo di Kirkuk",                lat:  35.5, lon:  44.4, type: "oil",   reserves:  16 },
  { name: "Campo di Azadegan",              lat:  31.0, lon:  48.2, type: "oil",   reserves:  33 },
  { name: "Campo di Manifa",                lat:  27.2, lon:  49.1, type: "oil",   reserves:  11 },

  // ── Gas fields ────────────────────────────────────────────────────────────
  { name: "North Field — Gas",              lat:  25.9, lon:  51.5, type: "gas",   reserves: 900 },
  { name: "South Pars — Gas",               lat:  27.0, lon:  52.0, type: "gas",   reserves:1200 },
  { name: "Campo di Urengoy",               lat:  66.0, lon:  76.0, type: "gas",   reserves: 800 },
  { name: "Campo di Galkynysh",             lat:  37.6, lon:  62.4, type: "gas",   reserves: 600 },
  { name: "Piattaforma NW Australia",       lat: -22.0, lon: 116.0, type: "gas",   reserves:  85 },
  { name: "Campo di Groningen",             lat:  53.2, lon:   6.8, type: "gas",   reserves:  60 },
  { name: "Campo di Shtokman",              lat:  72.0, lon:  43.0, type: "gas",   reserves: 130 },
  { name: "Campo di Leviathan",             lat:  31.8, lon:  34.6, type: "gas",   reserves:  21 },
  { name: "Blocco offshore Tanzania",       lat:  -9.0, lon:  41.0, type: "gas",   reserves:  55 },
  { name: "Campo di Zohr",                  lat:  31.3, lon:  29.2, type: "gas",   reserves:  30 },
  { name: "Campo di Eni Mozambico",         lat: -21.5, lon:  36.0, type: "gas",   reserves: 100 },
  { name: "Campo di Coral Sul",             lat: -21.3, lon:  35.5, type: "gas",   reserves:  18 },
  { name: "Campo di Zapolyarnoye",          lat:  67.5, lon:  78.0, type: "gas",   reserves: 100 },

  // ── Mixed fields ─────────────────────────────────────────────────────────
  { name: "Bacino della Siberia Occidentale",lat: 63.0, lon:  75.0, type: "mixed", reserves: 100 },
  { name: "Campo di Troll",                 lat:  60.6, lon:   3.7, type: "mixed", reserves: 100 },
  { name: "Blocco Mahakam",                 lat:  -0.8, lon: 117.3, type: "mixed", reserves:  15 },
  { name: "Campo di Karachaganak",          lat:  51.6, lon:  53.4, type: "mixed", reserves:  16 },
  { name: "Campo di Snøhvit",               lat:  71.5, lon:  23.5, type: "mixed", reserves:  12 },
  { name: "Campo di Kupe",                  lat: -39.5, lon: 174.0, type: "mixed", reserves:   5 },
  { name: "Campo di Hassi R'Mel",           lat:  32.9, lon:   3.3, type: "mixed", reserves:  85 },
  { name: "Campo di Chayvo",                lat:  52.5, lon: 143.5, type: "mixed", reserves:  18 },
  { name: "Campo di Lukoil Yuzhnaya",       lat:  45.0, lon:  50.5, type: "mixed", reserves:   8 },
  { name: "Campo di Hibernia",              lat:  46.8, lon: -48.8, type: "mixed", reserves:   5 },
];

// ── Color map ────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  oil:   new THREE.Color(0xff6600),
  gas:   new THREE.Color(0xffee00),
  mixed: new THREE.Color(0xff9900),
};

// ── Marker radius formula ────────────────────────────────────────────────────

function _markerRadius(reserves) {
  return 0.015 + (Math.log(reserves + 1) / Math.log(1200)) * 0.08;
}

// ── Lat/lon → Cartesian ──────────────────────────────────────────────────────

function _latLonToVec3(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// ── Filter state ──────────────────────────────────────────────────────────────

const _filter = { oil: true, gas: true, mixed: true };

// ── Build InstancedMesh ───────────────────────────────────────────────────────

const _count = OIL_GAS_DEPOSITS.length;

// Sphere geometry — visible from all viewing angles on the globe
const _baseGeom = new THREE.SphereGeometry(1, 10, 6);

const _mat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  toneMapped: false,
});

const _instancedMesh = new THREE.InstancedMesh(_baseGeom, _mat, _count);
_instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
_instancedMesh.renderOrder = 12;
_instancedMesh.visible = false;

// ── Populate instance transforms and colors ───────────────────────────────────

const _dummy    = new THREE.Object3D();
const _colorBuf = new THREE.Color();

function _rebuildInstances() {
  for (let i = 0; i < _count; i++) {
    const dep    = OIL_GAS_DEPOSITS[i];
    const r      = GLOBE_RADIUS + 0.001;
    const pos    = _latLonToVec3(dep.lat, dep.lon, r);
    const radius = _markerRadius(dep.reserves);
    const show   = _filter[dep.type] !== false;

    _dummy.position.copy(pos);
    _dummy.scale.setScalar(show ? radius : 0);
    _dummy.quaternion.identity();
    _dummy.updateMatrix();
    _instancedMesh.setMatrixAt(i, _dummy.matrix);

    _colorBuf.copy(TYPE_COLORS[dep.type] ?? TYPE_COLORS.oil);
    _instancedMesh.setColorAt(i, _colorBuf);
  }
  _instancedMesh.instanceMatrix.needsUpdate = true;
  if (_instancedMesh.instanceColor) _instancedMesh.instanceColor.needsUpdate = true;
}

_rebuildInstances();
globeGroup.add(_instancedMesh);

// ── Transparency helper ───────────────────────────────────────────────────────

/**
 * Make the earth mesh semi-transparent (or restore it).
 * @param {THREE.Mesh}  earthMesh
 * @param {boolean}     transparent
 */
export function setGlobeTransparency(earthMesh, transparent) {
  if (!earthMesh) return;
  earthMesh.material.transparent = transparent;
  earthMesh.material.opacity     = transparent ? 0.35 : 1.0;
  earthMesh.material.needsUpdate = true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable the oil & gas layer and apply transparency to the globe surface.
 * @param {THREE.Mesh} earthMesh — the main earth sphere mesh
 */
export function enableOilGas(earthMesh) {
  _instancedMesh.visible = true;
  setGlobeTransparency(earthMesh, true);
}

/**
 * Disable the oil & gas layer and restore globe opacity.
 * @param {THREE.Mesh} earthMesh
 */
export function disableOilGas(earthMesh) {
  _instancedMesh.visible = false;
  setGlobeTransparency(earthMesh, false);
}

/**
 * Return the InstancedMesh for raycasting in the main render loop.
 * @returns {THREE.InstancedMesh}
 */
export function getOilGasMesh() {
  return _instancedMesh;
}

/**
 * Return deposit metadata for a given instance id.
 * @param {number} instanceId — the index returned by raycaster.intersectObject()
 * @returns {object|null}
 */
export function getDepositData(instanceId) {
  return OIL_GAS_DEPOSITS[instanceId] ?? null;
}

/**
 * Toggle visibility of a deposit type.
 * @param {string}  type    — "oil" | "gas" | "mixed"
 * @param {boolean} visible
 */
export function setOilGasFilter(type, visible) {
  _filter[type] = visible;
  _rebuildInstances();
}
