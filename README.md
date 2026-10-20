# Geo Kvíz

Hádání míst světa – států, měst, hor, řek, jezer a moří, ostrovů, přírodních míst a slavných staveb. Každý den je pro všechny stejné **dnešní místo** (vždy známé místo, série dní, sdílení výsledku) a k tomu neomezený **trénink**, ve kterém si hráč v nastavení ⚙ vybere kategorie a jestli chce jen známá místa, nebo i méně známá.

Při prvním spuštění si hráč zvolí variantu hry – výběr ze čtyř možností, nebo psaní odpovědi za dvojnásobek bodů. Otázka zní „Co je to za místo?“, a kde to dává smysl (místo leží v jednom státě a název ho neprozradí), také „Ve kterém státě to je?“.

Nápovědy jdou postupně a každá ubere bod:

1. **popis** z české Wikipedie (je vidět hned, název místa nebo státu je v něm zakrytý),
2. **fotka** místa (jen skutečná fotka, ne vlajka, znak nebo mapa),
3. **slepá mapa** – obrysy států bez popisků, místo uprostřed (u států je zvýrazněný celý stát),
4. **čísla a fakta** z Wikidat – stát, kontinent, počet obyvatel, výška, délka, rok vzniku…

Po odpovědi jde rozkliknout okno se stručným popisem místa (nebo státu) ze špatné odpovědi i ostatních nabízených možností – popis z Wikipedie, fotka, mapa a čísla.

Režim **Učení** (tlačítko se čepicí) je bez bodů:

- **Atlas míst** – prohlížení míst podle nastavení kategorií a známosti: fotka, popis, mapa a fakta, tam i zpět,
- **Moje chyby** – místa, která hráč v kvízu neuhodl (nebo vzdal); jde si je prohlédnout a procvičit, správně uhodnuté místo ze seznamu zmizí.

Statická stránka bez serveru a bez build kroku při nasazení – na Netlify se publikuje kořen repozitáře tak, jak je.

## Soubory

| Soubor | Co obsahuje |
| --- | --- |
| `index.html` | Kostra stránky |
| `app.js` | Rozhraní: výběr místa, otázka s nápovědami, výsledek, okno s popisem místa, učení, nastavení, ukládání stavu |
| `quiz-core.js` | Čistá logika bez DOM (výběr míst, zakrývání, odpovědi, body, fakta, slepá mapa, série) – testovaná |
| `data/places.json` | Sada míst z Wikidat (generovaná) |
| `data/world.json` | Obrysy států pro slepou mapu (generované) |
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

Sada míst se generuje z Wikidat (asi 20 minut). Kategorie, typy míst a kolik z nich je „známých“ (podle počtu jazykových verzí Wikipedie) se nastavují ve `scripts/build-places.mjs`:

```sh
npm run build:places  # data/places.json
npm run build:world   # data/world.json (Natural Earth 1:110m)
```

Ikony aplikace (PNG) se vykreslují ze SVG v `icons/` skriptem `scripts/render-app-icons.js` (potřebuje Playwright).

Service worker (`sw.js`) načítá soubory aplikace přednostně ze sítě, takže se nová verze projeví hned po nasazení; uložené kopie (včetně sady míst) slouží bez internetu – hrát jde i offline, jen s krátkým popisem z Wikidat místo úvodu z Wikipedie.

## Testy

```sh
npm test
```

Spustí testy logiky a kontrolu vygenerované sady míst (`tests/quiz-core.test.js`, stačí Node 20+) a test celé aplikace v prohlížeči (`tests/e2e.test.js`). Ten potřebuje Playwright (`npm i -D playwright && npx playwright install chromium`), jinak se přeskočí. Používá malou testovací sadu míst a podvrženou Wikipedii, takže nezávisí na síti, a stránku servíruje s CSP z `_headers`.

## Zdroje dat

Místa, fakta a fotky z [Wikidat](https://www.wikidata.org) a [Wikimedia Commons](https://commons.wikimedia.org), popisy z [české Wikipedie](https://cs.wikipedia.org), obrysy států [Natural Earth](https://www.naturalearthdata.com) (volné dílo), satelitní snímky NASA Blue Marble přes [GIBS](https://earthdata.nasa.gov/gibs), mapa © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright), ikony [Lucide](https://lucide.dev) (ISC).
