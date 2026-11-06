import type { AttrKey, Career, Club, Delta, Fixture, MatchReport, Player, Position, Selection, Squad } from '../core/types';
import { chance, clamp, fmtMoney, pick, rand, randi } from '../core/util';
import { ASSETS, BRANDS, createClubs } from './data';
import { computeTable, generateFixtures, roundsCount, simulateScore, strengthOf } from './league';
import { agingDecline, createPlayer, emptyStats, overall, proSalary, train } from './player';
import { rollEvent } from './events';

const SAVE_KEY = 'newstar.save.v1';
export const ACTIONS_PER_WEEK = 2;

// ---------------------------------------------------------------- persistence
export function saveCareer(c: Career) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    return c.version === 1 ? c : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- creation
export function youthOffers(clubs: Club[]): Club[] {
  // Three modest clubs offer a place in their academy.
  const sorted = clubs.slice().sort((a, b) => a.strength - b.strength);
  return [sorted[0], sorted[2], sorted[4]];
}

export function newCareer(name: string, nationality: string, position: Position, clubId: string, clubs: Club[]): Career {
  const ids = clubs.map((c) => c.id);
  const c: Career = {
    version: 1,
    player: createPlayer(name, nationality, position, clubId),
    clubs,
    season: 1,
    week: 0,
    fixtures: { youth: generateFixtures(ids), pro: generateFixtures(ids) },
    news: [],
    actionsLeft: ACTIONS_PER_WEEK,
    actionsDone: [],
    pendingEvent: null,
    eventSeen: {},
    flags: {},
    retired: false,
  };
  addNews(c, 'news.joined', { club: club(c, clubId).name }, true);
  return c;
}

export { createClubs };

// ---------------------------------------------------------------- helpers
export const club = (c: Career, id: string) => c.clubs.find((x) => x.id === id)!;
export const myClub = (c: Career) => club(c, c.player.clubId);
export const rounds = (c: Career) => roundsCount(c.clubs.length);
export const myFixtures = (c: Career) => c.fixtures[c.player.squad];

export function addNews(c: Career, k: string, p?: Record<string, string | number>, good?: boolean) {
  c.news.unshift({ season: c.season, week: c.week, k, p, good });
  if (c.news.length > 60) c.news.length = 60;
}

export function nextFixture(c: Career): Fixture | null {
  return myFixtures(c).find((f) => f.round === c.week && (f.home === c.player.clubId || f.away === c.player.clubId)) ?? null;
}

export function table(c: Career, squad: Squad = c.player.squad) {
  return computeTable(c.clubs, c.fixtures[squad]);
}

/** Numeric stat change with clamping, recorded as a visible delta. */
export function bump(p: Player, field: 'energy' | 'morale' | 'fame' | 'coach' | 'team' | 'money' | 'followers', v: number, out?: Delta[]) {
  const before = p[field];
  let after = before + v;
  if (field === 'money' || field === 'followers') after = Math.max(0, after);
  else after = clamp(after, 0, 100);
  p[field] = Math.round(after * 10) / 10;
  const d = p[field] - before;
  if (out && Math.abs(d) >= 0.05) out.push({ key: `stat.${field}`, v: d, money: field === 'money' });
}

function gainDeltas(g: Partial<Record<AttrKey, number>>, out: Delta[]) {
  for (const k of Object.keys(g) as AttrKey[]) if ((g[k] ?? 0) > 0.005) out.push({ key: `attr.${k}`, v: g[k]! });
}

// ---------------------------------------------------------------- weekly activities
export interface Activity {
  id: string;
  icon: string;
  energy: number;
  cost?: (c: Career) => number;
  available?: (c: Career) => boolean;
  apply: (c: Career, out: Delta[]) => void;
}

export const ACTIVITIES: Activity[] = [
  {
    id: 'train_finishing',
    icon: '🎯',
    energy: -14,
    apply: (c, out) => gainDeltas(train(c.player, { shooting: 1.1, composure: 0.5 }), out),
  },
  {
    id: 'train_physical',
    icon: '🏋️',
    energy: -18,
    apply: (c, out) => gainDeltas(train(c.player, { pace: 0.9, physical: 1.0 }), out),
  },
  {
    id: 'train_technique',
    icon: '⚽',
    energy: -14,
    apply: (c, out) => gainDeltas(train(c.player, { dribbling: 1.0, passing: 0.8 }), out),
  },
  {
    id: 'train_tactical',
    icon: '📋',
    energy: -10,
    apply: (c, out) => {
      gainDeltas(train(c.player, { vision: 0.9, defending: 0.8 }), out);
      bump(c.player, 'coach', 2, out);
    },
  },
  {
    id: 'personal_trainer',
    icon: '💪',
    energy: -16,
    cost: (c) => (c.player.squad === 'pro' ? 4000 : 300),
    apply: (c, out) => {
      const p = c.player;
      const keys: AttrKey[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'vision', 'composure'];
      const g: Partial<Record<AttrKey, number>> = {};
      for (const k of keys) g[k] = 0.45;
      gainDeltas(train(p, g), out);
    },
  },
  {
    id: 'video',
    icon: '📺',
    energy: -4,
    apply: (c, out) => {
      gainDeltas(train(c.player, { vision: 0.5, composure: 0.5 }), out);
      bump(c.player, 'coach', 1, out);
    },
  },
  {
    id: 'rest',
    icon: '🛌',
    energy: 30,
    apply: (c, out) => bump(c.player, 'morale', 3, out),
  },
  {
    id: 'family',
    icon: '👨‍👩‍👦',
    energy: 12,
    apply: (c, out) => bump(c.player, 'morale', 8, out),
  },
  {
    id: 'friends',
    icon: '🎉',
    energy: -10,
    apply: (c, out) => {
      bump(c.player, 'morale', 9, out);
      bump(c.player, 'team', 4, out);
      if (chance(0.15)) c.flags.partyRisk = 1;
    },
  },
  {
    id: 'social',
    icon: '📱',
    energy: -2,
    apply: (c, out) => {
      const p = c.player;
      const gain = Math.round((40 + p.fame * p.fame * 3) * rand(0.6, 1.4));
      bump(p, 'followers', gain, out);
      bump(p, 'fame', 0.6, out);
      bump(p, 'morale', 2, out);
      if (p.followers > 2000 && chance(0.12)) c.flags.socialRisk = 1;
    },
  },
  {
    id: 'sponsor_event',
    icon: '📸',
    energy: -8,
    available: (c) => !!c.player.sponsor,
    apply: (c, out) => {
      const p = c.player;
      bump(p, 'money', Math.round((p.sponsor?.weekly ?? 0) * 0.8), out);
      bump(p, 'fame', 1.2, out);
      bump(p, 'followers', Math.round(200 + p.fame * 40), out);
    },
  },
];

export function doActivity(c: Career, id: string): Delta[] | null {
  const a = ACTIVITIES.find((x) => x.id === id);
  if (!a || c.actionsLeft <= 0) return null;
  if (a.available && !a.available(c)) return null;
  const cost = a.cost?.(c) ?? 0;
  if (cost > c.player.money) return null;
  const out: Delta[] = [];
  if (cost) bump(c.player, 'money', -cost, out);
  a.apply(c, out);
  bump(c.player, 'energy', a.energy, out);
  c.actionsLeft--;
  c.actionsDone.push(id);
  saveCareer(c);
  return out;
}

// ---------------------------------------------------------------- shop
export function buyAsset(c: Career, id: string): Delta[] | null {
  const a = ASSETS.find((x) => x.id === id);
  const p = c.player;
  if (!a || p.assets.includes(id) || p.money < a.price) return null;
  const out: Delta[] = [];
  bump(p, 'money', -a.price, out);
  bump(p, 'morale', a.morale, out);
  if (a.fame) bump(p, 'fame', a.fame, out);
  p.assets.push(id);
  addNews(c, 'news.bought', { item: `asset.${id}` }, true);
  saveCareer(c);
  return out;
}

// ---------------------------------------------------------------- selection
export function selection(c: Career): Selection {
  const p = c.player;
  if (p.injuryWeeks > 0) return 'injured';
  if (p.suspendedWeeks > 0) return 'suspended';
  const cl = myClub(c);
  const level = strengthOf(cl, p.squad);
  const ovr = overall(p);
  // Coach trust, energy and a little randomness decide.
  const score = ovr - level + (p.coach - 50) / 6 + (p.energy - 60) / 12 + (p.morale - 50) / 25 + rand(-2.5, 2.5);
  if (score >= -3) return 'starter';
  if (score >= -11) return 'bench';
  return 'out';
}

// ---------------------------------------------------------------- week flow
/** Called once the player's match (or its simulation) is done. */
export function finishWeek(c: Career, report: MatchReport | null): Delta[] {
  const p = c.player;
  const out: Delta[] = [];
  const fx = nextFixture(c);

  if (fx && report) {
    fx.hg = report.hg;
    fx.ag = report.ag;
  }

  // player match consequences
  if (report?.user) {
    const u = report.user;
    p.season.apps++;
    p.career.apps++;
    p.season.goals += u.goals;
    p.career.goals += u.goals;
    p.season.assists += u.assists;
    p.career.assists += u.assists;
    p.season.ratingSum += u.rating;
    p.career.ratingSum += u.rating;
    if (u.rating >= 8) {
      p.season.motm++;
      p.career.motm++;
    }
    const mine = report.userTeam === 0 ? report.hg : report.ag;
    const theirs = report.userTeam === 0 ? report.ag : report.hg;
    const res = mine > theirs ? 1 : mine < theirs ? -1 : 0;
    bump(p, 'energy', -report.energyUsed, out);
    bump(p, 'morale', res * 5 + (u.rating - 6.5) * 4, out);
    bump(p, 'coach', (u.rating - 6.4) * 3.2, out);
    bump(p, 'team', res * 1 + u.assists * 1.5, out);
    const fameGain = (u.goals * 1.6 + u.assists * 0.8 + Math.max(0, u.rating - 6.8) * 0.9 + u.specials * 0.6) * (p.squad === 'pro' ? 1 : 0.45);
    bump(p, 'fame', fameGain - 0.2, out);
    // match experience
    const xp = 0.25 + Math.max(0, u.rating - 6) * 0.12;
    const g = train(p, mainAttrs(p.position, xp));
    for (const k of Object.keys(g) as AttrKey[]) if ((g[k] ?? 0) > 0.01) out.push({ key: `attr.${k}`, v: g[k]! });
    if (u.yellow) p.yellowCards++;
    if (u.red) {
      p.suspendedWeeks = 2;
      addNews(c, 'news.red', {}, false);
    } else if (p.yellowCards >= 3) {
      p.yellowCards = 0;
      p.suspendedWeeks = 1;
      addNews(c, 'news.suspended', {}, false);
    }
    if (u.goals >= 3) addNews(c, 'news.hattrick', { n: u.goals }, true);
    else if (u.goals > 0) addNews(c, 'news.scored', { n: u.goals, opp: oppName(c, report) }, true);
    if (u.rating >= 8.5) addNews(c, 'news.star', { r: u.rating.toFixed(1) }, true);
    if (report.injuredWeeks > 0) {
      p.injuryWeeks = report.injuredWeeks;
      addNews(c, 'news.injured', { w: report.injuredWeeks }, false);
    }
    // win bonus
    if (res > 0 && p.squad === 'pro') bump(p, 'money', Math.round(p.salary * 0.3), out);
  } else {
    // didn't play
    const sel = c.flags.lastSelection as unknown as string;
    if (sel === 'bench' || sel === 'out') {
      bump(p, 'morale', -4, out);
      bump(p, 'coach', 0.5, out);
    }
    bump(p, 'energy', 8, out);
  }

  // rest of the round in both competitions
  for (const squad of ['youth', 'pro'] as Squad[]) {
    for (const f of c.fixtures[squad]) {
      if (f.round !== c.week || f.hg !== undefined) continue;
      const [hg, ag] = simulateScore(strengthOf(club(c, f.home), squad) + 2, strengthOf(club(c, f.away), squad));
      f.hg = hg;
      f.ag = ag;
    }
  }

  // weekly economy & recovery
  const income = p.salary + (p.sponsor?.weekly ?? 0) - (p.agent ? Math.round(p.salary * 0.1) : 0);
  bump(p, 'money', income, out);
  bump(p, 'energy', 22, undefined);
  const assetMorale = p.assets.reduce((s, id) => s + (ASSETS.find((a) => a.id === id)?.weeklyMorale ?? 0), 0);
  bump(p, 'morale', (60 - p.morale) * 0.06 + Math.min(assetMorale, 3), undefined);
  const follow = Math.round(p.fame * p.fame * 2.2 * rand(0.5, 1.2));
  bump(p, 'followers', follow, undefined);
  if (p.injuryWeeks > 0 && !(report?.injuredWeeks)) p.injuryWeeks--;
  // a suspension handed out in this match starts counting next week
  if (p.suspendedWeeks > 0 && !report?.user) p.suspendedWeeks--;

  c.week++;
  if (c.week >= rounds(c)) endSeason(c);
  startWeek(c);
  saveCareer(c);
  return out;
}

function oppName(c: Career, r: MatchReport) {
  return club(c, r.userTeam === 0 ? r.awayId : r.homeId).name;
}

export function mainAttrs(pos: Position, v: number): Partial<Record<AttrKey, number>> {
  const map: Record<Position, AttrKey[]> = {
    ST: ['shooting', 'composure', 'physical'],
    WG: ['pace', 'dribbling', 'passing'],
    CAM: ['passing', 'vision', 'dribbling'],
    CM: ['passing', 'vision', 'physical'],
    CDM: ['defending', 'physical', 'passing'],
    FB: ['pace', 'defending', 'physical'],
    CB: ['defending', 'physical', 'composure'],
  };
  const o: Partial<Record<AttrKey, number>> = {};
  for (const k of map[pos]) o[k] = v;
  return o;
}

export function startWeek(c: Career) {
  c.actionsLeft = ACTIONS_PER_WEEK;
  c.actionsDone = [];
  if (!c.retired && !c.pendingEvent) c.pendingEvent = rollEvent(c);
}

// ---------------------------------------------------------------- season end
function endSeason(c: Career) {
  const p = c.player;
  const tbl = table(c);
  const pos = tbl.findIndex((r) => r.clubId === p.clubId) + 1;
  const champ = tbl[0].clubId;
  const compKey = p.squad === 'pro' ? 'comp.pro' : 'comp.youth';
  addNews(c, 'news.champion', { club: club(c, champ).name, comp: compKey }, champ === p.clubId);
  if (champ === p.clubId && p.season.apps > 0) p.trophies.push(`${compKey}|${c.season}`);

  p.history.push({
    season: c.season,
    age: p.age,
    clubId: p.clubId,
    squad: p.squad,
    apps: p.season.apps,
    goals: p.season.goals,
    assists: p.season.assists,
    avg: p.season.apps ? p.season.ratingSum / p.season.apps : 0,
    position: pos,
  });

  // league awards
  if (p.season.apps >= 8) {
    const avg = p.season.ratingSum / p.season.apps;
    if (p.squad === 'pro' && avg >= 7.6 && p.season.goals + p.season.assists >= 18) {
      p.trophies.push(`award.best|${c.season}`);
      addNews(c, 'news.award_best', {}, true);
      bump(p, 'fame', 8);
    } else if (p.squad === 'youth' && avg >= 7.4) {
      p.trophies.push(`award.youth|${c.season}`);
      addNews(c, 'news.award_youth', {}, true);
      bump(p, 'fame', 3);
    }
  }

  // aging
  p.age++;
  agingDecline(p);

  // promotion to the professional squad
  const cl = myClub(c);
  const ovr = overall(p);
  if (p.squad === 'youth' && ((p.age >= 17 && ovr >= cl.strength - 13) || p.age >= 19)) promote(c);

  // contracts
  if (p.squad === 'pro') {
    p.contractYears--;
    const newSalary = proSalary(ovr, p.agent);
    if (p.contractYears <= 0 || newSalary > p.salary * 1.25) {
      p.salary = Math.max(p.salary, newSalary);
      p.contractYears = randi(2, 4);
      addNews(c, 'news.renewed', { s: fmtMoney(p.salary), y: p.contractYears }, true);
    }
    // a bigger club may come knocking
    const better = c.clubs.filter((x) => x.strength > cl.strength + 2 && x.strength <= ovr + 4 && x.id !== cl.id);
    if (ovr >= cl.strength + 3 && better.length) c.flags.offerClub = better.sort((a, b) => b.strength - a.strength)[0].id as unknown as number;
  }

  // world drift
  for (const x of c.clubs) {
    x.strength = clamp(x.strength + randi(-3, 3), 52, 88);
    x.youthStrength = clamp(Math.round(x.strength * 0.62 + randi(-3, 3)), 30, 60);
  }

  p.season = emptyStats();
  p.yellowCards = 0;
  p.suspendedWeeks = 0;
  c.season++;
  c.week = 0;
  const ids = c.clubs.map((x) => x.id);
  c.fixtures = { youth: generateFixtures(ids), pro: generateFixtures(ids) };
  addNews(c, 'news.newseason', { n: c.season, age: p.age }, true);

  if (p.age >= 38 || (p.age >= 35 && ovr < 66)) {
    c.retired = true;
    addNews(c, 'news.retired', {}, true);
  }
}

export function promote(c: Career) {
  const p = c.player;
  if (p.squad === 'pro') return;
  p.squad = 'pro';
  p.salary = proSalary(overall(p), p.agent);
  p.contractYears = 3;
  bump(p, 'morale', 15);
  bump(p, 'fame', 3);
  addNews(c, 'news.promoted', { s: fmtMoney(p.salary) }, true);
}

export function transferTo(c: Career, clubId: string) {
  const p = c.player;
  const from = myClub(c);
  // Mid-season move: keep fixtures, just change club.
  p.clubId = clubId;
  p.squad = 'pro';
  p.salary = Math.round(proSalary(overall(p), p.agent) * 1.2);
  p.contractYears = 4;
  p.coach = 50;
  p.team = 45;
  p.captain = false;
  addNews(c, 'news.transfer', { from: from.name, to: club(c, clubId).name, s: fmtMoney(p.salary) }, true);
}

export function sponsorOffer(c: Career) {
  const p = c.player;
  const weekly = Math.round((300 + p.fame * p.fame * 6) * (p.agent ? 1.3 : 1) / 50) * 50;
  return { brand: pick(BRANDS), weekly };
}

export function avgRating(p: Player) {
  return p.season.apps ? p.season.ratingSum / p.season.apps : 0;
}
