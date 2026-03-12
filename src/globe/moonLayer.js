/**
 * Moon mesh with real astronomical position and subtle moonlight.
 * The moon is placed in world/ECI space (not inside globeGroup) so it
 * orbits correctly relative to the fixed-star background.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import { getMoonPositionECI, getLunarPhase } from "./astronomy.js";

// Moon scale: GLOBE_RADIUS * 60 Earth-radii distance, GLOBE_RADIUS * 0.2727 radius
const MOON_DISTANCE_SCALE = 60.0; // Earth radii to world units multiplier = GLOBE_RADIUS
const MOON_WORLD_DISTANCE  = GLOBE_RADIUS * MOON_DISTANCE_SCALE; // ~252
const MOON_WORLD_RADIUS    = GLOBE_RADIUS * 0.2727;              // ~1.145

// Suppress unused variable warning — MOON_WORLD_DISTANCE is for documentation purposes
void MOON_WORLD_DISTANCE;

// Create moon geometry + material
// We use a simple gray sphere with a procedural normal-looking texture
function _createMoonMaterial() {
  // Procedural canvas texture to give the moon a subtle mottled appearance
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Base gray
  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, size, size);

  // Subtle crater-like spots
  const rng = () => Math.random();
  for (let i = 0; i < 200; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2 + rng() * 18;
    const brightness = 100 + Math.floor(rng() * 60);
    const alpha = 0.05 + rng() * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},${alpha})`;
    ctx.fill();
  }

  // Slightly darker maria regions (large dark patches)
  for (let i = 0; i < 8; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 20 + rng() * 40;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(60,60,60,${0.08 + rng() * 0.12})`;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.92,
    metalness: 0.0,
    color: 0xcccccc,
  });
}

export const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(MOON_WORLD_RADIUS, 32, 16),
  _createMoonMaterial()
);
moonMesh.renderOrder = 0;

// Subtle moonlight: a point light at the moon's position,
// intensity is modulated by lunar phase.
// Full moon produces very faint blue-white light on Earth night side.
export const moonLight = new THREE.PointLight(0xc8d8ff, 0.0, 600);
moonLight.decay = 0; // no distance decay — moonlight is essentially parallel at Earth scale

/**
 * Initialize: add moon mesh and moonlight to scene (not globeGroup).
 * @param {THREE.Scene} scene
 */
export function initMoon(scene) {
  scene.add(moonMesh);
  scene.add(moonLight);
  // Initial position update
  updateMoon(new Date());
}

/**
 * Update moon position and moonlight intensity for current date.
 * Call this every 30–60 seconds (moon moves slowly).
 * @param {Date} date
 */
export function updateMoon(date) {
  const { direction, distance } = getMoonPositionECI(date);
  const phase = getLunarPhase(date);

  // Scale direction by world distance (distance is in Earth radii, multiply by GLOBE_RADIUS)
  const worldPos = direction.clone().multiplyScalar(GLOBE_RADIUS * distance);
  moonMesh.position.copy(worldPos);

  // Moonlight position same as moon
  moonLight.position.copy(worldPos);

  // Moonlight intensity: full moon (phase~0.5) → max ~0.004, new moon → ~0
  // sin(phase * π) gives a smooth 0→1→0 curve over new→full→new
  const phaseIllumination = Math.sin(phase * Math.PI);
  moonLight.intensity = 0.004 * phaseIllumination * phaseIllumination;

  // The moon itself is lit by the sun — position it so sunlight falls on correct side.
  // The sun direction comes from the scene's directional lights;
  // the moon material will shade naturally because THREE.MeshStandardMaterial responds to lights.
}
