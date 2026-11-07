// Každá ikona, kterou aplikace vykresluje (data-lucide="…" v HTML a JS), musí být v icons.js (scripts/build-icons.mjs).
// Chybějící ikona se nevykreslí vůbec: tlačítko zůstane bez obrázku (tak dopadlo menu ⋯ a Přidat do přátel v profilu hráče).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'icons.js'), 'utf8'), sandbox);
const ICONS = sandbox.window.MUDRLANT_ICONS;
const SOURCES = [...fs.readdirSync(ROOT).filter(file => /\.(js|html)$/.test(file) && file !== 'icons.js'), ...fs.readdirSync(path.join(ROOT, 'topics')).map(file => `topics/${file}`)];

test('každá pevně zapsaná ikona data-lucide je v icons.js', () => {
    const missing = [];
    for (const file of SOURCES) {
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of source.matchAll(/data-lucide="([a-z0-9-]+)"/g)) if (!ICONS[match[1]]) missing.push(`${file}: ${match[1]}`);
        // Ikona vybraná podmínkou: data-lucide="${podmínka ? 'a' : 'b'}"
        for (const match of source.matchAll(/data-lucide="\$\{([^}]{0,200})\}"/g)) {
            for (const name of match[1].matchAll(/'([a-z0-9-]+)'/g)) if (!ICONS[name[1]]) missing.push(`${file}: ${name[1]}`);
        }
    }
    assert.deepEqual([...new Set(missing)], []);
});

test('ikony přátel a Mých dat jsou v icons.js', () => {
    for (const name of ['user-plus', 'user-check', 'user-minus', 'ellipsis', 'download', 'clock', 'flag', 'ban', 'circle-check']) assert.ok(ICONS[name], name);
});
