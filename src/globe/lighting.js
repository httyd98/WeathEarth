import * as THREE from "three";
import { weatherState } from "../state.js";
import {
  terminatorOverlay,
  nightLights,
  earthMaterial,
  globeGroup,
  camera,
  scene
} from "./scene.js";

export const ambientLight = new THREE.AmbientLight(0xb6d5ff, 0.46);
scene.add(ambientLight);

export const hemisphereLight = new THREE.HemisphereLight(0xdff4ff, 0x173457, 0.4);
scene.add(hemisphereLight);

export const sunlight = new THREE.DirectionalLight(0xf8fcff, 3.4);
sunlight.position.set(10, 3, 8);
scene.add(sunlight);

export const fillLight = new THREE.DirectionalLight(0x8ed8ff, 0.28);
fillLight.position.set(-4, 1.5, 8);
scene.add(fillLight);

export function getSunDirection(date) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const currentDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const dayOfYear = (currentDay - startOfYear) / 86400000;
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const subsolarLongitudeDegrees = (720 - utcMinutes - equationOfTime) / 4;
  const subsolarLongitude = THREE.MathUtils.degToRad(subsolarLongitudeDegrees);
  const cosDeclination = Math.cos(declination);

  return new THREE.Vector3(
    cosDeclination * Math.cos(subsolarLongitude),
    Math.sin(declination),
    -cosDeclination * Math.sin(subsolarLongitude)
  ).normalize();
}

export function updateSunDirection() {
  const now = new Date();
  const physicalSunVector = getSunDirection(now);
  const cameraBias = camera.position.clone().sub(globeGroup.position).normalize();
  terminatorOverlay.material.uniforms.uSunDirection.value.copy(physicalSunVector);
  nightLights.material.uniforms.uSunDirection.value.copy(physicalSunVector);

  if (weatherState.showTerminator) {
    sunlight.position.copy(physicalSunVector.clone().multiplyScalar(18));
    fillLight.position.copy(cameraBias.clone().multiplyScalar(8));
  } else {
    sunlight.position.copy(cameraBias.clone().multiplyScalar(16));
    fillLight.position.set(-5, 2, 7);
  }
}

export function applyLightingMode() {
  if (weatherState.showTerminator) {
    ambientLight.intensity = 0.38;
    hemisphereLight.intensity = 0.28;
    sunlight.intensity = 2.65;
    fillLight.intensity = 0;
    earthMaterial.emissiveIntensity = 0.08;
    terminatorOverlay.visible = true;
    nightLights.visible = true;
  } else {
    ambientLight.intensity = 1.05;
    hemisphereLight.intensity = 0.8;
    sunlight.intensity = 1.5;
    fillLight.intensity = 0.28;
    earthMaterial.emissiveIntensity = 0.12;
    terminatorOverlay.visible = false;
    nightLights.visible = false;
  }
}
