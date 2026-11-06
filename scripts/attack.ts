import { MatchEngine } from '../src/match/engine';
// Attacking quality metrics (AI vs AI):
//  - open passing options around the carrier (teammates 6-28 m away with a clear lane and space)
//  - share of forward passes, passes per possession
//  - how far possessions get (final third reached), shots
const N = Number(process.argv[2] ?? 4);
let optSum = 0, optN = 0, fwd = 0, passes = 0, poss = 0, reachedFinal = 0, shots = 0, goals = 0, oneTwos = 0, triSum = 0;
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};
for (let m = 0; m < N; m++) {
  const e = new MatchEngine({
    home: { name: 'A', short: 'AAA', primary: '#f00', secondary: '#fff', strength: 65 },
    away: { name: 'B', short: 'BBB', primary: '#00f', secondary: '#fff', strength: 65 },
    homeId: 'a', awayId: 'b', userTeam: 0, user: null,
  });
  const origPass = e.pass.bind(e);
  let lastPasser: any = null, lastReceiver: any = null;
  e.pass = (from: any, to: any, opts: any = {}) => {
    passes++;
    const nf = from.team === 0 ? from.x : -from.x, nt = to.team === 0 ? to.x : -to.x;
    if (nt > nf + 3) fwd++;
    if (lastPasser && lastReceiver === from && lastPasser === to) oneTwos++;
    lastPasser = from; lastReceiver = to;
    return origPass(from, to, opts);
  };
  let t = 0, curTeam = -1, maxX = -99, sampleT = 0;
  while (e.phase !== 'fulltime' && t < 400) {
    e.step(1 / 60); t += 1 / 60;
    const o = e.ball.owner;
    if (!o || e.phase !== 'play') continue;
    if (o.team !== curTeam) {
      if (curTeam >= 0) { poss++; if (maxX > 17.5) reachedFinal++; }
      curTeam = o.team; maxX = -99;
    }
    const nx = o.team === 0 ? o.x : -o.x;
    maxX = Math.max(maxX, nx);
    sampleT += 1 / 60;
    if (sampleT > 0.5 && o.role !== 'GK') {
      sampleT = 0;
      let opts = 0; const near: any[] = [];
      for (const a of e.agents) {
        if (a.team !== o.team || a === o || a.sentOff || a.role === 'GK') continue;
        const d = Math.hypot(a.x - o.x, a.y - o.y);
        if (d < 6 || d > 28) continue;
        let lane = 9, open = 9;
        for (const b of e.agents) { if (b.team === o.team || b.sentOff) continue; lane = Math.min(lane, segDist(b.x, b.y, o.x, o.y, a.x, a.y)); open = Math.min(open, Math.hypot(b.x - a.x, b.y - a.y)); }
        if (lane > 1.6 && open > 3) { opts++; if (d < 20) near.push(a); }
      }
      optSum += opts; optN++;
      // a triangle: two open options within 20 m that are also connected to each other (8-20 m apart)
      let tri = 0;
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) { const d = Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y); if (d > 7 && d < 22) tri = 1; }
      triSum += tri;
    }
  }
  shots += e.shots[0] + e.shots[1]; goals += e.score[0] + e.score[1];
}
console.log({
  openOptionsAroundCarrier: +(optSum / optN).toFixed(2),
  triangleAvailable: +((triSum / optN) * 100).toFixed(0) + '%',
  forwardPassShare: +((fwd / passes) * 100).toFixed(0) + '%',
  passesPerPossession: +(passes / poss).toFixed(2),
  oneTwosPerMatch: +(oneTwos / N).toFixed(1),
  possessionsReachingFinalThird: +((reachedFinal / poss) * 100).toFixed(0) + '%',
  shotsPerMatch: +(shots / N).toFixed(1),
  goalsPerMatch: +(goals / N).toFixed(2),
});
