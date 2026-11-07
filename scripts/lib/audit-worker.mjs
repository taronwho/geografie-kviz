// Pracovní vlákno auditu: dostane id témat jedno po druhém a vrátí nálezy (viz scripts/audit-questions.mjs)
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { auditTopic } from './audit.mjs';

// Úvody: { titulek: text }, nebo tvar testovací fixture tests/wiki-intros.json ({ items: { 'téma:Q…': { t, extract } } })
const readWiki = (file) => {
    const json = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    if (!json.items || typeof json.items !== 'object') return json;
    return Object.fromEntries(Object.values(json.items).filter(entry => entry && entry.t && entry.extract).map(entry => [entry.t, entry.extract]));
};
const wiki = workerData.wiki ? readWiki(workerData.wiki) : null;
parentPort.on('message', ({ id, limit, sample }) => {
    const started = Date.now();
    const { topic, items, total, findings } = auditTopic(id, { limit, sample, wiki });
    parentPort.postMessage({ id, title: topic.title, items, total, findings, seconds: Math.round((Date.now() - started) / 1000) });
});
