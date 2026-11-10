Ruční prohlídka vykreslených map (listopad 2026): podkladová mapa světa po oblastech, mapa Česka a výsledky asi 120 otázek všech
druhů. Tento soubor (`reports/audit-mapy-poznamky.md`) se do zprávy vkládá beze změny; po opravě záznam smažte.

### Obrysy k opravě (`scripts/build-mapa-tvary.mjs`)

- **Cordillera Blanca** (Q804330): obrys měří přes 1 600 km a vede podél celého peruánského pobřeží; pohoří má 200 km – je to obrys jiného
  objektu (nejspíš Západní Kordillery).
- **Witwatersrand** (Q587808): obrys měří 495 km, hřbet má 56 km.
- **Jang-c’-ťiang** (Q5413): chybí horní tok, čára začíná 710 km od bodu položky (pramen v Tibetu).
- **Nil** (Q3392): jen úsek od Chartúmu po Káhiru (2 562 z 6 650 km), nedosahuje ke Středozemnímu moři ani proti proudu k Viktoriinu jezeru.
- **Columbia** (Q2251): čára obsahuje i přítok Snake (větev do Idaha a Wyomingu) a má tři nesouvislé části.
- **Amazonka** (Q3783), **Ubangi** (Q171649), **Fraser** (Q269710), **Atbara** (Q753897): čára má méně než polovinu délky řeky.
- **Mackenzie** (Q3411): čára pokračuje přes Velké Otročí jezero, je přerušená (58 km) a nedosahuje k Beaufortovu moři.
- **Labe** (Q1644) na mapě Česka: na horním toku jsou navíc krátké větve vedle hlavního toku.
- **Benue** (Q204806), **Dráva** (Q171009), **Beni** (Q142604), **Orchon gol** (Q237099): konec čáry není u řeky nebo jezera, do kterých
  ústí (může chybět i kus čáry té druhé řeky – Niger, Dunaj).
- **Ostrovy Riau** (Q2223): obrys je mořská oblast 255 000 km² (provincie má 22 000 km² souše) – plné body dostane i tip do moře.
- **Vlieland** (Q207851), **Schiermonnikoog** (Q208011): obrys obce včetně moře (desetkrát větší než ostrov na mapě). Podobně
  **Falster** (Q735905) a **Alexandrovy ostrovy** (Q140510) nesedí s ostrovy na podkladové mapě.
- **Francie** (Q142): obrys obsahuje Francouzskou Guyanu, takže se výsledek oddálí přes celý Atlantik a Francie je na něm malá.
  Totéž hrozí u dalších států se zámořím; do obrysu státu by stačila část na jeho kontinentu.
- **Tung-tching-chu** (Q216083): rozvětvený obrys s osmi kříženími a třetinou rozlohy.
- **Georgian Bay** (Q1267413), **Benátská laguna** (Q76925), **Gibraltarský průliv** (Q36124), **Bab-al-Mandab** (Q83318): obrys „moře“
  leží z velké části na nakreslené pevnině nebo v jezeře, takže zvýraznění oříznuté na vodu není (skoro) vidět.
- 120 obrysů se samo kříží (Chile 9×, Kiribati 8×, Bratská přehradní nádrž 9×, Volta 5×) – po zjednodušení úzkých tvarů.
- Bez obrysu je 80 míst úrovně Základní, na která se proto mapa neptá: Kavkaz, Apeniny, Krkonoše, Šumava, Beskydy, Jizerské hory,
  Skandinávský a Apeninský poloostrov, Atacama, Kyklady, Dolomity, Istrie… (celý seznam v oddíle Pokrytí).

### K opravě v aplikaci (`question-map.js` – tady se neupravoval)

- **Zadání**: „Kde se konala Vídeňský kongres / Berlínský kongres / Haagský kongres / Summit Země / Shromáždění v Seneca Falls?“ –
  u druhu konference se má sloveso řídit rodem názvu (konal se kongres, konalo se shromáždění).
- **Stát přes 180. poledník** (Fidži, Kiribati): výsledek se oddálí na celý svět a špendlík je na okraji mapy.
- **Záliv jezera** (Georgian Bay): zvýraznění „moře“ se ořezává jen podle pevniny; jezero je také pevnina, takže zvýraznění zmizí.
- **Oblast položky** (`regionFor`): položka, která uvádí Česko mezi více státy a má bod mimo mapu Česka, se neptá vůbec (Karpaty,
  Západní Karpaty); položka, která uvádí jen státy, jež hra nezná (SSSR, nacistické Německo), nemá kontinent, i když bod leží ve
  výřezu (bitva v Kurském oblouku, obléhání Leningradu, bitva před Moskvou, Křišťálová noc… 12 míst úrovně Základní, 20 pokročilých);
  stát Rusko se neptá, protože jeho bod leží na Sibiři mimo výřez Evropy.
- **Pravidlo velkého českého města** vyřadí i řeky a vrchy s bodem do 8 km od centra (Berounka, Svitava, Petřín).
- **Ostrov s obrysem** se ptá, i když na podkladové mapě není nakreslený (kontrola nakreslené pevniny platí jen bez obrysu) – Lošinj
  a Hadí ostrov jsou zatím vyřazené v `data/mapa-opravy.json`.
- Hledání stejnojmenného místa (`sameNameElsewhere`) normalizuje u každé sestavené otázky jména všech položek tématu (v kontrole
  to dělalo minuty, proto se tam otázka sestavuje jen se stejnojmennými položkami).

### Data témat (nejsou chybou mapy)

- Bitva o Khe Sanh (Q247253, historie) uvádí stát Jižní Korea místo Vietnamu.
- Rozloha v datech: Bosna a Hercegovina 10 km², Csongrád-Csanád 426 174 km² (má být 4 263), Cojedes 1 480 km² (má být 14 800),
  region Ohňová země 987 168 km² (s nárokem v Antarktidě).
- V zeměpisu vůbec nejsou Černé, Baltské a Středozemní moře ani Kilimandžáro.
- Leeds Castle má jako město Leeds (leží v Kentu); Tridentský koncil má místo Bologna (poloha opravena v `data/mapa-opravy.json`).
