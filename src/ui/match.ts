import { t } from '../core/i18n';
import type { MatchReport } from '../core/types';
import { esc } from '../core/util';
import type { AimInfo, AimMode, DecisionOption, MatchSetup } from '../match/engine';
import { MatchEngine } from '../match/engine';
import { MatchRenderer } from '../match/render';

const ICONS: Record<string, string> = {
  shoot: '💥', shoot_finesse: '🎯', shoot_long: '🚀', chip: '🪶', pass_short: '➡️', pass_through: '🔪',
  pass_long: '🛫', cross: '↪️', dribble: '🌀', elastico: '🐍', chapeu: '🎩', sprint: '⚡', shield: '🛡️',
  carry: '🏃', header: '🗣️', volley: '🦵', bicycle: '🚲', chest: '🫁', ask_ball: '🙋', run_behind: '🏁',
  box_run: '📦', hold_pos: '📍', tackle: '🦶', press: '🔥', slide: '🛷', cut_lane: '✂️',
  cross_near: '↗️', cross_far: '↪️', cross_spot: '🎯', fk_shot: '🌪️',
};

const SPEEDS = [1, 2, 4];

export function runMatch(root: HTMLElement, setup: MatchSetup, onEnd: (r: MatchReport) => void) {
  const engine = new MatchEngine(setup);
  if (import.meta.env.DEV) (window as unknown as { __ns: MatchEngine }).__ns = engine;
  root.innerHTML = `
  <div class="match">
    <div class="m-canvas"></div>
    <div class="m-top">
      <div class="scorebug">
        <span class="sb-team" style="--c:${setup.home.primary};--c2:${setup.home.secondary}">${esc(setup.home.short)}</span>
        <span class="sb-score" id="sb-score">0 - 0</span>
        <span class="sb-team" style="--c:${setup.away.primary};--c2:${setup.away.secondary}">${esc(setup.away.short)}</span>
        <span class="sb-clock" id="sb-clock">0'</span>
      </div>
      <div class="m-side">
        <div class="pill" id="m-rating" title="${t('match.rating')}">⭐ 6.0</div>
        <div class="pill energy" title="${t('match.energy')}"><span>⚡</span><i><b id="m-energy"></b></i></div>
        <button class="pill btn-speed" id="m-speed" title="${t('match.speed')}">▶ x1</button>
      </div>
    </div>
    <div class="m-feed" id="m-feed"></div>
    <div class="m-aim hidden" id="m-aim"></div>
    <div class="m-tag" id="m-tag">${esc(setup.user?.name.split(' ').slice(-1)[0] ?? '')}</div>
    <div class="m-status" id="m-status"></div>
    <div class="m-decision hidden" id="m-decision"></div>
    <div class="m-overlay hidden" id="m-overlay"></div>
  </div>`;

  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const renderer = new MatchRenderer(root.querySelector('.m-canvas')!, engine);
  let speedIdx = 0;
  let last = performance.now();
  let raf = 0;
  let shownDecision: unknown = null;
  let ended = false;
  let halftimeShown = false;
  let statusKey = '';
  const feedEls: Array<{ el: HTMLElement; t: number }> = [];

  const onResize = () => renderer.resize();
  window.addEventListener('resize', onResize);

  $('m-speed').onclick = () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    $('m-speed').textContent = `${'▶'.repeat(speedIdx + 1)} x${SPEEDS[speedIdx]}`;
  };

  const keyHandler = (ev: KeyboardEvent) => {
    if (!engine.decision) return;
    const n = Number(ev.key);
    if (n >= 1 && n <= engine.decision.options.length) choose(engine.decision.options[n - 1].id);
  };
  window.addEventListener('keydown', keyHandler);

  function choose(id: string, targetId?: number, aim?: { x: number; y: number; mode: AimMode }) {
    if (!engine.decision) return;
    engine.resolve(id, targetId, aim);
    hideDecision();
  }

  function hideDecision() {
    shownDecision = null;
    $('m-decision').classList.add('hidden');
    endAim();
  }

  // ---- drawing a pass: drag on the pitch from the player to a point
  let aimMode: AimMode = 'auto';
  let aiming = false;
  let aimInfo: AimInfo | null = null;
  const canvasWrap = root.querySelector<HTMLElement>('.m-canvas')!;
  const canAim = () => !!engine.decision && engine.decision.targets.length > 0 && !!engine.user;

  function updateAim(ev: PointerEvent) {
    const r = canvasWrap.getBoundingClientRect();
    const p = renderer.groundAt(ev.clientX - r.left, ev.clientY - r.top);
    aimInfo = p ? engine.aimPass(p.x, p.y, aimMode) : null;
    renderer.setAim(aimInfo, engine.user);
    const lab = $('m-aim');
    if (!aimInfo) {
      lab.classList.add('hidden');
      return;
    }
    const pct = Math.round(aimInfo.chance * 100);
    const kind = aimInfo.lofted ? (aimInfo.through ? 'aim.long_through' : 'aim.long') : aimInfo.through ? 'aim.through' : 'aim.short';
    lab.className = `m-aim ${pct >= 65 ? 'hi' : pct >= 35 ? 'mid' : 'lo'}`;
    lab.innerHTML = `<b>${pct}%</b><span>${t(kind)}${aimInfo.receiver ? ` · ${esc(aimInfo.receiver.name)}` : ''}</span>`;
    lab.style.transform = `translate(${ev.clientX - r.left}px, ${ev.clientY - r.top - 18}px) translate(-50%, -100%)`;
  }

  function endAim() {
    aiming = false;
    aimInfo = null;
    renderer.setAim(null, null);
    $('m-aim').classList.add('hidden');
  }

  canvasWrap.addEventListener('pointerdown', (ev) => {
    if (!canAim()) return;
    aiming = true;
    canvasWrap.setPointerCapture(ev.pointerId);
    updateAim(ev);
  });
  canvasWrap.addEventListener('pointermove', (ev) => {
    if (aiming) updateAim(ev);
  });
  canvasWrap.addEventListener('pointerup', (ev) => {
    if (!aiming) return;
    updateAim(ev);
    const info = aimInfo;
    endAim();
    if (info && canAim()) choose('pass_point', undefined, { x: info.x, y: info.y, mode: aimMode });
  });
  canvasWrap.addEventListener('pointercancel', () => endAim());

  function showDecision() {
    const d = engine.decision!;
    shownDecision = d;
    const el = $('m-decision');
    el.classList.remove('hidden');
    el.className = `m-decision kind-${d.kind}`;
    el.innerHTML = `
      <div class="dec-head"><span>${t(d.setPiece ? `dec.sp.${d.setPiece}` : `dec.${d.kind}`)}</span><div class="dec-timer"><i id="dec-bar"></i></div></div>
      ${
        d.targets.length
          ? `<div class="dec-hint"><span>👆 ${t('dec.drag_hint')}</span><span class="aim-modes">${(['auto', 'ground', 'lofted'] as AimMode[])
              .map((m) => `<button data-aim="${m}" class="${aimMode === m ? 'on' : ''}">${t(`aim.mode.${m}`)}</button>`)
              .join('')}</span></div>`
          : ''
      }
      <div class="dec-opts">${d.options.map((o, i) => optHtml(o, i)).join('')}</div>`;
    el.querySelectorAll<HTMLButtonElement>('button[data-aim]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        aimMode = b.dataset.aim as AimMode;
        el.querySelectorAll('button[data-aim]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    el.querySelectorAll<HTMLButtonElement>('button[data-opt]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        choose(b.dataset.opt!);
      };
    });
  }

  function optHtml(o: DecisionOption, i: number) {
    const pct = Math.round(o.chance * 100);
    const label = o.kind === 'goal' ? t('dec.goal_chance') : t('dec.success');
    const tone = o.id === 'hold_pos' ? 'neutral' : o.chance >= 0.65 ? 'hi' : o.chance >= 0.35 ? 'mid' : 'lo';
    const attrs = o.attrs.map((a) => t(`attr.${a}`)).join(' · ');
    return `<button class="opt ${o.special ? 'special' : ''} ${o.kind === 'goal' ? 'goal' : ''}" data-opt="${o.id}">
      <span class="opt-key">${i + 1}</span>
      <span class="opt-icon">${ICONS[o.id] ?? '•'}</span>
      <span class="opt-main"><b>${t(`opt.${o.id}`)}</b><small>${o.special ? `✨ ${t('dec.special')} · ` : ''}${attrs}</small></span>
      ${o.id === 'hold_pos' ? '' : `<span class="opt-pct ${tone}"><b>${pct}%</b><small>${label}</small></span>`}
    </button>`;
  }

  function pushFeed() {
    while (engine.feed.length) {
      const f = engine.feed.shift()!;
      if (f.key.startsWith('feed.throw') || f.key === 'feed.goalkick') continue;
      const el = document.createElement('div');
      el.className = `feed-item tone-${f.tone}`;
      el.textContent = t(f.key, f.p);
      $('m-feed').prepend(el);
      feedEls.push({ el, t: f.tone === 'goal' ? 3.5 : 2.4 });
      if (feedEls.length > 4) feedEls.shift()!.el.remove();
    }
  }

  function overlay(html: string) {
    const o = $('m-overlay');
    o.classList.remove('hidden');
    o.innerHTML = html;
  }

  function finish() {
    if (ended) return;
    ended = true;
    hideDecision();
    const r = engine.report();
    const goals = r.goals
      .map((g) => `<li class="${g.team === 0 ? 'h' : 'a'} ${g.user ? 'me' : ''}">⚽ ${esc(g.name)} ${g.minute}'</li>`)
      .join('');
    overlay(`<div class="ov-card">
      <h2>${t('match.fulltime')}</h2>
      <div class="ov-score"><span>${esc(setup.home.name)}</span><b>${r.hg} - ${r.ag}</b><span>${esc(setup.away.name)}</span></div>
      <ul class="ov-goals">${goals}</ul>
      <button class="btn primary" id="ov-go">${t('match.report')}</button>
    </div>`);
    $('ov-go').onclick = () => {
      cleanup();
      onEnd(r);
    };
  }

  function simRest() {
    let guard = 0;
    while (engine.phase !== 'fulltime' && guard++ < 60000) {
      if (engine.decision) engine.resolve(engine.autoChoice());
      engine.step(1 / 30);
    }
    engine.feed.length = 0;
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', keyHandler);
    renderer.dispose();
  }

  function timeScale(): number {
    const e = engine;
    if (e.phase === 'halftime') return 1;
    if (!e.userOnField) return 6;
    if (e.decision) return 0.035;
    if (e.slowmo > 0) return 0.45;
    if (e.phase === 'restart') return e.setPiece?.taker.isUser ? 1.2 : 1.8;
    if (e.phase !== 'play') return 1.3;
    const u = e.user!;
    const b = e.ball;
    const near = Math.hypot(u.x - b.x, u.y - b.y) < 26;
    return (near ? 1 : 2.4) * SPEEDS[speedIdx];
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    let simDt = 0;
    if (!ended) {
      // variable step: the simulation advances every frame (smooth slow motion),
      // split into sub-steps of at most 1/60 s for stable physics
      const want = dt * timeScale();
      const n = Math.min(40, Math.max(1, Math.ceil(want / (1 / 60))));
      const h = want / n;
      for (let i = 0; i < n; i++) {
        engine.step(h);
        simDt += h;
        if (engine.decision && !shownDecision) break;
        if (engine.phase === 'fulltime') break;
      }
      // decision handling (real time)
      const d = engine.decision;
      if (d && shownDecision !== d) showDecision();
      if (!d && shownDecision) hideDecision();
      if (d) {
        if (!aiming) d.timeLeft -= dt;
        const bar = root.querySelector<HTMLElement>('#dec-bar');
        if (bar) bar.style.width = `${Math.max(0, (d.timeLeft / d.total) * 100)}%`;
        if (d.timeLeft <= 0) {
          engine.push('dec.auto', 'info');
          choose(engine.autoChoice());
        }
      }
      if (engine.phase === 'halftime' && !halftimeShown) {
        halftimeShown = true;
      }
      if (engine.phase === 'fulltime') finish();
    }
    // HUD
    $('sb-score').textContent = `${engine.score[0]} - ${engine.score[1]}`;
    $('sb-clock').textContent = engine.phase === 'halftime' ? t('match.halftime') : `${Math.floor(engine.minute)}'`;
    if (engine.setup.user) {
      const rating = engine.userOnField || engine.userOut < 90 ? engine.finalRating() : 6;
      $('m-rating').textContent = `⭐ ${rating.toFixed(1)}`;
      $('m-energy').style.width = `${engine.userEnergy}%`;
    }
    const status = $('m-status');
    const sKey = !engine.userOnField && !ended && engine.setup.user ? (engine.benchUser ? 'bench' : 'off') : '';
    if (sKey !== statusKey) {
      statusKey = sKey;
      if (sKey) {
        status.innerHTML = `<span>${t(sKey === 'bench' ? 'match.bench' : 'match.off')}</span> <button class="btn small" id="m-sim">${t('match.sim_rest')}</button>`;
        status.classList.add('show');
        status.querySelector<HTMLButtonElement>('#m-sim')!.onclick = () => simRest();
      } else status.classList.remove('show');
    }

    pushFeed();
    for (let i = feedEls.length - 1; i >= 0; i--) {
      feedEls[i].t -= dt;
      if (feedEls[i].t <= 0) {
        feedEls[i].el.remove();
        feedEls.splice(i, 1);
      }
    }
    renderer.render(dt, engine.decision ? 'user' : 'none', simDt);
    const pos = renderer.userScreen();
    const tag = $('m-tag');
    if (pos) {
      tag.style.display = 'block';
      tag.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    } else tag.style.display = 'none';
  }
  raf = requestAnimationFrame(frame);
}
