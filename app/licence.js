// Stránka Zdroje a licence: seznam obrázků z Wikimedia Commons podle témat z data/licenses.json (sestavuje scripts/build-licenses.mjs).
// Bez inline skriptu (CSP). Témata se vykreslují až po rozbalení – souborů jsou desítky tisíc.
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MudrlantLicence = api;
})(typeof self !== 'undefined' ? self : this, (root) => {
    'use strict';
    const TOPIC_LABELS = {
        zemepis: 'Zeměpis', vlajky: 'Vlajky a znaky', historie: 'Historie', mytologie: 'Mytologie', biologie: 'Biologie', geologie: 'Geologie',
        chemie: 'Chemie', fyzika: 'Fyzika', umeni: 'Výtvarné umění', architektura: 'Architektura', hudba: 'Hudba', literatura: 'Literatura', film: 'Film', sport: 'Sport',
        // Slavné objevy a vynálezy pro otázky Časové souvislosti (data/vynalezy.json)
        vynalezy: 'Objevy a vynálezy'
    };
    const FLAG_LABELS = { 'nc-nd': 'NC-ND', nc: 'nekomerční', nd: 'bez odvozenin', fair: 'fair use', none: 'bez licence', missing: 'chybí' };
    // Nejvýš tolik řádků na téma při hledání i bez něj (zbytek řádek „a dalších…“)
    const ROW_LIMIT = 400;

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const topicLabel = (id) => TOPIC_LABELS[id] || id;
    const pageUrl = (name, entry) => entry.p || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(String(name).replace(/ /g, '_'))}`;
    const safeUrl = (url) => /^https:\/\//.test(String(url || '')) ? url : '';

    // Soubory podle témat: index tématu → [název, záznam] seřazené podle názvu
    const groupByTopic = (data) => {
        const groups = (data.topics || []).map(() => []);
        for (const [name, entry] of Object.entries(data.files || {})) {
            for (const index of entry.t || []) if (groups[index]) groups[index].push([name, entry]);
        }
        groups.forEach(group => group.sort((a, b) => a[0].localeCompare(b[0], 'cs')));
        return groups;
    };
    const matches = (name, entry, needle) => !needle || name.toLowerCase().includes(needle) || String(entry.a || '').toLowerCase().includes(needle) || String(entry.l || '').toLowerCase().includes(needle);

    const rowHtml = (name, entry) => {
        const license = entry.l ? (safeUrl(entry.u) ? `<a href="${escapeHtml(entry.u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.l)}</a>` : escapeHtml(entry.l)) : '<span class="text-slate-400">neuvedeno</span>';
        const flag = entry.flag ? ` <span class="licence-flag">${escapeHtml(FLAG_LABELS[entry.flag] || entry.flag)}</span>` : '';
        return `<tr><td><a href="${escapeHtml(pageUrl(name, entry))}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></td><td>${entry.a ? escapeHtml(entry.a) : '<span class="text-slate-400">neuveden</span>'}</td><td>${license}${flag}</td></tr>`;
    };
    const tableHtml = (rows, needle) => {
        const shown = rows.filter(([name, entry]) => matches(name, entry, needle));
        if (!shown.length) return '<p class="px-3 pb-3 text-sm text-slate-500 dark:text-slate-400">Nic nenalezeno.</p>';
        const more = shown.length > ROW_LIMIT ? `<p class="px-3 pb-3 text-xs text-slate-500 dark:text-slate-400">… a dalších ${shown.length - ROW_LIMIT} souborů. Zužte hledání, nebo otevřete téma na Wikimedia Commons přes odkaz u souboru.</p>` : '';
        return `<div class="overflow-x-auto"><table class="licence-table"><thead><tr><th>Soubor</th><th>Autor</th><th>Licence</th></tr></thead><tbody>${shown.slice(0, ROW_LIMIT).map(([name, entry]) => rowHtml(name, entry)).join('')}</tbody></table></div>${more}`;
    };

    const render = (data, container, summary, needle = '') => {
        const groups = groupByTopic(data);
        const total = Object.keys(data.files || {}).length;
        const fetched = Object.values(data.files || {}).filter(entry => entry.l || entry.a || entry.flag).length;
        const hits = needle ? groups.reduce((sum, group) => sum + group.filter(([name, entry]) => matches(name, entry, needle)).length, 0) : total;
        if (summary) summary.textContent = needle ? `Nalezeno ${hits} souborů pro „${needle}“.` : `Obrázků celkem ${total}${fetched < total ? `, údaje o autorech a licencích zatím u ${fetched}` : ''}. Klepnutím na téma se rozbalí seznam.`;
        container.innerHTML = (data.topics || []).map((topic, index) => {
            const rows = groups[index];
            const count = needle ? rows.filter(([name, entry]) => matches(name, entry, needle)).length : rows.length;
            if (needle && !count) return '';
            return `<details class="licence-topic" data-topic="${escapeHtml(topic)}" ${needle ? 'open' : ''}>
                <summary><span>${escapeHtml(topicLabel(topic))}</span><span class="text-xs font-semibold text-slate-500 dark:text-slate-400">${count} souborů</span></summary>
                <div class="licence-rows" data-rows>${needle ? tableHtml(rows, needle) : ''}</div>
            </details>`;
        }).join('') || '<p class="text-sm text-slate-500 dark:text-slate-400">Nic nenalezeno.</p>';
        // Bez hledání se tabulka tématu vykreslí až po rozbalení
        container.querySelectorAll('details').forEach(details => details.addEventListener('toggle', () => {
            const rows = details.querySelector('[data-rows]');
            if (details.open && rows && !rows.innerHTML) rows.innerHTML = tableHtml(groups[data.topics.indexOf(details.dataset.topic)], '');
        }));
    };

    const init = async () => {
        const container = root.document && root.document.getElementById('licence-topics');
        if (!container) return;
        const summary = root.document.getElementById('licence-summary');
        const generated = root.document.getElementById('licence-generated');
        let data;
        try {
            const response = await fetch('data/licenses.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            data = await response.json();
            if (!data || typeof data !== 'object' || !Array.isArray(data.topics)) throw new Error('špatný tvar');
        } catch (error) {
            if (summary) summary.textContent = 'Seznam obrázků se nepodařilo načíst. Zkus to prosím později; údaje o každém souboru najdeš i na Wikimedia Commons.';
            return;
        }
        if (generated && data.generated) generated.textContent = `sestaveno ${data.generated}`;
        render(data, container, summary);
        const search = root.document.getElementById('licence-search');
        if (search) {
            let timer = null;
            search.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => render(data, container, summary, search.value.trim().toLowerCase()), 200);
            });
        }
    };

    if (root.document && root.document.getElementById) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
        else init();
    }
    return { TOPIC_LABELS, FLAG_LABELS, groupByTopic, rowHtml, tableHtml, render, pageUrl, matches };
});
