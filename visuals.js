// Obrazové nápovědy témat (vykreslení do stránky): slepá mapa; další druhy přidávají témata, která je potřebují
(function (root) {
    'use strict';

    const { buildBlindMap, formatNumber } = root.MudrlantCore;
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

    // name = jak se nápověda jmenuje v tlačítku, frame = pozadí rámečku, corner = údaj v pravém dolním rohu
    const VISUALS = {
        map: {
            name: 'slepá mapa',
            icon: 'map',
            frame: 'border-sky-200 bg-sky-200 dark:border-slate-700 dark:bg-sky-950',
            corner: (spec) => `↔ ${formatDistance(mapWidthKm(spec))}`,
            describe: (spec) => `Slepá mapa bez popisků. ${spec.label}, výřez je široký asi ${formatDistance(mapWidthKm(spec))}.`,
            render: renderMap
        }
    };

    const info = (spec) => VISUALS[spec && spec.type] || null;

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
