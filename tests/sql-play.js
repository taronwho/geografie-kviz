// Pomůcka pro SQL testy: výsledek (počet správných a body) rozepsaný na odpovědi po otázkách tak, jak je aplikace ukládá na server
// (challenge_progress_save, tournament_answer_save). Správná odpověď má 1 až max bodů, špatná 0; konečný výsledek pak server sečte z nich.
const answersFor = (count, correct, points, max = 4) => {
    if (correct > count || (!correct && points) || (correct && (points < correct || points > correct * max))) throw new Error(`Výsledek ${correct}/${count} za ${points} b. nejde rozepsat na otázky.`);
    const base = correct ? Math.floor(points / correct) : 0;
    const extra = correct ? points % correct : 0;
    return Array.from({ length: count }, (_, i) => (i < correct ? { correct: true, points: base + (i < extra ? 1 : 0) } : { correct: false, points: 0 }));
};
// SQL, které uloží celý průběh výzvy (výzva bez pevného způsobu odpovídání: až 8 bodů za otázku)
const challengeProgressSql = (code, count, correct, points, max = 8) => answersFor(count, correct, points, max)
    .map((answer, idx) => `select challenge_progress_save('${code}', ${idx}, ${answer.correct}, ${answer.points});`).join(' ');
// SQL, které uloží všech 10 odpovědí zápasu turnaje (výběr z možností: až 4 body za otázku)
const tournamentAnswersSql = (mid, correct, points) => answersFor(10, correct, points, 4)
    .map((answer, idx) => `select tournament_answer_save('${mid}', ${idx}, ${answer.correct}, ${answer.points});`).join(' ');
// Odpovědi a konec zápasu turnaje najednou (jako aplikace: nejdřív všechny odpovědi, pak tournament_finish_match)
const finishMatchSql = (mid, correct, points) => `${tournamentAnswersSql(mid, correct, points)} select tournament_finish_match('${mid}', ${correct}, ${points});`;

module.exports = { answersFor, challengeProgressSql, tournamentAnswersSql, finishMatchSql };
