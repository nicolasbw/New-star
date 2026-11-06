import {
  ACTIVITIES,
  avgRating,
  buyAsset,
  club,
  createClubs,
  deleteSave,
  doActivity,
  finishWeek,
  loadCareer,
  myClub,
  newCareer,
  nextFixture,
  rounds,
  saveCareer,
  selection,
  table,
  youthOffers,
} from '../career/career';
import { ASSETS, NATIONALITIES, randomPlayerName } from '../career/data';
import { EVENTS, resolveEvent } from '../career/events';
import { simulateScore, strengthOf } from '../career/league';
import { overall } from '../career/player';
import { getLang, setLang, t } from '../core/i18n';
import type { Career, Club, Delta, MatchReport, Position, Selection } from '../core/types';
import { ATTR_KEYS, POSITIONS } from '../core/types';
import { esc, fmtMoney, fmtNum } from '../core/util';
import type { MatchSetup } from '../match/engine';
import { runMatch } from './match';

type Tab = 'week' | 'player' | 'league' | 'life' | 'news';

const FLAGS: Record<string, string> = {
  BR: '🇧🇷', PT: '🇵🇹', AR: '🇦🇷', ES: '🇪🇸', UY: '🇺🇾', CO: '🇨🇴', MX: '🇲🇽', US: '🇺🇸', FR: '🇫🇷', IT: '🇮🇹', AO: '🇦🇴', MZ: '🇲🇿',
};
const POS_NUM: Record<Position, number> = { ST: 9, WG: 7, CAM: 10, CM: 8, CDM: 5, FB: 2, CB: 4 };

function badge(c: Club, size = 'md') {
  return `<span class="badge ${size}" style="--c:${c.primary};--c2:${c.secondary}">${esc(c.short)}</span>`;
}

function deltaChips(ds: Delta[]) {
  // merge duplicates
  const m = new Map<string, Delta>();
  for (const d of ds) {
    const k = d.key;
    const prev = m.get(k);
    if (prev) prev.v += d.v;
    else m.set(k, { ...d });
  }
  return [...m.values()]
    .filter((d) => Math.abs(d.v) >= 0.05)
    .map((d) => {
      const good = d.v > 0;
      const isAttr = d.key.startsWith('attr.');
      const val = d.money ? fmtMoney(Math.abs(d.v)) : d.key === 'stat.followers' ? fmtNum(Math.abs(d.v)) : isAttr ? Math.abs(d.v).toFixed(2) : Math.abs(d.v).toFixed(Math.abs(d.v) < 1 ? 1 : 0);
      return `<span class="chip ${good ? 'up' : 'down'}">${good ? '+' : '−'}${val} ${t(d.key)}</span>`;
    })
    .join('');
}

const fmtParams = (p?: Record<string, string | number>) => {
  if (!p) return p;
  const o: Record<string, string | number> = { ...p };
  for (const k of ['amount', 'weekly']) if (typeof o[k] === 'number') o[k] = fmtMoney(o[k] as number);
  return o;
};

export class App {
  career: Career | null = loadCareer();
  tab: Tab = 'week';
  private createState = { name: '', nat: 'BR', pos: 'ST' as Position, clubId: '', clubs: [] as Club[] };

  constructor(private root: HTMLElement) {
    setLang(getLang());
    root.addEventListener('click', (e) => this.onClick(e));
    this.menu();
  }

  // ------------------------------------------------------------------ routing
  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el || el.hasAttribute('disabled')) return;
    const a = el.dataset.a!;
    const v = el.dataset.v ?? '';
    const c = this.career;
    switch (a) {
      case 'lang':
        setLang(v as 'pt' | 'en');
        this.rerender();
        break;
      case 'new':
        if (this.career && !this.career.retired) {
          this.modal(`<p>${t('menu.overwrite')}</p><button class="btn primary" data-a="new-confirm">${t('common.continue')}</button><button class="btn ghost" data-a="close">${t('common.cancel')}</button>`);
          return;
        }
        this.create();
        break;
      case 'new-confirm':
        this.closeModal();
        this.create();
        break;
      case 'continue':
        this.hub();
        break;
      case 'menu':
        this.menu();
        break;
      case 'how':
        this.modal(`<h3>${t('menu.how')}</h3><p>${t('menu.how.text')}</p><button class="btn primary" data-a="close">${t('common.ok')}</button>`);
        break;
      case 'close':
        this.closeModal();
        break;
      case 'c-pos':
        this.createState.pos = v as Position;
        this.create();
        break;
      case 'c-nat':
        this.createState.nat = v;
        this.create();
        break;
      case 'c-club':
        this.createState.clubId = v;
        this.create();
        break;
      case 'c-random': {
        this.createState.name = randomPlayerName();
        const inp = this.root.querySelector<HTMLInputElement>('#c-name');
        if (inp) inp.value = this.createState.name;
        break;
      }
      case 'c-start': {
        const s = this.createState;
        const name = (this.root.querySelector<HTMLInputElement>('#c-name')?.value || s.name || randomPlayerName()).trim().slice(0, 28);
        deleteSave();
        this.career = newCareer(name, s.nat, s.pos, s.clubId, s.clubs);
        this.career.pendingEvent = null;
        s.clubs = [];
        saveCareer(this.career);
        this.tab = 'week';
        this.hub();
        break;
      }
      case 'tab':
        this.tab = v as Tab;
        this.hub();
        break;
      case 'act': {
        if (!c) return;
        const res = doActivity(c, v);
        if (res) this.toast(`${ACTIVITIES.find((x) => x.id === v)!.icon} ${t(`act.${v}`)}`, res);
        this.hub();
        break;
      }
      case 'buy': {
        if (!c) return;
        const res = buyAsset(c, v);
        if (res) this.toast(`${ASSETS.find((x) => x.id === v)!.icon} ${t(`asset.${v}`)}`, res);
        this.hub();
        break;
      }
      case 'ev': {
        if (!c) return;
        const r = resolveEvent(c, v);
        if (r) {
          this.modal(`<div class="ev-result"><p>${t(r.resultKey, fmtParams(c.eventData))}</p><div class="chips">${deltaChips(r.deltas)}</div>
            <button class="btn primary" data-a="close-ev">${t('common.continue')}</button></div>`);
        }
        break;
      }
      case 'close-ev':
        this.closeModal();
        this.hub();
        break;
      case 'go':
        this.prematch();
        break;
      case 'play':
        this.play(v === 'bench');
        break;
      case 'sim':
        this.closeModal();
        this.simulateOwn();
        break;
      case 'report-done':
        this.hub();
        break;
    }
  }

  private rerender() {
    if (!this.career || this.root.querySelector('.menu')) this.menu();
    else if (this.root.querySelector('.create')) this.create();
    else this.hub();
  }

  // ------------------------------------------------------------------ screens
  menu() {
    const c = this.career;
    this.root.innerHTML = `
    <div class="screen menu">
      <div class="menu-bg"></div>
      <div class="menu-card">
        <div class="logo"><span class="star">★</span> NEW STAR</div>
        <p class="tag">${t('app.tagline')}</p>
        ${c && !c.retired ? `<button class="btn primary big" data-a="continue">${t('menu.continue')}<small>${esc(c.player.name)} · ${t('common.years', { n: c.player.age })} · ${esc(myClub(c).name)}</small></button>` : ''}
        <button class="btn ${c && !c.retired ? '' : 'primary'} big" data-a="new">${t('menu.new')}</button>
        <button class="btn ghost" data-a="how">${t('menu.how')}</button>
        <div class="lang">
          <button class="btn small ${getLang() === 'pt' ? 'on' : ''}" data-a="lang" data-v="pt">🇧🇷 Português</button>
          <button class="btn small ${getLang() === 'en' ? 'on' : ''}" data-a="lang" data-v="en">🇬🇧 English</button>
        </div>
      </div>
    </div>`;
  }

  create() {
    const s = this.createState;
    if (!s.clubs.length) {
      s.clubs = createClubs();
      s.clubId = youthOffers(s.clubs)[0].id;
    }
    const nameVal = this.root.querySelector<HTMLInputElement>('#c-name')?.value ?? s.name;
    s.name = nameVal;
    const offers = youthOffers(s.clubs);
    this.root.innerHTML = `
    <div class="screen create">
      <header class="bar"><button class="btn ghost small" data-a="menu">← ${t('common.back')}</button><h2>${t('create.title')}</h2><span></span></header>
      <div class="create-body">
        <label class="field"><span>${t('create.name')}</span>
          <div class="row"><input id="c-name" maxlength="28" placeholder="${t('create.name_ph')}" value="${esc(s.name)}"/><button class="btn small" data-a="c-random">🎲 ${t('create.random')}</button></div>
        </label>
        <div class="field"><span>${t('create.nat')}</span>
          <div class="nat-grid">${NATIONALITIES.map((n) => `<button class="nat ${s.nat === n ? 'on' : ''}" data-a="c-nat" data-v="${n}">${FLAGS[n] ?? n}</button>`).join('')}</div>
        </div>
        <div class="field"><span>${t('create.pos')}</span>
          <div class="pos-grid">${POSITIONS.map(
            (p) => `<button class="pos-card ${s.pos === p ? 'on' : ''}" data-a="c-pos" data-v="${p}"><b>${t(`pos.${p}`)}</b><small>${t(`posd.${p}`)}</small></button>`,
          ).join('')}</div>
        </div>
        <div class="field"><span>${t('create.club')}</span><small class="hint">${t('create.club_hint')}</small>
          <div class="club-grid">${offers
            .map(
              (c) => `<button class="club-card ${s.clubId === c.id ? 'on' : ''}" data-a="c-club" data-v="${c.id}">${badge(c, 'lg')}<b>${esc(c.name)}</b><small>${t('create.level')}: ${'★'.repeat(Math.max(1, Math.round((c.strength - 50) / 7)))}</small></button>`,
            )
            .join('')}</div>
        </div>
        <button class="btn primary big" data-a="c-start">${t('create.start')} →</button>
      </div>
    </div>`;
  }

  hub() {
    const c = this.career;
    if (!c) return this.menu();
    const p = c.player;
    const cl = myClub(c);
    const ovr = overall(p);
    const tabs: Tab[] = ['week', 'player', 'league', 'life', 'news'];
    const icons: Record<Tab, string> = { week: '📅', player: '👤', league: '🏆', life: '🏠', news: '📰' };
    let body = '';
    if (this.tab === 'week') body = this.weekTab();
    else if (this.tab === 'player') body = this.playerTab();
    else if (this.tab === 'league') body = this.leagueTab();
    else if (this.tab === 'life') body = this.lifeTab();
    else body = this.newsTab();
    this.root.innerHTML = `
    <div class="screen hub">
      <header class="hub-head">
        <button class="logo-sm" data-a="menu">★</button>
        <div class="who">
          ${badge(cl)}
          <div><b>${esc(p.name)}</b><small>${t(`pos.${p.position}`)} · ${t('common.years', { n: p.age })} · ${t(`hub.squad.${p.squad}`)}</small></div>
        </div>
        <div class="ovr"><b>${ovr}</b><small>${t('hub.ovr')}</small></div>
      </header>
      <div class="meters">
        ${this.meter('stat.energy', p.energy, 'energy')}
        ${this.meter('stat.morale', p.morale, 'morale')}
        <div class="money">💰 ${fmtMoney(p.money)}</div>
      </div>
      <main class="hub-body">${body}</main>
      <nav class="tabs">${tabs
        .map((tb) => `<button class="${this.tab === tb ? 'on' : ''}" data-a="tab" data-v="${tb}"><span>${icons[tb]}</span>${t(`nav.${tb}`)}</button>`)
        .join('')}</nav>
    </div>`;
    if (c.pendingEvent && this.tab === 'week' && !c.retired) this.showEvent();
  }

  private meter(key: string, v: number, cls: string) {
    return `<div class="meter ${cls}"><span>${t(key)}</span><i><b style="width:${Math.max(0, Math.min(100, v))}%"></b></i><em>${Math.round(v)}</em></div>`;
  }

  private weekTab() {
    const c = this.career!;
    const p = c.player;
    if (c.retired) {
      return `<section class="card center"><h3>🏁 ${t('hub.retired')}</h3>${this.careerSummary()}<button class="btn primary" data-a="new">${t('menu.new')}</button></section>`;
    }
    const fx = nextFixture(c);
    let fxHtml = '';
    if (fx) {
      const home = club(c, fx.home);
      const away = club(c, fx.away);
      const isHome = fx.home === p.clubId;
      fxHtml = `<section class="card fixture">
        <div class="fx-label">${t('hub.next')} · ${t(p.squad === 'pro' ? 'comp.pro' : 'comp.youth')} · ${t(isHome ? 'hub.home' : 'hub.away')}</div>
        <div class="fx-teams">
          <div>${badge(home, 'lg')}<b>${esc(home.name)}</b></div>
          <span class="vs">VS</span>
          <div>${badge(away, 'lg')}<b>${esc(away.name)}</b></div>
        </div>
        ${p.injuryWeeks > 0 ? `<div class="warn">🩹 ${t('hub.injured_weeks', { w: p.injuryWeeks })}</div>` : ''}
        ${p.suspendedWeeks > 0 ? `<div class="warn">🟥 ${t('hub.suspended_weeks', { w: p.suspendedWeeks })}</div>` : ''}
        <button class="btn primary big" data-a="go">⚽ ${t('hub.go')}</button>
      </section>`;
    }
    const acts = ACTIVITIES.filter((a) => !a.available || a.available(c))
      .map((a) => {
        const cost = a.cost?.(c) ?? 0;
        const disabled = c.actionsLeft <= 0 || cost > p.money;
        return `<button class="act" data-a="act" data-v="${a.id}" ${disabled ? 'disabled' : ''}>
          <span class="act-icon">${a.icon}</span>
          <span class="act-main"><b>${t(`act.${a.id}`)}</b><small>${t(`actd.${a.id}`)}</small></span>
          <span class="act-meta"><em class="${a.energy > 0 ? 'up' : 'down'}">⚡${a.energy > 0 ? '+' : ''}${a.energy}</em>${cost ? `<em>${fmtMoney(cost)}</em>` : ''}</span>
        </button>`;
      })
      .join('');
    return `
      <div class="season-line">${t('hub.season', { s: c.season, w: Math.min(c.week + 1, rounds(c)), n: rounds(c) })}</div>
      ${fxHtml}
      <section class="card">
        <div class="card-head"><h3>${t('hub.actions')}</h3><span class="badge-count">${c.actionsLeft > 0 ? t('hub.actions_left', { n: c.actionsLeft }) : '✔'}</span></div>
        ${c.actionsLeft <= 0 ? `<p class="muted">${t('hub.actions_done')}</p>` : ''}
        <div class="acts">${acts}</div>
      </section>`;
  }

  private playerTab() {
    const p = this.career!.player;
    const bars = ATTR_KEYS.map((k) => {
      const v = Math.floor(p.attrs[k]);
      const frac = p.attrs[k] - v;
      return `<div class="attr"><span>${t(`attr.${k}`)}</span><i><b style="width:${v}%" class="${v >= 75 ? 'hi' : v >= 55 ? 'mid' : 'lo'}"></b><u style="left:${v}%;width:${frac}%"></u></i><em>${v}</em></div>`;
    }).join('');
    const stars = Math.round((p.potential - 60) / 8);
    const s = p.season;
    const k = p.career;
    const statRow = (label: string, st: typeof s) =>
      `<tr><td>${label}</td><td>${st.apps}</td><td>${st.goals}</td><td>${st.assists}</td><td>${st.apps ? (st.ratingSum / st.apps).toFixed(2) : '-'}</td><td>${st.motm}</td></tr>`;
    const hist = p.history
      .slice()
      .reverse()
      .map((h) => {
        const cl = club(this.career!, h.clubId);
        return `<tr><td>${h.season}</td><td>${h.age}</td><td>${badge(cl, 'sm')} ${t(`hub.squad.${h.squad}`)}</td><td>${h.apps}</td><td>${h.goals}</td><td>${h.assists}</td><td>${h.avg ? h.avg.toFixed(2) : '-'}</td><td>${h.position}º</td></tr>`;
      })
      .join('');
    const trophies = p.trophies.map((tr) => {
      const [key, season] = tr.split('|');
      return `<li>🏆 ${t(key)} <small>T${season}</small></li>`;
    });
    return `
      <section class="card">
        <div class="card-head"><h3>${t('player.attrs')}</h3><span class="pot">${t('hub.potential')}: ${'★'.repeat(Math.max(1, stars))}${'☆'.repeat(Math.max(0, 5 - stars))}</span></div>
        <div class="attrs">${bars}</div>
      </section>
      <section class="card">
        <table class="tbl"><thead><tr><th></th><th>${t('player.apps')}</th><th>${t('player.goals')}</th><th>${t('player.assists')}</th><th>${t('player.avg')}</th><th>⭐</th></tr></thead>
        <tbody>${statRow(t('player.season'), s)}${statRow(t('player.career'), k)}</tbody></table>
      </section>
      <section class="card"><h3>${t('player.trophies')}</h3>${trophies.length ? `<ul class="trophies">${trophies.join('')}</ul>` : `<p class="muted">${t('player.none')}</p>`}</section>
      ${hist ? `<section class="card"><h3>${t('player.history')}</h3><div class="scroll-x"><table class="tbl small"><thead><tr><th>T</th><th>${t('hub.age')}</th><th>${t('league.club')}</th><th>${t('player.apps')}</th><th>G</th><th>A</th><th>${t('player.avg')}</th><th>#</th></tr></thead><tbody>${hist}</tbody></table></div></section>` : ''}`;
  }

  private leagueTab() {
    const c = this.career!;
    const squad = c.player.squad;
    const rows = table(c)
      .map((r, i) => {
        const cl = club(c, r.clubId);
        const me = r.clubId === c.player.clubId;
        return `<tr class="${me ? 'me' : ''}"><td>${i + 1}</td><td class="cl">${badge(cl, 'sm')} <span>${esc(cl.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`;
      })
      .join('');
    const lastRound = c.week - 1;
    const res = c.fixtures[squad]
      .filter((f) => f.round === lastRound && f.hg !== undefined)
      .map((f) => this.resultLine(f.home, f.away, f.hg!, f.ag!))
      .join('');
    const next = c.fixtures[squad]
      .filter((f) => f.round === c.week)
      .map((f) => `<div class="res"><span>${esc(club(c, f.home).short)}</span><b>×</b><span>${esc(club(c, f.away).short)}</span></div>`)
      .join('');
    return `
      <section class="card"><h3>${t(squad === 'pro' ? 'comp.pro' : 'comp.youth')} · ${t('league.title')}</h3>
        <div class="scroll-x"><table class="tbl league"><thead><tr><th>#</th><th>${t('league.club')}</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>P</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
      ${res ? `<section class="card"><h3>${t('league.results')}</h3><div class="results">${res}</div></section>` : ''}
      ${next ? `<section class="card"><h3>${t('league.nextround')}</h3><div class="results">${next}</div></section>` : ''}`;
  }

  private resultLine(h: string, a: string, hg: number, ag: number) {
    const c = this.career!;
    const me = h === c.player.clubId || a === c.player.clubId;
    return `<div class="res ${me ? 'me' : ''}"><span>${esc(club(c, h).short)}</span><b>${hg} - ${ag}</b><span>${esc(club(c, a).short)}</span></div>`;
  }

  private lifeTab() {
    const c = this.career!;
    const p = c.player;
    const shop = ASSETS.map((a) => {
      const owned = p.assets.includes(a.id);
      const can = !owned && p.money >= a.price;
      return `<div class="shop-item ${owned ? 'owned' : ''}"><span class="si-icon">${a.icon}</span><b>${t(`asset.${a.id}`)}</b><small>${fmtMoney(a.price)}</small>
        ${owned ? `<span class="tag-owned">✔ ${t('life.owned')}</span>` : `<button class="btn small ${can ? 'primary' : ''}" data-a="buy" data-v="${a.id}" ${can ? '' : 'disabled'}>${t('life.buy')}</button>`}</div>`;
    }).join('');
    return `
      <section class="card"><h3>${t('life.finances')}</h3>
        <div class="kv"><span>${t(p.squad === 'pro' ? 'life.salary' : 'life.allowance')}</span><b>${fmtMoney(p.salary)}${t('common.week')}</b></div>
        <div class="kv"><span>${t('life.sponsor')}</span><b>${p.sponsor ? `${esc(p.sponsor.brand)} · ${fmtMoney(p.sponsor.weekly)}${t('common.week')}` : t('life.none')}</b></div>
        <div class="kv"><span>${t('life.agent')}</span><b>${p.agent ? `${t('life.yes')} (−${fmtMoney(Math.round(p.salary * 0.1))}${t('common.week')})` : t('life.none')}</b></div>
        ${p.squad === 'pro' ? `<div class="kv"><span>${t('life.contract')}</span><b>${t('life.contract_years', { y: p.contractYears })}</b></div>` : ''}
        ${p.captain ? `<div class="kv"><span>©️</span><b>${t('life.captain')}</b></div>` : ''}
      </section>
      <section class="card"><h3>${t('life.relations')}</h3>
        ${this.meter('stat.coach', p.coach, 'coach')}
        ${this.meter('stat.team', p.team, 'team')}
        ${this.meter('stat.fame', p.fame, 'fame')}
        <div class="kv"><span>📱 ${t('stat.followers')}</span><b>${fmtNum(p.followers)}</b></div>
      </section>
      <section class="card"><h3>${t('life.shop')}</h3><div class="shop">${shop}</div></section>`;
  }

  private newsTab() {
    const c = this.career!;
    const items = c.news
      .map((n) => `<li class="${n.good === true ? 'good' : n.good === false ? 'bad' : ''}"><small>T${n.season} · S${n.week + 1}</small>${esc(t(n.k, n.p))}</li>`)
      .join('');
    return `<section class="card"><h3>${t('nav.news')}</h3><ul class="news">${items}</ul></section>`;
  }

  private careerSummary() {
    const k = this.career!.player.career;
    return `<div class="summary"><div><b>${k.apps}</b><small>${t('player.apps')}</small></div><div><b>${k.goals}</b><small>${t('player.goals')}</small></div><div><b>${k.assists}</b><small>${t('player.assists')}</small></div><div><b>${this.career!.player.trophies.length}</b><small>🏆</small></div></div>`;
  }

  // ------------------------------------------------------------------ modals
  private modal(html: string, cls = '') {
    this.closeModal();
    const m = document.createElement('div');
    m.className = 'modal-wrap';
    m.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    this.root.appendChild(m);
  }

  private closeModal() {
    this.root.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  }

  private toast(title: string, deltas: Delta[]) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>${esc(title)}</b><div class="chips">${deltaChips(deltas)}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  private showEvent() {
    const c = this.career!;
    const ev = EVENTS.find((e) => e.id === c.pendingEvent);
    if (!ev) {
      c.pendingEvent = null;
      return;
    }
    const params = fmtParams(c.eventData);
    const choices = ev.choices
      .map((ch) => {
        const ok = !ch.available || ch.available(c);
        return `<button class="btn ${ok ? '' : 'disabled'}" data-a="ev" data-v="${ch.id}" ${ok ? '' : 'disabled'}>${t(`ev.${ev.id}.${ch.id}`, params)}</button>`;
      })
      .join('');
    this.modal(`<div class="ev"><div class="ev-icon">${ev.icon}</div><h3>${t(`ev.${ev.id}.title`, params)}</h3><p>${t(`ev.${ev.id}.text`, params)}</p><div class="ev-choices">${choices}</div></div>`, 'event');
  }

  // ------------------------------------------------------------------ match flow
  private sel: Selection = 'starter';

  private prematch() {
    const c = this.career!;
    const sel = selection(c);
    this.sel = sel;
    c.flags.lastSelection = sel as unknown as number;
    const icon = { starter: '✅', bench: '🪑', out: '❌', injured: '🩹', suspended: '🟥' }[sel];
    let buttons = '';
    if (sel === 'starter') buttons = `<button class="btn primary big" data-a="play">⚽ ${t('sel.play')}</button>`;
    else if (sel === 'bench')
      buttons = `<button class="btn primary big" data-a="play" data-v="bench">🪑 ${t('sel.watch')}</button><button class="btn" data-a="sim">${t('sel.sim')}</button>`;
    else buttons = `<button class="btn primary big" data-a="sim">${t('sel.sim')}</button>`;
    this.modal(`<div class="prematch"><div class="ev-icon">${icon}</div><h3>${t(`sel.${sel}`)}</h3>${buttons}<button class="btn ghost" data-a="close">${t('common.cancel')}</button></div>`);
  }

  private setupFor(bench: boolean): MatchSetup {
    const c = this.career!;
    const p = c.player;
    const fx = nextFixture(c)!;
    const home = club(c, fx.home);
    const away = club(c, fx.away);
    const sq = p.squad;
    const ts = (cl: Club) => ({ name: cl.name, short: cl.short, primary: cl.primary, secondary: cl.secondary, strength: strengthOf(cl, sq) });
    // avoid kit clash: away team switches to secondary if colours are close
    const awaySetup = ts(away);
    if (colorClose(home.primary, away.primary)) {
      awaySetup.primary = away.secondary;
      awaySetup.secondary = away.primary;
    }
    return {
      home: ts(home),
      away: awaySetup,
      homeId: home.id,
      awayId: away.id,
      userTeam: fx.home === p.clubId ? 0 : 1,
      user: {
        name: p.name,
        attrs: { ...p.attrs },
        position: p.position,
        energy: p.energy,
        morale: p.morale,
        startsOnBench: bench,
        number: POS_NUM[p.position],
      },
    };
  }

  private play(bench: boolean) {
    this.closeModal();
    const c = this.career!;
    if (!nextFixture(c)) return;
    const round = c.week;
    runMatch(this.root, this.setupFor(bench), (r) => this.afterMatch(r, round));
  }

  private simulateOwn() {
    const c = this.career!;
    const fx = nextFixture(c);
    const round = c.week;
    if (!fx) return;
    const sq = c.player.squad;
    const [hg, ag] = simulateScore(strengthOf(club(c, fx.home), sq) + 2, strengthOf(club(c, fx.away), sq));
    const r: MatchReport = {
      homeId: fx.home,
      awayId: fx.away,
      hg,
      ag,
      userTeam: fx.home === c.player.clubId ? 0 : 1,
      user: null,
      injuredWeeks: 0,
      goals: [],
      energyUsed: 0,
    };
    this.afterMatch(r, round);
  }

  private afterMatch(r: MatchReport, round: number) {
    const c = this.career!;
    const squad = c.player.squad;
    const deltas = finishWeek(c, r);
    const home = club(c, r.homeId);
    const away = club(c, r.awayId);
    const u = r.user;
    const others = c.fixtures[squad]
      .filter((f) => f.round === round && f.hg !== undefined && f.home !== r.homeId)
      .map((f) => this.resultLine(f.home, f.away, f.hg!, f.ag!))
      .join('');
    const goals = r.goals.map((g) => `<li class="${g.team === 0 ? 'h' : 'a'} ${g.user ? 'me' : ''}">⚽ ${esc(g.name)} ${g.minute}'</li>`).join('');
    const stat = (k: string, v: string) => `<div class="kv"><span>${t(k)}</span><b>${v}</b></div>`;
    this.root.innerHTML = `
    <div class="screen report">
      <header class="bar"><span></span><h2>${t('report.title')}</h2><span></span></header>
      <div class="report-body">
        <section class="card score-card">
          <div class="fx-teams">
            <div>${badge(home, 'lg')}<b>${esc(home.name)}</b></div>
            <span class="big-score">${r.hg} - ${r.ag}</span>
            <div>${badge(away, 'lg')}<b>${esc(away.name)}</b></div>
          </div>
          ${goals ? `<ul class="ov-goals">${goals}</ul>` : ''}
        </section>
        ${
          u
            ? `<section class="card">
            <div class="rating-big ${u.rating >= 7.5 ? 'hi' : u.rating >= 6.3 ? 'mid' : 'lo'}"><b>${u.rating.toFixed(1)}</b><small>${t('match.rating')}${u.rating >= 8 ? ` · ${t('report.motm')}` : ''}</small></div>
            ${stat('report.minutes', `${u.minutes}'`)}
            ${stat('player.goals', String(u.goals))}
            ${stat('player.assists', String(u.assists))}
            ${stat('report.shots', `${u.shots} (${u.shotsOn})`)}
            ${stat('report.passes', `${u.passesOk}/${u.passes}`)}
            ${stat('report.dribbles', `${u.dribblesOk}/${u.dribbles}`)}
            ${stat('report.tackles', `${u.tacklesOk}/${u.tackles}`)}
            ${u.yellow || u.red ? stat('report.cards', `${'🟨'.repeat(u.yellow)}${'🟥'.repeat(u.red)}`) : ''}
          </section>`
            : `<section class="card"><p class="muted">${t('report.didnt_play')}</p></section>`
        }
        <section class="card"><h3>${t('report.changes')}</h3><div class="chips">${deltaChips(deltas)}</div></section>
        ${others ? `<section class="card"><h3>${t('report.round')}</h3><div class="results">${others}</div></section>` : ''}
        <button class="btn primary big" data-a="report-done">${t('common.continue')} →</button>
      </div>
    </div>`;
    void avgRating;
  }
}

function colorClose(a: string, b: string) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
}
