// Téma Geologie: data/geologie.json z Wikidat (přes QLever) – nerosty, drahé kameny, horniny a geologická období
// Spuštění: npm run build:geologie (s BUILD_CACHE=složka jde pravidla ladit bez opakovaného stahování)
//
// Wikidata mají u nerostů spolehlivý článek, fotku, vzorec, třídu podle Strunze, krystalovou soustavu a hustotu.
// Tvrdost, vryp a zařazení hornin v nich bývají chybné (antimonit s tvrdostí 8, křemen s černým vrypem, mramor mezi
// usazenými horninami), proto jsou tvrdost, vryp, barvy, skupiny hornin, česká naleziště a geologická období vypsané
// níže z mineralogických a geologických příruček.
import { createRequire } from 'node:module';
import { qlever, id, values, imageFields, compact, cached, inBatches, writeTopic } from './lib/wikidata.mjs';

// Vzorec se ověří stejně, jako ho pak porovná aplikace
const { formulaCounts, isRealPhoto } = createRequire(import.meta.url)('../quiz-core.js');

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const isQid = (q) => /^Q\d+$/.test(q);
const displayTitle = (title) => title.replace(/\s*\([^)]*\)\s*$/, '').trim();
const fileOf = (url) => url ? decodeURIComponent(url.split('/Special:FilePath/').pop()) : '';

// --- Drahé kameny: barva (podle barevné skupiny se vybírají podobné nesprávné možnosti) a nerost, jehož jsou odrůdou ---
const GEMS = {
    'Diamant': { color: 'bezbarvý, vzácně žlutý nebo modrý', group: 'bezbarvý', formula: 'C', h: [10, 10], loc: 'Jihoafrická republika, Botswana, Rusko (Jakutsko)' },
    'Rubín': { color: 'červený', group: 'červený', parent: 'korund', formula: 'Al₂O₃', h: [9, 9], loc: 'Myanmar (Barma)' },
    'Safír': { color: 'modrý', group: 'modrý', parent: 'korund', formula: 'Al₂O₃', h: [9, 9], loc: 'Srí Lanka, Madagaskar' },
    'Smaragd': { color: 'sytě zelený', group: 'zelený', parent: 'beryl', formula: 'Be₃Al₂Si₆O₁₈', h: [7.5, 8], loc: 'Kolumbie' },
    'Akvamarín': { color: 'světle modrý až modrozelený', group: 'modrý', parent: 'beryl', formula: 'Be₃Al₂Si₆O₁₈', h: [7.5, 8], loc: 'Brazílie' },
    'Morganit': { color: 'růžový', group: 'růžový', parent: 'beryl', formula: 'Be₃Al₂Si₆O₁₈', h: [7.5, 8], loc: 'Madagaskar, Brazílie' },
    'Topaz': { color: 'bezbarvý, žlutý, oranžový nebo modrý', group: 'žlutý', formula: 'Al₂SiO₄F₂', h: [8, 8], loc: 'Brazílie' },
    'Ametyst': { color: 'fialový', group: 'fialový', parent: 'křemen', formula: 'SiO₂', h: [7, 7], loc: 'Brazílie, Uruguay' },
    'Citrín': { color: 'žlutý až oranžový', group: 'žlutý', parent: 'křemen', formula: 'SiO₂', h: [7, 7], loc: 'Brazílie' },
    'Záhněda': { color: 'hnědý (kouřový)', group: 'hnědý', parent: 'křemen', formula: 'SiO₂', h: [7, 7] },
    'Růženín': { color: 'růžový', group: 'růžový', parent: 'křemen', formula: 'SiO₂', h: [7, 7], loc: 'Brazílie, Madagaskar' },
    'Křišťál': { color: 'bezbarvý, čirý', group: 'bezbarvý', parent: 'křemen', formula: 'SiO₂', h: [7, 7] },
    'Tygří oko': { color: 'zlatohnědý s hedvábným leskem', group: 'hnědý', parent: 'křemen', formula: 'SiO₂', h: [7, 7], loc: 'Jihoafrická republika' },
    'Aventurin': { color: 'zelený, třpytivý', group: 'zelený', parent: 'křemen', formula: 'SiO₂', h: [7, 7], loc: 'Indie' },
    'Achát': { color: 'pruhovaný, různé barvy', group: 'pruhovaný', parent: 'chalcedon', formula: 'SiO₂', h: [6.5, 7], czl: 'Podkrkonoší (Nová Paka, Kozákov)' },
    'Onyx': { color: 'černobíle pruhovaný', group: 'pruhovaný', parent: 'chalcedon', formula: 'SiO₂', h: [6.5, 7] },
    'Jaspis': { color: 'červenohnědý, neprůhledný', group: 'červený', parent: 'chalcedon', formula: 'SiO₂', h: [6.5, 7], czl: 'Ciboušov v Krušných horách (kaple na Karlštejně)' },
    'Karneol': { color: 'oranžově červený, průsvitný', group: 'červený', parent: 'chalcedon', formula: 'SiO₂', h: [6.5, 7] },
    'Chryzopras': { color: 'jablečně zelený', group: 'zelený', parent: 'chalcedon', formula: 'SiO₂', h: [6.5, 7], loc: 'Austrálie' },
    'Opál': { color: 'mléčně bílý s duhovými záblesky', group: 'bílý', formula: 'SiO₂·nH₂O', h: [5.5, 6.5], loc: 'Austrálie' },
    'Tyrkys': { color: 'modrozelený', group: 'modrý', h: [5, 6], loc: 'Írán, USA' },
    'Lapis lazuli': { color: 'sytě modrý se zlatavými zrnky', group: 'modrý', h: [5, 5.5], loc: 'Afghánistán' },
    'Alexandrit': { color: 'za denního světla zelený, při žárovce červený', group: 'zelený', parent: 'chryzoberyl', formula: 'BeAl₂O₄', h: [8.5, 8.5], loc: 'Ural (Rusko)' },
    'Spinel': { color: 'červený, růžový nebo modrý', group: 'červený', formula: 'MgAl₂O₄', h: [7.5, 8] },
    'Turmalín': { color: 'různé barvy, často více v jednom krystalu', group: 'pruhovaný', h: [7, 7.5], loc: 'Brazílie' },
    'Pyrop': { color: 'tmavě krvavě červený', group: 'červený', parent: 'granát', formula: 'Mg₃Al₂(SiO₄)₃', h: [7, 7.5], czl: 'České středohoří (Třebenice, Podsedice)' },
    'Almandin': { color: 'tmavě červený až fialový', group: 'červený', parent: 'granát', formula: 'Fe₃Al₂(SiO₄)₃', h: [7, 7.5] },
    'Démantoid': { color: 'zelený, silně třpytivý', group: 'zelený', parent: 'granát', formula: 'Ca₃Fe₂(SiO₄)₃', h: [6.5, 7], loc: 'Ural (Rusko)' },
    'Jadeit': { color: 'zelený', group: 'zelený', formula: 'NaAlSi₂O₆', h: [6.5, 7], loc: 'Myanmar (Barma)' },
    'Nefrit': { color: 'zelený', group: 'zelený', h: [6, 6.5], loc: 'Čína, Nový Zéland' },
    'Labradorit': { color: 'šedý s modrými a zelenými odlesky', group: 'šedý', h: [6, 6.5] },
    'Vltavín': { color: 'lahvově zelený', group: 'zelený', h: [5.5, 6.5], czl: 'jižní Čechy (Českobudějovicko, Třeboňsko)', org: 'přírodní sklo z dopadu meteoritu' },
    'Jantar': { color: 'medově žlutý až hnědý', group: 'žlutý', h: [2, 2.5], loc: 'pobřeží Baltského moře', org: 'zkamenělá pryskyřice třetihorních jehličnanů' },
    'Perla': { color: 'bílý s perleťovým leskem', group: 'bílý', h: [2.5, 4.5], org: 'vzniká v lastuře mlžů' },
    'Gagát': { color: 'černý', group: 'černý', h: [2.5, 4], loc: 'Whitby (Anglie)', org: 'zkamenělé dřevo' }
};
// Kameny, které by od sebe na fotce nerozeznal ani odborník – mezi možnostmi se nesejdou (ani s mateřským nerostem)
const GEM_CONFLICTS = [['Pyrop', 'Almandin'], ['Jadeit', 'Nefrit'], ['Achát', 'Onyx'], ['Rubín', 'Spinel'], ['Citrín', 'Topaz'],
    ['Akvamarín', 'Topaz'], ['Jaspis', 'Karneol'], ['Křišťál', 'Diamant']];

// --- Horniny: skupina podle vzniku (hlubinné a výlevné vyvřeliny, žilné, usazené, přeměněné), složení a stavba či vznik ---
// Žilné horniny a horniny se sporným zařazením (migmatit na pomezí přeměněných a vyvřelých) otázku na skupinu nemají
const ROCKS = {
    'Žula': ['hlubinna', 'křemen, živce, slídy', 'zrnitá, zrna jsou dobře vidět okem'],
    'Gabro': ['hlubinna', 'plagioklas, pyroxen', 'tmavá, hrubě zrnitá'],
    'Diorit': ['hlubinna', 'plagioklas, amfibol', 'šedá, černobíle skvrnitá, zrnitá'],
    'Granodiorit': ['hlubinna', 'křemen, plagioklas, draselný živec, biotit', 'zrnitá, zrna jsou dobře vidět okem'],
    'Syenit': ['hlubinna', 'draselný živec, amfibol', 'zrnitá, často narůžovělá'],
    'Peridotit': ['hlubinna', 'olivín, pyroxen', 'zelenavě černá, zrnitá'],
    'Tonalit': ['hlubinna', 'plagioklas, křemen, amfibol', 'světlá, zrnitá'],
    'Anortozit': ['hlubinna', 'plagioklas', 'světlá, hrubě zrnitá'],
    'Čedič': ['vylevna', 'plagioklas, pyroxen, olivín', 'černá, jemnozrnná, často sloupcovitě rozpukaná'],
    'Andezit': ['vylevna', 'plagioklas, amfibol, pyroxen', 'šedá, jemnozrnná s vyrostlicemi'],
    'Ryolit': ['vylevna', 'křemen, draselný živec', 'světlá, jemnozrnná, často proudovitě páskovaná'],
    'Trachyt': ['vylevna', 'draselný živec', 'světlá, jemnozrnná, drsná na omak'],
    'Dacit': ['vylevna', 'plagioklas, křemen', 'jemnozrnná s vyrostlicemi'],
    'Obsidián': ['vylevna', 'sopečné sklo', 'černá, sklovitá, s lasturnatým lomem'],
    'Pemza': ['vylevna', 'pórovité sopečné sklo', 'lehká a pórovitá, plave na vodě'],
    'Znělec': ['vylevna', 'živce, nefelín', 'šedozelená, deskovitě rozpukaná, při úderu zvoní'],
    'Bazanit': ['vylevna', 'plagioklas, pyroxen, olivín, nefelín', 'černá, jemnozrnná'],
    'Perlit': ['vylevna', 'sopečné sklo s vodou', 'sklovitá, rozpadá se na perličky'],
    'Pegmatit': ['zilna', 'velké krystaly křemene, živců a slíd', 'velmi hrubě zrnitá, krystaly i decimetrové'],
    'Aplit': ['zilna', 'jemnozrnný křemen a živce', 'světlá, jemnozrnná'],
    'Pískovec': ['usazena', 'zrna křemene stmelená tmelem', 'zpevněný písek'],
    'Vápenec': ['usazena', 'kalcit', 'ze schránek a koster mořských živočichů, často se zkamenělinami'],
    'Slepenec': ['usazena', 'zaoblené valouny stmelené tmelem', 'zpevněný štěrk'],
    'Brekcie': ['usazena', 'ostrohranné úlomky stmelené tmelem', 'zpevněná suť'],
    'Jílovec': ['usazena', 'jílové minerály', 'zpevněný jíl'],
    'Prachovec': ['usazena', 'prachová zrna křemene a jílu', 'zpevněný prach'],
    'Droba': ['usazena', 'úlomky hornin, křemen, živce, jíl', 'zpevněné úlomky hornin různé velikosti'],
    'Arkóza': ['usazena', 'křemen a živce', 'zpevněný písek z rozpadlé žuly'],
    'Slín': ['usazena', 'jíl a kalcit', 'zpevněný mořský kal'],
    'Opuka': ['usazena', 'jíl, kalcit a jehlice hub', 'zpevněný mořský kal z doby křídy'],
    'Travertin': ['usazena', 'kalcit vysrážený z pramenů', 'vysrážená u teplých pramenů'],
    'Pěnovec': ['usazena', 'pórovitý kalcit vysrážený z pramenů', 'vysrážená u studených pramenů na mechu a rostlinách'],
    'Pazourek': ['usazena', 'chalcedon (oxid křemičitý)', 'hlízy v křídových vápencích'],
    'Černé uhlí': ['usazena', 'zuhelnatělé rostliny', 'zuhelnatělé pralesy z prvohor'],
    'Hnědé uhlí': ['usazena', 'zuhelnatělé rostliny', 'zuhelnatělé bažinné lesy z třetihor'],
    'Antracit': ['usazena', 'zuhelnatělé rostliny, skoro čistý uhlík', 'nejstarší a nejvíc zuhelnatělé uhlí'],
    'Bauxit': ['usazena', 'hydroxidy hliníku', 'vzniká zvětráváním v tropech'],
    'Křemelina': ['usazena', 'schránky rozsivek z oxidu křemičitého', 'ze schránek drobných řas na dně jezer a moří'],
    'Buližník': ['usazena', 'oxid křemičitý s grafitem', 'zpevněný mořský kal bohatý na oxid křemičitý'],
    'Radiolarit': ['usazena', 'schránky mřížovců z oxidu křemičitého', 'ze schránek mřížovců na mořském dně'],
    'Mramor': ['premenena', 'kalcit nebo dolomit', 'vzniká z vápence nebo dolomitu'],
    'Rula': ['premenena', 'živce, křemen, slídy', 'páskovaná; vzniká ze žuly nebo z jílovců'],
    'Svor': ['premenena', 'slídy, křemen', 'třpytivá a břidličnatá; vzniká z jílovců'],
    'Fylit': ['premenena', 'jemné slídy, křemen', 'tence břidličnatá s hedvábným leskem; vzniká z jílovců'],
    'Amfibolit': ['premenena', 'amfibol, plagioklas', 'tmavá, usměrněná; vzniká z čediče nebo gabra'],
    'Metakvarcit': ['premenena', 'křemen', 'velmi tvrdá; vzniká z pískovce'],
    'Serpentinit': ['premenena', 'serpentin', 'zelená, skvrnitá jako hadí kůže; vzniká z peridotitu'],
    'Eklogit': ['premenena', 'granát, pyroxen', 'zelená s červenými granáty; vzniká z čediče ve velké hloubce'],
    'Granulit': ['premenena', 'živce, křemen, granát', 'světlá, jemně zrnitá; vzniká za velmi vysoké teploty a tlaku'],
    'Migmatit': ['sporna', 'rula prostoupená žulou', 'páskovaná, napůl roztavená'],
    'Mylonit': ['sporna', 'rozdrcené a přetvořené horniny', 'jemně páskovaná, vzniká drcením na zlomech'],
    'Erlan': ['premenena', 'pyroxen, granát, živce', 'zelenavá, vzniká z vápnitých hornin'],
    'Skarn': ['sporna', 'granát, pyroxen, kalcit', 'vzniká na styku vápence a žuly'],
    'Greisen': ['sporna', 'křemen, slídy, topaz', 'vzniká působením horkých roztoků na žulu'],
    'Kontaktní rohovec': ['premenena', 'jemnozrnný křemen, slídy, živce', 'tvrdá a celistvá; vzniká z jílovců vedle tělesa žuly']
};
const GROUP_LABELS = { hlubinna: 'hlubinná vyvřelina', vylevna: 'výlevná vyvřelina', zilna: 'žilná vyvřelina', usazena: 'usazená hornina', premenena: 'přeměněná hornina' };
// Kámen ze staveb a soch, k čemu se hornina používá
const ROCK_USES = {
    'Žula': 'dlažba, obrubníky, pomníky', 'Mramor': 'sochy a obklady', 'Pískovec': 'stavby a sochy (Karlův most)', 'Vápenec': 'výroba vápna a cementu',
    'Opuka': 'zdivo románských a gotických staveb v Praze', 'Čedič': 'štěrk a mozaiková dlažba', 'Černé uhlí': 'palivo a výroba koksu',
    'Hnědé uhlí': 'palivo v tepelných elektrárnách', 'Pemza': 'brusivo a lehčené stavební hmoty', 'Obsidián': 'čepele pravěkých nástrojů',
    'Pazourek': 'pravěké nástroje a křesadla', 'Křemelina': 'filtry a výroba dynamitu', 'Bauxit': 'výroba hliníku', 'Travertin': 'obklady a stavební kámen',
    'Perlit': 'tepelné izolace a zahradnické substráty', 'Syenit': 'stavební a dekorační kámen', 'Gabro': 'dekorační kámen („černá žula“)',
    'Diorit': 'stavební a dekorační kámen', 'Andezit': 'štěrk a stavební kámen', 'Fylit': 'střešní krytina', 'Antracit': 'kvalitní palivo'
};
const BUILDING_STONES = new Set(['Žula', 'Mramor', 'Pískovec', 'Vápenec', 'Travertin', 'Opuka', 'Čedič', 'Syenit', 'Gabro', 'Diorit', 'Andezit', 'Fylit', 'Pěnovec']);

// --- Tvrdost podle Mohse [od, do]; otázka na tvrdost jen u jednoho čísla ---
const HARDNESS = {
    'Mastek': [1, 1], 'Sádrovec': [2, 2], 'Kalcit': [3, 3], 'Fluorit': [4, 4], 'Apatit': [5, 5], 'Ortoklas': [6, 6], 'Křemen': [7, 7], 'Korund': [9, 9],
    'Zirkon': [7.5, 7.5], 'Chryzoberyl': [8.5, 8.5], 'Chalcedon': [6.5, 7], 'Granát': [6.5, 7.5], 'Beryl': [7.5, 8],
    'Grafit': [1, 2], 'Halit': [2, 2.5], 'Síra': [1.5, 2.5], 'Galenit': [2.5, 2.75], 'Cinabarit': [2, 2.5], 'Zlato': [2.5, 3], 'Stříbro': [2.5, 3],
    'Měď': [2.5, 3], 'Muskovit': [2, 2.5], 'Biotit': [2.5, 3], 'Kaolinit': [2, 2.5], 'Baryt': [3, 3.5], 'Anhydrit': [3, 3.5], 'Sfalerit': [3.5, 4],
    'Chalkopyrit': [3.5, 4], 'Dolomit': [3.5, 4], 'Aragonit': [3.5, 4], 'Malachit': [3.5, 4], 'Azurit': [3.5, 4], 'Siderit': [3.5, 4.5],
    'Magnezit': [3.5, 4.5], 'Rodochrozit': [3.5, 4], 'Uraninit': [5, 6], 'Hematit': [5, 6], 'Magnetit': [5.5, 6.5], 'Pyrit': [6, 6.5],
    'Markazit': [6, 6.5], 'Kasiterit': [6, 7], 'Olivín': [6.5, 7], 'Antimonit': [2, 2.5], 'Wolframit': [4, 4.5], 'Kryolit': [2.5, 3], 'Sylvín': [2, 2.5],
    'Limonit': [4, 5.5], 'Goethit': [5, 5.5], 'Chromit': [5.5, 5.5], 'Ilmenit': [5, 6], 'Rutil': [6, 6.5], 'Andalusit': [6.5, 7.5], 'Staurolit': [7, 7.5],
    'Albit': [6, 6.5], 'Mikroklin': [6, 6.5], 'Sanidin': [6, 6.5], 'Anortit': [6, 6.5], 'Augit': [5.5, 6], 'Diopsid': [5.5, 6.5], 'Celestin': [3, 3.5],
    'Kuprit': [3.5, 4], 'Realgar': [1.5, 2], 'Auripigment': [1.5, 2], 'Bornit': [3, 3.25], 'Chalkocit': [2.5, 3], 'Molybdenit': [1, 1.5],
    'Arsenopyrit': [5.5, 6], 'Pyroluzit': [6, 6.5], 'Scheelit': [4.5, 5], 'Cerusit': [3, 3.5], 'Smithsonit': [4, 4.5], 'Kyanit': [4.5, 7],
    'Sillimanit': [6.5, 7.5], 'Spodumen': [6.5, 7], 'Lepidolit': [2.5, 3.5], 'Titanit': [5, 5.5], 'Epidot': [6, 7], 'Rodonit': [5.5, 6.5],
    'Wulfenit': [3, 3], 'Krokoit': [2.5, 3], 'Vivianit': [1.5, 2], 'Chalkantit': [2.5, 2.5], 'Covellin': [1.5, 2], 'Akantit': [2, 2.5],
    'Pyromorfit': [3.5, 4], 'Cordierit': [7, 7.5], 'Sodalit': [5.5, 6], 'Nefelín': [5.5, 6], 'Tremolit': [5, 6], 'Aktinolit': [5, 6],
    'Enstatit': [5, 6], 'Anatas': [5.5, 6], 'Brookit': [5.5, 6], 'Kobaltin': [5.5, 5.5], 'Pyrhotin': [3.5, 4.5], 'Montmorillonit': [1, 2],
    'Chryzokol': [2, 4], 'Stroncianit': [3.5, 3.5], 'Fenakit': [7.5, 8], 'Willemit': [5.5, 5.5], 'Kutnohorit': [3.5, 4]
};

// --- Barva (nápověda) a barevná skupina (podobné nesprávné možnosti) ---
const MINERAL_COLORS = {
    'Křemen': ['bezbarvý až bílý', 'bezbarvý'], 'Kalcit': ['bezbarvý až bílý', 'bezbarvý'], 'Sádrovec': ['bílý až bezbarvý', 'bezbarvý'],
    'Halit': ['bezbarvý až bílý', 'bezbarvý'], 'Sylvín': ['bezbarvý až načervenalý', 'bezbarvý'], 'Kryolit': ['bílý až bezbarvý', 'bezbarvý'],
    'Mastek': ['bílý až nazelenalý', 'bílý'], 'Kaolinit': ['bílý', 'bílý'], 'Baryt': ['bílý až nažloutlý', 'bílý'], 'Dolomit': ['bílý až narůžovělý', 'bílý'],
    'Aragonit': ['bílý', 'bílý'], 'Magnezit': ['bílý', 'bílý'], 'Anhydrit': ['bílý až namodralý', 'bílý'], 'Cerusit': ['bílý', 'bílý'],
    'Ortoklas': ['růžový až bílý', 'růžový'], 'Mikroklin': ['bílý, růžový nebo zelený', 'růžový'], 'Albit': ['bílý', 'bílý'], 'Sanidin': ['bezbarvý až šedý', 'bezbarvý'],
    'Anortit': ['bílý až šedý', 'bílý'], 'Rodochrozit': ['růžový', 'růžový'], 'Rodonit': ['růžový s černými žilkami', 'růžový'], 'Lepidolit': ['fialově růžový', 'růžový'],
    'Pyrit': ['mosazně žlutý, kovový', 'kovově žlutý'], 'Chalkopyrit': ['mosazně žlutý, kovový', 'kovově žlutý'], 'Markazit': ['bledě mosazný, kovový', 'kovově žlutý'],
    'Zlato': ['zlatožlutý, kovový', 'kovově žlutý'], 'Pyrhotin': ['bronzově hnědý, kovový', 'kovově žlutý'],
    'Galenit': ['olověně šedý, kovový', 'kovově šedý'], 'Antimonit': ['olověně šedý, kovový', 'kovově šedý'], 'Stříbro': ['stříbrně bílý, kovový', 'kovově šedý'],
    'Molybdenit': ['olověně šedý, kovový', 'kovově šedý'], 'Arsenopyrit': ['stříbrně bílý až šedý, kovový', 'kovově šedý'], 'Chalkocit': ['tmavě šedý, kovový', 'kovově šedý'],
    'Kobaltin': ['stříbrně bílý s růžovým nádechem', 'kovově šedý'], 'Rtuť': ['stříbrná kapalina', 'kovově šedý'], 'Akantit': ['černošedý, kovový', 'kovově šedý'],
    'Bornit': ['měděně hnědý s duhovým náběhem', 'červený'], 'Měď': ['měděně červený, kovový', 'červený'], 'Cinabarit': ['červený', 'červený'], 'Kuprit': ['tmavě červený', 'červený'],
    'Realgar': ['oranžově červený', 'červený'], 'Krokoit': ['oranžově červený', 'červený'], 'Wulfenit': ['oranžově žlutý', 'žlutý'],
    'Síra': ['žlutý', 'žlutý'], 'Auripigment': ['citronově žlutý', 'žlutý'], 'Pyromorfit': ['zelený až hnědý', 'zelený'],
    'Malachit': ['zelený, pruhovaný', 'zelený'], 'Olivín': ['olivově zelený', 'zelený'], 'Apatit': ['zelený až žlutý', 'zelený'], 'Beryl': ['zelenavý až žlutavý', 'zelený'],
    'Epidot': ['pistáciově zelený', 'zelený'], 'Aktinolit': ['zelený', 'zelený'], 'Diopsid': ['zelený', 'zelený'], 'Chryzoberyl': ['žlutozelený', 'zelený'],
    'Vivianit': ['modrozelený', 'zelený'], 'Chryzokol': ['modrozelený', 'modrý'], 'Smithsonit': ['bílý, modrozelený nebo růžový', 'modrý'],
    'Fluorit': ['fialový, zelený nebo žlutý', 'fialový'], 'Azurit': ['sytě modrý', 'modrý'], 'Celestin': ['světle modrý', 'modrý'], 'Kyanit': ['modrý', 'modrý'],
    'Sodalit': ['modrý', 'modrý'], 'Chalkantit': ['sytě modrý', 'modrý'], 'Cordierit': ['modrý až fialový', 'modrý'],
    'Magnetit': ['černý, kovový', 'černý'], 'Hematit': ['černý až ocelově šedý, někdy červený', 'černý'], 'Uraninit': ['černý, smolně lesklý', 'černý'],
    'Biotit': ['černý', 'černý'], 'Wolframit': ['černý', 'černý'], 'Chromit': ['černý', 'černý'], 'Ilmenit': ['černý', 'černý'], 'Grafit': ['černý, kovově lesklý', 'černý'],
    'Pyroluzit': ['černý', 'černý'], 'Augit': ['černý', 'černý'], 'Kasiterit': ['hnědý až černý', 'hnědý'], 'Sfalerit': ['hnědý až černý', 'hnědý'],
    'Siderit': ['hnědý', 'hnědý'], 'Limonit': ['hnědý až žlutohnědý', 'hnědý'], 'Goethit': ['hnědý až černý', 'hnědý'], 'Rutil': ['červenohnědý', 'hnědý'],
    'Staurolit': ['hnědý', 'hnědý'], 'Titanit': ['hnědý až žlutozelený', 'hnědý'], 'Andalusit': ['růžový až hnědý', 'hnědý'], 'Anatas': ['hnědý až modročerný', 'hnědý'],
    'Muskovit': ['stříbřitě bílý', 'bezbarvý'], 'Korund': ['šedý, hnědý, modrý nebo červený', 'šedý'], 'Zirkon': ['hnědý, červený nebo bezbarvý', 'hnědý'],
    'Granát': ['tmavě červený', 'červený'], 'Chalcedon': ['bělavý až modrošedý', 'bílý'], 'Scheelit': ['bílý až nažloutlý', 'bílý'], 'Nefelín': ['bílý až šedý', 'bílý'],
    'Tremolit': ['bílý až šedý', 'bílý'], 'Montmorillonit': ['bílý až narůžovělý', 'bílý'], 'Spodumen': ['bezbarvý, růžový nebo zelený', 'růžový'],
    'Willemit': ['zelenožlutý', 'zelený'], 'Stroncianit': ['bílý', 'bílý'], 'Sillimanit': ['bílý až hnědý', 'bílý'], 'Enstatit': ['hnědý až zelenavý', 'hnědý'],
    'Kutnohorit': ['bílý až narůžovělý', 'bílý'], 'Covellin': ['indigově modrý, kovový', 'modrý']
};
// Barva vrypu: u nerostů s kovovým leskem jedna z nejlepších poznávacích vlastností (nebarevný bílý vryp se neuvádí)
const STREAK = {
    'Hematit': 'třešňově červený', 'Pyrit': 'zelenočerný', 'Chalkopyrit': 'zelenočerný', 'Markazit': 'zelenočerný', 'Galenit': 'šedočerný',
    'Magnetit': 'černý', 'Grafit': 'šedočerný', 'Cinabarit': 'šarlatově červený', 'Limonit': 'žlutohnědý', 'Goethit': 'žlutohnědý',
    'Malachit': 'světle zelený', 'Azurit': 'světle modrý', 'Sfalerit': 'světle hnědý', 'Antimonit': 'šedočerný', 'Zlato': 'zlatožlutý',
    'Stříbro': 'stříbrně bílý', 'Měď': 'měděně červený', 'Uraninit': 'hnědočerný', 'Wolframit': 'hnědočerný', 'Chromit': 'hnědý', 'Ilmenit': 'černý',
    'Kuprit': 'hnědočervený', 'Realgar': 'oranžový', 'Auripigment': 'světle žlutý', 'Molybdenit': 'zelenavě šedý', 'Bornit': 'šedočerný',
    'Chalkocit': 'šedočerný', 'Arsenopyrit': 'šedočerný', 'Pyroluzit': 'černý', 'Rutil': 'světle hnědý', 'Pyrhotin': 'šedočerný', 'Covellin': 'šedočerný',
    'Kasiterit': 'bílý až nahnědlý', 'Krokoit': 'oranžově žlutý', 'Akantit': 'černý'
};

// --- Naleziště v Česku (česká stopa) ---
const CZECH_LOCALITIES = {
    'Uraninit': 'Jáchymov, Příbram', 'Stříbro': 'Kutná Hora, Jáchymov, Příbram', 'Kasiterit': 'Cínovec, Krupka, Horní Slavkov', 'Wolframit': 'Cínovec',
    'Grafit': 'Český Krumlov', 'Zlato': 'Jílové u Prahy, Kašperské Hory, Zlaté Hory', 'Galenit': 'Příbram, Kutná Hora, Stříbro', 'Sfalerit': 'Příbram, Kutná Hora',
    'Fluorit': 'Harrachov', 'Baryt': 'Harrachov', 'Antimonit': 'Krásná Hora nad Vltavou', 'Kaolinit': 'Sedlec u Karlových Varů', 'Sádrovec': 'Kobeřice na Opavsku',
    'Aragonit': 'Karlovy Vary (vřídlovec a hrachovec)', 'Lepidolit': 'Rožná na Vysočině',
    'Čedič': 'České středohoří, Doupovské hory', 'Znělec': 'České středohoří (Milešovka, Bořeň)', 'Žula': 'Krkonoše, Šumava, Novohradské hory',
    'Pískovec': 'Český ráj, Labské pískovce, Adršpach', 'Vápenec': 'Český kras (Koněprusy), Moravský kras', 'Mramor': 'Supíkovice, Lipová-lázně',
    'Opuka': 'Bílá Hora v Praze', 'Černé uhlí': 'Ostravsko-karvinská pánev, Kladensko', 'Hnědé uhlí': 'Mostecká a Sokolovská pánev',
    'Rula': 'Českomoravská vrchovina', 'Granulit': 'Blanský les', 'Serpentinit': 'Mohelno, Křemže', 'Buližník': 'Divoká Šárka v Praze',
    'Greisen': 'Cínovec, Krupka', 'Pěnovec': 'Svatý Jan pod Skalou', 'Pazourek': 'severní Morava a Slezsko (přinesl ledovec)', 'Křemelina': 'Borovany u Českých Budějovic'
};
// Nerosty pojmenované po českém nalezišti (česká stopa bez naleziště v nápovědě – to by název prozradilo)
const CZECH_NAMED = new Set(['Kutnohorit', 'Kladnoit', 'Heyrovskýit', 'Zálesíit']);
// Rudy: kov, který se z nerostu těží
const ORES = {
    'Galenit': 'olovo', 'Sfalerit': 'zinek', 'Chalkopyrit': 'měď', 'Bornit': 'měď', 'Chalkocit': 'měď', 'Kuprit': 'měď', 'Malachit': 'měď', 'Covellin': 'měď',
    'Magnetit': 'železo', 'Hematit': 'železo', 'Siderit': 'železo', 'Limonit': 'železo', 'Goethit': 'železo', 'Kasiterit': 'cín', 'Cinabarit': 'rtuť',
    'Uraninit': 'uran', 'Antimonit': 'antimon', 'Wolframit': 'wolfram', 'Scheelit': 'wolfram', 'Molybdenit': 'molybden', 'Chromit': 'chrom',
    'Ilmenit': 'titan', 'Rutil': 'titan', 'Pyroluzit': 'mangan', 'Akantit': 'stříbro', 'Kobaltin': 'kobalt', 'Bauxit': 'hliník', 'Smithsonit': 'zinek',
    'Cerusit': 'olovo', 'Spodumen': 'lithium', 'Lepidolit': 'lithium', 'Beryl': 'beryllium', 'Zirkon': 'zirkonium', 'Celestin': 'stroncium',
    'Stroncianit': 'stroncium', 'Baryt': 'baryum', 'Fluorit': 'fluor', 'Kryolit': 'hliník (tavidlo)', 'Sylvín': 'draslík'
};
// Další přijímané psané odpovědi (lidové a starší české názvy)
const ALIASES = {
    'Mastek': ['talek'], 'Uraninit': ['smolinec', 'smolinec uranový'], 'Kasiterit': ['cínovec', 'cínový kámen'], 'Halit': ['sůl kamenná', 'kamenná sůl'],
    'Sfalerit': ['blejno zinkové'], 'Galenit': ['leštěnec olověný'], 'Pyrit': ['kyz železný'], 'Chalkopyrit': ['kyz měděný'], 'Cinabarit': ['rumělka'],
    'Antimonit': ['stibnit'], 'Grafit': ['tuha'], 'Fluorit': ['kazivec'], 'Siderit': ['ocelek'], 'Limonit': ['hnědel'], 'Hematit': ['krevel'],
    'Magnetit': ['magnetovec'], 'Pyrop': ['český granát'], 'Vltavín': ['moldavit'], 'Baryt': ['těživec'], 'Křišťál': ['horský křišťál'],
    'Ortoklas': ['draselný živec', 'živec'], 'Znělec': ['fonolit'], 'Čedič': ['bazalt'], 'Žula': ['granit'], 'Metakvarcit': ['kvarcit', 'křemenec'],
    'Serpentinit': ['hadec'], 'Akvamarín': ['akvamarin'], 'Diamant': ['démant'], 'Molybdenit': ['leštěnec molybdenový'], 'Akantit': ['argentit'],
    'Pyroluzit': ['burel'], 'Chalkocit': ['leštěnec měděný'], 'Arsenopyrit': ['arzenopyrit'],
    'Lapis lazuli': ['lazurit', 'lazurový kámen'], 'Hnědé uhlí': ['lignit'],
    'Křemelina': ['diatomit'], 'Kontaktní rohovec': ['rohovec']
};
// Nerosty, které se do tématu musí dostat (Mohsova stupnice, česká naleziště), i když mají méně jazykových verzí
const MUST_MINERALS = ['Mastek', 'Sádrovec', 'Kalcit', 'Fluorit', 'Apatit', 'Ortoklas', 'Křemen', 'Korund', 'Uraninit', 'Stříbro', 'Zlato', 'Měď', 'Síra',
    'Rtuť', 'Kasiterit', 'Wolframit', 'Chalcedon', 'Granát', 'Beryl', 'Kutnohorit', 'Kladnoit', 'Lepidolit'];
// Mohsova stupnice: deset srovnávacích nerostů (název na stupnici v nápovědě)
const MOHS = [['Mastek', 1, 'mastek'], ['Sádrovec', 2, 'sádrovec'], ['Kalcit', 3, 'kalcit'], ['Fluorit', 4, 'fluorit'], ['Apatit', 5, 'apatit'],
    ['Ortoklas', 6, 'živec'], ['Křemen', 7, 'křemen'], ['Topaz', 8, 'topaz'], ['Korund', 9, 'korund'], ['Diamant', 10, 'diamant']];
// Nerosty, které zná běžný dospělý nebo středoškolák
const KNOWN = new Set(['Křemen', 'Kalcit', 'Sádrovec', 'Halit', 'Mastek', 'Grafit', 'Pyrit', 'Magnetit', 'Hematit', 'Galenit', 'Fluorit', 'Zlato',
    'Stříbro', 'Měď', 'Síra', 'Rtuť', 'Korund', 'Apatit', 'Ortoklas', 'Granát', 'Olivín', 'Muskovit', 'Biotit', 'Malachit', 'Azurit', 'Cinabarit',
    'Uraninit', 'Kasiterit', 'Dolomit', 'Chalkopyrit', 'Sfalerit', 'Kaolinit', 'Aragonit', 'Beryl', 'Zirkon', 'Limonit', 'Chalcedon', 'Baryt', 'Antimonit',
    'Diamant', 'Rubín', 'Safír', 'Smaragd', 'Ametyst', 'Topaz', 'Opál', 'Tyrkys', 'Achát', 'Jantar', 'Perla', 'Vltavín', 'Pyrop', 'Křišťál',
    'Lapis lazuli', 'Jaspis', 'Onyx', 'Akvamarín', 'Citrín', 'Růženín', 'Záhněda', 'Turmalín', 'Nefrit', 'Tygří oko',
    'Žula', 'Čedič', 'Pískovec', 'Vápenec', 'Mramor', 'Rula', 'Obsidián', 'Pemza', 'Opuka', 'Znělec', 'Slepenec', 'Pazourek', 'Černé uhlí',
    'Hnědé uhlí', 'Gabro', 'Andezit', 'Travertin', 'Serpentinit', 'Svor', 'Fylit', 'Bauxit', 'Diorit', 'Syenit', 'Pegmatit', 'Brekcie', 'Antracit', 'Buližník']);
// Názvy, které nejsou nerostem pro kvíz: skupiny nerostů (slída, živce – na fotce by šlo i o muskovit či ortoklas), odrůdy
// (selenit = sádrovec), slavné diamanty, směsi a syntetické látky; forsterit a lazurit by se pletly s olivínem a lapis lazuli
const NOT_MINERALS = /^(drahokam|polodrahokam|křemičitany|karbonáty|fylosilikát|prvek|horninotvorný minerál|jílové minerály|azbest|slída|živce|amfibol|pyroxeny|zeolit|plagioklas|draselný živec|alkalický živec|mafity|foidy|sericit|smektit|koh-i-noor|hope|cullinan|orlov|darya-i-noor|lesedi la rona|krvavý diamant|syntetický diamant|briliant|kryptonit|adnr|himálajská sůl|islandský kalcit|selenit|gema|arcikam|spinelid|ametrín|morion|prasiolit|sardonyx|heliotrop|bixbit|tsavorit|rhodolit|kočičí oko|skupina .*|černobylit|elektrum|osmiridium|yttrito-hlinitý granát|lonsdaleit|tranquillityit|greigit|cohenit|forsterit|lazurit|monazit|organolity|český granát|adulár|illit|abelsonit|urea|acetamid|elbait|skoryl|dravit|tetraboritan sodný)$/i;
const SITELINKS_MIN = 24;

// --- Geologická období (mil. let; Mezinárodní chronostratigrafická tabulka) ---
// level: eon, éra, perioda, epocha; parent = nadřazená jednotka; life = co se tehdy dělo se životem
const PERIODS = [
    { title: 'Hadaikum', name: 'Hadaikum', level: 'eon', from: 4600, to: 4000, life: 'vznik Země a Měsíce, ještě bez života' },
    { title: 'Archaikum', name: 'Archaikum', level: 'eon', from: 4000, to: 2500, life: 'první jednobuněčné organismy, sinice a stromatolity', alias: ['prahory'] },
    { title: 'Proterozoikum', name: 'Proterozoikum', level: 'eon', from: 2500, to: 538.8, life: 'kyslík v atmosféře, první mnohobuněční živočichové', alias: ['starohory'] },
    { title: 'Paleozoikum', name: 'Prvohory', level: 'éra', from: 538.8, to: 251.9, life: 'trilobiti, první ryby, obojživelníci a plazi, uhelné pralesy', alias: ['paleozoikum'] },
    { title: 'Mezozoikum', name: 'Druhohory', level: 'éra', from: 251.9, to: 66, life: 'dinosauři, první savci a ptáci', alias: ['mezozoikum'] },
    { title: 'Terciér', name: 'Třetihory', level: 'éra', from: 66, to: 2.58, life: 'rozvoj savců a ptáků, vznik Alp a Himálaje', alias: ['terciér'] },
    { title: 'Kvartér', name: 'Čtvrtohory', level: 'éra', from: 2.58, to: 0, life: 'doby ledové, mamuti, člověk', alias: ['kvartér'] },
    { title: 'Kambrium', name: 'Kambrium', level: 'perioda', parent: 'Prvohory', from: 538.8, to: 485.4, life: 'prudký rozvoj živočichů v mořích, první trilobiti' },
    { title: 'Ordovik', name: 'Ordovik', level: 'perioda', parent: 'Prvohory', from: 485.4, to: 443.8, life: 'trilobiti, hlavonožci, první bezčelistní obratlovci' },
    { title: 'Silur', name: 'Silur', level: 'perioda', parent: 'Prvohory', from: 443.8, to: 419.2, life: 'první cévnaté rostliny na souši, korálové útesy' },
    { title: 'Devon (geologie)', name: 'Devon', level: 'perioda', parent: 'Prvohory', from: 419.2, to: 358.9, life: 'věk ryb, první obojživelníci a lesy' },
    { title: 'Karbon', name: 'Karbon', level: 'perioda', parent: 'Prvohory', from: 358.9, to: 298.9, life: 'plavuňové a přesličkové pralesy (dnešní černé uhlí), první plazi' },
    { title: 'Perm', name: 'Perm', level: 'perioda', parent: 'Prvohory', from: 298.9, to: 251.9, life: 'savcovití plazi; na konci největší vymírání v dějinách Země' },
    { title: 'Trias', name: 'Trias', level: 'perioda', parent: 'Druhohory', from: 251.9, to: 201.4, life: 'první dinosauři a savci' },
    { title: 'Jura', name: 'Jura', level: 'perioda', parent: 'Druhohory', from: 201.4, to: 145, life: 'obří býložraví dinosauři, první ptáci (archeopteryx)' },
    { title: 'Křída', name: 'Křída', level: 'perioda', parent: 'Druhohory', from: 145, to: 66, life: 'kvetoucí rostliny, tyranosaurus; na konci vymření dinosaurů' },
    { title: 'Paleogén', name: 'Paleogén', level: 'perioda', parent: 'Třetihory', from: 66, to: 23.03, life: 'rozvoj savců po vymření dinosaurů' },
    { title: 'Neogén', name: 'Neogén', level: 'perioda', parent: 'Třetihory', from: 23.03, to: 2.58, life: 'travnaté stepi, první předkové člověka' },
    { title: 'Pleistocén', name: 'Pleistocén', level: 'epocha', parent: 'Čtvrtohory', from: 2.58, to: 0.0117, life: 'doby ledové, mamuti, neandrtálci a moderní člověk' },
    { title: 'Holocén', name: 'Holocén', level: 'epocha', parent: 'Čtvrtohory', from: 0.0117, to: 0, life: 'současnost po poslední době ledové: zemědělství, města' }
];
const KNOWN_PERIODS = new Set(['Prvohory', 'Druhohory', 'Třetihory', 'Čtvrtohory', 'Kambrium', 'Karbon', 'Trias', 'Jura', 'Křída']);
// Položky, které se podle štítku najdou špatně (Svor = obec, Devon = rozcestník, Křída = perioda i hornina – hornina vypadne)
const QID_OVERRIDES = { 'svor': 'Q3856092', 'období:Devon (geologie)': 'Q65955' };
// Droba, radiolarit, erlan a mylonit mají ve Wikidatech fotku jiné horniny (křemence, lomu na křemelinu, obecné přeměněné horniny)
const SKIP_ROCKS = new Set(['Křída', 'Melafyr', 'Droba', 'Radiolarit', 'Erlan', 'Mylonit']);
// Fotka ve Wikidatech nepatří k hornině (obsidián: snímek z výročí ruských Wikizpráv) – náhrada z Commons
const IMAGE_OVERRIDES = { 'Obsidián': 'A2613-Museum Geologi-Obsidian.jpg' };
const commonsUrl = (file) => `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;

// --- Vzorce: zápis bez nábojů (Fe²⁺ → Fe); u známých nerostů obvyklý zápis z učebnic ---
const FORMULAS = {
    'Magnetit': 'Fe₃O₄', 'Ilmenit': 'FeTiO₃', 'Chromit': 'FeCr₂O₄', 'Mastek': 'Mg₃Si₄O₁₀(OH)₂', 'Ortoklas': 'KAlSi₃O₈', 'Kyanit': 'Al₂SiO₅',
    'Sillimanit': 'Al₂SiO₅', 'Andalusit': 'Al₂SiO₅', 'Apatit': 'Ca₅(PO₄)₃(F,Cl,OH)', 'Muskovit': 'KAl₂(AlSi₃O₁₀)(OH)₂', 'Limonit': 'FeO(OH)·nH₂O',
    'Olivín': '(Mg,Fe)₂SiO₄', 'Beryl': 'Be₃Al₂Si₆O₁₈', 'Chalcedon': 'SiO₂', 'Biotit': 'K(Mg,Fe)₃AlSi₃O₁₀(OH)₂',
    'Uraninit': 'UO₂', 'Wolframit': '(Fe,Mn)WO₄', 'Tremolit': 'Ca₂Mg₅Si₈O₂₂(OH)₂', 'Stroncianit': 'SrCO₃', 'Kutnohorit': 'CaMn(CO₃)₂'
};
// Ortoklas nemá na české Wikipedii vlastní článek (je pod draselným živcem) a jeho položka ve Wikidatech není mezi
// kandidáty – článek z draselného živce, fotka a vlastnosti z položky ortoklasu (Q21813710)
const ORTHOCLASE = { q: 'Q3811879', image: 'http://commons.wikimedia.org/wiki/Special:FilePath/OrthoclaseBresil.jpg', strunz: ['9.FA.30'], sys: 'jednoklonná', dens: 2.6 };
// Nerosty, které by na fotce mohly být jedno i druhé (ortoklas, mikroklin i sanidin jsou draselné živce)
const CONFLICTS = [...GEM_CONFLICTS, ['Ortoklas', 'Mikroklin'], ['Ortoklas', 'Sanidin'], ['Mikroklin', 'Sanidin'], ['Pyrit', 'Markazit'],
    ['Hematit', 'Limonit'], ['Limonit', 'Goethit'], ['Anatas', 'Brookit']];
const conflictsOf = (name) => CONFLICTS.filter(pair => pair.includes(name)).map(pair => pair.find(other => other !== name));
// Zápisy s prázdnou pozicí (☐), rozpětím (1.3-2.0) nebo složenými závorkami by hráči nic neřekly – takový vzorec vynecháme
const cleanFormula = (formula) => {
    const clean = formula.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻]/g, '').replace(/\s+/g, '');
    return /[☐◻{}|?]|[\d₀-₉][.,]?[\d₀-₉]*-[\d₀-₉]/.test(clean) ? undefined : clean;
};

// Krystalová soustava podle štítku Wikidat (ty jsou nejednotné: kubická, Čtverečná…) → název z české učebnice
// (kosočtverečná dřív než čtverečná, jinak by ji „čtvereč“ chytilo taky)
const SYSTEMS = [[/kubick|krychlov|izometr/i, 'krychlová'], [/trigon|klencov|romboedr/i, 'klencová'], [/ortorombi|kosočtvereč|rombick/i, 'kosočtverečná'],
    [/tetragon|čtvereč/i, 'čtverečná'], [/hexagon|šestereč/i, 'šesterečná'], [/monoklin|jednoklon/i, 'jednoklonná'],
    [/triklin|trojklon/i, 'trojklonná'], [/amorf/i, 'amorfní']];
// Opravy soustavy z Wikidat (mastek tam má šesterečnou, kapalná rtuť klencovou; limonit je směs bez soustavy)
const SYSTEM_OVERRIDES = { 'Mastek': 'jednoklonná', 'Rtuť': null, 'Limonit': null, 'Opál': 'amorfní' };
const systemOf = (labels) => {
    const found = [...new Set(labels.map(label => (SYSTEMS.find(([pattern]) => pattern.test(label)) || [])[1]).filter(Boolean))];
    return found.length === 1 ? found[0] : undefined;
};

// --- 1. krok: kandidáti nerostů (minerály s článkem na české Wikipedii, podle počtu jazykových verzí) ---
const mineralCandidates = await cached('geologie-minerals', async () => {
    const rows = await qlever(`SELECT ?m (MAX(?links) AS ?sl) WHERE { { ?m wdt:P579 [] } UNION { ?m wdt:P31/wdt:P279* wd:Q7946 } UNION { ?m wdt:P279+ wd:Q7946 }
  ?a schema:about ?m . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?m wikibase:sitelinks ?links } GROUP BY ?m`);
    return rows.map(row => [id(row.m.value), Number(row.sl.value)]).sort((a, b) => b[1] - a[1]);
});
// Položky z tabulek (drahé kameny, horniny, období, nerosty Mohsovy stupnice) podle českého štítku a názvu článku
const wanted = [...Object.keys(GEMS), ...Object.keys(ROCKS), ...MUST_MINERALS];
const byName = new Map(await cached('geologie-by-name', async () => {
    const result = [];
    const labels = wanted.flatMap(name => [name, name.toLowerCase()]);
    await inBatches(labels, 150, (list) => `SELECT ?x ?l ?sl WHERE { VALUES ?l { ${list.map(name => `"${name}"@cs`).join(' ')} } ?x rdfs:label ?l .
  ?a schema:about ?x . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?x wikibase:sitelinks ?sl }`, (row) => result.push([row.l.value.toLowerCase(), id(row.x.value), Number(row.sl.value)]), qlever);
    await inBatches(PERIODS.map(period => period.title), 50, (list) => `SELECT ?x ?l ?sl WHERE { VALUES ?l { ${list.map(name => `"${name}"@cs`).join(' ')} }
  ?a schema:name ?l . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:about ?x . ?x wikibase:sitelinks ?sl }`, (row) => result.push([`období:${row.l.value}`, id(row.x.value), Number(row.sl.value)]), qlever);
    // Víc položek stejného štítku: ta s nejvíc jazykovými verzemi
    const best = new Map();
    for (const [label, q, sl] of result) if (!best.has(label) || best.get(label)[1] < sl) best.set(label, [q, sl]);
    return [...best].map(([label, [q]]) => [label, q]);
}));
for (const [key, q] of Object.entries(QID_OVERRIDES)) byName.set(key, q);
const qidOf = (name) => byName.get(name.toLowerCase());
const periodQid = (period) => byName.get(`období:${period.title}`);
// Nerosty, které nejsou mezi kandidáty (ortoklas není ve Wikidatech veden jako minerál), podle názvu článku
const extraMinerals = new Map([['Ortoklas', ORTHOCLASE.q], ...await cached('geologie-by-title', async () => {
    const result = [];
    const titles = MUST_MINERALS.flatMap(name => [name, `${name} (minerál)`]);
    await inBatches(titles, 100, (list) => `SELECT ?x ?l WHERE { VALUES ?l { ${list.map(name => `"${name}"@cs`).join(' ')} }
  ?a schema:name ?l . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:about ?x }`, (row) => result.push([displayTitle(row.l.value), id(row.x.value), row.l.value.includes('(')]), qlever);
    // Článek „Zlato (minerál)“ má přednost před prvkem „Zlato“
    const best = new Map();
    for (const [name, q, specific] of result) if (!best.has(name) || specific) best.set(name, q);
    return [...best];
})]);

// --- 2. krok: podrobnosti (článek, štítek, popis, fotka, vzorec, třída podle Strunze) ---
const SINGLE = { t: 1, n: 1, d: 1, im: 1 };
const fetchDetails = async (list) => {
    const result = new Map(list.map(qid => [qid, {}]));
    await inBatches(list, 150, (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wdt:P18 ?v BIND("im" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  UNION { ?item wdt:P274 ?v BIND("formula" AS ?p) }
  UNION { ?item wdt:P712 ?v BIND("strunz" AS ?p) }
  UNION { ?item wdt:P711 ?v BIND("strunz8" AS ?p) }
  UNION { ?item wdt:P2695 ?v BIND("tl" AS ?p) }
  UNION { ?item wdt:P2695/wdt:P17 ?v BIND("tlCountry" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
        else if (key === 'sl') entry.sl = Number(v);
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return result;
};
const candidateIds = mineralCandidates.filter(([, sl]) => sl >= SITELINKS_MIN).map(([q]) => q);
const allIds = [...new Set([...mineralCandidates.slice(0, 450).map(([q]) => q), ...wanted.map(qidOf), ...PERIODS.map(periodQid)].filter(q => q && isQid(q)))];
const details = new Map(await cached('geologie-details', async () => [...await fetchDetails(allIds)]));
// Položky opravené ručně (QID_OVERRIDES), nerosty dohledané podle článku a nerosty s českým jménem pod hranicí jazykových verzí
const czechNamedIds = mineralCandidates.map(([q]) => q).filter(q => details.has(q) && CZECH_NAMED.has(displayTitle(details.get(q).t || '')));
const missing = [...new Set([...wanted.map(qidOf), ...PERIODS.map(periodQid), ...extraMinerals.values()])].filter(q => q && isQid(q) && !details.has(q));
for (const [q, detail] of await cached('geologie-details-extra', async () => [...await fetchDetails(missing)])) details.set(q, detail);
Object.assign(details.get(ORTHOCLASE.q), { im: ORTHOCLASE.image, strunz: ORTHOCLASE.strunz });
// Nerost podle názvu: článek o nerostu („Zlato (minerál)“), ne o chemickém prvku
const mineralTitles = new Map([...mineralCandidates.map(([q]) => q), ...extraMinerals.values()].filter(q => details.has(q) && details.get(q).t)
    .map(q => [displayTitle(details.get(q).t), q]));
const mineralQid = (name) => extraMinerals.get(name) || mineralTitles.get(name) || qidOf(name);

// --- 3. krok: vlastnosti nerostů (krystalová soustava, hustota) ---
const mineralIds = [...new Set([...candidateIds, ...czechNamedIds, ...MUST_MINERALS.map(mineralQid), ...Object.keys(GEMS).map(qidOf)].filter(q => q && isQid(q)))];
const props = new Map(await cached('geologie-props', async () => {
    const result = new Map(mineralIds.map(q => [q, { sys: [], dens: [] }]));
    await inBatches(mineralIds, 200, (qids) => `SELECT ?item ?p ?v ?vl WHERE {
  VALUES ?item { ${values(qids)} }
  { ?item wdt:P556 ?v . OPTIONAL { ?v rdfs:label ?vl FILTER(LANG(?vl) = "cs") } BIND("sys" AS ?p) }
  UNION { ?item wdt:P2054 ?v BIND("dens" AS ?p) }
}`, (row) => {
        const entry = result.get(id(row.item.value));
        if (row.p.value === 'sys') entry.sys.push(row.vl ? row.vl.value : id(row.v.value));
        else entry.dens.push(Number(row.v.value));
    }, qlever);
    return [...result];
}));
console.log(`Nerosty (kandidáti): ${mineralCandidates.length}, podle názvu ${byName.size}, podrobnosti ${details.size}, vlastnosti ${props.size}`);
for (const name of wanted) if (!qidOf(name) && !mineralQid(name) && !SKIP_ROCKS.has(name)) console.log(`  chybí ${name}`);
for (const period of PERIODS) if (!periodQid(period)) console.log(`  chybí období ${period.title}`);

// Hustota: Wikidata ji někdy uvádějí v kg/m³ (fluorit 3089,83) – převod na g/cm³ a zahození nesmyslů
const densityOf = (list = []) => {
    const values = list.map(v => v > 100 ? v / 1000 : v).filter(v => v >= 0.8 && v <= 22).sort((a, b) => a - b);
    return values.length ? Math.round(values[Math.floor(values.length / 2)] * 10) / 10 : undefined;
};
const strunzClass = (codes = []) => {
    const code = codes.find(value => /^\d+\./.test(value));
    if (!code) return undefined;
    const [main, sub] = code.split('.');
    return { cls: Number(main), sub: (sub || '').charAt(0) };
};

// --- Sestavení položek ---
const items = [];
const usedQids = new Set();
const usedNames = new Set();
const add = (item) => {
    const key = item.n.toLocaleLowerCase('cs');
    if (usedQids.has(item.q) || usedNames.has(key)) return false;
    usedQids.add(item.q);
    usedNames.add(key);
    items.push(item);
    return true;
};
const photoOf = (detail) => {
    const file = fileOf(detail.im);
    return file && isRealPhoto(file) ? imageFields(detail.im) : {};
};
const hardnessFields = (h) => h ? { h, hm: (h[0] + h[1]) / 2 } : {};
// Krátký popis z Wikidat, jen když dává smysl (pyroluzit má v popisu „biotit“)
const NAMES = new Set([...Object.keys(GEMS), ...Object.keys(ROCKS), ...Object.keys(HARDNESS)].map(name => name.toLowerCase()));
const descriptionOf = (detail) => detail.d && !NAMES.has(detail.d.toLowerCase()) ? detail.d : undefined;

// Nerostné vlastnosti společné nerostům a drahým kamenům
const mineralFields = (q, name, detail, extra = {}) => {
    const p = q === ORTHOCLASE.q ? { sys: [ORTHOCLASE.sys], dens: [ORTHOCLASE.dens] } : props.get(q) || { sys: [], dens: [] };
    const klass = strunzClass(detail.strunz);
    const wdFormula = (detail.formula || [])[0];
    const formula = extra.formula || FORMULAS[name] || (wdFormula ? cleanFormula(wdFormula) : undefined);
    const [color, colorGroup] = MINERAL_COLORS[name] || [];
    const system = name in SYSTEM_OVERRIDES ? SYSTEM_OVERRIDES[name] : systemOf(p.sys);
    return compact({
        cls: klass && klass.cls, sub: klass && klass.sub, sys: system, dens: densityOf(p.dens), formula,
        col: extra.color || color, cg: extra.group || colorGroup, str: STREAK[name], ore: ORES[name],
        ...hardnessFields(extra.h || HARDNESS[name]),
        czl: CZECH_LOCALITIES[name] || extra.czl, loc: extra.loc, par: extra.parent, org: extra.org,
        al: ALIASES[name], cf: conflictsOf(name)
    });
};

// Drahé kameny
for (const [name, gem] of Object.entries(GEMS)) {
    const q = qidOf(name);
    const detail = details.get(q);
    if (!detail || !detail.t || /rozcestník/.test(detail.d || '')) { console.log(`  vynechán kámen ${name}`); continue; }
    const f = mineralFields(q, name, detail, gem);
    // Odrůda dědí třídu a soustavu po mateřském nerostu (ametyst = křemen)
    if (gem.parent) {
        const parent = details.get(mineralQid(capitalize(gem.parent))) || {};
        const parentClass = strunzClass(parent.strunz);
        const parentProps = props.get(mineralQid(capitalize(gem.parent))) || { sys: [] };
        if (!f.cls && parentClass) Object.assign(f, { cls: parentClass.cls, sub: parentClass.sub });
        if (!f.sys && systemOf(parentProps.sys)) f.sys = systemOf(parentProps.sys);
    }
    // Organické kameny a sklo nejsou nerosty: bez třídy, soustavy a vzorce
    if (gem.org) { delete f.cls; delete f.sub; delete f.sys; delete f.formula; }
    add(compact({ q, t: detail.t, n: name, c: 'kameny', k: KNOWN.has(name) ? 1 : 0, d: descriptionOf(detail), cz: f.czl ? 1 : undefined, ...photoOf(detail), f }));
}

// Nerosty: kandidáti podle jazykových verzí, povinné a s českým jménem
const mineralQids = [...new Set([...MUST_MINERALS.map(mineralQid), ...candidateIds, ...czechNamedIds].filter(q => q && isQid(q)))];
const gemNames = new Set(Object.keys(GEMS).map(name => name.toLowerCase()));
const rockNames = new Set(Object.keys(ROCKS).map(name => name.toLowerCase()));
for (const q of mineralQids) {
    const detail = details.get(q);
    if (!detail || !detail.t) continue;
    const name = q === ORTHOCLASE.q ? 'Ortoklas' : displayTitle(detail.t);
    if (NOT_MINERALS.test(name) || gemNames.has(name.toLowerCase()) || rockNames.has(name.toLowerCase()) || /-\(|\(/.test(detail.t.replace(/\s*\((minerál|geologie)\)$/, ''))) continue;
    const photo = photoOf(detail);
    // Fotka je podstata otázky – nerost bez skutečné fotky vynecháme
    if (!photo.im) continue;
    const f = mineralFields(q, name, detail);
    // Bez vzorce i tvrdosti by nerost neměl skoro žádnou nápovědu (třídu mají stejnou i nesprávné možnosti)
    if (!f.formula && !f.h) continue;
    const czech = Boolean(f.czl) || CZECH_NAMED.has(name);
    add(compact({ q, t: detail.t, n: name, c: 'nerosty', k: KNOWN.has(name) ? 1 : 0, d: descriptionOf(detail), cz: czech ? 1 : undefined, ...photo, f }));
}

// Horniny
for (const [name, [group, composition, origin]] of Object.entries(ROCKS)) {
    if (SKIP_ROCKS.has(name)) continue;
    const q = qidOf(name);
    const detail = details.get(q);
    if (!detail || !detail.t || /obec|rozcestník/.test(detail.d || '')) { console.log(`  vynechána hornina ${name}`); continue; }
    // Fotka horniny může být i PNG (tonalit), mapy a schémata horniny nemají
    const image = IMAGE_OVERRIDES[name] ? { ...detail, im: commonsUrl(IMAGE_OVERRIDES[name]) } : detail;
    const photo = photoOf(image).im ? photoOf(image) : /\.png$/i.test(fileOf(image.im)) ? imageFields(image.im) : {};
    // Bez fotky jen česká hornina (opuka), ostatní by bez obrázku nedávaly smysl
    if (!photo.im && !CZECH_LOCALITIES[name]) { console.log(`  hornina bez fotky ${name}`); continue; }
    const f = compact({ grp: group, comp: composition, orig: origin, use: ROCK_USES[name], czl: CZECH_LOCALITIES[name], al: ALIASES[name] });
    add(compact({ q, t: detail.t, n: name, c: 'horniny', k: KNOWN.has(name) ? 1 : 0, d: descriptionOf(detail), cz: f.czl ? 1 : undefined, ...photo, f }));
}

// Geologická období (paleogeografická mapa světa z té doby jako obrazová nápověda)
for (const period of PERIODS) {
    const q = periodQid(period);
    const detail = details.get(q);
    if (!detail || !detail.t) { console.log(`  vynecháno období ${period.title}`); continue; }
    const file = fileOf(detail.im);
    const isPaleoMap = /Paleographic Map/i.test(file);
    const f = compact({ lvl: period.level, from: period.from, to: period.to, life: period.life, par: period.parent, al: period.alias,
        ...(isPaleoMap ? { map: file, mh: imageFields(detail.im).ih } : {}) });
    // Fotka jen skutečná (trilobit u prvohor), ne mapa ani dnešní glóbus
    const photo = !isPaleoMap && !/Mollweide/i.test(file) ? photoOf(detail) : {};
    add(compact({ q, t: detail.t, n: period.name, c: 'obdobi', k: KNOWN_PERIODS.has(period.name) ? 1 : 0, d: /rozcestník/.test(detail.d || '') ? undefined : detail.d, ...photo, f }));
}

// --- Okruhy ---
const CLASS_COLLECTIONS = [
    ['prvky', 'Ryzí prvky', 1, 'Zlato, stříbro, síra, grafit…'], ['sulfidy', 'Sulfidy', 2, 'Sloučeniny kovů se sírou – hlavní rudy'],
    ['halogenidy', 'Halogenidy', 3, 'Halit, fluorit a další'], ['oxidy', 'Oxidy a hydroxidy', 4], ['uhlicitany', 'Uhličitany', 5],
    ['sirany', 'Sírany a příbuzné', 7], ['fosforecnany', 'Fosforečnany a arseničnany', 8], ['kremicitany', 'Křemičitany', 9, 'Nejpočetnější třída nerostů']
];
const ROCK_GROUPS = { vyvrele: ['hlubinna', 'vylevna', 'zilna'], usazene: ['usazena'], premenene: ['premenena'] };
const COLLECTIONS = [
    { id: 'mohsova-stupnice', label: 'Mohsova stupnice', text: 'Deset nerostů od mastku po diamant', sort: { by: 'hm' }, test: item => MOHS.some(([name]) => name === item.n) },
    { id: 'cesko', label: 'Nerosty a horniny v Česku', text: 'Jáchymov, Kutná Hora, český granát, vltavín…', test: item => item.cz === 1 },
    { id: 'odrudy-kremene', label: 'Odrůdy křemene a chalcedonu', test: item => ['křemen', 'chalcedon'].includes(item.f.par) || ['Křemen', 'Chalcedon'].includes(item.n) },
    { id: 'rudy', label: 'Rudy', text: 'Nerosty, ze kterých se těží kovy', test: item => item.c !== 'kameny' && Boolean(item.f.ore) && !/tavidlo/.test(item.f.ore) },
    { id: 'vyvrele', label: 'Vyvřelé horniny', text: 'Ztuhlé z magmatu a lávy', test: item => ROCK_GROUPS.vyvrele.includes(item.f.grp) },
    { id: 'usazene', label: 'Usazené horniny', test: item => ROCK_GROUPS.usazene.includes(item.f.grp) },
    { id: 'premenene', label: 'Přeměněné horniny', test: item => ROCK_GROUPS.premenene.includes(item.f.grp) },
    { id: 'stavebni-kamen', label: 'Stavební a sochařský kámen', test: item => item.c === 'horniny' && BUILDING_STONES.has(item.n) },
    ...CLASS_COLLECTIONS.map(([collectionId, label, cls, text]) => ({ id: collectionId, label, ...(text ? { text } : {}),
        test: item => item.c === 'nerosty' && item.f.cls === cls }))
];
for (const item of items) {
    const groups = COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
    if (groups.length) item.g = groups;
}

// Pořadí: známé napřed, pak podle kategorie
const order = { kameny: 0, nerosty: 1, horniny: 2, obdobi: 3 };
items.sort((a, b) => b.k - a.k || order[a.c] - order[b.c]);
const collections = COLLECTIONS.map(({ test, ...collection }) => collection);
for (const category of Object.keys(order)) {
    const inCategory = items.filter(item => item.c === category);
    console.log(`${category}: ${inCategory.length} (známých ${inCategory.filter(item => item.k === 1).length}, s fotkou ${inCategory.filter(item => item.im).length})`);
}
for (const collection of collections) console.log(`okruh ${collection.label}: ${items.filter(item => (item.g || []).includes(collection.id)).length}`);
writeTopic('geologie', { collections, items });
