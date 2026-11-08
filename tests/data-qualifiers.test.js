// Položka spárovaná s článkem jiného druhu (vynález „Semtex“ → článek o energetickém nápoji): popis z Wikipedie by mluvil
// o něčem jiném a správná možnost by byla hned poznat. Upřesnění v názvu článku musí sedět k tématu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, '..', 'data');
const QUALIFIER = /\(([^)]*)\)\s*$/;
const FOREIGN = /\b(nápoj|pivo|album|píseň|singl|film|seriál|kapela|hudební skupina|firma|společnost|značka|časopis|noviny|videohra|počítačová hra|loď|příjmení|jméno|rozcestník)\b/i;
// Kde je takové upřesnění v pořádku
const ALLOWED = { hudba: /album|píseň|singl|kapela|hudební skupina/i, film: /film|seriál/i, literatura: /časopis|noviny/i, sport: /firma|společnost|loď/i };

test('názvy článků neukazují na jiný druh věci, než o jaký jde v tématu', () => {
    const wrong = [];
    for (const file of fs.readdirSync(DATA).filter(name => name.endsWith('.json'))) {
        const topic = file.replace('.json', '');
        const raw = JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
        const items = Array.isArray(raw) ? raw : (raw.items || Object.values(raw).find(Array.isArray) || []);
        for (const item of items) {
            const match = item && typeof item.t === 'string' && QUALIFIER.exec(item.t);
            if (!match) continue;
            const kind = FOREIGN.exec(match[1]);
            if (kind && !(ALLOWED[topic] && ALLOWED[topic].test(kind[1]))) wrong.push(`${topic}/${item.c} ${item.q} ${item.n} → ${item.t}`);
        }
    }
    assert.deepEqual(wrong, []);
});
