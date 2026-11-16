'use strict';
/* =========================================================
   Gastos · PWA personal
   Datos: Google Sheet vía Apps Script (o modo demo local)
   ========================================================= */

const LS = { cfg: 'gastos.cfg', data: 'gastos.data', queue: 'gastos.queue', prefs: 'gastos.prefs' };
const ACCENTS = ['#D4FF3A', '#6BFFC8', '#8B7CFF', '#FFB84D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_S = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WD_S = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SHEET_KEY = { Fijos: 'fijos', Metas: 'metas', Retos: 'retos', Reglas: 'reglas', Categorias: 'cats' };

const S = {
  cfg: { url: '', token: '', demo: false },
  data: emptyData(),
  queue: [],
  prefs: { accent: ACCENTS[0], calm: false, sim: { precio: '200.000', entrada: '20', gastos: '12', anos: '30', tin: '3' } },
  route: 'inicio', prevRoute: 'inicio', lastRendered: null,
  syncing: false, syncErr: null,
  previews: {},
  ui: freshUI()
};

function emptyData() {
  return { movs: [], cats: [], fijos: [], metas: [], retos: [], reglas: [], config: {}, sheetUrl: '' };
}
function freshUI() {
  return { tablaYear: 0, movQ: '', movCat: 'Todo', movMonth: 0, statsPeriod: '6m', statsSel: {}, statsGen: 0, heatDay: null, donutCat: null, betPeriod: 'mes', betGen: 0, story: 0, storyGen: 0, sheet: null, form: {}, add: null, ping: null };
}

/* ---------- Utilidades ---------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fmt(n, d = 2, sign = false) {
  const neg = n < 0;
  const parts = Math.abs(n).toFixed(d).split('.');
  const g = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = parts[1] ? g + ',' + parts[1] : g;
  return (neg ? '−' : (sign && n > 0 ? '+' : '')) + body;
}
const eur = (n, d = 2, sign = false) => fmt(n, d, sign) + ' €';
function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function isoDay(d) { return isoLocal(d).slice(0, 10); }
function parseD(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
function hhmm(s) { const d = parseD(s); return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''; }
function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
function addMonths(d, n) {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setDate(1); r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, daysIn(r.getFullYear(), r.getMonth())));
  return r;
}
function dayDiff(a, b) {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((y - x) / 86400000);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function rgba(hex, a) {
  const h = String(hex || '#9C9CA6').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function icon(name, size = 20, sw = 2) {
  const inner = ICONS[name] || ICONS.ellipsis;
  return '<svg class="i" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
function parseAmount(s) { const n = parseFloat(String(s || '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* almacenamiento lleno o bloqueado */ } }
function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function acc() { return S.prefs.accent || ACCENTS[0]; }

/* ---------- Datos ---------- */

function normData(d) {
  d = Object.assign(emptyData(), d || {});
  const bool = (v) => v === true || v === 'TRUE' || v === 'true' || v === 1;
  d.movs = (d.movs || []).map((m) => Object.assign({}, m, { importe: Number(m.importe) || 0, cobro: bool(m.cobro), tipo: m.tipo || 'gasto' }));
  d.cats = (d.cats || []).map((c) => Object.assign({}, c, { presupuesto: Number(c.presupuesto) || 0, orden: Number(c.orden) || 0, tipo: c.tipo || 'gasto' })).sort((a, b) => a.orden - b.orden);
  d.fijos = (d.fijos || []).map((f) => Object.assign({}, f, { importe: Number(f.importe) || 0, frecuencia_meses: Number(f.frecuencia_meses) || 1, tipo: f.tipo || 'gasto' }));
  d.metas = (d.metas || []).map((m) => Object.assign({}, m, { objetivo: Number(m.objetivo) || 0, ahorrado: Number(m.ahorrado) || 0, principal: bool(m.principal) }));
  d.retos = (d.retos || []).map((r) => Object.assign({}, r, { inicio: Number(r.inicio) || 0, objetivo: Number(r.objetivo) || 0, banca: Number(r.banca) || 0, estado: r.estado || 'activo' }));
  d.reglas = d.reglas || [];
  d.config = d.config || {};
  sortMovs(d);
  return d;
}
function sortMovs(d = S.data) { d.movs.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))); }
function save() { store(LS.data, S.data); store(LS.queue, S.queue); }

function cat(name) {
  return S.data.cats.find((c) => c.nombre === name) || { nombre: name || 'Otros', icono: 'ellipsis', color: '#9C9CA6', presupuesto: 0, tipo: 'gasto' };
}
function catsOf(tipo) { return S.data.cats.filter((c) => c.tipo === tipo); }
function movLook(m) {
  if (m.tipo === 'apuesta') return { icono: m.cobro ? 'trophy' : 'ticket', color: m.cobro ? acc() : '#FF5D73' };
  const c = cat(m.categoria);
  return { icono: c.icono || 'ellipsis', color: c.color || '#9C9CA6' };
}
function signed(m) {
  if (m.tipo === 'ingreso') return m.importe;
  if (m.tipo === 'apuesta') return m.cobro ? m.importe : -m.importe;
  return -m.importe;
}

function monthData(y, mo) {
  const movs = S.data.movs.filter((x) => { const d = parseD(x.fecha); return d && d.getFullYear() === y && d.getMonth() === mo; });
  const gastosAll = movs.filter((x) => x.tipo === 'gasto');
  const gastos = gastosAll.filter((x) => x.origen !== 'fijo-largo');
  const byCat = {};
  gastos.forEach((g) => { byCat[g.categoria] = (byCat[g.categoria] || 0) + g.importe; });
  const bets = movs.filter((x) => x.tipo === 'apuesta');
  return {
    movs, gastos, gastosAll, byCat,
    spentVar: sum(gastos.map((g) => g.importe)),
    cash: sum(gastosAll.map((g) => g.importe)),
    income: sum(movs.filter((x) => x.tipo === 'ingreso').map((x) => x.importe)),
    dep: sum(bets.filter((b) => !b.cobro).map((b) => b.importe)),
    ret: sum(bets.filter((b) => b.cobro).map((b) => b.importe))
  };
}
function apartadoMensual() {
  return sum(S.data.fijos.filter((f) => f.frecuencia_meses > 1 && f.tipo === 'gasto').map((f) => f.importe / f.frecuencia_meses));
}
function upcomingThisMonth(now) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
  return S.data.fijos
    .filter((f) => f.frecuencia_meses === 1 && f.tipo === 'gasto')
    .map((f) => ({ f, d: parseD(f.proximo) }))
    .filter((x) => x.d && x.d > now && x.d <= end);
}
function incomeBase() {
  const f = S.data.fijos.filter((x) => x.tipo === 'ingreso' && x.frecuencia_meses === 1);
  return f.length ? sum(f.map((x) => x.importe)) : (Number(S.data.config.nomina) || 0);
}
function extrasPerMonth() {
  return sum(S.data.fijos.filter((x) => x.tipo === 'ingreso' && x.frecuencia_meses > 1).map((x) => x.importe / x.frecuencia_meses));
}
function pendingIncomeThisMonth(now) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
  return sum(S.data.fijos.filter((f) => f.tipo === 'ingreso').map((f) => ({ f, d: parseD(f.proximo) })).filter((x) => x.d && x.d > now && x.d <= end).map((x) => x.f.importe));
}
function avgCash() {
  const now = new Date(); const vals = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const md = monthData(d.getFullYear(), d.getMonth());
    if (md.movs.length) vals.push(md.cash);
  }
  if (vals.length) return sum(vals) / vals.length;
  const md = monthData(now.getFullYear(), now.getMonth());
  return md.cash / now.getDate() * daysIn(now.getFullYear(), now.getMonth());
}
function savingRate() { return incomeBase() + extrasPerMonth() - avgCash(); }
function nextCharge() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const list = S.data.fijos.filter((f) => f.tipo === 'gasto').map((f) => ({ f, d: parseD(f.proximo) })).filter((x) => x.d && x.d >= today).sort((a, b) => a.d - b.d);
  return list[0] || null;
}

/* ---------- Sincronización ---------- */

async function apiGet(params) {
  const u = S.cfg.url + '?' + new URLSearchParams(Object.assign({ token: S.cfg.token }, params)).toString();
  const r = await fetch(u, { redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}
async function apiPost(body) {
  const r = await fetch(S.cfg.url, { method: 'POST', redirect: 'follow', body: JSON.stringify(Object.assign({ token: S.cfg.token }, body)) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}
async function flush() {
  while (S.queue.length) {
    const op = S.queue[0];
    const res = await apiPost(op);
    if ((op.action === 'add_mov' || op.action === 'update_mov') && res.ticket) {
      const m = S.data.movs.find((x) => x.id === op.mov.id);
      if (m) m.ticket = res.ticket;
      delete S.previews[op.mov.id];
    }
    S.queue.shift();
    save();
  }
}
async function sync() {
  if (S.cfg.demo || !S.cfg.url || S.syncing) return;
  S.syncing = true; updateSyncChip();
  try {
    await flush();
    const j = await apiGet({ action: 'all' });
    S.data = normData(j.data);
    S.syncErr = null;
    save();
  } catch (e) {
    S.syncErr = navigator.onLine === false ? 'Sin conexión' : (e.message || 'Error');
  }
  S.syncing = false;
  if (!S.ui.sheet && S.route !== 'add' && S.route !== 'resumen') render(); else updateSyncChip();
}
function enqueue(op) {
  applyLocal(op);
  if (!S.cfg.demo) S.queue.push(op);
  save();
  if (!S.cfg.demo) setTimeout(sync, 50);
}
function applyLocal(op) {
  const d = S.data;
  if (op.action === 'add_mov') {
    if (!d.movs.some((m) => m.id === op.mov.id)) d.movs.push(Object.assign({}, op.mov));
  } else if (op.action === 'update_mov') {
    const i = d.movs.findIndex((m) => m.id === op.mov.id);
    if (i > -1) d.movs[i] = Object.assign({}, d.movs[i], op.mov); else d.movs.push(Object.assign({}, op.mov));
  } else if (op.action === 'delete_mov') {
    d.movs = d.movs.filter((m) => m.id !== op.id);
  } else if (op.action === 'upsert') {
    if (op.sheet === 'Config') { d.config[op.obj.clave] = op.obj.valor; return; }
    const key = op.key || 'id';
    const arr = d[SHEET_KEY[op.sheet]];
    const i = arr.findIndex((x) => String(x[key]) === String(op.obj[key]));
    if (i > -1) arr[i] = Object.assign({}, arr[i], op.obj); else arr.push(Object.assign({}, op.obj));
    S.data = normData(d);
    return;
  } else if (op.action === 'remove') {
    const key = op.key || 'id';
    const k = SHEET_KEY[op.sheet];
    if (k) d[k] = d[k].filter((x) => String(x[key]) !== String(op.id));
  }
  sortMovs(d);
}

/* ---------- Componentes ---------- */

function tabbar(active) {
  const t = (id, ic, label) => '<a href="#' + id + '" class="' + (active === id ? 'on' : '') + '"' + (active === id ? ' aria-current="page"' : '') + '>' + icon(ic, 22) + '<span>' + label + '</span></a>';
  return '<nav class="tabbar" aria-label="Navegación principal">' + t('inicio', 'house', 'Inicio') + t('movs', 'list', 'Movimientos') +
    '<a href="#add" class="fab" aria-label="Añadir movimiento" style="display:flex;align-items:center;justify-content:center">' + icon('plus', 26, 2.6) + '</a>' +
    t('objetivos', 'target', 'Objetivos') + t('mas', 'layout-grid', 'Más') + '</nav>';
}
function subHeader(title, back = 'mas') {
  return '<header class="row in"><a href="#' + back + '" class="ibtn" aria-label="Volver">' + icon('chevron-left', 18, 2.4) + '</a><h1 style="font-size:24px;line-height:1.15">' + title + '</h1></header>';
}
function glow(color, top, side, size = 380, dur = 12) {
  return '<div class="glow" aria-hidden="true" style="top:' + top + 'px;' + side + ':-110px;width:' + size + 'px;height:' + size + 'px;background:radial-gradient(circle,' + rgba(color, 0.14) + ',rgba(0,0,0,0) 65%);animation-duration:' + dur + 's"></div>';
}
function syncChip() {
  let label = 'Sincronizado', color = acc(), ic = null, anim = 'livePulse 2s ease-out infinite';
  if (S.cfg.demo) { label = 'Modo demo'; color = '#FFB84D'; anim = 'none'; }
  else if (S.syncing) { label = 'Sincronizando'; anim = 'none'; ic = 'refresh-cw'; }
  else if (S.queue.length) { label = S.queue.length + ' pendiente' + (S.queue.length > 1 ? 's' : ''); color = '#FFB84D'; anim = 'amberPulse 1.8s ease-out infinite'; }
  else if (S.syncErr) { label = S.syncErr; color = '#FF5D73'; anim = 'none'; ic = 'cloud-off'; }
  const lead = ic ? '<span style="color:' + color + ';' + (S.syncing ? 'animation:spin 1s linear infinite' : '') + '">' + icon(ic, 14, 2.4) + '</span>' : '<span class="dot" style="background:' + color + ';animation:' + anim + '"></span>';
  return '<button id="syncchip" data-act="sync" class="row press" style="gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);font-size:12px;font-weight:700;color:#C8C8D0">' + lead + '<span>' + esc(label) + '</span></button>';
}
function updateSyncChip() { const el = $('#syncchip'); if (el) el.outerHTML = syncChip(); }

function ring(size, stroke, pct, color, delay = 0.5, track = '#232328') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" fill="none" style="transform:rotate(-90deg)" aria-hidden="true">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="' + track + '" stroke-width="' + stroke + '"/>' +
    '<circle class="draw" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" style="stroke-dasharray:' + (clamp(pct, 0, 100) / 100 * c).toFixed(1) + ' ' + c.toFixed(1) + ';--d:' + delay + 's"/></svg>';
}
function tank(size, pct, color, inner) {
  const p = clamp(pct, 0, 100);
  const top = Math.round(size * (1 - p / 100)) - Math.round(size * 0.04);
  const w = size * 2;
  return '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;overflow:hidden;background:#1B1B20;box-shadow:inset 0 0 0 2px ' + rgba(color, 0.22) + ',0 0 50px ' + rgba(color, 0.08) + '">' +
    '<div aria-hidden="true" style="position:absolute;left:' + (-size / 2) + 'px;top:' + (top - 6) + 'px;width:' + w + 'px;height:' + w + 'px;border-radius:42%;background:' + rgba(color, 0.38) + ';animation:spin 9s linear infinite,fillUp 2s var(--ease) .3s backwards"></div>' +
    '<div aria-hidden="true" style="position:absolute;left:' + (-size / 2) + 'px;top:' + top + 'px;width:' + w + 'px;height:' + w + 'px;border-radius:40%;background:' + color + ';animation:spin 6s linear infinite reverse,fillUp 2s var(--ease) .3s backwards"></div>' +
    '<span aria-hidden="true" style="position:absolute;left:32%;bottom:6px;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.7);animation:bubble 3s ease-in 2.4s infinite"></span>' +
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:' + Math.round(size * 0.14) + 'px">' + inner + '</div></div>';
}

function movRow(m, i, withActs) {
  const look = movLook(m);
  const time = hhmm(m.fecha);
  const amt = signed(m);
  const color = amt > 0 ? acc() : (m.tipo === 'apuesta' ? '#FF8A9A' : 'var(--tx)');
  const tags = [];
  if (m.origen === 'applepay') tags.push('<span class="tag" style="color:#C3B9FF;background:rgba(139,124,255,.13)">' + icon('zap', 10, 2.6) + 'Auto</span>');
  if (m.origen === 'siri') tags.push('<span class="tag" style="color:#F9A8D4;background:rgba(244,114,182,.13)">' + icon('mic', 10, 2.6) + 'Siri</span>');
  if (m.origen === 'fijo' || m.origen === 'fijo-largo') tags.push('<span class="tag" style="color:#FFB84D;background:rgba(255,184,77,.12)">' + icon('repeat', 10, 2.6) + 'Fijo</span>');
  if (m.ticket) tags.push('<span class="tag" style="color:#C8C8D0;background:rgba(255,255,255,.07)">' + icon('receipt', 10, 2.6) + 'Ticket</span>');
  const sub = m.tipo === 'apuesta' ? (m.reto || 'Apuesta suelta') + ' · ' + (m.cobro ? 'cobro' : 'depósito') : m.categoria;
  const title = m.concepto || m.categoria || (m.tipo === 'apuesta' ? 'Apuesta' : 'Movimiento');
  const front = '<span class="ico" style="background:' + rgba(look.color, 0.14) + ';color:' + look.color + '">' + icon(look.icono, 20) + '</span>' +
    '<span class="col grow" style="gap:3px"><span style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</span>' +
    '<span class="row" style="gap:6px;flex-wrap:wrap"><span class="small muted">' + esc(sub) + (time ? ' · ' + time : '') + '</span>' + tags.join('') + '</span>' +
    (m.nota ? '<span class="small" style="color:var(--tx4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(m.nota) + '</span>' : '') + '</span>' +
    '<span class="num" style="font-size:14px;font-weight:600;color:' + color + ';white-space:nowrap">' + eur(amt, 2, true) + '</span>';
  const delay = '--d:' + Math.min(0.15 + i * 0.045, 0.9).toFixed(2) + 's';
  if (!withActs) return '<div class="row in" style="padding:12px;border-radius:20px;background:var(--s1);border:1px solid rgba(255,255,255,.05);' + delay + '">' + front + '</div>';
  const acts = [];
  if (m.ticket) acts.push('<button data-act="mov-ticket" data-id="' + esc(m.id) + '" style="background:#5AC8FF">' + icon('receipt', 18) + 'Ticket</button>');
  acts.push('<button data-act="mov-edit" data-id="' + esc(m.id) + '" style="background:#8B7CFF">' + icon('pencil', 18) + 'Editar</button>');
  acts.push('<button data-act="mov-del" data-id="' + esc(m.id) + '" style="background:#FF5D73">' + icon('trash-2', 18) + 'Borrar</button>');
  return '<div class="mov in" style="' + delay + ';--open:-' + (acts.length * 72) + 'px"><div class="acts">' + acts.join('') + '</div>' +
    '<button class="front" data-act="mov-toggle" aria-label="Opciones de ' + esc(title) + '">' + front + '</button></div>';
}

/* ---------- Pantalla: Inicio ---------- */

function scrInicio() {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), day = now.getDate(), dim = daysIn(y, mo);
  const md = monthData(y, mo);
  const ap = apartadoMensual();
  const nomina = Math.max(md.income + pendingIncomeThisMonth(now), incomeBase());
  const up = upcomingThisMonth(now);
  const pendingSum = sum(up.map((x) => x.f.importe));
  const budg = catsOf('gasto').filter((c) => c.presupuesto > 0);
  const budgetTotal = sum(budg.map((c) => c.presupuesto));
  const spentBudg = sum(budg.map((c) => md.byCat[c.nombre] || 0));
  const pendingBudg = sum(up.filter((x) => budg.some((c) => c.nombre === x.f.categoria)).map((x) => x.f.importe));
  const daysLeft = dim - day + 1;
  const remaining = budgetTotal > 0 ? budgetTotal - spentBudg - pendingBudg : nomina - ap - pendingSum - md.spentVar;
  const today = Math.max(0, remaining) / daysLeft;
  const spent = md.spentVar + ap;
  const pct = nomina ? clamp(spent / nomina * 100, 0, 100) : 0;
  const mpct = day / dim * 100;
  const daily = md.spentVar / day;
  const saveP = nomina - daily * dim - ap - pendingSum;
  const th = Math.PI * (1 - mpct / 100);
  const mx = (150 + 130 * Math.cos(th)).toFixed(1), my = (150 - 130 * Math.sin(th)).toFixed(1);
  const hour = now.getHours();
  const hello = hour < 13 ? 'Buenos días' : (hour < 20 ? 'Buenas tardes' : 'Buenas noches');
  const pendNames = up.filter((x) => budg.some((c) => c.nombre === x.f.categoria)).map((x) => x.f.nombre);
  const nc = nextCharge();
  let banner = '';
  if (nc) {
    const dd = dayDiff(new Date(), nc.d);
    if (dd <= 3) banner = '<a href="#fijos" class="banner in" style="--d:.06s;background:rgba(255,184,77,.1);border:1px solid rgba(255,184,77,.25);color:#FFD08A"><span class="dot" style="background:#FFB84D;animation:amberPulse 1.8s ease-out infinite"></span><span class="grow">' + (dd === 0 ? 'Hoy' : dd === 1 ? 'Mañana' : 'En ' + dd + ' días') + ' te cobran ' + esc(nc.f.nombre) + ' (' + eur(nc.f.importe) + ')</span>' + icon('chevron-right', 16, 2.4) + '</a>';
  }

  // Apuestas: balance del mes
  const bets = md.movs.filter((x) => x.tipo === 'apuesta').sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const anyBets = S.data.movs.some((x) => x.tipo === 'apuesta');
  let betCard = '';
  if (anyBets) {
    const net = md.ret - md.dep;
    let c = 0; const ser = [0].concat(bets.map((b) => (c += signed(b))));
    const mn = Math.min(0, ...ser), mxv = Math.max(0, ...ser);
    const pts = ser.map((v, i) => [(ser.length > 1 ? i / (ser.length - 1) : 1) * 90, 4 + (mxv - v) / ((mxv - mn) || 1) * 28]);
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const col = net >= 0 ? acc() : '#FF5D73';
    betCard = '<a href="#apuestas" class="row in press" style="--d:.2s;padding:14px 16px;border-radius:24px;background:var(--s1);border:1px solid var(--line);color:var(--tx);gap:14px">' +
      '<span class="ico" style="background:rgba(255,93,115,.13);color:#FF5D73">' + icon('ticket', 20) + '</span>' +
      '<span class="col grow" style="gap:2px"><span class="small muted">Apuestas · balance de ' + MONTHS[mo] + '</span><span class="num" style="font-size:18px;font-weight:600;color:' + col + '">' + eur(net, 2, true) + '</span></span>' +
      (pts.length > 1 ? '<svg width="90" height="36" viewBox="0 0 90 36" fill="none" aria-hidden="true"><path d="M0 ' + (4 + mxv / ((mxv - mn) || 1) * 28).toFixed(1) + 'H90" stroke="#2C2C33" stroke-dasharray="3 4"/><polyline class="draw" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:' + (len * 1.1).toFixed(0) + ' 0;--d:.8s"/></svg>' : '') +
      '<span style="color:#6E6E78">' + icon('chevron-right', 16, 2.4) + '</span></a>';
  }

  const tiles = budg.map((c, i) => {
    const s = md.byCat[c.nombre] || 0;
    const p = Math.round(s / c.presupuesto * 100);
    const col = p >= 100 ? '#FF5D73' : (p >= 70 ? '#FFB84D' : acc());
    const bg = p >= 100 ? 'rgba(255,93,115,.12)' : (p >= 70 ? 'rgba(255,184,77,.12)' : rgba(acc(), 0.1));
    return '<div class="in" style="--d:' + (0.32 + i * 0.06).toFixed(2) + 's;width:134px;flex-shrink:0;padding:14px;border-radius:24px;background:var(--s1);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px">' +
      '<div style="position:relative;width:58px;height:58px">' + ring(58, 5, p, col, 0.6 + i * 0.08) +
      '<div style="position:absolute;inset:9px;border-radius:50%;background:' + rgba(c.color, 0.14) + ';color:' + c.color + ';display:flex;align-items:center;justify-content:center">' + icon(c.icono, 20) + '</div></div>' +
      '<div class="col" style="gap:3px"><span style="font-size:14px;font-weight:700">' + esc(c.nombre) + '</span><span class="small muted num" style="font-family:inherit">' + fmt(s) + ' / ' + fmt(c.presupuesto, 0) + ' €</span></div>' +
      '<span class="pill" style="align-self:flex-start;background:' + bg + ';color:' + col + '">' + (p >= 100 ? 'Al límite' : p + ' %') + '</span></div>';
  }).join('');

  const latest = S.data.movs.slice(0, 5);
  const empty = !S.data.movs.length;

  return '<div class="page">' + glow(acc(), -110, 'left') + glow('#8B7CFF', 640, 'right', 320, 14) +
    '<header class="between in" style="align-items:center"><div class="row"><div aria-hidden="true" style="width:46px;height:46px;border-radius:50%;padding:2px;background:conic-gradient(' + acc() + ',#8B7CFF,' + acc() + ')"><div style="width:100%;height:100%;border-radius:50%;background:#16161A;display:flex;align-items:center;justify-content:center;font-family:var(--num);font-size:16px;font-weight:600">' + esc((S.data.config.nombre || 'C').charAt(0)) + '</div></div>' +
    '<div class="col" style="gap:1px"><span class="muted" style="font-size:13px">' + hello + '</span><span style="font-size:18px;font-weight:700">' + esc(S.data.config.nombre || 'Carlos') + '</span></div></div>' + syncChip() + '</header>' +
    '<div class="between in" style="--d:.04s;align-items:center"><h1>' + cap(MONTHS[mo]) + '</h1><a href="#mensual" class="chip" style="color:var(--tx)">' + icon('sheet', 15, 2.2) + 'Resumen</a></div>' + banner +
    '<section class="in" aria-label="Puedes gastar hoy" style="--d:.08s;position:relative;overflow:hidden;border-radius:30px;padding:22px 20px;background:' + acc() + ';color:#0B0B0D;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 18px 40px ' + rgba(acc(), 0.22) + '">' +
    '<div aria-hidden="true" style="position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.45),rgba(255,255,255,0));animation:shimmer 4s ease-in-out 1.6s infinite"></div>' +
    '<div class="col" style="position:relative;gap:4px"><span style="font-size:13px;font-weight:800">Puedes gastar hoy</span><span class="num" data-count="' + today.toFixed(2) + '" data-suffix=" €" style="font-size:42px;font-weight:700;letter-spacing:-1.8px">' + eur(today) + '</span>' +
    '<span style="font-size:12px;font-weight:600;opacity:.72">' + eur(Math.max(0, remaining), 0) + ' para los ' + daysLeft + ' días que quedan.' + (pendNames.length ? ' Ya descuenta ' + esc(pendNames.join(', ')) + '.' : '') + '</span></div>' +
    '<div aria-hidden="true" style="position:relative;width:64px;height:64px;flex-shrink:0;animation:floaty 3.2s ease-in-out infinite">' + ring(64, 6, daysLeft / dim * 100, '#0B0B0D', 0.6, 'rgba(11,11,13,.14)') +
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1"><span class="num" style="font-size:16px;font-weight:700">' + daysLeft + '</span><span style="font-size:9px;font-weight:800">días</span></div></div></section>' +

    '<section class="card hero in" aria-label="Resumen del mes" style="--d:.14s;display:flex;flex-direction:column;gap:16px;padding:22px 16px 16px">' +
    '<div style="position:relative;width:300px;max-width:100%;height:176px;align-self:center"><svg viewBox="0 0 300 176" width="100%" height="176" fill="none" role="img" aria-label="Has gastado el ' + Math.round(pct) + ' % de la nómina">' +
    '<defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + acc() + '"/><stop offset="1" stop-color="#6BFFC8"/></linearGradient></defs>' +
    '<path d="M20 150 A130 130 0 0 1 280 150" stroke="#232328" stroke-width="18" stroke-linecap="round"/>' +
    '<path class="draw" d="M20 150 A130 130 0 0 1 280 150" stroke="url(#gg)" stroke-width="18" stroke-linecap="round" style="stroke-dasharray:' + (pct / 100 * 408.4).toFixed(1) + ' 1000;--d:.4s"/>' +
    '<circle class="fade" cx="' + mx + '" cy="' + my + '" r="7" fill="#0B0B0D" stroke="#F4F4F5" stroke-width="3" style="--d:1.3s"/></svg>' +
    '<div class="col" style="position:absolute;left:0;right:0;bottom:4px;align-items:center;gap:4px"><span style="font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--tx3)">Gastado</span>' +
    '<span class="num" data-count="' + spent.toFixed(2) + '" data-suffix=" €" style="font-size:34px;font-weight:600;letter-spacing:-1.4px">' + eur(spent) + '</span><span class="muted" style="font-size:13px">de ' + eur(nomina, 0) + ' de ingresos · día ' + day + ' de ' + dim + '</span></div></div>' +
    '<div class="row fade" style="--d:1.1s;justify-content:center;gap:18px;font-size:12px;color:var(--tx2)"><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:' + acc() + '"></span>' + Math.round(pct) + ' % de la nómina</span><span class="row" style="gap:6px"><span style="width:8px;height:8px;border-radius:50%;border:2px solid var(--tx)"></span>' + Math.round(mpct) + ' % del mes</span></div>' +
    '<div class="grid3"><div class="mini in" style="--d:.55s;background:' + rgba(acc(), 0.07) + ';border-color:' + rgba(acc(), 0.16) + '"><span class="l">Ahorro previsto</span><span class="v" style="color:' + (saveP >= 0 ? acc() : '#FF5D73') + '">' + (saveP >= 0 ? '~' : '') + fmt(saveP, 0) + ' €</span></div>' +
    '<div class="mini in" style="--d:.62s"><span class="l">Media al día</span><span class="v">' + fmt(daily) + ' €</span></div>' +
    '<div class="mini in" style="--d:.69s"><span class="l">Fijos apartados</span><span class="v">' + fmt(ap, 0) + ' €</span></div></div>' +
    '<div class="grid3" style="margin-top:-6px"><div class="mini in" style="--d:.74s"><span class="l">Ingresos</span><span class="v" style="font-size:14px">' + fmt(md.income, 0) + ' €</span></div>' +
    '<div class="mini in" style="--d:.78s"><span class="l">Movimientos</span><span class="v" style="font-size:14px">' + md.movs.length + '</span></div>' +
    '<div class="mini in" style="--d:.82s"><span class="l">Gasto mayor</span><span class="v" style="font-size:14px">' + fmt(Math.max(0, ...md.gastos.map((g) => g.importe)), 0) + ' €</span></div></div></section>' +

    betCard +
    (tiles ? '<section class="col in" style="--d:.26s;gap:12px"><div class="between"><h2>Presupuestos</h2><span class="muted" style="font-size:13px">' + fmt(spentBudg) + ' / ' + fmt(budgetTotal, 0) + ' €</span></div><div class="hscroll">' + tiles + '</div></section>' : '') +

    '<section class="col in" style="--d:.32s;gap:10px"><div class="between"><h2>Últimos movimientos</h2><a href="#movs" style="font-size:13px;font-weight:700">Ver todo</a></div>' +
    (empty ? '<div class="card col fade" style="align-items:center;gap:10px;text-align:center;padding:28px"><span style="color:' + acc() + '">' + icon('sparkles', 28) + '</span><b>Todo listo</b><span class="muted small">Pulsa el botón + para apuntar tu primer gasto.</span></div>' : latest.map((m, i) => movRow(m, i + 6, false)).join('')) +
    '</section></div>' + tabbar('inicio');
}

/* ---------- Pantalla: Movimientos ---------- */

function movsMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + S.ui.movMonth, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}
function scrMovs() {
  const { y, m } = movsMonth();
  const md = monthData(y, m);
  const present = Array.from(new Set(md.movs.map((x) => x.tipo === 'apuesta' ? 'Apuestas' : x.categoria))).filter(Boolean);
  const chips = ['Todo'].concat(present).map((name) => {
    const on = S.ui.movCat === name;
    const c = name === 'Apuestas' ? { color: '#FF5D73' } : cat(name);
    return '<button class="chip' + (on ? ' on' : '') + '" data-act="mov-cat" data-v="' + esc(name) + '" aria-pressed="' + on + '">' + (name !== 'Todo' ? '<span class="dot" style="background:' + c.color + '"></span>' : '') + esc(name) + '</button>';
  }).join('');
  return '<div class="page">' +
    '<header class="between in" style="align-items:center"><h1>Movimientos</h1><button class="ibtn" data-act="export" aria-label="Exportar a CSV">' + icon('download', 18, 2.2) + '</button></header>' +
    '<div class="between in" style="--d:.03s;align-items:center"><button class="ibtn" data-act="mov-month" data-v="-1" aria-label="Mes anterior">' + icon('chevron-left', 18, 2.4) + '</button>' +
    '<span style="font-size:16px;font-weight:800">' + cap(MONTHS[m]) + ' ' + y + '</span><button class="ibtn" data-act="mov-month" data-v="1" aria-label="Mes siguiente" ' + (S.ui.movMonth >= 0 ? 'disabled style="opacity:.35"' : '') + '>' + icon('chevron-right', 18, 2.4) + '</button></div>' +
    '<div class="grid3 in" style="--d:.06s"><div class="mini"><span class="l">Gastos</span><span class="v" style="font-size:15px">' + fmt(md.cash, 0) + ' €</span></div><div class="mini"><span class="l">Ingresos</span><span class="v" style="font-size:15px;color:' + acc() + '">' + fmt(md.income, 0) + ' €</span></div><div class="mini"><span class="l">Apuestas</span><span class="v" style="font-size:15px">' + fmt(md.ret - md.dep, 0, true) + ' €</span></div></div>' +
    '<label class="in" style="--d:.09s;position:relative;display:flex"><span class="sr">Buscar</span><span style="position:absolute;left:15px;top:15px;color:#8A8A94">' + icon('search', 18, 2.2) + '</span>' +
    '<input class="input" type="search" data-inp="movQ" data-live="mov-search" value="' + esc(S.ui.movQ) + '" placeholder="Buscar por concepto, categoría o nota" style="padding-left:44px"></label>' +
    '<div class="hscroll in" role="group" aria-label="Filtrar" style="--d:.12s;gap:8px">' + chips + '</div>' +
    '<div id="movlist" class="col" style="gap:6px">' + movListHTML() + '</div></div>' + tabbar('movs');
}
function movListHTML() {
  const { y, m } = movsMonth();
  const q = S.ui.movQ.trim().toLowerCase();
  const list = S.data.movs.filter((x) => {
    const d = parseD(x.fecha);
    if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
    if (S.ui.movCat !== 'Todo') { const c = x.tipo === 'apuesta' ? 'Apuestas' : x.categoria; if (c !== S.ui.movCat) return false; }
    if (q && !((x.concepto || '') + ' ' + (x.categoria || '') + ' ' + (x.nota || '') + ' ' + (x.reto || '')).toLowerCase().includes(q)) return false;
    return true;
  });
  if (!list.length) return '<div class="col fade" style="align-items:center;gap:8px;padding:46px 0;color:var(--tx3)">' + icon('search', 32, 1.8) + '<b style="color:var(--tx)">Nada por aquí</b><span class="small">Prueba otra búsqueda, categoría o mes.</span></div>';
  const totals = {};
  list.forEach((x) => { const k = String(x.fecha).slice(0, 10); totals[k] = (totals[k] || 0) + signed(x); });
  let prev = null, out = '';
  const todayK = isoDay(new Date()), yestK = isoDay(new Date(Date.now() - 86400000));
  list.forEach((x, i) => {
    const k = String(x.fecha).slice(0, 10);
    if (k !== prev) {
      const d = parseD(x.fecha);
      const label = k === todayK ? 'Hoy' : k === yestK ? 'Ayer' : cap(WD[d.getDay()]) + ' ' + d.getDate();
      out += '<div class="dayhead fade" style="--d:' + Math.min(0.12 + i * 0.045, 0.9).toFixed(2) + 's"><span>' + label + '</span><span>' + eur(totals[k], 2, true) + '</span></div>';
      prev = k;
    }
    out += movRow(x, i, true).replace('class="mov in"', 'class="mov in" data-id="' + esc(x.id) + '"');
  });
  out += '<p class="small fade" style="color:var(--tx4);text-align:center;margin:10px 0 0">Toca un movimiento para ver el ticket, editarlo o borrarlo</p>';
  return out;
}

/* ---------- Pantalla: Añadir ---------- */

function newAdd(tipo = 'gasto') {
  const first = tipo === 'apuesta' ? (activeRetos()[0] ? activeRetos()[0].nombre : 'Suelta') : ((catsOf(tipo)[0] || {}).nombre || 'Otros');
  return { id: null, tipo, amount: '0', cat: first, concepto: '', nota: '', fecha: isoLocal(new Date()), flag: false, ticket: null, ticketUrl: '', origen: 'manual', saved: false };
}
function activeRetos() { return S.data.retos.filter((r) => r.estado !== 'perdido' && r.estado !== 'terminado'); }
function scrAdd() {
  const a = S.ui.add;
  const isBet = a.tipo === 'apuesta';
  const types = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['apuesta', 'Apuesta']];
  const ti = types.findIndex((t) => t[0] === a.tipo);
  const knobBg = a.tipo === 'ingreso' ? acc() : (isBet ? '#FF5D73' : 'var(--tx)');
  let options;
  if (isBet) options = activeRetos().map((r) => ({ nombre: r.nombre, icono: 'trophy', color: '#FF9F5A' })).concat([{ nombre: 'Suelta', icono: 'ticket', color: '#A78BFA' }]);
  else options = catsOf(a.tipo);
  const cur = options.find((o) => o.nombre === a.cat) || options[0] || { color: '#9C9CA6' };
  const cats = options.map((o) => {
    const on = o.nombre === a.cat;
    return '<button class="catbtn' + (on ? ' on' : '') + '" data-act="add-cat" data-v="' + esc(o.nombre) + '" aria-pressed="' + on + '">' +
      '<span class="b" style="background:' + (on ? o.color : rgba(o.color, 0.12)) + ';color:' + (on ? '#0B0B0D' : o.color) + ';border-color:' + (on ? rgba(o.color, 0.5) : 'transparent') + ';box-shadow:' + (on ? '0 10px 24px ' + rgba(o.color, 0.35) : 'none') + '">' + icon(o.icono, 22) + '</span><span>' + esc(o.nombre) + '</span></button>';
  }).join('');
  const amtColor = a.tipo === 'ingreso' || (isBet && a.flag) ? acc() : 'var(--tx)';
  const flagTitle = isBet ? 'Es un cobro' : 'Repetir cada mes';
  const flagSub = isBet ? (a.flag ? 'Dinero que retiras de la casa' : 'Ahora cuenta como depósito') : (a.flag ? 'Se añadirá a Fijos y suscripciones' : 'Movimiento puntual');
  const flagColor = isBet ? acc() : '#8B7CFF';
  const preview = a.ticket ? a.ticket.preview : (a.ticketUrl && S.previews[a.id]) || '';
  const ticketBlock = (a.ticket || a.ticketUrl) ?
    '<div class="row" style="padding:10px;border-radius:20px;background:var(--s1);border:1px solid rgba(90,200,255,.3)">' +
    (preview ? '<img src="' + preview + '" alt="Foto del ticket" style="width:56px;height:56px;border-radius:12px;object-fit:cover">' : '<span class="ico" style="background:rgba(90,200,255,.14);color:#5AC8FF">' + icon('receipt', 22) + '</span>') +
    '<span class="col grow" style="gap:2px"><b style="font-size:14px">Ticket adjunto</b><span class="small muted">' + (a.ticket ? 'Se subirá a tu Drive al guardar' : 'Guardado en tu Drive') + '</span></span>' +
    '<button class="ibtn" data-act="ticket-pick" aria-label="Cambiar foto">' + icon('camera', 18) + '</button><button class="ibtn" data-act="ticket-clear" aria-label="Quitar foto">' + icon('x', 18, 2.4) + '</button></div>' :
    '<button class="btn dash block" data-act="ticket-pick" style="min-height:52px">' + icon('camera', 18) + 'Foto del ticket</button>';
  return '<div class="page" style="gap:16px;padding-bottom:calc(var(--safe-b) + 24px)">' +
    '<div class="glow" aria-hidden="true" style="top:50px;left:50%;margin-left:-180px;width:360px;height:260px;background:radial-gradient(ellipse,' + rgba(cur.color, 0.15) + ',rgba(0,0,0,0) 68%);animation:none"></div>' +
    '<header class="row in"><a href="#' + (a.id ? 'movs' : S.prevRoute || 'inicio') + '" class="ibtn" aria-label="Cerrar">' + icon('x', 18, 2.4) + '</a>' +
    '<div class="seg grow" role="group" aria-label="Tipo" style="grid-template-columns:repeat(3,minmax(0,1fr))"><span class="knob" style="width:calc((100% - 8px)/3);left:calc(4px + ' + ti + ' * (100% - 8px)/3);background:' + knobBg + '"></span>' +
    types.map((t) => '<button class="' + (t[0] === a.tipo ? 'on' : '') + '" data-act="add-type" data-v="' + t[0] + '" aria-pressed="' + (t[0] === a.tipo) + '" style="font-size:13px">' + t[1] + '</button>').join('') + '</div></header>' +
    (a.id ? '<p class="small in" style="margin:-6px 0 0;text-align:center;color:#C3B9FF">Editando movimiento</p>' : '') +
    '<div class="col in" aria-live="polite" style="--d:.05s;align-items:center;gap:6px;padding:4px 0">' +
    '<div class="row" style="gap:4px"><span id="amt" class="num" style="font-size:56px;font-weight:600;letter-spacing:-2.5px;color:' + amtColor + ';display:inline-block">' + esc(a.amount) + '</span>' +
    '<span aria-hidden="true" style="width:3px;height:48px;border-radius:2px;background:' + acc() + ';animation:blink 1s infinite"></span><span class="num" style="font-size:28px;font-weight:500;color:var(--tx4);margin-left:6px">€</span></div>' +
    '<span class="muted" style="font-size:13px;font-weight:600">' + esc(a.cat) + (isBet ? (a.flag ? ' · cobro' : ' · depósito') : (a.flag ? ' · cada mes' : '')) + '</span></div>' +
    '<div class="catgrid in" role="group" aria-label="Categoría" style="--d:.1s">' + cats + '</div>' +
    '<div class="grid2 in" style="--d:.14s"><label class="field"><span>Concepto</span><input class="input" data-inp="add.concepto" value="' + esc(a.concepto) + '" placeholder="Repsol, Mercadona…"></label>' +
    '<label class="field"><span>Fecha y hora</span><input class="input" type="datetime-local" data-inp="add.fecha" value="' + esc(a.fecha) + '" style="font-size:14px"></label></div>' +
    '<label class="field in" style="--d:.17s"><span>Nota</span><input class="input" data-inp="add.nota" value="' + esc(a.nota) + '" placeholder="Opcional"></label>' +
    '<div class="in" style="--d:.2s">' + ticketBlock + '</div>' +
    (a.id && !isBet ? '' : '<button class="toggle in" data-act="add-flag" aria-pressed="' + a.flag + '" style="--d:.23s;border-color:' + (a.flag ? rgba(flagColor, 0.4) : 'var(--line)') + '">' +
      '<span class="ico" style="width:38px;height:38px;border-radius:13px;background:' + (a.flag ? flagColor : 'rgba(255,255,255,.05)') + ';color:' + (a.flag ? '#0B0B0D' : 'var(--tx3)') + '">' + icon(isBet ? 'banknote' : 'repeat', 18, 2.2) + '</span>' +
      '<span class="col grow" style="gap:2px"><span style="font-size:15px;font-weight:700">' + flagTitle + '</span><span class="small muted">' + flagSub + '</span></span>' +
      '<span class="switch' + (a.flag ? ' on' : '') + '" style="' + (a.flag ? 'background:' + flagColor : '') + '"></span></button>') +
    '<div class="keys in" role="group" aria-label="Teclado numérico" style="--d:.26s">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'].map((k) => '<button data-act="key" data-v="' + k + '" aria-label="' + (k === '⌫' ? 'Borrar' : k === ',' ? 'Coma decimal' : k) + '">' + k + '</button>').join('') + '</div>' +
    '<button id="savebtn" class="btn block in" data-act="add-save" style="--d:.3s;min-height:58px;font-size:16px;position:relative;overflow:hidden;box-shadow:0 14px 34px ' + rgba(acc(), 0.28) + '">' +
    '<span aria-hidden="true" style="position:absolute;top:0;bottom:0;left:0;width:70px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));animation:shimmer 3.4s ease-in-out 1s infinite"></span>' +
    '<span style="position:relative">' + (a.id ? 'Guardar cambios' : isBet ? 'Guardar apuesta' : a.tipo === 'ingreso' ? 'Guardar ingreso' : 'Guardar gasto') + '</span></button>' +
    (a.id ? '<button class="btn ghost block" data-act="mov-del" data-id="' + esc(a.id) + '" style="color:#FF8A9A">' + icon('trash-2', 18) + 'Borrar movimiento</button>' : '') +
    '</div>';
}

/* ---------- Pantalla: Objetivos ---------- */

function avgMonthlySaving() {
  const now = new Date(); const vals = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const md = monthData(d.getFullYear(), d.getMonth());
    if (!md.movs.length) continue;
    const inc = md.income || Number(S.data.config.nomina) || 0;
    vals.push(inc - md.cash);
  }
  return vals.length ? sum(vals) / vals.length : 0;
}
function scrGoals() {
  const metas = S.data.metas;
  const main = metas.find((m) => m.principal) || metas[0];
  const others = metas.filter((m) => m !== main);
  const total = sum(metas.map((m) => m.ahorrado));
  let mainHTML = '';
  if (main) {
    const p = main.objetivo ? main.ahorrado / main.objetivo * 100 : 0;
    const rate = savingRate();
    const left = Math.max(0, main.objetivo - main.ahorrado);
    let eta = '';
    if (rate > 0 && left > 0) { const d = addMonths(new Date(), Math.ceil(left / rate)); eta = MONTHS_S[d.getMonth()] + ' ' + d.getFullYear(); }
    const steps = [0.25, 0.5, 0.75].map((f) => main.objetivo * f);
    const nextMs = [0.25, 0.5, 0.75, 1].map((f) => main.objetivo * f).find((v) => v > main.ahorrado);
    mainHTML = '<section class="card hero col in" style="--d:.08s;align-items:center;gap:18px;padding:22px 18px 18px">' +
      '<div class="between" style="align-self:stretch;align-items:center"><div class="col" style="gap:2px"><span style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--tx3)">Meta principal</span><h2 style="font-size:20px">' + esc(main.nombre) + '</h2></div>' +
      (eta ? '<span class="pill" style="background:' + acc() + ';color:#0B0B0D;font-size:12px;padding:5px 10px">' + eta + '</span>' : '') + '</div>' +
      '<button data-act="meta-open" data-id="' + esc(main.id) + '" style="border:0;background:none;padding:0;border-radius:50%" aria-label="Aportar o editar ' + esc(main.nombre) + '">' +
      tank(170, p, main.color || acc(), '<span class="num" style="font-size:34px;font-weight:600;letter-spacing:-1.2px">' + Math.round(p) + ' %</span><span style="font-size:12px;font-weight:700;color:var(--tx2)">' + fmt(main.ahorrado, 0) + ' €</span>') + '</button>' +
      '<div class="col" style="align-self:stretch;gap:8px"><div style="position:relative;height:6px;border-radius:3px;background:#26262C"><i class="growx" style="position:absolute;left:0;top:0;height:6px;width:' + clamp(p, 0, 100).toFixed(1) + '%;border-radius:3px;background:' + acc() + ';transform-origin:left;--d:.6s"></i>' +
      steps.map((v, i) => '<span style="position:absolute;left:' + (25 * (i + 1)) + '%;top:-4px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:' + (main.ahorrado >= v ? acc() : '#0B0B0D') + ';border:2px solid ' + (main.ahorrado >= v ? acc() : '#3A3A42') + '"></span>').join('') + '</div>' +
      '<div class="small" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));text-align:right;color:var(--tx4)">' + [0.25, 0.5, 0.75, 1].map((f) => '<span>' + fmt(main.objetivo * f / 1000, main.objetivo * f % 1000 ? 1 : 0) + 'k</span>').join('') + '</div></div>' +
      '<div class="grid2" style="align-self:stretch"><div class="mini"><span class="l">Ahorro medio</span><span class="v" style="font-size:15px">' + (rate > 0 ? fmt(rate, 0) + ' €/mes' : '—') + '</span></div><div class="mini"><span class="l">Te faltan</span><span class="v" style="font-size:15px">' + fmt(left, 0) + ' €</span></div></div>' +
      '<div class="row" style="align-self:stretch;gap:10px"><span class="small grow" style="color:var(--tx2)">' + (nextMs ? 'Próximo hito: ' + fmt(nextMs, 0) + ' €. Faltan ' + fmt(nextMs - main.ahorrado, 0) + ' €.' : '¡Meta conseguida!') + '</span>' +
      '<button class="btn" data-act="meta-open" data-id="' + esc(main.id) + '">Aportar</button></div></section>';
  }
  const grid = others.map((m, i) => {
    const p = m.objetivo ? m.ahorrado / m.objetivo * 100 : 0;
    const col = m.color || ['#5AC8FF', '#FF9F5A', '#A78BFA', '#F472B6'][i % 4];
    const when = m.fecha_objetivo ? (() => { const d = parseD(m.fecha_objetivo); return d ? 'Para ' + MONTHS[d.getMonth()] + ' de ' + d.getFullYear() : ''; })() : 'Faltan ' + fmt(Math.max(0, m.objetivo - m.ahorrado), 0) + ' €';
    return '<button class="card col in press" data-act="meta-open" data-id="' + esc(m.id) + '" style="--d:' + (0.2 + i * 0.08).toFixed(2) + 's;align-items:center;gap:12px;padding:16px 14px;border-radius:26px;text-align:left">' +
      tank(96, p, col, '<span class="num" style="font-size:20px;font-weight:600;letter-spacing:-.6px">' + Math.round(p) + ' %</span>') +
      '<span class="col" style="align-self:stretch;gap:3px"><span style="font-size:14px;font-weight:800">' + esc(m.nombre) + '</span><span class="small muted">' + fmt(m.ahorrado, 0) + ' / ' + fmt(m.objetivo, 0) + ' €</span><span style="font-size:11px;font-weight:700;color:' + col + '">' + esc(when) + '</span></span></button>';
  }).join('');
  return '<div class="page">' + glow(acc(), 120, 'left', 400, 13) +
    '<header class="col in" style="gap:4px"><h1>Objetivos</h1><span class="muted" style="font-size:13px">Llevas ' + fmt(total, 0) + ' € ahorrados en ' + metas.length + ' meta' + (metas.length === 1 ? '' : 's') + '</span></header>' +
    mainHTML +
    '<a href="#simulador" class="row in press" style="--d:.16s;gap:14px;padding:16px;border-radius:24px;background:linear-gradient(120deg,#2A2112,#141417 70%);border:1px solid rgba(253,186,116,.25);color:var(--tx)"><span class="ico" style="background:rgba(253,186,116,.14);color:#FDBA74">' + icon('house', 22) + '</span><span class="col grow" style="gap:2px"><b style="font-size:15px">Simulador de hipoteca</b><span class="small muted">Cuánto necesitas, qué cuota pagarías y cuándo llegas</span></span><span style="color:#6E6E78">' + icon('chevron-right', 16, 2.4) + '</span></a>' +
    '<div class="grid2">' + grid +
    '<button class="btn dash col in" data-act="meta-new" style="--d:.45s;min-height:200px;border-radius:26px;flex-direction:column;gap:10px"><span style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center">' + icon('plus', 22, 2.4) + '</span>Nueva meta</button></div></div>' + tabbar('objetivos');
}

/* ---------- Pantalla: Más ---------- */

function scrMas() {
  const nc = nextCharge();
  const allBets = S.data.movs.filter((m) => m.tipo === 'apuesta');
  const betNet = sum(allBets.map(signed));
  const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const pm = MONTHS[prev.getMonth()];
  const autos = monthData(new Date().getFullYear(), new Date().getMonth()).movs.filter((m) => m.origen === 'applepay').length;
  const groups = [
    ['Tu dinero', [
      ['mensual', 'Resumen mes a mes', 'Ingresos, gastos y ahorro de cada mes', '#D4FF3A', 'sheet'],
      ['analisis', 'Análisis', 'Gráficos, categorías y mapa de calor', '#5AC8FF', 'trending-up'],
      ['simulador', 'Simulador de hipoteca', 'Cuánto necesitas y cuándo llegas', '#FDBA74', 'house'],
      ['fijos', 'Fijos y suscripciones', nc ? 'Próximo: ' + nc.f.nombre + ', ' + nc.d.getDate() + ' ' + MONTHS_S[nc.d.getMonth()] : 'Añade tus pagos fijos', '#FFB84D', 'calendar-clock', nc && dayDiff(new Date(), nc.d) <= 3 ? (dayDiff(new Date(), nc.d) === 0 ? 'Hoy' : dayDiff(new Date(), nc.d) + ' d') : ''],
      ['apuestas', 'Apuestas', allBets.length ? 'Balance total: ' + eur(betNet, 2, true) : 'Depósitos, cobros y retos', '#FF5D73', 'ticket']
    ]],
    ['Automático', [
      ['applepay', 'Apple Pay y Siri', S.cfg.demo ? 'Configúralo cuando conectes tu Sheet' : autos + ' pagos apuntados solos este mes', '#8B7CFF', 'zap']
    ]],
    ['Ajustes', [
      ['ajustes', 'Ajustes', 'Conexión, apariencia y exportar', '#C8C8D0', 'settings']
    ]]
  ];
  let k = 0;
  return '<div class="page"><h1 class="in">Más</h1>' +
    '<a href="#resumen" class="row in" style="--d:.06s;position:relative;overflow:hidden;min-height:150px;padding:20px;border-radius:30px;background:linear-gradient(135deg,#1C1A33,#141417 60%);border:1px solid rgba(139,124,255,.25);color:var(--tx);gap:16px">' +
    '<div aria-hidden="true" style="position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.06),rgba(255,255,255,0));animation:shimmer 4s ease-in-out 1.2s infinite"></div>' +
    '<div class="col grow" style="position:relative;gap:6px"><span class="row" style="gap:6px;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#C3B9FF"><span class="dot" style="background:#8B7CFF;width:7px;height:7px"></span>Resumen</span>' +
    '<span class="num" style="font-size:20px;font-weight:600;letter-spacing:-.5px;line-height:1.2">Tu ' + pm + ', en historias</span><span class="muted" style="font-size:13px">5 tarjetas con lo más destacado del mes cerrado.</span></div>' +
    '<div aria-hidden="true" style="position:relative;width:100px;height:120px;flex-shrink:0">' +
    '<span style="position:absolute;left:4px;top:14px;width:60px;height:94px;border-radius:14px;background:#FF9F5A;transform:rotate(-12deg);animation:floaty 4s ease-in-out infinite"></span>' +
    '<span style="position:absolute;left:20px;top:8px;width:60px;height:94px;border-radius:14px;background:#8B7CFF;transform:rotate(4deg);animation:floaty 4.6s ease-in-out infinite"></span>' +
    '<span style="position:absolute;left:38px;top:12px;width:60px;height:94px;border-radius:14px;background:' + acc() + ';color:#0B0B0D;display:flex;align-items:center;justify-content:center;font-family:var(--num);font-size:13px;font-weight:700;transform:rotate(14deg);animation:floaty 4.2s ease-in-out infinite">' + MONTHS_S[prev.getMonth()].toUpperCase() + '</span></div></a>' +
    groups.map(([title, items], gi) => '<section class="col in" style="--d:' + (0.14 + gi * 0.1).toFixed(2) + 's;gap:10px"><h2 style="padding:0 4px;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#8A8A94">' + title + '</h2><div class="card" style="padding:0;overflow:hidden">' +
      items.map(([href, name, sub, hue, ic, badge], i) => { k++; return '<a href="#' + href + '" class="row fade" style="--d:' + (0.25 + k * 0.05).toFixed(2) + 's;min-height:68px;padding:0 16px;gap:14px;color:var(--tx);border-bottom:1px solid ' + (i === items.length - 1 ? 'transparent' : 'rgba(255,255,255,.05)') + '">' +
        '<span class="ico" style="width:40px;height:40px;border-radius:13px;background:' + rgba(hue, 0.13) + ';color:' + hue + '">' + icon(ic, 19) + '</span><span class="col grow" style="gap:2px"><span style="font-size:15px;font-weight:700">' + name + '</span><span class="small muted">' + esc(sub) + '</span></span>' +
        (badge ? '<span class="pill" style="color:#FFB84D;background:rgba(255,184,77,.12)">' + badge + '</span>' : '') + '<span style="color:#5C5C66">' + icon('chevron-right', 16, 2.4) + '</span></a>'; }).join('') + '</div></section>').join('') +
    '<p class="small" style="text-align:center;color:#5C5C66;margin:0">Gastos · tus datos viven en tu Google Sheet</p></div>' + tabbar('mas');
}

/* ---------- Pantalla: Análisis ---------- */

function statsBars(period) {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), day = now.getDate(), dim = daysIn(y, mo);
  const md = monthData(y, mo);
  const daily = day ? md.cash / day : 0;
  if (period === 'mes') {
    const ranges = [[1, 7], [8, 14], [15, 21], [22, 28]].concat(dim > 28 ? [[29, dim]] : []);
    return { unit: 'semana', bars: ranges.map(([a, b]) => {
      const actual = sum(md.gastosAll.filter((g) => { const d = parseD(g.fecha).getDate(); return d >= a && d <= b; }).map((g) => g.importe));
      const remainingDays = Math.max(0, b - Math.max(a - 1, day));
      return { label: a + '–' + b, actual, total: actual + (day < b ? daily * remainingDays : 0) };
    }) };
  }
  if (period === '6m') {
    const bars = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(y, mo - k, 1);
      const m2 = monthData(d.getFullYear(), d.getMonth());
      bars.push({ label: cap(MONTHS_S[d.getMonth()]), actual: m2.cash, total: k === 0 ? daily * dim : m2.cash });
    }
    return { unit: 'mes', bars };
  }
  const bars = [];
  const q = Math.floor(mo / 3);
  let past = 0, pastN = 0;
  for (let i = 0; i < 4; i++) {
    let actual = 0;
    for (let mm = i * 3; mm < i * 3 + 3; mm++) actual += monthData(y, mm).cash;
    let total = actual;
    if (i < q) { past += actual; pastN++; }
    if (i === q) { const elapsed = (mo - i * 3) + day / dim; total = elapsed ? actual / elapsed * 3 : actual; }
    if (i > q) total = pastN ? past / pastN : 0;
    bars.push({ label: 'T' + (i + 1), actual: i > q ? 0 : actual, total });
  }
  return { unit: 'trimestre', bars };
}
function scrStats() {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), day = now.getDate(), dim = daysIn(y, mo);
  const per = S.ui.statsPeriod;
  const { unit, bars } = statsBars(per);
  const max = Math.max(1, ...bars.map((b) => b.total));
  const lastReal = bars.reduce((acc, b, i) => (b.actual > 0 ? i : acc), 0);
  const sel = S.ui.statsSel[per] !== undefined ? S.ui.statsSel[per] : lastReal;
  const anim = S.ui.statsGen % 2 ? 'growA' : 'growB';
  const md = monthData(y, mo);
  const prevD = new Date(y, mo - 1, 1);
  const pmd = monthData(prevD.getFullYear(), prevD.getMonth());
  let total, label, chip = '', good = true;
  if (per === 'mes') {
    total = md.cash; label = 'Gasto en ' + MONTHS[mo];
    const pd = daysIn(prevD.getFullYear(), prevD.getMonth());
    if (pmd.cash > 0 && day) { const ch = ((md.cash / day) / (pmd.cash / pd) - 1) * 100; chip = fmt(ch, 0, true) + ' % de ritmo vs ' + MONTHS_S[prevD.getMonth()]; good = ch <= 0; }
  } else if (per === '6m') {
    total = sum(bars.map((b) => b.actual)); label = 'Últimos 6 meses · media ' + fmt(sum(bars.map((b) => b.total)) / 6, 0) + ' €/mes';
    const top = bars.slice(0, 5).reduce((a, b) => (b.actual > a.actual ? b : a), { actual: 0 });
    if (top.actual) { chip = 'Mes más caro: ' + top.label; good = false; }
  } else {
    total = sum(bars.map((b) => b.actual)); label = 'En ' + y + ' hasta hoy'; chip = 'Cierre previsto: ' + fmt(sum(bars.map((b) => b.total)), 0) + ' €';
  }
  const barsHTML = bars.map((b, i) => {
    const on = i === sel, proj = b.total > b.actual + 0.5;
    const outer = Math.max(6, Math.round(b.total / max * 150)), inner = Math.round(b.actual / max * 150);
    return '<button data-act="stats-bar" data-i="' + i + '" aria-pressed="' + on + '" aria-label="' + b.label + ': ' + fmt(b.actual, 0) + ' euros" style="height:210px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;border:0;background:none;padding:0">' +
      '<span style="min-height:26px;display:flex;align-items:flex-end">' + (on ? '<span class="num popin" style="font-size:11px;font-weight:600;color:#0B0B0D;background:' + acc() + ';padding:5px 7px;border-radius:8px;white-space:nowrap">' + (proj && b.actual ? fmt(b.actual, 0) + '/' + fmt(b.total, 0) : (proj ? '~' + fmt(b.total, 0) : fmt(b.actual, 0))) + ' €</span>' : '') + '</span>' +
      '<span style="width:100%;height:' + outer + 'px;border-radius:10px;border:1.5px dashed ' + (proj ? rgba(acc(), 0.55) : 'transparent') + ';background:' + (proj ? 'repeating-linear-gradient(135deg,' + rgba(acc(), 0.14) + ' 0 6px,rgba(0,0,0,0) 6px 12px)' : 'transparent') + ';display:flex;align-items:flex-end;overflow:hidden;transform-origin:bottom;animation:' + anim + ' .8s var(--ease) ' + (0.12 + i * 0.06).toFixed(2) + 's both">' +
      '<span style="width:100%;height:' + inner + 'px;border-radius:8px;background:' + (on ? acc() : '#2E2E35') + ';transition:background-color .3s"></span></span>' +
      '<span style="font-size:12px;font-weight:' + (on ? 800 : 600) + ';color:' + (on ? 'var(--tx)' : '#8A8A94') + '">' + b.label + '</span></button>';
  }).join('');

  // Mapa de calor
  const daysMap = {};
  md.gastosAll.forEach((g) => { const d = parseD(g.fecha).getDate(); daysMap[d] = (daysMap[d] || 0) + g.importe; });
  const maxDay = Math.max(0, ...Object.values(daysMap));
  const topDay = Object.keys(daysMap).reduce((a, k) => (daysMap[k] > (daysMap[a] || 0) ? +k : a), 0);
  const selDay = S.ui.heatDay || topDay || day;
  const lv = [rgba(acc(), 0.18), rgba(acc(), 0.38), rgba(acc(), 0.65), acc()];
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span aria-hidden="true"></span>';
  for (let n = 1; n <= dim; n++) {
    const past = n <= day, v = daysMap[n] || 0, on = n === selDay;
    const level = v === 0 ? -1 : Math.min(3, Math.floor(v / (maxDay || 1) * 4 - 0.0001));
    const bg = !past ? 'transparent' : (level < 0 ? '#1E1E23' : lv[level]);
    const fg = past && level >= 2 ? '#0B0B0D' : (past ? '#C8C8D0' : '#3A3A42');
    const border = !past ? '1.5px dashed #2C2C33' : (on ? '2px solid #F4F4F5' : (n === day ? '2px solid ' + rgba(acc(), 0.6) : '2px solid transparent'));
    cells += '<button class="popin" data-act="heat" data-v="' + n + '" ' + (past ? '' : 'disabled') + ' aria-label="' + n + ' de ' + MONTHS[mo] + (past ? ': ' + fmt(v) + ' euros' : '') + '" style="--d:' + (0.25 + n * 0.018).toFixed(3) + 's;aspect-ratio:1;border-radius:11px;border:' + border + ';background:' + bg + ';box-shadow:' + (on ? '0 0 0 4px ' + rgba(acc(), 0.18) : 'none') + ';padding:5px 0 0 6px;font-size:11px;font-weight:800;color:' + fg + ';text-align:left;display:flex;align-items:flex-start;transition:transform .2s"><span>' + n + '</span></button>';
  }
  const dayMovs = md.gastosAll.filter((g) => parseD(g.fecha).getDate() === selDay);
  const selDate = new Date(y, mo, selDay);
  const detail = '<div class="between" style="align-items:center"><div class="col" style="gap:2px"><span class="small muted">' + cap(WD[selDate.getDay()]) + ' ' + selDay + (selDay === day ? ' · hoy' : '') + '</span><span style="font-size:15px;font-weight:800">' + (dayMovs.length ? esc(dayMovs.map((g) => g.concepto || g.categoria).slice(0, 3).join(', ')) + (dayMovs.length > 3 ? '…' : '') : 'Sin gastos') + '</span></div><span class="num" style="font-size:18px;font-weight:600;color:' + acc() + '">' + eur(daysMap[selDay] || 0) + '</span></div>';

  // Donut
  const C = 389.6;
  const entries = Object.entries(md.byCat).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 6);
  const rest = sum(entries.slice(6).map((e) => e[1]));
  if (rest > 0) top.push(['Resto', rest]);
  const tot = sum(top.map((e) => e[1])) || 1;
  let cum = 0;
  const segs = top.map(([name, v], i) => {
    const p = v / tot * 100, c = name === 'Resto' ? '#5C5C66' : cat(name).color;
    const on = S.ui.donutCat === null || S.ui.donutCat === name;
    const s = '<circle class="draw" cx="88" cy="88" r="62" stroke="' + c + '" stroke-width="' + (S.ui.donutCat === name ? 24 : 20) + '" style="stroke-dasharray:' + Math.max(1, p / 100 * C - (top.length > 1 ? 3 : 0)).toFixed(1) + ' ' + C + ';stroke-dashoffset:' + (-(cum / 100) * C).toFixed(1) + ';opacity:' + (on ? 1 : 0.18) + ';transition:opacity .3s,stroke-width .3s;--d:' + (0.3 + i * 0.1).toFixed(2) + 's"/>';
    cum += p; return s;
  }).join('');
  const picked = top.find((e) => e[0] === S.ui.donutCat);
  const legend = top.map(([name, v], i) => {
    const on = S.ui.donutCat === name, c = name === 'Resto' ? '#5C5C66' : cat(name).color;
    return '<button data-act="donut" data-v="' + esc(name) + '" aria-pressed="' + on + '" class="row in" style="--d:' + (0.35 + i * 0.04).toFixed(2) + 's;gap:8px;min-height:44px;padding:0 10px;border-radius:14px;border:1px solid ' + (on ? rgba(c, 0.4) : 'rgba(255,255,255,.05)') + ';background:' + (on ? rgba(c, 0.14) : 'rgba(255,255,255,.03)') + ';text-align:left"><span class="dot" style="width:10px;height:10px;background:' + c + '"></span><span class="grow" style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</span><span class="small" style="font-weight:700;color:var(--tx3);white-space:nowrap">' + Math.round(v / tot * 100) + ' %</span></button>';
  }).join('');

  // Dato del mes
  const wk = sum(md.gastosAll.filter((g) => { const w = parseD(g.fecha).getDay(); return w === 0 || w === 6; }).map((g) => g.importe));
  const share = md.cash ? Math.round(wk / md.cash * 100) : 0;
  let insightT = 'Aún no hay suficientes datos este mes', insightB = 'En cuanto apuntes unos cuantos gastos verás aquí un patrón.';
  if (md.cash > 0) {
    const tdD = new Date(y, mo, topDay);
    insightT = share >= 40 ? 'Casi la mitad se va en fin de semana' : (share > 0 ? 'El fin de semana se lleva el ' + share + ' %' : 'Este mes gastas entre semana');
    insightB = fmt(wk) + ' € de ' + fmt(md.cash) + ' € en sábados y domingos. El día más caro fue el ' + WD[tdD.getDay()] + ' ' + topDay + ': ' + eur(daysMap[topDay] || 0) + '.';
  }

  const pi = ['mes', '6m', 'ano'].indexOf(per);
  return '<div class="page sub">' + glow('#8B7CFF', -120, 'right', 360, 12) + subHeader('Análisis') +
    '<div class="seg in" role="group" aria-label="Periodo" style="--d:.03s;grid-template-columns:repeat(3,minmax(0,1fr))"><span class="knob" style="width:calc((100% - 8px)/3);left:calc(4px + ' + pi + ' * (100% - 8px)/3)"></span>' +
    [['mes', 'Mes'], ['6m', '6 meses'], ['ano', 'Año']].map((p) => '<button class="' + (p[0] === per ? 'on' : '') + '" data-act="stats-period" data-v="' + p[0] + '" aria-pressed="' + (p[0] === per) + '">' + p[1] + '</button>').join('') + '</div>' +
    '<section class="between in" style="--d:.06s;align-items:flex-end"><div class="col" style="gap:4px"><span class="muted" style="font-size:13px">' + label + '</span><span class="num" data-count="' + total.toFixed(2) + '" data-dec="' + (per === 'mes' ? 2 : 0) + '" data-suffix=" €" style="font-size:34px;font-weight:600;letter-spacing:-1.4px">' + eur(total, per === 'mes' ? 2 : 0) + '</span></div>' +
    (chip ? '<span class="pill" style="margin-bottom:8px;font-size:12px;padding:6px 10px;color:' + (good ? acc() : '#FFB84D') + ';background:' + (good ? rgba(acc(), 0.1) : 'rgba(255,184,77,.12)') + '">' + chip + '</span>' : '') + '</section>' +
    '<section class="card col in" style="--d:.1s;gap:14px;border-radius:28px"><div class="between"><h2 style="font-size:16px">Gasto por ' + unit + '</h2><span class="small muted">Toca una barra</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(' + bars.length + ',minmax(0,1fr));gap:10px;align-items:end;height:210px">' + barsHTML + '</div>' +
    '<div class="row small muted" style="gap:16px"><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:' + acc() + '"></span>Real</span><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;border:1.5px dashed ' + acc() + '"></span>Previsión</span></div></section>' +
    '<section class="card col in" style="--d:.16s;gap:14px;border-radius:28px"><div class="between"><h2 style="font-size:16px">Mapa de calor</h2><span class="small muted">' + cap(MONTHS[mo]) + '</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;text-align:center;font-size:11px;font-weight:800;color:var(--tx4)"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">' + cells + '</div>' + detail +
    '<div class="row small" style="gap:6px;color:var(--tx4)"><span>Menos</span><span style="width:14px;height:14px;border-radius:4px;background:#1E1E23"></span>' + lv.map((c) => '<span style="width:14px;height:14px;border-radius:4px;background:' + c + '"></span>').join('') + '<span>Más</span></div></section>' +
    '<section class="card col in" style="--d:.22s;gap:16px;border-radius:28px"><div class="between"><h2 style="font-size:16px">¿En qué se va?</h2><span class="small muted">' + cap(MONTHS[mo]) + '</span></div>' +
    (entries.length ? '<div style="position:relative;width:176px;height:176px;align-self:center"><svg width="176" height="176" viewBox="0 0 176 176" fill="none" style="transform:rotate(-90deg)" role="img" aria-label="Reparto por categoría"><circle cx="88" cy="88" r="62" stroke="#1E1E23" stroke-width="20"/>' + segs + '</svg>' +
      '<div class="col" style="position:absolute;inset:0;align-items:center;justify-content:center;gap:2px"><span style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">' + esc(picked ? picked[0] : 'Variables') + '</span><span class="num" style="font-size:20px;font-weight:600;letter-spacing:-.6px">' + eur(picked ? picked[1] : tot) + '</span><span class="small muted">' + (picked ? Math.round(picked[1] / tot * 100) + ' % del total' : top.length + ' categorías') + '</span></div></div><div class="grid2" style="gap:8px">' + legend + '</div>' : '<p class="muted small" style="margin:0">Sin gastos este mes todavía.</p>') + '</section>' +
    '<section class="in" style="--d:.28s;position:relative;border-radius:24px;padding:1.5px;overflow:hidden"><div aria-hidden="true" style="position:absolute;left:50%;top:50%;width:600px;height:600px;margin:-300px 0 0 -300px;background:conic-gradient(from 0deg,rgba(255,184,77,0),#FFB84D 60deg,rgba(139,124,255,0) 140deg,rgba(139,124,255,0) 220deg,#8B7CFF 290deg,rgba(255,184,77,0) 360deg);animation:spin 6s linear infinite"></div>' +
    '<div class="row" style="position:relative;align-items:flex-start;gap:12px;padding:16px;border-radius:23px;background:#17151A"><span class="ico" style="width:38px;height:38px;border-radius:12px;background:rgba(255,184,77,.12);color:#FFB84D">' + icon('lightbulb', 20) + '</span><div class="col" style="gap:4px"><b style="font-size:14px">' + insightT + '</b><span style="font-size:13px;line-height:1.45;color:#C8C8D0">' + insightB + '</span></div></div></section>' +
    '</div>' + tabbar('mas');
}

/* ---------- Pantalla: Fijos ---------- */

function scrFijos() {
  const fijos = S.data.fijos;
  const monthly = sum(fijos.filter((f) => f.tipo === 'gasto').map((f) => f.importe / f.frecuencia_meses));
  const monthlyIn = sum(fijos.filter((f) => f.tipo === 'ingreso').map((f) => f.importe / f.frecuencia_meses));
  const nGasto = fijos.filter((f) => f.tipo === 'gasto').length;
  const nc = nextCharge();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = addMonths(today, 4);
  const occ = [];
  fijos.forEach((f) => {
    let d = parseD(f.proximo); let n = 0;
    while (d && d <= horizon && n < 8) { if (d >= today) occ.push({ f, d }); d = addMonths(d, f.frecuencia_meses); n++; }
    const first = parseD(f.proximo);
    if (first && first > horizon) occ.push({ f, d: first });
  });
  occ.sort((a, b) => a.d - b.d);
  const items = occ.slice(0, 9).map((o, i) => {
    const c = cat(o.f.categoria);
    const big = o.f.frecuencia_meses > 1 && o.f.tipo === 'gasto';
    const isIn = o.f.tipo === 'ingreso';
    const isNext = nc && o.f === nc.f && +o.d === +nc.d;
    let extra = '';
    if (big && +o.d === +parseD(o.f.proximo)) {
      const last = addMonths(o.d, -o.f.frecuencia_meses);
      const totalDays = Math.max(1, dayDiff(last, o.d));
      const p = clamp(dayDiff(last, new Date()) / totalDays * 100, 0, 100);
      extra = '<div class="col" style="gap:6px"><div class="bar"><i class="growx" style="width:' + p.toFixed(0) + '%;background:' + acc() + ';--d:' + (0.8 + i * 0.08).toFixed(2) + 's"></i></div><span class="small" style="color:var(--tx2)">Ya tienes apartados ' + eur(o.f.importe * p / 100) + ' de ' + eur(o.f.importe, 0) + '</span></div>';
    }
    const freq = o.f.frecuencia_meses === 1 ? 'mensual' : o.f.frecuencia_meses === 12 ? 'anual' : 'cada ' + o.f.frecuencia_meses + ' meses';
    return '<div class="in" style="position:relative;--d:' + (0.3 + i * 0.07).toFixed(2) + 's"><span class="popin" style="position:absolute;left:-28px;top:18px;width:16px;height:16px;border-radius:50%;background:' + (isNext ? '#FFB84D' : '#0B0B0D') + ';border:3px solid ' + (isNext ? 'rgba(255,184,77,.35)' : big ? '#5C5C66' : '#3A3A42') + ';--d:' + (0.5 + i * 0.1).toFixed(2) + 's"></span>' +
      '<button class="card col press" data-act="fijo-open" data-id="' + esc(o.f.id) + '" style="width:100%;gap:12px;padding:14px;border-radius:22px;text-align:left;border-color:' + (isNext ? 'rgba(255,184,77,.3)' : 'var(--line)') + '"><span class="row"><span class="ico" style="width:42px;height:42px;border-radius:14px;background:' + rgba(c.color, 0.14) + ';color:' + c.color + '">' + icon(c.icono, 20) + '</span>' +
      '<span class="col grow" style="gap:2px"><span style="font-size:15px;font-weight:800">' + esc(o.f.nombre) + '</span><span class="small muted">' + WD_S[o.d.getDay()] + ' ' + o.d.getDate() + ' ' + MONTHS_S[o.d.getMonth()] + ' · ' + freq + '</span></span><span class="num" style="font-size:14px;font-weight:600;white-space:nowrap;color:' + (isIn ? acc() : 'var(--tx)') + '">' + (isIn ? '+' : '') + eur(o.f.importe) + '</span></span>' + extra + '</button></div>';
  }).join('');
  let hero = '';
  if (nc) {
    const dd = dayDiff(new Date(), nc.d);
    hero = '<section class="row in" style="--d:.1s;position:relative;overflow:hidden;gap:16px;padding:18px;border-radius:28px;background:linear-gradient(135deg,#2A2112,#161411 70%);border:1px solid rgba(255,184,77,.25)">' +
      '<div style="position:relative;width:84px;height:84px;flex-shrink:0">' + ring(84, 7, clamp((1 - dd / 30) * 100, 4, 100), '#FFB84D', 0.5, 'rgba(255,184,77,.15)') +
      '<div class="col" style="position:absolute;inset:0;align-items:center;justify-content:center;line-height:1"><span class="num" style="font-size:26px;font-weight:700;color:#FFB84D">' + dd + '</span><span style="font-size:11px;font-weight:800;color:#E8C88E">' + (dd === 1 ? 'día' : 'días') + '</span></div></div>' +
      '<div class="col grow" style="gap:4px"><span class="row" style="gap:6px;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#FFB84D"><span class="dot" style="width:7px;height:7px;background:#FFB84D;animation:amberPulse 1.8s ease-out infinite"></span>Próximo cargo</span>' +
      '<span style="font-size:18px;font-weight:800">' + esc(nc.f.nombre) + '</span><span style="font-size:13px;color:#C8B89A">' + cap(WD[nc.d.getDay()]) + ' ' + nc.d.getDate() + ' ' + MONTHS_S[nc.d.getMonth()] + ' · ' + eur(nc.f.importe) + '</span></div></section>';
  }
  return '<div class="page sub">' + glow('#FFB84D', -100, 'left', 380, 12) + subHeader('Fijos y suscripciones') +
    '<section class="col in" style="--d:.05s;gap:4px"><span class="muted" style="font-size:13px">Te cuestan de media</span><div class="row" style="align-items:baseline;gap:8px"><span class="num" data-count="' + monthly.toFixed(2) + '" data-suffix=" €" style="font-size:38px;font-weight:600;letter-spacing:-1.6px">' + eur(monthly) + '</span><span style="font-size:15px;font-weight:700;color:var(--tx3)">/ mes</span></div>' +
    '<span class="muted" style="font-size:13px">Son ' + eur(monthly * 12) + ' al año en ' + nGasto + ' pago' + (nGasto === 1 ? '' : 's') + ' fijo' + (nGasto === 1 ? '' : 's') + '. Se apuntan solos el día del cargo.</span>' +
    (monthlyIn ? '<span class="pill" style="align-self:flex-start;margin-top:6px;font-size:12px;padding:6px 10px;color:' + acc() + ';background:' + rgba(acc(), 0.1) + '">Entran ' + eur(monthlyIn, 0) + ' al mes de media, pagas extra incluidas</span>' : '<span class="small" style="color:var(--tx4);margin-top:4px">Consejo: añade tu nómina y las pagas extra como ingresos fijos.</span>') + '</section>' + hero +
    (items ? '<section class="col in" style="--d:.2s;gap:12px"><h2>Lo que viene</h2><div class="col" style="position:relative;gap:12px;padding-left:30px"><span class="growy" style="position:absolute;left:9px;top:16px;bottom:30px;width:2px;border-radius:1px;background:linear-gradient(180deg,#FFB84D,#2C2C33 60%);transform-origin:top;--d:.4s"></span>' + items + '</div></section>' :
      '<div class="card col fade" style="align-items:center;text-align:center;gap:8px;padding:26px"><span style="color:#FFB84D">' + icon('calendar-clock', 28) + '</span><b>Sin pagos fijos todavía</b><span class="small muted">Añade el gimnasio, el seguro o tus suscripciones y te avisaré antes de cada cargo.</span></div>') +
    '<button class="btn dash in" data-act="fijo-new" style="--d:.5s;min-height:54px">' + icon('plus', 18, 2.4) + 'Añadir pago fijo</button></div>' + tabbar('mas');
}

/* ---------- Pantalla: Apuestas ---------- */

function scrApuestas() {
  const per = S.ui.betPeriod;
  const now = new Date();
  let bets = S.data.movs.filter((m) => m.tipo === 'apuesta');
  if (per === 'mes') bets = bets.filter((m) => { const d = parseD(m.fecha); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
  bets = bets.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const dep = sum(bets.filter((b) => !b.cobro).map((b) => b.importe));
  const ret = sum(bets.filter((b) => b.cobro).map((b) => b.importe));
  const net = ret - dep;
  const roi = dep ? net / dep * 100 : 0;
  const col = net >= 0 ? acc() : '#FF5D73';
  let c = 0; const ser = [0].concat(bets.map((b) => (c += signed(b))));
  const W = 322, H = 150, pd = 12;
  const mn = Math.min(0, ...ser), mx = Math.max(0, ...ser);
  const yv = (v) => pd + (mx - v) / ((mx - mn) || 1) * (H - pd * 2);
  const pts = ser.map((v, i) => [(ser.length > 1 ? i / (ser.length - 1) : 0) * (W - 10), yv(v)]);
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const zy = yv(0);
  const last = pts[pts.length - 1];
  const area = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + last[0].toFixed(1) + ' ' + zy.toFixed(1) + ' L0 ' + zy.toFixed(1) + ' Z';
  const limit = Number(S.data.config.limite_apuestas) || 0;
  const mdep = monthData(now.getFullYear(), now.getMonth()).dep;
  const lp = limit ? clamp(mdep / limit * 100, 0, 100) : 0;
  const retos = S.data.retos.map((r, i) => {
    const lost = r.estado === 'perdido';
    const done = r.estado === 'terminado' || r.estado === 'ganado';
    const p = lost ? 0 : clamp((r.banca - r.inicio) / ((r.objetivo - r.inicio) || 1) * 100, 0, 100);
    const hue = lost ? '#FF5D73' : done ? acc() : ['#FF9F5A', acc(), '#A78BFA'][i % 3];
    return '<button class="card col press in" data-act="reto-open" data-id="' + esc(r.id) + '" style="--d:' + (0.28 + i * 0.08).toFixed(2) + 's;gap:12px;padding:16px;border-radius:24px;text-align:left;opacity:' + (lost ? 0.6 : 1) + '">' +
      '<span class="row"><span class="ico" style="width:42px;height:42px;border-radius:14px;background:' + rgba(hue, 0.14) + ';color:' + hue + '">' + icon('trophy', 20) + '</span><span class="col grow" style="gap:2px"><span style="font-size:15px;font-weight:800">' + esc(r.nombre) + '</span><span class="small muted">De ' + fmt(r.inicio, 0) + ' € a ' + fmt(r.objetivo, 0) + ' €</span></span>' +
      '<span class="pill" style="color:' + (lost ? '#FF5D73' : acc()) + ';background:' + (lost ? 'rgba(255,93,115,.12)' : rgba(acc(), 0.1)) + '">' + cap(r.estado) + '</span></span>' +
      '<span class="col" style="gap:6px"><span class="between small" style="font-weight:700"><span class="muted">Banca: <span class="num" style="color:var(--tx);font-weight:600">' + eur(r.banca) + '</span></span><span style="color:var(--tx4)">' + Math.round(p) + ' %</span></span>' +
      '<span class="bar"><i class="growx" style="width:' + p.toFixed(0) + '%;min-width:' + (lost ? 0 : 8) + 'px;background:' + hue + ';--d:' + (0.6 + i * 0.1).toFixed(2) + 's"></i></span></span></button>';
  }).join('');
  return '<div class="page sub">' + glow('#FF5D73', -110, 'right', 360, 12) + subHeader('Apuestas') +
    '<div class="seg in" style="--d:.03s;grid-template-columns:repeat(2,minmax(0,1fr))"><span class="knob" style="width:calc(50% - 4px);left:' + (per === 'mes' ? '4px' : '50%') + '"></span>' +
    '<button class="' + (per === 'mes' ? 'on' : '') + '" data-act="bet-period" data-v="mes">' + cap(MONTHS[now.getMonth()]) + '</button><button class="' + (per === 'todo' ? 'on' : '') + '" data-act="bet-period" data-v="todo">Todo</button></div>' +
    '<section class="card hero col in" style="--d:.06s;gap:16px;padding:20px 18px 16px">' +
    '<div class="between" style="align-items:flex-end"><div class="col" style="gap:4px"><span class="muted" style="font-size:13px">Balance neto</span><span class="num" style="font-size:38px;font-weight:600;letter-spacing:-1.6px;color:' + col + '">' + eur(net, 2, true) + '</span></div>' +
    '<span class="pill" style="margin-bottom:8px;font-size:12px;padding:6px 10px;color:' + col + ';background:' + (net >= 0 ? rgba(acc(), 0.1) : 'rgba(255,93,115,.12)') + '">ROI ' + fmt(roi, 0, true) + ' %</span></div>' +
    (bets.length ? '<svg viewBox="0 0 322 150" width="100%" height="150" fill="none" role="img" aria-label="Evolución del balance" style="overflow:visible"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".35"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0 ' + zy.toFixed(1) + 'H322" stroke="#3A3A42" stroke-dasharray="4 5"/><text x="322" y="' + (zy - 6).toFixed(1) + '" fill="#6E6E78" font-size="10" font-weight="700" text-anchor="end" font-family="Manrope">0 €</text>' +
      '<path d="' + area + '" fill="url(#ag)" style="animation:fadeIn 1s ease .9s both"/><polyline points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" stroke="' + col + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:' + (len * 1.08).toFixed(0) + ' 0;animation:drawIn 1.4s var(--ease) .25s both"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="5" fill="' + col + '"/></svg>' : '<p class="muted small" style="margin:0">Sin apuestas en este periodo.</p>') +
    '<div class="grid2"><div class="mini"><span class="l">Depositado</span><span class="v">' + eur(dep) + '</span></div><div class="mini"><span class="l">Cobrado</span><span class="v">' + eur(ret) + '</span></div></div></section>' +
    (limit ? '<section class="card col in" style="--d:.14s;gap:10px;border-radius:22px"><div class="between"><b style="font-size:15px">Límite de depósito del mes</b><span style="font-size:13px;font-weight:700;color:' + (lp >= 100 ? '#FF5D73' : lp >= 75 ? '#FFB84D' : acc()) + '">' + fmt(mdep, 0) + ' / ' + fmt(limit, 0) + ' €</span></div>' +
      '<div class="bar" style="height:8px"><i class="growx" style="width:' + lp.toFixed(0) + '%;background:linear-gradient(90deg,' + acc() + ',#FFB84D)"></i></div><span class="small muted">' + (mdep >= limit ? 'Has llegado al tope de este mes.' : 'Te quedan ' + eur(limit - mdep, 0) + ' hasta el día 1. Puedes cambiar el tope en Ajustes.') + '</span></section>' : '') +
    '<section class="col in" style="--d:.2s;gap:12px"><div class="between"><h2>Retos</h2><button class="chip" data-act="reto-new">' + icon('plus', 14, 2.6) + 'Nuevo</button></div>' + (retos || '<p class="muted small" style="margin:0">Aún no tienes retos.</p>') + '</section>' +
    '<p class="small" style="color:var(--tx4);line-height:1.5;margin:0 4px">Las apuestas no cuentan como gasto en Inicio. Aquí ves si el hobby te cuesta o te da dinero.</p></div>' + tabbar('mas');
}

/* ---------- Pantalla: Resumen (historias) ---------- */

function resumenData() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear(), mo = d.getMonth(), dim = daysIn(y, mo);
  const md = monthData(y, mo);
  const pd = new Date(y, mo - 1, 1);
  const pmd = monthData(pd.getFullYear(), pd.getMonth());
  const byCat = {};
  md.gastosAll.forEach((g) => { byCat[g.categoria] = (byCat[g.categoria] || 0) + g.importe; });
  const top3 = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const byDay = {};
  md.gastosAll.forEach((g) => { const k = parseD(g.fecha).getDate(); byDay[k] = (byDay[k] || 0) + g.importe; });
  const topDay = Object.keys(byDay).reduce((a, k) => (byDay[k] > (byDay[a] || 0) ? +k : a), 0);
  const dayMovs = md.gastosAll.filter((g) => parseD(g.fecha).getDate() === topDay);
  const activeDays = new Set(md.movs.map((m) => parseD(m.fecha).getDate())).size;
  const income = md.income || Number(S.data.config.nomina) || 0;
  return { y, mo, dim, md, total: md.cash, prevTotal: pmd.cash, top3, byDay, topDay, dayMovs, activeDays, saved: income - md.cash, maxDay: Math.max(0, ...Object.values(byDay)) };
}
function scrResumen() {
  const r = resumenData();
  const i = S.ui.story;
  const themes = [[acc(), '#0B0B0D'], ['#8B7CFF', '#0B0B0D'], ['#FF9F5A', '#0B0B0D'], ['#0B0B0D', '#F4F4F5'], ['#FF5D73', '#0B0B0D']];
  const [bg, fg] = themes[i];
  const segs = [0, 1, 2, 3, 4].map((k) => '<span style="height:4px;border-radius:2px;background:' + (i === 3 ? 'rgba(244,244,245,.2)' : 'rgba(11,11,13,.18)') + ';overflow:hidden"><span style="display:block;height:4px;background:' + fg + ';transform-origin:left;transform:scaleX(' + (k <= i ? 1 : 0) + ');' + (k === i && i < 4 ? 'animation:fill' + (S.ui.storyGen % 2 ? 'A' : 'B') + ' 5.6s linear both' : '') + '"></span></span>').join('');
  const mName = MONTHS[r.mo];
  let body = '';
  if (!r.md.movs.length) {
    body = '<div class="col" style="gap:18px;padding-top:60px"><span style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">' + cap(mName) + ' ' + r.y + '</span><span class="num" style="font-size:34px;font-weight:600;line-height:1.1">Aún no hay datos de ' + mName + '</span><span style="font-size:17px;font-weight:700;line-height:1.45">Cuando cierres tu primer mes completo apuntando, aquí tendrás tu resumen.</span></div>';
  } else if (i === 0) {
    const ch = r.prevTotal ? Math.round((r.total / r.prevTotal - 1) * 100) : null;
    body = '<div class="col" style="gap:18px;padding-top:40px"><span class="in" style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">' + cap(mName) + ' ' + r.y + '</span><span class="num in" style="--d:.15s;font-size:34px;font-weight:600;line-height:1.1;letter-spacing:-1px">Este mes gastaste</span>' +
      '<span class="num" data-count="' + r.total.toFixed(0) + '" data-dec="0" data-suffix="€" style="font-size:80px;font-weight:800;letter-spacing:-5px;line-height:1;animation:zoomIn .8s var(--spring) .35s both">' + fmt(r.total, 0) + '€</span>' +
      '<span class="in" style="--d:1s;font-size:17px;font-weight:700;line-height:1.45">' + (ch === null ? 'Tu primer mes completo con la app.' : ch > 0 ? 'Un ' + ch + ' % más que el mes anterior.' : 'Un ' + Math.abs(ch) + ' % menos que el mes anterior. Bien.') + '</span>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px"><span class="fade" style="--d:1.3s;padding:10px 16px;border-radius:16px;background:#0B0B0D;color:' + acc() + ';font-family:var(--num);font-size:14px;font-weight:700">' + fmt(r.total / r.dim, 0) + ' € al día</span><span class="fade" style="--d:1.5s;padding:10px 16px;border-radius:16px;background:rgba(11,11,13,.12);font-size:14px;font-weight:800">' + r.md.gastosAll.length + ' gastos</span></div></div>';
  } else if (i === 1) {
    const t = r.top3[0] || ['—', 0];
    const c = cat(t[0]);
    const mx = (r.top3[0] || [0, 1])[1] || 1;
    body = '<div class="col" style="gap:18px;padding-top:40px"><span class="in" style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Tu categoría estrella</span>' +
      '<div class="row" style="gap:16px;animation:zoomIn .8s var(--spring) .3s both"><span style="width:78px;height:78px;border-radius:26px;background:#0B0B0D;color:' + c.color + ';display:flex;align-items:center;justify-content:center">' + icon(c.icono, 38) + '</span><span class="num" style="font-size:' + (t[0].length > 10 ? 32 : 44) + 'px;font-weight:800;letter-spacing:-2px;line-height:1.05">' + esc(t[0]) + '</span></div>' +
      '<span class="in" style="--d:.8s;font-size:18px;font-weight:700;line-height:1.45">' + eur(t[1], 0) + ', el ' + Math.round(t[1] / (r.total || 1) * 100) + ' % de todo el mes.</span><div class="col" style="gap:14px;margin-top:10px">' +
      r.top3.map((e, k) => '<div class="col in" style="--d:' + (1 + k * 0.15).toFixed(2) + 's;gap:6px"><div class="between" style="font-size:15px;font-weight:800"><span>' + esc(e[0]) + '</span><span class="num" style="font-weight:600">' + eur(e[1], 0) + '</span></div><div style="height:14px;border-radius:7px;background:rgba(11,11,13,.15)"><div class="growx" style="height:14px;width:' + Math.round(e[1] / mx * 100) + '%;border-radius:7px;background:#0B0B0D;--d:' + (1.2 + k * 0.15).toFixed(2) + 's"></div></div></div>').join('') + '</div></div>';
  } else if (i === 2) {
    const d = new Date(r.y, r.mo, r.topDay || 1);
    const lead = (new Date(r.y, r.mo, 1).getDay() + 6) % 7;
    let cells = '';
    for (let k = 0; k < lead; k++) cells += '<span></span>';
    for (let n = 1; n <= r.dim; n++) {
      const v = r.byDay[n] || 0;
      const lvl = v ? Math.min(4, Math.ceil(v / (r.maxDay || 1) * 4)) : 0;
      const shades = ['rgba(11,11,13,.1)', 'rgba(11,11,13,.25)', 'rgba(11,11,13,.45)', 'rgba(11,11,13,.7)', '#0B0B0D'];
      cells += '<span style="aspect-ratio:1;border-radius:8px;background:' + shades[lvl] + ';' + (n === r.topDay ? 'transform:scale(1.15);animation:zoomIn .7s var(--spring) 1.5s both' : 'animation:fadeIn .3s ease ' + (1 + n * 0.02).toFixed(2) + 's both') + '"></span>';
    }
    body = '<div class="col" style="gap:16px;padding-top:40px"><span class="in" style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Tu día más caro</span>' +
      '<span class="num" style="font-size:58px;font-weight:800;letter-spacing:-3px;line-height:1;animation:zoomIn .8s var(--spring) .3s both">' + cap(WD_S[d.getDay()]) + ' ' + (r.topDay || '—') + '</span>' +
      '<span class="num in" style="--d:.6s;font-size:34px;font-weight:600;letter-spacing:-1px">' + eur(r.byDay[r.topDay] || 0) + '</span>' +
      '<span class="in" style="--d:.8s;font-size:17px;font-weight:700;line-height:1.45">' + esc(r.dayMovs.map((g) => g.concepto || g.categoria).slice(0, 4).join(', ') || 'Sin detalles') + '</span>' +
      '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:6px">' + cells + '</div></div>';
  } else if (i === 3) {
    const meta = S.data.metas.find((m) => m.principal) || S.data.metas[0];
    const p = meta && meta.objetivo ? meta.ahorrado / meta.objetivo * 100 : 0;
    body = '<div class="col" style="align-items:center;gap:22px;padding-top:30px;text-align:center"><span class="in" style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Lo que te quedó</span>' +
      '<div style="animation:zoomIn .7s var(--spring) .2s both">' + tank(220, clamp(r.saved / ((Number(S.data.config.nomina) || r.saved || 1)) * 100, 6, 100), acc(), '<span class="num" style="font-size:44px;font-weight:800;letter-spacing:-2px">' + (r.saved >= 0 ? '+' : '') + fmt(r.saved, 0) + '</span>') + '</div>' +
      '<span class="num in" style="--d:.9s;font-size:24px;font-weight:600;letter-spacing:-.6px;line-height:1.2">euros de margen en ' + mName + '</span>' +
      (meta ? '<span class="in" style="--d:1.1s;font-size:16px;font-weight:700;line-height:1.45;color:var(--tx2);max-width:300px">' + esc(meta.nombre) + ': llevas ' + fmt(meta.ahorrado, 0) + ' € de ' + fmt(meta.objetivo, 0) + ' € (' + Math.round(p) + ' %).</span>' : '') + '</div>';
  } else {
    body = '<div class="col" style="gap:18px;padding-top:40px;flex-grow:1"><span class="in" style="font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Constancia</span>' +
      '<span style="width:96px;height:96px;border-radius:32px;background:#0B0B0D;color:#FF9F5A;display:flex;align-items:center;justify-content:center;animation:zoomIn .7s var(--spring) .25s both">' + icon('flame', 48) + '</span>' +
      '<span class="num in" style="--d:.5s;font-size:38px;font-weight:800;letter-spacing:-1.5px;line-height:1.08">' + r.activeDays + ' de ' + r.dim + ' días apuntando</span>' +
      '<span class="in" style="--d:.8s;font-size:17px;font-weight:700;line-height:1.45">' + (r.activeDays >= r.dim * 0.8 ? 'Con datos así, los números de la app son de fiar.' : 'Cuantos más días apuntes, más fino será el análisis.') + '</span>' +
      '<div class="row in" style="--d:1.1s;gap:10px;margin-top:auto;position:relative;z-index:4"><a href="#mas" class="btn" style="flex-grow:1;background:#0B0B0D;color:var(--tx)">Cerrar</a><button class="btn" data-act="story-restart" style="background:rgba(11,11,13,.12);color:#0B0B0D">' + icon('refresh-cw', 18) + '</button></div></div>';
  }
  return '<div id="story" style="position:fixed;inset:0;max-width:480px;margin:0 auto;background:' + bg + ';color:' + fg + ';overflow:hidden;transition:background-color .6s,color .4s;z-index:50">' +
    '<div style="position:absolute;left:14px;right:14px;top:calc(var(--safe-t) + 12px);display:flex;flex-direction:column;gap:12px;z-index:3"><div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px">' + segs + '</div>' +
    '<div class="between" style="align-items:center"><span style="font-size:13px;font-weight:800">Tu ' + mName + '</span><a href="#mas" aria-label="Cerrar" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:' + fg + '">' + icon('x', 22, 2.4) + '</a></div></div>' +
    '<button data-act="story-prev" aria-label="Anterior" style="position:absolute;left:0;top:90px;bottom:160px;width:35%;border:0;background:transparent;z-index:2"></button>' +
    '<button data-act="story-next" aria-label="Siguiente" style="position:absolute;right:0;top:90px;bottom:160px;width:65%;border:0;background:transparent;z-index:2"></button>' +
    '<div style="position:absolute;left:24px;right:24px;top:calc(var(--safe-t) + 100px);bottom:calc(var(--safe-b) + 30px);display:flex;flex-direction:column;z-index:1">' + body + '</div></div>';
}
function armStory() {
  clearTimeout(S.storyTimer);
  if (S.route === 'resumen' && S.ui.story < 4) S.storyTimer = setTimeout(() => goStory(S.ui.story + 1), 5600);
}
function goStory(n) {
  if (n < 0 || n > 4) return;
  S.ui.story = n; S.ui.storyGen++;
  S.lastRendered = null;
  render();
  armStory();
}

/* ---------- Pantalla: Apple Pay y Siri ---------- */

function scrApplePay() {
  const notif = [['Repsol Granollers', '−52,40 €', 'Gasolina', 'ahora'], ['Mercadona', '−23,15 €', 'Supermercado', '12:04'], ['Café', '−1,60 €', 'Comer fuera', '8:41']];
  const reglas = S.data.reglas.map((r, i) => {
    const c = cat(r.categoria);
    return '<button class="row fade" data-act="regla-open" data-id="' + esc(r.id) + '" style="--d:' + (0.4 + i * 0.05).toFixed(2) + 's;width:100%;min-height:58px;gap:10px;border:0;border-bottom:1px solid ' + (i === S.data.reglas.length - 1 ? 'transparent' : 'rgba(255,255,255,.05)') + ';background:none;text-align:left;padding:8px 0">' +
      '<span class="grow" style="font-size:13px;font-weight:700;color:var(--tx2);line-height:1.35">' + esc(r.patrones) + '</span><span style="color:#5C5C66">' + icon('arrow-right', 16, 2.2) + '</span>' +
      '<span class="pill row" style="gap:6px;color:' + c.color + ';background:' + rgba(c.color, 0.13) + '"><span class="dot" style="width:7px;height:7px;background:' + c.color + '"></span>' + esc(r.categoria) + '</span></button>';
  }).join('');
  const step = (n, t, d, col) => '<div class="row" style="align-items:flex-start;gap:14px"><span class="popin" style="width:32px;height:32px;flex-shrink:0;border-radius:50%;background:' + col + ';color:#0B0B0D;display:flex;align-items:center;justify-content:center;font-family:var(--num);font-size:13px;font-weight:700">' + n + '</span><div class="col" style="gap:3px;padding-top:4px"><b style="font-size:14px">' + t + '</b><span style="font-size:13px;line-height:1.5;color:var(--tx3)">' + d + '</span></div></div>';
  const disabled = S.cfg.demo || !S.cfg.url;
  return '<div class="page sub">' + subHeader('Apple Pay y Siri') +
    '<section class="in" style="--d:.05s;position:relative;overflow:hidden;height:290px;border-radius:32px;background:linear-gradient(160deg,#241F45,#121218 55%,#0F1A12);border:1px solid rgba(255,255,255,.08)">' +
    '<div class="col" style="position:absolute;top:22px;left:0;right:0;text-align:center;gap:2px"><span class="num" style="font-size:42px;font-weight:500;color:rgba(244,244,245,.92)">' + pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()) + '</span><span style="font-size:13px;font-weight:600;color:rgba(244,244,245,.6)">' + cap(WD[new Date().getDay()]) + ', ' + new Date().getDate() + ' de ' + MONTHS[new Date().getMonth()] + '</span></div>' +
    '<div class="col" style="position:absolute;left:14px;right:14px;top:112px;gap:8px">' + notif.map((n, i) => '<div class="row" style="gap:12px;padding:12px 14px;border-radius:20px;background:rgba(40,40,48,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.08);animation:dropIn .7s cubic-bezier(.3,1.3,.5,1) ' + (0.6 + i * 0.7).toFixed(1) + 's both"><span class="ico" style="width:36px;height:36px;border-radius:10px;background:' + acc() + ';color:#0B0B0D">' + icon('zap', 18, 2.4) + '</span><span class="col grow" style="gap:1px"><span class="between" style="font-size:12px;font-weight:700;color:rgba(244,244,245,.6)"><span>ATAJOS</span><span>' + n[3] + '</span></span><b style="font-size:14px">' + n[0] + ' · ' + n[1] + '</b><span style="font-size:12px;color:rgba(244,244,245,.7)">Apuntado en ' + n[2] + '</span></span></div>').join('') + '</div></section>' +
    (disabled ? '<div class="banner in" style="--d:.1s;background:rgba(255,184,77,.1);border:1px solid rgba(255,184,77,.25);color:#FFD08A">' + icon('info', 18) + 'Primero conecta tu Google Sheet en Ajustes.</div>' :
      '<div class="grid2 in" style="--d:.1s"><button class="btn ghost" data-act="copy" data-v="url">' + icon('copy', 16) + 'Copiar URL</button><button class="btn ghost" data-act="copy" data-v="token">' + icon('copy', 16) + 'Copiar token</button></div>') +
    '<section class="card col in" style="--d:.15s;gap:16px;border-radius:26px"><h2>Apple Pay automático</h2>' +
    step(1, 'Crea la automatización', 'App Atajos → Automatización → + → Cartera (Transacción). Elige tus tarjetas y marca «Ejecutar inmediatamente».', acc()) +
    step(2, 'Añade «Obtener contenido de URL»', 'Pega tu URL. Método: POST. Cuerpo de la solicitud: JSON con estos campos: token (tu token), action = applepay, amount = Importe y merchant = Comercio (las dos últimas como variables de la transacción).', '#B4A8FF') +
    step(3, 'Muestra el resultado', 'Añade «Obtener valor del diccionario» con la clave mensaje y después «Mostrar notificación». Así ves en qué categoría ha caído cada pago.', '#8B7CFF') +
    '<span class="small" style="color:var(--tx4);line-height:1.5">Solo salta con pagos de Apple Pay desde el iPhone o el reloj. La tarjeta física, Bizum o el efectivo se apuntan a mano o con foto del ticket.</span></section>' +
    '<section class="card col in" style="--d:.2s;gap:16px;border-radius:26px;background:linear-gradient(120deg,#2A1530,#141417 70%);border-color:rgba(244,114,182,.22)"><div class="row" style="gap:14px"><div class="row" aria-hidden="true" style="gap:4px;height:36px">' +
    [0.9, 1.2, 0.7, 1.1, 0.8, 1.3, 1.0].map((dd, i) => '<span style="width:5px;height:32px;border-radius:3px;background:#F472B6;animation:wave ' + dd + 's ease-in-out ' + (i * 0.12).toFixed(2) + 's infinite"></span>').join('') + '</div><div class="col" style="gap:2px"><b style="font-size:15px">«Oye Siri, gasto»</b><span class="small" style="color:var(--tx2)">Apunta hablando, sin abrir la app.</span></div></div>' +
    step(1, 'Nuevo atajo llamado «Gasto»', 'Acciones: «Solicitar entrada» (tipo Número, pregunta «¿Cuánto?») y «Elegir de la lista» con tus categorías.', '#F472B6') +
    step(2, 'Envíalo a tu Sheet', '«Obtener contenido de URL», método POST, cuerpo JSON: token, action = siri, amount = la entrada, categoria = la opción elegida. Termina con «Mostrar notificación».', '#F9A8D4') + '</section>' +
    '<section class="col in" style="--d:.25s;gap:12px"><div class="between"><h2>Reglas de categoría</h2><button class="chip" data-act="regla-new">' + icon('plus', 14, 2.6) + 'Nueva</button></div>' +
    '<div class="card" style="padding:4px 14px;border-radius:24px">' + (reglas || '<p class="small muted">Sin reglas.</p>') + '</div><span class="small" style="color:var(--tx4)">Si el nombre del comercio contiene una de esas palabras, el pago cae en esa categoría. Si no, va a «Otros».</span></section></div>' + tabbar('mas');
}


/* ---------- Pantalla: Resumen mes a mes (tipo Excel) ---------- */

function tablaData(y) {
  const now = new Date();
  const cy = now.getFullYear();
  const lastM = y < cy ? 11 : (y > cy ? -1 : now.getMonth());
  const months = [];
  for (let m = 0; m < 12; m++) months.push(m <= lastM ? monthData(y, m) : null);
  const ing = {}, gas = {};
  months.forEach((md, m) => {
    if (!md) return;
    md.movs.forEach((x) => {
      if (x.tipo === 'ingreso') { ing[x.categoria] = ing[x.categoria] || Array(12).fill(0); ing[x.categoria][m] += x.importe; }
      if (x.tipo === 'gasto') { gas[x.categoria] = gas[x.categoria] || Array(12).fill(0); gas[x.categoria][m] += x.importe; }
    });
  });
  const order = (obj) => Object.keys(obj).sort((a, b) => sum(obj[b]) - sum(obj[a]));
  const colSum = (obj) => Array(12).fill(0).map((_, m) => sum(Object.values(obj).map((r) => r[m])));
  const totIng = colSum(ing), totGas = colSum(gas);
  const ahorro = totIng.map((v, m) => (months[m] ? v - totGas[m] : 0));
  const pct = ahorro.map((v, m) => (totIng[m] ? v / totIng[m] * 100 : 0));
  const bets = months.map((md) => (md ? md.ret - md.dep : 0));
  let acc0 = 0; const acum = ahorro.map((v, m) => (months[m] ? (acc0 += v) : 0));
  return { y, lastM, months, ing, gas, ingOrder: order(ing), gasOrder: order(gas), totIng, totGas, ahorro, pct, bets, acum, n: lastM + 1 };
}
function scrMensual() {
  const y = new Date().getFullYear() + S.ui.tablaYear;
  const T = tablaData(y);
  const cell = (v, m, opts = {}) => {
    if (m > T.lastM) return '<td class="fut">·</td>';
    const txt = opts.pct ? fmt(v, 0) + ' %' : (v === 0 && !opts.zero ? '<span style="color:#3A3A42">0</span>' : fmt(v, opts.dec === undefined ? 0 : opts.dec, opts.sign));
    const style = (opts.bg ? 'background:' + opts.bg + ';' : '') + (opts.color ? 'color:' + opts.color + ';' : '');
    return '<td' + (style ? ' style="' + style + '"' : '') + '>' + txt + '</td>';
  };
  const totals = (arr, opts = {}) => {
    const t = sum(arr.slice(0, T.n));
    const media = T.n ? t / T.n : 0;
    return '<td class="tot">' + (opts.pct ? '' : fmt(t, 0, opts.sign)) + '</td><td class="tot">' + (opts.pct ? fmt(media, 0) + ' %' : fmt(media, 0, opts.sign)) + '</td>';
  };
  const row = (label, arr, opts = {}) => '<tr class="' + (opts.cls || '') + '"><th>' + (opts.dot ? '<span class="dot" style="background:' + opts.dot + ';width:7px;height:7px"></span>' : '') + esc(label) + '</th>' +
    arr.map((v, m) => cell(v, m, Object.assign({}, opts, { bg: opts.heat ? opts.heat(v) : null, color: opts.colorFn ? opts.colorFn(v) : null }))).join('') + totals(arr, opts) + '</tr>';
  const sec = (label) => '<tr class="sec"><th>' + label + '</th>' + '<td></td>'.repeat(14) + '</tr>';
  const heatFor = (arr, color) => { const mx = Math.max(1, ...arr); return (v) => (v ? rgba(color, 0.06 + 0.32 * v / mx) : null); };
  const head = '<tr class="hd"><th>' + y + '</th>' + MONTHS_S.map((m, i) => '<td>' + (i <= T.lastM ? '<button data-act="tabla-mes" data-m="' + i + '">' + cap(m) + '</button>' : cap(m)) + '</td>').join('') + '<td class="tot">Total</td><td class="tot">Media</td></tr>';
  let body = sec('Ingresos') + (T.ingOrder.length ? T.ingOrder.map((k) => row(k, T.ing[k], { dot: cat(k).color })).join('') : '<tr><th class="muted">Sin ingresos</th>' + '<td></td>'.repeat(14) + '</tr>') +
    row('Total ingresos', T.totIng, { cls: 'strong', color: null, colorFn: () => acc() }) +
    sec('Gastos') + T.gasOrder.map((k) => row(k, T.gas[k], { dot: cat(k).color, heat: heatFor(T.gas[k], cat(k).color) })).join('') +
    row('Total gastos', T.totGas, { cls: 'strong' }) +
    sec('Resultado') +
    row('Ahorro', T.ahorro, { cls: 'strong', sign: true, colorFn: (v) => (v >= 0 ? acc() : '#FF5D73') }) +
    row('% de ahorro', T.pct, { pct: true, colorFn: (v) => (v >= 20 ? acc() : v >= 0 ? '#FFB84D' : '#FF5D73') }) +
    row('Ahorro acumulado', T.acum, { sign: true }) +
    row('Apuestas (neto)', T.bets, { sign: true, colorFn: (v) => (v > 0 ? acc() : v < 0 ? '#FF8A9A' : null) });
  const realMonths = T.months.map((md, m) => ({ md, m })).filter((x) => x.md && (x.md.cash || x.md.income));
  const best = realMonths.reduce((a, b) => (!a || T.ahorro[b.m] > T.ahorro[a.m] ? b : a), null);
  const worst = realMonths.reduce((a, b) => (!a || T.totGas[b.m] > T.totGas[a.m] ? b : a), null);
  const totAh = sum(T.ahorro.slice(0, T.n));
  const totIn = sum(T.totIng.slice(0, T.n));
  return '<div class="page sub">' + subHeader('Resumen mes a mes', S.prevRoute === 'inicio' ? 'inicio' : 'mas') +
    '<div class="between in" style="--d:.03s;align-items:center"><button class="ibtn" data-act="tabla-year" data-v="-1" aria-label="Año anterior">' + icon('chevron-left', 18, 2.4) + '</button><span style="font-size:18px;font-weight:800">' + y + '</span><button class="ibtn" data-act="tabla-year" data-v="1" aria-label="Año siguiente" ' + (S.ui.tablaYear >= 0 ? 'disabled style="opacity:.35"' : '') + '>' + icon('chevron-right', 18, 2.4) + '</button></div>' +
    '<div class="grid2 in" style="--d:.06s"><div class="mini"><span class="l">Ahorrado en ' + y + '</span><span class="v" style="color:' + (totAh >= 0 ? acc() : '#FF5D73') + '">' + fmt(totAh, 0, true) + ' €</span></div><div class="mini"><span class="l">% de ahorro</span><span class="v">' + (totIn ? fmt(totAh / totIn * 100, 0) : '0') + ' %</span></div>' +
    '<div class="mini"><span class="l">Mejor mes</span><span class="v" style="font-size:14px">' + (best ? cap(MONTHS[best.m]) + ' · ' + fmt(T.ahorro[best.m], 0, true) + ' €' : '—') + '</span></div><div class="mini"><span class="l">Mes que más gastaste</span><span class="v" style="font-size:14px">' + (worst ? cap(MONTHS[worst.m]) + ' · ' + fmt(T.totGas[worst.m], 0) + ' €' : '—') + '</span></div></div>' +
    '<div class="tablewrap in" style="--d:.1s"><table class="xl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="small fade" style="--d:.4s;color:var(--tx4);margin:-6px 4px 0">Desliza la tabla hacia los lados. Toca un mes para ver sus movimientos. Las apuestas van aparte y no cuentan como gasto.</p>' +
    '<div class="grid2 in" style="--d:.2s"><button class="btn ghost" data-act="tabla-export">' + icon('download', 18) + 'Exportar tabla</button>' + (S.data.sheetUrl ? '<a class="btn ghost" href="' + esc(S.data.sheetUrl) + '" target="_blank" rel="noopener">' + icon('sheet', 18) + 'Abrir Sheet</a>' : '<button class="btn ghost" data-act="export">' + icon('download', 18) + 'Movimientos</button>') + '</div>' +
    '</div>' + tabbar(S.prevRoute === 'inicio' ? 'inicio' : 'mas');
}
function exportTabla() {
  const y = new Date().getFullYear() + S.ui.tablaYear;
  const T = tablaData(y);
  const n2 = (v) => fmt(v).replace('−', '-').replace(/\./g, '');
  const rows = [['Concepto'].concat(MONTHS.map(cap), ['Total', 'Media'])];
  const add = (label, arr) => { const t = sum(arr.slice(0, T.n)); rows.push([label].concat(arr.map((v, m) => (m <= T.lastM ? n2(v) : '')), [n2(t), n2(T.n ? t / T.n : 0)])); };
  rows.push(['INGRESOS']); T.ingOrder.forEach((k) => add(k, T.ing[k])); add('Total ingresos', T.totIng);
  rows.push(['GASTOS']); T.gasOrder.forEach((k) => add(k, T.gas[k])); add('Total gastos', T.totGas);
  rows.push(['RESULTADO']); add('Ahorro', T.ahorro); add('Ahorro acumulado', T.acum); add('Apuestas (neto)', T.bets);
  const csv = '﻿' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'resumen_' + y + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Pantalla: Simulador de hipoteca ---------- */

function parseNum(v) { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n; }
function simCalc() {
  const s = S.prefs.sim;
  const P = parseAmount(s.precio), e = parseNum(s.entrada) / 100, g = parseNum(s.gastos) / 100;
  const n = Math.max(1, Math.round(parseNum(s.anos) * 12)), r = parseNum(s.tin) / 100 / 12;
  const loan = P * (1 - e);
  const cuota = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
  const need = P * (e + g);
  const meta = S.data.metas.find((m) => m.principal) || S.data.metas[0];
  const have = meta ? meta.ahorrado : 0;
  const rate = savingRate();
  const left = Math.max(0, need - have);
  const months = left === 0 ? 0 : (rate > 0 ? Math.ceil(left / rate) : null);
  const incomeM = incomeBase() + extrasPerMonth();
  return { P, e, g, loan, cuota, need, entrada: P * e, gastos: P * g, total: cuota * n, intereses: cuota * n - loan, meta, have, rate, months, ratio: incomeM ? cuota / incomeM * 100 : 0, incomeM };
}
function simOutHTML() {
  const c = simCalc();
  const p = c.need ? clamp(c.have / c.need * 100, 0, 100) : 0;
  const when = c.months === 0 ? 'Ya lo tienes' : c.months === null ? 'Con tu ritmo actual no llegas' : (() => { const d = addMonths(new Date(), c.months); return cap(MONTHS[d.getMonth()]) + ' de ' + d.getFullYear(); })();
  const rc = c.ratio <= 30 ? acc() : c.ratio <= 35 ? '#FFB84D' : '#FF5D73';
  return '<section class="card hero col" style="gap:14px;padding:20px 18px">' +
    '<span class="muted" style="font-size:13px">Necesitas ahorrar</span><span class="num" style="font-size:36px;font-weight:600;letter-spacing:-1.4px">' + eur(c.need, 0) + '</span>' +
    '<span class="small" style="color:var(--tx2)">' + eur(c.entrada, 0) + ' de entrada + ' + eur(c.gastos, 0) + ' de impuestos y gastos</span>' +
    '<div class="col" style="gap:6px"><div class="bar" style="height:10px"><i style="width:' + p.toFixed(0) + '%;background:' + acc() + '"></i></div><span class="small muted">' + (c.meta ? 'Llevas ' + eur(c.have, 0) + ' en «' + esc(c.meta.nombre) + '» (' + Math.round(p) + ' %)' : 'Crea una meta en Objetivos para seguir el progreso') + '</span></div>' +
    '<div class="grid2"><div class="mini"><span class="l">Llegas en</span><span class="v" style="font-size:15px;color:' + (c.months === null ? '#FF5D73' : acc()) + '">' + when + '</span></div><div class="mini"><span class="l">Tu ritmo de ahorro</span><span class="v" style="font-size:15px">' + (c.rate > 0 ? fmt(c.rate, 0) + ' €/mes' : '—') + '</span></div></div></section>' +
    '<section class="card col" style="gap:12px;border-radius:26px"><div class="between" style="align-items:flex-end"><div class="col" style="gap:2px"><span class="muted" style="font-size:13px">Cuota mensual</span><span class="num" style="font-size:30px;font-weight:600;letter-spacing:-1px">' + eur(c.cuota, 0) + '</span></div>' +
    '<span class="pill" style="font-size:12px;padding:6px 10px;color:' + rc + ';background:' + rgba(rc, 0.12) + '">' + fmt(c.ratio, 0) + ' % de tus ingresos</span></div>' +
    '<span class="small" style="color:var(--tx3);line-height:1.5">' + (c.ratio <= 30 ? 'Cómodo: los bancos suelen pedir que la cuota no pase del 30-35 % de lo que cobras.' : c.ratio <= 35 ? 'Al límite de lo que suelen aceptar los bancos (30-35 % de tus ingresos).' : 'Por encima de lo que suelen aceptar los bancos. Baja el precio, alarga el plazo o espera a cobrar más.') + '</span>' +
    '<div class="grid2"><div class="mini"><span class="l">Hipoteca</span><span class="v" style="font-size:15px">' + eur(c.loan, 0) + '</span></div><div class="mini"><span class="l">Intereses totales</span><span class="v" style="font-size:15px">' + eur(c.intereses, 0) + '</span></div></div></section>' +
    (c.meta ? '<button class="btn block" data-act="sim-use">' + icon('target', 18) + 'Usar ' + eur(c.need, 0) + ' como objetivo de «' + esc(c.meta.nombre) + '»</button>' : '');
}
function scrSimulador() {
  const s = S.prefs.sim;
  const f = (k, label, mode, suf) => '<label class="field"><span>' + label + '</span><div style="position:relative"><input class="input" inputmode="' + mode + '" data-inp="sim.' + k + '" data-live="sim-update" value="' + esc(s[k]) + '" style="padding-right:38px"><span style="position:absolute;right:14px;top:14px;color:var(--tx4);font-weight:700">' + suf + '</span></div></label>';
  return '<div class="page sub">' + glow('#FDBA74', -100, 'right', 360, 12) + subHeader('Simulador de hipoteca', S.prevRoute === 'objetivos' ? 'objetivos' : 'mas') +
    '<section class="card col in" style="--d:.05s;gap:12px;border-radius:26px">' + f('precio', 'Precio del piso', 'numeric', '€') +
    '<div class="grid2">' + f('entrada', 'Entrada', 'decimal', '%') + f('gastos', 'Impuestos y gastos', 'decimal', '%') + '</div>' +
    '<div class="grid2">' + f('anos', 'Plazo', 'numeric', 'años') + f('tin', 'Interés (TIN)', 'decimal', '%') + '</div>' +
    '<span class="small" style="color:var(--tx4);line-height:1.5">El banco suele financiar el 80 %, así que la entrada habitual es del 20 %. En Cataluña el ITP de segunda mano es del 10 % más notaría, registro y gestoría; para jóvenes puede haber tipo reducido, compruébalo. El interés, ajústalo a lo que te ofrezca tu banco.</span></section>' +
    '<div id="simout" class="col in" style="--d:.12s;gap:14px">' + simOutHTML() + '</div>' +
    '<p class="small" style="color:var(--tx4);margin:0 4px">Tu ritmo de ahorro sale de tus ingresos fijos (nómina y pagas extra prorrateadas) menos lo que has gastado de media en los últimos meses. Es una simulación orientativa, no una oferta de hipoteca.</p></div>' + tabbar('objetivos');
}

/* ---------- Pantalla: Ajustes ---------- */

function scrAjustes() {
  const f = S.ui.form;
  if (f._ajustes !== true) { S.ui.form = { _ajustes: true, url: S.cfg.url, token: S.cfg.token, nomina: S.data.config.nomina || '', limite: S.data.config.limite_apuestas || '', nombre: S.data.config.nombre || '' }; }
  const F = S.ui.form;
  const ping = S.ui.ping;
  return '<div class="page sub">' + subHeader('Ajustes') +
    '<section class="card col in" style="--d:.05s;gap:14px;border-radius:26px"><h2>Conexión con Google Sheet</h2>' +
    '<label class="field"><span>URL de la aplicación web (acaba en /exec)</span><input class="input" data-inp="form.url" value="' + esc(F.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-size:14px"></label>' +
    '<label class="field"><span>Token</span><input class="input" data-inp="form.token" value="' + esc(F.token) + '" placeholder="El que salió al ejecutar setup()" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
    '<button class="btn" data-act="cfg-save">' + icon('link', 18) + 'Guardar y probar</button>' +
    (ping ? '<div class="banner" style="background:' + (ping.ok ? rgba(acc(), 0.1) : 'rgba(255,93,115,.12)') + ';color:' + (ping.ok ? acc() : '#FF8A9A') + '">' + icon(ping.ok ? 'check' : 'cloud-off', 18) + esc(ping.msg) + '</div>' : '') +
    (S.data.sheetUrl ? '<a class="btn ghost" href="' + esc(S.data.sheetUrl) + '" target="_blank" rel="noopener">' + icon('sheet', 18) + 'Abrir mi Google Sheet</a>' : '') +
    (S.cfg.demo ? '<span class="small" style="color:#FFB84D">Estás en modo demo: los datos solo viven en este iPhone.</span>' : '<button class="btn ghost" data-act="demo-on">' + icon('sparkles', 18) + 'Probar con datos de ejemplo</button>') + '</section>' +
    '<section class="card col in" style="--d:.1s;gap:14px;border-radius:26px"><h2>Tus números</h2><div class="grid2">' +
    '<label class="field"><span>Nómina neta / mes</span><input class="input" inputmode="decimal" data-inp="form.nomina" value="' + esc(F.nomina) + '"></label>' +
    '<label class="field"><span>Tope apuestas / mes</span><input class="input" inputmode="decimal" data-inp="form.limite" value="' + esc(F.limite) + '"></label></div>' +
    '<label class="field"><span>Tu nombre</span><input class="input" data-inp="form.nombre" value="' + esc(F.nombre) + '"></label>' +
    '<button class="btn ghost" data-act="nums-save">' + icon('check', 18) + 'Guardar</button><span class="small muted">Los presupuestos de cada categoría se cambian en la hoja «Categorias» de tu Sheet.</span></section>' +
    '<section class="card col in" style="--d:.15s;gap:14px;border-radius:26px"><h2>Apariencia</h2><div class="row" style="gap:12px">' +
    ACCENTS.map((c) => '<button data-act="accent" data-v="' + c + '" aria-label="Color ' + c + '" aria-pressed="' + (c === acc()) + '" style="width:48px;height:48px;border-radius:50%;background:' + c + ';border:3px solid ' + (c === acc() ? '#F4F4F5' : 'transparent') + ';box-shadow:' + (c === acc() ? '0 0 0 4px ' + rgba(c, 0.25) : 'none') + '"></button>').join('') + '</div>' +
    '<button class="toggle" data-act="calm" aria-pressed="' + S.prefs.calm + '"><span class="col grow" style="gap:2px"><span style="font-size:15px;font-weight:700">Reducir animaciones</span><span class="small muted">Para ir más rápido o ahorrar batería</span></span><span class="switch' + (S.prefs.calm ? ' on' : '') + '"></span></button></section>' +
    '<section class="card col in" style="--d:.2s;gap:12px;border-radius:26px"><h2>Datos</h2>' +
    '<button class="btn ghost" data-act="export">' + icon('download', 18) + 'Exportar a CSV (Excel)</button>' +
    '<button class="btn ghost" data-act="sync">' + icon('refresh-cw', 18) + 'Sincronizar ahora</button>' +
    '<button class="btn ghost" data-act="reset" style="color:#FF8A9A">' + icon('trash-2', 18) + 'Borrar datos de este iPhone</button>' +
    '<span class="small muted">' + S.data.movs.length + ' movimientos guardados · ' + S.queue.length + ' pendientes de subir</span></section></div>' + tabbar('mas');
}

/* ---------- Pantalla: Primera vez ---------- */

function scrSetup() {
  const F = S.ui.form;
  return '<div class="page" style="justify-content:center;min-height:100vh;padding-bottom:40px">' + glow(acc(), 60, 'left', 420, 12) + glow('#8B7CFF', 420, 'right', 360, 14) +
    '<div class="col in" style="align-items:center;text-align:center;gap:16px;padding-top:30px"><img src="icon-192.png" alt="" width="88" height="88" style="border-radius:24px;box-shadow:0 18px 40px ' + rgba(acc(), 0.25) + '">' +
    '<h1 style="font-size:32px">Gastos</h1><span style="font-size:15px;color:var(--tx2);max-width:300px;line-height:1.5">Tu dinero, apuntado en segundos y guardado en tu propio Google Sheet.</span></div>' +
    '<section class="card col in" style="--d:.15s;gap:14px;border-radius:26px"><h2>Conectar mi Sheet</h2>' +
    '<label class="field"><span>URL de la aplicación web</span><input class="input" data-inp="form.url" value="' + esc(F.url || '') + '" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-size:14px"></label>' +
    '<label class="field"><span>Token</span><input class="input" data-inp="form.token" value="' + esc(F.token || '') + '" placeholder="Lo copiaste al ejecutar setup()" autocapitalize="off" autocorrect="off" spellcheck="false"></label>' +
    '<button class="btn" data-act="cfg-save">' + icon('link', 18) + 'Conectar</button>' +
    (S.ui.ping ? '<div class="banner" style="background:' + (S.ui.ping.ok ? rgba(acc(), 0.1) : 'rgba(255,93,115,.12)') + ';color:' + (S.ui.ping.ok ? acc() : '#FF8A9A') + '">' + esc(S.ui.ping.msg) + '</div>' : '') + '</section>' +
    '<button class="btn ghost in" data-act="demo-on" style="--d:.25s">' + icon('sparkles', 18) + 'Probar primero con datos de ejemplo</button></div>';
}

/* ---------- Hojas inferiores (formularios) ---------- */

function sheetHTML() {
  const sh = S.ui.sheet;
  if (!sh) return '';
  const F = S.ui.form;
  let body = '';
  const catOpts = (tipo, sel) => catsOf(tipo).map((c) => '<option' + (c.nombre === sel ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
  if (sh.type === 'meta') {
    const m = S.data.metas.find((x) => x.id === sh.id);
    body = (m ? '<h2>' + esc(m.nombre) + '</h2><span class="muted small">Llevas ' + eur(m.ahorrado, 0) + ' de ' + eur(m.objetivo, 0) + '</span>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + [20, 50, 100, 200].map((v) => '<button class="chip" data-act="meta-quick" data-v="' + v + '">+' + v + ' €</button>').join('') + '</div>' +
      '<div class="row"><input class="input" inputmode="decimal" data-inp="form.aporte" value="' + esc(F.aporte || '') + '" placeholder="Otra cantidad"><button class="btn" data-act="meta-aportar">Aportar</button></div>' +
      '<details style="border-top:1px solid var(--line);padding-top:12px"><summary style="font-weight:800;cursor:pointer">Editar meta</summary><div class="col" style="gap:12px;margin-top:12px">' : '<h2>Nueva meta</h2><div class="col" style="gap:12px">') +
      '<label class="field"><span>Nombre</span><input class="input" data-inp="form.nombre" value="' + esc(F.nombre || '') + '" placeholder="Viaje, coche, emergencia…"></label>' +
      '<div class="grid2"><label class="field"><span>Objetivo (€)</span><input class="input" inputmode="decimal" data-inp="form.objetivo" value="' + esc(F.objetivo || '') + '"></label><label class="field"><span>Ahorrado (€)</span><input class="input" inputmode="decimal" data-inp="form.ahorrado" value="' + esc(F.ahorrado || '') + '"></label></div>' +
      '<label class="field"><span>Para cuándo (opcional)</span><input class="input" type="date" data-inp="form.fecha_objetivo" value="' + esc(F.fecha_objetivo || '') + '"></label>' +
      '<button class="toggle" data-act="form-bool" data-k="principal"><span class="grow" style="font-weight:700">Meta principal</span><span class="switch' + (F.principal ? ' on' : '') + '"></span></button>' +
      '<button class="btn" data-act="meta-save">Guardar</button>' + (m ? '<button class="btn ghost" data-act="meta-del" style="color:#FF8A9A">Borrar meta</button></div></details>' : '</div>');
  } else if (sh.type === 'fijo') {
    const isNew = !sh.id;
    const tp = F.tipo || 'gasto';
    body = '<h2>' + (isNew ? 'Nuevo fijo' : 'Editar fijo') + '</h2>' +
      '<div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))"><span class="knob" style="width:calc(50% - 4px);left:' + (tp === 'gasto' ? '4px' : '50%') + ';background:' + (tp === 'gasto' ? 'var(--tx)' : acc()) + '"></span><button class="' + (tp === 'gasto' ? 'on' : '') + '" data-act="fijo-tipo" data-v="gasto">Pago</button><button class="' + (tp === 'ingreso' ? 'on' : '') + '" data-act="fijo-tipo" data-v="ingreso">Ingreso</button></div>' +
      '<label class="field"><span>Nombre</span><input class="input" data-inp="form.nombre" value="' + esc(F.nombre || '') + '" placeholder="' + (tp === 'gasto' ? 'Gimnasio, seguro, Spotify…' : 'Nómina, paga extra de junio…') + '"></label>' +
      '<div class="grid2"><label class="field"><span>Importe (€)</span><input class="input" inputmode="decimal" data-inp="form.importe" value="' + esc(F.importe || '') + '"></label>' +
      '<label class="field"><span>Cada</span><select class="input" data-inp="form.frecuencia_meses">' + [[1, 'mes'], [2, '2 meses'], [3, '3 meses'], [6, '6 meses'], [12, 'año']].map((o) => '<option value="' + o[0] + '"' + (String(F.frecuencia_meses) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="grid2"><label class="field"><span>' + (tp === 'gasto' ? 'Próximo cargo' : 'Próximo cobro') + '</span><input class="input" type="date" data-inp="form.proximo" value="' + esc(F.proximo || '') + '"></label>' +
      '<label class="field"><span>Categoría</span><select class="input" data-inp="form.categoria">' + catOpts(tp, F.categoria) + '</select></label></div>' +
      '<span class="small muted">' + (tp === 'gasto' ? 'El día del cargo se apunta solo como gasto. Si es cada varios meses, la app va apartando la parte proporcional cada mes.' : 'El día del cobro se apunta solo como ingreso. Las pagas extra ponlas «cada año», una en junio y otra en diciembre.') + '</span>' +
      '<button class="btn" data-act="fijo-save">Guardar</button>' + (isNew ? '' : '<button class="btn ghost" data-act="fijo-del" style="color:#FF8A9A">Borrar</button>');
  } else if (sh.type === 'reto') {
    const isNew = !sh.id;
    body = '<h2>' + (isNew ? 'Nuevo reto' : esc(F.nombre)) + '</h2>' +
      (isNew ? '<label class="field"><span>Nombre</span><input class="input" data-inp="form.nombre" value="' + esc(F.nombre || '') + '" placeholder="Reto 10 → 100"></label>' : '') +
      '<div class="grid3"><label class="field"><span>Inicio</span><input class="input" inputmode="decimal" data-inp="form.inicio" value="' + esc(F.inicio || '') + '"></label><label class="field"><span>Meta</span><input class="input" inputmode="decimal" data-inp="form.objetivo" value="' + esc(F.objetivo || '') + '"></label><label class="field"><span>Banca</span><input class="input" inputmode="decimal" data-inp="form.banca" value="' + esc(F.banca || '') + '"></label></div>' +
      '<label class="field"><span>Estado</span><select class="input" data-inp="form.estado">' + ['activo', 'ganado', 'perdido'].map((s) => '<option' + (F.estado === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>' +
      '<button class="btn" data-act="reto-save">Guardar</button>' + (isNew ? '' : '<button class="btn ghost" data-act="reto-del" style="color:#FF8A9A">Borrar</button>');
  } else if (sh.type === 'regla') {
    const isNew = !sh.id;
    body = '<h2>' + (isNew ? 'Nueva regla' : 'Editar regla') + '</h2>' +
      '<label class="field"><span>Palabras del comercio (separadas por comas)</span><input class="input" data-inp="form.patrones" value="' + esc(F.patrones || '') + '" placeholder="repsol, galp, bp"></label>' +
      '<label class="field"><span>Categoría</span><select class="input" data-inp="form.categoria">' + catOpts('gasto', F.categoria) + '</select></label>' +
      '<button class="btn" data-act="regla-save">Guardar</button>' + (isNew ? '' : '<button class="btn ghost" data-act="regla-del" style="color:#FF8A9A">Borrar</button>');
  } else if (sh.type === 'ticket') {
    body = '<h2>Ticket</h2><img src="' + sh.src + '" alt="Foto del ticket" style="width:100%;border-radius:18px">';
  }
  const still = S.ui.sheetShown === sh ? ' still' : '';
  S.ui.sheetShown = sh;
  return '<div class="scrim' + still + '" data-act="sheet-close"></div><div class="sheet' + still + '" role="dialog" aria-modal="true"><span class="grab"></span>' + body + '<button class="btn ghost" data-act="sheet-close">Cerrar</button></div>';
}
function openSheet(type, id, form) { S.ui.sheet = { type, id }; S.ui.form = form || {}; render(); }
function closeSheet() { S.ui.sheet = null; S.ui.form = {}; render(); }

/* ---------- Avisos y efectos ---------- */

function toast(text, undo) {
  $$('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = '<b>' + esc(text) + '</b>' + (undo ? '<button>Deshacer</button>' : '');
  document.body.appendChild(el);
  if (undo) el.querySelector('button').onclick = () => { undo(); el.remove(); };
  setTimeout(() => el.remove(), 4200);
}
function confetti(fromEl) {
  if (S.prefs.calm) return;
  const r = fromEl.getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:' + (r.left + r.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px;width:0;height:0;pointer-events:none;z-index:80';
  const pal = [acc(), '#8B7CFF', '#5AC8FF', '#FF9F5A', '#F472B6', '#F4F4F5'];
  for (let i = 0; i < 22; i++) {
    const a = -85 + (170 / 21) * i;
    const s = document.createElement('span');
    s.style.cssText = 'position:absolute;left:0;top:0;transform:rotate(' + a + 'deg)';
    const p = document.createElement('span');
    p.style.cssText = 'position:absolute;left:-4px;top:-4px;width:' + (i % 3 ? 8 : 6) + 'px;height:' + (i % 3 ? 8 : 12) + 'px;border-radius:' + (i % 2 ? '50%' : '2px') + ';background:' + pal[i % pal.length] + ';animation:burst ' + (0.8 + (i % 4) * 0.12) + 's cubic-bezier(.1,.75,.3,1) both';
    s.appendChild(p); wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1400);
}
function animateCounts() {
  if (S.prefs.calm || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count) || 0;
    const dec = el.dataset.dec !== undefined ? +el.dataset.dec : 2;
    const suf = el.dataset.suffix || '';
    const start = performance.now() + 250, dur = 1300;
    const tick = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)), dec) + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
function exportCSV() {
  const rows = [['Fecha', 'Hora', 'Tipo', 'Categoría', 'Concepto', 'Importe', 'Nota', 'Origen', 'Reto', 'Ticket']];
  S.data.movs.slice().reverse().forEach((m) => {
    rows.push([String(m.fecha).slice(0, 10), hhmm(m.fecha), m.tipo === 'apuesta' ? (m.cobro ? 'apuesta (cobro)' : 'apuesta (depósito)') : m.tipo, m.categoria, m.concepto || '', fmt(signed(m)).replace('−', '-').replace(/\./g, ''), m.nota || '', m.origen || '', m.reto || '', m.ticket && m.ticket !== 'local' ? m.ticket : '']);
  });
  const csv = '﻿' + rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gastos_' + isoDay(new Date()) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function readTicket(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(url);
      resolve({ data: dataUrl.split(',')[1], mime: 'image/jpeg', preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

/* ---------- Acciones ---------- */

const ACT = {
  sync: () => { if (S.cfg.demo) { toast('En modo demo no hay nada que sincronizar'); return; } sync(); },
  'mov-cat': (d) => { S.ui.movCat = d.v; render(); },
  'mov-month': (d) => { S.ui.movMonth = Math.min(0, S.ui.movMonth + Number(d.v)); S.ui.movCat = 'Todo'; S.lastRendered = null; render(); },
  'mov-search': () => { const l = $('#movlist'); if (l) { l.innerHTML = movListHTML(); l.classList.add('noanim'); } },
  'mov-toggle': (d, el) => {
    const row = el.closest('.mov');
    const was = row.classList.contains('open');
    $$('.mov.open').forEach((x) => x.classList.remove('open'));
    if (!was) row.classList.add('open');
  },
  'mov-edit': (d) => {
    const m = S.data.movs.find((x) => x.id === d.id);
    if (!m) return;
    S.ui.add = { id: m.id, tipo: m.tipo, amount: fmt(m.importe).replace(/\./g, ''), cat: m.tipo === 'apuesta' ? (m.reto || 'Suelta') : m.categoria, concepto: m.concepto || '', nota: m.nota || '', fecha: String(m.fecha).slice(0, 16), flag: m.tipo === 'apuesta' ? !!m.cobro : false, ticket: null, ticketUrl: m.ticket || '', origen: m.origen || 'manual' };
    location.hash = '#add';
  },
  'mov-del': (d) => {
    const m = S.data.movs.find((x) => x.id === d.id);
    if (!m) return;
    enqueue({ action: 'delete_mov', id: m.id });
    if (S.route === 'add') { S.ui.add = null; location.hash = '#movs'; } else render();
    toast((m.concepto || m.categoria) + ' borrado', () => { enqueue({ action: 'add_mov', mov: m }); render(); });
  },
  'mov-ticket': (d) => {
    const m = S.data.movs.find((x) => x.id === d.id);
    if (!m) return;
    if (S.previews[m.id]) { S.ui.sheet = { type: 'ticket', src: S.previews[m.id] }; render(); }
    else if (m.ticket && m.ticket !== 'local') window.open(m.ticket, '_blank');
  },
  'add-type': (d) => { const keep = S.ui.add; S.ui.add = Object.assign(newAdd(d.v), { id: keep.id, amount: keep.amount, fecha: keep.fecha, nota: keep.nota, concepto: keep.concepto, ticket: keep.ticket, ticketUrl: keep.ticketUrl }); render(); },
  'add-cat': (d) => { S.ui.add.cat = d.v; render(); },
  'add-flag': () => { S.ui.add.flag = !S.ui.add.flag; render(); },
  key: (d) => {
    const A = S.ui.add;
    let a = A.amount === '0' ? '' : A.amount;
    const k = d.v;
    if (k === '⌫') a = a.slice(0, -1);
    else if (k === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
    else {
      const parts = a.split(',');
      if (parts.length > 1 && parts[1].length >= 2) return;
      if (a.replace(',', '').length >= 7) return;
      a += k;
    }
    A.amount = a || '0';
    const el = $('#amt');
    if (el) { el.textContent = A.amount; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  },
  'ticket-pick': () => { $('#ticketInput').value = ''; $('#ticketInput').click(); },
  'ticket-clear': () => { S.ui.add.ticket = null; S.ui.add.ticketUrl = ''; render(); },
  'add-save': (d, el) => {
    const a = S.ui.add;
    const imp = parseAmount(a.amount);
    if (!imp) { const e = $('#amt'); if (e) { e.style.color = '#FF5D73'; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); setTimeout(() => { e.style.color = ''; }, 600); } return; }
    const isBet = a.tipo === 'apuesta';
    const mov = {
      id: a.id || uid(), fecha: a.fecha || isoLocal(new Date()), tipo: a.tipo, importe: imp,
      categoria: isBet ? 'Apuestas' : a.cat, concepto: a.concepto.trim() || (isBet ? (a.cat === 'Suelta' ? 'Apuesta' : a.cat) : a.cat),
      nota: a.nota.trim(), origen: a.id ? a.origen : 'manual', ticket: a.ticketUrl || '', reto: isBet && a.cat !== 'Suelta' ? a.cat : '', cobro: isBet ? !!a.flag : false
    };
    const op = { action: a.id ? 'update_mov' : 'add_mov', mov };
    if (a.ticket) { op.ticket = { data: a.ticket.data, mime: a.ticket.mime }; S.previews[mov.id] = a.ticket.preview; mov.ticket = 'local'; }
    enqueue(op);
    if (!a.id && a.flag && !isBet) {
      const dd = parseD(mov.fecha) || new Date();
      enqueue({ action: 'upsert', sheet: 'Fijos', obj: { id: uid(), nombre: mov.concepto, importe: imp, frecuencia_meses: 1, proximo: isoDay(addMonths(dd, 1)), categoria: mov.categoria, tipo: a.tipo } });
    }
    if (a.id) { S.ui.add = null; location.hash = '#movs'; toast('Cambios guardados'); return; }
    confetti(el);
    toast((a.tipo === 'gasto' ? '−' : (isBet && !a.flag) ? '−' : '+') + fmt(imp) + ' € · ' + (isBet ? a.cat : a.cat) + (S.cfg.demo ? '' : ' · enviando a tu Sheet'));
    const back = S.prevRoute && S.prevRoute !== 'add' ? S.prevRoute : 'inicio';
    setTimeout(() => { if (S.route === 'add') { S.ui.add = null; location.hash = '#' + back; } }, 900);
  },
  'meta-open': (d) => { const m = S.data.metas.find((x) => x.id === d.id); if (m) openSheet('meta', m.id, { nombre: m.nombre, objetivo: m.objetivo, ahorrado: m.ahorrado, fecha_objetivo: m.fecha_objetivo || '', principal: m.principal, aporte: '' }); },
  'meta-new': () => openSheet('meta', null, { nombre: '', objetivo: '', ahorrado: 0, fecha_objetivo: '', principal: !S.data.metas.length }),
  'meta-quick': (d) => { const m = S.data.metas.find((x) => x.id === S.ui.sheet.id); enqueue({ action: 'upsert', sheet: 'Metas', obj: { id: m.id, ahorrado: Math.round((m.ahorrado + Number(d.v)) * 100) / 100 } }); toast('+' + d.v + ' € a ' + m.nombre); closeSheet(); },
  'meta-aportar': () => { const v = parseAmount(S.ui.form.aporte); if (!v) return; const m = S.data.metas.find((x) => x.id === S.ui.sheet.id); enqueue({ action: 'upsert', sheet: 'Metas', obj: { id: m.id, ahorrado: Math.round((m.ahorrado + v) * 100) / 100 } }); toast('+' + fmt(v) + ' € a ' + m.nombre); closeSheet(); },
  'meta-save': () => {
    const F = S.ui.form;
    if (!String(F.nombre || '').trim() || !parseAmount(F.objetivo)) { toast('Pon un nombre y un objetivo'); return; }
    const id = S.ui.sheet.id || uid();
    if (F.principal) S.data.metas.filter((m) => m.principal && m.id !== id).forEach((m) => enqueue({ action: 'upsert', sheet: 'Metas', obj: { id: m.id, principal: false } }));
    enqueue({ action: 'upsert', sheet: 'Metas', obj: { id, nombre: F.nombre.trim(), objetivo: parseAmount(F.objetivo), ahorrado: parseAmount(F.ahorrado), fecha_objetivo: F.fecha_objetivo || '', principal: !!F.principal, color: (S.data.metas.find((m) => m.id === id) || {}).color || ['#5AC8FF', '#FF9F5A', '#A78BFA', '#F472B6'][S.data.metas.length % 4] } });
    closeSheet();
  },
  'meta-del': () => { enqueue({ action: 'remove', sheet: 'Metas', id: S.ui.sheet.id }); closeSheet(); },
  'form-bool': (d) => { S.ui.form[d.k] = !S.ui.form[d.k]; render(); },
  'fijo-new': () => openSheet('fijo', null, { tipo: 'gasto', nombre: '', importe: '', frecuencia_meses: 1, proximo: isoDay(addMonths(new Date(), 1)), categoria: 'Suscripciones' }),
  'fijo-open': (d) => { const f = S.data.fijos.find((x) => x.id === d.id); if (f) openSheet('fijo', f.id, { tipo: f.tipo, nombre: f.nombre, importe: f.importe, frecuencia_meses: f.frecuencia_meses, proximo: String(f.proximo).slice(0, 10), categoria: f.categoria }); },
  'fijo-tipo': (d) => { S.ui.form.tipo = d.v; S.ui.form.categoria = (catsOf(d.v)[0] || {}).nombre || ''; render(); },
  'fijo-save': () => {
    const F = S.ui.form;
    if (!String(F.nombre || '').trim() || !parseAmount(F.importe) || !F.proximo) { toast('Rellena nombre, importe y fecha'); return; }
    enqueue({ action: 'upsert', sheet: 'Fijos', obj: { id: S.ui.sheet.id || uid(), nombre: F.nombre.trim(), importe: parseAmount(F.importe), frecuencia_meses: Number(F.frecuencia_meses) || 1, proximo: F.proximo, categoria: F.categoria, tipo: F.tipo || 'gasto' } });
    closeSheet();
  },
  'fijo-del': () => { enqueue({ action: 'remove', sheet: 'Fijos', id: S.ui.sheet.id }); closeSheet(); },
  'reto-new': () => openSheet('reto', null, { nombre: '', inicio: 10, objetivo: 100, banca: 10, estado: 'activo' }),
  'reto-open': (d) => { const r = S.data.retos.find((x) => x.id === d.id); if (r) openSheet('reto', r.id, { nombre: r.nombre, inicio: r.inicio, objetivo: r.objetivo, banca: r.banca, estado: r.estado }); },
  'reto-save': () => {
    const F = S.ui.form;
    if (!String(F.nombre || '').trim()) { toast('Ponle un nombre'); return; }
    enqueue({ action: 'upsert', sheet: 'Retos', obj: { id: S.ui.sheet.id || uid(), nombre: F.nombre.trim(), inicio: parseAmount(F.inicio), objetivo: parseAmount(F.objetivo), banca: parseAmount(F.banca), estado: F.estado || 'activo', creado: S.ui.sheet.id ? undefined : isoDay(new Date()) } });
    closeSheet();
  },
  'reto-del': () => { enqueue({ action: 'remove', sheet: 'Retos', id: S.ui.sheet.id }); closeSheet(); },
  'regla-new': () => openSheet('regla', null, { patrones: '', categoria: 'Otros' }),
  'regla-open': (d) => { const r = S.data.reglas.find((x) => x.id === d.id); if (r) openSheet('regla', r.id, { patrones: r.patrones, categoria: r.categoria }); },
  'regla-save': () => { const F = S.ui.form; if (!String(F.patrones || '').trim()) return; enqueue({ action: 'upsert', sheet: 'Reglas', obj: { id: S.ui.sheet.id || uid(), patrones: F.patrones.trim(), categoria: F.categoria } }); closeSheet(); },
  'regla-del': () => { enqueue({ action: 'remove', sheet: 'Reglas', id: S.ui.sheet.id }); closeSheet(); },
  'sheet-close': () => closeSheet(),
  'tabla-year': (d) => { S.ui.tablaYear = Math.min(0, S.ui.tablaYear + Number(d.v)); S.lastRendered = null; render(); },
  'tabla-mes': (d) => { const now = new Date(); const y = now.getFullYear() + S.ui.tablaYear; S.ui.movMonth = (y - now.getFullYear()) * 12 + Number(d.m) - now.getMonth(); S.ui.movCat = 'Todo'; S.ui.movQ = ''; location.hash = '#movs'; },
  'tabla-export': () => exportTabla(),
  'sim-update': () => { const o = $('#simout'); if (o) o.innerHTML = simOutHTML(); },
  'sim-use': () => { const c = simCalc(); if (!c.meta) return; enqueue({ action: 'upsert', sheet: 'Metas', obj: { id: c.meta.id, objetivo: Math.round(c.need) } }); toast('Objetivo actualizado: ' + eur(c.need, 0)); const o = $('#simout'); if (o) o.innerHTML = simOutHTML(); },
  'stats-period': (d) => { if (S.ui.statsPeriod === d.v) return; S.ui.statsPeriod = d.v; S.ui.statsGen++; render(); animateCounts(); },
  'stats-bar': (d) => { S.ui.statsSel[S.ui.statsPeriod] = Number(d.i); render(); },
  heat: (d) => { S.ui.heatDay = Number(d.v); render(); },
  donut: (d) => { S.ui.donutCat = S.ui.donutCat === d.v ? null : d.v; render(); },
  'bet-period': (d) => { if (S.ui.betPeriod === d.v) return; S.ui.betPeriod = d.v; S.ui.betGen++; S.lastRendered = null; render(); },
  'story-next': () => goStory(S.ui.story + 1),
  'story-prev': () => goStory(S.ui.story - 1),
  'story-restart': () => goStory(0),
  copy: async (d) => {
    const v = d.v === 'url' ? S.cfg.url : S.cfg.token;
    try { await navigator.clipboard.writeText(v); toast((d.v === 'url' ? 'URL' : 'Token') + ' copiado'); } catch (e) { prompt('Copia esto:', v); }
  },
  'cfg-save': async () => {
    const F = S.ui.form;
    const url = String(F.url || '').trim(), token = String(F.token || '').trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { S.ui.ping = { ok: false, msg: 'La URL debe empezar por https://script.google.com y acabar en /exec' }; render(); return; }
    S.ui.ping = { ok: true, msg: 'Probando conexión…' }; render();
    try {
      const r = await fetch(url + '?' + new URLSearchParams({ token, action: 'ping' }));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Error');
      const wasDemo = S.cfg.demo;
      S.cfg = { url, token, demo: false };
      store(LS.cfg, S.cfg);
      if (wasDemo) { S.data = emptyData(); S.queue = []; save(); }
      S.ui.ping = { ok: true, msg: 'Conectado a «' + j.sheet + '»' };
      await sync();
      if (S.route === 'setup') location.hash = '#inicio'; else render();
    } catch (e) {
      S.ui.ping = { ok: false, msg: 'No conecta: ' + (e.message === 'Failed to fetch' ? 'revisa la URL y que la implementación sea para «Cualquier usuario»' : e.message) };
      render();
    }
  },
  'demo-on': () => { S.cfg = { url: '', token: '', demo: true }; store(LS.cfg, S.cfg); S.data = normData(demoData()); S.queue = []; save(); location.hash = '#inicio'; S.lastRendered = null; render(); },
  'nums-save': () => {
    const F = S.ui.form;
    [['nomina', parseAmount(F.nomina)], ['limite_apuestas', parseAmount(F.limite)], ['nombre', String(F.nombre || '').trim()]].forEach(([k, v]) => enqueue({ action: 'upsert', sheet: 'Config', key: 'clave', obj: { clave: k, valor: v } }));
    toast('Guardado');
  },
  accent: (d) => { S.prefs.accent = d.v; store(LS.prefs, S.prefs); applyPrefs(); render(); },
  calm: () => { S.prefs.calm = !S.prefs.calm; store(LS.prefs, S.prefs); applyPrefs(); render(); },
  export: () => exportCSV(),
  reset: () => {
    if (!confirm('¿Borrar los datos guardados en este iPhone? Tu Google Sheet no se toca.')) return;
    S.data = emptyData(); S.queue = []; save();
    if (S.cfg.demo) { S.cfg = { url: '', token: '', demo: false }; store(LS.cfg, S.cfg); location.hash = '#setup'; return; }
    sync();
  }
};

/* ---------- Render y rutas ---------- */

const SCREENS = { inicio: scrInicio, movs: scrMovs, add: scrAdd, objetivos: scrGoals, mas: scrMas, analisis: scrStats, mensual: scrMensual, simulador: scrSimulador, fijos: scrFijos, apuestas: scrApuestas, resumen: scrResumen, applepay: scrApplePay, ajustes: scrAjustes, setup: scrSetup };

function render() {
  const app = $('#app');
  const fresh = S.route !== S.lastRendered;
  S.lastRendered = S.route;
  if (S.route === 'add' && !S.ui.add) S.ui.add = newAdd();
  const y = window.scrollY;
  app.innerHTML = '<div class="' + (fresh ? '' : 'noanim') + '">' + (SCREENS[S.route] || scrInicio)() + '</div>' + sheetHTML();
  if (fresh) { window.scrollTo(0, 0); animateCounts(); } else window.scrollTo(0, y);
}
function onRoute() {
  const r = (location.hash || '#inicio').slice(1) || 'inicio';
  const from = S.route;
  if (from === 'add' && r !== 'add') S.ui.add = null;
  if (r !== 'resumen') clearTimeout(S.storyTimer);
  if (r === 'resumen' && from !== 'resumen') { S.ui.story = 0; S.ui.storyGen++; }
  if (r === 'ajustes' || r === 'setup') { S.ui.form = {}; S.ui.ping = null; }
  if (r !== from) S.prevRoute = from;
  S.route = SCREENS[r] ? r : 'inicio';
  S.ui.sheet = null;
  if (!S.cfg.url && !S.cfg.demo && S.route !== 'setup') { location.replace('#setup'); return; }
  render();
  if (S.route === 'resumen') armStory();
}
function applyPrefs() {
  document.documentElement.style.setProperty('--acc', acc());
  document.body.classList.toggle('calm', !!S.prefs.calm);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  const path = el.dataset && el.dataset.inp;
  if (!path) return;
  const [root, key] = path.includes('.') ? path.split('.') : [null, path];
  if (root === 'add') S.ui.add[key] = el.value;
  else if (root === 'sim') { S.prefs.sim[key] = el.value; store(LS.prefs, S.prefs); }
  else if (root === 'form') S.ui.form[key] = el.value;
  else S.ui[key] = el.value;
  if (el.dataset.live && ACT[el.dataset.live]) ACT[el.dataset.live](el.dataset, el);
});
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'ticketInput' || !e.target.files[0]) return;
  try {
    const t = await readTicket(e.target.files[0]);
    if (S.ui.add) { S.ui.add.ticket = t; render(); }
  } catch (err) { toast(err.message); }
});
window.addEventListener('hashchange', onRoute);
window.addEventListener('online', () => sync());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.route !== 'add') sync(); });

/* ---------- Datos de ejemplo (modo demo) ---------- */

function demoData() {
  const now = new Date();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const at = (daysAgo, h, m) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m); return isoLocal(d); };
  const movs = [];
  const add = (fecha, tipo, importe, categoria, concepto, extra) => movs.push(Object.assign({ id: uid() + movs.length, fecha, tipo, importe, categoria, concepto, nota: '', origen: 'manual', ticket: '', reto: '', cobro: false }, extra || {}));
  // Últimos días con detalle
  add(at(1, 21, 14), 'gasto', 46.8, 'Comer fuera', 'Sushi Kyoto', { origen: 'applepay' });
  add(at(2, 18, 32), 'gasto', 52.4, 'Gasolina', 'Repsol Granollers', { origen: 'applepay' });
  add(at(3, 22, 5), 'gasto', 19.99, 'Ocio', 'Steam');
  add(at(4, 8, 41), 'gasto', 1.6, 'Comer fuera', 'Café', { origen: 'applepay' });
  add(at(4, 19, 20), 'gasto', 23.15, 'Supermercado', 'Mercadona', { origen: 'applepay', nota: 'Compra de la semana' });
  add(at(5, 14, 2), 'gasto', 9.5, 'Comer fuera', 'Kebab Can Mònic');
  add(at(6, 17, 45), 'gasto', 24.99, 'Compras', 'Amazon', { nota: 'Funda del móvil' });
  add(at(8, 20, 30), 'gasto', 9.5, 'Ocio', 'Cines Granollers');
  add(at(9, 12, 10), 'gasto', 18.9, 'Formación', 'Libro de árabe');
  add(at(11, 9, 5), 'gasto', 48.1, 'Gasolina', 'Repsol Granollers', { origen: 'applepay' });
  add(at(12, 10, 0), 'gasto', 21.99, 'Suscripciones', 'Claude Pro', { origen: 'fijo' });
  add(at(13, 13, 40), 'gasto', 22, 'Comer fuera', 'Burger Vallès');
  add(at(13, 11, 15), 'gasto', 14, 'Cuidado personal', 'Peluquería');
  add(at(3, 23, 50), 'apuesta', 10, 'Apuestas', 'Reto 10 → 100', { reto: 'Reto 10 → 100' });
  add(at(2, 23, 10), 'apuesta', 15.6, 'Apuestas', 'Reto 10 → 100', { reto: 'Reto 10 → 100', cobro: true });
  add(at(6, 22, 0), 'apuesta', 20, 'Apuestas', 'Reto 20 → 200', { reto: 'Reto 20 → 200' });
  add(at(5, 23, 30), 'apuesta', 26.8, 'Apuestas', 'Reto 20 → 200', { reto: 'Reto 20 → 200', cobro: true });
  // Meses anteriores generados
  const pool = [['Comer fuera', 'Café', 1.6, 2], ['Comer fuera', 'Burger Vallès', 14, 12], ['Supermercado', 'Mercadona', 18, 20], ['Gasolina', 'Repsol Granollers', 42, 14], ['Ocio', 'Cines Granollers', 9.5, 4], ['Compras', 'Amazon', 12, 30], ['Transporte', 'Parking', 3, 4], ['Ropa', 'Zara', 25, 30]];
  for (let k = 1; k <= 5; k++) {
    const y = now.getFullYear(), mo = now.getMonth() - k, dim = daysIn(new Date(y, mo, 1).getFullYear(), new Date(y, mo, 1).getMonth());
    add(isoLocal(new Date(y, mo, 28, 9, 0)), 'ingreso', 1400, 'Nómina', 'Nómina HOMS');
    add(isoLocal(new Date(y, mo, 2, 10, 0)), 'gasto', 21.99, 'Suscripciones', 'Claude Pro', { origen: 'fijo' });
    add(isoLocal(new Date(y, mo, 19, 10, 0)), 'gasto', 11.99, 'Suscripciones', 'Spotify', { origen: 'fijo' });
    for (let dd = 1; dd <= dim; dd++) {
      if (rnd() < 0.55) {
        const p = pool[Math.floor(rnd() * pool.length)];
        add(isoLocal(new Date(y, mo, dd, 8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60))), 'gasto', Math.round((p[2] + rnd() * p[3]) * 100) / 100, p[0], p[1], { origen: rnd() < 0.5 ? 'applepay' : 'manual' });
      }
    }
    if (k === 1) { add(isoLocal(new Date(y, mo, 10, 13, 0)), 'gasto', 186.4, 'Viajes', 'Entradas y cena', { nota: 'Escapada' }); add(isoLocal(new Date(y, mo, 9, 7, 0)), 'gasto', 210, 'Viajes', 'Vuelos'); }
  }
  const nextDay = (dom) => { const d = new Date(now.getFullYear(), now.getMonth(), dom); if (d <= now) d.setMonth(d.getMonth() + 1); return isoDay(d); };
  return {
    movs,
    cats: [
      ['Comer fuera', 'utensils', '#FF9F5A', 150], ['Supermercado', 'shopping-cart', '#34D399', 120], ['Gasolina', 'fuel', '#5AC8FF', 140], ['Transporte', 'bus', '#60A5FA', 0], ['Coche', 'car', '#94A3B8', 0], ['Suscripciones', 'repeat', '#A78BFA', 40],
      ['Ocio', 'gamepad-2', '#F472B6', 60], ['Compras', 'shopping-bag', '#2DD4BF', 80], ['Ropa', 'shirt', '#E879F9', 0], ['Formación', 'book-open', '#FACC15', 40], ['Salud', 'heart-pulse', '#FB7185', 0], ['Deporte', 'dumbbell', '#4ADE80', 0],
      ['Casa', 'house', '#FDBA74', 0], ['Regalos', 'gift', '#F87171', 0], ['Viajes', 'plane', '#818CF8', 0], ['Tecnología', 'laptop', '#22D3EE', 0], ['Facturas', 'receipt', '#CBD5E1', 0], ['Cuidado personal', 'scissors', '#F9A8D4', 0], ['Otros', 'ellipsis', '#9C9CA6', 0]
    ].map((c, i) => ({ nombre: c[0], icono: c[1], color: c[2], presupuesto: c[3], tipo: 'gasto', orden: i + 1 }))
      .concat([['Nómina', 'briefcase', '#D4FF3A'], ['Bizum', 'hand-coins', '#8B7CFF'], ['Venta', 'tag', '#5AC8FF'], ['Otros ingresos', 'circle-plus', '#9C9CA6']].map((c, i) => ({ nombre: c[0], icono: c[1], color: c[2], presupuesto: 0, tipo: 'ingreso', orden: 30 + i }))),
    fijos: [
      { id: 'f1', nombre: 'Spotify', importe: 11.99, frecuencia_meses: 1, proximo: nextDay(19), categoria: 'Suscripciones', tipo: 'gasto' },
      { id: 'f2', nombre: 'Claude Pro', importe: 21.99, frecuencia_meses: 1, proximo: nextDay(2), categoria: 'Suscripciones', tipo: 'gasto' },
      { id: 'f3', nombre: 'Gimnasio', importe: 400, frecuencia_meses: 6, proximo: isoDay(addMonths(new Date(now.getFullYear(), now.getMonth(), 15), 2)), categoria: 'Deporte', tipo: 'gasto' },
      { id: 'f4', nombre: 'Seguro del coche', importe: 400, frecuencia_meses: 12, proximo: isoDay(addMonths(new Date(now.getFullYear(), now.getMonth(), 3), 4)), categoria: 'Coche', tipo: 'gasto' }
    ],
    metas: [
      { id: 'm1', nombre: 'Entrada del piso', objetivo: 40000, ahorrado: 9250, fecha_objetivo: '', color: '#D4FF3A', principal: true },
      { id: 'm2', nombre: 'Fondo de emergencia', objetivo: 4200, ahorrado: 3000, fecha_objetivo: '', color: '#5AC8FF', principal: false },
      { id: 'm3', nombre: 'Viaje de verano', objetivo: 1500, ahorrado: 680, fecha_objetivo: (now.getFullYear() + 1) + '-07-01', color: '#FF9F5A', principal: false },
      { id: 'm4', nombre: 'Portátil para la UOC', objetivo: 1100, ahorrado: 420, fecha_objetivo: '', color: '#A78BFA', principal: false }
    ],
    retos: [
      { id: 'r1', nombre: 'Reto 10 → 100', inicio: 10, objetivo: 100, banca: 23.6, estado: 'activo' },
      { id: 'r2', nombre: 'Reto 20 → 200', inicio: 20, objetivo: 200, banca: 31.2, estado: 'activo' },
      { id: 'r3', nombre: 'Reto 10 → 100 (1.er intento)', inicio: 10, objetivo: 100, banca: 0, estado: 'perdido' }
    ],
    reglas: [
      { id: 'g1', patrones: 'repsol, galp, bp, cepsa, plenoil', categoria: 'Gasolina' },
      { id: 'g2', patrones: 'mercadona, lidl, aldi, bonpreu, caprabo', categoria: 'Supermercado' },
      { id: 'g3', patrones: 'burger, kebab, sushi, café, starbucks', categoria: 'Comer fuera' },
      { id: 'g4', patrones: 'spotify, netflix, apple.com, claude', categoria: 'Suscripciones' },
      { id: 'g5', patrones: 'amazon, decathlon, ikea', categoria: 'Compras' }
    ],
    config: { nomina: 1400, limite_apuestas: 40, nombre: 'Carlos' },
    sheetUrl: ''
  };
}

/* ---------- Arranque ---------- */

(function boot() {
  S.cfg = Object.assign(S.cfg, load(LS.cfg) || {});
  S.data = normData(load(LS.data));
  S.queue = load(LS.queue) || [];
  S.prefs = Object.assign(S.prefs, load(LS.prefs) || {});
  S.prefs.sim = Object.assign({ precio: '200.000', entrada: '20', gastos: '12', anos: '30', tin: '3' }, S.prefs.sim || {});
  applyPrefs();
  if (S.cfg.demo && !S.data.movs.length) S.data = normData(demoData());
  onRoute();
  if (S.cfg.url) sync();
})();
