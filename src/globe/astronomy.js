/**
 * Simplified astronomical calculations for moon position and phase.
 * Based on Jean Meeus "Astronomical Algorithms" simplified formulae.
 * Accuracy: ~0.5° for moon longitude, sufficient for visual purposes.
 */

import * as THREE from "three";

const DEG = Math.PI / 180;

function _julianDate(date) {
  // Julian Date from JS Date object
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Returns the Moon's position as a unit vector in ECI (Earth-Centered Inertial) coordinates.
 * ECI: X = vernal equinox, Y = north celestial pole, Z = right-hand.
 * In our Three.js scene Y = up (north pole), so ECI maps directly.
 *
 * @param {Date} date
 * @returns {{ direction: THREE.Vector3, distance: number }}
 *   direction: unit vector toward moon in ECI / scene space
 *   distance: distance in Earth radii (avg ~60.27)
 */
export function getMoonPositionECI(date) {
  const JD = _julianDate(date);
  const T = (JD - 2451545.0) / 36525.0; // Julian centuries since J2000.0

  // Fundamental arguments (degrees)
  const L  = (218.3164477 + 481267.88123421 * T) % 360; // Moon mean longitude
  const D  = (297.8501921 + 445267.1114034  * T) % 360; // Moon mean elongation
  const M  = (357.5291092 + 35999.0502909   * T) % 360; // Sun mean anomaly
  const Mp = (134.9633964 + 477198.8675055  * T) % 360; // Moon mean anomaly
  const F  = (93.2720950  + 483202.0175233  * T) % 360; // Moon argument of latitude

  // Convert to radians
  const Lr  = L  * DEG;
  const Dr  = D  * DEG;
  const Mr  = M  * DEG;
  const Mpr = Mp * DEG;
  const Fr  = F  * DEG;

  // Ecliptic longitude perturbations (degrees) — top terms from Meeus Table 47.A
  const dLon =
      6.289 * Math.sin(Mpr)
    + 1.274 * Math.sin(2 * Dr - Mpr)
    + 0.658 * Math.sin(2 * Dr)
    - 0.186 * Math.sin(Mr)
    - 0.059 * Math.sin(2 * Dr - 2 * Mpr)
    - 0.057 * Math.sin(2 * Dr + Mpr - Mr)
    + 0.053 * Math.sin(2 * Dr + Mpr)
    + 0.046 * Math.sin(2 * Dr - Mr)
    + 0.041 * Math.sin(Mpr - Mr)
    - 0.035 * Math.sin(Dr)
    - 0.031 * Math.sin(Mpr + Mr)
    + 0.015 * Math.sin(2 * Fr - 2 * Dr)
    + 0.011 * Math.sin(2 * Dr + 2 * Mpr);

  // Ecliptic latitude perturbations (degrees) — top terms from Meeus Table 47.B
  const dLat =
      5.128 * Math.sin(Fr)
    + 0.280 * Math.sin(Mpr + Fr)
    + 0.277 * Math.sin(Mpr - Fr)
    + 0.173 * Math.sin(2 * Dr - Fr)
    + 0.055 * Math.sin(2 * Dr - Mpr + Fr)
    + 0.046 * Math.sin(2 * Dr - Mpr - Fr)
    + 0.033 * Math.sin(2 * Dr + Fr)
    - 0.017 * Math.sin(2 * Mpr + Fr);

  const lambdaDeg = L + dLon; // ecliptic longitude (degrees)
  const betaDeg   = dLat;     // ecliptic latitude (degrees)

  // Distance in Earth radii (simplified)
  const distance = 60.2796
    - 3.2956 * Math.cos(Mpr)
    - 0.3690 * Math.cos(2 * Dr)
    - 0.1682 * Math.cos(2 * Dr - Mpr)
    + 0.1276 * Math.cos(2 * Dr + Mpr);

  // Convert ecliptic → equatorial (ECI)
  const eps = 23.4393 * DEG; // obliquity of ecliptic

  const lambda = lambdaDeg * DEG;
  const beta   = betaDeg   * DEG;

  const cosB   = Math.cos(beta);
  const sinB   = Math.sin(beta);
  const cosL   = Math.cos(lambda);
  const sinL   = Math.sin(lambda);
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  // ECI unit vector (not yet scaled by distance)
  const x = cosB * cosL;
  const y = cosB * sinL * cosEps - sinB * sinEps;
  const z = cosB * sinL * sinEps + sinB * cosEps;

  // Suppress unused variable warnings for Lr, Mr
  void Lr; void Mr;

  return {
    direction: new THREE.Vector3(x, y, z).normalize(),
    distance,  // in Earth radii
  };
}

/**
 * Returns lunar phase as a value 0–1.
 * 0.0 = new moon, 0.25 = first quarter, 0.5 = full moon, 0.75 = last quarter.
 *
 * @param {Date} date
 * @returns {number}
 */
export function getLunarPhase(date) {
  const JD = _julianDate(date);
  // Known new moon: Jan 6, 2000 at 18:14 UTC = JD 2451550.26
  const daysSince = JD - 2451550.26;
  const synodicPeriod = 29.53059; // days
  return ((daysSince % synodicPeriod) + synodicPeriod) % synodicPeriod / synodicPeriod;
}
