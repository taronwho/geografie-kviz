#!/usr/bin/env node
// Audit obrázků položek: npm run audit:obrazky [-- --topic=zemepis,architektura --all --flagged --json=soubor.json]
// Hlavní obrázek z Wikidat (im = soubor na Commons) někdy neukazuje to, na co se otázka ptá: u stavby sad nebo model, u města mapa,
// rytina nebo jiná stavba, u hory výhled z vrcholu, u přírodního místa zvíře, u osobnosti hrob nebo pamětní deska. Témata takový
// obrázek vyřadí pravidlem topic.offSubjectPhoto (slova názvu souboru po kategoriích a ručně ověřené položky, quiz-core.js
// offSubjectRule) a app.js loadTopic ho pak nepoužije nikde.
// Skript vypíše po tématech a kategoriích: kolik obrázků pravidlo vyřadí (s --flagged i které) a podezřelé názvy souborů, které pravidlo
// nechává (slova z širšího seznamu níž, bez slov z vlastního názvu položky) – ty je potřeba projít ručně a jasné případy doplnit
// do slov nebo seznamu položek tématu. --all vypíše i podezřelé obrázky neznámých položek (jinak jen počet), --json uloží vše.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const core = require('../quiz-core.js');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const m = /^--([^=]+)(?:=(.*))?$/.exec(arg); return m ? [m[1], m[2] ?? 'true'] : [arg, 'true']; }));
const TOPIC_IDS = ['zemepis', 'architektura', 'historie', 'biologie', 'chemie', 'fyzika', 'geologie', 'hudba', 'literatura', 'mytologie', 'sport', 'umeni', 'film'];
const topics = args.topic ? args.topic.split(',').filter(id => TOPIC_IDS.includes(id)) : TOPIC_IDS;

// Druh toho, co má obrázek ukázat, podle kategorie (jinak 'thing': pojem, látka, jednotka – tam se obrázek nehodnotí)
const KIND = {
    zemepis: { mesto: 'city', stavba: 'building', hora: 'nature', reka: 'nature', jezero: 'nature', ostrov: 'nature', priroda: 'nature', stat: 'country' },
    architektura: { stavby: 'building', hrady: 'building', mosty: 'building', mrakodrapy: 'building', architekti: 'person' },
    historie: { statnik: 'person', osobnost: 'person', panovnik: 'person', bitva: 'event', udalosti: 'event' },
    biologie: Object.fromEntries(['savci', 'rostliny', 'ptaci', 'ryby', 'hmyz', 'plazi', 'pravek', 'houby', 'bezobratli', 'plemena'].map(c => [c, 'organism'])),
    chemie: { chemici: 'person' },
    fyzika: { fyzici: 'person', astronomove: 'person' },
    geologie: { utvary: 'nature', nerosty: 'specimen', kameny: 'specimen', horniny: 'specimen', zkameneliny: 'specimen' },
    hudba: { skladatele: 'person', hudebnici: 'person', kapely: 'band', opery: 'work', dila: 'work' },
    literatura: { spisovatele: 'person', dila: 'work' },
    sport: { sportovci: 'person', sportoviste: 'venue' },
    umeni: { umelci: 'person', fotografove: 'person', ilustratori: 'person', obrazy: 'work', sochy: 'work' },
    film: { herci: 'person', reziseri: 'person' }
};
// Širší seznam podezřelých slov pro ruční kontrolu (ne každé znamená špatný obrázek: náměstí s kostelem město ukazuje)
const ART = ['engraving', 'lithograph', 'lithography', 'litografie', 'drawing', 'kresba', 'sketch', 'skica', 'painting', 'gemalde', 'malba', 'akvarel', 'aquarelle',
    'watercolor', 'watercolour', 'woodcut', 'drevoryt', 'etching', 'rytina', 'kupferstich', 'stich', 'vedute', 'veduta', 'illustration', 'ilustrace', 'poster', 'plakat',
    'postcard', 'pohlednice', 'ansichtskarte', 'stamp', 'znamka', 'briefmarke', 'coin', 'mince', 'banknote', 'bankovka', 'model', 'maquette', 'modell', 'miniature', 'miniatura',
    'render', 'rendering', 'vizualizace', 'reconstruction', 'rekonstrukce'];
const MAPS = ['map', 'mapa', 'karte', 'carte', 'plan', 'plán', 'grundriss', 'layout', 'diagram', 'relief', 'topographic', 'topo', 'basin', 'povodi', 'einzugsgebiet', 'watershed',
    'locator', 'location', 'lage', 'positionskarte'];
const SYMBOLS = ['logo', 'emblem', 'coat of arms', 'wappen', 'erb', 'znak', 'flag', 'vlajka', 'seal', 'plaque', 'deska', 'tablet', 'sign', 'cedule', 'tafel', 'ticket'];
const STATUES = ['statue', 'socha', 'sculpture', 'bust', 'busta', 'pomnik', 'denkmal', 'memorial', 'pamatnik'];
const INTERIOR = ['interior', 'interier', 'inside', 'innen', 'innenansicht', 'innenraum', 'interieur', 'interno', 'nave', 'altar', 'oltar', 'organ', 'varhany', 'ceiling',
    'strop', 'crypt', 'krypta', 'chancel', 'choir', 'presbytar', 'presbytery', 'apse', 'vault', 'klenba', 'staircase', 'schodiste', 'sal', 'lobby', 'foyer', 'auditorium',
    'fresco', 'freska', 'mosaic', 'mozaika', 'room', 'hall', 'kaple', 'chapel', 'courtyard', 'nadvori', 'cloister', 'ambit', 'detail', 'portal', 'door', 'dvere', 'window'];
const EVENTS = ['crowd', 'dav', 'festival', 'parade', 'pruvod', 'procession', 'protest', 'demonstration', 'demonstrace', 'ceremony', 'ceremonie', 'celebration', 'oslava',
    'concert', 'koncert', 'fireworks', 'ohnostroj', 'visit', 'navsteva', 'pilgrims', 'pilgrimage', 'pout', 'wedding', 'svatba', 'funeral', 'pohreb', 'carnival', 'karneval',
    'marathon', 'race', 'match', 'game', 'tournament'];
const LAND = ['orchard', 'sad', 'meadow', 'louka', 'pasture', 'field', 'pole', 'garden', 'zahrada', 'gardens', 'forest', 'les', 'landscape', 'krajina', 'vineyard', 'vinice',
    'view from', 'vyhled', 'blick vom', 'summit', 'vrcholu', 'panorama', 'from the top', 'from top', 'sunset'];
const ANIMALS = ['horse', 'horses', 'pony', 'cow', 'cows', 'cattle', 'sheep', 'goat', 'goats', 'dog', 'dogs', 'cat', 'kun', 'kone', 'krava', 'ovce', 'koza', 'elephant', 'elephants',
    'lion', 'lions', 'lioness', 'giraffe', 'giraffes', 'zebra', 'zebras', 'bear', 'bears', 'deer', 'bison', 'buffalo', 'wolf', 'monkey', 'monkeys', 'bird', 'birds', 'eagle',
    'flamingo', 'flamingos', 'flamingoes', 'penguin', 'penguins', 'camel', 'camels', 'yak', 'moose', 'elk', 'rhino', 'rhinoceros', 'hippo', 'hippopotamus', 'crocodile',
    'tiger', 'leopard', 'cheetah', 'kangaroo', 'koala', 'gorilla', 'gorillas', 'chimpanzee', 'orangutan', 'lemur', 'lemurs', 'turtle', 'tortoise', 'iguana', 'flower', 'flowers',
    'kvet', 'kvetina', 'orchid', 'bledule', 'butterfly', 'motyl', 'frog', 'snake', 'lizard', 'ptak', 'slon', 'lev', 'zirafa', 'medved', 'jelen', 'seal', 'seals', 'walrus',
    'whale', 'dolphin', 'fish', 'insect', 'beetle', 'moth', 'spider', 'wildebeest', 'gnu', 'antelope', 'gazelle', 'impala', 'ostrich', 'pelican', 'heron', 'stork', 'crane',
    'vulture', 'baboon', 'meerkat', 'hyena', 'okapi', 'marmot', 'ibex', 'chamois', 'kamzik', 'svist', 'kozorozec', 'rostlina', 'plant', 'plants', 'tree', 'strom', 'mushroom'];
const PERSON = ['grave', 'graves', 'hrob', 'tomb', 'tombstone', 'grab', 'grabstein', 'grabmal', 'grabstatte', 'nahrobek', 'gravestone', 'headstone', 'sepulchre', 'sepulcher',
    'mausoleum', 'mauzoleum', 'hrobka', 'cemetery', 'hrbitov', 'friedhof', 'cimetiere', 'cenotaph', 'kenotaf', 'plaque', 'deska', 'pametni', 'gedenktafel', 'tafel', 'tablet',
    'inscription', 'house', 'dum', 'domu', 'birthplace', 'rodny', 'geburtshaus', 'villa', 'vila', 'home', 'residence', 'castle', 'zamek', 'hrad', 'palace', 'palac', 'museum',
    'muzeum', 'memorial', 'pamatnik', 'church', 'kostel', 'autograph', 'handwriting', 'letter', 'dopis', 'manuscript', 'rukopis', 'statue', 'socha', 'pomnik', 'denkmal',
    'monument', 'bust', 'busta', 'sculpture', 'coat of arms', 'wappen', 'erb', 'pecet', 'siegel', 'coin', 'mince', 'munze', 'medal', 'medaile', 'stamp', 'znamka', 'banknote',
    'bankovka', 'logo', 'poster', 'plakat', 'cover', 'album', 'book', 'kniha', 'title', 'titulni', 'titlepage', 'car', 'auto', 'ship', 'plane', 'aircraft', 'letadlo',
    'rocket', 'telescope', 'team', 'band', 'group', 'orchestra', 'cast', 'ensemble', 'crowd', 'map', 'street', 'ulice', 'square', 'namesti', 'school', 'skola', 'tree',
    'garden', 'stadium', 'stadion', 'trophy', 'award', 'film', 'still', 'scene', 'screenshot', 'sculpture', 'relief', 'painting by', 'works', 'exhibition', 'vystava'];
const WORK = ['museum', 'muzeum', 'gallery', 'galerie', 'room', 'sal', 'exhibition', 'vystava', 'installation', 'visitors', 'crowd', 'copy', 'kopie', 'replica', 'reproduction',
    'study', 'studie', 'sketch', 'skica', 'xray', 'infrared', 'portrait', 'portret', 'statue', 'socha', 'monument', 'pomnik', 'house', 'dum', 'grave', 'hrob', 'film', 'still',
    'theatre', 'theater', 'divadlo', 'opera house', 'building', 'author', 'autor', 'composer', 'skladatel', 'premiere', 'map', 'stamp', 'znamka', 'coin', 'logo'];
const ORGANISM = ['map', 'range', 'distribution', 'rozsireni', 'stamp', 'znamka', 'coin', 'mince', 'logo', 'statue', 'socha', 'sculpture', 'skull', 'lebka', 'skeleton',
    'kostra', 'egg', 'eggs', 'vejce', 'nest', 'hnizdo', 'feather', 'track', 'tracks', 'footprint', 'dish', 'food', 'meal', 'market', 'trh', 'museum', 'specimen', 'herbarium',
    'fossil', 'drawing', 'illustration', 'plate', 'tafel', 'painting', 'restaurant', 'sushi', 'cooked', 'fried', 'soup', 'polevka', 'jidlo', 'dead', 'carcass', 'hunting',
    'hunter', 'lov', 'zoo', 'cage', 'klec', 'sign', 'cedule'];
const REVIEW = {
    city: [...ART, ...MAPS, ...SYMBOLS, ...STATUES, ...EVENTS, ...LAND, ...ANIMALS, 'interior', 'interier', 'inside'],
    building: [...ART, ...MAPS, ...SYMBOLS, ...STATUES, ...INTERIOR, ...EVENTS, ...LAND, ...ANIMALS],
    nature: [...ART, ...MAPS, ...SYMBOLS, ...STATUES, ...EVENTS, ...LAND, ...ANIMALS, 'house', 'church', 'kostel', 'chata', 'hotel', 'castle', 'hrad', 'zamek', 'village',
        'vesnice', 'town', 'city', 'mesto', 'bridge', 'most', 'dam', 'hraz', 'station', 'stanice', 'tower', 'rozhledna', 'boat', 'ship', 'lod', 'people', 'beach', 'street'],
    venue: [...ART, ...MAPS, ...SYMBOLS, ...STATUES, ...LAND, ...ANIMALS, 'crowd', 'fans', 'ceremony', 'concert', 'koncert'],
    country: [...ART, ...MAPS, ...SYMBOLS, ...STATUES, ...EVENTS, ...ANIMALS],
    person: PERSON,
    band: [...PERSON, 'logo', 'concert', 'koncert', 'stage', 'live', 'cd', 'vinyl'],
    work: WORK,
    organism: ORGANISM,
    event: ['grave', 'hrob', 'plaque', 'deska', 'pametni', 'memorial', 'monument', 'pomnik', 'pamatnik', 'mohyla', 'museum', 'muzeum', 'map', 'mapa', 'stamp', 'znamka',
        'coin', 'medal', 'medaile', 'logo', 'site', 'today', 'dnes', 'field', 'pole', 'cemetery', 'hrbitov', 'church', 'kostel', 'reenactment', 'rekonstrukce', 'portrait'],
    specimen: ['map', 'mine', 'dul', 'quarry', 'lom', 'building', 'church', 'statue', 'jewelry', 'sperk', 'ring', 'prsten', 'stamp', 'coin', 'logo', 'museum'],
    thing: []
};

const fold = (list) => list.map(core.photoWords).filter(phrase => phrase.length);
const REVIEW_PHRASES = Object.fromEntries(Object.entries(REVIEW).map(([kind, list]) => [kind, fold(list)]));
const has = (words, phrase) => words.some((word, i) => phrase.every((part, j) => words[i + j] === part));
const report = { topics: {} };
let totalFlagged = 0;
let totalImages = 0;
for (const id of topics) {
    const topic = require(`../topics/${id}.js`);
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${id}.json`), 'utf8'));
    const byCategory = {};
    for (const item of data.items) {
        if (!item.im) continue;
        const entry = byCategory[item.c] || (byCategory[item.c] = { images: 0, flagged: [], suspect: [] });
        entry.images++;
        const line = `${item.q}\t${item.k === 1 ? 'k1' : item.x === 1 ? 'x' : '·'}\t${item.n}\t${item.im}`;
        if (topic.offSubjectPhoto && topic.offSubjectPhoto(item)) { entry.flagged.push(line); continue; }
        const kind = (KIND[id] || {})[item.c] || 'thing';
        const file = core.photoWords(item.im);
        const own = new Set(core.photoWords(`${item.n} ${item.t || ''}`));
        const hits = REVIEW_PHRASES[kind].filter(phrase => !phrase.some(word => own.has(word)) && has(file, phrase)).map(phrase => phrase.join(' '));
        if (hits.length) entry.suspect.push(`${line}\t[${[...new Set(hits)].join(', ')}]`);
    }
    report.topics[id] = byCategory;
    const images = Object.values(byCategory).reduce((sum, entry) => sum + entry.images, 0);
    const flagged = Object.values(byCategory).reduce((sum, entry) => sum + entry.flagged.length, 0);
    totalImages += images;
    totalFlagged += flagged;
    console.log(`\n=== ${id}: vyřazeno ${flagged} z ${images} obrázků`);
    for (const [category, entry] of Object.entries(byCategory)) {
        console.log(`--- ${id}/${category}: vyřazeno ${entry.flagged.length} z ${entry.images}, podezřelých ${entry.suspect.length}`);
        if (args.flagged) entry.flagged.forEach(line => console.log(`  - ${line}`));
        const suspects = args.all ? entry.suspect : entry.suspect.filter(line => line.split('\t')[1] === 'k1');
        suspects.forEach(line => console.log(`  ? ${line}`));
    }
}
console.log(`\nCelkem vyřazeno ${totalFlagged} z ${totalImages} obrázků`);
if (args.json) fs.writeFileSync(path.resolve(ROOT, args.json), JSON.stringify(report, null, 1));
