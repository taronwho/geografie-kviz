/** @type {import('tailwindcss').Config} */
// Barvy podle loga (sova v talároku): vínová (brand, přepínatelná tématem přes CSS proměnné v src/input.css) na hlavní akce a výběr, zlatá (gold) na zvýraznění,
// neutrální šedá podle tmavého pozadí loga. Šedá přepisuje Tailwind „slate“, takže třídy v kódu zůstávají slate-*;
// světlé odstíny mají teplý nádech krémového obrysu, tmavé jsou grafitové jako pozadí loga (#2d3034 = slate-800).
module.exports = {
    content: ['./index.html', './licence.html', './soukromi.html', './licence.js', './app.js', './friends.js', './look*.js', './tutorial.js', './visuals.js', './question-map.js', './numeric-questions.js', './topics/*.js', './daily-quiz.js'],
    darkMode: 'media',
    // Najetí myší jen tam, kde myš je – na telefonu by po klepnutí „hover“ zůstal viset (bílé tlačítko v tmavém režimu)
    future: { hoverOnlyWhenSupported: true },
    theme: {
        extend: {
            colors: {
                slate: {
                    50: '#f7f6f3', 100: '#eeece8', 200: '#e1dfda', 300: '#c9c6c0', 400: '#9d9a95', 500: '#686a6e',
                    600: '#585b60', 700: '#41454a', 800: '#2d3034', 900: '#212326', 950: '#161719'
                },
                brand: {
                    50: 'rgb(var(--brand-50) / <alpha-value>)',
                    100: 'rgb(var(--brand-100) / <alpha-value>)',
                    200: 'rgb(var(--brand-200) / <alpha-value>)',
                    300: 'rgb(var(--brand-300) / <alpha-value>)',
                    400: 'rgb(var(--brand-400) / <alpha-value>)',
                    500: 'rgb(var(--brand-500) / <alpha-value>)',
                    600: 'rgb(var(--brand-600) / <alpha-value>)',
                    700: 'rgb(var(--brand-700) / <alpha-value>)',
                    800: 'rgb(var(--brand-800) / <alpha-value>)',
                    900: 'rgb(var(--brand-900) / <alpha-value>)',
                    950: 'rgb(var(--brand-950) / <alpha-value>)'
                },
                gold: {
                    50: '#fdf9ec', 100: '#faeecb', 200: '#f5dc93', 300: '#efc55c', 400: '#e8ae38', 500: '#d69725',
                    600: '#b9771b', 700: '#94571a', 800: '#7a461b', 900: '#673b1a', 950: '#3b1e0a'
                },
                cream: '#fee2b0'
            }
        }
    },
    // short: = nízký displej (telefon 360×640 a podobné, okno do 770 px výšky). Úvod a okna se na něm zhustí, aby se vešly bez posouvání;
    // vyšší displeje (390×780, 412×915) zůstávají beze změny. Vlastní varianta, ne položka v screens: s ní by přestaly fungovat max-[…]: varianty.
    plugins: [({ addVariant }) => addVariant('short', '@media (max-height: 770px)')]
};
