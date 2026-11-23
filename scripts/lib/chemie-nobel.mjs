// Chemie: chemici a nositelé Nobelovy ceny za chemii (scripts/build-chemie.mjs). Laureáti jsou v kategorii Chemici (okruh Nositelé
// Nobelovy ceny za chemii), ne ve zvláštní kategorii: skoro všichni už tam byli a známí chemici z ní nesmí zmizet. Každý chemik
// s Nobelovou cenou má fakt „Nobelova cena: 1911 za objev radia a polonia“ – rok z Wikidat (P166 s kvalifikátorem P585) a za co
// ji dostal česky podle oficiálního zdůvodnění Nobelovy nadace (zkráceně, bez jmen: Grignardovo činidlo by prozradilo Grignarda).
// Další Nobelovy ceny (Curie za fyziku, Pauling za mír, chemici s cenou za fyziologii nebo lékařství) jsou ve stejném faktu.
import { yearOf, imageFields, compact } from './wikidata.mjs';
import { landByDescription } from './nationality.mjs';

export const NOBEL_CHEMISTRY = 'Q44585';
// Nobelovy ceny a jak se říkají česky („Nobelova cena za …“)
export const NOBEL_PRIZES = { Q44585: 'chemii', Q38104: 'fyziku', Q80061: 'fyziologii nebo lékařství', Q35637: 'mír', Q37922: 'literaturu', Q47170: 'ekonomii' };
export const FEMALE = 'Q6581072';
export const CZECH_STATES = new Set(['Q213', 'Q33946', 'Q42585', 'Q152750', 'Q853348', 'Q1998866', 'Q1991965', 'Q39193', 'Q43266']);

// Za co: rok ceny → zdůvodnění (po „za“, 4. pád); v letech, kdy cenu dostali dva za různé objevy, podle ID laureáta
export const NOBEL_FOR = {
    1901: 'objev zákonů chemické dynamiky a osmotického tlaku v roztocích',
    1902: 'syntézy cukrů a purinů',
    1903: 'teorii elektrolytické disociace',
    1904: 'objev vzácných plynů ve vzduchu',
    1905: 'výzkum organických barviv a hydroaromatických sloučenin',
    1906: 'izolaci fluoru a elektrickou pec',
    1907: 'objev bezbuněčného kvašení',
    1908: 'výzkum rozpadu prvků a chemie radioaktivních látek',
    1909: 'práce o katalýze, chemické rovnováze a rychlosti reakcí',
    1910: 'průkopnický výzkum alicyklických sloučenin',
    1911: 'objev radia a polonia',
    1912: { Q104575: 'hydrogenaci organických látek na jemně rozptýlených kovech', Q104582: 'objev organohořečnatých činidel' },
    1913: 'teorii vazby atomů v komplexních sloučeninách',
    1914: 'přesné určení atomových hmotností mnoha prvků',
    1915: 'výzkum rostlinných barviv, zvláště chlorofylu',
    1918: 'syntézu amoniaku z prvků',
    1920: 'práce z termochemie',
    1921: 'výzkum radioaktivních látek a původu izotopů',
    1922: 'objev mnoha izotopů hmotnostním spektrografem',
    1923: 'mikroanalýzu organických látek',
    1925: 'výzkum koloidních roztoků',
    1926: 'výzkum disperzních soustav',
    1927: 'výzkum složení žlučových kyselin',
    1928: 'výzkum sterolů a jejich vztahu k vitamínům',
    1929: 'výzkum kvašení cukrů a kvasných enzymů',
    1930: 'výzkum heminu a chlorofylu a syntézu heminu',
    1931: 'vývoj vysokotlakých chemických metod',
    1932: 'objevy v chemii povrchů',
    1934: 'objev těžkého vodíku',
    1935: 'přípravu nových radioaktivních prvků',
    1936: 'výzkum stavby molekul pomocí dipólových momentů a difrakce',
    1937: { Q73093: 'výzkum karotenoidů, flavinů a vitamínů A a B2', Q204600: 'výzkum sacharidů a vitamínu C' },
    1938: 'práce o karotenoidech a vitamínech',
    1939: { Q5327: 'práce o pohlavních hormonech', Q122996: 'práce o polymethylenech a vyšších terpenech' },
    1943: 'použití izotopů jako stopovačů chemických dějů',
    1944: 'objev štěpení těžkých jader',
    1945: 'objevy v zemědělské chemii a konzervaci krmiv',
    1946: { Q106756: 'objev krystalizace enzymů', default: 'přípravu čistých enzymů a virových bílkovin' },
    1947: 'výzkum rostlinných alkaloidů',
    1948: 'výzkum elektroforézy a bílkovin krevního séra',
    1949: 'chemickou termodynamiku velmi nízkých teplot',
    1950: 'objev a rozvoj dienové syntézy',
    1951: 'objevy v chemii transuranů',
    1952: 'vynález rozdělovací chromatografie',
    1953: 'objevy v chemii makromolekul',
    1954: 'výzkum povahy chemické vazby',
    1955: 'první syntézu peptidového hormonu',
    1956: 'výzkum mechanismu chemických reakcí',
    1957: 'práce o nukleotidech a nukleotidových koenzymech',
    1958: 'určení struktury inzulinu',
    1959: 'objev a rozvoj polarografie',
    1960: 'radiouhlíkovou metodu datování',
    1961: 'výzkum asimilace oxidu uhličitého v rostlinách',
    1962: 'určení struktury globulárních bílkovin',
    1963: 'objevy v chemii a technologii polymerů',
    1964: 'rentgenové určení struktury biochemických látek',
    1965: 'mistrovství v organické syntéze',
    1966: 'metodu molekulových orbitalů',
    1967: 'výzkum velmi rychlých chemických reakcí',
    1968: 'reciproční vztahy v termodynamice nevratných dějů',
    1969: 'rozvoj pojmu konformace molekul',
    1970: 'objev cukerných nukleotidů a jejich úlohy v biosyntéze sacharidů',
    1971: 'výzkum stavby molekul a volných radikálů',
    1972: { Q102278: 'výzkum ribonukleázy a sbalování bílkovin', default: 'výzkum aktivního centra ribonukleázy' },
    1973: 'chemii sendvičových organokovových sloučenin',
    1974: 'fyzikální chemii makromolekul',
    1975: { Q83501: 'výzkum stereochemie organických molekul a reakcí', Q135154: 'výzkum stereochemie enzymových reakcí' },
    1976: 'výzkum struktury boranů',
    1977: 'teorii disipativních struktur',
    1978: 'chemiosmotickou teorii přenosu energie v buňkách',
    1979: 'využití sloučenin boru a fosforu v organické syntéze',
    1980: { Q102379: 'výzkum nukleových kyselin a rekombinantní DNA', default: 'určování pořadí bází v nukleových kyselinách' },
    1981: 'teorie průběhu chemických reakcí',
    1982: 'elektronovou krystalografii komplexů nukleových kyselin a bílkovin',
    1983: 'výzkum přenosu elektronů v kovových komplexech',
    1984: 'chemickou syntézu na pevném nosiči',
    1985: 'přímé metody určování krystalových struktur',
    1986: 'výzkum dynamiky elementárních chemických dějů',
    1987: 'vývoj molekul s vysoce selektivními vazbami',
    1988: 'určení struktury fotosyntetického reakčního centra',
    1989: 'objev katalytických vlastností RNA',
    1990: 'teorii a metodiku organické syntézy',
    1991: 'rozvoj spektroskopie NMR s vysokým rozlišením',
    1992: 'teorii přenosu elektronů v chemických soustavách',
    1993: { Q157224: 'vynález polymerázové řetězové reakce', Q232289: 'cílenou mutagenezi pomocí oligonukleotidů' },
    1994: 'výzkum karbokationtů',
    1995: 'výzkum vzniku a rozkladu ozonu v atmosféře',
    1996: 'objev fullerenů',
    1997: { Q1687170: 'objev sodno-draselné pumpy', default: 'objasnění enzymového mechanismu syntézy ATP' },
    1998: { Q78510: 'teorii funkcionálu hustoty', Q233973: 'výpočetní metody kvantové chemie' },
    1999: 'výzkum přechodových stavů reakcí femtosekundovou spektroskopií',
    2000: 'objev a rozvoj vodivých polymerů',
    2001: { Q110925: 'chirálně katalyzované oxidace', default: 'chirálně katalyzované hydrogenace' },
    2002: { Q110957: 'určování struktury biomolekul pomocí NMR', default: 'šetrné ionizační metody hmotnostní spektrometrie' },
    2003: { Q102250: 'objev vodních kanálů v buňkách', Q211482: 'výzkum iontových kanálů' },
    2004: 'objev rozkladu bílkovin řízeného ubikvitinem',
    2005: 'rozvoj metateze v organické syntéze',
    2006: 'výzkum molekulární podstaty transkripce u eukaryot',
    2007: 'výzkum chemických dějů na površích pevných látek',
    2008: 'objev a rozvoj zeleného fluorescenčního proteinu',
    2009: 'výzkum struktury a funkce ribozomu',
    2010: 'křížové párovací reakce katalyzované palladiem',
    2011: 'objev kvazikrystalů',
    2012: 'výzkum receptorů spřažených s G proteiny',
    2013: 'víceúrovňové modely složitých chemických soustav',
    2014: 'fluorescenční mikroskopii s velmi vysokým rozlišením',
    2015: 'výzkum mechanismů opravy DNA',
    2016: 'návrh a syntézu molekulárních strojů',
    2017: 'rozvoj kryoelektronové mikroskopie',
    2018: { Q4273363: 'řízenou evoluci enzymů', default: 'fágový display peptidů a protilátek' },
    2019: 'vývoj lithium-iontových baterií',
    2020: 'vývoj genetických nůžek CRISPR',
    2021: 'rozvoj asymetrické organokatalýzy',
    2022: 'rozvoj click chemie a bioortogonální chemie',
    2023: 'objev a syntézu kvantových teček',
    2024: { Q3814528: 'počítačový návrh bílkovin', default: 'předpověď struktury bílkovin' },
    2025: 'vývoj kovoorganických sítí',
    2026: 'objev nelineárních efektů a autokatalýzy v asymetrické syntéze'
};

// Za co cenu za chemii dostal(a); bez českého zdůvodnění (nový ročník) jen „chemii“
export const nobelForOf = (qid, year) => {
    const entry = NOBEL_FOR[year];
    if (typeof entry === 'string') return entry;
    return (entry && (entry[qid] || entry.default)) || null;
};

// Dotaz na Nobelovy ceny osob (s rokem udělení)
export const nobelQuery = (qids) => `SELECT ?p ?prize ?time WHERE { VALUES ?p { ${qids.map(q => `wd:${q}`).join(' ')} }
  VALUES ?prize { ${Object.keys(NOBEL_PRIZES).map(q => `wd:${q}`).join(' ')} }
  ?p p:P166 ?st . ?st ps:P166 ?prize . OPTIONAL { ?st pq:P585 ?time } }`;

// Řádky dotazu → { ID osoby: { np: [[rok, za co], …] podle roku, ny: rok první ceny za chemii } }; chybějící zdůvodnění vypíše
export const nobelFieldsOf = (rows) => {
    const byPerson = new Map();
    const missing = [];
    for (const row of rows) {
        const qid = row.p.value.split('/').pop();
        const prize = row.prize.value.split('/').pop();
        const year = row.time ? yearOf(row.time.value) : undefined;
        if (year === undefined) continue;
        const chemistry = prize === NOBEL_CHEMISTRY;
        const text = chemistry ? (nobelForOf(qid, year) || NOBEL_PRIZES[prize]) : NOBEL_PRIZES[prize];
        if (chemistry && !nobelForOf(qid, year)) missing.push(`${year} ${qid}`);
        if (!byPerson.has(qid)) byPerson.set(qid, []);
        const list = byPerson.get(qid);
        if (!list.some(([y, t]) => y === year && t === text)) list.push([year, text]);
    }
    const result = {};
    for (const [qid, list] of byPerson) {
        list.sort((a, b) => a[0] - b[0]);
        const chemistryYears = rows.filter(row => row.p.value.endsWith(`/${qid}`) && row.prize.value.endsWith(`/${NOBEL_CHEMISTRY}`) && row.time)
            .map(row => yearOf(row.time.value)).sort((a, b) => a - b);
        result[qid] = compact({ np: list, ny: chemistryYears[0] });
    }
    if (missing.length) console.warn(`Nobelova cena za chemii bez českého zdůvodnění (doplň NOBEL_FOR): ${[...new Set(missing)].join(', ')}`);
    return result;
};

// Položka kategorie Chemici z podrobností Wikidat (detail: t, n, d, im, born, died, sex, cit, award); cs = český název položky
// Wikidat (občanství). Bez českého článku nebo roku narození null.
export const chemistItem = (qid, detail, cs) => {
    if (!detail || !detail.t) return null;
    // Někteří mají jen mezinárodní název (mul) – pak název článku
    const name = detail.n || detail.t.replace(/ \(.*\)$/, '');
    const born = yearOf(detail.born);
    if (born === undefined) return null;
    const nobel = (detail.award || []).includes(NOBEL_CHEMISTRY);
    const isCzech = (detail.cit || []).some(q => CZECH_STATES.has(q));
    return compact({
        q: qid,
        t: detail.t,
        n: name,
        c: 'chemici',
        k: isCzech ? 1 : 0,
        ty: detail.sex === FEMALE ? 'chemička' : 'chemik',
        sx: detail.sex === FEMALE ? 'f' : undefined,
        d: detail.d,
        cz: isCzech ? 1 : undefined,
        ...imageFields(detail.im),
        f: compact({
            born,
            died: yearOf(detail.died),
            // Příslušnost podle popisu (Boris Johnson ve Wikidatech: USA)
            land: landByDescription(detail.d, (detail.cit || []).map(cs)),
            nobel: nobel ? 1 : undefined,
            y: born + 35
        })
    });
};
