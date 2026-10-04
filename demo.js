'use strict';

/* =========================================================
   Fokus – Beispieldaten
   Alle Beispiel-Einträge tragen das Merkmal demo: true und
   lassen sich so gezielt wieder löschen.
   ========================================================= */

/** Kleiner Zufallsgenerator mit festem Startwert → immer gleiche Beispieldaten */
function demoRandom(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedDemoData(st) {
  const rnd = demoRandom(20261004);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const weighted = pairs => {
    let r = rnd() * pairs.reduce((a, p) => a + p[1], 0);
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  };

  const TITLES = [
    'Präsentation für Montag vorbereiten', 'Projektbericht schreiben', 'Steuererklärung', 'Bewerbung überarbeiten',
    'Kapitel 3 lesen und zusammenfassen', 'Angebot für Kunden erstellen', 'Website-Texte überarbeiten',
    'Budget für Q4 planen', 'Code-Review abschließen', 'Konzept für Workshop', 'Rechnungen sortieren',
    'Lernplan erstellen', 'Newsletter schreiben', 'Datenanalyse fertigstellen',
  ];
  const OTHER = ['Mails beantworten', 'Meeting vorbereiten', 'Orga & Ablage', 'Recherche', 'Telefonate', ''];
  const NOTES = [
    'Morgens lief es super, nach dem Mittag ging nichts mehr.',
    'Zu oft aufs Handy geschaut.',
    'Gut, dass ich mit der wichtigsten Aufgabe angefangen habe.',
    'Hab mir zu viel vorgenommen.',
    'Meeting hat den Nachmittag zerschossen.',
  ];

  const today = new Date();

  for (let back = 13; back >= 1; back--) {
    const date = addDays(today, -back);
    const key = ymd(date);
    if (st.days[key] || st.sessions.some(s => s.date === key)) continue;   // echte Daten nie überschreiben
    const dow = date.getDay();
    if (dow === 0) continue;                                                // sonntags frei

    // Prioritäten
    const nPrio = dow === 6 ? 1 : (rnd() < 0.55 ? 3 : 2);
    const used = new Set();
    const prios = [];
    while (prios.length < nPrio) {
      const title = pick(TITLES);
      if (used.has(title)) continue;
      used.add(title);
      prios.push({ id: uid(), title, estimateMin: pick([30, 45, 60, 60, 90]), done: false, doneAt: null });
    }

    // Fokus-Blöcke
    let t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, Math.floor(between(10, 70))).getTime();
    const sessions = [];

    const addSession = (prio, label, len) => {
      const start = t;
      const end = Math.round(start + len * 60000);
      const hour = new Date(start).getHours();
      const morning = hour < 12, noon = hour >= 12 && hour < 14;
      const rating = morning ? pick([4, 5, 5, 4, 4, 3]) : noon ? pick([3, 3, 4, 2]) : pick([2, 3, 2, 3, 4]);
      const distractions = {};
      const add = (id, n) => { if (n > 0) distractions[id] = n; };
      add('handy', Math.floor(rnd() * (morning ? 2 : 3.5)));
      add('nachrichten', rnd() < 0.35 ? 1 : 0);
      add('unterbrechung', rnd() < 0.2 ? 1 : 0);
      add('gedanken', !morning && rnd() < 0.45 ? 1 : 0);
      add('muede', !morning && rnd() < 0.35 ? 1 : 0);
      add('unklar', rnd() < 0.08 ? 1 : 0);
      sessions.push({
        id: uid(), date: key, start, end,
        priorityId: prio ? prio.id : null,
        label: prio ? prio.title : (label || 'Sonstiges'),
        distractions, rating, demo: true,
      });
      t = end + between(8, 40) * 60000;
      if (new Date(t).getHours() === 12) t += 45 * 60000;                   // Mittagspause
    };

    prios.forEach((p, idx) => {
      const willFinish = rnd() < (idx === 0 ? 0.7 : 0.3);
      let remaining = willFinish
        ? p.estimateMin * between(1.2, 1.8)
        : (rnd() < 0.3 ? 0 : p.estimateMin * between(0.2, 0.7));
      while (remaining > 8) {
        const len = Math.min(remaining, between(25, 75));
        addSession(p, null, len);
        remaining -= len;
      }
      if (willFinish) { p.done = true; p.doneAt = t; }
      if (idx === 0 && rnd() < 0.8) addSession(null, pick(OTHER), between(25, 70));
    });
    if (rnd() < 0.5) addSession(null, pick(OTHER), between(20, 50));

    // Abend-Check
    let evening = null;
    if (rnd() < 0.85) {
      evening = {
        energy: pick([2, 3, 3, 4, 2, 3, 2]),
        blocker: weighted([['handy', 40], ['meetings', 18], ['muede', 15], ['zuviel', 10], ['aufgeschoben', 6], ['nichts', 11]]),
        note: rnd() < 0.3 ? pick(NOTES) : '',
        updatedAt: t,
      };
    }

    st.days[key] = { priorities: prios, evening, demo: true };
    st.sessions.push(...sessions);
  }
}

function hasDemoData(st) {
  return st.sessions.some(s => s.demo) || Object.values(st.days).some(d => d.demo);
}

function clearDemoData(st) {
  st.sessions = st.sessions.filter(s => !s.demo);
  for (const [key, day] of Object.entries(st.days)) {
    if (day.demo) delete st.days[key];
  }
}
