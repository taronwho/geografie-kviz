// Známost položek pro Časové souvislosti (scripts/build-souvislosti.mjs): k = 1 z dat témat nestačí – mezi známými jsou položky
// s mnoha jazykovými verzemi Wikipedie, které český hráč nezná (rakouský spisovatel Klaus Ebner, Černý leden v Baku, rozhlasová
// stanice Grimeton). Navíc se proto bere návštěvnost článku na české Wikipedii za rok 2025 (co Češi opravdu čtou) a pořadí
// položky v kategorii (data témat jsou v kategorii seřazená podle jazykových verzí).
// Položka je slavná, když ji Češi čtou (aspoň MIN_VIEWS za rok), nebo když je mezi nejznámějšími položkami své kategorie ve světě
// (TOP_SHARE z prvních). Bez údaje o návštěvnosti (výpadek API, titulek s přesměrováním má návštěvnost 0) rozhodne jen pořadí,
// mírněji (UNKNOWN_SHARE). Klaus Ebner (95 návštěv, třetina pořadí), Černý leden (668, pětina) a Grimeton (604) slavné nejsou,
// Jan Otčenášek (32 000 návštěv, ač na konci pořadí) ano.
import { topicPageviews } from './fame-levels.mjs';

// Návštěvnost za rok podle druhu: osobnosti a události, díla, stavby a ostatní věci (objevená tělesa, mise)
export const MIN_VIEWS = { osoba: 1000, udalost: 1000, dilo: 800, stavba: 1000, jine: 500 };
// Nejznámější podíl kategorie ve světě (podle pořadí v datech), který je slavný i bez návštěvnosti; bez údaje o návštěvnosti
export const TOP_SHARE = 0.15;
export const UNKNOWN_SHARE = 0.5;

const groupOf = (entry) => (Number.isInteger(entry.b) ? 'osoba' : entry.kd === 'udalost' ? 'udalost' : entry.kd === 'stavba' ? 'stavba'
    : ['literarni', 'skladba', 'opera', 'obraz', 'socha', 'film', 'serial'].includes(entry.kd) ? 'dilo' : 'jine');

// rank = pořadí položky v kategorii (0 = nejznámější), size = počet položek kategorie, views = návštěvnost (undefined = neznámá)
export const isFamous = (entry, { rank, size, views }) => {
    if (!(views > 0)) return rank < size * UNKNOWN_SHARE;
    return views >= MIN_VIEWS[groupOf(entry)] || rank < size * TOP_SHARE;
};

// Návštěvnost článků (titulek české Wikipedie = item.t) s mezipamětí BUILD_CACHE/souvislosti-navstevnost.json
export const pageviewsOf = (titles, options) => topicPageviews('souvislosti-navstevnost', [...new Set(titles)].sort(), options);
