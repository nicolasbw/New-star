import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
(globalThis as any).localStorage = { getItem: () => 'pt', setItem() {} };
const { allKeys } = await import('../src/core/i18n');
const { EVENTS } = await import('../src/career/events');
const { ACTIVITIES } = await import('../src/career/career');
const { ASSETS } = await import('../src/career/data');
const k = allKeys();
const pt = new Set(k.pt), en = new Set(k.en);
const missing: string[] = [];
const need = (key: string) => { if (!pt.has(key)) missing.push('pt:' + key); if (!en.has(key)) missing.push('en:' + key); };
for (const key of pt) if (!en.has(key)) missing.push('en-only-missing:' + key);
for (const e of EVENTS) { need(`ev.${e.id}.title`); need(`ev.${e.id}.text`); for (const c of e.choices) need(`ev.${e.id}.${c.id}`); }
for (const a of ACTIVITIES) { need(`act.${a.id}`); need(`actd.${a.id}`); }
for (const a of ASSETS) need(`asset.${a.id}`);
// scan source for literal keys
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk('src')) {
  if (f.endsWith('i18n.ts')) continue;
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/['`]((?:feed|res|news|opt|dec|sel|hub|match|report|life|player|league|comp|create|menu|common|nav|stat|attr|pos|posd|award|app)\.[a-z_A-Z.]+)['`]/g)) need(m[1]);
}
console.log(missing.length ? missing : 'all keys present');
