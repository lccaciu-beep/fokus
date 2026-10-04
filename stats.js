'use strict';

/* =========================================================
   Fokus – Auswertung
   Zeitraum oder Kalender, Kennzahlen, SVG-Diagramme,
   regelbasierte Erkenntnisse, Einzeltag-Ansicht
   ========================================================= */

const MIN_DATA_DAYS = 3;
const WEEKLY_FROM_DAYS = 46;   // ab hier zeigt das Tagesdiagramm Wochen statt Tage

/* Farben kommen aus dem Farbschema (styles.css): Klassen c-prio, c-other, conc-1 … conc-5 */

const TIME_SLOTS = [
  { id: 'vormittag', label: 'vormittags', target: 'auf den Vormittag', from: 5, to: 12 },
  { id: 'mittag', label: 'mittags', target: 'in die Mittagszeit', from: 12, to: 14 },
  { id: 'nachmittag', label: 'nachmittags', target: 'auf den Nachmittag', from: 14, to: 18 },
  { id: 'abend', label: 'abends', target: 'auf den Abend', from: 18, to: 29 },
];

const DISTRACTION_TIPS = {
  handy: 'Leg dein Handy während eines Fokus-Blocks außer Reichweite, am besten in einen anderen Raum, und schalte den iOS-Fokus „Nicht stören“ ein. Für TikTok-Arbeit: Recherche und Posten in eigene Blöcke legen, nicht nebenbei.',
  nachrichten: 'Schließ Mail und Chat während des Blocks komplett. Bündle Nachrichten in 2–3 feste Zeitfenster am Tag, zum Beispiel 11 und 16 Uhr.',
  unterbrechung: 'Mach deine Fokuszeit sichtbar (Kopfhörer, Status, Tür zu) und biete feste Zeiten für Rückfragen an.',
  gedanken: 'Leg einen Zettel neben dich. Schreib abschweifende Gedanken sofort auf und kehr dann zur Aufgabe zurück, denn erledigen kannst du sie später.',
  muede: 'Arbeite in kürzeren Blöcken (25–45 min) mit echten Pausen: aufstehen, Wasser trinken, kurz an die frische Luft.',
  unklar: 'Schreib vor dem Start den ersten konkreten Schritt auf, zum Beispiel „Gliederung mit 5 Punkten“ statt „Hausarbeit machen“.',
};

const BLOCKER_TIPS = {
  handy: 'Gib dem Handy einen festen Platz außerhalb deines Arbeitsbereichs und lege App-Limits für Social Media fest (Einstellungen › Bildschirmzeit).',
  meetings: 'Blocke dir feste Fokuszeiten wie Termine, idealerweise vormittags, und lege Vorlesungen, Calls und Absprachen gesammelt auf den Nachmittag.',
  muede: 'Achte auf feste Schlafenszeiten und plane anspruchsvolle Aufgaben in deine wachste Tageszeit. Kurze Pausen alle 60–90 min helfen.',
  unklar: 'Formuliere Aufgaben als konkrete Ergebnisse („Entwurf Kapitel 2 fertig“) und nicht als Themen („Kapitel 2“).',
  zuviel: 'Markiere höchstens 3 Aufgaben als „Hoch“ und arbeite sie zuerst ab. Eine erledigte Aufgabe schlägt drei angefangene.',
  aufgeschoben: 'Starte mit nur 10 Minuten. Der Anfang ist die größte Hürde, danach läuft es meist von selbst.',
};

const AREA_TIPS = {
  studium: 'Leg feste Lernblöcke in deine konzentrierteste Tageszeit, zum Beispiel jeden Vormittag 2 × 45 min, und starte sie direkt mit ▶ an der Aufgabe.',
  tiktok: 'Bündle TikTok-Arbeit: ein Block zum Drehen, einer zum Schneiden und Posten. Feste Tage (etwa Di, Do, Sa) helfen mehr als „nebenbei“.',
  privat: 'Plane private Erledigungen bewusst als eigene Aufgaben ein, sonst gehen sie zwischen Studium und TikTok unter.',
};

/* ---------- Kleine Helfer ---------- */

const sum = arr => arr.reduce((a, b) => a + b, 0);
const avg = arr => (arr.length ? sum(arr) / arr.length : null);
const pct = v => Math.round(v * 100);

function weekdayShort(date) {
  return date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
}

function dayLabelLong(date) {
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function dateLabel(date, withWeekday = true) {
  return date.toLocaleDateString('de-DE', withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short' });
}

/** Konzentration 1–5 als Helligkeitsstufe der Akzentfarbe */
function concClass(v) {
  if (!v) return 'conc-0';
  return `conc-${Math.min(5, Math.max(1, Math.round(v)))}`;
}

/** Abstand für Achsenbeschriftung: 1, 2, 2,5, 5 × 10^k */
function niceStep(max, ticks = 4) {
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

/** Balken mit abgerundeten oberen Ecken, unten bündig zur Grundlinie */
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Tage mit irgendeinem Eintrag (für Kalenderpunkte) */
function datesWithData() {
  const set = new Set(state.sessions.map(s => s.date));
  for (const [k, d] of Object.entries(state.days)) if (d.evening) set.add(k);
  for (const t of state.tasks) if (t.doneAt) set.add(ymd(new Date(t.doneAt)));
  return set;
}

/* =========================================================
   Zeitraum
   ========================================================= */

let calMonth = null;      // angezeigter Monat im Kalender
let calPending = false;   // erster Tag gewählt, zweiter Tipp erweitert zum Zeitraum

function getRange() {
  const today = startOfDay(new Date());
  const mode = state.meta.statsMode;
  if (mode === 'cal') {
    let from = state.meta.calFrom ? parseYmd(state.meta.calFrom) : today;
    let to = state.meta.calTo ? parseYmd(state.meta.calTo) : from;
    if (to < from) [from, to] = [to, from];
    if (to > today) to = today;
    if (from > today) from = today;
    const days = Math.round((to - from) / 86400000) + 1;
    return { from, to, days, single: days === 1 };
  }
  const n = Number(mode) || 7;
  return { from: addDays(today, -(n - 1)), to: today, days: n, single: false };
}

function rangeLabel(r) {
  if (r.single) return r.from.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const sameYear = r.from.getFullYear() === r.to.getFullYear();
  const f = r.from.toLocaleDateString('de-DE', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const t = r.to.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${f} bis ${t} (${r.days} Tage)`;
}

/* =========================================================
   Berechnung
   ========================================================= */

function computeStats(range) {
  const todayStr = todayKey();
  const dates = [];
  for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) dates.push(ymd(d));
  const inRange = new Set(dates);
  const startMs = range.from.getTime();
  const endMs = addDays(range.to, 1).getTime();
  const sessions = state.sessions.filter(s => inRange.has(s.date));

  const days = dates.map(date => {
    const ses = sessions.filter(s => s.date === date);
    let taskMin = 0, otherMin = 0;
    for (const s of ses) {
      if (s.priorityId) taskMin += sessionMin(s); else otherMin += sessionMin(s);
    }
    const ev = (state.days[date] || {}).evening;
    return {
      date,
      d: parseYmd(date),
      isToday: date === todayStr,
      ses,
      taskMin,
      otherMin,
      doneCount: state.tasks.filter(t => isDoneOn(t, date)).length,
      evening: ev && (ev.energy || ev.blocker || ev.note) ? ev : null,
    };
  });

  const dataDays = days.filter(d => d.ses.length || d.evening || d.doneCount).length;
  const activeDays = days.filter(d => d.ses.length).length;

  // Aufgaben, die im Zeitraum angelegt oder erledigt wurden, und davon erledigte
  const doneInRange = t => t.done && t.doneAt >= startMs && t.doneAt < endMs;
  const shownAt = t => (t.startDate ? Math.max(t.createdAt, parseYmd(t.startDate).getTime()) : t.createdAt);
  const relevant = state.tasks.filter(t => (shownAt(t) >= startMs && shownAt(t) < endMs) || doneInRange(t));
  const doneIn = relevant.filter(doneInRange);

  // Schätzung vs. tatsächlich (nur erledigte Aufgaben mit Schätzung und erfasster Zeit)
  let estSum = 0, actSum = 0, estCount = 0;
  for (const t of doneIn.filter(x => x.estimateMin)) {
    const act = sum(state.sessions.filter(s => s.priorityId === t.id).map(sessionMin));
    if (act > 0) { estSum += t.estimateMin; actSum += act; estCount++; }
  }

  const totalMin = sum(days.map(d => d.taskMin + d.otherMin));
  const taskMin = sum(days.map(d => d.taskMin));
  const ratings = sessions.filter(s => s.rating).map(s => s.rating);

  // Fokuszeit nach Uhrzeit: Blöcke werden minutengenau auf Stunden verteilt
  const hours = Array.from({ length: 24 }, () => ({ min: 0, wSum: 0, wMin: 0 }));
  for (const s of sessions) {
    let t = s.start;
    while (t < s.end) {
      const d = new Date(t);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const segEnd = Math.min(next, s.end);
      const m = (segEnd - t) / 60000;
      const h = hours[d.getHours()];
      h.min += m;
      if (s.rating) { h.wSum += m * s.rating; h.wMin += m; }
      t = segEnd;
    }
  }

  // Konzentration nach Tageszeit (Startzeit des Blocks)
  const slots = TIME_SLOTS.map(sl => ({ ...sl, ratings: [] }));
  for (const s of sessions) {
    if (!s.rating) continue;
    let h = new Date(s.start).getHours();
    if (h < 5) h += 24;
    const sl = slots.find(x => h >= x.from && h < x.to);
    if (sl) sl.ratings.push(s.rating);
  }

  const distractions = DISTRACTIONS
    .map(d => ({ ...d, count: sum(sessions.map(s => (s.distractions || {})[d.id] || 0)) }))
    .sort((a, b) => b.count - a.count);

  // Fokuszeit pro Bereich (Blöcke ohne Aufgabe = andere Tätigkeiten)
  const areaMin = {};
  for (const s of sessions) {
    const a = s.priorityId ? (sessionArea(s) || 'none') : 'other';
    areaMin[a] = (areaMin[a] || 0) + sessionMin(s);
  }
  const areas = [
    ...AREAS.map(a => ({ id: a.id, label: a.label, count: areaMin[a.id] || 0, cls: `c-area-${a.id}` })),
    { id: 'none', label: 'Ohne Bereich', count: areaMin.none || 0, cls: 'c-area-none' },
    { id: 'other', label: 'Andere Tätigkeiten', count: areaMin.other || 0, cls: 'c-area-none' },
  ].sort((a, b) => b.count - a.count);

  // Überfällige Aufgaben (Stand heute)
  const overdue = state.tasks.filter(t => !t.done && t.dueDate && t.dueDate < todayKey());

  const categories = CATEGORIES
    .map(c => ({ ...c, count: sum(sessions.filter(s => sessionCategory(s) === c.id).map(sessionMin)) }))
    .sort((a, b) => b.count - a.count);

  const evenings = days.map(d => d.evening).filter(Boolean);
  const blockers = BLOCKERS
    .map(b => ({ ...b, count: evenings.filter(e => e.blocker === b.id).length }))
    .sort((a, b) => b.count - a.count);
  const energies = evenings.map(e => e.energy).filter(Boolean);

  // Wichtige Aufgaben, die seit über 3 Tagen offen sind
  const staleHigh = state.tasks.filter(t => !t.done && t.priority === 'hoch' && Date.now() - t.createdAt > 3 * 86400000);

  return {
    range, days, sessions, dataDays, activeDays,
    relevantCount: relevant.length,
    doneCount: doneIn.length,
    completion: relevant.length ? doneIn.length / relevant.length : null,
    totalMin, taskMin, otherMin: totalMin - taskMin,
    taskShare: totalMin ? taskMin / totalMin : null,
    focusPerActiveDay: activeDays ? totalMin / activeDays : null,
    estSum, actSum, estCount,
    ratio: estCount ? actSum / estSum : null,
    avgRating: avg(ratings),
    ratingCount: ratings.length,
    hours, slots, distractions, blockers, evenings, categories, staleHigh, areas, areaMin, overdue,
    avgEnergy: avg(energies),
    energyCount: energies.length,
  };
}

/* =========================================================
   Erkenntnisse (regelbasiert, nach Wichtigkeit sortiert)
   ========================================================= */

function buildInsights(st) {
  const out = [];

  // 1. Unterschätzte Dauer
  if (st.ratio !== null && st.estCount >= 2 && st.ratio >= 1.3) {
    out.push({
      score: 50 + (st.ratio - 1.3) * 100,
      title: `Deine Aufgaben dauern ${fmtNum(st.ratio)}× so lange wie geschätzt`,
      text: `Für ${st.estCount} erledigte Aufgaben hast du ${fmtMin(st.actSum)} gebraucht, geschätzt waren ${fmtMin(st.estSum)}. Darum bleibt am Ende des Tages zwangsläufig etwas liegen.`,
      tip: `Rechne beim Planen mit Faktor ${fmtNum(Math.round(st.ratio * 10) / 10)}: Aus „1 h“ werden realistisch ${fmtMin(60 * st.ratio)}. Oder nimm dir pro Tag eine Aufgabe weniger vor.`,
    });
  }

  // 2. Wenige Aufgaben erledigt
  if (st.completion !== null && st.relevantCount >= 5 && st.completion < 0.6) {
    out.push({
      score: 50 + (0.6 - st.completion) * 150,
      title: `Nur ${pct(st.completion)} % deiner Aufgaben erledigt`,
      text: `Von ${st.relevantCount} Aufgaben, die du in diesem Zeitraum angelegt oder abgeschlossen hast, sind ${st.doneCount} erledigt. Eine lange offene Liste fühlt sich unproduktiv an, auch an guten Tagen.`,
      tip: 'Markiere jeden Morgen höchstens 3 Aufgaben als „Hoch“ und starte mit der ersten, noch bevor du Mails oder TikTok öffnest. Was seit Wochen liegt: löschen oder neu formulieren.',
    });
  }

  // 3. Wichtige Aufgaben bleiben liegen
  if (st.staleHigh.length >= 1) {
    const oldest = st.staleHigh.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    const daysOld = Math.floor((Date.now() - oldest.createdAt) / 86400000);
    out.push({
      score: 45 + Math.min(25, st.staleHigh.length * 6 + daysOld),
      title: st.staleHigh.length === 1
        ? 'Eine wichtige Aufgabe bleibt liegen'
        : `${st.staleHigh.length} wichtige Aufgaben bleiben liegen`,
      text: `„${oldest.title}“ steht seit ${daysOld} Tagen mit Priorität „Hoch“ auf deiner Liste.`,
      tip: 'Teil sie in einen ersten Schritt von höchstens 30 Minuten und starte ihn morgen als ersten Block. Ist sie doch nicht wichtig, setz sie auf „Mittel“.',
    });
  }

  // 3b. Überfällige Aufgaben
  if (st.overdue.length >= 2) {
    out.push({
      score: 46 + Math.min(20, st.overdue.length * 4),
      title: `${st.overdue.length} Aufgaben sind überfällig`,
      text: `Zum Beispiel „${st.overdue[0].title}“. Überfällige Aufgaben erzeugen schlechtes Gewissen, ohne dich weiterzubringen.`,
      tip: 'Geh die Liste einmal durch: Gib jeder überfälligen Aufgabe ein realistisches neues Datum oder lösch sie, wenn sie nicht mehr wichtig ist.',
    });
  }

  // 3c. Wochenziel eines Bereichs klar verfehlt
  for (const a of AREAS) {
    const goal = state.meta.goals[a.id];
    if (!goal || st.days.length < 7) continue;
    const expected = goal * st.days.length / 7;
    const got = st.areaMin[a.id] || 0;
    const ratio = got / expected;
    if (ratio < 0.6) {
      out.push({
        score: 44 + (0.6 - ratio) * 45,
        title: `${a.label} kommt zu kurz`,
        text: `Dein Ziel sind ${fmtMin(goal)} pro Woche. In diesem Zeitraum wären das ${fmtMin(expected)} gewesen, geschafft hast du ${fmtMin(got)} (${pct(ratio)} %).`,
        tip: AREA_TIPS[a.id],
      });
    }
  }

  // 4. Fokuszeit geht in andere Tätigkeiten
  if (st.taskShare !== null && st.totalMin >= 120 && st.taskShare < 0.5) {
    const topCat = st.categories[0];
    out.push({
      score: 48 + (0.5 - st.taskShare) * 120,
      title: `Nur ${pct(st.taskShare)} % deiner Fokuszeit gehen in deine To-dos`,
      text: `${fmtMin(st.otherMin)} von ${fmtMin(st.totalMin)} gingen in andere Tätigkeiten` +
        (topCat && topCat.count ? `, am meisten in „${topCat.label}“ (${fmtMin(topCat.count)}).` : '.') +
        ' Das fühlt sich beschäftigt an, bringt dich bei deinen Aufgaben aber nicht weiter.',
      tip: 'Reserviere den ersten Block des Tages fest für deine wichtigste Aufgabe. Anderes bündelst du danach in einem gemeinsamen Block.',
    });
  }

  // 5. Konzentration hängt stark von der Uhrzeit ab
  const slots = st.slots.filter(s => s.ratings.length >= 2).map(s => ({ ...s, avg: avg(s.ratings) }));
  if (slots.length >= 2) {
    const best = slots.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = slots.reduce((a, b) => (b.avg < a.avg ? b : a));
    const diff = best.avg - worst.avg;
    if (diff >= 1) {
      out.push({
        score: 42 + diff * 14,
        title: `Du bist ${best.label} deutlich konzentrierter`,
        text: `Deine Konzentration liegt ${best.label} im Schnitt bei ${fmtNum(best.avg)}, ${worst.label} nur bei ${fmtNum(worst.avg)} von 5.`,
        tip: `Leg anspruchsvolle Aufgaben wie Lernen oder Hausarbeit ${best.target} und verschieb Routine wie Mails, Posten und Orga ${worst.target}.`,
      });
    }
  }

  // 6. Eine Ablenkung dominiert
  const dTotal = sum(st.distractions.map(d => d.count));
  const dTop = st.distractions[0];
  if (dTotal >= 5 && dTop.count / dTotal >= 0.4) {
    const share = dTop.count / dTotal;
    const perHour = st.totalMin ? dTotal / (st.totalMin / 60) : 0;
    out.push({
      score: 36 + share * 40 + Math.min(10, perHour * 3),
      title: `„${dTop.label}“ ist deine häufigste Ablenkung`,
      text: `${dTop.count} von ${dTotal} Ablenkungen (${pct(share)} %). Im Schnitt wirst du ${fmtNum(perHour)}-mal pro Fokus-Stunde unterbrochen.`,
      tip: DISTRACTION_TIPS[dTop.id],
    });
  }

  // 7. Ein Bremsklotz dominiert
  const withBlocker = st.evenings.filter(e => e.blocker && e.blocker !== 'nichts');
  const bTop = st.blockers.find(b => b.id !== 'nichts');
  if (withBlocker.length >= 3 && bTop && bTop.count >= 2 && bTop.count / withBlocker.length >= 0.4) {
    const share = bTop.count / withBlocker.length;
    out.push({
      score: 38 + share * 40,
      title: `Dein größter Bremsklotz: ${bTop.label}`,
      text: `An ${bTop.count} von ${withBlocker.length} Tagen mit Bremsklotz war das dein größtes Hindernis.`,
      tip: BLOCKER_TIPS[bTop.id],
    });
  }

  // 8. Energie im Schnitt niedrig
  if (st.energyCount >= 3 && st.avgEnergy < 3) {
    out.push({
      score: 40 + (3 - st.avgEnergy) * 25,
      title: `Deine Energie ist im Schnitt niedrig (${fmtNum(st.avgEnergy)} von 5)`,
      text: 'Mit wenig Energie fällt Fokus schwer, egal wie gut der Plan ist.',
      tip: 'Plane Pausen wie Termine ein: nach 60–90 min Fokus 10 min weg vom Bildschirm. Und achte auf feste Schlafenszeiten.',
    });
  }

  // 9. Wenig Fokuszeit
  if (st.activeDays >= 3 && st.focusPerActiveDay < 60) {
    out.push({
      score: 34 + (60 - st.focusPerActiveDay) / 3,
      title: `Wenig echte Fokuszeit: ${fmtMin(st.focusPerActiveDay)} pro Tag`,
      text: 'An Tagen mit Fokus-Blöcken kommst du im Schnitt auf weniger als eine Stunde konzentrierte Arbeit.',
      tip: 'Starte klein: Ein fester 45-Minuten-Block jeden Morgen zur gleichen Uhrzeit wird schnell zur Gewohnheit.',
    });
  }

  out.sort((a, b) => b.score - a.score);
  out.forEach(i => { i.level = i.score >= 65 ? 'high' : i.score >= 50 ? 'mid' : 'low'; });
  return out;
}

/* =========================================================
   Diagramme (SVG)
   ========================================================= */

/** Tage, bei langen Zeiträumen zu Wochen gebündelt */
function chartBuckets(st) {
  const weekly = st.days.length >= WEEKLY_FROM_DAYS;
  if (!weekly) {
    return {
      weekly,
      items: st.days.map(d => ({
        d: d.d, isToday: d.isToday, taskMin: d.taskMin, otherMin: d.otherMin,
        label: dayLabelLong(d.d),
      })),
    };
  }
  const items = [];
  for (let i = 0; i < st.days.length; i += 7) {
    const chunk = st.days.slice(i, i + 7);
    const last = chunk[chunk.length - 1];
    items.push({
      d: chunk[0].d,
      isToday: chunk.some(c => c.isToday),
      taskMin: sum(chunk.map(c => c.taskMin)),
      otherMin: sum(chunk.map(c => c.otherMin)),
      label: `${dateLabel(chunk[0].d, false)} bis ${dateLabel(last.d, false)}`,
    });
  }
  return { weekly, items };
}

function chartDaily(st) {
  const W = 340, H = 196, L = 34, R = 6, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const { weekly, items } = chartBuckets(st);
  const n = items.length;

  const maxMin = Math.max(60, ...items.map(d => d.taskMin + d.otherMin));
  const stepH = niceStep(maxMin / 60, 4);
  const topH = Math.ceil(maxMin / 60 / stepH) * stepH;
  const y = m => T + ih - (m / (topH * 60)) * ih;

  let g = '';
  for (let h = 0; h <= topH + 1e-9; h += stepH) {
    const yy = y(h * 60);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/>`;
    g += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmtNum(h)} h</text>`;
  }

  const slot = iw / n;
  const bw = Math.max(1.5, Math.min(24, slot * 0.66));
  const every = Math.max(1, Math.ceil(n / 7));
  let bars = '', labels = '', hits = '';

  items.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const base = y(0);
    const yTask = y(d.taskMin);
    const yTotal = y(d.taskMin + d.otherMin);
    const r = Math.min(4, bw / 2);

    if (d.otherMin > 0 && d.taskMin > 0) {
      bars += `<rect x="${x}" y="${yTask}" width="${bw}" height="${base - yTask}" class="c-prio"/>`;
      // 2px Abstand zwischen den Segmenten
      bars += `<path d="${barPath(x, yTotal, bw, Math.max(0, yTask - yTotal - 2), r)}" class="c-other"/>`;
    } else if (d.taskMin > 0) {
      bars += `<path d="${barPath(x, yTask, bw, base - yTask, r)}" class="c-prio"/>`;
    } else if (d.otherMin > 0) {
      bars += `<path d="${barPath(x, yTotal, bw, base - yTotal, r)}" class="c-other"/>`;
    }

    if ((n - 1 - i) % every === 0) {
      const txt = weekly ? `${d.d.getDate()}.${d.d.getMonth() + 1}.` : n <= 7 ? weekdayShort(d.d) : `${d.d.getDate()}.`;
      labels += `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle" class="${d.isToday ? 'today' : ''}">${txt}</text>`;
    }

    const total = d.taskMin + d.otherMin;
    const detail = total
      ? `<strong>${d.label}</strong>: ${fmtMin(total)} Fokus, davon ${fmtMin(d.taskMin)} für To-dos und ${fmtMin(d.otherMin)} anderes`
      : `<strong>${d.label}</strong>: keine Fokuszeit`;
    hits += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" data-detail="${esc(detail)}"/>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fokuszeit pro ${weekly ? 'Woche' : 'Tag'}">${g}${bars}${labels}${hits}</svg>`;
}

function chartHours(st) {
  const W = 340, H = 176, L = 34, R = 6, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const withData = st.hours.map((h, i) => (h.min > 0 ? i : -1)).filter(i => i >= 0);
  const lo = Math.min(7, ...withData);
  const hi = Math.max(21, ...withData);
  const n = hi - lo + 1;

  // Ø Minuten pro aktivem Tag in dieser Stunde
  const days = Math.max(1, st.activeDays);
  const vals = st.hours.map(h => h.min / days);
  const maxV = Math.max(10, ...vals.slice(lo, hi + 1));
  const step = niceStep(maxV, 3);
  const top = Math.ceil(maxV / step) * step;
  const y = v => T + ih - (v / top) * ih;

  let g = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    g += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v, 0)}</text>`;
  }

  const slot = iw / n;
  const bw = Math.max(4, slot - 2);
  let bars = '', labels = '', hits = '';
  for (let h = lo; h <= hi; h++) {
    const i = h - lo;
    const x = L + i * slot + (slot - bw) / 2;
    const v = vals[h];
    const hd = st.hours[h];
    const conc = hd.wMin ? hd.wSum / hd.wMin : null;
    if (v > 0) bars += `<path d="${barPath(x, y(v), bw, y(0) - y(v), 3)}" class="${concClass(conc)}"/>`;
    if (h % 3 === 0) labels += `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${h} Uhr</text>`;
    const detail = v > 0
      ? `<strong>${h}–${h + 1} Uhr</strong>: ${fmtMin(hd.min)} insgesamt (Ø ${fmtMin(v)} pro aktivem Tag)` + (conc ? `, Ø Konzentration ${fmtNum(conc)}` : '')
      : `<strong>${h}–${h + 1} Uhr</strong>: keine Fokuszeit`;
    hits += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" data-detail="${esc(detail)}"/>`;
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fokuszeit nach Uhrzeit, eingefärbt nach Konzentration">${g}${bars}${labels}${hits}</svg>`;
}

function chartRanking(items, emptyText, fmtValue) {
  const rows = items.filter(i => i.count > 0);
  if (!rows.length) return `<p class="muted small">${emptyText}</p>`;
  const total = sum(rows.map(r => r.count));
  const max = rows[0].count;
  const W = 340, rowH = 42;
  const H = rows.length * rowH - 6;
  const body = rows.map((r, i) => {
    const yy = i * rowH;
    const w = Math.max(6, (r.count / max) * W);
    return `
      <text class="lbl" x="0" y="${yy + 14}">${esc(r.label)}</text>
      <text class="val" x="${W}" y="${yy + 14}" text-anchor="end">${fmtValue ? fmtValue(r.count) : `${r.count}×`} (${pct(r.count / total)} %)</text>
      <rect x="0" y="${yy + 22}" width="${W}" height="10" rx="5" class="track"/>
      <rect x="0" y="${yy + 22}" width="${w}" height="10" rx="5" class="${r.cls || (i === 0 ? 'c-prio' : 'c-prio-dim')}"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rangliste">${body}</svg>`;
}

/* =========================================================
   Darstellung
   ========================================================= */

const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function kpiTile(label, value, sub, tone) {
  return `<div class="kpi ${tone || ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function minHtml(m) { return fmtMin(m).replace(/ (h|min)/g, '<small> $1</small>'); }

function renderKpis(st) {
  const c = st.completion;
  const r = st.ratio;
  const a = st.avgRating;
  return `<div class="kpi-grid">
    ${kpiTile('Aufgaben erledigt',
      c === null ? '–' : `${pct(c)}<small> %</small>`,
      c === null ? 'noch keine Aufgaben' : `${st.doneCount} von ${st.relevantCount}`,
      c === null ? '' : c >= 0.6 ? 'good' : 'warn')}
    ${kpiTile('Fokuszeit pro aktivem Tag',
      st.focusPerActiveDay === null ? '–' : minHtml(st.focusPerActiveDay),
      `an ${st.activeDays} von ${st.days.length} Tagen`,
      '')}
    ${kpiTile('Tatsächlich vs. geschätzt',
      r === null ? '–' : `${fmtNum(r)}<small>×</small>`,
      r === null ? 'noch keine erledigte Aufgabe mit Schätzung' : r >= 1.3 ? 'dauert länger als geplant' : r <= 0.8 ? 'schneller als geplant' : 'Schätzung passt gut',
      r === null ? '' : r >= 1.3 ? 'warn' : 'good')}
    ${kpiTile('Ø Konzentration',
      a === null ? '–' : `${fmtNum(a)}<small> / 5</small>`,
      a === null ? 'noch keine Bewertung' : `aus ${st.ratingCount} ${st.ratingCount === 1 ? 'Block' : 'Blöcken'}`,
      a === null ? '' : a >= 3.5 ? 'good' : a < 3 ? 'warn' : '')}
  </div>`;
}

function renderFocusCard(top) {
  if (!top) {
    return `<section class="card focus-card">
      <p class="focus-label">Dein Ansatzpunkt</p>
      <h2>Du bist auf einem guten Weg</h2>
      <p>Plan und Wirklichkeit liegen nah beieinander, keine deutliche Schwachstelle in diesem Zeitraum.</p>
      <div class="tip-box">${BULB}<p>Halte deinen Rhythmus und steigere dich behutsam: Nimm dir für deine wichtigste Aufgabe etwas mehr vor als bisher.</p></div>
    </section>`;
  }
  return `<section class="card focus-card">
    <p class="focus-label">Dein Ansatzpunkt</p>
    <h2>${esc(top.title)}</h2>
    <p>${esc(top.text)}</p>
    <div class="tip-box">${BULB}<p>${esc(top.tip)}</p></div>
  </section>`;
}

/** Wochenziele hochgerechnet auf den Zeitraum */
function renderGoalCompare(st) {
  const rows = AREAS.filter(a => state.meta.goals[a.id] > 0);
  if (!rows.length || st.days.length < 7) return '';
  return `<div class="goal-compare">${rows.map(a => {
    const expected = state.meta.goals[a.id] * st.days.length / 7;
    const got = st.areaMin[a.id] || 0;
    return `<div class="goal-row a-${a.id}">
      <div class="goal-top">
        <span class="goal-name"><i class="area-dot"></i>Ziel ${a.label}</span>
        <span class="goal-val ${got >= expected ? 'is-reached' : ''}">${pct(got / expected)} %</span>
      </div>
      <span class="goal-bar"><span style="width:${Math.min(100, (got / expected) * 100)}%"></span></span>
    </div>`;
  }).join('')}</div>`;
}

/* ---------- Zeitraum-Auswahl und Kalender ---------- */

function renderRangeControls() {
  const mode = state.meta.statsMode;
  $$('#range-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === mode)));
  const box = $('#cal-box');
  box.hidden = mode !== 'cal';
  if (mode === 'cal') renderCalendar();
}

function renderCalendar() {
  const range = getRange();
  if (!calMonth) calMonth = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  const today = startOfDay(new Date());
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;   // Montag zuerst
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
  const data = datesWithData();
  const fromK = ymd(range.from), toK = ymd(range.to);

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span class="cal-cell is-blank" aria-hidden="true"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const k = ymd(date);
    const cls = ['cal-cell'];
    if (k >= fromK && k <= toK) cls.push('in-range');
    if (k === fromK) cls.push('is-start');
    if (k === toK) cls.push('is-end');
    if (k === ymd(today)) cls.push('is-today');
    if (data.has(k)) cls.push('has-data');
    const future = date > today;
    cells += `<button type="button" class="${cls.join(' ')}" data-date="${k}" ${future ? 'disabled' : ''}
      aria-label="${date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}"
      aria-pressed="${k >= fromK && k <= toK}"><span>${d}</span></button>`;
  }

  $('#cal-box').innerHTML = `
    <div class="cal-head">
      <button type="button" class="icon-btn cal-nav" data-cal="prev" aria-label="Vorheriger Monat">${CHEVRON_L}</button>
      <strong>${calMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
      <button type="button" class="icon-btn cal-nav" data-cal="next" aria-label="Nächster Monat" ${isCurrentMonth ? 'disabled' : ''}>${CHEVRON_R}</button>
    </div>
    <div class="cal-grid cal-weekdays" aria-hidden="true"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>
    <div class="cal-grid">${cells}</div>
    <p class="cal-hint">${calPending
      ? 'Tippe einen zweiten Tag an, um einen Zeitraum zu wählen.'
      : 'Tippe einen Tag an. Ein zweiter Tipp wählt einen Zeitraum.'}</p>`;
}

function onCalendarClick(e) {
  const nav = e.target.closest('[data-cal]');
  if (nav) {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + (nav.dataset.cal === 'next' ? 1 : -1), 1);
    renderCalendar();
    return;
  }
  const cell = e.target.closest('button[data-date]');
  if (!cell || cell.disabled) return;
  const k = cell.dataset.date;
  if (calPending && state.meta.calFrom && k !== state.meta.calFrom) {
    const [a, b] = [state.meta.calFrom, k].sort();
    state.meta.calFrom = a;
    state.meta.calTo = b;
    calPending = false;
  } else {
    state.meta.calFrom = k;
    state.meta.calTo = k;
    calPending = true;
  }
  saveState();
  renderStats();
}

/* ---------- Einzelner Tag ---------- */

function renderDayView(range) {
  const k = ymd(range.from);
  const st = computeStats(range);
  const day = st.days[0];
  const ses = [...day.ses].sort((a, b) => a.start - b.start);
  const done = state.tasks.filter(t => isDoneOn(t, k)).sort((a, b) => a.doneAt - b.doneAt);
  const ev = day.evening;
  const prevK = ymd(addDays(range.from, -1));
  const nextDate = addDays(range.from, 1);
  const canNext = nextDate <= startOfDay(new Date());

  const head = `
    <div class="day-nav">
      <button type="button" class="icon-btn" data-day="${prevK}" aria-label="Vortag">${CHEVRON_L}</button>
      <strong>${esc(rangeLabel(range))}</strong>
      <button type="button" class="icon-btn" data-day="${ymd(nextDate)}" aria-label="Folgetag" ${canNext ? '' : 'disabled'}>${CHEVRON_R}</button>
    </div>`;

  if (!ses.length && !done.length && !ev) {
    return `${head}<section class="card hint-card">
      <h2>An diesem Tag gibt es keine Einträge</h2>
      <p>Wähl im Kalender einen Tag mit Punkt darunter, dort hast du etwas erfasst.</p>
    </section>`;
  }

  const blockerLabel = ev && ev.blocker ? labelOf(BLOCKERS, ev.blocker) : null;

  return `${head}
    <div class="kpi-grid">
      ${kpiTile('Fokuszeit', st.totalMin >= 1 ? minHtml(st.totalMin) : '–', `in ${ses.length} ${ses.length === 1 ? 'Block' : 'Blöcken'}`, '')}
      ${kpiTile('Aufgaben erledigt', String(done.length), done.length ? 'an diesem Tag abgehakt' : 'nichts abgehakt', done.length ? 'good' : '')}
      ${kpiTile('Davon für To-dos', st.totalMin >= 1 ? `${pct(st.taskShare)}<small> %</small>` : '–', st.totalMin >= 1 ? minHtml(st.taskMin) + ' Fokus' : 'keine Fokuszeit', '')}
      ${kpiTile('Ø Konzentration', st.avgRating === null ? '–' : `${fmtNum(st.avgRating)}<small> / 5</small>`, st.avgRating === null ? 'keine Bewertung' : `aus ${st.ratingCount} ${st.ratingCount === 1 ? 'Block' : 'Blöcken'}`, st.avgRating === null ? '' : st.avgRating >= 3.5 ? 'good' : st.avgRating < 3 ? 'warn' : '')}
    </div>

    ${ses.length ? `<section class="card">
      <div class="card-head"><h2>Deine Blöcke</h2><span class="muted small">${fmtMin(st.totalMin)}</span></div>
      <ul class="block-list">${ses.map(x => blockItem(x, { readOnly: true })).join('')}</ul>
    </section>` : ''}

    ${done.length ? `<section class="card">
      <div class="card-head"><h2>Erledigt</h2></div>
      <ul class="done-simple">${done.map(t => `<li><span class="done-dot" aria-hidden="true">${ICONS.check}</span>${esc(t.title)}</li>`).join('')}</ul>
    </section>` : ''}

    ${ev ? `<section class="card">
      <div class="card-head"><h2>Abend-Check</h2></div>
      <div class="day-summary">
        <div><span>Energie</span><strong>${ev.energy ? `${ev.energy} von 5` : '–'}</strong></div>
        <div><span>Bremsklotz</span><strong class="small-strong">${blockerLabel ? esc(blockerLabel) : '–'}</strong></div>
      </div>
      ${ev.note ? `<p class="day-note">„${esc(ev.note)}“</p>` : ''}
    </section>` : ''}

    ${sum(st.distractions.map(d => d.count)) ? `<section class="card">
      <div class="card-head"><h2>Ablenkungen</h2></div>
      ${chartRanking(st.distractions, '')}
    </section>` : ''}`;
}

/* ---------- Gesamtansicht ---------- */

function renderStats() {
  renderRangeControls();
  const range = getRange();
  const el = $('#stats-content');

  if (range.single) { el.innerHTML = renderDayView(range); return; }

  const st = computeStats(range);
  const label = `<p class="range-label">${esc(rangeLabel(range))}</p>`;

  if (st.dataDays < MIN_DATA_DAYS) {
    el.innerHTML = `${label}<section class="card hint-card">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <h2>Noch ein bisschen Geduld</h2>
      <p>In diesem Zeitraum hast du an ${st.dataDays} ${st.dataDays === 1 ? 'Tag' : 'Tagen'} etwas erfasst. Ab ${MIN_DATA_DAYS} Tagen zeige ich dir hier deine Muster und woran du konkret ansetzen kannst.</p>
      <p>Hak Aufgaben ab, arbeite in Fokus-Blöcken und mach abends den kurzen Check. Einzelne Tage kannst du schon jetzt über „Kalender“ ansehen.</p>
    </section>`;
    return;
  }

  const insights = buildInsights(st);
  const rest = insights.slice(1);
  const weekly = st.days.length >= WEEKLY_FROM_DAYS;

  el.innerHTML = `
    ${label}
    ${renderFocusCard(insights[0])}
    ${renderKpis(st)}

    <section class="card">
      <div class="card-head"><h2>Fokuszeit pro ${weekly ? 'Woche' : 'Tag'}</h2></div>
      <p class="card-sub">${fmtMin(st.totalMin)} Fokus${st.taskShare !== null ? `, davon ${pct(st.taskShare)} % für deine To-dos` : ''}</p>
      ${chartDaily(st)}
      <div class="legend">
        <span><i style="background:var(--chart-prio)"></i>To-dos</span>
        <span><i style="background:var(--chart-other)"></i>Andere Tätigkeiten</span>
      </div>
      <p class="chart-detail">Tippe auf einen Balken für Details.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Zeit nach Bereich</h2></div>
      <p class="card-sub">Wofür du deine Fokuszeit eingesetzt hast</p>
      ${chartRanking(st.areas, 'Noch keine Fokuszeit in diesem Zeitraum.', fmtMin)}
      ${renderGoalCompare(st)}
    </section>

    <section class="card">
      <div class="card-head"><h2>Fokuszeit nach Uhrzeit</h2></div>
      <p class="card-sub">Ø Minuten pro aktivem Tag, Farbe zeigt die Konzentration</p>
      ${chartHours(st)}
      <div class="legend">
        <span>Konzentration 1 <span class="ramp">${[1, 2, 3, 4, 5].map(n => `<i style="background:var(--conc-${n})"></i>`).join('')}</span> 5</span>
      </div>
      <p class="chart-detail">Tippe auf eine Stunde für Details.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Wofür geht die übrige Zeit drauf?</h2></div>
      <p class="card-sub">Fokuszeit außerhalb deiner To-do-Liste</p>
      ${chartRanking(st.categories, 'In diesem Zeitraum ging deine ganze Fokuszeit in deine To-dos. Stark!', fmtMin)}
    </section>

    <section class="card">
      <div class="card-head"><h2>Häufigste Ablenkungen</h2></div>
      ${chartRanking(st.distractions, 'Keine Ablenkungen erfasst. Entweder läuft es super, oder du tippst sie noch nicht an.')}
    </section>

    <section class="card">
      <div class="card-head"><h2>Häufigste Bremsklötze</h2></div>
      ${chartRanking(st.blockers, 'Noch keine Abend-Checks in diesem Zeitraum.')}
    </section>

    ${rest.length ? `<section class="card">
      <div class="card-head"><h2>Weitere Erkenntnisse</h2></div>
      <ul class="insights">${rest.map(i => `
        <li class="insight">
          <span class="sev sev-${i.level}" aria-hidden="true"></span>
          <div>
            <h3>${esc(i.title)}</h3>
            <p>${esc(i.text)}</p>
            <p class="tip"><strong>Tipp:</strong> ${esc(i.tip)}</p>
          </div>
        </li>`).join('')}
      </ul>
    </section>` : ''}
  `;
}

/* ---------- Interaktion ---------- */

document.addEventListener('DOMContentLoaded', () => {
  $('#range-seg').addEventListener('click', e => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    state.meta.statsMode = btn.dataset.range;
    if (btn.dataset.range === 'cal') {
      if (!state.meta.calFrom) { state.meta.calFrom = todayKey(); state.meta.calTo = todayKey(); }
      calMonth = null;
      calPending = false;
    }
    saveState();
    renderStats();
  });

  $('#cal-box').addEventListener('click', onCalendarClick);

  $('#stats-content').addEventListener('click', e => {
    // Einzeltag: Vortag / Folgetag
    const dayBtn = e.target.closest('button[data-day]');
    if (dayBtn && !dayBtn.disabled) {
      state.meta.statsMode = 'cal';
      state.meta.calFrom = dayBtn.dataset.day;
      state.meta.calTo = dayBtn.dataset.day;
      calPending = false;
      calMonth = null;
      saveState();
      renderStats();
      return;
    }
    // Tippen auf Balken → Details unter dem Diagramm
    const hit = e.target.closest('.hit');
    if (!hit) return;
    const card = hit.closest('.card');
    $$('.hit.sel', card).forEach(h => h.classList.remove('sel'));
    hit.classList.add('sel');
    const detail = $('.chart-detail', card);
    if (detail) detail.innerHTML = hit.dataset.detail;
  });
});
