import * as THREE from "three";
import {
	EARTH_DAY_TEXTURE_URL,
	EARTH_NIGHT_TEXTURE_URL,
	EARTH_CLOUDS_TEXTURE_URL,
	EARTH_NORMAL_TEXTURE_URL,
	EARTH_SPECULAR_TEXTURE_URL,
	EARTH_HEIGHT_TEXTURE_URL,
} from "../constants.js";
import {
	earthMaterial,
	clouds,
	nightLights,
	textureLoader,
	controls,
	renderer,
} from "./scene.js";
import { updateMarkerMeshes } from "./markers.js";
import { weatherState } from "../state.js";
import { setStatus } from "../ui/index.js";

export function updateControlsForZoom() {
	const distance = controls.getDistance();
	// Rotate + zoom speed: inversely proportional to zoom level
	const aboveSurface = Math.max(0.001, distance - 4.2);
	const t = aboveSurface / (150 - 4.2); // 0 at surface, 1 at max
	// Rotate speed: slightly reduced overall, very slow near OSM
	if (aboveSurface < 0.6) {
		const f = aboveSurface / 0.6;
		controls.rotateSpeed = 0.003 + f * f * 0.08; // 0.003 → 0.08 in OSM zone
	} else {
		controls.rotateSpeed = 0.08 + Math.sqrt(t) * 0.32; // 0.08 near → 0.40 at far
	}
	// Zoom speed: very slow near surface, ramps up with distance
	if (distance < 6) {
		const f = aboveSurface / 1.8;
		controls.zoomSpeed = 0.05 + f * f * 0.25; // 0.05 → 0.30 quadratic
	} else if (distance < 20) {
		controls.zoomSpeed = 0.3 + ((distance - 6) / 14) * 0.5; // 0.30 → 0.80
	} else {
		controls.zoomSpeed = 0.8 + ((distance - 20) / 130) * 0.7; // 0.80 → 1.50
	}
	// Only rebuild marker matrices when markers are visible and zoom changed significantly
	if (
		weatherState.showMarkers &&
		(weatherState.lastDistanceForScale === null ||
			Math.abs(distance - weatherState.lastDistanceForScale) > 0.05)
	) {
		weatherState.lastDistanceForScale = distance;
		updateMarkerMeshes();
	}
}

export async function loadEarthTextures() {
	try {
		const [
			dayTexture,
			nightTexture,
			cloudsTexture,
			normalTexture,
			specularTexture,
			heightTexture,
		] = await Promise.all([
			textureLoader.loadAsync(EARTH_DAY_TEXTURE_URL),
			textureLoader.loadAsync(EARTH_NIGHT_TEXTURE_URL),
			textureLoader.loadAsync(EARTH_CLOUDS_TEXTURE_URL),
			textureLoader.loadAsync(EARTH_NORMAL_TEXTURE_URL),
			textureLoader.loadAsync(EARTH_SPECULAR_TEXTURE_URL),
			textureLoader.loadAsync(EARTH_HEIGHT_TEXTURE_URL),
		]);

		[dayTexture, nightTexture, cloudsTexture].forEach((texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
		});
		specularTexture.colorSpace = THREE.LinearSRGBColorSpace;
		specularTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
		normalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
		heightTexture.colorSpace = THREE.NoColorSpace;
		heightTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

		earthMaterial.map = dayTexture;
		earthMaterial.normalMap = normalTexture;
		earthMaterial.roughnessMap = specularTexture;
		earthMaterial.displacementMap = heightTexture;
		earthMaterial.displacementScale = 0.1;
		earthMaterial.displacementBias = -0.02;
		earthMaterial.onBeforeCompile = (shader) => {
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <roughnessmap_fragment>",
				`
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= 1.0 - texelRoughness.g * 0.40;
          roughnessFactor = max(roughnessFactor, 0.44);
        #endif
        `,
			);
		};
		earthMaterial.needsUpdate = true;

		clouds.material.map = cloudsTexture;
		clouds.material.needsUpdate = true;

		nightLights.material.uniforms.uNightTexture.value = nightTexture;
		nightLights.material.needsUpdate = true;
	} catch (error) {
		console.error(error);
		setStatus(
			"Texture Terra HD non disponibili. Rimane il rendering base del globo.",
		);
	}
}
