# Doplňky Mudrlanta za mistrovství v tématech

Ke každému ze 14 témat jeden vtipný doplněk. Hráč ho získá, když je v tématu zběhlý. Doplňky jsou ve čtyřech stávajících místech
(hlava, obličej, krk, ruka), takže se vybírají stejně jako ostatní: v každém místě nejvýš jeden.

## Jak se doplněk získá

Dvě cesty, platí ta, která přijde dřív:

1. **Mistrovství**: 3 hvězdy v tématu (60 různých poznaných položek). Hvězdy už hra počítá.
2. **Série v tématu**: 12 správných odpovědí v řadě v daném tématu (nové počítadlo na téma, nezačíná znovu každý den).

Proč tak: 3 hvězdy je dosažitelné v každém tématu (5. hvězda je za 300 položek a ne každé téma je tak velké),
a série dává možnost i hráči, který nehraje dlouho, ale umí. Doplněk je tedy odměna za zběhlost, ne za čas strávený hraním.
Odznaky a XP za série v tématu (5 / 10 / 20 v řadě) by šly navázat na stejné počítadlo.
Pátá hvězda (plné mistrovství) může odemknout jen zlatou variantu doplňku (barva „Zlatá“), aby bylo kam růst.

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

Postup je stejný jako u dosavadních doplňků (`scripts/owl-accessories.py`): vždy přiložte původní obrázek sovy
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

## Co udělám v kódu, až budou obrázky

1. Přidat 14 záznamů do `ACCESSORIES` v `look.js` (nová podmínka odemknutí `topic: { id, stars: 3, streak: 12 }`).
2. Počítadlo série správných odpovědí po tématech v `progress.counters` a text „Zbývá …“ u zamčeného doplňku.
3. Vrstvy a ikony skriptem (`scripts/owl-accessories.py`, `scripts/owl-accessory-icons.py`), barevné varianty a seznam v `sw.js` / `pages.yml`.
4. Testy: katalog (každý doplněk má obrázky), odemykání hvězdami i sérií, e2e výběr v Nastavení.
