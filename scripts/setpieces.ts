import { MatchEngine } from '../src/match/engine';
// Checks that set pieces resolve (no stuck restarts) and how long they take.
let restarts = 0, restartTime = 0, maxRestart = 0, headers = 0, kinds: Record<string, number> = {}, finished = 0;
const N = 10;
for (let m = 0; m < N; m++) {
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: 65 },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: 65 },
    homeId: 'a', awayId: 'b', userTeam: 0,
    user: { name: 'Joao Teste', position: 'CAM', energy: 90, morale: 60, startsOnBench: false, number: 10,
      attrs: { pace: 70, shooting: 70, passing: 72, dribbling: 70, defending: 40, physical: 60, vision: 70, composure: 68 } },
  });
  const origShoot = e.shoot.bind(e);
  e.shoot = (a: any, k: string, f?: any) => { if (k === 'header') headers++; return origShoot(a, k, f); };
  let g = 0, cur = 0;
  while (e.phase !== 'fulltime' && g++ < 200000) {
    if (e.decision) {
      const d = e.decision;
      if (d.setPiece) kinds['user-' + d.setPiece] = (kinds['user-' + d.setPiece] ?? 0) + 1;
      if (d.targets.length && Math.random() < 0.4) e.resolve('pass_to', d.targets[Math.floor(Math.random() * d.targets.length)].agent.id);
      else e.resolve(d.options[Math.floor(Math.random() * d.options.length)].id);
    }
    const before = e.phase;
    e.step(1 / 60);
    if (e.phase === 'restart') { if (before !== 'restart') { restarts++; kinds[e.setPiece!.kind] = (kinds[e.setPiece!.kind] ?? 0) + 1; cur = 0; } cur += 1 / 60; restartTime += 1 / 60; maxRestart = Math.max(maxRestart, cur); }
  }
  if (e.phase === 'fulltime') finished++;
}
console.log({ finished: `${finished}/${N}`, restartsPerMatch: restarts / N, avgRestartSec: (restartTime / restarts).toFixed(2), maxRestartSec: maxRestart.toFixed(2), headersPerMatch: headers / N, kinds });
