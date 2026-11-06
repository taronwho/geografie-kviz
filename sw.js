// Service worker: aplikace se otevře i bez internetu (témata, jejich data i obrysy států jsou v mezipaměti)
// Nasazení sem dosadí zkratku commitu – každá nová verze je tak nový service worker, který se nainstaluje
// a otevřenou aplikaci obnoví (jinak by se o nové verzi nedozvěděla)
const CACHE_NAME = 'mudrlant-v3';
const APP_SHELL = [
    './', 'index.html', 'styles.css', 'config.js', 'friends.js', 'soukromi.html', 'licence.html', 'licence.js', 'question-report.js', 'monitor.js', 'auth.js', 'social.js', 'icons.js', 'quiz-core.js', 'visuals.js', 'look-flags.js', 'look.js', 'look-themes.js', 'look-robes.js', 'look-frames.js', 'look-owl.js', 'rating.js', 'tournament.js', 'review.js', 'goals.js', 'tutorial.js', 'push.js', 'app.js', 'manifest.webmanifest',
    'topics/zemepis.js', 'data/zemepis.json', 'topics/historie.js', 'data/historie.json', 'topics/biologie.js', 'data/biologie.json',
    'topics/chemie.js', 'data/chemie.json', 'topics/fyzika.js', 'data/fyzika.json',
    'topics/vlajky.js', 'data/vlajky.json', 'topics/mytologie.js', 'data/mytologie.json', 'topics/geologie.js', 'data/geologie.json',
    'topics/umeni.js', 'data/umeni.json', 'topics/architektura.js', 'data/architektura.json', 'topics/hudba.js', 'data/hudba.json',
    'topics/literatura.js', 'data/literatura.json', 'topics/film.js', 'data/film.json', 'topics/sport.js', 'data/sport.json',
    'data/countries.json', 'data/world.json', 'data/photo-text.json', 'data/photo-masks.json',
    'icons/logo.webp', 'icons/logo-maska.webp', ...['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'mix', 'chyby', 'dnes', 'vyzva', 'napoveda', 'stopky', 'serie', 'sova-radost', 'sova-smutek', 'sova-premysleni', 'sova-oslava', 'sova-vitez', 'sova-prohra', 'sova-vitej', 'sova-vyzva', 'sova-serie', 'sova-spi'].map(id => `icons/topics/${id}.webp`), 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
    // cache: 'reload' – soubory ze sítě, ne z mezipaměti prohlížeče (GitHub Pages je nechává platit 10 minut)
    event.waitUntil(caches.open(CACHE_NAME)
        .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
        .then(() => self.skipWaiting()));
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
    // Vždy ověřit u serveru (no-cache: nezměněný soubor vrátí jen krátké 304), ne brát z mezipaměti prohlížeče
    const fresh = request.mode === 'navigate'
        ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(response => response.redirected ? fetch(request) : response)
        : fetch(request, { cache: 'no-cache' });
    const fromNetwork = fresh.then(response => {
        // Do mezipaměti jen skutečný soubor: přihlašovací stránka Wi-Fi (HTML místo skriptu nebo dat) by ji jinak otrávila
        const type = response.headers.get('content-type') || '';
        const wrongType = request.mode !== 'navigate' && /text\/html/i.test(type) && !/\.html?$/i.test(new URL(request.url).pathname);
        if (response.ok && !wrongType) {
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

// Web push (odesílá GitHub Actions, viz docs/SUPABASE.md): ukáže upozornění a po klepnutí otevře aplikaci na záložce Více hráčů
const pushText = (value, max, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback);
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (error) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
    event.waitUntil(self.registration.showNotification(pushText(data.title, 80, 'Mudrlant'), {
        body: pushText(data.body, 200, ''), icon: 'icons/icon-192.png', tag: pushText(data.kind, 30, 'mudrlant'), data: { url: pushText(data.url, 200, './') }
    }));
});
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const scope = new URL(self.registration.scope);
    let target = new URL((event.notification.data && event.notification.data.url) || './', scope);
    if (target.origin !== scope.origin) target = scope;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find(client => new URL(client.url).origin === scope.origin);
        if (open) {
            await open.focus();
            open.postMessage({ type: 'push-open', tab: target.searchParams.get('tab') || '' });
        } else {
            await self.clients.openWindow(target.href);
        }
    })());
});
