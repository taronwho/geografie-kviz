// Známá místa pro kontrolu mapy (scripts/audit-mapa.mjs): kde má být na mapě světa voda, jezero a pevnina, která závislá
// území patří ke kterému státu a kde se o území vede spor (místo tam smí uvádět kterýkoli ze států).
// Souřadnice [šířka, délka] jsou obecně známá místa uprostřed moře, jezera nebo pevniny (dost daleko od břehu).

// Moře a zálivy: na mapě nesmí být pevnina (Kaspické moře bylo nakreslené jako pevnina – díra skončila v jiné cestě)
export const WATER = [
    ['Kaspické moře (sever)', 45, 50.5], ['Kaspické moře (střed)', 42, 50.5], ['Kaspické moře (jih)', 38.5, 51.5],
    ['Černé moře', 43.5, 34], ['Azovské moře', 46, 36.5], ['Marmarské moře', 40.7, 28.2],
    ['Baltské moře', 56, 19], ['Botnický záliv', 63, 20], ['Finský záliv', 59.8, 25], ['Rižský záliv', 57.8, 23.5],
    ['Středozemní moře', 35, 18], ['Jaderské moře', 43, 15], ['Egejské moře', 38.5, 25], ['Tyrhénské moře', 40, 12],
    ['Rudé moře', 20, 38.5], ['Perský záliv', 27, 51], ['Adenský záliv', 12.5, 47], ['Arabské moře', 15, 65],
    ['Hudsonův záliv', 60, -86], ['Jamesova zátoka', 53, -80.5], ['Mexický záliv', 25, -90], ['Karibské moře', 15, -75],
    ['Kalifornský záliv', 27, -111.5], ['Záliv svatého Vavřince', 48, -62], ['Baffinův záliv', 73, -67],
    ['Japonské moře', 40, 135], ['Žluté moře', 36, 123], ['Jihočínské moře', 12, 114], ['Bengálský záliv', 15, 88],
    ['Jávské moře', -5, 112], ['Thajský záliv', 10, 101.5], ['Ochotské moře', 55, 150], ['Beringovo moře', 58, -175],
    ['Carpentarský záliv', -14, 139.5], ['Bassův průliv', -39.8, 146], ['Cookův průliv', -41.3, 174.5], ['Tasmanovo moře', -38, 160],
    ['Severní moře', 56, 3], ['Irské moře', 53.7, -4.8], ['Lamanšský průliv', 50.2, -1], ['Biskajský záliv', 45.5, -4],
    ['Bílé moře', 65.5, 38], ['Barentsovo moře', 74, 40], ['Karské moře', 75, 70],
    ['Mosambický průliv', -18, 41], ['Guinejský záliv', 2, 4], ['Río de la Plata', -35.2, -56.5],
    ['Atlantský oceán', 30, -45], ['Tichý oceán', 0, -140], ['Indický oceán', -20, 80], ['Tichý oceán u 180. poledníku', 0, 180],
    ['Severní ledový oceán', 80, 0]
];

// Velká jezera, která na mapě světa musí být nakreslená
export const LAKES = [
    ['Hořejší jezero', 47.7, -87.5], ['Michiganské jezero', 44, -87], ['Huronské jezero', 44.8, -82.4], ['Erijské jezero', 42.2, -81.2],
    ['Ontarijské jezero', 43.7, -77.8], ['Viktoriino jezero', -1, 33], ['Tanganika', -6.5, 29.7], ['Malawi', -12, 34.5],
    ['Bajkal', 53.5, 108], ['Velké Medvědí jezero', 66, -121], ['Velké Otročí jezero', 61.5, -114], ['Winnipežské jezero', 52.5, -97.8],
    ['Athabasca', 59.2, -109.3], ['Sobí jezero', 57.3, -102.3], ['Ladožské jezero', 60.8, 31.5], ['Oněžské jezero', 61.7, 35.5],
    ['Balchaš', 46.3, 74.5], ['Titicaca', -15.8, -69.4], ['Nikaragua', 11.5, -85.4], ['Turkana', 3.5, 36.1], ['Albertovo jezero', 1.7, 31],
    ['Vänern', 58.9, 13.3], ['Vättern', 58.3, 14.6], ['Issyk-kul', 42.4, 77.3], ['Urmijské jezero', 37.7, 45.4], ['Van', 38.6, 42.9],
    ['Kukunor', 36.9, 100.2], ['Aralské jezero (sever)', 46.5, 60.7], ['Aralské jezero (západ)', 45, 58.4],
    ['Velké Solné jezero', 41.2, -112.6], ['Čudské jezero', 58.6, 27.5], ['Tonlesap', 12.8, 104.1], ['Tajmyr', 74.5, 101.5],
    ['Chanka', 45, 132.4], ['Čadské jezero', 13.1, 14.5]
];
// Menší známá jezera pro orientaci (od scripts/build-mapa.mjs: jezera od 450 km² a jezera z položek otázek)
export const SMALL_LAKES = [
    ['Balaton', 46.85, 17.75], ['Ženevské jezero', 46.45, 6.55], ['Bodamské jezero', 47.6, 9.4], ['Gardské jezero', 45.6, 10.65],
    ['Mrtvé moře', 31.5, 35.48], ['Lago Maggiore', 45.95, 8.63], ['Tahoe', 39.1, -120.03], ['Taupo', -38.8, 175.9],
    ['Skadarské jezero', 42.2, 19.3], ['Biwa', 35.25, 136.1], ['Mälaren', 59.5, 17.2], ['Inari', 69, 27.9]
];

// Pevnina: města ve vnitrozemí, středy velkých ostrovů a poloostrovů
export const LAND = [
    ['Praha', 50.08, 14.42], ['Madrid', 40.42, -3.7], ['Dillí', 28.6, 77.2], ['Brasília', -15.8, -47.9], ['Moskva', 55.75, 37.62],
    ['Peking', 39.9, 116.4], ['Káhira', 30.05, 31.25], ['Johannesburg', -26.2, 28.04], ['Ciudad de México', 19.43, -99.13],
    ['Denver', 39.74, -104.99], ['Astana', 51.2, 71.4], ['Teherán', 35.7, 51.4], ['Tbilisi', 41.7, 44.8], ['Ulánbátar', 47.9, 106.9],
    ['Alice Springs', -23.7, 133.9], ['La Paz', -16.5, -68.15], ['Nairobi', -1.29, 36.82], ['Kinshasa', -4.4, 15.4],
    ['Timbuktu', 16.77, -3.0], ['Rijád', 24.7, 46.7], ['Kábul', 34.5, 69.2], ['Lhasa', 29.65, 91.1], ['Novosibirsk', 55, 82.9],
    ['Jakutsk', 62.03, 129.7], ['Winnipeg', 49.9, -97.1], ['Atyrau – sever Kaspiku', 48, 52], ['Ašchabad', 37.95, 58.4],
    ['Grónsko', 72, -40], ['Island', 64.9, -18.5], ['Irsko', 53.4, -7.9], ['Velká Británie', 52.5, -1.5], ['Sicílie', 37.6, 14.1],
    ['Sardinie', 40.1, 9.1], ['Korsika', 42.2, 9.1], ['Kréta', 35.2, 24.9], ['Kypr', 35, 33.1], ['Mallorca', 39.6, 3],
    ['Srí Lanka', 7.5, 80.7], ['Tchaj-wan', 23.7, 121], ['Hokkaidó', 43.4, 142.8], ['Honšú', 36.5, 138.5], ['Luzon', 16.5, 121.2],
    ['Borneo', 1, 114], ['Sumatra', 0, 101.5], ['Jáva', -7.3, 110], ['Nová Guinea', -5.5, 141], ['Tasmánie', -42, 146.5],
    ['Jižní ostrov', -44, 170.5], ['Severní ostrov', -38.7, 176.5], ['Madagaskar', -19, 46.7], ['Kuba', 21.8, -79], ['Hispaniola', 19, -71],
    ['Newfoundland', 48.7, -56], ['Krym', 45.3, 34.3], ['Peloponés', 37.5, 22.3], ['Jutsko', 56, 9.2], ['Sjælland', 55.5, 11.8],
    ['Gotland', 57.5, 18.5], ['Kamčatka', 56, 159.5], ['Sachalin', 50, 143], ['Kalifornský poloostrov', 28, -113.5], ['Florida', 28, -81.5],
    ['Yucatán', 19.5, -89], ['Sinaj', 29.5, 34], ['Arabský poloostrov', 23, 45], ['Korea', 36.5, 128], ['Ohňová země', -54, -68.5],
    ['Špicberky', 78.8, 17], ['Nová země', 74.5, 57], ['Viti Levu (Fidži)', -17.8, 178], ['Čukotka (východně od 180°)', 66.5, -172],
    ['Čukotka (západně od 180°)', 67, 178], ['Havaj', 19.6, -155.5], ['Mangyšlak (východní břeh Kaspiku)', 44, 54]
];

// Česko: krajská města a kraj, do kterého na mapě Česka padnou; řeky a místo, kudy tečou
export const CZECH_CITIES = [
    ['Praha', 50.083, 14.42, 'Praha'], ['Brno', 49.195, 16.608, 'Jihomoravský kraj'], ['Ostrava', 49.835, 18.282, 'Moravskoslezský kraj'],
    ['Plzeň', 49.747, 13.378, 'Plzeňský kraj'], ['Liberec', 50.767, 15.056, 'Liberecký kraj'], ['Olomouc', 49.594, 17.251, 'Olomoucký kraj'],
    ['České Budějovice', 48.975, 14.474, 'Jihočeský kraj'], ['Hradec Králové', 50.209, 15.833, 'Královéhradecký kraj'],
    ['Ústí nad Labem', 50.661, 14.053, 'Ústecký kraj'], ['Pardubice', 50.034, 15.781, 'Pardubický kraj'], ['Zlín', 49.226, 17.667, 'Zlínský kraj'],
    ['Karlovy Vary', 50.231, 12.871, 'Karlovarský kraj'], ['Jihlava', 49.396, 15.591, 'Kraj Vysočina'], ['Kladno', 50.147, 14.103, 'Středočeský kraj']
];
export const CZECH_RIVERS = [
    ['Vltava v Praze', 50.09, 14.41], ['Vltava v Českých Budějovicích', 48.975, 14.47], ['Labe v Ústí nad Labem', 50.66, 14.05],
    ['Labe v Pardubicích', 50.04, 15.78], ['Morava v Olomouci', 49.59, 17.26], ['Odra v Ostravě', 49.85, 18.26],
    ['Ohře v Karlových Varech', 50.23, 12.87], ['Sázava', 49.87, 14.9], ['Dyje ve Znojmě', 48.85, 16.05], ['Dunaj v Bratislavě', 48.14, 17.11]
];

// Závislá a sporná území na mapě (plocha se jménem území) → státy, ke kterým místo na takovém území smí patřit
const UK = 'Spojené království', FR = 'Francie', US = 'Spojené státy americké', AU = 'Austrálie', NL = 'Nizozemsko', DK = 'Dánsko', NZ = 'Nový Zéland', CN = 'Čína';
export const TERRITORY_OF = {
    'Grónsko': [DK], 'Faerské ostrovy': [DK],
    'Portoriko': [US], 'Guam': [US], 'Americká Samoa': [US], 'Severní Mariany': [US], 'Americké Panenské ostrovy': [US],
    'Jižní Georgie a Jižní Sandwichovy ostrovy': [UK], 'Britské indickooceánské území': [UK, 'Mauricius'], 'Svatá Helena': [UK], 'Falklandy': [UK, 'Argentina'],
    'Kajmanské ostrovy': [UK], 'Bermudy': [UK], 'Turks a Caicos': [UK], 'Montserrat': [UK], 'Jersey': [UK], 'Guernsey': [UK], 'Ostrov Man': [UK],
    'Anguilla': [UK], 'Britské Panenské ostrovy': [UK], 'Pitcairnovy ostrovy': [UK],
    'Saint Pierre a Miquelon': [FR], 'Francouzská Polynésie': [FR], 'Nová Kaledonie': [FR], 'Francouzská jižní a antarktická území': [FR],
    'Wallis a Futuna': [FR], 'Svatý Martin': [FR, NL], 'Svatý Bartoloměj': [FR],
    'Aruba': [NL], 'Curaçao': [NL], 'Niue': [NZ], 'Cookovy ostrovy': [NZ],
    'Australská území v Indickém oceánu': [AU], 'Heardův ostrov a McDonaldovy ostrovy': [AU], 'Norfolk': [AU], 'Ashmorův a Cartierův ostrov': [AU],
    'Alandy': ['Finsko'], 'Hongkong': [CN], 'Macao': [CN], 'Tchaj-wan': [CN],
    'Somaliland': ['Somálsko'], 'Severní Kypr': ['Kypr'], 'Stát Palestina': ['Izrael'], 'Izrael': ['Stát Palestina'],
    'Západní Sahara': ['Maroko'], 'Kosovo': ['Srbsko'], 'Siačen': ['Indie', 'Pákistán'], 'Čína': ['Tchaj-wan']
};
// Sporná místa: [šířka od, do, délka od, do] → státy, které tam místo smí uvádět (mapa je kreslí u jednoho z nich)
export const DISPUTED = [
    { name: 'Krym', box: [44.3, 46.3, 32.3, 36.7], states: ['Rusko', 'Ukrajina'] },
    { name: 'Kašmír', box: [32.2, 37.2, 72.5, 80.6], states: ['Indie', 'Pákistán', 'Čína'] },
    { name: 'Golanské výšiny', box: [32.6, 33.4, 35.6, 36], states: ['Izrael', 'Sýrie'] },
    { name: 'Arunáčalpradéš', box: [26.5, 29.6, 91.5, 97.5], states: ['Indie', 'Čína'] },
    { name: 'Abcházie a Jižní Osetie', box: [42, 43.6, 40, 44.6], states: ['Gruzie', 'Rusko'] },
    // Malá území, která mapa 1:50m nekreslí zvlášť (leží v ploše sousedního státu)
    { name: 'Gibraltar', box: [36.1, 36.16, -5.37, -5.33], states: ['Španělsko', 'Spojené království'] },
    { name: 'Ceuta, Melilla a španělské državy v severní Africe', box: [35.1, 35.95, -5.45, -2.3], states: ['Maroko', 'Španělsko'] }
];
// Vnitrozemská moře: díra v pevnině je správně (Kaspické moře je v Natural Earth díra v Eurasii)
export const INLAND_SEAS = [['Kaspické moře', 42, 50.5]];

// Jména států v datech → jméno plochy na mapě, kdyby se lišila (plochy se jmenují podle data/countries.json)
export const AREA_ALIASES = {};
