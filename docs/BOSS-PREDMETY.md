# Boss týdne – předměty a další pokus (návrh, zatím nezapojeno)

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
