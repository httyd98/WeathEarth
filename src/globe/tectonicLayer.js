/**
 * Tectonic Plates Layer — renders plate boundary lines on the globe.
 * Data source: PB2002 (Bird 2003) via fraxen/tectonicplates on GitHub.
 * Uses Line2 (fat lines) for width > 1px in WebGL.
 */

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { globeGroup, renderer } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

const LINE_R = GLOBE_RADIUS * 1.002;
const LINE_WIDTH = 2.5; // pixels — requires Line2

/** PB2002 boundary-type metadata */
export const TECTONIC_TYPES = {
  SUB: { label: "Zona di subduzione",              color: 0xff3344, desc: "La placca oceanica scende sotto la continentale" },
  CRB: { label: "Rift continentale",               color: 0xff8800, desc: "Le placche si allontanano, la crosta si assottiglia" },
  CTF: { label: "Faglia trasformante continentale", color: 0xffcc00, desc: "Le placche scorrono orizzontalmente" },
  CCB: { label: "Bordo convergente continentale",  color: 0xff6622, desc: "Due placche continentali si scontrano" },
  OSR: { label: "Dorsale oceanica",                color: 0x44aaff, desc: "Espansione del fondo oceanico" },
  OTF: { label: "Faglia trasformante oceanica",    color: 0x88ccff, desc: "Scorrimento laterale nel fondale" },
  OCB: { label: "Bordo convergente oceanico",      color: 0xff88cc, desc: "Oceano vs oceano, formazione di archi insulari" },
};

const DEFAULT_COLOR = new THREE.Color(0xffffff);

// Per-type visibility filter (all on by default)
const _typeFilters = Object.fromEntries(Object.keys(TECTONIC_TYPES).map(k => [k, true]));

function _applyTypeFilters() {
  if (!_group) return;
  for (const line of _group.children) {
    const pt = line.userData.ptype;
    line.visible = _typeFilters[pt] !== false;
  }
}

let _active  = false;
let _group   = null;
let _loaded  = false;
let _loading = false;

// Cache LineMaterials per type to allow resolution updates
const _materials = {};

function _getResolution() {
  return new THREE.Vector2(renderer.domElement.width, renderer.domElement.height);
}

function _getMaterial(ptype) {
  if (_materials[ptype]) return _materials[ptype];
  const info  = TECTONIC_TYPES[ptype];
  const color = info ? new THREE.Color(info.color) : DEFAULT_COLOR;
  const mat   = new LineMaterial({
    color:       color.getHex(),
    linewidth:   LINE_WIDTH,
    resolution:  _getResolution(),
    transparent: true,
    opacity:     0.92,
    depthWrite:  false,
  });
  _materials[ptype] = mat;
  return mat;
}

function _latlonToVec3(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const th  = THREE.MathUtils.degToRad(lon + 180);
  const s   = Math.sin(phi);
  return new THREE.Vector3(
    -(LINE_R * s * Math.cos(th)),
     LINE_R * Math.cos(phi),
     LINE_R * s * Math.sin(th)
  );
}

function _buildGroup(geojson) {
  const grp = new THREE.Group();
  for (const feat of geojson.features) {
    const ptype = feat.properties?.PTYPE ?? "";
    const geo   = feat.geometry;
    if (!geo) continue;

    const lines =
      geo.type === "MultiLineString" ? geo.coordinates :
      geo.type === "LineString"      ? [geo.coordinates] : [];

    const mat = _getMaterial(ptype);

    for (const coords of lines) {
      if (coords.length < 2) continue;

      // LineGeometry expects flat [x,y,z, x,y,z, ...] array
      const positions = [];
      for (const [lon, lat] of coords) {
        const v = _latlonToVec3(lat, lon);
        positions.push(v.x, v.y, v.z);
      }

      const lineGeo = new LineGeometry();
      lineGeo.setPositions(positions);

      const line2 = new Line2(lineGeo, mat);
      line2.computeLineDistances();
      line2.renderOrder = 11;
      line2.userData.ptype = ptype;
      grp.add(line2);
    }
  }
  return grp;
}

/**
 * Update LineMaterial resolutions — call on window resize.
 */
export function updateTectonicResolution() {
  const res = _getResolution();
  for (const mat of Object.values(_materials)) {
    mat.resolution.copy(res);
  }
}

/**
 * Enable the tectonic layer. Fetches GeoJSON on first call.
 * @returns {Promise<boolean>} true on success
 */
export async function enableTectonic() {
  _active = true;

  if (_loaded && _group) {
    globeGroup.add(_group);
    _group.visible = true;
    _applyTypeFilters();
    return true;
  }

  if (_loading) return true;
  _loading = true;

  try {
    const url = "https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json";
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const geojson = await resp.json();
    _group  = _buildGroup(geojson);
    _loaded = true;
  } catch (e) {
    console.warn("[TectonicLayer] Load failed:", e);
    _loading = false;
    _active  = false;
    return false;
  }

  _loading = false;
  if (!_active) return false;

  globeGroup.add(_group);
  _group.visible = true;
  _applyTypeFilters();
  return true;
}

export function disableTectonic() {
  _active = false;
  if (_group) globeGroup.remove(_group);
}

export function setTectonicFilter(type, visible) {
  _typeFilters[type] = visible;
  _applyTypeFilters();
}

export function getTectonicFilter(type) { return _typeFilters[type] !== false; }
