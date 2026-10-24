/* ==========================================================================
   MAILVORLAGEN
   --------------------------------------------------------------------------
   Heizung: Die Terminbestätigung basiert auf dem Outlook-Entwurf „Ihre sparsame
   Heizung zum Greifen nah …“ (Postfach sparsameheizung@) – Wortlaut bitte dort
   abgleichen. Alle übrigen Texte sind Entwürfe zur Prüfung. Das Dashboard setzt
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
     {berater} {heizungsexperte}
     {uploadLink}           persönlicher Link, über den der Kunde Dateien
                            direkt in sein Projekt hochlädt

   anhangDateien: Dateien im Ordner vorlagen/, die mitgeschickt werden.
   anhangOrdner:  Projektordner, deren neueste Datei beim „In Outlook öffnen“ angehängt wird.
   Optionale Absätze: [[id]] … [[/id]] — im Dashboard per Häkchen an/aus.
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

  {
    id: "terminbestaetigung",
    phase: 2,
    titel: "Terminbestätigung Erstgespräch",
    datei: "",
    anhaenge: ["Fotoanleitung Heizung"],
    anhangDateien: ["vorlagen/02-terminbestaetigung/Fotoanleitung-Heizung.pdf"],
    anredeStil: "formell",
    betreff: "Ihre sparsame Heizung zum Greifen nah …",
    optionen: [{ id: "fotos", label: "Um Fotos bitten (100 € Fotorabatt)", an: true }],
    text:
`{anrede}

vielen Dank für Ihr Interesse an einer neuen Heizung!

Ob Wärmepumpe, Pellets, Gas, Öl, Solar – oder eine clevere Kombination daraus: Gemeinsam mit Ihnen entwickeln wir ein Wärmekonzept, das zu Ihrem Haus passt, Ihre Kosten senkt und Sie langfristig unabhängiger von Energieanbietern macht. Dazu gehört auch eine ehrliche Beratung zu Fördermöglichkeiten und den gesetzlichen Vorgaben.

Gerne bestätigen wir Ihnen Ihren Gesprächstermin mit unserem Heizungsexperten Herrn {heizungsexperte}:
📅 {erstgespraech.wochentag}, {erstgespraech.datum}
⏰ {erstgespraech.uhrzeit} Uhr
📍 {firma.adresse}

📌 Anfahrt leicht gemacht: Hier geht’s zur Adresse auf Google Maps: {firma.mapsLink}
[[fotos]]
Damit wir Ihr Angebot – und später die Lieferung und Montage – schon vorab gut planen können, helfen uns Fotos Ihrer aktuellen Heizsituation sehr. Was genau wir brauchen, steht in der Fotoanleitung im Anhang:
•  Ihre aktuelle Heizung mit dem ganzen Heizraum
•  die Anschlüsse an Heizung, Warmwasserspeicher, Pumpen und Schornstein
•  die Außenansicht Ihres Hauses mit dem Schornsteinkopf
•  die Thermostatventile an Ihren Heizkörpern

Für diese rund 15 Minuten Mitarbeit erhalten Sie bei Auftragserteilung einen Fotorabatt von 100 € (brutto).

Am einfachsten laden Sie alles über Ihren persönlichen Link hoch – direkt vom Handy, ohne Anmeldung:
👉 {uploadLink}
[[/fotos]]
Bringen Sie gerne auch Ihre letzten Verbrauchsabrechnungen und das Protokoll des Schornsteinfegers mit.

Wir freuen uns auf das Gespräch mit Ihnen.

Mit freundlichen Grüßen`,
  },

  {
    id: "bza",
    phase: 6,
    titel: "BZA-Nummer für den Förderantrag",
    datei: "",
    anhaenge: [],
    anredeStil: "formell",
    betreff: "Ihre Förderung: Bestätigung zum Antrag (BZA)",
    optionen: [],
    text:
`{anrede}

für Ihre neue Heizung haben wir die Bestätigung zum Antrag (BZA) im Förderportal der KfW erstellt. Ihre BZA-Nummer lautet:

{bzaNr}

Mit dieser Nummer stellen Sie den Zuschussantrag (Heizungsförderung für Privatpersonen) im Kundenportal „Meine KfW“ – wichtig: bitte vor Beginn der Arbeiten. Sobald Sie die Förderzusage erhalten haben, geben Sie uns bitte kurz Bescheid.

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
    optionen: [{ id: "abnahme", label: "Geplanten Einweisungstermin nennen" }],
    text:
`{anrede}

vielen Dank für Ihr Vertrauen! Gerne bestätigen wir Ihnen den Termin für den Einbau Ihrer neuen Heizung:

📅 Baustart: {baustart.wochentag}, {baustart.datum}
[[abnahme]]📅 Geplante Einweisung in die neue Anlage: {abnahme.wochentag}, {abnahme.datum}
[[/abnahme]]
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
    optionen: [{ id: "warmwasser", label: "Hinweis: kein Warmwasser während des Umbaus", an: true }],
    text:
`{anrede}

am kommenden {baustart.wochentag}, den {baustart.datum} geht es los – unser Team freut sich darauf, bei Ihnen die neue Heizung einzubauen.

Die Monteure sind in der Regel von ca. 8:00 bis 17:00 Uhr bei Ihnen vor Ort – freitags voraussichtlich nur bis 12:30 Uhr. Gerne können Sie uns einen Schlüssel übergeben 😊

Damit wir direkt starten können, bitten wir Sie:
•  den Heizraum und die Laufwege dorthin freizuräumen,
•  für das Lieferfahrzeug möglichst einen Parkplatz nah am Haus freizuhalten.
[[warmwasser]]
Bitte beachten Sie: Während des Umbaus stehen Heizung und Warmwasser zeitweise nicht zur Verfügung. Wir halten diese Zeit so kurz wie möglich und sprechen den genauen Ablauf mit Ihnen ab.
[[/warmwasser]]
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
