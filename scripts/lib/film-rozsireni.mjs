// Téma Film, rozšíření: televizní pořady, večerníčky a komiksy s anime (kategorie porady, vecernicky, komiksy).
// Používá build-film.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/film.json (FILM_ONLY=rozsireni) –
// celé sestavení potřebuje návštěvnost české Wikipedie, takže rozšíření jde přidat i bez něj, bez změny ostatních položek.
//
// Kandidáti: ruční seznamy článků české Wikipedie (nejznámější pořady, večerníčky, komiksové postavy a série), členové kategorií
// české Wikipedie (přes službu MWAPI dotazovací služby Wikidat – API Wikipedie samo se nečte) a třídy Wikidat (manga, anime,
// komiksové série, postavy světů Marvel a DC). Známost: české pořady a večerníčky mají jen 1–5 jazykových verzí, proto jsou známé
// jen položky z ručních seznamů (KNOWN); pro experty nejméně známá třetina (u českých pětina) podle počtu jazykových verzí.
//
// Existující položky se nemažou ani nemění id: večerníčky ze seriálů přejdou do kategorie vecernicky, anime seriály do komiksy,
// pořad Top Gear do porady (MOVED); úroveň a okruhy si ponechají.
import { sparql, id, values, imageFields, yearOf, compact, cached, inBatches, sleep } from './wikidata.mjs';
import { landsByDescription } from './nationality.mjs';
import { cachedByKey, knownFloor } from './zemepis-levels.mjs';
import { EXPERT_MAX_SHARE } from './film-levels.mjs';

export const EXTRA_CATEGORIES = ['porady', 'vecernicky', 'komiksy'];

// --- Ruční seznamy (názvy článků české Wikipedie) ---
// Večerníčky, které zná většina (O krtkovi, Pat a Mat… jsou už v datech jako seriály a úroveň si nesou s sebou)
const VECERNICKY_KNOWN = ['O krtkovi', 'Pat a Mat', 'Bob a Bobek – králíci z klobouku', 'Pohádky z mechu a kapradí', 'Maxipes Fík',
    'Pojďte pane, budeme si hrát', 'O loupežníku Rumcajsovi', 'Mach a Šebestová', 'Krkonošské pohádky', 'Rákosníček', 'Říkání o víle Amálce',
    'Káťa a Škubánek', 'O Mikešovi', 'Jája a Pája', 'Bolek a Lolek', 'Kubula a Kuba Kubikula (seriál)', 'O hajném Robátkovi a jelenu Větrníkovi',
    'Méďové', 'Krysáci', 'O makové panence', 'Hugo z hor', 'Bubáci a hastrmani', 'Příběhy včelích medvídků', 'Kosí bratři'];
// Večerníčky, které v kategorii české Wikipedie chybějí (Pat a Mat, Jája a Pája)
const VECERNICKY_MORE = ['Pat a Mat', 'Jája a Pája', 'Mach a Šebestová', 'Bolek a Lolek', 'Calimero', 'Krkonošské pohádky', 'Pohádky o mašinkách (večerníček)'];
// Země zahraničního večerníčku, kterou Wikidata mají chybně
const VECERNICKY_LANDS = { 'Calimero': ['Itálie', 'Japonsko'] };
// Kategorie české Wikipedie s večerníčky (přes MWAPI)
const VECERNICKY_CATEGORIES = ['Kategorie:Večerníčky', 'Kategorie:Černobílé večerníčky', 'Kategorie:České animované večerníčky',
    'Kategorie:České hrané večerníčky', 'Kategorie:České loutkové večerníčky'];
const LOUTKOVE = 'Kategorie:České loutkové večerníčky';
const HRANE = 'Kategorie:České hrané večerníčky';
// Články v kategoriích, které nejsou večerníčky (kniha, znělka, seznam, pořad sám)
const VECERNICKY_NOT = new Set(['Broučci', 'Večerníček', 'Večerníček (postava a znělka)', 'Seznam večerníčků']);
// Autor večerníčku, kterého Wikidata nemají (předloha Václava Čtvrtka, scénář Miloše Macourka) → { by, byk }
const VECERNICKY_AUTHORS = {
    'Pohádky z mechu a kapradí': { by: 'Václav Čtvrtek', byk: 'předloha' },
    'O loupežnickém synku Cipískovi': { by: 'Václav Čtvrtek', byk: 'předloha' },
    'Říkání o víle Amálce': { by: 'Václav Čtvrtek', byk: 'předloha' },
    'Krkonošské pohádky': { by: 'Marie Kubátová', byk: 'scénář' },
    'Mach a Šebestová': { by: 'Miloš Macourek', byk: 'scénář' },
    'O Mikešovi': { by: 'Josef Lada', byk: 'předloha' },
    'Kubula a Kuba Kubikula (seriál)': { by: 'Vladislav Vančura', byk: 'předloha' }
};

// Televizní pořady: nejznámější (české i světové) a další, které v kategoriích české Wikipedie nejsou
const PORADY_KNOWN = ['Chcete být milionářem?', 'Riskuj!', 'AZ-kvíz', 'Kufr (soutěž)', 'Na lovu', 'Pošta pro tebe', 'Výměna manželek', 'Prostřeno!',
    'MasterChef Česko', 'Česko Slovensko má talent', 'Česko hledá SuperStar', 'StarDance …když hvězdy tančí', 'Tvoje tvář má známý hlas', 'VyVolení',
    'Partička', 'Show Jana Krause', 'Všechnopárty', 'Uvolněte se, prosím', 'Na plovárně', 'Události', 'Televizní noviny (TV Nova)', 'Toulavá kamera',
    'Večerníček', 'Kouzelná školka', 'Ano, šéfe!', 'Peče celá země', 'Branky, body, vteřiny', 'Otázky Václava Moravce', 'Česká soda',
    'Top Gear', 'Sezame, otevři se', 'The Muppet Show', 'Monty Pythonův létající cirkus', 'Big Brother', 'Eurovision Song Contest',
    'Klíče od pevnosti Boyard', 'Takešiho hrad'];
const PORADY_MORE = ['Taxík (pořad)', 'Kotel (pořad)', 'Televarieté', 'Možná přijde i kouzelník', 'Šest ran do klobouku', 'Zázraky přírody',
    'Kde domov můj? (soutěž)', 'Studio Kamarád', 'Hogo Fogo', 'Inkognito (český pořad)', 'Robinsonův ostrov', 'Survivor Česko & Slovensko',
    'Love Island Česko & Slovensko', 'Farma (reality show)', 'Reportéři ČT', 'Černé ovce', '168 hodin', 'Na vlastní oči', 'Dobré ráno', 'Sama doma',
    'Rady ptáka Loskutáka', 'Tele Tele', 'Ptákoviny', 'Na stojáka', 'Comedy Club', 'Banánové rybičky', '7 pádů Honzy Dědka', 'Kolo plné hvězd',
    'Pyramida (televizní soutěž)', 'Hřiště 7', 'Rozjezdy pro hvězdy', 'Videostop', 'Abeceda (pořad)', 'Jak byste se zachovali', 'Hell’s Kitchen Česko',
    'Na nože!', 'Jak se staví sen', 'Objektiv (pořad)', 'Babicovy dobroty', 'Zlatá maska', 'Dovolená v Protektorátu', 'Hodina pravdy (soutěž)',
    'Česko Slovenská SuperStar', 'The Voice Česko Slovensko', 'Big Brother (Česko)', 'Hádej, kdo jsem!', 'O poklad Anežky České', 'Hodina zpěvu',
    'Kabaret U dobré pohody', 'Křeslo pro hosta', 'Zajíc v pytli', 'Televizní noviny (Československá televize)', 'Galasuperšou', 'Klip klap',
    'Pionýrská vlaštovka', 'Televizní Silvestr', 'Áčko (pořad)', 'Paškál (pořad)', 'Gilotina (pořad)', 'Trumfy Miroslava Donutila', 'Na kus řeči',
    'Talentmania', 'Milionový pár', 'Zrádci (pořad)', 'Duety… když hvězdy zpívají', 'Superšéf: 24 hodin do pekla a zpět', 'Nikdo není dokonalý (Prima)',
    'Česko Slovenský X Factor', 'Nejchytřejší Čech', 'Věříš si?', 'Míň je víc!', 'Vysoká hra (soutěž)', 'Tajemství těla', 'Pod pokličkou',
    'Saturday Night Live', 'Survivor (reality show)', 'The X Factor', 'Amerika hledá topmodelku', 'Pekelná kuchyně', 'Jackass', 'Faktor strachu',
    'Nutné k přežití', 'Mistři zastavárny', 'The Tonight Show', 'The Ellen DeGeneres Show', 'American Idol', 'Dancing with the Stars', 'Hry bez hranic',
    'Noční show Davida Lettermana', 'Jimmy Kimmel Live!', 'John Oliver: Co týden dal a vzal', 'Kdo přežije', 'The Amazing Race', "RuPaul's Drag Race",
    'Ramsay’s Kitchen Nightmares', 'Ninja faktor', 'Trucky na ledě', 'Válka skladů', 'Pařba v Jersey Shore', 'Larry King Live'];
// Pořad bez stálého moderátora (Saturday Night Live má každý díl jiného hosta; Wikidata uvádějí hlasatele)
const PORADY_NO_HOST = new Set(['Saturday Night Live']);
// Česká verze pořadu, jehož položka ve Wikidatech popisuje zahraniční předlohu (moderátoři a stanice předlohy by byly chybné):
// česká země, stanice a popis; roky vysílání z kategorií článku české Wikipedie
const PORADY_FIX = {
    'Pošta pro tebe': { d: 'český zábavný pořad, který pomáhá lidem znovu se setkat s blízkými', net: ['TV Nova'], ty: 'zábavný pořad' },
    'Prostřeno!': { d: 'český pořad, ve kterém soutěžící pořádají večeři pro ostatní a navzájem se hodnotí', net: ['FTV Prima'], ty: 'soutěžní pořad' },
    'Taxík (pořad)': { d: 'soutěžní pořad České televize, ve kterém taxikář klade cestujícím vědomostní otázky', net: ['Česká televize'], ty: 'soutěžní pořad' }
};
// Kategorie české Wikipedie s českými pořady (soutěže, reality show, talk show, pořady ČST a ČT)
const PORADY_CATEGORIES = ['Kategorie:České reality show', 'Kategorie:České televizní soutěže', 'Kategorie:České televizní talk show',
    'Kategorie:Televizní soutěže České televize', 'Kategorie:Televizní pořady Československé televize'];
// Pořady z kategorií, které hráč nezná nebo nejsou pořadem (anketa, ročníky, rozhlas, internetové pořady)
const PORADY_NOT = /^(Seznam|ANNO|Český slavík|Zlatý slavík)|internetový pořad|\(rozhlas|Miss|Tobogan/u;

// Komiksy a anime: postavy, týmy a série (k = známá)
const KOMIKSY_KNOWN = ['Spider-Man', 'Batman', 'Superman', 'Wonder Woman', 'Hulk (komiks)', 'Iron Man', 'Captain America', 'Thor (komiks)',
    'Joker (postava)', 'Deadpool', 'Thanos', 'Flash (komiks)', 'Aquaman', 'Harley Quinn', 'Robin (komiks)', 'Black Panther (komiks)', 'Venom (komiks)',
    'X-Men', 'Avengers (komiks)', 'Želvy Ninja', 'Mickey Mouse', 'Kačer Donald', 'Strýček Skrblík', 'Pepek námořník', 'Garfield', 'Tintin',
    'Asterix', 'Obelix', 'Lucky Luke', 'Šmoulové', 'Tintinova dobrodružství', 'Čtyřlístek (komiks)', 'Bobík (Čtyřlístek)', 'Fifinka', 'Myšpulín', 'Pinďa', 'Rychlé šípy',
    'Mirek Dušín', 'Ferda Mravenec', 'Pikachu', 'Naruto', 'Dragon Ball', 'One Piece', 'Death Note', 'Sailor Moon', 'Včelka Mája (seriál, 1975)'];
const KOMIKSY_MORE = ['Daredevil', 'Doctor Strange', 'Scarlet Witch', 'Punisher', 'Black Widow (komiks)', 'Hawkeye (komiks)', 'Doctor Doom', 'Green Goblin',
    'Nick Fury', 'Doctor Octopus', 'Blade', 'Kingpin', 'Ant-Man', 'Star-Lord', 'Galactus', 'Lizard (komiks)', 'Vision (komiks)', 'Carol Danvers',
    'Ghost Rider (komiks)', 'Carnage (komiksová postava)', 'Electro (Marvel Comics)', 'Sandman (Marvel Comics)', 'Ms. Marvel', 'Hobgoblin',
    'Scorpion (komiks)', 'Miles Morales', 'Green Lantern', 'Green Arrow', 'Two-Face', 'Poison Ivy (postava)', 'Supergirl', 'Black Canary', 'Swamp Thing',
    'Fantastic Four', 'Liga spravedlnosti', 'Teen Titans', 'Strážci galaxie', 'Sebevražedný oddíl', 'Minnie Mouse', 'Pluto (fiktivní postava)',
    'Kocour Felix', 'Charlie Brown', 'Peanuts', 'Kapitán Haddock', 'Filuta (Tintin)', 'Panoramix', 'Idefix', 'Jolly Jumper',
    'Gargamel', 'Taťka Šmoula', 'Šmoulinka', 'Hellboy', 'Soudce Dredd', 'Gaston (komiks)', 'Calvin a Hobbes', 'Dilbert', 'Thorgal', 'Maus',
    'V jako Vendeta', 'Sandman (Vertigo)', 'Sin City', 'Živí mrtví (komiks)', 'Hellblazer', 'Preacher – Kazatel', 'Liga výjimečných', 'Blacksad',
    'Usagi Yojimbo', 'Titeuf', 'Jarka Metelka', 'Červenáček', 'Rychlonožka', 'Jindra Hojer', 'Bratrstvo kočičí pracky', 'Široko', 'Alois Nebel',
    'Lips Tullian', 'Anča a Pepík', 'Muriel a andělé', 'Svorní gambusíni', 'Otazníky detektiva Štiky', 'Zelený Raoul', 'Rexík (komiks)',
    'Naruto Uzumaki', 'Sasuke Učiha', 'Kakaši Hatake', 'Sakura Haruno', 'Monkey D. Luffy', 'Light Jagami', 'Ash Ketchum',
    'Ičigo Kurosaki', 'Doraemon', 'Útok titánů', 'Zabiják démonů', 'Inuyasha', 'Fullmetal Alchemist', 'Detektiv Conan', 'Hunter × Hunter',
    'My Hero Academia', 'Tokijský ghúl', 'Fairy Tail'];
// Články, které nejsou postavou ani dílem (látka, země, organizace ze světa Marvelu a DC)
// (článek Magneto je o elektrickém stroji, L má jednopísmenné jméno)
const KOMIKSY_NOT = new Set(['Kryptonit', 'Wakanda', 'Adamantium', 'S.H.I.E.L.D.', 'Hydra (komiks)', 'Kameny nekonečna', 'L (Death Note)', 'Magneto']);
// Nejvýš tolik nových položek v kategorii (zahraničních / českých): nejznámější podle ručních seznamů a jazykových verzí, pak
// podle počtu údajů – ať kategorie nemá většinu skoro neznámých položek
const CAPS = { porady: { svet: 40, cz: 85 }, vecernicky: { svet: 8, cz: 68 }, komiksy: { svet: 170, cz: 25 } };
// Postavy a díla, kterým ruční údaje doplní nebo opraví Wikidata (popis bez jména, vydavatel, druh)
//   d = krátký popis bez jména a bez názvu díla; ty = druh; pub = vydavatel; land = země
const KOMIKSY_FIX = {
    'Garfield': { d: 'americký komiksový strip o líném a mlsném kocourovi, který miluje lasagne', ty: 'komiksový strip' },
    'Tintin': { d: 'mladý belgický reportér s rezavou čupřinou, který s bílým foxteriérem cestuje po světě a řeší záhady', land: 'Belgie', by: ['Hergé'] },
    'Obelix': { d: 'silný galský doručovatel menhirů, který jako malý spadl do kotle s kouzelným nápojem', land: 'Francie' },
    'Asterix': { d: 'francouzská komiksová série o malém chytrém Galovi z vesnice, která odolává Římanům', ty: 'komiksová série' },
    'Čtyřlístek (komiks)': { d: 'český dětský komiks o čtyřech kamarádech z Třeskoprsku' },
    'Bobík (Čtyřlístek)': { d: 'silný a nenasytný pašík ze čtyř kamarádů z českého dětského komiksu', land: 'Česko' },
    'Fifinka': { d: 'laskavá a pořádná kočička ze čtyř kamarádů z českého dětského komiksu', land: 'Česko' },
    'Myšpulín': { d: 'vynalézavý pejsek s brýlemi ze čtyř kamarádů z českého dětského komiksu', land: 'Česko' },
    'Pinďa': { d: 'bojácný zajíček ze čtyř kamarádů z českého dětského komiksu', land: 'Česko' },
    'Rychlé šípy': { d: 'chlapecký klub pěti kamarádů z komiksu a knih Jaroslava Foglara', ty: 'komiksový klub', land: 'Česko' },
    'Mirek Dušín': { d: 'vzorný a statečný vůdce chlapeckého klubu z komiksu Jaroslava Foglara', land: 'Česko' },
    'Jarka Metelka': { d: 'člen chlapeckého klubu z komiksu Jaroslava Foglara, zástupce vůdce', land: 'Česko' },
    'Červenáček': { d: 'nejmladší člen chlapeckého klubu z komiksu Jaroslava Foglara, s rudými vlasy', land: 'Česko' },
    'Rychlonožka': { d: 'nejrychlejší běžec chlapeckého klubu z komiksu Jaroslava Foglara', land: 'Česko' },
    'Jindra Hojer': { d: 'člen chlapeckého klubu z komiksu Jaroslava Foglara, nejlepší kreslíř a malíř', land: 'Česko' },
    'Bratrstvo kočičí pracky': { d: 'spolek tří chlapců, nepřátel hlavního klubu z komiksu Jaroslava Foglara', ty: 'komiksový klub', land: 'Česko' },
    'Široko': { d: 'hlavní padouch z komiksu a knih Jaroslava Foglara, vůdce spolku nepřátel', land: 'Česko' },
    'Ferda Mravenec': { d: 'pracovitý hmyzí hrdina s puntíkovaným šátkem z komiksů a knih Ondřeje Sekory', land: 'Česko', ty: 'komiksová postava' },
    'Pikachu': { d: 'žlutý elektrický tvor s červenými tvářemi z japonské série o sbírání a cvičení kapesních příšer', ty: 'postava z anime a mangy', land: 'Japonsko' },
    'Naruto Uzumaki': { d: 'mladý nindža s liščím duchem v těle, který chce být vůdcem své vesnice', land: 'Japonsko' },
    'Sasuke Učiha': { d: 'mladý nindža, poslední z vyhlazeného klanu, který touží po pomstě', land: 'Japonsko' },
    'Kakaši Hatake': { d: 'nindža s maskou přes obličej a zvláštním okem, učitel tří mladých nindžů', land: 'Japonsko' },
    'Sakura Haruno': { d: 'mladá nindža s růžovými vlasy a léčitelskými schopnostmi', land: 'Japonsko' },
    'Monkey D. Luffy': { d: 'pirát v slaměném klobouku s gumovým tělem, který chce být králem pirátů', land: 'Japonsko' },
    'Light Jagami': { d: 'vzorný student, který najde sešit, jímž lze zabít každého, jehož jméno do něj napíše', land: 'Japonsko' },
    'L (Death Note)': { d: 'geniální výstřední detektiv, který sedí s nohama na židli a jí sladkosti', land: 'Japonsko' },
    'Ash Ketchum': { d: 'chlapec z Alabastrie, který chce být nejlepším trenérem kapesních příšer', land: 'Japonsko' },
    'Ičigo Kurosaki': { d: 'středoškolák, který vidí duchy a získá moc boha smrti', land: 'Japonsko' },
    'Včelka Mája (seriál, 1975)': { d: 'japonsko-německý animovaný seriál o zvídavé včelce a jejím kamarádovi trubci Vilíkovi', ty: 'anime seriál' },
    'Dragon Ball': { d: 'japonská manga a anime o chlapci s opičím ocasem, který sbírá sedm kouzelných koulí', ty: 'manga' },
    'Calvin a Hobbes': { ty: 'komiksový strip' },
    'Thanos': { by: ['Jim Starlin'] },
    'Lucky Luke': { d: 'belgická komiksová série o kovbojovi, který střílí rychleji než vlastní stín', ty: 'komiksová série', by: ['Morris'] },
    'Šmoulové': { d: 'malí modří tvorové v bílých čepicích, kteří žijí v houbových domcích v lese', ty: 'komiksové postavy', land: 'Belgie', by: ['Peyo'] },
    'Taťka Šmoula': { ty: 'komiksová postava', land: 'Belgie', by: ['Peyo'] },
    'Šmoulinka': { ty: 'komiksová postava', land: 'Belgie', by: ['Peyo'] },
    'Gargamel': { land: 'Belgie', by: ['Peyo'] },
    'Tintinova dobrodružství': { by: ['Hergé'] },
    'Kapitán Haddock': { land: 'Belgie', by: ['Hergé'] },
    'Filuta (Tintin)': { land: 'Belgie', by: ['Hergé'] },
    'Jolly Jumper': { land: 'Belgie', by: ['Morris'] },
    'Gaston (komiks)': { land: 'Belgie', by: ['André Franquin'] },
    'Panoramix': { land: 'Francie' },
    'Idefix': { land: 'Francie' },
    'Peanuts': { ty: 'komiksový strip', by: ['Charles M. Schulz'] },
    'Charlie Brown': { land: 'Spojené státy americké', by: ['Charles M. Schulz'] },
    'Pepek námořník': { d: 'námořník s dýmkou, kterému snědený špenát dodá obrovskou sílu', land: 'Spojené státy americké', by: ['E. C. Segar'] },
    'Strýček Skrblík': { land: 'Spojené státy americké' },
    'Pluto (fiktivní postava)': { land: 'Spojené státy americké' },
    'Kocour Felix': { land: 'Spojené státy americké' },
    'Hellboy': { land: 'Spojené státy americké' },
    'Soudce Dredd': { land: 'Spojené království' },
    'Svorní gambusíni': { land: 'Česko' },
    'Otazníky detektiva Štiky': { land: 'Česko' },
    'Rexík (komiks)': { land: 'Česko' }
};
// Krátké popisy známých položek, jejichž popis ve Wikidatech je prázdný („komiksová postava“, „reality show“) nebo by prozradil
// odpověď („želví superhrdinové“); bez jména a bez slov z názvu
const DESCRIPTIONS = {
    'Superman': 'mimozemšťan z planety Krypton, který vyrostl na americké farmě a umí létat',
    'Batman': 'miliardář z Gothamu, který po vraždě rodičů bojuje proti zločinu v masce a černém plášti',
    'Spider-Man': 'student z New Yorku, který po kousnutí zvláštním zvířetem získal nadlidské schopnosti a leze po zdech',
    'Wonder Woman': 'amazonská princezna s lasem pravdy a neprůstřelnými náramky',
    'Hulk (komiks)': 'vědec, který se v hněvu mění v obrovského zeleného silného netvora',
    'Iron Man': 'geniální vynálezce a miliardář, který bojuje ve vlastní obrněné zbroji',
    'Thor (komiks)': 'severský bůh hromu s kouzelným kladivem jako komiksový superhrdina',
    'Joker (postava)': 'zločinec s bílou tváří a zelenými vlasy, největší nepřítel superhrdiny z Gothamu',
    'Robin (komiks)': 'mladý pomocník a parťák superhrdiny z Gothamu',
    'Flash (komiks)': 'superhrdina v červeném obleku, nejrychlejší člověk na světě',
    'Aquaman': 'superhrdina, vládce podmořské Atlantidy, který umí mluvit s mořskými živočichy',
    'Thanos': 'mocný mimozemský padouch, který chce s kameny nekonečna vyhladit polovinu vesmíru',
    'Black Panther (komiks)': 'král africké země Wakanda a superhrdina v černém obleku',
    'Deadpool': 'upovídaný žoldák v červeném obleku, kterého nejde zabít a který mluví přímo ke čtenářům',
    'Harley Quinn': 'bývalá psychiatrička, která se zamilovala do šíleného zločince z Gothamu a stala se jeho parťačkou',
    'Venom (komiks)': 'mimozemský tvor, který se spojí s lidským hostitelem a vytvoří černého netvora s obrovskými zuby',
    'X-Men': 'tým mutantů s nadlidskými schopnostmi, který vede profesor na vozíčku',
    'Avengers (komiks)': 'tým nejmocnějších superhrdinů Země, ve kterém je i miliardář v obrněné zbroji a bůh hromu',
    'Želvy Ninja': 'čtyři dospívající zmutovaní plazi, kteří ovládají bojová umění a žijí v kanálech New Yorku',
    'Mickey Mouse': 'veselý myšák v červených kraťasech a bílých rukavicích, maskot nejslavnějšího studia animovaných filmů',
    'Strýček Skrblík': 'nejbohatší kačer na světě, který se rád koupe ve svém trezoru plném zlaťáků',
    'Tintinova dobrodružství': 'belgická komiksová série o mladém reportérovi s bílým foxteriérem',
    'Tintin v zemi Sovětů': 'první album belgické komiksové série o mladém reportérovi s bílým foxteriérem',
    'Naruto': 'japonská manga o mladém nindžovi, který chce být vůdcem své vesnice',
    'One Piece': 'japonská manga o pirátovi s gumovým tělem, který hledá legendární poklad',
    'Death Note': 'japonská manga o studentovi, který najde zápisník, jímž může zabít každého, jehož jméno do něj napíše',
    'Sailor Moon': 'japonská manga o školačce, která se mění v bojovnici za lásku a spravedlnost',
    'Eurovision Song Contest': 'každoroční pěvecká soutěž evropských zemí v přímém televizním přenosu',
    'Monty Pythonův létající cirkus': 'britský komediální pořad šestice komiků s absurdním humorem a kreslenými vstupy',
    'Big Brother': 'reality show, ve které soutěžící žijí v domě pod neustálým dohledem kamer',
    'Takešiho hrad': 'japonská soutěž, ve které soutěžící překonávají bláznivé překážky a padají do vody',
    'Comedy Club': 'česká stand-up show',
    'O poklad Anežky České': 'soutěžní pořad České televize o české historii',
    'Kubula a Kuba Kubikula (seriál)': 'večerníček podle pohádky Vladislava Vančury o malém medvědáři a jeho medvědovi'
};
// Rok prvního výskytu postavy, který Wikidata nemají (komiks, ve kterém se postava poprvé objevila)
const FIRST_YEARS = {
    'Tintin': 1929, 'Filuta (Tintin)': 1929, 'Ferda Mravenec': 1933, 'Rychlé šípy': 1938, 'Mirek Dušín': 1938, 'Jarka Metelka': 1938, 'Červenáček': 1938,
    'Rychlonožka': 1938, 'Jindra Hojer': 1938, 'Robin (komiks)': 1940, 'Green Lantern': 1940, 'Aquaman': 1941, 'Green Arrow': 1941, 'Two-Face': 1942,
    'Jolly Jumper': 1946, 'Black Canary': 1947, 'Panoramix': 1959, 'Supergirl': 1959, 'Sebevražedný oddíl': 1959, 'Ant-Man': 1962,
    'Daredevil': 1964, 'Hawkeye (komiks)': 1964, 'Black Widow (komiks)': 1964, 'Green Goblin': 1964, 'Teen Titans': 1964, 'Scorpion (komiks)': 1965,
    'Black Panther (komiks)': 1966, 'Galactus': 1966, 'Poison Ivy (postava)': 1966, 'Vision (komiks)': 1968, 'Carol Danvers': 1968,
    'Čtyřlístek (komiks)': 1969, 'Bobík (Čtyřlístek)': 1969, 'Fifinka': 1969, 'Myšpulín': 1969, 'Pinďa': 1969, 'Swamp Thing': 1971,
    'Ghost Rider (komiks)': 1972, 'Blade': 1973, 'Hobgoblin': 1983, 'Želvy Ninja': 1984, 'Usagi Yojimbo': 1984, 'Vrána (komiks)': 1989,
    'Deadpool': 1991, 'Carnage (komiksová postava)': 1992, 'Hellboy': 1993, 'Ruróni Kenšin': 1994, 'Pikachu': 1996, 'Monkey D. Luffy': 1997,
    'Ash Ketchum': 1997, 'Naruto Uzumaki': 1999, 'Sasuke Učiha': 1999, 'Sakura Haruno': 1999, 'Kakaši Hatake': 1999, 'Liga výjimečných': 1999,
    'Ičigo Kurosaki': 2001, 'Light Jagami': 2003, 'L (Death Note)': 2003, 'Gintama': 2003, 'Miles Morales': 2011
};
// Fotky, které postavu neukazují nebo na nich je napsané jméno jiné postavy (ověřeno náhledem všech fotek): výloha s hračkami
// (Kačer Donald), vitrína s nápisem (Thor), muzejní místnost (Strýček Skrblík), hlavolam Ježek v kleci (Rychlé šípy), billboard
// s Tintinem (Filuta – fotku má Tintin), plakát s nápisem Spider-Man (Miles Morales)
const NO_PHOTO = new Set(['Q6550', 'Q717588', 'Q11937', 'Q7384808', 'Q1640056', 'Q59826']);

// --- Okruhy rozšíření ---
export const EXTRA_COLLECTIONS = [
    { id: 'ceske-porady', label: 'České televizní pořady', text: 'Soutěže, zábavné pořady a talk show české televize', sort: { by: 'y' } },
    { id: 'souteze-reality-show', label: 'Soutěže a reality show', text: 'Vědomostní, talentové a pěvecké soutěže a reality show', sort: { by: 'y' } },
    { id: 'talk-show', label: 'Talk show a zábavné pořady', sort: { by: 'y' } },
    { id: 'vecernicky-klasika', label: 'Klasické večerníčky', text: 'Večerníčky Československé televize do roku 1989', sort: { by: 'y' } },
    { id: 'marvel', label: 'Marvel', text: 'Postavy a týmy z komiksů Marvel Comics', sort: { by: 'y' } },
    { id: 'dc-comics', label: 'DC Comics', text: 'Postavy a týmy z komiksů DC Comics', sort: { by: 'y' } },
    { id: 'evropsky-komiks', label: 'Evropský komiks', text: 'Asterix, Tintin, Šmoulové a další', sort: { by: 'y' } },
    { id: 'cesky-komiks', label: 'Český komiks', text: 'Čtyřlístek, Rychlé šípy a další', sort: { by: 'y' } },
    { id: 'anime-manga', label: 'Anime a manga', text: 'Japonské komiksy, seriály a jejich postavy', sort: { by: 'y' } }
];

// --- Wikidata ---
const CZ_STATES = new Set(['Q213', 'Q33946']);
const ANIME_SERIES = 'Q63952888';
const MANGA_SERIES = 'Q21198342';
const FEMALE = 'Q6581072';
const MARVEL_UNIVERSE = 'Q2246088';
const DC_UNIVERSE = 'Q1152150';
const MCU = 'Q642878';
const COMICS_CHARACTER = 'Q1114461';
const ANIME_CHARACTERS = ['Q80447738', 'Q87576284'];
const VECERNICEK = 'Q662197';
const TV_PROGRAM = 'Q15416';
const HUMAN = 'Q5';

const titleQuery = (titles) => `SELECT ?t ?x WHERE { VALUES ?t { ${titles.map(title => `"${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@cs`).join(' ')} }
  ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?t . }`;
// Název článku → QID (po dávkách)
const resolveTitles = async (titles) => {
    const result = [];
    for (let i = 0; i < titles.length; i += 60) {
        for (const row of await sparql(titleQuery(titles.slice(i, i + 60)))) result.push([row.t.value, id(row.x.value)]);
        await sleep(1500);
    }
    return result;
};
// Členové kategorie české Wikipedie (MWAPI na query.wikidata.org) → [[název, QID], …]
const categoryMembers = async (category) => (await sparql(`SELECT ?title ?item WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "cs.wikipedia.org" ; wikibase:api "Generator" ; mwapi:generator "categorymembers" ;
    mwapi:gcmtitle "${category}" ; mwapi:gcmtype "page" ; mwapi:gcmlimit "max" .
    ?title wikibase:apiOutput mwapi:title . ?item wikibase:apiOutputItem mwapi:item . } }`)).filter(row => row.item).map(row => [row.title.value, id(row.item.value)]);
// Kategorie článků české Wikipedie (MWAPI): roky vysílání („Televizní pořady vysílané od roku 1992“), stanice a druh pořadu
const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const pageCategories = async (titles) => {
    const result = Object.fromEntries(titles.map(title => [title, []]));
    for (let i = 0; i < titles.length; i += 20) {
        const batch = titles.slice(i, i + 20);
        const rows = await sparql(`SELECT ?title ?cat WHERE { VALUES ?title { ${batch.map(quote).join(' ')} }
          SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "cs.wikipedia.org" ; wikibase:api "Categories" ; mwapi:titles ?title ; mwapi:cllimit "max" .
            ?cat wikibase:apiOutput mwapi:category . } }`);
        for (const row of rows) if (result[row.title.value]) result[row.title.value].push(row.cat.value.replace(/^Kategorie:/u, ''));
        process.stdout.write(`  kategorie ${Math.min(i + 20, titles.length)}/${titles.length}\r`);
        await sleep(2000);
    }
    return result;
};
const CATEGORY_NETS = [['České televize', 'Česká televize'], ['Československé televize', 'Československá televize'], ['TV Nova', 'TV Nova'],
    ['FTV Prima', 'FTV Prima'], ['TV Barrandov', 'TV Barrandov'], ['Televize Seznam', 'Televize Seznam']];
const categoryFacts = (list) => {
    const from = list.map(category => /vysílané od roku (\d{4})/u.exec(category)).filter(Boolean).map(match => Number(match[1])).sort((a, b) => a - b)[0];
    const to = list.map(category => /vysílané do roku (\d{4})/u.exec(category)).filter(Boolean).map(match => Number(match[1])).sort((a, b) => b - a)[0];
    const nets = CATEGORY_NETS.filter(([word]) => list.some(category => category.startsWith(`Televizní pořady ${word}`))).map(([, net]) => net);
    return { from, to, nets, text: list.join(' | ').toLowerCase() };
};
const csArticle = '?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . ?x wikibase:sitelinks ?sl .';
const classQuery = (classes, minSitelinks, extra = '') => `SELECT DISTINCT ?x ?sl WHERE { VALUES ?cls { ${values(classes)} } ?x wdt:P31 ?cls . ${extra} ${csArticle} FILTER(?sl >= ${minSitelinks}) }`;

const SINGLE = { t: 1, n: 1, en: 1, d: 1, sl: 1, sex: 1 };
const DETAIL_PROPS = [['P31', 'type'], ['P136', 'genre'], ['P495', 'co'], ['P580', 'start'], ['P582', 'end'], ['P577', 'date'], ['P571', 'made'],
    ['P170', 'creator'], ['P58', 'writer'], ['P50', 'author'], ['P57', 'dir'], ['P725', 'voice'], ['P161', 'cast'], ['P371', 'host'], ['P449', 'net'],
    ['P1113', 'eps'], ['P2437', 'seasons'], ['P2635', 'parts'], ['P123', 'pub'], ['P1080', 'uni'], ['P4584', 'first'], ['P1477', 'birth'],
    ['P175', 'actor'], ['P272', 'studio'], ['P18', 'im'], ['P13632', 'cos'], ['P2079', 'method'], ['P462', 'color'], ['P1476', 'title'], ['P21', 'sex']];
const detailQuery = (qids) => `SELECT ?item ?p ?v WHERE {
  VALUES ?item { ${values(qids)} }
  { ?a schema:about ?item ; schema:isPartOf <https://cs.wikipedia.org/> ; schema:name ?v . BIND("t" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }
  UNION { ?item rdfs:label ?v FILTER(LANG(?v) = "en") BIND("en" AS ?p) }
  UNION { ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }
  UNION { ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }
  ${DETAIL_PROPS.map(([property, key]) => `UNION { ?item wdt:${property} ?v BIND("${key}" AS ?p) }`).join('\n  ')}
}`;
const collect = (result) => (row) => {
    const entry = result.get(id(row.item.value));
    if (!entry || !row.v) return;
    const key = row.p.value;
    const v = row.v.value.startsWith('http://www.wikidata.org/entity/') ? id(row.v.value) : row.v.value;
    if (SINGLE[key]) { if (!(key in entry)) entry[key] = v; }
    else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
};
const fetchDetails = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 25, detailQuery, collect(result));
    return [...result];
};
// Názvy odkazovaných položek (tvůrci, moderátoři, stanice, žánry) a počet jazykových verzí osob (pořadí herců)
const fetchLabels = async (qids) => {
    const result = new Map(qids.map(qid => [qid, {}]));
    await inBatches(qids, 200, (batch) => `SELECT ?item ?lang ?l ?sl WHERE { VALUES ?item { ${values(batch)} }
      { ?item rdfs:label ?l . BIND(LANG(?l) AS ?lang) FILTER(?lang = "cs" || ?lang = "en" || ?lang = "mul") } UNION { ?item wikibase:sitelinks ?sl } }`,
    (row) => {
        const entry = result.get(id(row.item.value));
        if (row.sl) entry.sl = Number(row.sl.value);
        else if (!entry[row.lang.value]) entry[row.lang.value] = row.l.value;
    });
    return [...result];
};

// --- Pravidla ---
const THIS_YEAR = new Date().getFullYear();
const nameKey = (name) => name.toLocaleLowerCase('cs');
// Název podle článku české Wikipedie bez upřesnění v závorce (Kufr (soutěž) → Kufr, Hulk (komiks) → Hulk): štítek Wikidat bývá
// u pořadu podle zahraniční předlohy (C'è posta per te) nebo v jiném tvaru (Harley Quinnová)
const nameOf = (detail) => {
    const name = (detail.t || detail.n || '').replace(/ \(.*\)$/, '').replace(/\s+/gu, ' ').trim();
    return name.charAt(0).toUpperCase() + name.slice(1);
};
const years = (list) => (list || []).map(yearOf).filter(year => year !== undefined && year >= 1890 && year <= THIS_YEAR).sort((a, b) => a - b);
const maxNumber = (list) => { const numbers = (list || []).map(Number).filter(Number.isFinite); return numbers.length ? Math.max(...numbers) : undefined; };
const isPersonName = (name) => /^\p{Lu}[\p{L}.'’-]+( \p{Lu}?[\p{L}.'’-]+){1,3}$/u.test(name || '') && !/studio|production|television|televize|entertainment|films?$|pictures|comics/iu.test(name || '');
// Rok z popisu („český seriál z roku 1998“), když ho Wikidata nemají
const yearFromText = (text) => { const match = /z roku (\d{4})|z let (\d{4})/u.exec(text || ''); return match ? Number(match[1] || match[2]) : undefined; };
const LATIN = /^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u;

export const buildExtra = async ({ existing }) => {
    // 1. kandidáti
    const vecCategory = new Map();
    for (const category of VECERNICKY_CATEGORIES) {
        for (const [title, qid] of await cached(`film-x-cat-${category.replace(/\W+/gu, '-')}`, () => categoryMembers(category))) {
            if (!VECERNICKY_NOT.has(title)) vecCategory.set(qid, [...(vecCategory.get(qid) || []), category]);
        }
        await sleep(1500);
    }
    const vecWikidata = await cached('film-x-vecernicek-wd', async () => (await sparql(`SELECT DISTINCT ?x WHERE { { ?x wdt:P31 wd:${VECERNICEK} } UNION { ?x wdt:P179 wd:${VECERNICEK} }
      ?a schema:about ?x ; schema:isPartOf <https://cs.wikipedia.org/> . }`)).map(row => id(row.x.value)));
    const porCategory = new Set();
    for (const category of PORADY_CATEGORIES) {
        for (const [title, qid] of await cached(`film-x-cat-${category.replace(/\W+/gu, '-')}`, () => categoryMembers(category))) if (!PORADY_NOT.test(title)) porCategory.add(qid);
        await sleep(1500);
    }
    const handTitles = [...new Set([...VECERNICKY_KNOWN, ...VECERNICKY_MORE, ...Object.keys(VECERNICKY_AUTHORS), ...PORADY_KNOWN, ...PORADY_MORE, ...KOMIKSY_KNOWN, ...KOMIKSY_MORE])];
    // Název článku → QID (článek, který neexistuje, má prázdné QID, ať se na něj příští běh s mezipamětí znovu neptá)
    const resolved = await cachedByKey('film-x-titles', handTitles, async (titles) => ({ ...Object.fromEntries(titles.map(title => [title, ''])), ...Object.fromEntries(await resolveTitles(titles)) }));
    const byTitle = new Map(Object.entries(resolved).filter(([, qid]) => qid));
    const missing = handTitles.filter(title => !byTitle.has(title));
    if (missing.length) console.warn(`  rozšíření: chybí články ${missing.join(', ')}`);
    // Další manga, anime a komiksy z Wikidat (ty méně známé pro úroveň Mudrlant a experty)
    const mangaMore = (await cached('film-x-manga', async () => (await sparql(classQuery([MANGA_SERIES, ANIME_SERIES], 30))).map(row => [id(row.x.value), Number(row.sl.value)])))
        .filter(([, sl]) => sl >= 60).map(([qid]) => qid);
    const comicsMore = (await cached('film-x-comics', async () => (await sparql(classQuery(['Q14406742', 'Q838795', 'Q725377'], 12))).map(row => [id(row.x.value), Number(row.sl.value)])))
        .filter(([, sl]) => sl >= 20).map(([qid]) => qid);
    const heroesMore = await cached('film-x-heroes', async () => (await sparql(`SELECT DISTINCT ?x ?sl WHERE { VALUES ?u { wd:${MARVEL_UNIVERSE} wd:${DC_UNIVERSE} } ?x wdt:P1080 ?u .
      FILTER NOT EXISTS { ?x wdt:P1080 wd:${MCU} } ${csArticle} FILTER(?sl >= 20) }`)).map(row => id(row.x.value)));

    const vecIds = new Set([...vecCategory.keys(), ...vecWikidata, ...[...VECERNICKY_KNOWN, ...VECERNICKY_MORE].map(title => byTitle.get(title)).filter(Boolean)]);
    const handPorady = new Set([...PORADY_KNOWN, ...PORADY_MORE].map(title => byTitle.get(title)).filter(Boolean));
    const porIds = new Set([...porCategory, ...handPorady]);
    const komIds = new Set([...[...KOMIKSY_KNOWN, ...KOMIKSY_MORE].map(title => byTitle.get(title)).filter(Boolean), ...mangaMore, ...comicsMore, ...heroesMore]);
    // Večerníček z kategorie, který je zároveň v jiném seznamu (Calimero je i anime), zůstane večerníčkem
    for (const qid of vecIds) { porIds.delete(qid); komIds.delete(qid); }
    for (const qid of porIds) komIds.delete(qid);
    const allIds = [...new Set([...vecIds, ...porIds, ...komIds])];
    console.log(`Rozšíření – kandidáti: ${vecIds.size} večerníčků, ${porIds.size} pořadů, ${komIds.size} komiksů a anime`);

    // 2. podrobnosti (mezipaměť po QID: s novými kandidáty se stáhnou jen jejich údaje)
    const byKey = async (name, keys, fetchList) => new Map(Object.entries(await cachedByKey(name, keys, async (missing) => Object.fromEntries(await fetchList(missing))))
        .filter(([key]) => keys.includes(key)));
    const details = await byKey('film-x-details', allIds, fetchDetails);
    const refs = new Set();
    const REF_KEYS = ['type', 'genre', 'co', 'creator', 'writer', 'author', 'dir', 'voice', 'cast', 'host', 'net', 'pub', 'uni', 'first', 'actor', 'studio', 'method', 'color'];
    for (const detail of details.values()) for (const key of REF_KEYS) for (const qid of detail[key] || []) if (/^Q\d+$/.test(qid)) refs.add(qid);
    const labels = await byKey('film-x-labels', [...refs], fetchLabels);
    // Rok prvního výskytu postavy (Action Comics #1 → 1938)
    const firsts = [...new Set([...details.values()].flatMap(detail => detail.first || []))];
    const firstYears = await byKey('film-x-first', firsts, async (missing) => {
        const result = new Map(missing.map(qid => [qid, null]));
        await inBatches(missing, 150, (batch) => `SELECT ?item ?d WHERE { VALUES ?item { ${values(batch)} } ?item wdt:P577|wdt:P571|wdt:P580 ?d . }`,
            (row) => { const year = yearOf(row.d.value); const qid = id(row.item.value); if (year !== undefined && (result.get(qid) === null || year < result.get(qid))) result.set(qid, year); });
        return [...result];
    });
    const label = (qid) => { const entry = labels.get(qid) || {}; return entry.cs || entry.mul || entry.en; };
    const labelEn = (qid) => ((labels.get(qid) || {}).en || '').toLowerCase();
    const fame = (qid) => (labels.get(qid) || {}).sl || 0;
    const persons = (list, limit = 3) => [...new Set((list || []).filter(qid => isPersonName(label(qid))))].sort((a, b) => fame(b) - fame(a)).slice(0, limit).map(label);
    const lands = (detail) => landsByDescription(detail.d, [...(detail.co || [])].sort((a, b) => (CZ_STATES.has(b) ? 1 : 0) - (CZ_STATES.has(a) ? 1 : 0)).map(label).filter(Boolean)).slice(0, 2);
    const isCzech = (detail) => (detail.co || []).some(state => CZ_STATES.has(state)) && ((detail.co || []).every(state => CZ_STATES.has(state) || state === 'Q214')
        || /^(česk|českosl)/iu.test((detail.d || '').trim()));
    // Kategorie článků pořadů a večerníčků (roky vysílání a stanice, které Wikidata často nemají)
    const categoryTitles = [...new Set([...vecIds, ...porIds].map(qid => (details.get(qid) || {}).t).filter(Boolean))];
    const pageCats = await cachedByKey('film-x-page-categories', categoryTitles, pageCategories);
    const catsOf = (detail) => categoryFacts(pageCats[detail.t] || []);
    const startEnd = (detail) => {
        const cats = catsOf(detail);
        const start = years([...(detail.start || []), ...(detail.date || []), ...(detail.made || [])])[0] ?? cats.from ?? yearFromText(detail.d);
        const end = years(detail.end).reverse()[0] ?? cats.to;
        return { start, end: start !== undefined && end !== undefined && end > start ? end : undefined };
    };
    const known = new Set([...VECERNICKY_KNOWN, ...PORADY_KNOWN, ...KOMIKSY_KNOWN].map(title => byTitle.get(title)).filter(Boolean));
    const orig = (detail, name) => [detail.en, ...(detail.title || [])].find(title => title && LATIN.test(title) && nameKey(title) !== nameKey(name) && !/\(/.test(title));

    // 3. položky (FILM_DEBUG=1 vypíše vynechané kandidáty s důvodem)
    const items = [];
    const skipped = [];
    const skip = (qid, reason) => { skipped.push([reason, (details.get(qid) || {}).t || qid]); };
    const base = (qid, detail, category) => ({ q: qid, t: detail.t, n: nameOf(detail), d: DESCRIPTIONS[detail.t] || detail.d, c: category, _: { sl: Number(detail.sl) || 0, title: detail.t } });

    // Večerníčky: rok, druh (animovaný, loutkový, hraný), autor, režie, hlasy, rozsah
    for (const qid of vecIds) {
        const detail = details.get(qid);
        if (!detail || !detail.t) continue;
        const { start, end } = startEnd(detail);
        if (start === undefined && !known.has(qid)) { skip(qid, 'večerníček bez roku'); continue; }
        const cats = vecCategory.get(qid) || [];
        const types = (detail.type || []).map(labelEn).join(' | ');
        const puppet = cats.includes(LOUTKOVE) || (detail.method || []).some(qid => /puppet|stop.motion/.test(labelEn(qid)));
        const live = cats.includes(HRANE) || (!/animat/.test(types) && !puppet && /(?<!\p{L})hran/iu.test(detail.d || ''));
        const item = base(qid, detail, 'vecernicky');
        const creators = (detail.creator || []).map(label).filter(isPersonName);
        const writers = (detail.writer || []).map(label).filter(isPersonName);
        const author = VECERNICKY_AUTHORS[detail.t] || (creators.length === 1 ? { by: creators[0], byk: 'tvůrce' } : writers.length === 1 ? { by: writers[0], byk: 'scénář' } : {});
        item.ty = live ? 'hraný seriál' : puppet ? 'loutkový seriál' : 'animovaný seriál';
        item.f = compact({
            year: start, end, dq: start !== undefined ? 1 : undefined,
            land: (VECERNICKY_LANDS[detail.t] || lands(detail)),
            by: author.by, byk: author.byk,
            dir: persons(detail.dir, 2),
            cast: persons([...(detail.voice || []), ...(detail.cast || [])], 3),
            eps: maxNumber(detail.eps), seasons: maxNumber(detail.seasons),
            bw: (detail.color || []).some(qid => /black.and.white/.test(labelEn(qid))) ? 1 : undefined,
            y: start
        });
        if (item.f.by && item.f.dir && item.f.dir.includes(item.f.by) && item.f.dir.length === 1) delete item.f.dir;
        if (isCzech(detail) || /^česk/iu.test(detail.d || '')) item.cz = 1;
        else if (!item.f.land) { skip(qid, 'večerníček bez země'); continue; }
        if (!item.d) item.d = `${item.cz ? 'český ' : ''}${item.ty === 'hraný seriál' ? 'hraný večerníček' : item.ty === 'loutkový seriál' ? 'loutkový večerníček' : 'animovaný večerníček'}`;
        items.push(item);
    }

    // Televizní pořady: druh (soutěž, reality show, talk show, pro děti, zpravodajství), stanice, moderátoři
    const SHOW_KINDS = [['pořad pro děti', /children|preschool|pro dět|dětsk/], ['soutěžní pořad', /game show|quiz|contest|competition|soutěž|kvíz|talent|taneční/],
        ['reality show', /reality/], ['talk show', /talk show|chat show|talkshow/], ['zpravodajský pořad', /news|zpravodaj/],
        ['publicistický pořad', /documentary|magazine|publicist|dokument|investigativ|diskuz|diskus|debat/],
        ['zábavný pořad', /variety|sketch|stand-up|entertainment|zábav|satir|improvizač|humo|comedy show|show/]];
    for (const qid of porIds) {
        const detail = details.get(qid);
        if (!detail || !detail.t || (detail.type || []).includes(HUMAN)) { skip(qid, 'pořad: není článek nebo je to člověk'); continue; }
        const types = (detail.type || []).map(labelEn);
        if (types.some(type => /\bfilm\b|award|ceremony|organization|human|disambiguation|episode/.test(type)) && !types.some(type => /program|show/.test(type))) { skip(qid, `pořad: druh ${types.join('/')}`); continue; }
        const fix = PORADY_FIX[detail.t];
        // Česká verze zahraničního pořadu: roky vysílání jen z kategorií české Wikipedie (Wikidata mají roky předlohy)
        const { start, end } = fix ? { start: catsOf(detail).from, end: catsOf(detail).to } : startEnd(detail);
        if (start === undefined && !known.has(qid)) { skip(qid, 'pořad bez roku'); continue; }
        const cats = catsOf(detail);
        // Druh: nejdřív podle popisu, pak podle druhu a žánru ve Wikidatech, nakonec podle kategorií článku
        const kindOf = (value) => (SHOW_KINDS.find(([, pattern]) => pattern.test(value.toLowerCase())) || [])[0];
        const kind = (fix && fix.ty) || kindOf(detail.d || '') || kindOf([...types, ...(detail.genre || []).map(labelEn)].join(' | ')) || kindOf(cats.text) || 'televizní pořad';
        // Z kategorií jen pořady (seriál bez druhu pořadu, třeba Dva z jednoho města, ne); z ručních seznamů všechno
        if (kind === 'televizní pořad' && !types.some(type => /program|show/.test(type)) && !handPorady.has(qid)) { skip(qid, `pořad: jen seriál (${types.join('/')})`); continue; }
        const item = base(qid, detail, 'porady');
        item.ty = kind;
        if (fix) item.d = fix.d;
        item.f = compact({
            year: start, end, dq: start !== undefined ? 1 : undefined,
            gen: kind !== 'televizní pořad' ? [kind] : undefined,
            land: fix ? ['Česko'] : lands(detail),
            host: fix || PORADY_NO_HOST.has(detail.t) ? undefined : persons(detail.host, 3),
            net: fix ? fix.net : [...new Set([...cats.nets, ...(detail.net || []).map(label).filter(Boolean)])].slice(0, 2),
            eps: maxNumber(detail.eps), seasons: maxNumber(detail.seasons),
            orig: orig(detail, nameOf(detail)),
            y: start
        });
        if (fix || isCzech(detail)) item.cz = 1;
        if (!item.d) item.d = `${item.cz ? 'český ' : ''}${kind}`;
        items.push(item);
    }

    // Komiksy a anime: postava, tým nebo dílo (komiksová série, strip, grafický román, manga, anime seriál)
    const KINDS = [['tým superhrdinů', /superhero team/], ['komiksová postava', /^comics character$/],
        ['postava z anime a mangy', /anime character|manga character/],
        ['komiksová postava', /animated character|film character|television character|fictional (human|character|dog|cat|duck|mouse)|literary character|anthropomorphic/],
        ['anime seriál', /anime television series/], ['manga', /manga series|^manga$/], ['grafický román', /graphic novel/], ['komiksový strip', /comic strip/],
        ['komiksová série', /comic book series|comics series|comic series|limited series|^comics?$|webcomic/]];
    for (const qid of komIds) {
        const detail = details.get(qid);
        if (!detail || !detail.t || KOMIKSY_NOT.has(detail.t)) continue;
        const fix = KOMIKSY_FIX[detail.t] || {};
        const types = (detail.type || []).map(labelEn);
        // Postava světa Marvel nebo DC bez druhu ve Wikidatech (Captain America, Magneto) je komiksová postava
        const kind = fix.ty || (KINDS.find(([, pattern]) => types.some(type => pattern.test(type))) || [])[0] || (!types.length && (detail.uni || []).length ? 'komiksová postava' : undefined);
        if (!kind) { skip(qid, `komiks: druh ${types.join('/')}`); continue; }
        const character = /postava|tým|klub|postavy/.test(kind);
        const { start, end } = startEnd(detail);
        const firstYear = years((detail.first || []).map(first => firstYears.get(first)).filter(Boolean).map(year => `${year}-01-01`))[0];
        // Rok: první výskyt postavy, začátek vydávání díla; bez roku zůstane bez otázky na desetiletí a bez časové osy
        const year = FIRST_YEARS[detail.t] ?? (character ? (firstYear ?? start) : start);
        const universe = (detail.uni || []).includes(MARVEL_UNIVERSE) ? 'Marvel Comics' : (detail.uni || []).includes(DC_UNIVERSE) ? 'DC Comics' : undefined;
        const publisher = fix.pub || universe || label((detail.pub || [])[0]);
        const creators = fix.by || persons([...(detail.creator || []), ...(detail.author || [])], 3);
        const item = base(qid, detail, 'komiksy');
        const name = nameOf(detail);
        item.ty = kind;
        if (fix.d) item.d = fix.d;
        if (detail.sex === FEMALE) item.sx = 'f';
        const birth = (detail.birth || []).find(value => isPersonName(value) && LATIN.test(value) && !value.split(' ').some(word => name.includes(word)));
        item.f = compact({
            year, end: character ? undefined : end, dq: year !== undefined ? 1 : undefined,
            land: fix.land ? [fix.land] : lands(detail).length ? lands(detail) : universe ? ['Spojené státy americké'] : undefined,
            pub: publisher && !/^Q\d+$/.test(publisher) ? publisher : undefined,
            by: creators.length ? creators : undefined,
            real: birth,
            act: character ? persons(detail.actor, 3) : undefined,
            studio: kind === 'anime seriál' ? label((detail.studio || [])[0]) : undefined,
            eps: kind === 'anime seriál' ? maxNumber(detail.eps) : undefined,
            orig: orig(detail, name),
            y: year
        });
        if ((detail.co || []).some(state => CZ_STATES.has(state)) || (fix.land === 'Česko') || /^česk/iu.test(item.d || '')) item.cz = 1;
        // Fotka jen u postavy (obálka, logo nebo plakát díla by prozradily název); kreslený obrázek v SVG ani znak ne
        if (character && !NO_PHOTO.has(qid)) {
            const photo = [...(detail.im || []), ...(detail.cos || [])].find(file => !/logo|cover|poster|plak[aá]t|title|issue|%23|stamp|známka|shield|symbol|\.svg$/iu.test(file));
            Object.assign(item, imageFields(photo));
        }
        if (!item.d) item.d = kind;
        items.push(item);
    }

    // 4. jedna položka na jméno v kategorii (známější), bez položek, které už v datech jsou
    // Dřívější položky rozšíření se sestaví znovu; ostatní položky (i přesunuté) zůstanou, jak jsou
    const kept = existing.filter(item => !isExtraItem(item));
    const existingIds = new Set(kept.map(item => item.q));
    const taken = new Map();
    for (const item of kept) taken.set(`${MOVED_TO.get(item.q) || item.c}|${nameKey(item.n)}`, item.q);
    const richness = (item) => ['by', 'dir', 'cast', 'host', 'net', 'eps', 'year', 'pub', 'act'].filter(key => item.f[key] !== undefined).length;
    items.sort((a, b) => (known.has(b.q) ? 1 : 0) - (known.has(a.q) ? 1 : 0) || b._.sl - a._.sl || richness(b) - richness(a) || (a.f.year || 9999) - (b.f.year || 9999));
    const added = [];
    const counts = {};
    for (const item of items) {
        if (existingIds.has(item.q)) continue;
        const key = `${item.c}|${nameKey(item.n)}`;
        if (taken.has(key)) continue;
        const side = `${item.c}|${item.cz ? 'cz' : 'svet'}`;
        if ((counts[side] || 0) >= CAPS[item.c][item.cz ? 'cz' : 'svet']) { skip(item.q, `nad limit ${side}`); continue; }
        counts[side] = (counts[side] || 0) + 1;
        taken.set(key, item.q);
        added.push(item);
    }
    if (process.env.FILM_DEBUG) for (const [reason, title] of skipped.sort()) console.log(`  vynecháno: ${reason}: ${title}`);
    return { items: added, known, details, labels, vecIds, komIds, porIds };
};

// --- Přesuny existujících položek do nových kategorií (id, úroveň i okruhy zůstanou) ---
// Večerníčky z kategorie Večerníčky české Wikipedie, anime seriály (třída Wikidat) a pořad Top Gear, které byly mezi seriály
export const MOVED = {
    // O krtkovi, Pat a Mat, Bob a Bobek, Pohádky z mechu a kapradí, Štaflík a Špagetka, Maxipes Fík, O loupežníku Rumcajsovi,
    // Pásli ovce Valaši, Pojďte pane, budeme si hrát, Méďové, O loupežnickém synku Cipískovi
    vecernicky: ['Q724491', 'Q590132', 'Q732217', 'Q49379', 'Q3509279', 'Q3562452', 'Q1198417', 'Q12774936', 'Q12046133', 'Q12039210', 'Q5295183'],
    // Neon Genesis Evangelion, Dragon Ball Z, Kovboj Bebop, Pokémon, Serial Experiments Lain, Digimon, Kill la Kill, Angel Beats!,
    // Ergo Proxy, Girls und Panzer
    komiksy: ['Q662', 'Q477916', 'Q101244908', 'Q239937', 'Q858387', 'Q689114', 'Q13637192', 'Q531552', 'Q832098', 'Q28219'],
    // Top Gear
    porady: ['Q33162']
};
// Přesunutá položka, která se stala známou (O loupežníku Rumcajsovi zná skoro každý; mezi seriály podle návštěvnosti nebyl)
const PROMOTED = new Set(['Q1198417']);
const MOVED_TO = new Map(Object.entries(MOVED).flatMap(([category, qids]) => qids.map(qid => [qid, category])));
// Položky rozšíření z dřívějšího běhu (nové kategorie bez přesunutých): ty nový běh sestaví znovu
export const isExtraItem = (item) => EXTRA_CATEGORIES.includes(item.c) && !MOVED_TO.has(item.q);
// Seriály, které by do nových kategorií patřily, ale v MOVED nejsou (výpis k rozhodnutí)
export const moveCandidates = (items, extra) => items.filter(item => item.c === 'serialy' && !MOVED_TO.has(item.q)
    && (extra.vecIds.has(item.q) || extra.komIds.has(item.q) || ((extra.details.get(item.q) || {}).type || []).includes(ANIME_SERIES)));

// --- Úrovně nových položek ---
// Známé jen z ručních seznamů; pro experty nejméně známá třetina zahraničních a pětina českých (podle jazykových verzí)
export const extraLevels = (items, known) => {
    const pools = new Map();
    for (const item of items) {
        item.k = known.has(item.q) ? 1 : 0;
        delete item.x;
        const pool = `${item.c}|${item.cz ? 'cz' : 'svet'}`;
        if (!pools.has(pool)) pools.set(pool, []);
        pools.get(pool).push(item);
    }
    for (const [pool, list] of pools) {
        const share = pool.endsWith('|cz') ? 0.2 : 0.33;
        const rest = list.filter(item => !item.k).sort((a, b) => a._.sl - b._.sl || (b.f.year || 0) - (a.f.year || 0));
        rest.slice(0, Math.round(list.length * share)).forEach(item => { item.x = 1; });
    }
};

// Okruhy nových položek (existující okruhy Český film a Česká animace také)
const groupsOf = (item) => {
    const groups = [];
    const f = item.f || {};
    if (item.cz && item.c !== 'komiksy') groups.push('cesky-film');
    if (item.c === 'vecernicky' && item.cz && item.ty !== 'hraný seriál') groups.push('ceska-animace');
    if (item.c === 'porady') {
        if (item.cz) groups.push('ceske-porady');
        if (item.ty === 'soutěžní pořad' || item.ty === 'reality show') groups.push('souteze-reality-show');
        if (item.ty === 'talk show' || item.ty === 'zábavný pořad') groups.push('talk-show');
    }
    if (item.c === 'vecernicky' && item.cz && f.year < 1990) groups.push('vecernicky-klasika');
    if (item.c === 'komiksy') {
        if (f.pub === 'Marvel Comics') groups.push('marvel');
        if (f.pub === 'DC Comics') groups.push('dc-comics');
        if (item.cz) groups.push('cesky-komiks');
        else if ((f.land || []).some(land => ['Belgie', 'Francie', 'Itálie', 'Spojené království', 'Švýcarsko', 'Španělsko'].includes(land))) groups.push('evropsky-komiks');
        if ((f.land || []).includes('Japonsko') || /anime|manga/.test(item.ty)) groups.push('anime-manga');
    }
    return groups;
};

// Sloučí rozšíření do dat tématu: přesuny (kategorie, druh, okruh), nové položky na konec, okruhy rozšíření na konec seznamu.
// Položky rozšíření z dřívějšího běhu nahradí nové sestavení (stejné id); ty, které nový běh nenašel, zůstanou (žádné id nezmizí)
export const mergeExtra = ({ collections, items }, extra) => {
    const moved = [];
    for (const item of items) {
        const target = MOVED_TO.get(item.q);
        if (!target || item.c !== 'serialy') continue;
        item.c = target;
        if (target === 'komiksy') {
            item.ty = 'anime seriál';
            item.g = [...new Set([...(item.g || []), 'anime-manga'])];
        }
        if (target === 'porady') {
            item.ty = 'zábavný pořad';
            item.g = [...new Set([...(item.g || []), 'talk-show'])];
        }
        if (target === 'vecernicky' && item.cz && item.f.year < 1990) item.g = [...new Set([...(item.g || []), 'vecernicky-klasika'])];
        if (PROMOTED.has(item.q)) { item.k = 1; delete item.x; }
        moved.push(item);
    }
    const missing = Object.values(MOVED).flat().filter(qid => !items.some(item => item.q === qid));
    if (missing.length) console.warn(`  rozšíření: přesouvané položky chybí v datech: ${missing.join(', ')}`);
    const fresh = extra.items;
    extraLevels(fresh, extra.known);
    for (const item of fresh) {
        const groups = groupsOf(item);
        if (groups.length) item.g = groups;
    }
    const freshIds = new Set(fresh.map(item => item.q));
    // Nejvýš 45 % okruhu pro experty (jako u ostatních okruhů tématu): nejznámější z nových expertních položek zůstanou v úrovni Mudrlant
    const all = [...items.filter(item => !(isExtraItem(item) && freshIds.has(item.q))), ...fresh];
    for (const group of new Set(fresh.flatMap(item => item.g || []))) {
        const members = all.filter(item => (item.g || []).includes(group));
        const excess = members.filter(item => item.x).length - Math.floor(members.length * EXPERT_MAX_SHARE);
        const movable = fresh.filter(item => item.x && (item.g || []).includes(group)).sort((a, b) => b._.sl - a._.sl);
        for (const item of movable.slice(0, Math.max(0, excess))) delete item.x;
    }
    for (const item of fresh) delete item._;
    const stale = items.filter(item => isExtraItem(item) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS],
        items: [...items.filter(item => !(isExtraItem(item) && freshIds.has(item.q))), ...fresh],
        moved
    };
};

// Přehled pro výpis: počty a známé v nových kategoriích, okruhy pod spodní hranicí
export const extraSummary = (items) => {
    for (const category of EXTRA_CATEGORIES) {
        const list = items.filter(item => item.c === category);
        const czech = list.filter(item => item.cz);
        console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length}), českých ${czech.length} (známých ${czech.filter(item => item.k === 1).length})`);
    }
    for (const collection of EXTRA_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const knownCount = members.filter(item => item.k === 1).length;
        console.log(`  okruh ${collection.id}: ${members.length} (známých ${knownCount}, expert ${members.filter(item => item.x).length})${knownCount < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}`);
    }
};

