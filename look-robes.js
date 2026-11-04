// Vzhled: barva obleku sovy (zatím jen kostra, doplní se). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    Look.register({
        id: 'robes', title: 'Barva obleku sovy', order: 20,
        render: () => '<p class="text-xs text-slate-500">Brzy.</p>',
        click: () => false,
        apply: () => {}
    });
})();
