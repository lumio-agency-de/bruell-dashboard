# Bad-Dashboard — Anleitung

Ein Arbeits-Dashboard, das jeden Badbau von der ersten Anfrage bis zum Archiv
durch **14 Level** führt. Jedes Level besteht aus konkreten Schritten:
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
| **Monteur** | „Meine Baustellen“ – nur zugewiesene Projekte und darin nur die **freigegebenen Ordner** | Besichtigung, Restarbeiten, Abnahmeprotokoll (mit Unterschrift), Fotos, 3D-Planung in PaletteMove öffnen |
| **Externer Partner** | „Meine Einsätze“ – Adresse, Termine, die Formulare seines Gewerks und die **freigegebenen Ordner** | Fotos hochladen, „Gewerk erledigt“ oder Hinweis ans Büro melden |

- Wer was erledigen darf, steht an jedem Schritt in `einstellungen/ablauf.js` (`ebene: [...]`).
  Schritte anderer Ebenen sind sichtbar, aber gesperrt („Erledigt: Planung / Bearbeitung“).
- Monteure und Partner werden im Projekt zugewiesen: Level 11 „Monteure & Partner zuweisen –
  Ordner freigeben“ oder jederzeit im Reiter **Team** der Akte. Je Person lässt sich per Klick
  festlegen, welche Ordner sie sieht (Standard Monteur: alles außer Angebote, Auftrag, Rechnungen;
  Standard Partner: Skizzen, Planung, Baustelle, Auswahl). Dort erscheinen auch die Rückmeldungen.
  Die Monteurmappe entfällt dadurch. (Seit 11.10.2026 gelten die Ordner fest je Rolle bzw. je
  Partner-Gewerk unter Konten → „Ordner & Bilder“ – im Projekt wird nur noch zugewiesen.)
- Wird in der **Projekt-Übersicht** bei „Wer?“ ein Partner gewählt (Abriss, Elektro, Fliesen,
  Fenster, Tür), bekommt er automatisch Zugriff aufs Projekt. Der **Baustellenplan** übernimmt
  Gewerk und Firma als Subunternehmer-Zeilen, die Gewerke-Formulare zeigen die Firma zentral an.
- **Partner-Adressbuch** (Menü links): Firma, Gewerk, Ansprechpartner, Adresse, Telefon, Mobil,
  E-Mail, Notiz. Alle im Büro lesen, die Geschäftsführung pflegt. Zugänge stehen unter Konten.
- **Projekte löschen** darf nur die Geschäftsführung. Gelöschte Projekte liegen 30 Tage im
  **Papierkorb** (Projekte → Papierkorb) und lassen sich wiederherstellen.
- Welche Formulare ein Partner sieht, hängt an seinem Gewerk (`gewerke` in `firma.js`).
- **Konten → Wer sieht was:** Level 1–14, jedes ausklappbar bis auf die einzelnen Schritte.
  Pro Schritt per Haken festlegen, ob Planung, Monteur und Partner ihn **sehen** (inkl. Formular
  und Dateien). Der Haken am Level setzt alle Schritte darin auf einmal („–“ = nur teilweise).
  Erledigen darf, wer den Schritt sieht und im Ablauf dafür zuständig ist. Die Geschäftsführung
  sieht immer alles. Bei Partnern gilt: freigegebene Formulare des eigenen Gewerks (plus
  gewerkübergreifende wie die Projekt-Übersicht). „Standard wiederherstellen“ setzt alles zurück.
- **Konten → Ordner & Bilder:** pro Projektordner (Bilder alt, Baustellenfotos, Bilder fertiges
  Bad, Angebote, Rechnungen …) per Haken festlegen, auf welche Ordner Planung, Monteur und Partner
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
| **Projekte** | Alle Bäder nach Abschnitt, mit Suche und Filtern. |
| **Projekt** | Die Spielfläche: oben die Level-Karte, links die Schritte des aktuellen Levels, rechts die Akte (Dateien-Ordner, Kunde, Termine, Verlauf). |
| **Unternehmen** | (nur Geschäftsführung) Ordner wie am iPhone: Finanzen, Vertrieb, Zeit & Ablauf, Kapazität & Team, Nachkalkulation. Darin: Jahresziel, Umsatz, Deckungsbeitrag, Quote, Dauer, Auftragsbestand, offene Forderungen, Kapazität der nächsten 8 Wochen, Vertriebstrichter — jeweils mit Vergleich zum Vorzeitraum. Euro-Beträge pro Projekt unter Akte → Zahlen. |
| **Konten** | (nur Geschäftsführung) Mitarbeiter und Partner, Ebenen, Zugänge anlegen/zurücksetzen/sperren, Tabelle „Wer sieht was“. |
| **Einrichtung** | (nur Geschäftsführung) Firma, Farben, Ziele, Programme, Fristen, Cloud, Sicherung. |
| **Meine Baustellen / Meine Einsätze** | Startseite für Monteure bzw. externe Partner. |

**+ Neue Anfrage** (links oben) legt ein Projekt an und öffnet direkt die Bestandsaufnahme.

## Die 14 Level

| Level | Was dort passiert |
| --- | --- |
| 01 Kundenanfrage | Bestandsaufnahme, Entscheidung „Erstgespräch ja/nein“, Termin |
| 02 Terminbestätigung | Kunde in KWP, Terminbestätigung mit Upload-Link, Fotos & Maße vom Kunden |
| 03 Erstgespräch | Erstgesprächs-Notizen, Skizze, Badplanerin festlegen, Termin Angebotsbesprechung |
| 04 Musterangebot | Projekt in KWP anlegen, Projektnummer, Musterangebot Titel für Titel anpassen, als PDF ablegen – grober Überblick zum Zeigen nach dem Erstgespräch |
| 05 Angebot & Planung | Renderings und ausführliches Angebot ablegen, Prüfung durch den Badberater |
| 06 Angebotsbesprechung | Ergebnis: Auftrag / überlegt noch (Wiedervorlage) / abgesagt; unterschriebenes Angebot |
| 07 Baustellenbesichtigung | Checkliste mit Fotos und Raummaßen, ggf. Angaben zur Tür |
| 08 Materialauswahl | Projekt-Übersicht, Auswahlgespräch mit Unterschrift; Fliesen-, Elektro-, Abriss-Formular und Spanndecke erscheinen nur, wenn sie gebraucht werden |
| 09 Freigabe | Exposé, PaletteMove-Code, Freigabe-Mail, unterschriebene Freigabe (vom Kunden per Link) |
| 10 Materialbestellung | Bestellungen in KWP anlegen, abgleichen, versenden |
| 11 Baustelle planen | Baustart, Mail „Termin Umsetzung“, Baustellenplan (Subunternehmer vorbelegt), Abschlagsrechnung, Monteure & Partner zuweisen + Ordner freigeben |
| 12 Ausführung | Kundenerinnerung, Baustellenfotos, Restarbeiten |
| 13 Abnahme & Übergabe | Abnahmeprotokoll mit Unterschrift, Schlussrechnung, Mail |
| 14 Abschluss | Bewertung, Bilder fertiges Bad, Showroom — dann archivieren |

Was in **KWP** oder **Palette CAD** passiert, wird im Dashboard mit „Als erledigt
bestätigen“ quittiert — mit Datum und Namen.

## Formulare

Alle Papierformulare gibt es digital: Felder, Auswahl-Chips, Tabellen, Checklisten,
Foto-Upload direkt im Formular und **Unterschrift per Finger/Stift auf dem Tablet**.
Pflichtfelder sind mit • markiert; der Zähler oben zeigt, was noch fehlt.
Gespeichert wird automatisch. **Drucken / PDF** erzeugt eine A4-Fassung im Firmenbriefkopf.

Im Abnahmeprotokoll übernimmt **Mängel → Restarbeiten** alle als Mangel markierten
Punkte als offene Restarbeiten.

**3D in PaletteMove** (oben im Projekt, sobald ein Download-Code eingetragen ist) kopiert
den Code und öffnet die App. Solange Palette kein Link-Schema nennt, öffnet sich der
App-Store-Eintrag bzw. die installierte App, und der Code wird eingefügt. Ist das Schema
bekannt, kommt es in `firma.js` unter `programme.app3dLink` (mit `{code}`), dann wird der Code
direkt übergeben.

**Signatur:** Unter jede Mail setzt das Dashboard die Signatur der angemeldeten Person
(Name, Funktion, Telefon, E-Mail aus **Konten**).

**Ziele & Kalkulation** (Umsatzziel, Kostensatz je Stunde) stehen jetzt unter
**Unternehmen → Ziele & Kalkulation**, nicht mehr in der Einrichtung.

**Ordner auf dem NAS:** `werkzeuge/ordner-sync/` spiegelt alle Projektordner als echte
Ordner und übernimmt Palette-Exporte automatisch, siehe die README dort.

## Mehrere Personen gleichzeitig (Schreibschutz)

Öffnet jemand ein Projekt, ist es für diese Person reserviert. Alle anderen sehen
„**Schreibgeschützt** – Karin Kaufmann bearbeitet dieses Projekt seit 10:42 Uhr“ und können
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
  (Broschüren, neuestes Exposé/Angebot/Rechnung). Datei öffnen → Outlook zeigt die Mail
  zum Prüfen und Absenden.
- **📅 In Outlook-Kalender** neben jedem Termin erzeugt einen Kalendereintrag mit Ort
  (Ausstellung bzw. Kundenadresse) und Telefonnummer.

## Kundenlink

Jedes Projekt hat einen persönlichen Link (`Kundenlink` oben im Projekt). Er steckt
automatisch in der Terminbestätigung und der Freigabe-Mail. Der Kunde sieht nur
seine Begrüßung und die passenden Upload-Felder (z. B. „Fotos Ihres jetzigen
Badezimmers“, „Grundriss & Maße“, später „Unterschriebene Planung & Angebot“) —
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

Im Ablauf stehen keine festen Namen, sondern Rollen wie `{badberater}`,
`{badplanung}`, `{projektleiter}` und Programme wie `{programm.erp}`.

## Ordner

```
Dashboard/
├── index.html              ← Dashboard fürs Team
├── kunde.html              ← Upload-Seite für Kunden (öffentlich erreichbar machen)
├── einstellungen/          ← firma.js, ablauf.js, formulare.js, mailvorlagen.js
├── vorlagen/               ← Original-Papiervorlagen, Lieferantenformulare, Outlook-Vorlagen, Broschüren
├── supabase/               ← schema.sql + ANLEITUNG-CLOUD.md
└── app/                    ← Programm, Schriften, Logo
```

Die Originale liegen unverändert in `../Bad_Dashboard/`.

## Subunternehmer anfragen (Level 11)

Der **Baustellenplan** legt für jedes Gewerk aus der Materialauswahl eine Zeile an (Abriss,
Elektro, Fliesen, Maler, Spanndecke, Fenster, Tür) – mit dem Termin aus dem Gewerke-Formular.
Die Firma wird aus dem **Adressbuch** gewählt; die Wahl geht zurück in die Projekt-Übersicht,
der Partner bekommt Zugriff aufs Projekt.

**Anfrage ✉** in jeder Zeile öffnet eine fertige Mail an den Partner (E-Mail aus dem Adressbuch):
Baustelle, Baustart, geplanter Einsatz, Raummaße aus der Baustellenbesichtigung und die
Leistungen aus dem Gewerke-Formular. Als Anhang kommen alle Dateien aus den Ordnern, die für das
Gewerk freigegeben sind (Konten → „Ordner & Bilder“) – einzeln abwählbar. „In Outlook öffnen“
erzeugt den Entwurf mit Anhängen, „Als angefragt markieren“ vermerkt das Datum in der Zeile.
Den Mailtext ändert man in `einstellungen/mailvorlagen.js` (`sub-anfrage`).

## Mails: Signatur, Bilder, Outlook-Entwurf (22.10.2026)

- **Signatur:** Unter jede Mail kommt die Signatur der angemeldeten Person. Unter **Konten → Mitarbeiter →
  Signatur** lässt sich je Person ein Signaturbild hochladen (wie in Outlook: Foto, Kontaktdaten, Logo).
  Ohne Bild wird eine Textsignatur aus Name, Funktion, Firma, Adresse, Telefon, E-Mail gebaut.
- **„In Outlook öffnen“** erzeugt jetzt eine formatierte Mail: klickbare Links, Bilder aus der Vorlage
  (z. B. Foto der Ausstellung in der Terminbestätigung) und das Signaturbild – plus Anhänge.
- **Terminbestätigung** = neue Fassung nur fürs Bad (Vorlage von Karin), weiterhin mit Upload-Link.
- **Freigabe-Mail:** 3D-Ansicht als Link (Level 9: „Link zur 3D-Ansicht“). „sowie das unterschriebene Angebot“
  und der Angebots-Anhang gehen nur mit, wenn „Angebot hat sich geändert“ angehakt ist.
- **Kundenerinnerung vor Baustart:** Absatz „Aushang für die Nachbarn“ abwählbar (inkl. Anhang), mit Baustart-Datum.
- **Wer sieht was:** externe Partner in Elektriker, Fliesenleger, Maler und „Weitere Partner“ aufgeteilt.
