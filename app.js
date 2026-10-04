'use strict';

/* =========================================================
   Fokus – Kernlogik
   Tagesplan · Fokus-Timer · Abend-Check · Datensicherung
   ========================================================= */

const APP_VERSION = '1.0.1';
const STORAGE_KEY = 'fokus-app-v1';
const MAX_PRIORITIES = 3;

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

const OTHER_VALUE = '__other';

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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

/** Bringt (auch importierte) Daten in eine gültige Form. */
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
    s.running = { distractions: {}, stopAt: null, ...raw.running };
    if (!s.running.date) s.running.date = ymd(new Date(s.running.start));
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

/* =========================================================
   HEUTE
   ========================================================= */

let renderedDay = null;

function renderToday() {
  renderedDay = todayKey();
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
          <div class="prio-body">
            <div class="prio-title">${esc(p.title)}</div>
            <div class="prio-meta">${meta}</div>
            <div class="progress" aria-hidden="true"><span class="${over ? 'over' : ''}" style="width:${pct}%"></span></div>
          </div>
          <button type="button" class="icon-btn" data-action="delete" aria-label="Priorität löschen">${ICONS.trash}</button>
        </li>`;
    }).join('');
  }

  const done = prios.filter(p => p.done).length;
  const planned = prios.reduce((a, p) => a + p.estimateMin, 0);
  $('#plan-count').textContent = prios.length ? `${done}/${prios.length} erledigt · ${fmtMin(planned)} geplant` : '';
  $('#prio-form').hidden = prios.length >= MAX_PRIORITIES;
  $('#prio-form').classList.toggle('is-first', !prios.length);
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
    if (p.done) toast('Erledigt. Stark!');
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
  }
}

/* ---------- Fokus-Timer ---------- */

let tickHandle = null;
let tickCount = 0;
let targetIsManual = false;   // „Sonstiges“ bewusst gewählt?

function runLabel(r) {
  if (r.priorityId) {
    const p = findPriority(r.priorityId);
    return p ? p.title : 'Priorität';
  }
  return r.otherLabel ? `Sonstiges: ${r.otherLabel}` : 'Sonstiges';
}

function renderTargetSelect() {
  const sel = $('#focus-target');
  const prev = sel.value;
  const open = todayPriorities().filter(p => !p.done);
  sel.innerHTML =
    open.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('') +
    `<option value="${OTHER_VALUE}">Sonstiges</option>`;
  // Auswahl behalten, sonst die erste offene Priorität vorschlagen
  if (prev && (prev !== OTHER_VALUE || targetIsManual) && $$('option', sel).some(o => o.value === prev)) sel.value = prev;
  else sel.value = open.length ? open[0].id : OTHER_VALUE;
  $('#focus-other').hidden = sel.value !== OTHER_VALUE;
}

function renderTimer() {
  const r = state.running;
  $('#timer-idle').hidden = !!r;
  $('#timer-running').hidden = !r;
  $('#timer-card').classList.toggle('is-running', !!r);
  document.body.classList.toggle('timer-running', !!r);

  if (!r) { renderTargetSelect(); return; }

  $('#run-target').textContent = runLabel(r);
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
  $('#timer-display').textContent = fmtTimer((r.stopAt || Date.now()) - r.start);
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
  const val = $('#focus-target').value;
  const isOther = val === OTHER_VALUE || !val;
  state.running = {
    start: Date.now(),
    date: todayKey(),
    priorityId: isOther ? null : val,
    otherLabel: isOther ? $('#focus-other').value.trim() : '',
    distractions: {},
    stopAt: null,
  };
  saveState();
  targetIsManual = false;
  $('#focus-other').value = '';
  renderTimer();
  renderPlan();
  startTicking();
  $('#scroller').scrollTo({ top: 0, behavior: 'smooth' });
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
  $('#finish-summary').textContent = `${mins < 1 ? 'unter 1 min' : fmtMin(mins)} · ${runLabel(r)}`;

  const p = findPriority(r.priorityId);
  $('#finish-done-row').hidden = !p || p.done;
  $('#finish-done').checked = false;

  updateFinishRating();
  $('#finish-sheet').hidden = false;
  document.body.classList.add('sheet-open');
}

function updateFinishRating() {
  renderRating($('#finish-rating'), finishRating, v => { finishRating = v; updateFinishRating(); });
  $('#finish-save').disabled = !finishRating;
}

function closeFinishSheet() {
  $('#finish-sheet').hidden = true;
  document.body.classList.remove('sheet-open');
}

function saveFinish() {
  const r = state.running;
  if (!r || !finishRating) return;
  const p = findPriority(r.priorityId);
  const session = {
    id: uid(),
    date: r.date || ymd(new Date(r.start)),
    start: r.start,
    end: r.stopAt || Date.now(),
    priorityId: p ? p.id : null,
    label: p ? p.title : (r.otherLabel || 'Sonstiges'),
    distractions: { ...r.distractions },
    rating: finishRating,
  };
  state.sessions.push(session);
  if (p && $('#finish-done').checked) { p.done = true; p.doneAt = Date.now(); }
  state.running = null;
  saveState();
  stopTicking();
  closeFinishSheet();
  renderToday();
  toast(`Block gespeichert · ${fmtMin(sessionMin(session))}`);
}

function resumeFocus() {
  if (!state.running) return;
  state.running.stopAt = null;
  saveState();
  closeFinishSheet();
  startTicking();
  tick();
}

function discardFocus() {
  if (!confirm('Diesen Block wirklich verwerfen? Die Zeit wird nicht gespeichert.')) return;
  state.running = null;
  saveState();
  stopTicking();
  closeFinishSheet();
  renderToday();
  toast('Block verworfen');
}

/* ---------- Heutige Blöcke ---------- */

function ratingDots(v) {
  return `<span class="dots" aria-label="Konzentration ${v} von 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? 'on' : ''}"></i>`).join('')}</span>`;
}

function renderBlocks() {
  const key = todayKey();
  const list = state.sessions.filter(s => s.date === key).sort((a, b) => a.start - b.start);
  const total = list.reduce((a, s) => a + sessionMin(s), 0);
  $('#blocks-total').textContent = list.length ? `${fmtMin(total)} Fokus` : '';

  if (!list.length) {
    $('#block-list').innerHTML = '<li class="empty">Noch keine Fokus-Blöcke heute. Starte oben deinen ersten.</li>';
    return;
  }

  $('#block-list').innerHTML = list.map(s => {
    const p = findPriority(s.priorityId);
    const title = p ? p.title : s.label;
    const nDistr = Object.values(s.distractions || {}).reduce((a, b) => a + b, 0);
    return `
      <li class="block" data-id="${s.id}">
        <div class="block-time">${fmtClock(s.start)}<span>${fmtClock(s.end)}</span></div>
        <div class="block-body">
          <div class="block-title">${esc(title)}${s.priorityId || title === 'Sonstiges' ? '' : '<span class="tag">Sonstiges</span>'}</div>
          <div class="block-meta">
            <span>${fmtMin(sessionMin(s))}</span>
            ${s.rating ? ratingDots(s.rating) : ''}
            ${nDistr ? `<span>${nDistr} ${nDistr === 1 ? 'Ablenkung' : 'Ablenkungen'}</span>` : ''}
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
  renderBlocks();
  renderPlan();
}

/* ---------- Abend-Check ---------- */

let noteTimer = null;
let savedTimer = null;

function renderEvening() {
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
  $('#scroller').scrollTo(0, 0);
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

  $('#focus-target').addEventListener('change', () => {
    targetIsManual = true;
    $('#focus-other').hidden = $('#focus-target').value !== OTHER_VALUE;
  });
  $('#focus-other').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startFocus(); } });
  $('#btn-start').addEventListener('click', startFocus);
  $('#btn-stop').addEventListener('click', stopFocus);
  $('#distr-grid').addEventListener('click', countDistraction);

  $('#finish-save').addEventListener('click', saveFinish);
  $('#finish-resume').addEventListener('click', resumeFocus);
  $('#finish-discard').addEventListener('click', discardFocus);

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

  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importData);
  $('#btn-demo-load').addEventListener('click', loadDemo);
  $('#btn-demo-clear').addEventListener('click', clearDemo);

  // iOS verschiebt beim Öffnen der Tastatur die ganze Seite und vergisst
  // manchmal, sie zurückzusetzen → nach dem Tippen wieder geraderücken
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const el = document.activeElement;
      if (!el || !el.matches('input, textarea, select')) window.scrollTo(0, 0);
    }, 50);
  });

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

  $('#app-version').textContent = `Fokus · Version ${APP_VERSION}`;
  bindEvents();
  renderToday();

  if (state.running) {
    if (state.running.stopAt) openFinishSheet();
    else startTicking();
  }

  registerServiceWorker();
});
