// Společné kroky e2e testů pro hlavní navigaci aplikace: spodní lišta s pěti záložkami (Dnes, Hrát, Soupeři, Postup, Já),
// okna Výzvy a Turnaje na záložce Soupeři, Nastavení ze záložky Já a výběr dnešní otázky z karty Dnešní otázky.
// tab = stránka Playwrightu. Kroky jsou napsané tak, aby šly volat odkudkoli z hlavních obrazovek (samy přepnou záložku).

// Hlavní obrazovka je vidět (kterákoli záložka)
const waitForHome = (tab, options = {}) => tab.waitForSelector('#app-content > [data-tab-root]', { timeout: 30000, ...options });
const currentTab = (tab) => tab.evaluate(() => { const root = document.querySelector('#app-content > [data-tab-root]'); return root ? root.dataset.tabRoot : ''; });

// Přepne na záložku (dnes | hrat | souperi | postup | ja); na už zobrazené záložce bez otevřeného okna nedělá nic
const go = async (tab, id) => {
    if ((await currentTab(tab)) !== id) await tab.click(`#app-nav [data-nav="${id}"]`);
    await tab.waitForSelector(`#app-content > [data-tab-root="${id}"]`);
};

// Okno Výzvy (Vyzvat, Náhodný soupeř, Zadat kód, liga, poslední výzvy) a okno Turnaje na záložce Soupeři
const openSub = async (tab, view, selector) => {
    if ((await currentTab(tab)) !== `souperi:${view}`) {
        await go(tab, 'souperi');
        await tab.click(`[data-action="souperi-open"][data-view="${view}"]`);
    }
    await tab.waitForSelector(selector);
};
const challenges = (tab) => openSub(tab, 'vyzvy', '#challenges-section');
const tournaments = (tab) => openSub(tab, 'turnaje', '#tournaments-section');

// Okno Nastavení: při hře ho otevře obrázek hráče (ozubené kolečko) v hlavičce, na hlavních obrazovkách vede tlačítko na záložku Já
// a Nastavení otevře její řádek (which: game = Nastavení hry, profile = Profil, owl = Mudrlant)
const settings = async (tab, which = 'game') => {
    if (!(await tab.$('#settings-overlay'))) {
        await tab.click('#btn-settings');
        if (!(await tab.$('#settings-overlay'))) await tab.click(`#ja-rows [data-ja="${which}"]`);
    }
    await tab.waitForSelector('#settings-overlay');
};

// Dnešní otázka tématu: karta Dnešní otázky na záložce Dnes otevře okno s tématy (bez tématu první téma v okně)
const daily = async (tab, topic = '') => {
    if (!(await tab.$('#daily-sheet'))) {
        await go(tab, 'dnes');
        await tab.click('[data-action="daily-sheet"]');
    }
    await tab.click(`#daily-sheet [data-action="daily"]${topic ? `[data-topic="${topic}"]` : ''}`);
};
// Okno Dnešní otázky (pro kontrolu stavu témat)
const dailySheet = async (tab) => {
    if (!(await tab.$('#daily-sheet'))) {
        await go(tab, 'dnes');
        await tab.click('[data-action="daily-sheet"]');
    }
    await tab.waitForSelector('#daily-sheet');
};

// Dlaždice tématu na záložce Hrát otevře okno Co hrát; play = hned spustit hru tlačítkem Hrát
const topic = async (tab, id, { play = true } = {}) => {
    await go(tab, 'hrat');
    await tab.click(`[data-action="play-topic"][data-topic="${id}"]`);
    await tab.waitForSelector('#play-chooser');
    if (play) await tab.click('[data-chooser-play]');
};
const mix = async (tab, { play = true } = {}) => {
    await go(tab, 'hrat');
    await tab.click('[data-action="play-mix"]');
    await tab.waitForSelector('#play-chooser');
    if (play) await tab.click('[data-chooser-play]');
};
// Učení (dlaždice mezi Režimy na záložce Hrát; při hře tlačítko v hlavičce)
const learn = async (tab) => {
    if (await tab.locator('#btn-learn:not(.hidden)').count()) { await tab.click('#btn-learn'); return; }
    await go(tab, 'hrat');
    await tab.click('[data-action="open-learn"]');
};

module.exports = { waitForHome, currentTab, go, challenges, tournaments, settings, daily, dailySheet, topic, mix, learn };
