import { MatchEngine } from '../src/match/engine';
const N = Number(process.argv[2] ?? 20);
const lvl = Number(process.argv[3] ?? 65);
let ug = 0, ua = 0, rat = 0, goals = 0, dec = 0, shots = 0;
for (let i = 0; i < N; i++) {
  const a = (v: number) => v;
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: lvl },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: lvl },
    homeId: 'a', awayId: 'b', userTeam: 0,
    user: { name: 'Joao Teste', position: (process.argv[4] as any) ?? 'ST', energy: 90, morale: 60, startsOnBench: false, number: 9,
      attrs: { pace: a(lvl + 4), shooting: a(lvl + 5), passing: a(lvl), dribbling: a(lvl + 3), defending: lvl - 25, physical: lvl - 3, vision: lvl - 2, composure: lvl } },
  });
  let g = 0;
  while (e.phase !== 'fulltime' && g++ < 100000) {
    if (e.decision) {
      const o = e.decision.options;
      const shot = o.filter(x => x.kind === 'goal').sort((p, q) => q.chance - p.chance)[0];
      let pick = shot && shot.chance >= 0.16 ? shot : undefined;
      if (!pick) pick = o.find(x => x.id === 'pass_through' && x.chance > 0.5) ?? o.find(x => x.id === 'run_behind' && x.chance > 0.4) ?? o.find(x => x.id === 'ask_ball') ?? o.filter(x => x.id !== 'hold_pos').sort((p, q) => q.chance - p.chance)[0] ?? o[0];
      if (pick.kind === 'goal') shots++;
      e.resolve(pick.id);
    }
    e.step(1 / 30);
  }
  const r = e.report();
  ug += r.user!.goals; ua += r.user!.assists; rat += r.user!.rating; goals += r.hg + r.ag; dec += e.stats.decisions;
}
console.log({ userGoals: ug / N, userAssists: ua / N, userShots: shots / N, rating: (rat / N).toFixed(2), matchGoals: goals / N, decisions: dec / N });
