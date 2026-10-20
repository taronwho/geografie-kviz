// Malá testovací data pro test v prohlížeči (tests/e2e.test.js): místo skutečných data/*.json
// Známé položky mají fotku i fakta (dnešní otázka má tedy 4 úrovně), ostrovy jsou méně známé a bez použitelné fotky.

const countries = {
    Q39: { name: 'Švýcarsko', continent: 'EU', iso: '756' },
    Q40: { name: 'Rakousko', continent: 'EU', iso: '040' },
    Q183: { name: 'Německo', continent: 'EU', iso: '276' },
    Q142: { name: 'Francie', continent: 'EU', iso: '250' },
    Q38: { name: 'Itálie', continent: 'EU', iso: '380' },
    Q213: { name: 'Česko', continent: 'EU', iso: '203' },
    Q17: { name: 'Japonsko', continent: 'AS', iso: '392' }
};

const place = (q, n, c, k, co, extra = {}) => ({ q, t: n, n, c, k, la: 47, lo: 8, ty: '', d: `${c} v testovacím světě`, co, im: `${n}_z_jihu.jpg`, ih: 'ab', f: {}, ...extra });
const zemepis = {
    generated: '2026-10-19',
    collections: [
        { id: 'cesko', label: 'Česko', text: 'Místa v Česku', sort: { by: 'name' } },
        { id: 'velkomesta', label: 'Velkoměsta', sort: { by: 'pop', desc: true } }
    ],
    items: [
        place('Q39', 'Švýcarsko', 'stat', 1, ['Q39'], { im: undefined, la: 46.8, lo: 8.2, f: { cap: 'Bern', area: 41285, pop: 8700000 } }),
        place('Q40', 'Rakousko', 'stat', 1, ['Q40'], { im: undefined, la: 47.6, lo: 14.1, f: { cap: 'Vídeň', area: 83879 } }),
        place('Q183', 'Německo', 'stat', 1, ['Q183'], { im: undefined, la: 51, lo: 10, f: { cap: 'Berlín', area: 357588 } }),
        place('Q142', 'Francie', 'stat', 1, ['Q142'], { im: undefined, la: 46, lo: 2, f: { cap: 'Paříž', area: 551695 } }),
        place('Q38', 'Itálie', 'stat', 1, ['Q38'], { im: undefined, la: 42.8, lo: 12.8, f: { cap: 'Řím', area: 302073 } }),
        place('Q213', 'Česko', 'stat', 1, ['Q213'], { im: undefined, la: 49.8, lo: 15.5, f: { cap: 'Praha', area: 78871 }, g: ['cesko'] }),
        place('Q17', 'Japonsko', 'stat', 1, ['Q17'], { im: undefined, la: 36, lo: 138, f: { cap: 'Tokio', area: 377975 } }),
        place('Q5000', 'Testov', 'mesto', 1, ['Q213'], { ty: 'město', la: 50, lo: 15, f: { pop: 120000 }, g: ['cesko'] }),
        place('Q64', 'Berlín', 'mesto', 1, ['Q183'], { la: 52.5, lo: 13.4, f: { pop: 3700000 }, g: ['velkomesta'] }),
        place('Q1741', 'Vídeň', 'mesto', 1, ['Q40'], { la: 48.2, lo: 16.4, f: { pop: 1900000 }, g: ['velkomesta'] }),
        place('Q220', 'Řím', 'mesto', 1, ['Q38'], { la: 41.9, lo: 12.5, f: { pop: 2800000 }, g: ['velkomesta'] }),
        place('Q4242', 'Testovací hora', 'hora', 1, ['Q39'], { ty: 'hora', la: 46.5, lo: 8, f: { elev: 3000 } }),
        place('Q4243', 'Vedlejší vrch', 'hora', 1, ['Q142'], { f: { elev: 1500 } }),
        place('Q4244', 'Malý kopec', 'hora', 0, ['Q40'], { f: { elev: 900 } }),
        place('Q39231', 'Fudži', 'hora', 1, ['Q17'], { la: 35.4, lo: 138.7, f: { elev: 3776 } }),
        place('Q6001', 'Vlajkový ostrov', 'ostrov', 0, ['Q38'], { im: 'Flag_of_Testland.svg', la: 40, lo: 9 }),
        place('Q6002', 'Druhý ostrov', 'ostrov', 0, ['Q142'], { im: 'Chybejici_fotka.jpg', la: 42, lo: 9 })
    ]
};

const record = (q, n, c, k, f, extra = {}) => ({ q, t: n, n, c, k, ty: '', d: `${c} v testovacích dějinách`, co: [], im: `${n}_portret.jpg`, ih: 'cd', f, ...extra });
const ruler = (q, n, born, died, from, to, dyn, g, extra = {}) => record(q, n, 'panovnik', 1, { born, died, from, to, dyn, y: from }, { ty: 'panovník', g, ...extra });
const historie = {
    generated: '2026-10-20',
    collections: [
        { id: 'premyslovci', label: 'Přemyslovci', text: 'Česká knížata a králové z rodu Přemyslovců', sort: { by: 'y' } },
        { id: 'anglicti-panovnici', label: 'Angličtí panovníci', sort: { by: 'y' } }
    ],
    items: [
        ruler('Q130005', 'Přemysl Otakar II.', 1233, 1278, 1253, 1278, 'Přemyslovci', ['premyslovci'], { ty: 'český král', cz: 1 }),
        ruler('Q130006', 'Václav II.', 1271, 1305, 1283, 1305, 'Přemyslovci', ['premyslovci'], { ty: 'český král', cz: 1 }),
        ruler('Q42', 'Karel IV.', 1316, 1378, 1346, 1378, 'Lucemburkové', [], { ty: 'český král', cz: 1 }),
        ruler('Q38370', 'Jindřich VIII.', 1491, 1547, 1509, 1547, 'Tudorovci', ['anglicti-panovnici'], { ty: 'anglický král' }),
        ruler('Q7207', 'Alžběta I.', 1533, 1603, 1558, 1603, 'Tudorovci', ['anglicti-panovnici'], { ty: 'anglická královna' }),
        ruler('Q140412', 'Jiří z Poděbrad', 1420, 1471, 1458, 1471, '', [], { ty: 'český král', cz: 1, k: 0 }),
        record('Q15', 'Tomáš Garrigue Masaryk', 'statnik', 1, { born: 1850, died: 1937, from: 1918, to: 1935, land: 'Československo', y: 1918 }, { cz: 1 }),
        record('Q8058', 'Winston Churchill', 'statnik', 1, { born: 1874, died: 1965, from: 1940, to: 1955, y: 1940 }),
        record('Q36706', 'Jan Hus', 'osobnost', 1, { born: 1370, died: 1415, y: 1370 }, { cz: 1 }),
        record('Q216401', 'Bitva na Bílé hoře', 'bitva', 1, { year: 1620, war: 'Třicetiletá válka', place: 'Praha', y: 1620 }, { la: 50.08, lo: 14.32, co: ['Q213'], cz: 1 }),
        record('Q2475', 'Třicetiletá válka', 'bitva', 1, { year: 1618, end: 1648, y: 1618 }),
        record('Q12544', 'Byzantská říše', 'rise', 1, { from: 330, to: 1453, cap: 'Konstantinopol', y: 330 }),
        // Ať má každá kategorie aspoň čtyři položky (čtyři možnosti)
        record('Q36233', 'Václav Havel', 'statnik', 1, { born: 1936, died: 2011, from: 1989, to: 2003, y: 1989 }, { cz: 1 }),
        record('Q11696', 'Abraham Lincoln', 'statnik', 1, { born: 1809, died: 1865, from: 1861, to: 1865, y: 1861 }),
        record('Q7322', 'Kryštof Kolumbus', 'osobnost', 1, { born: 1451, died: 1506, y: 1486 }),
        record('Q83204', 'Jan Žižka', 'osobnost', 1, { born: 1360, died: 1424, y: 1395 }, { cz: 1 }),
        record('Q7210', 'Jan Amos Komenský', 'osobnost', 1, { born: 1592, died: 1670, y: 1627 }, { cz: 1 }),
        record('Q152499', 'Bitva u Lipan', 'bitva', 1, { year: 1434, y: 1434 }, { cz: 1 }),
        record('Q152500', 'Bitva u Slavkova', 'bitva', 1, { year: 1805, y: 1805 }, { la: 49.13, lo: 16.76, co: ['Q213'], cz: 1 }),
        record('Q2277', 'Římská říše', 'rise', 1, { from: -27, to: 476, cap: 'Řím', y: -27 }),
        record('Q12548', 'Svatá říše římská', 'rise', 1, { from: 962, to: 1806, y: 962 }),
        record('Q180114', 'Velkomoravská říše', 'rise', 1, { from: 833, to: 907, y: 833 }, { cz: 1 })
    ]
};

// Úvody článků z Wikipedie; ostatní položky dostanou obecný text
const EXTRACTS = {
    'Testovací hora': 'Testovací hora je hora v pohoří Alpy ve Švýcarsku, vysoká přibližně tři tisíce metrů. <img src=x onerror=__xss=1> ' +
        'Na vrcholu Testovací hory stojí horská chata, kterou navštěvují turisté z celého světa. Hora je známá svými ledovci a výhledy do údolí. ' +
        'Ve 20. století zde vznikla lanovka vedoucí až na vrchol hory.',
    'Testov': 'Testov je statutární město v Česku, leží v Jihomoravském kraji na řece Svratce. Je to známé české univerzitní město s bohatou historií. ' +
        'Ve městě sídlí několik vysokých škol a velký výstavní areál, který každoročně hostí mnoho veletrhů.',
    'Švýcarsko': 'Švýcarsko, oficiálně Švýcarská konfederace, je vnitrozemský stát ve střední Evropě. Hlavním městem je Bern, největším městem Curych. ' +
        'Švýcarská neutralita má dlouhou tradici a země je známá hodinkami, sýry a čokoládou.'
};
const extractFor = (title) => EXTRACTS[title] || `${title} je položka, o které se píše v testu. <img src=x onerror=__xss=1> ` +
    'Je známá svou krásou a dlouhou historií, kterou je třeba uhodnout. Ve 20. století se o ní začalo psát po celém světě. ' +
    'Má bohatou historii a nabízí mnoho zajímavostí pro každého, kdo se o ni zajímá.';

module.exports = {
    files: {
        '/data/countries.json': { generated: '2026-10-19', countries },
        '/data/zemepis.json': zemepis,
        '/data/historie.json': historie
    },
    extractFor
};
