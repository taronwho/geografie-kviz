/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './app.js', './visuals.js', './topics/*.js'],
    darkMode: 'media',
    // Najetí myší jen tam, kde myš je – na telefonu by po klepnutí „hover“ zůstal viset (bílé tlačítko v tmavém režimu)
    future: { hoverOnlyWhenSupported: true },
    theme: { extend: {} },
    plugins: []
};
