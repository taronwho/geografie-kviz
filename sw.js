// Service worker: aplikace se otevře i bez internetu (témata, jejich data i obrysy států jsou v mezipaměti)
// Nasazení sem dosadí zkratku commitu – každá nová verze je tak nový service worker, který se nainstaluje
// a otevřenou aplikaci obnoví (jinak by se o nové verzi nedozvěděla)
const CACHE_NAME = 'mudrlant-v3';
// Symboly odznaků (icons/topics/odznak-<skupina>.webp); stejný seznam má app.js (BADGE_ART), hlídá tests/badge-art.test.js
const BADGE_ART = ['sberatel', 'odpovedi', 'rada', 'serie', 'dny', 'dokonale', 'dnes', 'bez-napovedy', 'psani', 'tezke', 'chyby', 'vyzvy', 'vyhry', 'vyhry-v-rade', 'zalozene',
    'perfektni-vyzvy', 'uroven', 'poznane', 'vsestrannost', 'hvezdy', 'vsechna-temata', 'turnaje', 'turnaj-postupy', 'tydenni-cile', 'kviz-dne',
    'kviz-serie', 'kviz-perfekt', 'bleskovka', 'preziti', 'mapa', 'odhad', 'serad', 'detektiv'];
// Postavičky (profilové obrázky za odměny, icons/avatars/<id>.webp); stejný seznam má look.js (AVATARS s parts), hlídá tests/avatars.test.js.
// Vrstvy přebarvených částí (<id>-<část><barva>.webp) se uloží až při použití.
const AVATAR_ART = ['cervik', 'axolot', 'kaktus', 'drak', 'mamut', 'meduza', 'lenoch', 'tukan', 'lev', 'fenix', 'krecek', 'rytir', 'narval', 'zelva',
    'hodiny', 'chamel', 'gepard', 'zelvus', 'tucnak', 'zabak', 'myval',
    // Legendární postavičky za diplomy témat
    'albatr', 'gryf', 'slon', 'sfinga', 'jelen', 'golem', 'liska', 'chobot', 'pav', 'bobr', 'vlk', 'kndrak', 'panda', 'klokan',
    // Sezónní postavičky ze Sezónní truhly (look.js SEASON_AVATARS)
    'ramp', 'kobliz', 'snezen', 'kapka', 'pampel', 'vysved', 'meloun', 'hvezda', 'aktovk', 'drakpa', 'caj', 'pernik'];
// Obrázkové rámečky profilu (icons/frames/<id>.webp); stejný seznam má look.js (FRAMES s art: true), hlídá tests/look-frames.test.js
const FRAME_ART = ['vecny-ohen', 'sezona-01', 'sezona-01-b', 'sezona-02', 'sezona-02-b', 'sezona-03', 'sezona-03-b', 'sezona-04', 'sezona-04-b', 'sezona-05', 'sezona-05-b', 'sezona-06', 'sezona-06-b', 'sezona-07', 'sezona-07-b', 'sezona-08', 'sezona-08-b', 'sezona-09', 'sezona-09-b', 'sezona-10', 'sezona-10-b', 'sezona-11', 'sezona-11-b', 'sezona-12', 'sezona-12-b',
    'ohen', 'more', 'soukoli', 'galaxie', 'kralovsky-vavrin', 'blesk', 'led', 'drak', 'duha-mracky', 'ruze'];
const APP_SHELL = [
    './', 'index.html', 'styles.css', 'config.js', 'friends.js', 'groups.js', 'soukromi.html', 'licence.html', 'licence.js', 'question-report.js', 'answer-stats.js', 'monitor.js', 'auth.js', 'social.js', 'icons.js', 'quiz-core.js', 'mystery.js', 'photo-source.js', 'visuals.js', 'question-map.js', 'numeric-questions.js', 'look-flags.js', 'look.js', 'look-themes.js', 'look-robes.js', 'look-frames.js', 'look-owl.js', 'rating.js', 'league-seasons.js', 'showcase.js', 'tournament.js', 'review.js', 'goals.js', 'chronicle.js', 'tips.js', 'tutorial.js', 'push.js', 'daily-quiz.js', 'share-card.js', 'rewards.js', 'season.js', 'app.js', 'manifest.webmanifest', 'album.js', 'gold.js', 'boss.js',
    'topics/zemepis.js', 'data/zemepis.json', 'topics/historie.js', 'data/historie.json', 'topics/biologie.js', 'data/biologie.json',
    'topics/chemie.js', 'data/chemie.json', 'topics/fyzika.js', 'data/fyzika.json',
    'topics/vlajky.js', 'data/vlajky.json', 'topics/mytologie.js', 'data/mytologie.json', 'topics/geologie.js', 'data/geologie.json',
    'topics/umeni.js', 'data/umeni.json', 'topics/architektura.js', 'data/architektura.json', 'topics/hudba.js', 'data/hudba.json',
    'topics/literatura.js', 'data/literatura.json', 'topics/film.js', 'data/film.json', 'topics/sport.js', 'data/sport.json',
    'data/countries.json', 'data/world.json', 'data/mapa.json', 'data/mapa-tvary.json', 'data/mapa-opravy.json', 'data/regiony.json', 'data/photo-text.json', 'data/photo-masks.json',
    // Režimy Bleskovka a Přežití, zvuky a vibrace
    'modes.js', 'sound.js',
    // Dobývání (conquest.js, conquest-ui.js) a jeho mapy (scripts/build-dobyvani.js)
    'conquest.js', 'conquest-ui.js', 'data/dobyvani-evropa.json', 'data/dobyvani-afrika.json', 'data/dobyvani-asie.json', 'data/dobyvani-amerika.json', 'data/dobyvani-cesko.json',
    // Masky loga (čepice, ruka, obojí: bez načtené masky by se sova nevykreslila) a logo bez monoklu
    'icons/logo.webp', 'icons/logo-maska.webp', 'icons/logo-maska-ruka.webp', 'icons/logo-maska-oba.webp', 'icons/logo-bez-monoklu.webp', ...['zemepis', 'vlajky', 'historie', 'mytologie', 'biologie', 'geologie', 'chemie', 'fyzika', 'umeni', 'architektura', 'hudba', 'literatura', 'film', 'sport', 'mix', 'chyby', 'dnes', 'vyzva', 'napoveda', 'stopky', 'serie', 'sova-radost', 'sova-smutek', 'sova-premysleni', 'sova-oslava', 'sova-vitez', 'sova-prohra', 'sova-vitej', 'sova-vyzva', 'sova-serie', 'sova-spi', 'liga-bronz', 'liga-stribro', 'liga-zlato', 'liga-platina', 'liga-diamant', 'liga-mistr', 'turnaj', 'nahodny', 'kod', 'cile', 'procvicovani', 'sova-tip', 'sova-titul-1', 'sova-titul-2', 'sova-titul-3', 'sova-titul-4', 'sova-titul-5', 'sova-titul-6', 'sova-titul-7', 'sova-titul-8', 'sova-titul-9', 'sova-titul-10', 'sova-titul-11', 'truhla', 'ochrana-serie', 'diplom', 'truhla-otevrena',
        // Režimy, Učení, Skupiny, Archiv turnajů a pózy sovy do prázdných míst (docs/OBRAZKY.md č. 79–89)
        'rezim-bleskovka', 'rezim-preziti', 'rezim-mapa', 'ucit-prohlizet', 'ucit-procvicit', 'skupiny', 'archiv-turnaju', 'sova-zvonek', 'sova-dalekohled', 'sova-ceka', 'sova-prazdna-posta', 'sova-cisty-sesit', 'sova-prach',
        // Sezóna, album sbírky a vitrína (docs/OBRAZKY.md č. 133, 148, 150; odznak Sběratel č. 149 je v BADGE_ART)
        'sezona', 'album', 'vitrina',
        // Sezónní truhly podle ročního období (season.js CHEST_READY, docs/OBRAZKY.md č. 175–176)
        'truhla-zima', 'truhla-zima-otevrena', 'truhla-jaro', 'truhla-jaro-otevrena', 'truhla-leto', 'truhla-leto-otevrena', 'truhla-podzim', 'truhla-podzim-otevrena'].map(id => `icons/topics/${id}.webp`),
    ...BADGE_ART.map(id => `icons/topics/odznak-${id}.webp`), ...AVATAR_ART.map(id => `icons/avatars/${id}.webp`), ...FRAME_ART.map(id => `icons/frames/${id}.webp`), 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
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
// Jedna funkce pro skutečný push i pro zkoušku z vývojářského režimu (zpráva push-test od stránky): stejné ořezání textů, ikona, tag a adresa
const showPush = (data) => {
    const value = data && typeof data === 'object' ? data : {};
    const kind = pushText(value.kind, 30, 'mudrlant');
    return self.registration.showNotification(pushText(value.title, 80, 'Mudrlant'), {
        body: pushText(value.body, 200, ''), icon: 'icons/icon-192.png', tag: kind, data: { url: pushText(value.url, 200, './'), kind }
    });
};
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (error) { data = {}; }
    event.waitUntil(showPush(data));
});
// Zkouška bez serveru (Nastavení → Vývojářský režim → Zkusit upozornění v tomto zařízení): zprávu smí poslat jen stránka téže aplikace
// (prohlížeč doručí service workeru zprávy jen z vlastního původu); odpověď (ukázáno / chyba) jde zpět přes předaný port
self.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.type !== 'push-test') return;
    const port = event.ports && event.ports[0];
    const reply = (answer) => { if (port) port.postMessage(answer); };
    const shown = Promise.resolve().then(() => showPush(message.payload)).then(() => reply({ ok: true }), (error) => reply({ ok: false, error: `${error && error.name ? error.name : 'Error'}: ${error && error.message ? error.message : ''}` }));
    if (event.waitUntil) event.waitUntil(shown);
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
            open.postMessage({ type: 'push-open', tab: target.searchParams.get('tab') || '', vyzva: target.searchParams.get('vyzva') || '', kind: pushText(event.notification.data && event.notification.data.kind, 30, '') });
        } else {
            await self.clients.openWindow(target.href);
        }
    })());
});
