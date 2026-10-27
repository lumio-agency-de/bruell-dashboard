/* ==========================================================================
   ABLAUF — die Phasen einer Heizungssanierung als Arbeitsschritte
   --------------------------------------------------------------------------
   Jede Phase besteht aus Schritten. Eine Phase ist abgeschlossen, wenn alle
   Pflicht-Schritte erledigt sind — erst dann wird die nächste freigeschaltet.

   Schritt-Typen
     formular     ein digitales Formular ausfüllen        { formular: "id" }
     dateien      Dateien in einen Projektordner laden     { kategorie: "id", min: 1 }
                    kundenlink: true  → Kunde kann über seinen Link hochladen
                    ersatz: "Text"    → alternativ mit Begründung abhaken
                    vorlage: "pfad"   → Vorlage zum Herunterladen (z. B. Lieferantenformular)
     termin       einen Termin setzen                      { termin: "key" }
     mail         Kundenmail senden                        { mail: "id" }
     erledigt     etwas außerhalb des Dashboards tun (z. B. in KWP) und bestätigen
     entscheidung eine Auswahl treffen                      { optionen: [...] }
                    option.weiter: false   → Schritt bleibt offen (z. B. „Kunde überlegt noch")
                    option.status: "pausiert" | "verloren"
                    option.wiedervorlage: Tage → setzt eine Wiedervorlage
     abschluss    Knopf „Projekt abschließen & archivieren“ (letztes Level)
     frueher: n   Schritt lag früher in Level n – bisheriger Stand wird übernommen
     feld         ein Projektfeld ausfüllen                 { feld: "projektnr" | "zustaendig" | "bzaNr" … }, mehrzeilig: true → Notizfeld,
                  optionen: [...] → Dropdown, platzhalter: "…" → Hinweis im leeren Feld,
                  mehrere: true → Mitarbeiter-Mehrfachauswahl (rolle: wer oben steht)
     team         Monteure & Partner dem Projekt zuweisen

   portal: [...]    → Ordner, in die der Kunde in diesem Level über seinen Link hochladen kann
   ebene: [...]     → wer den Schritt erledigen darf (Standard: ["planung"]).
                      Die Geschäftsführung darf immer alles.
   nummer: { feld, titel, label, stellen } → bei Dateien: Nummer aus hochgeladener PDF lesen und ins Projektfeld schreiben
                      (label = Beschriftung im PDF als RegExp, stellen = Länge der Nummer)
   links: [{ titel, url }] → Knöpfe zu externen Seiten (öffnen in neuem Tab)
   pflicht: false   → optionaler Schritt (blockiert nicht)
   info: { feld, label } → zeigt bei einem Formular einen Projektwert daneben (z. B. die Anzahlung)
   drucken: false   → bei einem Formular keinen „Drucken“-Knopf zeigen
   wenn             → Schritt gilt nur, wenn eine Bedingung erfüllt ist (Liste: eine davon genügt):
                      { schritt: "id", wert: "option" }            (Entscheidung im selben Level)
                      { schritt: "id", nr: 6, wert: "option" }     (Entscheidung aus Level 6)
                      { formular: "id", feld: "feld", wert: "ja" }

   Platzhalter in Texten: {geschaeftsfuehrer} {heizungsexperte} {projektleiter}
   {baustellenleiter} {programm.erp} {programm.heizungsrechner} … (siehe firma.js)
   ========================================================================== */

/* Projektordner — ersetzen die Ordnerstruktur auf dem alten Laufwerk (MOMO) */
/* kunde: Ordner kann im Kundenportal angeboten werden; hinweis: Text für den Kunden */
window.KATEGORIEN = [
  { id: "bilder-alt",  titel: "Bilder Bestand",           kunde: true, kundeTitel: "Fotos Ihrer jetzigen Heizung",
    hinweis: "Bitte nach der Fotoanleitung: der ganze Heizraum mit Rohren und Deckenhöhe, alle Anschlüsse an Heizung, Speicher, Pumpen und Abgasrohr, die Außenansicht mit Schornsteinkopf und Dach sowie die Thermostatventile an den Heizkörpern." },
  { id: "grundriss",   titel: "Grundriss & Unterlagen",   kunde: true, kundeTitel: "Grundriss & Unterlagen",
    hinweis: "Was Sie zur Hand haben: Grundriss, Energieausweis, letztes Schornsteinfeger-Protokoll, Verbrauchsabrechnungen." },
  { id: "skizzen",     titel: "Skizzen" },
  { id: "planung",     titel: "Heizlast & Schema" },
  { id: "angebot",     titel: "Angebote" },
  { id: "auftrag",     titel: "Auftrag unterschrieben",   kunde: true, kundeTitel: "Unterschriebenes Angebot",
    hinweis: "Als PDF, Scan oder einfach ein gut lesbares Foto jeder Seite." },
  { id: "foerderung",  titel: "Förderung" },
  { id: "behoerden",   titel: "Schornsteinfeger & Nachweise" },
  { id: "baustelle",   titel: "Bilder + Notizen Baustelle" },
  { id: "auswahl",     titel: "Bestellungen" },
  { id: "rechnungen",  titel: "Rechnungen" },
  { id: "fertig",      titel: "Bilder neuer Heizraum" },
  { id: "sonstiges",   titel: "Sonstiges",                kunde: true, kundeTitel: "Sonstiges",
    hinweis: "Alles, was Sie uns sonst noch zeigen möchten – Unterlagen, Fragen, Ideen." },
];

window.ABSCHNITTE = [
  { id: "anfrage",   titel: "Anfrage & Musterangebot",   von: 1,  bis: 3 },
  { id: "auftrag",   titel: "Auftrag & Förderung",       von: 4,  bis: 6 },
  { id: "vorber",    titel: "Vorbereitung",              von: 7,  bis: 8 },
  { id: "baustelle", titel: "Baustelle & Abschluss",     von: 9,  bis: 11 },
];

(function () {
  /* Neue Heizung mit Feuerstätte → Schornsteinfeger-Formular; ohne Kesseltausch → GEG-Beratung */
  const FEUER = ["Gas", "Öl", "Pellets", "Festbrennstoffe / Biogas", "Kesseltausch"];
  const neuIst = (liste) => liste.map((wert) => ({ formular: "erstgespraech", feld: "neu", wert }));

  window.ABLAUF = [
    {
      nr: 1, titel: "Kundenanfrage", abschnitt: "anfrage",
      ziel: "Bestand am Telefon aufnehmen und klären, ob es zum Erstgespräch kommt.",
      schritte: [
        { id: "bestand", typ: "formular", formular: "bestandsaufnahme", titel: "Bestandsaufnahme Heizung ausfüllen" },
        { id: "termin-ok", typ: "entscheidung", titel: "Kommt ein Erstgespräch in der Ausstellung zustande?",
          optionen: [
            { id: "ja", label: "Ja, Termin vereinbart" },
            { id: "rechner", label: "Kosten unklar – auf den {programm.heizungsrechner} verwiesen", status: "pausiert", wiedervorlage: 14, weiter: false },
            { id: "nein", label: "Kein Interesse", status: "verloren", weiter: false },
          ] },
        { id: "mail-rechner", typ: "mail", mail: "heizungsrechner", titel: "Mail mit Link zum Heizungsrechner senden", wenn: { schritt: "termin-ok", wert: "rechner" } },
        { id: "eg-termin", typ: "termin", termin: "erstgespraech", titel: "Termin Erstgespräch eintragen", wenn: { schritt: "termin-ok", wert: "ja" } },
        { id: "berater", typ: "feld", feld: "zustaendig", titel: "Heizungsexperte(n) fürs Erstgespräch", wenn: { schritt: "termin-ok", wert: "ja" },
          hinweis: "Einen oder mehrere Mitarbeiter auswählen – sie führen das Gespräch und sind im Projekt als Heizungsexperte zuständig." },
      ],
    },
    {
      nr: 2, titel: "Terminbestätigung", abschnitt: "anfrage",
      ziel: "Termin bestätigen und Fotos vom Heizraum und vom Haus einsammeln.",
      portal: ["bilder-alt", "grundriss"],
      schritte: [
        { id: "kwp-kunde", typ: "erledigt", titel: "Kunde in {programm.erp} angelegt und mit dem Termin verknüpft",
          hinweis: "Nur Neukunden anlegen – Stammkunden nur mit dem Termin verknüpfen." },
        { id: "mail-termin", typ: "mail", mail: "terminbestaetigung", titel: "Terminbestätigung mit Fotoanleitung & Upload-Link senden" },
        { id: "fotos", typ: "dateien", kategorie: "bilder-alt", kundenlink: true, titel: "Fotos Heizraum & Außenansicht vom Kunden",
          hinweis: "Kommt über den Kundenlink automatisch hier an. Fehlen die Fotos 4 Tage vor dem Termin, meldet sich das Cockpit.",
          ersatz: "Kunde bringt die Fotos zum Termin mit" },
        { id: "fotos-ok", typ: "erledigt", pflicht: false, titel: "Fotos auf Vollständigkeit geprüft",
          hinweis: "Heizraum mit Verrohrung und Deckenhöhe · alle Anschlüsse (Kessel, Speicher, Pumpen, Abgasrohr) · Außenansicht mit Schornsteinkopf und Dach · Thermostatventile." },
      ],
    },
    {
      nr: 3, titel: "Musterangebot erstellen", abschnitt: "anfrage",
      ziel: "Aus dem Musterangebot ein Angebot passend zur Bestandsaufnahme ableiten – fertig bis zum Erstgespräch.",
      schritte: [
        { id: "kwp-projekt", typ: "erledigt", titel: "Projekt in {programm.erp} angelegt",
          hinweis: "Titel „Einbau einer modernen energiesparenden Heizungsanlage“, Abteilung Heizung/Solar, rote Farbe (Auftrag noch nicht erteilt)." },
        { id: "projektnr", typ: "feld", feld: "projektnr", titel: "Projektnummer aus {programm.erp}" },
        { id: "musterangebot", typ: "erledigt", titel: "Musterangebot hinterlegt und Titel für Titel angepasst",
          hinweis: "Nicht benötigte Titel löschen (z. B. Öltankentsorgung, Elektriker), bei den übrigen Positionen, Artikel und Mengen nach der Bestandsaufnahme anpassen." },
        { id: "angebot", typ: "dateien", kategorie: "angebot", titel: "Angebot als PDF ablegen" },
      ],
    },
    {
      nr: 4, titel: "Erstgespräch", abschnitt: "auftrag",
      ziel: "Neue Heizung festlegen, beraten – und dranbleiben, bis der Auftrag kommt.",
      portal: ["auftrag"],
      schritte: [
        { id: "notizen", typ: "formular", formular: "erstgespraech", titel: "Erstgespräch Heizung", ebene: ["planung", "geschaeftsfuehrung"] },
        { id: "geg", typ: "formular", formular: "geg", titel: "GEG-Beratung (§ 71 Abs. 11) mit Unterschrift", ebene: ["planung", "geschaeftsfuehrung"],
          hinweis: "Pflicht vor dem Einbau einer Gas-, Öl- oder Festbrennstoffheizung: Informationsblatt übergeben, Nachweis unterschreiben lassen.",
          vorlage: [{ titel: "Informationsblatt GEG (BMWK)", datei: "vorlagen/04-erstgespraech/GEG-Beratungsprotokoll.pdf" }],
          wenn: neuIst(FEUER.filter((x) => x !== "Kesseltausch")) },
        { id: "ergebnis", typ: "entscheidung", titel: "Ergebnis des Erstgesprächs",
          hinweis: "Ohne Rückmeldung nach rund einer Woche nachfragen, ob noch Fragen offen sind – höchstens zweimal.",
          optionen: [
            { id: "auftrag", label: "Auftrag erteilt" },
            { id: "ueberlegt", label: "Kunde überlegt noch – in 7 Tagen nachfassen", wiedervorlage: 7, weiter: false },
            { id: "abgesagt", label: "Abgesagt", status: "verloren", weiter: false },
          ] },
        { id: "anzahlung", typ: "feld", feld: "anzahlung", titel: "Anzahlung", optionen: ["keine Anzahlung", "40 %", "60 %", "80 %", "100 %"], wenn: { schritt: "ergebnis", wert: "auftrag" } },
        { id: "wunschtermin", typ: "feld", feld: "wunschtermin", titel: "Wunschtermin des Kunden", pflicht: false, platzhalter: "Zeitraum, z. B. zwischen Oktober und November", wenn: { schritt: "ergebnis", wert: "auftrag" } },
        { id: "unterschrift", typ: "dateien", kategorie: "auftrag", kundenlink: true, titel: "Unterschriebenes Angebot einscannen / hochladen", wenn: { schritt: "ergebnis", wert: "auftrag" } },
        { id: "angebot-notiz", typ: "feld", feld: "angebotNotiz", mehrzeilig: true, pflicht: false, titel: "Notizen zum Angebot",
          platzhalter: "z. B. Änderungswünsche, offene Fragen, was nachgereicht wird …" },
      ],
    },
    {
      nr: 5, titel: "Baustellenbesichtigung", abschnitt: "auftrag",
      ziel: "Vor Ort aufmessen, Heizlast ermitteln und alles für die Monteure festhalten.",
      schritte: [
        { id: "bb-termin", typ: "termin", termin: "baustellenbesichtigung", titel: "Termin Heizlastberechnung & Baustellenbesichtigung eintragen" },
        { id: "besichtiger", typ: "feld", feld: "besichtiger", mehrere: true, rolle: "baustellenleiter", titel: "Wer macht die Baustellenbesichtigung?",
          hinweis: "Einen oder mehrere Mitarbeiter auswählen – sie fahren zur Besichtigung. Ausgewählte Monteure bekommen automatisch Zugriff aufs Projekt." },
        { id: "checkliste", typ: "formular", formular: "baustellenbesichtigung", titel: "Baustellenbesichtigung", ebene: ["planung", "monteur"] },
        { id: "tank", typ: "formular", formular: "tankdemontage", titel: "Checkliste Tankdemontage", ebene: ["planung", "monteur"],
          wenn: [{ formular: "baustellenbesichtigung", feld: "weitere", wert: "Tankdemontage" }, { formular: "baustellenbesichtigung", feld: "weitere", wert: "Tank leer pumpen" }] },
        { id: "heizlast", typ: "dateien", kategorie: "planung", titel: "Heizlastberechnung ablegen",
          ersatz: "Keine Heizlastberechnung nötig" },
        { id: "uebergabe", typ: "erledigt", titel: "{besichtigerHat} die Baustelle mit Baustellenleiter besprochen" },
      ],
    },
    {
      nr: 6, titel: "Förderung", abschnitt: "auftrag",
      ziel: "KfW-Zuschuss beantragen und die Zusage abwarten.",
      schritte: [
        { id: "foerderung", typ: "entscheidung", titel: "Wird eine Förderung beantragt?",
          optionen: [
            { id: "ja", label: "Ja, KfW-Zuschuss" },
            { id: "nein", label: "Keine Förderung" },
          ] },
        { id: "bza", typ: "erledigt", titel: "Bestätigung zum Antrag (BZA) im KfW-Prüftool erstellt",
          links: [{ titel: "KfW-Prüftool öffnen", url: "https://experten.kfw.de/prueftoolbza-web/" }], wenn: { schritt: "foerderung", wert: "ja" } },
        { id: "bza-pdf", typ: "dateien", kategorie: "foerderung", titel: "BZA-Formular hochladen",
          hinweis: "Die Bestätigung zum Antrag als PDF aus dem KfW-Prüftool herunterladen und hier ablegen – die BZA-Nummer wird daraus automatisch übernommen.",
          nummer: { feld: "bzaNr", titel: "BZA-Nummer", label: "Bz ?A[- ]?(?:ID|Nummer|Nr)", stellen: 15 }, wenn: { schritt: "foerderung", wert: "ja" } },
        { id: "bza-nr", typ: "feld", feld: "bzaNr", titel: "BZA-Nummer", wenn: { schritt: "foerderung", wert: "ja" } },
        { id: "mail-bza", typ: "mail", mail: "bza", titel: "BZA-Nummer an den Kunden senden", wenn: { schritt: "foerderung", wert: "ja" } },
        { id: "zusage", typ: "entscheidung", titel: "Förderzusage erhalten?", wenn: { schritt: "foerderung", wert: "ja" },
          optionen: [
            { id: "zusage", label: "Zusage erhalten" },
            { id: "absage", label: "Absage – ohne Förderung weiter" },
            { id: "warten", label: "Noch offen – in 14 Tagen nachsehen", wiedervorlage: 14, weiter: false },
          ] },
        { id: "zusage-pdf", typ: "dateien", kategorie: "foerderung", pflicht: false, titel: "Förderzusage ablegen", wenn: { schritt: "zusage", wert: "zusage" } },
      ],
    },
    {
      nr: 7, titel: "Materialbestellung", abschnitt: "vorber",
      ziel: "Bestellungen aus dem Angebot erzeugen, prüfen und rausschicken.",
      schritte: [
        { id: "bestellwesen", typ: "erledigt", titel: "Artikel aus dem Angebot ins Bestellwesen ({programm.erp}) übertragen" },
        { id: "angaben", typ: "erledigt", titel: "Lieferant, Lieferadresse, Wunschtermin und Bezeichnung eingetragen" },
        { id: "abgleich", typ: "erledigt", titel: "Bestellungen mit Angebot und Auswahl abgeglichen",
          hinweis: "Erstgespräch und Baustellenbesichtigung sind hier in der Akte unter „Formulare“ jederzeit aufrufbar." },
        { id: "raus", typ: "erledigt", titel: "Bestellungen versendet (E-Mail, Onlineshop oder IDS)" },
      ],
    },
    {
      nr: 8, titel: "Baustelle planen", abschnitt: "vorber",
      ziel: "Subunternehmer anfragen, Termin festlegen und bestätigen, Abschlag, Schornsteinfeger informieren – und wer mitarbeitet.",
      schritte: [
        { id: "plan", typ: "formular", formular: "baustellenplan", titel: "Subunternehmer & Ablauf",
          hinweis: "Alle Fremdgewerke aus der Baustellenbesichtigung sind schon eingetragen – Firma aus dem Adressbuch wählen." },
        { id: "baustart", typ: "termin", termin: "baustart", titel: "Umsetzungstermin (Baustart)" },
        { id: "mail-umsetzung", typ: "mail", mail: "umsetzung", titel: "Umsetzungstermin per Mail bestätigen" },
        { id: "abschlag", typ: "formular", formular: "abschlag", titel: "Abschlagsrechnung", info: { feld: "anzahlung", label: "Anzahlung" }, drucken: false },
        { id: "taf", typ: "formular", formular: "taf", titel: "Technische Angaben (TAF) an den Bezirksschornsteinfeger",
          hinweis: "Mindestens 10 Tage vor Baubeginn vorlegen.",
          vorlage: [
            { titel: "TAF Gas · vorhandener Gaszähler", datei: "vorlagen/08-baustelle-planen/TAF-Gas-vorhandener-Zaehler.pdf" },
            { titel: "TAF Gas · neuer Gaszähler", datei: "vorlagen/08-baustelle-planen/TAF-Gas-neuer-Zaehler.pdf" },
            { titel: "TAF Gas · An- und Abmeldung", datei: "vorlagen/08-baustelle-planen/TAF-Gas-An-und-Abmeldung.pdf" },
            { titel: "TAF Pellet", datei: "vorlagen/08-baustelle-planen/TAF-Pellet.pdf" },
            { titel: "TAF Pellet · Außenwandkamin", datei: "vorlagen/08-baustelle-planen/TAF-Pellet-Aussenwandkamin.pdf" },
          ],
          wenn: neuIst(FEUER) },
        { id: "schema", typ: "dateien", kategorie: "planung", titel: "Skizzen & Hydraulikschema für die Monteure",
          hinweis: "Was hier liegt, sehen die Monteure in ihrem Zugang (ersetzt den Baustellenordner auf MOMO3)." },
        { id: "team", typ: "team", titel: "Monteure & Partner zuweisen",
          hinweis: "Wer zugewiesen ist, sieht diese Baustelle. Welche Ordner, ist unter Konten → „Ordner & Bilder“ festgelegt." },
      ],
    },
    {
      nr: 9, titel: "Ausführung", abschnitt: "baustelle",
      ziel: "Kunden einstimmen, einbauen, Wartung anlegen, Restarbeiten erledigen.",
      schritte: [
        { id: "mail-baustart", typ: "mail", mail: "baustart", titel: "Kundenerinnerung 1 Woche vor Baustart" },
        { id: "wartung", typ: "erledigt", titel: "Wartungsanlage in {programm.erp} angelegt",
          hinweis: "Wartungsvertrag drucken, Blockartikel einpflegen und den Auftrag „Gerätedaten erfassen“ an den Monteur übertragen." },
        { id: "fotos-bau", typ: "dateien", kategorie: "baustelle", pflicht: false, titel: "Bilder & Notizen von der Baustelle", ebene: ["planung", "monteur", "partner"] },
        { id: "gas", typ: "formular", formular: "gaspruefung", titel: "Prüfprotokoll Gasinstallation (TRGI)", ebene: ["planung", "monteur"],
          wenn: { formular: "erstgespraech", feld: "neu", wert: "Gas" } },
        { id: "rest", typ: "formular", formular: "restarbeiten", titel: "Restarbeiten-Protokoll – alles erledigt", ebene: ["planung", "monteur"] },
      ],
    },
    {
      nr: 10, titel: "Abnahme & Übergabe", abschnitt: "baustelle",
      ziel: "Kunden in die neue Anlage einweisen und den neuen Heizraum festhalten.",
      schritte: [
        { id: "abnahme-termin", typ: "termin", termin: "abnahme", titel: "Termin Einweisung in die Heizungsanlage" },
        { id: "einweisung", typ: "formular", formular: "einweisung", titel: "Einweisung & Übergabe mit Unterschrift", ebene: ["planung", "monteur"] },
        { id: "fotos-fertig", typ: "dateien", kategorie: "fertig", titel: "Bilder vom neuen Heizraum", ebene: ["planung", "monteur"] },
        { id: "interview", typ: "entscheidung", pflicht: false, titel: "Interview für Social Media?",
          optionen: [{ id: "ja", label: "Ja, gemacht" }, { id: "nein", label: "Nein" }] },
      ],
    },
    {
      nr: 11, titel: "Abschluss", abschnitt: "baustelle",
      ziel: "Abrechnen, Bewertung, Förder-Nachweis — dann das Projekt abschließen.",
      schritte: [
        { id: "rechnung", typ: "dateien", kategorie: "rechnungen", min: 2, titel: "Schlussrechnung ablegen",
          hinweis: "Zweite Rechnung im Ordner (nach der Abschlagsrechnung)." },
        { id: "mail-rechnung", typ: "mail", mail: "schlussrechnung", titel: "Schlussrechnung mit Bitte um Bewertung senden" },
        { id: "bewertung", typ: "entscheidung", titel: "Google-Bewertung", seitMail: "schlussrechnung",
          optionen: [
            { id: "erhalten", label: "Bewertung erhalten & beantwortet" },
            { id: "erinnert", label: "Erinnert – keine Bewertung" },
            { id: "warten", label: "Noch warten – in 7 Tagen erinnern", wiedervorlage: 7, weiter: false },
          ] },
        { id: "zahlung", typ: "erledigt", titel: "Zahlungseingang geprüft" },
        { id: "bzd-nr", typ: "feld", feld: "bzdNr", titel: "BZD-Nummer (Bestätigung nach Durchführung)",
          wenn: { schritt: "zusage", nr: 6, wert: "zusage" } },
        { id: "mail-bzd", typ: "mail", mail: "bzd", titel: "BZD-Nummer an den Kunden senden",
          hinweis: "Erst nach vollständigem Zahlungseingang. Die BZD-Nummer im KfW-Prüftool erzeugen.",
          wenn: { schritt: "zusage", nr: 6, wert: "zusage" } },
        { id: "ewaermeg", typ: "formular", formular: "ewaermeg", pflicht: false, titel: "EWärmeG-Erfüllungserklärung",
          vorlage: [
            { titel: "Deckblatt", datei: "vorlagen/11-abschluss/01-Erfuellungserklaerung-EWaermeG-Deckblatt.pdf" },
            { titel: "Holz / Pellets", datei: "vorlagen/11-abschluss/03-Erfuellungserklaerung-EWaermeG-Holz.pdf" },
            { titel: "Biomethan", datei: "vorlagen/11-abschluss/05-Erfuellungserklaerung-EWaermeG-Biomethan.pdf" },
            { titel: "Bioöl", datei: "vorlagen/11-abschluss/07-Erfuellungserklaerung-EWaermeG-Biooel.pdf" },
            { titel: "Photovoltaik", datei: "vorlagen/11-abschluss/16-Erfuellungserklaerung-EWaermeG-Photovoltaik.pdf" },
          ] },
        { id: "abschluss", typ: "abschluss", pflicht: false, titel: "Projekt abschließen",
          hinweis: "Archiviert das Projekt unter Kundenadresse und Projektnummer – es steht danach unter Projekte → Abgeschlossen." },
      ],
    },
  ];
})();

/* Wer welchen Schritt sieht, stellt die Geschäftsführung unter Konten → „Wer sieht was“ ein.
   ebene: [...] an einem Schritt legt fest, wer ihn erledigen darf (wenn er ihn sieht). */
