/**
 * Concurrent fetch limiter.
 *
 * Wraps the native fetch() to enforce a maximum number of concurrent requests.
 * Excess requests are queued and dispatched as slots free up.
 *
 * Usage:
 *   const limiter = createFetchLimiter(4);
 *   const resp = await limiter.fetch(url, opts);
 */

export function createFetchLimiter(maxConcurrent = 4) {
  let active = 0;
  const queue = [];

  function _next() {
    if (queue.length === 0 || active >= maxConcurrent) return;
    active++;
    const { url, opts, resolve, reject } = queue.shift();
    fetch(url, opts)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        active--;
        _next();
      });
  }

  return {
    fetch(url, opts) {
      return new Promise((resolve, reject) => {
        queue.push({ url, opts, resolve, reject });
        _next();
      });
    },
    get pending() { return queue.length; },
    get active() { return active; }
  };
}
