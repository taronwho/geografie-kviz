// Fyzika: ručně vybrané položky navíc (podle ID ve Wikidatech, s českým článkem) a obsah okruhů Mechanika, Elektřina a magnetismus
// a Teplo a termika, které nejsou jen veličiny a jednotky (scripts/build-fyzika.mjs).

// Veličiny, jejichž jednotka SI ve Wikidatech nemá český název (kilogram metr za sekundu), nebo které doporučenou jednotku nemají:
// { ID: [jednotka, značka jednotky] }
export const EXTRA_QUANTITIES = {
    Q41273: ['kilogram metr za sekundu', 'kg·m/s'], // hybnost
    Q161254: ['kilogram metr čtvereční za sekundu', 'kg·m²/s'], // moment hybnosti
    Q165618: ['kilogram metr čtvereční', 'kg·m²'], // moment setrvačnosti
    Q179388: ['joule na kelvin', 'J/K'], // tepelná kapacita
    Q487756: ['joule na kilogram a kelvin', 'J/(kg·K)'], // měrná tepelná kapacita
    Q128709: ['pascal sekunda', 'Pa·s'], // viskozita
    Q81809: ['pascal', 'Pa'] // atmosférický tlak
};
// Jednotky teploty, které Wikidata nevedou s veličinou a značkou tak, aby je obecný dotaz našel mezi prvními
export const EXTRA_UNITS = ['Q25267', 'Q42289']; // stupeň Celsia, stupeň Fahrenheita

// Fyzikální konstanty, které třída „fyzikální konstanta“ ve Wikidatech nemá: elementární náboj, permitivita vakua, Hubbleova konstanta,
// atomová hmotnostní konstanta, tíhové zrychlení
export const EXTRA_CONSTANTS = ['Q2101', 'Q6158', 'Q2031181', 'Q4817337', 'Q103982270'];

// Zákony, principy a teorie, jevy a pojmy (kategorie Zákony a jevy)
export const EXTRA_CONCEPTS = [
    // termodynamika a teplo: termodynamické zákony, plynové zákony, skupenské přeměny, šíření tepla
    'Q179380', 'Q177045', 'Q29166', 'Q190983', 'Q175974', 'Q193523', 'Q202151', 'Q220089', 'Q170431', 'Q106080', 'Q41716', 'Q132814', 'Q166583',
    'Q108000', 'Q131800', 'Q185357', 'Q179635', 'Q7465774', 'Q160329', 'Q192593', 'Q172280', 'Q3175122', 'Q724510', 'Q6583695', 'Q918306',
    'Q654136', 'Q106667',
    // mechanika: síly, pohyby, kmitání a vlnění, proudění
    'Q172881', 'Q166530', 'Q200924', 'Q194433', 'Q189452', 'Q190132', 'Q217219', 'Q2945123', 'Q716915', 'Q192735', 'Q223325', 'Q10281355',
    'Q715746', 'Q190070', 'Q170475', 'Q37172', 'Q1132631', 'Q11461', 'Q182767', 'Q62932', 'Q193514', 'Q9210537', 'Q622975', 'Q11412',
    'Q728969',
    // elektřina a magnetismus
    'Q988780', 'Q876377', 'Q177625', 'Q3294789', 'Q201048', 'Q188479', 'Q11456', 'Q124291', 'Q178150', 'Q206907', 'Q124164', 'Q159241',
    'Q207456', 'Q6500960', 'Q11421', 'Q172137', 'Q552456', 'Q208598', 'Q220620', 'Q764228', 'Q192962', 'Q120688', 'Q1061251',
    // optika, kvantová fyzika a teorie
    'Q208391', 'Q188321', 'Q172948', 'Q275411', 'Q274116', 'Q18338', 'Q234881', 'Q238170', 'Q54505', 'Q18359', 'Q739962', 'Q46079',
    'Q217255', 'Q272621', 'Q201321', 'Q578555', 'Q917909', 'Q240581', 'Q221037', 'Q272612', 'Q382037', 'Q193442', 'Q232184', 'Q911473',
    'Q1136644', 'Q899805', 'Q847354', 'Q319903', 'Q11397'
];
// Pojmy, které nejsou jev ani zákon (objekty a abstraktní pojmy)
export const PLAIN_CONCEPTS = new Set(['Q2945123', 'Q716915', 'Q192735', 'Q190070', 'Q172280', 'Q11456', 'Q124291', 'Q178150', 'Q6500960', 'Q11421',
    'Q918306', 'Q177625', 'Q11412']);
// Česká jména tam, kde je název ve Wikidatech méně obvyklý (evaporace – vypařování)
export const NAME_FIXES = { Q132814: 'Vypařování' };

// Částice a kvazičástice: fonon, Cooperův pár, exciton, polaron, virtuální částice, anyon, exotický atom, nuklid
export const EXTRA_PARTICLES = ['Q186608', 'Q620057', 'Q858289', 'Q1074844', 'Q849940', 'Q5528', 'Q1068126', 'Q108149'];

// Přístroje (s fotkou): měřicí přístroje, součástky a stroje, jednoduché stroje, observatoře a velké experimenty
export const EXTRA_INSTRUMENTS = [
    'Q166046', 'Q179741', 'Q179472', 'Q189996', 'Q130962', 'Q333921', 'Q1537374', 'Q1753035', 'Q11658', 'Q72313', 'Q131502', 'Q5322', 'Q5321',
    'Q5325', 'Q11656', 'Q23361', 'Q40164', 'Q48378', 'Q161462', 'Q178185', 'Q131313', 'Q903715', 'Q211786',
    'Q123153', 'Q1347780', 'Q17150947', 'Q191684', 'Q466863', 'Q14310', 'Q1569783', 'Q1827255', 'Q258499', 'Q1569514', 'Q299002', 'Q1702534',
    'Q1431014', 'Q845924', 'Q459352', 'Q10914152', 'Q466895', 'Q79220', 'Q210997', 'Q635105', 'Q59973'
];

// Okruhy podle českého názvu položky (zákony, jevy, pojmy, přístroje a vynálezy; veličiny a jednotky podle jednotky SI)
export const OKRUH_NAMES = {
    mechanika: ['Setrvačnost', 'Tření', 'Vztlak', 'Volný pád', 'Stav beztíže', 'Odstředivá síla', 'Dostředivá síla', 'Coriolisova síla', 'Úniková rychlost',
        'Kruhová rychlost', 'Dynamický vztlak', 'Laminární proudění', 'Turbulentní proudění', 'Rovnice kontinuity', 'Hmotný střed', 'Rovnovážná poloha',
        'Inerciální vztažná soustava', 'Slapová síla', 'Vrh šikmý', 'Pohyb po kružnici', 'Harmonický oscilátor', 'Kmitání', 'Vlnění', 'Mechanické vlnění',
        'Zvuk', 'Ozvěna', 'Rezonance', 'Pružnost', 'Deformace', 'Torricelliho experiment', 'Magnusův jev', 'Gravitace', 'Torricelliho vzorec',
        'Kapilarita', 'Rychlost zvuku', 'Dopplerův jev', 'Newtonovy pohybové zákony', 'Newtonův gravitační zákon', 'Hookeův zákon', 'Bernoulliho rovnice',
        'Archimédův zákon', 'Pascalův zákon', 'Keplerovy zákony', 'Galileiho princip relativity', 'Zákon zachování hybnosti', 'Zákon zachování energie',
        'Zákon akce a reakce', 'Zákon setrvačnosti', 'Klasická mechanika', 'Navierovy–Stokesovy rovnice', "D'Alembertův princip",
        'Kyvadlo', 'Foucaultovo kyvadlo', 'Rázostroj', 'Magdeburské polokoule', 'Hydraulický lis', 'Páka', 'Kladka', 'Nakloněná rovina', 'Gyroskop',
        'Hybnost', 'Moment hybnosti', 'Moment setrvačnosti', 'Viskozita', 'Atmosférický tlak'],
    'elektrina-magnetismus': ['Elektromagnetická indukce', 'Zákon elektromagnetické indukce', 'Lenzův zákon', 'Ohmův zákon', 'Coulombův zákon',
        'Kirchhoffovy zákony', 'Ampérův zákon', 'Biotův-Savartův zákon', 'Gaussův zákon elektrostatiky', 'Gaussův zákon magnetismu', 'Maxwellovy rovnice',
        'Statická elektřina', 'Triboelektrický jev', 'Elektrické pole', 'Magnetické pole', 'Elektromagnetické pole', 'Magnetismus', 'Feromagnetismus',
        'Diamagnetismus', 'Paramagnetismus', 'Supravodivost', 'Polovodič', 'Elektrický vodič', 'Izolátor', 'Zkrat', 'Střídavý proud', 'Stejnosměrný proud',
        'Elektrický proud v plynech', 'Blesk', 'Kulový blesk', 'Eliášův oheň', 'Magnetické pole Země', 'Magnet', 'Lorentzova síla', 'Hallův jev',
        'Piezoelektrický jev', 'Termoelektrický jev', 'Fotoelektrický jev', 'Vířivý proud', 'Meissnerův–Ochsenfeldův jev', 'Josephsonův jev',
        'Magnetická levitace', 'Kvantová elektrodynamika',
        'Ampérmetr', 'Voltmetr', 'Galvanometr', 'Multimetr', 'Elektroskop', 'Magnetometr', 'Crookesova trubice', 'Wimshurstova indukční elektrika',
        'Transformátor', 'Elektromotor', 'Elektrický generátor', 'Kondenzátor', 'Rezistor', 'Cívka', 'Dioda', 'Faradayova klec', 'Leydenská láhev',
        'Voltův sloup', 'Van de Graaffův generátor', 'Teslův transformátor', 'Dynamo', 'Elektromagnet', 'Olověný akumulátor', 'Daniellův článek',
        'Leclancheův článek', 'Tranzistor'],
    teplo: ['Absolutní nula', 'Trojný bod', 'Carnotův cyklus', 'Entropie', 'První termodynamický zákon', 'Druhý termodynamický zákon',
        'Třetí termodynamický zákon', 'Nultý termodynamický zákon', 'Boyleův-Mariottův zákon', 'Charlesův zákon', 'Gay-Lussacův zákon',
        'Daltonův zákon parciálních tlaků', 'Avogadrův zákon', 'Tání', 'Var', 'Vypařování', 'Kapalnění', 'Tuhnutí', 'Sublimace', 'Fázový přechod',
        'Šíření tepla', 'Vedení tepla', 'Proudění tepla', 'Sálání', 'Ideální plyn', 'Tepelná rovnováha', 'Joulův-Thomsonův jev', 'Teplotní roztažnost',
        'Tepelný izolant', 'Leidenfrostův jev', 'Supratekutost', 'Brownův pohyb', 'Difuze', 'Kinetická teorie látek', 'Ekvipartiční teorém',
        'Newtonův ochlazovací zákon', 'Termodynamika', 'Stefanův-Boltzmannův zákon', 'Wienův posunovací zákon', 'Planckův vyzařovací zákon',
        'Boltzmannova konstanta', 'Molární plynová konstanta', 'Planckova teplota',
        'Teploměr', 'Tepelný stroj', 'Tepelné čerpadlo', 'Pyrometr', 'Termoska', 'Stirlingův motor', 'Parní stroj', 'Parní turbína',
        'Tepelná kapacita', 'Měrná tepelná kapacita']
};
// Jednotky teploty a tepla (okruh Teplo a termika)
export const THERMAL_UNITS = /^(kelvin|stupeň celsia|stupeň fahrenheita|stupeň réaumura|kalorie|kilokalorie|britská tepelná jednotka)$/iu;

// Učivo fyziky na základní škole: známé vždy, i když je článek na Wikipedii méně čtený
export const SCHOOL_KNOWN = new Set(['Setrvačnost', 'Tření', 'Vztlak', 'Volný pád', 'Gravitace', 'Zvuk', 'Ozvěna', 'Tání', 'Var', 'Vypařování', 'Tuhnutí',
    'Kapalnění', 'Blesk', 'Magnet', 'Magnetické pole', 'Elektrické pole', 'Páka', 'Kladka', 'Nakloněná rovina', 'Ohmův zákon', 'Archimédův zákon',
    'Pascalův zákon', 'Zákon zachování energie', 'Newtonovy pohybové zákony', 'Elektromagnetická indukce', 'Ampérmetr', 'Voltmetr', 'Teploměr',
    'Transformátor', 'Elektromotor', 'Kondenzátor', 'Rezistor', 'Dioda', 'Polovodič', 'Elektrický vodič', 'Izolátor', 'Střídavý proud', 'Stejnosměrný proud',
    'Absolutní nula', 'Difuze', 'Vlnění', 'Kmitání',
    // české vynálezy ze školy
    'Lodní šroub', 'Ruchadlo', 'Kostkový cukr', 'Kontaktní čočka', 'Polarografie', 'Semtex', 'Kaplanova turbína']);
