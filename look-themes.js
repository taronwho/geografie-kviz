// Vzhled: barevná témata aplikace (zatím jen kostra, doplní se). Používá MudrlantLook (look.js).
(function () {
    'use strict';
    const Look = window.MudrlantLook;
    if (!Look) return;
    Look.register({
        id: 'themes', title: 'Barevné téma', order: 10,
        render: () => '<p class="text-xs text-slate-500">Brzy.</p>',
        click: () => false,
        apply: () => {}
    });
})();
