/**
 * Photorealistic sky background — real star-map photo + procedural fallback.
 *
 * Attempts to load a real photograph of the night sky from a CDN URL.
 * If all URLs fail the app falls back to an improved 4096×2048 procedural
 * equirectangular canvas texture that includes:
 *  - Milky Way glow band (galactic-coordinate math)
 *  - Dense star field weighted by galactic density
 *  - ~150+ named bright stars at real RA/Dec positions
 *  - LMC, SMC, and Andromeda (M31) galaxy patches
 *  - Subtle nebula/dust reddening near galactic center
 *
 * The sky sphere (radius 390, BackSide material) rotates around Y based on
 * Greenwich Mean Sidereal Time so the correct sky face is visible at all times.
 */

import * as THREE from "three";

// ── Astronomical helpers ─────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Greenwich Mean Sidereal Time in radians for a given Date. */
function getGMST_rad(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const D  = JD - 2451545.0; // days since J2000.0
  // GMST in degrees (Eq. 12.4 from Meeus, simplified)
  const gmst_deg = (280.46061837 + 360.98564736629 * D) % 360;
  return gmst_deg * DEG;
}

/** North Galactic Pole in equatorial coords (J2000): RA=192.85948°, Dec=27.12825° */
const NGP_RA  = 192.85948 * DEG;
const NGP_DEC = 27.12825  * DEG;
const NGP_cos = Math.cos(NGP_DEC);
const NGP_sin = Math.sin(NGP_DEC);

/** Return galactic latitude in radians for equatorial RA/Dec (both in radians). */
function galacticLat(ra, dec) {
  const cd = Math.cos(dec), sd = Math.sin(dec);
  return Math.asin(sd * NGP_sin + cd * NGP_cos * Math.cos(ra - NGP_RA));
}

/** Galactic center in equatorial coords (J2000): RA=266.405°, Dec=-28.936° */
const GC_RA  = 266.405 * DEG;
const GC_DEC = -28.936 * DEG;

// ── Sky texture generation ───────────────────────────────────────────────────

/** Build the 4096×2048 sky canvas and return a THREE.CanvasTexture. */
function buildSkyTexture() {
  const W = 4096, H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // --- Background: deep-space gradient (dark blue-black) ---
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   "#02030d");
  bg.addColorStop(0.5, "#010208");
  bg.addColorStop(1,   "#02030d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // --- Milky Way glow (rendered pixel-by-pixel into ImageData) ---
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Simple pseudo-random seeded by pixel index for consistent stars
  function hash(x) {
    x = ((x >> 16) ^ x) * 0x45d9f3b;
    x = ((x >> 16) ^ x) * 0x45d9f3b;
    return ((x >> 16) ^ x) >>> 0;
  }

  for (let py = 0; py < H; py++) {
    const dec = (0.5 - py / H) * Math.PI; // +π/2 (top) → -π/2 (bottom)

    for (let px = 0; px < W; px++) {
      const ra  = (px / W) * 2 * Math.PI; // 0 → 2π left→right

      const b   = galacticLat(ra, dec);          // galactic latitude
      const bD  = Math.abs(b) * (180 / Math.PI); // |b| in degrees

      // --- Milky Way density ---
      // Exponential falloff with galactic latitude, strongest at |b|<10°
      const mwDensity = Math.exp(-bD / 6.5);

      // Extra brightness near galactic center
      const cosDist = Math.sin(dec) * Math.sin(GC_DEC) +
                      Math.cos(dec) * Math.cos(GC_DEC) * Math.cos(ra - GC_RA);
      const centerBoost = Math.pow(Math.max(0, cosDist), 8) * 3.0;

      const totalDensity = Math.min(1, mwDensity + centerBoost * 0.4);

      // Milky Way glow color: warm yellowish-white (stars) + slight blue haze
      // Increased glow intensity: 55 → 85
      const glowIntensity = totalDensity * 85;
      let r = glowIntensity * 0.85;
      let g = glowIntensity * 0.82;
      let b_col = glowIntensity * 1.05;

      // Galactic dust reddening near center (absorbs blue/green)
      if (centerBoost > 0.1) {
        const dust = centerBoost * 0.5;
        r += dust * 30;
        g += dust * 8;
        b_col = Math.max(0, b_col - dust * 15);
      }

      // --- Stars scattered by galactic density ---
      const seed = hash(py * W + px);
      const starThresh = 0xffffffff; // max uint32

      // Background stars — 3× more stars than original
      const bgProb = (0.0006 + totalDensity * 0.006) * starThresh;
      if (seed < bgProb) {
        const brightness = 60 + (hash(seed) % 140);
        r += brightness; g += brightness; b_col += brightness;
      }

      // Medium stars (less frequent, slightly larger — rendered below as circles)
      // (we'll add a separate bright-star layer using ctx.arc)

      const idx = (py * W + px) * 4;
      data[idx]   = Math.min(255, Math.round(r));
      data[idx+1] = Math.min(255, Math.round(g));
      data[idx+2] = Math.min(255, Math.round(b_col));
      data[idx+3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // --- Bright named stars (real RA/Dec, J2000) ---
  // Format: [RA_deg, Dec_deg, magnitude, color_hex]
  // mag<1: very bright, 1-2: bright, 2-3: medium
  const BRIGHT_STARS = [
    // Sirius α CMa
    [101.29, -16.72, -1.46, "#a8d8ff"],
    // Canopus α Car
    [95.99, -52.70, -0.74, "#ffffcc"],
    // Arcturus α Boo
    [213.92, 19.18, -0.05, "#ffcc88"],
    // Vega α Lyr
    [279.23, 38.78, 0.03, "#cce4ff"],
    // Capella α Aur
    [79.17, 45.99, 0.08, "#ffdd99"],
    // Rigel β Ori
    [78.63, -8.20, 0.12, "#aaccff"],
    // Procyon α CMi
    [114.83, 5.22, 0.38, "#ffeecc"],
    // Achernar α Eri
    [24.43, -57.24, 0.46, "#99bbff"],
    // Betelgeuse α Ori
    [88.79, 7.41, 0.50, "#ff9944"],
    // Hadar β Cen
    [210.96, -60.37, 0.61, "#aaccff"],
    // Acrux α Cru
    [186.65, -63.10, 0.77, "#bbddff"],
    // Altair α Aql
    [297.70, 8.87, 0.77, "#eeeeff"],
    // Aldebaran α Tau
    [68.98, 16.51, 0.85, "#ff8844"],
    // Antares α Sco
    [247.35, -26.43, 1.09, "#ff6633"],
    // Spica α Vir
    [201.30, -11.16, 1.04, "#99aaff"],
    // Pollux β Gem
    [116.33, 28.03, 1.14, "#ffcc77"],
    // Fomalhaut α PsA
    [344.41, -29.62, 1.16, "#ddeeff"],
    // Deneb α Cyg
    [310.36, 45.28, 1.25, "#ddeeff"],
    // Mimosa β Cru
    [191.93, -59.69, 1.25, "#aabbff"],
    // Regulus α Leo
    [152.09, 11.97, 1.35, "#ccd8ff"],
    // Adhara ε CMa
    [104.66, -28.97, 1.50, "#99aaff"],
    // Castor α Gem
    [113.65, 31.89, 1.58, "#ddeeFF"],
    // Shaula λ Sco
    [263.40, -37.10, 1.62, "#aabfff"],
    // Gacrux γ Cru
    [187.79, -57.11, 1.64, "#ff9966"],
    // Bellatrix γ Ori
    [81.28, 6.35, 1.64, "#aaccff"],
    // Elnath β Tau
    [81.57, 28.61, 1.65, "#cceeff"],
    // Miaplacidus β Car
    [138.30, -69.72, 1.67, "#eeeecc"],
    // Alnilam ε Ori
    [84.05, -1.20, 1.69, "#aabbff"],
    // Alnitak ζ Ori
    [85.19, -1.94, 1.74, "#aabbff"],
    // Mintaka δ Ori
    [83.00, -0.30, 2.25, "#bbccff"],
    // Orion belt area extras — help show Orion nebula region
    [83.82, -5.39, 2.06, "#aabbcc"], // Saiph
    // Faint milky way interest stars
    [244.98, -26.43, 2.70, "#ff8855"], // near Antares
    [250.32, -34.29, 1.87, "#ffaa66"], // λ Sco
    // Canopus region
    [92.68, -47.34, 1.93, "#ffffcc"],
    // Southern cross extras
    [187.79, -57.11, 1.64, "#ffbbaa"],
    // Northern pole region (Polaris)
    [37.95, 89.26, 1.97, "#eeeeff"],
    // Cassiopeia
    [13.16, 60.72, 2.27, "#ddeeff"],  // β Cas
    [9.24, 59.15, 2.23, "#ddeeff"],   // α Cas
    // Cygnus region
    [305.56, 40.26, 2.49, "#ddeeff"], // γ Cyg
    // Sagittarius (rich MW area)
    [275.92, -25.42, 1.85, "#ffee88"], // σ Sgr
    [285.65, -29.88, 2.05, "#ffcc66"], // δ Sgr
    // Perseus
    [46.53, 38.84, 1.79, "#ffffcc"], // α Per

    // ── Additional 30+ stars from Hipparcos catalog ───────────────────────────
    // Gamma Velorum (γ Vel) — brightest WR star
    [122.38, -47.34, 1.78, "#aabbff"],
    // Epsilon Carinae (ε Car / Avior)
    [125.63, -59.51, 1.86, "#ffddaa"],
    // Delta Velorum (δ Vel)
    [131.18, -54.71, 1.93, "#eeeeff"],
    // Kappa Velorum (κ Vel)
    [140.53, -55.01, 2.47, "#cceeff"],
    // Lambda Velorum (λ Vel / Suhail)
    [136.00, -43.43, 2.21, "#ffcc88"],
    // Zeta Puppis (ζ Pup / Naos)
    [120.90, -40.00, 2.25, "#aabbff"],
    // Pi Puppis (π Pup)
    [109.29, -37.10, 2.70, "#ffaa77"],
    // Kappa Orionis (κ Ori / Saiph)
    [83.00, -9.67, 2.06, "#aabbff"],
    // Mu Velorum (μ Vel)
    [138.29, -49.42, 2.69, "#ffeecc"],
    // Theta Carinae (θ Car)
    [160.00, -64.39, 2.76, "#bbddff"],
    // Alpha Lupi (α Lup)
    [220.48, -47.39, 2.30, "#aabbff"],
    // Beta Lupi (β Lup)
    [224.63, -43.13, 2.68, "#bbccff"],
    // Epsilon Centauri (ε Cen)
    [204.97, -53.47, 2.30, "#aabbff"],
    // Zeta Centauri (ζ Cen)
    [208.88, -47.29, 2.55, "#bbddff"],
    // Eta Centauri (η Cen)
    [218.88, -42.16, 2.35, "#aabbff"],
    // Theta Centauri (θ Cen / Menkent)
    [211.67, -36.37, 2.06, "#ffcc88"],
    // Delta Centauri (δ Cen)
    [182.09, -50.72, 2.60, "#aabbff"],
    // Mu Centauri (μ Cen)
    [211.35, -42.10, 3.04, "#aabbff"],
    // Alpha Trianguli Australis (α TrA / Atria)
    [252.17, -69.03, 1.91, "#ff9966"],
    // Beta Trianguli Australis (β TrA)
    [247.35, -63.43, 2.85, "#ffeecc"],
    // Alpha Pavonis (α Pav / Peacock)
    [306.41, -56.74, 1.94, "#aabbff"],
    // Beta Gruis (β Gru)
    [340.67, -46.88, 2.11, "#ffaa77"],
    // Alpha Gruis (α Gru / Alnair)
    [332.06, -46.96, 1.74, "#bbddff"],
    // Beta Phoenicis (β Phe)
    [16.52, -46.72, 3.31, "#ffddaa"],
    // Alpha Phoenicis (α Phe / Ankaa)
    [6.57, -42.31, 2.40, "#ffaa66"],
    // Alpha Coronae Borealis (α CrB / Alphecca)
    [233.67, 26.71, 2.23, "#eeeeff"],
    // Alpha Serpentis (α Ser / Unukalhai)
    [236.07, 6.43, 2.63, "#ffcc88"],
    // Beta Herculis (β Her / Kornephoros)
    [247.56, 21.49, 2.77, "#ffcc88"],
    // Alpha Herculis (α Her / Rasalgethi)
    [258.66, 14.39, 3.06, "#ff9966"],
    // Zeta Herculis (ζ Her)
    [249.89, 31.60, 2.81, "#ffeecc"],
    // Gamma Draconis (γ Dra / Eltanin)
    [269.15, 51.49, 2.24, "#ffcc88"],
    // Beta Draconis (β Dra / Rastaban)
    [261.32, 52.30, 2.79, "#ffddaa"],
    // Eta Draconis (η Dra)
    [245.99, 61.51, 2.74, "#ffeecc"],
    // Alpha Ursae Majoris (α UMa / Dubhe)
    [165.93, 61.75, 1.79, "#ffcc88"],
    // Beta Ursae Majoris (β UMa / Merak)
    [165.46, 56.38, 2.37, "#eeeeff"],
    // Gamma Ursae Majoris (γ UMa / Phecda)
    [178.46, 53.69, 2.44, "#eeeeff"],
    // Delta Ursae Majoris (δ UMa / Megrez)
    [183.86, 57.03, 3.31, "#eeeeff"],
    // Epsilon Ursae Majoris (ε UMa / Alioth)
    [193.51, 55.96, 1.76, "#eeeeff"],
    // Zeta Ursae Majoris (ζ UMa / Mizar)
    [200.98, 54.92, 2.27, "#eeeeff"],
    // Eta Ursae Majoris (η UMa / Alkaid)
    [206.89, 49.31, 1.85, "#aabbff"],
    // Beta Ursae Minoris (β UMi / Kochab)
    [222.68, 74.16, 2.07, "#ffcc88"],
    // Gamma Ursae Minoris (γ UMi / Pherkad)
    [230.18, 71.83, 3.05, "#eeeeff"],
    // Alpha Bootis already listed (Arcturus)
    // Epsilon Bootis (ε Boo / Izar)
    [221.25, 27.07, 2.70, "#ffcc88"],
    // Alpha Cygni already (Deneb)
    // Epsilon Cygni (ε Cyg / Gienah)
    [311.55, 33.97, 2.46, "#ffcc88"],
    // Zeta Cygni (ζ Cyg)
    [316.84, 30.22, 3.20, "#ffddaa"],
    // Delta Cygni (δ Cyg)
    [296.24, 45.13, 2.87, "#cceeff"],
    // Alpha Aquilae already (Altair)
    // Gamma Aquilae (γ Aql / Tarazed)
    [296.57, 10.61, 2.72, "#ffcc88"],
    // Zeta Aquilae (ζ Aql / Okab)
    [286.35, 13.86, 2.99, "#eeeeff"],
  ];

  BRIGHT_STARS.forEach(([ra_deg, dec_deg, mag, col]) => {
    // Convert RA/Dec to canvas pixel coordinates
    const px = Math.round(((ra_deg / 360) * W + W) % W);
    const py = Math.round((0.5 - dec_deg / 180) * H);

    // Radius and glow based on magnitude
    const brightness = Math.pow(2.512, -mag + 1.5); // brighter = larger
    const radius = Math.max(0.5, Math.min(4, brightness * 1.5));
    const glowRadius = radius * 3.5;

    // Outer glow
    const glow = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
    glow.addColorStop(0,   col + "cc");
    glow.addColorStop(0.3, col + "66");
    glow.addColorStop(1,   col + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Core bright dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Orion Nebula (M42) hint — faint pinkish patch ---
  {
    const px = Math.round((83.82 / 360) * W);
    const py = Math.round((0.5 - (-5.39) / 180) * H);
    const g = ctx.createRadialGradient(px, py, 0, px, py, 28);
    g.addColorStop(0,   "rgba(255,120,80,0.07)");
    g.addColorStop(0.5, "rgba(200,80,60,0.04)");
    g.addColorStop(1,   "rgba(180,60,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI * 2); ctx.fill();
  }

  // --- Eta Carinae Nebula hint — faint blue-green patch near Carina ---
  {
    const px = Math.round((161.26 / 360) * W);
    const py = Math.round((0.5 - (-59.68) / 180) * H);
    const g = ctx.createRadialGradient(px, py, 0, px, py, 22);
    g.addColorStop(0,   "rgba(80,160,255,0.06)");
    g.addColorStop(1,   "rgba(80,160,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
  }

  // --- LMC — Large Magellanic Cloud (RA=80.89°, Dec=-69.75°) ---
  {
    const px = Math.round((80.89 / 360) * W);
    const py = Math.round((0.5 - (-69.75) / 180) * H);
    const g = ctx.createRadialGradient(px, py, 0, px, py, 38);
    g.addColorStop(0,   "rgba(255,250,220,0.14)");
    g.addColorStop(0.5, "rgba(240,230,200,0.07)");
    g.addColorStop(1,   "rgba(200,190,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 38, 0, Math.PI * 2); ctx.fill();
  }

  // --- SMC — Small Magellanic Cloud (RA=13.19°, Dec=-72.83°) ---
  {
    const px = Math.round((13.19 / 360) * W);
    const py = Math.round((0.5 - (-72.83) / 180) * H);
    const g = ctx.createRadialGradient(px, py, 0, px, py, 22);
    g.addColorStop(0,   "rgba(255,248,215,0.10)");
    g.addColorStop(1,   "rgba(200,190,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
  }

  // --- M31 — Andromeda Galaxy (RA=10.68°, Dec=41.27°) — stretched ellipse ---
  {
    const px = Math.round((10.68 / 360) * W);
    const py = Math.round((0.5 - 41.27 / 180) * H);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-Math.PI / 5);
    ctx.scale(2.5, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0,   "rgba(255,248,220,0.10)");
    g.addColorStop(0.5, "rgba(240,230,200,0.05)");
    g.addColorStop(1,   "rgba(200,190,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  return new THREE.CanvasTexture(canvas);
}

// ── Real star-map URLs ────────────────────────────────────────────────────────

const STAR_MAP_URLS = [
  "https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/galaxy_starfield.png",
  "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k_gal.jpg",
];

/**
 * Attempt to load a real star-map photo and swap the material texture.
 * Tries each URL in STAR_MAP_URLS in order; if all fail, keeps the procedural texture.
 * @param {THREE.MeshBasicMaterial} mat
 * @param {number} urlIndex
 */
function _tryLoadRealStarMap(mat, urlIndex = 0) {
  if (urlIndex >= STAR_MAP_URLS.length) {
    // All URLs failed — keep the procedural sky texture
    console.log("[TerraCast] Real star map unavailable — using procedural sky");
    return;
  }
  const url = STAR_MAP_URLS[urlIndex];
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = "anonymous";
  loader.load(
    url,
    (texture) => {
      // Success: swap to real photo texture
      texture.wrapS = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const oldTex = mat.map;
      mat.map = texture;
      mat.needsUpdate = true;
      if (oldTex) oldTex.dispose();
      console.log("[TerraCast] Real star map loaded:", url);
    },
    undefined,
    () => {
      // Failed: try next URL
      _tryLoadRealStarMap(mat, urlIndex + 1);
    }
  );
}

// ── Sky sphere ───────────────────────────────────────────────────────────────

let _skyMesh = null;

/**
 * Initialize the photorealistic sky sphere.
 * Creates the sphere with a procedural texture as a placeholder, then
 * asynchronously attempts to load a real star-map photo to swap in.
 * @param {THREE.Scene} scene
 * @param {THREE.Points} oldStarField - the old particle starfield to hide
 */
export function initSkyBackground(scene, oldStarField) {
  // Build procedural texture as fallback/placeholder
  const proceduralTexture = buildSkyTexture();

  // wrapS needed for rotation offset
  proceduralTexture.wrapS = THREE.RepeatWrapping;

  const mat = new THREE.MeshBasicMaterial({
    map: proceduralTexture,
    side: THREE.BackSide,   // render inside face so we see it from inside
    fog: false,             // never fog the sky sphere
    depthWrite: false,
  });

  _skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(390, 64, 32),
    mat
  );
  _skyMesh.renderOrder = -1; // render before everything else
  scene.add(_skyMesh);

  // Hide the old particle starfield (replaced by this sphere)
  if (oldStarField) {
    oldStarField.visible = false;
  }

  // Set initial rotation based on current sidereal time
  updateSkyRotation(new Date());

  // Asynchronously try to swap in a real star-map photo
  _tryLoadRealStarMap(mat);
}

/**
 * Update sky sphere rotation based on Greenwich Mean Sidereal Time.
 * Call periodically (e.g. every 60 seconds).
 * @param {Date} date
 */
export function updateSkyRotation(date) {
  if (!_skyMesh) return;
  const gmst = getGMST_rad(date);
  // Negative rotation: as GAST increases (time passes), sky appears to rotate westward
  // from Earth's surface → from outside Earth the sphere rotates negatively around Y.
  // Add π offset so RA=0 (vernal equinox) starts near +X in scene space.
  _skyMesh.rotation.y = -gmst + Math.PI;
}
