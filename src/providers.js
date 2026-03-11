import {
  OPEN_METEO_FORECAST_ENDPOINT,
  OPEN_WEATHER_CURRENT_ENDPOINT,
  OPEN_WEATHER_FORECAST_ENDPOINT,
  WEATHER_API_CURRENT_ENDPOINT,
  WEATHER_API_FORECAST_ENDPOINT,
  YR_FORECAST_ENDPOINT,
  VISUAL_CROSSING_ENDPOINT,
  WEATHER_CODE_LABELS
} from "./constants.js";
import { formatForecastDate, capitalize } from "./utils.js";

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
    supportsGlobal: true,
    quotaNote: "Quota gratuita non esposta dal provider.",
    async fetchCurrent({ lat, lon }) {
      const url = new URL(OPEN_METEO_FORECAST_ENDPOINT);
      url.searchParams.set("latitude", `${lat}`);
      url.searchParams.set("longitude", `${lon}`);
      url.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,pressure_msl,weather_code,wind_speed_10m,is_day"
      );
      url.searchParams.set("timezone", "GMT");

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo current request failed: ${response.status}`);
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
        throw new Error(`Open-Meteo forecast request failed: ${response.status}`);
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
    supportsGlobal: false,
    quotaNote: "Quota non esposta dal provider o non leggibile dal browser.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(OPEN_WEATHER_CURRENT_ENDPOINT);
      url.searchParams.set("lat", `${lat}`);
      url.searchParams.set("lon", `${lon}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("lang", "it");
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
      url.searchParams.set("lang", "it");
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
    supportsGlobal: false,
    quotaNote: "Quota non esposta dal provider o non leggibile dal browser.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = new URL(WEATHER_API_CURRENT_ENDPOINT);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", `${lat},${lon}`);
      url.searchParams.set("lang", "it");
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
      url.searchParams.set("lang", "it");
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
    supportsGlobal: false,
    quotaNote: "Quota gratuita, nessuna chiave richiesta. Rispettare le linee guida d'uso di Met.no.",
    async fetchCurrent({ lat, lon }) {
      const url = new URL(YR_FORECAST_ENDPOINT);
      url.searchParams.set("lat", String(Math.round(lat * 10000) / 10000));
      url.searchParams.set("lon", String(Math.round(lon * 10000) / 10000));
      const response = await fetch(url);
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
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Yr.no forecast request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        forecast: normalizeYrForecast(payload),
        quota: { note: this.quotaNote }
      };
    }
  },
  visualCrossing: {
    id: "visualCrossing",
    name: "Visual Crossing",
    requiresKey: true,
    supportsGlobal: false,
    quotaNote: "Quota gratuita: 1000 record/giorno.",
    async fetchCurrent({ lat, lon, apiKey }) {
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}/today?unitGroup=metric&include=current&key=${apiKey}&contentType=json`;
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
      const url = `${VISUAL_CROSSING_ENDPOINT}/${lat},${lon}?unitGroup=metric&include=days&key=${apiKey}&contentType=json`;
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
  }
};

export function normalizeOpenMeteoEntry(entry) {
  return {
    temperature: entry.current.temperature_2m,
    humidity: entry.current.relative_humidity_2m,
    pressure: entry.current.pressure_msl ?? null,
    weatherCode: entry.current.weather_code,
    conditionLabel: WEATHER_CODE_LABELS[entry.current.weather_code] ?? "Condizione non classificata",
    windSpeed: entry.current.wind_speed_10m,
    isDay: Boolean(entry.current.is_day),
    units: {
      temperature: entry.current_units.temperature_2m,
      humidity: entry.current_units.relative_humidity_2m,
      pressure: entry.current_units.pressure_msl ?? "hPa",
      wind: entry.current_units.wind_speed_10m
    }
  };
}

export function normalizeOpenMeteoForecast(entry) {
  return entry.daily.time.map((time, index) => ({
    label: formatForecastDate(time),
    weatherCode: entry.daily.weather_code[index],
    conditionLabel:
      WEATHER_CODE_LABELS[entry.daily.weather_code[index]] ?? "Condizione non classificata",
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
    conditionLabel: capitalize(entry.weather?.[0]?.description ?? "Condizione non disponibile"),
    windSpeed: (entry.wind?.speed ?? 0) * 3.6,
    isDay: entry.weather?.[0]?.icon?.includes("d") ?? true,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h"
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
      conditionLabel: capitalize(value.item.weather?.[0]?.description ?? "Condizione non disponibile"),
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
    isDay: entry.current.is_day === 1,
    units: {
      temperature: "°C",
      humidity: "%",
      pressure: "hPa",
      wind: "km/h"
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

export function normalizeYrEntry(payload) {
  const instant = payload?.properties?.timeseries?.[0]?.data?.instant?.details ?? {};
  const next1h = payload?.properties?.timeseries?.[0]?.data?.next_1_hours ?? {};
  const symbol = next1h?.summary?.symbol_code ?? "fair_day";
  const isDay = !symbol.includes("night");
  return {
    temperature: instant.air_temperature ?? null,
    humidity: instant.relative_humidity ?? null,
    pressure: instant.air_pressure_at_sea_level ?? null,
    windSpeed: instant.wind_speed ?? null,
    weatherCode: null,
    conditionLabel: symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "m/s" }
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
    conditionLabel: symbol ? symbol.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "–",
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
    isDay,
    units: { temperature: "°C", humidity: "%", pressure: "hPa", wind: "km/h" }
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
    note: "Quota rilevata dai response header del provider."
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
