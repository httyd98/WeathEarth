/**
 * Earth Interior Visualization
 *
 * Clips the globe with a single plane (z=0) to remove the front half,
 * revealing concentric internal layers as a clean half-sphere cross-section.
 *
 * Layer radii (PREM model, scaled to GLOBE_RADIUS = 4.2):
 *   Inner core boundary (ICB):   1220 km → 0.804 u
 *   Core-Mantle Boundary (CMB):  3480 km → 2.293 u
 *   660 km discontinuity:        5711 km → 3.762 u
 *   Mohorovičić discontinuity:   6336 km → 4.177 u
 *   Earth surface:               6371 km → 4.200 u
 *
 * The inner core is NOT clipped — it renders as a complete sphere protruding
 * from the cross-section, representing the solid iron-nickel ball.
 *
 * Layers use animated procedural ShaderMaterials:
 *   - Inner core: crystalline metallic shimmer (solid iron-nickel, ~5400 °C)
 *   - Outer core: flowing liquid metal convection (molten iron, ~4000 °C)
 *   - Lower mantle: slow viscous magma currents (~2000 °C)
 *   - Upper mantle: subtle rocky convection (~900 °C)
 *
 * Info labels are floating 3D Sprite cards connected by lines to each layer.
 */

import * as THREE from "three";
import { GLOBE_RADIUS } from "../constants.js";
import {
  renderer, globeGroup,
  earth, earthMaterial,
  clouds, heatmapMesh, cloudCoverMesh, precipMesh,
  nightLights, terminatorOverlay
} from "./scene.js";

// ── Scientifically accurate layer radii ──────────────────────────────────────
const EARTH_KM = 6371;
const R = GLOBE_RADIUS; // 4.2
const R_INNER_CORE   = (1220 / EARTH_KM) * R;  // 0.804
const R_OUTER_CORE   = (3480 / EARTH_KM) * R;  // 2.293
const R_LOWER_MANTLE = (5711 / EARTH_KM) * R;  // 3.762
const R_UPPER_MANTLE = (6336 / EARTH_KM) * R;  // 4.177

// ── Single clip plane: removes front half (z > 0) ───────────────────────────
const _CLIP_PLANE  = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const _CLIP_PLANES = [_CLIP_PLANE];

// ── Module state ──────────────────────────────────────────────────────────────
let _initialized = false;
let _layerMeshes = [];
let _capMesh     = null;
let _labelSprites = [];
let _labelLines   = [];
let _prevNightLightsVisible = true;
let _prevTerminatorVisible  = true;
// Per-layer full-sphere mode (independent of cross-section view)
const _layerFullSphere = [false, false, false, false];

// ── Layer info for labels ────────────────────────────────────────────────────
const LAYER_INFO = [
  { name: "Crosta",         km: "0 – 35 km",      temp: "~15 °C",    outerR: R,              innerR: R_UPPER_MANTLE },
  { name: "Mantello sup.",  km: "35 – 660 km",     temp: "~900 °C",   outerR: R_UPPER_MANTLE, innerR: R_LOWER_MANTLE },
  { name: "Mantello inf.",  km: "660 – 2891 km",   temp: "~2000 °C",  outerR: R_LOWER_MANTLE, innerR: R_OUTER_CORE },
  { name: "Nucleo esterno", km: "2891 – 5150 km",  temp: "~4000 °C",  outerR: R_OUTER_CORE,   innerR: R_INNER_CORE },
  { name: "Nucleo interno", km: "5150 – 6371 km",  temp: "~5400 °C",  outerR: R_INNER_CORE,   innerR: 0 },
];

// ══════════════════════════════════════════════════════════════════════════════
// ANIMATED PROCEDURAL SHADERS
// ══════════════════════════════════════════════════════════════════════════════

// Shared noise GLSL — 3D simplex noise (Ashima Arts)
const NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  float fbm(vec3 p, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      v += a * snoise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }
`;

// Vertex shader WITHOUT clipping (inner core — renders as full sphere)
const LAYER_VERT_NOCLIP = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vObjPos;

  void main() {
    vObjPos = position;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Vertex shader WITH clipping support (outer core, mantles)
const LAYER_VERT_CLIP = `
  #include <clipping_planes_pars_vertex>
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vObjPos;

  void main() {
    vObjPos = position;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// Fragment preamble for clipping support
const CLIP_FRAG_PARS = `#include <clipping_planes_pars_fragment>\n`;
const CLIP_FRAG_MAIN = `  #include <clipping_planes_fragment>\n`;

// ── Inner core: crystalline metallic shimmer ─────────────────────────────────
// Solid iron-nickel at ~5400°C — subtle pulsing glow, metallic grain
function _createInnerCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: LAYER_VERT_NOCLIP,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vObjPos;
      ${NOISE_GLSL}

      void main() {
        vec3 p = vObjPos * 6.0;

        // Crystalline grain structure
        float grain = snoise(p * 3.0 + uTime * 0.05) * 0.5 + 0.5;
        float grain2 = snoise(p * 8.0 - uTime * 0.03) * 0.5 + 0.5;

        // Slow metallic pulse
        float pulse = sin(uTime * 0.4) * 0.08 + 0.92;

        // Base: bright golden metallic (hottest layer — ~5400°C)
        vec3 colDark = vec3(0.50, 0.35, 0.12);
        vec3 colBright = vec3(0.85, 0.60, 0.22);

        vec3 col = mix(colDark, colBright, grain * 0.6 + grain2 * 0.4);
        col *= pulse;

        // Intense hot spots
        float hot = pow(snoise(p * 2.0 + uTime * 0.1) * 0.5 + 0.5, 3.0);
        col += vec3(0.35, 0.15, 0.03) * hot;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    // NO clipping planes — inner core renders as full sphere
  });
}

// ── Outer core: flowing liquid metal ─────────────────────────────────────────
// Molten iron at ~4000°C — turbulent convective flow patterns
function _createOuterCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: LAYER_VERT_CLIP,
    fragmentShader: `
      ${CLIP_FRAG_PARS}
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vObjPos;
      ${NOISE_GLSL}

      void main() {
      ${CLIP_FRAG_MAIN}
        vec3 p = vObjPos * 3.0;

        // Flowing liquid metal — turbulent convection
        float flow1 = fbm(p + vec3(uTime * 0.08, uTime * 0.05, -uTime * 0.03), 4);
        float flow2 = fbm(p * 1.5 - vec3(uTime * 0.06, -uTime * 0.04, uTime * 0.07), 3);

        // Swirling vortex effect
        float swirl = snoise(vec3(p.xy * 2.0 + flow1 * 0.5, p.z + uTime * 0.1));

        float t = flow1 * 0.5 + flow2 * 0.3 + swirl * 0.2 + 0.5;
        t = clamp(t, 0.0, 1.0);

        // Molten orange-red (bright liquid metal — ~4000°C)
        vec3 colCool = vec3(0.35, 0.12, 0.04);
        vec3 colWarm = vec3(0.55, 0.22, 0.06);
        vec3 colHot  = vec3(0.80, 0.35, 0.08);

        vec3 col = mix(colCool, colWarm, smoothstep(0.2, 0.5, t));
        col = mix(col, colHot, smoothstep(0.6, 0.9, t));

        // Bright veins of liquid metal
        float veins = pow(max(swirl * 0.5 + 0.5, 0.0), 4.0);
        col += vec3(0.35, 0.14, 0.03) * veins;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    clipping: true,
    clippingPlanes: _CLIP_PLANES,
    clipIntersection: false,
  });
}

// ── Lower mantle: viscous magma currents ─────────────────────────────────────
// Slow-moving silicate magma at ~2000°C
function _createLowerMantleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: LAYER_VERT_CLIP,
    fragmentShader: `
      ${CLIP_FRAG_PARS}
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vObjPos;
      ${NOISE_GLSL}

      void main() {
      ${CLIP_FRAG_MAIN}
        vec3 p = vObjPos * 2.5;

        // Very slow convection — viscous magma
        float conv = fbm(p + vec3(uTime * 0.03, uTime * 0.02, -uTime * 0.015), 4);
        float detail = snoise(p * 4.0 + vec3(0.0, uTime * 0.04, 0.0)) * 0.5 + 0.5;

        float t = conv * 0.7 + detail * 0.3 + 0.5;
        t = clamp(t, 0.0, 1.0);

        // Deep red magma (~2000°C — moderately bright)
        vec3 colCold = vec3(0.22, 0.10, 0.05);
        vec3 colWarm = vec3(0.38, 0.16, 0.06);
        vec3 colHot  = vec3(0.55, 0.22, 0.06);

        vec3 col = mix(colCold, colWarm, smoothstep(0.2, 0.5, t));
        col = mix(col, colHot, smoothstep(0.65, 0.95, t));

        // Glowing cracks
        float cracks = pow(max(snoise(p * 6.0 + uTime * 0.02) * 0.5 + 0.5, 0.0), 5.0);
        col += vec3(0.20, 0.08, 0.02) * cracks;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    clipping: true,
    clippingPlanes: _CLIP_PLANES,
    clipIntersection: false,
  });
}

// ── Upper mantle: subtle rocky convection ────────────────────────────────────
// Partially molten peridotite at ~900°C
function _createUpperMantleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: LAYER_VERT_CLIP,
    fragmentShader: `
      ${CLIP_FRAG_PARS}
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vObjPos;
      ${NOISE_GLSL}

      void main() {
      ${CLIP_FRAG_MAIN}
        vec3 p = vObjPos * 2.0;

        // Very slow — mostly solid, slight convection
        float conv = fbm(p + vec3(uTime * 0.015, -uTime * 0.01, uTime * 0.008), 3);
        float rock = snoise(p * 5.0) * 0.5 + 0.5;

        float t = conv * 0.5 + rock * 0.5 + 0.5;
        t = clamp(t, 0.0, 1.0);

        // Olive-brown rocky mantle (~900°C — dimmer than lower layers)
        vec3 colDark = vec3(0.12, 0.14, 0.08);
        vec3 colMid  = vec3(0.22, 0.16, 0.09);
        vec3 colWarm = vec3(0.32, 0.20, 0.10);

        vec3 col = mix(colDark, colMid, smoothstep(0.2, 0.5, t));
        col = mix(col, colWarm, smoothstep(0.6, 0.9, t));

        // Faint hot streaks
        float streaks = pow(max(snoise(p * 3.0 + vec3(uTime * 0.02, 0.0, 0.0)) * 0.5 + 0.5, 0.0), 6.0);
        col += vec3(0.10, 0.04, 0.01) * streaks;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    clipping: true,
    clippingPlanes: _CLIP_PLANES,
    clipIntersection: false,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CAP TEXTURE (flat cross-section disc)
// ══════════════════════════════════════════════════════════════════════════════

function _createCapTexture() {
  const SIZE = 1024;
  const canvas = document.createElement("canvas");
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const cx  = SIZE / 2;
  const cy  = SIZE / 2;
  const maxR = SIZE / 2 - 2;

  ctx.clearRect(0, 0, SIZE, SIZE);

  // Concentric layer fills — from outermost to innermost
  const layers = [
    { r: 1.000, color: "#1A262B" },  // crust — near-black slate
    { r: 0.940, color: "#121E10" },  // upper mantle
    { r: R_LOWER_MANTLE / R, color: "#22150A" },  // lower mantle
    { r: R_OUTER_CORE / R,   color: "#281008" },  // outer core
    { r: R_INNER_CORE / R,   color: "#2E2510" },  // inner core
  ];

  for (const { r, color } of layers) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * maxR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Subtle radial glow toward core
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, (R_OUTER_CORE / R) * maxR);
  grd.addColorStop(0,   "rgba(120, 90, 30, 0.08)");
  grd.addColorStop(0.5, "rgba(80, 30, 10, 0.03)");
  grd.addColorStop(1.0, "rgba(0, 0, 0, 0)");
  ctx.beginPath();
  ctx.arc(cx, cy, (R_OUTER_CORE / R) * maxR, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // Boundary rings — thicker and more visible
  ctx.lineWidth = 2.5;
  for (const { r } of layers.slice(1)) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * maxR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3D LABEL SPRITES
// ══════════════════════════════════════════════════════════════════════════════

function _createLabelTexture(name, km, temp) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Dark semi-transparent card background
  ctx.fillStyle = "rgba(4, 8, 20, 0.95)";
  _roundRect(ctx, 2, 2, 508, 124, 14);
  ctx.fill();

  // Visible border — thicker and brighter
  ctx.strokeStyle = "rgba(120, 180, 255, 0.55)";
  ctx.lineWidth = 3;
  _roundRect(ctx, 2, 2, 508, 124, 14);
  ctx.stroke();

  // Layer name — bright white
  ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
  ctx.font = 'bold 32px "IBM Plex Mono", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(name, 20, 18);

  // Depth + temperature — brighter
  ctx.fillStyle = "rgba(190, 215, 255, 0.88)";
  ctx.font = '24px "IBM Plex Mono", monospace';
  ctx.fillText(`${km}  ·  ${temp}`, 20, 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function _createLabelSprite(info) {
  const tex = _createLabelTexture(info.name, info.km, info.temp);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1); // card aspect ratio 4:1
  sprite.renderOrder = 25;
  sprite.visible = false;
  return sprite;
}

/**
 * Create a connecting line as a thin cylinder (tube) so it has visible thickness
 * on all platforms (LineBasicMaterial lineWidth only works on some backends).
 */
function _createConnectingLine(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);

  // Thin cylinder as the line
  const geom = new THREE.CylinderGeometry(0.012, 0.012, length, 4, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8CC4E8,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geom, mat);

  // Orient cylinder along from→to direction
  mesh.position.copy(mid);
  const axis = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(axis, dir.normalize());
  mesh.quaternion.copy(quat);

  mesh.renderOrder = 24;
  mesh.visible = false;
  return mesh;
}

function _buildLabels() {
  const labelX = R + 2.0;
  const yTop = 2.0;
  const yStep = -1.0;
  const labelZ = 0.08;

  for (let i = 0; i < LAYER_INFO.length; i++) {
    const info = LAYER_INFO[i];
    const midR = (info.outerR + info.innerR) / 2;
    const labelY = yTop + i * yStep;

    const anchor = new THREE.Vector3(midR, 0, labelZ);
    const labelPos = new THREE.Vector3(labelX, labelY, labelZ);

    const sprite = _createLabelSprite(info);
    sprite.position.copy(labelPos);
    globeGroup.add(sprite);
    _labelSprites.push(sprite);

    const line = _createConnectingLine(anchor, labelPos);
    globeGroup.add(line);
    _labelLines.push(line);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeAnimatedLayerSphere(radius, material, renderOrder) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), material);
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  globeGroup.add(mesh);
  return mesh;
}

function _makeCapDisc() {
  const tex = _createCapTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false, // bypass ACES tone mapping — keep exact dark colors
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  // Reduced segments: 128 instead of 256
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(R, 128), mat);
  mesh.position.z = 0.01;
  mesh.renderOrder = 20;
  mesh.visible = false;
  globeGroup.add(mesh);
  return mesh;
}

function _setClip(mat, apply) {
  if (!mat) return;
  mat.clippingPlanes  = apply ? _CLIP_PLANES : [];
  mat.clipIntersection = false;
  mat.needsUpdate      = true;
}

function _applyOuterClipping(apply) {
  const targets = [
    earthMaterial,
    clouds.material,
    heatmapMesh.material,
    cloudCoverMesh.material,
    precipMesh.material,
  ];
  for (const mat of targets) _setClip(mat, apply);

  const tzMesh = globeGroup.children.find(
    (c) => c.material?.map && c.geometry?.type === "SphereGeometry" && c.renderOrder === 9
  );
  if (tzMesh) _setClip(tzMesh.material, apply);

  const wpMesh = globeGroup.children.find(
    (c) => c.isPoints && c.renderOrder === 7
  );
  if (wpMesh) _setClip(wpMesh.material, apply);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initEarthInterior() {
  if (_initialized) return;
  _initialized = true;

  // Layers from outermost to innermost
  // Upper mantle, lower mantle, outer core use clipping planes
  // Inner core does NOT clip — renders as full solid sphere
  _layerMeshes.push(_makeAnimatedLayerSphere(R_UPPER_MANTLE, _createUpperMantleMaterial(), 1));
  _layerMeshes.push(_makeAnimatedLayerSphere(R_LOWER_MANTLE, _createLowerMantleMaterial(), 2));
  _layerMeshes.push(_makeAnimatedLayerSphere(R_OUTER_CORE,   _createOuterCoreMaterial(),   3));
  _layerMeshes.push(_makeAnimatedLayerSphere(R_INNER_CORE,   _createInnerCoreMaterial(),   4));

  _capMesh = _makeCapDisc();
  _buildLabels();
}

export function enableEarthInterior() {
  if (!_initialized) initEarthInterior();

  renderer.localClippingEnabled = true;
  _applyOuterClipping(true);

  _prevNightLightsVisible  = nightLights.visible;
  _prevTerminatorVisible   = terminatorOverlay.visible;
  nightLights.visible      = false;
  terminatorOverlay.visible = false;

  // Show all layers; restore clipping for layers NOT in full-sphere mode
  for (let i = 0; i < _layerMeshes.length; i++) {
    _layerMeshes[i].visible = true;
    if (!_layerFullSphere[i] && i < 3) {
      const mat = _layerMeshes[i].material;
      mat.clippingPlanes = _CLIP_PLANES;
      mat.clipping = true;
      mat.needsUpdate = true;
    }
  }
  _capMesh.visible = true;
  for (const s of _labelSprites) s.visible = true;
  for (const l of _labelLines) l.visible = true;
}

export function disableEarthInterior() {
  if (!_initialized) return;

  _applyOuterClipping(false);

  nightLights.visible       = _prevNightLightsVisible;
  terminatorOverlay.visible = _prevTerminatorVisible;

  // Hide cross-section elements, but preserve layers in full-sphere mode
  for (let i = 0; i < _layerMeshes.length; i++) {
    if (!_layerFullSphere[i]) {
      _layerMeshes[i].visible = false;
    }
  }
  _capMesh.visible = false;
  for (const s of _labelSprites) s.visible = false;
  for (const l of _labelLines) l.visible = false;

  // Only disable clipping if no full-sphere layers need it suppressed
  if (!_layerFullSphere.some(Boolean)) {
    renderer.localClippingEnabled = false;
  }
}

/**
 * Toggle a layer into full-sphere mode (unclipped, visible as a complete animated sphere)
 * or hide it. This is independent of the cross-section view.
 * @param {number} index 0=upper mantle, 1=lower mantle, 2=outer core, 3=inner core
 * @param {boolean} showFull true = show as full sphere, false = hide full sphere
 */
export function toggleLayerVisibility(index, showFull) {
  if (!_initialized || index < 0 || index >= _layerMeshes.length) return;

  _layerFullSphere[index] = showFull;
  const mesh = _layerMeshes[index];
  const mat = mesh.material;

  if (showFull) {
    // Show as full unclipped animated sphere
    mesh.visible = true;
    renderer.localClippingEnabled = true;
    // Remove clipping so it renders as a complete sphere
    if (index < 3) { // layers 0-2 normally have clipping; layer 3 (inner core) never clips
      mat.clippingPlanes = [];
      mat.clipping = false;
      mat.needsUpdate = true;
    }
  } else {
    // If cross-section is active, restore clipped state; otherwise hide
    const crossSectionActive = _capMesh?.visible;
    if (crossSectionActive) {
      mesh.visible = true;
      if (index < 3) {
        mat.clippingPlanes = _CLIP_PLANES;
        mat.clipping = true;
        mat.needsUpdate = true;
      }
    } else {
      mesh.visible = false;
      if (index < 3) {
        mat.clippingPlanes = _CLIP_PLANES;
        mat.clipping = true;
        mat.needsUpdate = true;
      }
    }
  }
}

/**
 * Check if any layer is in full-sphere mode (for animate loop).
 */
export function hasActiveFullSphereLayers() {
  return _layerFullSphere.some(Boolean);
}

/**
 * Per-frame update — advances animated shader uniforms.
 * Call from animate() only when earth interior is visible or full-sphere layers are active.
 */
export function updateEarthInterior(dt) {
  if (!_initialized) return;
  for (const mesh of _layerMeshes) {
    if (mesh.visible && mesh.material.uniforms?.uTime) {
      mesh.material.uniforms.uTime.value += dt;
    }
  }
}
