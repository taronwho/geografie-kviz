// Každé volání Social.xyz v aplikaci musí existovat v exportech social.js (hlídá hlavně slučování větví, kdy se seznam exportů snadno ztratí)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('app.js volá jen funkce, které social.js exportuje', () => {
    const Social = require('../social.js');
    const source = ['app.js', 'friends.js', 'groups.js', 'question-report.js', 'monitor.js', 'push.js'].map(file => {
        try { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); } catch (error) { return ''; }
    }).join('\n');
    const used = [...new Set([...source.matchAll(/\bSocial\.([A-Za-z_]\w*)/g)].map(match => match[1]))];
    assert.ok(used.length > 20, 'nalezeno dost volání');
    const missing = used.filter(name => !(name in Social));
    assert.deepEqual(missing, [], `chybí v exportech social.js: ${missing.join(', ')}`);
});
