/* ==========================================================================
   ABLAUF — die Phasen eines Badbaus als Arbeitsschritte
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
     feld         ein Projektfeld ausfüllen                 { feld: "projektnr" | "zustaendig" | "downloadCode" }, mehrzeilig: true → Notizfeld,
                  optionen: [...] → Dropdown, platzhalter: "…" → Hinweis im leeren Feld
                  mehrere: true → Mitarbeiter-Mehrfachauswahl (Liste im Projekt; rolle: wer oben steht)

   portal: [...]    → Ordner, in die der Kunde in diesem Level über seinen Link hochladen kann
   ebene: [...]     → wer den Schritt erledigen darf (Standard: ["planung"]).
                      Die Geschäftsführung darf immer alles.
     team         Monteure & Partner dem Projekt zuweisen
   pflicht: false   → optionaler Schritt (blockiert nicht)
   wenn             → Schritt gilt nur, wenn eine Bedingung erfüllt ist:
                      { schritt: "id", wert: "option" }
                      { formular: "id", feld: "feld", wert: "ja" }

   Platzhalter in Texten: {badberater} {badplanung} {projektleiter}
   {programm.erp} {programm.cad} … (siehe firma.js)
   ========================================================================== */

/* Projektordner — ersetzen die Ordnerstruktur auf dem alten Laufwerk */
/* kunde: Ordner kann im Kundenportal angeboten werden; hinweis: Text für den Kunden */
window.KATEGORIEN = [
  { id: "bilder-alt",  titel: "Bilder alt",               kunde: true, kundeTitel: "Fotos Ihres jetzigen Badezimmers",
    hinweis: "Gern aus mehreren Blickwinkeln – mit Fenster, Tür, Dusche/Wanne, WC und Waschtisch." },
  { id: "grundriss",   titel: "Grundriss & Maße",         kunde: true, kundeTitel: "Grundriss & Maße",
    hinweis: "Ein Grundriss oder eine Handskizze mit Maßen genügt. Gern auch Angaben zur Wohnfläche." },
  { id: "heizung",     titel: "Heizraum & Haus",          nurMitDateien: true },   // nur noch für Altbestand – Dashboard ist reines Bad
  { id: "skizzen",     titel: "Skizzen" },
  { id: "planung",     titel: "Planung & Renderings" },
  { id: "angebot",     titel: "Angebote" },
  { id: "auftrag",     titel: "Auftrag unterschrieben",   kunde: true, kundeTitel: "Unterschriebenes Angebot",
    hinweis: "Als PDF, Scan oder einfach ein gut lesbares Foto jeder Seite." },
  { id: "baustelle",   titel: "Bilder + Notizen Baustelle" },
  { id: "auswahl",     titel: "Auswahl & Bestellungen" },
  { id: "expose",      titel: "Exposé" },
  { id: "freigabe",    titel: "Freigabe unterschrieben",  kunde: true, kundeTitel: "Unterschriebene Planung & Angebot",
    hinweis: "Das unterschriebene Exposé und – falls geändert – das unterschriebene Angebot. PDF, Scan oder Foto." },
  { id: "rechnungen",  titel: "Rechnungen" },
  { id: "fertig",      titel: "Bilder fertiges Bad" },
  { id: "sonstiges",   titel: "Sonstiges",                kunde: true, kundeTitel: "Sonstiges",
    hinweis: "Alles, was Sie uns sonst noch zeigen möchten – Ideen, Inspirationsbilder, Unterlagen." },
];

window.ABSCHNITTE = [
  { id: "anfrage",   titel: "Anfrage",                von: 1,  bis: 3 },
  { id: "planung",   titel: "Planung & Angebot",      von: 4,  bis: 5 },
  { id: "auftrag",   titel: "Auftrag & Vorbereitung", von: 6,  bis: 10 },
  { id: "baustelle", titel: "Baustelle & Abschluss",  von: 11, bis: 13 },
];

window.ABLAUF = [
  {
    nr: 1, titel: "Kundenanfrage", abschnitt: "anfrage",
    ziel: "Bestand aufnehmen und klären, ob es zum Erstgespräch kommt.",
    schritte: [
      { id: "bestand", typ: "formular", formular: "bestandsaufnahme", titel: "Bestandsaufnahme Bad ausfüllen" },
      { id: "termin-ok", typ: "entscheidung", titel: "Kommt ein Erstgespräch in der Ausstellung zustande?",
        optionen: [
          { id: "ja", label: "Ja, Termin vereinbart" },
          { id: "badrechner", label: "Kosten unklar – auf {programm.badrechner} verwiesen", status: "pausiert", wiedervorlage: 14, weiter: false },
          { id: "nein", label: "Kein Interesse", status: "verloren", weiter: false },
        ] },
      { id: "eg-termin", typ: "termin", termin: "erstgespraech", titel: "Termin Erstgespräch eintragen", wenn: { schritt: "termin-ok", wert: "ja" } },
      { id: "berater", typ: "feld", feld: "badexperten", mehrere: true, rolle: "badberater", titel: "Badexperte(n) fürs Erstgespräch", wenn: { schritt: "termin-ok", wert: "ja" },
        hinweis: "Einen oder mehrere Mitarbeiter auswählen – sie führen das Erstgespräch in der Ausstellung." },
    ],
  },
  {
    nr: 2, titel: "Terminbestätigung", abschnitt: "anfrage",
    ziel: "Termin bestätigen und Fotos & Maße vom Kunden einsammeln.",
    portal: ["bilder-alt", "grundriss"],
    schritte: [
      { id: "kwp-kunde", typ: "erledigt", titel: "Kunde in {programm.erp} angelegt und mit dem Termin verknüpft" },
      { id: "mail-termin", typ: "mail", mail: "terminbestaetigung", titel: "Terminbestätigung mit Upload-Link senden" },
      { id: "fotos", typ: "dateien", kategorie: "bilder-alt", kundenlink: true, titel: "Fotos & Maße vom Kunden",
        hinweis: "Kommt über den Kundenlink automatisch hier an. Kurz vor dem Termin ggf. anrufen und erinnern.",
        ersatz: "Kunde bringt Unterlagen zum Termin mit" },
      { id: "grundriss", typ: "dateien", kategorie: "grundriss", pflicht: false, titel: "Bemaßter Grundriss aus {programm.cad} für {badberater}",
        hinweis: "Zum Skizzieren im Erstgespräch – ausdrucken und bereitlegen." },
    ],
  },
  {
    nr: 3, titel: "Erstgespräch", abschnitt: "anfrage",
    ziel: "Wünsche aufnehmen und die Planung an eine Badplanerin übergeben.",
    schritte: [
      { id: "notizen", typ: "formular", formular: "erstgespraech", titel: "Erstgesprächs-Notizen", ebene: ["planung", "geschaeftsfuehrung"] },
      { id: "skizze", typ: "dateien", kategorie: "skizzen", pflicht: false, titel: "Skizze fotografieren & hochladen" },
      { id: "ab-termin", typ: "termin", termin: "angebotsbesprechung", titel: "Termin Angebots- & Planungsbesprechung" },
      { id: "ab-kwp", typ: "erledigt", titel: "Termin Angebotsbesprechung in {programm.erp} eingetragen" },
      { id: "planerin", typ: "feld", feld: "zustaendig", titel: "Zuständige Badplanerin festlegen" },
    ],
  },
  {
    nr: 4, titel: "Angebot & Planung erstellen", abschnitt: "planung",
    ziel: "3D-Planung rendern und das Angebot aus dem Musterangebot ableiten.",
    schritte: [
      { id: "pruefslot", typ: "erledigt", titel: "Prüftermin „Angebot & Planung prüfen“ bei {badberater} im Kalender eingetragen" },
      { id: "planung", typ: "dateien", kategorie: "planung", titel: "Planung aus {programm.cad} (Renderings) hochladen" },
      { id: "kwp-projekt", typ: "erledigt", titel: "Projekt in {programm.erp} angelegt",
        hinweis: "Titel „Realisierung Ihres Traumbades“, Abteilung Bad/Sanitär, rote Farbe. Musterangebot Titel für Titel anpassen." },
      { id: "projektnr", typ: "feld", feld: "projektnr", titel: "Projektnummer aus {programm.erp}" },
      { id: "freigabe-intern", typ: "erledigt", titel: "{badberater} hat Angebot & Planung geprüft", ebene: ["geschaeftsfuehrung"] },
      { id: "angebot", typ: "dateien", kategorie: "angebot", titel: "Angebot als PDF ablegen" },
    ],
  },
  {
    nr: 5, titel: "Angebotsbesprechung", abschnitt: "planung",
    ziel: "Planung vorstellen und dranbleiben, bis der Auftrag kommt.",
    portal: ["auftrag"],
    schritte: [
      { id: "ergebnis", typ: "entscheidung", titel: "Ergebnis der Besprechung",
        optionen: [
          { id: "auftrag", label: "Auftrag erteilt" },
          { id: "ueberlegt", label: "Kunde überlegt noch – in 7 Tagen nachfassen", wiedervorlage: 7, weiter: false },
          { id: "abgesagt", label: "Abgesagt", status: "verloren", weiter: false },
        ] },
      { id: "anzahlung", typ: "feld", feld: "anzahlung", titel: "Anzahlung", optionen: ["keine Anzahlung", "40 %", "60 %", "80 %", "100 %"], wenn: { schritt: "ergebnis", wert: "auftrag" } },
      { id: "wunschtermin", typ: "feld", feld: "wunschtermin", titel: "Wunschtermin des Kunden", pflicht: false, platzhalter: "Zeitraum, z. B. zwischen Oktober und November", wenn: { schritt: "ergebnis", wert: "auftrag" } },
      { id: "unterschrift", typ: "dateien", kategorie: "auftrag", kundenlink: true, titel: "Unterschriebenes Angebot einscannen / hochladen", wenn: { schritt: "ergebnis", wert: "auftrag" } },
      { id: "angebot-notiz", typ: "feld", feld: "angebotNotiz", mehrzeilig: true, pflicht: false, titel: "Notizen zum Angebot",
        platzhalter: "z. B. Änderungswünsche, Rabatt, offene Fragen, was nachgereicht wird …" },
      { id: "bb-termin", typ: "termin", termin: "baustellenbesichtigung", titel: "Baustellenbesichtigung mit {projektleiter} vereinbaren", wenn: { schritt: "ergebnis", wert: "auftrag" } },
    ],
  },
  {
    nr: 6, titel: "Baustellenbesichtigung", abschnitt: "auftrag",
    ziel: "Vor Ort aufmessen und alles für Planung und Monteure festhalten.",
    schritte: [
      { id: "checkliste", typ: "formular", formular: "baustellenbesichtigung", titel: "Checkliste Baustellenbesichtigung", ebene: ["planung", "monteur"] },
      { id: "masse", typ: "erledigt", titel: "Raummaße in {programm.cad} übernommen, Planung angepasst" },
      { id: "ma-termin", typ: "termin", termin: "materialauswahl", titel: "Termin Materialauswahl in der Ausstellung" },
    ],
  },
  {
    nr: 7, titel: "Materialauswahl", abschnitt: "auftrag",
    ziel: "Alles auswählen und festhalten — die Formulare zeigen, welche Gewerke nötig sind.",
    schritte: [
      { id: "uebersicht", typ: "formular", formular: "projektuebersicht", titel: "Projekt-Übersicht: Was wird benötigt?" },
      { id: "auswahl", typ: "formular", formular: "auswahl", titel: "Traumbad-Auswahlgespräch" },
      { id: "fliesen", typ: "formular", formular: "fliesen", titel: "Fliesenarbeiten", wenn: { formular: "projektuebersicht", feld: "fliesen", wert: "ja" } },
      { id: "elektro", typ: "formular", formular: "elektro", titel: "Elektroarbeiten", wenn: { formular: "projektuebersicht", feld: "elektriker", wert: "ja" } },
      { id: "abriss", typ: "formular", formular: "abriss", titel: "Abrissarbeiten", wenn: { formular: "projektuebersicht", feld: "abriss", wert: "ja" } },
      { id: "maler", typ: "formular", formular: "maler", titel: "Maler- & Trockenbauarbeiten", wenn: { formular: "projektuebersicht", feld: "maler", wert: "ja" } },
      { id: "decke", typ: "formular", formular: "spanndecke", titel: "Spanndecke (Deckenbestellung DPS)",
        vorlage: [
          { titel: "Bestellformular Decke", datei: "vorlagen/07-materialauswahl/Bestellformular-Spanndecke.pdf" },
          { titel: "Bestellformular Zubehör", datei: "vorlagen/07-materialauswahl/Bestellformular-Spanndecke-Zubehoer.pdf" },
        ],
        wenn: { formular: "projektuebersicht", feld: "decke", wert: "Spanndecke" } },
      { id: "angebot-neu", typ: "erledigt", titel: "Angebot in {programm.erp} an die Auswahl angepasst" },
      { id: "planung-neu", typ: "erledigt", titel: "Planung in {programm.cad} an die Auswahl angepasst" },
    ],
  },
  {
    nr: 8, titel: "Freigabe durch den Kunden", abschnitt: "auftrag",
    ziel: "Exposé (und ggf. neues Angebot) zur Unterschrift schicken.",
    portal: ["freigabe"],
    schritte: [
      { id: "expose", typ: "dateien", kategorie: "expose", titel: "Exposé mit 2D-Ansichten als PDF ablegen" },
      { id: "angebot-angepasst", typ: "dateien", kategorie: "angebot", pflicht: false, titel: "Angepasstes Angebot ablegen",
        hinweis: "Nur wenn sich durch die Materialauswahl etwas geändert hat. Geht mit der Freigabe-Mail an den Kunden." },
      { id: "code", typ: "feld", feld: "downloadCode", titel: "Link zur 3D-Ansicht ({programm.app3d})", platzhalter: "https://… (Link aus {programm.app3d})" },
      { id: "mail-freigabe", typ: "mail", mail: "freigabe", titel: "Planung zur Prüfung & Freigabe senden" },
      { id: "freigabe", typ: "dateien", kategorie: "freigabe", kundenlink: true, titel: "Unterschriebenes Exposé & Angebot zurück",
        hinweis: "Der Kunde lädt es über seinen Link hoch – oder hier selbst ablegen, wenn es per Post/Mail kam." },
    ],
  },
  {
    nr: 9, titel: "Materialbestellung", abschnitt: "auftrag",
    ziel: "Bestellungen aus dem Angebot erzeugen, prüfen und rausschicken.",
    schritte: [
      { id: "bestellwesen", typ: "erledigt", titel: "Artikel aus dem Angebot ins Bestellwesen ({programm.erp}) übertragen" },
      { id: "angaben", typ: "erledigt", titel: "Lieferant, Lieferadresse, Wunschtermin und Bezeichnung eingetragen" },
      { id: "abgleich", typ: "erledigt", titel: "Bestellungen mit der Auswahl abgeglichen",
        hinweis: "Die Auswahl aus Phase 7 ist hier in der Akte unter „Formulare“ jederzeit aufrufbar." },
      { id: "raus", typ: "erledigt", titel: "Bestellungen versendet (E-Mail, Onlineshop oder IDS)" },
    ],
  },
  {
    nr: 10, titel: "Baustelle planen", abschnitt: "auftrag",
    ziel: "Termin festlegen und bestätigen, Subunternehmer anfragen, Abschlag – und wer mitarbeitet.",
    schritte: [
      { id: "baustart", typ: "termin", termin: "baustart", titel: "Umsetzungstermin (Baustart)" },
      { id: "mail-umsetzung", typ: "mail", mail: "umsetzung", titel: "Umsetzungstermin per Mail bestätigen" },
      { id: "plan", typ: "formular", formular: "baustellenplan", titel: "Subunternehmer & Ablauf",
        hinweis: "Alle Gewerke aus der Materialauswahl sind schon eingetragen – Firma aus dem Adressbuch wählen." },
      { id: "abschlag", typ: "formular", formular: "abschlag", titel: "Abschlagsrechnung" },
      { id: "team", typ: "team", titel: "Monteure & Partner zuweisen",
        hinweis: "Wer zugewiesen ist, sieht diese Baustelle. Welche Ordner, ist unter Konten → „Ordner & Bilder“ festgelegt." },
    ],
  },
  {
    nr: 11, titel: "Ausführung", abschnitt: "baustelle",
    ziel: "Kunden einstimmen, bauen, Restarbeiten erledigen.",
    schritte: [
      { id: "mail-baustart", typ: "mail", mail: "baustart", titel: "Kundenerinnerung 1 Woche vor Baustart" },
      { id: "fotos-bau", typ: "dateien", kategorie: "baustelle", pflicht: false, titel: "Bilder & Notizen von der Baustelle", ebene: ["planung", "monteur", "partner"] },
      { id: "rest", typ: "formular", formular: "restarbeiten", titel: "Restarbeiten & Reklamationen erledigt", ebene: ["planung", "monteur"] },
    ],
  },
  {
    nr: 12, titel: "Abnahme & Übergabe", abschnitt: "baustelle",
    ziel: "Abnahme protokollieren und das fertige Bad festhalten.",
    schritte: [
      { id: "abnahme-termin", typ: "termin", termin: "abnahme", titel: "Abnahmetermin" },
      { id: "protokoll", typ: "formular", formular: "abnahme", titel: "Abnahmeprotokoll mit Unterschrift", ebene: ["planung", "monteur"] },
      { id: "fotos-fertig", typ: "dateien", kategorie: "fertig", titel: "Bilder vom neuen Bad", ebene: ["planung", "monteur"], frueher: 13 },
      { id: "interview", typ: "entscheidung", pflicht: false, titel: "Interview für Social Media?", frueher: 13,
        optionen: [{ id: "ja", label: "Ja, gemacht" }, { id: "nein", label: "Nein" }] },
    ],
  },
  {
    nr: 13, titel: "Abschluss", abschnitt: "baustelle",
    ziel: "Abrechnen, Bewertung, Showroom — dann das Projekt abschließen.",
    schritte: [
      { id: "rechnung", typ: "dateien", kategorie: "rechnungen", min: 2, titel: "Schlussrechnung ablegen", frueher: 12,
        hinweis: "Zweite Rechnung im Ordner (nach der Abschlagsrechnung)." },
      { id: "mail-rechnung", typ: "mail", mail: "schlussrechnung", titel: "Schlussrechnung mit Bitte um Bewertung senden", frueher: 12 },
      { id: "bewertung", typ: "entscheidung", titel: "Google-Bewertung", seitMail: "schlussrechnung",
        optionen: [
          { id: "erhalten", label: "Bewertung erhalten & beantwortet" },
          { id: "erinnert", label: "Erinnert – keine Bewertung" },
          { id: "warten", label: "Noch warten – in 7 Tagen erinnern", wiedervorlage: 7, weiter: false },
        ] },
      { id: "showroom", typ: "erledigt", titel: "Bilder in den Showroom geladen" },
      { id: "abschluss", typ: "abschluss", pflicht: false, titel: "Projekt abschließen",
        hinweis: "Archiviert das Projekt – es steht danach unter Projekte → Abgeschlossen." },
    ],
  },
];

/* Wer welchen Schritt sieht, stellt die Geschäftsführung unter Konten → „Wer sieht was“ ein.
   ebene: [...] an einem Schritt legt fest, wer ihn erledigen darf (wenn er ihn sieht). */
