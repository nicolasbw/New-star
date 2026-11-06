import type { AttrKey, Attrs, MatchGoal, MatchReport, MatchUserStats, Position } from '../core/types';
import { clamp, rand, randi } from '../core/util';

// Pitch: x along length (-52.5..52.5), y along width (-34..34). Team 0 attacks +x.
export const HL = 52.5;
export const HW = 34;
export const GOAL_HW = 3.66;
export const GOAL_H = 2.44;
export const MATCH_SIM_SECONDS = 330; // in-play simulated seconds for 90 minutes
const G = 9.8;

export type Role = 'GK' | 'DEF' | 'MID' | 'FWD';

interface Slot {
  key: string;
  role: Role;
  x: number;
  y: number;
  num: number;
}

// 4-3-3 in a neutral frame (own goal at -52.5).
export const FORMATION: Slot[] = [
  { key: 'GK', role: 'GK', x: -50, y: 0, num: 1 },
  { key: 'LB', role: 'DEF', x: -35, y: -23, num: 6 },
  { key: 'LCB', role: 'DEF', x: -39, y: -8, num: 3 },
  { key: 'RCB', role: 'DEF', x: -39, y: 8, num: 4 },
  { key: 'RB', role: 'DEF', x: -35, y: 23, num: 2 },
  { key: 'CDM', role: 'MID', x: -27, y: 0, num: 5 },
  { key: 'LCM', role: 'MID', x: -18, y: -13, num: 8 },
  { key: 'RCM', role: 'MID', x: -18, y: 13, num: 10 },
  { key: 'LW', role: 'FWD', x: -7, y: -23, num: 11 },
  { key: 'ST', role: 'FWD', x: -4, y: 0, num: 9 },
  { key: 'RW', role: 'FWD', x: -7, y: 23, num: 7 },
];

export const POSITION_SLOT: Record<Position, number> = { ST: 9, WG: 10, CAM: 7, CM: 6, CDM: 5, FB: 4, CB: 3 };

export interface Agent {
  id: number;
  team: 0 | 1;
  slot: number;
  role: Role;
  bx: number;
  by: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
  attrs: Attrs;
  name: string;
  num: number;
  isUser: boolean;
  stun: number;
  sentOff: boolean;
  runTo: { x: number; y: number; t: number } | null;
  tackleCd: number;
  holdTime: number;
  decideCd: number;
  kickAnim: number;
  dive: number;
  celebrate: number;
  jitterX: number;
  jitterY: number;
  depth: number; // offset inside its line (neutral metres, + = forward)
  tgtX: number; // smoothed movement target (world)
  tgtY: number;
  tgtSprint: boolean;
  react: number; // reaction delay after a change of possession
  aiRun: { x: number; y: number; t: number } | null; // tactical run (world coords)
  supT: number; // support-spot refresh timer
  supX: number;
  supY: number;
  diveT: number;
  touchAnim: number;
}

// Tactical identity of each slot: line depth offset, overlap flag.
const SLOT_DEPTH = [0, 0, 0, 0, 0, -6, 0, 2, -2, 1, -2];

interface PassInfo {
  from: Agent;
  to: Agent;
  protect: boolean;
  interceptor: Agent | null;
  checked: Set<number>;
  cross: boolean;
  tx: number;
  ty: number;
  t0: number;
  userPass: boolean;
}

interface ShotInfo {
  by: Agent;
  outcome: 'goal' | 'save' | 'miss';
  tx: number;
  ty: number;
  tz: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  lead: number; // how far ahead of the dribbler's feet the ball is
  touchT: number;
  owner: Agent | null;
  lastTouch: Agent | null;
  kickTime: number;
  pass: PassInfo | null;
  shot: ShotInfo | null;
}

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'halftime' | 'fulltime';

export interface DecisionOption {
  id: string;
  chance: number;
  kind: 'success' | 'goal';
  attrs: AttrKey[];
  special?: boolean;
  safe?: boolean;
  data?: { target?: Agent; opp?: Agent };
}

export type DecisionKind = 'onBall' | 'aerial' | 'offBall' | 'defend';

export interface Decision {
  kind: DecisionKind;
  options: DecisionOption[];
  timeLeft: number;
  total: number;
}

export interface FeedItem {
  key: string;
  p?: Record<string, string | number>;
  tone: 'good' | 'bad' | 'info' | 'goal';
}

export interface TeamSetup {
  name: string;
  short: string;
  primary: string;
  secondary: string;
  strength: number;
}

export interface MatchSetup {
  home: TeamSetup;
  away: TeamSetup;
  homeId: string;
  awayId: string;
  userTeam: 0 | 1;
  user: {
    name: string;
    attrs: Attrs;
    position: Position;
    energy: number;
    morale: number;
    startsOnBench: boolean;
    number: number;
  } | null;
}

const SURNAMES = [
  'Silva', 'Costa', 'Ramos', 'Rocha', 'Lima', 'Duarte', 'Nunes', 'Paiva', 'Moura', 'Barros', 'Sales', 'Pinto',
  'Vidal', 'Rojas', 'Ortega', 'Molina', 'Castro', 'Leal', 'Brito', 'Reis', 'Faria', 'Gomes', 'Prado', 'Neves',
  'Mensah', 'Novak', 'Keller', 'Okafor', 'Sato', 'Larsen', 'Moretti', 'Dumont', 'Varela', 'Acosta', 'Lopes', 'Matos',
];

function genAttrs(strength: number, role: Role): Attrs {
  const bias: Record<Role, Partial<Attrs>> = {
    GK: { defending: 8, physical: 2, shooting: -25, dribbling: -20, pace: -10 },
    DEF: { defending: 7, physical: 5, shooting: -14, dribbling: -8, vision: -5 },
    MID: { passing: 6, vision: 6, defending: -2 },
    FWD: { shooting: 7, pace: 5, dribbling: 5, defending: -18, physical: -2 },
  };
  const b = bias[role];
  const keys: AttrKey[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'vision', 'composure'];
  const a = {} as Attrs;
  for (const k of keys) a[k] = clamp(Math.round(strength + (b[k] ?? 0) + rand(-6, 6)), 15, 95);
  return a;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Distance from point P to segment AB. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export class MatchEngine {
  setup: MatchSetup;
  agents: Agent[] = [];
  ball: Ball = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, lead: 0.5, touchT: 0,
    owner: null, lastTouch: null, kickTime: 0, pass: null, shot: null,
  };
  phase: Phase = 'kickoff';
  phaseTimer = 2;
  time = 0; // total sim time (for timestamps)
  playTime = 0; // in-play time (clock)
  score: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  possTime: [number, number] = [0, 0];
  possession: 0 | 1 = 0;
  kickoffTeam: 0 | 1 = 0;
  halfDone = false;
  user: Agent | null = null;
  userOnField = false;
  userTeam: 0 | 1;
  userIn = 0;
  userOut = 90;
  decision: Decision | null = null;
  feed: FeedItem[] = [];
  goals: MatchGoal[] = [];
  stats: MatchUserStats = {
    minutes: 0, goals: 0, assists: 0, shots: 0, shotsOn: 0, passes: 0, passesOk: 0, dribbles: 0,
    dribblesOk: 0, tackles: 0, tacklesOk: 0, yellow: 0, red: 0, rating: 6, decisions: 0, specials: 0,
  };
  ratingAcc = 0;
  userEnergy = 100;
  userMorale = 60;
  injuredWeeks = 0;
  slowmo = 0;
  userProtect = 0;
  userRetrigger = -1;
  askBall = 0;
  offBallTimer = 6;
  defendTimer = 4;
  counts = { offBall: 0, defend: 0, onBall: 0 };
  assistBy: Agent | null = null;
  assistTime = 0;
  frozen: Agent | null = null;
  private epoch = 0;
  private scheduled: Array<{ at: number; epoch: number; fn: () => void }> = [];
  private chasers: [Agent | null, Agent | null] = [null, null];
  private supporters: [Agent[], Agent[]] = [[], []];
  private runTimer: [number, number] = [2, 2];
  private pressers: [Agent[], Agent[]] = [[], []];
  benchUser: { slot: number } | null = null;
  dbg = { passes: 0, tackleAtt: 0, tackleOk: 0, intercepts: 0, interceptRolls: 0, shots: 0 };

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.userTeam = setup.userTeam;
    let id = 0;
    for (const team of [0, 1] as const) {
      const ts = team === 0 ? setup.home : setup.away;
      FORMATION.forEach((s, i) => {
        this.agents.push({
          id: id++,
          team,
          slot: i,
          role: s.role,
          bx: s.x,
          by: s.y,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          dir: team === 0 ? 0 : Math.PI,
          attrs: genAttrs(ts.strength + (team === 0 ? 2 : 0), s.role),
          name: SURNAMES[randi(0, SURNAMES.length - 1)],
          num: s.num,
          isUser: false,
          stun: 0,
          sentOff: false,
          runTo: null,
          tackleCd: 0,
          holdTime: 0,
          decideCd: 0.5,
          kickAnim: 0,
          dive: 0,
          celebrate: 0,
          jitterX: rand(-1.5, 1.5),
          jitterY: rand(-1.5, 1.5),
          depth: SLOT_DEPTH[i],
          tgtX: 0,
          tgtY: 0,
          tgtSprint: false,
          react: 0,
          aiRun: null,
          supT: 0,
          supX: 0,
          supY: 0,
          diveT: 0,
          touchAnim: 0,
        });
      });
    }
    if (setup.user) {
      const slot = POSITION_SLOT[setup.user.position];
      this.userEnergy = setup.user.energy;
      this.userMorale = setup.user.morale;
      if (setup.user.startsOnBench) {
        this.benchUser = { slot };
        this.userIn = 60;
      } else {
        this.putUserOn(slot);
      }
    }
    this.kickoff(0);
  }

  // ------------------------------------------------------------------ helpers
  get minute() {
    return Math.min(90, (this.playTime / MATCH_SIM_SECONDS) * 90);
  }
  n(team: 0 | 1, x: number, y: number) {
    return team === 0 ? { x, y } : { x: -x, y: -y };
  }
  attackGoalX(team: 0 | 1) {
    return team === 0 ? HL : -HL;
  }
  maxSpeed(a: Agent) {
    let s = 5.2 + a.attrs.pace * 0.04;
    if (a.isUser) s *= 0.88 + (this.userEnergy / 100) * 0.12;
    return s;
  }
  field() {
    return this.agents.filter((a) => !a.sentOff);
  }
  teamOf(team: 0 | 1) {
    return this.agents.filter((a) => a.team === team && !a.sentOff);
  }
  gk(team: 0 | 1) {
    return this.agents.find((a) => a.team === team && a.role === 'GK' && !a.sentOff) ?? this.teamOf(team)[0];
  }
  nearestOpp(a: Agent, px = a.x, py = a.y) {
    let best: Agent | null = null;
    let bd = 1e9;
    for (const o of this.agents) {
      if (o.team === a.team || o.sentOff) continue;
      const d = dist(o.x, o.y, px, py);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return { agent: best!, d: bd };
  }
  /** Effective attribute (the user's is affected by energy & morale). */
  eff(a: Agent, k: AttrKey) {
    const v = a.attrs[k];
    if (!a.isUser) return v;
    return v * (0.82 + (this.userEnergy / 100) * 0.18) + (this.userMorale - 50) / 12;
  }
  push(key: string, tone: FeedItem['tone'] = 'info', p?: FeedItem['p']) {
    this.feed.push({ key, tone, p });
  }
  later(delay: number, fn: () => void) {
    this.scheduled.push({ at: this.time + delay, epoch: this.epoch, fn });
  }
  oppLine(team: 0 | 1) {
    // deepest opposing defender, in `team`'s neutral frame
    let m = -1e9;
    for (const o of this.agents) {
      if (o.team === team || o.sentOff || o.role === 'GK') continue;
      const nx = this.n(team, o.x, o.y).x;
      if (nx > m) m = nx;
    }
    return m;
  }

  private putUserOn(slot: number) {
    const s = this.setup.user!;
    const a = this.agents.find((x) => x.team === this.userTeam && x.slot === slot)!;
    a.isUser = true;
    a.attrs = { ...s.attrs };
    a.name = s.name.split(' ').slice(-1)[0];
    a.num = s.number;
    if (s.position === 'CAM') {
      a.bx += 5;
      a.depth += 5;
    }
    if (s.position === 'CDM') a.depth -= 1;
    this.user = a;
    this.userOnField = true;
  }

  // ------------------------------------------------------------------ set pieces
  kickoff(team: 0 | 1) {
    this.epoch++;
    this.phase = 'kickoff';
    this.phaseTimer = 1.6;
    this.kickoffTeam = team;
    this.possession = team;
    for (const a of this.agents) {
      if (a.sentOff) continue;
      const s = FORMATION[a.slot];
      let nx = Math.min(s.x * 0.92, -1.5);
      let ny = s.y * 0.9;
      if (a.team === team && s.key === 'ST') {
        nx = -0.4;
        ny = 0;
      }
      if (a.team === team && s.key === 'RCM') {
        nx = -6;
        ny = 5;
      }
      if (a.team !== team) nx = Math.min(nx, -9.5);
      const w = this.n(a.team, nx, ny);
      a.x = w.x;
      a.y = w.y;
      a.vx = a.vy = 0;
      a.runTo = null;
      a.stun = 0;
      a.celebrate = 0;
      a.dive = 0;
      a.dir = a.team === 0 ? 0 : Math.PI;
      a.tgtX = a.x;
      a.tgtY = a.y;
      a.aiRun = null;
      a.react = 0;
    }
    const st = this.teamOf(team).find((a) => FORMATION[a.slot].key === 'ST') ?? this.teamOf(team)[9];
    this.giveBall(st, true);
    st.decideCd = 99;
    const b = this.ball;
    b.x = st.x + Math.cos(st.dir) * 0.5;
    b.y = st.y;
    b.z = 0;
  }

  restart(kind: 'throw' | 'corner' | 'goalkick' | 'freekick', team: 0 | 1, x: number, y: number) {
    this.epoch++;
    this.phase = 'restart';
    this.phaseTimer = kind === 'throw' ? 0.9 : kind === 'freekick' ? 1.0 : 1.5;
    const b = this.ball;
    b.pass = null;
    b.shot = null;
    let taker: Agent;
    if (kind === 'goalkick') {
      taker = this.gk(team);
      const w = this.n(team, -46, 0);
      x = w.x;
      y = w.y;
    } else {
      const cands = this.teamOf(team).filter((a) => a.role !== 'GK');
      cands.sort((p, q) => dist(p.x, p.y, x, y) + (p.isUser ? 12 : 0) - dist(q.x, q.y, x, y) - (q.isUser ? 12 : 0));
      taker = cands[0];
    }
    taker.x = x;
    taker.y = y;
    taker.vx = taker.vy = 0;
    taker.runTo = null;
    for (const o of this.agents) {
      if (o.team === team || o.sentOff) continue;
      const d = dist(o.x, o.y, x, y);
      if (d < 7) {
        const k = (7 - d) / (d || 1);
        o.x += (o.x - x) * k;
        o.y += (o.y - y) * k;
      }
    }
    this.giveBall(taker, true);
    taker.decideCd = 99;
    this.push(`feed.${kind}`, 'info', { team: this.teamName(team) });
  }

  teamName(team: 0 | 1) {
    return team === 0 ? this.setup.home.short : this.setup.away.short;
  }

  // ------------------------------------------------------------------ ball actions
  giveBall(a: Agent, silent = false) {
    const b = this.ball;
    const prevPass = b.pass;
    const prevTeam = b.lastTouch?.team;
    b.owner = a;
    b.lastTouch = a;
    b.pass = null;
    b.shot = null;
    b.vx = b.vy = b.vz = 0;
    b.lead = 0.5;
    b.touchT = 0.25;
    a.holdTime = 0;
    a.decideCd = rand(0.25, 0.55);
    if (this.possession !== a.team) {
      this.assistBy = null;
      // everybody needs a moment to react to the turnover
      for (const o of this.agents) {
        o.react = o === a ? 0 : rand(0.12, 0.42);
        o.aiRun = null;
      }
    }
    this.possession = a.team;
    if (prevPass && prevPass.from.team === a.team && prevPass.from !== a) {
      this.assistBy = prevPass.from;
      this.assistTime = this.time;
    } else if (prevTeam !== undefined && prevTeam !== a.team) {
      this.assistBy = null;
    }
    if (a.isUser && !silent && this.phase === 'play') {
      if (prevPass?.cross) this.openAerial();
      else this.openOnBall();
    }
  }

  kick(from: Agent, tx: number, ty: number, speed: number, vz: number) {
    const b = this.ball;
    const d = dist(b.x, b.y, tx, ty) || 1;
    b.owner = null;
    b.lastTouch = from;
    b.kickTime = this.time;
    b.vx = ((tx - b.x) / d) * speed;
    b.vy = ((ty - b.y) / d) * speed;
    b.vz = vz;
    b.spin = speed;
    from.kickAnim = 0.35;
    from.holdTime = 0;
  }

  /** Pass with lead. opts.interceptor: misplaced pass toward that opponent. */
  pass(
    from: Agent,
    to: Agent,
    opts: { protect?: boolean; interceptor?: Agent | null; lofted?: boolean; cross?: boolean; userPass?: boolean; lead?: { x: number; y: number } } = {},
  ) {
    const b = this.ball;
    let tx = opts.lead?.x ?? to.x;
    let ty = opts.lead?.y ?? to.y;
    const d0 = dist(b.x, b.y, tx, ty);
    if (!opts.lead) {
      const lt = Math.min(1.4, d0 / 18);
      tx += to.vx * lt;
      ty += to.vy * lt;
    }
    if (opts.interceptor) {
      tx = tx * 0.25 + opts.interceptor.x * 0.75;
      ty = ty * 0.25 + opts.interceptor.y * 0.75;
    }
    if (!opts.protect && !opts.interceptor && !opts.userPass) {
      // human error: worse passers and longer passes drift more
      const dd = dist(b.x, b.y, tx, ty);
      const pressed = this.nearestOpp(from).d < 2.2 ? 1.8 : 1;
      const sd = ((100 - from.attrs.passing) / 100) * 0.16 * (0.6 + dd / 25) * (opts.cross ? 1.3 : 1) * pressed;
      const ang = Math.atan2(ty - b.y, tx - b.x) + (Math.random() + Math.random() + Math.random() - 1.5) * sd * 1.6;
      const len = dd * (1 + (Math.random() - 0.5) * sd);
      tx = b.x + Math.cos(ang) * len;
      ty = b.y + Math.sin(ang) * len;
    }
    tx = clamp(tx, -HL - 3, HL + 3);
    ty = clamp(ty, -HW - 3, HW + 3);
    if (opts.protect || opts.interceptor) {
      tx = clamp(tx, -HL + 1, HL - 1);
      ty = clamp(ty, -HW + 1, HW - 1);
    }
    const d = dist(b.x, b.y, tx, ty);
    const lofted = opts.lofted || opts.cross || d > 32;
    if (lofted) {
      const speed = clamp(d * 0.55 + 9, 14, 26);
      const T = d / speed;
      this.kick(from, tx, ty, speed, (G * T) / 2 + (opts.cross ? 0.6 : 0));
    } else {
      const speed = clamp(d * 0.62 + 6, 9, 27);
      this.kick(from, tx, ty, speed, 0.4);
    }
    this.dbg.passes++;
    b.pass = {
      from,
      to,
      protect: !!opts.protect,
      interceptor: opts.interceptor ?? null,
      checked: new Set(),
      cross: !!opts.cross,
      tx,
      ty,
      t0: this.time,
      userPass: !!opts.userPass,
    };
  }

  shotModel(a: Agent, kind: string) {
    const nn = this.n(a.team, a.x, a.y);
    const d = dist(nn.x, nn.y, HL, 0);
    const ang = Math.abs(Math.atan2(nn.y, Math.max(0.5, HL - nn.x)));
    const pressure = this.nearestOpp(a).d;
    const gk = this.gk(a.team === 0 ? 1 : 0);
    let base = 1.15 * Math.exp(-(Math.max(d, 5) - 5) / 10.5);
    const angleF = 1 - Math.min(0.75, ang / 1.35);
    const header = kind === 'header' || kind === 'bicycle' || kind === 'volley';
    const skillAttr = kind === 'header' ? this.eff(a, 'physical') * 0.5 + this.eff(a, 'shooting') * 0.5 : this.eff(a, 'shooting');
    const skill = 0.5 + (skillAttr / 100) * 0.95 + (this.eff(a, 'composure') - 50) / 400;
    const gkF = 0.72 + (gk.attrs.defending / 100) * 0.5;
    const pressF = header ? 0.95 : pressure < 1.4 ? 0.62 : pressure < 3 ? 0.82 : 1;
    const kindF: Record<string, number> = {
      normal: 1, finesse: 1.18, power: 1.05, chip: 1.12, header: 0.82, volley: 0.88, bicycle: 0.78, long: 1,
    };
    if (kind === 'chip' && d > 18) base *= 0.4;
    const goal = clamp(base * angleF * (skill / gkF) * pressF * (kindF[kind] ?? 1), 0.01, 0.82);
    const onAdj = kind === 'finesse' ? -0.06 : kind === 'power' ? -0.04 : 0;
    const onTarget = clamp(0.3 + skillAttr / 300 + goal * 0.6 + onAdj, goal + 0.02, 0.95);
    return { goal, onTarget, d };
  }

  shoot(a: Agent, kind: string, forced?: 'goal' | 'save' | 'miss') {
    const m = this.shotModel(a, kind);
    let outcome: 'goal' | 'save' | 'miss' = forced ?? 'miss';
    if (!forced) {
      const r = Math.random();
      outcome = r < m.goal ? 'goal' : r < m.onTarget ? 'save' : 'miss';
    }
    const gx = this.attackGoalX(a.team);
    const gk = this.gk(a.team === 0 ? 1 : 0);
    let ty = 0;
    let tz = 0;
    if (outcome === 'goal') {
      const side = gk.y > 0 ? -1 : 1;
      ty = side * rand(0.8, GOAL_HW - 0.35) * (Math.random() < 0.8 ? 1 : -1);
      tz = kind === 'chip' ? rand(1.2, 2.1) : rand(0.15, 2.1);
    } else if (outcome === 'save') {
      ty = clamp(gk.y + rand(-1.6, 1.6), -GOAL_HW + 0.3, GOAL_HW - 0.3);
      tz = rand(0.2, 1.9);
    } else if (Math.random() < 0.6) {
      ty = (Math.random() < 0.5 ? -1 : 1) * rand(GOAL_HW + 0.4, GOAL_HW + 5);
      tz = rand(0.2, 2.5);
    } else {
      ty = rand(-GOAL_HW, GOAL_HW);
      tz = rand(2.7, 4.5);
    }
    const b = this.ball;
    if (kind === 'header' || kind === 'bicycle' || kind === 'volley') b.z = kind === 'volley' ? 0.8 : 1.8;
    const D = dist(b.x, b.y, gx, ty) || 1;
    const speed = { power: 30, finesse: 21, chip: 13, header: 17, bicycle: 22, volley: 25, long: 28 }[kind] ?? 25;
    const T = D / speed;
    const vz = (tz - b.z + 0.5 * G * T * T) / T;
    // aim a bit past the line so goals land in the net
    const ex = gx + Math.sign(gx) * 1.5;
    const ey = ty + ((ty - b.y) / D) * 1.5;
    this.kick(a, ex, ey, speed, vz);
    b.shot = { by: a, outcome, tx: gx, ty, tz };
    b.spin = speed * 1.5;
    this.shots[a.team]++;
    return outcome;
  }

  bestPass(a: Agent, opts: { minD?: number; maxD?: number; ahead?: number; inBox?: boolean } = {}) {
    const an = this.n(a.team, a.x, a.y);
    let best: { to: Agent; score: number; lane: number; gain: number } | null = null;
    for (const t of this.teamOf(a.team)) {
      if (t === a || t.stun > 0) continue;
      if (t.role === 'GK' && an.x > -30) continue;
      const tn = this.n(a.team, t.x, t.y);
      const d = dist(a.x, a.y, t.x, t.y);
      if (d < (opts.minD ?? 5) || d > (opts.maxD ?? 45)) continue;
      if (opts.ahead !== undefined && tn.x < an.x + opts.ahead) continue;
      if (opts.inBox && !(tn.x > HL - 18 && Math.abs(tn.y) < 18)) continue;
      let open = 9;
      let lane = 6;
      for (const o of this.agents) {
        if (o.team === a.team || o.sentOff) continue;
        open = Math.min(open, dist(o.x, o.y, t.x, t.y));
        lane = Math.min(lane, segDist(o.x, o.y, a.x, a.y, t.x, t.y));
      }
      const gain = tn.x - an.x;
      let score = gain * 0.6 + open * 1.0 + lane * 1.4 - d * 0.1 + Math.random() * 3;
      if (lane < 1.3) score -= 10;
      if (t.isUser) score += this.askBall > 0 ? 30 : t.role === 'DEF' && an.x < 0 ? 9 : t.slot === 5 ? 6 : 3.5;
      if (!best || score > best.score) best = { to: t, score, lane, gain };
    }
    return best;
  }

  // ------------------------------------------------------------------ main step
  step(dt: number) {
    if (this.phase === 'fulltime') return;
    this.time += dt;
    // scheduled callbacks
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      this.scheduled = this.scheduled.filter((s) => s.at > this.time);
      for (const s of due) if (s.epoch === this.epoch) s.fn();
    }
    this.slowmo = Math.max(0, this.slowmo - dt);
    this.userProtect = Math.max(0, this.userProtect - dt);
    this.askBall = Math.max(0, this.askBall - dt);
    for (const a of this.agents) {
      a.stun = Math.max(0, a.stun - dt);
      a.tackleCd = Math.max(0, a.tackleCd - dt);
      a.kickAnim = Math.max(0, a.kickAnim - dt);
      a.touchAnim = Math.max(0, a.touchAnim - dt);
      a.celebrate = Math.max(0, a.celebrate - dt);
      a.react = Math.max(0, a.react - dt);
      a.supT -= dt;
      if (a.diveT > 0) {
        a.diveT -= dt;
        if (a.diveT <= 0) a.dive = 0;
      }
      if (a.aiRun) {
        a.aiRun.t -= dt;
        if (a.aiRun.t <= 0) a.aiRun = null;
      }
      if (a.runTo) {
        a.runTo.t -= dt;
        if (a.runTo.t <= 0) a.runTo = null;
      }
    }

    switch (this.phase) {
      case 'kickoff':
      case 'restart':
        this.moveAgents(dt);
        this.updateBall(dt);
        if (!this.decision) this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phase = 'play';
          const o = this.ball.owner;
          if (o) {
            if (o.isUser) this.openOnBall();
            else o.decideCd = 0;
          }
        }
        break;
      case 'goal':
        this.moveAgents(dt);
        this.updateBall(dt);
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.kickoff(this.score[0] + this.score[1] > 0 && this.goals.length ? (this.goals[this.goals.length - 1].team === 0 ? 1 : 0) : 0);
        break;
      case 'halftime':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.kickoff(1);
        break;
      case 'play':
        this.playStep(dt);
        break;
    }
  }

  private playStep(dt: number) {
    if (!this.decision) {
      this.playTime += dt;
      this.possTime[this.possession] += dt;
    }
    const min = this.minute;
    if (this.userOnField) this.userEnergy = Math.max(5, this.userEnergy - dt * (90 / MATCH_SIM_SECONDS) * 0.32);

    if (!this.halfDone && min >= 45 && !this.ball.shot) {
      this.halfDone = true;
      this.phase = 'halftime';
      this.phaseTimer = 2.5;
      this.decision = null;
      this.push('feed.halftime', 'info');
      return;
    }
    if (min >= 90 && !this.ball.shot) {
      this.endMatch();
      return;
    }
    if (this.benchUser && min >= this.userIn) {
      this.putUserOn(this.benchUser.slot);
      this.benchUser = null;
      this.userIn = Math.floor(min);
      this.push('feed.subIn', 'good');
    }
    // random in-match knock
    if (this.userOnField && !this.decision && Math.random() < dt * (this.userEnergy < 30 ? 0.0006 : 0.00008)) {
      this.injuredWeeks = randi(1, 4);
      this.removeUser('feed.injured');
    }

    this.computeRoles();
    this.tacticalRuns(dt);
    this.moveAgents(dt);
    this.aiOnBall(dt);
    this.tackles();
    this.updateBall(dt);
    if (this.phase !== 'play') return;
    this.claims();
    this.bounds();
    this.updateApproach();
    this.triggers(dt);
  }

  removeUser(key: string) {
    if (!this.user) return;
    this.userOut = Math.floor(this.minute);
    this.userOnField = false;
    this.decision = null;
    const u = this.user;
    u.isUser = false;
    this.push(key, 'bad');
    if (key === 'feed.red') {
      u.sentOff = true;
      u.x = 0;
      u.y = HW + 8;
      if (this.ball.owner === u) this.giveBall(this.nearestOpp(u).agent, true);
    } else {
      // substitute comes on: give him average attributes
      u.attrs = genAttrs(this.userTeam === 0 ? this.setup.home.strength : this.setup.away.strength, u.role);
      u.name = SURNAMES[randi(0, SURNAMES.length - 1)];
      u.num = 12 + randi(0, 10);
    }
    this.user = null;
  }

  private computeRoles() {
    const b = this.ball;
    for (const team of [0, 1] as const) {
      let best: Agent | null = null;
      let bd = 1e9;
      const ps: Array<{ a: Agent; d: number }> = [];
      for (const a of this.agents) {
        if (a.team !== team || a.sentOff || a.stun > 0) continue;
        const d = dist(a.x, a.y, b.x, b.y);
        if (a.role === 'GK') {
          const nb = this.n(team, b.x, b.y);
          if (!(nb.x < -HL + 16 && Math.abs(nb.y) < 18)) continue;
        }
        if (a.isUser && this.decision?.kind === 'offBall') continue;
        if (d < bd) {
          bd = d;
          best = a;
        }
        if (a.role !== 'GK') ps.push({ a, d });
      }
      this.chasers[team] = best;
      ps.sort((p, q) => p.d - q.d);
      this.pressers[team] = ps.slice(0, 2).map((p) => p.a);
      // supporters: two nearest teammates offer passing angles to the carrier
      const c = b.owner;
      if (c && c.team === team && c.role !== 'GK') {
        this.supporters[team] = ps
          .filter((p) => p.a !== c && !p.a.aiRun && !p.a.runTo && p.d < 30 && !(p.a.isUser && this.decision))
          .sort((p, q) => p.d - (p.a.isUser ? 8 : 0) - (q.d - (q.a.isUser ? 8 : 0)))
          .slice(0, 2)
          .map((p) => p.a);
      } else this.supporters[team] = [];
    }
  }

  /** Off-the-ball runs: midfielders arriving, full-backs overlapping, strikers running in behind. */
  private tacticalRuns(dt: number) {
    const c = this.ball.owner;
    for (const team of [0, 1] as const) {
      this.runTimer[team] -= dt;
      if (this.runTimer[team] > 0) continue;
      this.runTimer[team] = rand(0.9, 1.6);
      if (!c || c.team !== team || c.role === 'GK') continue;
      const cn = this.n(team, c.x, c.y);
      if (cn.x < -12) continue;
      const mates = this.teamOf(team).filter((a) => a !== c && !a.isUser && a.role !== 'GK' && a.stun <= 0);
      if (mates.filter((a) => a.aiRun).length >= 2) continue;
      const line = this.oppLine(team);
      const opts: Array<{ a: Agent; x: number; y: number; t: number }> = [];
      for (const a of mates) {
        if (a.aiRun) continue;
        const an = this.n(team, a.x, a.y);
        if (a.role === 'MID' && a.depth >= 0 && cn.x > 5 && an.x < HL - 20) {
          // box-to-box midfielder arrives at the edge of the box / half-space
          opts.push({ a, x: Math.min(HL - 13, Math.max(an.x + 12, cn.x + 6)), y: clamp(a.by * 0.6 + rand(-3, 3), -14, 14), t: 2.6 });
        }
        if (a.role === 'DEF' && Math.abs(a.by) > 15 && Math.sign(a.by) === Math.sign(cn.y) && cn.x > -2 && Math.abs(cn.y) > 8) {
          // full-back overlaps on the ball side
          opts.push({ a, x: Math.min(HL - 8, cn.x + 13), y: Math.sign(a.by) * (HW - 4), t: 2.4 });
        }
        if (a.role === 'FWD' && Math.abs(a.by) < 6 && line < HL - 12 && cn.x > -5) {
          // striker spins in behind the last line
          opts.push({ a, x: Math.min(HL - 9, line + 8), y: clamp(an.y + rand(-5, 5), -12, 12), t: 1.8 });
        }
        if (a.role === 'FWD' && Math.abs(a.by) > 15 && cn.x > 8 && Math.sign(a.by) !== Math.sign(cn.y)) {
          // far winger attacks the back post
          opts.push({ a, x: HL - 9, y: Math.sign(a.by) * 7, t: 2.2 });
        }
      }
      if (!opts.length || Math.random() > 0.55) continue;
      const o = opts[randi(0, opts.length - 1)];
      const w = this.n(team, o.x, o.y);
      o.a.aiRun = { x: w.x, y: w.y, t: o.t };
    }
  }

  /** Best open spot around the carrier for a supporting player. */
  private supportSpot(a: Agent, c: Agent) {
    if (a.supT > 0) return { x: a.supX, y: a.supY };
    a.supT = rand(0.5, 0.8);
    const gx = this.attackGoalX(c.team);
    const base = Math.atan2(-c.y * 0.25, gx - c.x);
    const other = this.supporters[a.team].find((s) => s !== a);
    let best = { x: a.x, y: a.y, s: -1e9 };
    for (const ang of [-1.05, -0.55, 0.55, 1.05, 2.3, -2.3]) {
      const r = ang > 2 || ang < -2 ? 9 : 12;
      const x = clamp(c.x + Math.cos(base + ang) * r, -HL + 3, HL - 3);
      const y = clamp(c.y + Math.sin(base + ang) * r, -HW + 2, HW - 2);
      let open = 8;
      let lane = 4;
      for (const o of this.agents) {
        if (o.team === a.team || o.sentOff) continue;
        open = Math.min(open, dist(o.x, o.y, x, y));
        lane = Math.min(lane, segDist(o.x, o.y, c.x, c.y, x, y));
      }
      let sc = open + lane * 1.4 - dist(a.x, a.y, x, y) * 0.18 + (Math.abs(ang) < 1.2 ? 1.5 : 0);
      if (other && dist(other.supX, other.supY, x, y) < 7) sc -= 8;
      if (sc > best.s) best = { x, y, s: sc };
    }
    a.supX = best.x;
    a.supY = best.y;
    return best;
  }

  private target(a: Agent): { x: number; y: number; sprint: boolean } {
    const b = this.ball;
    if (a.runTo) return { x: a.runTo.x, y: a.runTo.y, sprint: true };
    const nb = this.n(a.team, b.x, b.y);
    const att = this.possession === a.team;
    if (this.phase === 'kickoff') return { x: a.x, y: a.y, sprint: false };

    if (this.phase === 'play' && !b.owner) {
      if (b.pass && b.pass.to === a) {
        const sp = Math.hypot(b.vx, b.vy);
        return sp < 4 ? { x: b.x, y: b.y, sprint: true } : { x: b.pass.tx, y: b.pass.ty, sprint: true };
      }
      if (b.pass?.interceptor === a) return { x: b.x, y: b.y, sprint: true };
      if (b.shot && a.role === 'GK' && a.team !== b.shot.by.team) {
        const gx = this.attackGoalX(b.shot.by.team) - Math.sign(this.attackGoalX(b.shot.by.team)) * 0.6;
        if (b.shot.outcome === 'save') return { x: gx, y: b.shot.ty, sprint: true };
        return { x: gx, y: b.shot.ty * 0.45, sprint: true };
      }
      if (!b.shot && this.chasers[a.team] === a && !(b.pass?.protect && b.pass.to.team !== a.team)) {
        // predict where the ball will be
        const t = Math.min(1, dist(a.x, a.y, b.x, b.y) / 9);
        return { x: b.x + b.vx * t * 0.6, y: b.y + b.vy * t * 0.6, sprint: true };
      }
    }

    if (this.phase === 'play' && b.owner && b.owner.team !== a.team && a.role !== 'GK') {
      const ps = this.pressers[a.team];
      const c = b.owner;
      const own = -this.attackGoalX(a.team);
      if (ps[0] === a && !(a.isUser && this.decision)) {
        const k = 0.9 / (dist(c.x, c.y, own, 0) || 1);
        return { x: c.x + (own - c.x) * k, y: c.y - c.y * k, sprint: true };
      }
      if (ps[1] === a && dist(a.x, a.y, c.x, c.y) < 16) {
        const k = 2.5 / (dist(c.x, c.y, own, 0) || 1);
        return { x: c.x + (own - c.x) * k, y: c.y - c.y * k, sprint: true };
      }
    }

    if (a.role === 'GK') {
      let nx = -HL + 1.2 + clamp((nb.x + HL) * 0.045, 0, 4.5);
      let ny = clamp(nb.y * 0.14, -2.6, 2.6);
      if (b.owner?.team === a.team && b.owner === a) {
        nx = this.n(a.team, a.x, a.y).x;
        ny = this.n(a.team, a.x, a.y).y;
      }
      const w = this.n(a.team, nx, ny);
      return { x: w.x, y: w.y, sprint: false };
    }

    // tactical runs and support play (attacking)
    if (this.phase === 'play' && att) {
      if (a.aiRun) return { x: a.aiRun.x, y: a.aiRun.y, sprint: true };
      const c = b.owner;
      if (c && c !== a && this.supporters[a.team].includes(a)) {
        const sp = this.supportSpot(a, c);
        return { x: sp.x, y: sp.y, sprint: dist(a.x, a.y, sp.x, sp.y) > 6 };
      }
    }

    // formation: a compact block, each line follows the ball at its own distance
    const bx = nb.x;
    let defLine: number;
    let midLine: number;
    let fwdLine: number;
    if (att) {
      defLine = clamp(bx - 27, -40, 14);
      midLine = clamp(bx - 7.5, -30, 31);
      fwdLine = clamp(bx + 8, -10, 46);
    } else {
      defLine = clamp(bx - 15, -45, -6);
      midLine = clamp(bx - 6, -37, 10);
      fwdLine = clamp(bx + 5, -22, 16);
    }
    const lineX = a.role === 'DEF' ? defLine : a.role === 'MID' ? midLine : fwdLine;
    let tx = lineX + a.depth + a.jitterX * 0.6;
    const wide = Math.abs(a.by) > 15;
    // full-backs push up on the ball side
    if (att && a.role === 'DEF' && wide && Math.sign(a.by) === Math.sign(nb.y || a.by) && bx > -10) tx = Math.max(tx, midLine - 4);
    // centre-backs hold the line together
    if (a.role === 'DEF' && !wide) tx = defLine;
    // attackers stay onside unless making a run
    if (att && a.role !== 'DEF' && b.owner !== a) tx = Math.min(tx, Math.max(this.oppLine(a.team) - 0.4, bx - 3));
    // defending: midfield screens in front of the back four, nobody hides behind the ball
    if (!att && a.role === 'MID') tx = Math.max(Math.min(tx, bx - 3), defLine + 5);
    if (!att && a.role === 'DEF') tx = Math.min(tx, bx - 2);
    tx = clamp(tx, -HL + 5, HL - 4);
    const width = att ? (a.role === 'FWD' && wide ? 1.2 : 1.08) : a.role === 'DEF' ? 0.78 : 0.68;
    const pull = att ? 0.22 : 0.42;
    let ty = a.by * width + nb.y * pull + a.jitterY;
    ty = clamp(ty, -HW + 1.5, HW - 1.5);
    if (this.phase === 'restart' && b.owner && b.owner.team !== a.team) {
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 8) {
        const w0 = this.n(a.team, tx, ty);
        return { x: w0.x, y: w0.y, sprint: true };
      }
    }
    const w = this.n(a.team, tx, ty);
    const far = dist(a.x, a.y, w.x, w.y) > 9;
    return { x: w.x, y: w.y, sprint: far };
  }

  private moveAgents(dt: number) {
    const b = this.ball;
    for (const a of this.agents) {
      if (a.sentOff) continue;
      let tx: number;
      let ty: number;
      let speed: number;
      const max = this.maxSpeed(a);
      if (this.phase === 'goal') {
        if (a.celebrate > 0) {
          tx = a.x + Math.cos(a.dir) * 4;
          ty = a.y + Math.sin(a.dir) * 4;
          speed = max * 0.6;
        } else {
          tx = a.x;
          ty = a.y;
          speed = 0;
        }
      } else if (a.stun > 0) {
        tx = a.x;
        ty = a.y;
        speed = 0;
      } else if (b.owner === a && this.phase === 'play') {
        const t = this.dribbleTarget(a);
        tx = t.x;
        ty = t.y;
        speed = t.speed;
      } else if (b.owner === a) {
        tx = a.x;
        ty = a.y;
        speed = 0;
      } else {
        if (a.react <= 0 || this.phase !== 'play') {
          const t = this.target(a);
          const k = 1 - Math.exp(-dt * (t.sprint ? 9 : 3.2));
          if (dist(a.tgtX, a.tgtY, t.x, t.y) > 25) {
            a.tgtX = t.x;
            a.tgtY = t.y;
          } else {
            a.tgtX += (t.x - a.tgtX) * k;
            a.tgtY += (t.y - a.tgtY) * k;
          }
          a.tgtSprint = t.sprint;
        }
        tx = a.tgtX;
        ty = a.tgtY;
        speed = a.tgtSprint ? max : max * 0.6;
      }
      const dx = tx - a.x;
      const dy = ty - a.y;
      const d = Math.hypot(dx, dy);
      let dvx = 0;
      let dvy = 0;
      if (d > 0.25) {
        // arrive: ease off before reaching the spot
        const s = Math.min(speed, Math.sqrt(2 * 5 * Math.max(0, d - 0.2)));
        dvx = (dx / d) * s;
        dvy = (dy / d) * s;
      }
      const ex = dvx - a.vx;
      const ey = dvy - a.vy;
      const el = Math.hypot(ex, ey);
      const braking = ex * a.vx + ey * a.vy < 0;
      const acc = (braking ? 11 : 7.5) * dt;
      if (el > acc) {
        a.vx += (ex / el) * acc;
        a.vy += (ey / el) * acc;
      } else {
        a.vx = dvx;
        a.vy = dvy;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      // body orientation turns smoothly; defenders close to the ball keep facing it
      const sp = Math.hypot(a.vx, a.vy);
      const nearBall = dist(a.x, a.y, b.x, b.y) < 7 && b.owner !== a;
      let want = a.dir;
      if (this.phase === 'goal' && a.celebrate > 0) want = a.dir;
      else if (nearBall && sp < 5 && this.phase !== 'goal') want = Math.atan2(b.y - a.y, b.x - a.x);
      else if (sp > 0.6) want = Math.atan2(a.vy, a.vx);
      else if (this.phase !== 'goal') want = Math.atan2(b.y - a.y, b.x - a.x);
      let diff = want - a.dir;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnRate = (b.owner === a ? 5 : 8) - Math.min(3, sp * 0.3);
      const maxTurn = turnRate * dt;
      a.dir += clamp(diff, -maxTurn, maxTurn);
      const lim = b.owner === a ? 0.4 : -1.5;
      a.x = clamp(a.x, -HL - lim - 1, HL + lim + 1);
      a.y = clamp(a.y, -HW - lim - 1, HW + lim + 1);
      if (b.owner === a) {
        a.x = clamp(a.x, -HL + 0.4, HL - 0.4);
        a.y = clamp(a.y, -HW + 0.4, HW - 0.4);
      }
    }
    // separation
    const f = this.agents;
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      if (p.sentOff) continue;
      for (let j = i + 1; j < f.length; j++) {
        const q = f[j];
        if (q.sentOff) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.81 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (0.9 - d) * 0.5;
          p.x -= (dx / d) * push;
          p.y -= (dy / d) * push;
          q.x += (dx / d) * push;
          q.y += (dy / d) * push;
        }
      }
    }
  }

  private dribbleTarget(a: Agent) {
    const gx = this.attackGoalX(a.team);
    if (a.role === 'GK') return { x: a.x, y: a.y, speed: 0 };
    if (a.isUser && this.decision) {
      return { x: a.x + Math.cos(a.dir) * 2, y: a.y + Math.sin(a.dir) * 2, speed: 1.5 };
    }
    let dx = gx - a.x;
    let dy = -a.y * 0.6;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    // avoid opponents ahead
    let ax = 0;
    let ay = 0;
    for (const o of this.agents) {
      if (o.team === a.team || o.sentOff) continue;
      const ox = o.x - a.x;
      const oy = o.y - a.y;
      const d = Math.hypot(ox, oy);
      if (d > 7 || d < 0.01) continue;
      if (ox * dx + oy * dy < -1) continue;
      const side = ox * -dy + oy * dx > 0 ? -1 : 1;
      const w = (7 - d) / 7;
      ax += -dy * side * w * 1.6;
      ay += dx * side * w * 1.6;
    }
    const tx = a.x + (dx + ax) * 5;
    const ty = clamp(a.y + (dy + ay) * 5, -HW + 2, HW - 2);
    return { x: tx, y: ty, speed: this.maxSpeed(a) * 0.8 };
  }

  private aiOnBall(dt: number) {
    const a = this.ball.owner;
    if (!a || a.isUser) return;
    a.holdTime += dt;
    if (this.frozen === a) return;
    a.decideCd -= dt;
    if (a.decideCd > 0) return;
    a.decideCd = rand(0.3, 0.6);
    const an = this.n(a.team, a.x, a.y);

    if (a.role === 'GK') {
      if (a.holdTime < 0.9) return;
      const best = this.bestPass(a, { minD: 8, maxD: 60 }) ?? this.bestPass(a, { minD: 3, maxD: 70 });
      if (best) this.pass(a, best.to, { lofted: dist(a.x, a.y, best.to.x, best.to.y) > 30 });
      return;
    }

    const press = this.nearestOpp(a).d;
    const dGoal = dist(an.x, an.y, HL, 0);

    // corner or wide in the final third -> cross
    if ((an.x > HL - 3 && Math.abs(an.y) > HW - 6) || (an.x > 30 && Math.abs(an.y) > 16 && Math.random() < 0.45)) {
      const t = this.bestPass(a, { minD: 6, maxD: 50, inBox: true });
      if (t) {
        this.pass(a, t.to, { cross: true });
        return;
      }
    }
    // shoot
    let sp = dGoal < 11 ? 0.75 : dGoal < 17 ? 0.5 : dGoal < 25 ? 0.24 : dGoal < 31 ? 0.08 : 0;
    if (Math.abs(an.y) > 14) sp *= 0.35;
    if (Math.random() < sp) {
      this.shoot(a, dGoal > 22 ? 'long' : 'normal');
      return;
    }
    const best = this.bestPass(a);
    if (!best) return;
    const r = Math.random();
    let go = false;
    if (best.to.isUser && this.askBall > 0) go = true;
    else if (press < 2.2) go = r < 0.62;
    else if (press < 5) go = best.gain > 2 ? r < 0.4 : r < 0.18;
    else go = (best.gain > 10 && best.score > 14 && r < 0.3) || a.holdTime > 4.5;
    if (a.role === 'DEF' && an.x < -25 && press < 4) go = true;
    if (go) this.pass(a, best.to);
  }

  private tackles() {
    const c = this.ball.owner;
    if (!c || this.phase !== 'play') return;
    if (c.isUser && (this.decision || this.userProtect > 0)) return;
    if (c.role === 'GK') {
      const cn = this.n(c.team, c.x, c.y);
      if (cn.x < -HL + 16.5) return;
    }
    for (const d of this.agents) {
      if (d.team === c.team || d.sentOff || d.stun > 0 || d.tackleCd > 0 || d.isUser) continue;
      if (dist(d.x, d.y, c.x, c.y) > 1.6) continue;
      d.tackleCd = 0.85;
      this.dbg.tackleAtt++;
      let p = clamp(0.26 + (d.attrs.defending - this.eff(c, 'dribbling')) / 210 + (d.attrs.physical - this.eff(c, 'physical')) / 600, 0.05, 0.45);
      if (c.isUser) p *= 0.75;
      if (this.n(c.team, c.x, c.y).x > 25) p *= 0.75;
      if (Math.random() < 0.035) {
        // foul
        d.stun = 0.6;
        this.restart('freekick', c.team, c.x, c.y);
        return;
      }
      if (Math.random() < p) {
        this.dbg.tackleOk++;
        c.stun = 0.7;
        if (c.isUser) {
          this.push('feed.lostBall', 'bad');
          this.ratingAcc -= 0.08;
        }
        if (d.isUser) this.stats.tacklesOk++;
        if (Math.random() < 0.6) this.giveBall(d);
        else {
          const ang = rand(0, Math.PI * 2);
          this.kick(d, this.ball.x + Math.cos(ang) * 4, this.ball.y + Math.sin(ang) * 4, 5, 0.5);
        }
        return;
      }
    }
  }

  private updateBall(dt: number) {
    const b = this.ball;
    const o = b.owner;
    if (o) {
      const sp = Math.hypot(o.vx, o.vy);
      const inHands = o.role === 'GK' && (this.phase !== 'play' || o.holdTime < 1.2) && this.n(o.team, o.x, o.y).x < -HL + 16.5;
      if (!inHands && this.phase === 'play' && sp > 1.2) {
        // dribbling: push the ball ahead with a touch, then catch up with it
        b.touchT -= dt;
        if (b.touchT <= 0) {
          b.lead = 0.55 + sp * 0.2;
          b.touchT = clamp(0.72 - sp * 0.05, 0.32, 0.7);
          o.touchAnim = 0.22;
        }
      }
      b.lead += (0.5 - b.lead) * (1 - Math.exp(-dt * 2.2));
      const off = inHands ? 0.35 : b.lead;
      const tx = o.x + Math.cos(o.dir) * off;
      const ty = o.y + Math.sin(o.dir) * off;
      const tz = inHands ? 1.05 : 0;
      const k = 1 - Math.exp(-dt * 16);
      const px = b.x;
      const py = b.y;
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
      b.z += (tz - b.z) * k;
      b.vx = (b.x - px) / Math.max(dt, 1e-4);
      b.vy = (b.y - py) / Math.max(dt, 1e-4);
      b.vz = 0;
      b.spin = Math.hypot(b.vx, b.vy);
      return;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.z > 0.02 || b.vz > 0) {
      b.vz -= G * dt;
      b.vx *= 1 - 0.05 * dt;
      b.vy *= 1 - 0.05 * dt;
    }
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -1.2) b.vz = -b.vz * 0.45;
      else b.vz = 0;
      const k = Math.exp(-0.62 * dt);
      b.vx *= k;
      b.vy *= k;
    }
    b.spin *= Math.exp(-0.4 * dt);
    // goal net
    if (this.phase === 'goal' && Math.abs(b.x) > HL + 1.6) {
      b.x = Math.sign(b.x) * (HL + 1.6);
      b.vx *= -0.2;
      b.vy *= 0.3;
    }
    if (this.phase === 'goal' && Math.abs(b.x) > HL && Math.abs(b.y) > GOAL_HW - 0.2) {
      b.y = Math.sign(b.y) * (GOAL_HW - 0.2);
      b.vy *= -0.2;
    }
    if (this.phase === 'goal' && Math.abs(b.x) > HL && b.z > GOAL_H - 0.2) {
      b.z = GOAL_H - 0.2;
      b.vz = -Math.abs(b.vz) * 0.2;
    }
  }

  private claims() {
    const b = this.ball;
    if (b.owner) return;
    if (b.pass && this.time - b.pass.t0 > 3.2) {
      b.pass.protect = false;
      b.pass.interceptor = null;
    }
    for (const a of this.agents) {
      if (a.sentOff || a.stun > 0) continue;
      if (a === b.lastTouch && this.time - b.kickTime < 0.3) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const isGK = a.role === 'GK';
      const nb = this.n(a.team, b.x, b.y);
      const inOwnBox = nb.x < -HL + 16.5 && Math.abs(nb.y) < 20;
      const intercepting = !!b.pass && !b.pass.protect && !b.pass.interceptor && a.team !== b.pass.from.team;
      const reach = isGK && inOwnBox ? 1.7 : b.pass?.cross && b.pass.to === a ? 1.6 : intercepting ? 1.7 : 1.05;
      const hmax = isGK && inOwnBox ? 2.7 : b.pass?.cross ? 2.6 : 1.8;
      if (d > reach || b.z > hmax) continue;
      if (b.shot) {
        if (!(isGK && a.team !== b.shot.by.team && b.shot.outcome === 'save')) continue;
        this.saveBy(a);
        return;
      }
      const p = b.pass;
      if (p) {
        if (p.protect && a !== p.to) continue;
        if (p.interceptor && a !== p.interceptor) continue;
        if (!p.protect && !p.interceptor && a.team !== p.from.team && a !== p.to) {
          if (p.checked.has(a.id)) continue;
          p.checked.add(a.id);
          const ip = clamp(0.5 + (a.attrs.defending - p.from.attrs.passing) / 110 - Math.max(0, d - 1) * 0.25 + (isGK ? 0.4 : 0), 0.1, 0.92);
          this.dbg.interceptRolls++;
          if (Math.random() > ip) continue;
          this.dbg.intercepts++;
        }
        if (a.team === p.from.team && a !== p.to && Math.hypot(b.vx, b.vy) > 7) continue;
      }
      if (a.isUser && p && p.to === a && p.cross) {
        this.giveBall(a);
        return;
      }
      this.giveBall(a);
      return;
    }
  }

  private saveBy(gk: Agent) {
    const b = this.ball;
    const shooter = b.shot!.by;
    gk.dive = Math.sign(b.y - gk.y) || 1;
    gk.diveT = 0.9;
    this.push('feed.save', shooter.isUser ? 'bad' : shooter.team === this.userTeam ? 'bad' : 'good', { name: gk.name });
    if (Math.random() < 0.3) {
      // parry for a corner
      const team = shooter.team;
      const gx = this.attackGoalX(team);
      this.restart('corner', team, gx - Math.sign(gx) * 0.5, (b.y >= 0 ? 1 : -1) * (HW - 0.5));
      return;
    }
    this.giveBall(gk, true);
    gk.decideCd = 1.0;
  }

  private bounds() {
    const b = this.ball;
    if (b.owner) return;
    if (Math.abs(b.x) > HL) {
      const side = Math.sign(b.x);
      const attacking: 0 | 1 = side > 0 ? 0 : 1;
      const defending: 0 | 1 = attacking === 0 ? 1 : 0;
      const shot = b.shot;
      if (Math.abs(b.y) < GOAL_HW && b.z < GOAL_H && (!shot || shot.outcome === 'goal')) {
        this.goal(attacking);
        return;
      }
      if (shot && shot.outcome === 'save') {
        this.saveBy(this.gk(defending));
        return;
      }
      if (b.lastTouch && b.lastTouch.team === defending && !shot) {
        this.restart('corner', attacking, side * (HL - 0.5), (b.y >= 0 ? 1 : -1) * (HW - 0.5));
      } else {
        if (shot?.by.isUser) this.push('feed.miss', 'bad');
        this.restart('goalkick', defending, 0, 0);
      }
      return;
    }
    if (Math.abs(b.y) > HW) {
      const team: 0 | 1 = b.lastTouch?.team === 0 ? 1 : 0;
      this.restart('throw', team, clamp(b.x, -HL + 1, HL - 1), Math.sign(b.y) * (HW + 0.3));
    }
  }

  private goal(team: 0 | 1) {
    const b = this.ball;
    this.epoch++;
    this.score[team]++;
    const scorer = b.shot?.by ?? b.lastTouch;
    const own = scorer && scorer.team !== team;
    const name = scorer ? scorer.name : '?';
    const isUser = !!scorer?.isUser && !own;
    this.goals.push({ minute: Math.max(1, Math.ceil(this.minute)), team, name, user: isUser });
    if (isUser) {
      this.stats.goals++;
      this.ratingAcc += 1.05;
    }
    if (
      this.assistBy &&
      this.assistBy.isUser &&
      this.assistBy !== scorer &&
      this.assistBy.team === team &&
      this.time - this.assistTime < 14 &&
      !own
    ) {
      this.stats.assists++;
      this.ratingAcc += 0.65;
      this.push('feed.assist', 'good');
    }
    if (this.userOnField) this.ratingAcc += team === this.userTeam ? 0.1 : -0.12;
    this.push(isUser ? 'feed.userGoal' : 'feed.goal', team === this.userTeam ? 'goal' : 'bad', {
      name,
      team: this.teamName(team),
      min: Math.ceil(this.minute),
    });
    this.phase = 'goal';
    this.phaseTimer = 3.2;
    this.decision = null;
    b.shot = null;
    b.pass = null;
    if (scorer && !own) {
      scorer.celebrate = 3;
      scorer.dir = Math.atan2(-scorer.y, -scorer.x * 0.2 + (scorer.team === 0 ? -1 : 1));
      for (const a of this.teamOf(team)) if (a !== scorer && dist(a.x, a.y, scorer.x, scorer.y) < 20) a.celebrate = 2.5;
    }
  }

  private endMatch() {
    this.phase = 'fulltime';
    this.decision = null;
    if (this.userOnField) this.userOut = 90;
    this.push('feed.fulltime', 'info');
  }

  // ------------------------------------------------------------------ decisions
  private triggers(dt: number) {
    const u = this.user;
    if (!u || !this.userOnField || this.decision || u.stun > 0 || this.approach) return;
    const b = this.ball;
    if (b.owner === u) {
      if (this.userRetrigger >= 0 && this.time >= this.userRetrigger) {
        // keep carrying until something happens: pressure, shooting range or time
        const un = this.n(u.team, u.x, u.y);
        const dGoal = dist(un.x, un.y, HL, 0);
        const pressure = this.nearestOpp(u).d;
        if (pressure < 3.5 || dGoal < 24 || this.time >= this.userRetrigger + 1.6 || Math.abs(un.y) > HW - 4) {
          this.userRetrigger = -1;
          this.openOnBall();
        }
      }
      return;
    }
    this.offBallTimer -= dt;
    this.defendTimer -= dt;
    const c = b.owner;
    if (!c || c.role === 'GK') return;
    if (c.team === u.team && this.offBallTimer <= 0) {
      this.offBallTimer = 1.6;
      const cn = this.n(u.team, c.x, c.y);
      const d = dist(u.x, u.y, c.x, c.y);
      const cap = u.role === 'DEF' ? 2 : 4;
      if (cn.x > -15 && d > 8 && d < 40 && this.counts.offBall < cap && Math.random() < 0.16) {
        this.openOffBall(c);
        this.offBallTimer = 18;
      }
    } else if (c.team !== u.team && this.defendTimer <= 0) {
      this.defendTimer = 1.0;
      const d = dist(u.x, u.y, c.x, c.y);
      const defender = u.role === 'DEF' || u.slot === 5;
      const inOwnHalf = this.n(u.team, c.x, c.y).x < 0;
      const range = defender && inOwnHalf ? 32 : 9;
      if (!this.approach && d < range && this.counts.defend < (defender ? 9 : 4) && Math.random() < (defender ? 0.4 : 0.35)) {
        this.openDefend(c);
        this.defendTimer = defender ? 9 : 14;
      }
    }
  }

  private open(kind: DecisionKind, options: DecisionOption[]) {
    if (!options.length) return;
    const total = kind === 'onBall' || kind === 'aerial' ? 7 : 6;
    this.decision = { kind, options, timeLeft: total, total };
    this.stats.decisions++;
    this.counts[kind === 'aerial' ? 'onBall' : kind]++;
  }

  openOnBall() {
    if (!this.user || !this.userOnField) return;
    this.userRetrigger = -1;
    this.open('onBall', this.buildOnBall());
  }

  openAerial() {
    if (!this.user) return;
    this.open('aerial', this.buildAerial());
  }

  openOffBall(c: Agent) {
    this.frozen = c;
    this.open('offBall', this.buildOffBall(c));
  }

  openDefend(c: Agent) {
    this.frozen = c;
    this.open('defend', this.buildDefend(c));
  }

  private buildOnBall(): DecisionOption[] {
    const u = this.user!;
    const un = this.n(u.team, u.x, u.y);
    const { agent: opp, d: pressure } = this.nearestOpp(u);
    const dGoal = dist(un.x, un.y, HL, 0);
    const P = (k: AttrKey) => this.eff(u, k);
    const opts: DecisionOption[] = [];
    const shots: DecisionOption[] = [];

    if (dGoal < 34 && un.x > 10) {
      if (dGoal >= 22) {
        shots.push({ id: 'shoot_long', chance: this.shotModel(u, 'long').goal, kind: 'goal', attrs: ['shooting'] });
      } else {
        shots.push({ id: 'shoot', chance: this.shotModel(u, 'power').goal, kind: 'goal', attrs: ['shooting'] });
        if (P('composure') >= 56) shots.push({ id: 'shoot_finesse', chance: this.shotModel(u, 'finesse').goal, kind: 'goal', attrs: ['shooting', 'composure'] });
        if (dGoal < 17 && P('composure') >= 66)
          shots.push({ id: 'chip', chance: this.shotModel(u, 'chip').goal, kind: 'goal', attrs: ['composure'], special: true });
      }
    }

    const short = this.bestPass(u, { minD: 5, maxD: 24 });
    if (short) {
      const ch = clamp(0.6 + P('passing') / 270 + Math.min(short.lane, 5) * 0.02 - (pressure < 1.8 ? 0.08 : 0), 0.3, 0.97);
      opts.push({ id: 'pass_short', chance: ch, kind: 'success', attrs: ['passing'], safe: true, data: { target: short.to } });
    }
    const through = this.bestPass(u, { minD: 10, maxD: 38, ahead: 7 });
    if (through && P('vision') >= 42 && through.to !== short?.to) {
      const ch = clamp(0.2 + (P('passing') + P('vision')) / 380 + Math.min(through.lane, 5) * 0.03, 0.1, 0.82);
      opts.push({ id: 'pass_through', chance: ch, kind: 'success', attrs: ['passing', 'vision'], data: { target: through.to } });
    }
    if (un.x > 20 && Math.abs(un.y) > 12) {
      const cr = this.bestPass(u, { minD: 6, maxD: 45, inBox: true });
      if (cr) {
        const ch = clamp(0.3 + P('passing') / 260 + cr.to.attrs.physical / 700, 0.15, 0.8);
        opts.push({ id: 'cross', chance: ch, kind: 'success', attrs: ['passing'], data: { target: cr.to } });
      }
    } else {
      const long = this.bestPass(u, { minD: 28, maxD: 60, ahead: 5 });
      if (long && long.to !== through?.to) {
        const ch = clamp(0.28 + P('passing') / 220 + P('vision') / 900, 0.18, 0.8);
        opts.push({ id: 'pass_long', chance: ch, kind: 'success', attrs: ['passing', 'vision'], data: { target: long.to } });
      }
    }

    if (pressure < 7) {
      const base = 0.3 + (P('dribbling') * 0.7 + P('pace') * 0.3) / 175 - opp.attrs.defending / 380 - (pressure < 1.4 ? 0.05 : 0);
      opts.push({ id: 'dribble', chance: clamp(base, 0.12, 0.86), kind: 'success', attrs: ['dribbling', 'pace'], data: { opp } });
      if (P('dribbling') >= 72)
        opts.push({ id: 'elastico', chance: clamp(base + 0.07, 0.12, 0.9), kind: 'success', attrs: ['dribbling'], special: true, data: { opp } });
      else if (P('dribbling') >= 66 && P('composure') >= 60)
        opts.push({ id: 'chapeu', chance: clamp(base + 0.03, 0.12, 0.88), kind: 'success', attrs: ['dribbling', 'composure'], special: true, data: { opp } });
      if (P('pace') >= 74 && Math.abs(un.y) > 10)
        opts.push({ id: 'sprint', chance: clamp(0.45 + (P('pace') - opp.attrs.pace) / 90, 0.15, 0.88), kind: 'success', attrs: ['pace'], data: { opp } });
      if (pressure < 2.6 && P('physical') >= 56)
        opts.push({ id: 'shield', chance: clamp(0.34 + P('physical') / 240 - opp.attrs.physical / 500, 0.2, 0.85), kind: 'success', attrs: ['physical'], data: { opp } });
    }
    if (pressure >= 4) {
      opts.push({ id: 'carry', chance: clamp(0.72 + P('dribbling') / 400 + (pressure - 4) * 0.02, 0.5, 0.96), kind: 'success', attrs: ['dribbling'], safe: !short });
    }

    let all = dGoal < 22 ? [...shots, ...opts] : [...opts, ...shots];
    // keep at most 6, always keep a safe one
    if (all.length > 6) {
      const safe = all.find((o) => o.safe);
      all = all.slice(0, 6);
      if (safe && !all.includes(safe)) all[5] = safe;
    }
    if (!all.length) all.push({ id: 'carry', chance: 0.8, kind: 'success', attrs: ['dribbling'], safe: true });
    if (!all.some((o) => o.safe)) all[all.length - 1].safe = true;
    return all;
  }

  private buildAerial(): DecisionOption[] {
    const u = this.user!;
    const P = (k: AttrKey) => this.eff(u, k);
    const o: DecisionOption[] = [
      { id: 'header', chance: this.shotModel(u, 'header').goal, kind: 'goal', attrs: ['physical', 'shooting'] },
    ];
    if (P('shooting') >= 55) o.push({ id: 'volley', chance: this.shotModel(u, 'volley').goal, kind: 'goal', attrs: ['shooting'] });
    if (P('shooting') >= 66 && P('dribbling') >= 62 && P('physical') >= 55)
      o.push({ id: 'bicycle', chance: this.shotModel(u, 'bicycle').goal, kind: 'goal', attrs: ['shooting', 'dribbling'], special: true });
    o.push({ id: 'chest', chance: clamp(0.55 + P('dribbling') / 300, 0.4, 0.92), kind: 'success', attrs: ['dribbling'], safe: true });
    return o;
  }

  private buildOffBall(c: Agent): DecisionOption[] {
    const u = this.user!;
    const P = (k: AttrKey) => this.eff(u, k);
    const un = this.n(u.team, u.x, u.y);
    const cn = this.n(u.team, c.x, c.y);
    let lane = 6;
    for (const o of this.agents) if (o.team !== u.team && !o.sentOff) lane = Math.min(lane, segDist(o.x, o.y, c.x, c.y, u.x, u.y));
    const o: DecisionOption[] = [
      { id: 'ask_ball', chance: clamp(0.42 + c.attrs.passing / 320 + lane * 0.04, 0.2, 0.92), kind: 'success', attrs: ['vision'], data: { target: c } },
    ];
    if (u.role !== 'DEF' || un.x > 0) {
      o.push({ id: 'run_behind', chance: clamp(0.18 + P('pace') / 250 + c.attrs.vision / 520, 0.12, 0.78), kind: 'success', attrs: ['pace', 'vision'], data: { target: c } });
    }
    if (cn.x > 12 && Math.abs(cn.y) > 11 && !(un.x > HL - 16 && Math.abs(un.y) < 20)) {
      o.push({ id: 'box_run', chance: clamp(0.3 + P('physical') / 380 + c.attrs.passing / 520, 0.15, 0.8), kind: 'success', attrs: ['physical'], data: { target: c } });
    }
    o.push({ id: 'hold_pos', chance: 1, kind: 'success', attrs: [], safe: true });
    return o;
  }

  private buildDefend(c: Agent): DecisionOption[] {
    const u = this.user!;
    const P = (k: AttrKey) => this.eff(u, k);
    const drib = c.attrs.dribbling;
    const o: DecisionOption[] = [
      { id: 'tackle', chance: clamp(0.27 + P('defending') / 185 - drib / 420, 0.12, 0.86), kind: 'success', attrs: ['defending'], data: { opp: c } },
      { id: 'press', chance: clamp(0.4 + (P('pace') + P('defending')) / 420 - c.attrs.passing / 520, 0.15, 0.85), kind: 'success', attrs: ['pace', 'defending'], data: { opp: c } },
    ];
    if (P('defending') >= 48)
      o.push({ id: 'slide', chance: clamp(0.36 + P('defending') / 220 - drib / 460, 0.15, 0.85), kind: 'success', attrs: ['defending', 'physical'], data: { opp: c } });
    o.push({ id: 'cut_lane', chance: clamp(0.33 + P('vision') / 260, 0.2, 0.8), kind: 'success', attrs: ['vision'], data: { opp: c } });
    o.push({ id: 'hold_pos', chance: 1, kind: 'success', attrs: [], safe: true });
    return o;
  }

  autoChoice(): string {
    const d = this.decision;
    if (!d) return '';
    return (d.options.find((o) => o.safe) ?? d.options[0]).id;
  }

  /** Applies the player's choice. Returns whether it succeeded. */
  resolve(optionId: string): boolean | null {
    const d = this.decision;
    const u = this.user;
    if (!d || !u) {
      this.decision = null;
      return null;
    }
    const opt = d.options.find((o) => o.id === optionId) ?? d.options[0];
    this.decision = null;
    const frozen = this.frozen;
    this.frozen = null;
    if (frozen) frozen.decideCd = rand(0.4, 0.7);
    this.slowmo = 0.9;
    const roll = Math.random();
    const ok = opt.kind === 'goal' ? null : roll < opt.chance;
    const gx = this.attackGoalX(u.team);
    const fwd = Math.sign(gx);

    switch (opt.id) {
      // ---------------- passes
      case 'pass_short':
      case 'pass_through':
      case 'pass_long':
      case 'cross': {
        const t = opt.data!.target!;
        this.stats.passes++;
        const cross = opt.id === 'cross';
        if (ok) {
          this.stats.passesOk++;
          this.ratingAcc += opt.id === 'pass_short' ? 0.015 : 0.08;
          this.pass(u, t, { protect: true, userPass: true, lofted: opt.id === 'pass_long', cross });
          this.push(`res.${opt.id}.ok`, 'good');
        } else {
          const interceptor = this.nearestOpp(t, (u.x + t.x) / 2, (u.y + t.y) / 2).agent;
          this.ratingAcc -= 0.12;
          this.pass(u, t, { interceptor, userPass: true, lofted: opt.id === 'pass_long', cross });
          this.push(`res.${opt.id}.bad`, 'bad');
        }
        return !!ok;
      }
      // ---------------- dribbles
      case 'dribble':
      case 'elastico':
      case 'chapeu':
      case 'sprint': {
        const opp = opt.data!.opp!;
        this.stats.dribbles++;
        if (ok) {
          this.stats.dribblesOk++;
          if (opt.special) this.stats.specials++;
          this.ratingAcc += opt.special ? 0.18 : 0.07;
          opp.stun = 1.7;
          this.userProtect = 1.4;
          const ty = opt.id === 'sprint' ? u.y : clamp(u.y + (u.y > opp.y ? 2 : -2), -HW + 2, HW - 2);
          u.runTo = { x: u.x + fwd * 8, y: ty, t: 1.2 };
          this.userRetrigger = this.time + 1.05;
          this.push(`res.${opt.id}.ok`, 'good');
        } else {
          this.ratingAcc -= 0.1;
          u.stun = 0.9;
          this.giveBall(opp);
          this.push(`res.${opt.id}.bad`, 'bad');
        }
        return !!ok;
      }
      case 'carry': {
        if (ok) {
          this.userProtect = 1.2;
          u.runTo = { x: u.x + fwd * 8, y: u.y * 0.85, t: 1.3 };
          this.userRetrigger = this.time + 1.25;
          this.ratingAcc += 0.02;
        } else {
          const opp = this.nearestOpp(u).agent;
          u.stun = 0.8;
          this.giveBall(opp);
          this.ratingAcc -= 0.08;
          this.push('res.carry.bad', 'bad');
        }
        return !!ok;
      }
      case 'shield': {
        if (ok) {
          this.ratingAcc += 0.08;
          if (Math.random() < 0.5) {
            this.push('res.shield.foul', 'good');
            this.restart('freekick', u.team, u.x, u.y);
            // make sure the user takes it
            const b = this.ball;
            if (b.owner && b.owner !== u) {
              b.owner.x -= fwd * 2;
              u.x = b.x;
              u.y = b.y;
              this.giveBall(u, true);
            }
            u.decideCd = 99;
          } else {
            this.push('res.shield.ok', 'good');
            this.userProtect = 1;
            this.userRetrigger = this.time + 0.8;
          }
        } else {
          const opp = opt.data!.opp!;
          u.stun = 0.8;
          this.giveBall(opp);
          this.ratingAcc -= 0.1;
          this.push('res.shield.bad', 'bad');
        }
        return !!ok;
      }
      // ---------------- shots
      case 'shoot':
      case 'shoot_finesse':
      case 'shoot_long':
      case 'chip':
      case 'header':
      case 'volley':
      case 'bicycle': {
        const kind = { shoot: 'power', shoot_finesse: 'finesse', shoot_long: 'long', chip: 'chip', header: 'header', volley: 'volley', bicycle: 'bicycle' }[opt.id]!;
        this.stats.shots++;
        const out = this.shoot(u, kind);
        if (out !== 'miss') this.stats.shotsOn++;
        if (opt.special && out === 'goal') this.stats.specials += 2;
        this.ratingAcc += out === 'save' ? 0.04 : out === 'miss' ? -0.1 : 0;
        this.push(`res.shot.${out}`, out === 'goal' ? 'goal' : out === 'save' ? 'info' : 'bad');
        this.slowmo = 1.6;
        return out === 'goal';
      }
      case 'chest': {
        if (ok) {
          this.userProtect = 0.8;
          this.userRetrigger = this.time + 0.45;
          this.push('res.chest.ok', 'good');
        } else {
          const ang = rand(0, Math.PI * 2);
          this.kick(u, u.x + Math.cos(ang) * 3, u.y + Math.sin(ang) * 3, 4, 1);
          this.push('res.chest.bad', 'bad');
          this.ratingAcc -= 0.06;
        }
        return !!ok;
      }
      // ---------------- off the ball
      case 'ask_ball': {
        const c = opt.data!.target!;
        if (this.ball.owner !== c) return null;
        if (ok) {
          this.later(0.25, () => this.ball.owner === c && this.pass(c, u, { protect: true }));
          this.push('res.ask_ball.ok', 'good');
        } else {
          if (Math.random() < 0.5) {
            const interceptor = this.nearestOpp(u, (u.x + c.x) / 2, (u.y + c.y) / 2).agent;
            this.later(0.25, () => this.ball.owner === c && this.pass(c, u, { interceptor }));
          }
          this.push('res.ask_ball.bad', 'bad');
        }
        return !!ok;
      }
      case 'run_behind': {
        const c = opt.data!.target!;
        const line = this.oppLine(u.team);
        const un = this.n(u.team, u.x, u.y);
        const tgtN = { x: clamp(Math.max(line, un.x) + 9, -20, HL - 8), y: clamp(un.y * 0.6, -18, 18) };
        const tw = this.n(u.team, tgtN.x, tgtN.y);
        if (ok) {
          u.runTo = { x: tw.x, y: tw.y, t: 2.2 };
          this.userProtect = 2;
          this.later(0.55, () => {
            if (this.ball.owner !== c) return;
            this.pass(c, u, { protect: true, lead: { x: tw.x, y: tw.y } });
          });
          this.ratingAcc += 0.08;
          this.push('res.run_behind.ok', 'good');
        } else if (Math.random() < 0.55) {
          this.ratingAcc -= 0.06;
          this.push('res.run_behind.offside', 'bad');
          this.restart('freekick', u.team === 0 ? 1 : 0, u.x, u.y);
        } else {
          u.runTo = { x: tw.x, y: tw.y, t: 1.5 };
          this.push('res.run_behind.bad', 'info');
        }
        return !!ok;
      }
      case 'box_run': {
        const c = opt.data!.target!;
        const bw = this.n(u.team, HL - 9, rand(-4, 4));
        u.runTo = { x: bw.x, y: bw.y, t: 2.4 };
        if (ok) {
          this.userProtect = 2;
          this.later(0.75, () => {
            if (this.ball.owner !== c) return;
            this.pass(c, u, { protect: true, cross: true, lead: { x: bw.x, y: bw.y } });
          });
          this.push('res.box_run.ok', 'good');
        } else {
          this.later(0.75, () => {
            if (this.ball.owner !== c) return;
            const interceptor = this.nearestOpp(u).agent;
            this.pass(c, u, { interceptor, cross: true, lead: { x: bw.x, y: bw.y } });
          });
          this.push('res.box_run.bad', 'bad');
        }
        return !!ok;
      }
      case 'hold_pos':
        return true;
      // ---------------- defending
      case 'tackle':
      case 'slide':
      case 'press': {
        const c = opt.data!.opp!;
        if (this.ball.owner !== c) return null;
        if (opt.id !== 'press') this.stats.tackles++;
        if (dist(u.x, u.y, c.x, c.y) > 2.2) {
          // sprint to the carrier first, the outcome happens on contact
          this.approach = { kind: opt.id, c, ok: !!ok, until: this.time + 1.8 };
          this.frozen = c;
          c.decideCd = 2;
          this.userProtect = 0;
        } else this.applyDefend(opt.id, c, !!ok);
        return !!ok;
      }
      case 'cut_lane': {
        const c = opt.data!.opp!;
        if (this.ball.owner !== c) return null;
        if (ok) {
          const t = this.bestPass(c);
          if (t) {
            this.later(0.35, () => {
              if (this.ball.owner !== c || !this.user) return;
              this.pass(c, t.to, { interceptor: this.user });
              this.ratingAcc += 0.12;
            });
          }
          this.push('res.cut_lane.ok', 'good');
        } else this.push('res.cut_lane.bad', 'info');
        return !!ok;
      }
    }
    return null;
  }

  approach: { kind: string; c: Agent; ok: boolean; until: number } | null = null;

  private updateApproach() {
    const ap = this.approach;
    const u = this.user;
    if (!ap) return;
    if (!u || this.ball.owner !== ap.c || this.phase !== 'play') {
      this.approach = null;
      if (this.frozen === ap.c) this.frozen = null;
      return;
    }
    u.runTo = { x: ap.c.x - Math.cos(ap.c.dir) * 0.6, y: ap.c.y - Math.sin(ap.c.dir) * 0.6, t: 0.3 };
    ap.c.vx *= 0.97;
    ap.c.vy *= 0.97;
    const d = dist(u.x, u.y, ap.c.x, ap.c.y);
    if (d < 1.8 || this.time > ap.until) {
      this.approach = null;
      if (this.frozen === ap.c) this.frozen = null;
      ap.c.decideCd = rand(0.3, 0.6);
      u.runTo = null;
      this.applyDefend(ap.kind, ap.c, d < 1.8 ? ap.ok : false);
    }
  }

  private applyDefend(kind: string, c: Agent, ok: boolean) {
    const u = this.user!;
    const fwd = Math.sign(this.attackGoalX(u.team));
    if (kind === 'press') {
      if (ok) {
        this.ratingAcc += 0.1;
        const mates = this.teamOf(u.team).filter((a) => a !== u && a.role !== 'GK');
        mates.sort((p, q) => dist(p.x, p.y, c.x, c.y) - dist(q.x, q.y, c.x, c.y));
        const m = mates[0];
        this.pass(c, m, {});
        this.ball.pass!.to = m;
        this.ball.pass!.protect = true;
        c.stun = 0.6;
        this.push('res.press.ok', 'good');
      } else {
        c.runTo = { x: c.x + Math.sign(this.attackGoalX(c.team)) * 5, y: c.y + rand(-3, 3), t: 0.8 };
        u.stun = 0.5;
        this.push('res.press.bad', 'info');
      }
      return;
    }
    if (ok) {
      this.stats.tacklesOk++;
      this.ratingAcc += kind === 'slide' ? 0.16 : 0.12;
      c.stun = 1.1;
      this.push(`res.${kind}.ok`, 'good');
      if (kind === 'slide' && Math.random() < 0.5) {
        const mate = this.bestPass(u, { minD: 3, maxD: 25 });
        this.kick(u, mate ? mate.to.x : u.x + fwd * 6, mate ? mate.to.y : u.y, 10, 0.3);
        u.stun = 0.8;
      } else this.giveBall(u);
      return;
    }
    u.stun = kind === 'slide' ? 1.8 : 1.1;
    this.ratingAcc -= 0.1;
    const foulP = kind === 'slide' ? 0.42 : 0.2;
    if (Math.random() < foulP) {
      const r = Math.random();
      if (kind === 'slide' && r < 0.06) {
        this.stats.red++;
        this.ratingAcc -= 1.5;
        this.removeUser('feed.red');
        this.restart('freekick', c.team, c.x, c.y);
        return;
      }
      if (r < (kind === 'slide' ? 0.5 : 0.3)) {
        this.stats.yellow++;
        this.ratingAcc -= 0.3;
        if (this.stats.yellow >= 2) {
          this.stats.red++;
          this.ratingAcc -= 1;
          this.removeUser('feed.red');
          this.restart('freekick', c.team, c.x, c.y);
          return;
        }
        this.push('feed.yellow', 'bad');
      } else this.push('res.foul', 'bad');
      this.restart('freekick', c.team, c.x, c.y);
    } else {
      this.push(`res.${kind}.bad`, 'bad');
      c.runTo = { x: c.x + Math.sign(this.attackGoalX(c.team)) * 6, y: c.y, t: 0.9 };
    }
  }

  // ------------------------------------------------------------------ report
  finalRating() {
    const s = this.stats;
    const played = this.userOut - this.userIn;
    const mine = this.score[this.userTeam];
    const theirs = this.score[this.userTeam === 0 ? 1 : 0];
    const res = mine > theirs ? 0.3 : mine < theirs ? -0.3 : 0;
    const w = clamp(played / 60, 0.3, 1);
    return clamp(Math.round((6.1 + (this.ratingAcc + res) * (0.55 + 0.35 * w)) * 10) / 10, 3, 10);
  }

  report(): MatchReport {
    const played = this.setup.user && (this.userOnField || this.userOut < 90 || this.userIn < 90) && !this.benchUser;
    const minutes = Math.max(0, this.userOut - this.userIn);
    const user = played ? { ...this.stats, minutes, rating: this.finalRating() } : null;
    return {
      homeId: this.setup.homeId,
      awayId: this.setup.awayId,
      hg: this.score[0],
      ag: this.score[1],
      userTeam: this.userTeam,
      user,
      injuredWeeks: this.injuredWeeks,
      goals: this.goals,
      energyUsed: Math.round(minutes * 0.32),
    };
  }
}
