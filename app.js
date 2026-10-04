'use strict';

/* =========================================================
   Fokus – Kernlogik
   To-do-Liste, Fokus-Timer, Abend-Check, Datensicherung
   ========================================================= */

const APP_VERSION = '1.6.3';
const STORAGE_KEY = 'fokus-app-v1';
const LONG_RUN_MIN = 180;   // ab hier fragen wir, ob der Timer vergessen wurde
const BACKUP_REMIND_DAYS = 7;
const DAY_MS = 86400000;

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

const PRIORITIES = [
  { id: 'hoch', label: 'Hoch', rank: 0 },
  { id: 'mittel', label: 'Mittel', rank: 1 },
  { id: 'niedrig', label: 'Niedrig', rank: 2 },
];

/* Lebensbereiche für Aufgaben, Wochenziele und Auswertung */
const AREAS = [
  { id: 'studium', label: 'Studium', short: 'Studium', rec: 15,
    why: 'Selbststudium neben den Vorlesungen. In der Prüfungsphase eher 20–25 h.' },
  { id: 'tiktok', label: 'TikTok Shop', short: 'TikTok', rec: 7,
    why: 'Reicht für etwa ein Video pro Tag mit Recherche, Dreh, Schnitt und Posten.' },
  { id: 'privat', label: 'Privat', short: 'Privat', rec: 3,
    why: 'Für Erledigungen und Organisatorisches.' },
];

const REPEATS = [
  { id: '', label: 'Nie' },
  { id: 'daily', label: 'Täglich' },
  { id: 'weekdays', label: 'Werktags' },
  { id: 'weekly', label: 'Wöchentlich' },
];

const DUE_CHOICES = [
  { id: '', label: 'Kein Datum' },
  { id: 'today', label: 'Heute' },
  { id: 'tomorrow', label: 'Morgen' },
  { id: 'weekend', label: 'Bis Sonntag' },
  { id: 'nextweek', label: 'Nächste Woche' },
  { id: 'pick', label: 'Datum wählen …' },
];

const BLOCK_DURATIONS = [15, 25, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/* Tätigkeiten außerhalb der To-do-Liste */
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

/* Kurze Namen und Symbole für den Abend-Check */
const BLOCKER_UI = {
  handy: { short: 'Handy & Social Media', icon: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>' },
  meetings: { short: 'Meetings & Störungen', icon: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15 14.6c2.4-.3 4.6 1 5.2 4.1"/>' },
  muede: { short: 'Müdigkeit', icon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>' },
  unklar: { short: 'Unklare Aufgaben', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8v.2"/>' },
  zuviel: { short: 'Zu viel geplant', icon: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5"/>' },
  aufgeschoben: { short: 'Aufgeschoben', icon: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5-4 8.5s4 4.5 4 8.5"/>' },
  nichts: { short: 'Nichts – lief gut', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 5-5.3"/>' },
};

const ENERGY_WORDS = ['', 'Leer', 'Müde', 'Okay', 'Gut', 'Voller Energie'];

/* Vorschläge passend zu Studium und TikTok-Shop-Affiliate */
const SUGGESTIONS = [
  { title: 'Vorlesung nacharbeiten und zusammenfassen', min: 60, area: 'studium' },
  { title: 'Hooks für 5 Videos schreiben', min: 30, area: 'tiktok' },
  { title: 'Karteikarten für die Prüfung erstellen', min: 45, area: 'studium' },
  { title: '3 Produktvideos drehen', min: 60, area: 'tiktok' },
  { title: 'Übungsblatt bearbeiten', min: 60, area: 'studium' },
  { title: '1 Video posten', min: 30, area: 'tiktok', repeat: 'daily' },
  { title: 'Altklausur unter Prüfungsbedingungen lösen', min: 90, area: 'studium' },
  { title: '5 neue Produkte im Affiliate-Marktplatz auswählen', min: 30, area: 'tiktok' },
  { title: 'Hausarbeit: eine Seite schreiben', min: 60, area: 'studium' },
  { title: 'Samples bei 3 Shops anfragen', min: 30, area: 'tiktok' },
  { title: 'Literatur für die Hausarbeit recherchieren', min: 45, area: 'studium' },
  { title: '10 virale Produktvideos analysieren', min: 45, area: 'tiktok' },
  { title: 'Lernplan für die Prüfungsphase erstellen', min: 30, area: 'studium' },
  { title: 'Content-Plan für die Woche erstellen', min: 45, area: 'tiktok', repeat: 'weekly' },
  { title: 'Ein Kapitel im Skript durcharbeiten', min: 90, area: 'studium' },
  { title: 'Video-Statistiken der Woche auswerten', min: 30, area: 'tiktok', repeat: 'weekly' },
];
const SUGGEST_COUNT = 4;

const NEW_TASK_VALUE = '__new';

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/* ---------- Hilfsfunktionen ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Ereignis anhängen; fehlt das Element (z. B. kurz während eines Updates), wird es übersprungen */
function on(sel, type, fn) {
  const el = $(sel);
  if (el) el.addEventListener(type, fn);
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** Datum als lokaler Schlüssel "JJJJ-MM-TT" */
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayKey() { return ymd(new Date()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

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
function prioOf(id) { return PRIORITIES.find(p => p.id === id) || PRIORITIES[1]; }
function areaOf(id) { return AREAS.find(a => a.id === id) || null; }

/** Montag der aktuellen Woche */
function weekStart(d = new Date()) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }
function tomorrowKey() { return ymd(addDays(new Date(), 1)); }

/** „Wann?“ → Startdatum (null = sofort sichtbar) */
function resolveStart(choice, picked) {
  if (choice === 'tomorrow') return tomorrowKey();
  if (choice === 'pick' && /^\d{4}-\d{2}-\d{2}$/.test(picked || '') && picked > todayKey()) return picked;
  return null;
}

function startChoiceOf(t) {
  if (!t.startDate || t.startDate <= todayKey()) return 'today';
  return t.startDate === tomorrowKey() ? 'tomorrow' : 'pick';
}

function shortDate(key) {
  return parseYmd(key).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/** Kategorie eines Blocks (null = Block für eine Aufgabe der To-do-Liste) */
function sessionCategory(s) { return s.priorityId ? null : (s.category || 'sonstiges'); }

/* ---------- Datenhaltung ---------- */

/*
  tasks:    To-do-Liste, unabhängig vom Tag (bleibt offen, bis erledigt)
  sessions: Fokus-Blöcke; "priorityId" verweist auf eine Aufgabe (Name aus älteren Versionen)
  days:     Abend-Check je Tag
*/
function defaultState() {
  return {
    version: 2,
    tasks: [],
    days: {},
    sessions: [],
    running: null,
    meta: {
      lastBackup: null, backupSnooze: null, firstUse: null,
      statsMode: '7', calFrom: null, calTo: null,
      taskSort: 'prio', lastArea: null, goals: {},
    },
  };
}

const SAFE_ID = /^[\w-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const int1to5 = v => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
const safeId = v => (SAFE_ID.test(String(v ?? '')) ? String(v) : null);

function cleanDistractions(d) {
  const out = {};
  if (d && typeof d === 'object') {
    for (const x of DISTRACTIONS) {
      const n = Math.floor(Number(d[x.id]));
      if (n > 0 && n < 1000) out[x.id] = n;
    }
  }
  return out;
}

/** Block aus gespeicherten oder importierten Daten in sichere Form bringen */
function cleanSession(x) {
  const out = {
    id: safeId(x.id) || uid(),
    date: DATE_RE.test(x.date || '') ? x.date : ymd(new Date(x.start)),
    start: x.start,
    end: x.end,
    priorityId: safeId(x.priorityId),
    category: CATEGORIES.some(c => c.id === x.category) ? x.category : null,
    label: String(x.label ?? '').slice(0, 120),
    distractions: cleanDistractions(x.distractions),
    rating: int1to5(x.rating),
  };
  if (!out.priorityId && !out.category) out.category = 'sonstiges';
  if ('area' in x) out.area = AREAS.some(a => a.id === x.area) ? x.area : null;
  if (x.manual) out.manual = true;
  return out;
}

function cleanEvening(e) {
  return {
    energy: int1to5(e.energy),
    blocker: BLOCKERS.some(b => b.id === e.blocker) ? e.blocker : null,
    note: String(e.note ?? '').slice(0, 500),
    updatedAt: Number(e.updatedAt) || null,
  };
}

function cleanTask(t) {
  return {
    id: safeId(t.id) || uid(),
    title: String(t.title).slice(0, 200),
    priority: PRIORITIES.some(p => p.id === t.priority) ? t.priority : 'mittel',
    estimateMin: Number(t.estimateMin) > 0 ? Number(t.estimateMin) : null,
    createdAt: Number(t.createdAt) || Date.now(),
    done: !!t.done,
    doneAt: t.done ? (Number(t.doneAt) || Number(t.createdAt) || Date.now()) : null,
    area: AREAS.some(a => a.id === t.area) ? t.area : null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : null,
    repeat: REPEATS.some(r => r.id && r.id === t.repeat) ? t.repeat : null,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(t.startDate || '') ? t.startDate : null,
    spawnedId: safeId(t.spawnedId),
  };
}

/** Bringt (auch importierte oder ältere) Daten in eine gültige Form. */
function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;

  // Beispieldaten früherer Versionen entfernen
  const rawDays = raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days) ? raw.days : {};
  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions.filter(x => x && !x.demo) : [];

  s.sessions = rawSessions
    .filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start)
    .map(cleanSession);

  if (Array.isArray(raw.tasks)) {
    s.tasks = raw.tasks.filter(t => t && t.id && typeof t.title === 'string').map(cleanTask);
  } else {
    // Übernahme aus Version 1.x: Tagesprioritäten → To-do-Liste
    const all = [];
    for (const [key, day] of Object.entries(rawDays)) {
      if (!day || day.demo || !Array.isArray(day.priorities)) continue;
      for (const p of day.priorities) if (p && p.id && typeof p.title === 'string') all.push({ key, p });
    }
    // „Von gestern übernommene“ Aufgaben zusammenführen: Vorgänger fällt weg, Zeit wandert mit
    const successor = {};
    for (const { p } of all) if (p.fromId) successor[p.fromId] = p.id;
    const finalId = id => { let cur = id; const seen = new Set(); while (successor[cur] && !seen.has(cur)) { seen.add(cur); cur = successor[cur]; } return cur; };
    for (const x of s.sessions) if (x.priorityId && successor[x.priorityId]) x.priorityId = finalId(x.priorityId);
    for (const { key, p } of all) {
      if (successor[p.id]) continue;
      const created = parseYmd(key).getTime() + 8 * 3600000;
      s.tasks.push(cleanTask({
        id: p.id, title: p.title, priority: 'mittel', estimateMin: p.estimateMin,
        createdAt: created, done: p.done, doneAt: p.doneAt || (p.done ? created + 10 * 3600000 : null),
      }));
    }
  }

  for (const [key, day] of Object.entries(rawDays)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object' || day.demo) continue;
    if (day.evening && typeof day.evening === 'object') s.days[key] = { evening: cleanEvening(day.evening) };
  }

  if (raw.running && Number.isFinite(raw.running.start)) {
    const r = raw.running;
    s.running = {
      start: r.start,
      date: DATE_RE.test(r.date || '') ? r.date : ymd(new Date(r.start)),
      priorityId: safeId(r.priorityId),
      category: CATEGORIES.some(c => c.id === r.category) ? r.category : null,
      otherLabel: String(r.otherLabel ?? '').slice(0, 60),
      distractions: cleanDistractions(r.distractions),
      stopAt: Number.isFinite(r.stopAt) ? r.stopAt : null,
    };
    if (!s.running.priorityId && !s.running.category) s.running.category = 'sonstiges';
  }
  if (raw.meta && typeof raw.meta === 'object') {
    const m = raw.meta;
    if (m.lastBackup) s.meta.lastBackup = m.lastBackup;
    if (['7', '30', '90', 'cal'].includes(String(m.statsMode))) s.meta.statsMode = String(m.statsMode);
    if (m.calFrom) s.meta.calFrom = m.calFrom;
    if (m.calTo) s.meta.calTo = m.calTo;
    if (['added', 'due'].includes(m.taskSort)) s.meta.taskSort = m.taskSort;
    if (m.backupSnooze) s.meta.backupSnooze = m.backupSnooze;
    if (m.firstUse) s.meta.firstUse = m.firstUse;
    if (AREAS.some(a => a.id === m.lastArea)) s.meta.lastArea = m.lastArea;
    if (m.goals && typeof m.goals === 'object') {
      for (const a of AREAS) if (Number(m.goals[a.id]) > 0) s.meta.goals[a.id] = Number(m.goals[a.id]);
    }
  }
  // Seit wann die App genutzt wird (für die Backup-Erinnerung)
  if (!s.meta.firstUse) {
    const times = [...s.sessions.map(x => x.start), ...s.tasks.map(t => t.createdAt)];
    s.meta.firstUse = times.length ? Math.min(...times) : Date.now();
  }
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
  if (!day && create) day = state.days[key] = { evening: null };
  return day || null;
}

function todaySessions() { const k = todayKey(); return state.sessions.filter(s => s.date === k); }
function findTask(id) { return id ? state.tasks.find(t => t.id === id) || null : null; }
function isDoneOn(t, key) { return t.done && t.doneAt && ymd(new Date(t.doneAt)) === key; }

const SORTS = [
  { id: 'prio', label: 'Nach Priorität' },
  { id: 'due', label: 'Nach Fälligkeit' },
  { id: 'added', label: 'Nach Datum' },
];

function dueRank(t) { return t.dueDate ? parseYmd(t.dueDate).getTime() : Infinity; }

function sortTasks(list) {
  const mode = state.meta.taskSort;
  return [...list].sort((a, b) => {
    const p = prioOf(a.priority).rank - prioOf(b.priority).rank;
    const d = dueRank(a) - dueRank(b);
    if (mode === 'due') return d || p || a.createdAt - b.createdAt;
    if (mode === 'added') return a.createdAt - b.createdAt;
    return p || d || a.createdAt - b.createdAt;
  });
}

/** Aufgabe sichtbar? (wiederkehrende erscheinen erst an ihrem Tag) */
function isVisible(t) { return !t.startDate || t.startDate <= todayKey(); }
function openTasks() { return sortTasks(state.tasks.filter(t => !t.done && isVisible(t))); }
function upcomingTasks() { return state.tasks.filter(t => !t.done && !isVisible(t)); }
function plannedFor(key) { return sortTasks(state.tasks.filter(t => !t.done && t.startDate === key)); }
function plannedLater() {
  const tm = tomorrowKey();
  return state.tasks.filter(t => !t.done && t.startDate && t.startDate > tm)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || prioOf(a.priority).rank - prioOf(b.priority).rank);
}

/** Fälligkeit als Text: „Heute fällig“, „Überfällig seit 2 Tagen“ … */
function dueInfo(t) {
  if (!t.dueDate || t.done) return null;
  const diff = daysBetween(new Date(), parseYmd(t.dueDate));
  if (diff < 0) return { text: `Überfällig seit ${-diff} ${diff === -1 ? 'Tag' : 'Tagen'}`, cls: 'due-over' };
  if (diff === 0) return { text: 'Heute fällig', cls: 'due-soon' };
  if (diff === 1) return { text: 'Morgen fällig', cls: 'due-soon' };
  const d = parseYmd(t.dueDate);
  if (diff < 7) return { text: `Fällig ${d.toLocaleDateString('de-DE', { weekday: 'long' })}`, cls: '' };
  return { text: `Fällig am ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`, cls: '' };
}

/** Auswahl im Fälligkeits-Menü → Datum (JJJJ-MM-TT) */
function resolveDue(choice, picked) {
  const today = startOfDay(new Date());
  if (choice === 'today') return ymd(today);
  if (choice === 'tomorrow') return ymd(addDays(today, 1));
  if (choice === 'weekend') return ymd(addDays(today, (7 - today.getDay()) % 7));
  if (choice === 'nextweek') return ymd(addDays(weekStart(today), 7));
  if (choice === 'pick') return /^\d{4}-\d{2}-\d{2}$/.test(picked || '') ? picked : null;
  return null;
}

/** Nächster Termin einer wiederkehrenden Aufgabe (ab ihrem eigenen Tag, frühestens ab heute) */
function nextOccurrence(t) {
  const today = startOfDay(new Date());
  const base = t.startDate && t.startDate > ymd(today) ? parseYmd(t.startDate) : today;
  if (t.repeat === 'weekly') return ymd(addDays(base, 7));
  let d = addDays(base, 1);
  if (t.repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return ymd(d);
}

/** Bereich eines Blocks (gespeichert oder über die Aufgabe) */
function sessionArea(s) {
  if (s.area !== undefined) return s.area;
  const t = findTask(s.priorityId);
  return t ? t.area : null;
}

/** Fokusminuten pro Bereich in dieser Woche (inkl. laufendem Block) */
function weekFocusByArea() {
  const from = ymd(weekStart());
  const out = {};
  for (const x of state.sessions) {
    if (x.date < from) continue;
    const a = sessionArea(x);
    if (a) out[a] = (out[a] || 0) + sessionMin(x);
  }
  const r = state.running;
  if (r && r.priorityId) {
    const t = findTask(r.priorityId);
    if (t && t.area) out[t.area] = (out[t.area] || 0) + ((r.stopAt || Date.now()) - r.start) / 60000;
  }
  return out;
}

function hasGoals() { return AREAS.some(a => state.meta.goals[a.id] > 0); }
function doneToday() { const k = todayKey(); return state.tasks.filter(t => isDoneOn(t, k)).sort((a, b) => a.doneAt - b.doneAt); }

/** Investierte Minuten einer Aufgabe (inkl. laufendem Block) */
function investedMin(taskId) {
  let m = 0;
  for (const s of state.sessions) if (s.priorityId === taskId) m += sessionMin(s);
  const r = state.running;
  if (r && r.priorityId === taskId) m += ((r.stopAt || Date.now()) - r.start) / 60000;
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

/* ---------- Kleine Auswahl-Bausteine ---------- */

function renderRating(container, value, onPick) {
  container.innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" data-value="${n}" aria-pressed="${n === value}">${n}</button>`
  ).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-value]');
    if (btn) onPick(Number(btn.dataset.value));
  };
}

function renderPrioPicker(container, value, onPick) {
  container.innerHTML = PRIORITIES.map(p =>
    `<button type="button" class="prio-opt p-${p.id}" data-prio="${p.id}" aria-pressed="${p.id === value}">${p.label}</button>`
  ).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-prio]');
    if (btn) onPick(btn.dataset.prio);
  };
}

function renderAreaPicker(container, value, onPick) {
  container.innerHTML = [...AREAS, { id: '', short: 'Ohne' }].map(a =>
    `<button type="button" class="prio-opt area-opt ${a.id ? `a-${a.id}` : 'a-none'}" data-area="${a.id}" aria-pressed="${(value || '') === a.id}">${a.short}</button>`
  ).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-area]');
    if (btn) onPick(btn.dataset.area || null);
  };
}

function dueOptions() {
  return DUE_CHOICES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
}

function repeatOptions() {
  return REPEATS.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
}

/* ---------- Auswahl „Woran arbeitest du?“ ---------- */

let recentTargets = [];

/** Zuletzt genutzte eigene Beschreibungen (z. B. „Steuer-Unterlagen“ in Orga) */
function recentCustomTargets() {
  const seen = new Set();
  const out = [];
  const sorted = state.sessions.filter(s => !s.priorityId).sort((a, b) => b.start - a.start);
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
  const open = openTasks();
  recentTargets = recentCustomTargets();
  let html = '';
  if (open.length) {
    html += `<optgroup label="Deine To-dos">${open.map(t =>
      `<option value="p:${esc(t.id)}">${esc(t.title)}</option>`).join('')}</optgroup>`;
  }
  if (recentTargets.length) {
    html += `<optgroup label="Zuletzt genutzt">${recentTargets.map((t, i) =>
      `<option value="r:${i}">${esc(t.label)}</option>`).join('')}</optgroup>`;
  }
  html += `<optgroup label="Andere Tätigkeit">${CATEGORIES.map(c =>
    `<option value="c:${c.id}">${esc(c.label)}</option>`).join('')}</optgroup>`;
  if (includeNew) html += `<option value="${NEW_TASK_VALUE}">+ Neue Aufgabe anlegen …</option>`;
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
  renderBackupBanner();
  renderTimer();
  renderWeek();
  renderTasks();
  renderEvening();
}

/* ---------- Erinnerung an die Datensicherung ---------- */

function backupDue() {
  const m = state.meta;
  const now = Date.now();
  if (!state.tasks.length && !state.sessions.length) return null;
  if (now - (m.firstUse || now) < BACKUP_REMIND_DAYS * DAY_MS) return null;
  if (m.backupSnooze && now < m.backupSnooze) return null;
  if (!m.lastBackup) return { days: null };
  const days = Math.floor((now - m.lastBackup) / DAY_MS);
  return days >= BACKUP_REMIND_DAYS ? { days } : null;
}

function renderBackupBanner() {
  const b = backupDue();
  const el = $('#backup-banner');
  el.hidden = !b;
  if (!b) return;
  $('#backup-text').textContent = b.days === null
    ? 'Du hast deine Daten noch nie gesichert. Sie liegen nur auf diesem iPhone.'
    : `Deine letzte Sicherung ist ${b.days} Tage her. Deine Daten liegen nur auf diesem iPhone.`;
}

/* ---------- Wochenziele ---------- */

function renderWeek() {
  const card = $('#week-card');
  if (!hasGoals()) {
    card.innerHTML = `
      <div class="week-empty">
        <span>Setz dir Wochenziele, zum Beispiel ${AREAS.filter(a => a.id !== 'privat').map(a => `${a.rec} h ${a.label}`).join(' und ')}.</span>
        <button type="button" class="btn btn-small" data-action="goals">Festlegen</button>
      </div>`;
    return;
  }
  const done = weekFocusByArea();
  const rows = AREAS.filter(a => state.meta.goals[a.id] > 0).map(a => {
    const goal = state.meta.goals[a.id];
    const have = done[a.id] || 0;
    const reached = have >= goal;
    return `
      <div class="goal-row a-${a.id}">
        <div class="goal-top">
          <span class="goal-name"><i class="area-dot"></i>${a.label}</span>
          <span class="goal-val ${reached ? 'is-reached' : ''}">${fmtMin(have)} von ${fmtMin(goal)}${reached ? ' ✓' : ''}</span>
        </div>
        <span class="goal-bar"><span style="width:${Math.min(100, (have / goal) * 100)}%"></span></span>
      </div>`;
  }).join('');
  const left = Math.max(0, 6 - ((new Date().getDay() + 6) % 7));
  card.innerHTML = `
    <div class="card-head">
      <h2>Diese Woche</h2>
      <button type="button" class="link-btn" data-action="goals">Ziele ändern</button>
    </div>
    ${rows}
    <p class="week-foot">${left === 0 ? 'Letzter Tag der Woche.' : `Noch ${left} ${left === 1 ? 'Tag' : 'Tage'} bis Sonntag.`}</p>`;
}

let goalDraft = {};

function openGoalsSheet() {
  goalDraft = { ...state.meta.goals };
  renderGoalsSheet();
  openSheet('#goals-sheet');
}

function renderGoalsSheet() {
  const allRec = AREAS.every(a => Math.round((goalDraft[a.id] || 0) / 60) === a.rec);
  $('#goals-rec-all').disabled = allRec;
  $('#goals-rec-all').textContent = allRec ? 'Empfehlungen sind eingestellt' : 'Alle Empfehlungen übernehmen';
  $('#goals-list').innerHTML = AREAS.map(a => {
    const h = Math.round((goalDraft[a.id] || 0) / 60);
    const isRec = h === a.rec;
    return `
      <div class="stepper-row a-${a.id}">
        <div class="goal-info">
          <span class="goal-name"><i class="area-dot"></i>${a.label}</span>
          <button type="button" class="rec-btn ${isRec ? 'is-set' : ''}" data-rec="${a.id}" ${isRec ? 'disabled' : ''}
            aria-label="Empfehlung für ${a.label} übernehmen: ${a.rec} Stunden">Empfohlen: ${a.rec} h${isRec ? ' ✓' : ''}</button>
          <span class="rec-why">${a.why}</span>
        </div>
        <div class="stepper">
          <button type="button" data-step="-1" data-area="${a.id}" aria-label="${a.label}: eine Stunde weniger" ${h <= 0 ? 'disabled' : ''}>−</button>
          <strong>${h ? `${h} h` : 'Kein Ziel'}</strong>
          <button type="button" data-step="1" data-area="${a.id}" aria-label="${a.label}: eine Stunde mehr" ${h >= 60 ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');
}

function onGoalStep(e) {
  const rec = e.target.closest('button[data-rec]');
  if (rec) {
    const a = AREAS.find(x => x.id === rec.dataset.rec);
    goalDraft[a.id] = a.rec * 60;
    renderGoalsSheet();
    return;
  }
  const btn = e.target.closest('button[data-step]');
  if (!btn) return;
  const id = btn.dataset.area;
  const h = Math.max(0, Math.min(60, Math.round((goalDraft[id] || 0) / 60) + Number(btn.dataset.step)));
  if (h) goalDraft[id] = h * 60; else delete goalDraft[id];
  renderGoalsSheet();
}

function saveGoals() {
  state.meta.goals = { ...goalDraft };
  saveState();
  closeSheet('#goals-sheet');
  renderToday();
  if (currentView === 'auswertung') renderAuswertung();
  toast(hasGoals() ? 'Wochenziele gespeichert' : 'Wochenziele entfernt');
}

/* ---------- To-do-Liste ---------- */

let suggestOffset = 0;
let suggestOpen = false;
let newPrio = 'mittel';
let newEst = null;
let newArea = null;   // wird beim Start auf den zuletzt genutzten Bereich gesetzt
let planDay = 'today';  // Ansicht der Liste: 'today' oder 'tomorrow'
let newWhen = null;     // „Wann?“ beim Anlegen; null = passend zur Ansicht

function blockCountLabel(n) { return `${n} ${n === 1 ? 'Block' : 'Blöcken'}`; }

function taskItem(t) {
  const r = state.running;
  const inv = investedMin(t.id);
  const blocks = state.sessions.filter(x => x.priorityId === t.id).length;
  const isRunning = !!r && r.priorityId === t.id;
  const est = t.estimateMin || 0;
  const over = est > 0 && inv > est;
  const pr = prioOf(t.priority);
  const area = areaOf(t.area);
  const due = dueInfo(t);
  const tags = t.done ? '' : [
    `<span class="prio-pill p-${pr.id}">${pr.label}</span>`,
    area ? `<span class="area-tag a-${area.id}"><i class="area-dot"></i>${area.short}</span>` : '',
    due ? `<span class="due-tag ${due.cls}">${due.text}</span>` : '',
    t.repeat ? `<span class="repeat-tag" aria-label="${labelOf(REPEATS, t.repeat)}">${ICONS.repeat}${labelOf(REPEATS, t.repeat)}</span>` : '',
    t.startDate && t.startDate > tomorrowKey() ? `<span class="plan-tag">${ICONS.calendar}${shortDate(t.startDate)}</span>` : '',
  ].join('');

  let meta;
  if (isRunning) meta = `<span class="live">Läuft gerade</span>, ${fmtMin(inv)} investiert`;
  else if (inv >= 1) meta = `<span class="${over ? 'over' : ''}">${fmtMin(inv)}</span>${est ? ` von ${estimateLabel(est)}` : ''} in ${blockCountLabel(blocks)}`;
  else meta = est ? `Geschätzt ${estimateLabel(est)}` : 'Noch nicht begonnen';

  const bar = est && !t.done
    ? `<span class="progress" aria-hidden="true"><span class="${over ? 'over' : ''}" style="width:${Math.min(100, (inv / est) * 100)}%"></span></span>`
    : '';
  const action = t.done || !isVisible(t) ? ''
    : isRunning ? '<span class="play-btn is-live" aria-hidden="true"><span class="pulse"></span></span>'
    : `<button type="button" class="play-btn" data-action="start" aria-label="Fokus für „${esc(t.title)}“ starten">${ICONS.play}</button>`;

  return `
    <li class="prio ${t.done ? 'done' : ''} ${isRunning ? 'is-running' : ''}" data-id="${esc(t.id)}">
      <button type="button" class="check" data-action="toggle" aria-pressed="${t.done}"
        aria-label="${t.done ? 'Als offen markieren' : 'Als erledigt markieren'}"><span>${ICONS.check}</span></button>
      <button type="button" class="prio-body" data-action="edit" aria-label="${esc(t.title)} bearbeiten">
        <span class="prio-title">${esc(t.title)}</span>
        ${tags ? `<span class="task-tags">${tags}</span>` : ''}
        <span class="prio-meta">${meta}</span>
        ${bar}
      </button>
      ${action}
    </li>`;
}

function renderTasks() {
  $$('#plan-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === planDay)));
  const tmCount = plannedFor(tomorrowKey()).length;
  $('#plan-seg [data-plan="tomorrow"]').textContent = tmCount ? `Morgen (${tmCount})` : 'Morgen';
  $('#plan-card').classList.toggle('is-tomorrow', planDay === 'tomorrow');
  $('#prio-title').placeholder = planDay === 'tomorrow' ? 'Aufgabe für morgen …' : 'Neue Aufgabe …';
  if (planDay === 'tomorrow') { renderTomorrow(); return; }

  $('#later-box').hidden = true;
  $('#btn-add-block').hidden = false;
  const open = openTasks();
  const done = doneToday();
  const list = $('#prio-list');

  if (!open.length && !done.length) {
    list.innerHTML = '<li class="empty">Deine Liste ist leer. Was willst du schaffen? Kurz und konkret, zum Beispiel „3 Produktvideos drehen“.</li>';
  } else if (!open.length) {
    list.innerHTML = '<li class="empty">Alles erledigt. Stark!</li>';
  } else {
    list.innerHTML = open.map(taskItem).join('');
  }

  $('#done-box').hidden = !done.length;
  $('#done-count').textContent = done.length;
  $('#done-list').innerHTML = done.map(taskItem).join('');

  $('#plan-count').textContent = open.length ? `${open.length} offen` : '';
  $('#btn-sort').textContent = (SORTS.find(x => x.id === state.meta.taskSort) || SORTS[0]).label;
  const upcoming = upcomingTasks();
  $('#upcoming-note').hidden = !upcoming.length;
  if (upcoming.length) {
    const next = upcoming.reduce((a, b) => (a.startDate < b.startDate ? a : b));
    const text = tmCount
      ? `${tmCount === 1 ? '1 Aufgabe ist' : `${tmCount} Aufgaben sind`} für morgen geplant.`
      : `${upcoming.length === 1 ? '1 Aufgabe ist' : `${upcoming.length} Aufgaben sind`} für später geplant, die nächste für ${parseYmd(next.startDate).toLocaleDateString('de-DE', { weekday: 'long' })}.`;
    $('#upcoming-note').innerHTML = `${ICONS.calendar}<span>${text}</span>
      <button type="button" class="link-btn" data-plan-go="tomorrow">Ansehen</button>`;
  }
  $('#btn-sort').hidden = open.length < 2;
  $('#prio-form').classList.toggle('is-first', !open.length && !done.length);

  renderAddOptions();
  renderSuggestions();
  renderOthers();
}

/** Morgen-Ansicht: für morgen Geplantes, darunter spätere Tage */
function renderTomorrow() {
  const list = $('#prio-list');
  const items = plannedFor(tomorrowKey());
  const later = plannedLater();
  const tm = addDays(new Date(), 1).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  list.innerHTML = items.length
    ? items.map(taskItem).join('')
    : `<li class="empty">Für ${tm} ist noch nichts geplant. Was willst du morgen schaffen? Die Aufgaben erscheinen morgen früh automatisch in deiner Liste.</li>`;

  $('#plan-count').textContent = items.length ? `${items.length} geplant` : '';
  $('#btn-sort').hidden = items.length < 2;
  $('#btn-sort').textContent = (SORTS.find(x => x.id === state.meta.taskSort) || SORTS[0]).label;
  $('#upcoming-note').hidden = true;
  $('#done-box').hidden = true;
  $('#others-box').hidden = true;
  $('#btn-add-block').hidden = true;
  $('#prio-form').classList.toggle('is-first', !items.length);

  const box = $('#later-box');
  box.hidden = !later.length;
  $('#later-count').textContent = later.length;
  $('#later-list').innerHTML = later.map(taskItem).join('');

  renderAddOptions();
  renderSuggestions();
}

function setPlanDay(day, scroll) {
  planDay = day;
  newWhen = null;
  renderTasks();
  if (scroll) $('#plan-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function currentWhen() { return newWhen || (planDay === 'tomorrow' ? 'tomorrow' : 'today'); }

function renderWhenPicker(container, value, onPick) {
  const opts = [{ id: 'today', label: 'Heute' }, { id: 'tomorrow', label: 'Morgen' }, { id: 'pick', label: 'Datum …' }];
  container.innerHTML = opts.map(o =>
    `<button type="button" class="prio-opt when-opt" data-when="${o.id}" aria-pressed="${o.id === value}">${o.label}</button>`
  ).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-when]');
    if (btn) onPick(btn.dataset.when);
  };
}

function renderAddOptions() {
  const hasText = !!$('#prio-title').value.trim();
  $('#add-options').hidden = !hasText;
  const when = currentWhen();
  renderWhenPicker($('#new-when'), when, v => {
    newWhen = v;
    renderAddOptions();
    if (v === 'pick') $('#new-when-date').focus();
  });
  $('#new-when-date').hidden = when !== 'pick';
  $('#new-when-date').min = tomorrowKey();
  renderPrioPicker($('#new-prio'), newPrio, v => { newPrio = v; renderAddOptions(); });
  renderAreaPicker($('#new-area'), newArea, v => { newArea = v; renderAddOptions(); });
  $('#new-due-date').hidden = $('#new-due').value !== 'pick';
  $('#prio-est-chips').innerHTML = ESTIMATES.map(e =>
    `<button type="button" class="chip chip-sm" data-min="${e.min}" aria-pressed="${newEst === e.min}">${e.label}</button>`
  ).join('');
}

function renderSuggestions() {
  const taken = new Set(state.tasks.filter(t => !t.done).map(t => t.title.toLowerCase()));
  const pool = SUGGESTIONS.filter(x => !taken.has(x.title.toLowerCase()));
  const typing = !!$('#prio-title').value.trim();
  const auto = (planDay === 'tomorrow' ? plannedFor(tomorrowKey()) : openTasks()).length < 3;
  const visible = !typing && pool.length > 0 && (auto || suggestOpen);

  $('#btn-suggest-toggle').hidden = typing || auto || !pool.length;
  $('#btn-suggest-toggle').textContent = suggestOpen ? 'Vorschläge ausblenden' : 'Vorschläge anzeigen';
  $('#suggest-box').hidden = !visible;
  if (!visible) return;

  const start = suggestOffset % pool.length;
  const picks = [];
  for (let i = 0; i < Math.min(SUGGEST_COUNT, pool.length); i++) picks.push(pool[(start + i) % pool.length]);
  $('#suggest-chips').innerHTML = picks.map(x =>
    `<button type="button" class="chip suggest-chip" data-title="${esc(x.title)}" data-min="${x.min}">${ICONS.plus}<span>${esc(x.title)}</span></button>`
  ).join('');
}

function pushTask(fields) {
  const t = cleanTask({ id: uid(), createdAt: Date.now(), done: false, priority: 'mittel', ...fields });
  state.tasks.push(t);
  if (t.area) state.meta.lastArea = t.area;
  saveState();
  return t;
}

function resetAddForm() {
  $('#prio-title').value = '';
  newPrio = 'mittel';
  newEst = null;
  $('#new-due').value = '';
  $('#new-due-date').value = '';
  $('#new-repeat').value = '';
  $('#new-when-date').value = '';
  newWhen = null;
}

function addTask(e) {
  e.preventDefault();
  const input = $('#prio-title');
  const title = input.value.trim();
  if (!title) { input.focus(); return; }
  const when = currentWhen();
  if (when === 'pick' && !resolveStart('pick', $('#new-when-date').value)) {
    toast('Bitte ein Datum ab morgen wählen.');
    $('#new-when-date').focus();
    return;
  }
  const startDate = resolveStart(when, $('#new-when-date').value);
  pushTask({
    title,
    startDate,
    priority: newPrio,
    estimateMin: newEst,
    area: newArea,
    dueDate: resolveDue($('#new-due').value, $('#new-due-date').value),
    repeat: $('#new-repeat').value || null,
  });
  resetAddForm();
  input.blur();
  renderTasks();
  renderTimer();
  renderEvening();
  if (startDate && planDay === 'today') {
    toast(`Geplant für ${startDate === tomorrowKey() ? 'morgen' : shortDate(startDate)}`, { label: 'Ansehen', fn: () => setPlanDay('tomorrow') });
  }
}

function onSuggestClick(e) {
  const chip = e.target.closest('.suggest-chip');
  if (!chip) return;
  const sug = SUGGESTIONS.find(x => x.title === chip.dataset.title) || {};
  pushTask({
    title: chip.dataset.title, estimateMin: Number(chip.dataset.min), area: sug.area || null, repeat: sug.repeat || null,
    startDate: planDay === 'tomorrow' ? tomorrowKey() : null,
  });
  renderTasks();
  renderTimer();
  renderEvening();
  toast('Hinzugefügt. Tipp auf die Aufgabe, um sie anzupassen.');
}

function onTaskClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const t = findTask(btn.closest('.prio').dataset.id);
  if (!t) return;

  if (btn.dataset.action === 'toggle') {
    toggleTask(t);
  } else if (btn.dataset.action === 'edit') {
    openEditSheet(t);
  } else if (btn.dataset.action === 'start') {
    beginFocus({ priorityId: t.id, category: null, label: '' });
  }
}

/** Abhaken bzw. wieder öffnen; wiederkehrende Aufgaben bekommen einen nächsten Termin */
/** Noch offene Folge-Aufgabe einer wiederkehrenden Aufgabe entfernen */
function removeSpawned(t) {
  if (!t.spawnedId) return;
  state.tasks = state.tasks.filter(x => !(x.id === t.spawnedId && !x.done));
  t.spawnedId = null;
}

function toggleTask(t) {
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  let spawned = null;
  if (t.done && t.repeat) {
    const next = nextOccurrence(t);
    spawned = cleanTask({
      ...t, id: uid(), createdAt: Date.now(), done: false, doneAt: null,
      startDate: next, dueDate: t.dueDate ? next : null, spawnedId: null,
    });
    state.tasks.push(spawned);
    t.spawnedId = spawned.id;
  } else if (!t.done) {
    removeSpawned(t);
  }
  saveState();
  renderToday();
  if (t.done) {
    toast(spawned ? 'Erledigt. Sie erscheint wieder, wenn sie dran ist.' : 'Erledigt. Stark!', {
      label: 'Rückgängig',
      fn: () => {
        t.done = false;
        t.doneAt = null;
        removeSpawned(t);
        saveState();
        renderToday();
      },
    });
  }
}

/* ---------- Andere Tätigkeiten (Blöcke ohne Aufgabe) ---------- */

function renderOthers() {
  const box = $('#others-box');
  const list = todaySessions().filter(x => !x.priorityId).sort((a, b) => a.start - b.start);
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ''; return; }
  const wasOpen = !!box.querySelector('details[open]');
  const total = list.reduce((a, x) => a + sessionMin(x), 0);
  const cats = [...new Set(list.map(x => catLabel(sessionCategory(x))))];
  box.innerHTML = `
    <details ${wasOpen ? 'open' : ''}>
      <summary>
        <span class="others-text">
          <span class="others-title">Heute außerdem</span>
          <span class="others-cats">${esc(cats.join(', '))}</span>
        </span>
        <strong>${fmtMin(total)}</strong>
      </summary>
      <ul class="block-list">${list.map(x => blockItem(x)).join('')}</ul>
    </details>`;
}

/* ---------- Aufgabe bearbeiten ---------- */

let editId = null;
let editPrio = 'mittel';
let editArea = null;
let editWhen = 'today';

function openEditSheet(t) {
  editId = t.id;
  editPrio = t.priority;
  editArea = t.area;
  $('#edit-title').value = t.title;
  updateEditPrio();
  updateEditArea();
  editWhen = startChoiceOf(t);
  $('#edit-when-date').value = editWhen === 'pick' ? t.startDate : '';
  updateEditWhen();
  $('#edit-due').value = t.dueDate ? 'pick' : '';
  $('#edit-due-date').value = t.dueDate || '';
  $('#edit-due-date').hidden = !t.dueDate;
  $('#edit-repeat').value = t.repeat || '';
  let opts = '<option value="">Keine Schätzung</option>' +
    ESTIMATES.map(e => `<option value="${e.min}">${e.label}</option>`).join('');
  if (t.estimateMin && !ESTIMATES.some(e => e.min === t.estimateMin)) {
    opts += `<option value="${t.estimateMin}">${fmtMin(t.estimateMin)}</option>`;
  }
  $('#edit-est').innerHTML = opts;
  $('#edit-est').value = t.estimateMin ? String(t.estimateMin) : '';
  renderEditBlocks();
  openSheet('#edit-sheet');
}

function updateEditPrio() {
  renderPrioPicker($('#edit-prio'), editPrio, v => { editPrio = v; updateEditPrio(); });
}

function updateEditWhen() {
  renderWhenPicker($('#edit-when'), editWhen, v => {
    editWhen = v;
    updateEditWhen();
    if (v === 'pick') $('#edit-when-date').focus();
  });
  $('#edit-when-date').hidden = editWhen !== 'pick';
  $('#edit-when-date').min = tomorrowKey();
}

function updateEditArea() {
  renderAreaPicker($('#edit-area'), editArea, v => { editArea = v; updateEditArea(); });
}

function renderEditBlocks() {
  const list = state.sessions.filter(x => x.priorityId === editId).sort((a, b) => a.start - b.start);
  $('#edit-blocks-wrap').hidden = !list.length;
  $('#edit-blocks').innerHTML = list.map(x => blockItem(x, { compact: true, withDate: true })).join('');
}

function saveEdit() {
  const t = findTask(editId);
  const title = $('#edit-title').value.trim();
  if (!t) { closeSheet('#edit-sheet'); return; }
  if (!title) { $('#edit-title').focus(); return; }
  if (editWhen === 'pick' && !resolveStart('pick', $('#edit-when-date').value)) {
    toast('Bitte ein Datum ab morgen wählen.');
    $('#edit-when-date').focus();
    return;
  }
  t.title = title;
  t.priority = editPrio;
  t.area = editArea;
  t.estimateMin = $('#edit-est').value ? Number($('#edit-est').value) : null;
  t.dueDate = resolveDue($('#edit-due').value, $('#edit-due-date').value);
  t.repeat = $('#edit-repeat').value || null;
  t.startDate = resolveStart(editWhen, $('#edit-when-date').value);
  if (t.area) state.meta.lastArea = t.area;
  saveState();
  closeSheet('#edit-sheet');
  renderToday();
  toast('Gespeichert');
}

function deleteEditTask() {
  const t = findTask(editId);
  if (!t) { closeSheet('#edit-sheet'); return; }
  if (state.running && state.running.priorityId === t.id) {
    toast('Diese Aufgabe läuft gerade im Timer.');
    return;
  }
  if (!confirm(`„${t.title}“ löschen? Die erfasste Zeit bleibt in der Auswertung erhalten.`)) return;
  state.tasks = state.tasks.filter(x => x.id !== t.id);
  saveState();
  closeSheet('#edit-sheet');
  renderToday();
  toast('Aufgabe gelöscht');
}

/* ---------- Fokus-Timer ---------- */

let tickHandle = null;
let tickCount = 0;
let targetIsManual = false;   // Auswahl bewusst getroffen?

/** Titel und Unterzeile des laufenden Blocks */
function runTitle(r) {
  if (r.priorityId) {
    const t = findTask(r.priorityId);
    if (!t) return { title: 'Aufgabe', sub: '' };
    const area = areaOf(t.area);
    return { title: t.title, sub: area ? area.label : `Priorität ${prioOf(t.priority).label.toLowerCase()}` };
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
  const open = openTasks();
  // Bewusste Auswahl behalten, sonst die wichtigste offene Aufgabe vorschlagen
  if (prev && prev !== NEW_TASK_VALUE && (targetIsManual || prev.startsWith('p:')) && selectHasValue(sel, prev)) sel.value = prev;
  else sel.value = open.length ? `p:${open[0].id}` : 'c:sonstiges';
  updateOtherInput();
}

function updateOtherInput() {
  $('#focus-other').hidden = !$('#focus-target').value.startsWith('c:');
}

function onTargetChange() {
  const sel = $('#focus-target');
  if (sel.value === NEW_TASK_VALUE) {
    const open = openTasks();
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

/** Ohne Timer: Fortschritt der Wochenziele, sonst: Wie viel der Liste ist heute geschafft? */
function updateIdleDial() {
  if (hasGoals()) {
    const have = weekFocusByArea();
    let goal = 0, got = 0;
    for (const a of AREAS) {
      const g = state.meta.goals[a.id] || 0;
      goal += g;
      got += Math.min(g, have[a.id] || 0);
    }
    setDial(got / goal, false, `Woche: ${fmtMin(got)} von ${fmtMin(goal)} Ziel`);
    return;
  }
  const focus = todaySessions().reduce((a, s) => a + sessionMin(s), 0);
  const done = doneToday().length;
  const total = done + openTasks().length;
  let sub;
  if (total) sub = `${done} von ${total} erledigt` + (focus >= 1 ? `, ${fmtMin(focus)} Fokus` : '');
  else if (focus >= 1) sub = `Heute ${fmtMin(focus)} Fokus`;
  else sub = 'Bereit für deinen ersten Block';
  setDial(total ? done / total : 0, false, sub);
}

/** Mit Timer: Aufgabe mit Schätzung → Anteil der Schätzung, sonst eine Runde pro Stunde */
function updateRunningDial(r) {
  const elapsed = ((r.stopAt || Date.now()) - r.start) / 60000;
  const t = findTask(r.priorityId);
  if (t && t.estimateMin) {
    const inv = investedMin(t.id);
    const over = inv > t.estimateMin;
    setDial(inv / t.estimateMin, over, over
      ? `${fmtMin(inv - t.estimateMin)} über der Schätzung`
      : `${fmtMin(inv)} von ${estimateLabel(t.estimateMin)}`);
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
    if (++tickCount % 30 === 0) renderTasks();   // investierte Zeit live nachziehen
  }, 1000);
}

function stopTicking() {
  clearInterval(tickHandle);
  tickHandle = null;
}

function startFocus() {
  beginFocus(parseTarget($('#focus-target').value, $('#focus-other').value));
}

function beginFocus(t) {
  if (state.running) { toast('Es läuft schon ein Block. Beende ihn zuerst.'); return; }
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
  renderTasks();
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
  if (!state.running.stopAt) state.running.stopAt = Date.now();
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

  const t = findTask(r.priorityId);
  $('#finish-done-row').hidden = !t || t.done;
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
  const t = findTask(r.priorityId);
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
    priorityId: t ? t.id : null,
    category: t ? null : (r.category || 'sonstiges'),
    area: t ? t.area : null,
    label: t ? t.title : (r.otherLabel || catLabel(r.category)),
    distractions: { ...r.distractions },
    rating: finishRating,
  };
  state.sessions.push(session);
  state.running = null;
  if (t && $('#finish-done').checked) { saveState(); toggleTask(t); }
  saveState();
  stopTicking();
  closeSheet('#finish-sheet');
  renderToday();
  if (!(t && $('#finish-done').checked)) toast(`Block gespeichert: ${fmtMin(sessionMin(session))}`);
}

function resumeFocus() {
  const r = state.running;
  if (!r) return;
  if (r.stopAt) r.start += Date.now() - r.stopAt;   // Pause im Abschluss-Fenster nicht mitzählen
  r.stopAt = null;
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
  const open = openTasks();
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
  const t = val.startsWith('p:') ? findTask(val.slice(2)) : null;
  $('#add-done-row').hidden = !t || t.done;
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

  const tg = parseTarget($('#add-target').value, $('#add-other').value);
  const t = findTask(tg.priorityId);
  state.sessions.push({
    id: uid(),
    date: todayKey(),
    start,
    end,
    priorityId: t ? t.id : null,
    category: t ? null : tg.category,
    area: t ? t.area : null,
    label: t ? t.title : (tg.label || catLabel(tg.category)),
    distractions: {},
    rating: addRating,
    manual: true,
  });
  saveState();
  if (t && $('#add-done').checked) toggleTask(t);
  closeSheet('#add-sheet');
  renderToday();
  if (!(t && $('#add-done').checked)) toast('Block nachgetragen');
}

/* ---------- Blöcke ---------- */

function ratingDots(v) {
  return `<span class="dots" aria-label="Konzentration ${v} von 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? 'on' : ''}"></i>`).join('')}</span>`;
}

/**
 * Eine Blockzeile.
 * opts.compact: ohne Titel · opts.withDate: Datum statt Endzeit · opts.readOnly: ohne Löschen
 */
function blockItem(x, opts = {}) {
  const t = findTask(x.priorityId);
  const title = t ? t.title : x.label;
  const cat = sessionCategory(x);
  const tag = !x.priorityId && title !== catLabel(cat) ? `<span class="tag">${esc(catLabel(cat))}</span>` : '';
  const nDistr = Object.values(x.distractions || {}).reduce((a, b) => a + b, 0);
  const sub = opts.withDate
    ? new Date(x.start).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })
    : fmtClock(x.end);
  return `
    <li class="block" data-id="${esc(x.id)}">
      <div class="block-time">${fmtClock(x.start)}<span>${sub}</span></div>
      <div class="block-body">
        ${opts.compact ? '' : `<div class="block-title">${esc(title)}</div>`}
        <div class="block-meta">
          <span>${fmtMin(sessionMin(x))}</span>
          ${x.rating ? ratingDots(x.rating) : ''}
          ${nDistr ? `<span>${nDistr} ${nDistr === 1 ? 'Ablenkung' : 'Ablenkungen'}</span>` : ''}
          ${opts.compact ? '' : tag}
          ${x.manual ? '<span class="tag">nachgetragen</span>' : ''}
        </div>
      </div>
      ${opts.readOnly ? '' : `<button type="button" class="icon-btn" data-action="delete-block" aria-label="Block löschen">${ICONS.trash}</button>`}
    </li>`;
}

function onBlockDeleteClick(e) {
  const btn = e.target.closest('button[data-action="delete-block"]');
  if (!btn) return;
  const id = btn.closest('.block').dataset.id;
  const x = state.sessions.find(y => y.id === id);
  if (!x) return;
  if (!confirm(`Block von ${fmtClock(x.start)} bis ${fmtClock(x.end)} Uhr löschen?`)) return;
  state.sessions = state.sessions.filter(y => y.id !== id);
  saveState();
  if (!$('#edit-sheet').hidden) renderEditBlocks();
  renderToday();
  toast('Block gelöscht');
}

/* ---------- Abend-Check ---------- */

let noteTimer = null;
let savedTimer = null;

function renderDaySummary() {
  const sessions = todaySessions();
  const focus = sessions.reduce((a, s) => a + sessionMin(s), 0);
  const taskFocus = sessions.filter(s => s.priorityId).reduce((a, s) => a + sessionMin(s), 0);
  $('#day-summary').innerHTML = `
    <div><span>Erledigt</span><strong>${doneToday().length}</strong></div>
    <div><span>Noch offen</span><strong>${openTasks().length}</strong></div>
    <div><span>Fokus</span><strong>${focus >= 1 ? fmtMin(focus) : '–'}</strong></div>
    <div><span>davon To-dos</span><strong>${focus >= 1 ? fmtMin(taskFocus) : '–'}</strong></div>`;
}

function renderEvening() {
  renderDaySummary();
  const ev = (getDay(todayKey()) || {}).evening || {};
  renderEnergy(ev.energy || 0);

  $('#blocker-chips').innerHTML = BLOCKERS.map(b => {
    const ui = BLOCKER_UI[b.id];
    return `<button type="button" class="blocker ${b.id === 'nichts' ? 'is-good' : ''}" data-id="${b.id}" aria-pressed="${ev.blocker === b.id}">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ui.icon}</svg>
      <span>${esc(ui.short)}</span>
    </button>`;
  }).join('');

  const note = $('#evening-note');
  if (document.activeElement !== note) note.value = ev.note || '';
}

/** Energieleiste: füllt sich bis zur gewählten Stufe */
function renderEnergy(value) {
  const box = $('#energy-rating');
  box.className = `energy ${value ? `lvl-${value}` : ''}`;
  box.innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" data-value="${n}" class="${n <= value ? 'on' : ''}" aria-pressed="${n === value}"
      aria-label="Energie ${n} von 5: ${ENERGY_WORDS[n]}"><span></span></button>`
  ).join('');
  box.onclick = e => {
    const btn = e.target.closest('button[data-value]');
    if (btn) updateEvening({ energy: Number(btn.dataset.value) });
  };
  $('#energy-value').textContent = value ? ENERGY_WORDS[value] : 'Tippe auf die Leiste';
  $('#energy-value').classList.toggle('is-empty', !value);
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
  const chip = e.target.closest('.blocker');
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
let lastRenderDay = todayKey();

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
  renderGoalsSummary();
}

function renderGoalsSummary() {
  const parts = AREAS.filter(a => state.meta.goals[a.id] > 0).map(a => `${a.label} ${fmtMin(state.meta.goals[a.id])}`);
  $('#goals-summary').textContent = parts.length ? parts.join(', ') : 'Noch keine Wochenziele festgelegt.';
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
  state.meta.backupSnooze = null;
  renderBackupBanner();
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
    if (!confirm(`Sicherung mit ${data.sessions.length} Fokus-Blöcken wiederherstellen?\n\nDeine aktuellen Daten auf diesem Gerät werden dabei ersetzt.`)) return;
    state = normalizeState(data);
    saveState();
    stopTicking();
    if (state.running) {
      if (state.running.stopAt) openFinishSheet();
      else startTicking();
    }
    renderAuswertung();
    toast('Daten wiederhergestellt');
  };
  reader.onerror = () => alert('Die Datei konnte nicht gelesen werden.');
  reader.readAsText(file);
}

/* =========================================================
   START
   ========================================================= */

function bindEvents() {
  on('#prio-form', 'submit', addTask);
  on('#prio-list', 'click', onTaskClick);
  on('#done-list', 'click', onTaskClick);
  on('#later-list', 'click', onTaskClick);
  on('#plan-seg', 'click', e => {
    const b = e.target.closest('button[data-plan]');
    if (b) setPlanDay(b.dataset.plan);
  });
  on('#upcoming-note', 'click', e => { if (e.target.closest('[data-plan-go]')) setPlanDay('tomorrow'); });
  on('#btn-plan-tomorrow', 'click', () => setPlanDay('tomorrow', true));
  on('#prio-title', 'input', () => { renderAddOptions(); renderSuggestions(); });
  on('#prio-est-chips', 'click', e => {
    const chip = e.target.closest('button[data-min]');
    if (!chip) return;
    const m = Number(chip.dataset.min);
    newEst = newEst === m ? null : m;
    renderAddOptions();
  });
  on('#btn-sort', 'click', () => {
    const i = SORTS.findIndex(x => x.id === state.meta.taskSort);
    state.meta.taskSort = SORTS[(i + 1) % SORTS.length].id;
    saveState();
    renderTasks();
    renderTimer();
  });
  on('#suggest-chips', 'click', onSuggestClick);
  on('#btn-suggest-more', 'click', () => { suggestOffset += SUGGEST_COUNT; renderSuggestions(); });
  on('#btn-suggest-toggle', 'click', () => { suggestOpen = !suggestOpen; renderSuggestions(); });
  on('#others-box', 'click', onBlockDeleteClick);
  on('#edit-blocks', 'click', onBlockDeleteClick);
  on('#edit-delete', 'click', deleteEditTask);
  on('#new-due', 'change', () => {
    renderAddOptions();
    if ($('#new-due').value === 'pick') $('#new-due-date').focus();
  });
  on('#edit-due', 'change', () => {
    $('#edit-due-date').hidden = $('#edit-due').value !== 'pick';
    if ($('#edit-due').value === 'pick') $('#edit-due-date').focus();
  });

  on('#week-card', 'click', e => { if (e.target.closest('[data-action="goals"]')) openGoalsSheet(); });
  on('#btn-goals', 'click', openGoalsSheet);
  on('#goals-list', 'click', onGoalStep);
  on('#goals-rec-all', 'click', () => {
    for (const a of AREAS) goalDraft[a.id] = a.rec * 60;
    renderGoalsSheet();
  });
  on('#goals-save', 'click', saveGoals);
  on('#goals-cancel', 'click', () => closeSheet('#goals-sheet'));

  on('#backup-now', 'click', exportData);
  on('#backup-later', 'click', () => {
    state.meta.backupSnooze = Date.now() + 3 * DAY_MS;
    saveState();
    renderBackupBanner();
  });

  on('#focus-target', 'change', onTargetChange);
  on('#focus-other', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); startFocus(); } });
  on('#btn-start', 'click', startFocus);
  on('#btn-stop', 'click', stopFocus);
  on('#distr-grid', 'click', countDistraction);

  on('#finish-save', 'click', saveFinish);
  on('#finish-resume', 'click', resumeFocus);
  on('#finish-discard', 'click', discardFocus);
  on('#finish-adjust', 'click', () => {
    $('#finish-adjust-box').hidden = false;
    $('#finish-adjust').hidden = true;
    $('#finish-minutes').focus();
  });

  on('#btn-add-block', 'click', openAddSheet);
  on('#add-target', 'change', updateAddForm);
  on('#add-save', 'click', saveAdd);
  on('#add-cancel', 'click', () => closeSheet('#add-sheet'));

  on('#edit-save', 'click', saveEdit);
  on('#edit-cancel', 'click', () => closeSheet('#edit-sheet'));
  on('#edit-title', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } });

  // Tipp auf den abgedunkelten Hintergrund schließt einfache Sheets
  $$('.sheet-backdrop[data-dismiss]').forEach(bd => bd.addEventListener('click', e => {
    if (e.target === bd) closeSheet(`#${bd.id}`);
  }));

  on('#blocker-chips', 'click', onBlockerClick);
  on('#evening-note', 'input', onNoteInput);
  on('#evening-note', 'blur', () => {
    clearTimeout(noteTimer);
    const val = $('#evening-note').value.trim();
    const cur = ((getDay(todayKey()) || {}).evening || {}).note || '';
    if (val !== cur) updateEvening({ note: val }, false);
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    setTheme(document.documentElement.classList.contains('is-dark') ? 'light' : 'dark');
  }));
  on('#theme-seg', 'click', e => {
    const b = e.target.closest('button[data-theme-value]');
    if (b) setTheme(b.dataset.themeValue);
  });
  if (darkQuery && darkQuery.addEventListener) {
    darkQuery.addEventListener('change', () => { if (themePref() === 'system') applyTheme('system'); });
  }

  on('#btn-export', 'click', exportData);
  on('#btn-import', 'click', () => $('#import-file').click());
  on('#import-file', 'change', importData);

  // Zurück aus dem Hintergrund / nach dem Entsperren: alles neu berechnen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const fresh = loadState();
    if (fresh) state = fresh;
    if (lastRenderDay !== todayKey()) { planDay = 'today'; lastRenderDay = todayKey(); }
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
  state = loadState() || defaultState();
  saveState();   // übernommene/bereinigte Daten sofort festhalten

  $('#app-version').textContent = `Fokus, Version ${APP_VERSION}`;
  newArea = state.meta.lastArea;
  $('#new-due').innerHTML = dueOptions();
  $('#edit-due').innerHTML = dueOptions();
  $('#new-repeat').innerHTML = repeatOptions();
  $('#edit-repeat').innerHTML = repeatOptions();
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
