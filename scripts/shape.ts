import { MatchEngine } from '../src/match/engine';
// Team shape relative to the ball while attacking past halfway, and abrupt stops.
const acc: Record<string, { gap: number; n: number }> = {};
let stops = 0;
for (let m = 0; m < 3; m++) {
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: 65 },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: 65 },
    homeId: 'a', awayId: 'b', userTeam: 0, user: null,
  });
  const prev = new Map<number, number>();
  let t = 0;
  while (e.phase !== 'fulltime' && t < 400) {
    e.step(1 / 60); t += 1 / 60;
    if (e.phase !== 'play') { prev.clear(); continue; }
    for (const a of e.agents) {
      const s1 = Math.hypot(a.vx, a.vy);
      const s0 = prev.get(a.id);
      if (s0 !== undefined && s0 > 4 && s1 < 1) stops++;
      prev.set(a.id, s1);
    }
    const o = e.ball.owner;
    if (!o || o.role === 'GK') continue;
    const bx = o.team === 0 ? o.x : -o.x;
    if (bx < 5) continue;
    for (const a of e.agents) {
      if (a.team !== o.team || a.sentOff || a.role === 'GK') continue;
      const ax = a.team === 0 ? a.x : -a.x;
      acc[a.role] ??= { gap: 0, n: 0 };
      acc[a.role].gap += ax - bx; acc[a.role].n++;
    }
  }
}
console.log('line position relative to the ball when attacking (m):', Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +(v.gap / v.n).toFixed(1)])));
console.log('abrupt stops per match:', (stops / 3).toFixed(0));
