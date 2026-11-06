import type { Club, Fixture, Squad, TableRow } from '../core/types';
import { shuffle } from '../core/util';

/** Double round-robin (circle method). */
export function generateFixtures(clubIds: string[]): Fixture[] {
  const ids = shuffle(clubIds);
  const n = ids.length;
  const rounds: Fixture[] = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      const flip = (r + i) % 2 === 0;
      rounds.push({ round: r, home: flip ? a : b, away: flip ? b : a });
    }
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((f) => ({ round: f.round + n - 1, home: f.away, away: f.home }));
  return [...rounds, ...second];
}

export const roundsCount = (clubs: number) => (clubs - 1) * 2;

function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L && k < 12);
  return k - 1;
}

export function simulateScore(hs: number, as: number): [number, number] {
  const diff = (hs - as) / 22;
  const lh = 1.3 * Math.exp(diff) + 0.12;
  const la = 1.05 * Math.exp(-diff);
  return [poisson(lh), poisson(la)];
}

export function strengthOf(club: Club, squad: Squad) {
  return squad === 'pro' ? club.strength : club.youthStrength;
}

export function computeTable(clubs: Club[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const c of clubs) rows.set(c.id, { clubId: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const f of fixtures) {
    if (f.hg === undefined || f.ag === undefined) continue;
    const h = rows.get(f.home)!;
    const a = rows.get(f.away)!;
    h.p++;
    a.p++;
    h.gf += f.hg;
    h.ga += f.ag;
    a.gf += f.ag;
    a.ga += f.hg;
    if (f.hg > f.ag) {
      h.w++;
      a.l++;
      h.pts += 3;
    } else if (f.hg < f.ag) {
      a.w++;
      h.l++;
      a.pts += 3;
    } else {
      h.d++;
      a.d++;
      h.pts++;
      a.pts++;
    }
  }
  return [...rows.values()].sort(
    (x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.clubId.localeCompare(y.clubId),
  );
}
