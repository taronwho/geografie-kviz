// Literární směr spisovatelů, u kterých ho Wikidata (P135) neuvádějí nebo uvádějí jiný – jen jména, která učebnice literatury
// k danému směru řadí bez sporu (přechodní autoři jako Němcová nebo Neruda tu nejsou). Klíč = název článku na české Wikipedii
// bez upřesnění v závorce. Ruční směr má přednost před Wikidaty.
const ROMANTISMUS = [
    // Anglie, Skotsko, USA
    'George Gordon Byron', 'Percy Bysshe Shelley', 'John Keats', 'William Wordsworth', 'Samuel Taylor Coleridge', 'Walter Scott', 'William Blake',
    'Mary Shelleyová', 'Robert Southey', 'Edgar Allan Poe', 'Washington Irving', 'Nathaniel Hawthorne', 'Herman Melville', 'James Fenimore Cooper',
    'Henry Wadsworth Longfellow',
    // Francie
    'Victor Hugo', 'François-René de Chateaubriand', 'Alphonse de Lamartine', 'Alfred de Musset', 'Alfred de Vigny', 'George Sandová',
    'Alexandre Dumas starší', 'Gérard de Nerval',
    // Německé země
    'Novalis', 'E. T. A. Hoffmann', 'Ludwig Tieck', 'Clemens Brentano', 'Achim von Arnim', 'Joseph von Eichendorff', 'Jacob Grimm', 'Wilhelm Grimm',
    'Heinrich Heine', 'Friedrich Schlegel', 'August Wilhelm Schlegel', 'Adelbert von Chamisso', 'Wilhelm Hauff', 'Nikolaus Lenau',
    // Rusko, Polsko, Maďarsko, Ukrajina
    'Alexandr Sergejevič Puškin', 'Michail Jurjevič Lermontov', 'Vasilij Andrejevič Žukovskij', 'Adam Mickiewicz', 'Juliusz Słowacki',
    'Zygmunt Krasiński', 'Sándor Petőfi', 'Taras Ševčenko',
    // Itálie, Španělsko, Portugalsko, Dánsko
    'Giacomo Leopardi', 'Alessandro Manzoni', 'Ugo Foscolo', 'José de Espronceda', 'Gustavo Adolfo Bécquer', 'José Zorrilla', 'Almeida Garrett',
    'Hans Christian Andersen', 'Adam Oehlenschläger',
    // Česko a Slovensko
    'Karel Hynek Mácha', 'Karel Jaromír Erben', 'Karel Sabina', 'Ján Botto', 'Janko Kráľ', 'Samo Chalupka', 'Andrej Sládkovič'
];
const REALISMUS = [
    'Honoré de Balzac', 'Gustave Flaubert', 'Charles Dickens', 'William Makepeace Thackeray', 'Elizabeth Gaskellová', 'Anthony Trollope',
    'Thomas Hardy', 'Lev Nikolajevič Tolstoj', 'Fjodor Michajlovič Dostojevskij', 'Ivan Sergejevič Turgeněv', 'Ivan Alexandrovič Gončarov',
    'Anton Pavlovič Čechov', 'Nikolaj Vasiljevič Gogol', 'Alexandr Nikolajevič Ostrovskij', 'Nikolaj Semjonovič Leskov', 'Mark Twain', 'Henry James',
    'William Dean Howells', 'Theodor Fontane', 'Gottfried Keller', 'Theodor Storm', 'Wilhelm Raabe', 'Benito Pérez Galdós', 'José Maria Eça de Queirós',
    'Henrik Ibsen', 'Bolesław Prus', 'Eliza Orzeszkowa', 'Stendhal', 'Joaquim Maria Machado de Assis',
    // Česká literatura
    'Alois Jirásek', 'Karel Václav Rais', 'Teréza Nováková', 'Josef Holeček', 'Ignát Herrmann', 'Antal Stašek', 'Zikmund Winter', 'Alois Mrštík',
    'Gabriela Preissová', 'Jan Herben'
];
const NATURALISMUS = [
    'Émile Zola', 'Guy de Maupassant', 'Edmond de Goncourt', 'Jules de Goncourt', 'Gerhart Hauptmann', 'Arno Holz', 'Frank Norris', 'Theodore Dreiser',
    'Stephen Crane', 'Jack London', 'Karel Matěj Čapek-Chod', 'Vilém Mrštík'
];
// Wikidata je řadí jinam, než je zvykem (Banville k romantismu, i když patří k parnasistům)
const JINE = [['Théodore de Banville', 'parnasismus'], ['Jules Barbey d’Aurevilly', 'dekadence']];
export const MOVEMENTS = new Map([
    ...JINE,
    ...ROMANTISMUS.map(name => [name, 'romantismus']),
    ...REALISMUS.map(name => [name, 'realismus']),
    ...NATURALISMUS.map(name => [name, 'naturalismus'])
]);
// Období směru: díla autora z té doby patří do okruhu směru (Máj, Bídníci), pozdní nebo rané dílo mimo období ne
export const MOVEMENT_YEARS = { romantismus: [1790, 1870], realismus: [1830, 1910], naturalismus: [1865, 1915] };
