import type { Career, Delta } from '../core/types';
import { chance, fmtMoney, pick, randi } from '../core/util';
import { addNews, bump, club, myClub, promote, saveCareer, sponsorOffer, transferTo } from './career';
import { overall, train } from './player';

export interface EventChoice {
  id: string;
  available?: (c: Career) => boolean;
  /** Applies the choice. May return a custom result key. */
  apply: (c: Career, out: Delta[]) => string | void;
}

export interface GameEvent {
  id: string;
  icon: string;
  weight: number;
  cooldown: number; // weeks before it can show again
  priority?: boolean; // shows whenever its condition is met
  cond: (c: Career) => boolean;
  data?: (c: Career) => Record<string, string | number>;
  choices: EventChoice[];
}

const isYouth = (c: Career) => c.player.squad === 'youth';

export const EVENTS: GameEvent[] = [
  {
    id: 'transfer_offer',
    icon: '✍️',
    weight: 1,
    cooldown: 0,
    priority: true,
    cond: (c) => !!c.flags.offerClub && c.week === 0,
    data: (c) => ({ club: club(c, String(c.flags.offerClub)).name }),
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          transferTo(c, String(c.flags.offerClub));
          delete c.flags.offerClub;
          bump(c.player, 'morale', 10, out);
          bump(c.player, 'fame', 4, out);
        },
      },
      {
        id: 'stay',
        apply: (c, out) => {
          delete c.flags.offerClub;
          bump(c.player, 'coach', 6, out);
          bump(c.player, 'team', 6, out);
        },
      },
    ],
  },
  {
    id: 'party_scandal',
    icon: '📰',
    weight: 1,
    cooldown: 0,
    priority: true,
    cond: (c) => !!c.flags.partyRisk,
    choices: [
      {
        id: 'apologize',
        apply: (c, out) => {
          delete c.flags.partyRisk;
          bump(c.player, 'coach', -3, out);
          bump(c.player, 'morale', -3, out);
        },
      },
      {
        id: 'deny',
        apply: (c, out) => {
          delete c.flags.partyRisk;
          if (chance(0.5)) {
            bump(c.player, 'coach', -9, out);
            bump(c.player, 'fame', -3, out);
            return 'ev.party_scandal.deny.bad';
          }
          bump(c.player, 'fame', 1, out);
        },
      },
    ],
  },
  {
    id: 'controversy',
    icon: '🔥',
    weight: 1,
    cooldown: 0,
    priority: true,
    cond: (c) => !!c.flags.socialRisk,
    choices: [
      {
        id: 'apologize',
        apply: (c, out) => {
          delete c.flags.socialRisk;
          bump(c.player, 'fame', -1, out);
          bump(c.player, 'morale', -3, out);
        },
      },
      {
        id: 'ignore',
        apply: (c, out) => {
          delete c.flags.socialRisk;
          if (chance(0.5)) return 'ev.controversy.ignore.ok';
          bump(c.player, 'fame', -5, out);
          bump(c.player, 'coach', -3, out);
          return 'ev.controversy.ignore.bad';
        },
      },
      {
        id: 'fight',
        apply: (c, out) => {
          delete c.flags.socialRisk;
          bump(c.player, 'followers', Math.round(c.player.followers * 0.08), out);
          bump(c.player, 'fame', 2, out);
          bump(c.player, 'coach', -5, out);
          bump(c.player, 'morale', -4, out);
        },
      },
    ],
  },
  {
    id: 'pro_call',
    icon: '📞',
    weight: 1,
    cooldown: 0,
    priority: true,
    cond: (c) => isYouth(c) && c.player.age >= 16 && overall(c.player) >= myClub(c).strength - 14 && !c.flags.proCalled,
    choices: [
      {
        id: 'give_all',
        apply: (c, out) => {
          c.flags.proCalled = 1;
          bump(c.player, 'energy', -20, out);
          const ovr = overall(c.player);
          const p = 0.35 + (ovr - (myClub(c).strength - 14)) * 0.07 + (c.player.coach - 50) / 150;
          if (chance(p)) {
            promote(c);
            return 'ev.pro_call.give_all.ok';
          }
          bump(c.player, 'coach', 4, out);
          return 'ev.pro_call.give_all.bad';
        },
      },
      {
        id: 'calm',
        apply: (c, out) => {
          c.flags.proCalled = 1;
          bump(c.player, 'coach', 3, out);
          bump(c.player, 'morale', 4, out);
        },
      },
    ],
  },
  {
    id: 'coach_extra',
    icon: '🧑‍🏫',
    weight: 3,
    cooldown: 5,
    cond: () => true,
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          bump(c.player, 'energy', -14, out);
          bump(c.player, 'coach', 6, out);
          const g = train(c.player, { [pick(['shooting', 'passing', 'dribbling', 'defending', 'vision'] as const)]: 1.2 });
          for (const k of Object.keys(g)) out.push({ key: `attr.${k}`, v: (g as Record<string, number>)[k] });
        },
      },
      { id: 'decline', apply: (c, out) => bump(c.player, 'coach', -3, out) },
    ],
  },
  {
    id: 'party',
    icon: '🥳',
    weight: 3,
    cooldown: 4,
    cond: (c) => c.player.age >= 16,
    choices: [
      {
        id: 'go',
        apply: (c, out) => {
          bump(c.player, 'team', 7, out);
          bump(c.player, 'morale', 7, out);
          bump(c.player, 'energy', -22, out);
          if (chance(0.3)) c.flags.partyRisk = 1;
        },
      },
      {
        id: 'early',
        apply: (c, out) => {
          bump(c.player, 'team', 3, out);
          bump(c.player, 'energy', -8, out);
        },
      },
      { id: 'stay', apply: (c, out) => bump(c.player, 'team', -3, out) },
    ],
  },
  {
    id: 'fan_visit',
    icon: '🧒',
    weight: 2,
    cooldown: 6,
    cond: () => true,
    choices: [
      {
        id: 'visit',
        apply: (c, out) => {
          bump(c.player, 'fame', 2.5, out);
          bump(c.player, 'morale', 6, out);
          bump(c.player, 'energy', -5, out);
        },
      },
      { id: 'decline', apply: (c, out) => bump(c.player, 'fame', -1, out) },
    ],
  },
  {
    id: 'pain',
    icon: '🩹',
    weight: 2,
    cooldown: 6,
    cond: (c) => c.player.injuryWeeks === 0,
    choices: [
      {
        id: 'play',
        apply: (c, out) => {
          if (chance(0.35)) {
            c.player.injuryWeeks = randi(2, 4);
            bump(c.player, 'morale', -8, out);
            addNews(c, 'news.injured', { w: c.player.injuryWeeks }, false);
            return 'ev.pain.play.bad';
          }
          bump(c.player, 'coach', 2, out);
          return 'ev.pain.play.ok';
        },
      },
      {
        id: 'medical',
        apply: (c, out) => {
          c.player.injuryWeeks = 1;
          bump(c.player, 'energy', 20, out);
          bump(c.player, 'coach', 1, out);
        },
      },
    ],
  },
  {
    id: 'interview',
    icon: '🎤',
    weight: 3,
    cooldown: 4,
    cond: (c) => c.player.fame >= 5,
    choices: [
      {
        id: 'humble',
        apply: (c, out) => {
          bump(c.player, 'coach', 3, out);
          bump(c.player, 'team', 2, out);
          bump(c.player, 'fame', 0.5, out);
        },
      },
      {
        id: 'confident',
        apply: (c, out) => {
          bump(c.player, 'fame', 3, out);
          bump(c.player, 'team', -2, out);
          bump(c.player, 'morale', 3, out);
        },
      },
      {
        id: 'polemic',
        apply: (c, out) => {
          bump(c.player, 'fame', 6, out);
          bump(c.player, 'followers', Math.round(500 + c.player.followers * 0.05), out);
          bump(c.player, 'coach', -8, out);
          bump(c.player, 'team', -7, out);
        },
      },
    ],
  },
  {
    id: 'sponsor',
    icon: '🤝',
    weight: 4,
    cooldown: 6,
    cond: (c) => !c.player.sponsor && c.player.fame >= 18,
    data: (c) => sponsorOffer(c),
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          const d = c.eventData!;
          c.player.sponsor = { brand: String(d.brand), weekly: Number(d.weekly) };
          bump(c.player, 'morale', 6, out);
          addNews(c, 'news.sponsor', { brand: String(d.brand), w: fmtMoney(Number(d.weekly)) }, true);
        },
      },
      {
        id: 'negotiate',
        apply: (c, out) => {
          const d = c.eventData!;
          const p = c.player.agent ? 0.75 : 0.45;
          if (chance(p)) {
            const weekly = Math.round((Number(d.weekly) * 1.4) / 50) * 50;
            c.player.sponsor = { brand: String(d.brand), weekly };
            bump(c.player, 'morale', 8, out);
            addNews(c, 'news.sponsor', { brand: String(d.brand), w: fmtMoney(weekly) }, true);
            return 'ev.sponsor.negotiate.ok';
          }
          return 'ev.sponsor.negotiate.bad';
        },
      },
      { id: 'decline', apply: () => {} },
    ],
  },
  {
    id: 'teammate',
    icon: '😤',
    weight: 2,
    cooldown: 6,
    cond: () => true,
    choices: [
      { id: 'talk', apply: (c, out) => bump(c.player, 'team', 6, out) },
      { id: 'ignore', apply: (c, out) => bump(c.player, 'team', -5, out) },
      {
        id: 'provoke',
        apply: (c, out) => {
          bump(c.player, 'team', -10, out);
          bump(c.player, 'morale', 3, out);
          bump(c.player, 'fame', 1, out);
        },
      },
    ],
  },
  {
    id: 'school',
    icon: '📚',
    weight: 3,
    cooldown: 5,
    cond: (c) => c.player.age <= 17,
    choices: [
      {
        id: 'study',
        apply: (c, out) => {
          bump(c.player, 'energy', -8, out);
          bump(c.player, 'morale', -2, out);
          bump(c.player, 'coach', 3, out);
          const g = train(c.player, { vision: 0.6, composure: 0.4 });
          for (const k of Object.keys(g)) out.push({ key: `attr.${k}`, v: (g as Record<string, number>)[k] });
        },
      },
      {
        id: 'skip',
        apply: (c, out) => {
          bump(c.player, 'morale', 3, out);
          if (chance(0.35)) {
            bump(c.player, 'coach', -6, out);
            return 'ev.school.skip.bad';
          }
        },
      },
    ],
  },
  {
    id: 'scout',
    icon: '🔭',
    weight: 2,
    cooldown: 10,
    cond: (c) => isYouth(c) && overall(c.player) >= myClub(c).youthStrength + 4,
    data: (c) => ({ club: pick(c.clubs.filter((x) => x.id !== c.player.clubId)).name }),
    choices: [
      {
        id: 'ok',
        apply: (c, out) => {
          bump(c.player, 'fame', 3, out);
          bump(c.player, 'morale', 6, out);
        },
      },
    ],
  },
  {
    id: 'charity',
    icon: '💝',
    weight: 2,
    cooldown: 8,
    cond: (c) => c.player.fame >= 10,
    data: (c) => ({ amount: Math.max(500, Math.round(c.player.money * 0.05 / 100) * 100) }),
    choices: [
      {
        id: 'play',
        apply: (c, out) => {
          bump(c.player, 'fame', 3, out);
          bump(c.player, 'morale', 4, out);
          bump(c.player, 'energy', -10, out);
        },
      },
      {
        id: 'donate',
        available: (c) => c.player.money >= Number(c.eventData?.amount ?? 0),
        apply: (c, out) => {
          bump(c.player, 'money', -Number(c.eventData!.amount), out);
          bump(c.player, 'fame', 2, out);
          bump(c.player, 'morale', 5, out);
        },
      },
      { id: 'decline', apply: (c, out) => bump(c.player, 'fame', -0.5, out) },
    ],
  },
  {
    id: 'agent',
    icon: '🕴️',
    weight: 3,
    cooldown: 12,
    cond: (c) => !c.player.agent && c.player.fame >= 8,
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          c.player.agent = true;
          bump(c.player, 'morale', 3, out);
        },
      },
      { id: 'decline', apply: () => {} },
    ],
  },
  {
    id: 'family_money',
    icon: '🏠',
    weight: 2,
    cooldown: 15,
    cond: (c) => c.player.money >= 3000,
    data: (c) => ({ amount: Math.round((c.player.money * 0.15) / 100) * 100 }),
    choices: [
      {
        id: 'help',
        apply: (c, out) => {
          bump(c.player, 'money', -Number(c.eventData!.amount), out);
          bump(c.player, 'morale', 8, out);
        },
      },
      { id: 'refuse', apply: (c, out) => bump(c.player, 'morale', -9, out) },
    ],
  },
  {
    id: 'car_deal',
    icon: '🚘',
    weight: 2,
    cooldown: 20,
    cond: (c) => c.player.fame >= 30 && !c.player.assets.includes('car'),
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          c.player.assets.push('car');
          bump(c.player, 'morale', 6, out);
          bump(c.player, 'followers', 1500, out);
        },
      },
      { id: 'decline', apply: () => {} },
    ],
  },
  {
    id: 'captain',
    icon: '©️',
    weight: 4,
    cooldown: 30,
    cond: (c) => !c.player.captain && c.player.coach >= 78 && c.player.team >= 65 && c.player.age >= 19,
    choices: [
      {
        id: 'accept',
        apply: (c, out) => {
          c.player.captain = true;
          bump(c.player, 'fame', 4, out);
          bump(c.player, 'morale', 10, out);
          addNews(c, 'news.captain', {}, true);
        },
      },
      { id: 'decline', apply: (c, out) => bump(c.player, 'team', 2, out) },
    ],
  },
  {
    id: 'low_morale',
    icon: '🌧️',
    weight: 5,
    cooldown: 5,
    cond: (c) => c.player.morale < 35,
    data: (c) => ({ amount: c.player.squad === 'pro' ? 2000 : 150 }),
    choices: [
      {
        id: 'psych',
        available: (c) => c.player.money >= Number(c.eventData?.amount ?? 0),
        apply: (c, out) => {
          bump(c.player, 'money', -Number(c.eventData!.amount), out);
          bump(c.player, 'morale', 16, out);
        },
      },
      { id: 'family', apply: (c, out) => bump(c.player, 'morale', 9, out) },
      {
        id: 'out',
        apply: (c, out) => {
          bump(c.player, 'morale', 6, out);
          bump(c.player, 'energy', -14, out);
        },
      },
    ],
  },
  {
    id: 'rival',
    icon: '⚔️',
    weight: 2,
    cooldown: 10,
    cond: (c) => c.player.squad === 'pro',
    choices: [
      {
        id: 'work',
        apply: (c, out) => {
          bump(c.player, 'energy', -12, out);
          bump(c.player, 'coach', 4, out);
          const g = train(c.player, { physical: 0.6, composure: 0.6 });
          for (const k of Object.keys(g)) out.push({ key: `attr.${k}`, v: (g as Record<string, number>)[k] });
        },
      },
      {
        id: 'complain',
        apply: (c, out) => {
          bump(c.player, 'coach', -6, out);
          bump(c.player, 'morale', 2, out);
        },
      },
    ],
  },
];

export function rollEvent(c: Career): string | null {
  const now = c.season * 100 + c.week;
  const ready = (e: GameEvent) => {
    const last = c.eventSeen[e.id];
    return last === undefined || now - last >= e.cooldown || e.cooldown === 0;
  };
  const pri = EVENTS.find((e) => e.priority && e.cond(c));
  let ev: GameEvent | undefined = pri;
  if (!ev) {
    if (!chance(0.5)) return null;
    const pool = EVENTS.filter((e) => !e.priority && ready(e) && e.cond(c));
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        ev = e;
        break;
      }
    }
  }
  if (!ev) return null;
  c.eventSeen[ev.id] = now;
  c.eventData = ev.data?.(c) ?? {};
  return ev.id;
}

export function resolveEvent(c: Career, choiceId: string): { resultKey: string; deltas: Delta[] } | null {
  const ev = EVENTS.find((e) => e.id === c.pendingEvent);
  if (!ev) return null;
  const ch = ev.choices.find((x) => x.id === choiceId);
  if (!ch || (ch.available && !ch.available(c))) return null;
  const out: Delta[] = [];
  const key = ch.apply(c, out) || `ev.${ev.id}.${ch.id}.r`;
  c.pendingEvent = null;
  saveCareer(c);
  return { resultKey: key, deltas: out };
}
