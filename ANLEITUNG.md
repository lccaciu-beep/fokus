# Fokus – Anleitung

Die App: **https://lccaciu-beep.github.io/fokus/**

## Auf dem iPhone installieren

1. Öffne den Link oben in **Safari** (nicht Chrome).
2. Tippe unten auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
3. Scrolle nach unten und tippe auf **„Zum Home-Bildschirm“**.
4. Tippe oben rechts auf **„Hinzufügen“**.
5. Starte die App ab jetzt über das neue Icon auf deinem Home-Bildschirm.

## So funktioniert die App

- **To-do-Liste:** Aufgaben mit Priorität (Hoch, Mittel, Niedrig), Bereich (Studium, TikTok Shop, Privat), optionaler Dauer, Fälligkeitsdatum und Wiederholung (täglich, werktags, wöchentlich). Offene Aufgaben bleiben stehen, bis du sie abhakst. Mit **▶** startest du den Timer direkt für eine Aufgabe.
- **Planen:** Oben in der To-do-Liste auf **„Morgen“** tippen (oder im Abend-Check auf **„Morgen planen“**) und die Liste für morgen vorbereiten. Die Aufgaben erscheinen am nächsten Tag automatisch. Über **„Wann?“ › „Datum …“** lassen sich Aufgaben auch für spätere Tage planen.
- **Teilschritte:** Aufgabe antippen › „Teilschritte“. In der Liste steht dann der nächste Schritt.
- **Zielzeit:** Vor dem Start „Offen“, 25, 45, 60 oder 90 min wählen. Das Zifferblatt zeigt, wann das Ziel erreicht ist.
- **Bereiche:** Unter Auswertung › Bereiche umbenennen, Farbe wechseln, neue anlegen (bis zu 6). Ab 4 Aufgaben lässt sich die Liste nach Bereich filtern.
- **Wochenrückblick:** erscheint sonntags und montags auf „Heute“, jederzeit unter Auswertung › Wochenziele.
- **Wochenziele:** Stunden pro Bereich unter „Diese Woche“ festlegen. Das Zifferblatt zeigt deinen Wochenfortschritt.
- **Fokus-Timer:** läuft weiter, auch wenn das Handy gesperrt ist. Ablenkungen per Tipp zählen, am Ende die Konzentration bewerten.
- **Abend-Check:** Energie, größter Bremsklotz und eine Notiz. Wird automatisch gespeichert.
- **Auswertung:** 7, 30 oder 90 Tage, oder über **Kalender** einen einzelnen Tag (ein Tipp) bzw. einen beliebigen Zeitraum (zwei Tipps).

## Daten sichern

Tab **Auswertung** › **„Daten exportieren“** › **„In Dateien sichern“** (zum Beispiel in iCloud Drive).
Wiederherstellen: **„Daten wiederherstellen“** und die gesicherte Datei auswählen.

Wichtig: Die Daten liegen nur auf dem iPhone. Wenn du die App vom Home-Bildschirm löschst, sind auch die Daten weg. Sichere sie deshalb ab und zu.

## Änderungen veröffentlichen

1. Dateien im Ordner ändern (oder Claude ändern lassen).
2. In `sw.js` die Versionsnummer erhöhen, zum Beispiel `fokus-v1` → `fokus-v2`.
   Optional auch `APP_VERSION` in `app.js` anpassen, sie steht unten in der Auswertung.
3. Im Terminal im Projektordner:

   ```bash
   git add -A
   git commit -m "Beschreibung der Änderung"
   git push
   ```

4. Nach 1–2 Minuten ist die neue Version online. Auf dem iPhone die App einmal ganz schließen
   (vom unteren Rand hochwischen und die App wegwischen) und neu öffnen.
