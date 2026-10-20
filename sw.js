// Service worker: aplikace se otevře i bez internetu (témata, jejich data i obrysy států jsou v mezipaměti)
const CACHE_NAME = 'mudrlant-v1';
const APP_SHELL = [
    './', 'index.html', 'styles.css', 'icons.js', 'quiz-core.js', 'visuals.js', 'app.js', 'manifest.webmanifest',
    'topics/zemepis.js', 'data/zemepis.json', 'topics/historie.js', 'data/historie.json', 'topics/biologie.js', 'data/biologie.json',
    'topics/chemie.js', 'data/chemie.json', 'topics/fyzika.js', 'data/fyzika.json',
    'data/countries.json', 'data/world.json',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// Jen vlastní soubory aplikace; Wikipedie, fotky a mapy jdou přímo na síť
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    // Síť má přednost, aby se nová verze projevila hned po nasazení; mezipaměť jen bez internetu
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request, { ignoreSearch: true })
                .then(cached => cached || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
    );
});
