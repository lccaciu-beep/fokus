'use strict';

/* =========================================================
   Fokus – Kernlogik
   Tagesplan · Fokus-Timer · Abend-Check · Datensicherung
   ========================================================= */

const APP_VERSION = '1.2.0';
const STORAGE_KEY = 'fokus-app-v1';
const MAX_PRIORITIES = 3;
const LONG_RUN_MIN = 180;   // ab hier fragen wir, ob der Timer vergessen wurde

const ESTIMATES = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 h' },
  { min: 90, label: '1,5 h' },
  { min: 120, label: '2 h' },
  { min: 180, label: '3 h' },
  { min: 240, label: '4 h' },
];

const BLOCK_DURATIONS = [15, 25, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/* Tätigkeiten außerhalb der Tagesprioritäten */
const CATEGORIES = [
  { id: 'mails', label: 'Mails & Nachrichten' },
  { id: 'meetings', label: 'Meetings & Calls' },
  { id: 'orga', label: 'Orga & Planung' },
  { id: 'lernen', label: 'Lernen & Weiterbildung' },
  { id: 'recherche', label: 'Recherche' },
  { id: 'privat', label: 'Haushalt & Privates' },
  { id: 'sport', label: 'Sport & Gesundheit' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

const DISTRACTIONS = [
  { id: 'handy', label: 'Handy' },
  { id: 'nachrichten', label: 'Nachrichten/Mails' },
  { id: 'unterbrechung', label: 'Unterbrechung' },
  { id: 'gedanken', label: 'Gedanken schweifen ab' },
  { id: 'muede', label: 'Müde' },
  { id: 'unklar', label: 'Unklar, was zu tun ist' },
];

const BLOCKERS = [
  { id: 'handy', label: 'Handy & Social Media' },
  { id: 'meetings', label: 'Meetings & Unterbrechungen' },
  { id: 'muede', label: 'Müdigkeit' },
  { id: 'unklar', label: 'Unklare Aufgaben' },
  { id: 'zuviel', label: 'Zu viel geplant' },
  { id: 'aufgeschoben', label: 'Aufgeschoben' },
  { id: 'nichts', label: 'Nichts – lief gut' },
];

const NEW_PRIO_VALUE = '__new';

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/* ---------- Hilfsfunktionen ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function pad2(n) { return String(n).padStart(2, '0'); }

/** Datum als lokaler Schlüssel "JJJJ-MM-TT" */
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayKey() { return ymd(new Date()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNum(n, digits = 1) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Minuten lesbar: "45 min", "1 h", "1 h 20 min" */
function fmtMin(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function fmtClock(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtTimer(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function sessionMin(s) { return Math.max(0, (s.end - s.start) / 60000); }

function estimateLabel(min) {
  const e = ESTIMATES.find(x => x.min === min);
  return e ? e.label : fmtMin(min);
}

function labelOf(list, id) { return (list.find(x => x.id === id) || {}).label || id; }
function catLabel(id) { return labelOf(CATEGORIES, id || 'sonstiges'); }

/** Kategorie eines Blocks (null = Priorität) */
function sessionCategory(s) { return s.priorityId ? null : (s.category || 'sonstiges'); }

/* ---------- Datenhaltung ---------- */

function defaultState() {
  return {
    version: 1,
    days: {},        // "JJJJ-MM-TT" -> { priorities: [], evening: null }
    sessions: [],    // abgeschlossene Fokus-Blöcke
    running: null,   // laufender Block (Startzeit wird gespeichert)
    meta: { demoSeeded: false, lastBackup: null, statsRange: 7 },
  };
}

/** Bringt (auch importierte oder ältere) Daten in eine gültige Form. */
function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;

  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [key, day] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object') continue;
      s.days[key] = {
        ...day,
        priorities: Array.isArray(day.priorities)
          ? day.priorities.filter(p => p && p.id && typeof p.title === 'string')
          : [],
        evening: day.evening && typeof day.evening === 'object' ? day.evening : null,
      };
    }
  }
  if (Array.isArray(raw.sessions)) {
    s.sessions = raw.sessions.filter(x => x && typeof x.start === 'number' && typeof x.end === 'number' && x.end >= x.start)
      .map(x => ({ ...x, date: x.date || ymd(new Date(x.start)), distractions: x.distractions || {} }));
  }
  if (raw.running && typeof raw.running.start === 'number') {
    s.running = { distractions: {}, stopAt: null, category: null, ...raw.running };
    if (!s.running.date) s.running.date = ymd(new Date(s.running.start));
    if (!s.running.priorityId && !s.running.category) s.running.category = 'sonstiges';
  }
  if (raw.meta && typeof raw.meta === 'object') Object.assign(s.meta, raw.meta);
  return s;
}

let state = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (err) {
    console.warn('Daten konnten nicht gelesen werden', err);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error(err);
    toast('Speichern fehlgeschlagen. Ist der Speicher voll?');
  }
}

function getDay(key, create = false) {
  let day = state.days[key];
  if (!day && create) day = state.days[key] = { priorities: [], evening: null };
  return day || null;
}

function todayPriorities() { return (getDay(todayKey()) || {}).priorities || []; }
function todaySessions() { const k = todayKey(); return state.sessions.filter(s => s.date === k); }

function findPriority(id) {
  if (!id) return null;
  for (const day of Object.values(state.days)) {
    const p = day.priorities.find(x => x.id === id);
    if (p) return p;
  }
  return null;
}

/** Investierte Minuten einer Priorität (inkl. laufendem Block) */
function investedMin(prioId) {
  let m = 0;
  for (const s of state.sessions) if (s.priorityId === prioId) m += sessionMin(s);
  const r = state.running;
  if (r && r.priorityId === prioId) m += ((r.stopAt || Date.now()) - r.start) / 60000;
  return m;
}

/* ---------- Toast ---------- */

let toastTimer = null;

function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` +
    (action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : '');
  if (action) {
    el.querySelector('button').addEventListener('click', () => { action.fn(); hideToast(); }, { once: true });
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 4500 : 2600);
}

function hideToast() { $('#toast').classList.remove('show'); }

/* ---------- Sheets (Fenster von unten) ---------- */

function openSheet(sel) {
  $(sel).hidden = false;
  document.body.classList.add('sheet-open');
}

function closeSheet(sel) {
  $(sel).hidden = true;
  if (!$$('.sheet-backdrop').some(s => !s.hidden)) document.body.classList.remove('sheet-open');
}

/* ---------- Bewertungs-Buttons (1–5) ---------- */

function renderRating(container, value, onPick) {
  container.innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" data-value="${n}" aria-pressed="${n === value}">${n}</button>`
  ).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-value]');
    if (btn) onPick(Number(btn.dataset.value));
  };
}

/* ---------- Auswahl „Woran arbeitest du?“ ---------- */

let recentTargets = [];

/** Zuletzt genutzte eigene Beschreibungen (z. B. „Steuer-Unterlagen“ in Orga) */
function recentCustomTargets() {
  const seen = new Set();
  const out = [];
  const sorted = state.sessions.filter(s => !s.priorityId && !s.demo).sort((a, b) => b.start - a.start);
  for (const s of sorted) {
    const cat = sessionCategory(s);
    if (!s.label || s.label === catLabel(cat)) continue;
    const key = `${cat}|${s.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category: cat, label: s.label });
    if (out.length >= 4) break;
  }
  return out;
}

function buildTargetOptions(includeNew) {
  const open = todayPriorities().filter(p => !p.done);
  recentTargets = recentCustomTargets();
  let html = '';
  if (open.length) {
    html += `<optgroup label="Prioritäten von heute">${open.map(p =>
      `<option value="p:${p.id}">${esc(p.title)}</option>`).join('')}</optgroup>`;
  }
  if (recentTargets.length) {
    html += `<optgroup label="Zuletzt genutzt">${recentTargets.map((t, i) =>
      `<option value="r:${i}">${esc(t.label)}</option>`).join('')}</optgroup>`;
  }
  html += `<optgroup label="Andere Tätigkeit">${CATEGORIES.map(c =>
    `<option value="c:${c.id}">${esc(c.label)}</option>`).join('')}</optgroup>`;
  if (includeNew && todayPriorities().length < MAX_PRIORITIES) {
    html += `<option value="${NEW_PRIO_VALUE}">+ Neue Priorität anlegen …</option>`;
  }
  return html;
}

/** "p:…", "r:…", "c:…" → { priorityId, category, label } */
function parseTarget(val, descr) {
  if (val && val.startsWith('p:')) return { priorityId: val.slice(2), category: null, label: '' };
  if (val && val.startsWith('r:')) {
    const t = recentTargets[Number(val.slice(2))];
    if (t) return { priorityId: null, category: t.category, label: t.label };
  }
  const cat = val && val.startsWith('c:') ? val.slice(2) : 'sonstiges';
  return { priorityId: null, category: cat, label: (descr || '').trim() };
}

function selectHasValue(sel, v) { return $$('option', sel).some(o => o.value === v); }

/* =========================================================
   HEUTE
   ========================================================= */

function renderToday() {
  $('#today-date').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  renderTimer();
  renderPlan();
  renderBlocks();
  renderEvening();
}

/* ---------- Tagesplan ---------- */

function renderPlan() {
  const prios = todayPriorities();
  const list = $('#prio-list');

  if (!prios.length) {
    list.innerHTML = '<li class="empty">Was sind heute deine wichtigsten Dinge? Trag bis zu drei Prioritäten ein.</li>';
  } else {
    list.innerHTML = prios.map(p => {
      const inv = investedMin(p.id);
      const over = inv > p.estimateMin;
      const pct = Math.min(100, (inv / p.estimateMin) * 100);
      const meta = inv < 1
        ? `Geschätzt ${estimateLabel(p.estimateMin)}`
        : `<span class="${over ? 'over' : ''}">${fmtMin(inv)}</span> von ${estimateLabel(p.estimateMin)}`;
      return `
        <li class="prio ${p.done ? 'done' : ''}" data-id="${p.id}">
          <button type="button" class="check" data-action="toggle" aria-pressed="${!!p.done}"
            aria-label="${p.done ? 'Als offen markieren' : 'Als erledigt markieren'}"><span>${ICONS.check}</span></button>
          <button type="button" class="prio-body" data-action="edit" aria-label="${esc(p.title)} bearbeiten">
            <span class="prio-title">${esc(p.title)}</span>
            <span class="prio-meta">${meta}</span>
            <span class="progress" aria-hidden="true"><span class="${over ? 'over' : ''}" style="width:${pct}%"></span></span>
          </button>
          <button type="button" class="icon-btn" data-action="delete" aria-label="Priorität löschen">${ICONS.trash}</button>
        </li>`;
    }).join('');
  }

  const done = prios.filter(p => p.done).length;
  const planned = prios.reduce((a, p) => a + p.estimateMin, 0);
  $('#plan-count').textContent = prios.length ? `${done} von ${prios.length} erledigt, ${fmtMin(planned)} geplant` : '';
  $('#prio-form').hidden = prios.length >= MAX_PRIORITIES;
  renderCarry();
  $('#prio-form').classList.toggle('is-first', !prios.length && $('#carry-box').hidden);
}

function addPriority(e) {
  e.preventDefault();
  const input = $('#prio-title');
  const title = input.value.trim();
  if (!title) { input.focus(); return; }
  const day = getDay(todayKey(), true);
  if (day.priorities.length >= MAX_PRIORITIES) return;
  day.priorities.push({ id: uid(), title, estimateMin: Number($('#prio-est').value), done: false, doneAt: null });
  saveState();
  input.value = '';
  input.blur();
  renderPlan();
  renderTimer();
}

function onPlanClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.closest('.prio').dataset.id;
  const day = getDay(todayKey());
  const p = day && day.priorities.find(x => x.id === id);
  if (!p) return;

  if (btn.dataset.action === 'toggle') {
    p.done = !p.done;
    p.doneAt = p.done ? Date.now() : null;
    saveState();
    renderPlan();
    renderTimer();
    renderEvening();
    if (p.done) toast('Erledigt. Stark!');
  } else if (btn.dataset.action === 'edit') {
    openEditSheet(p);
  } else if (btn.dataset.action === 'delete') {
    if (state.running && state.running.priorityId === id) {
      toast('Diese Priorität läuft gerade im Timer.');
      return;
    }
    if (!confirm(`„${p.title}“ löschen?`)) return;
    day.priorities = day.priorities.filter(x => x.id !== id);
    saveState();
    renderPlan();
    renderTimer();
    renderEvening();
  }
}

/* ---------- Priorität bearbeiten ---------- */

let editId = null;

function openEditSheet(p) {
  editId = p.id;
  $('#edit-title').value = p.title;
  $('#edit-est').innerHTML = ESTIMATES.map(e =>
    `<option value="${e.min}" ${e.min === p.estimateMin ? 'selected' : ''}>${e.label}</option>`).join('');
  if (!ESTIMATES.some(e => e.min === p.estimateMin)) {
    $('#edit-est').insertAdjacentHTML('afterbegin', `<option value="${p.estimateMin}" selected>${fmtMin(p.estimateMin)}</option>`);
  }
  openSheet('#edit-sheet');
}

function saveEdit() {
  const p = findPriority(editId);
  const title = $('#edit-title').value.trim();
  if (!p) { closeSheet('#edit-sheet'); return; }
  if (!title) { $('#edit-title').focus(); return; }
  p.title = title;
  p.estimateMin = Number($('#edit-est').value);
  saveState();
  closeSheet('#edit-sheet');
  renderToday();
  toast('Gespeichert');
}

/* ---------- Offene Prioritäten von gestern ---------- */

/** Letzter Tag (bis 7 Tage zurück) mit Prioritäten → dessen offene Punkte */
function carryCandidates() {
  const today = getDay(todayKey());
  if (today && today.carryDismissed) return null;
  if (todayPriorities().length >= MAX_PRIORITIES) return null;
  const carried = new Set(todayPriorities().map(p => p.fromId).filter(Boolean));
  for (let i = 1; i <= 7; i++) {
    const key = ymd(addDays(new Date(), -i));
    const d = state.days[key];
    if (!d || !d.priorities.length) continue;
    const open = d.priorities.filter(p => !p.done && !carried.has(p.id));
    return open.length ? { key, open, daysAgo: i } : null;
  }
  return null;
}

function renderCarry() {
  const box = $('#carry-box');
  const c = carryCandidates();
  box.hidden = !c;
  if (!c) return;
  const when = c.daysAgo === 1 ? 'Offen von gestern'
    : `Offen vom ${parseYmd(c.key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })}`;
  box.innerHTML = `
    <div class="carry-head">
      <span>${when}</span>
      <button type="button" class="link-btn" data-action="dismiss">Ausblenden</button>
    </div>
    <ul>${c.open.map(p => `
      <li>
        <span class="carry-title">${esc(p.title)} <span class="muted">(${estimateLabel(p.estimateMin)})</span></span>
        <button type="button" class="btn btn-small" data-action="carry" data-id="${p.id}">${ICONS.plus}Übernehmen</button>
      </li>`).join('')}
    </ul>`;
}

function onCarryClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const day = getDay(todayKey(), true);
  if (btn.dataset.action === 'dismiss') {
    day.carryDismissed = true;
  } else {
    if (day.priorities.length >= MAX_PRIORITIES) return;
    const src = findPriority(btn.dataset.id);
    if (!src) return;
    day.priorities.push({ id: uid(), title: src.title, estimateMin: src.estimateMin, done: false, doneAt: null, fromId: src.id });
    toast('Übernommen');
  }
  saveState();
  renderPlan();
  renderTimer();
  renderEvening();
}

/* ---------- Fokus-Timer ---------- */

let tickHandle = null;
let tickCount = 0;
let targetIsManual = false;   // Auswahl bewusst getroffen?

/** Titel und Unterzeile des laufenden Blocks */
function runTitle(r) {
  if (r.priorityId) {
    const p = findPriority(r.priorityId);
    return { title: p ? p.title : 'Priorität', sub: 'Priorität' };
  }
  const cat = catLabel(r.category);
  return r.otherLabel ? { title: r.otherLabel, sub: cat } : { title: cat, sub: '' };
}

function runLabel(r) {
  const t = runTitle(r);
  return t.sub && !r.priorityId ? `${t.title} (${t.sub})` : t.title;
}

function renderTargetSelect() {
  const sel = $('#focus-target');
  const prev = sel.value;
  sel.innerHTML = buildTargetOptions(true);
  const open = todayPriorities().filter(p => !p.done);
  // Bewusste Auswahl behalten, sonst die erste offene Priorität vorschlagen
  if (prev && prev !== NEW_PRIO_VALUE && (targetIsManual || prev.startsWith('p:')) && selectHasValue(sel, prev)) sel.value = prev;
  else sel.value = open.length ? `p:${open[0].id}` : 'c:sonstiges';
  updateOtherInput();
}

function updateOtherInput() {
  $('#focus-other').hidden = !$('#focus-target').value.startsWith('c:');
}

function onTargetChange() {
  const sel = $('#focus-target');
  if (sel.value === NEW_PRIO_VALUE) {
    // Zur Eingabe im Tagesplan springen
    const open = todayPriorities().filter(p => !p.done);
    sel.value = open.length ? `p:${open[0].id}` : 'c:sonstiges';
    updateOtherInput();
    const input = $('#prio-title');
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  targetIsManual = true;
  updateOtherInput();
}

/* ---------- Zifferblatt ---------- */

const DIAL_C = 150;

function buildDialTicks() {
  let html = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    const pt = r => [(DIAL_C + r * Math.sin(a)).toFixed(2), (DIAL_C - r * Math.cos(a)).toFixed(2)];
    const [x1, y1] = pt(major ? 135 : 139);
    const [x2, y2] = pt(145);
    html += `<line${major ? ' class="major"' : ''} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  $('#dial-ticks').innerHTML = html;
}

/** Ring füllen: 0 = leer, 1 = voll */
function setDial(frac, over, sub) {
  const f = Math.max(0, Math.min(1, frac || 0));
  const visible = f > 0.002 ? '1' : '0';
  const arc = $('#dial-arc');
  arc.setAttribute('stroke-dasharray', `${(f * 100).toFixed(2)} 100`);
  arc.style.opacity = visible;
  const tip = $('#dial-tip-g');
  tip.style.transform = `rotate(${(f * 360).toFixed(2)}deg)`;
  tip.style.opacity = visible;
  $('#dial').classList.toggle('is-over', !!over);
  $('#dial-sub').textContent = sub || '';
}

/** Ohne Timer: heutige Fokuszeit im Verhältnis zur geplanten Zeit */
function updateIdleDial() {
  const focus = todaySessions().reduce((a, s) => a + sessionMin(s), 0);
  const planned = todayPriorities().reduce((a, p) => a + p.estimateMin, 0);
  let sub;
  if (planned) sub = `${fmtMin(focus)} von ${fmtMin(planned)} geplant`;
  else if (focus) sub = `Heute ${fmtMin(focus)} Fokus`;
  else sub = 'Bereit für deinen ersten Block';
  setDial(planned ? focus / planned : 0, false, sub);
}

/** Mit Timer: Priorität → Anteil der Schätzung, sonst eine Runde pro Stunde */
function updateRunningDial(r) {
  const elapsed = ((r.stopAt || Date.now()) - r.start) / 60000;
  const p = findPriority(r.priorityId);
  if (p && p.estimateMin) {
    const inv = investedMin(p.id);
    const over = inv > p.estimateMin;
    setDial(inv / p.estimateMin, over, over
      ? `${fmtMin(inv - p.estimateMin)} über der Schätzung`
      : `${fmtMin(inv)} von ${estimateLabel(p.estimateMin)}`);
  } else {
    setDial((elapsed % 60) / 60, false, 'Ein Kreis = 1 Stunde');
  }
}

function renderTimer() {
  const r = state.running;
  $('#timer-idle').hidden = !!r;
  $('#timer-running').hidden = !r;
  $('#running-label').hidden = !r;
  $('#timer-card').classList.toggle('is-running', !!r);
  document.body.classList.toggle('timer-running', !!r);

  if (!r) {
    $('#timer-title').textContent = 'Fokus-Timer';
    $('#run-cat').hidden = true;
    const disp = $('#timer-display');
    disp.textContent = '00:00';
    disp.classList.remove('is-long');
    renderTargetSelect();
    updateIdleDial();
    return;
  }

  const t = runTitle(r);
  $('#timer-title').textContent = t.title;
  $('#run-cat').textContent = t.sub;
  $('#run-cat').hidden = !t.sub;
  $('#run-since').textContent = `Gestartet um ${fmtClock(r.start)} Uhr`;
  renderDistractions();
  tick();
}

function renderDistractions(bumpId) {
  const r = state.running;
  if (!r) return;
  $('#distr-grid').innerHTML = DISTRACTIONS.map(d => {
    const c = r.distractions[d.id] || 0;
    return `<button type="button" class="distr ${c ? 'has' : ''} ${d.id === bumpId ? 'bump' : ''}" data-id="${d.id}"
      aria-label="${esc(d.label)}: ${c}"><span>${esc(d.label)}</span><span class="distr-count">${c}</span></button>`;
  }).join('');
  const total = Object.values(r.distractions).reduce((a, b) => a + b, 0);
  $('#distr-total').textContent = total ? `${total} bisher` : '';
}

/** Zeit immer aus "jetzt minus Start" – bleibt korrekt bei Sperre/Hintergrund. */
function tick() {
  const r = state.running;
  if (!r) return;
  const disp = $('#timer-display');
  disp.textContent = fmtTimer((r.stopAt || Date.now()) - r.start);
  disp.classList.toggle('is-long', disp.textContent.length > 5);
  updateRunningDial(r);
}

function startTicking() {
  if (tickHandle) return;
  tickCount = 0;
  tickHandle = setInterval(() => {
    if (!state.running) { stopTicking(); return; }
    tick();
    if (++tickCount % 30 === 0) renderPlan();   // investierte Zeit live nachziehen
  }, 1000);
}

function stopTicking() {
  clearInterval(tickHandle);
  tickHandle = null;
}

function startFocus() {
  if (state.running) return;
  const t = parseTarget($('#focus-target').value, $('#focus-other').value);
  state.running = {
    start: Date.now(),
    date: todayKey(),
    priorityId: t.priorityId,
    category: t.category,
    otherLabel: t.label,
    distractions: {},
    stopAt: null,
  };
  saveState();
  targetIsManual = false;
  $('#focus-other').value = '';
  renderTimer();
  renderPlan();
  startTicking();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function countDistraction(e) {
  const btn = e.target.closest('.distr');
  const r = state.running;
  if (!btn || !r) return;
  const id = btn.dataset.id;
  r.distractions[id] = (r.distractions[id] || 0) + 1;
  saveState();
  renderDistractions(id);
  toast(`${labelOf(DISTRACTIONS, id)} +1`, {
    label: 'Rückgängig',
    fn: () => {
      const cur = state.running;
      if (!cur || !cur.distractions[id]) return;
      cur.distractions[id] -= 1;
      if (!cur.distractions[id]) delete cur.distractions[id];
      saveState();
      renderDistractions();
    },
  });
}

function stopFocus() {
  if (!state.running) return;
  state.running.stopAt = Date.now();
  saveState();
  tick();
  openFinishSheet();
}

/* ---------- Block beenden (Sheet) ---------- */

let finishRating = 0;

function openFinishSheet() {
  const r = state.running;
  if (!r) return;
  finishRating = 0;
  const mins = ((r.stopAt || Date.now()) - r.start) / 60000;
  $('#finish-summary').textContent = runLabel(r);
  $('#finish-duration').textContent = mins < 1 ? 'unter 1 min' : fmtMin(mins);

  // Sehr lange gelaufen? Dann gleich die Korrektur anbieten
  const long = mins >= LONG_RUN_MIN;
  $('#finish-adjust-box').hidden = !long;
  $('#finish-adjust').hidden = long;
  $('#finish-long-hint').hidden = !long;
  $('#finish-minutes').value = long ? '' : Math.max(1, Math.round(mins));

  const p = findPriority(r.priorityId);
  $('#finish-done-row').hidden = !p || p.done;
  $('#finish-done').checked = false;

  updateFinishRating();
  openSheet('#finish-sheet');
}

function updateFinishRating() {
  renderRating($('#finish-rating'), finishRating, v => { finishRating = v; updateFinishRating(); });
  $('#finish-save').disabled = !finishRating;
}

function saveFinish() {
  const r = state.running;
  if (!r || !finishRating) return;
  const p = findPriority(r.priorityId);
  let start = r.start;
  let end = r.stopAt || Date.now();

  // Korrigierte Dauer übernehmen
  if (!$('#finish-adjust-box').hidden) {
    const corrected = Math.round(Number($('#finish-minutes').value));
    if (!corrected || corrected < 1 || corrected > 720) {
      toast('Bitte eine Dauer zwischen 1 und 720 Minuten eintragen.');
      $('#finish-minutes').focus();
      return;
    }
    const elapsed = (end - start) / 60000;
    if (corrected <= elapsed) end = start + corrected * 60000;
    else start = end - corrected * 60000;
  }

  const session = {
    id: uid(),
    date: r.date || ymd(new Date(r.start)),
    start,
    end,
    priorityId: p ? p.id : null,
    category: p ? null : (r.category || 'sonstiges'),
    label: p ? p.title : (r.otherLabel || catLabel(r.category)),
    distractions: { ...r.distractions },
    rating: finishRating,
  };
  state.sessions.push(session);
  if (p && $('#finish-done').checked) { p.done = true; p.doneAt = Date.now(); }
  state.running = null;
  saveState();
  stopTicking();
  closeSheet('#finish-sheet');
  renderToday();
  toast(`Block gespeichert: ${fmtMin(sessionMin(session))}`);
}

function resumeFocus() {
  if (!state.running) return;
  state.running.stopAt = null;
  saveState();
  closeSheet('#finish-sheet');
  startTicking();
  tick();
}

function discardFocus() {
  if (!confirm('Diesen Block wirklich verwerfen? Die Zeit wird nicht gespeichert.')) return;
  state.running = null;
  saveState();
  stopTicking();
  closeSheet('#finish-sheet');
  renderToday();
  toast('Block verworfen');
}

/* ---------- Block nachtragen ---------- */

let addRating = 0;

function openAddSheet() {
  addRating = 0;
  const sel = $('#add-target');
  sel.innerHTML = buildTargetOptions(false);
  const open = todayPriorities().filter(p => !p.done);
  sel.value = open.length ? `p:${open[0].id}` : 'c:sonstiges';
  $('#add-other').value = '';

  // Vorschlag: vor einer Stunde, auf 5 Minuten gerundet
  const d = new Date(Date.now() - 60 * 60000);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  $('#add-start').value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  $('#add-dur').innerHTML = BLOCK_DURATIONS.map(m =>
    `<option value="${m}" ${m === 45 ? 'selected' : ''}>${fmtMin(m)}</option>`).join('');

  updateAddForm();
  openSheet('#add-sheet');
}

function updateAddForm() {
  const val = $('#add-target').value;
  $('#add-other').hidden = !val.startsWith('c:');
  const p = val.startsWith('p:') ? findPriority(val.slice(2)) : null;
  $('#add-done-row').hidden = !p || p.done;
  if ($('#add-done-row').hidden) $('#add-done').checked = false;
  renderRating($('#add-rating'), addRating, v => { addRating = v; updateAddForm(); });
  $('#add-save').disabled = !addRating;
}

function saveAdd() {
  if (!addRating) return;
  const [hh, mm] = ($('#add-start').value || '').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) { toast('Bitte eine Startzeit wählen.'); return; }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm).getTime();
  const end = start + Number($('#add-dur').value) * 60000;
  if (end > Date.now() + 60000) { toast('Der Block würde in der Zukunft enden.'); return; }

  const t = parseTarget($('#add-target').value, $('#add-other').value);
  const p = findPriority(t.priorityId);
  state.sessions.push({
    id: uid(),
    date: todayKey(),
    start,
    end,
    priorityId: p ? p.id : null,
    category: p ? null : t.category,
    label: p ? p.title : (t.label || catLabel(t.category)),
    distractions: {},
    rating: addRating,
    manual: true,
  });
  if (p && $('#add-done').checked) { p.done = true; p.doneAt = Date.now(); }
  saveState();
  closeSheet('#add-sheet');
  renderToday();
  toast('Block nachgetragen');
}

/* ---------- Heutige Blöcke ---------- */

function ratingDots(v) {
  return `<span class="dots" aria-label="Konzentration ${v} von 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? 'on' : ''}"></i>`).join('')}</span>`;
}

function renderBlocks() {
  const list = todaySessions().sort((a, b) => a.start - b.start);
  const total = list.reduce((a, s) => a + sessionMin(s), 0);
  $('#blocks-total').textContent = list.length ? `${fmtMin(total)} Fokus` : '';

  if (!list.length) {
    $('#block-list').innerHTML = '<li class="empty">Noch keine Fokus-Blöcke heute. Starte oben deinen ersten.</li>';
    return;
  }

  $('#block-list').innerHTML = list.map(s => {
    const p = findPriority(s.priorityId);
    const title = p ? p.title : s.label;
    const cat = sessionCategory(s);
    const tag = s.priorityId ? '<span class="tag tag-prio">Priorität</span>'
      : title !== catLabel(cat) ? `<span class="tag">${esc(catLabel(cat))}</span>` : '';
    const nDistr = Object.values(s.distractions || {}).reduce((a, b) => a + b, 0);
    return `
      <li class="block" data-id="${s.id}">
        <div class="block-time">${fmtClock(s.start)}<span>${fmtClock(s.end)}</span></div>
        <div class="block-body">
          <div class="block-title">${esc(title)}</div>
          <div class="block-meta">
            <span>${fmtMin(sessionMin(s))}</span>
            ${s.rating ? ratingDots(s.rating) : ''}
            ${nDistr ? `<span>${nDistr} ${nDistr === 1 ? 'Ablenkung' : 'Ablenkungen'}</span>` : ''}
            ${tag}
            ${s.manual ? '<span class="tag">nachgetragen</span>' : ''}
          </div>
        </div>
        <button type="button" class="icon-btn" data-action="delete" aria-label="Block löschen">${ICONS.trash}</button>
      </li>`;
  }).join('');
}

function onBlocksClick(e) {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const id = btn.closest('.block').dataset.id;
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`Block von ${fmtClock(s.start)} bis ${fmtClock(s.end)} Uhr löschen?`)) return;
  state.sessions = state.sessions.filter(x => x.id !== id);
  saveState();
  renderToday();
}

/* ---------- Abend-Check ---------- */

let noteTimer = null;
let savedTimer = null;

function renderDaySummary() {
  const prios = todayPriorities();
  const sessions = todaySessions();
  const focus = sessions.reduce((a, s) => a + sessionMin(s), 0);
  const prioFocus = sessions.filter(s => s.priorityId).reduce((a, s) => a + sessionMin(s), 0);
  const planned = prios.reduce((a, p) => a + p.estimateMin, 0);
  const done = prios.filter(p => p.done).length;
  $('#day-summary').innerHTML = `
    <div><span>Erledigt</span><strong>${prios.length ? `${done}/${prios.length}` : '–'}</strong></div>
    <div><span>Geplant</span><strong>${planned ? fmtMin(planned) : '–'}</strong></div>
    <div><span>Fokus</span><strong>${focus ? fmtMin(focus) : '–'}</strong></div>
    <div><span>davon Prioritäten</span><strong>${focus ? fmtMin(prioFocus) : '–'}</strong></div>`;
}

function renderEvening() {
  renderDaySummary();
  const ev = (getDay(todayKey()) || {}).evening || {};
  renderRating($('#energy-rating'), ev.energy || 0, v => updateEvening({ energy: v }));

  $('#blocker-chips').innerHTML = BLOCKERS.map(b =>
    `<button type="button" class="chip" data-id="${b.id}" aria-pressed="${ev.blocker === b.id}">${esc(b.label)}</button>`
  ).join('');

  const note = $('#evening-note');
  if (document.activeElement !== note) note.value = ev.note || '';
}

function updateEvening(patch, rerender = true) {
  const day = getDay(todayKey(), true);
  day.evening = { energy: null, blocker: null, note: '', ...day.evening, ...patch, updatedAt: Date.now() };
  saveState();
  if (rerender) renderEvening();
  const ind = $('#evening-saved');
  ind.textContent = 'Gespeichert ✓';
  ind.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ind.classList.remove('show'), 1600);
}

function onBlockerClick(e) {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const cur = ((getDay(todayKey()) || {}).evening || {}).blocker;
  updateEvening({ blocker: cur === chip.dataset.id ? null : chip.dataset.id });
}

function onNoteInput() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => updateEvening({ note: $('#evening-note').value.trim() }, false), 500);
}

/* =========================================================
   DARSTELLUNG (hell / dunkel / automatisch)
   ========================================================= */

const THEME_KEY = 'fokus-theme';
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function themePref() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
}

function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  const dark = pref === 'dark' || (pref === 'system' && !!darkQuery && darkQuery.matches);
  root.classList.toggle('is-dark', dark);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0B1020' : '#EEF1F7');
  $$('#theme-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeValue === pref)));
  $$('[data-theme-toggle]').forEach(b => b.setAttribute('aria-label', dark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'));
}

function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* gilt dann nur für diese Sitzung */ }
  applyTheme(pref);
}

/* =========================================================
   NAVIGATION
   ========================================================= */

let currentView = 'heute';

function showView(name) {
  currentView = name;
  $$('.view').forEach(v => { v.hidden = v.id !== `view-${name}`; });
  $$('.tab').forEach(t => {
    const active = t.dataset.view === name;
    t.classList.toggle('is-active', active);
    if (active) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (name === 'auswertung') renderAuswertung();
  else renderToday();
  window.scrollTo(0, 0);
}

function renderAuswertung() {
  if (typeof renderStats === 'function') renderStats();
  renderBackupInfo();
  renderDemoButtons();
}

/* =========================================================
   DATENSICHERUNG
   ========================================================= */

function renderBackupInfo() {
  const last = state.meta.lastBackup;
  $('#last-backup').textContent = last
    ? `Letzte Sicherung: ${new Date(last).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Noch keine Sicherung erstellt.';
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function exportData() {
  const json = JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'fokus', appVersion: APP_VERSION }, null, 2);
  const filename = `fokus-backup-${todayKey()}.json`;
  const blob = new Blob([json], { type: 'application/json' });

  // Auf dem iPhone: Teilen-Menü → „In Dateien sichern“
  if (isIOS && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Fokus – Datensicherung' });
        markBackup();
      } catch (err) {
        if (err.name !== 'AbortError') toast('Export fehlgeschlagen.');
      }
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  markBackup();
}

function markBackup() {
  state.meta.lastBackup = Date.now();
  saveState();
  renderBackupInfo();
  toast('Sicherung erstellt');
}

function importData(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { data = null; }
    if (!data || typeof data !== 'object' || !data.days || !Array.isArray(data.sessions)) {
      alert('Diese Datei ist keine gültige Fokus-Sicherung.');
      return;
    }
    const nDays = Object.keys(data.days).length;
    if (!confirm(`Sicherung mit ${nDays} Tagen und ${data.sessions.length} Fokus-Blöcken wiederherstellen?\n\nDeine aktuellen Daten auf diesem Gerät werden dabei ersetzt.`)) return;
    const keepRange = state.meta.statsRange;
    state = normalizeState(data);
    state.meta.statsRange = state.meta.statsRange || keepRange;
    state.meta.demoSeeded = true;
    saveState();
    stopTicking();
    if (state.running && !state.running.stopAt) startTicking();
    renderAuswertung();
    toast('Daten wiederhergestellt');
  };
  reader.onerror = () => alert('Die Datei konnte nicht gelesen werden.');
  reader.readAsText(file);
}

/* ---------- Beispieldaten (Schalter im versteckten Bereich) ---------- */

function renderDemoButtons() {
  const has = typeof hasDemoData === 'function' && hasDemoData(state);
  $('#btn-demo-load').hidden = has;
  $('#btn-demo-clear').hidden = !has;
}

function loadDemo() {
  if (typeof seedDemoData !== 'function') return;
  seedDemoData(state);
  state.meta.demoSeeded = true;
  saveState();
  renderAuswertung();
  toast('Beispieldaten geladen');
}

function clearDemo() {
  if (!confirm('Alle Beispieldaten löschen? Deine eigenen Einträge bleiben erhalten.')) return;
  clearDemoData(state);
  saveState();
  renderAuswertung();
  $('#advanced').open = false;
  toast('Beispieldaten gelöscht');
}

/* =========================================================
   START
   ========================================================= */

function bindEvents() {
  $('#prio-est').innerHTML = ESTIMATES.map(e =>
    `<option value="${e.min}" ${e.min === 60 ? 'selected' : ''}>${e.label}</option>`).join('');

  $('#prio-form').addEventListener('submit', addPriority);
  $('#prio-list').addEventListener('click', onPlanClick);
  $('#carry-box').addEventListener('click', onCarryClick);

  $('#focus-target').addEventListener('change', onTargetChange);
  $('#focus-other').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startFocus(); } });
  $('#btn-start').addEventListener('click', startFocus);
  $('#btn-stop').addEventListener('click', stopFocus);
  $('#distr-grid').addEventListener('click', countDistraction);

  $('#finish-save').addEventListener('click', saveFinish);
  $('#finish-resume').addEventListener('click', resumeFocus);
  $('#finish-discard').addEventListener('click', discardFocus);
  $('#finish-adjust').addEventListener('click', () => {
    $('#finish-adjust-box').hidden = false;
    $('#finish-adjust').hidden = true;
    $('#finish-minutes').focus();
  });

  $('#btn-add-block').addEventListener('click', openAddSheet);
  $('#add-target').addEventListener('change', updateAddForm);
  $('#add-save').addEventListener('click', saveAdd);
  $('#add-cancel').addEventListener('click', () => closeSheet('#add-sheet'));

  $('#edit-save').addEventListener('click', saveEdit);
  $('#edit-cancel').addEventListener('click', () => closeSheet('#edit-sheet'));
  $('#edit-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } });

  // Tipp auf den abgedunkelten Hintergrund schließt einfache Sheets
  $$('.sheet-backdrop[data-dismiss]').forEach(bd => bd.addEventListener('click', e => {
    if (e.target === bd) closeSheet(`#${bd.id}`);
  }));

  $('#block-list').addEventListener('click', onBlocksClick);

  $('#blocker-chips').addEventListener('click', onBlockerClick);
  $('#evening-note').addEventListener('input', onNoteInput);
  $('#evening-note').addEventListener('blur', () => {
    clearTimeout(noteTimer);
    const val = $('#evening-note').value.trim();
    const cur = ((getDay(todayKey()) || {}).evening || {}).note || '';
    if (val !== cur) updateEvening({ note: val }, false);
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    setTheme(document.documentElement.classList.contains('is-dark') ? 'light' : 'dark');
  }));
  $('#theme-seg').addEventListener('click', e => {
    const b = e.target.closest('button[data-theme-value]');
    if (b) setTheme(b.dataset.themeValue);
  });
  if (darkQuery && darkQuery.addEventListener) {
    darkQuery.addEventListener('change', () => { if (themePref() === 'system') applyTheme('system'); });
  }

  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importData);
  $('#btn-demo-load').addEventListener('click', loadDemo);
  $('#btn-demo-clear').addEventListener('click', clearDemo);

  // Zurück aus dem Hintergrund / nach dem Entsperren: alles neu berechnen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const fresh = loadState();
    if (fresh) state = fresh;
    if (state.running && !state.running.stopAt) startTicking();
    if (currentView === 'heute') renderToday();
    else renderAuswertung();
  });

  // Anderer Tab hat Daten geändert (z. B. im Desktop-Browser)
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY) return;
    const fresh = loadState();
    if (!fresh) return;
    state = fresh;
    if (currentView === 'heute') renderToday(); else renderAuswertung();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch(err => console.warn('Service Worker nicht registriert', err));
}

document.addEventListener('DOMContentLoaded', () => {
  const stored = loadState();
  if (stored) {
    state = stored;
  } else {
    // Allererster Start: Beispieldaten, damit die Auswertung sofort etwas zeigt
    state = defaultState();
    if (typeof seedDemoData === 'function') seedDemoData(state);
    state.meta.demoSeeded = true;
    saveState();
  }

  $('#app-version').textContent = `Fokus, Version ${APP_VERSION}`;
  applyTheme(themePref());
  buildDialTicks();
  bindEvents();
  renderToday();

  if (state.running) {
    if (state.running.stopAt) openFinishSheet();
    else startTicking();
  }

  registerServiceWorker();
});
