/* Entrelinhas: guarda o app no aparelho para abrir sem internet (as obras e o dicionário entram no guardado na 1ª vez que são abertos). */
const CACHE = "entrelinhas-1.4.0-1c7ed9ad";
const FILES = ["./", "dict.css", "dict.js", "dicts/index.json", "entrelinhas.css", "home.css", "home.js", "i18n.js", "icons/app-180.png", "icons/app-192.png", "icons/app-512.png", "icons/icon128.png", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/maskable-512.png", "index.html", "lang/pt.js", "library.js", "manifest.webmanifest", "narrator.js", "options.css", "options.html", "options.js", "pager.js", "reader.css", "reader.html", "reader.js", "tomos/index.json", "tomos/machado/obras/dom-casmurro.json", "tomos/machado/obras/esau-e-jaco.json", "tomos/machado/plus/dom-casmurro.json", "tomos/machado/plus/esau-e-jaco.json", "tomos/machado/tomo.json", "wake.js", "web-shim.js", "web.css"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith("entrelinhas-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;   // downloads de outras origens passam direto
  // abre na hora com o que está guardado e, com internet, atualiza o guardado para a próxima abertura
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  }));
});
