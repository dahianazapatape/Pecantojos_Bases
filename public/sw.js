// Service worker de Pecantojos: la app abre aunque no haya señal y
// los datos se piden siempre al servidor primero (red primero).
const VERSION = 'pc-mongo-v3';
const ESTATICOS = [
  '/', '/index.html', '/admin', '/admin.html', '/css/estilos.css', '/js/comun.js', '/js/tienda.js', '/js/admin.js', '/js/pwa.js',
  '/img/logo.svg', '/img/productos/generica.svg', '/manifest.webmanifest', '/admin.webmanifest',
  '/fonts/nunito-latin-400-normal.woff2', '/fonts/nunito-latin-700-normal.woff2', '/fonts/fraunces-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(`${VERSION}-estaticos`).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Datos: siempre del servidor; si no hay conexión, la última copia guardada
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(`${VERSION}-api`).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: { code: 'SIN_CONEXION', message: 'Sin conexión y esta pantalla no tiene información guardada todavía.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }

  // Páginas y recursos: red primero para ver siempre la última versión, caché si no hay señal
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(`${VERSION}-estaticos`).then((c) => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match(url.pathname.startsWith('/admin') ? '/admin' : '/'))));
});

self.addEventListener('message', (e) => {
  if (e.data === 'borrar-datos') caches.delete(`${VERSION}-api`);
});
