# Doplňky Mudrlanta za mistrovství v tématech

Ke každému ze 14 témat jeden vtipný doplněk. Hráč ho získá, když je v tématu zběhlý. Doplňky jsou ve čtyřech stávajících místech
(hlava, obličej, krk, ruka), takže se vybírají stejně jako ostatní: v každém místě nejvýš jeden.

Ke každému tématu přibyly ještě dva kusy na jiných místech, aby šel složit celý look v tématu (sady, prompty č. 177–204 v `docs/OBRAZKY.md`, oddíl 13; stav níže v oddíle Sady k tématům).

## Jak se doplněk získá

Dvě cesty, platí ta, která přijde dřív:

1. **Mistrovství**: 3 hvězdy v tématu (60 různých poznaných položek). Hvězdy už hra počítá.
2. **Série v tématu**: 12 správných odpovědí v řadě v daném tématu (nové počítadlo na téma, nezačíná znovu každý den).

Proč tak: 3 hvězdy je dosažitelné v každém tématu (5. hvězda je za 300 položek a ne každé téma je tak velké),
a série dává možnost i hráči, který nehraje dlouho, ale umí. Doplněk je tedy odměna za zběhlost, ne za čas strávený hraním.
Odznaky a XP za série v tématu (5 / 10 / 20 v řadě) by šly navázat na stejné počítadlo.
Pátá hvězda (plné mistrovství) zatím dává jen odznak Mistr oboru (zlatá varianta doplňku není hotová a hra ji neslibuje).

## Rozdělení do míst (vyváženo spolu s existujícími doplňky)

| Místo | Nové doplňky | Stávající | Celkem |
|---|---|---|---|
| Hlava | Okřídlená helma (Mytologie), Horolezecká přilba (Geologie), Baret (Výtvarné umění), Sportovní čelenka (Sport) | květina, koruna, sluchátka, vavřín | 8 |
| Obličej | Laboratorní brýle (Chemie), Einsteinův knír (Fyzika), 3D brýle (Film) | brýle, sluneční brýle | 5 |
| Krk | Kompas (Zeměpis), Svinovací metr (Architektura) | motýlek, šála, medaile | 5 |
| Ruka | Vlaječka (Vlajky), Svitek (Historie), Síťka na motýly (Biologie), Mikrofon (Hudba), Brk a kalamář (Literatura) | lupa | 6 |

Ruka byla prázdná, proto jich tam je nejvíc. Hráč si může vybrat nejvýš jeden doplněk na místo, takže pergamen v ruce
a Einsteinův knír jdou spolu, ale pergamen a mikrofon ne. To je záměr.

## Prompty na obrázky

Postup je stejný jako u dosavadních doplňků (`scripts/owl-accessories-sady.py`): vždy přiložte původní obrázek sovy
(`branding/sova-original.jpg`) a zadejte prompt. Společný úvod, který patří před každý prompt:

> Edit the attached image. Keep the owl mascot EXACTLY as it is: same pose, same proportions, same colors, same outline style,
> same flat dark background. Do not redraw, move or recolor the owl. Only ADD the accessory described below, drawn in the same
> cartoon sticker style with the same thick dark outline and the same lighting, sitting naturally on the owl.
> The accessory should be mostly one dominant color so it can be recolored later. Do not add anything else.

A pak jedna z těchto částí:

1. **Zeměpis, krk, `kompas`**: A round brass pocket compass with a small glass face and a red-and-white needle, hanging on a thin chain around the owl's neck, resting on its chest.
2. **Vlajky, ruka, `vlajka`**: A small wooden flag pole held in the owl's wing like a flag-bearer, with a small rectangular waving flag in a simple solid blue color (no real national flag, no symbols).
3. **Historie, ruka, `svitek`**: A partly unrolled parchment scroll with a red wax seal and ribbon, held in the owl's wing as if reading a decree.
4. **Mytologie, hlava, `helma`**: A shiny ancient Greek bronze helmet with a tall crest and small white feathered wings on both sides, worn on the owl's head (leave the ear tufts poking out if possible).
5. **Biologie, ruka, `sitka`**: A butterfly net with a long wooden handle and a round mesh hoop, held in the owl's wing, with one small colorful butterfly sitting on the net rim.
6. **Geologie, hlava, `prilba`**: A yellow miner's hard hat with a small round headlamp on the front, worn on the owl's head, with a tiny sparkling gem stuck on the hat.
7. **Chemie, obličej, `lab-bryle`**: Large clear laboratory safety goggles with a thick elastic strap, covering the owl's eyes, with a faint green tint on the lenses and a tiny bubbling flask reflection.
8. **Fyzika, obličej, `knir`**: A big fluffy white walrus mustache like Albert Einstein, placed under the owl's beak, plus a few wild white tufts of hair on the sides of the face. Keep it funny and exaggerated.
9. **Výtvarné umění, hlava, `baret`**: A floppy French painter's beret tilted on the owl's head, with a small stalk on top, and one tiny paint smudge on it.
10. **Architektura, krk, `metr`**: A yellow retractable tape measure worn around the owl's neck like a scarf, a few centimetres of the tape unrolled with a small tip.
11. **Hudba, ruka, `mikrofon`**: A vintage retro microphone held up in the owl's wing, with a small music note floating next to it.
12. **Literatura, ruka, `brk`**: A tall white quill feather pen held in the owl's wing, with a small round inkwell with ink next to it (both attached to the wing area, no table).
13. **Film, obličej, `3d-bryle`**: Classic cinema 3D glasses with a thin cardboard frame and one red and one blue lens, worn over the owl's eyes.
14. **Sport, hlava, `celenka`**: A sporty fabric headband with two stripes across the owl's forehead and a tiny gold star on the front.

Poznámky pro výběr obrázku:
- Pozadí zůstane stejné tmavé. Skript doplněk vyřízne z rozdílu proti původní sově.
- Doplněk by neměl zasahovat do míst, kde je jiný doplněk stejného místa (nemají se kombinovat, takže to nevadí).
- Ruka znamená křídlo na pravé straně sovy (z pohledu diváka vlevo). Stávající lupa je jako vzor.
- Zvlášť vyřízněte i obrázky ikon (`branding/doplnky-ikony/<id>.jpg`, doplněk na tmavém pozadí) stejně jako dosud.

## Stav

Hotovo: 14 doplňků má vrstvy a ikony (`scripts/owl-accessories-sady.py`, `scripts/owl-accessory-icons.py`), jsou v katalogu `look.js` a odemykají se odznakem
`zbehly-<téma>` (`quiz-core.js`: 12 správných v řadě v tématu, nebo 3 hvězdy mistrovství). Série v tématu se počítá v `counters.topicRun` / `topicBest`.
Barvy a vlastní odstín fungují jen na barevných částech (bílý knír, šedý mikrofon a podobně se téměř nezmění).

## Sady k tématům (č. 177–204): stav

Dodáno a zapojeno 27 z 28 kusů. Kus sady se odemkne odznakem tématu: první nový kus (v tabulce níže vlevo) odznakem 3. stupně
(300 správných odpovědí v tématu, `tema-<téma>-300`), druhý odznakem 5. stupně (1000 správných, `tema-<téma>-1000`). Oslava odznaku
i jeho popis odměnu zmíní samy (`Look.badgeRewardText`), okno Mistrovství tématu (Můj postup) ukazuje celou sadu tématu s tím,
jak se který kus získá, a kolik správných odpovědí v tématu hráč má (`Look.topicSet`).

Celý look tématu (všechny kusy sady najednou, `Look.activeTopicLook`, názvy `Look.TOPIC_LOOKS`): zlatý štítek pod sovou v Nastavení → Mudrlant
a v Profilu hráče (z uložené sovy, `MudrlantOwl.lookOf`), oslava poprvé (zařízení si pamatuje `mudrlant.looks`), v Mistrovství tématu řádek looku
s tlačítkem Obléknout celou sadu (`Look.wearTopicSet`) a v Albu sbírky (sekce Doplňky) přehled Sady témat, který se do procent nepočítá.

| Téma | Za 300 správných | Za 1000 správných |
|---|---|---|
| Zeměpis | Cestovatelský klobouk (hlava, místo čepice) | Globus (ruka, nová ruka) |
| Vlajky | Námořnická čepice (hlava, místo čepice) | Signální praporky (krk) |
| Historie | **Dvourohý klobouk – čeká na obrázek** (č. 181; odznak zatím nic nedává) | Krejzlík (krk) |
| Mytologie | Blesk vládce hromu (ruka, nová ruka) | Zlaté rouno (krk) |
| Biologie | Ptačí hnízdo (hlava, místo čepice) | Dalekohled (krk) |
| Geologie | Geologické kladívko (ruka, drží ho druhá ruka, prst zůstává) | Krystal na šňůrce (krk) |
| Chemie | Baňka s lektvarem (ruka, nová ruka) | Po výbuchu (hlava, kouř nad čepicí) |
| Fyzika | Magnet (ruka, nová ruka) | Newtonovo jablko (hlava, na čepici) |
| Výtvarné umění | Malířská paleta (ruka, nová ruka) | Kroucený knír (obličej, monokl zůstává) |
| Architektura | Stavební plány (ruka, nová ruka) | Tesařská tužka (hlava, za uchem, čepice zůstává) |
| Hudba | Hvězdné brýle (obličej) | Elektrická kytara (krk) |
| Literatura | Komínek knih (hlava, místo čepice) | Půlměsícové brýle (obličej) |
| Film | Kornout popcornu (ruka, nová ruka) | Filmový pás (krk) |
| Sport | Píšťalka (krk) | Vítězný pohár (ruka, nová ruka) |

Technicky: obrázky jsou v `branding/doplnky/<id>.jpg` (dodané PNG s průhledným pozadím položené na tmavé pozadí #2d3034), vrstvy, barvy
a ikony dělá `scripts/owl-accessories-sady.py` (sada `SETS`: sova na obrázcích je bez monoklu, zarovnání podle významných bodů SIFT, nová ruka
a nepřebarvitelné části ve vrstvě `<id>-zaklad.webp`, `FIXED_SPLIT`) a `scripts/owl-accessory-icons.py` (ikona z vrstvy).
Čeká jediný kus: **dvourohý klobouk** (`dvourohy-klobouk`, Historie, hlava, za 300 správných). Po dodání stačí uložit obrázek, přidat id do `SETS`
(a `HATS`, nahrazuje-li čepici), spustit oba skripty a přidat položku do `ACCESSORIES` v `look.js` s `badge: 'tema-historie-300'`.
Kompletní sada (název looku v Profilu, sekce Sady témat v albu) zatím zapojená není.

## Původní plán (pro zajímavost)

1. Přidat 14 záznamů do `ACCESSORIES` v `look.js` (nová podmínka odemknutí `topic: { id, stars: 3, streak: 12 }`).
2. Počítadlo série správných odpovědí po tématech v `progress.counters` a text „Zbývá …“ u zamčeného doplňku.
3. Vrstvy a ikony skriptem (`scripts/owl-accessories-sady.py`, `scripts/owl-accessory-icons.py`), barevné varianty a seznam v `sw.js` / `pages.yml`.
4. Testy: katalog (každý doplněk má obrázky), odemykání hvězdami i sérií, e2e výběr v Nastavení.

Skupina Zběhlost má od vyvážení odznaků pět stupňů (5, 12, 25, 50 a 100 správných v řadě v tématu); doplněk dává jen stupeň 12 (id `zbehly-<téma>`),
ostatní stupně (`zbehly-<téma>-5`, `-25`, `-50`, `-100`) odměnu nemají.
