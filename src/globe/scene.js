import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLOBE_RADIUS, BASE_MARKER_RADIUS } from "../constants.js";
import { createNightLightsMaterial, createTerminatorMaterial, atmosphereMaterial } from "./shaders.js";
import { dom, weatherState } from "../state.js";
import { createStarField } from "../utils.js";

export const textureLoader = new THREE.TextureLoader();

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
dom.sceneRoot.append(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040b, 0.003);

export const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(1.6, 1.5, 12.8);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.minDistance = 7;
controls.maxDistance = 50;
controls.autoRotate = false;
controls.rotateSpeed = 0.42;

export const globeGroup = new THREE.Group();
globeGroup.position.x = 1.6;
scene.add(globeGroup);
controls.target.copy(globeGroup.position);

export const earthMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.72,
  metalness: 0.02,
  emissive: new THREE.Color("#0a1a30"),
  emissiveIntensity: 0.08,
  normalScale: new THREE.Vector2(3.5, 3.5)
});

export const earth = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 128, 128),
  earthMaterial
);
earth.renderOrder = 1;
globeGroup.add(earth);

export const nightLights = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 64),
  createNightLightsMaterial()
);
nightLights.renderOrder = 2;
globeGroup.add(nightLights);

export const terminatorOverlay = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 64),
  createTerminatorMaterial()
);
terminatorOverlay.renderOrder = 3;
globeGroup.add(terminatorOverlay);

export const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64),
  atmosphereMaterial
);
globeGroup.add(atmosphere);

export const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 48, 48),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    roughness: 1,
    metalness: 0
  })
);
clouds.renderOrder = 4;
globeGroup.add(clouds);
clouds.visible = weatherState.cloudMode === "aesthetic";

export const heatmapCanvas = document.createElement("canvas");
heatmapCanvas.width = 512;
heatmapCanvas.height = 256;
export const heatmapTexture = new THREE.CanvasTexture(heatmapCanvas);
heatmapTexture.colorSpace = THREE.SRGBColorSpace;
export const heatmapMaterial = new THREE.MeshBasicMaterial({
  map: heatmapTexture,
  transparent: true,
  opacity: 0.82,
  depthWrite: false
});
export const heatmapMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.038, 64, 32),
  heatmapMaterial
);
heatmapMesh.renderOrder = 3;
heatmapMesh.visible = false;
globeGroup.add(heatmapMesh);

export const cloudCoverCanvas = document.createElement("canvas");
cloudCoverCanvas.width = 512;
cloudCoverCanvas.height = 256;
export const cloudCoverTexture = new THREE.CanvasTexture(cloudCoverCanvas);
cloudCoverTexture.colorSpace = THREE.SRGBColorSpace;
export const cloudCoverMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.039, 64, 32),
  new THREE.MeshBasicMaterial({
    map: cloudCoverTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  })
);
cloudCoverMesh.renderOrder = 5;
cloudCoverMesh.visible = false;
globeGroup.add(cloudCoverMesh);

export const precipCanvas = document.createElement("canvas");
precipCanvas.width = 512;
precipCanvas.height = 256;
export const precipTexture = new THREE.CanvasTexture(precipCanvas);
precipTexture.colorSpace = THREE.SRGBColorSpace;
export const precipMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS * 1.041, 64, 32),
  new THREE.MeshBasicMaterial({
    map: precipTexture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  })
);
precipMesh.renderOrder = 6;
precipMesh.visible = false;
globeGroup.add(precipMesh);

export const starField = createStarField();
scene.add(starField);

// Equatorial ring — visible when axial tilt is active
export const equatorialRing = new THREE.Mesh(
  new THREE.TorusGeometry(GLOBE_RADIUS * 1.05, 0.025, 8, 128),
  new THREE.MeshBasicMaterial({
    color: 0x4499ff,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  })
);
// Torus by default lies in XY plane; rotate 90° around X to align with equatorial (XZ) plane
equatorialRing.rotation.x = Math.PI / 2;
equatorialRing.visible = false;
globeGroup.add(equatorialRing);

export const markerGeometry = new THREE.SphereGeometry(BASE_MARKER_RADIUS, 12, 12);
export const markerMaterial = new THREE.MeshBasicMaterial({
  toneMapped: false
});

// markers count will be set after weatherState.points is initialized in main.js
// We create it with a placeholder count of 1 and resize in main.js
export let markers = null;
export function initMarkers(count) {
  markers = new THREE.InstancedMesh(
    markerGeometry,
    markerMaterial,
    count
  );
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  globeGroup.add(markers);
  return markers;
}

export const selectedMarker = new THREE.Mesh(
  new THREE.SphereGeometry(BASE_MARKER_RADIUS, 16, 16),
  new THREE.MeshBasicMaterial({
    color: "#e8fbff",
    toneMapped: false
  })
);
selectedMarker.visible = false;
globeGroup.add(selectedMarker);

export const pointer = new THREE.Vector2(2, 2);
export const raycaster = new THREE.Raycaster();
export const worldPosition = new THREE.Vector3();
export const localPoint = new THREE.Vector3();
export const dummyObject = new THREE.Object3D();
export const tempColor = new THREE.Color();
