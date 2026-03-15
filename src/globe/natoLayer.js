/**
 * NATO Bases Layer — shows NATO military installations worldwide.
 *
 * Data: curated static dataset of known NATO bases and facilities.
 * Filter by owning/operating nation.
 *
 * Markers: InstancedMesh with custom shape (pentagon star → flat disk for simplicity).
 * Color coded by nation.
 */

import * as THREE from "three";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Nation codes with labels, colors, flag emojis.
 * These are NATO member nations that operate bases listed below.
 */
export const NATO_NATIONS = {
  USA: { label: "Stati Uniti",     color: "#3355ff", flag: "🇺🇸" },
  GBR: { label: "Gran Bretagna",   color: "#cc3322", flag: "🇬🇧" },
  DEU: { label: "Germania",        color: "#ffcc00", flag: "🇩🇪" },
  FRA: { label: "Francia",         color: "#0055aa", flag: "🇫🇷" },
  ITA: { label: "Italia",          color: "#009933", flag: "🇮🇹" },
  TUR: { label: "Turchia",         color: "#cc0000", flag: "🇹🇷" },
  ESP: { label: "Spagna",          color: "#aa2211", flag: "🇪🇸" },
  NLD: { label: "Paesi Bassi",     color: "#ff6600", flag: "🇳🇱" },
  BEL: { label: "Belgio",          color: "#ffdd00", flag: "🇧🇪" },
  GRC: { label: "Grecia",          color: "#004488", flag: "🇬🇷" },
  NOR: { label: "Norvegia",        color: "#cc0011", flag: "🇳🇴" },
  POL: { label: "Polonia",         color: "#dd1133", flag: "🇵🇱" },
  ROM: { label: "Romania",         color: "#002266", flag: "🇷🇴" },
  PRT: { label: "Portogallo",      color: "#006600", flag: "🇵🇹" },
  NATO: { label: "NATO (Comune)",  color: "#4488cc", flag: "🏳️" },
};

/**
 * NATO bases dataset.
 * Fields: name, lat, lon, nation (key of NATO_NATIONS), type, country (host country), personnel
 */
export const NATO_BASES = [
  // ── United States (Europe) ──
  { name: "Ramstein Air Base",          lat: 49.4369, lon: 7.6003,   nation: "USA", type: "Aeronavale",   country: "Germania",    personnel: 53000 },
  { name: "Aviano Air Base",            lat: 46.0319, lon: 12.5961,  nation: "USA", type: "Aeronavale",   country: "Italia",      personnel: 5000  },
  { name: "Naval Station Rota",         lat: 36.6461, lon: -6.3528,  nation: "USA", type: "Navale",       country: "Spagna",      personnel: 6500  },
  { name: "NAS Sigonella",              lat: 37.4017, lon: 14.9225,  nation: "USA", type: "Aeronavale",   country: "Italia",      personnel: 5000  },
  { name: "Camp Darby",                 lat: 43.6667, lon: 10.3500,  nation: "USA", type: "Deposito",     country: "Italia",      personnel: 1000  },
  { name: "Lakenheath Air Base",        lat: 52.4092, lon: 0.5600,   nation: "USA", type: "Aeronavale",   country: "Gran Bretagna", personnel: 14000 },
  { name: "Mildenhall Air Base",        lat: 52.3619, lon: 0.4864,   nation: "USA", type: "Aeronavale",   country: "Gran Bretagna", personnel: 3500  },
  { name: "Grafenwöhr Training Area",   lat: 49.7000, lon: 11.9000,  nation: "USA", type: "Addestramento", country: "Germania",   personnel: 20000 },
  { name: "Landstuhl Regional Med Ctr", lat: 49.4081, lon: 7.5694,   nation: "USA", type: "Medico",       country: "Germania",    personnel: 4000  },
  { name: "Vicenza (USAG Italy)",       lat: 45.5475, lon: 11.5453,  nation: "USA", type: "Terrestre",    country: "Italia",      personnel: 4500  },
  { name: "Camp Bondsteel",             lat: 42.3583, lon: 21.3481,  nation: "USA", type: "Terrestre",    country: "Kosovo",      personnel: 3500  },
  { name: "Incirlik Air Base",          lat: 37.0021, lon: 35.4258,  nation: "USA", type: "Aeronavale",   country: "Turchia",     personnel: 3500  },
  { name: "Thule Air Base",             lat: 76.5311, lon: -68.7033, nation: "USA", type: "Aeronavale",   country: "Groenlandia", personnel: 1000  },
  { name: "Keflavik Naval Air Station", lat: 63.9856, lon: -22.6056, nation: "USA", type: "Aeronavale",   country: "Islanda",     personnel: 1000  },
  { name: "NSA Souda Bay",              lat: 35.5319, lon: 24.1569,  nation: "USA", type: "Navale",       country: "Grecia",      personnel: 600   },
  { name: "Lajes Air Force Base",       lat: 38.7611, lon: -27.0903, nation: "USA", type: "Aeronavale",   country: "Portogallo",  personnel: 650   },
  { name: "Diego Garcia",               lat: -7.3117, lon: 72.4236,  nation: "USA", type: "Aeronavale",   country: "BIOT",        personnel: 3500  },
  { name: "Yokota Air Base",            lat: 35.7483, lon: 139.3483, nation: "USA", type: "Aeronavale",   country: "Giappone",    personnel: 13000 },
  { name: "Kadena Air Base",            lat: 26.3556, lon: 127.7689, nation: "USA", type: "Aeronavale",   country: "Giappone",    personnel: 20000 },
  { name: "Camp Humphreys",             lat: 36.9667, lon: 127.0333, nation: "USA", type: "Terrestre",    country: "Corea del Sud", personnel: 36000 },
  { name: "Osan Air Base",              lat: 37.0903, lon: 127.0303, nation: "USA", type: "Aeronavale",   country: "Corea del Sud", personnel: 10000 },
  { name: "Guam (Andersen AFB)",        lat: 13.5833, lon: 144.9292, nation: "USA", type: "Aeronavale",   country: "Guam",        personnel: 7000  },
  { name: "Al Udeid Air Base",          lat: 25.1167, lon: 51.3167,  nation: "USA", type: "Aeronavale",   country: "Qatar",       personnel: 10000 },
  { name: "Ali Al Salem Air Base",      lat: 29.3467, lon: 47.5208,  nation: "USA", type: "Aeronavale",   country: "Kuwait",      personnel: 3000  },
  { name: "Bagram Airfield (storica)",  lat: 34.9461, lon: 69.2650,  nation: "USA", type: "Storica",      country: "Afghanistan", personnel: 0     },
  { name: "Stuttgart (EUCOM/AFRICOM)",  lat: 48.7383, lon: 9.1981,   nation: "USA", type: "Comando",      country: "Germania",    personnel: 8000  },
  { name: "Naples (NAVSOUTH)",          lat: 40.8944, lon: 14.2678,  nation: "USA", type: "Comando",      country: "Italia",      personnel: 2000  },

  // ── United Kingdom ──
  { name: "RAF Akrotiri",               lat: 34.5903, lon: 32.9875,  nation: "GBR", type: "Aeronavale",   country: "Cipro",       personnel: 3000  },
  { name: "RAF Brize Norton",           lat: 51.7500, lon: -1.5833,  nation: "GBR", type: "Aeronavale",   country: "Gran Bretagna", personnel: 6000 },
  { name: "RAF Marham",                 lat: 52.6483, lon: 0.5500,   nation: "GBR", type: "Aeronavale",   country: "Gran Bretagna", personnel: 5000 },
  { name: "HMNB Portsmouth",            lat: 50.8000, lon: -1.1000,  nation: "GBR", type: "Navale",       country: "Gran Bretagna", personnel: 15000 },
  { name: "HMNB Clyde (Faslane)",       lat: 56.0667, lon: -4.8000,  nation: "GBR", type: "Navale",       country: "Gran Bretagna", personnel: 6000 },

  // ── France ──
  { name: "BA 125 Istres",              lat: 43.5228, lon: 5.0989,   nation: "FRA", type: "Aeronavale",   country: "Francia",     personnel: 5000  },
  { name: "Port de Toulon",             lat: 43.1167, lon: 5.9500,   nation: "FRA", type: "Navale",       country: "Francia",     personnel: 12000 },
  { name: "Base de Djibouti",           lat: 11.5472, lon: 43.1458,  nation: "FRA", type: "Aeronavale",   country: "Gibuti",      personnel: 1500  },
  { name: "Abu Dhabi (Camp de la Paix)",lat: 24.4667, lon: 54.3667,  nation: "FRA", type: "Navale",       country: "Emirati Arabi", personnel: 700  },

  // ── Germany ──
  { name: "Luftwaffenstützpunkt Köln",  lat: 50.8658, lon: 7.1436,   nation: "DEU", type: "Aeronavale",   country: "Germania",    personnel: 4000  },
  { name: "Kiel Naval Base",            lat: 54.3800, lon: 10.1500,  nation: "DEU", type: "Navale",       country: "Germania",    personnel: 3000  },

  // ── Italy ──
  { name: "Taranto Naval Base",         lat: 40.4764, lon: 17.2311,  nation: "ITA", type: "Navale",       country: "Italia",      personnel: 8000  },
  { name: "Pratica di Mare Air Base",   lat: 41.6544, lon: 12.4456,  nation: "ITA", type: "Aeronavale",   country: "Italia",      personnel: 5000  },

  // ── Turkey ──
  { name: "Eskişehir 1st TAF",          lat: 39.7833, lon: 30.5667,  nation: "TUR", type: "Aeronavale",   country: "Turchia",     personnel: 8000  },
  { name: "Akıncı Air Base",            lat: 40.0786, lon: 32.5661,  nation: "TUR", type: "Aeronavale",   country: "Turchia",     personnel: 3000  },
  { name: "Gölcük Naval Base",          lat: 40.7167, lon: 29.8167,  nation: "TUR", type: "Navale",       country: "Turchia",     personnel: 10000 },

  // ── Spain ──
  { name: "Morón Air Base",             lat: 37.1742, lon: -5.6150,  nation: "ESP", type: "Aeronavale",   country: "Spagna",      personnel: 2800  },
  { name: "Zaragoza Air Base",          lat: 41.6617, lon: -1.0417,  nation: "ESP", type: "Aeronavale",   country: "Spagna",      personnel: 3000  },

  // ── Greece ──
  { name: "Suda Bay Naval Base",        lat: 35.5236, lon: 24.1556,  nation: "GRC", type: "Navale",       country: "Grecia",      personnel: 3000  },
  { name: "Tatoi Air Base",             lat: 38.1181, lon: 23.7833,  nation: "GRC", type: "Aeronavale",   country: "Grecia",      personnel: 2000  },

  // ── Netherlands ──
  { name: "Volkel Air Base",            lat: 51.6561, lon: 5.7069,   nation: "NLD", type: "Aeronavale",   country: "Paesi Bassi", personnel: 2500  },
  { name: "Den Helder Naval Base",      lat: 52.9625, lon: 4.7711,   nation: "NLD", type: "Navale",       country: "Paesi Bassi", personnel: 3000  },

  // ── Belgium ──
  { name: "Kleine Brogel Air Base",     lat: 51.1678, lon: 5.4700,   nation: "BEL", type: "Aeronavale",   country: "Belgio",      personnel: 2000  },
  { name: "Florennes Air Base",         lat: 50.2433, lon: 4.6481,   nation: "BEL", type: "Aeronavale",   country: "Belgio",      personnel: 1800  },

  // ── Norway ──
  { name: "Ørland Air Station",         lat: 63.6994, lon: 9.6042,   nation: "NOR", type: "Aeronavale",   country: "Norvegia",    personnel: 2500  },
  { name: "Ramsund Naval Station",      lat: 68.5500, lon: 16.5000,  nation: "NOR", type: "Navale",       country: "Norvegia",    personnel: 1000  },

  // ── Poland ──
  { name: "Łask Air Base",              lat: 51.5517, lon: 19.1800,  nation: "POL", type: "Aeronavale",   country: "Polonia",     personnel: 3000  },
  { name: "Camp Kosciuszko",            lat: 51.7333, lon: 17.3833,  nation: "USA", type: "Terrestre",    country: "Polonia",     personnel: 4500  },
  { name: "Gdynia Naval Base",          lat: 54.5333, lon: 18.5500,  nation: "POL", type: "Navale",       country: "Polonia",     personnel: 5000  },

  // ── Romania ──
  { name: "Mihail Kogălniceanu AB",     lat: 44.3619, lon: 28.4883,  nation: "ROM", type: "Aeronavale",   country: "Romania",     personnel: 1500  },
  { name: "Deveselu (Aegis Ashore)",    lat: 44.2417, lon: 24.0833,  nation: "USA", type: "Difesa missilistica", country: "Romania", personnel: 500 },

  // ── Portugal ──
  { name: "Beja Air Base",              lat: 37.9931, lon: -7.9322,  nation: "PRT", type: "Aeronavale",   country: "Portogallo",  personnel: 1500  },
  { name: "Naval Station Lisbon",       lat: 38.7167, lon: -9.1500,  nation: "PRT", type: "Navale",       country: "Portogallo",  personnel: 2000  },

  // ── NATO HQs ──
  { name: "NATO HQ Brussels",           lat: 50.8758, lon: 4.4194,   nation: "NATO", type: "Comando",    country: "Belgio",      personnel: 4000  },
  { name: "SHAPE (Casteau)",            lat: 50.5000, lon: 3.9167,   nation: "NATO", type: "Comando",    country: "Belgio",      personnel: 1000  },
  { name: "NATO Maritime (Northwood)",  lat: 51.6167, lon: -0.4167,  nation: "NATO", type: "Comando",    country: "Gran Bretagna", personnel: 500  },
  { name: "JFC Brunssum",               lat: 51.0167, lon: 5.9667,   nation: "NATO", type: "Comando",    country: "Paesi Bassi", personnel: 1200  },
  { name: "JFC Naples",                 lat: 40.8944, lon: 14.2678,  nation: "NATO", type: "Comando",    country: "Italia",      personnel: 1200  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let _active  = false;
let _mesh    = null;
// Which nations are visible (all active by default)
let _filter  = Object.fromEntries(Object.keys(NATO_NATIONS).map(k => [k, true]));

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// ── Geometry helpers ──────────────────────────────────────────────────────────

function _latLonToVec3(lat, lon, r) {
  const phi   = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -(Math.sin(phi) * Math.cos(theta)) * r,
      Math.cos(phi) * r,
      Math.sin(phi) * Math.sin(theta) * r
  );
}

// ── Build / dispose ───────────────────────────────────────────────────────────

function _buildMesh() {
  if (_mesh) { globeGroup.remove(_mesh); _mesh.geometry.dispose(); _mesh.material.dispose(); _mesh = null; }

  const n = NATO_BASES.length;

  // Pentagon-ish star: use a cone with flat top as marker, or simple disk
  const geo = new THREE.CylinderGeometry(0.032, 0.010, 0.010, 5);  // 5-sided → pentagon
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });

  _mesh = new THREE.InstancedMesh(geo, mat, n);
  _mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  _updateVisibility();
  _mesh.renderOrder = 9;
  globeGroup.add(_mesh);
}

function _updateVisibility() {
  if (!_mesh) return;
  for (let i = 0; i < NATO_BASES.length; i++) {
    const base = NATO_BASES[i];
    const visible = _filter[base.nation] !== false;

    const pos = _latLonToVec3(base.lat, base.lon, GLOBE_RADIUS + 0.018);
    _dummy.position.copy(pos);
    // Orient flat side toward globe surface
    const up = pos.clone().normalize();
    _dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    _dummy.scale.setScalar(visible ? 1 : 0);  // hide by scaling to 0
    _dummy.updateMatrix();
    _mesh.setMatrixAt(i, _dummy.matrix);

    // Color by nation
    const nationData = NATO_NATIONS[base.nation];
    _color.set(nationData ? nationData.color : "#aaaaaa");
    _mesh.setColorAt(i, _color);
  }
  _mesh.instanceMatrix.needsUpdate = true;
  if (_mesh.instanceColor) _mesh.instanceColor.needsUpdate = true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function enableNato() {
  _active = true;
  _buildMesh();
}

export function disableNato() {
  _active = false;
  if (_mesh) { globeGroup.remove(_mesh); _mesh.geometry.dispose(); _mesh.material.dispose(); _mesh = null; }
}

/** Toggle filter for a nation key. Pass null to reset all to true. */
export function setNatoFilter(nationKey, visible) {
  if (nationKey === null) {
    Object.keys(_filter).forEach(k => _filter[k] = true);
  } else {
    _filter[nationKey] = visible;
  }
  _updateVisibility();
}

export function getNatoFilter() { return { ..._filter }; }

export function getNatoMesh() { return _mesh; }

export function getNatoBaseData(instanceId) {
  const base = NATO_BASES[instanceId];
  if (!base) return null;
  const nation = NATO_NATIONS[base.nation];
  return {
    ...base,
    nationLabel: nation?.label ?? base.nation,
    nationColor: nation?.color ?? "#aaa",
    nationFlag:  nation?.flag  ?? "",
    personnelStr: base.personnel > 0
      ? base.personnel.toLocaleString("it-IT") + " pers."
      : "Storica / Dismessa",
  };
}
