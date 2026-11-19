"use strict";

const cacheName = "omega-calculator-v4";
const pageUrl = new URL("index.html", self.registration.scope).href;
const homeUrl = self.registration.scope;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.add(new Request(homeUrl, {cache: "reload"}))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("omega-calculator-") && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const {request} = event;
  const url = new URL(request.url);
  url.search = "";
  if (request.mode !== "navigate" || (url.href !== homeUrl && url.href !== pageUrl)) return;

  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(request, {signal: controller.signal});
      if (response.status < 500) return response;
    } catch {
      // A successful installation has already cached the page.
    } finally {
      clearTimeout(timeout);
    }
    return (await caches.match(homeUrl, {cacheName})) || Response.error();
  })());
});
