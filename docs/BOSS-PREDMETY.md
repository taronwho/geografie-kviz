# Boss týdne – předměty a další pokus (zapojeno, schéma 49)

Cíl: usnadnit souboj s bossem. Životy bosse (700–1000 podle týdne, schéma 45) a základní poškození 80 už jsou hotové.

## Předměty (zásoba na serveru jako Tah navíc, 50/50, Záchrana navíc, Ankh vzkříšení)
| Předmět | Druh (`kind`) | Strop | Účinek v souboji |
|---|---|---|---|
| Dvojitý úder | `double_hit` | 2 | Zapne se před odpovědí na otázku. Správná odpověď dá dvojnásobné poškození (zásah i bonus za rychlost), špatná předmět spotřebuje. |
| 50/50 | `fifty` (stávající) | 2 | Schová dvě špatné možnosti (u psané odpovědi nejde). |
| Zmrazení času | `freeze` | 2 | Zastaví odpočet na 10 s; bonus za rychlost se počítá z času bez zmrazení. |
| Srdce navíc | `heart` | 1 | Čtvrté srdce v souboji. |
| Nápověda zdarma | `free_hint` | 2 | Další nápověda nesníží bonus za rychlost. |
| Další pokus | `attempt` | 1 | Čtvrtý pokus na bosse v týdnu. |

Před soubojem si hráč vybere nejvýš 2 předměty (obrazovka „Výbava“ na úvodu souboje, mezi životy bosse a tlačítkem Do souboje).

## Co je potřeba
1. **Databáze** (nový blok schématu): druhy v `player_item_grants_values` a `player_item_cap`, `player_items_json`, tabulka `boss_item_uses (user_id, week, attempt idx, kind, slot)` a funkce `boss_use_item(week, idx, kind, slot)` (odečte ze zásoby, jednou na pokus a druh; `attempt` zvýší limit pokusů v `boss_results` na 4 a v `boss_submit`).
2. **Klient** (`social.js` ITEM_KINDS/ITEM_MAX/cleanItems, `boss.js` stav `open.loadout`, `damageFor` s násobičem, `fightStatus` s `hearts` max 4, app.js tlačítko u otázky a výběr výbavy).
3. **Zdroje**: první výhra nad bossem (`double_hit`), týdenní bonus (`attempt`), Kvíz dne bez chyby (`fifty` už je), Zlatá truhla (`freeze`, `heart`), milníky Řetězovky (`free_hint`).
4. **Obrázky** (docs/OBRAZKY.md, pokračovat číslováním): 6 ikon předmětů na průhledném pozadí jako ostatní pomůcky.
5. **Tip** v tips.js a zmínka v pravidlech souboje; testy `tests/boss.test.js`, `tests/sql-boss.test.js`, `tests/e2e-boss.test.js`.

## Doporučené pořadí
1. Dvojitý úder + obrazovka Výbava (nový druh, `boss_use_item`, tlačítko u otázky).
2. 50/50 v souboji (stávající druh, jen napojení).
3. Další pokus, Srdce navíc, Zmrazení času, Nápověda zdarma.

## Jak je to zapojené (schéma 49)

- **Výbava:** před první otázkou si přihlášený hráč s pomůckami vybere nejvýš dvě (okno „Výbava do souboje“). Server je odečte ze zásoby
  (`boss_equip`, jednou na pokus) a zapíše k pokusu (`boss_equips`); co se v souboji nepoužije, propadne. Bez pomůcek nebo bez spojení se
  souboj spustí rovnou.
- **Dvojitý úder** (`double_hit`, strop 2): tlačítko pod nápovědou; zapnutý úder ubere dvojnásobek (zásah i bonus), spotřebuje se odpovědí.
- **50/50** (`fifty`, stávající pomůcka): schová dvě špatné možnosti; u psané odpovědi nejde.
- **Zmrazení času** (`freeze`, strop 2): posune začátek otázky o 10 s, takže se čas nehýbe a bonus za rychlost se počítá bez nich.
- **Srdce navíc** (`heart`, strop 1): čtvrté srdce; pasivní, bez tlačítka.
- **Nápověda zdarma** (`free_hint`, strop 2): odemkne další nápovědu a vrátí 5 s.
- **Další pokus** (`attempt`, strop 1): na úvodu, když tři pokusy došly a boss stojí (`boss_use_attempt`, sloupec `boss_results.extra`, čtvrtý pokus).
- **Zdroje:** každý dohraný pokus dá los mezi Dvojitým úderem, Zmrazením času, Srdcem navíc a Nápovědou zdarma (`bossatt:<týden>:<pokus>`),
  první výhra v týdnu navíc Další pokus (`bosswin:<týden>`); 50/50 dál z původních zdrojů.
- **Obrázky:** `icons/topics/boss-*.webp` (docs/OBRAZKY.md č. 492–497, `scripts/topic-icons.py`).
- Soubory: `boss.js` (výbava v `open.loadout`, `used`, `equipped`; `fightStatusOf`, `attemptCap`), `app.js` (okno Výbava, tlačítka `useBossItem`,
  `useBossExtraAttempt`), `social.js` (`bossEquip`, `bossUseAttempt`), `conquest.js` (`ITEMS` s `place: 'boss'`), testy `tests/boss.test.js`,
  `tests/sql-boss.test.js`, `tests/e2e-boss.test.js`.
