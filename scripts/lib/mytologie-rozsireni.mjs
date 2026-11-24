// Téma Mytologie, rozšíření: nové kategorie Náboženství (nabozenstvi), Světci a světice (svetci) a Záhady a legendy (zahady).
// Používá build-mytologie.mjs: na konci celého sestavení, nebo samostatně nad hotovým data/mytologie.json (MYTOLOGIE_ONLY=rozsireni) –
// ostatní položky se nestahují ani nemění (id, kategorie, úroveň i okruhy zůstanou).
//
// Kandidáti: ruční seznamy podle ID Wikidat (jen s článkem na české Wikipedii). Položky, které už má jiné téma (data/*.json; sv. Václav,
// Anežka Česká, František z Assisi a další světci jsou v Historii, Ka'ba v Zeměpisu, Ájurvéda v Biologii), nebo které už Mytologie má
// (Atlantida, Svatý grál, Golem, archandělé…), se vynechají; stejně tak položky se stejným jménem jako jiná položka tématu.
// Posvátné stavby (kostely, mešity, chrámy) tu nejsou – mají je Architektura a Zeměpis.
// Náboženství se popisují věcně: zakladatel nebo ústřední postava podle obecně přijímaného výkladu, doba a místo vzniku, ke kterému
// náboženství směr, řád či svátek patří.
// Známost: pořadí podle jazykových verzí a návštěvnosti české Wikipedie (lib/fame-levels.mjs) v každé kategorii, ruční výjimky níže.
import { readFileSync, readdirSync } from 'node:fs';
import { qlever, id, values, imageFields, yearOf, compact, cached, inBatches } from './wikidata.mjs';
import { topicPageviews, assignLevels, knownFloor, EXPERT_MAX_SHARE } from './fame-levels.mjs';

export const EXTRA_CATEGORIES = ['nabozenstvi', 'svetci', 'zahady'];

// Náboženství, ke kterým patří směry, řády, svátky, knihy a pojmy (klíč → název pro otázku Ke kterému náboženství patří?)
export const RELIGIONS = {
    krestanstvi: 'křesťanství', islam: 'islám', judaismus: 'judaismus', hinduismus: 'hinduismus', buddhismus: 'buddhismus',
    sikhismus: 'sikhismus', dzinismus: 'džinismus', taoismus: 'taoismus', zoroastrismus: 'zoroastrismus', sintoismus: 'šintoismus', mormonismus: 'mormonismus'
};

// --- Náboženství: [ID, druh, náboženství (klíč RELIGIONS), údaje] ---
// relx = další náboženství, ke kterým pojem patří také (reinkarnace je i v buddhismu) – nebudou nesprávnou možností
// druh: náboženství, směr, řád, svátek, posvátný text, symbol, pojem, duchovní; by = zakladatel (byl = jiný popisek, např. „Ústřední postava“),
// from = doba vzniku (text), land = kde vzniklo, when = kdy se slaví, n = název, al = další názvy, d = popis, kde ho Wikidata nemají
const C = 'krestanstvi';
const NABOZENSTVI = [
    // Světová a další náboženství
    ['Q5043', 'náboženství', null, { byl: 'Ústřední postava', by: 'Ježíš Kristus', from: '1. století', land: 'Judea (Blízký východ)' }],
    ['Q432', 'náboženství', null, { byl: 'Ústřední postava', by: 'prorok Mohamed', from: '7. století', land: 'Arabský poloostrov' }],
    ['Q9268', 'náboženství', null, { byl: 'Ústřední postavy', by: 'Abrahám a Mojžíš', from: 'starověk (2. tisíciletí př. n. l.)', land: 'Blízký východ' }],
    ['Q9089', 'náboženství', null, { byl: 'Zakladatel', by: 'nemá jednoho zakladatele', from: 'starověk', land: 'Indie' }],
    ['Q748', 'náboženství', null, { by: 'Siddhártha Gautama (Buddha)', from: '6.–5. století př. n. l.', land: 'Indie' }],
    ['Q9316', 'náboženství', null, { by: 'Guru Nának', from: '15. století', land: 'Paňdžáb (Indie)' }],
    ['Q9232', 'náboženství', null, { byl: 'Zakladatel (podle tradice)', by: 'Mahávíra', from: '6. století př. n. l.', land: 'Indie' }],
    ['Q812767', 'náboženství', null, { byl: 'Zakladatel', by: 'nemá jednoho zakladatele', from: 'starověk', land: 'Japonsko' }],
    ['Q9598', 'náboženství', null, { byl: 'Zakladatel (podle tradice)', by: 'Lao-c’', from: '4. století př. n. l.', land: 'Čína' }],
    ['Q9581', 'náboženství', null, { by: 'Konfucius', from: '6.–5. století př. n. l.', land: 'Čína', al: ['Konfuciánství'] }],
    ['Q9601', 'náboženství', null, { by: 'Zarathuštra', from: '2.–1. tisíciletí př. n. l.', land: 'Persie (Írán)', al: ['Zarathuštrismus', 'Mazdaismus'] }],
    ['Q22679', 'náboženství', null, { by: 'Bahá’u’lláh', from: '19. století', land: 'Persie (Írán)', n: 'Bahá’í', al: ['Bahaismus', 'Bahai'] }],
    ['Q101462', 'náboženství', null, { from: '30. léta 20. století', land: 'Jamajka', al: ['Rastafari', 'Rastafarianismus'] }],
    ['Q837605', 'náboženství', null, { from: 'starověk', land: 'Střední Asie (turkické a mongolské národy)', al: ['Tengrismus'] }],
    ['Q131165', 'náboženství', null, { by: 'Mani', from: '3. století', land: 'Persie (Írán)' }],
    ['Q219903', 'náboženství', null, { from: '1. století', land: 'Římská říše', d: 'mysterijní náboženství Římské říše, uctívající boha Mithru' }],
    ['Q470364', 'náboženství', null, { by: 'Ngô Văn Chiêu', from: '1926', land: 'Vietnam', d: 'synkretické náboženství spojující buddhismus, taoismus, konfucianismus a křesťanství' }],
    ['Q18670106', 'náboženství', null, { from: 'středověk', land: 'Mezopotámie (dnešní Irák)', al: ['Jezídství'] }],
    ['Q205754', 'náboženství', null, { from: 'pozdní starověk', land: 'Mezopotámie', n: 'Mandejství', d: 'gnostické náboženství, které uctívá Jana Křtitele' }],
    ['Q752660', 'náboženství', null, { from: '19. století', land: 'Brazílie', al: ['Candomblé'] }],
    ['Q927277', 'náboženství', null, { from: '18.–19. století', land: 'Kuba' }],
    ['Q815628', 'náboženství', null, { from: 'starověk', land: 'Tibet', al: ['Bön'] }],
    ['Q59774', 'náboženství', null, { by: 'Gerald Gardner', from: '40. léta 20. století', land: 'Anglie' }],
    ['Q1258217', 'náboženství', null, { from: '20. století', land: 'slovanské země' }],
    ['Q214255', 'náboženství', null, { by: 'Allan Kardec', from: '19. století', land: 'Francie' }],
    ['Q131036', 'náboženství', null, { by: 'L. Ron Hubbard', from: '50. léta 20. století', land: 'USA' }],
    ['Q185802', 'náboženství', null, { by: 'Li Chung-č’', from: '1992', land: 'Čína', n: 'Fa-lun-kung', al: ['Falun Gong', 'Falun Dafa'] }],
    ['Q178671', 'náboženství', null, { by: 'Helena Blavatská', from: '19. století', land: 'USA' }],
    // Směry a církve křesťanství
    ['Q9592', 'směr', C, { from: '1. století', d: 'největší křesťanské společenství, v jehož čele stojí papež', al: ['Katolicismus', 'Katolíci'] }],
    ['Q35032', 'směr', C, { from: '1054 (rozkol s Římem)', al: ['Pravoslaví', 'Ortodoxní církev'] }],
    ['Q23540', 'směr', C, { from: '16. století (reformace)', land: 'Německo', al: ['Protestanté'] }],
    ['Q75809', 'směr', C, { by: 'Martin Luther', from: '16. století', land: 'Německo', al: ['Luteráni', 'Luterství'] }],
    ['Q101849', 'směr', C, { by: 'Jan Kalvín', from: '16. století', land: 'Ženeva (Švýcarsko)', al: ['Kalvinisté'] }],
    ['Q82708', 'směr', C, { byl: 'Odtržení od Říma', by: 'Jindřich VIII.', from: '1534', land: 'Anglie', al: ['Anglikáni', 'Anglikánství'] }],
    ['Q131372', 'směr', C, { byl: 'Vychází z učení', by: 'Jan Hus', from: '15. století', land: 'Čechy', al: ['Husité'] }],
    ['Q97738262', 'směr', C, { from: '1457', land: 'Čechy', d: 'protestantská církev, která vznikla v Čechách v 15. století a navazuje na husitství', al: ['Unitas fratrum', 'Čeští bratři'] }],
    ['Q159318', 'směr', C, { by: 'Mikuláš Ludvík Zinzendorf', from: '1722', land: 'Herrnhut (Sasko)', al: ['Ochranovská jednota', 'Herrnhuti'], d: 'protestantská církev obnovená v 18. století v saském Ochranově potomky českých a moravských exulantů' }],
    ['Q2060869', 'směr', C, { by: 'Karel Farský', from: '1920', land: 'Československo', al: ['Husitská církev', 'CČSH'] }],
    ['Q782911', 'směr', C, { from: '1918', land: 'Československo', al: ['ČCE'] }],
    ['Q35269', 'směr', C, { by: 'Charles Taze Russell', from: '1870', land: 'USA' }],
    ['Q42504', 'směr', null, { christian: true, by: 'Joseph Smith', from: '1830', land: 'USA', al: ['Mormoni', 'Mormonismus', 'Mormonská církev'] }],
    ['Q104319', 'směr', C, { by: 'Ellen G. Whiteová', from: '1863', land: 'USA', al: ['Adventisté'] }],
    ['Q93191', 'směr', C, { by: 'John Smyth', from: '17. století', land: 'Anglie a Nizozemsko', al: ['Baptisté'] }],
    ['Q33203', 'směr', C, { by: 'John Wesley', from: '18. století', land: 'Anglie', al: ['Metodisté'], d: 'protestantský směr křesťanství, který vznikl v Anglii v 18. století' }],
    ['Q483978', 'směr', C, { from: '1901', land: 'USA', al: ['Letničníci', 'Pentekostalismus'] }],
    ['Q170208', 'směr', C, { by: 'George Fox', from: '17. století', land: 'Anglie', al: ['Společnost přátel', 'Kvakerství'] }],
    ['Q104444', 'směr', C, { by: 'Jakob Ammann', from: '1693', land: 'Švýcarsko', d: 'křesťanská společenství žijící v USA a Kanadě tradičním způsobem života bez moderní techniky' }],
    ['Q110223', 'směr', C, { by: 'Menno Simons', from: '16. století', land: 'Nizozemsko', al: ['Menonité'] }],
    ['Q165580', 'směr', C, { from: '16. století', land: 'Švýcarsko', al: ['Anabaptisté', 'Novokřtěnci'] }],
    ['Q178169', 'směr', C, { from: '16. století', land: 'Skotsko', al: ['Presbyteriánství'] }],
    ['Q5169816', 'směr', C, { from: '19. století', land: 'Německo, Švýcarsko a Nizozemsko', al: ['Starokatolíci'] }],
    ['Q49376', 'směr', C, { al: ['Řeckokatolická církev', 'Řeckokatolíci', 'Uniaté'] }],
    ['Q198998', 'směr', C, { from: '1. století', land: 'Egypt', al: ['Koptská církev'] }],
    ['Q179829', 'směr', C, { from: '4. století', land: 'Etiopie' }],
    ['Q683724', 'směr', C, { from: '301', land: 'Arménie' }],
    ['Q60995', 'směr', C, { from: '988 (křest Rusi)', land: 'Kyjevská Rus' }],
    ['Q223710', 'směr', C, { byl: 'Vůdčí osobnost', by: 'protopop Avvakum', from: '17. století', land: 'Rusko' }],
    ['Q161696', 'směr', C, { from: '12. století', land: 'jižní Francie', al: ['Albigenští', 'Katarství'] }],
    ['Q201620', 'směr', C, { by: 'Petr Valdés', from: '12. století', land: 'Lyon (Francie)' }],
    ['Q137073', 'směr', C, { from: '16. století', land: 'Anglie', al: ['Puritánství'] }],
    ['Q106687', 'směr', C, { from: '16. století', land: 'Polsko a Sedmihradsko', al: ['Unitáři'] }],
    ['Q188307', 'směr', C, { by: 'William Booth', from: '1865', land: 'Londýn' }],
    ['Q624477', 'směr', C, { by: 'Mary Baker Eddyová', from: '1879', land: 'USA' }],
    ['Q48420', 'směr', C, { from: '1.–2. století', land: 'Středomoří', al: ['Gnóze', 'Gnostici'] }],
    // Směry islámu
    ['Q483654', 'směr', 'islam', { from: '7. století', al: ['Sunnité', 'Sunna'] }],
    ['Q9585', 'směr', 'islam', { from: '7. století', al: ['Šíité', 'Šíitský islám', 'Ší’a'], n: 'Ší’itský islám' }],
    ['Q9603', 'směr', 'islam', { al: ['Súfí', 'Súfijové'] }],
    ['Q171764', 'směr', 'islam', { by: 'Mírzá Ghulám Ahmad', from: '1889', land: 'Paňdžáb (Indie)', al: ['Ahmadíjové'] }],
    ['Q163140', 'směr', 'islam', { by: 'Muhammad ibn Abd al-Wahháb', from: '18. století', land: 'Arabský poloostrov', al: ['Wahhábisté'] }],
    ['Q191057', 'směr', 'islam', { from: '19. století', al: ['Salafismus', 'Salafisté'] }],
    ['Q189570', 'směr', 'islam', { from: '7. století', al: ['Cháridžovci', 'Cháridžité'] }],
    ['Q230386', 'směr', 'islam', { from: '8. století', al: ['Ismá’ílité'] }],
    ['Q269785', 'směr', 'islam', { from: '9. století', al: ['Dvanáctníci', 'Imámité'] }],
    ['Q144333', 'směr', 'islam', { from: '8. století', land: 'Jemen', al: ['Zajdovci'] }],
    ['Q137097', 'směr', 'islam', { land: 'Turecko', al: ['Alevismus'] }],
    // Směry buddhismu
    ['Q132265', 'směr', 'buddhismus', { land: 'Srí Lanka a jihovýchodní Asie', al: ['Theravada', 'Hínajána'] }],
    ['Q48362', 'směr', 'buddhismus', { land: 'Indie, rozšířená ve východní Asii', al: ['Mahayana'] }],
    ['Q7953', 'směr', 'buddhismus', { land: 'Čína (čchan) a Japonsko', al: ['Zen-buddhismus', 'Čchan'] }],
    ['Q172175', 'směr', 'buddhismus', { land: 'Indie a Tibet', al: ['Vajrayana', 'Tantrický buddhismus'] }],
    ['Q483889', 'směr', 'buddhismus', { from: '7.–8. století', land: 'Tibet', al: ['Lamaismus'] }],
    ['Q871371', 'směr', 'buddhismus', { by: 'Ničiren', from: '13. století', land: 'Japonsko', al: ['Ničirenův buddhismus'] }],
    // Směry hinduismu
    ['Q45584', 'směr', 'hinduismus', { al: ['Vaišnavismus', 'Višnuisté'] }],
    ['Q234953', 'směr', 'hinduismus', { al: ['Šaivismus', 'Šivaisté'] }],
    ['Q849345', 'směr', 'hinduismus', { al: ['Šakta'] }],
    // Směry judaismu
    ['Q171201', 'směr', 'judaismus', { by: 'Baal Šem Tov', from: '18. století', land: 'Podolí (Ukrajina)', al: ['Chasidé'] }],
    ['Q80970', 'směr', 'judaismus', { from: '19. století', land: 'střední Evropa', d: 'směr judaismu, který zachovává tradiční výklad Tóry a náboženského práva' }],
    ['Q1133485', 'směr', 'judaismus', { from: '19. století', land: 'Německo', d: 'liberální směr judaismu, který přizpůsobuje tradici modernímu životu', al: ['Liberální judaismus'] }],
    ['Q205644', 'směr', 'judaismus', { from: '19. století', land: 'Německo a USA', d: 'směr judaismu mezi ortodoxním a reformním' }],
    ['Q123006', 'směr', 'judaismus', { from: '12.–13. století', land: 'Provence a Španělsko', al: ['Kabbala'] }],
    // Řády
    ['Q36380', 'řád', C, { by: 'Ignác z Loyoly', from: '1540', n: 'Jezuité', al: ['Tovaryšstvo Ježíšovo', 'Jezuitský řád'] }],
    ['Q131132', 'řád', C, { by: 'Benedikt z Nursie', from: '6. století', n: 'Benediktini', al: ['Řád svatého Benedikta', 'Benediktinský řád'] }],
    ['Q131479', 'řád', C, { by: 'Dominik Guzmán', from: '1216', n: 'Dominikáni', al: ['Řád bratří kazatelů', 'Dominikánský řád'] }],
    ['Q165005', 'řád', C, { by: 'František z Assisi', from: '1209', n: 'Františkáni', al: ['Františkánský řád', 'Řád menších bratří', 'Minorité'] }],
    ['Q124862', 'řád', C, { by: 'Matteo da Bascio', from: '1528', n: 'Kapucíni', al: ['Řád menších bratří kapucínů'] }],
    ['Q166861', 'řád', C, { byl: 'Zakladatelé', by: 'Robert z Molesme a jeho druhové', from: '1098', land: 'Cîteaux (Francie)', n: 'Cisterciáci', al: ['Cisterciácký řád'] }],
    ['Q339332', 'řád', C, { by: 'Norbert z Xantenu', from: '1120', land: 'Prémontré (Francie)', n: 'Premonstráti', al: ['Premonstrátský řád'] }],
    ['Q220979', 'řád', C, { by: 'Bruno z Kolína', from: '1084', land: 'Francie', n: 'Kartuziáni', al: ['Kartuziánský řád'] }],
    ['Q186277', 'řád', C, { from: '12. století', land: 'hora Karmel (Svatá země)', n: 'Karmelitáni', al: ['Řád karmelitánů'] }],
    ['Q273894', 'řád', C, { by: 'Josef Kalasanský', from: '1617', land: 'Řím', n: 'Piaristé', al: ['Řád zbožných škol', 'Piaristický řád'] }],
    ['Q223659', 'řád', C, { by: 'Jan Bosco', from: '1859', land: 'Turín', n: 'Salesiáni', al: ['Salesiáni Dona Boska', 'Saleziáni'] }],
    ['Q2250880', 'řád', C, { by: 'Anděla Mericiová', from: '1535', land: 'Brescia (Itálie)', n: 'Voršilky', al: ['Řád svaté Voršily', 'Uršulinky'] }],
    ['Q733658', 'řád', C, { byl: 'Zakladatelka', by: 'Klára z Assisi', from: '1212', n: 'Klarisky', al: ['Chudé sestry svaté Kláry'] }],
    ['Q29075', 'řád', C, { from: '1244', n: 'Augustiniáni', al: ['Řád svatého Augustina'] }],
    ['Q41300', 'řád', C, { by: 'Hugo z Payns', from: '1119', land: 'Jeruzalém', n: 'Templáři', al: ['Řád templářů', 'Templářský řád'] }],
    ['Q187549', 'řád', C, { from: '11. století', land: 'Jeruzalém', n: 'Maltézský řád', al: ['Johanité', 'Řád johanitů', 'Maltézští rytíři'] }],
    ['Q48189', 'řád', C, { from: '1190', land: 'Akko (Svatá země)', al: ['Němečtí rytíři', 'Teutonský řád', 'Německý řád'] }],
    ['Q1788299', 'řád', C, { byl: 'Zakladatelka', by: 'Anežka Česká', from: '1233', land: 'Praha', n: 'Křižovníci s červenou hvězdou', al: ['Rytířský řád křižovníků s červenou hvězdou'] }],
    ['Q160918', 'řád', C, { by: 'Josemaría Escrivá', from: '1928', land: 'Madrid', d: 'instituce katolické církve sdružující kněze a laiky' }],
    // Svátky a doby v roce
    ['Q19809', 'svátek', C, { when: '25. prosince (Boží hod), slaví se od Štědrého dne' }],
    ['Q21196', 'svátek', C, { when: 'neděle po prvním jarním úplňku' }],
    ['Q39864', 'svátek', C, { when: '50. den po Velikonocích', d: 'křesťanská slavnost na památku příchodu Ducha na apoštoly', al: ['Seslání Ducha svatého', 'Svatodušní svátky'] }],
    ['Q123542', 'svátek', C, { when: '46 dní před Velikonocemi' }],
    ['Q132001', 'svátek', C, { when: '6. ledna', n: 'Svátek Tří králů', al: ['Tři králové', 'Zjevení Páně', 'Epifanie'] }],
    ['Q587', 'svátek', C, { when: '1. listopadu', al: ['Všech svatých'] }],
    ['Q1033140', 'svátek', C, { when: '2. listopadu', al: ['Památka zesnulých'] }],
    ['Q18647897', 'svátek', C, { when: '2. února', al: ['Uvedení Páně do chrámu'], n: 'Hromnice' }],
    ['Q40317', 'svátek', C, { when: 'pátek před Velikonocemi' }],
    ['Q106333', 'svátek', C, { when: 'čtvrtek před Velikonocemi' }],
    ['Q42236', 'svátek', C, { when: 'neděle před Velikonocemi' }],
    ['Q83012', 'období', C, { when: 'čtyři neděle před Vánoci' }],
    ['Q82866', 'období', C, { when: '40 dní před Velikonocemi', al: ['Půst', 'Velký půst'] }],
    ['Q51638', 'svátek', C, { when: '40. den po Velikonocích', n: 'Nanebevstoupení Páně' }],
    ['Q152395', 'svátek', C, { when: 'čtvrtek po slavnosti Nejsvětější Trojice', al: ['Boží Tělo'] }],
    ['Q162691', 'svátek', C, { when: '15. srpna' }],
    ['Q41662', 'období', 'islam', { when: 'devátý měsíc islámského kalendáře' }],
    ['Q464458', 'svátek', 'islam', { when: 'na konci ramadánu', al: ['Íd al-fitr', 'Ramadánský bajrám'] }],
    ['Q514400', 'svátek', 'islam', { when: '10. den měsíce zu-l-hidždža', al: ['Íd al-adhá', 'Kurban bajram'] }],
    ['Q193027', 'svátek', 'islam', { when: '12. den měsíce rabí al-avval', al: ['Mavlid', 'Narozeniny Proroka'] }],
    ['Q183283', 'svátek', 'islam', { when: '10. den měsíce muharram', n: 'Den Ášúrá', d: 'muslimský svátek, u šíitů den smutku za imáma Husajna' }],
    ['Q130881', 'svátek', 'judaismus', { when: '25. den měsíce kislev (prosinec), osm dní', al: ['Svátek světel'] }],
    ['Q121393', 'svátek', 'judaismus', { when: '15. den měsíce nisan (březen až duben)', al: ['Pascha', 'Pesach'] }],
    ['Q132994', 'svátek', 'judaismus', { when: '10. den měsíce tišri (září až říjen)', al: ['Den smíření'] }],
    ['Q131028', 'svátek', 'judaismus', { when: '1. a 2. den měsíce tišri (září až říjen)', al: ['Židovský Nový rok'] }],
    ['Q180115', 'svátek', 'judaismus', { when: '14. den měsíce adar (únor až březen)' }],
    ['Q201196', 'svátek', 'judaismus', { when: '50. den od Pesachu', n: 'Šavuot', al: ['Šavu’ot', 'Svátek týdnů'] }],
    ['Q182242', 'svátek', 'judaismus', { when: '15. den měsíce tišri (září až říjen), sedm dní', al: ['Svátek stánků'] }],
    ['Q102477', 'svátek', 'judaismus', { relx: ['krestanstvi'], when: 'každý týden od pátečního večera do soboty večer', al: ['Sabat'] }],
    ['Q10244', 'svátek', 'hinduismus', { when: 'říjen až listopad', al: ['Dípávalí', 'Svátek světel'] }],
    ['Q10259', 'svátek', 'hinduismus', { when: 'březnový úplněk', al: ['Holi', 'Svátek barev'] }],
    ['Q215700', 'svátek', 'buddhismus', { when: 'květnový úplněk', al: ['Buddha Púrnima', 'Vesakh'] }],
    // Posvátné texty
    ['Q1845', 'posvátný text', C, { relx: ['judaismus'], al: ['Písmo svaté'], d: 'sbírka posvátných textů judaismu a křesťanství' }],
    ['Q428', 'posvátný text', 'islam', { al: ['Kurán', 'Korán'] }],
    ['Q34990', 'posvátný text', 'judaismus', { al: ['Pět knih Mojžíšových', 'Pentateuch'] }],
    ['Q43290', 'posvátný text', 'judaismus', {}],
    ['Q39950', 'posvátný text', 'hinduismus', { al: ['Véda'] }],
    ['Q46802', 'posvátný text', 'hinduismus', { al: ['Bhagavad Gíta', 'Gíta'] }],
    ['Q6113985', 'posvátný text', 'hinduismus', {}],
    ['Q203249', 'posvátný text', 'sikhismus', { al: ['Ádi Granth'] }],
    ['Q83426', 'posvátný text', 'zoroastrismus', {}],
    ['Q459842', 'posvátný text', 'mormonismus', {}],
    ['Q134425', 'posvátný text', 'taoismus', { al: ['Tao te ching', 'Kniha o Tao a ctnosti'] }],
    ['Q1321432', 'posvátný text', 'buddhismus', { al: ['Tripitaka', 'Pálijský kánon'] }],
    // Symboly
    ['Q40843', 'symbol', C, { d: 'symbol křesťanství, připomínka ukřižování Ježíše' }],
    ['Q161396', 'symbol', 'judaismus', { al: ['Magen David'] }],
    ['Q5488888', 'symbol', 'islam', { n: 'Půlměsíc', d: 'symbol měsíce, který se stal symbolem islámu' }],
    ['Q184128', 'symbol', 'hinduismus', { relx: ['buddhismus', 'dzinismus', 'sikhismus'], al: ['Aum', 'Óm'] }],
    ['Q62744', 'symbol', 'taoismus', { al: ['Jin-jang'] }],
    ['Q665056', 'symbol', 'buddhismus', { relx: ['hinduismus', 'dzinismus'], al: ['Kolo dharmy', 'Kolo zákona'] }],
    ['Q170476', 'symbol', 'judaismus', { d: 'sedmiramenný svícen, jeden ze symbolů judaismu' }],
    ['Q211751', 'symbol', C, { al: ['Ichtys', 'Rybka'] }],
    ['Q132539', 'pojem', C, { d: 'katolická modlitba a šňůra korálků, na které se odříkává' }],
    // Pojmy a obřady
    ['Q42927', 'pojem', 'buddhismus', { relx: ['hinduismus', 'dzinismus'], al: ['Nirvána'] }],
    ['Q128593', 'pojem', 'hinduismus', { relx: ['buddhismus', 'dzinismus', 'sikhismus'], al: ['Převtělování', 'Převtělení'] }],
    ['Q134293', 'pojem', 'hinduismus', { relx: ['buddhismus', 'dzinismus', 'sikhismus'],}],
    ['Q183379', 'pojem', 'hinduismus', { relx: ['buddhismus', 'dzinismus', 'sikhismus'], al: ['Mukti'] }],
    ['Q584580', 'pojem', 'buddhismus', {}],
    ['Q234915', 'pojem', 'islam', { al: ['Hadž', 'Pouť do Mekky'] }],
    ['Q176770', 'pojem', 'islam', {}],
    ['Q34623', 'pojem', 'judaismus', { relx: ['krestanstvi'], al: ['Deset přikázání', 'Dekalog'] }],
    ['Q66086', 'pojem', C, { al: ['Svaté přijímání', 'Večeře Páně'] }],
    ['Q35856', 'pojem', C, {}],
    ['Q188613', 'pojem', C, {}],
    ['Q191498', 'pojem', 'judaismus', { al: ['Košer'] }],
    ['Q177823', 'pojem', 'islam', {}],
    ['Q75673', 'pojem', 'judaismus', { al: ['Bat micva'] }],
    ['Q482752', 'pojem', 'islam', { al: ['Šaríja'] }],
    ['Q179274', 'pojem', 'islam', { al: ['Fatwa'] }],
    ['Q131510', 'pojem', 'hinduismus', { relx: ['buddhismus', 'dzinismus', 'sikhismus'],}],
    ['Q10937578', 'pojem', 'hinduismus', { relx: ['buddhismus', 'dzinismus'], al: ['Pudža'] }],
    ['Q566', 'pojem', C, {}],
    ['Q1821239', 'pojem', C, { relx: ['islam', 'judaismus', 'zoroastrismus'],}],
    ['Q187616', 'pojem', C, { relx: ['buddhismus'],}],
    ['Q132137', 'pojem', C, {}],
    // Duchovní
    ['Q19546', 'duchovní', C, {}],
    ['Q37349', 'duchovní', 'buddhismus', { al: ['Dalajlama', 'Dalai Lama'] }],
    ['Q133485', 'duchovní', 'judaismus', { al: ['Rabi'] }],
    ['Q125482', 'duchovní', 'islam', { d: 'muslimský duchovní, který vede společnou modlitbu' }],
    ['Q184402', 'duchovní', 'islam', { al: ['Ajatolláh'] }],
    ['Q45722', 'duchovní', C, {}],
    ['Q29182', 'duchovní', C, {}],
    ['Q47140', 'duchovní', 'hinduismus', { n: 'Bráhman', al: ['Bráhmin', 'Bráhmana'] }],
    ['Q484260', 'duchovní', 'hinduismus', { relx: ['sikhismus', 'buddhismus'],}]
];

// --- Světci a světice: [ID, údaje] --- (svátek, patron a atributy z Wikidat; fd = svátek, kde je ve Wikidatech jinak nebo chybí,
// ty = druh, kde nejde o „světce“ či „světici“, n = známější jméno)
const SVETCI = [
    // Čeští světci a světci českých zemí
    ['Q118087', { fd: '16. září', cz: true, al: ['Ludmila Česká'] }], ['Q221522', { fd: '16. května', cz: true, al: ['Jan z Pomuku', 'Jan Nepomuk'] }], ['Q243427', { fd: '23. dubna', cz: true, n: 'Svatý Vojtěch', al: ['Vojtěch Slavníkovec'] }],
    ['Q670456', { fd: '4. července', cz: true, al: ['Prokop Sázavský'] }], ['Q158971', { fd: '30. května', cz: true, n: 'Zdislava z Lemberka' }], ['Q239925', { fd: '5. července', cz: true, ty: 'světci', al: ['Cyril a Metoděj', 'Konstantin a Metoděj'] }],
    ['Q1537896', { fd: '27. července', cz: true }], ['Q1675889', { fd: '24. června', cz: true }], ['Q508588', { fd: '15. března', cz: true }],
    ['Q558256', { fd: '5. ledna', cz: true }], ['Q590872', { fd: '17. března', cz: true }], ['Q1632445', { fd: '14. července', cz: true, ty: 'blahoslavený' }],
    ['Q927698', { fd: '7. září', cz: true }], ['Q129546', { fd: '9. října', cz: true }], ['Q57520', { fd: '16. října', cz: true }],
    // Apoštolové a evangelisté
    ['Q43399', { ty: 'apoštol', fd: '30. listopadu' }], ['Q43999', { ty: 'apoštol', fd: '25. července', n: 'Svatý Jakub Starší', al: ['Jakub Větší'] }], ['Q328804', { ty: 'apoštol', fd: '27. prosince', n: 'Svatý Jan Evangelista' }],
    ['Q43600', { ty: 'apoštol', fd: '21. září', n: 'Svatý Matouš' }], ['Q128538', { ty: 'evangelista', fd: '18. října' }], ['Q31966', { ty: 'evangelista', fd: '25. dubna', n: 'Svatý Marek' }],
    ['Q43669', { ty: 'apoštol', fd: '3. července', al: ['Nevěřící Tomáš'] }], ['Q43945', { ty: 'apoštol', fd: '28. října', n: 'Svatý Juda Tadeáš' }], ['Q43982', { ty: 'apoštol', fd: '24. srpna', n: 'Svatý Bartoloměj' }],
    ['Q43675', { ty: 'apoštol', fd: '3. května', n: 'Svatý Filip' }], ['Q12871', { ty: 'apoštol', fd: '28. října', n: 'Svatý Šimon', al: ['Šimon Kananejský', 'Šimon Horlivec'] }],
    // Postavy Nového zákona
    ['Q345', { n: 'Panna Maria', al: ['Maria', 'Matka Boží'] }], ['Q128267', { fd: '19. března' }], ['Q40662', { fd: '24. června' }],
    ['Q164294', { fd: '26. července' }], ['Q314700', { fd: '26. července' }], ['Q63070', { fd: '22. července' }], ['Q196653', {}],
    ['Q161775', { fd: '26. prosince' }], ['Q539890', { fd: '29. července', n: 'Lazar z Betánie' }], ['Q355121', { fd: '25. března' }], ['Q319947', { fd: '15. března' }],
    // Mučedníci a světci prvních staletí
    ['Q44269', { fd: '6. prosince' }], ['Q48438', { fd: '24. dubna' }], ['Q192816', { fd: '4. prosince' }], ['Q183240', { fd: '13. prosince' }],
    ['Q193507', { fd: '25. července' }], ['Q298845', { fd: '4. května' }], ['Q179718', { fd: '25. listopadu' }], ['Q297742', { fd: '20. července' }],
    ['Q80513', { fd: '22. listopadu' }], ['Q151967', { fd: '3. února' }], ['Q212850', { fd: '15. června' }], ['Q200895', { fd: '5. února' }],
    ['Q232427', { fd: '9. února' }], ['Q17590', { fd: '10. srpna' }], ['Q336731', { fd: '12. května' }], ['Q192151', { fd: '14. února' }],
    ['Q359878', { fd: '2. června' }], ['Q242274', { fd: '6. února' }], ['Q369691', { fd: '21. října' }], ['Q170164', { fd: '18. srpna' }],
    ['Q234689', { fd: '27. srpna' }], ['Q170547', { fd: '17. ledna' }], ['Q310987', { fd: '5. ledna' }],
    // Světci středověku
    ['Q133704', { fd: '11. listopadu', n: 'Svatý Martin', al: ['Martin z Tours'] }], ['Q165479', { fd: '17. března' }], ['Q159834', { fd: '3. listopadu' }], ['Q558148', { fd: '6. listopadu' }],
    ['Q160445', { fd: '5. června' }], ['Q733308', { fd: '8. června' }], ['Q180936', { fd: '16. října' }], ['Q149727', { fd: '1. září' }],
    ['Q360798', { fd: '1. prosince' }], ['Q236326', { fd: '9. června' }], ['Q331697', { fd: '1. března' }], ['Q181738', { fd: '8. července' }],
    ['Q269867', { fd: '13. prosince' }], ['Q60889', { fd: '31. října' }], ['Q32520', { fd: '27. května' }], ['Q235619', { fd: '17. března' }],
    ['Q160374', { fd: '6. června' }], ['Q44091', { fd: '8. srpna' }], ['Q167477', { fd: '13. června', n: 'Antonín z Padovy', al: ['Antonín Paduánský'] }],
    ['Q191107', { fd: '11. srpna', n: 'Klára z Assisi', al: ['Svatá Klára'] }], ['Q159862', { fd: '17. listopadu', al: ['Alžběta Durynská'] }], ['Q152457', { fd: '16. srpna', n: 'Svatý Roch', al: ['Roch z Montpellieru'] }],
    ['Q254402', { fd: '4. září' }], ['Q70991', { fd: '17. září' }], ['Q351635', { fd: '11. dubna', n: 'Stanislav ze Szczepanowa', al: ['Svatý Stanislav'] }], ['Q153024', { fd: '22. května' }], ['Q379685', { fd: '15. května' }],
    // Světci novověku a 20. století
    ['Q44281', { fd: '31. července' }], ['Q174880', { fd: '15. října', n: 'Terezie z Ávily', al: ['Terezie od Ježíše', 'Terezie Veliká'] }], ['Q190388', { fd: '14. prosince' }],
    ['Q216946', { fd: '4. listopadu' }], ['Q217791', { fd: '26. května' }], ['Q203437', { fd: '13. listopadu' }], ['Q310307', { fd: '21. června' }],
    ['Q244413', { fd: '27. září' }], ['Q244383', { fd: '23. srpna' }], ['Q146183', { fd: '31. ledna' }], ['Q55398', { fd: '16. dubna' }],
    ['Q193754', { fd: '23. září', n: 'Páter Pio', al: ['Pio z Pietrelciny', 'Padre Pio'] }], ['Q18978', { fd: '5. října', n: 'Faustyna Kowalská' }],
    ['Q76749', { fd: '9. srpna', n: 'Edith Steinová', al: ['Terezie Benedikta od Kříže'] }], ['Q186807', { fd: '26. června', n: 'Josemaría Escrivá' }],
    ['Q30547', { fd: '5. září' }], ['Q23873', { fd: '11. října' }], ['Q43739', { fd: '21. srpna' }], ['Q293455', { fd: '24. března' }],
    ['Q335539', { fd: '9. prosince' }], ['Q609', { fd: '14. července' }]
];

// Patroni (ručně: patroni z Wikidat jsou neúplné a často strojově přeložené – „rána“, „konverze“, „rančer“)
const PATRONS = {
    Q118087: ['Čechy', 'babičky', 'vychovatelé'], Q221522: ['Čechy', 'mosty', 'zpovědní tajemství'], Q243427: ['Čechy', 'Polsko'], Q670456: ['Čechy', 'horníci'],
    Q239925: ['Evropa', 'Slované'], Q57520: ['Slezsko'], Q43399: ['Skotsko', 'Rusko', 'rybáři'], Q43999: ['Španělsko', 'poutníci'], Q43600: ['celníci', 'bankéři'],
    Q128538: ['lékaři', 'malíři'], Q31966: ['Benátky'], Q128267: ['tesaři', 'rodiny'], Q164294: ['matky', 'horníci'], Q44269: ['děti', 'námořníci'],
    Q48438: ['Anglie', 'skauti', 'rytíři'], Q192816: ['horníci', 'dělostřelci'], Q183240: ['nevidomí'], Q193507: ['cestovatelé', 'řidiči'], Q298845: ['hasiči', 'kominíci'],
    Q179718: ['filozofové', 'studenti'], Q80513: ['hudebníci'], Q151967: ['nemocní v krku'], Q212850: ['tanečníci', 'herci'], Q232427: ['zubaři'],
    Q17590: ['kuchaři', 'hasiči'], Q192151: ['zamilovaní'], Q133704: ['vojáci', 'Francie'], Q165479: ['Irsko'], Q159834: ['myslivci'], Q558148: ['vězni', 'dobytek'],
    Q160445: ['Německo'], Q360798: ['zlatníci', 'kováři'], Q331697: ['Wales'], Q269867: ['Alsasko'], Q167477: ['ztracené věci'], Q191107: ['televize'],
    Q152457: ['poutníci', 'nemocní morem'], Q254402: ['Palermo'], Q379685: ['Madrid', 'rolníci'], Q174880: ['Španělsko'], Q159862: ['charita'], Q359878: ['námořníci'],
    Q234689: ['matky'], Q170164: ['archeologové'], Q153024: ['beznadějné případy'], Q146183: ['mládež'], Q200895: ['Katánie']
};
// Atributy z Wikidat s běžnějším českým názvem
const SYMBOL_NAMES = { 'grilovací rošt': 'rošt', 'lámání kolem': 'kolo', 'křesťanský kříž': 'kříž', 'lilie bělostná': 'lilie', 'Kříž tau': 'kříž tau' };

// --- Záhady a legendy: [ID, druh, údaje] --- where = kde (u kryptidů pro otázku Kde prý žije?), year = rok události či objevu
const ZAHADY = [
    // Kryptidi (tvorové, jejichž existence není prokázaná)
    ['Q129628', 'kryptid', { where: 'Himálaj', reg: 'asie', al: ['Yeti', 'Sněžný muž'] }], ['Q44810', 'kryptid', { where: 'Severní Amerika', reg: 'samerika', al: ['Sasquatch'] }],
    ['Q49658', 'kryptid', { where: 'Skotsko', reg: 'evropa', al: ['Lochneska', 'Nessie'] }],
    ['Q183571', 'kryptid', { where: 'Portoriko a Latinská Amerika', reg: 'lamerika', al: ['Chupacabra', 'Čupakabras'] }], ['Q746248', 'kryptid', { where: 'USA (Západní Virginie)', reg: 'samerika' }],
    ['Q555716', 'kryptid', { where: 'povodí Konga (Afrika)', reg: 'afrika', al: ['Mokele-mbembe'] }], ['Q272149', 'kryptid', { where: 'poušť Gobi (Mongolsko)', reg: 'asie', al: ['Mongolský červ smrti'] }],
    ['Q668330', 'kryptid', { where: 'USA (New Jersey)', reg: 'samerika', al: ['Jerseyský ďábel'] }], ['Q964575', 'kryptid', { where: 'Austrálie', reg: 'australie' }],
    ['Q379173', 'kryptid', { where: 'moře a oceány', reg: 'more', n: 'Mořský had' }], ['Q211453', 'kryptid', { where: 'Francie', reg: 'evropa', year: 1764 }],
    ['Q1477687', 'kryptid', { where: 'Zambie a Kongo (Afrika)', reg: 'afrika' }],
    // Bájné a ztracené země a města
    ['Q470970', 'ztracená země', { where: 'Indický oceán' }], ['Q272562', 'ztracená země', { where: 'Tichý oceán', n: 'Mu', al: ['Ztracený kontinent Mu'] }],
    ['Q390719', 'ztracená země', { where: 'uvnitř Země', al: ['Agarthi'], d: 'bájná podzemní říše' }], ['Q1664177', 'ztracená země', { where: 'Amazonie (Peru, Bolívie, Brazílie)', d: 'bájné incké město zlata ukryté v pralese' }],
    ['Q464520', 'ztracená země', { where: 'Himálaj', al: ['Shangri-La'] }], ['Q649143', 'teorie', { al: ['Dutá Země'], d: 'domněnka o obydleném světě ukrytém pod povrchem naší planety' }],
    // Záhadná místa a jevy
    ['Q43708', 'záhadné místo', { where: 'Atlantský oceán', al: ['Ďáblův trojúhelník'] }], ['Q177397', 'záhadné místo', { where: 'USA (Nevada)', al: ['Area 51'] }],
    ['Q1506857', 'záhadné místo', { where: 'Kanada (Nové Skotsko)', d: 'kanadský ostrov, na kterém se přes dvě stě let hledá ukrytý poklad' }],
    ['Q421', 'záhadný jev', { al: ['Létající talíř', 'Neidentifikovaný létající objekt'] }], ['Q193330', 'záhadný jev', { where: 'hlavně Anglie' }],
    ['Q330305', 'záhadný jev', {}], ['Q216893', 'záhadný jev', {}], ['Q45529', 'záhadný jev', { al: ['Duch', 'Strašidlo'] }],
    ['Q646988', 'teorie', { al: ['Teorie dávných astronautů'] }], ['Q2397815', 'teorie', { d: 'údajná planeta, jejíž srážka se Zemí měla podle konspiračních teorií způsobit konec světa' }],
    // Záhadné události a zmizení
    ['Q219355', 'záhadná událost', { where: 'USA (Nové Mexiko)', year: 1947, d: 'údajná havárie mimozemské lodi na americkém jihozápadě, o které se spekuluje dodnes' }], ['Q814484', 'záhadná událost', { where: 'Ural (Rusko)', year: 1959, n: 'Ďatlovova výprava', al: ['Zánik Ďatlovovy výpravy', 'Incident v Ďatlovově průsmyku'] }],
    ['Q59222', 'záhadná událost', { where: 'Severní Karolína (USA)', year: 1590, n: 'Ztracená kolonie Roanoke', al: ['Kolonie Roanoke', 'Roanoke'] }],
    ['Q39252', 'loď duchů', { al: ['Létající Holanďan'] }],
    // Záhadné předměty a písma
    ['Q179492', 'záhadný předmět', { where: 'Yale (USA), dříve na dvoře Rudolfa II.' }], ['Q212180', 'záhadný předmět', { where: 'Stockholm, dříve Podlažice v Čechách', al: ['Ďáblova bible'] }],
    ['Q254170', 'záhadný předmět', {}], ['Q465338', 'záhadný předmět', { where: 'Kréta', year: 1908, al: ['Faistský disk'], d: 'hliněná deska s nerozluštěnými vtlačenými znaky z mínojské Kréty' }],
    ['Q182324', 'záhadný předmět', { where: 'Řecko', year: 1901, al: ['Antikythérský mechanismus'] }], ['Q643309', 'záhadný předmět', { where: 'Irák' }],
    ['Q178331', 'záhadný předmět', { where: 'Itálie', d: 'lněné plátno s otiskem postavy, uctívané jako pohřební plátno Ježíše; jeho původ je předmětem sporů' }],
    ['Q157012', 'záhadný předmět', { where: 'Kateřinský palác u Petrohradu', d: 'místnost obložená jantarem, ztracená za druhé světové války' }],
    ['Q131316', 'záhadný předmět', { d: 'biblická schránka na desky Desatera, jejíž osud není znám' }],
    ['Q209764', 'nerozluštěné písmo', { where: 'Velikonoční ostrov' }], ['Q30972', 'nerozluštěné písmo', { where: 'Kréta', al: ['Lineární A'] }],
    ['Q485205', 'záhadný předmět', { ty: 'legendární bytost', al: ['Homunculus'] }],
    // Legendární postavy a záhadné osobnosti
    ['Q122634', 'legendární postava', { where: 'Anglie (Sherwoodský les)' }], ['Q30908', 'legendární postava', { where: 'Švýcarsko' }],
    ['Q111502', 'legendární postava', { where: 'Hameln (Německo)', n: 'Krysař z Hamelnu', al: ['Hamelnský krysař'], year: 1284 }],
    ['Q332885', 'legendární postava', { where: 'Německo', al: ['Doktor Faust', 'Johann Faust'] }], ['Q464017', 'legendární postava', { al: ['Věčný Žid', 'Bludný Žid'] }],
    ['Q118192', 'legendární postava', {}], ['Q243811', 'legendární postava', { al: ['Papežka Johanka'] }], ['Q717100', 'legendární postava', { al: ['Bloody Mary'] }],
    ['Q43715', 'legendární postava', { where: 'Valašsko', al: ['Vlad Dracula', 'Vlad Napichovač', 'Drákula'] }],
    ['Q170846', 'legendární postava', { where: 'Čachtice (Slovensko)', al: ['Čachtická paní', 'Alžběta Bátoryová'] }],
    ['Q158208', 'záhadná osobnost', {}], ['Q44600', 'záhadná osobnost', { where: 'Norimberk', year: 1828 }], ['Q43963', 'záhadná osobnost', { where: 'Londýn', year: 1888 }],
    ['Q127080', 'záhadná osobnost', { where: 'Praha (dvůr Rudolfa II.)' }], ['Q3355', 'záhadná osobnost', { where: 'Tichý oceán', year: 1937, n: 'Amelia Earhartová' }],
    ['Q348970', 'záhadná osobnost', { where: 'USA', year: 1971 }], ['Q648580', 'záhadná osobnost', { where: 'Londýn', year: 1483 }],
    // Tajné společnosti
    ['Q133957', 'tajná společnost', { where: 'Bavorsko', year: 1776, al: ['Iluminátský řád'] }], ['Q194267', 'tajná společnost', { where: 'Německo', year: 1614, al: ['Řád růžového kříže', 'Růžokřižovníci'], d: 'tajné esoterní hnutí, které se hlásí k legendárnímu zakladateli Christianu Rosenkreutzovi' }],
    ['Q41726', 'tajná společnost', { year: 1717, where: 'Londýn (první velká lóže)', al: ['Svobodní zednáři', 'Zednáři', 'Zednářství'] }],
    ['Q51410', 'teorie', { al: ['Men in Black'] }],
    ['Q9406', 'legendární bytost', { where: 'Haiti (vúdú)', al: ['Zombi'] }],
    ['Q370705', 'záhadná osobnost', { where: 'Amazonie (Brazílie)', year: 1925 }],
    ['Q170612', 'záhadný jev', {}], ['Q186446', 'záhadný jev', { al: ['Psychokineze'] }]
];

// Druh u položky ručně (homunkulus není předmět)
const kindOf = (ty, extra) => extra.ty || ty;

// Nikdy známé: pojmy, jejichž návštěvnost nafukuje jiný význam (Mantra – hudba), odborné směry a pojmy, které v Česku zná málokdo
// (théraváda, mahájána, bahá’í, šaktismus, satori), papež Pius X., sporná témata a osoby (Nibiru, Kelley); vždy známé: to, co zná
// každý (světová náboženství, Vánoce a Velikonoce, čeští patroni, Mikuláš, Yetti, UFO)
const NEVER_KNOWN = new Set(['Q132265', 'Q48362', 'Q22679', 'Q43739', 'Q131510', 'Q49376', 'Q45584', 'Q234953', 'Q849345', 'Q584580', 'Q183379', 'Q1477687', 'Q390719', 'Q1664177', 'Q2397815', 'Q127080', 'Q158208']);
const ALWAYS_KNOWN = new Set([
    // Náboženství
    'Q5043', 'Q432', 'Q9268', 'Q9089', 'Q748', 'Q171201', 'Q483889', 'Q9592', 'Q35032', 'Q23540', 'Q131372', 'Q19809', 'Q21196', 'Q1845', 'Q428', 'Q40843', 'Q161396', 'Q19546', 'Q35269',
    // Světci: čeští patroni, apoštolové a světci z kalendáře a lidových tradic (Mikuláš, Martin, Lucie, Barbora, Valentýn)
    'Q118087', 'Q221522', 'Q243427', 'Q670456', 'Q239925', 'Q44269', 'Q133704', 'Q183240', 'Q192816', 'Q192151', 'Q48438', 'Q345', 'Q128267', 'Q40662', 'Q30547',
    // Záhady
    'Q129628', 'Q44810', 'Q49658', 'Q43708', 'Q421', 'Q122634', 'Q30908', 'Q43963', 'Q43715', 'Q464520'
]);

// Okruhy rozšíření (na konci seznamu okruhů)
export const EXTRA_COLLECTIONS = [
    { id: 'svetova-nabozenstvi', label: 'Světová náboženství', text: 'Křesťanství, islám, judaismus, hinduismus, buddhismus…', test: item => item.c === 'nabozenstvi' && item.ty === 'náboženství' },
    { id: 'krestanske-cirkve', label: 'Křesťanské církve a směry', text: 'Katolická církev, pravoslaví, luteránství, husitství…', test: item => item.c === 'nabozenstvi' && item.ty === 'směr' && item.f.relk === 'krestanstvi' },
    { id: 'smery-nabozenstvi', label: 'Směry islámu, buddhismu, hinduismu a judaismu', text: 'Sunnité, šíité, zen, théraváda, chasidismus…', test: item => item.c === 'nabozenstvi' && item.ty === 'směr' && item.f.relk !== 'krestanstvi' },
    { id: 'cirkevni-rady', label: 'Církevní a rytířské řády', text: 'Jezuité, benediktini, františkáni, templáři…', test: item => item.c === 'nabozenstvi' && item.ty === 'řád' },
    { id: 'nabozenske-svatky', label: 'Náboženské svátky', text: 'Vánoce, Velikonoce, ramadán, chanuka, díválí…', test: item => item.c === 'nabozenstvi' && ['svátek', 'období'].includes(item.ty) },
    { id: 'posvatne-knihy-a-symboly', label: 'Posvátné knihy a symboly', text: 'Bible, Korán, Tóra, Davidova hvězda, jin a jang…', test: item => item.c === 'nabozenstvi' && ['posvátný text', 'symbol'].includes(item.ty) },
    { id: 'nabozenske-pojmy', label: 'Náboženské pojmy, obřady a duchovní', text: 'Nirvána, hadždž, křest, papež, rabín…', test: item => item.c === 'nabozenstvi' && ['pojem', 'duchovní'].includes(item.ty) },
    { id: 'cesti-svetci', label: 'Čeští světci', text: 'Svatá Ludmila, Jan Nepomucký, svatý Vojtěch, svatý Prokop…', test: item => item.c === 'svetci' && item.f.czs === 1 },
    { id: 'apostolove', label: 'Apoštolové, evangelisté a postavy evangelií', text: 'Svatý Ondřej, Jan Křtitel, Marie Magdalena…', test: item => item.c === 'svetci' && item.f.nz === 1 },
    { id: 'svetice', label: 'Světice', text: 'Svatá Barbora, svatá Lucie, svatá Ludmila, Matka Tereza…', test: item => item.c === 'svetci' && item.sx === 'f' },
    { id: 'kryptidi', label: 'Kryptidi', text: 'Yetti, Bigfoot, Lochnesská nestvůra, čupakabra…', test: item => item.c === 'zahady' && item.ty === 'kryptid' },
    { id: 'zahadna-mista', label: 'Ztracené země a záhadná místa', text: 'Bermudský trojúhelník, Lemurie, Šangri-La, Oblast 51…', test: item => item.c === 'zahady' && ['ztracená země', 'záhadné místo'].includes(item.ty) },
    { id: 'zahadne-predmety', label: 'Záhadné předměty a písma', text: 'Voynichův rukopis, Codex gigas, disk z Faistu…', test: item => item.c === 'zahady' && ['záhadný předmět', 'nerozluštěné písmo'].includes(item.ty) },
    { id: 'zahadne-jevy', label: 'Záhadné jevy, události a teorie', text: 'UFO, kruhy v obilí, Roswell, Ďatlovova výprava…', test: item => item.c === 'zahady' && ['záhadný jev', 'záhadná událost', 'teorie', 'loď duchů', 'tajná společnost'].includes(item.ty) },
    { id: 'legendarni-postavy', label: 'Legendární a záhadné postavy', text: 'Robin Hood, Vilém Tell, Faust, Jack Rozparovač…', test: item => item.c === 'zahady' && ['legendární postava', 'záhadná osobnost', 'legendární bytost'].includes(item.ty) }
].map(collection => ({ sort: { by: 'name' }, ...collection }));

// --- Wikidata ---
const ALL_IDS = [...new Set([...NABOZENSTVI.map(([q]) => q), ...SVETCI.map(([q]) => q), ...ZAHADY.map(([q]) => q)])];
export const EXTRA_IDS = new Set(ALL_IDS);
const SINGLE = { t: 1, n: 1, d: 1, im: 1, sl: 1, born: 1, died: 1, sex: 1 };
const BRANCHES = [
    `{ ?a schema:about ?item . ?a schema:isPartOf <https://cs.wikipedia.org/> . ?a schema:name ?v BIND("t" AS ?p) }`,
    `{ ?item wikibase:sitelinks ?v BIND("sl" AS ?p) }`,
    `{ ?item rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("n" AS ?p) }`,
    `{ ?item <http://www.w3.org/2004/02/skos/core#altLabel> ?v FILTER(LANG(?v) = "cs") BIND("al" AS ?p) }`,
    `{ ?item schema:description ?v FILTER(LANG(?v) = "cs") BIND("d" AS ?p) }`,
    `{ ?item wdt:P18 ?v BIND("im" AS ?p) }`,
    `{ ?item wdt:P569 ?v BIND("born" AS ?p) }`,
    `{ ?item wdt:P570 ?v BIND("died" AS ?p) }`,
    `{ ?item wdt:P21 ?v BIND("sex" AS ?p) }`,
    `{ ?item wdt:P4185 ?x . ?x rdfs:label ?v FILTER(LANG(?v) = "cs") BIND("sym" AS ?p) }`
];
const fetchDetails = () => cached(`mytologie-rozsireni-details-${ALL_IDS.length}`, async () => {
    const result = new Map(ALL_IDS.map(qid => [qid, {}]));
    await inBatches(ALL_IDS, 60, (qids) => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values(qids)} } ${BRANCHES.join(' UNION ')} }`, (row) => {
        const entry = result.get(id(row.item.value));
        const key = row.p.value;
        const raw = row.v.value;
        const v = raw.startsWith('http://www.wikidata.org/entity/') ? id(raw) : raw;
        if (SINGLE[key]) { if (!(key in entry)) entry[key] = key === 'sl' ? Number(v) : v; }
        else if (!(entry[key] || []).includes(v)) entry[key] = [...(entry[key] || []), v];
    }, qlever);
    return [...result];
});

// Q-id všech položek jiných témat (stejná položka nemá být ve dvou tématech)
const otherTopicIds = () => {
    const ids = new Map();
    const dir = new URL('../../data/', import.meta.url);
    const topics = readdirSync(new URL('../../topics/', import.meta.url)).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''));
    for (const topic of topics) {
        if (topic === 'mytologie') continue;
        let data;
        try { data = JSON.parse(readFileSync(new URL(`${topic}.json`, dir), 'utf8')); } catch { continue; }
        for (const item of data.items || []) if (item.q) ids.set(item.q, topic);
    }
    return ids;
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FEMALE = 'Q6581072';
const CZECH_LETTERS = /^[\p{L}' ’-]+(?: [\p{L}' ’.-]+){0,4}$/u;
const centuryOf = (year) => year === undefined ? undefined : year <= 0 ? `${Math.floor(-year / 100) + 1}. století př. n. l.` : `${Math.floor((year - 1) / 100) + 1}. století`;

// Sestaví nové položky (bez úrovní) nad dosavadními položkami tématu (existing): vynechá ID a jména, která téma už má, a položky jiných témat
export const buildExtra = async ({ existing }) => {
    const details = new Map(await fetchDetails());
    const other = otherTopicIds();
    const base = existing.filter(item => !EXTRA_CATEGORIES.includes(item.c));
    const haveIds = new Set(base.map(item => item.q));
    const names = new Set(base.flatMap(item => [item.n, ...(item.al || [])]).map(plain));
    const skipped = { other: [], have: [], missing: [], name: [], image: [] };
    const items = [];
    const add = (qid, make) => {
        const detail = { ...(details.get(qid) || {}), q: qid };
        if (other.has(qid)) { skipped.other.push(`${detail.t || qid} (${other.get(qid)})`); return; }
        if (haveIds.has(qid)) { skipped.have.push(detail.t || qid); return; }
        if (!detail.t) { skipped.missing.push(qid); return; }
        const item = make(detail);
        if (!item) { skipped.missing.push(`${detail.t} (${qid})`); return; }
        if (names.has(plain(item.n))) { skipped.name.push(item.n); return; }
        names.add(plain(item.n));
        haveIds.add(qid);
        // Další názvy jen ruční (další názvy z Wikidat bývají jména jiných věcí: Joseph Smith u Knihy Mormonovy, Pascha u Pesachu
        // i Velikonoc); u světců jméno bez „svatý“ a se „svatý“ (Mikuláš, Svatý Cyril a Metoděj)
        const saint = item.c === 'svetci' ? [item.n.replace(/^(?:Svat[ýáí]|Sv\.) /u, ''), /^Svat/u.test(item.n) ? null : `${item.sx === 'f' ? 'Svatá' : 'Svatý'} ${item.n}`] : [];
        const aliases = [...(item.al || []), ...saint].filter(alias => alias && CZECH_LETTERS.test(alias) && plain(alias) !== plain(item.n) && plain(alias).length >= 3);
        item.al = [...new Set(aliases)].slice(0, 5);
        items.push(compact({ ...item, _: { sl: detail.sl || 0, title: detail.t } }));
    };
    const nameOf = (detail, extra = {}) => extra.n || capitalize((detail.n || detail.t).replace(/ \(.*\)$/, ''));
    for (const [qid, ty, rel, extra] of NABOZENSTVI) {
        add(qid, (detail) => ({
            q: qid, t: detail.t, n: nameOf(detail, extra), c: 'nabozenstvi', k: 0, ty, d: extra.d || detail.d, al: extra.al,
            ...imageFields(detail.im),
            f: compact({ rel: rel ? RELIGIONS[rel] : undefined, relk: rel || (extra.christian ? 'krestanstvi' : undefined), relx: extra.relx, by: extra.by, byl: extra.byl, from: extra.from, land: extra.land, when: extra.when })
        }));
    }
    for (const [qid, extra] of SVETCI) {
        add(qid, (detail) => {
            const female = detail.sex === FEMALE;
            const born = yearOf(detail.born);
            const died = yearOf(detail.died);
            // Postavy Nového zákona (apoštolové, evangelisté, Panna Maria, Jan Křtitel…) žily v 1. století
            const nz = ['apoštol', 'evangelista'].includes(extra.ty) || ['Q345', 'Q128267', 'Q40662', 'Q164294', 'Q314700', 'Q63070', 'Q196653', 'Q161775', 'Q539890', 'Q355121', 'Q319947'].includes(qid);
            const lived = nz ? '1. století' : centuryOf(died ?? born);
            return {
                q: qid, t: detail.t, n: nameOf(detail, extra), c: 'svetci', k: 0,
                ty: extra.ty || (female ? 'světice' : 'světec'), sx: female ? 'f' : undefined, d: extra.d || detail.d, al: extra.al,
                ...imageFields(detail.im),
                f: compact({ fd: extra.fd, pat: PATRONS[qid], sym: [...new Set((detail.sym || []).map(value => SYMBOL_NAMES[value] || value))].filter(value => value.length <= 24 && !/^Q\d+$/.test(value)).slice(0, 4),
                    lived, czs: extra.cz ? 1 : undefined, nz: nz ? 1 : undefined })
            };
        });
    }
    for (const [qid, ty, extra] of ZAHADY) {
        add(qid, (detail) => ({
            q: qid, t: detail.t, n: nameOf(detail, extra), c: 'zahady', k: 0, ty: kindOf(ty, extra), d: extra.d || detail.d, al: extra.al,
            sx: detail.sex === FEMALE ? 'f' : undefined,
            ...imageFields(detail.im),
            f: compact({ where: extra.where, reg: extra.reg, year: extra.year })
        }));
    }
    // Stejný obrázek jako jiná položka tématu by otázka nerozlišila: nová položka ho nedostane (rozliší ji popis a fakta)
    const images = new Set(base.map(item => item.im).filter(Boolean));
    for (const item of items) {
        if (!item.im) continue;
        if (images.has(item.im)) { skipped.image.push(item.n); delete item.im; delete item.ih; } else images.add(item.im);
    }
    // Další názvy, které jsou jménem nebo dalším názvem jiné položky tématu (Helena u svaté Heleny i trójské Heleny), se vynechají
    const taken = new Map();
    for (const item of [...base, ...items]) for (const value of new Set([item.n, ...(item.al || [])].map(plain))) taken.set(value, (taken.get(value) || 0) + 1);
    for (const item of items) {
        item.al = (item.al || []).filter(alias => taken.get(plain(alias)) === 1);
        if (!item.al.length) delete item.al;
    }
    return { items, skipped };
};

// --- Úrovně ---
// Podíl známých v kategorii (doplní ruční ALWAYS_KNOWN), experti nejméně známá čtvrtina; okruhy mají spodní hranici známých
const KNOWN_SHARE = { nabozenstvi: 0.3, svetci: 0.3, zahady: 0.3 };
const EXPERT_SHARE = 0.27;
export const extraLevels = async (fresh) => {
    const pageviews = await topicPageviews('mytologie-rozsireni-pageviews', fresh.map(item => item._.title), { offline: process.env.PAGEVIEWS_OFFLINE === '1' });
    for (const item of fresh) {
        Object.assign(item._, { pv: pageviews[item._.title], pool: item.c, never: NEVER_KNOWN.has(item.q), protect: ALWAYS_KNOWN.has(item.q) });
        item.k = ALWAYS_KNOWN.has(item.q) ? 1 : 0;
    }
    const groups = [...EXTRA_COLLECTIONS.map(collection => ({ id: collection.id, members: fresh.filter(item => collection.test(item)) })),
        ...EXTRA_CATEGORIES.map(category => ({ id: `c:${category}`, members: fresh.filter(item => item.c === category) }))].filter(group => group.members.length);
    return assignLevels(fresh, { knownShare: pool => KNOWN_SHARE[pool], expertShare: () => EXPERT_SHARE, ceiling: () => 0.5, groups, expertMax: EXPERT_MAX_SHARE });
};

// Sloučí rozšíření do dat tématu: dosavadní položky beze změny, nové položky na konec, okruhy na konec seznamu.
// Položky rozšíření z dřívějšího běhu nahradí nové sestavení (stejné id); ty, které nový běh nenašel, zůstanou (žádné id nezmizí)
export const mergeExtra = async ({ collections, items }, extra) => {
    const fresh = extra.items;
    const freshIds = new Set(fresh.map(item => item.q));
    const kept = items.filter(item => !(EXTRA_CATEGORIES.includes(item.c) && freshIds.has(item.q)));
    const promoted = await extraLevels(fresh);
    for (const item of fresh) {
        item.g = EXTRA_COLLECTIONS.filter(collection => collection.test(item)).map(collection => collection.id);
        delete item._;
        if (!item.g.length) delete item.g;
    }
    const stale = items.filter(item => EXTRA_CATEGORIES.includes(item.c) && !freshIds.has(item.q));
    if (stale.length) console.warn(`  rozšíření: ${stale.length} dřívějších položek nový běh nenašel, zůstávají (${stale.slice(0, 5).map(item => item.n).join(', ')}…)`);
    const ids = new Set(EXTRA_COLLECTIONS.map(collection => collection.id));
    return {
        collections: [...collections.filter(collection => !ids.has(collection.id)), ...EXTRA_COLLECTIONS.map(({ test, ...collection }) => collection)],
        items: [...kept, ...fresh],
        promoted
    };
};

// Přehled pro výpis: počty a úrovně v nových kategoriích a okruzích, vynechané položky
export const extraSummary = (items, skipped) => {
    for (const category of EXTRA_CATEGORIES) {
        const list = items.filter(item => item.c === category);
        console.log(`${category}: ${list.length} (známých ${list.filter(item => item.k === 1).length}, expert ${list.filter(item => item.x).length})`);
    }
    for (const collection of EXTRA_COLLECTIONS) {
        const members = items.filter(item => (item.g || []).includes(collection.id));
        const knownCount = members.filter(item => item.k === 1).length;
        console.log(`  okruh ${collection.id}: ${members.length} (známých ${knownCount}, expert ${members.filter(item => item.x).length})${knownCount < knownFloor(members.length) ? ' – POD SPODNÍ HRANICÍ' : ''}`);
    }
    if (skipped) {
        if (skipped.other.length) console.log(`  vynecháno, už je v jiném tématu: ${skipped.other.join(', ')}`);
        if (skipped.have.length) console.log(`  vynecháno, Mytologie už má: ${skipped.have.join(', ')}`);
        if (skipped.missing.length) console.log(`  vynecháno, chybí článek nebo údaje: ${skipped.missing.join(', ')}`);
        if (skipped.name.length) console.log(`  vynecháno, jméno už téma má: ${skipped.name.join(', ')}`);
        if (skipped.image.length) console.log(`  bez obrázku, má ho jiná položka: ${skipped.image.join(', ')}`);
    }
};
