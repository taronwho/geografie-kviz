// Reakce, procesy a pojmy chemie pro data/chemie.json: kategorie „reakce“ a „pojmy“.
// Kandidáty dává jednak druh položky ve Wikidatech (jmenné reakce, skupiny látek, slitiny, metody), jednak ruční seznam názvů
// článků na české Wikipedii – které článek nemají (nebo je to rozcestník), se vynechají.

// [třída ve Wikidatech (přímá P31), nejmenší počet jazykových verzí článku, okruh]
export const CONCEPT_CLASSES = [
    ['Q1049494', 12, 'jmenne-reakce'], ['Q137796968', 8, 'typy-reakci'], ['Q3382117', 1, 'typy-reakci'], ['Q2281940', 15, 'prumyslove-procesy'],
    ['Q47154513', 30, 'skupiny-latek'], ['Q119892838', 25, 'slitiny-smesi'], ['Q4751159', 25, 'metody'], ['Q834028', 40, 'metody'],
    ['Q898987', 1, 'metody'], ['Q36382', 1, 'zakony']
];

export const CONCEPT_TITLES = {
    'typy-reakci': ['Oxidace', 'Hoření', 'Koroze', 'Hydrolýza', 'Esterifikace', 'Polymerace', 'Polykondenzace', 'Srážecí reakce', 'Hydrogenace', 'Halogenace', 'Chlorace', 'Nitrace', 'Sulfonace',
        'Alkylace', 'Acylace', 'Dehydratace', 'Dekarboxylace', 'Zmýdelnění', 'Radikálová reakce', 'Elektrolýza', 'Tepelný rozklad', 'Disproporcionace', 'Kondenzace (chemie)', 'Substituce (chemie)',
        'Adiční reakce', 'Eliminační reakce', 'Kvašení', 'Fermentace', 'Karboxylace', 'Hydratace', 'Dimerizace', 'Oxidační činidlo', 'Redukční činidlo', 'Exotermická reakce', 'Endotermická reakce',
        'Fotochemická reakce', 'Katalýza', 'Autokatalýza', 'Chemická syntéza', 'Hydroxylace', 'Alkoholové kvašení', 'Spalování', 'Pražení', 'Nukleofilní substituce', 'Elektrofilní substituce', 'Oxidace alkoholů',
        'Polymerizace', 'Substituční reakce', 'Acidobazická reakce', 'Fotosyntéza', 'Chemiluminiscence', 'Termolýza', 'Pasivace', 'Řetězová reakce', 'Transesterifikace',
        'Nitrosace', 'Dehydrogenace', 'Dehydrohalogenace', 'Methylace', 'Acetylace', 'Glykosylace', 'Cykloadice', 'Pericyklická reakce', 'Výbuch', 'Deflagrace',
        'Detonace', 'Chelatace', 'Ionizace', 'Zplyňování', 'Denaturace', 'Biodegradace', 'Oxidační adice'],
    'prumyslove-procesy': ['Vysoká pec', 'Bessemerův proces', 'Ostwaldův proces', 'Solvayův proces', 'Kontaktní způsob výroby kyseliny sírové', 'Hallův–Héroultův proces', 'Rafinace', 'Frakční destilace',
        'Zkapalňování plynů', 'Pyrolýza', 'Hydrometalurgie', 'Pyrometalurgie', 'Galvanické pokovování', 'Eloxování', 'Vulkanizace', 'Haberův–Boschův proces', 'Krakování', 'Hydrokrakování', 'Reformování',
        'Bessemerův konvertor', 'Kontaktní proces', 'Siemensova–Martinova pec', 'Flotace', 'Hydrodesulfurizace', 'Pudlovna', 'Czochralského metoda', 'Odsolování',
        'Chlorování vody', 'Cativa proces', 'Clausův proces', 'Krollův proces', 'Výroba oceli', 'Výroba piva', 'Výroba vína'],
    'zakladni-pojmy': ['Atom', 'Molekula', 'Iont', 'Mol', 'Chemický prvek', 'Chemická sloučenina', 'Chemická vazba', 'Kovalentní vazba', 'Iontová vazba', 'Kovová vazba', 'Vodíková vazba', 'Elektronegativita',
        'Valenční elektrony', 'Oxidační číslo', 'Izomerie', 'Chiralita', 'Hybridizace (chemie)', 'Aromaticita', 'Periodická tabulka prvků', 'Protonové číslo', 'Nukleonové číslo', 'Izotop', 'Radioaktivita',
        'Poločas rozpadu', 'Relativní atomová hmotnost', 'Molární hmotnost', 'Avogadrova konstanta', 'Látkové množství', 'PH', 'Pufr', 'Rozpustnost', 'Koncentrace', 'Elektrolyt', 'Indikátor (chemie)',
        'Chemická rovnováha', 'Reakční kinetika', 'Aktivační energie', 'Entalpie', 'Elektrochemie', 'Galvanický článek', 'Elektrochemická řada napětí kovů', 'Katalyzátor', 'Inhibitor',
        'Enzym', 'Polymer', 'Plast', 'Kaučuk', 'Roztok', 'Směs', 'Suspenze', 'Emulze', 'Koloid', 'Aerosol', 'Gel', 'Kyselina', 'Zásada', 'Sůl', 'Lewisova kyselina', 'Amfoterní látky',
        'Valenční vrstva', 'Orbital', 'Elektronová konfigurace', 'Kvantová chemie', 'Organická chemie', 'Anorganická chemie', 'Fyzikální chemie', 'Analytická chemie', 'Biochemie',
        'Alchymie', 'Kámen mudrců', 'Flogiston', 'Hmotnostní zlomek', 'Stechiometrie', 'Dipól', 'Van der Waalsovy síly', 'Radikál', 'Funkční skupina', 'Homologická řada'],
    'metody': ['Chromatografie', 'Destilace', 'Filtrace', 'Krystalizace', 'Extrakce', 'Sublimace', 'Titrace', 'Elektroforéza', 'Centrifugace', 'Sedimentace', 'Rektifikace', 'Infračervená spektroskopie',
        'Atomová absorpční spektrometrie', 'Rentgenová krystalografie', 'Plynová chromatografie', 'Polarografie', 'Kolorimetrie', 'Gravimetrie', 'Chemická analýza', 'Plamenová zkouška', 'Erlenmeyerova baňka',
        'Byreta', 'Pipeta', 'Odměrný válec', 'Odměrná baňka', 'Kádinka', 'Zkumavka', 'Petriho miska', 'Dělicí nálevka', 'Bunsenův kahan', 'Exsikátor', 'Chladič', 'Lihový kahan', 'Třecí miska', 'PH-metr',
        'Vodní lázeň', 'Digestoř', 'Autokláv', 'Centrifuga', 'Kippův přístroj', 'Soxhletův extraktor', 'Liebigův chladič', 'Spektrofotometr', 'Analytické váhy', 'Laboratorní sklo',
        'Spektroskopie', 'Hmotnostní spektrometrie', 'Ultrafialová spektroskopie', 'Ramanova spektroskopie', 'Lakmusový papírek', 'Kalorimetrie', 'Kalorimetr', 'Hustoměr', 'Refraktometr', 'Polarimetr',
        'Rotační vakuová odparka', 'Zábrusové sklo', 'Datování uhlíkem 14C', 'Nálevka', 'Büchnerova nálevka', 'Filtrační papír', 'Střička', 'Destilační baňka', 'Muflová pec',
        'Papírová chromatografie', 'Chromatografie na tenké vrstvě', 'Afinitní chromatografie', 'Dekantace', 'Adsorpce', 'Dialýza', 'Reverzní osmóza', 'Lyofilizace',
        'Kvantitativní analýza', 'Manganometrie', 'Konduktometrie', 'Potenciometrie', 'Elektronová paramagnetická rezonance', 'Atomová emisní spektrometrie',
        'Kapilární elektroforéza', 'Pyknometr', 'Viskozimetr', 'Plynový kahan'],
    'zakony': ['Zákon zachování hmotnosti', 'Avogadrův zákon', 'Boyleův–Mariottův zákon', 'Charlesův zákon', 'Hessův zákon', 'Raoultův zákon', 'Henryho zákon', 'Le Chatelierův princip', 'Pauliho vylučovací princip',
        'Hundovo pravidlo', 'Faradayovy zákony elektrolýzy', 'Stavová rovnice ideálního plynu', 'Lambertův–Beerův zákon', 'Nernstova rovnice', 'Arrheniova rovnice', 'Daltonova atomová teorie',
        'Rutherfordův model atomu', 'Bohrův model atomu', 'Markovnikovovo pravidlo', 'Hückelovo pravidlo', 'Oktetové pravidlo', 'Gibbsova energie', 'Gay-Lussacův zákon',
        'Daltonův zákon parciálních tlaků', 'Gibbsův zákon fází', 'Periodický zákon', 'Thomsonův model atomu', 'Teorie VSEPR', 'Arrheniova teorie kyselin a zásad',
        'Brønstedova–Lowryho teorie kyselin a zásad', 'Lewisova teorie kyselin a zásad', 'Zajcevovo pravidlo', 'Woodwardova–Hoffmannova pravidla', 'Van der Waalsova rovnice',
        'Teorie aktivovaného komplexu', 'Teorie krystalového pole', 'Clausiova–Clapeyronova rovnice'],
    'slitiny-smesi': ['Ocel', 'Bronz', 'Mosaz', 'Litina', 'Dural', 'Amalgám', 'Pájka', 'Nerezová ocel', 'Tombak', 'Slitina', 'Sklo', 'Keramika', 'Cement', 'Beton', 'Sádra', 'Vápno', 'Porcelán',
        'Plexisklo', 'Teflon', 'Bakelit', 'Nylon', 'Polystyren', 'Polyvinylchlorid', 'Epoxidová pryskyřice', 'Guma', 'Asfalt', 'Ropa', 'Zemní plyn', 'Benzín', 'Nafta', 'Petrolej']
};

// Kategorie podle okruhu
export const GROUP_CATEGORY = {
    'jmenne-reakce': 'reakce', 'typy-reakci': 'reakce', 'prumyslove-procesy': 'reakce',
    'skupiny-latek': 'pojmy', 'slitiny-smesi': 'pojmy', 'metody': 'pojmy', 'zakony': 'pojmy', 'zakladni-pojmy': 'pojmy', 'izotopy': 'pojmy'
};
