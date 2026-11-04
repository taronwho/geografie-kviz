// Země osobnosti podle popisu z Wikidat („americký fyzik“ → Spojené státy americké).
// Státní příslušnost ve Wikidatech bývá kuriózní (Boris Johnson: USA, Willy Brandt: Norsko, Wellington: Portugalské království),
// proto platí první příslušnost, která souhlasí s přídavným jménem na začátku popisu; jinak se použije současný stát z přídavného jména.
// stem = začátek přídavného jména, modern = současný stát, ok = země (i historické státy), které s přídavným jménem souhlasí
const NATIONS = [
    ['americk', 'Spojené státy americké', /Spojené státy|USA|Americk|Třináct kolonií/],
    ['britsk', 'Spojené království', /Spojené království|Británie|Britsk|Anglie|Anglick|Skotsk|Skotsko|Wales|Irsko|Wessex/],
    ['anglick', 'Anglie', /Spojené království|Británie|Britsk|Anglie|Anglick|Skotsk|Skotsko|Wales|Wessex|Mercij|Northumbr|Kentsk/],
    ['skotsk', 'Skotsko', /Spojené království|Británie|Britsk|Skotsk|Skotsko/],
    ['irsk', 'Irsko', /Irsko|Irsk|Gaelsk|Spojené království/],
    ['francouzsk', 'Francie', /Francie|Francouz|Franská|Franck|Burgund|Navarr|Lotrinsk/],
    ['německ', 'Německo', /Německo|Německ|Prusk|Pruské|Svatá říše|Bavorsk|Württemb|Hesen|Hessen|Saské|Saský|Sasko|Bádensk|Hamburk|Výmarsk|nacistick|Rýnsk|Braniborsk|Kolínsk|Falck|Nasavsk|Habsbursk|Rakousk|Karolínsk|Franská/],
    ['rakousk', 'Rakousko', /Rakousk|Habsbursk|Předlitavsk|Svatá říše|Rakousko-Uhersko|Německo/],
    ['italsk', 'Itálie', /Itálie|Italsk|Florentsk|Benátsk|Papežsk|Toskánsk|Janovsk|Sienesk|Sienask|Milánsk|Sicilsk|Neapolsk|Savojsk|Sardinsk|Římsk|Řím/],
    ['španělsk', 'Španělsko', /Španělsk|Kastilsk|Aragonsk|Navarrsk/],
    ['portugalsk', 'Portugalsko', /Portugal/],
    ['nizozemsk', 'Nizozemsko', /Nizozemsk|Nizozemí/],
    ['belgick', 'Belgie', /Belgie|Belgick|Nizozemí/],
    ['švýcarsk', 'Švýcarsko', /Švýcarsk/],
    ['švédsk', 'Švédsko', /Švédsk/],
    ['norsk', 'Norsko', /Norsk|Dánsko-Norsko|Norsko/],
    ['dánsk', 'Dánsko', /Dánsk|Dánsko-Norsko/],
    ['finsk', 'Finsko', /Finsk/],
    ['polsk', 'Polsko', /Polsk|Polsko-litevsk|Litevsk/],
    ['maďarsk', 'Maďarsko', /Maďarsk|Uhersk|Rakousko-Uhersko/],
    ['rumunsk', 'Rumunsko', /Rumun|Valašsk|Sedmihradsk/],
    ['rusk', 'Rusko', /Rusko|Ruské|Ruská|Sovětsk|Moskevsk|Kyjevská Rus|Litevsk/],
    ['sovětsk', 'Sovětský svaz', /Sovětsk|Rusk/],
    ['ukrajinsk', 'Ukrajina', /Ukrajin|Sovětsk|Rusk|Polsko-litevsk/],
    ['česk', 'Česko', /Česk|České|Čechy|Rakousk|Habsbursk|Svatá říše|Československ/],
    ['československ', 'Československo', /Československ|Česk|Slovensk|Rakousk|Habsbursk/],
    ['slovensk', 'Slovensko', /Slovensk|Československ|Uhersk/],
    ['chorvatsk', 'Chorvatsko', /Chorvatsk|Jugoslávsk|Srbů, Chorvatů|Habsbursk|Rakousk/],
    ['srbsk', 'Srbsko', /Srbsk|Jugoslávsk|Srbů, Chorvatů/],
    ['řeck', 'Řecko', /Řecko|Řeck|Athény|Sparta|Théby|Makedonsk|Syrakusy|Řím|Římsk|Byzant/],
    ['čínsk', 'Čína', /Čín|Čching|Ming|Sung|Čou|Chan|Wej|Suej|Jüan|Šang|Tchaj-wan/],
    ['japonsk', 'Japonsko', /Japonsk/],
    ['kanadsk', 'Kanada', /Kanad/],
    ['australsk', 'Austrálie', /Austrál/],
    ['indick', 'Indie', /Indie|Indick|Britská Indie|Mughalsk|Maráthsk/]
];

const stemOf = (word) => {
    const clean = word.toLocaleLowerCase('cs');
    return /(ský|cký|ská|cká|ké|ký|ká)$/u.test(clean) ? NATIONS.filter(([stem]) => clean.startsWith(stem)).sort((a, b) => b[0].length - a[0].length)[0] : undefined;
};

// Národnosti z přídavných jmen na začátku popisu („maďarský a britský fyzik“, „anglický, skotský a irský král“, „rusko-belgický“);
// první slovo, které není národností (fyzik, král), řadu ukončí
export const nationsOf = (description) => {
    const words = String(description || '').replace(/\([^)]*\)/g, ' ').trim().split(/[\s,;]+/).filter(Boolean);
    const found = [];
    for (const word of words) {
        if (/^(a|i)$/iu.test(word)) continue;
        const parts = word.split('-').map(part => part.toLocaleLowerCase('cs'));
        // „rusko“, „americko“ (první část složeného přídavného jména) hledáme podle kmene
        const nations = parts.map((part, index) => stemOf(index < parts.length - 1 ? `${part}ký` : part)).filter(Boolean);
        if (!nations.length) break;
        found.push(...nations);
    }
    return found;
};

// Souhlasí země (i historický stát) s popisem? Bez rozpoznané národnosti v popisu souhlasí cokoli.
export const isLandConsistent = (description, land) => {
    const nations = nationsOf(description);
    return !nations.length || nations.some(([, , ok]) => ok.test(land || ''));
};

// Z příslušností vybere tu, která souhlasí s popisem; jinak současný stát z popisu, jinak první příslušnost
export const landByDescription = (description, lands) => {
    const list = (lands || []).filter(Boolean);
    const nations = nationsOf(description);
    if (!nations.length) return list[0];
    const fitting = list.find(land => nations.some(([, , ok]) => ok.test(land)));
    return fitting || nations[0][1];
};

// Země filmu: napřed země z popisu v pořadí přídavných jmen („britsko-americký film“ → Spojené království, Spojené státy americké),
// pak ostatní; Wikidata je řadí náhodně (Pro hrst dolarů: Španělsko, USA – a Itálie chybí)
export const landsByDescription = (description, lands) => {
    const list = (lands || []).filter(Boolean);
    const lead = nationsOf(description).map(([, modern, ok]) => list.find(land => ok.test(land)) || modern);
    return [...new Set([...lead, ...list])];
};
