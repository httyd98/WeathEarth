export const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
export const OPEN_WEATHER_CURRENT_ENDPOINT = "https://api.openweathermap.org/data/2.5/weather";
export const OPEN_WEATHER_FORECAST_ENDPOINT = "https://api.openweathermap.org/data/2.5/forecast";
export const WEATHER_API_CURRENT_ENDPOINT = "https://api.weatherapi.com/v1/current.json";
export const WEATHER_API_FORECAST_ENDPOINT = "https://api.weatherapi.com/v1/forecast.json";
export const YR_FORECAST_ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
export const VISUAL_CROSSING_ENDPOINT = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";
export const PIRATE_WEATHER_ENDPOINT = "https://api.pirateweather.net/forecast";

// Quota analysis (Open-Meteo free tier ~10,000 calls/day):
// Lat-proportional grid: ~1638 points (72 max at equator, ~13 at ±80°)
// Batches per refresh: ceil(1638/150) ≈ 11 batches
// 24 refreshes/day (1/h) × 11 batches = 264 calls/day (2.6% of quota)
// Fewer points near poles = more uniform spherical coverage
//
// Open-Meteo enforces per-minute rate limits beyond the daily quota.
// BATCH_DELAY_MS is the initial gap; fetchOpenMeteoGlobal doubles it
// adaptively when 429s are detected.
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — 24 refreshes/day
export const REQUEST_BATCH_SIZE = 150;
export const BATCH_DELAY_MS = 1500;
export const MAX_BATCH_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 3000;
export const GLOBE_RADIUS = 4.2;
export const MARKER_ALTITUDE = 0.16;
export const BASE_MARKER_RADIUS = 0.034;
export const EARTH_DAY_TEXTURE_URL = "/textures/earth-topo-bathy.jpg";
export const EARTH_NIGHT_TEXTURE_URL = "/textures/earth-night-8k.jpg";
export const EARTH_CLOUDS_TEXTURE_URL = "/textures/earth-clouds-8k.jpg";
export const EARTH_NORMAL_TEXTURE_URL = "/textures/earth-normal-8k.jpg";
export const EARTH_SPECULAR_TEXTURE_URL = "/textures/earth-specular-8k.jpg";
export const EARTH_HEIGHT_TEXTURE_URL = "/textures/earth-height.jpg";
export const CLICK_DISTANCE_THRESHOLD = 7;
export const STORAGE_PREFIX = "terracast";
export const SUMMARY_LATITUDES = Array.from({ length: 9 }, (_, index) => 80 - index * 20);
export const SUMMARY_LONGITUDES = Array.from({ length: 18 }, (_, index) => -180 + index * 20);

export const WEATHER_CODE_LABELS = {
  0: "Sereno",
  1: "Quasi sereno",
  2: "Parzialmente nuvoloso",
  3: "Coperto",
  45: "Nebbia",
  48: "Galaverna",
  51: "Pioviggine leggera",
  53: "Pioviggine moderata",
  55: "Pioviggine intensa",
  56: "Pioviggine gelata leggera",
  57: "Pioviggine gelata intensa",
  61: "Pioggia debole",
  63: "Pioggia moderata",
  65: "Pioggia intensa",
  66: "Pioggia gelata leggera",
  67: "Pioggia gelata intensa",
  71: "Neve debole",
  73: "Neve moderata",
  75: "Neve intensa",
  77: "Granelli di neve",
  80: "Rovesci deboli",
  81: "Rovesci moderati",
  82: "Rovesci violenti",
  85: "Rovesci nevosi deboli",
  86: "Rovesci nevosi intensi",
  95: "Temporale",
  96: "Temporale con grandine lieve",
  99: "Temporale con grandine forte"
};
