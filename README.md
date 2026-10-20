# Mudrlant

Kvízová aplikace s tématy **Zeměpis**, **Historie**, **Biologie**, **Chemie** a **Fyzika**. Všechna témata fungují stejně:

- **Dnešní otázky** – každé téma má jednu otázku denně, pro všechny stejnou (vždy ze známých položek), a vlastní sérii dní; výsledek jde sdílet.
- **Hraní tématu** – dlaždice tématu na domovské obrazovce; poprvé se otevře okno s výběrem kategorií (výchozí všechny), pak se hraje rovnou. **Mix** míchá otázky z vybraných témat. Každé téma má svou barvu (štítek a okraj hlavičky), klepnutím na štítek jde změnit kategorie nebo téma. Jen známé položky, nebo i méně známé.
- **Učení** – bez bodů a systematicky: v každém tématu jsou celé kategorie a **okruhy** (Česko, Přemyslovci, Angličtí panovníci, Šelmy, Naše příroda, Vyhynulé druhy, Halogeny, Vitamíny, Základní jednotky SI…). Okruh jde procházet popořadě jako atlas, nebo procvičovat jen jeho otázky; postup se ukládá. K tomu **Moje chyby** – co hráč neuhodl, jde si prohlédnout a procvičit znovu.

Při prvním spuštění si hráč zvolí variantu hry – výběr ze čtyř možností, nebo psaní odpovědi za dvojnásobek bodů.

## Otázky a nápovědy

Základní otázka je „Co je to?“ podle kategorie (Který prvek to je?, Kdo to je?, Co je to za zvíře?). Témata mají i vlastní druhy otázek, kde je název vidět a hádá se něco jiného:

| Téma | Další otázky |
| --- | --- |
| Zeměpis | Ve kterém státě to je? |
| Historie | Ve kterém století začal vládnout? (narodila se, nastoupil do úřadu, odehrálo se, vznikl) – vždy jeden okamžik, ať na přelomu století nejsou správně dvě odpovědi |
| Biologie | Do kterého řádu (u rostlin a hub čeledi) patří? |
| Chemie | Jakou značku má tento prvek? Jaký vzorec má tato látka? |
| Fyzika | Jaká je jednotka SI této veličiny? Jakou značku má tato jednotka? Co měří tato jednotka? |

Nápovědy jdou postupně a každá ubere bod: **popis** z české Wikipedie (je vidět hned, odpověď je v něm zakrytá), **fotka**, **obrazová nápověda** tématu a **čísla a fakta** z Wikidat. Obrazové nápovědy:

- **slepá mapa** (zeměpis, bitvy) – obrysy států bez popisků, místo uprostřed,
- **časová osa** (historie, chemici, fyzici) – život a vláda či úřad, s pár orientačními událostmi ze stejných dějin (u anglického krále anglické a světové, české jen u českých dějin),
- **mapa rozšíření** (biologie) a **strukturní vzorec** (chemie) – obrázek z Wikimedia Commons,
- **slepá periodická tabulka** (chemie) – políčka bez značek obarvená podle skupin, hledaný prvek zvýrazněný.

Popis a odemčené nápovědy jsou záložky jednoho panelu pevné výšky, takže se odpověď při nápovědě neposune a na telefonu není co posouvat. Po odpovědi jsou v záložkách fotka, mapa s polohou, snímek z družice a obrazová nápověda (i ty, které hráč neotevřel), fakta pod nimi a tlačítko **Další otázka** je přilepené dole. Jde rozkliknout i okno s popisem položky ze špatné odpovědi a ostatních nabízených možností.

Statická stránka bez serveru a bez build kroku při nasazení – na Netlify se publikuje kořen repozitáře tak, jak je.

## Soubory

| Soubor | Co obsahuje |
| --- | --- |
| `index.html` | Kostra stránky |
| `app.js` | Rozhraní: obrazovky, otázka s nápovědami, výsledek, okno s popisem, učení, nastavení, ukládání stavu |
| `quiz-core.js` | Čistá logika bez DOM (výběr položek, okruhy, zakrývání, odpovědi, body, fakta, slepá mapa, časová osa, periodická tabulka, série) – testovaná |
| `visuals.js` | Vykreslení obrazových nápověd (mapa, časová osa, obrázek, periodická tabulka) |
| `topics/<téma>.js` | Jedno téma: kategorie, otázky, fakta, nápovědy a zakrývání (viz níže) |
| `data/<téma>.json` | Položky a okruhy tématu (generované z Wikidat) |
| `data/countries.json`, `data/world.json` | Státy a jejich obrysy pro slepou mapu (generované) |
| `icons.js` | Použité ikony z Lucide (generované) |
| `styles.css` | Styly z Tailwindu (generované ze `src/input.css`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalace na plochu a provoz bez internetu |
| `_headers` | Bezpečnostní hlavičky pro Netlify včetně Content-Security-Policy |

## Jak přidat téma

Aplikace o tématech nic neví – všechno potřebné popisuje soubor tématu. Nové téma (třeba Umění) potřebuje:

1. `topics/umeni.js` – stejný tvar jako ostatní témata: `id`, `title`, `icon`, `color`, `dataFile`, `words`, `categories` a funkce `facts`, `subtitle`, volitelně `visual`, `specialQuestion`, `censor`, `groupOf`, `nameAliases`, `isCzech`;
2. `scripts/build-umeni.mjs` – sestaví `data/umeni.json` (položky `{ q, t, n, c, k, d, im, ih, f, g }` a okruhy `{ id, label, text, sort }`); pomocníci pro Wikidata jsou ve `scripts/lib/wikidata.mjs`;
3. řádek `<script src="topics/umeni.js" defer></script>` v `index.html` a oba soubory v `APP_SHELL` v `sw.js`.

Test `tests/topics.test.js` každé téma zkontroluje automaticky (povinné části, ikony, zapojení do stránky, data, okruhy, možnosti odpovědí). Nový druh obrazové nápovědy se přidá do `visuals.js`.

## Do budoucna: hra více hráčů

Otázka vzniká z položky a generátoru náhodných čísel se semínkem (`createRoundData` v `app.js`, výběr v `pickItem`) a je to samostatný objekt JSON – stejné semínko dá stejnou otázku a hotovou otázku jde poslat dál. Body (`pointsFor`) i kontrola odpovědi (`isAnswerMatch` proti `question.accepted`) jsou čisté funkce v jádře. Zápas 1 na 1 nebo pro více hráčů tak může všem rozeslat stejné semínko nebo rovnou stejné otázky a výsledky porovnat; verzi dat určuje `generated` v `data/<téma>.json`.

## Úpravy

Po změně tříd v HTML nebo JS je potřeba přegenerovat styly, po přidání ikony seznam ikon:

```sh
npm run build:css     # styles.css (Tailwind 3.4.17 přes npx)
npm run build:icons   # icons.js (seznam ikon je ve scripts/build-icons.mjs)
```

Data témat se generují z Wikidat (zeměpis a historie přes query.wikidata.org, biologie, chemie a fyzika přes [QLever](https://qlever.dev), který zvládne i strom taxonů). Pravidla – co je „známé“, okruhy, co do tématu nepatří – jsou v příslušném skriptu. S proměnnou `BUILD_CACHE=složka` se mezivýsledky ukládají a pravidla jde ladit bez opakovaného stahování.

```sh
npm run build:countries  # data/countries.json
npm run build:world      # data/world.json (Natural Earth 1:110m)
npm run build:zemepis    # data/zemepis.json
npm run build:historie   # data/historie.json
npm run build:biologie   # data/biologie.json
npm run build:chemie     # data/chemie.json
npm run build:fyzika     # data/fyzika.json
```

Ikony aplikace (PNG) se vykreslují ze SVG v `icons/` skriptem `scripts/render-app-icons.js` (potřebuje Playwright).

Service worker (`sw.js`) načítá soubory aplikace přednostně ze sítě, takže se nová verze projeví hned po nasazení; uložené kopie (včetně dat všech témat) slouží bez internetu – hrát jde i offline, jen s krátkým popisem z Wikidat místo úvodu z Wikipedie.

## Testy

```sh
npm test
```

Spustí testy logiky (`tests/quiz-core.test.js`), kontrolu témat a jejich dat (`tests/topics.test.js`, stačí Node 20+) a test celé aplikace v prohlížeči (`tests/e2e.test.js`). Ten potřebuje Playwright (`npm i -D playwright && npx playwright install chromium`), jinak se přeskočí. Používá malá testovací data (`tests/fixtures.js`) a podvrženou Wikipedii, takže nezávisí na síti, a stránku servíruje s CSP z `_headers`.

## Zdroje dat

Položky, fakta a fotky z [Wikidat](https://www.wikidata.org) a [Wikimedia Commons](https://commons.wikimedia.org), popisy z [české Wikipedie](https://cs.wikipedia.org), obrysy států [Natural Earth](https://www.naturalearthdata.com) (volné dílo), satelitní snímky NASA Blue Marble přes [GIBS](https://earthdata.nasa.gov/gibs), mapa © přispěvatelé [OpenStreetMap](https://www.openstreetmap.org/copyright), ikony [Lucide](https://lucide.dev) (ISC).
