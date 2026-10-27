/* ==========================================================================
   MAILVORLAGEN
   --------------------------------------------------------------------------
   Texte aus den Outlook-Vorlagen (.oft) übernommen, ergänzt um den Upload-Link. Das Dashboard setzt
   Kundendaten und Termine ein; dann „Text kopieren" oder „In Mailprogramm
   öffnen". Bilder, Signatur und Anhänge bleiben in der Original-.oft —
   die liegt unter „datei" und kann jederzeit geöffnet werden.

   Platzhalter:
     {anrede}               je nach Vorlage „Sehr geehrte …" / „Hallo …" /
                            „Guten Tag …" — Stil steht unter anredeStil
     {nachname}
     {<termin>.datum}       z. B. {erstgespraech.datum}  → 14.10.2026
     {<termin>.wochentag}   → Mittwoch
     {<termin>.uhrzeit}     → 14:30
     {<termin>.kurz}        → 14.10.
     {downloadCode}         PaletteMove-Code aus der Projektakte
     {firma.name} {firma.adresse} {firma.mapsLink} {firma.website}
     {berater} {heizungsexperte}
     {uploadLink}           persönlicher Link, über den der Kunde Dateien
                            direkt in sein Projekt hochlädt

   anhangDateien: Dateien im Ordner vorlagen/, die mitgeschickt werden.
   anhangOrdner:  Projektordner, deren neueste Datei beim „In Outlook öffnen“ angehängt wird.
   Optionale Absätze: [[id]] … [[/id]] — im Dashboard per Häkchen an/aus (an: true = vorab angehakt).
   Bilder im Text: Zeile „[Bild: name]“ + bilder: { name: "vorlagen/…jpg" } – erscheinen im Outlook-Entwurf.
   {link3d}: Link zur 3D-Ansicht aus dem Projekt (Level 9).
   Felder, die noch leer sind, erscheinen als markierte Lücke ‹…›.
   Unter jede Mail setzt das Dashboard die Signatur des angemeldeten Nutzers
   (Name, Funktion, Durchwahl, E-Mail – gepflegt unter Konten).
   ========================================================================== */

window.MAILVORLAGEN = [
  /* An einen Subunternehmer (Knopf „Anfrage ✉“ im Baustellenplan). Zusätzliche Platzhalter:
     {gewerk} {baustelle.adresse} {baustelle.ort} {termin} {masse} {leistungen}
     Anhänge: alle Dateien aus den Ordnern, die für das Gewerk des Partners freigegeben sind
     (Konten → „Ordner & Bilder“) – im Dialog einzeln abwählbar. */
  {
    id: "sub-anfrage",
    an: "partner",
    phase: 11,
    titel: "Anfrage an Subunternehmer",
    datei: "",
    anhaenge: [],
    betreff: "Anfrage {gewerk}: Badsanierung in {baustelle.ort} – Baustart {baustart.datum}",
    optionen: [
      { id: "termin", label: "Geplanten Einsatztermin nennen", an: true },
      { id: "masse", label: "Raummaße mitschicken", an: true },
      { id: "leistungen", label: "Leistungen aus dem Formular mitschicken", an: true },
      { id: "zugang", label: "Hinweis auf den Zugang zum Bad-Dashboard" },
    ],
    text:
`{anrede}

wir planen eine Badsanierung und möchten Sie gern für die Arbeiten im Bereich {gewerk} anfragen.

Baustelle: {baustelle.adresse}
Geplanter Baustart: {baustart.wochentag}, {baustart.datum}
[[termin]]Ihr geplanter Einsatz: {termin}
[[/termin]]
[[masse]]Raummaße laut Baustellenbesichtigung:
{masse}

[[/masse]][[leistungen]]Benötigte Leistungen:
{leistungen}

[[/leistungen]]Pläne, Skizzen und Fotos der Baustelle finden Sie im Anhang.[[zugang]] Alle Unterlagen stehen Ihnen außerdem in Ihrem Zugang zum Bad-Dashboard zur Verfügung.[[/zugang]]

Bitte geben Sie uns kurz Bescheid, ob Sie den Termin übernehmen können, und senden Sie uns Ihr Angebot.

Vielen Dank und freundliche Grüße`,
  },

  {
    id: "terminbestaetigung",
    phase: 2,
    titel: "Terminbestätigung Erstgespräch",
    datei: "vorlagen/02-terminbestaetigung/Mail-Terminbestaetigung-Bad.oft",
    anhaenge: ["Broschüre Bad", "Fotoanleitung Bad"],
    anhangDateien: [
      "vorlagen/02-terminbestaetigung/anhaenge/Broschuere_Bad.pdf",
      "vorlagen/02-terminbestaetigung/anhaenge/Fotoanleitung_Bad.pdf",
    ],
    bilder: { ausstellung: "vorlagen/02-terminbestaetigung/bilder/ausstellung.jpg" },
    anredeStil: "formell",
    betreff: "Ihr persönliches Traumbad wird Wirklichkeit …",
    optionen: [],
    text:
`Träume werden Räume – Ihr persönliches Traumbad wird Wirklichkeit …

{anrede}

ob zur Entspannung nach einem langen Arbeitstag oder einfach, um sich selbst etwas Gutes zu tun – immer mehr Menschen wünschen sich ein Bad, das mehr als nur praktisch ist. Einen Ort zum Wohlfühlen, Entspannen und Auftanken.
Trifft das auch auf Sie zu? Dann sind Sie bei uns in besten Händen!

Eine gelungene Badmodernisierung beginnt mit durchdachter Planung und individueller Beratung.
Wir nehmen uns Zeit für Ihre Wünsche, denken an die Zukunft und entwickeln gemeinsam mit Ihnen Ihr persönliches Wohlfühlbad – ganz nach Ihrem Stil, Ihren Bedürfnissen und Ihrem Budget.
Von modernen Standardlösungen bis hin zur maßgeschneiderten Designlösung: Alles ist möglich.

Unsere Broschüre im Anhang bietet Ihnen einen ersten Einblick in unsere Leistungen rund um die Badsanierung.

[Bild: ausstellung]

Den ersten Schritt haben Sie bereits getan.

Ihr Gesprächstermin mit unserem Badexperten Herr {berater}:
📅 {erstgespraech.wochentag}, {erstgespraech.datum}
⏰ {erstgespraech.uhrzeit} Uhr
📍 {firma.adresse}

📌 Anfahrt leicht gemacht: Hier geht’s zur Adresse auf Google Maps: {firma.mapsLink}

Damit wir Sie optimal beraten können, freuen wir uns über einen Grundriss und einige Fotos (siehe Anleitung) Ihres aktuellen Badezimmers.
Am einfachsten laden Sie alles über Ihren persönlichen Link hoch – direkt vom Handy, ohne Anmeldung:
👉 {uploadLink}

Bringen Sie Ihre Ideen und Wünsche mit – so können wir direkt loslegen und gemeinsam Ihr Traumbad gestalten.

Wir freuen uns auf ein interessantes und kreatives Gespräch mit Ihnen.

Mit freundlichen Grüßen`,
  },

  {
    id: "freigabe",
    phase: 9,
    titel: "Badplanung zur Prüfung und Freigabe",
    datei: "vorlagen/08-freigabe/Mail-Planung-zur-Freigabe.oft",
    anhaenge: ["Exposé (2D-Ansichten) als PDF", "ggf. aktualisiertes Angebot"],
    anhangOrdner: ["expose", "angebot"],   // jeweils die neueste Datei aus diesen Projektordnern
    anhangOrdnerOption: { angebot: "angebot" },   // Angebot nur, wenn „Angebot hat sich geändert“ angehakt ist
    anredeStil: "formell",
    betreff: "Ihre Badplanung zur Prüfung und Freigabe",
    optionen: [
      { id: "angebot", label: "Angebot hat sich geändert" },
      { id: "spots", label: "Deckenspots geplant" },
      { id: "masse", label: "WC-Sitzhöhe / Maße abfragen" },
    ],
    text:
`{anrede}

Ihr Termin zur Materialauswahl ist bereits ein paar Tage vergangen.
Um in die nächste Phase der Vorbereitung starten zu können, bitten wir Sie, sich Ihre Badplanung noch einmal genau anzuschauen.

Hierzu finden Sie im Anhang das Exposé mit den 2D-Ansichten Ihres Bades als PDF-Datei. Für eine virtuelle 3D-Ansicht klicken Sie einfach auf den folgenden Link: {link3d}
[[angebot]]Zudem finden Sie ebenfalls noch das aktualisierte Angebot zur Prüfung und Unterschrift im Anhang.
[[/angebot]]
Bitte prüfen Sie vor allem die Aufteilung bzw. Anordnung und schauen Sie gern nach Ihren Artikeln und Farben (Farben können immer etwas zur Wirklichkeit abweichen).
Die Maße sind für unsere Monteure und dienen Ihnen zur Orientierung. Sie können, wie in der Planung unten zu lesen, durch bauliche Gegebenheiten geringfügig abweichen.
[[spots]]In der Draufsicht Ihrer 2D-Planung sehen Sie die Einbauposition Ihrer Deckenspots.
[[/spots]][[masse]]
Teilen Sie uns außerdem noch mit, welche Sitzhöhe für das WC gewünscht ist und ob die Maße von Waschtisch und Spiegelschrank für Sie passend sind.
[[/masse]]
Sollten Sie Fragen haben oder etwas unklar sein, melden Sie sich bitte unbedingt bei uns! Änderungen, die nach Ihrer Freigabe erfolgen, können nicht mehr umgesetzt werden.
Gerne können Sie auch Anmerkungen handschriftlich direkt in der Planung ergänzen.

Bitte senden Sie uns die unterschriebene Planung (Exposé)[[angebot]] sowie das unterschriebene Angebot[[/angebot]] als PDF, Scan oder Foto zurück – am einfachsten über Ihren persönlichen Link:
👉 {uploadLink}

Vielen Dank und herzliche Grüße`,
  },

  {
    id: "umsetzung",
    phase: 11,
    titel: "Bestätigung Umsetzungstermin",
    datei: "",
    anhaenge: [],
    anredeStil: "formell",
    betreff: "Ihr Termin für die Umsetzung Ihres neuen Bades",
    optionen: [{ id: "abnahme", label: "Geplanten Fertigstellungstermin nennen" }],
    text:
`{anrede}

vielen Dank für Ihr Vertrauen! Gerne bestätigen wir Ihnen den Termin für die Umsetzung Ihres neuen Bades:

📅 Baustart: {baustart.wochentag}, {baustart.datum}
[[abnahme]]📅 Geplante Fertigstellung: {abnahme.wochentag}, {abnahme.datum}
[[/abnahme]]
Rund eine Woche vor Baubeginn melden wir uns noch einmal mit allen Informationen zum Ablauf – zum Beispiel, wann unsere Monteure kommen und was Sie vorab vorbereiten können.

Sollten Sie bis dahin Fragen haben oder sich an Ihrem Termin etwas ändern, melden Sie sich gerne jederzeit bei uns.

Mit freundlichen Grüßen`,
  },

  {
    id: "baustart",
    phase: 12,
    titel: "Kundenerinnerung vor Baustart",
    datei: "vorlagen/11-ausfuehrung/Mail-Baustart.oft",
    anhaenge: ["Aushang für die Nachbarn", "Team-Foto (in der .oft)"],
    anhangOption: { "Aushang für die Nachbarn": "aushang" },   // nur angehängt, wenn der Absatz mitgeht
    anredeStil: "gutentag",
    betreff: "Das Warten hat bald ein Ende …",
    optionen: [{ id: "aushang", label: "Aushang für die Nachbarn (Absatz + Anhang)", an: true }],
    text:
`{anrede}

Ihre Badträume werden endlich wahr!

Unser Team freut sich schon darauf, am kommenden {baustart.wochentag}, den {baustart.datum} bei Ihnen mit dem Badumbau zu starten.
Los geht’s zwischen 8 Uhr und halb 9 Uhr morgens mit Staubschutz und Abrissarbeiten.

Die Monteure sind dann in der Regel von ca. 8:00 bis 17:00 Uhr bei Ihnen vor Ort – freitags voraussichtlich nur bis 12:30 Uhr. Gerne können Sie uns einen Schlüssel übergeben 😊

Vorab bitten wir Sie, alle Gegenstände, die Sie behalten möchten, aus dem Bad zu entfernen. Alles, was zu Beginn noch im Bad verbleibt, wird von uns entsorgt.
Bitte sorgen Sie außerdem dafür, dass die Laufwege frei sind, damit unsere Monteure direkt mit dem Staubschutz und den Abrissarbeiten beginnen können.

[[aushang]]Im Anhang finden Sie einen Aushang für Ihre Nachbarn, den Sie gerne ausdrucken und ggf. im Treppenhaus oder am schwarzen Brett aufhängen können.
Sollten Sie keine Möglichkeit zum Ausdrucken haben, übernehmen wir dies gerne und geben den Zettel den Monteuren am {baustart.wochentag}, {baustart.datum} mit.
[[/aushang]]
Sollten Sie vorab noch Fragen haben, melden Sie sich gerne!

Hier erhalten Sie einen kleinen Einblick in das Team, das Ihr Traumbad Wirklichkeit werden lässt: (Team-Foto aus der Outlook-Vorlage einfügen)

Wir wünschen Ihnen weiterhin eine angenehme Woche!`,
  },

  {
    id: "schlussrechnung",
    phase: 13,
    titel: "Schlussrechnung & Bitte um Bewertung",
    datei: "vorlagen/12-abnahme/Mail-Schlussrechnung.oft",
    anhaenge: ["Schlussrechnung als PDF"],
    anhangOrdner: ["rechnungen"],
    anredeStil: "hallo",
    betreff: "Ihre Schlussrechnung zur Badsanierung",
    optionen: [],
    text:
`{anrede}

anbei erhalten Sie die Schlussrechnung für Ihre Badsanierung im PDF-Format.

Wir wünschen Ihnen viel Spaß und Freude mit Ihrem neuen Bad/WC und bedanken uns herzlich für die Zusammenarbeit und das entgegengebrachte Vertrauen!

Außerdem würden wir uns freuen, wenn Sie uns eine positive Google-Bewertung schreiben.
Über den folgenden Link gelangen Sie zu unserer Homepage – scrollen Sie einfach nach unten zum Button „Jetzt bewerten“.

👉 {firma.website}

Alles Gute wünscht Ihnen das {firma.kurzname}-Team!`,
  },
];
