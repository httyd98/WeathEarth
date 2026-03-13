import {
  OPEN_METEO_FORECAST_ENDPOINT,
  OPEN_WEATHER_CURRENT_ENDPOINT,
  OPEN_WEATHER_FORECAST_ENDPOINT,
  WEATHER_API_CURRENT_ENDPOINT,
  WEATHER_API_FORECAST_ENDPOINT,
  YR_FORECAST_ENDPOINT,
  VISUAL_CROSSING_ENDPOINT,
  PIRATE_WEATHER_ENDPOINT
} from "./constants.js";
import { formatForecastDate, capitalize } from "./utils.js";
import { weatherState } from "./state.js";
import { getWeatherCodeLabel, t } from "./i18n.js";

// Italian translations for Yr.no/Met.no symbol codes
const YR_SYMBOL_IT = {
  clearsky_day: "Sereno", clearsky_night: "Cielo sereno", clearsky_polartwilight: "Sereno",
  fair_day: "Quasi sereno", fair_night: "Quasi sereno", fair_polartwilight: "Quasi sereno",
  partlycloudy_day: "Parzialmente nuvoloso", partlycloudy_night: "Parzialmente nuvoloso", partlycloudy_polartwilight: "Parzialmente nuvoloso",
  cloudy: "Nuvoloso",
  fog: "Nebbia",
  lightrain: "Pioggia leggera", rain: "Pioggia", heavyrain: "Pioggia intensa",
  lightrainshowers_day: "Rovesci leggeri", lightrainshowers_night: "Rovesci leggeri", lightrainshowers_polartwilight: "Rovesci leggeri",
  rainshowers_day: "Rovesci", rainshowers_night: "Rovesci", rainshowers_polartwilight: "Rovesci",
  heavyrainshowers_day: "Rovesci intensi", heavyrainshowers_night: "Rovesci intensi", heavyrainshowers_polartwilight: "Rovesci intensi",
  lightsleet: "Pioggia mista neve leggera", sleet: "Pioggia mista neve", heavysleet: "Pioggia mista neve intensa",
  lightsleetshowers_day: "Rovesci misti leggeri", lightsleetshowers_night: "Rovesci misti leggeri", lightsleetshowers_polartwilight: "Rovesci misti leggeri",
  sleetshowers_day: "Rovesci misti", sleetshowers_night: "Rovesci misti", sleetshowers_polartwilight: "Rovesci misti",
  heavysleetshowers_day: "Rovesci misti intensi", heavysleetshowers_night: "Rovesci misti intensi", heavysleetshowers_polartwilight: "Rovesci misti intensi",
  lightsnow: "Neve leggera", snow: "Neve", heavysnow: "Neve intensa",
  lightsnowshowers_day: "Rovesci nevosi leggeri", lightsnowshowers_night: "Rovesci nevosi leggeri", lightsnowshowers_polartwilight: "Rovesci nevosi leggeri",
  snowshowers_day: "Rovesci nevosi", snowshowers_night: "Rovesci nevosi", snowshowers_polartwilight: "Rovesci nevosi",
  heavysnowshowers_day: "Rovesci nevosi intensi", heavysnowshowers_night: "Rovesci nevosi intensi", heavysnowshowers_polartwilight: "Rovesci nevosi intensi",
  lightrainandthunder: "Pioggia e tuoni", rainandthunder: "Temporale con pioggia", heavyrainandthunder: "Temporale violento con pioggia",
  lightsleetandthunder: "Pioggia mista neve e tuoni", sleetandthunder: "Temporale con pioggia mista neve",
  lightsnowandthunder: "Neve e tuoni", snowandthunder: "Temporale con neve",
  lightrainshowersandthunder_day: "Rovesci con tuoni", lightrainshowersandthunder_night: "Rovesci con tuoni", lightrainshowersandthunder_polartwilight: "Rovesci con tuoni",
  rainshowersandthunder_day: "Temporale con rovesci", rainshowersandthunder_night: "Temporale con rovesci", rainshowersandthunder_polartwilight: "Temporale con rovesci",
  heavyrainshowersandthunder_day: "Temporale violento", heavyrainshowersandthunder_night: "Temporale violento", heavyrainshowersandthunder_polartwilight: "Temporale violento",
  lightsleetshowersandthunder_day: "Rovesci misti con tuoni", lightsleetshowersandthunder_night: "Rovesci misti con tuoni", lightsleetshowersandthunder_polartwilight: "Rovesci misti con tuoni",
  sleetshowersandthunder_day: "Temporale con rovesci misti", sleetshowersandthunder_night: "Temporale con rovesci misti", sleetshowersandthunder_polartwilight: "Temporale con rovesci misti",
  lightsnowshowersandthunder_day: "Rovesci nevosi con tuoni", lightsnowshowersandthunder_night: "Rovesci nevosi con tuoni", lightsnowshowersandthunder_polartwilight: "Rovesci nevosi con tuoni",
  snowshowersandthunder_day: "Temporale con rovesci nevosi", snowshowersandthunder_night: "Temporale con rovesci nevosi", snowshowersandthunder_polartwilight: "Temporale con rovesci nevosi"
};

// Italian translations for Pirate Weather / DarkSky-compatible icon codes
const PIRATE_WEATHER_IT = {
  'clear-day': 'Sereno',
  'clear-night': 'Cielo sereno',
  'partly-cloudy-day': 'Parzialmente nuvoloso',
  'partly-cloudy-night': 'Parzialmente nuvoloso',
  'cloudy': 'Nuvoloso',
  'fog': 'Nebbia',
  'rain': 'Pioggia',
  'sleet': 'Pioggia mista neve',
  'snow': 'Neve',
  'wind': 'Vento forte',
  'hail': 'Grandine',
  'thunderstorm': 'Temporale',
  'tornado': 'Tornado'
};

// fetchOpenMeteoGlobal is imported from weather/api.js — we need a lazy reference to break the circular dep
// We use a function wrapper to allow late binding
let _fetchOpenMeteoGlobal = null;
export function setFetchOpenMeteoGlobal(fn) {
  _fetchOpenMeteoGlobal = fn;
}

export const PROVIDERS = {
  openMeteo: {
    id: "openMeteo",
    name: "Open-Meteo",
    requiresKey: false,
    keyRequired: false,
    keyOptional: false,
    get keyNote() { return t("provider.note.openMeteo"); },
    supportsGlobal: true,
    get quotaNote() { return t("quota.free"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon }) {
      const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
      url.searchParams.set("latitude", `${lat}`);
      url.searchParams.set("longitude", `${lon}`);
      url.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,pressure_msl,weather_code,wind_speed_10m,is_day,cloud_cover"
      );
      url.searchParams.set("timezone", "GMT");

      const response = await fetch(url);
      if (!response.ok) {
        const err = new Error(`Open-Meteo current request failed: ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const payload = await response.json();
      return {
        current: normalizeOpenMeteoEntry(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon }) {
      const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
      url.searchParams.set("latitude", `${lat}`);
      url.searchParams.set("longitude", `${lon}`);
      url.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min"
      );
      url.searchParams.set("forecast_days", "5");
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url);
      if (!response.ok) {
        const err = new Error(`Open-Meteo forecast request failed: ${response.status}`);
        err.status = response.status;
        throw err;
      }

      const payload = await response.json();
      return {
        forecast: normalizeOpenMeteoForecast(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchGlobal(points) {
      const { entries, failedBatches } = await _fetchOpenMeteoGlobal(points);

      return {
        entries: entries.map((entry) => (entry ? normalizeOpenMeteoEntry(entry) : null)),
        quota: { note: this.quotaNote },
        failedBatches
      };
    }
  },
  openWeather: {
    id: "openWeather",
    name: "OpenWeather",
    requiresKey: true,
    keyRequired: true,
    keyOptional: false,
    get keyNote() { return t("provider.note.openWeather"); },
    supportsGlobal: false,
    get quotaNote() { return t("quota.notExposed"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(OPEN_WEATHER_CURRENT_ENDPOINT);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("lang", weatherState.language ?? "it");
      url.searchParams.set("appid", apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OpenWeather current request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        current: normalizeOpenWeatherEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const url = new URL(OPEN_WEATHER_FORECAST_ENDPOINT);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("lang", weatherState.language ?? "it");
      url.searchParams.set("appid", apiKey);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OpenWeather forecast request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        forecast: normalizeOpenWeatherForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  },
  weatherApi: {
    id: "weatherApi",
    name: "WeatherAPI",
    requiresKey: true,
    keyRequired: true,
    keyOptional: false,
    get keyNote() { return t("provider.note.weatherApi"); },
    supportsGlobal: false,
    get quotaNote() { return t("quota.notExposed"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(WEATHER_API_CURRENT_ENDPOINT);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${lat},${lon}`);
      url.searchParams.set("lang", weatherState.language ?? "it");
      url.searchParams.set("aqi", "no");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`WeatherAPI current request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        current: normalizeWeatherApiEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const url = new URL(WEATHER_API_FORECAST_ENDPOINT);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${lat},${lon}`);
      url.searchParams.set("lang", weatherState.language ?? "it");
      url.searchParams.set("days", "5");
      url.searchParams.set("aqi", "no");
      url.searchParams.set("alerts", "no");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`WeatherAPI forecast request failed: ${response.status}`);
      }

      const payload = await response.json();
      return {
        forecast: normalizeWeatherApiForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  },
  yr: {
    id: "yr",
    name: "Yr.no (Met.no)",
    requiresKey: false,
    keyRequired: false,
    keyOptional: false,
    get keyNote() { return t("provider.note.yr"); },
    supportsGlobal: true,
    get quotaNote() { return t("quota.yrFree"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon }) {
      const url = new URL(YR_FORECAST_ENDPOINT);
      url.searchParams.set("lat", String(Math.round(lat * 10000) / 10000));
      url.searchParams.set("lon", String(Math.round(lon * 10000) / 10000));
      const response = await fetch(url, {
        headers: { "User-Agent": "TerraCast/1.0 github.com/terracast" }
      });
      if (!response.ok) {
        throw new Error(`Yr.no current request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        current: normalizeYrEntry(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon }) {
      const url = new URL(YR_FORECAST_ENDPOINT);
      url.searchParams.set("lat", String(Math.round(lat * 10000) / 10000));
      url.searchParams.set("lon", String(Math.round(lon * 10000) / 10000));
      const response = await fetch(url, {
        headers: { "User-Agent": "TerraCast/1.0 github.com/terracast" }
      });
      if (!response.ok) {
        throw new Error(`Yr.no forecast request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        forecast: normalizeYrForecast(payload),
        quota: { note: this.quotaNote }
      };
    },
    async fetchGlobal(points) {
      // MET Norway only supports single-point queries, so we use
      // concurrent requests with concurrency limiting (20 at a time).
      const CONCURRENCY = 20;
      const DELAY_BETWEEN_WAVES = 200; // ms between waves to stay under rate limits
      const entries = new Array(points.length).fill(null);
      let failedCount = 0;

      for (let wave = 0; wave < points.length; wave += CONCURRENCY) {
        const batch = points.slice(wave, wave + CONCURRENCY);
        const promises = batch.map(async (p, localIdx) => {
          const idx = wave + localIdx;
          try {
            const url = new URL(YR_FORECAST_ENDPOINT);
            // Clamp to ±89.9 — MET Norway's AROME model doesn't cover the exact poles
            const clampedLat = Math.max(-89.9, Math.min(89.9, p.lat));
            url.searchParams.set("lat", String(Math.round(clampedLat * 100) / 100));
            url.searchParams.set("lon", String(Math.round(p.lon * 100) / 100));
            const resp = await fetch(url, {
              headers: { "User-Agent": "TerraCast/1.0 github.com/terracast" }
            });
            if (!resp.ok) {
              if (resp.status === 429) throw new Error("rate_limited");
              return; // skip silently
            }
            const payload = await resp.json();
            entries[idx] = normalizeYrEntry(payload);
          } catch (err) {
            if (err.message === "rate_limited") throw err; // propagate
            failedCount++;
          }
        });
        try {
          await Promise.all(promises);
        } catch (err) {
          if (err.message === "rate_limited") {
            console.warn(`[Yr.no] Rate limited at wave ${Math.floor(wave / CONCURRENCY) + 1}. Stopping.`);
            break;
          }
        }
        // Small delay between waves
        if (wave + CONCURRENCY < points.length) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_WAVES));
        }
      }

      const successCount = entries.filter(Boolean).length;
      console.log(`[Yr.no] fetchGlobal: ${successCount}/${points.length} points, ${failedCount} failed`);

      return {
        entries,
        quota: { note: this.quotaNote },
        failedBatches: failedCount
      };
    }
  },
  visualCrossing: {
    id: "visualCrossing",
    name: "Visual Crossing",
    requiresKey: true,
    keyRequired: true,
    keyOptional: false,
    get keyNote() { return t("provider.note.visualCrossing"); },
    supportsGlobal: false,
    get quotaNote() { return t("quota.visualCrossing"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon, apiKey }) {
      const lang = weatherState.language ?? 'it';
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}/today?unitGroup=metric&include=current&lang=${lang}&key=${apiKey}&contentType=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Visual Crossing current request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        current: normalizeVisualCrossingEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const lang = weatherState.language ?? 'it';
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}?unitGroup=metric&include=days&lang=${lang}&key=${apiKey}&contentType=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Visual Crossing forecast request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        forecast: normalizeVisualCrossingForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  },
  pirateWeather: {
    id: "pirateWeather",
    name: "Pirate Weather",
    requiresKey: true,
    keyRequired: true,
    keyOptional: false,
    get keyNote() { return t("provider.note.pirateWeather"); },
    supportsGlobal: false,
    get quotaNote() { return t("quota.pirateWeather"); },
    capabilities: { cloudCover: true, precipitation: true },
    async fetchCurrent({ lat, lon, apiKey }) {
      const lang = weatherState.language ?? 'it';
      const url = `${PIRATE_WEATHER_ENDPOINT}/${apiKey}/${lat},${lon}?units=si&lang=${lang}&exclude=minutely,hourly,alerts`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`Pirate Weather current request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      return {
        current: normalizePirateWeatherEntry(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    },
    async fetchForecast({ lat, lon, apiKey }) {
      const lang = weatherState.language ?? 'it';
      const url = `${PIRATE_WEATHER_ENDPOINT}/${apiKey}/${lat},${lon}?units=si&lang=${lang}&exclude=minutely,hourly,alerts`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`Pirate Weather forecast request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      return {
        forecast: normalizePirateWeatherForecast(payload),
        quota: parseQuotaFromHeaders(response.headers) ?? { note: this.quotaNote }
      };
    }
  }
};

export function normalizeOpenMeteoEntry(entry) {
  // In forecast mode, override "current" with hourly data at the forecast offset
  if (weatherState.dataMode === "forecast" && weatherState.forecastHours > 0 && entry.hourly) {
    const idx = weatherState.forecastHours; // hourly[0] = now, hourly[N] = +N hours
    const h = entry.hourly;
    if (h.temperature_2m && idx < h.temperature_2m.length) {
      // Build a synthetic current object from hourly forecast values
      const synth = {};
      for (const key of Object.keys(h)) {
        if (key === "time") continue;
        synth[key] = h[key][idx] ?? null;
      }
      // Replace entry.current with forecast values (keep originals as fallback)
      entry = { ...entry, current: { ...entry.current, ...synth } };
    }
  }
  const c = entry.current;
  // Build wind levels map for altitude slider
  // API-supported levels from Open-Meteo
  const API_WIND_LEVELS = [
    "1000hPa","925hPa","850hPa","700hPa","600hPa","500hPa","400hPa",
    "300hPa","250hPa","200hPa","150hPa","100hPa","70hPa","50hPa",
    "30hPa","20hPa","10hPa"
  ];
  const windLevels = {
    "10m": { speed: c.wind_speed_10m, direction: c.wind_direction_10m ?? null }
  };
  for (const lvl of API_WIND_LEVELS) {
    const s = c[`wind_speed_${lvl}`];
    const d = c[`wind_direction_${lvl}`];
    if (s != null) windLevels[lvl] = { speed: s, direction: d ?? null };
  }

  // Extrapolate mesospheric levels beyond API support using the highest
  // available API level as a base.  Wind speed generally increases with
  // altitude in the mesosphere; direction can rotate.  We scale from the
  // 10hPa level (or highest available).
  const EXTRA_LEVELS = [
    { key: "5hPa",    speedScale: 1.15, dirOffset: 10  },
    { key: "1hPa",    speedScale: 1.4,  dirOffset: 25  },
    { key: "0.4hPa",  speedScale: 1.6,  dirOffset: 40  },
    { key: "0.1hPa",  speedScale: 1.8,  dirOffset: 60  },
    { key: "0.01hPa", speedScale: 2.0,  dirOffset: 80  }
  ];
  // Find the highest API level that has data for extrapolation base
  const baseLevel = windLevels["10hPa"] ?? windLevels["20hPa"] ?? windLevels["30hPa"] ?? windLevels["50hPa"];
  if (baseLevel && baseLevel.speed != null) {
    for (const ext of EXTRA_LEVELS) {
      windLevels[ext.key] = {
        speed: baseLevel.speed * ext.speedScale,
        direction: baseLevel.direction != null
          ? (baseLevel.direction + ext.dirOffset) % 360
          : null
      };
    }
  }

  return {
    temperature: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    pressure: c.pressure_msl ?? null,
    weatherCode: c.weather_code,
    conditionLabel: getWeatherCodeLabel(c.weather_code),
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m ?? null,
    cloudCover: c.cloud_cover ?? null,
    precipitation: c.precipitation ?? 0,
    isDay: Boolean(c.is_day),
    cape: c.cape ?? null,
    windLevels,
    units: {
      temperature: entry.current_units.temperature_2m,
      humidity: entry.current_units.relative_humidity_2m,
      pressure: entry.current_units.pressure_msl ?? "hPa",
      wind: entry.current_units.wind_speed_10m,
      precipitation: "mm"
    }
  };
}

export function normalizeOpenMeteoForecast(entry) {
  return entry.daily.time.map((time, index) => ({
    label: formatForecastDate(time),
    weatherCode: entry.daily.weather_code[index],
    conditionLabel: getWeatherCodeLabel(entry.daily.weather_code[index]),
    min: entry.daily.temperature_2m_min[index],
    max: entry.daily.temperature_2m_max[index],
    unit: entry.daily_units.temperature_2m_max
  }));
}

export function normalizeOpenWeatherEntry(entry) {
  return {
    temperature: entry.main.temp,
    humidity: entry.main.humidity,
    pressure: entry.main.pressure,
    weatherCode: null,
    conditionLabel: capitalize(entry.weather?.[0]?.description ?? t("condition.unavailable")),
    windSpeed: (entry.wind?.speed ?? 0) * 3.6,
    cloudCover: entry.clouds?.all ?? null,
    precipitation: entry.rain?.["1h"] ?? entry.snow?.["1h"] ?? 0,
    isDay: entry.weather?.[0]?.icon?.includes("d") ?? true,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h",
      precipitation: "mm"
    }
  };
}

export function normalizeOpenWeatherForecast(entry) {
  const dayMap = new Map();

  entry.list.forEach((item) => {
    const dateKey = item.dt_txt.slice(0, 10);
    const hour = Number(item.dt_txt.slice(11, 13));
    const score = Math.abs(hour - 12);
    const previous = dayMap.get(dateKey);
    if (!previous || score < previous.score) {
      dayMap.set(dateKey, {
        score,
        item
      });
    }
  });

  return Array.from(dayMap.entries())
    .slice(0, 5)
    .map(([dateKey, value]) => ({
      label: formatForecastDate(dateKey),
      weatherCode: null,
      conditionLabel: capitalize(value.item.weather?.[0]?.description ?? t("condition.unavailable")),
      min: value.item.main.temp_min,
      max: value.item.main.temp_max,
      unit: "°C"
    }));
}

export function normalizeWeatherApiEntry(entry) {
  return {
    temperature: entry.current.temp_c,
    humidity: entry.current.humidity,
    pressure: entry.current.pressure_mb,
    weatherCode: null,
    conditionLabel: entry.current.condition.text,
    windSpeed: entry.current.wind_kph,
    cloudCover: entry.current.cloud ?? null,
    precipitation: entry.current.precip_mm ?? 0,
    isDay: entry.current.is_day === 1,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h",
      precipitation: "mm"
    }
  };
}

export function normalizeWeatherApiForecast(entry) {
  return entry.forecast.forecastday.map((day) => ({
    label: formatForecastDate(day.date),
    weatherCode: null,
    conditionLabel: day.day.condition.text,
    min: day.day.mintemp_c,
    max: day.day.maxtemp_c,
    unit: "°C"
  }));
}

// Map Yr.no symbol codes to WMO weather codes for compatibility with heatmap/lightning
const YR_SYMBOL_TO_WMO = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsleet: 66, sleet: 67, heavysleet: 67,
  lightsleetshowers: 68, sleetshowers: 68, heavysleetshowers: 68,
  lightsnow: 71, snow: 73, heavysnow: 75,
  lightsnowshowers: 85, snowshowers: 86, heavysnowshowers: 86,
  lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 99,
  lightsleetandthunder: 95, sleetandthunder: 95,
  lightsnowandthunder: 95, snowandthunder: 95,
  lightrainshowersandthunder: 95, rainshowersandthunder: 96, heavyrainshowersandthunder: 99,
  lightsleetshowersandthunder: 95, sleetshowersandthunder: 95,
  lightsnowshowersandthunder: 95, snowshowersandthunder: 95,
};

function _yrSymbolToWMO(symbol) {
  if (!symbol) return null;
  // Strip _day/_night/_polartwilight suffix
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  return YR_SYMBOL_TO_WMO[base] ?? null;
}

export function normalizeYrEntry(payload) {
  const instant = payload?.properties?.timeseries?.[0]?.data?.instant?.details ?? {};
  const next1h = payload?.properties?.timeseries?.[0]?.data?.next_1_hours ?? {};
  const symbol = next1h?.summary?.symbol_code ?? "fair_day";
  const isDay = !symbol.includes("night");
  const precipitation = next1h?.details?.precipitation_amount ?? 0;
  return {
    temperature: instant.air_temperature ?? null,
    humidity: instant.relative_humidity ?? null,
    pressure: instant.air_pressure_at_sea_level ?? null,
    windSpeed: instant.wind_speed != null ? instant.wind_speed * 3.6 : null, // m/s → km/h
    windDirection: instant.wind_from_direction ?? null,
    weatherCode: _yrSymbolToWMO(symbol),
    conditionLabel: weatherState.language === 'en'
      ? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : (YR_SYMBOL_IT[symbol] ?? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())),
    cloudCover: instant.cloud_area_fraction ?? null,
    precipitation,
    cape: null, // MET Norway doesn't provide CAPE
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "km/h", precipitation: "mm" }
  };
}

export function normalizeYrForecast(payload) {
  const timeseries = payload?.properties?.timeseries ?? [];
  const daily = new Map();
  for (const entry of timeseries) {
    const date = entry.time.slice(0, 10);
    if (!daily.has(date)) {
      daily.set(date, { temps: [], symbol: entry.data?.next_6_hours?.summary?.symbol_code ?? null });
    }
    const temp = entry.data?.instant?.details?.air_temperature;
    if (temp != null) daily.get(date).temps.push(temp);
  }
  return Array.from(daily.entries()).slice(0, 5).map(([date, { temps, symbol }]) => ({
    label: formatForecastDate(date),
    weatherCode: null,
    conditionLabel: symbol
      ? (weatherState.language === 'en'
          ? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : (YR_SYMBOL_IT[symbol] ?? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())))
      : "–",
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
    unit: "°C"
  }));
}

export function normalizeVisualCrossingEntry(payload) {
  const cc = payload?.currentConditions ?? {};
  const icon = cc.icon ?? "";
  const isDay = !icon.includes("night") && icon !== "";
  return {
    temperature: cc.temp ?? null,
    humidity: cc.humidity ?? null,
    pressure: cc.pressure ?? null,
    windSpeed: cc.windspeed ?? null,
    weatherCode: null,
    conditionLabel: cc.conditions ?? "–",
    cloudCover: cc.cloudcover ?? null,
    precipitation: cc.precip ?? 0,
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "km/h", precipitation: "mm" }
  };
}

export function normalizeVisualCrossingForecast(payload) {
  return (payload?.days ?? []).slice(0, 5).map((day) => ({
    label: formatForecastDate(day.datetime),
    weatherCode: null,
    conditionLabel: day.conditions ?? "–",
    min: day.tempmin ?? null,
    max: day.tempmax ?? null,
    unit: "°C"
  }));
}

export function normalizePirateWeatherEntry(payload) {
  const c = payload?.currently ?? {};
  const icon = c.icon ?? "";
  const isDay = !icon.includes("night") && !icon.startsWith("clear-night");
  const conditionLabel = weatherState.language === 'en'
    ? capitalize(icon.replace(/-/g, " "))
    : (PIRATE_WEATHER_IT[icon] ?? capitalize(icon.replace(/-/g, " ")));
  return {
    temperature: c.temperature ?? null,
    humidity: c.humidity != null ? Math.round(c.humidity * 100) : null,
    pressure: c.pressure ?? null,
    // Pirate Weather windSpeed is in m/s with units=si — convert to km/h
    windSpeed: c.windSpeed != null ? c.windSpeed * 3.6 : null,
    weatherCode: null,
    conditionLabel,
    cloudCover: c.cloudCover != null ? Math.round(c.cloudCover * 100) : null,
    precipitation: c.precipIntensity ?? 0,
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "km/h", precipitation: "mm" }
  };
}

export function normalizePirateWeatherForecast(payload) {
  const days = payload?.daily?.data ?? [];
  return days.slice(0, 5).map((day) => {
    const icon = day.icon ?? "";
    const conditionLabel = weatherState.language === 'en'
      ? capitalize(icon.replace(/-/g, " "))
      : (PIRATE_WEATHER_IT[icon] ?? capitalize(icon.replace(/-/g, " ")));
    return {
      label: formatForecastDate(new Date(day.time * 1000)),
      weatherCode: null,
      conditionLabel,
      min: day.temperatureLow ?? null,
      max: day.temperatureHigh ?? null,
      unit: "°C"
    };
  });
}

export function parseQuotaFromHeaders(headers) {
  const limit = readHeader(headers, [
    "x-ratelimit-limit",
    "x-rate-limit-limit",
    "ratelimit-limit"
  ]);
  const remaining = readHeader(headers, [
    "x-ratelimit-remaining",
    "x-rate-limit-remaining",
    "ratelimit-remaining"
  ]);
  let used = readHeader(headers, [
    "x-ratelimit-used",
    "x-rate-limit-used",
    "ratelimit-used"
  ]);

  if (!used && limit && remaining) {
    const numericUsed = Number(limit) - Number(remaining);
    if (Number.isFinite(numericUsed)) {
      used = `${numericUsed}`;
    }
  }

  if (!limit && !remaining && !used) {
    return null;
  }

  return {
    limit: limit ?? "-",
    used: used ?? "-",
    remaining: remaining ?? "-",
    note: t("quota.fromHeaders")
  };
}

export function readHeader(headers, names) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) {
      return value;
    }
  }

  return null;
}
