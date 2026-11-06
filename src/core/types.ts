export type Lang = 'pt' | 'en';
export type Position = 'ST' | 'WG' | 'CAM' | 'CM' | 'CDM' | 'FB' | 'CB';
export type AttrKey =
  | 'pace'
  | 'shooting'
  | 'passing'
  | 'dribbling'
  | 'defending'
  | 'physical'
  | 'vision'
  | 'composure';
export type Attrs = Record<AttrKey, number>;
export type Squad = 'youth' | 'pro';

export const ATTR_KEYS: AttrKey[] = [
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'physical',
  'vision',
  'composure',
];
export const POSITIONS: Position[] = ['ST', 'WG', 'CAM', 'CM', 'CDM', 'FB', 'CB'];

export interface Club {
  id: string;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  strength: number; // professional squad
  youthStrength: number; // youth squad
}

export interface Fixture {
  round: number;
  home: string;
  away: string;
  hg?: number;
  ag?: number;
}

export interface TableRow {
  clubId: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface Stats {
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number;
  motm: number;
}

export interface SeasonHistory {
  season: number;
  age: number;
  clubId: string;
  squad: Squad;
  apps: number;
  goals: number;
  assists: number;
  avg: number;
  position: number; // final league position of the club
}

export interface Sponsor {
  brand: string;
  weekly: number;
}

export interface Player {
  name: string;
  nationality: string;
  age: number;
  position: Position;
  attrs: Attrs;
  potential: number;
  energy: number;
  morale: number;
  fame: number;
  followers: number;
  money: number;
  coach: number;
  team: number;
  injuryWeeks: number;
  suspendedWeeks: number;
  yellowCards: number;
  squad: Squad;
  clubId: string;
  salary: number;
  contractYears: number;
  agent: boolean;
  captain: boolean;
  sponsor: Sponsor | null;
  assets: string[];
  season: Stats;
  career: Stats;
  history: SeasonHistory[];
  trophies: string[];
}

export interface NewsItem {
  season: number;
  week: number;
  k: string;
  p?: Record<string, string | number>;
  good?: boolean;
}

export interface Career {
  version: 1;
  player: Player;
  clubs: Club[];
  season: number;
  week: number; // index of current round (0-based)
  fixtures: { youth: Fixture[]; pro: Fixture[] };
  news: NewsItem[];
  actionsLeft: number;
  actionsDone: string[];
  pendingEvent: string | null;
  eventData?: Record<string, string | number>;
  eventSeen: Record<string, number>;
  flags: Record<string, boolean | number>;
  retired: boolean;
}

export type Selection = 'starter' | 'bench' | 'out' | 'injured' | 'suspended';

export interface MatchUserStats {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  passes: number;
  passesOk: number;
  dribbles: number;
  dribblesOk: number;
  tackles: number;
  tacklesOk: number;
  yellow: number;
  red: number;
  rating: number;
  decisions: number;
  specials: number;
}

export interface MatchGoal {
  minute: number;
  team: 0 | 1;
  name: string;
  user: boolean;
}

export interface MatchReport {
  homeId: string;
  awayId: string;
  hg: number;
  ag: number;
  userTeam: 0 | 1;
  user: MatchUserStats | null; // null when the player didn't take part
  injuredWeeks: number;
  goals: MatchGoal[];
  energyUsed: number;
}

/** A visible change produced by an action/event (shown as chips in the UI). */
export interface Delta {
  key: string; // i18n key of the label
  v: number;
  money?: boolean;
}
