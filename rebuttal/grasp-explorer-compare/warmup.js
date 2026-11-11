// Shared by the landing page and its same-origin viewer: one request per model.
(() => {
  const key = '__graspAssetWarmup';
  if (window[key]) return;
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin && window.parent[key]) {
      window[key] = window.parent[key];
      return;
    }
  } catch { /* A standalone or externally embedded viewer owns its downloads. */ }

  const base = new URL('./', document.currentScript.src).href;
  const urls = [
    `${base}assets/scene-20261111-fast.glb.gz`,
    new URL('../grasp-explorer-v2/assets/robot-20261110.glb.gz', base).href,
    `${base}assets/object-20261111.glb.gz`,
  ];
  const pending = new Map();
  const cache = typeof caches !== 'undefined'
    ? caches.open('grasp-models-v1').catch(() => null)
    : Promise.resolve(null);

  async function download(url) {
    const storage = await cache;
    let response = storage ? await storage.match(url).catch(() => null) : null;
    if (!response) {
      response = await fetch(url);
      if (!response.ok) throw new Error(`Model download: HTTP ${response.status}`);
      // Versioned model URLs are cache keys; change filenames when replacing assets. Cache failures never block viewing.
      if (storage) storage.put(url, response.clone()).catch(() => {});
    }
    // Inflate while bytes arrive instead of waiting for the entire download.
    // fetch already decodes a server-declared Content-Encoding: gzip.
    if (response.body && typeof DecompressionStream !== 'undefined'
        && !/gzip/i.test(response.headers.get('Content-Encoding') || '')) {
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    return response.arrayBuffer();
  }

  function get(url) {
    if (!urls.includes(url)) return null;
    if (!pending.has(url)) {
      const request = download(url).catch(error => {
        pending.delete(url); // Allow the viewer's Retry button to try again.
        throw error;
      });
      pending.set(url, request);
      request.catch(() => {}); // Warmup can fail before the viewer is ready to listen.
    }
    return pending.get(url);
  }

  window[key] = { get };
  urls.forEach(get);
})();
