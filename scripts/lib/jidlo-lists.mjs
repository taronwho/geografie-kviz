// Téma Jídlo a pití: ručně vybrané položky (názvy článků české Wikipedie). known = zná je většina lidí (k = 1), more = méně
// známé (k = 0); k nim přibudou položky z Wikidat podle tříd (build-jidlo.mjs AUTO). Zápis: 'Článek', 'Článek=Název ve hře'
// (článek je o rostlině, hádá se plod či zelenina: 'Ledvinovník západní=Kešu') a za # štítky oddělené čárkou: druh (TYPES
// v build-jidlo.mjs, určuje štítek u otázky a okruh), cz = česká položka i bez země původu v datech.
export const LISTS = {
    pokrmy: {
        known: [
            'Pizza#fast', 'Suši', 'Hamburger#fast', 'Guláš', 'Svíčková na smetaně#cz', 'Vepřo knedlo zelo#cz', 'Vídeňský řízek',
            'Smažený sýr#cz', 'Bramborák#cz', 'Bramborový salát#salat', 'Paella', 'Lasagne#testoviny', 'Špagety#testoviny', 'Rizoto',
            'Kebab#fast', 'Gyros#fast', 'Hot dog#fast', 'Taco#fast', 'Burrito#fast', 'Boršč#polevka', 'Pelmeně', 'Musaka', 'Falafel#fast',
            'Hummus', 'Kari', 'Rámen#polevka', 'Phở#polevka', 'Phad thai', 'Fish and chips#fast', 'Hranolky#fast', 'Omeleta', 'Knedlík#cz',
            'Brynzové halušky', 'Pirohy', 'Gazpacho#polevka', 'Chilli con carne', 'Tatarský biftek', 'Ratatouille', 'Quiche',
            'Pekingská kachna', 'Jarní závitky', 'Nachos#fast', 'Langoš#fast', 'Česneková polévka#polevka,cz', 'Kulajda#polevka,cz',
            'Bramboračka#polevka,cz', 'Rajská omáčka#omacka', 'Koprová omáčka#omacka,cz', 'Utopenec#cz', 'Sekaná', 'Segedínský guláš#cz',
            'Fondue', 'Šašlik', 'Čevabčiči', 'Carbonara#testoviny', 'Řecký salát#salat', 'Salát Caesar#salat', 'Tzatziki#omacka',
            'Bruschetta', 'Kimčchi', 'Hovězí Stroganov', 'Kuskus', 'Ravioly#testoviny', 'Sendvič#fast', 'Míchaná vejce', 'Volské oko',
            'Bigos', 'Lečo', 'Halušky', 'Quesadilla', 'Tortellini#testoviny', 'Noky', 'Polenta', 'Carpaccio', 'Chačapuri', 'Šakšúka',
            'Pilaf', 'Kuřecí tikka masala', 'Kuře na paprice#cz', 'Španělský ptáček#cz', 'Tlačenka#cz', 'Jitrnice#cz',
            'Dršťková polévka#polevka', 'Gulášová polévka#polevka', 'Bramborová kaše', 'Hrachová polévka#polevka',
            'Čočková polévka#polevka', 'Kuřecí polévka#polevka', 'Caprese#salat', 'Calzone', 'Boloňská omáčka#omacka', 'Majonéza#omacka',
            'Kečup#omacka', 'Hořčice#omacka', 'Tatarská omáčka#omacka', 'Pesto#omacka', 'Guacamole#omacka', 'Řízek', 'Raclette',
            'Kuřecí nugeta#fast', 'Masové koule'
        ],
        more: [
            'Biryani', 'Kyjevský kotlet', 'Haggis', 'Poutine#fast', 'Ceviche', 'Tortilla de patatas', 'Tažín', 'Šavarma#fast',
            'Okonomijaki', 'Tempura', 'Sašimi', 'Onigiri', 'Pibimbap', 'Currywurst#fast', 'Rösti', 'Bouillabaisse#polevka',
            'Nasi goreng', 'Rendang', 'Dolma', 'Kibbeh', 'Empanada', 'Foie gras', 'Croque monsieur', 'Kohout na víně',
            'Hovězí po burgundsku', 'Kuře tandúrí', 'Vindaloo', 'Enchilada', 'Tamales', 'Paprikáš (pokrm)', 'Pljeskavica',
            'Kapustnica#polevka', 'Zelňačka#polevka,cz', 'Šči#polevka', 'Okroška#polevka', 'Salát Olivier#salat', 'Tabouleh#salat',
            'Baba ganuš', 'Kofta', 'Suvlaki', 'Wonton', 'Smažená rýže', 'Kimbap', 'Laksa#polevka', 'Gado-gado#salat', 'Saté',
            'Feijoada', 'Arancini', 'Ossobuco', 'Saltimbocca', 'Vitello tonnato', 'Salsa (omáčka)#omacka', 'Ajvar#omacka',
            'Bešamelová omáčka#omacka', 'Sójová omáčka#omacka', 'Worcesterská omáčka#omacka', 'Kuřecí tikka masala', 'Miso polévka#polevka',
            'Edamame'
        ]
    },
    sladkosti: {
        known: [
            'Chléb#pecivo', 'Rohlík#pecivo,cz', 'Houska#pecivo,cz', 'Bageta#pecivo', 'Croissant#sladke', 'Preclík#pecivo', 'Bagel#pecivo',
            'Ciabatta#pecivo', 'Pita#pecivo', 'Tortilla#pecivo', 'Toast#pecivo', 'Focaccia#pecivo', 'Nán#pecivo', 'Vánočka#sladke,cz',
            'Mazanec#sladke,cz', 'Koláč#sladke,cz', 'Buchta#sladke,cz', 'Bábovka#sladke', 'Jablečný závin#zakusek', 'Kobliha#sladke',
            'Americká kobliha#sladke', 'Muffin#zakusek', 'Lívanec#dezert', 'Palačinka#dezert', 'Vafle#dezert', 'Perník#sladke',
            'Tiramisu#dezert', 'Zmrzlina#mrazeny', 'Čokoláda#cukrovinka', 'Baklava#zakusek', 'Chalva#cukrovinka', 'Sacherův dort#dort',
            'Dort#dort', 'Sýrový koláč=Cheesecake#dort', 'Brownie#zakusek', 'Makronky#cukrovi', 'Marcipán#cukrovinka', 'Lokum#cukrovinka',
            'Cukrová vata#cukrovinka', 'Pudink#dezert', 'Sorbet#mrazeny', 'Želé#dezert', 'Karamel#cukrovinka', 'Lízátko#cukrovinka',
            'Marshmallow#cukrovinka', 'Churro#sladke', 'Panna cotta#dezert', 'Crème brûlée#dezert', 'Medovník#dort,cz',
            'Trdelník#sladke', 'Kremrole#zakusek,cz', 'Punčový řez#zakusek', 'Vanilkové rohlíčky#cukrovi', 'Ovocné knedlíky#dezert,cz',
            'Žemlovka#dezert,cz', 'Pusinky (cukroví)#cukrovi', 'Oplatka#sladke', 'Karlovarské oplatky#sladke,cz', 'Skořicový šnek#sladke',
            'Cupcake#zakusek', 'Panettone#sladke', 'Schwarzwaldský dort#dort', 'Éclair#zakusek', 'Nugát#cukrovinka', 'Sušenka#sladke',
            'Mousse#dezert', 'Cannolo#zakusek', 'Dobošův dort#dort', 'Císařský trhanec#dezert', 'Štóla (moučník)#sladke',
            'Mražený jogurt#mrazeny', 'Koláček štěstí#sladke', 'Žvýkačka#cukrovinka'
        ],
        more: [
            'Brioška#sladke', 'Madlenka#zakusek', 'Pastel de nata#zakusek', 'Moči#cukrovinka', 'Banánový split#mrazeny',
            'Frgál#sladke,cz', 'Bublanina#sladke,cz', 'Šodó#dezert', 'Turecký med#cukrovinka', 'Linecké těsto#cukrovi', 'Dulce de leche#dezert',
            'Měsíční koláč#sladke', 'Kanafeh#zakusek', 'Maces#pecivo', 'Lavaš#pecivo', 'Čapátí#pecivo', 'Indžera#pecivo',
            'Císařská houska#pecivo', 'Hostie#pecivo', 'Pavézky#cukrovi', 'Karamelová vafle#sladke', 'Bílá čokoláda#cukrovinka'
        ]
    },
    syry: {
        known: [
            'Mozzarella', 'Parmezán', 'Camembert#plisen', 'Feta', 'Ricotta', 'Brie#plisen', 'Gorgonzola#plisen', 'Čedar', 'Gouda (sýr)',
            'Ementál', 'Roquefort (sýr)#plisen', 'Mascarpone', 'Gruyère', 'Eidam', 'Niva (sýr)#plisen,cz', 'Hermelín (sýr)#plisen,cz',
            'Olomoucké tvarůžky#cz', 'Tvaroh', 'Cottage', 'Oštiepok', 'Brynza', 'Parenica', 'Korbáčik', 'Tavený sýr', 'Halloumi',
            'Pecorino (sýr)', 'Burrata', 'Grana Padano', 'Romadur', 'Panýr', 'Maasdam (sýr)', 'Tylžský sýr', 'Limburský sýr',
            'Blaťácké zlato#cz', 'Sýr s modrou plísní=Sýr s modrou plísní#plisen'
        ],
        more: []
    },
    ovoce: {
        known: [
            'Jablko#malvice', 'Hruška#malvice', 'Slivoň švestka=Švestka#peckovice', 'Třešně#peckovice', 'Višeň obecná=Višně#peckovice',
            'Meruňka obecná=Meruňka#peckovice', 'Broskev#peckovice', 'Nektarinka#peckovice', 'Jahoda#bobule', 'Malina#bobule',
            'Ostružina#bobule', 'Borůvka#bobule', 'Rybíz červený=Rybíz#bobule', 'Srstka angrešt=Angrešt#bobule',
            'Brusnice brusinka=Brusinka#bobule', 'Klikva#bobule', 'Bobule (réva)=Hroznové víno#bobule', 'Banán#tropicke',
            'Pomeranč#citrus', 'Mandarinka#citrus', 'Citron#citrus', 'Limeta#citrus', 'Grapefruit#citrus', 'Pomelo#citrus',
            'Ananas#tropicke', 'Mango#tropicke', 'Kiwi#tropicke', 'Papája obecná=Papája#tropicke', 'Avokádo#tropicke',
            'Kokosový ořech#orech,tropicke', 'Datle#tropicke', 'Fík', 'Granátové jablko', 'Kaki', 'Meloun', 'Vodní meloun',
            'Liči čínské=Liči#tropicke', 'Marakuja#tropicke', 'Pitahaya#tropicke', 'Karambola#tropicke', 'Kdouloň obecná=Kdoule#malvice',
            'Šípky', 'Oliva', 'Rozinka', 'Vlašský ořech#orech', 'Lískový ořech#orech', 'Mandle (plod)=Mandle#orech',
            'Ledvinovník západní=Kešu#orech', 'Řečík pistáciový=Pistácie#orech', 'Podzemnice olejná=Arašídy#orech',
            'Juvie ztepilá=Para ořech#orech', 'Kaštanovník setý=Jedlý kaštan#orech', 'Kumquat#citrus', 'Moruše#bobule',
            'Granny Smith#odruda', 'Golden Delicious#odruda', 'Jonagold#odruda', 'Idared#odruda'
        ],
        more: [
            'Durian#tropicke', 'Rambutan#tropicke', 'Kvajáva#tropicke', 'Mangostana lahodná=Mangostan#tropicke', 'Mišpule#malvice',
            'Godži#bobule', 'Temnoplodec=Aronie#bobule', 'Rakytník#bobule', 'Bez černý#bobule', 'Dřín#peckovice', 'Mochyně=Physalis#bobule',
            'Annona cherimola=Čerimoja#tropicke', 'Tamarind indický=Tamarind#tropicke', 'Opuncie mexická=Kaktusový fík#tropicke',
            'Ořechovec pekanový=Pekanový ořech#orech', 'Makadamový ořech#orech', 'Plantain#tropicke', 'Braeburn#odruda', 'Jonathan (odrůda jablek)#odruda',
            'Coxova reneta#odruda', 'Grávštýnské#odruda', 'Šampion (odrůda jablek)#odruda', 'Konference (hrušeň)#odruda',
            'Williamsova#odruda', 'Mandarinka klementina=Klementinka#citrus', 'Bílý rybíz#bobule', 'Lesní plody#bobule',
            'Sušené ovoce', 'Boskoopské#odruda', 'Spartan (odrůda jablek)#odruda', 'Topaz (odrůda jablek)#odruda',
            'Antonovka#odruda', 'Průsvitné letní#odruda', 'Alkmene#odruda', 'James Grieve#odruda', 'Oliva Kalamata'
        ]
    },
    zelenina: {
        known: [
            'Mrkev#koren', 'Lilek brambor=Brambor#hlizy', 'Rajče jedlé=Rajče#plod', 'Okurka setá=Okurka#plod', 'Paprika setá=Paprika#plod',
            'Cibule kuchyňská=Cibule#cibule', 'Česnek kuchyňský=Česnek#cibule', 'Hlávkové zelí=Zelí#kostal', 'Kapusta#kostal',
            'Květák#kostal', 'Brokolice#kostal', 'Kedluben#kostal', 'Růžičková kapusta#kostal', 'Locika setá=Hlávkový salát#list',
            'Špenát setý=Špenát#list', 'Miřík celer=Celer#koren', 'Petržel zahradní=Petržel#koren', 'Pastinák setý=Pastinák#koren',
            'Ředkvička#koren', 'Řepa červená#koren', 'Tykev obecná=Dýně#plod', 'Cuketa#plod', 'Lilek vejcoplodý=Lilek#plod',
            'Pór zahradní=Pórek#cibule', 'Chřest lékařský=Chřest', 'Artyčok', 'Kukuřice setá=Kukuřice#plod', 'Hrách setý=Hrách#lusten',
            'Fazol obecný=Fazole#lusten', 'Čočka jedlá=Čočka#lusten', 'Cizrna beraní=Cizrna#lusten', 'Sója luštinatá=Sója#lusten',
            'Povijnice batátová=Batáty#hlizy', 'Slunečnice topinambur=Topinambur#hlizy', 'Křen selský=Křen#koren',
            'Roketa setá=Rukola#list', 'Ředkev setá=Ředkev#koren', 'Fenykl obecný=Fenykl', 'Reveň kadeřavá=Rebarbora', 'Kapie#plod',
            'Chilli paprička#plod', 'Jarní cibulka#cibule', 'Čínské zelí#kostal', 'Pekingské zelí#kostal', 'Cibule šalotka=Šalotka#cibule',
            'Kapusta kadeřavá=Kadeřávek#kostal', 'Ibiškovec jedlý=Okra#plod', 'Hlíva ústřičná#houba', 'Pečárka dvouvýtrusá=Žampion#houba',
            'Lanýž#houba', 'Mangold#list', 'Tuřín#koren', 'Bob obecný=Bob#lusten'
        ],
        more: [
            'Romanesco (zelenina)#kostal', 'Patizon#plod', 'Hadí mord španělský=Černý kořen#koren', 'Vodnice#koren',
            'Jam (zelenina)=Jam#hlizy', 'Maniok jedlý=Maniok#hlizy', 'Kolokázie jedlá=Taro#hlizy', 'Lagenárie obecná=Lagenárie#plod',
            'Čekanka obecná=Čekanka#list', 'Houževnatec jedlý=Šiitake#houba', 'Nori#rasa', 'Kombu#rasa', 'Nakládané okurky',
            'Kvašáky', 'Kořenová zelenina#koren', 'Listová zelenina#list'
        ]
    },
    koreni: {
        known: [
            'Pepřovník černý=Pepř#koreni', 'Skořice#koreni', 'Hřebíček#koreni', 'Muškátový oříšek#koreni', 'Vanilka#koreni',
            'Šafrán#koreni', 'Kurkuma#koreni', 'Zázvor#koreni', 'Kmín kořenný=Kmín#koreni', 'Šabrej kmínovitý=Římský kmín#koreni',
            'Paprika (koření)=Mletá paprika#koreni', 'Kari koření#smes', 'Badyán#koreni', 'Kardamom (koření)=Kardamom#koreni',
            'Nové koření#koreni', 'Bobkový list#koreni', 'Jalovčinka#koreni', 'Koriandr setý=Koriandr#bylina', 'Bedrník anýz=Anýz#koreni',
            'Majoránka zahradní=Majoránka#bylina', 'Oregano#bylina', 'Bazalka pravá=Bazalka#bylina', 'Tymián obecný=Tymián#bylina',
            'Šalvěj rozmarýna=Rozmarýn#bylina', 'Šalvěj lékařská=Šalvěj#bylina', 'Máta peprná#bylina', 'Pažitka pobřežní=Pažitka#bylina',
            'Pelyněk estragon=Estragon#bylina', 'Libeček lékařský=Libeček#bylina', 'Meduňka lékařská=Meduňka#bylina',
            'Saturejka zahradní=Saturejka#bylina', 'Kopr vonný=Kopr#bylina', 'Sezam indický=Sezam#koreni', 'Mák setý=Mák#koreni',
            'Pepř kajenský=Kajenský pepř#koreni', 'Garam masála#smes', 'Česnek medvědí=Medvědí česnek#bylina',
            'Sůl (potravina)=Sůl#dochucovadlo', 'Cukr#dochucovadlo', 'Med#dochucovadlo'
        ],
        more: [
            'Škumpa=Sumach#koreni', "Za'atar#smes", 'Ras el-Hanout#smes', 'Pepř sečuánský=Sečuánský pepř#koreni',
            'Směs pěti koření#smes', 'Provensálské koření#smes', 'Černucha setá=Černucha#koreni', 'Hnědý cukr#dochucovadlo',
            'Javorový sirup#dochucovadlo', 'Pískavice řecké seno#koreni', 'Galgán#koreni', 'Citroník ježatý=Kafírová limetka#bylina',
            'Yzop lékařský=Yzop#bylina', 'Pelyněk pravý=Pelyněk#bylina', 'Lékořice lysá=Lékořice#koreni', 'Trachyspermum ammi=Ajwain#koreni',
            'Hořčičné semínko#koreni', 'Wasabi#koreni'
        ]
    },
    napoje: {
        known: [
            'Káva#kava', 'Espresso#kava', 'Cappuccino#kava', 'Caffè latte#kava', 'Latte macchiato#kava', 'Turecká káva#kava',
            'Vídeňská káva#kava', 'Frappé#kava', 'Ledová káva#kava', 'Caffè americano#kava', 'Ristretto#kava', 'Moccacino#kava',
            'Čaj#caj', 'Černý čaj#caj', 'Zelený čaj#caj', 'Bílý čaj#caj', 'Earl Grey#caj', 'Maté#caj', 'Rooibos#caj', 'Mačča#caj',
            'Boba čaj#caj', 'Ledový čaj#caj', 'Oolong#caj', 'Kombucha#caj', 'Masala chai#caj', 'Horká čokoláda',
            'Limonáda#limo', 'Kola (nápoj)=Kola#limo', 'Tonik#limo', 'Sodovka#limo', 'Minerální voda#limo', 'Džus#limo',
            'Smoothie', 'Mléčný koktejl#mleko', 'Mléko#mleko', 'Kefír#mleko', 'Podmáslí#mleko', 'Ajran#mleko', 'Lasí#mleko', 'Kvas',
            'Sojové mléko#mleko', 'Kokosové mléko', 'Kokosová voda', 'Energetický nápoj#limo', 'Grog'
        ],
        more: [
            'Pchu-er (čaj)#caj', 'Flatwhite#kava', 'Lungo#kava', 'Caffè macchiato#kava', 'Affogato#kava', 'Mandlové mléko#mleko',
            'Ovesné mléko#mleko', 'Root beer#limo', 'Jablečný mošt', 'Bylinný čaj#caj', 'Mátový čaj#caj', 'Šípkový čaj#caj',
            'Jasmínový čaj#caj', 'Lapsang souchong#caj', 'Assam#caj', 'Gjokuro#caj', 'Senča#caj', 'Genmaiča#caj', 'Salep',
            'Boza', 'Pepřovník opojný=Kava kava#caj', 'Tereré#caj', 'Irská káva#kava'
        ]
    },
    alkohol: {
        known: [
            'Pivo#pivo', 'Ležák (pivo)=Ležák#pivo', 'Pivo plzeňského typu#pivo', 'Pšeničné pivo#pivo', 'India Pale Ale#pivo',
            'Porter (pivo)=Porter#pivo', 'Stout#pivo', 'Ale#pivo', 'Bock (pivo)=Bock#pivo', 'Nealkoholické pivo#pivo', 'Radler#pivo',
            'Víno#vino', 'Červené víno#vino', 'Bílé víno#vino', 'Růžové víno#vino', 'Sekt#vino', 'Šampaňské víno=Šampaňské#vino',
            'Prosecco#vino', 'Portské víno#vino', 'Sherry#vino', 'Tokajské víno#vino', 'Burčák#vino', 'Svařené víno#vino',
            'Medovina', 'Cider', 'Sake', 'Whisky#destilat', 'Bourbon (whiskey)=Bourbon#destilat', 'Vodka#destilat', 'Rum#destilat',
            'Gin#destilat', 'Tequila#destilat', 'Koňak#destilat', 'Brandy#destilat', 'Absint#destilat', 'Slivovice#destilat',
            'Borovička (nápoj)=Borovička#destilat', 'Becherovka#liker', 'Ouzo#destilat', 'Rakije#destilat', 'Likér#liker',
            'Amaretto#liker', 'Limoncello#liker', 'Vaječný likér#liker', 'Grappa#destilat', 'Calvados#destilat', 'Mojito#koktejl',
            'Margarita#koktejl', 'Piña Colada#koktejl', 'Cuba Libre#koktejl', 'Bloody Mary#koktejl', 'Martini (koktejl)#koktejl',
            'Cosmopolitan (koktejl)#koktejl', 'Daiquiri#koktejl', 'Gin s tonikem#koktejl', 'Ryzlink rýnský#odruda', 'Chardonnay#odruda',
            'Sauvignon#odruda', 'Müller Thurgau#odruda', 'Veltlínské zelené#odruda', 'Tramín červený#odruda',
            'Pálava (odrůda révy vinné)#odruda', 'Rulandské modré#odruda', 'Merlot#odruda', 'Cabernet Sauvignon#odruda',
            'Frankovka#odruda', 'Svatovavřinecké#odruda', 'Zweigeltrebe#odruda', 'Ryzlink vlašský#odruda', 'Rulandské šedé#odruda'
        ],
        more: [
            'Lambik#pivo', 'Trapista (pivo)=Trapistické pivo#pivo', 'Pale ale#pivo', 'Weizenbock#pivo', 'Altbier#pivo', 'Ovocné pivo#pivo',
            'Cava#vino', 'Madeira (víno)=Madeira#vino', 'Marsala#vino', 'Vermut#vino', 'Mezcal#destilat', 'Armaňak#destilat',
            'Pisco (nápoj)=Pisco#destilat', 'Sodžu#destilat', 'Paj-ťiou#destilat', 'Pálenka#destilat',
            'Kirschwasser#destilat', 'Akvavit#destilat', 'Sambuca#liker', 'Pastis#liker', 'Raki#destilat', 'Skotská whisky#destilat',
            'Irská whiskey#destilat', 'Negroni#koktejl', 'Manhattan (nápoj)=Manhattan#koktejl', 'Old Fashioned#koktejl',
            'Tequila Sunrise#koktejl', 'Long Island Iced Tea#koktejl', 'Mai Tai#koktejl', 'Caipirinha#koktejl', 'Bellini (koktejl)#koktejl',
            'Mimosa (koktejl)#koktejl', 'Syrah#odruda', 'Malbec#odruda', 'Tempranillo#odruda', 'Sangiovese#odruda', 'Nebbiolo#odruda',
            'Grenache#odruda', 'Primitivo#odruda', 'Rulandské bílé#odruda', 'Modrý Portugal#odruda', 'Cabernet Moravia#odruda',
            'Neuburské#odruda', 'Sylvánské zelené#odruda', 'Muškát Ottonel#odruda', 'Chenin blanc#odruda', 'Beaujolais#vino',
            'Chianti#vino', 'Bordeaux (víno)=Bordeaux#vino'
        ]
    },
    kuchari: {
        known: [
            'Gordon Ramsay', 'Jamie Oliver', 'Zdeněk Pohlreich#cz', 'Anthony Bourdain', 'Julia Childová', 'Nigella Lawsonová#autor',
            'Paul Bocuse', 'Auguste Escoffier', 'Marie-Antoine Carême', 'Magdalena Dobromila Rettigová#autor,cz', 'Heston Blumenthal',
            'Alain Ducasse', 'Massimo Bottura', 'Jiří Babica#cz', 'Roman Vaněk#cz', 'Jan Punčochář#cz', 'Přemek Forejt#cz',
            'Ray Kroc#znacka', 'Henri Nestlé#znacka', 'Arthur Guinness#sladek', 'Josef Groll#sladek', 'Franz Sacher#cukrar',
            'Jean Anthelme Brillat-Savarin#gastronom', 'Mary Berry#autor', 'René Redzepi', 'Martha Stewartová#autor', 'Harland Sanders#znacka',
            'John Stith Pemberton#vynalezce'
        ],
        more: [
            'Roman Paulus#cz', 'Pavel Pospíšil#cz', 'Martin Černohorský (kuchař)#cz', 'Bartolomeo Scappi', 'François Pierre La Varenne',
            'George Crum', 'Elena Arzaková', 'Ainsley Harriott', 'Urbain Dubois', 'Christian Chu#cz', 'Nicolas Appert#vynalezce',
            'Antoine-Augustin Parmentier#gastronom', 'John Montagu, 4. hrabě ze Sandwiche#statnik', 'Ondřej Slanina#cz'
        ]
    }
};
