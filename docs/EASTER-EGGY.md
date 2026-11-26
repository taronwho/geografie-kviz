# Easter eggy (odložené)

Návrhy skrytých vtípků a animací Mudrlanta. Odsouhlasené jako nápad (líbily se víceméně všechny, nejvíc animované), realizace
je odložená. Až se k nim vrátíme, začít podle oddílu „Stav a postup“ níže.

## Návrhy

**Skryté akce s Mudrlantem**
1. **Spadlý monokl:** po 7 rychlých klepnutích na sovu jí vypadne monokl, odkutálí se a sova po něm šmátrá: „Kde mám ten monokl? Bez něj vidím jen poloviční pravdu!“
2. **Zatřes telefonem:** sova se zamotá, má spirálky v očích: „Zemětřesení? To je otázka pro Geologii, ne pro mě!“
3. **Usínající sova:** po minutě bez dotyku Mudrlant klimbá, vylétají písmena Z; po klepnutí se lekne a srovná monokl.
4. **Sova vzhůru nohama:** po otočení telefonu displejem dolů a zpět visí z horního okraje jako netopýr: „Jen trénuju jiný úhel pohledu.“

**Kódy a tajná slova**
5. **Odpověď „42“:** „Správná odpověď na všechno, jen bohužel ne na tuhle otázku.“ Nepočítá se jako chyba (jednou denně).
6. **Odpověď „Mudrlant“:** sova se začervená: „Lichotíš mi, ale tohle opravdu nejsem já.“
7. **Konami kód** (↑↑↓↓←→←→): 30 s retro 8bitový vzhled s pixelovou sovou.
8. **Přezdívka Sokrates/Platón:** „Takže dnes filozofujeme? Já vím, že nic nevím… kromě 100 000 odpovědí.“

**Čas a kalendář**
9. **Půlnoční sova** (0:00–0:05): sova s lampičkou: „Sovy jsou v noci nejchytřejší. Ty prý taky?“ + jednorázový odznak Noční sova.
10. **1. dubna:** odpovědi v Kvízu dne zrcadlově otočené, po klepnutí se otočí: „Apríl! Monokl jsem měl taky naopak.“
11. **Pí den (14. 3.):** Bleskovka má 3,14 s navíc, sova má na čepici koláč.
12. **Narozeniny hráče:** párty klobouček místo čepice, konfety u správných odpovědí.

**Hra a bossové**
13. **Stínový Mudrlant (17. boss):** po poražení všech 16 bossů jednou ročně černobílá sova, ptá se na otázky, které hráč dřív pokazil.
14. **Uražený Šéfkuchař:** 3 správné z Jídla za sebou v souboji: „To jsi opsal z mojí kuchařky!“
15. **Utíkající Šroubek:** robot Šílenému Vynálezci občas přejde přes obrazovku; klepnutí = +1 život.

**Data a otázky**
16. **Otázka, která neexistuje:** jednou za 500 otázek „Která z těchto odpovědí je správná?“, všechny možnosti „Tato“.
17. **Mrkající drak:** u vlajky Bhútánu se drak pohne a mrkne.
18. **Řetízek k monoklu:** celá Řetězovka bez Záchrany → články se spojí v řetízek, který si Mudrlant připne k monoklu.

**Spojující odměna:** skrytý odznak **Lovec tajemství** („??? (zbývá najít 17)“), za všechny zlatý monokl pro Mudrlanta.

## Stav a postup

- **Animace = vrstvy očí + pohyb v kódu.** Sova je jeden obrázek (barvy taláru, 5 stupňů stárnutí, s monoklem i bez); výrazy se
  dělají průhlednou vrstvou jen s očima, pohyb (klimbání, třes, poskok, otočení) a efekty (Z, hvězdičky, konfety) dělá kód (CSS).
  Animace musí respektovat „omezit pohyb“ a nesmí se ukázat uprostřed otázky.
- **Skript:** `python3 scripts/owl-expressions.py [výraz …] [--preview=soubor.png]` vyrobí z `branding/vyrazy/<výraz>-vek<n>.jpg`
  vrstvy `icons/vyrazy/<výraz>-vek<n>[-monokl].webp`; barvy taláru pak `ONLY=… python3 scripts/owl-robes.py` (seznam souborů ve vyrazy).
  Zdroj pro generování: `branding/sova-bez-monoklu.jpg` (stupeň 1) a `branding/sova-vek-2.jpg` … `sova-vek-5.jpg`.
- **Hotové výrazy:** spánek (1–5), překvapení (1–5), spirálky (1–5), mrknutí (1–5), uražený pohled (1–5), srdíčka (1, 2, 4, 5).
- **Chybí:** srdíčka pro stupeň 3; překvapení stupně 1 přegenerovat (generátor přebarvil obočí na šedé, má zůstat hnědé).
- **Ještě nevygenerováno:** samostatný robot Šroubek (2–3 fáze chůze + mávání), lampička, párty klobouček, zlatý monokl (doplňky),
  Stínový Mudrlant (portrét + aréna; fáze filtrem), ikony odznaků Lovec tajemství a Noční sova.
- **Mezifáze** (napůl zavřené oči apod.): u spánku podle uživatele zatím netřeba; případně doplnit později.
- Ukázka usínání (GIF) potvrdila, že pohyb + vrstva očí působí jako animace.
