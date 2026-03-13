/**
 * Lightning Layer — Realistic Lightning Bolts
 *
 * Two data sources combined:
 * 1. Weather station data (codes 95/96/99 + CAPE > 1000) — coarse but global
 * 2. Blitzortung real-time WebSocket feed — precise, live lightning strikes
 *
 * Rendering: Procedural jagged lightning bolts from cloud altitude to surface.
 * Uses Line2 (fat lines from three/examples/jsm) for visible thick bolts with
 * sharp flash pulses. Glow sprites add a bloom effect at the strike point.
 * Bolts are regenerated each flash for variety.
 */

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { globeGroup } from "./scene.js";
import { GLOBE_RADIUS } from "../constants.js";
import { latLonToVector3 } from "../utils.js";
import { startBlitzortung, stopBlitzortung, getStrikes, isBlitzortungConnected } from "./blitzortung.js";

const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const MAX_BOLTS = 300;  // Max bolt animations at once
const CLOUD_ALT = GLOBE_RADIUS * 1.038;   // Cloud base altitude
const SURFACE_ALT = GLOBE_RADIUS * 1.002; // Just above surface

// ── Bolt data ──────────────────────────────────────────────────────────────
// Each bolt = { lat, lon, intensity, lastRegen, regenInterval, flashDuration, visible }
const _boltData = [];
let _activeCount = 0;

// ── THREE group for all bolt geometry ──────────────────────────────────────
const _boltGroup = new THREE.Group();
_boltGroup.renderOrder = 8;
_boltGroup.visible = false;
globeGroup.add(_boltGroup);

// ── Glow sprites at bolt locations ─────────────────────────────────────────
const _glowPositions = new Float32Array(MAX_BOLTS * 3);
const _glowColors = new Float32Array(MAX_BOLTS * 3);
const _glowGeometry = new THREE.BufferGeometry();
_glowGeometry.setAttribute("position", new THREE.BufferAttribute(_glowPositions, 3).setUsage(THREE.DynamicDrawUsage));
_glowGeometry.setAttribute("color", new THREE.BufferAttribute(_glowColors, 3).setUsage(THREE.DynamicDrawUsage));

function _createGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, "rgba(200,220,255,0.7)");
  gradient.addColorStop(0.5, "rgba(150,180,255,0.2)");
  gradient.addColorStop(1, "rgba(100,140,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const _glowMaterial = new THREE.PointsMaterial({
  size: 0.22,
  vertexColors: true,
  transparent: true,
  opacity: 1.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
  alphaMap: _createGlowTexture(),
  alphaTest: 0.001,
});

const _glowMesh = new THREE.Points(_glowGeometry, _glowMaterial);
_glowMesh.renderOrder = 9;
_boltGroup.add(_glowMesh);

// ── Reusable scratch vectors ───────────────────────────────────────────────
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _vTangent = new THREE.Vector3();
const _vNormal = new THREE.Vector3();

// ── Line2 pool for fat bolt lines ──────────────────────────────────────────
// Using Line2 + LineMaterial because WebGL ignores linewidth > 1 on most platforms.
// Line2 renders as a triangle strip mesh, supporting arbitrary pixel width.

const _boltLineMaterial = new LineMaterial({
  vertexColors: true,
  linewidth: 3.0,           // pixels — visible at globe scale
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  dashed: false,
  worldUnits: false,        // linewidth in screen pixels, not world units
  resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
});

// Keep resolution updated on window resize (LineMaterial needs screen size)
window.addEventListener("resize", () => {
  _boltLineMaterial.resolution.set(window.innerWidth, window.innerHeight);
});

const _linePool = [];
let _activeLinesCount = 0;

function _getOrCreateLine() {
  if (_activeLinesCount < _linePool.length) {
    const line = _linePool[_activeLinesCount];
    line.visible = true;
    _activeLinesCount++;
    return line;
  }
  const geo = new LineGeometry();
  const line = new Line2(geo, _boltLineMaterial);
  line.renderOrder = 8;
  _boltGroup.add(line);
  _linePool.push(line);
  _activeLinesCount++;
  return line;
}

function _hideAllLines() {
  for (let i = 0; i < _linePool.length; i++) {
    _linePool[i].visible = false;
  }
  _activeLinesCount = 0;
}

// ── Bolt path generation ───────────────────────────────────────────────────

function _generateBoltPath(lat, lon, intensity) {
  const segments = 8 + Math.floor(Math.random() * 7);
  const points = [];

  const latOffset = (Math.random() - 0.5) * 0.8;
  const lonOffset = (Math.random() - 0.5) * 0.8;
  const startLat = lat + latOffset;
  const startLon = lon + lonOffset;
  const endLat = lat + (Math.random() - 0.5) * 0.3;
  const endLon = lon + (Math.random() - 0.5) * 0.3;

  latLonToVector3(startLat, startLon, CLOUD_ALT, _v0);
  latLonToVector3(endLat, endLon, SURFACE_ALT, _v1);
  _vUp.copy(_v0).normalize();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pos = new THREE.Vector3().lerpVectors(_v0, _v1, t);

    if (i > 0 && i < segments) {
      const jitterStrength = 0.06 * Math.sin(Math.PI * t) * (0.5 + intensity * 0.5);
      _vTangent.subVectors(_v1, _v0).normalize();
      _vNormal.crossVectors(_vUp, _vTangent).normalize();

      const lateralJitter = (Math.random() - 0.5) * 2 * jitterStrength;
      const forwardJitter = (Math.random() - 0.5) * 0.5 * jitterStrength;

      pos.addScaledVector(_vNormal, lateralJitter);
      pos.addScaledVector(_vTangent, forwardJitter);

      const targetAlt = CLOUD_ALT + (SURFACE_ALT - CLOUD_ALT) * t;
      pos.normalize().multiplyScalar(targetAlt);
    }

    points.push(pos);
  }

  return points;
}

function _generateBranches(mainPoints, intensity) {
  const branches = [];
  const numBranches = Math.floor(Math.random() * 3 * intensity);

  for (let b = 0; b < numBranches; b++) {
    const splitIdx = 2 + Math.floor(Math.random() * Math.max(1, mainPoints.length - 4));
    if (splitIdx >= mainPoints.length) continue;
    const splitPoint = mainPoints[splitIdx];
    const branchLen = 2 + Math.floor(Math.random() * 3);

    const branchPoints = [splitPoint.clone()];
    const nextIdx = Math.min(splitIdx + 1, mainPoints.length - 1);
    const mainDir = new THREE.Vector3().subVectors(mainPoints[nextIdx], splitPoint).normalize();
    const up = splitPoint.clone().normalize();
    const lateral = new THREE.Vector3().crossVectors(up, mainDir).normalize();
    const branchDir = mainDir.clone().addScaledVector(lateral, (Math.random() - 0.5) * 2).normalize();

    let prevPoint = splitPoint.clone();
    for (let i = 1; i <= branchLen; i++) {
      const stepLen = 0.025 + Math.random() * 0.015;
      const nextPoint = prevPoint.clone()
        .addScaledVector(branchDir, stepLen)
        .addScaledVector(lateral, (Math.random() - 0.5) * 0.015);
      const alt = nextPoint.length();
      if (alt < SURFACE_ALT) nextPoint.normalize().multiplyScalar(SURFACE_ALT);
      branchPoints.push(nextPoint);
      prevPoint = nextPoint;
    }

    branches.push(branchPoints);
  }

  return branches;
}

/**
 * Build a flat Float32Array of [x,y,z,  x,y,z, …] for Line2/LineGeometry.setPositions()
 * and a matching flat Float32Array of [r,g,b,  r,g,b, …] for setColors().
 * Vertex color encodes brightness (dark = dim, with AdditiveBlending dark = transparent).
 */
function _buildLine2Geometry(points, brightness, rBase, gBase, bBase) {
  const positions = new Float32Array(points.length * 3);
  const colors    = new Float32Array(points.length * 3);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = i / (points.length - 1);
    // Slight taper: brightest at top, slightly dimmer at ground
    const localBr = brightness * (1 - t * 0.25);

    positions[i * 3]     = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    colors[i * 3]     = rBase * localBr;
    colors[i * 3 + 1] = gBase * localBr;
    colors[i * 3 + 2] = bBase * localBr;
  }

  return { positions, colors };
}

/** Apply positions+colors to a Line2's LineGeometry */
function _setLine2Path(line, points, brightness, rBase, gBase, bBase) {
  const { positions, colors } = _buildLine2Geometry(points, brightness, rBase, gBase, bBase);
  const geo = line.geometry;
  geo.setPositions(positions);
  geo.setColors(colors);
  line.computeLineDistances();
}

// ── Blitzortung integration ────────────────────────────────────────────────
let _blitzortungActive = false;

function _rebuildBoltsFromAllSources() {
  // Combine: weather-code storm locations + Blitzortung real-time strikes
  const existing = _boltData.filter(b => b.source === "weather");
  const blitzStrikes = getStrikes();

  const blitzBolts = [];
  const blitzLimit = MAX_BOLTS - existing.length;
  const recentStrikes = blitzStrikes.slice(-blitzLimit);

  for (const strike of recentStrikes) {
    blitzBolts.push({
      lat: strike.lat,
      lon: strike.lon,
      intensity: strike.intensity,
      lastRegen: 0,
      regenInterval: 0.2 + Math.random() * 0.8,
      flashDuration: 0.05 + Math.random() * 0.1,
      visible: false,
      source: "blitzortung",
    });
  }

  _boltData.length = 0;
  _boltData.push(...existing.slice(0, MAX_BOLTS / 2));
  _boltData.push(...blitzBolts);
  _activeCount = _boltData.length;

  // Update glow positions
  for (let i = 0; i < _activeCount; i++) {
    const bolt = _boltData[i];
    latLonToVector3(bolt.lat, bolt.lon, CLOUD_ALT * 0.98, _v0);
    const i3 = i * 3;
    _glowPositions[i3]     = _v0.x;
    _glowPositions[i3 + 1] = _v0.y;
    _glowPositions[i3 + 2] = _v0.z;
  }

  _glowGeometry.setDrawRange(0, _activeCount);
  _glowGeometry.attributes.position.needsUpdate = true;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Rebuild lightning bolts from weather data + start Blitzortung feed.
 */
export function buildLightningField(points) {
  _boltData.length = 0;
  _activeCount = 0;

  for (const p of points) {
    if (_activeCount >= MAX_BOLTS) break;
    const wc = p.current?.weatherCode;
    const cape = p.current?.cape;
    const isThunderstorm = THUNDERSTORM_CODES.has(wc);
    const isHighCAPE = cape != null && cape > 1000;

    if (!isThunderstorm && !isHighCAPE) continue;

    let intensity;
    if (wc === 99) intensity = 1.0;
    else if (isThunderstorm) intensity = 0.7;
    else intensity = 0.35;

    _boltData.push({
      lat: p.lat,
      lon: p.lon,
      intensity,
      lastRegen: 0,
      regenInterval: 0.3 + Math.random() * 1.5 / Math.max(intensity, 0.3),
      flashDuration: 0.06 + Math.random() * 0.14,
      visible: false,
      source: "weather",
    });

    latLonToVector3(p.lat, p.lon, CLOUD_ALT * 0.98, _v0);
    const i3 = _activeCount * 3;
    _glowPositions[i3]     = _v0.x;
    _glowPositions[i3 + 1] = _v0.y;
    _glowPositions[i3 + 2] = _v0.z;

    _activeCount++;
  }

  _glowGeometry.setDrawRange(0, _activeCount);
  _glowGeometry.attributes.position.needsUpdate = true;
  _glowGeometry.attributes.color.needsUpdate = true;

  _hideAllLines();

  if (!_blitzortungActive) {
    _blitzortungActive = true;
    startBlitzortung(_rebuildBoltsFromAllSources);
  }

  console.log(`[Lightning] ${_activeCount} bolt locations from weather data, Blitzortung ${isBlitzortungConnected() ? "connected" : "connecting"}...`);
}

/**
 * Stop lightning visualization and disconnect Blitzortung.
 */
export function disableLightning() {
  if (_blitzortungActive) {
    stopBlitzortung();
    _blitzortungActive = false;
  }
  _hideAllLines();
  _boltData.length = 0;
  _activeCount = 0;
}

/**
 * Animate lightning flashes. Call each frame.
 */
export function updateLightning(time) {
  if (_activeCount === 0) return;

  _hideAllLines();

  for (let i = 0; i < _activeCount; i++) {
    const bolt = _boltData[i];
    const timeSinceRegen = time - bolt.lastRegen;

    const isFlashing = timeSinceRegen < bolt.flashDuration;
    const shouldRegen = timeSinceRegen > bolt.regenInterval;

    if (shouldRegen) {
      bolt.lastRegen = time;
      bolt.regenInterval = 0.3 + Math.random() * 1.5 / Math.max(bolt.intensity, 0.3);
      bolt.flashDuration = 0.06 + Math.random() * 0.14;
      bolt.visible = true;
    }

    const i3 = i * 3;

    if (isFlashing) {
      const flashT = timeSinceRegen / bolt.flashDuration;
      const brightness = Math.pow(1.0 - flashT, 1.5) * bolt.intensity;

      if (brightness > 0.04) {
        // Main bolt — white-blue at full brightness
        const mainPoints = _generateBoltPath(bolt.lat, bolt.lon, bolt.intensity);
        const mainLine = _getOrCreateLine();
        _setLine2Path(mainLine, mainPoints, brightness,
          0.85 + 0.15 * brightness,   // R
          0.88 + 0.12 * brightness,   // G
          1.0                          // B
        );

        // Branches — slightly dimmer and cooler
        const branches = _generateBranches(mainPoints, bolt.intensity);
        for (const branchPoints of branches) {
          const branchLine = _getOrCreateLine();
          _setLine2Path(branchLine, branchPoints, brightness * 0.55,
            0.7, 0.8, 1.0
          );
        }

        // Glow: bright white-blue sphere at strike point
        _glowColors[i3]     = brightness;
        _glowColors[i3 + 1] = brightness * 0.95;
        _glowColors[i3 + 2] = brightness;
      } else {
        bolt.visible = false;
        _glowColors[i3] = _glowColors[i3 + 1] = _glowColors[i3 + 2] = 0;
      }
    } else {
      bolt.visible = false;
      _glowColors[i3] = _glowColors[i3 + 1] = _glowColors[i3 + 2] = 0;
    }
  }

  _glowGeometry.attributes.color.needsUpdate = true;
}

// Export the group mesh for visibility control
export const lightningMesh = _boltGroup;
