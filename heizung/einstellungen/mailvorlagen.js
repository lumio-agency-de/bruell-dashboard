/* ==========================================================================
   MAILVORLAGEN
   --------------------------------------------------------------------------
   Heizung: Terminbestätigung, BZA, Umsetzungstermin, Baustart-Erinnerung und
   Schlussrechnung entsprechen den Outlook-Vorlagen von Annika (26.10.2026,
   Heizung Dashboard/änderungen/annika-2026-10-26) – ohne den Fotorabatt. Das Dashboard setzt
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
     {bzaNr} {bzdNr}        KfW-Nummern aus der Projektakte (Level 6 / 11)
     {firma.name} {firma.adresse} {firma.mapsLink} {firma.website}
     {firma.telefon} {firma.heizungsrechner}  (Link steht in firma.js)
     {berater} {heizungsexperte}
     {uploadLink}           persönlicher Link, über den der Kunde Dateien
                            direkt in sein Projekt hochlädt

   anhangDateien: Dateien im Ordner vorlagen/, die mitgeschickt werden.
   anhangOrdner:  Projektordner, deren neueste Datei beim „In Outlook öffnen“ angehängt wird.
   Optionale Absätze: [[id]] … [[/id]] — im Dashboard per Häkchen an/aus.
   Felder, die noch leer sind, erscheinen als markierte Lücke ‹…›.
   Keine Signatur im Text: Die persönliche Signatur des Absenders setzt Outlook.
   ========================================================================== */

window.MAILVORLAGEN = [
  /* An einen Subunternehmer (Knopf „Anfrage ✉“ im Baustellenplan). Zusätzliche Platzhalter:
     {gewerk} {baustelle.adresse} {baustelle.ort} {termin} {masse} {leistungen}
     Anhänge: alle Dateien aus den Ordnern, die für das Gewerk des Partners freigegeben sind
     (Konten → „Ordner & Bilder“) – im Dialog einzeln abwählbar. */
  {
    id: "sub-anfrage",
    an: "partner",
    phase: 8,
    titel: "Anfrage an Subunternehmer",
    datei: "",
    anhaenge: [],
    betreff: "Anfrage {gewerk}: Heizungserneuerung in {baustelle.ort} – Baustart {baustart.datum}",
    optionen: [
      { id: "termin", label: "Geplanten Einsatztermin nennen", an: true },
      { id: "masse", label: "Maße aus der Besichtigung mitschicken", an: true },
      { id: "leistungen", label: "Leistungen aus dem Formular mitschicken", an: true },
      { id: "zugang", label: "Hinweis auf den Zugang zum Heizungs-Dashboard" },
    ],
    text:
`{anrede}

wir erneuern eine Heizungsanlage und möchten Sie gern für die Arbeiten im Bereich {gewerk} anfragen.

Baustelle: {baustelle.adresse}
Geplanter Baustart: {baustart.wochentag}, {baustart.datum}
[[termin]]Ihr geplanter Einsatz: {termin}
[[/termin]]
[[masse]]Angaben aus der Baustellenbesichtigung:
{masse}

[[/masse]][[leistungen]]Benötigte Leistungen:
{leistungen}

[[/leistungen]]Skizzen und Fotos der Baustelle finden Sie im Anhang.[[zugang]] Alle Unterlagen stehen Ihnen außerdem in Ihrem Zugang zum Heizungs-Dashboard zur Verfügung.[[/zugang]]

Bitte geben Sie uns kurz Bescheid, ob Sie den Termin übernehmen können, und senden Sie uns Ihr Angebot.

Vielen Dank und freundliche Grüße`,
  },

  /* Level 1 „Kosten unklar“: Kunde bekommt den Link zum Heizungsrechner auf der Website */
  {
    id: "heizungsrechner",
    phase: 1,
    titel: "Link zum Heizungsrechner",
    datei: "",
    anhaenge: [],
    anredeStil: "formell",
    optionen: [],
    betreff: "Was kostet Ihre neue Heizung? Hier können Sie es selbst berechnen",
    text:
`{anrede}

vielen Dank für Ihren Anruf und Ihr Interesse an einer neuen Heizung!

Wie besprochen schicken wir Ihnen den Link zu unserem Heizungsrechner. Mit ein paar Angaben zu Ihrem Haus und Ihrer jetzigen Heizung bekommen Sie dort eine erste Einschätzung, mit welchen Kosten Sie für Ihre neue Heizung rechnen können – unverbindlich und kostenlos:

👉 Zum Heizungsrechner: {firma.heizungsrechner}

Auf unserer Website finden Sie außerdem Informationen zu Wärmepumpe, Pelletheizung, Solar sowie zu Förderung und Finanzierung.

Wenn Sie sich ein Bild gemacht haben oder Fragen auftauchen, melden Sie sich gerne bei uns – telefonisch unter {firma.telefon} oder einfach per Antwort auf diese E-Mail. Dann vereinbaren wir ein persönliches Beratungsgespräch in unserer Ausstellung und finden gemeinsam die passende Lösung für Ihr Haus.

Wir freuen uns, von Ihnen zu hören.

Mit freundlichen Grüßen`,
  },

  {
    id: "terminbestaetigung",
    phase: 2,
    titel: "Terminbestätigung Erstgespräch",
    datei: "",
    anhaenge: ["Fotoanleitung Heizung", "Broschüre Heizung"],
    anhangDateien: ["vorlagen/02-terminbestaetigung/Fotoanleitung-Heizung.pdf", "vorlagen/02-terminbestaetigung/Broschuere-Heizung.pdf"],
    anredeStil: "formell",
    betreff: "Ihre sparsame Heizung zum Greifen nah …",
    optionen: [],
    text:
`{anrede}

vielen Dank für Ihr Interesse an einer neuen Heizung!

Ob Wärmepumpe, Pellets, Gas, Öl, Solar – oder eine clevere Kombination daraus: Gemeinsam mit Ihnen entwickeln wir ein Wärmekonzept, das zu Ihrem Haus passt, Ihre Kosten senkt und Sie langfristig unabhängiger von Energieanbietern macht.

Dazu gehört auch eine ehrliche Beratung zu Fördermöglichkeiten und den gesetzlichen Vorgaben.

Gerne bestätigen wir Ihnen Ihren Gesprächstermin mit unserem Heizungsexperten Herrn {heizungsexperte}:
📅 {erstgespraech.wochentag}, {erstgespraech.datum}
⏰ {erstgespraech.uhrzeit} Uhr
📍 {firma.adresse}

📌 Anfahrt leicht gemacht: Hier geht’s zur Adresse auf Google Maps: {firma.mapsLink}

Damit wir Ihr Angebot – und später die Lieferung und Montage – schon vorab gut planen können, helfen uns Fotos Ihrer aktuellen Heizsituation sehr. Was genau wir brauchen, steht in der Fotoanleitung im Anhang:
•  Ihre aktuelle Heizung mit dem ganzen Heizraum
•  die Anschlüsse an Heizung, Warmwasserspeicher, Pumpen und Schornstein
•  die Außenansicht Ihres Hauses mit dem Schornsteinkopf
•  die Thermostatventile an Ihren Heizkörpern
•  ein Bild des aktuellen Zählerschranks

Bringen Sie gerne auch Ihre letzten Verbrauchsabrechnungen und das Protokoll des Schornsteinfegers mit.

Am einfachsten laden Sie alles über Ihren persönlichen Link hoch – direkt vom Handy, ohne Anmeldung:
👉 {uploadLink}

Wir freuen uns auf das Gespräch mit Ihnen.

Mit freundlichen Grüßen`,
  },

  {
    id: "bza",
    phase: 6,
    titel: "BZA-Nummer für den Förderantrag",
    datei: "",
    anhaenge: ["Anleitung KfW-Zuschussantrag", "BZA-Formular (aus „Förderung“)"],
    anhangDateien: ["vorlagen/06-foerderung/KfW-Anleitung-Zuschussantrag.pdf"],
    anhangOrdner: ["foerderung"],
    anredeStil: "formell",
    betreff: "Ihre Förderung: Bestätigung zum Antrag (BZA)",
    optionen: [],
    text:
`{anrede}

für Ihre neue Heizung haben wir die Bestätigung zum Antrag (BZA) im Förderportal der KfW erstellt. Ihre BZA-Nummer lautet:

{bzaNr}

Mit dieser Nummer stellen Sie den Zuschussantrag (Heizungsförderung für Privatpersonen) im Kundenportal „Meine KfW“ unter https://www.meine.kfw.de – wichtig: bitte vor Beginn der Arbeiten.

Im Anhang finden Sie die Bestätigung zum Antrag (BZA) sowie eine Anleitung, wie Sie den Antrag Schritt für Schritt stellen. Sobald Sie die Förderzusage erhalten haben, geben Sie uns bitte kurz Bescheid.

Bei Fragen zur Antragstellung helfen wir Ihnen gerne weiter.

Mit freundlichen Grüßen`,
  },

  {
    id: "umsetzung",
    phase: 8,
    titel: "Bestätigung Umsetzungstermin",
    datei: "",
    anhaenge: [],
    anredeStil: "formell",
    betreff: "Ihr Termin für die neue Heizung",
    optionen: [],
    text:
`{anrede}

vielen Dank für Ihr Vertrauen! Gerne bestätigen wir Ihnen den Termin für den Einbau Ihrer neuen Heizung:

📅 Baustart: {baustart.wochentag}, {baustart.datum}

Rund eine Woche vor Baubeginn melden wir uns noch einmal mit allen Informationen zum Ablauf.

Sollten Sie bis dahin Fragen haben oder sich an Ihrem Termin etwas ändern, melden Sie sich gerne jederzeit bei uns.

Mit freundlichen Grüßen`,
  },

  {
    id: "baustart",
    phase: 9,
    titel: "Kundenerinnerung vor Baustart",
    datei: "",
    anhaenge: [],
    anredeStil: "gutentag",
    betreff: "Bald ist es so weit – Ihre neue Heizung kommt",
    optionen: [],
    text:
`{anrede}

am kommenden {baustart.wochentag}, den {baustart.datum} geht es los – unser Team freut sich darauf, bei Ihnen die neue Heizung einzubauen.

Die Monteure sind in der Regel von ca. 7:00 bis 16:30 Uhr bei Ihnen vor Ort – freitags voraussichtlich nur bis 12:30 Uhr. Gerne können Sie uns einen Schlüssel übergeben 😊

Damit wir direkt starten können, bitten wir Sie:
•  den Heizraum und die Laufwege dorthin freizuräumen,
•  für unser Fahrzeug möglichst einen Parkplatz nah am Haus freizuhalten.

Sollten Sie vorab noch Fragen haben, melden Sie sich gerne!

Wir wünschen Ihnen weiterhin eine angenehme Woche!`,
  },

  {
    id: "schlussrechnung",
    phase: 11,
    titel: "Schlussrechnung & Bitte um Bewertung",
    datei: "",
    anhaenge: ["Schlussrechnung als PDF"],
    anhangOrdner: ["rechnungen"],
    anredeStil: "hallo",
    betreff: "Ihre Schlussrechnung zur neuen Heizung",
    optionen: [],
    text:
`{anrede}

anbei erhalten Sie die Schlussrechnung für Ihre neue Heizungsanlage im PDF-Format.

Wir wünschen Ihnen viel Freude und eine warme, sparsame Zeit mit Ihrer neuen Heizung und bedanken uns herzlich für die Zusammenarbeit und das entgegengebrachte Vertrauen!

Außerdem würden wir uns freuen, wenn Sie uns eine positive Google-Bewertung schreiben.
Über den folgenden Link gelangen Sie zu unserer Homepage – scrollen Sie einfach nach unten zum Button „Jetzt bewerten“.

👉 {firma.website}

Alles Gute wünscht Ihnen das {firma.kurzname}-Team!`,
  },

  {
    id: "bzd",
    phase: 11,
    titel: "BZD-Nummer für den Verwendungsnachweis",
    datei: "",
    anhaenge: [],
    anredeStil: "formell",
    betreff: "Ihre Förderung: Bestätigung nach Durchführung (BZD)",
    optionen: [],
    text:
`{anrede}

vielen Dank für Ihre Zahlung! Für den Abschluss Ihrer Förderung haben wir die Bestätigung nach Durchführung (BZD) erstellt. Ihre BZD-Nummer lautet:

{bzdNr}

Bitte reichen Sie diese Nummer zusammen mit der Schlussrechnung im Kundenportal „Meine KfW“ als Nachweis ein – danach zahlt die KfW den Zuschuss aus.

Bei Fragen sind wir gerne für Sie da.

Mit freundlichen Grüßen`,
  },
];
