// Service worker: aplikace se otevře i bez internetu (témata, jejich data i obrysy států jsou v mezipaměti)
const CACHE_NAME = 'mudrlant-v2';
const APP_SHELL = [
    './', 'index.html', 'styles.css', 'icons.js', 'quiz-core.js', 'visuals.js', 'app.js', 'manifest.webmanifest',
    'topics/zemepis.js', 'data/zemepis.json', 'topics/historie.js', 'data/historie.json', 'topics/biologie.js', 'data/biologie.json',
    'topics/chemie.js', 'data/chemie.json', 'topics/fyzika.js', 'data/fyzika.json',
    'topics/vlajky.js', 'data/vlajky.json', 'topics/mytologie.js', 'data/mytologie.json', 'topics/geologie.js', 'data/geologie.json',
    'topics/umeni.js', 'data/umeni.json', 'topics/architektura.js', 'data/architektura.json', 'topics/hudba.js', 'data/hudba.json',
    'topics/literatura.js', 'data/literatura.json', 'topics/film.js', 'data/film.json', 'topics/sport.js', 'data/sport.json',
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
// Síť má přednost, aby se nová verze projevila hned po nasazení. Bez internetu, nebo když síť visí déle
// než NETWORK_WAIT (slabý signál), poslouží mezipaměť; čerstvá odpověď ze sítě ji pak stejně aktualizuje.
const NETWORK_WAIT = 4000;
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    // Uložení čerstvé odpovědi do mezipaměti se dokončí, i když stránka mezitím dostala verzi z mezipaměti
    let saving = Promise.resolve();
    const fromNetwork = fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            saving = caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
    });
    event.waitUntil(fromNetwork.then(() => saving).catch(() => {}));
    const fallback = () => caches.match(request, { ignoreSearch: true })
        .then(cached => cached || (request.mode === 'navigate' ? caches.match('index.html') : undefined));
    event.respondWith((async () => {
        const cached = await fallback();
        if (!cached) return fromNetwork.catch(() => Response.error());
        const slow = new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_WAIT));
        return Promise.race([fromNetwork.catch(() => cached), slow]);
    })());
});
