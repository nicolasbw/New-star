export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

export function fmtNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}
