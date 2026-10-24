# Brüll Dashboard (Gesamt)

Ein Dashboard, eine Adresse, eine Anmeldung – mit den Bereichen **Bad** und **Heizung**.
Oben in der linken Leiste wird zwischen den Bereichen umgeschaltet. Jeder Bereich sieht und
funktioniert genau wie sein Einzel-Dashboard.

```
Dashboard Gesamt/
├── index.html          → öffnet den zuletzt genutzten Bereich
├── bad/                → Kopie von „Bad Dashboard/Dashboard“
├── heizung/            → Kopie von „Heizung Dashboard/Dashboard“
├── gesamt/             → Bereichs-Umschalter (bereiche.js / bereiche.css)
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
2. **Bereichs-Umschalter** in der Leiste.

## Noch offen für das spätere Haupt-Dashboard
- Gemeinsames Cockpit über beide Bereiche (Fälliges, Termine, Team-Auslastung)
- Gemeinsame Konten-, Adressbuch- und Einrichtungsseite (heute je Bereich)
- Rechte je Person und Bereich (wer arbeitet nur im Bad, wer nur in der Heizung)
- Cloud-Betrieb auf dem Mac mini: eine Datenbank mit getrennten Tabellen je Bereich
