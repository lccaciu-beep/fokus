# Fokus – Anleitung

Die App: **https://lccaciu-beep.github.io/fokus/**

## Auf dem iPhone installieren

1. Öffne den Link oben in **Safari** (nicht Chrome).
2. Tippe unten auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben).
3. Scrolle nach unten und tippe auf **„Zum Home-Bildschirm“**.
4. Tippe oben rechts auf **„Hinzufügen“**.
5. Starte die App ab jetzt über das neue Icon auf deinem Home-Bildschirm.

## Beispieldaten löschen

Tab **Auswertung** › ganz nach unten scrollen › auf die drei Punkte **···** tippen › **„Beispieldaten löschen“**.
Deine eigenen Einträge bleiben dabei erhalten.

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
