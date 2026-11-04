// Vzhled: rámečky profilu, obrázky hráče a titul u jména (zatím jen kostra, doplní se). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    Look.register({
        id: 'frames', title: 'Rámeček, obrázek a titul', order: 30,
        render: () => '<p class="text-xs text-slate-500">Brzy.</p>',
        click: () => false,
        apply: () => {}
    });
})();
