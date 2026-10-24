# Brüll Dashboard (Gesamt)

Eine Software, eine Adresse, eine Anmeldung. Start ist die **Übersicht** (index.html):
Begrüßung mit Namen, Datum, Uhrzeit, Wetter (Aidlingen-Dachtel, Open-Meteo) und Widgets –
Bad, Heizung (Fälliges + Als Nächstes), Kalender, E-Mail, Baustellen, Neu vom Kunden,
Kennzahlen und Personal. Welche Widgets jemand sieht, legt die Geschäftsführung unten unter
„Übersicht anpassen“ fest (Standard je Rolle). Über die Leiste geht es in die Bereiche **Bad**
und **Heizung** – sie sehen und funktionieren genau wie die Einzel-Dashboards.

Die Widgets holen ihre Daten über einen „Auszug“ der Bereiche (`bad/?auszug=1`,
`heizung/?auszug=1`): jeder Bereich rechnet mit seiner eigenen Logik und meldet das Ergebnis.

```
Dashboard Gesamt/
├── index.html          → Übersicht (Startseite)
├── bad/                → Kopie von „Bad Dashboard/Dashboard“
├── heizung/            → Kopie von „Heizung Dashboard/Dashboard“
├── gesamt/             → Übersicht (uebersicht.js/.css) + Leisten-Navigation der Bereiche (bereiche.js/.css)
└── werkzeuge/zusammenbauen.sh
```

## So bleibt alles aktuell

Gepflegt wird weiter in den **Einzel-Dashboards**. Danach hier neu zusammenbauen:

```
./werkzeuge/zusammenbauen.sh
```

Das Skript kopiert beide Einzelversionen und ändert in den Kopien nur zwei Dinge:
1. **Eine Anmeldung für beide Bereiche** – Konten und Sitzung liegen gemeinsam (`bruell:konten`,
   `bruell:sitzung`). Projekte, Dateien und Einstellungen bleiben je Bereich getrennt.
2. **Navigation** Übersicht · Bad · Heizung in der Leiste und Rücksprung zur Übersicht nach dem Anmelden.

## Noch offen für das spätere Haupt-Dashboard
- Outlook-Kalender und Posteingang in den Widgets (Microsoft-365-Anbindung)
- Widget-Einstellungen in der Datenbank statt im Browser
- Gemeinsame Konten-, Adressbuch- und Einrichtungsseite (heute je Bereich)
- Rechte je Person und Bereich (wer arbeitet nur im Bad, wer nur in der Heizung)
- Cloud-Betrieb auf dem Mac mini: eine Datenbank mit getrennten Tabellen je Bereich
