import { weatherState } from "./state.js";

const translations = {
  it: {
    // Brand panel
    "brand.eyebrow": "Global Weather Observatory",
    "brand.lede": "Condizioni meteo globali in tempo quasi reale, con selezione puntuale sul globo, ricerca località e geolocalizzazione browser.",
    "chip.drag": "Drag per orbitare",
    "chip.click": "Click per selezionare",
    "chip.scroll": "Rotella per zoom",

    // Metrics panel
    "metrics.lastRefresh": "Ultimo refresh",
    "metrics.nextRefresh": "Prossimo refresh",
    "metrics.stations": "Punti meteo",
    "metrics.avgTemp": "Temperatura media",
    "metrics.waiting": "In attesa...",
    "metrics.connecting": "Connessione ai feed pubblici...",

    // Selection/details panel
    "selection.eyebrow": "Punto selezionato",
    "selection.none": "Nessun punto selezionato",
    "selection.condition": "Condizione",
    "selection.temperature": "Temperatura",
    "selection.wind": "Vento",
    "selection.humidity": "Umidità",
    "selection.cloudCover": "Copertura nuvole",
    "selection.pressure": "Pressione",
    "selection.coordinates": "Coordinate",
    "selection.daylight": "Fase solare",
    "selection.provider": "Provider",
    "selection.loading": "In caricamento...",
    "selection.day": "Giorno",
    "selection.night": "Notte",
    "selection.precipitation": "Precipitazioni",

    // Forecast panel
    "forecast.eyebrow": "Previsioni",
    "forecast.title": "Località selezionata",
    "forecast.empty": "Seleziona una località per vedere le previsioni.",
    "forecast.loading": "Caricamento previsioni in corso...",

    // Legend panel
    "legend.eyebrow": "Legenda",
    "legend.title": "Temperatura dei marker",
    "legend.footnote": "I marker globali vengono campionati su tutto il pianeta. Il punto selezionato usa il provider locale attivo e si aggiorna solo con click, non con il drag.",

    // Toggle buttons
    "btn.hideMarkers": "Nascondi punti meteo",
    "btn.showMarkers": "Mostra punti meteo",
    "btn.hideTerminator": "Nascondi giorno/notte",
    "btn.showTerminator": "Mostra giorno/notte",
    "btn.hideClouds": "Nascondi nuvole",
    "btn.showClouds": "Mostra nuvole",
    "btn.hideHeatmap": "Nascondi heatmap",
    "btn.showHeatmap": "Heatmap temperatura",
    "btn.hideCloudCover": "Nascondi copertura nuvole",
    "btn.showCloudCover": "Copertura nuvole",
    "btn.precipitation": "Precipitazioni",
    "btn.hidePrecipitation": "Nascondi precipitazioni",
    "btn.showWind":            "Vento (particelle)",
    "btn.hideWind":            "Nascondi vento",
    "btn.tiltSimple":          "Inclinazione 23.4°",
    "btn.tiltSimpleOff":       "Rimuovi inclinazione",
    "btn.tiltSeasonal":        "Inclinazione stagionale",
    "btn.tiltSeasonalOff":     "Rimuovi inclinazione",
    "btn.language": "Lingua: {lang}",
    "btn.langIt": "Italiano",
    "btn.langEn": "English",

    // Cloud switch
    "clouds.off": "Off",
    "clouds.aesthetic": "Estetiche",
    "clouds.real": "Reali",

    // Sidebar groups
    "sidebar.display": "Visualizzazione",
    "sidebar.weather": "Dati Meteo",

    // Mode bar
    "mode.realtime":           "Ora",
    "mode.forecast":           "Modelli",
    "mode.timeNow":            "Ora attuale",

    // Provider / Settings
    "provider.eyebrow": "Provider",
    "provider.title": "Sorgente meteo attiva",
    "provider.label": "Provider",
    "provider.apiKey": "Chiave API",
    "provider.apiKeyOptional": "Chiave API (opzionale)",
    "provider.apiKeyRequired": "Chiave API (obbligatoria \u26a0)",
    "provider.saveKey": "Salva chiave",
    "provider.quotaTotal": "Quota totale",
    "provider.quotaUsed": "Utilizzate",
    "provider.quotaRemaining": "Rimanenti",
    "provider.quotaNote": "La quota viene mostrata solo se il provider la espone via API o header.",
    "provider.collapse": "Comprimi sorgente meteo",

    // Settings
    "settings.eyebrow": "Impostazioni",
    "settings.title": "Configurazione",
    "settings.language": "Lingua",

    // Search
    "search.eyebrow": "Ricerca",
    "search.title": "Località o posizione attuale",
    "search.placeholder": "Cerca una città o una località",
    "search.submit": "Cerca",
    "search.locateMe": "Usa posizione attuale",

    // Status messages
    "status.connecting": "Connessione ai feed pubblici...",
    "status.fresh": "Dati ancora freschi (< 60 min). Prossimo aggiornamento pianificato.",
    "status.fetchingMissing": "Recupero {count} punti mancanti (dati parziali precedenti)…",
    "status.satelliteLoading": "Caricamento immagine satellite nuvole (NASA GIBS)…",
    "status.satelliteLoaded": "Nuvole da satellite ({date}){nrt}. Dati VIIRS/MODIS NASA.",
    "status.satelliteError": "Immagine satellite non disponibile. Uso stima interpolata.",
    "status.noPrecipitation": "Nessuna precipitazione rilevata nei punti campionati.",
    "status.radarLoading":     "Caricamento radar RainViewer...",
    "status.radarLoaded":      "Radar globale ({age} min fa). Auto-aggiornamento ogni 10 min.",
    "status.radarError":       "Radar non disponibile. Uso stima interpolata.",
    "status.forecastLoading":  "Caricamento previsione +{hours}h...",
    "status.forecastLoaded":   "Previsione +{hours}h ({model}).",
    "status.forecastError":    "Errore caricamento previsione.",
    "status.cacheLoaded": "Dati locali ({source}) caricati. Aggiornamento live in corso\u2026",
    "status.firstLoad": "Primo avvio \u2014 caricamento dati globali\u2026",
    "status.firstLoadSummary": "Primo avvio \u2014 caricamento riepilogo\u2026",
    "status.updating": "Aggiornamento dati live in corso\u2026",
    "status.summaryUpdated": "Riepilogo globale aggiornato.",
    "status.globalNotSupported": "Dati globali via Open-Meteo ({provider} non supporta batch). Caricamento live\u2026",
    "status.feedUpdated": "Feed globale aggiornato ({count} punti live via {provider}).",
    "status.partialUpdate": "Aggiornamento parziale: {count}/{total} punti via {provider}.",
    "status.dualProvider": "Dati globali live via {globalProvider}. Dettaglio locale via {localProvider}.",
    "status.feedSynced": "Feed globale sincronizzato ({count} punti via {provider}).",
    "status.quotaExhausted": "Limite Open-Meteo: {reason}. Dati precedenti mantenuti.",
    "status.networkError": "Errore di rete. Dati precedenti mantenuti.",
    "status.quotaCache": "Limite Open-Meteo: {reason}. Dati dalla cache.",
    "status.networkCache": "Errore di rete. Dati dalla cache.",
    "status.quotaNoData": "Limite Open-Meteo: {reason}. Nessun dato disponibile. Riprova dopo mezzanotte UTC.",
    "status.networkNoData": "Errore di rete. Nessun dato disponibile.",
    "status.allBatchesFailed": "Tutti i {count} batch Open-Meteo falliti (errori di rete)",
    "status.selectionRemoved": "Selezione rimossa.",
    "status.searchingLocation": "Ricerca località: {query}...",
    "status.locationNotFound": "Località non trovata.",
    "status.searchError": "Errore durante la ricerca della località.",
    "status.geoNotSupported": "Geolocalizzazione non supportata dal browser.",
    "status.geoRequesting": "Richiesta posizione attuale al browser...",
    "status.geoError": "Geolocalizzazione non disponibile: {message}",
    "status.providerGlobal": "Provider: {provider} (layer globale + dettaglio locale).",
    "status.providerLocal": "Provider locale: {provider}. Dati globali via Open-Meteo.",
    "status.loadingPoint": "Caricamento meteo puntuale tramite {provider}...",
    "status.pointUpdated": "Dettaglio locale aggiornato tramite {provider}.",
    "status.pointSelected": "Punto selezionato aggiornato tramite {provider}.",
    "status.keyMissing": "Chiave API assente per {provider} \u2014 uso Open-Meteo come fallback.",
    "status.keyMissingNote": "Chiave API non configurata per {provider}. Dettaglio locale via Open-Meteo. Inserisci la chiave nel pannello Provider.",
    "status.keyInvalid": "Chiave API non valida o non autorizzata per {provider}. Verifica la chiave nel pannello Provider.",
    "status.providerQuotaExhausted": "Quota {provider} esaurita. Riprova più tardi.",
    "status.providerUnavailable": "Servizio {provider} temporaneamente non disponibile (errore {status}).",
    "status.providerNoData": "Dati non disponibili per questa località tramite {provider}.",
    "status.providerError": "Errore nel caricamento meteo locale tramite {provider}.",
    "status.fallback": "{provider} non disponibile \u2014 dati locali via {fallback}.",
    "status.currentPosition": "Posizione attuale",
    "status.fallbackQuotaExhausted": "Quota {provider} esaurita. Riprova più tardi.",
    "status.fallbackUnavailable": "Servizio {provider} temporaneamente non disponibile (errore {status}).",
    "status.fallbackError": "Errore nel caricamento meteo locale tramite {provider}.",

    // Provider capability messages
    "provider.supportsGlobal": "{provider} gestisce sia layer globale sia dettaglio locale.",
    "provider.localOnly": "{provider} gestisce il dettaglio locale. Il layer globale usa {fallback} come fallback.",
    "provider.apiKeyPlaceholderOptional": "Chiave API opzionale per {provider}",
    "provider.apiKeyPlaceholderRequired": "Chiave API obbligatoria per {provider}",
    "provider.apiKeyPlaceholder": "Chiave API per {provider}",

    // Provider notes
    "provider.note.openMeteo": "Nessuna chiave necessaria. Completamente gratuito.",
    "provider.note.openWeather": "Chiave obbligatoria. Registrati su openweathermap.org (piano gratuito disponibile).",
    "provider.note.weatherApi": "Chiave obbligatoria. Registrati su weatherapi.com (piano gratuito disponibile).",
    "provider.note.yr": "Nessuna chiave necessaria. Rispetta le linee guida d'uso di Met.no.",
    "provider.note.visualCrossing": "Chiave obbligatoria. Registrati su visualcrossing.com (1000 record/giorno gratuiti).",
    "provider.note.pirateWeather": "Chiave obbligatoria. Gratuita su pirateweather.net (5000 richieste/giorno).",

    // Quota notes
    "quota.free": "Quota gratuita non esposta dal provider.",
    "quota.notExposed": "Quota non esposta dal provider o non leggibile dal browser.",
    "quota.yrFree": "Quota gratuita, nessuna chiave richiesta. Rispettare le linee guida d'uso di Met.no.",
    "quota.visualCrossing": "Quota gratuita: 1000 record/giorno.",
    "quota.pirateWeather": "Quota gratuita: 5000 richieste/giorno.",
    "quota.fromHeaders": "Quota rilevata dai response header del provider.",

    // Condition fallback
    "condition.unknown": "Condizione non classificata",
    "condition.unavailable": "Condizione non disponibile",

    // Meta description
    "meta.description": "Globo 3D con meteo globale, selezione puntuale, geolocalizzazione e provider multipli.",
  },

  en: {
    // Brand panel
    "brand.eyebrow": "Global Weather Observatory",
    "brand.lede": "Real-time global weather conditions with point selection on the globe, location search, and browser geolocation.",
    "chip.drag": "Drag to orbit",
    "chip.click": "Click to select",
    "chip.scroll": "Scroll to zoom",

    // Metrics panel
    "metrics.lastRefresh": "Last refresh",
    "metrics.nextRefresh": "Next refresh",
    "metrics.stations": "Weather points",
    "metrics.avgTemp": "Average temperature",
    "metrics.waiting": "Waiting...",
    "metrics.connecting": "Connecting to public feeds...",

    // Selection/details panel
    "selection.eyebrow": "Selected point",
    "selection.none": "No point selected",
    "selection.condition": "Condition",
    "selection.temperature": "Temperature",
    "selection.wind": "Wind",
    "selection.humidity": "Humidity",
    "selection.cloudCover": "Cloud cover",
    "selection.pressure": "Pressure",
    "selection.coordinates": "Coordinates",
    "selection.daylight": "Solar phase",
    "selection.provider": "Provider",
    "selection.loading": "Loading...",
    "selection.day": "Day",
    "selection.night": "Night",
    "selection.precipitation": "Precipitation",

    // Forecast panel
    "forecast.eyebrow": "Forecast",
    "forecast.title": "Selected location",
    "forecast.empty": "Select a location to see the forecast.",
    "forecast.loading": "Loading forecast...",

    // Legend panel
    "legend.eyebrow": "Legend",
    "legend.title": "Marker temperature",
    "legend.footnote": "Global markers are sampled across the planet. The selected point uses the active local provider and only updates on click, not on drag.",

    // Toggle buttons
    "btn.hideMarkers": "Hide weather points",
    "btn.showMarkers": "Show weather points",
    "btn.hideTerminator": "Hide day/night",
    "btn.showTerminator": "Show day/night",
    "btn.hideClouds": "Hide clouds",
    "btn.showClouds": "Show clouds",
    "btn.hideHeatmap": "Hide heatmap",
    "btn.showHeatmap": "Temperature heatmap",
    "btn.hideCloudCover": "Hide cloud cover",
    "btn.showCloudCover": "Cloud cover",
    "btn.precipitation": "Precipitation",
    "btn.hidePrecipitation": "Hide precipitation",
    "btn.showWind":            "Wind (particles)",
    "btn.hideWind":            "Hide wind",
    "btn.tiltSimple":          "23.4° axis tilt",
    "btn.tiltSimpleOff":       "Remove tilt",
    "btn.tiltSeasonal":        "Seasonal axis tilt",
    "btn.tiltSeasonalOff":     "Remove tilt",
    "btn.language": "Language: {lang}",
    "btn.langIt": "Italiano",
    "btn.langEn": "English",

    // Cloud switch
    "clouds.off": "Off",
    "clouds.aesthetic": "Aesthetic",
    "clouds.real": "Real",

    // Sidebar groups
    "sidebar.display": "Display",
    "sidebar.weather": "Weather Data",

    // Mode bar
    "mode.realtime":           "Now",
    "mode.forecast":           "Models",
    "mode.timeNow":            "Current time",

    // Provider / Settings
    "provider.eyebrow": "Provider",
    "provider.title": "Active weather source",
    "provider.label": "Provider",
    "provider.apiKey": "API Key",
    "provider.apiKeyOptional": "API Key (optional)",
    "provider.apiKeyRequired": "API Key (required \u26a0)",
    "provider.saveKey": "Save key",
    "provider.quotaTotal": "Total quota",
    "provider.quotaUsed": "Used",
    "provider.quotaRemaining": "Remaining",
    "provider.quotaNote": "Quota is shown only if the provider exposes it via API or headers.",
    "provider.collapse": "Collapse weather source",

    // Settings
    "settings.eyebrow": "Settings",
    "settings.title": "Configuration",
    "settings.language": "Language",

    // Search
    "search.eyebrow": "Search",
    "search.title": "Location or current position",
    "search.placeholder": "Search for a city or location",
    "search.submit": "Search",
    "search.locateMe": "Use current position",

    // Status messages
    "status.connecting": "Connecting to public feeds...",
    "status.fresh": "Data still fresh (< 60 min). Next update scheduled.",
    "status.fetchingMissing": "Fetching {count} missing points (previous load was partial)…",
    "status.satelliteLoading": "Loading satellite cloud imagery (NASA GIBS)…",
    "status.satelliteLoaded": "Satellite clouds ({date}){nrt}. VIIRS/MODIS data from NASA.",
    "status.satelliteError": "Satellite imagery unavailable. Using interpolated estimate.",
    "status.noPrecipitation": "No precipitation detected at currently sampled points.",
    "status.radarLoading":     "Loading RainViewer global radar...",
    "status.radarLoaded":      "Global radar ({age} min ago). Auto-refresh every 10 min.",
    "status.radarError":       "Radar unavailable. Using interpolated estimate.",
    "status.forecastLoading":  "Loading +{hours}h forecast...",
    "status.forecastLoaded":   "+{hours}h forecast ({model}).",
    "status.forecastError":    "Error loading forecast.",
    "status.cacheLoaded": "Local data ({source}) loaded. Live update in progress\u2026",
    "status.firstLoad": "First launch \u2014 loading global data\u2026",
    "status.firstLoadSummary": "First launch \u2014 loading summary\u2026",
    "status.updating": "Live data update in progress\u2026",
    "status.summaryUpdated": "Global summary updated.",
    "status.globalNotSupported": "Global data via Open-Meteo ({provider} doesn't support batch). Loading live\u2026",
    "status.feedUpdated": "Global feed updated ({count} live points via {provider}).",
    "status.partialUpdate": "Partial update: {count}/{total} points via {provider}.",
    "status.dualProvider": "Global live data via {globalProvider}. Local detail via {localProvider}.",
    "status.feedSynced": "Global feed synced ({count} points via {provider}).",
    "status.quotaExhausted": "Open-Meteo limit: {reason}. Previous data kept.",
    "status.networkError": "Network error. Previous data kept.",
    "status.quotaCache": "Open-Meteo limit: {reason}. Data from cache.",
    "status.networkCache": "Network error. Data from cache.",
    "status.quotaNoData": "Open-Meteo limit: {reason}. No data available. Retry after midnight UTC.",
    "status.networkNoData": "Network error. No data available.",
    "status.allBatchesFailed": "All {count} Open-Meteo batches failed (network errors)",
    "status.selectionRemoved": "Selection cleared.",
    "status.searchingLocation": "Searching location: {query}...",
    "status.locationNotFound": "Location not found.",
    "status.searchError": "Error searching for location.",
    "status.geoNotSupported": "Geolocation not supported by browser.",
    "status.geoRequesting": "Requesting current position from browser...",
    "status.geoError": "Geolocation unavailable: {message}",
    "status.providerGlobal": "Provider: {provider} (global layer + local detail).",
    "status.providerLocal": "Local provider: {provider}. Global data via Open-Meteo.",
    "status.loadingPoint": "Loading point weather via {provider}...",
    "status.pointUpdated": "Local detail updated via {provider}.",
    "status.pointSelected": "Selected point updated via {provider}.",
    "status.keyMissing": "API key missing for {provider} \u2014 using Open-Meteo as fallback.",
    "status.keyMissingNote": "API key not configured for {provider}. Local detail via Open-Meteo. Enter the key in the Provider panel.",
    "status.keyInvalid": "Invalid or unauthorized API key for {provider}. Check the key in the Provider panel.",
    "status.providerQuotaExhausted": "{provider} quota exhausted. Try again later.",
    "status.providerUnavailable": "{provider} service temporarily unavailable (error {status}).",
    "status.providerNoData": "Data unavailable for this location via {provider}.",
    "status.providerError": "Error loading local weather via {provider}.",
    "status.fallback": "{provider} unavailable \u2014 local data via {fallback}.",
    "status.currentPosition": "Current position",
    "status.fallbackQuotaExhausted": "{provider} quota exhausted. Try again later.",
    "status.fallbackUnavailable": "{provider} service temporarily unavailable (error {status}).",
    "status.fallbackError": "Error loading local weather via {provider}.",

    // Provider capability messages
    "provider.supportsGlobal": "{provider} handles both global layer and local detail.",
    "provider.localOnly": "{provider} handles local detail. Global layer uses {fallback} as fallback.",
    "provider.apiKeyPlaceholderOptional": "Optional API key for {provider}",
    "provider.apiKeyPlaceholderRequired": "Required API key for {provider}",
    "provider.apiKeyPlaceholder": "API key for {provider}",

    // Provider notes
    "provider.note.openMeteo": "No key required. Completely free.",
    "provider.note.openWeather": "Key required. Register at openweathermap.org (free plan available).",
    "provider.note.weatherApi": "Key required. Register at weatherapi.com (free plan available).",
    "provider.note.yr": "No key required. Respects Met.no usage guidelines.",
    "provider.note.visualCrossing": "Key required. Register at visualcrossing.com (1000 records/day free).",
    "provider.note.pirateWeather": "Key required. Free at pirateweather.net (5000 requests/day).",

    // Quota notes
    "quota.free": "Free quota not exposed by provider.",
    "quota.notExposed": "Quota not exposed by provider or not readable from browser.",
    "quota.yrFree": "Free quota, no key required. Respect Met.no usage guidelines.",
    "quota.visualCrossing": "Free quota: 1000 records/day.",
    "quota.pirateWeather": "Free quota: 5000 requests/day.",
    "quota.fromHeaders": "Quota detected from provider response headers.",

    // Condition fallback
    "condition.unknown": "Unknown condition",
    "condition.unavailable": "Condition unavailable",

    // Meta description
    "meta.description": "3D globe with global weather, point selection, geolocation, and multiple providers.",
  }
};

// WMO Weather code labels - separate since they're used for data mapping
const weatherCodeLabels = {
  it: {
    0: "Sereno", 1: "Quasi sereno", 2: "Parzialmente nuvoloso", 3: "Coperto",
    45: "Nebbia", 48: "Galaverna",
    51: "Pioviggine leggera", 53: "Pioviggine moderata", 55: "Pioviggine intensa",
    56: "Pioviggine gelata leggera", 57: "Pioviggine gelata intensa",
    61: "Pioggia debole", 63: "Pioggia moderata", 65: "Pioggia intensa",
    66: "Pioggia gelata leggera", 67: "Pioggia gelata intensa",
    71: "Neve debole", 73: "Neve moderata", 75: "Neve intensa",
    77: "Granelli di neve",
    80: "Rovesci deboli", 81: "Rovesci moderati", 82: "Rovesci violenti",
    85: "Rovesci nevosi deboli", 86: "Rovesci nevosi intensi",
    95: "Temporale", 96: "Temporale con grandine lieve", 99: "Temporale con grandine forte"
  },
  en: {
    0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
  }
};

/**
 * Translate a key to the current language, with optional parameter interpolation.
 * Falls back to Italian, then to the raw key.
 * @param {string} key - Translation key (e.g. "brand.eyebrow")
 * @param {Object} params - Optional parameters to interpolate (e.g. { provider: "Open-Meteo" })
 * @returns {string}
 */
export function t(key, params = {}) {
  const lang = weatherState.language ?? "it";
  let text = translations[lang]?.[key] ?? translations.it[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, v);
  }
  return text;
}

/**
 * Get a localized weather condition label by WMO weather code.
 * Falls back to Italian, then to "Unknown".
 * @param {number} code - WMO weather code
 * @returns {string}
 */
export function getWeatherCodeLabel(code) {
  const lang = weatherState.language ?? "it";
  return weatherCodeLabels[lang]?.[code] ?? weatherCodeLabels.it[code] ?? t("condition.unknown");
}

/**
 * Re-render all elements with data-i18n or data-i18n-placeholder attributes.
 * Call this after changing weatherState.language.
 */
export function renderAllI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
}
