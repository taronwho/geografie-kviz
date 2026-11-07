// Ruční tabulky Geologie nad rámec nerostů: geologické útvary a jevy, zkameněliny a další horniny a období.
// Názvy jsou názvy článků české Wikipedie; skript k nim dohledá Wikidata (fotka, popis) a položku bez skutečné fotky vynechá.
// Skupiny a příklady vypsané z geologických příruček (Wikidata je nemají).

// --- Útvary a jevy: název článku → [skupina, příklad nebo typické místo (nesmí obsahovat název útvaru)] ---
export const FORMS = {
    // sopečné
    'Kaldera': ['sopecne', 'Santorini, Yellowstone, Krakatoa'], 'Sopečný kráter': ['sopecne', 'vrchol Vesuvu a Etny'], 'Fumarola': ['sopecne', 'Vulcano, Kamčatka'],
    'Maar': ['sopecne', 'Eifel v Německu, Doupovské hory'], 'Štítová sopka': ['sopecne', 'Mauna Loa na Havaji'], 'Stratovulkán': ['sopecne', 'Fudži, Vesuv, Mayon'],
    'Sopečný dóm': ['sopecne', 'Mount St. Helens, Pelée'], 'Bahenní sopka': ['sopecne', 'Ázerbájdžán, Rumunsko (Berca)'], 'Lahar': ['sopecne', 'Nevado del Ruiz 1985, Pinatubo'],
    'Pyroklastický proud': ['sopecne', 'zánik Pompejí'], 'Sopečná puma': ['sopecne', 'vyvrženiny při explozivních erupcích'], 'Lávový proud': ['sopecne', 'Havaj, Island, Etna'],
    'Gejzír': ['sopecne', 'Island, Yellowstone, Nový Zéland'], 'Horká skvrna': ['sopecne', 'Havaj, Yellowstone, Island'],
    // ledovcové a periglaciální
    'Moréna': ['ledovcove', 'Alpy, Skandinávie'], 'Kar': ['ledovcove', 'Krkonoše, Tatry, Alpy'], 'Esker': ['ledovcove', 'Švédsko, Finsko, Kanada'], 'Drumlin': ['ledovcove', 'Irsko, severní Německo'],
    'Nunatak': ['ledovcove', 'Grónsko, Antarktida'], 'Fjord': ['ledovcove', 'Norsko, Grónsko, Chile'], 'Ledovcové údolí': ['ledovcove', 'Alpy, Tatry, Norsko'],
    'Bludný balvan': ['ledovcove', 'severní Morava a Slezsko, severní Evropa'], 'Serak': ['ledovcove', 'ledopády v Alpách a Himálaji'], 'Pingo': ['ledovcove', 'Sibiř, Aljaška, Kanada'],
    'Permafrost': ['ledovcove', 'Sibiř, Aljaška, Kanada'], 'Ledovcové jezero': ['ledovcove', 'Čertovo a Černé na Šumavě, Tatry'],
    // říční a pobřežní
    'Kaňon': ['vodni', 'Grand Canyon, Tara'], 'Meandr': ['vodni', 'dolní tok Mississippi, Vltava u Českého Krumlova'], 'Říční delta': ['vodni', 'Nil, Mississippi, Volha'],
    'Estuár': ['vodni', 'Temže, Seina, Labe u Hamburku'], 'Laguna': ['vodni', 'Benátky, Marshallovy ostrovy'], 'Korálový útes': ['vodni', 'Velká bariéra u Austrálie, Maledivy'],
    'Tombolo': ['vodni', 'Mont-Saint-Michel, Gibraltar'], 'Údolní niva': ['vodni', 'Polabí, Poodří'], 'Mrtvé rameno': ['vodni', 'Labe, Morava, Dyje'],
    'Soutěska': ['vodni', 'Hřensko, Tara, Vintgar'], 'Atol': ['vodni', 'Maledivy, Bikini'],
    // pouštní a zvětrávání
    'Duna': ['pousteni', 'Sahara, Namib, Gobi'], 'Vádí': ['pousteni', 'Sahara, Arabský poloostrov'], 'Playa': ['pousteni', 'Údolí smrti, Utah'], 'Skalní hřib': ['pousteni', 'Český ráj, Adršpach, Sahara'],
    'Skalní brána': ['pousteni', 'Českosaské Švýcarsko, Arches v USA'],
    // krasové
    'Stalaktit': ['krasove', 'Moravský kras, Postojna'], 'Stalagmit': ['krasove', 'Moravský kras, Postojna'], 'Stalagnát': ['krasove', 'Moravský kras, Postojna'],
    'Závrt': ['krasove', 'Macocha v Moravském krasu'], 'Polje': ['krasove', 'Dinárské hory, Slovinsko'], 'Vyvěračka': ['krasove', 'Moravský kras, Vaucluse ve Francii'],
    // tektonické
    'Zlom': ['tektonicke', 'Kalifornie (San Andreas), Krušné hory'], 'Příkrov': ['tektonicke', 'Alpy, Západní Karpaty'],
    'Subdukce': ['tektonicke', 'Pacifický ohnivý kruh'], 'Rift': ['tektonicke', 'Východoafrický příkop, Bajkal'], 'Kraton': ['tektonicke', 'Kanadský štít, Sibiř'],
    'Hlubokomořský příkop': ['tektonicke', 'Mariánský, Tonžský, Kurilský'], 'Příkop (geologie)': ['tektonicke', 'Hornorýnský, Ohárecký, Východoafrický'], 'Kontinentální šelf': ['tektonicke', 'Severní moře, Jihočínské moře'],
    'Hřbet (geomorfologie)': ['tektonicke', 'Středoatlantský, Východopacifický'],
    // horninová tělesa
    'Batolit': ['magmaticke', 'Sierra Nevada, Středočeský pluton'], 'Lakolit': ['magmaticke', 'Henry Mountains v Utahu'], 'Žíla (geologie)': ['magmaticke', 'rudní a křemenné, Příbramsko a Jáchymov'],
    'Xenolit': ['magmaticke', 'úlomky v čediči a žule'], 'Geoda': ['magmaticke', 'ametystové dutiny z Brazílie a Uruguaye'], 'Konkrece': ['magmaticke', 'vltavíny, pazourkové hlízy, moldavity'],
    // impakty
    'Impaktní kráter': ['impaktni', 'Chicxulub, Ries, Meteor Crater'], 'Impaktit': ['impaktni', 'kráter Ries v Německu'], 'Tektit': ['impaktni', 'vltavíny, libyjské sklo'],
    'Meteorit': ['impaktni', 'Hoba, Příbram 1959, Allende'], 'Chondrit': ['impaktni', 'Allende, Murchison'], 'Pallasit': ['impaktni', 'Brenham, Imilac'],
    // jevy
    'Zemětřesení': ['jevy', 'Lisabon 1755, Tohoku 2011'], 'Tsunami': ['jevy', 'Indický oceán 2004, Japonsko 2011']
};
export const FORM_GROUPS = {
    sopecne: 'vulkanismus', ledovcove: 'zalednění a mrazové jevy', vodni: 'řeky a pobřeží', pousteni: 'poušť a zvětrávání', krasove: 'kras a jeskyně',
    tektonicke: 'tektonika a stavba Země', magmaticke: 'horninová tělesa a útvary', impaktni: 'dopady z vesmíru', jevy: 'přírodní jevy'
};
// Útvary a jevy, které zná i neodborník
export const KNOWN_FORMS = new Set(['Gejzír', 'Fjord', 'Kaňon', 'Duna', 'Kaldera', 'Sopečný kráter', 'Stalaktit', 'Stalagmit', 'Zemětřesení', 'Tsunami', 'Impaktní kráter',
    'Moréna', 'Meteorit', 'Korálový útes', 'Říční delta', 'Laguna', 'Zlom', 'Permafrost', 'Atol', 'Meandr', 'Stratovulkán', 'Subdukce']);

// --- Zkameněliny a vyhynulé organismy bez obratlovců (ty jsou v tématu Biologie): název článku → [skupina, doba, zajímavost] ---
export const FOSSILS = {
    'Trilobiti': ['členovci', 'kambrium až perm', 'nejznámější vedoucí zkamenělina prvohor, tělo se třemi laloky'],
    'Amoniti': ['hlavonožci', 'devon až konec křídy', 'spirálně stočené schránky; vedoucí zkameněliny druhohor'],
    'Belemniti': ['hlavonožci', 'jura a křída', 'zkamenělé vnitřní kostry podobné střelám („čertovy prsty“)'],
    'Graptoliti': ['polostrunatci', 'kambrium až karbon', 'kolonie v podobě pilkovitých stébel; vedoucí zkameněliny siluru'],
    'Kyjonožci': ['členovci', 'ordovik až perm', 'obří „mořští škorpioni“ až dvoumetrové délky'],
    'Ramenonožci': ['bezobratlí s dvouchlopňovou schránkou', 'kambrium až dodnes', 'dvouchlopňové schránky, nejhojnější zkameněliny prvohor'],
    'Lilijice': ['ostnokožci', 'ordovik až dodnes', 'články stonků tvoří „kolečka“ ve vápencích'],
    'Koprolit': ['stopy a ostatky', 'všechny doby', 'zkamenělý trus'],
    'Zkamenělé dřevo': ['stopy a ostatky', 'od devonu', 'strom proměněný křemenem'],
    'Stromatolit': ['stopy a ostatky', 'od archaika dodnes', 'vrstevnaté útvary vytvořené sinicemi; nejstarší stopy života'],
    'Lepidodendron': ['rostliny', 'karbon', 'stromovitá plavuň až 30 m vysoká; hlavní tvůrce černého uhlí'],
    'Archaeopteris': ['rostliny', 'devon', 'jeden z prvních stromů s pravými listy a kmenem'],
    'Kordaity': ['rostliny', 'karbon až perm', 'vysoké stromy s pásovými listy, předchůdci jehličnanů'],
    'Stromatopory': ['houby', 'ordovik až devon', 'vápnité kolonie, tvůrci devonských útesů'],
    'Anomalocaris': ['členovci', 'kambrium', 'největší predátor kambrických moří, až metr dlouhý'],
    'Hallucigenia': ['zvláštní bezobratlí', 'kambrium', 'červovité tělo s hřbetními bodlinami'],
    'Opabinia': ['zvláštní bezobratlí', 'kambrium', 'pět očí a chobot s klepetem'],
    'Wiwaxia': ['zvláštní bezobratlí', 'kambrium', 'tělo pokryté šupinami a bodlinami'],
    'Dickinsonia': ['záhadné organismy', 'ediakara', 'plochý oválný organismus s žebrováním'],
    'Charnia': ['záhadné organismy', 'ediakara', 'přisedlý organismus podobný peří'],
    'Spriggina': ['záhadné organismy', 'ediakara', 'segmentované tělo s „hlavovým štítem“'],
    'Meganeura': ['členovci', 'karbon', 'obří vážkovitý hmyz s rozpětím křídel až 70 cm'],
    'Arthropleura': ['členovci', 'karbon', 'největší suchozemský bezobratlý, až 2,5 m dlouhý'],
    'Pterygotus': ['členovci', 'silur až devon', 'kyjonožec s velkými klepety, až 1,6 m dlouhý'],
    'Jaekelopterus': ['členovci', 'devon', 'největší známý členovec, až 2,5 m dlouhý'],
    'Cooksonia': ['rostliny', 'silur až devon', 'jedna z nejstarších cévnatých rostlin, jen pár centimetrů vysoká'],
    'Prototaxites': ['houby', 'silur až devon', 'až osmimetrový „sloup“ z hub a lišejníků'],
    'Aegirocassis': ['členovci', 'ordovik', 'obří filtrující předchůdce korýšů'],
    'Yunnanozoon': ['raní strunatci', 'kambrium', 'raný příbuzný strunatců z čínské Čcheng-ťiangu'],
    'Cameroceras': ['hlavonožci', 'ordovik', 'rovná schránka dlouhá až 6 m'],
    'Pulmonoscorpius': ['členovci', 'karbon', 'obří štír dlouhý až 70 cm'],
    'Schinderhannes bartelsi': ['členovci', 'devon', 'příbuzný anomalocarise z německých břidlic Hunsrück'],
    'Benetity': ['rostliny', 'trias až křída', 'druhohorní rostliny podobné cykasům'],
    'Kapraďosemenné': ['rostliny', 'devon až křída', 'kapradinovité listy, ale rozmnožování semeny'],
    'Calamitales': ['rostliny', 'karbon až perm', 'stromovité přesličky až 20 m vysoké, tvůrci uhelných slojí']
};
export const KNOWN_FOSSILS = new Set(['Trilobiti', 'Amoniti', 'Belemniti', 'Stromatolit', 'Zkamenělé dřevo', 'Lepidodendron', 'Anomalocaris', 'Graptoliti']);

// --- Další horniny: název → [skupina, složení, vzhled a vznik]; sporná skupina = bez otázky na skupinu ---
export const MORE_ROCKS = {
    'Břidlice': ['sporna', 'jílové minerály, slídy', 'tence vrstevnatá, dobře se štípe na desky'],
    'Tuf': ['sporna', 'zpevněný sopečný popel', 'lehká a pórovitá, vzniká ze sopečného popela'],
    'Ignimbrit': ['sporna', 'zpevněný sopečný popel a pemza', 'vzniká usazením a svařením horkého pyroklastického proudu'],
    'Kimberlit': ['sporna', 'olivín, pyrop, slídy', 'modravě zelená hornina sopečných komínů, nosič diamantů'],
    'Porfyr': ['zilna', 'vyrostlice živců ve sklovité až jemnozrnné základní hmotě', 'vyrostlice větších krystalů v jemnozrnné hornině'],
    'Karbonatit': ['sporna', 'kalcit nebo dolomit', 'vzácná hornina vyvřelého původu z uhličitanů'],
    'Norit': ['hlubinna', 'plagioklas, ortopyroxen', 'tmavá, hrubě zrnitá'],
    'Hornblendit': ['hlubinna', 'amfibol', 'tmavá, hrubě zrnitá'],
    'Tefrit': ['vylevna', 'plagioklas, pyroxen, foidy', 'tmavá, jemnozrnná'],
    'Pikrit': ['vylevna', 'olivín, pyroxen', 'tmavá, olivínem bohatá'],
    'Latit': ['vylevna', 'plagioklas, draselný živec', 'šedá až narůžovělá, jemnozrnná s vyrostlicemi'],
    'Spraš': ['usazena', 'jemný prach křemene a kalcitu', 'žlutohnědý větrem naváty prach z dob ledových'],
    'Evaporit': ['usazena', 'sůl kamenná, sádrovec, sylvín', 'vzniká odpařením mořské nebo jezerní vody'],
    'Jíl': ['usazena', 'jílové minerály', 'jemnozrnný, ve vodě plastický'],
    'Štěrk': ['usazena', 'zaoblená zrna o velikosti 2 až 63 mm', 'nezpevněné říční nebo mořské valouny'],
    'Modrá břidlice': ['premenena', 'glaukofán, lawsonit', 'modrošedá; vzniká při subdukci za vysokého tlaku'],
    'Fosforit': ['usazena', 'fosforečnany vápníku', 'vzniká v mořích, surovina na hnojiva']
};

// --- Další období a věky: [název článku, název, úroveň, nadřazená jednotka, od, do (mil. let), život] ---
export const MORE_PERIODS = [
    ['Paleocén', 'Paleocén', 'epocha', 'Paleogén', 66, 56, 'první velcí savci a ptáci po vymření dinosaurů'],
    ['Eocén', 'Eocén', 'epocha', 'Paleogén', 56, 33.9, 'první kopytníci, velryby a primáti; tropické lesy i v Evropě'],
    ['Oligocén', 'Oligocén', 'epocha', 'Paleogén', 33.9, 23.03, 'ochlazení, ustupují lesy a rozšiřují se trávy'],
    ['Miocén', 'Miocén', 'epocha', 'Neogén', 23.03, 5.333, 'travnaté stepi, lidoopi; vznik Alp a Himálaje'],
    ['Pliocén', 'Pliocén', 'epocha', 'Neogén', 5.333, 2.58, 'australopitékové, první předkové člověka'],
    ['Ediakara', 'Ediakara', 'perioda', 'Proterozoikum', 635, 538.8, 'první velcí mnohobuněční živočichové (dickinsonie)'],
    ['Kryogén', 'Kryogén', 'perioda', 'Proterozoikum', 720, 635, 'globální zalednění, „Země jako sněhová koule“'],
    ['Fanerozoikum', 'Fanerozoikum', 'eon', undefined, 538.8, 0, 'od trilobitů přes dinosaury po člověka: doba bohatého života'],
    ['Berrias', 'Berrias', 'věk', 'Křída', 145, 139.8], ['Valangin', 'Valangin', 'věk', 'Křída', 139.8, 132.6], ['Hauteriv', 'Hauteriv', 'věk', 'Křída', 132.6, 125.77],
    ['Barrem', 'Barrem', 'věk', 'Křída', 125.77, 121.4], ['Alb', 'Alb', 'věk', 'Křída', 113, 100.5], ['Cenoman', 'Cenoman', 'věk', 'Křída', 100.5, 93.9],
    ['Turon', 'Turon', 'věk', 'Křída', 93.9, 89.8], ['Santon', 'Santon', 'věk', 'Křída', 86.3, 83.6], ['Kampán', 'Kampán', 'věk', 'Křída', 83.6, 72.1],
    ['Hettang', 'Hettang', 'věk', 'Jura', 201.4, 199.5], ['Sinemur', 'Sinemur', 'věk', 'Jura', 199.5, 192.9], ['Pliensbach', 'Pliensbach', 'věk', 'Jura', 192.9, 184.2],
    ['Toark', 'Toark', 'věk', 'Jura', 184.2, 174.7], ['Aalen (geologie)', 'Aalen', 'věk', 'Jura', 174.7, 170.9], ['Bajok', 'Bajok', 'věk', 'Jura', 170.9, 168.2],
    ['Kimmeridge', 'Kimmeridge', 'věk', 'Jura', 154.8, 149.2], ['Tithon', 'Tithon', 'věk', 'Jura', 149.2, 145],
    ['Karn', 'Karn', 'věk', 'Trias', 237, 227], ['Nor (stratigrafická jednotka)', 'Nor', 'věk', 'Trias', 227, 205.7]
];

// Dvojice, které by na fotce nebo podle popisu mohly být obě správně (meteorit × chondrit, tuf × ignimbrit); nesejdou se mezi možnostmi
export const MORE_CONFLICTS = [
    ['Stalaktit', 'Stalagmit'], ['Stalaktit', 'Stalagnát'], ['Stalagmit', 'Stalagnát'], ['Meteorit', 'Chondrit'], ['Meteorit', 'Pallasit'], ['Chondrit', 'Pallasit'],
    ['Tektit', 'Impaktit'], ['Sopečný kráter', 'Maar'], ['Gejzír', 'Fumarola'], ['Pingo', 'Permafrost'], ['Fjord', 'Ledovcové údolí'], ['Údolní niva', 'Mrtvé rameno'],
    ['Kaňon', 'Soutěska'], ['Meandr', 'Mrtvé rameno'], ['Říční delta', 'Estuár'], ['Kar', 'Ledovcové údolí'], ['Sopečný dóm', 'Stratovulkán'], ['Lakolit', 'Batolit'],
    ['Kyjonožci', 'Pterygotus'], ['Kyjonožci', 'Jaekelopterus'], ['Pterygotus', 'Jaekelopterus'], ['Lepidodendron', 'Kapraďosemenné'],
    ['Tuf', 'Ignimbrit'], ['Břidlice', 'Modrá břidlice'], ['Břidlice', 'Jíl'], ['Norit', 'Gabro'], ['Porfyr', 'Latit'], ['Pikrit', 'Čedič'], ['Tefrit', 'Čedič'],
    ['Hornblendit', 'Amfibolit'], ['Štěrk', 'Slepenec'], ['Zkamenělé dřevo', 'Lepidodendron']
];
