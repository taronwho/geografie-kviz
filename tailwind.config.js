/** @type {import('tailwindcss').Config} */
// Barvy podle loga (sova v talároku): vínová (brand) na hlavní akce a výběr, zlatá (gold) na zvýraznění,
// neutrální šedá podle tmavého pozadí loga. Šedá přepisuje Tailwind „slate“, takže třídy v kódu zůstávají slate-*;
// světlé odstíny mají teplý nádech krémového obrysu, tmavé jsou grafitové jako pozadí loga (#2d3034 = slate-800).
module.exports = {
    content: ['./index.html', './app.js', './visuals.js', './topics/*.js'],
    darkMode: 'media',
    // Najetí myší jen tam, kde myš je – na telefonu by po klepnutí „hover“ zůstal viset (bílé tlačítko v tmavém režimu)
    future: { hoverOnlyWhenSupported: true },
    theme: {
        extend: {
            colors: {
                slate: {
                    50: '#f7f6f3', 100: '#eeece8', 200: '#e1dfda', 300: '#c9c6c0', 400: '#9d9a95', 500: '#75767a',
                    600: '#585b60', 700: '#41454a', 800: '#2d3034', 900: '#212326', 950: '#161719'
                },
                brand: {
                    50: '#fbf3f6', 100: '#f7e5ec', 200: '#efc8d6', 300: '#e29db4', 400: '#d06c8d', 500: '#b9476c',
                    600: '#9f3256', 700: '#87233f', 800: '#701d35', 900: '#5c1a2f', 950: '#370a18'
                },
                gold: {
                    50: '#fdf9ec', 100: '#faeecb', 200: '#f5dc93', 300: '#efc55c', 400: '#e8ae38', 500: '#d69725',
                    600: '#b9771b', 700: '#94571a', 800: '#7a461b', 900: '#673b1a', 950: '#3b1e0a'
                },
                cream: '#fee2b0'
            }
        }
    },
    plugins: []
};
