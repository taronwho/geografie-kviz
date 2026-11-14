// Obrazové nápovědy témat (vykreslení do stránky): slepá mapa, časová osa, obrázek (mapa rozšíření), periodická tabulka
(function (root) {
    'use strict';

    const { buildBlindMap, buildRegionalMap, mapExtent, mercatorY, buildTimeline, formatNumber, commonsPhotoUrl, commonsFileUrl, periodicPosition, elementFamily } = root.MudrlantCore;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const svgElement = (tag, attributes) => {
        const element = document.createElementNS(SVG_NS, tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    };

    const formatDistance = (km) => `${formatNumber(km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10)} km`;
    // Šířka výřezu mapy v kilometrech (na rovnoběžce místa) – dává představu o měřítku
    const mapWidthKm = (spec) => spec.span * 111.32 * Math.cos(spec.lat * Math.PI / 180);

    // Výřez mapy se upravil až při kreslení (oddálení, celý stát) – měřítko v rohu a popis pro čtečku podle skutečného výřezu
    const showMapScale = (container, spec) => {
        const corner = container.parentElement && container.parentElement.querySelector('[data-visual-corner]');
        if (corner) corner.textContent = VISUALS.map.corner(spec);
        container.setAttribute('aria-label', VISUALS.map.describe(spec));
    };
    const target = (svg, cx, cy, ring) => {
        svg.appendChild(svgElement('circle', { cx, cy, r: ring, fill: 'none', 'stroke-width': 2.5, class: 'stroke-rose-500/60' }));
        svg.appendChild(svgElement('circle', { cx, cy, r: 6, 'stroke-width': 2.5, class: 'fill-rose-500 stroke-white' }));
    };

    // Region menší než tolik px dostane kolem tečky kroužek
    const REGION_RING_SIZE = 36;
    // Ostatní možnosti (přiblížená mapa): šedé tečky, hledané místo zůstane červené
    const otherDots = (svg, points) => points.forEach(point => svg.appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 4.5, 'stroke-width': 2, 'data-other': '', class: 'fill-slate-500 stroke-white dark:fill-slate-300 dark:stroke-slate-900' })));
    // Slepá mapa regionu: celý stát (u městské části město) s hranicemi krajů, spolkových zemí, států… a se sousedy, hledaný
    // region zvýrazněný a tečka na něm; nic popsané (data/regiony.json, výřez spočítá quiz-core.js: mapExtent)
    const regionalSvg = (spec, extent, width, height) => {
        const map = buildRegionalMap(extent.entry, { item: spec.regional.item, lat: spec.lat, lon: spec.lon, width, height, view: extent, others: extent.fitted ? spec.others || [] : [] });
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true', 'data-map': '' });
        const layer = (d, attributes) => { if (d) svg.appendChild(svgElement('path', { d, 'fill-rule': 'evenodd', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...attributes })); };
        layer(map.layers.others, { 'stroke-width': 0.8, class: 'fill-stone-200 stroke-slate-400 dark:fill-slate-700 dark:stroke-slate-500' });
        layer(map.layers.own, { class: 'fill-amber-50 dark:fill-slate-500' });
        layer(map.layers.region, { class: 'fill-emerald-400 dark:fill-emerald-600' });
        layer(map.layers.lines, { fill: 'none', 'stroke-width': 0.8, class: 'stroke-slate-400 dark:stroke-slate-300' });
        layer(map.layers.lakes, { 'stroke-width': 0.6, class: 'fill-sky-200 stroke-slate-400 dark:fill-sky-950 dark:stroke-slate-400' });
        layer(map.layers.own, { fill: 'none', 'stroke-width': 1.3, class: 'stroke-slate-500 dark:stroke-slate-200' });
        otherDots(svg, map.others);
        // Kroužek kolem tečky jen u místa bez obrysu a u malého regionu – velký region by zakryl
        if (map.layers.region && map.regionSize >= REGION_RING_SIZE) svg.appendChild(svgElement('circle', { cx: map.dot.x, cy: map.dot.y, r: 5, 'stroke-width': 2, class: 'fill-rose-500 stroke-white' }));
        else target(svg, map.dot.x, map.dot.y, 15);
        return { svg, lat: map.lat, span: map.span };
    };
    // Slepá mapa: obrysy států bez jediného popisku, místo označené terčem (u států zvýrazněný celý stát)
    const worldSvg = (spec, extent, world, width, height) => {
        const span = extent.span;
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true', 'data-map': '' });
        const shapes = buildBlindMap(world, { lat: extent.lat, lon: extent.lon, spanLon: span, width, height, highlightIso: spec.highlightIso });
        for (const shape of shapes) {
            svg.appendChild(svgElement('path', {
                d: shape.d,
                'stroke-width': 0.8,
                'stroke-linejoin': 'round',
                class: shape.highlight
                    ? 'fill-emerald-400 stroke-emerald-700 dark:fill-emerald-600 dark:stroke-emerald-300'
                    : 'fill-amber-50 stroke-slate-400 dark:fill-slate-600 dark:stroke-slate-400'
            }));
        }
        const scale = width / span;
        const project = (point) => [((point.lon - extent.lon + 540) % 360 - 180) * scale + width / 2, height / 2 - (mercatorY(point.lat) - mercatorY(extent.lat)) * scale];
        otherDots(svg, (extent.fitted ? spec.others || [] : []).map(project).map(([x, y]) => ({ x, y })));
        // Malé státy (Malta, Monako) na mapě obrys nemají – pak i u státu terč
        if (!shapes.some(shape => shape.highlight)) target(svg, ...project(spec), 15);
        return { svg, lat: extent.lat, span };
    };

    // Tlačítka +/− slepé mapy: přiblížit až na čtvrtinu výchozího výřezu, oddálit až na celý svět (mapa přejde z částí města
    // na stát a na obrysy států, když výřez přeroste data)
    const MIN_ZOOM = 0.25;
    const zoomButton = (direction, label, text, onZoom) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mapZoom = direction;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.className = `flex h-9 w-9 items-center justify-center text-lg font-black leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700${direction === 'out' ? ' border-t border-slate-200 dark:border-slate-600' : ''}`;
        button.textContent = text;
        button.addEventListener('click', (event) => { event.stopPropagation(); onZoom(direction === 'in' ? 0.5 : 2); });
        return button;
    };
    const renderMap = async (container, spec, { loadWorld, loadRegions }) => {
        // Regiony a části města, když jsou pro stát data; bez nich (bez internetu) stačí obrysy států
        const regions = spec.regional && loadRegions ? await loadRegions().catch(() => null) : null;
        let world = null;
        let zoom = 1;
        let buttons = null;
        const draw = async () => {
            const width = Math.round(container.clientWidth) || 360;
            const height = Math.round(container.clientHeight) || 224;
            // Obrysy států jsou potřeba, když mapa nemá data regionů (nebo je oddálená za ně)
            if (!world && mapExtent(spec, { regions, width, height, zoom }).source === 'world') world = await loadWorld();
            const extent = mapExtent(spec, { regions, world, width, height, zoom });
            if (!container.isConnected) return;
            const drawn = extent.entry ? regionalSvg(spec, extent, width, height) : worldSvg(spec, extent, world, width, height);
            container.querySelectorAll('svg[data-map]').forEach(old => old.remove());
            container.prepend(drawn.svg);
            container.dataset.mapSource = extent.source;
            const label = extent.fitted && (spec.others || []).length ? `${spec.label}, šedé tečky jsou ostatní možnosti` : spec.label;
            showMapScale(container, { ...spec, label, lat: drawn.lat, span: drawn.span, measured: true });
            if (buttons) {
                buttons.querySelector('[data-map-zoom="in"]').disabled = zoom <= MIN_ZOOM;
                buttons.querySelector('[data-map-zoom="out"]').disabled = extent.span >= 300;
            }
        };
        buttons = document.createElement('div');
        buttons.dataset.mapZoomButtons = '';
        buttons.className = 'absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-800/95';
        const onZoom = (factor) => { zoom = Math.max(MIN_ZOOM, zoom * factor); draw(); };
        buttons.append(zoomButton('in', 'Přiblížit mapu', '+', onZoom), zoomButton('out', 'Oddálit mapu', '−', onZoom));
        await draw();
        if (container.isConnected) container.appendChild(buttons);
    };

    const svgText = (text, attributes) => {
        const element = svgElement('text', attributes);
        element.textContent = text;
        return element;
    };

    // Časová osa: roky na ose, život a doba vlády (úřadu, trvání) jako pruhy, událost jako bod
    // a pro orientaci pár obecně známých událostí v okolí
    const renderTimeline = async (container, spec) => {
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const layout = buildTimeline(spec, width);
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        // Na nízkém panelu (malý telefon) se popisky stáhnou k ose a legenda k hornímu okraji, ať se dva řádky událostí vejdou
        const tight = height < 160;
        const legendY = tight ? 4 : 12;
        const anchorGap = tight ? 43 : 46;
        const rowGap = tight ? 13 : 15;
        const rows = layout.anchors.length ? Math.max(...layout.anchors.map(anchor => anchor.row)) + 1 : 0;
        const below = rows ? anchorGap + (rows - 1) * rowGap + 4 : 36;
        const above = legendY + 12 + 4 + 51;
        const axisY = Math.max(above, Math.min(Math.round(height * 0.58), height - below));
        svg.appendChild(svgElement('line', { x1: 12, x2: width - 12, y1: axisY, y2: axisY, 'stroke-width': 2, class: 'stroke-slate-400 dark:stroke-slate-500' }));
        // Osa bez letopočtů: aspoň směr času
        if (spec.blind) {
            svg.appendChild(svgText('dříve', { x: 14, y: axisY + 20, 'font-size': 11, 'font-weight': 600, class: 'fill-slate-500 dark:fill-slate-400' }));
            svg.appendChild(svgText('později →', { x: width - 14, y: axisY + 20, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600, class: 'fill-slate-500 dark:fill-slate-400' }));
        }
        for (const tick of layout.ticks) {
            svg.appendChild(svgElement('line', { x1: tick.x, x2: tick.x, y1: axisY - 5, y2: axisY + 5, 'stroke-width': 1.5, class: 'stroke-slate-400 dark:stroke-slate-500' }));
            // Roky před naším letopočtem ve dvou řádcích, aby se popisky nepřekrývaly
            const [year, era] = tick.year < 0 ? [String(-tick.year), 'př. n. l.'] : [tick.label, ''];
            svg.appendChild(svgText(year, { x: tick.x, y: axisY + 20, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, class: 'fill-slate-500 dark:fill-slate-400' }));
            if (era) svg.appendChild(svgText(era, { x: tick.x, y: axisY + 31, 'text-anchor': 'middle', 'font-size': 9, class: 'fill-slate-500 dark:fill-slate-400' }));
        }
        // Souvislé období: život světlý pruh, vláda či úřad tmavší přes něj
        for (const bar of layout.bars) {
            const y = bar.kind === 'life' ? axisY - 40 : axisY - 46;
            const barHeight = bar.kind === 'life' ? 12 : 24;
            svg.appendChild(svgElement('rect', {
                x: bar.x, y, width: Math.max(bar.width, 4), height: barHeight, rx: 4,
                class: bar.kind === 'life' ? 'fill-amber-300 dark:fill-amber-800' : 'fill-amber-500 dark:fill-amber-500'
            }));
        }
        for (const point of layout.points) {
            svg.appendChild(svgElement('line', { x1: point.x, x2: point.x, y1: axisY - 44, y2: axisY, 'stroke-width': 2, class: 'stroke-amber-500' }));
            svg.appendChild(svgElement('circle', { cx: point.x, cy: axisY - 44, r: 7, 'stroke-width': 2.5, class: 'fill-amber-500 stroke-white dark:stroke-slate-900' }));
        }
        // Známé události v okolí: čárka pod osou a popisek v řádku a zarovnání, které spočítalo jádro (bez překrývání)
        for (const anchor of layout.anchors) {
            const y = axisY + anchorGap + anchor.row * rowGap;
            svg.appendChild(svgElement('line', { x1: anchor.x, x2: anchor.x, y1: axisY + 4, y2: y - 11, 'stroke-width': 1, 'stroke-dasharray': '2 2', class: 'stroke-slate-400 dark:stroke-slate-500' }));
            // Obrys v barvě pozadí, ať popisek nepřeškrtne čárka jiné události
            svg.appendChild(svgText(anchor.label, {
                x: anchor.x, y, 'text-anchor': anchor.align, 'font-size': 11, 'paint-order': 'stroke', 'stroke-width': 3, 'stroke-linejoin': 'round',
                class: 'fill-slate-600 stroke-amber-50 dark:fill-slate-300 dark:stroke-slate-800'
            }));
        }
        // Popisky pruhů
        const legend = [];
        if (layout.bars.some(bar => bar.kind === 'life')) legend.push(['fill-amber-300 dark:fill-amber-800', 'život']);
        if (layout.bars.some(bar => bar.kind !== 'life')) legend.push(['fill-amber-500', spec.spanLabel || 'vláda']);
        legend.forEach(([fill, text], index) => {
            const x = 14 + index * 78;
            svg.appendChild(svgElement('rect', { x, y: legendY, width: 12, height: 12, rx: 3, class: fill }));
            svg.appendChild(svgText(text, { x: x + 17, y: legendY + 10, 'font-size': 12, 'font-weight': 600, class: 'fill-slate-600 dark:fill-slate-300' }));
        });
        container.prepend(svg);
    };

    // Časové souvislosti (time-questions.js): osobnost či věc a čtyři možnosti pod sebou na jedné ose let – pruh života, bod roku,
    // správná zeleně, osobnost zlatě, ostatní šedě; podklad (band) ukáže dobu, ke které se možnosti vztahují (život, století, rok)
    const CHRONOLOGY_FILL = { subject: 'fill-amber-500', correct: 'fill-emerald-500', wrong: 'fill-slate-400 dark:fill-slate-500' };
    const CHRONOLOGY_TEXT = { subject: 'fill-slate-800 dark:fill-slate-100', correct: 'fill-emerald-800 dark:fill-emerald-300', wrong: 'fill-slate-600 dark:fill-slate-300' };
    const renderChronology = async (container, spec) => {
        const Time = root.MudrlantTime;
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const layout = Time && Time.chronologyLayout(spec, width, height);
        if (!layout) throw new Error('Osu nejde rozvrhnout');
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${Math.max(height, layout.height)}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        if (layout.band) {
            svg.appendChild(svgElement('rect', { x: layout.band.x1, y: 0, width: layout.band.x2 - layout.band.x1, height: layout.axisY, class: 'fill-amber-200/60 dark:fill-amber-900/40' }));
        }
        svg.appendChild(svgElement('line', { x1: 8, x2: width - 8, y1: layout.axisY, y2: layout.axisY, 'stroke-width': 2, class: 'stroke-slate-400 dark:stroke-slate-500' }));
        for (const tick of layout.ticks) {
            svg.appendChild(svgElement('line', { x1: tick.x, x2: tick.x, y1: layout.axisY - 4, y2: layout.axisY + 4, 'stroke-width': 1.5, class: 'stroke-slate-400 dark:stroke-slate-500' }));
            svg.appendChild(svgText(tick.label, { x: tick.x, y: layout.axisY + 17, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, class: 'fill-slate-500 dark:fill-slate-400' }));
        }
        for (const row of layout.rows) {
            const fill = CHRONOLOGY_FILL[row.role] || CHRONOLOGY_FILL.wrong;
            if (row.point) svg.appendChild(svgElement('circle', { cx: row.x1, cy: row.barY + 4, r: 6, 'stroke-width': 2, class: `${fill} stroke-white dark:stroke-slate-800` }));
            else svg.appendChild(svgElement('rect', { x: row.x1, y: row.barY, width: Math.max(row.x2 - row.x1, 6), height: 8, rx: 4, class: fill }));
            svg.appendChild(svgText(row.text, {
                x: row.tx, y: row.textY, 'text-anchor': row.anchor, 'font-size': 12, 'font-weight': row.role === 'wrong' ? 600 : 800,
                'paint-order': 'stroke', 'stroke-width': 3, 'stroke-linejoin': 'round', class: `${CHRONOLOGY_TEXT[row.role] || CHRONOLOGY_TEXT.wrong} stroke-white dark:stroke-slate-800`
            }));
        }
        container.prepend(svg);
    };

    // Obrázek z Wikimedia Commons (mapa rozšíření, strukturní vzorec): náhled, a když ho Commons nevrátí, původní soubor;
    // když se nenačte ani ten, ukáže se zpráva jako u jiných nápověd
    const loadImage = (url) => new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve(url);
        probe.onerror = () => reject(new Error(`Obrázek se nenačetl: ${url}`));
        probe.src = url;
    });
    // Zakrytí napsané odpovědi (jméno na dresu, název na obalu): rozmazané obdélníky přes fotku zobrazenou jako
    // background-size: contain. Vrstva má poměr stran fotky a je vycentrovaná přes kontejnerové jednotky, takže sedí
    // i ve skrytém panelu a po změně velikosti. masks = [[x, y, šířka, výška], …] jako podíl rozměrů fotky.
    const maskOverlay = (element, width, height, masks) => {
        element.querySelectorAll('[data-photo-mask]').forEach(old => old.remove());
        if (!masks || !masks.length || !width || !height) return;
        const ratio = width / height;
        element.style.containerType = 'size';
        const stage = document.createElement('div');
        stage.dataset.photoMask = '';
        stage.className = 'pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';
        stage.style.width = `min(100cqw, calc(100cqh * ${ratio.toFixed(5)}))`;
        stage.style.aspectRatio = `${width} / ${height}`;
        // Rozmazání nese kopie fotky uvnitř obdélníku s filtrem blur (posunutá tak, aby seděla na fotku pod ní), ne jen
        // backdrop-filter: ten některé prohlížeče a vykreslování bez GPU nepoužijí a nápis (NEVADA) by pod ztmavením zůstal čitelný.
        // Obdélník je neprůhledný – u kresby s průhledným pozadím by rozmazaná kopie nápis pod sebou nezakryla.
        // Poloměr roste s výškou obdélníku (velký nápis TAIPEI potřebuje víc), nejméně 10 px
        const image = element.style.backgroundImage;
        const pct = (value) => `${(value * 100).toFixed(2)}%`;
        for (const [x, y, w, h] of masks) {
            const box = document.createElement('div');
            box.className = 'absolute overflow-hidden rounded-md bg-slate-900/80 backdrop-blur-xl';
            box.style.left = pct(x);
            box.style.top = pct(y);
            box.style.width = pct(w);
            box.style.height = pct(h);
            if (image && w > 0 && h > 0) {
                box.className = 'absolute overflow-hidden rounded-md bg-slate-900';
                const copy = document.createElement('div');
                copy.className = 'absolute bg-no-repeat';
                copy.style.backgroundImage = image;
                copy.style.backgroundSize = '100% 100%';
                copy.style.left = pct(-x / w);
                copy.style.top = pct(-y / h);
                copy.style.width = pct(1 / w);
                copy.style.height = pct(1 / h);
                copy.style.filter = `blur(max(10px, ${(h * 40).toFixed(2)}cqh))`;
                const tint = document.createElement('div');
                tint.className = 'absolute inset-0 bg-slate-900/80';
                box.append(copy, tint);
            }
            stage.appendChild(box);
        }
        element.appendChild(stage);
    };
    const imageSize = (url) => new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.onerror = reject;
        probe.src = url;
    });

    const renderImage = async (container, spec) => {
        const url = await loadImage(commonsPhotoUrl(spec.file, spec.hash, 500)).catch(() => loadImage(commonsFileUrl(spec.file, spec.hash)));
        if (!container.isConnected) return;
        const picture = document.createElement('div');
        picture.className = 'absolute inset-2 bg-contain bg-center bg-no-repeat';
        picture.style.backgroundImage = `url("${url}")`;
        container.prepend(picture);
        // Tlačítko „i“ (zdroj obrázku, photo-source.js) vedle obrázku, ne v něm – kontejner má roli img
        const Source = root.MudrlantPhotoSource;
        const frame = container.parentElement;
        if (Source && frame && Source.fileFromUrl(url)) {
            frame.querySelectorAll(':scope > [data-photo-info]').forEach(button => button.remove());
            frame.insertAdjacentHTML('beforeend', Source.buttonHtml({ url, hidden: false }));
        }
        if (spec.masks && spec.masks.length) {
            const size = await imageSize(url).catch(() => null);
            if (size) maskOverlay(picture, size.width, size.height, spec.masks);
        }
    };

    // Slepá periodická tabulka: políčka bez značek obarvená podle skupin, hledaný prvek zvýrazněný
    const FAMILY_FILLS = {
        'alkalicke-kovy': 'fill-rose-200 dark:fill-rose-900',
        'kovy-alkalickych-zemin': 'fill-orange-200 dark:fill-orange-900',
        'prechodne-kovy': 'fill-sky-200 dark:fill-sky-900',
        'lanthanoidy': 'fill-violet-200 dark:fill-violet-900',
        'aktinoidy': 'fill-fuchsia-200 dark:fill-fuchsia-900',
        'ostatni-kovy': 'fill-slate-300 dark:fill-slate-600',
        'polokovy': 'fill-teal-200 dark:fill-teal-900',
        'nekovy': 'fill-lime-200 dark:fill-lime-900',
        'halogeny': 'fill-yellow-200 dark:fill-yellow-900',
        'vzacne-plyny': 'fill-indigo-200 dark:fill-indigo-900'
    };
    const renderPeriodic = async (container, spec) => {
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        // 18 sloupců a 7 řádků, mezera a dva řádky lanthanoidů a aktinoidů; tabulka vyplní a vycentruje celý panel
        const gap = 1.5;
        const cell = Math.min((width - 24) / 18, (height - 16) / 9.5);
        const left = (width - cell * 18) / 2;
        const top = Math.max(8, (height - cell * 9.5) / 2);
        const yOf = (row) => top + (row - 1) * cell - (row >= 9 ? cell * 0.5 : 0);
        for (let z = 1; z <= 118; z++) {
            const position = periodicPosition(z);
            const family = elementFamily(z);
            const isTarget = z === spec.z;
            svg.appendChild(svgElement('rect', {
                x: left + (position.col - 1) * cell + gap / 2, y: yOf(position.row) + gap / 2,
                width: cell - gap, height: cell - gap, rx: 2,
                class: isTarget ? 'fill-rose-500 stroke-rose-700 dark:stroke-white' : FAMILY_FILLS[family.key],
                'stroke-width': isTarget ? 2 : 0
            }));
        }
        // Terč kolem hledaného políčka, ať je vidět i na malém displeji
        const target = periodicPosition(spec.z);
        if (target) {
            svg.appendChild(svgElement('circle', {
                cx: left + (target.col - 0.5) * cell, cy: yOf(target.row) + cell / 2, r: cell * 1.1,
                fill: 'none', 'stroke-width': 2, class: 'stroke-rose-500/70'
            }));
        }
        container.prepend(svg);
    };

    // Stupnice (tvrdost podle Mohse, geologický čas…): osa od min do max se značkami, hledaná hodnota jako ukazatel;
    // spec = { min, max, value, ticks: [{ value, label }], valueLabel?, minLabel?, maxLabel?, log?, reverse?, marks?: [{ value, label }] }
    const renderScale = async (container, spec) => {
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        const left = 22;
        const right = width - 22;
        const axisY = Math.round(height * 0.5);
        const position = (value) => {
            const [min, max, v] = spec.log ? [spec.min, spec.max, value].map(x => Math.log10(Math.max(x, 1e-9))) : [spec.min, spec.max, value];
            const share = Math.min(Math.max((v - min) / (max - min || 1), 0), 1);
            // reverse: největší hodnota vlevo, nejmenší vpravo (geologický čas: dávná minulost vlevo, dnešek vpravo)
            return left + (right - left) * (spec.reverse ? 1 - share : share);
        };
        svg.appendChild(svgElement('rect', { x: left, y: axisY - 6, width: right - left, height: 12, rx: 6, class: 'fill-slate-200 dark:fill-slate-700' }));
        // Popisky značek ve dvou řádcích, ať se nepřekrývají
        // Nejdřív všechny čárky, pak popisky s obrysem v barvě pozadí – čárka druhého řádku nepřeškrtne popisek prvního
        const ticks = (spec.ticks || []).map((tick, index) => ({ ...tick, x: position(tick.value), row: index % 2 }));
        ticks.forEach(({ x, row }) => svg.appendChild(svgElement('line', { x1: x, x2: x, y1: axisY - 6, y2: axisY + 10 + row * 14, 'stroke-width': 1, class: 'stroke-slate-400 dark:stroke-slate-500' })));
        ticks.forEach(({ x, row, label }) => svg.appendChild(svgText(label, {
            x, y: axisY + 22 + row * 14, 'text-anchor': x < left + 20 ? 'start' : x > right - 20 ? 'end' : 'middle', 'font-size': 11, 'font-weight': 600,
            'paint-order': 'stroke', 'stroke-width': 3, 'stroke-linejoin': 'round', class: 'fill-slate-600 stroke-white dark:fill-slate-300 dark:stroke-slate-800'
        })));
        const [leftLabel, rightLabel] = spec.reverse ? [spec.maxLabel, spec.minLabel] : [spec.minLabel, spec.maxLabel];
        if (leftLabel) svg.appendChild(svgText(leftLabel, { x: left, y: axisY - 16, 'font-size': 11, class: 'fill-slate-500 dark:fill-slate-400' }));
        if (rightLabel) svg.appendChild(svgText(rightLabel, { x: right, y: axisY - 16, 'text-anchor': 'end', 'font-size': 11, class: 'fill-slate-500 dark:fill-slate-400' }));
        // Další značky (odhad hráče u číselné otázky): kroužek na ose a popisek pod ní; hledaná hodnota se kreslí až přes ně
        for (const mark of spec.marks || []) {
            const x = position(mark.value);
            svg.appendChild(svgElement('circle', { cx: x, cy: axisY, r: 8, 'stroke-width': 3, class: 'fill-sky-600 stroke-white dark:fill-sky-400 dark:stroke-slate-900' }));
            if (mark.label) {
                svg.appendChild(svgText(mark.label, {
                    x, y: axisY + 28, 'text-anchor': x < left + 60 ? 'start' : x > right - 60 ? 'end' : 'middle', 'font-size': 12, 'font-weight': 700,
                    'paint-order': 'stroke', 'stroke-width': 3, 'stroke-linejoin': 'round', class: 'fill-sky-700 stroke-white dark:fill-sky-300 dark:stroke-slate-800'
                }));
            }
        }
        if (spec.value !== undefined && spec.value !== null) {
            const x = position(spec.value);
            const barX = spec.reverse ? Math.min(x, right - 6) : left;
            svg.appendChild(svgElement('rect', { x: barX, y: axisY - 6, width: Math.max(spec.reverse ? right - x : x - left, 6), height: 12, rx: 6, class: 'fill-amber-400 dark:fill-amber-500' }));
            svg.appendChild(svgElement('circle', { cx: x, cy: axisY, r: 9, 'stroke-width': 3, class: 'fill-amber-500 stroke-white dark:stroke-slate-900' }));
            if (spec.valueLabel) {
                svg.appendChild(svgText(spec.valueLabel, {
                    x, y: axisY - 34, 'text-anchor': x < left + 40 ? 'start' : x > right - 40 ? 'end' : 'middle', 'font-size': 14, 'font-weight': 800,
                    'paint-order': 'stroke', 'stroke-width': 3, 'stroke-linejoin': 'round', class: 'fill-slate-800 stroke-white dark:fill-white dark:stroke-slate-800'
                }));
            }
        }
        container.prepend(svg);
    };

    // name = jak se nápověda jmenuje v tlačítku, frame = pozadí rámečku, corner = údaj v pravém dolním rohu
    const VISUALS = {
        map: {
            name: 'slepá mapa',
            icon: 'map',
            frame: 'border-sky-200 bg-sky-200 dark:border-slate-700 dark:bg-sky-950',
            // Výřez mapy regionu (celý stát) je známý až po načtení dat – do té doby bez čísla
            corner: (spec) => spec.regional && !spec.measured ? '↔ …' : `↔ ${formatDistance(mapWidthKm(spec))}`,
            describe: (spec) => spec.regional && !spec.measured ? `Slepá mapa bez popisků. ${spec.label}.`
                : `Slepá mapa bez popisků. ${spec.label}, výřez je široký asi ${formatDistance(mapWidthKm(spec))}.`,
            render: renderMap
        },
        timeline: {
            name: 'časová osa',
            icon: 'calendar-range',
            frame: 'border-amber-200 bg-amber-50 dark:border-slate-700 dark:bg-slate-800',
            describe: (spec) => spec.blind ? 'Časová osa bez letopočtů: hádané období mezi známými událostmi.' : 'Časová osa s roky a s několika známými událostmi pro orientaci.',
            render: renderTimeline
        },
        // Výsledek otázky Časové souvislosti: všechny možnosti na jedné ose
        chronology: {
            name: 'časová osa',
            icon: 'calendar-range',
            frame: 'border-amber-200 bg-amber-50 dark:border-slate-700 dark:bg-slate-800',
            describe: (spec) => spec.describe || 'Časová osa s možnostmi otázky.',
            render: renderChronology
        },
        periodic: {
            name: 'periodická tabulka',
            icon: 'grid-3x3',
            frame: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
            describe: () => 'Periodická tabulka bez značek prvků, políčka obarvená podle skupin, hledaný prvek zvýrazněný.',
            render: renderPeriodic
        },
        // Název a ikonu si stupnice nese ve specifikaci (tvrdost, stáří…)
        scale: {
            name: 'stupnice',
            icon: 'ruler',
            frame: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
            describe: (spec) => spec.describe || `Stupnice od ${spec.minLabel || spec.min} do ${spec.maxLabel || spec.max} s vyznačenou hodnotou.`,
            render: renderScale
        },
        // Obrázek si název a ikonu nese ve specifikaci (mapa rozšíření, strukturní vzorec…)
        image: {
            name: 'obrázek',
            icon: 'image',
            frame: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-100',
            describe: (spec) => `${spec.name ? spec.name.charAt(0).toUpperCase() + spec.name.slice(1) : 'Obrázek'} z Wikimedia Commons.`,
            render: renderImage
        }
    };

    const info = (spec) => {
        const visual = VISUALS[spec && spec.type];
        if (!visual) return null;
        return spec.name || spec.icon ? { ...visual, name: spec.name || visual.name, icon: spec.icon || visual.icon } : visual;
    };

    // Vykreslí nápovědu do kontejneru; když se nepodaří (třeba bez internetu), ukáže v něm krátkou zprávu
    const render = async (container, spec, deps) => {
        const visual = info(spec);
        if (!container || !visual) return;
        try {
            await visual.render(container, spec, deps);
        } catch (error) {
            console.error(error);
            const failure = document.createElement('p');
            failure.className = 'absolute inset-0 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400';
            failure.textContent = 'Nápovědu se nepodařilo načíst';
            container.appendChild(failure);
        }
    };

    root.MudrlantVisuals = { info, render, maskOverlay, register: (type, definition) => { VISUALS[type] = definition; } };
})(typeof self !== 'undefined' ? self : this);
