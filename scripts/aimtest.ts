import { MatchEngine } from '../src/match/engine';
// Plays matches where the user always draws a pass into the best point found on a grid ahead,
// to check that aimed passes resolve (receiver gets the ball) and their chances are calibrated.
let tries = 0, okRoll = 0, completed = 0, expected = 0;
for (let m = 0; m < 6; m++) {
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: 65 },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: 65 },
    homeId: 'a', awayId: 'b', userTeam: 0,
    user: { name: 'Joao Teste', position: 'CAM', energy: 90, morale: 60, startsOnBench: false, number: 10,
      attrs: { pace: 68, shooting: 66, passing: 74, dribbling: 68, defending: 40, physical: 60, vision: 72, composure: 66 } },
  });
  let g = 0;
  let pending: { team: number; t: number } | null = null;
  while (e.phase !== 'fulltime' && g++ < 200000) {
    const d = e.decision;
    if (d) {
      if (d.targets.length && d.kind === 'onBall' && e.user) {
        const u = e.user;
        let best: any = null;
        for (let dx = 6; dx <= 34; dx += 4) for (let dy = -20; dy <= 20; dy += 4) {
          const info = e.aimPass(u.x + dx, u.y + dy);
          if (info && info.through && (!best || info.chance > best.chance)) best = info;
        }
        if (best) {
          tries++; expected += best.chance;
          const ok = e.resolve('pass_point', undefined, { x: best.x, y: best.y, mode: 'auto' });
          if (ok) okRoll++;
          pending = { team: 0, t: e.time };
          continue;
        }
      }
      e.resolve(e.autoChoice());
    }
    e.step(1 / 60);
    if (pending && e.ball.owner) { if (e.ball.owner.team === 0) completed++; pending = null; }
  }
}
console.log({ tries, avgChance: (expected / tries).toFixed(2), rolledOk: (okRoll / tries).toFixed(2), keptPossession: (completed / tries).toFixed(2) });
