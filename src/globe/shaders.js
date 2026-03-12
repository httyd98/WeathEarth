import * as THREE from "three";

export function createTerminatorMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0.2, 0.2).normalize() }
    },
    vertexShader: `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      varying vec3 vNormal;

      void main() {
        float sun = dot(normalize(vNormal), normalize(uSunDirection));
        float night = 1.0 - smoothstep(-0.16, 0.08, sun);
        float edge = 1.0 - smoothstep(0.0, 0.08, abs(sun));
        vec3 color = vec3(0.01, 0.03, 0.08) * night + vec3(0.18, 0.32, 0.46) * edge * 0.08;
        float alpha = night * 0.32 + edge * 0.04;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

export function createNightLightsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0.2, 0.2).normalize() },
      uNightTexture: { value: null }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform sampler2D uNightTexture;
      varying vec3 vNormal;
      varying vec2 vUv;

      void main() {
        float sun = dot(normalize(vNormal), normalize(uSunDirection));
        float night = 1.0 - smoothstep(-0.12, 0.04, sun);
        vec3 lights = texture2D(uNightTexture, vUv).rgb;
        gl_FragColor = vec4(lights * 0.95, night * 0.48);
      }
    `
  });
}

export const atmosphereMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uGlowColor: { value: new THREE.Color("#57c7ff") }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uGlowColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      float intensity = pow(0.8 - dot(normalize(vViewPosition), normalize(vNormal)), 3.2);
      gl_FragColor = vec4(uGlowColor, intensity * 0.5);
    }
  `
});
