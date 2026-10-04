'use strict';

/* =========================================================
   Fokus – Auswertung
   Kennzahlen · SVG-Diagramme · regelbasierte Erkenntnisse
   ========================================================= */

const MIN_DATA_DAYS = 3;

/* Konzentration 1–5 als Helligkeitsstufen der Akzentfarbe (eine Farbe, dunkel → hell) */
const CONC_RAMP = ['#3B4170', '#4F5AA6', '#6573D6', '#8593FF', '#B7C0FF'];
const COLOR_PRIO = '#7C8CFF';
const COLOR_OTHER = '#5A606E';
const COLOR_GRID = '#262A33';

const TIME_SLOTS = [
  { id: 'vormittag', label: 'vormittags', target: 'auf den Vormittag', from: 5, to: 12 },
  { id: 'mittag', label: 'mittags', target: 'in die Mittagszeit', from: 12, to: 14 },
  { id: 'nachmittag', label: 'nachmittags', target: 'auf den Nachmittag', from: 14, to: 18 },
  { id: 'abend', label: 'abends', target: 'auf den Abend', from: 18, to: 29 },
];

const DISTRACTION_TIPS = {
  handy: 'Leg dein Handy während eines Fokus-Blocks außer Reichweite, am besten in einen anderen Raum, und schalte den iOS-Fokus „Nicht stören“ ein.',
  nachrichten: 'Schließ Mail und Chat während des Blocks komplett. Bündle Nachrichten in 2–3 feste Zeitfenster am Tag, zum Beispiel 11 und 16 Uhr.',
  unterbrechung: 'Mach deine Fokuszeit sichtbar (Kopfhörer, Status, Tür zu) und biete feste Zeiten für Rückfragen an.',
  gedanken: 'Leg einen Zettel neben dich. Schreib abschweifende Gedanken sofort auf und kehr dann zur Aufgabe zurück, denn erledigen kannst du sie später.',
  muede: 'Arbeite in kürzeren Blöcken (25–45 min) mit echten Pausen: aufstehen, Wasser trinken, kurz an die frische Luft.',
  unklar: 'Schreib vor dem Start den ersten konkreten Schritt auf, zum Beispiel „Gliederung mit 5 Punkten“ statt „Präsentation machen“.',
};

const BLOCKER_TIPS = {
  handy: 'Gib dem Handy einen festen Platz außerhalb deines Arbeitsbereichs und lege App-Limits für Social Media fest (Einstellungen › Bildschirmzeit).',
  meetings: 'Blocke dir im Kalender feste Fokuszeiten wie Termine, idealerweise vormittags, und lege Meetings gesammelt auf den Nachmittag.',
  muede: 'Achte auf feste Schlafenszeiten und plane anspruchsvolle Aufgaben in deine wachste Tageszeit. Kurze Pausen alle 60–90 min helfen.',
  unklar: 'Formuliere Prioritäten als konkrete Ergebnisse („Entwurf Kapitel 2 fertig“) und nicht als Themen („Kapitel 2“).',
  zuviel: 'Plane höchstens so viel, wie du an guten Tagen wirklich schaffst. Eine erledigte Priorität schlägt drei angefangene.',
  aufgeschoben: 'Starte mit nur 10 Minuten. Der Anfang ist die größte Hürde, danach läuft es meist von selbst.',
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

function concColor(v) {
  if (!v) return COLOR_OTHER;
  return CONC_RAMP[Math.min(4, Math.max(0, Math.round(v) - 1))];
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

/* =========================================================
   Berechnung
   ========================================================= */

function computeStats(n) {
  const now = new Date();
  const todayStr = ymd(now);
  const dates = [];
  for (let i = n - 1; i >= 0; i--) dates.push(ymd(addDays(now, -i)));
  const inRange = new Set(dates);
  const sessions = state.sessions.filter(s => inRange.has(s.date));

  const days = dates.map(date => {
    const day = state.days[date] || { priorities: [] };
    const ses = sessions.filter(s => s.date === date);
    let prioMin = 0, otherMin = 0;
    for (const s of ses) {
      if (s.priorityId) prioMin += sessionMin(s); else otherMin += sessionMin(s);
    }
    const ev = day.evening;
    return {
      date,
      d: parseYmd(date),
      isToday: date === todayStr,
      prios: day.priorities || [],
      ses,
      prioMin,
      otherMin,
      plannedMin: sum((day.priorities || []).map(p => p.estimateMin || 0)),
      evening: ev && (ev.energy || ev.blocker || ev.note) ? ev : null,
    };
  });

  const dataDays = days.filter(d => d.prios.length || d.ses.length || d.evening).length;
  const activeDays = days.filter(d => d.ses.length).length;

  // Prioritäten: heute zählt noch nicht, der Tag läuft ja noch
  const finishedDayPrios = days.filter(d => !d.isToday).flatMap(d => d.prios);
  const donePrios = finishedDayPrios.filter(p => p.done);

  // Schätzung vs. tatsächlich (nur erledigte Prioritäten mit erfasster Zeit)
  let estSum = 0, actSum = 0, estCount = 0;
  for (const p of days.flatMap(d => d.prios).filter(p => p.done && p.estimateMin)) {
    const act = sum(state.sessions.filter(s => s.priorityId === p.id).map(sessionMin));
    if (act > 0) { estSum += p.estimateMin; actSum += act; estCount++; }
  }

  const totalMin = sum(days.map(d => d.prioMin + d.otherMin));
  const prioMin = sum(days.map(d => d.prioMin));
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

  const evenings = days.map(d => d.evening).filter(Boolean);
  const blockers = BLOCKERS
    .map(b => ({ ...b, count: evenings.filter(e => e.blocker === b.id).length }))
    .sort((a, b) => b.count - a.count);
  const energies = evenings.map(e => e.energy).filter(Boolean);

  return {
    n, days, sessions, dataDays, activeDays,
    prioTotal: finishedDayPrios.length,
    prioDone: donePrios.length,
    completion: finishedDayPrios.length ? donePrios.length / finishedDayPrios.length : null,
    totalMin, prioMin, otherMin: totalMin - prioMin,
    prioShare: totalMin ? prioMin / totalMin : null,
    focusPerActiveDay: activeDays ? totalMin / activeDays : null,
    estSum, actSum, estCount,
    ratio: estCount ? actSum / estSum : null,
    avgRating: avg(ratings),
    ratingCount: ratings.length,
    hours, slots, distractions, blockers, evenings,
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
      text: `Für ${st.estCount} erledigte Prioritäten hast du ${fmtMin(st.actSum)} gebraucht, geschätzt waren ${fmtMin(st.estSum)}. Darum bleibt am Ende des Tages zwangsläufig etwas liegen.`,
      tip: `Rechne beim Planen mit Faktor ${fmtNum(Math.round(st.ratio * 10) / 10)}: Aus „1 h“ werden realistisch ${fmtMin(60 * st.ratio)}. Oder plane lieber 2 statt 3 Prioritäten.`,
    });
  }

  // 2. Wenige Prioritäten erledigt
  if (st.completion !== null && st.prioTotal >= 3 && st.completion < 0.6) {
    out.push({
      score: 50 + (0.6 - st.completion) * 150,
      title: `Nur ${pct(st.completion)} % deiner Prioritäten erledigt`,
      text: `Von ${st.prioTotal} geplanten Prioritäten hast du ${st.prioDone} abgeschlossen. Wer regelmäßig mehr plant, als er schafft, fühlt sich unproduktiv, auch an eigentlich guten Tagen.`,
      tip: 'Plane morgen bewusst nur 1–2 Prioritäten und starte den ersten Fokus-Block mit Priorität Nr. 1, noch bevor du Mails liest.',
    });
  }

  // 3. Fokuszeit geht in Sonstiges
  if (st.prioShare !== null && st.totalMin >= 120 && st.prioShare < 0.5) {
    out.push({
      score: 48 + (0.5 - st.prioShare) * 120,
      title: `Nur ${pct(st.prioShare)} % deiner Fokuszeit gehen in Prioritäten`,
      text: `${fmtMin(st.otherMin)} von ${fmtMin(st.totalMin)} hast du mit „Sonstigem“ verbracht. Das fühlt sich beschäftigt an, bringt dich bei deinen Prioritäten aber nicht weiter.`,
      tip: 'Reserviere den ersten Block des Tages fest für deine wichtigste Priorität. Sonstiges bündelst du danach in einem gemeinsamen Block.',
    });
  }

  // 4. Konzentration hängt stark von der Uhrzeit ab
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
        tip: `Leg anspruchsvolle Prioritäten ${best.target} und verschieb Routine wie Mails und Orga ${worst.target}.`,
      });
    }
  }

  // 5. Eine Ablenkung dominiert
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

  // 6. Ein Bremsklotz dominiert
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

  // 7. Energie im Schnitt niedrig
  if (st.energyCount >= 3 && st.avgEnergy < 3) {
    out.push({
      score: 40 + (3 - st.avgEnergy) * 25,
      title: `Deine Energie ist im Schnitt niedrig (${fmtNum(st.avgEnergy)} von 5)`,
      text: 'Mit wenig Energie fällt Fokus schwer, egal wie gut der Plan ist.',
      tip: 'Plane Pausen wie Termine ein: nach 60–90 min Fokus 10 min weg vom Bildschirm. Und achte auf feste Schlafenszeiten.',
    });
  }

  // 8. Wenig Fokuszeit
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

function chartDaily(st) {
  const W = 340, H = 196, L = 34, R = 6, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const days = st.days, n = days.length;

  const maxMin = Math.max(60, ...days.map(d => Math.max(d.prioMin + d.otherMin, d.plannedMin)));
  const stepH = niceStep(maxMin / 60, 4);
  const topH = Math.ceil(maxMin / 60 / stepH) * stepH;
  const y = m => T + ih - (m / (topH * 60)) * ih;

  let g = '';
  for (let h = 0; h <= topH + 1e-9; h += stepH) {
    const yy = y(h * 60);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
    g += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmtNum(h)} h</text>`;
  }

  const slot = iw / n;
  const bw = Math.max(4, Math.min(24, slot * 0.62));
  const every = n <= 7 ? 1 : n <= 14 ? 2 : 5;
  let bars = '', labels = '', hits = '';

  days.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const base = y(0);
    const yPrio = y(d.prioMin);
    const yTotal = y(d.prioMin + d.otherMin);

    if (d.otherMin > 0 && d.prioMin > 0) {
      bars += `<rect x="${x}" y="${yPrio}" width="${bw}" height="${base - yPrio}" fill="${COLOR_PRIO}"/>`;
      // 2px Abstand zwischen den Segmenten
      bars += `<path d="${barPath(x, yTotal, bw, Math.max(0, yPrio - yTotal - 2))}" fill="${COLOR_OTHER}"/>`;
    } else if (d.prioMin > 0) {
      bars += `<path d="${barPath(x, yPrio, bw, base - yPrio)}" fill="${COLOR_PRIO}"/>`;
    } else if (d.otherMin > 0) {
      bars += `<path d="${barPath(x, yTotal, bw, base - yTotal)}" fill="${COLOR_OTHER}"/>`;
    }

    if (d.plannedMin > 0) {
      const yp = y(d.plannedMin);
      bars += `<line x1="${x - 3}" x2="${x + bw + 3}" y1="${yp}" y2="${yp}" stroke="#F2F3F6" stroke-width="2" stroke-linecap="round"/>`;
    }

    if ((n - 1 - i) % every === 0) {
      const txt = n <= 7 ? weekdayShort(d.d) : `${d.d.getDate()}.`;
      labels += `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle" class="${d.isToday ? 'today' : ''}">${txt}</text>`;
    }

    const total = d.prioMin + d.otherMin;
    const detail = total || d.plannedMin
      ? `<strong>${dayLabelLong(d.d)}</strong>: ${fmtMin(total)} Fokus (${fmtMin(d.prioMin)} Prioritäten, ${fmtMin(d.otherMin)} Sonstiges)` +
        (d.plannedMin ? ` · geplant ${fmtMin(d.plannedMin)}` : '')
      : `<strong>${dayLabelLong(d.d)}</strong>: keine Daten`;
    hits += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" fill="transparent" data-detail="${esc(detail)}"/>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fokuszeit pro Tag">${g}${bars}${labels}${hits}</svg>`;
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
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
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
    if (v > 0) bars += `<path d="${barPath(x, y(v), bw, y(0) - y(v), 3)}" fill="${concColor(conc)}"/>`;
    if (h % 3 === 0) labels += `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${h} Uhr</text>`;
    const detail = v > 0
      ? `<strong>${h}–${h + 1} Uhr</strong>: ${fmtMin(hd.min)} insgesamt (Ø ${fmtMin(v)} pro aktivem Tag)` + (conc ? ` · Ø Konzentration ${fmtNum(conc)}` : '')
      : `<strong>${h}–${h + 1} Uhr</strong>: keine Fokuszeit`;
    hits += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" fill="transparent" data-detail="${esc(detail)}"/>`;
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fokuszeit nach Uhrzeit, eingefärbt nach Konzentration">${g}${bars}${labels}${hits}</svg>`;
}

function chartRanking(items, emptyText) {
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
      <text class="val" x="${W}" y="${yy + 14}" text-anchor="end">${r.count}× · ${pct(r.count / total)} %</text>
      <rect x="0" y="${yy + 22}" width="${W}" height="10" rx="5" fill="${COLOR_GRID}"/>
      <rect x="0" y="${yy + 22}" width="${w}" height="10" rx="5" fill="${i === 0 ? COLOR_PRIO : '#4F5AA6'}"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rangliste">${body}</svg>`;
}

/* =========================================================
   Darstellung
   ========================================================= */

const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function kpiTile(label, value, sub, tone) {
  return `<div class="kpi ${tone || ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function renderKpis(st) {
  const c = st.completion;
  const r = st.ratio;
  const a = st.avgRating;
  return `<div class="kpi-grid">
    ${kpiTile('Prioritäten erledigt',
      c === null ? '–' : `${pct(c)}<small> %</small>`,
      c === null ? 'noch keine abgeschlossenen Tage' : `${st.prioDone} von ${st.prioTotal} (ohne heute)`,
      c === null ? '' : c >= 0.6 ? 'good' : 'warn')}
    ${kpiTile('Fokuszeit pro aktivem Tag',
      st.focusPerActiveDay === null ? '–' : fmtMin(st.focusPerActiveDay).replace(/ (h|min)/g, '<small> $1</small>'),
      `an ${st.activeDays} von ${st.n} Tagen`,
      '')}
    ${kpiTile('Tatsächlich vs. geschätzt',
      r === null ? '–' : `${fmtNum(r)}<small>×</small>`,
      r === null ? 'noch keine erledigte Priorität' : r >= 1.3 ? 'dauert länger als geplant' : r <= 0.8 ? 'schneller als geplant' : 'Schätzung passt gut',
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
      <p class="eyebrow accent">Dein Ansatzpunkt</p>
      <h2>Du bist auf einem guten Weg</h2>
      <p>Plan und Wirklichkeit liegen nah beieinander, keine deutliche Schwachstelle in diesem Zeitraum.</p>
      <div class="tip-box">${BULB}<p>Halte deinen Rhythmus und steigere dich behutsam: Plane deine wichtigste Priorität etwas ambitionierter als bisher.</p></div>
    </section>`;
  }
  return `<section class="card focus-card">
    <p class="eyebrow accent">Dein Ansatzpunkt</p>
    <h2>${esc(top.title)}</h2>
    <p>${esc(top.text)}</p>
    <div class="tip-box">${BULB}<p>${esc(top.tip)}</p></div>
  </section>`;
}

function renderStats() {
  const n = [7, 14, 30].includes(state.meta.statsRange) ? state.meta.statsRange : 7;
  $$('#range-seg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === n)));

  const st = computeStats(n);
  const el = $('#stats-content');

  if (st.dataDays < MIN_DATA_DAYS) {
    const longer = n < 30 && computeStats(30).dataDays >= MIN_DATA_DAYS;
    el.innerHTML = `<section class="card hint-card">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <h2>Noch ein bisschen Geduld</h2>
      <p>In den letzten ${n} Tagen hast du an ${st.dataDays} ${st.dataDays === 1 ? 'Tag' : 'Tagen'} Daten erfasst. Ab ${MIN_DATA_DAYS} Tagen zeige ich dir hier deine Muster und woran du konkret ansetzen kannst.</p>
      <p>${longer ? 'Tipp: Wähle oben einen längeren Zeitraum.' : 'Plane morgens deine Prioritäten, arbeite in Fokus-Blöcken und mach abends den kurzen Check.'}</p>
    </section>`;
    return;
  }

  const insights = buildInsights(st);
  const rest = insights.slice(1);
  const planned = sum(st.days.map(d => d.plannedMin));

  el.innerHTML = `
    ${renderFocusCard(insights[0])}
    ${renderKpis(st)}

    <section class="card">
      <div class="card-head"><h2>Fokuszeit pro Tag</h2></div>
      <p class="card-sub">${fmtMin(st.totalMin)} Fokus${planned ? ` bei ${fmtMin(planned)} geplant` : ''}${st.prioShare !== null ? ` · ${pct(st.prioShare)} % in Prioritäten` : ''}</p>
      ${chartDaily(st)}
      <div class="legend">
        <span><i style="background:${COLOR_PRIO}"></i>Prioritäten</span>
        <span><i style="background:${COLOR_OTHER}"></i>Sonstiges</span>
        <span><i class="line"></i>Geplant</span>
      </div>
      <p class="chart-detail" data-default="Tippe auf einen Tag für Details.">Tippe auf einen Tag für Details.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Fokuszeit nach Uhrzeit</h2></div>
      <p class="card-sub">Ø Minuten pro aktivem Tag, Farbe zeigt die Konzentration</p>
      ${chartHours(st)}
      <div class="legend">
        <span>Konzentration 1 <span style="display:inline-flex;gap:2px">${CONC_RAMP.map(c => `<i style="background:${c}"></i>`).join('')}</span> 5</span>
      </div>
      <p class="chart-detail" data-default="Tippe auf eine Stunde für Details.">Tippe auf eine Stunde für Details.</p>
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
    state.meta.statsRange = Number(btn.dataset.range);
    saveState();
    renderStats();
  });

  // Tippen auf Balken → Details unter dem Diagramm
  $('#stats-content').addEventListener('click', e => {
    const hit = e.target.closest('.hit');
    if (!hit) return;
    const card = hit.closest('.card');
    $$('.hit.sel', card).forEach(h => h.classList.remove('sel'));
    hit.classList.add('sel');
    const detail = $('.chart-detail', card);
    if (detail) detail.innerHTML = hit.dataset.detail;
  });
});
