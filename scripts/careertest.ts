(globalThis as any).localStorage = { _s: {} as any, getItem(k: string) { return this._s[k] ?? null; }, setItem(k: string, v: string) { this._s[k] = v; }, removeItem(k: string) { delete this._s[k]; } };
const C = await import('../src/career/career');
const { resolveEvent, EVENTS } = await import('../src/career/events');
const { MatchEngine } = await import('../src/match/engine');
const { overall } = await import('../src/career/player');
const { strengthOf } = await import('../src/career/league');
const clubs = C.createClubs();
const c = C.newCareer('Teste Silva', 'BR', 'ST', C.youthOffers(clubs)[1].id, clubs);
const evCount: Record<string, number> = {};
let played = 0;
for (let w = 0; w < 18 * 6 && !c.retired; w++) {
  if (c.pendingEvent) { evCount[c.pendingEvent] = (evCount[c.pendingEvent] ?? 0) + 1; const ev = EVENTS.find(e => e.id === c.pendingEvent)!; const ch = ev.choices[Math.floor(Math.random() * ev.choices.length)]; if (!resolveEvent(c, ch.id)) c.pendingEvent = null; }
  C.doActivity(c, ['train_finishing', 'train_technique', 'rest', 'train_physical', 'social'][w % 5]);
  C.doActivity(c, 'train_finishing');
  const sel = C.selection(c); c.flags.lastSelection = sel as any;
  const fx = C.nextFixture(c)!;
  let report = null as any;
  if (sel === 'starter' || sel === 'bench') {
    const home = C.club(c, fx.home), away = C.club(c, fx.away), sq = c.player.squad;
    const ts = (cl: any) => ({ name: cl.name, short: cl.short, primary: cl.primary, secondary: cl.secondary, strength: strengthOf(cl, sq) });
    const e = new MatchEngine({ home: ts(home), away: ts(away), homeId: home.id, awayId: away.id, userTeam: fx.home === c.player.clubId ? 0 : 1,
      user: { name: c.player.name, attrs: { ...c.player.attrs }, position: c.player.position, energy: c.player.energy, morale: c.player.morale, startsOnBench: sel === 'bench', number: 9 } });
    let g = 0; while (e.phase !== 'fulltime' && g++ < 100000) { if (e.decision) { const o = e.decision.options; e.resolve(o[0].id); } e.step(1 / 30); }
    report = e.report(); played++;
  } else {
    report = { homeId: fx.home, awayId: fx.away, hg: 1, ag: 1, userTeam: 0, user: null, injuredWeeks: 0, goals: [], energyUsed: 0 };
  }
  C.finishWeek(c, report);
  if (c.week === 0) { const p = c.player; console.log(`season end -> S${c.season} age ${p.age} ${p.squad} ovr ${overall(p)} club ${C.myClub(c).short}(${C.myClub(c).strength}) money ${Math.round(p.money)} fame ${p.fame.toFixed(1)} last season`, p.history.at(-1)); }
}
console.log('played', played, 'events', evCount);
console.log(c.news.slice(0, 12).map(n => n.k + ' ' + JSON.stringify(n.p ?? {})).join('\n'));
