// Obrazové nápovědy témat (vykreslení do stránky): slepá mapa, časová osa, obrázek (mapa rozšíření), periodická tabulka
(function (root) {
    'use strict';

    const { buildBlindMap, buildTimeline, formatNumber, commonsPhotoUrl, commonsFileUrl, periodicPosition, elementFamily } = root.MudrlantCore;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const svgElement = (tag, attributes) => {
        const element = document.createElementNS(SVG_NS, tag);
        Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
        return element;
    };

    const formatDistance = (km) => `${formatNumber(km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10)} km`;
    // Šířka výřezu mapy v kilometrech (na rovnoběžce místa) – dává představu o měřítku
    const mapWidthKm = (spec) => spec.span * 111.32 * Math.cos(spec.lat * Math.PI / 180);

    // Slepá mapa: obrysy států bez jediného popisku, místo označené terčem uprostřed (u států zvýrazněný celý stát)
    const renderMap = async (container, spec, { loadWorld }) => {
        const world = await loadWorld();
        if (!container.isConnected) return;
        const width = Math.round(container.clientWidth) || 360;
        const height = Math.round(container.clientHeight) || 224;
        const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, class: 'absolute inset-0 h-full w-full', 'aria-hidden': 'true' });
        const shapes = buildBlindMap(world, { lat: spec.lat, lon: spec.lon, spanLon: spec.span, width, height, highlightIso: spec.highlightIso });
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
        // Malé státy (Malta, Monako) na mapě obrys nemají – pak i u státu terč
        if (!shapes.some(shape => shape.highlight)) {
            svg.appendChild(svgElement('circle', { cx: width / 2, cy: height / 2, r: 15, fill: 'none', 'stroke-width': 2.5, class: 'stroke-rose-500/60' }));
            svg.appendChild(svgElement('circle', { cx: width / 2, cy: height / 2, r: 6, 'stroke-width': 2.5, class: 'fill-rose-500 stroke-white' }));
        }
        container.prepend(svg);
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
        const axisY = Math.round(height * 0.58);
        svg.appendChild(svgElement('line', { x1: 12, x2: width - 12, y1: axisY, y2: axisY, 'stroke-width': 2, class: 'stroke-slate-400 dark:stroke-slate-500' }));
        // Osa bez letopočtů: aspoň směr času
        if (spec.blind) {
            svg.appendChild(svgText('dříve', { x: 14, y: axisY + 20, 'font-size': 11, 'font-weight': 600, class: 'fill-slate-400 dark:fill-slate-500' }));
            svg.appendChild(svgText('později →', { x: width - 14, y: axisY + 20, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600, class: 'fill-slate-400 dark:fill-slate-500' }));
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
            const y = axisY + 46 + anchor.row * 15;
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
            svg.appendChild(svgElement('rect', { x, y: 12, width: 12, height: 12, rx: 3, class: fill }));
            svg.appendChild(svgText(text, { x: x + 17, y: 22, 'font-size': 12, 'font-weight': 600, class: 'fill-slate-600 dark:fill-slate-300' }));
        });
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
    const renderImage = async (container, spec) => {
        const url = await loadImage(commonsPhotoUrl(spec.file, spec.hash, 500)).catch(() => loadImage(commonsFileUrl(spec.file, spec.hash)));
        if (!container.isConnected) return;
        const picture = document.createElement('div');
        picture.className = 'absolute inset-2 bg-contain bg-center bg-no-repeat';
        picture.style.backgroundImage = `url("${url}")`;
        container.prepend(picture);
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
        // 18 sloupců a 7 řádků, mezera a dva řádky lanthanoidů a aktinoidů; místo dole pro popisek
        const gap = 1.5;
        const cell = Math.min((width - 24) / 18, (height - 44) / 9.5);
        const left = (width - cell * 18) / 2;
        const top = 10;
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

    // name = jak se nápověda jmenuje v tlačítku, frame = pozadí rámečku, corner = údaj v pravém dolním rohu
    const VISUALS = {
        map: {
            name: 'slepá mapa',
            icon: 'map',
            frame: 'border-sky-200 bg-sky-200 dark:border-slate-700 dark:bg-sky-950',
            corner: (spec) => `↔ ${formatDistance(mapWidthKm(spec))}`,
            describe: (spec) => `Slepá mapa bez popisků. ${spec.label}, výřez je široký asi ${formatDistance(mapWidthKm(spec))}.`,
            render: renderMap
        },
        timeline: {
            name: 'časová osa',
            icon: 'calendar-range',
            frame: 'border-amber-200 bg-amber-50 dark:border-slate-700 dark:bg-slate-800',
            describe: (spec) => spec.blind ? 'Časová osa bez letopočtů: hádané období mezi známými událostmi.' : 'Časová osa s roky a s několika známými událostmi pro orientaci.',
            render: renderTimeline
        },
        periodic: {
            name: 'periodická tabulka',
            icon: 'grid-3x3',
            frame: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
            describe: () => 'Periodická tabulka bez značek prvků, políčka obarvená podle skupin, hledaný prvek zvýrazněný.',
            render: renderPeriodic
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
            failure.className = 'absolute inset-0 flex items-center justify-center text-sm text-slate-500';
            failure.textContent = 'Nápovědu se nepodařilo načíst';
            container.appendChild(failure);
        }
    };

    root.MudrlantVisuals = { info, render, register: (type, definition) => { VISUALS[type] = definition; } };
})(typeof self !== 'undefined' ? self : this);
