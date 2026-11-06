// Pracovní vlákno auditu: dostane id témat jedno po druhém a vrátí nálezy (viz scripts/audit-questions.mjs)
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { auditTopic } from './audit.mjs';

const wiki = workerData.wiki ? JSON.parse(fs.readFileSync(path.resolve(workerData.wiki), 'utf8')) : null;
parentPort.on('message', ({ id, limit, sample }) => {
    const started = Date.now();
    const { topic, items, total, findings } = auditTopic(id, { limit, sample, wiki });
    parentPort.postMessage({ id, title: topic.title, items, total, findings, seconds: Math.round((Date.now() - started) / 1000) });
});
