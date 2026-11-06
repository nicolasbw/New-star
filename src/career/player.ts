import type { AttrKey, Attrs, Player, Position, Stats } from '../core/types';
import { ATTR_KEYS } from '../core/types';
import { clamp, rand, randi } from '../core/util';

export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  ST: { shooting: 0.3, pace: 0.15, dribbling: 0.15, composure: 0.15, physical: 0.1, passing: 0.05, vision: 0.1 },
  WG: { pace: 0.25, dribbling: 0.25, passing: 0.15, shooting: 0.15, vision: 0.1, composure: 0.1 },
  CAM: { passing: 0.25, vision: 0.25, dribbling: 0.2, shooting: 0.15, composure: 0.15 },
  CM: { passing: 0.25, vision: 0.2, physical: 0.15, defending: 0.15, dribbling: 0.1, composure: 0.15 },
  CDM: { defending: 0.3, physical: 0.2, passing: 0.2, vision: 0.1, composure: 0.1, pace: 0.1 },
  FB: { pace: 0.25, defending: 0.25, physical: 0.15, passing: 0.15, dribbling: 0.1, composure: 0.1 },
  CB: { defending: 0.35, physical: 0.25, pace: 0.1, passing: 0.1, composure: 0.2 },
};

export function overallOf(attrs: Attrs, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  let s = 0;
  for (const k of ATTR_KEYS) s += (w[k] ?? 0) * attrs[k];
  return Math.round(s);
}

export const overall = (p: Player) => overallOf(p.attrs, p.position);

export const emptyStats = (): Stats => ({ apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 });

export function startingAttrs(pos: Position): Attrs {
  const w = POSITION_WEIGHTS[pos];
  const a = {} as Attrs;
  for (const k of ATTR_KEYS) {
    const focus = (w[k] ?? 0) * 40; // 0..14
    a[k] = clamp(Math.round(28 + focus + rand(-5, 6)), 20, 60);
  }
  return a;
}

export function createPlayer(name: string, nationality: string, position: Position, clubId: string): Player {
  return {
    name,
    nationality,
    age: 14,
    position,
    attrs: startingAttrs(position),
    potential: randi(78, 94),
    energy: 100,
    morale: 65,
    fame: 2,
    followers: randi(80, 300),
    money: 500,
    coach: 50,
    team: 50,
    injuryWeeks: 0,
    suspendedWeeks: 0,
    yellowCards: 0,
    squad: 'youth',
    clubId,
    salary: 200,
    contractYears: 3,
    agent: false,
    captain: false,
    sponsor: null,
    assets: [],
    season: emptyStats(),
    career: emptyStats(),
    history: [],
    trophies: [],
  };
}

function ageFactor(age: number): number {
  if (age <= 18) return 1.35;
  if (age <= 21) return 1.15;
  if (age <= 25) return 0.9;
  if (age <= 29) return 0.55;
  if (age <= 32) return 0.3;
  return 0.12;
}

/** Applies training xp to attributes. Returns the actual gains. */
export function train(p: Player, gains: Partial<Record<AttrKey, number>>, intensity = 1): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  const energyFactor = 0.55 + (p.energy / 100) * 0.45;
  const moraleFactor = 0.85 + (p.morale / 100) * 0.3;
  for (const k of Object.keys(gains) as AttrKey[]) {
    const cap = Math.min(99, p.potential + 6);
    const cur = p.attrs[k];
    const room = clamp((cap - cur) / 40, 0.05, 1);
    const g = (gains[k] ?? 0) * ageFactor(p.age) * room * energyFactor * moraleFactor * intensity * rand(0.75, 1.25);
    const next = clamp(cur + g, 1, cap);
    out[k] = next - cur;
    p.attrs[k] = Math.round(next * 100) / 100;
  }
  return out;
}

export function agingDecline(p: Player) {
  if (p.age < 31) return;
  const f = (p.age - 30) * 0.9;
  p.attrs.pace = Math.max(20, p.attrs.pace - rand(1, 2.5) * f);
  p.attrs.physical = Math.max(20, p.attrs.physical - rand(0.5, 2) * f);
  p.attrs.dribbling = Math.max(20, p.attrs.dribbling - rand(0, 1) * f);
}

export function proSalary(ovr: number, agent: boolean): number {
  const base = Math.max(1200, Math.round(((Math.max(ovr, 50) - 48) ** 2) * 38 + 1200));
  return Math.round((agent ? base * 1.15 : base) / 50) * 50;
}

export const attrInt = (v: number) => Math.floor(v);
