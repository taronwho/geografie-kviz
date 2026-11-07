# Vlastní ilustrace místo obecných ikon

Cíl: aby celá hra vypadala originálně. Ilustrace nahradí obecné ikony u titulů, lig, odznaků, dlaždic hry více hráčů, úvodu a v Google Play.
Celkem **46 obrázků**. Pořadí v seznamu je i doporučené pořadí (nejdřív to, co hráč vidí nejčastěji).

## Jak generovat

- **Formát:** čtverec (1:1), aspoň 1024 × 1024 px, PNG nebo JPG. Jen Google Play banner má 1024 × 500.
- **Pozadí:** jednolitá tmavě šedá **#2d3034** (stejně jako u dosavadních ikon). Skript `scripts/topic-icons.py` ji vyřízne.
- **Sova:** u obrázků se sovou vždy přiložte `branding/sova-original.jpg`, aby zůstala stejná postava.
- **Bez textu:** do obrázků nepište žádná písmena ani čísla (generátor je kazí a hra je česká).
- **Pojmenování:** soubor pojmenujte podle sloupce *Soubor* (např. `liga-zlato.png`) nebo mi je pošlete do chatu a napište, který je který.

**Společný úvod před každý prompt:**

> Cartoon sticker illustration in the same style as the attached owl mascot: thick dark maroon outline, flat bold colors with simple
> cel shading, slight cream sticker border around the whole object, centered, filling about 80 % of the frame, plain solid dark grey
> background (#2d3034), no text, no letters, no numbers, no watermark.

U sov přidejte: *Use the attached owl mascot as the character: keep its face, monocle, white eyebrows, golden feathers and wine-red robe
exactly as they are; only change the pose and props described below.*

## 1. Tituly (10 sov, Úrovně a tituly)

Teď 31 titulů sdílí 10 nálad sovy (Zvědavec je spící sova). Každá nová sova patří k několika titulům.

| Soubor | Tituly (úrovně) | Prompt |
|---|---|---|
| `sova-titul-1.png` | Zvědavec, Čtenář, Posluchač (1–6) | A small young owlet version of the mascot sitting cross-legged, curiously opening its first picture book, a tiny question mark sparkle above its head. |
| `sova-titul-2.png` | Učeň, Žák (7–11) | The owl as a schoolkid with a small leather school backpack and a big pencil under its wing, cheerful and eager. |
| `sova-titul-3.png` | Student, Zasvěcenec (12–17) | The owl as a student carrying a tall stack of books, a square academic cap tilted on its head, confident smile. |
| `sova-titul-4.png` | Znalec, Badatel, Zkoumatel (18–26) | The owl as an explorer-researcher with a big magnifying glass and an open field notebook, adventurous look. |
| `sova-titul-5.png` | Učenec, Vzdělanec, Erudit (27–35) | The owl as a scholar writing with a long quill on an unrolled parchment scroll, thoughtful expression. |
| `sova-titul-6.png` | Odborník, Specialista, Expert (36–44) | The owl as an expert in a white lab coat over its robe, pointing with a wing at a small floating chart with an upward arrow. |
| `sova-titul-7.png` | Mistr, Magistr, Doktor (45–55) | The owl in a festive graduation gown holding a rolled diploma with a red ribbon, proud pose. |
| `sova-titul-8.png` | Docent, Profesor, Akademik (56–67) | The owl as a professor standing behind a small wooden lectern, holding a pointer stick, wise and friendly. |
| `sova-titul-9.png` | Mudrc, Vševěd, Velemistr, Polyhistor (68–83) | The owl as an old sage with long white feather-beard, sitting on a pile of ancient books, a softly glowing open book floating above, small stars around. |
| `sova-titul-10.png` | Legenda, Strážce vědění, Orákulum, Archimudrc, Mudrlant (84–100) | The owl as a legendary grand master: golden crown with a small gem, laurel wreath, flowing royal cape over its robe, radiant golden aura behind it. |

## 2. Ligy (6 erbů, výzvy a žebříček)

| Soubor | Liga | Prompt |
|---|---|---|
| `liga-bronz.png` | Bronz | A heraldic shield badge made of warm bronze metal with a simple embossed owl head silhouette in the middle. |
| `liga-stribro.png` | Stříbro | The same heraldic shield badge in polished silver with the embossed owl head, two small laurel leaves at the bottom. |
| `liga-zlato.png` | Zlato | The same shield badge in shiny gold with the embossed owl head, laurel branches on both sides. |
| `liga-platina.png` | Platina | The same shield badge in platinum (cool white-teal metal) with the owl head, laurel branches and a small star on top. |
| `liga-diamant.png` | Diamant | The same shield badge made of sparkling light-blue diamond crystal facets with the owl head, laurel and sparkles. |
| `liga-mistr.png` | Mistr | The same shield badge in royal purple and gold with the owl head, a golden crown on top and laurel branches, glowing. |

Všechny erby ať mají stejný tvar štítu, liší se jen materiálem a ozdobami.

## 3. Odznaky (23 symbolů, Můj postup → Všechny odznaky)

Symbol se kreslí **bez kolečka medaile** – barevné kolečko (bronz, stříbro, zlato…) přidává hra sama. Jen předmět, výrazný a jednoduchý.

| Soubor | Skupina | Prompt |
|---|---|---|
| `odznak-odpovedi.png` | Správné odpovědi | A big green check mark sticker with a small sparkle. |
| `odznak-rada.png` | Správně v řadě | A bright yellow lightning bolt. |
| `odznak-serie.png` | Série dní | A cheerful orange flame. |
| `odznak-dny.png` | Dny ve hře | A small desk calendar with a check mark on one day. |
| `odznak-dokonale.png` | Dokonalé dny | A smiling sun with rays. |
| `odznak-dnes.png` | Dnešní otázky | A tear-off daily calendar page with a small star. |
| `odznak-bez-napovedy.png` | Bez nápovědy | A light bulb that is switched off with a small crossed circle next to it (no hint used). |
| `odznak-psani.png` | Psaní odpovědí | A quill pen writing on a small paper card. |
| `odznak-tezke.png` | Těžké otázky | A steep rocky mountain peak with a small flag on top. |
| `odznak-chyby.png` | Opravené chyby | A pencil with an eraser erasing a red cross. |
| `odznak-vyzvy.png` | Výzvy | Two crossed cartoon swords. |
| `odznak-vyhry.png` | Výhry ve výzvách | A golden trophy cup. |
| `odznak-vyhry-v-rade.png` | Výhry v řadě | Three small golden crowns stacked in a row. |
| `odznak-zalozene.png` | Založené výzvy | A sealed invitation envelope with a red wax seal. |
| `odznak-perfektni-vyzvy.png` | Dokonalé výzvy | A shining five-pointed gold star with a ribbon. |
| `odznak-uroven.png` | Úrovně | A square academic graduation cap with a tassel. |
| `odznak-poznane.png` | Poznané položky | An open book with small stars rising from its pages. |
| `odznak-vsestrannost.png` | Všestrannost | A globe surrounded by small orbiting icons (music note, atom, leaf, column). |
| `odznak-hvezdy.png` | Hvězdy mistrovství | A cluster of three gold stars. |
| `odznak-vsechna-temata.png` | Mistr všech témat | A golden crown studded with colorful gems. |
| `odznak-turnaje.png` | Turnaje | A large ornate golden tournament trophy with two handles. |
| `odznak-turnaj-postupy.png` | Vyhrané zápasy v turnajích | A small tournament bracket diagram with a golden arrow going up. |
| `odznak-tydenni-cile.png` | Týdenní cíle | An archery target with an arrow in the bullseye and a green check mark. |

## 4. Více hráčů a úvod (6 dlaždic)

| Soubor | Kde | Prompt |
|---|---|---|
| `turnaj.png` | Karta a dlaždice turnaje | A golden trophy standing on top of a small tournament bracket made of wooden planks. |
| `nahodny.png` | Náhodný soupeř | Two cartoon dice mid-roll with a small question mark sparkle. |
| `kod.png` | Zadat kód | A vintage key with a small paper tag attached to it. |
| `cile.png` | Cíle týdne (úvod) | A target board with three small green check marks around it. |
| `procvicovani.png` | Procvičování špatných odpovědí (Učení) | A small stack of flash cards with a circular green arrow around them. |
| `tip.png` | Tipy od Mudrlanta (okno tipu) | The owl mascot holding up a glowing light bulb with one wing, winking. *(sova – přiložit sova-original.jpg)* |

## 5. Google Play (1 banner)

| Soubor | Rozměr | Prompt |
|---|---|---|
| `google-play-banner.png` | 1024 × 500 | Wide banner: the owl mascot in the center-left, proudly holding a book, surrounded by floating colorful topic icons (globe, scroll, leaf, flask, atom, flag, music note, film clapper, palette, column, gem, trophy, winged helmet, open book), dark grey-maroon gradient background, empty space on the right third for a title. No text. |

Název „Mudrlant“ do banneru doplním sám (písmo aplikace).

## Co udělám po dodání

1. Uložím soubory do `branding/ikony/`, vyříznu pozadí (`python3 scripts/topic-icons.py …`) a u sov vyrobím barvy obleku (`python3 scripts/owl-robes.py`).
2. Zapojím je do hry:
   - tituly podle tabulky v kapitole 1,
   - erby lig ve výzvách a v žebříčku,
   - symboly odznaků do medailí (zamčené jako zašedlý náhled),
   - dlaždice v záložce Více hráčů, na úvodu a v Učení,
   - tip v okně tipu,
   - banner pro Google Play s nápisem.
3. Prověřím snímky na 360 až 412 px ve světlém i tmavém režimu a doplním testy, že všechny obrázky existují.
