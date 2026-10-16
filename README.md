# Geo Kvíz

Hádání míst světa podle nápověd z české Wikipedie. Každý den je pro všechny stejné **dnešní místo** (série dní, sdílení výsledku) a k tomu neomezený **trénink**. Odpovídá se napsáním (dvojnásobek bodů) nebo výběrem ze čtyř možností; každá další nápověda ubírá body.

Statická stránka bez serveru a bez build kroku při nasazení – na Netlify se publikuje kořen repozitáře tak, jak je.

## Soubory

| Soubor | Co obsahuje |
| --- | --- |
| `index.html` | Kostra stránky |
| `app.js` | Rozhraní: načítání z Wikipedie a Wikidat, otázka, výsledek, mapa, ukládání stavu |
| `quiz-core.js` | Čistá logika bez DOM (zakrývání nápověd, text, odpovědi, body, série, mapa) – testovaná |
| `icons.js` | Použité ikony z Lucide (generované) |
| `styles.css` | Styly z Tailwindu (generované ze `src/input.css`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalace na plochu a provoz bez internetu |
| `_headers` | Bezpečnostní hlavičky pro Netlify včetně Content-Security-Policy |

## Úpravy

Po změně tříd v `index.html` nebo `app.js` je potřeba přegenerovat styly, po přidání ikony seznam ikon:

```sh
npm run build:css     # styles.css (Tailwind 3.4.17 přes npx)
npm run build:icons   # icons.js (seznam ikon je ve scripts/build-icons.mjs)
```

Ikony aplikace (PNG) se vykreslují ze SVG v `icons/` skriptem `scripts/render-app-icons.js` (potřebuje Playwright).

Service worker (`sw.js`) načítá soubory aplikace přednostně ze sítě, takže se nová verze projeví hned po nasazení; uložené kopie slouží jen bez internetu.

## Testy

```sh
npm test
```

Spustí testy logiky (`tests/quiz-core.test.js`, stačí Node 20+) a test celé aplikace v prohlížeči (`tests/e2e.test.js`). Ten potřebuje Playwright (`npm i -D playwright && npx playwright install chromium`), jinak se přeskočí. Wikipedii a Wikidata podvrhuje, takže nezávisí na síti, a stránku servíruje s CSP z `_headers`.

## Zdroje dat

Texty a fotky z [české Wikipedie](https://cs.wikipedia.org), státy z [Wikidat](https://www.wikidata.org), mapa © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright), ikony [Lucide](https://lucide.dev) (ISC).
