import type { Club } from '../core/types';
import { pick, randi } from '../core/util';

// All clubs are fictional.
const CLUB_SEED: Array<[string, string, string, string, number]> = [
  ['Atlético Vale Verde', 'AVV', '#1f8a4c', '#f4f4f4', 80],
  ['Porto Real FC', 'PRF', '#1d3f9e', '#ffd23f', 78],
  ['Estrela do Norte', 'EDN', '#c21d2f', '#ffffff', 75],
  ['Sociedade Aurora', 'SAU', '#f28c28', '#1b1b1b', 72],
  ['União Serrana', 'USE', '#5b2a86', '#f4f4f4', 70],
  ['Ferroviário Central', 'FEC', '#222222', '#e8c547', 67],
  ['Clube Náutico Marés', 'CNM', '#0e8ea8', '#ffffff', 65],
  ['Real Bandeirantes', 'RBA', '#ffffff', '#b3122e', 63],
  ['Grêmio Litoral', 'GLI', '#2f6fd6', '#111111', 60],
  ['Independente da Serra', 'IDS', '#7a1f1f', '#e9e1c9', 58],
];

export function createClubs(): Club[] {
  return CLUB_SEED.map(([name, short, primary, secondary, strength], i) => {
    const s = strength + randi(-2, 2);
    return {
      id: `c${i}`,
      name,
      short,
      primary,
      secondary,
      strength: s,
      youthStrength: Math.round(s * 0.62 + randi(-3, 3)),
    };
  });
}

export const FIRST_NAMES = [
  'Lucas', 'Gabriel', 'Rafael', 'Mateus', 'Pedro', 'Thiago', 'Bruno', 'Diego', 'Caio', 'Vitor',
  'Leo', 'Davi', 'Igor', 'Hugo', 'Enzo', 'Rodrigo', 'Felipe', 'André', 'Marcos', 'Samuel',
  'Juan', 'Mario', 'Luis', 'Tomás', 'Nico', 'Iker', 'Kevin', 'Ryan', 'Noah', 'Adrien',
  'Kofi', 'Yuri', 'Emil', 'Joel', 'Ivan', 'Omar', 'Sergio', 'Dani', 'Alex', 'Martín',
];

export const LAST_NAMES = [
  'Silva', 'Souza', 'Costa', 'Pereira', 'Almeida', 'Ramos', 'Teixeira', 'Moreira', 'Barbosa', 'Rocha',
  'Fernandes', 'Duarte', 'Cardoso', 'Nogueira', 'Freitas', 'Mendes', 'Pires', 'Lopes', 'Martins', 'Vieira',
  'Herrera', 'Castro', 'Navarro', 'Ortega', 'Varela', 'Molina', 'Rojas', 'Vidal', 'Acosta', 'Quiroga',
  'Mensah', 'Novak', 'Larsen', 'Keller', 'Dumont', 'Moretti', 'Kovač', 'Okafor', 'Brandt', 'Sato',
];

export const NATIONALITIES = ['BR', 'PT', 'AR', 'ES', 'UY', 'CO', 'MX', 'US', 'FR', 'IT', 'AO', 'MZ'];

export const randomPlayerName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
export const randomSurname = () => pick(LAST_NAMES);

export const BRANDS = ['Volta', 'Kinetik', 'Pulsar', 'Rugido', 'Nimbus', 'Fênix Sports', 'Atlas Wear', 'Zênite'];

export interface Asset {
  id: string;
  price: number;
  morale: number; // one-time morale boost
  weeklyMorale: number;
  fame: number;
  icon: string;
}

export const ASSETS: Asset[] = [
  { id: 'console', price: 1_500, morale: 6, weeklyMorale: 0.5, fame: 0, icon: '🎮' },
  { id: 'scooter', price: 9_000, morale: 6, weeklyMorale: 0.5, fame: 1, icon: '🛵' },
  { id: 'car', price: 40_000, morale: 8, weeklyMorale: 0.5, fame: 1, icon: '🚗' },
  { id: 'apartment', price: 300_000, morale: 12, weeklyMorale: 1, fame: 2, icon: '🏢' },
  { id: 'sportscar', price: 450_000, morale: 10, weeklyMorale: 0.5, fame: 4, icon: '🏎️' },
  { id: 'house', price: 1_200_000, morale: 14, weeklyMorale: 1, fame: 3, icon: '🏡' },
  { id: 'mansion', price: 4_000_000, morale: 16, weeklyMorale: 1.5, fame: 6, icon: '🏰' },
  { id: 'yacht', price: 9_000_000, morale: 14, weeklyMorale: 1, fame: 9, icon: '🛥️' },
];
