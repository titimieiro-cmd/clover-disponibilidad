/* Clover · Disponibilidad de jugadoras · Temporada 2026/27 */
(() => {
  'use strict';

  // -------------------------------------------------------------------
  //  Constantes
  // -------------------------------------------------------------------

  const CFG = window.CLOVER_CONFIG || {};
  const POLL_MS = 20000;

  const TYPES = {
    training: { label: 'Entrenamiento', tag: 'Entreno', icon: '🏐' },
    match: { label: 'Partido', tag: 'Partido', icon: '🏆' },
    rest: { label: 'Descanso', tag: 'Desc.', icon: '😴' },
    other: { label: 'Actividad extra', tag: 'Extra', icon: '⭐' },
  };
  const TYPE_PRIORITY = { match: 4, other: 3, training: 2, rest: 1 };

  const STATUS = {
    yes: { label: 'Voy', group: 'Van', icon: '🟢' },
    maybe: { label: 'Tengo dudas', group: 'Con dudas', icon: '🟡' },
    no: { label: 'No voy', group: 'No van', icon: '🔴' },
    none: { label: 'Sin responder', group: 'Sin responder', icon: '⚪' },
  };
  const STATUS_ORDER = ['yes', 'maybe', 'no', 'none'];

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // -------------------------------------------------------------------
  //  Utilidades
  // -------------------------------------------------------------------

  const store = {
    get(k) { try { return localStorage.getItem('clover.' + k); } catch (e) { return null; } },
    set(k, v) {
      try {
        if (v == null) localStorage.removeItem('clover.' + k);
        else localStorage.setItem('clover.' + k, String(v));
      } catch (e) { /* modo privado: sin memoria, pero la web sigue funcionando */ }
    },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); };

  function fmtShort(s) { // "dom 25 oct"
    const d = parseDate(s);
    return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  }
  function fmtLong(s) { // "Domingo 25 de octubre"
    const d = parseDate(s);
    return cap(`${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`);
  }
  function fmtRange(a, b) {
    return a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`;
  }
  function fmtStamp(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function deviceId() {
    let id = store.get('device');
    if (!id) {
      id = Math.random().toString(16).slice(2, 8);
      store.set('device', id);
    }
    return id;
  }

  // -------------------------------------------------------------------
  //  Estado
  // -------------------------------------------------------------------

  const S = {
    code: null,
    data: null,
    loadError: null,
    me: Number(store.get('me')) || null,
    pin: store.get('pin'),
    view: store.get('view') || 'cal',
    month: null, // {y, m}
    sheet: null, // {kind, ...}
    panelTab: 'resumen',
    upFilter: 'all',
    absType: 'all',
    absScope: 'season',
    expanded: {},
    openComment: {},
    byDateEvent: null,
    log: null,
    drafts: {},
    pendingRender: false,
  };

  function codeFromUrl() {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    return q.get('equipo') || h.get('equipo') || q.get('k') || null;
  }

  // -------------------------------------------------------------------
  //  API (funciones de Supabase)
  // -------------------------------------------------------------------

  function configOk() {
    return CFG.SUPABASE_URL && CFG.SUPABASE_KEY &&
      !/TU-PROYECTO/.test(CFG.SUPABASE_URL) && !/PEGA-AQUI/.test(CFG.SUPABASE_KEY);
  }

  function apiError(msg) {
    msg = String(msg || 'Error desconocido');
    const m = /^([A-Z_]{5,}):\s*([\s\S]*)$/.exec(msg);
    const e = new Error(m ? m[2] : msg);
    e.code = m ? m[1] : '';
    return e;
  }

  async function rpc(fn, args) {
    const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
    if (/^eyJ/.test(CFG.SUPABASE_KEY)) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
    let res;
    try {
      res = await fetch(CFG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers, body: JSON.stringify(args || {}), cache: 'no-store',
      });
    } catch (e) {
      const err = new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      err.code = 'NET';
      throw err;
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) throw apiError((body && (body.message || body.error)) || `Error ${res.status}`);
    if (body && typeof body === 'object' && body.ok === false) throw apiError(body.error);
    return body;
  }

  function handleAuthError(e) {
    if (e.code === 'CODIGO_INVALIDO') {
      S.code = null;
      store.set('code', null);
      S.data = null;
      S.loadError = 'El código de equipo no es correcto. Pide a Mati el enlace actualizado.';
      closeSheet();
      render();
      return true;
    }
    if (e.code === 'PIN_INCORRECTO') {
      S.pin = null;
      store.set('pin', null);
      closeSheet();
      toast('El PIN de capitana no es correcto. Vuelve a introducirlo.', 'err');
      render();
      return true;
    }
    return false;
  }

  function admin(fn, args) {
    return rpc(fn, Object.assign({ p_code: S.code, p_pin: S.pin }, args));
  }

  // Cola para que las escrituras lleguen en orden aunque se pulse muy rápido.
  let writeQueue = Promise.resolve();
  let writing = 0;
  function enqueue(task) {
    writing++;
    const p = writeQueue.then(task);
    writeQueue = p.catch(() => {}).then(() => { writing--; });
    return p;
  }

  async function loadState() {
    try {
      const data = await rpc('clover_get_state', { p_code: S.code });
      indexData(data);
      S.data = data;
      S.loadError = null;
    } catch (e) {
      if (handleAuthError(e)) return;
      if (!S.data) S.loadError = e.message;
      else if (e.code !== 'NET') toast(e.message, 'err');
    }
    safeRender();
  }

  let refreshTimer = null;
  function scheduleRefresh(ms) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (!writing) loadState(); else scheduleRefresh(800); }, ms || 700);
  }

  async function poll() {
    if (!S.code || !S.data || writing || document.visibilityState !== 'visible') return;
    try {
      const v = await rpc('clover_get_version', { p_code: S.code });
      if (Number(v) !== Number(S.data.version)) await loadState();
    } catch (e) {
      handleAuthError(e);
    }
  }

  // -------------------------------------------------------------------
  //  Datos derivados
  // -------------------------------------------------------------------

  function indexData(d) {
    d.playersById = new Map(d.players.map((p) => [p.id, p]));
    d.roster = d.players.filter((p) => p.active && p.role !== 'coach');
    d.eventsById = new Map(d.events.map((e) => [e.id, e]));
    d.eventsByDate = new Map();
    for (const e of d.events) {
      if (!d.eventsByDate.has(e.date)) d.eventsByDate.set(e.date, []);
      d.eventsByDate.get(e.date).push(e);
    }
    d.avail = new Map();
    for (const [p, e, s, c] of d.availability) d.avail.set(p + ':' + e, { s, c });
    d.threshold = Number(d.settings && d.settings.threshold) || 10;
  }

  const me = () => (S.data && S.me ? S.data.playersById.get(S.me) : null);
  const isCaptain = () => !!me() && me().role === 'captain';
  const isCoach = () => !!me() && me().role === 'coach';
  const canSeeComments = (pid) => isCaptain() || isCoach() || pid === S.me;

  function vacationOn(date) {
    return S.data.vacations.find((v) => date >= v.start_date && date <= v.end_date) || null;
  }
  const respondable = (ev) => ['training', 'match', 'other'].includes(ev.type) && !ev.cancelled && !vacationOn(ev.date);
  const isFuture = (ev) => ev.date >= todayStr();
  const canAnswer = (ev) => !!me() && !isCoach() && me().active && respondable(ev) && isFuture(ev);
  const evTitle = (ev) => ev.title || TYPES[ev.type].label;

  function entry(pid, eid) { return S.data.avail.get(pid + ':' + eid) || null; }
  function statusOf(pid, eid) { const a = entry(pid, eid); return a ? a.s : 'none'; }

  function counts(ev) {
    const out = { yes: [], maybe: [], no: [], none: [] };
    for (const p of S.data.roster) out[statusOf(p.id, ev.id)].push(p);
    return out;
  }
  const isAlert = (ev) => ev.type === 'match' && respondable(ev) && isFuture(ev) &&
    counts(ev).yes.length <= S.data.threshold;

  function futureEvents(filterFn) {
    const t = todayStr();
    return S.data.events.filter((e) => e.date >= t && (!filterFn || filterFn(e)));
  }
  const alertEvents = () => futureEvents((e) => isAlert(e));

  function pendingSoon() {
    if (!me() || isCoach()) return 0;
    const limit = addDays(todayStr(), 30);
    return futureEvents((e) => e.date <= limit && respondable(e) && statusOf(S.me, e.id) === 'none').length;
  }

  function monthRange() {
    const d = S.data;
    let a = (d.settings && d.settings.season_start) || '2026-10-01';
    let b = (d.settings && d.settings.season_end) || '2027-06-30';
    if (d.events.length) {
      if (d.events[0].date < a) a = d.events[0].date;
      if (d.events[d.events.length - 1].date > b) b = d.events[d.events.length - 1].date;
    }
    const pa = parseDate(a);
    const pb = parseDate(b);
    return { min: pa.getFullYear() * 12 + pa.getMonth(), max: pb.getFullYear() * 12 + pb.getMonth() };
  }

  function ensureMonth() {
    const r = monthRange();
    if (!S.month) {
      const n = new Date();
      S.month = { y: n.getFullYear(), m: n.getMonth() };
    }
    let k = S.month.y * 12 + S.month.m;
    k = Math.max(r.min, Math.min(r.max, k));
    S.month = { y: Math.floor(k / 12), m: k % 12 };
    return r;
  }

  // -------------------------------------------------------------------
  //  Componentes
  // -------------------------------------------------------------------

  const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>
    <g fill="url(#lg)">
      <path d="M32 30C27 26 18 22 18 14.5A6.5 6.5 0 0 1 32 11a6.5 6.5 0 0 1 14 3.5C46 22 37 26 32 30z" transform="rotate(0 32 32)"/>
      <path d="M32 30C27 26 18 22 18 14.5A6.5 6.5 0 0 1 32 11a6.5 6.5 0 0 1 14 3.5C46 22 37 26 32 30z" transform="rotate(90 32 32)"/>
      <path d="M32 30C27 26 18 22 18 14.5A6.5 6.5 0 0 1 32 11a6.5 6.5 0 0 1 14 3.5C46 22 37 26 32 30z" transform="rotate(180 32 32)"/>
      <path d="M32 30C27 26 18 22 18 14.5A6.5 6.5 0 0 1 32 11a6.5 6.5 0 0 1 14 3.5C46 22 37 26 32 30z" transform="rotate(270 32 32)"/>
    </g>
    <circle cx="32" cy="32" r="5" fill="#fff"/>
    <circle cx="32" cy="32" r="3" fill="#7c3aed"/>
  </svg>`;

  function dv(key, fallback) {
    return esc(S.drafts[key] !== undefined ? S.drafts[key] : (fallback == null ? '' : fallback));
  }

  function bar(c, total) {
    const seg = (k) => c[k].length ? `<span class="b-${k}" style="flex:${c[k].length}"></span>` : '';
    return `<div class="stack" aria-hidden="true">${seg('yes')}${seg('maybe')}${seg('no')}${seg('none')}${total ? '' : '<span class="b-none" style="flex:1"></span>'}</div>`;
  }

  function countLine(c) {
    return `<span class="cl"><b class="c-yes">🟢 ${c.yes.length}</b><b class="c-maybe">🟡 ${c.maybe.length}</b><b class="c-no">🔴 ${c.no.length}</b><b class="c-none">⚪ ${c.none.length}</b></span>`;
  }

  function statusPill(st, short) {
    const s = STATUS[st];
    return `<span class="pill p-${st}">${s.icon} ${short && st === 'maybe' ? 'Dudas' : s.label}</span>`;
  }

  function evSub(ev) {
    const bits = [];
    if (ev.time) bits.push('🕒 ' + esc(ev.time));
    if (ev.location) bits.push('📍 ' + esc(ev.location));
    return bits.join(' · ');
  }

  function evFlags(ev) {
    const v = vacationOn(ev.date);
    const out = [];
    if (v) out.push(`<span class="flag f-vac">${vacIcon(v)} ${esc(v.name)}</span>`);
    if (ev.cancelled) out.push('<span class="flag f-cancel">🚫 Cancelado</span>');
    if (isAlert(ev)) out.push('<span class="flag f-alert">⚠️ Pocas confirmadas</span>');
    return out.join('');
  }

  const vacIcon = (v) => (/navidad/i.test(v.name) ? '🎄' : '🌴');

  function answerButtons(ev, st, extraCls) {
    return `<div class="answer ${extraCls || ''}">
      ${['yes', 'no', 'maybe'].map((k) => `<button class="abtn a-${k}${st === k ? ' on' : ''}" data-act="set" data-id="${ev.id}" data-s="${k}" aria-pressed="${st === k}">
        <span class="ai">${STATUS[k].icon}</span><span>${k === 'maybe' ? 'Dudas' : STATUS[k].label}</span></button>`).join('')}
    </div>`;
  }

  // Tarjeta de una actividad para listas (calendario y paneles).
  function eventCard(ev, opts) {
    opts = opts || {};
    const d = parseDate(ev.date);
    const ok = respondable(ev);
    const c = ok ? counts(ev) : null;
    const mine = me() && !isCoach() && ok ? statusOf(S.me, ev.id) : null;
    const cls = ['ev-card', 't-' + ev.type];
    if (!isFuture(ev)) cls.push('past');
    if (ev.cancelled || vacationOn(ev.date)) cls.push('muted');
    if (isAlert(ev)) cls.push('alert');
    return `<button class="${cls.join(' ')}" data-act="open" data-id="${ev.id}">
      <span class="ev-date"><b>${d.getDate()}</b><small>${DOW_SHORT[d.getDay()]}</small></span>
      <span class="ev-main">
        <span class="ev-title">${TYPES[ev.type].icon} ${esc(evTitle(ev))}${opts.showMonth ? ` <small>· ${MONTHS[d.getMonth()].slice(0, 3)}</small>` : ''}</span>
        ${evSub(ev) ? `<span class="ev-sub">${evSub(ev)}</span>` : ''}
        ${evFlags(ev) ? `<span class="flags">${evFlags(ev)}</span>` : ''}
        ${c ? `<span class="ev-counts">${countLine(c)}</span>` : ''}
      </span>
      ${mine ? `<span class="ev-me">${statusPill(mine, true)}</span>` : ''}
    </button>`;
  }

  // Resumen del equipo para una actividad.
  function teamDetail(ev) {
    if (!respondable(ev)) {
      const v = vacationOn(ev.date);
      const why = v ? `Día de vacaciones (${esc(v.name)}): no hace falta responder.`
        : ev.cancelled ? 'Actividad cancelada: no hace falta responder.'
          : 'Día de descanso: no hace falta responder.';
      return `<p class="note">${why}</p>`;
    }
    const c = counts(ev);
    const total = S.data.roster.length;
    const alert = isAlert(ev);
    const editable = isCaptain() && S.pin;
    const groups = STATUS_ORDER.map((k) => {
      const list = c[k];
      return `<div class="grp g-${k}">
        <h4>${STATUS[k].icon} ${STATUS[k].group} <span>${list.length}</span></h4>
        ${list.length ? `<ul>${list.map((p) => {
        const a = entry(p.id, ev.id);
        const cm = a && a.c && canSeeComments(p.id) ? `<em>«${esc(a.c)}»</em>` : '';
        const inner = `<span class="nm">${esc(p.name)}${p.id === S.me ? ' (tú)' : ''}</span>${cm}`;
        return `<li>${editable ? `<button class="pick" data-act="pick" data-eid="${ev.id}" data-pid="${p.id}">${inner}<span class="chev">✎</span></button>` : inner}</li>`;
      }).join('')}</ul>` : '<p class="empty">Nadie</p>'}
      </div>`;
    }).join('');
    return `<div class="summary${alert ? ' is-alert' : ''}">
        <div class="big"><b>${c.yes.length}</b><span>de ${total} confirmadas</span></div>
        ${bar(c, total)}
        ${countLine(c)}
        ${alert ? `<p class="alert-text">⚠️ Solo ${c.yes.length} ${c.yes.length === 1 ? 'confirmada' : 'confirmadas'}: hace falta tener más de ${S.data.threshold}. ¡Faltan respuestas o jugadoras!</p>` : ''}
        ${ev.type === 'match' && !alert && isFuture(ev) ? `<p class="ok-text">✅ Hay suficientes jugadoras confirmadas.</p>` : ''}
      </div>
      ${editable ? '<p class="hint">Toca un nombre para cambiar su respuesta.</p>' : ''}
      <div class="groups">${groups}</div>`;
  }

  function whatsappSummary(ev) {
    const c = counts(ev);
    const lines = [`🏐 *Clover* · ${evTitle(ev)} ${fmtShort(ev.date)}${ev.time ? ' (' + ev.time + ')' : ''}`];
    if (ev.location) lines.push('📍 ' + ev.location);
    for (const k of STATUS_ORDER) {
      lines.push(`${STATUS[k].icon} ${STATUS[k].group} (${c[k].length}): ${c[k].map((p) => p.name).join(', ') || '—'}`);
    }
    if (isAlert(ev)) lines.push(`⚠️ Solo ${c.yes.length} confirmadas. ¡Contestad en la web, porfa!`);
    return lines.join('\n');
  }

  // -------------------------------------------------------------------
  //  Pantallas
  // -------------------------------------------------------------------

  function screenConfig() {
    return `<main class="center">
      <div class="hero">${LOGO}<h1>Clover</h1></div>
      <div class="card"><h2>Falta un paso de configuración</h2>
      <p>Edita el archivo <code>public/config.js</code> y pega la dirección y la clave pública de tu proyecto de Supabase. Las instrucciones están en el archivo <b>README</b> del proyecto.</p></div>
    </main>`;
  }

  function screenCode() {
    return `<main class="center">
      <div class="hero">${LOGO}<h1>Clover</h1><p>Disponibilidad · Temporada 26/27</p></div>
      <form class="card" data-form="code">
        <h2>Código del equipo</h2>
        ${S.loadError ? `<p class="error">${esc(S.loadError)}</p>` : ''}
        <p>Abre la web desde el enlace que se compartió en el grupo de WhatsApp, o escribe aquí el código del equipo.</p>
        <input class="input" name="code" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="código del equipo" required>
        <button class="btn primary block" type="submit">Entrar</button>
      </form>
    </main>`;
  }

  function screenLoading() {
    if (S.loadError) {
      return `<main class="center"><div class="hero">${LOGO}<h1>Clover</h1></div>
        <div class="card"><h2>No se ha podido cargar</h2><p class="error">${esc(S.loadError)}</p>
        <button class="btn primary block" data-act="retry">Reintentar</button></div></main>`;
    }
    return `<main class="center"><div class="hero">${LOGO}<h1>Clover</h1></div><div class="spinner" aria-label="Cargando"></div></main>`;
  }

  function screenLogin() {
    const d = S.data;
    const opt = (p) => `<option value="${p.id}">${esc(p.name)}</option>`;
    const caps = d.players.filter((p) => p.active && p.role === 'captain');
    const players = d.players.filter((p) => p.active && p.role === 'player');
    const coaches = d.players.filter((p) => p.active && p.role === 'coach');
    return `<main class="center">
      <div class="hero">${LOGO}<h1>Clover</h1><p>Disponibilidad · Temporada 26/27</p></div>
      <form class="card" data-form="login">
        <h2>¿Quién eres?</h2>
        <p>Elige tu nombre. Este móvil lo recordará la próxima vez.</p>
        <select class="input big" name="who" required>
          <option value="">Elige tu nombre…</option>
          ${caps.length ? `<optgroup label="Capitana">${caps.map(opt).join('')}</optgroup>` : ''}
          <optgroup label="Jugadoras">${players.map(opt).join('')}</optgroup>
          ${coaches.length ? `<optgroup label="Entrenador">${coaches.map(opt).join('')}</optgroup>` : ''}
        </select>
        <button class="btn primary block big" type="submit">Entrar</button>
        <p class="fine">Elige solo tu propio nombre 🙏. Todos los cambios quedan registrados con fecha y dispositivo.</p>
      </form>
    </main>`;
  }

  function header() {
    const m = me();
    const roleIcon = m.role === 'captain' ? '👑' : m.role === 'coach' ? '📋' : '🏐';
    return `<header class="top">
      <div class="brand">${LOGO}<div><b>Clover</b><small>Temporada 26/27</small></div></div>
      <button class="who" data-act="switch">${roleIcon} ${esc(m.name)} <span>▾</span></button>
    </header>`;
  }

  function nav() {
    const items = [{ v: 'cal', icon: '📅', label: 'Calendario' }];
    if (!isCoach()) items.push({ v: 'up', icon: '✋', label: 'Mis respuestas', badge: pendingSoon() });
    if (isCaptain()) items.push({ v: 'panel', icon: '👑', label: 'Capitana', badge: alertEvents().length, alert: true });
    if (isCoach()) items.push({ v: 'panel', icon: '📊', label: 'Equipo', badge: alertEvents().length, alert: true });
    return `<nav class="tabs">${items.map((it) => `<button class="${S.view === it.v ? 'on' : ''}" data-act="view" data-v="${it.v}">
      <span class="ti">${it.icon}${it.badge ? `<i class="badge${it.alert ? ' red' : ''}">${it.badge > 99 ? '99+' : it.badge}</i>` : ''}</span>
      <span>${it.label}</span></button>`).join('')}</nav>`;
  }

  // ---------- Calendario ----------

  function viewCalendar() {
    const r = ensureMonth();
    const { y, m } = S.month;
    const k = y * 12 + m;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // lunes primero
    const t = todayStr();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="day blank"></span>');
    for (let day = 1; day <= days; day++) {
      const ds = `${y}-${pad(m + 1)}-${pad(day)}`;
      const evs = (S.data.eventsByDate.get(ds) || []).slice()
        .sort((a, b) => TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type]);
      const vac = vacationOn(ds);
      const cls = ['day'];
      let tag = '';
      let mark = '';
      if (ds === t) cls.push('today');
      if (ds < t) cls.push('past');
      if (vac) {
        cls.push('vac');
        tag = `<span class="tag">${vacIcon(vac)}</span>`;
      } else if (evs.length) {
        const ev = evs[0];
        cls.push('t-' + ev.type);
        if (ev.cancelled) cls.push('cancel');
        if (evs.some(isAlert)) cls.push('alert');
        tag = `<span class="tag">${ev.cancelled ? 'Cancel.' : TYPES[ev.type].tag}${evs.length > 1 ? '+' : ''}</span>`;
        const main = evs.find(respondable);
        if (main) {
          if (isCoach()) tag = `<span class="tag cnt-tag">✓ ${counts(main).yes.length}</span>`;
          else if (me()) {
            const st = statusOf(S.me, main.id);
            mark = `<span class="dot d-${st}" title="${STATUS[st].label}"></span>`;
          }
        }
      }
      const clickable = evs.length || vac;
      cells.push(`<${clickable ? `button data-act="day" data-date="${ds}"` : 'span'} class="${cls.join(' ')}">
        <span class="num">${day}</span>${mark}${tag}</${clickable ? 'button' : 'span'}>`);
    }

    const monthStart = `${y}-${pad(m + 1)}-01`;
    const monthEnd = `${y}-${pad(m + 1)}-${pad(days)}`;
    const evs = S.data.events.filter((e) => e.date >= monthStart && e.date <= monthEnd && e.type !== 'rest');
    const vacs = S.data.vacations.filter((v) => v.end_date >= monthStart && v.start_date <= monthEnd);
    const rests = S.data.events.filter((e) => e.date >= monthStart && e.date <= monthEnd && e.type === 'rest');

    const list = [];
    for (const v of vacs) {
      list.push({ date: v.start_date < monthStart ? monthStart : v.start_date,
        html: `<button class="ev-card vac-card" data-act="day" data-date="${v.start_date < monthStart ? monthStart : v.start_date}">
          <span class="ev-date"><b>${vacIcon(v)}</b></span>
          <span class="ev-main"><span class="ev-title">${esc(v.name)}</span><span class="ev-sub">${fmtRange(v.start_date, v.end_date)} · vacaciones, sin actividades</span></span></button>` });
    }
    for (const e of evs) if (!vacationOn(e.date)) list.push({ date: e.date, html: eventCard(e) });
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const restsTxt = rests.filter((e) => !vacationOn(e.date)).map((e) => parseDate(e.date).getDate());

    const monthAlerts = evs.filter(isAlert).length;

    return `<section class="view">
      <div class="month-nav">
        <button class="arrow" data-act="month" data-d="-1" ${k <= r.min ? 'disabled' : ''} aria-label="Mes anterior">‹</button>
        <h2>${cap(MONTHS[m])} <span>${y}</span></h2>
        <button class="arrow" data-act="month" data-d="1" ${k >= r.max ? 'disabled' : ''} aria-label="Mes siguiente">›</button>
      </div>
      ${monthAlerts ? `<${isCaptain() || isCoach() ? 'button data-act="view" data-v="panel"' : 'div'} class="banner red">⚠️ ${monthAlerts} ${monthAlerts === 1 ? 'partido' : 'partidos'} este mes con ${S.data.threshold} o menos confirmadas${isCaptain() || isCoach() ? '' : '<span>¡Responded para saber si somos suficientes!</span>'}</${isCaptain() || isCoach() ? 'button' : 'div'}>` : ''}
      <div class="cal">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="dow">${d}</span>`).join('')}
        ${cells.join('')}
      </div>
      <div class="legend">
        <span><i class="lg t-training"></i>Entreno</span>
        <span><i class="lg t-match"></i>Partido</span>
        <span><i class="lg t-other"></i>Extra</span>
        <span><i class="lg vac"></i>Vacaciones</span>
        <span><i class="lg t-rest"></i>Descanso</span>
        ${isCoach() ? '<span><b class="cnt-lg">✓ 11</b> confirmadas</span>' : `<span><i class="dot d-yes"></i>Voy</span><span><i class="dot d-no"></i>No voy</span><span><i class="dot d-maybe"></i>Dudas</span><span><i class="dot d-none"></i>Sin responder</span>`}
      </div>
      <h3 class="section">Actividades de ${MONTHS[m]}</h3>
      <div class="list">${list.map((x) => x.html).join('') || '<p class="empty">No hay actividades este mes.</p>'}</div>
      ${restsTxt.length ? `<p class="fine">😴 Domingos de descanso: ${restsTxt.join(', ')}.</p>` : ''}
    </section>`;
  }

  // ---------- Mis respuestas ----------

  function viewUpcoming() {
    const t = todayStr();
    const all = futureEvents((e) => e.type !== 'rest');
    const answerable = all.filter(respondable);
    const answered = answerable.filter((e) => statusOf(S.me, e.id) !== 'none').length;
    const f = S.upFilter;
    const shown = all.filter((e) => {
      if (f === 'pending') return respondable(e) && statusOf(S.me, e.id) === 'none';
      if (f === 'match') return e.type === 'match';
      if (f === 'training') return e.type === 'training';
      return true;
    });

    const chips = [['all', 'Todas'], ['pending', 'Sin responder'], ['match', 'Partidos'], ['training', 'Entrenos']]
      .map(([k, l]) => `<button class="chip${f === k ? ' on' : ''}" data-act="upfilter" data-f="${k}">${l}</button>`).join('');

    const byMonth = new Map();
    for (const e of shown) {
      const key = e.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(e);
    }

    const shownVacs = new Set();
    let html = '';
    for (const [key, evs] of byMonth) {
      const [yy, mm] = key.split('-').map(Number);
      const pend = evs.filter((e) => canAnswer(e) && statusOf(S.me, e.id) === 'none');
      html += `<div class="mhead"><h3>${cap(MONTHS[mm - 1])} ${yy}</h3>
        ${pend.length ? `<button class="mini" data-act="allyes" data-month="${key}">🟢 Voy a las ${pend.length} sin responder</button>` : ''}</div>`;
      for (const e of evs) {
        const vac = vacationOn(e.date);
        if (vac) {
          if (!shownVacs.has(vac.id)) {
            shownVacs.add(vac.id);
            html += `<div class="vac-strip">${vacIcon(vac)} <b>${esc(vac.name)}</b> · ${fmtRange(vac.start_date, vac.end_date)} · sin actividades</div>`;
          }
          continue;
        }
        html += responseCard(e);
      }
    }

    return `<section class="view">
      <div class="card hello">
        <h2>Hola, ${esc(me().name)} 👋</h2>
        <p>Marca si vas a cada entreno y partido. Puedes cambiarlo cuando quieras; se guarda solo.</p>
        <div class="progress"><span style="width:${answerable.length ? Math.round(answered * 100 / answerable.length) : 0}%"></span></div>
        <p class="fine">Has respondido ${answered} de ${answerable.length} actividades desde hoy hasta final de temporada.</p>
      </div>
      <div class="chips">${chips}</div>
      ${html || `<p class="empty big">${f === 'pending' ? '🎉 ¡Lo tienes todo respondido!' : 'No hay actividades.'}</p>`}
      <p class="fine center-t">Hoy es ${fmtLong(t)}.</p>
    </section>`;
  }

  function responseCard(ev) {
    const a = entry(S.me, ev.id);
    const st = a ? a.s : 'none';
    const ok = canAnswer(ev);
    const c = respondable(ev) ? counts(ev) : null;
    const showComment = ok && (st === 'no' || st === 'maybe' || (a && a.c) || S.openComment[ev.id]);
    return `<article class="rcard t-${ev.type}${isAlert(ev) ? ' alert' : ''}${st === 'none' && ok ? ' unanswered' : ''}${!respondable(ev) ? ' muted' : ''}">
      <button class="rhead" data-act="open" data-id="${ev.id}">
        <span class="ev-date"><b>${parseDate(ev.date).getDate()}</b><small>${DOW_SHORT[parseDate(ev.date).getDay()]}</small></span>
        <span class="ev-main">
          <span class="ev-title">${TYPES[ev.type].icon} ${esc(evTitle(ev))}</span>
          ${evSub(ev) ? `<span class="ev-sub">${evSub(ev)}</span>` : ''}
          ${evFlags(ev) ? `<span class="flags">${evFlags(ev)}</span>` : ''}
          ${c ? `<span class="ev-counts">${countLine(c)}</span>` : ''}
        </span>
        <span class="more">›</span>
      </button>
      ${ok ? answerButtons(ev, st) : ''}
      ${ok && st === 'none' ? '<p class="nudge">Aún no has respondido</p>' : ''}
      ${showComment ? `<div class="cmt"><input class="input sm" data-act-change="comment" data-id="${ev.id}" maxlength="300"
          placeholder="${st === 'none' ? 'Primero elige una respuesta' : 'Motivo o comentario (opcional)'}" ${st === 'none' ? 'disabled' : ''} value="${esc(a && a.c)}"></div>`
        : ok && st !== 'none' ? `<button class="link" data-act="opencomment" data-id="${ev.id}">💬 Añadir comentario</button>` : ''}
    </article>`;
  }

  // ---------- Panel (capitana / entrenador) ----------

  function viewPanel() {
    if (isCaptain() && !S.pin) {
      return `<section class="view"><form class="card" data-form="pin">
        <h2>👑 Panel de capitana</h2>
        <p>Introduce tu PIN de capitana. Solo hace falta la primera vez en este móvil.</p>
        <input class="input big" name="pin" type="password" autocomplete="current-password" required placeholder="PIN">
        <button class="btn primary block big" type="submit">Entrar al panel</button>
      </form></section>`;
    }
    const tabs = [['resumen', 'Resumen'], ['fecha', 'Por fecha'], ['ausencias', 'Ausencias']];
    if (isCaptain()) tabs.push(['gestionar', 'Gestionar'], ['historial', 'Historial']);
    if (!tabs.find((x) => x[0] === S.panelTab)) S.panelTab = 'resumen';
    const body = { resumen: panelSummary, fecha: panelByDate, ausencias: panelAbsences,
      gestionar: panelManage, historial: panelLog }[S.panelTab]();
    return `<section class="view">
      <h2 class="ptitle">${isCaptain() ? '👑 Panel de capitana' : '📊 Vista del entrenador'}</h2>
      ${isCoach() ? '<p class="fine">Acceso de solo lectura.</p>' : ''}
      <div class="seg-tabs">${tabs.map(([k, l]) => `<button class="${S.panelTab === k ? 'on' : ''}" data-act="ptab" data-t="${k}">${l}</button>`).join('')}</div>
      ${body}
    </section>`;
  }

  function matchRow(ev) {
    const c = counts(ev);
    const total = S.data.roster.length;
    const alert = isAlert(ev);
    return `<button class="mrow${alert ? ' alert' : ''} t-${ev.type}" data-act="open" data-id="${ev.id}">
      <span class="mr-date"><b>${fmtShort(ev.date)}</b><small>${TYPES[ev.type].icon} ${esc(evTitle(ev))}${ev.time ? ' · ' + esc(ev.time) : ''}</small></span>
      <span class="mr-bar">${bar(c, total)}${countLine(c)}</span>
      <span class="mr-num"><b>${c.yes.length}</b><small>/${total}</small></span>
    </button>`;
  }

  function panelSummary() {
    const alerts = alertEvents();
    const matches = futureEvents((e) => e.type === 'match' && respondable(e));
    const trainings = futureEvents((e) => (e.type === 'training' || e.type === 'other') && respondable(e)).slice(0, 6);
    const showAll = S.expanded.allMatches;
    const next = matches[0];
    let banner;
    if (alerts.length) {
      banner = `<div class="banner red static"><b>⚠️ ${alerts.length} ${alerts.length === 1 ? 'partido' : 'partidos'} con ${S.data.threshold} o menos confirmadas</b>
        <span>Las dudas, los «no voy» y las que no han respondido no cuentan como confirmadas.</span></div>`;
    } else {
      banner = '<div class="banner green static"><b>✅ Todos los próximos partidos tienen suficientes confirmadas</b></div>';
    }
    return `${banner}
      ${next ? `<h3 class="section">Próximo partido</h3>${nextMatchCard(next)}` : ''}
      <h3 class="section">Próximos partidos</h3>
      <div class="list">${(showAll ? matches : matches.slice(0, 8)).map(matchRow).join('') || '<p class="empty">No hay partidos próximos.</p>'}</div>
      ${matches.length > 8 ? `<button class="btn ghost block" data-act="toggle" data-k="allMatches">${showAll ? 'Ver menos' : `Ver los ${matches.length} partidos`}</button>` : ''}
      <h3 class="section">Próximos entrenamientos</h3>
      <div class="list">${trainings.map(matchRow).join('') || '<p class="empty">No hay entrenamientos próximos.</p>'}</div>`;
  }

  function nextMatchCard(ev) {
    const c = counts(ev);
    const alert = isAlert(ev);
    return `<button class="next${alert ? ' alert' : ''}" data-act="open" data-id="${ev.id}">
      <span class="nx-l"><small>${fmtLong(ev.date)}${ev.time ? ' · ' + esc(ev.time) : ''}</small>
        <b>${TYPES[ev.type].icon} ${esc(evTitle(ev))}</b>${ev.location ? `<small>📍 ${esc(ev.location)}</small>` : ''}</span>
      <span class="nx-r"><b>${c.yes.length}</b><small>confirmadas</small></span>
      <span class="nx-bar">${bar(c, S.data.roster.length)}${countLine(c)}</span>
    </button>`;
  }

  function panelByDate() {
    const evs = S.data.events.filter((e) => e.type !== 'rest');
    if (!evs.length) return '<p class="empty">No hay actividades.</p>';
    let cur = S.byDateEvent && S.data.eventsById.get(S.byDateEvent);
    if (!cur || cur.type === 'rest') {
      cur = futureEvents((e) => respondable(e))[0] || evs[evs.length - 1];
      S.byDateEvent = cur.id;
    }
    const idx = evs.indexOf(cur);
    const groups = new Map();
    for (const e of evs) {
      const key = e.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const options = [...groups].map(([key, list]) => {
      const [yy, mm] = key.split('-').map(Number);
      return `<optgroup label="${cap(MONTHS[mm - 1])} ${yy}">${list.map((e) => `<option value="${e.id}" ${e.id === cur.id ? 'selected' : ''}>${fmtShort(e.date)} · ${esc(evTitle(e))}${isAlert(e) ? ' ⚠️' : ''}${e.cancelled ? ' (cancelado)' : ''}</option>`).join('')}</optgroup>`;
    }).join('');
    return `<div class="picker">
        <button class="arrow sm" data-act="bystep" data-d="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
        <select class="input" data-act-change="bydate">${options}</select>
        <button class="arrow sm" data-act="bystep" data-d="1" ${idx >= evs.length - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
      </div>
      <div class="card">
        <div class="dhead t-${cur.type}"><b>${TYPES[cur.type].icon} ${esc(evTitle(cur))}</b><span>${fmtLong(cur.date)}</span>${evSub(cur) ? `<small>${evSub(cur)}</small>` : ''}${evFlags(cur) ? `<span class="flags">${evFlags(cur)}</span>` : ''}</div>
        ${teamDetail(cur)}
        ${respondable(cur) ? `<div class="row2">
          <button class="btn ghost" data-act="copy" data-id="${cur.id}">📋 Copiar resumen</button>
          <a class="btn whatsapp" href="https://wa.me/?text=${encodeURIComponent(whatsappSummary(cur))}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        </div>` : ''}
        ${isCaptain() ? `<button class="btn ghost block" data-act="editev" data-id="${cur.id}">✏️ Editar esta actividad</button>` : ''}
      </div>`;
  }

  function panelAbsences() {
    const t = todayStr();
    const ty = S.absType;
    const sc = S.absScope;
    const evs = S.data.events.filter((e) => respondable(e) &&
      (ty === 'all' || (ty === 'match' ? e.type === 'match' : e.type !== 'match')) &&
      (sc === 'season' || (sc === 'future' ? e.date >= t : e.date < t)));
    const chipsT = [['all', 'Todo'], ['match', 'Partidos'], ['training', 'Entrenos']]
      .map(([k, l]) => `<button class="chip${ty === k ? ' on' : ''}" data-act="abstype" data-f="${k}">${l}</button>`).join('');
    const chipsS = [['season', 'Toda la temporada'], ['future', 'Próximas'], ['past', 'Pasadas']]
      .map(([k, l]) => `<button class="chip${sc === k ? ' on' : ''}" data-act="absscope" data-f="${k}">${l}</button>`).join('');

    const rows = S.data.roster.map((p) => {
      const c = { yes: 0, no: 0, maybe: 0, none: 0 };
      const items = [];
      for (const e of evs) {
        const a = entry(p.id, e.id);
        const st = a ? a.s : 'none';
        c[st]++;
        if (st !== 'yes') items.push({ e, st, cm: a && a.c });
      }
      const open = S.expanded['abs' + p.id];
      return `<div class="arow${open ? ' open' : ''}">
        <button class="ahead" data-act="toggle" data-k="abs${p.id}">
          <span class="an">${esc(p.name)}</span>
          <span class="ac c-no">${c.no}</span><span class="ac c-maybe">${c.maybe}</span><span class="ac c-none">${c.none}</span><span class="ac c-yes">${c.yes}</span>
        </button>
        ${open ? `<ul class="alist">${items.map((x) => `<li><button data-act="open" data-id="${x.e.id}">
            <span>${STATUS[x.st].icon}</span><span><b>${fmtShort(x.e.date)}</b> · ${esc(evTitle(x.e))}${x.cm ? `<em>«${esc(x.cm)}»</em>` : ''}</span></button></li>`).join('') || '<li class="empty">Ha confirmado todas 🎉</li>'}</ul>` : ''}
      </div>`;
    }).join('');

    return `<div class="chips">${chipsT}</div><div class="chips">${chipsS}</div>
      <p class="fine">${evs.length} actividades. Toca una jugadora para ver el detalle y los motivos.</p>
      <div class="atable">
        <div class="ahead th"><span class="an">Jugadora</span><span class="ac">🔴</span><span class="ac">🟡</span><span class="ac">⚪</span><span class="ac">🟢</span></div>
        ${rows}
      </div>
      <p class="fine">🔴 No voy · 🟡 Dudas · ⚪ Sin responder · 🟢 Voy</p>`;
  }

  function shareLink() {
    return `${location.origin}${location.pathname}?equipo=${encodeURIComponent(S.code)}`;
  }

  function panelManage() {
    const d = S.data;
    const wd = [['', 'Todos los días'], ['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['7', 'Domingo']];
    const bt = S.drafts['bulk.type'] || 'training';
    const bw = S.drafts['bulk.wd'] !== undefined ? S.drafts['bulk.wd'] : '';
    const msg = `🏐 ¡Hola Clover! Esta es la web para marcar si venís a entrenos y partidos de la temporada. Elegid vuestro nombre y marcad 🟢 Voy / 🔴 No voy / 🟡 Dudas:\n${shareLink()}`;
    return `
      <div class="card">
        <h3>📅 Calendario</h3>
        <p class="fine">Para cambiar un domingo a <b>descanso</b>, cancelar un entreno o cambiar una fecha, toca ese día en el <b>Calendario</b> y usa los botones de capitana.</p>
        <button class="btn primary block" data-act="newev">➕ Añadir actividad</button>
      </div>

      <div class="card">
        <h3>🌴 Vacaciones</h3>
        <ul class="mlist">${d.vacations.map((v) => `<li><span><b>${vacIcon(v)} ${esc(v.name)}</b><small>${fmtRange(v.start_date, v.end_date)}</small></span>
          <button class="mini" data-act="editvac" data-id="${v.id}">Editar</button></li>`).join('') || '<li class="empty">Sin periodos de vacaciones.</li>'}</ul>
        <button class="btn ghost block" data-act="newvac">➕ Añadir periodo de vacaciones</button>
      </div>

      <form class="card" data-form="bulk">
        <h3>🕒 Hora y lugar habituales</h3>
        <p class="fine">Aplica una hora y/o un lugar a todas las actividades futuras de un tipo. Deja vacío lo que no quieras cambiar.</p>
        <div class="grid2">
          <label>Tipo<select class="input" data-draft="bulk.type">
            ${[['training', 'Entrenamientos'], ['match', 'Partidos'], ['other', 'Actividades extra']].map(([k, l]) => `<option value="${k}" ${bt === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label>Día<select class="input" data-draft="bulk.wd">${wd.map(([k, l]) => `<option value="${k}" ${bw === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Hora<input class="input" type="time" data-draft="bulk.time" value="${dv('bulk.time')}"></label>
          <label>Lugar<input class="input" data-draft="bulk.loc" maxlength="120" value="${dv('bulk.loc')}" placeholder="Pabellón…"></label>
        </div>
        <button class="btn primary block" type="submit">Aplicar a las futuras</button>
      </form>

      <form class="card" data-form="threshold">
        <h3>⚠️ Alerta de partidos</h3>
        <p class="fine">Se avisa cuando un partido tiene este número de «Voy» o menos.</p>
        <div class="inline"><input class="input" type="number" min="1" max="30" inputmode="numeric" data-draft="thr" value="${dv('thr', d.threshold)}"><button class="btn primary" type="submit">Guardar</button></div>
      </form>

      <div class="card">
        <h3>👭 Equipo</h3>
        <ul class="mlist">${d.players.map((p) => `<li class="${p.active ? '' : 'off'}"><span><b>${esc(p.name)}</b><small>${p.role === 'captain' ? '👑 Capitana' : p.role === 'coach' ? '📋 Entrenador (solo lectura)' : 'Jugadora'}${p.active ? '' : ' · desactivada'}</small></span>
          <button class="mini" data-act="editplayer" data-id="${p.id}">Editar</button></li>`).join('')}</ul>
        <button class="btn ghost block" data-act="newplayer">➕ Añadir persona</button>
      </div>

      <div class="card">
        <h3>🔗 Enlace para WhatsApp</h3>
        <p class="fine">Manda este enlace al grupo. Incluye el código del equipo, así nadie tiene que escribir nada.</p>
        <input class="input sm" readonly value="${esc(shareLink())}" data-act="selectall">
        <div class="row2">
          <button class="btn ghost" data-act="copylink">📋 Copiar enlace</button>
          <a class="btn whatsapp" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        </div>
      </div>

      <form class="card" data-form="newpin">
        <h3>🔒 Seguridad</h3>
        <p class="fine">Cambia tu PIN de capitana (mínimo 6 caracteres).</p>
        <div class="inline"><input class="input" type="password" autocomplete="new-password" data-draft="newpin" value="${dv('newpin')}" placeholder="Nuevo PIN"><button class="btn primary" type="submit">Cambiar</button></div>
        <button class="btn ghost block" type="button" data-act="logoutadmin">Cerrar el panel de capitana en este móvil</button>
      </form>`;
  }

  function panelLog() {
    if (!S.log) {
      loadLog();
      return '<div class="spinner"></div>';
    }
    const pl = S.data.playersById;
    const ev = S.data.eventsById;
    return `<button class="btn ghost block" data-act="reloadlog">🔄 Actualizar</button>
      <p class="fine">Últimos cambios. El código 📱 identifica el móvil desde el que se hizo el cambio: si ves el mismo código para dos jugadoras distintas, alguien ha respondido por otra.</p>
      <ul class="log">${S.log.map((l) => {
      const p = l.player_id && pl.get(l.player_id);
      const e = l.event_id && ev.get(l.event_id);
      return `<li><small>${fmtStamp(l.at)}${l.device ? ` · 📱${esc(l.device)}` : ''}</small>
        <span><b>${esc(l.actor || '')}</b>${p && l.actor !== p.name ? ` → ${esc(p.name)}` : ''} · ${esc(l.action)}${e ? ` · ${fmtShort(e.date)} ${esc(evTitle(e))}` : ''}</span>
        ${l.detail ? `<em>${esc(l.detail)}</em>` : ''}</li>`;
    }).join('') || '<li class="empty">Sin cambios todavía.</li>'}</ul>`;
  }

  async function loadLog() {
    try {
      const r = await admin('clover_admin_get_log', { p_limit: 300 });
      S.log = r.log;
    } catch (e) {
      if (!handleAuthError(e)) { toast(e.message, 'err'); S.log = []; }
    }
    safeRender();
  }

  // ---------- Hojas (ventanas desde abajo) ----------

  function sheetEvent(ev) {
    const st = statusOf(S.me, ev.id);
    const a = entry(S.me, ev.id);
    const ok = canAnswer(ev);
    const cpt = isCaptain() && S.pin;
    let quick = '';
    if (cpt) {
      const b = [];
      if (ev.type === 'match') b.push(`<button class="btn ghost" data-act="quick" data-id="${ev.id}" data-q="rest">😴 Marcar descanso</button>`);
      if (ev.type === 'rest') b.push(`<button class="btn ghost" data-act="quick" data-id="${ev.id}" data-q="match">🏆 Volver a partido</button>`);
      if (ev.type !== 'rest') {
        b.push(ev.cancelled
          ? `<button class="btn ghost" data-act="quick" data-id="${ev.id}" data-q="uncancel">↩️ Reactivar</button>`
          : `<button class="btn ghost" data-act="quick" data-id="${ev.id}" data-q="cancel">🚫 Cancelar</button>`);
      }
      b.push(`<button class="btn ghost" data-act="editev" data-id="${ev.id}">✏️ Editar</button>`);
      quick = `<div class="cap-actions"><h4>👑 Opciones de capitana</h4><div class="row-wrap">${b.join('')}</div></div>`;
    }
    return `<div class="sh-head t-${ev.type}">
        <span class="kicker">${TYPES[ev.type].icon} ${TYPES[ev.type].label}</span>
        <h2>${esc(ev.title || fmtLong(ev.date))}</h2>
        ${ev.title ? `<p>${fmtLong(ev.date)}</p>` : ''}
        ${evSub(ev) ? `<p>${evSub(ev)}</p>` : ''}
        ${ev.notes ? `<p class="notes">${esc(ev.notes)}</p>` : ''}
        ${evFlags(ev) ? `<span class="flags">${evFlags(ev)}</span>` : ''}
      </div>
      ${ok ? `<div class="mine">
        <h3>Tu respuesta</h3>
        ${answerButtons(ev, st, 'big')}
        ${st === 'none' ? '<p class="nudge">Aún no has respondido. Mientras no respondas, no cuentas como confirmada.</p>' : ''}
        <label class="lbl">Comentario (opcional)
          <textarea class="input" rows="2" maxlength="300" data-draft="cm.${ev.id}" ${st === 'none' ? 'disabled placeholder="Primero elige Voy, No voy o Dudas"' : 'placeholder="Ej.: tengo una boda, llego tarde…"'}>${dv('cm.' + ev.id, a && a.c)}</textarea></label>
        ${st !== 'none' ? `<div class="row2"><button class="btn primary" data-act="savecomment" data-id="${ev.id}">Guardar comentario</button>
          <button class="btn ghost" data-act="clear" data-id="${ev.id}">Borrar respuesta</button></div>` : ''}
      </div>` : (me() && !isCoach() && respondable(ev) && !isFuture(ev) ? '<p class="note">Esta actividad ya ha pasado.</p>' : '')}
      ${quick}
      <h3 class="section">Equipo</h3>
      ${teamDetail(ev)}`;
  }

  function sheetDay(date) {
    const evs = (S.data.eventsByDate.get(date) || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const vac = vacationOn(date);
    if (evs.length === 1 && !vac) return sheetEvent(evs[0]);
    return `<div class="sh-head ${vac ? 'vac' : ''}">
        <span class="kicker">${vac ? vacIcon(vac) + ' ' + esc(vac.name) : '📅 Día'}</span>
        <h2>${fmtLong(date)}</h2>
        ${vac ? `<p>Vacaciones del ${fmtRange(vac.start_date, vac.end_date)}. No hace falta indicar disponibilidad.</p>` : ''}
      </div>
      <div class="list">${evs.map((e) => eventCard(e)).join('') || (vac ? '' : '<p class="empty">Sin actividades.</p>')}</div>
      ${isCaptain() && S.pin ? `<button class="btn ghost block" data-act="newev" data-date="${date}">➕ Añadir actividad este día</button>` : ''}`;
  }

  function sheetEventForm(sh) {
    const isNew = !sh.id;
    const k = (f) => 'ev.' + f;
    return `<form data-form="event">
      <div class="sh-head"><span class="kicker">👑 Capitana</span><h2>${isNew ? 'Nueva actividad' : 'Editar actividad'}</h2></div>
      <label class="lbl">Tipo<select class="input" data-draft="${k('type')}">
        ${Object.entries(TYPES).map(([t, v]) => `<option value="${t}" ${S.drafts[k('type')] === t ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
      </select></label>
      <div class="grid2">
        <label class="lbl">Fecha<input class="input" type="date" required data-draft="${k('date')}" value="${dv(k('date'))}"></label>
        <label class="lbl">Hora<input class="input" type="time" data-draft="${k('time')}" value="${dv(k('time'))}"></label>
      </div>
      <label class="lbl">Título (opcional)<input class="input" maxlength="80" data-draft="${k('title')}" value="${dv(k('title'))}" placeholder="Ej.: Partido vs. Las Panteras"></label>
      <label class="lbl">Lugar (opcional)<input class="input" maxlength="120" data-draft="${k('location')}" value="${dv(k('location'))}" placeholder="Ej.: Pabellón municipal"></label>
      <label class="lbl">Notas (opcional)<textarea class="input" rows="2" maxlength="500" data-draft="${k('notes')}">${dv(k('notes'))}</textarea></label>
      <label class="check"><input type="checkbox" data-draft="${k('cancelled')}" ${S.drafts[k('cancelled')] ? 'checked' : ''}> 🚫 Cancelada</label>
      <button class="btn primary block big" type="submit">Guardar</button>
      ${isNew ? '' : `<button class="btn danger block" type="button" data-act="delev" data-id="${sh.id}">🗑 Borrar actividad</button>`}
      <p class="fine">Si cambias la fecha, las respuestas ya dadas se mantienen. Revisa que siguen siendo válidas.</p>
    </form>`;
  }

  function sheetVacForm(sh) {
    return `<form data-form="vac">
      <div class="sh-head vac"><span class="kicker">🌴 Vacaciones</span><h2>${sh.id ? 'Editar periodo' : 'Nuevo periodo'}</h2></div>
      <label class="lbl">Nombre<input class="input" required maxlength="60" data-draft="vac.name" value="${dv('vac.name')}" placeholder="Ej.: Puente de mayo"></label>
      <div class="grid2">
        <label class="lbl">Desde<input class="input" type="date" required data-draft="vac.start" value="${dv('vac.start')}"></label>
        <label class="lbl">Hasta (incluido)<input class="input" type="date" required data-draft="vac.end" value="${dv('vac.end')}"></label>
      </div>
      <button class="btn primary block big" type="submit">Guardar</button>
      ${sh.id ? `<button class="btn danger block" type="button" data-act="delvac" data-id="${sh.id}">🗑 Borrar periodo</button>` : ''}
    </form>`;
  }

  function sheetPlayerForm(sh) {
    const role = S.drafts['pl.role'] || 'player';
    return `<form data-form="player">
      <div class="sh-head"><span class="kicker">👭 Equipo</span><h2>${sh.id ? 'Editar persona' : 'Añadir persona'}</h2></div>
      <label class="lbl">Nombre<input class="input" required maxlength="40" data-draft="pl.name" value="${dv('pl.name')}"></label>
      <label class="lbl">Rol<select class="input" data-draft="pl.role">
        <option value="player" ${role === 'player' ? 'selected' : ''}>Jugadora</option>
        <option value="captain" ${role === 'captain' ? 'selected' : ''}>Capitana</option>
        <option value="coach" ${role === 'coach' ? 'selected' : ''}>Entrenador/a (solo lectura)</option>
      </select></label>
      <label class="check"><input type="checkbox" data-draft="pl.active" ${S.drafts['pl.active'] ? 'checked' : ''}> Activa (aparece en la lista y cuenta en los totales)</label>
      <button class="btn primary block big" type="submit">Guardar</button>
    </form>`;
  }

  function sheetPick(sh) {
    const ev = S.data.eventsById.get(sh.eid);
    const p = S.data.playersById.get(sh.pid);
    if (!ev || !p) return '<p class="empty">No encontrado.</p>';
    const a = entry(p.id, ev.id);
    const st = a ? a.s : 'none';
    return `<div class="sh-head t-${ev.type}"><span class="kicker">👑 Cambiar respuesta</span><h2>${esc(p.name)}</h2><p>${TYPES[ev.type].icon} ${esc(evTitle(ev))} · ${fmtLong(ev.date)}</p></div>
      <p class="fine">Respuesta actual: ${statusPill(st)}</p>
      <label class="lbl">Comentario (opcional)<textarea class="input" rows="2" maxlength="300" data-draft="pick.cm">${dv('pick.cm', a && a.c)}</textarea></label>
      <div class="answer big">
        ${['yes', 'no', 'maybe'].map((k) => `<button class="abtn a-${k}${st === k ? ' on' : ''}" data-act="adminset" data-s="${k}"><span class="ai">${STATUS[k].icon}</span><span>${k === 'maybe' ? 'Dudas' : STATUS[k].label}</span></button>`).join('')}
      </div>
      <button class="btn ghost block" data-act="adminset" data-s="">⚪ Dejar sin responder</button>
      <button class="btn ghost block" data-act="back">‹ Volver</button>`;
  }

  function renderSheet() {
    const root = document.getElementById('sheet');
    if (!S.sheet || !S.data) {
      root.innerHTML = '';
      document.body.classList.remove('noscroll');
      return;
    }
    const sh = S.sheet;
    let content = '';
    if (sh.kind === 'event') {
      const ev = S.data.eventsById.get(sh.id);
      if (!ev) { closeSheet(); return; }
      content = sheetEvent(ev);
    } else if (sh.kind === 'day') content = sheetDay(sh.date);
    else if (sh.kind === 'eventForm') content = sheetEventForm(sh);
    else if (sh.kind === 'vacForm') content = sheetVacForm(sh);
    else if (sh.kind === 'playerForm') content = sheetPlayerForm(sh);
    else if (sh.kind === 'pick') content = sheetPick(sh);
    const prev = root.querySelector('.sheet');
    const scroll = prev ? prev.scrollTop : 0;
    root.innerHTML = `<div class="backdrop" data-act="close"></div>
      <div class="sheet" role="dialog" aria-modal="true"><button class="x" data-act="close" aria-label="Cerrar">✕</button>${content}</div>`;
    root.querySelector('.sheet').scrollTop = sh.keepScroll ? scroll : 0;
    sh.keepScroll = true;
    document.body.classList.add('noscroll');
  }

  function openSheet(sh) {
    sh.keepScroll = false;
    S.sheet = sh;
    renderSheet();
  }
  function closeSheet() {
    S.sheet = null;
    renderSheet();
  }

  // -------------------------------------------------------------------
  //  Render principal
  // -------------------------------------------------------------------

  function render() {
    const app = document.getElementById('app');
    let html;
    if (!configOk()) html = screenConfig();
    else if (!S.code) html = screenCode();
    else if (!S.data) html = screenLoading();
    else if (!me() || !me().active) html = screenLogin();
    else {
      if (S.view === 'up' && isCoach()) S.view = 'cal';
      if (S.view === 'panel' && !isCaptain() && !isCoach()) S.view = 'cal';
      const body = S.view === 'up' ? viewUpcoming() : S.view === 'panel' ? viewPanel() : viewCalendar();
      html = header() + body + nav();
    }
    app.innerHTML = html;
    renderSheet();
    S.pendingRender = false;
  }

  // No re-pintar mientras se escribe en un campo (para no perder lo escrito).
  function safeRender() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') {
      S.pendingRender = true;
      return;
    }
    render();
  }

  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'err' ? 4500 : 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nada */ }
      ta.remove();
    }
    toast('Copiado ✓');
  }

  // -------------------------------------------------------------------
  //  Acciones
  // -------------------------------------------------------------------

  // Guarda la respuesta de la jugadora actual (con actualización inmediata en pantalla).
  function setMine(eventIds, status, comment) {
    const d = S.data;
    const backup = eventIds.map((id) => [id, d.avail.get(S.me + ':' + id)]);
    for (const id of eventIds) {
      const key = S.me + ':' + id;
      if (status) {
        const prev = d.avail.get(key);
        d.avail.set(key, { s: status, c: comment !== undefined ? comment : prev ? prev.c : null });
      } else d.avail.delete(key);
    }
    safeRender();
    return enqueue(async () => {
      const ids = eventIds.slice();
      try {
        for (let i = 0; i < ids.length; i += 60) {
          const chunk = ids.slice(i, i + 60);
          const cm = comment !== undefined ? comment
            : (d.avail.get(S.me + ':' + chunk[0]) || {}).c || null;
          await rpc('clover_set_availability', {
            p_code: S.code, p_player_id: S.me, p_event_ids: chunk,
            p_status: status || null, p_comment: cm, p_device: deviceId(),
          });
        }
        toast(status ? 'Guardado ✓' : 'Respuesta borrada');
      } catch (e) {
        for (const [id, v] of backup) {
          if (v) d.avail.set(S.me + ':' + id, v); else d.avail.delete(S.me + ':' + id);
        }
        if (!handleAuthError(e)) toast('No se ha guardado: ' + e.message, 'err');
        safeRender();
      }
      scheduleRefresh();
    });
  }

  async function adminCall(fn, args, okMsg) {
    try {
      const r = await enqueue(() => admin(fn, args));
      if (okMsg) toast(okMsg);
      S.log = null;
      await loadState();
      return r || true;
    } catch (e) {
      if (!handleAuthError(e)) toast(e.message, 'err');
      return null;
    }
  }

  function eventPayload(ev, changes) {
    return Object.assign({
      id: ev.id, date: ev.date, time: ev.time, type: ev.type, title: ev.title,
      location: ev.location, notes: ev.notes, cancelled: ev.cancelled,
    }, changes);
  }

  function openEventForm(ev, date) {
    for (const k of Object.keys(S.drafts)) if (k.startsWith('ev.')) delete S.drafts[k];
    const src = ev || { date: date || todayStr(), type: 'other', time: '', title: '', location: '', notes: '', cancelled: false };
    Object.assign(S.drafts, {
      'ev.date': src.date, 'ev.type': src.type, 'ev.time': src.time || '', 'ev.title': src.title || '',
      'ev.location': src.location || '', 'ev.notes': src.notes || '', 'ev.cancelled': !!src.cancelled,
    });
    openSheet({ kind: 'eventForm', id: ev ? ev.id : null });
  }

  const actions = {
    retry() { S.loadError = null; render(); loadState(); },
    switch() {
      if (!confirm('¿Quieres cambiar de persona en este móvil?')) return;
      S.me = null;
      store.set('me', null);
      closeSheet();
      render();
    },
    view(el) {
      S.view = el.dataset.v;
      store.set('view', S.view);
      closeSheet();
      render();
      window.scrollTo(0, 0);
    },
    month(el) {
      S.month.m += Number(el.dataset.d);
      if (S.month.m < 0) { S.month.m = 11; S.month.y--; }
      if (S.month.m > 11) { S.month.m = 0; S.month.y++; }
      render();
    },
    day(el) { openSheet({ kind: 'day', date: el.dataset.date }); },
    open(el) { openSheet({ kind: 'event', id: Number(el.dataset.id) }); },
    close() { closeSheet(); },
    back() {
      if (S.sheet && S.sheet.back) openSheet(S.sheet.back); else closeSheet();
    },
    set(el) {
      const id = Number(el.dataset.id);
      const s = el.dataset.s;
      if (statusOf(S.me, id) === s) return;
      if (S.drafts['cm.' + id] !== undefined) delete S.drafts['cm.' + id];
      setMine([id], s);
    },
    clear(el) {
      const id = Number(el.dataset.id);
      delete S.drafts['cm.' + id];
      setMine([id], null);
    },
    savecomment(el) {
      const id = Number(el.dataset.id);
      const st = statusOf(S.me, id);
      if (st === 'none') return;
      const cm = (S.drafts['cm.' + id] || '').trim();
      delete S.drafts['cm.' + id];
      setMine([id], st, cm || null);
    },
    opencomment(el) { S.openComment[el.dataset.id] = true; render(); },
    allyes(el) {
      const key = el.dataset.month;
      const ids = futureEvents((e) => e.date.startsWith(key) && canAnswer(e) && statusOf(S.me, e.id) === 'none').map((e) => e.id);
      if (!ids.length) return;
      if (!confirm(`¿Marcar «Voy» en las ${ids.length} actividades sin responder de este mes?`)) return;
      setMine(ids, 'yes', null);
    },
    upfilter(el) { S.upFilter = el.dataset.f; render(); },
    abstype(el) { S.absType = el.dataset.f; render(); },
    absscope(el) { S.absScope = el.dataset.f; render(); },
    ptab(el) {
      S.panelTab = el.dataset.t;
      if (S.panelTab === 'historial') S.log = null;
      render();
    },
    toggle(el) { S.expanded[el.dataset.k] = !S.expanded[el.dataset.k]; render(); },
    bystep(el) {
      const evs = S.data.events.filter((e) => e.type !== 'rest');
      const i = evs.findIndex((e) => e.id === S.byDateEvent) + Number(el.dataset.d);
      if (evs[i]) { S.byDateEvent = evs[i].id; render(); }
    },
    copy(el) { copyText(whatsappSummary(S.data.eventsById.get(Number(el.dataset.id)))); },
    copylink() { copyText(shareLink()); },
    selectall(el) { el.select(); },
    reloadlog() { S.log = null; render(); },
    logoutadmin() {
      S.pin = null;
      store.set('pin', null);
      render();
    },
    pick(el) {
      delete S.drafts['pick.cm'];
      openSheet({ kind: 'pick', eid: Number(el.dataset.eid), pid: Number(el.dataset.pid), back: S.sheet ? Object.assign({}, S.sheet) : null });
    },
    async adminset(el) {
      const sh = S.sheet;
      const a = entry(sh.pid, sh.eid);
      const cm = S.drafts['pick.cm'] !== undefined ? S.drafts['pick.cm'] : (a && a.c) || '';
      const r = await adminCall('clover_admin_set_availability', {
        p_player_id: sh.pid, p_event_id: sh.eid, p_status: el.dataset.s || null, p_comment: cm || null,
      }, 'Guardado ✓');
      if (r) {
        delete S.drafts['pick.cm'];
        if (sh.back) openSheet(sh.back); else closeSheet();
      }
    },
    async quick(el) {
      const ev = S.data.eventsById.get(Number(el.dataset.id));
      const q = el.dataset.q;
      const changes = q === 'rest' ? { type: 'rest' } : q === 'match' ? { type: 'match' }
        : q === 'cancel' ? { cancelled: true } : { cancelled: false };
      const label = { rest: 'Marcado como descanso', match: 'Vuelve a ser partido', cancel: 'Actividad cancelada', uncancel: 'Actividad reactivada' }[q];
      if (q === 'cancel' && !confirm('¿Cancelar esta actividad? Las jugadoras verán que está cancelada.')) return;
      await adminCall('clover_admin_save_event', { p_event: eventPayload(ev, changes) }, label + ' ✓');
    },
    editev(el) { openEventForm(S.data.eventsById.get(Number(el.dataset.id))); },
    newev(el) {
      if (!(isCaptain() && S.pin)) { toast('Entra primero en el panel de capitana con tu PIN.', 'err'); return; }
      openEventForm(null, el.dataset.date);
    },
    async delev(el) {
      if (!confirm('¿Borrar esta actividad y todas sus respuestas? No se puede deshacer.')) return;
      const r = await adminCall('clover_admin_delete_event', { p_id: Number(el.dataset.id) }, 'Actividad borrada');
      if (r) closeSheet();
    },
    newvac() {
      Object.assign(S.drafts, { 'vac.name': '', 'vac.start': '', 'vac.end': '' });
      openSheet({ kind: 'vacForm', id: null });
    },
    editvac(el) {
      const v = S.data.vacations.find((x) => x.id === Number(el.dataset.id));
      Object.assign(S.drafts, { 'vac.name': v.name, 'vac.start': v.start_date, 'vac.end': v.end_date });
      openSheet({ kind: 'vacForm', id: v.id });
    },
    async delvac(el) {
      if (!confirm('¿Borrar este periodo de vacaciones? Los días volverán a tener actividades.')) return;
      const r = await adminCall('clover_admin_delete_vacation', { p_id: Number(el.dataset.id) }, 'Periodo borrado');
      if (r) closeSheet();
    },
    newplayer() {
      Object.assign(S.drafts, { 'pl.name': '', 'pl.role': 'player', 'pl.active': true });
      openSheet({ kind: 'playerForm', id: null });
    },
    editplayer(el) {
      const p = S.data.playersById.get(Number(el.dataset.id));
      Object.assign(S.drafts, { 'pl.name': p.name, 'pl.role': p.role, 'pl.active': p.active });
      openSheet({ kind: 'playerForm', id: p.id });
    },
  };

  const forms = {
    code(f) {
      const code = f.code.value.trim().toLowerCase();
      if (!code) return;
      S.code = code;
      store.set('code', code);
      S.loadError = null;
      render();
      loadState();
    },
    login(f) {
      const id = Number(f.who.value);
      if (!id) return;
      S.me = id;
      store.set('me', id);
      S.view = 'cal';
      store.set('view', 'cal');
      S.month = null;
      render();
      const p = me();
      toast(p.role === 'coach' ? `Hola, ${p.name}. Modo consulta.` : `¡Hola, ${p.name}!`);
    },
    async pin(f) {
      const pin = f.pin.value;
      try {
        await rpc('clover_admin_login', { p_code: S.code, p_pin: pin });
        S.pin = pin;
        store.set('pin', pin);
        toast('Panel de capitana desbloqueado ✓');
        render();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    async event() {
      const g = (k) => S.drafts['ev.' + k];
      if (!g('date')) { toast('Indica la fecha.', 'err'); return; }
      const payload = {
        id: S.sheet.id, date: g('date'), type: g('type'), time: g('time') || null, title: g('title'),
        location: g('location'), notes: g('notes'), cancelled: !!g('cancelled'),
      };
      const r = await adminCall('clover_admin_save_event', { p_event: payload }, 'Actividad guardada ✓');
      if (r) {
        S.month = { y: Number(payload.date.slice(0, 4)), m: Number(payload.date.slice(5, 7)) - 1 };
        openSheet({ kind: 'event', id: r.id });
      }
    },
    async vac() {
      const r = await adminCall('clover_admin_save_vacation', {
        p_vac: { id: S.sheet.id, name: S.drafts['vac.name'], start_date: S.drafts['vac.start'], end_date: S.drafts['vac.end'] },
      }, 'Vacaciones guardadas ✓');
      if (r) closeSheet();
    },
    async player() {
      const r = await adminCall('clover_admin_save_player', {
        p_player: { id: S.sheet.id, name: S.drafts['pl.name'], role: S.drafts['pl.role'], active: !!S.drafts['pl.active'] },
      }, 'Guardado ✓');
      if (r) closeSheet();
    },
    async bulk() {
      const time = S.drafts['bulk.time'] || '';
      const loc = (S.drafts['bulk.loc'] || '').trim();
      if (!time && !loc) { toast('Escribe una hora o un lugar.', 'err'); return; }
      const type = S.drafts['bulk.type'] || 'training';
      const wd = S.drafts['bulk.wd'] || '';
      const r = await adminCall('clover_admin_bulk_events', {
        p_type: type, p_weekday: wd ? Number(wd) : null, p_time: time || null, p_location: loc || null,
      });
      if (r) {
        toast(`Actualizadas ${r.count} actividades ✓`);
        delete S.drafts['bulk.time'];
        delete S.drafts['bulk.loc'];
        render();
      }
    },
    async threshold() {
      const r = await adminCall('clover_admin_set_threshold', { p_value: Number(S.drafts.thr) }, 'Umbral guardado ✓');
      if (r) { delete S.drafts.thr; render(); }
    },
    async newpin() {
      const np = S.drafts.newpin || '';
      if (np.length < 6) { toast('El PIN debe tener al menos 6 caracteres.', 'err'); return; }
      const r = await adminCall('clover_admin_change_pin', { p_new_pin: np }, 'PIN cambiado ✓');
      if (r) {
        S.pin = np;
        store.set('pin', np);
        delete S.drafts.newpin;
        render();
      }
    },
  };

  // -------------------------------------------------------------------
  //  Eventos del navegador
  // -------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) fn(f);
  });

  function syncDraft(el) {
    const key = el.dataset.draft;
    if (!key) return;
    S.drafts[key] = el.type === 'checkbox' ? el.checked : el.value;
  }
  document.addEventListener('input', (e) => syncDraft(e.target));

  document.addEventListener('change', (e) => {
    const el = e.target;
    syncDraft(el);
    const act = el.dataset.actChange;
    if (act === 'comment') {
      const id = Number(el.dataset.id);
      const st = statusOf(S.me, id);
      const a = entry(S.me, id);
      const cm = el.value.trim();
      if (st !== 'none' && cm !== ((a && a.c) || '')) setMine([id], st, cm || null);
    } else if (act === 'bydate') {
      S.byDateEvent = Number(el.value);
      render();
    }
  });

  document.addEventListener('focusout', () => {
    setTimeout(() => { if (S.pendingRender) safeRender(); }, 50);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.sheet) closeSheet();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { poll(); render(); }
  });
  window.addEventListener('online', poll);

  // -------------------------------------------------------------------
  //  Arranque
  // -------------------------------------------------------------------

  const urlCode = codeFromUrl();
  if (urlCode) store.set('code', urlCode.trim().toLowerCase());
  S.code = store.get('code');
  render();
  if (configOk() && S.code) loadState();
  setInterval(poll, POLL_MS);
})();
