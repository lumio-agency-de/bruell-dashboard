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
├── betrieb/           → Betriebsmonitor (nur Geschäftsführung)
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

## Personal (nur Geschäftsführung)

`personal/` – Mitarbeiter-Übersicht und Personalkarte (`karte.html?nr=<Pers.-Nr.>`) mit den Funktionen der
bisherigen Personalkarten: Pers. Daten, Gleitzeit, Urlaub, Bewertung, Sonstiges, Arbeitskleidung, Werkzeug,
Fahrzeug. Gleiches Speicherformat (`pk_<Nr>`, Foto `ph_<Nr>`, Abgleich mit Fahrzeugkarten `fz_…`).

- **Echte Personaldaten gehören nie ins Repo** (öffentlich!). Der Ordner `Personalkarten/` ist in `.gitignore`.
- `karte.html` ist eine leere Vorlage, erzeugt mit `werkzeuge/personalkarte_vorlage.py` aus einer alten Karte
  (alle Werte, Namen und Fotos werden entfernt).
- Echte Daten: in der Mitarbeiter-Übersicht „Alte Personalkarten importieren“ und die HTML-Dateien wählen –
  sie werden nur im Browser gelesen (im Betrieb: Datenbank auf dem Mac mini). Der Import repariert dabei zwei
  Fehler der alten Dateien (Zeilenumbruch in einer Meldung, doppelte Zeile bei „Kleidung“), durch die dort
  Speichern und Reiter nicht funktionierten.
- Demo (`?demo=1`): vier erfundene Mitarbeiter.

## Verschlüsselte Daten für die Online-Version (Fahrzeuge + Mitarbeiterfotos)

- `personal/daten-tresor.js` enthält Fahrzeugdaten (`FZ_VOLL`) und Mitarbeiterfotos (`PK_FOTOS`) **AES-256-GCM-verschlüsselt**
  (Schlüssel per PBKDF2-SHA256, 310 000 Runden, aus dem Datenpasswort). Ohne Passwort ist die Datei wertlos.
- Erzeugen/aktualisieren: `node werkzeuge/tresor.js` (Passwort aus `werkzeuge/tresor-passwort.txt`, nur lokal, `.gitignore`).
  Passwort ändern: `node werkzeuge/tresor.js "<neues Passwort>"`. Nach jeder Änderung an `daten-lokal.js`/`fotos-lokal.js` neu ausführen.
- Im Browser (`gesamt/tresor.js`): Auf Personal/Fahrzeuge erscheint „Entsperren“. Entschlüsselt wird nur im Browser,
  gemerkt für die Sitzung oder auf Wunsch auf dem Gerät. Lokal mit `daten-lokal.js` passiert nichts.
- Die vollständigen Personaldaten (`PK_VOLL`: Bank, Steuer, Geburtsdaten …) sind **nicht** im Tresor.

## Handy & iPad

`gesamt/mobil.css` (in allen Seiten und beim Zusammenbau in Bad/Heizung eingebunden): auf dem Handy Hauptbereiche als
Tab-Leiste unten, oben Logo + Bereichs-Menü + Abmelden; iPad hochkant mit schmalerer Seitenleiste.

## Fahrzeuge: DKV-Rechnungen automatisch auslesen

`werkzeuge/dkv-eingang.js` überwacht den Ordner `DKV-Eingang/` (nur lokal, `.gitignore`) und prüft ihn alle 10 Sekunden.
Liegt dort eine DKV-Rechnung (PDF) oder ein DKV-Export (CSV), wird sie ausgelesen:

- **Tankvorgänge je Fahrzeug** (Zuordnung über Kennzeichen, sonst DKV-Karten-Nr. der Fahrzeugkarte): Fuhrpark-Liste zeigt
  „⛽ Oktober 2026: 4× getankt · 312 €“, die Fahrzeugkarte Monate und alle Buchungen. AdBlue, Wäsche usw. zählen nur im Betrag.
- **Kilometerstand**: der höchste plausible Wert (nie kleiner als bisher, kein Sprung über 50 000 km) wird `fz_km`.
- Nicht zuordenbare Buchungen erscheinen oben in der Fuhrpark-Liste. Doppelte Rechnungen werden erkannt.
- Danach liegt die Datei in `DKV-Eingang/verarbeitet/`, bei Fehlern in `DKV-Eingang/fehler/` (mit Begründung). Protokoll: `DKV-Eingang/protokoll.txt`.
- Speicher heute: `personal/daten-lokal.js` (`FZ_TANKEN`, `FZ_TANKEN_OFFEN`) + Tresor wird erneuert. Auf dem Mac mini: Datenbank, als eigener Container.

```
node werkzeuge/dkv-eingang.js            # läuft dauerhaft
node werkzeuge/dkv-eingang.js --einmal   # einmal verarbeiten
node werkzeuge/dkv-lesen.js <Datei>      # nur anzeigen, was erkannt wird (Test)
```

PDF-Auslesen braucht `pdftotext` (Poppler, `brew install poppler`). Fahrzeuge, die nicht mehr im Bestand sind, blendet das
Auge oben rechts auf der Fahrzeugkarte aus (`fz_ausgeblendet`); sie erscheinen dann eingeklappt am Ende und nicht mehr im TÜV-Kalender.

## Betriebsmonitor (nur Geschäftsführung)

`betrieb/` – alle Kennzahlen auf einen Blick (Wunsch vom 27.10.2026, angelehnt an den „BetriebsMonitor“ des handwerk magazins).
Logik in `gesamt/betrieb.js`, Demo mit `?demo=1` (frei erfundener Betrieb, eigener Speicher `bm-demo:`).

- **Cockpit:** Zielstundensatz, Umsatz/Ergebnis/Rohertrag gegen Plan, Ist-Stundensatz, Auslastung, Auftragsbestand
  und offene Angebote (Auszug aus Bad/Heizung), Hinweise mit Ampel.
- **Stundensatz:** Mitarbeiter aus Personal (produktiver Anteil, Bruttolohn, Ein-/Austritt anteilig), Gemeinkosten,
  Fahrzeugkosten aus dem Fuhrpark (Leasing, Versicherung, Steuer, DKV-Tanken), Materialaufschlag, Gewinnziel → Zielstundensatz.
- **Jahresplanung:** aus dem Stundensatz nach Werktagen verteilt; Werte von Hand überschreiben die Vorbelegung.
- **Soll-Ist:** DATEV-CSV importieren – BWA (Kurzfristige Erfolgsrechnung, Zeilen nach Bezeichnung) oder
  Summen- und Saldenliste (Konten SKR 03/04). Vorschau vor dem Übernehmen, Monat wird aus der Spalte erkannt.

Daten: Browser (`bm:<Jahr>`), später Datenbank auf dem Mac mini. Für die Online-Version: „⬇ Sichern“ lädt
`daten-lokal.js` herunter → nach `betrieb/` legen (`.gitignore`) → `node werkzeuge/tresor.js` verschlüsselt es mit in
`personal/daten-tresor.js`. Echte Zahlen nie unverschlüsselt ins Repo.
