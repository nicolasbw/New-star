import { MatchEngine } from '../src/match/engine';

const N = Number(process.argv[2] ?? 20);
let goals = 0, shots = 0, decisions = 0, homeW = 0, ratings = 0, ug = 0, kinds: Record<string, number> = {};
let realTime = 0;
for (let i = 0; i < N; i++) {
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: 65 },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: 65 },
    homeId: 'a', awayId: 'b', userTeam: 0,
    user: process.argv[3] === 'nouser' ? null : { name: 'Joao Teste', position: 'ST', energy: 90, morale: 60, startsOnBench: false, number: 9,
      attrs: { pace: 70, shooting: 70, passing: 62, dribbling: 68, defending: 35, physical: 60, vision: 60, composure: 64 } },
  });
  let t = 0; let guard = 0;
  while (e.phase !== 'fulltime' && guard++ < 200000) {
    if (e.decision) {
      kinds[e.decision.kind] = (kinds[e.decision.kind] ?? 0) + 1;
      // pick random option
      const o = e.decision.options[Math.floor(Math.random() * e.decision.options.length)];
      e.resolve(o.id);
      realTime += 3;
    }
    e.step(1 / 60); t += 1 / 60;
  }
  realTime += t / 1.6;
  const r = e.report();
  goals += r.hg + r.ag; shots += e.shots[0] + e.shots[1]; decisions += e.stats.decisions;
  if (r.hg > r.ag) homeW++;
  ratings += r.user?.rating ?? 0; ug += r.user?.goals ?? 0;
  if (i < 5) console.log(`${r.hg}-${r.ag} shots ${e.shots} dec ${e.stats.decisions} rating ${r.user?.rating} g${r.user?.goals} a${r.user?.assists} simT ${t.toFixed(0)} poss ${e.possTime.map(x=>x.toFixed(0))}`);
}
console.log({ avgGoals: goals / N, avgShots: shots / N, avgDecisions: decisions / N, homeWin: homeW / N, avgRating: ratings / N, userGoals: ug / N, kinds, estRealMin: realTime / N / 60 });
