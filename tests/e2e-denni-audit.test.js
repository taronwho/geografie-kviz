// Stejnost denních módů v prohlížeči: scripts/audit-denni.mjs (zkrácený běh --quick) s pěti hráči téhož dne, kteří se liší nastavením,
// úrovní, historií, časovým pásmem (Praha, UTC půl hodiny po pražské půlnoci, New York), Wikipedií, přihlášením, databází a verzí dat
// (nasazení během dne). Hráči se schématem 33 musí mít Kvíz dne, Dnešní otázky, Řetězovku, Tajemnou otázku a Bosse týdne stejné do posledního
// slova (položky i možnosti). Potřebuje Playwright (viz tests/e2e.test.js), jinak se přeskočí.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) {}

test('denní módy: všichni hráči dostanou stejné otázky', { skip: !chromium && 'Playwright není k dispozici', timeout: 900000 }, () => {
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'audit-denni.mjs'), '--quick'], { encoding: 'utf8', timeout: 880000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /\| quiz \| B \| stejné \|/);
    assert.match(run.stdout, /\| chain \| C \| stejné \|/);
    assert.doesNotMatch(run.stdout, /LIŠÍ SE/);
});
