/**
 * Blitzortung Real-Time Lightning Feed
 *
 * Connects to the Blitzortung.org WebSocket API for real-time global
 * lightning strike data. Strikes are buffered and periodically pushed
 * to the lightning layer for visualization.
 *
 * Protocol: WebSocket to wss://ws1.blitzortung.org/
 * Message format: JSON { time, lat, lon, alt, pol, mds, mcg, sig }
 *
 * The feed provides ~5-50 strikes/second globally (varies with weather).
 * We maintain a rolling buffer of the last N minutes of strikes.
 */

const WS_URLS = [
  "wss://ws1.blitzortung.org/",
  "wss://ws7.blitzortung.org/",
  "wss://ws8.blitzortung.org/",
];

const MAX_STRIKES = 2000;        // Max strikes to keep in buffer
const STRIKE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECTS = 10;

let _ws = null;
let _connected = false;
let _reconnectCount = 0;
let _reconnectTimeout = null;
let _enabled = false;
let _onStrikesUpdate = null;

// Rolling buffer of recent lightning strikes
const _strikes = [];

/**
 * A single lightning strike.
 * @typedef {Object} LightningStrike
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
 * @property {number} time - Timestamp in nanoseconds
 * @property {number} intensity - Signal strength (0-1 normalized)
 * @property {number} receivedAt - Date.now() when received
 */

/**
 * Start the Blitzortung WebSocket connection.
 * @param {Function} onUpdate - Called with the current strike array when new strikes arrive
 */
export function startBlitzortung(onUpdate) {
  _onStrikesUpdate = onUpdate;
  _enabled = true;
  _reconnectCount = 0;
  _connect();
}

/**
 * Stop the Blitzortung WebSocket connection and clear data.
 */
export function stopBlitzortung() {
  _enabled = false;
  if (_reconnectTimeout) {
    clearTimeout(_reconnectTimeout);
    _reconnectTimeout = null;
  }
  if (_ws) {
    _ws.onclose = null; // Prevent reconnect
    _ws.close();
    _ws = null;
  }
  _connected = false;
  _strikes.length = 0;
}

/**
 * Get the current strike buffer (read-only view).
 */
export function getStrikes() {
  return _strikes;
}

/**
 * Returns true if the Blitzortung feed is connected.
 */
export function isBlitzortungConnected() {
  return _connected;
}

function _connect() {
  if (!_enabled) return;
  if (_ws) {
    try { _ws.close(); } catch { /* ignore */ }
  }

  // Cycle through server URLs to distribute load
  const url = WS_URLS[_reconnectCount % WS_URLS.length];

  try {
    _ws = new WebSocket(url);
  } catch (err) {
    console.warn("[Blitzortung] WebSocket constructor failed:", err.message);
    _scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    _connected = true;
    _reconnectCount = 0;
    console.log(`[Blitzortung] Connected to ${url}`);

    // Subscribe to global lightning data
    // Format: {"a": signal_type} where signal_type=1 is lightning data
    try {
      _ws.send(JSON.stringify({ a: 1 }));
    } catch { /* ignore */ }
  };

  _ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Lightning strike message: has lat, lon, time
      if (msg.lat != null && msg.lon != null) {
        const strike = {
          lat: msg.lat,
          lon: msg.lon,
          time: msg.time || 0,
          // Normalize signal strength: sig ranges ~100-10000, map to 0.3-1.0
          intensity: Math.min(1.0, Math.max(0.3, (msg.sig || 500) / 5000)),
          receivedAt: Date.now(),
        };

        _strikes.push(strike);

        // Trim buffer: remove old strikes and keep under MAX_STRIKES
        _pruneStrikes();

        // Notify listener (debounced — only every ~100ms via requestAnimationFrame)
        if (_onStrikesUpdate && !_pendingUpdate) {
          _pendingUpdate = true;
          requestAnimationFrame(() => {
            _pendingUpdate = false;
            if (_onStrikesUpdate) _onStrikesUpdate(_strikes);
          });
        }
      }
    } catch { /* ignore malformed messages */ }
  };

  _ws.onclose = () => {
    _connected = false;
    if (_enabled) {
      _scheduleReconnect();
    }
  };

  _ws.onerror = (err) => {
    console.warn("[Blitzortung] WebSocket error:", err);
    // onclose will fire after onerror
  };
}

let _pendingUpdate = false;

function _pruneStrikes() {
  const cutoff = Date.now() - STRIKE_TTL_MS;

  // Remove expired strikes from the front of the array
  while (_strikes.length > 0 && _strikes[0].receivedAt < cutoff) {
    _strikes.shift();
  }

  // If still over max, remove oldest
  while (_strikes.length > MAX_STRIKES) {
    _strikes.shift();
  }
}

function _scheduleReconnect() {
  if (!_enabled) return;
  _reconnectCount++;

  if (_reconnectCount > MAX_RECONNECTS) {
    console.warn(`[Blitzortung] Max reconnects (${MAX_RECONNECTS}) reached. Giving up.`);
    return;
  }

  const delay = RECONNECT_DELAY_MS * Math.min(_reconnectCount, 5);
  console.log(`[Blitzortung] Reconnecting in ${delay}ms (attempt ${_reconnectCount}/${MAX_RECONNECTS})`);

  _reconnectTimeout = setTimeout(() => {
    _reconnectTimeout = null;
    _connect();
  }, delay);
}
