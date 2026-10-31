// Oflayn qobiq: ilova fayllari keshda turadi (internetsiz ham ochiladi). Server so'rovlari hech qachon keshlanmaydi.
const CACHE = 'nurimai-app-0.8.5';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'start.js', 'config.js', 'manifest.webmanifest', 'lib/theme.js', 'lib/math-text.js', 'lib/practice-core.js', 'lib/office-core.js', 'lib/office-write.js', 'lib/memory.js', 'lib/voice.js', 'lib/ustoz.js',
  'lib/cap/capacitor.js', 'lib/cap/app.js', 'lib/cap/local-notifications.js', 'icons/icon-192.png', 'fonts.css',
  'fonts/commissioner-latin.woff2', 'fonts/commissioner-latin-ext.woff2', 'fonts/onest-latin.woff2', 'fonts/onest-latin-ext.woff2',
  'pufak/pufak.webp', 'pufak/think.webp', 'pufak/happy.webp', 'pufak/wave.webp', 'brand/horizontal-reverse.svg', 'brand/horizontal.svg',
  'live.html', 'live.css', 'live.js', 'live-worklet.js', 'pufak/talk.webp', 'pufak/sad.webp'];
// Yangi versiya fayllari serverdan olinadi (cache: 'reload'): aks holda brauzerning HTTP keshidagi eski app.js yangi keshga tushib qoladi.
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nurimai-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  const page = event.request.mode === 'navigate';
  event.respondWith(page
    ? fetch(event.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')) // sahifa: avval internet (yangilanish tez yetib keladi)
    : caches.match(event.request).then(hit => hit || fetch(event.request).then(r => { if (r.ok && !r.headers.get('content-range')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); } return r; })));
});
