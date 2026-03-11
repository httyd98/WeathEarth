export const dom = {
  sceneRoot: document.querySelector("#scene-root"),
  locateMeButton: document.querySelector("#locate-me-button"),
  searchForm: document.querySelector("#location-search-form"),
  searchInput: document.querySelector("#location-search"),
  statusLine: document.querySelector("#status-line"),
  lastRefresh: document.querySelector("#last-refresh"),
  nextRefresh: document.querySelector("#next-refresh"),
  stationCount: document.querySelector("#station-count"),
  avgTemp: document.querySelector("#avg-temp"),
  selectionName: document.querySelector("#selection-name"),
  selectionCondition: document.querySelector("#selection-condition"),
  selectionTemperature: document.querySelector("#selection-temperature"),
  selectionWind: document.querySelector("#selection-wind"),
  selectionHumidity: document.querySelector("#selection-humidity"),
  selectionPressure: document.querySelector("#selection-pressure"),
  selectionCoordinates: document.querySelector("#selection-coordinates"),
  selectionDaylight: document.querySelector("#selection-daylight"),
  selectionProvider: document.querySelector("#selection-provider"),
  providerSelect: document.querySelector("#provider-select"),
  providerApiKey: document.querySelector("#provider-api-key"),
  providerSaveButton: document.querySelector("#provider-save-button"),
  providerCapability: document.querySelector("#provider-capability"),
  quotaLimit: document.querySelector("#quota-limit"),
  quotaUsed: document.querySelector("#quota-used"),
  quotaRemaining: document.querySelector("#quota-remaining"),
  quotaNote: document.querySelector("#quota-note"),
  forecastList: document.querySelector("#forecast-list"),
  providerDock: document.querySelector("#provider-dock"),
  providerDockContent: document.querySelector("#provider-dock-content"),
  toggleMarkersButton: document.querySelector("#toggle-markers-button"),
  toggleTerminatorButton: document.querySelector("#toggle-terminator-button"),
  toggleCloudsButton: document.querySelector("#toggle-clouds-button"),
  toggleProviderBoxButton: document.querySelector("#toggle-provider-box-button"),
  snackbar: document.querySelector("#snackbar"),
  toggleHeatmapButton: document.querySelector("#toggle-heatmap-button")
};

// points and providerId are initialized in main.js after all modules are loaded
// to avoid circular dependencies (cache.js ↔ state.js)
export const weatherState = {
  points: [],
  showHeatmap: false,
  selectedPoint: null,
  averageMarkerScale: 1,
  lastUpdatedAt: null,
  nextRefreshAt: null,
  providerId: "openMeteo",
  providerQuotas: {},
  globalDataProvider: "Open-Meteo",
  selectionRequestToken: 0,
  showMarkers: true,
  showTerminator: true,
  showClouds: true,
  showProviderDock: true,
  summaryStats: null,
  lastDistanceForScale: null
};

export const interactionState = {
  isPointerDown: false,
  downX: 0,
  downY: 0,
  dragDistance: 0
};
