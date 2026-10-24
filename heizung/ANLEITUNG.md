# Heizungs-Dashboard — Anleitung

Ein Arbeits-Dashboard, das jede Heizungserneuerung von der ersten Anfrage bis zum Archiv
durch **11 Level** führt. Jedes Level besteht aus konkreten Schritten:
Formulare ausfüllen, Dateien ablegen, Termine setzen, Mails senden,
Entscheidungen treffen. **Das nächste Level wird erst freigeschaltet, wenn alle
Pflichtschritte erledigt sind.** Formulare, Fotos, Pläne und Kunden-Uploads
liegen direkt im Projekt — kein Netzlaufwerk, keine Ordner zum Verschieben.

## Starten

`index.html` öffnen (Chrome oder Edge empfohlen).

- **Lokal** (Standard): alles liegt in diesem Browser. Zum Ausprobieren.
- **Cloud**: Team-Login, alle Arbeitsplätze sehen dasselbe, Kunden laden über ihren
  Link von überall hoch. Einrichtung: `supabase/ANLEITUNG-CLOUD.md`.

## Ebenen: wer sieht was

| Ebene | Sieht | Darf |
| --- | --- | --- |
| **Geschäftsführung** | alles, plus Team-Auslastung im Cockpit | alles, inkl. Einrichtung (Firma, Team, Partner, Rechte), interne Freigaben, Projekte löschen |
| **Planung / Bearbeitung** | alle Projekte; im Cockpit wahlweise nur die eigenen | Anfragen anlegen, Schritte erledigen, Level freischalten, Mails & Kundenlinks, Monteure/Partner zuweisen |
| **Monteur** | „Meine Baustellen“ – nur zugewiesene Projekte und darin nur die **freigegebenen Ordner** | Besichtigung, Tankdemontage, Gasprüfung, Restarbeiten, Einweisung (mit Unterschrift), Fotos |
| **Externer Partner** | „Meine Einsätze“ – Adresse, Termine, die Formulare seines Gewerks und die **freigegebenen Ordner** | Fotos hochladen, „Gewerk erledigt“ oder Hinweis ans Büro melden |

- Wer was erledigen darf, steht an jedem Schritt in `einstellungen/ablauf.js` (`ebene: [...]`).
  Schritte anderer Ebenen sind sichtbar, aber gesperrt („Erledigt: Planung / Bearbeitung“).
- Monteure und Partner werden im Projekt zugewiesen: Level 08 „Monteure & Partner zuweisen“ oder jederzeit im Reiter **Team** der Akte. Je Person lässt sich per Klick
  festlegen, welche Ordner sie sieht (Standard Monteur: alles außer Angebote, Auftrag, Rechnungen;
  Standard Partner: Skizzen, Planung, Baustelle, Auswahl). Dort erscheinen auch die Rückmeldungen.
  Die Monteurmappe entfällt dadurch. (Seit 11.10.2026 gelten die Ordner fest je Rolle bzw. je
  Partner-Gewerk unter Konten → „Ordner & Bilder“ – im Projekt wird nur noch zugewiesen.)
- Wird in der **Baustellenbesichtigung** bei „Fremdgewerke – wer?“ ein Partner gewählt (Elektro,
  Tankreinigung, Gerüstbau, Kaminbau), bekommt er automatisch Zugriff aufs Projekt. Der
  **Baustellenplan** übernimmt Gewerk und Firma als Subunternehmer-Zeilen.
- **Partner-Adressbuch** (Menü links): Firma, Gewerk, Ansprechpartner, Adresse, Telefon, Mobil,
  E-Mail, Notiz. Alle im Büro lesen, die Geschäftsführung pflegt. Zugänge stehen unter Konten.
- **Projekte löschen** darf nur die Geschäftsführung. Gelöschte Projekte liegen 30 Tage im
  **Papierkorb** (Projekte → Papierkorb) und lassen sich wiederherstellen.
- Welche Formulare ein Partner sieht, hängt an seinem Gewerk (`gewerke` in `firma.js`).
- **Konten → Wer sieht was:** Level 1–11, jedes ausklappbar bis auf die einzelnen Schritte.
  Pro Schritt per Haken festlegen, ob Planung, Monteur und Partner ihn **sehen** (inkl. Formular
  und Dateien). Der Haken am Level setzt alle Schritte darin auf einmal („–“ = nur teilweise).
  Erledigen darf, wer den Schritt sieht und im Ablauf dafür zuständig ist. Die Geschäftsführung
  sieht immer alles. Bei Partnern gilt: freigegebene Formulare des eigenen Gewerks (plus
  gewerkübergreifende wie die Baustellenbesichtigung). „Standard wiederherstellen“ setzt alles zurück.
- **Konten → Ordner & Bilder:** pro Projektordner (Bilder Bestand, Heizlast & Schema, Baustellenfotos,
  Bilder neuer Heizraum, Angebote, Rechnungen …) per Haken festlegen, auf welche Ordner Planung, Monteur und Partner
  zugreifen. Gilt für alle Projekte. Im Projekt (Reiter „Team“) kann das Büro einzelnen Monteuren
  und Partnern davon abweichend Ordner freigeben oder entziehen. Im Cloud-Betrieb setzt die
  Datenbank das durch.

## Konten & Anmeldung

Jede Person hat ein eigenes Konto (Benutzername + Passwort) und sieht nach der
Anmeldung nur, was ihre Ebene erlaubt. Ohne Anmeldung ist nichts zu sehen.

1. **Geschäftsführung** öffnet **Konten**: dort stehen alle Mitarbeiter und Partner mit
   Ebene und Zugangsstatus. Neue Person anlegen → **Änderungen übernehmen** →
   **Zugang anlegen**. Das Dashboard schlägt Benutzername und Startpasswort vor und zeigt
   beides einmal an (Knopf „Zugangsdaten kopieren“).
2. Die Person meldet sich an und muss beim ersten Mal **ein eigenes Passwort** festlegen.
3. Passwort vergessen → Geschäftsführung: **Passwort zurücksetzen** (neues Startpasswort).
   Jemand verlässt die Firma → **Sperren**.
4. Jeder kann sein Passwort jederzeit links unten unter **Passwort ändern** wechseln.

Im **Demo-Modus** (ohne Cloud) liegen die Konten nur im eigenen Browser – zum Ausprobieren.
Der Vorschau-Link mit `?demo=1` legt Demo-Zugänge an (Passwort `demo1234`), die das
Anmeldefenster zum Anklicken anbietet. Ohne `?demo=1` beginnt das Dashboard mit der
**Ersteinrichtung** des Geschäftsführer-Zugangs.

## Bereiche

| Bereich | Wofür |
| --- | --- |
| **Cockpit** | Zahlen je Abschnitt, was **fällig** ist (Nachfassen, Erinnerungen), was **als Nächstes** zu tun ist (je Projekt der nächste offene Schritt), **Neu vom Kunden** und Termine der nächsten 14 Tage. |
| **Projekte** | Alle Heizungen nach Abschnitt, mit Suche und Filtern. |
| **Projekt** | Die Spielfläche: oben die Level-Karte, links die Schritte des aktuellen Levels, rechts die Akte (Dateien-Ordner, Kunde, Termine, Verlauf). |
| **Unternehmen** | (nur Geschäftsführung) Ordner wie am iPhone: Finanzen, Vertrieb, Zeit & Ablauf, Kapazität & Team, Nachkalkulation. Darin: Jahresziel, Umsatz, Deckungsbeitrag, Quote, Dauer, Auftragsbestand, offene Forderungen, Kapazität der nächsten 8 Wochen, Vertriebstrichter — jeweils mit Vergleich zum Vorzeitraum. Euro-Beträge pro Projekt unter Akte → Zahlen. |
| **Konten** | (nur Geschäftsführung) Mitarbeiter und Partner, Ebenen, Zugänge anlegen/zurücksetzen/sperren, Tabelle „Wer sieht was“. |
| **Einrichtung** | (nur Geschäftsführung) Firma, Farben, Ziele, Programme, Fristen, Cloud, Sicherung. |
| **Meine Baustellen / Meine Einsätze** | Startseite für Monteure bzw. externe Partner. |

**+ Neue Anfrage** (links oben) legt ein Projekt an und öffnet direkt die Bestandsaufnahme.

## Die 11 Level

| Level | Was dort passiert |
| --- | --- |
| 01 Kundenanfrage | Bestandsaufnahme Heizung (Telefon), Entscheidung „Erstgespräch ja / Heizungsrechner / nein“, Termin |
| 02 Terminbestätigung | Kunde in KWP, Heizungsexperte festlegen, Terminbestätigung mit Fotoanleitung + Upload-Link, Fotos vom Kunden (Cockpit erinnert 4 Tage vorher) |
| 03 Musterangebot erstellen | Projekt in KWP, Projektnummer, Musterangebot anpassen, Angebot als PDF |
| 04 Erstgespräch | Formular Erstgespräch (neue Heizung, VL/RL, Pauschale 250 €), GEG-Beratung mit Unterschrift (nur Gas/Öl/Festbrennstoff), Ergebnis + Angebotsverfolgung, unterschriebenes Angebot, Termin Heizlast & Besichtigung |
| 05 Baustellenbesichtigung | Zugang/Maße/Kamin, weitere Angaben, Fremdgewerke mit „Wer?“, ggf. Checkliste Tankdemontage, Heizlastberechnung, Übergabe Projektleiter → Baustellenleiter |
| 06 Förderung | KfW ja/nein, BZA erstellen, BZA-Nummer per Mail an den Kunden, Zusage/Absage |
| 07 Materialbestellung | Bestellungen in KWP anlegen, abgleichen, versenden |
| 08 Baustelle planen | Baustart + Mail, TAF an den Bezirksschornsteinfeger (≥ 10 Tage vorher, nicht bei reiner Wärmepumpe), Baustellenplan, Abschlag, Schema für Monteure, Team |
| 09 Ausführung | Kundenerinnerung, Wartungsanlage in KWP, Baustellenfotos, Gas-Prüfprotokoll (TRGI, nur Gas), Restarbeiten-Protokoll |
| 10 Abnahme & Übergabe | Termin Einweisung, Übergabeprotokoll mit Unterschrift, Bilder neuer Heizraum, Interview |
| 11 Abschluss | Schlussrechnung + Bewertungs-Mail, Zahlungseingang, BZD-Nummer an den Kunden (bei Förderung), EWärmeG-Erklärung (optional) — dann archivieren |

Was in **KWP** passiert, wird im Dashboard mit „Als erledigt bestätigen“ quittiert — mit
Datum und Namen. Die Original-Papiervorlagen (TAF, GEG-Infoblatt, EWärmeG, Gasprüfung …)
hängen an den passenden Schritten zum Herunterladen.

## Formulare

Alle Papierformulare gibt es digital: Felder, Auswahl-Chips, Tabellen, Checklisten,
Foto-Upload direkt im Formular und **Unterschrift per Finger/Stift auf dem Tablet**.
Pflichtfelder sind mit • markiert; der Zähler oben zeigt, was noch fehlt.
Gespeichert wird automatisch. **Drucken / PDF** erzeugt eine A4-Fassung im Firmenbriefkopf.

**Signatur:** Unter jede Mail setzt das Dashboard die Signatur der angemeldeten Person
(Name, Funktion, Telefon, E-Mail aus **Konten**).

**Ziele & Kalkulation** (Umsatzziel, Kostensatz je Stunde) stehen jetzt unter
**Unternehmen → Ziele & Kalkulation**, nicht mehr in der Einrichtung.

**Ordner auf dem NAS:** `werkzeuge/ordner-sync/` spiegelt alle Projektordner als echte
Ordner, siehe die README dort.

## Mehrere Personen gleichzeitig (Schreibschutz)

Öffnet jemand ein Projekt, ist es für diese Person reserviert. Alle anderen sehen
„**Schreibgeschützt** – André Winterfeld bearbeitet dieses Projekt seit 10:42 Uhr“ und können
nur mitlesen; Änderungen erscheinen laufend. Verlässt die Person das Projekt (oder schließt
den Browser), wird es nach spätestens 90 Sekunden frei. Die Geschäftsführung kann die
Bearbeitung übernehmen.

## Arbeitszeit

Oben im Projekt **Arbeitszeit starten** – mit Pause, Fortsetzen und Beenden (optional mit
Tätigkeit). Ist man länger als 10 Minuten nicht aktiv (einstellbar in `firma.js`,
`arbeitszeit`), pausiert der Timer **rückwirkend ab der letzten Aktivität** – auch wenn der
Browser zwischendurch zu war. Beim Zurückkommen: weiter stempeln, Pause verwerfen
(„habe weitergearbeitet“, z. B. in KWP) oder beenden. Alle Einträge stehen im Akte-Reiter
**Zeiten** und fließen in die Nachkalkulation.

## Nachkalkulation (Geschäftsführung)

Im Projekt unter Akte → **Nachkalkulation** → „Nachkalkulation öffnen“: Erlöse, Stunden
eigener Mitarbeiter (aus dem Timer + Zusatzstunden × Kostensatz), Zeiten und Kosten
externer Partner, Material (kalkuliert/tatsächlich), sonstige Kosten, Dauer. Ergebnis:
Deckungsbeitrag, Marge, DB pro Stunde. Alle Nachkalkulationen sammelt
**Unternehmen → Nachkalkulation**. Den Standard-Kostensatz setzt die Einrichtung.

## Outlook

- **In Outlook öffnen** (im Mail-Fenster) erzeugt einen fertigen Entwurf inkl. Anhängen
  (Fotoanleitung, neueste Rechnung). Datei öffnen → Outlook zeigt die Mail
  zum Prüfen und Absenden.
- **📅 In Outlook-Kalender** neben jedem Termin erzeugt einen Kalendereintrag mit Ort
  (Ausstellung bzw. Kundenadresse) und Telefonnummer.

## Kundenlink

Jedes Projekt hat einen persönlichen Link (`Kundenlink` oben im Projekt). Er steckt
automatisch in der Terminbestätigung. Der Kunde sieht nur
seine Begrüßung und die passenden Upload-Felder (z. B. „Fotos Ihrer jetzigen
Heizung“, „Grundriss & Unterlagen“, später „Unterschriebenes Angebot“) —
keine Projektdaten. Hochgeladenes landet sofort im richtigen Ordner und erscheint im
Cockpit unter **Neu vom Kunden**. Fotos werden dabei automatisch verkleinert.

## Auf eine andere Firma übertragen

1. Ordner kopieren, `index.html` öffnen → Geschäftsführer-Zugang anlegen →
   **Einrichtung**: Firma, Farben, Ziele, Programme, Fristen → **Übernehmen**;
   **Konten**: Team (Rollen, Kürzel, Ebene) und externe Partner eintragen, Zugänge vergeben.
2. **firma.js herunterladen** und `einstellungen/firma.js` damit ersetzen.
3. Logo als `app/img/logo.svg` (oder anderer Pfad in der Einrichtung).
4. Cloud einrichten: `supabase/ANLEITUNG-CLOUD.md`.
5. Anpassen ohne Programmierkenntnisse, jeweils mit Kommentaren in der Datei:
   - `einstellungen/ablauf.js` — Level, Schritte, Projektordner, was der Kunde hochladen darf
   - `einstellungen/formulare.js` — alle Formulare und ihre Felder
   - `einstellungen/mailvorlagen.js` — Mailtexte mit Platzhaltern

Im Ablauf stehen keine festen Namen, sondern Rollen wie `{heizungsexperte}`,
`{projektleiter}`, `{baustellenleiter}` und Programme wie `{programm.erp}`.

## Ordner

```
Dashboard/
├── index.html              ← Dashboard fürs Team
├── kunde.html              ← Upload-Seite für Kunden (öffentlich erreichbar machen)
├── einstellungen/          ← firma.js, ablauf.js, formulare.js, mailvorlagen.js
├── vorlagen/               ← Original-Papiervorlagen (Bestandsaufnahme, TAF, GEG, EWärmeG, Gasprüfung …)
├── supabase/               ← schema.sql + ANLEITUNG-CLOUD.md
└── app/                    ← Programm, Schriften, Logo
```

Die Unterlagen von Daniel Brüll liegen unverändert in `../ablauf-vater/`.

## Subunternehmer anfragen (Level 08)

Der **Baustellenplan** legt für jedes Fremdgewerk aus der Baustellenbesichtigung eine Zeile an
(Elektro, Tankreinigung, Gerüstbau, Kaminbau).
Die Firma wird aus dem **Adressbuch** gewählt; die Wahl geht zurück in die Baustellenbesichtigung,
der Partner bekommt Zugriff aufs Projekt.

**Anfrage ✉** in jeder Zeile öffnet eine fertige Mail an den Partner (E-Mail aus dem Adressbuch):
Baustelle, Baustart, geplanter Einsatz, Maße aus der Baustellenbesichtigung (Heizraum, Türen,
Kamin) und – bei der Tankreinigung – die Checkliste Tankdemontage. Als Anhang kommen alle Dateien aus den Ordnern, die für das
Gewerk freigegeben sind (Konten → „Ordner & Bilder“) – einzeln abwählbar. „In Outlook öffnen“
erzeugt den Entwurf mit Anhängen, „Als angefragt markieren“ vermerkt das Datum in der Zeile.
Den Mailtext ändert man in `einstellungen/mailvorlagen.js` (`sub-anfrage`).
