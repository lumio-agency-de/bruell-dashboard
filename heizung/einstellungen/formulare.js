/* ==========================================================================
   FORMULARE — die Papierformulare als digitale Formulare
   --------------------------------------------------------------------------
   Feld-Typen
     abschnitt   Zwischenüberschrift                 { titel }
     untertitel  kleine Überschrift innerhalb eines Abschnitts   { titel }
     hinweis     kleiner Erklärtext über die ganze Breite         { text }
     text        einzeilig            textarea  mehrzeilig
     zahl        Zahl (einheit: "m²")  datum     Datum
     regler      Schieberegler        { min, max, schritt, einheit: "€" }
     janein      Ja / Nein   { beiJa: "Platzhalter" } → bei „Ja“ erscheint ein Eingabefeld
                                { beiJaFormular: "tuer" } → bei „Ja“ erscheint ein Knopf zu diesem Formular
     auswahl     eine Option          { optionen: [...] }
     mehrfach    mehrere Optionen     { optionen: [...] }
     liste       Dropdown, eine Option { optionen: [...] }
     kunde       Feld der Kundendaten (wird mit dem Projekt geteilt)   { feld: "vorname" }
     wer         Auswahlliste „Wer macht das?“: eigene Monteure + externe Partner
                 { gewerk: "Elektro" } filtert die Partner nach Gewerk;
                 { quelle: "projektuebersicht.elektrikerWer" } übernimmt den Wert
                 von dort (zentral eingetragen, hier nur angezeigt)
     dateien     Upload direkt im Formular → landet im Projektordner   { kategorie }
                 { auchAus: ["grundriss"] } zeigt zusätzlich die Dateien dieser Ordner an
     unterschrift  Unterschriftenfeld (Maus, Finger, Stift)
     tabelle     { spalten: [{ id, titel, typ }], zeilen: ["Armatur", …] }
                 ohne zeilen → Zeilen frei hinzufügen
                 summe: { spalte, mal, einheit, label } → Spalte unter der Tabelle zusammenzählen (je Zeile × „mal“-Spalte)
                 Spalten: breite: "90px" → feste Spaltenbreite
     checkliste  { punkte: [{ id, label, optional }], modus: "haken" | "janein" | "pruefung" }
                 Tabellen mit festen Zeilen bekommen automatisch „+ Eigene Zeile“

   Optionen pro Feld
     pflicht: true       muss ausgefüllt sein, damit das Formular als erledigt gilt
     breite: "halb" | "drittel" | "viertel" | Zahl 1–12 (Spalten)   (Standard: volle Breite)
     start: 1                    Feld beginnt in dieser Spalte (1 = neue Zeile)
     einheitPlatz: true          hält Platz für eine Einheit frei, damit Felder bündig stehen
     wenn: { feld, wert }        nur sichtbar, wenn ein anderes Feld diesen Wert hat
     wenn: { formular, feld, wert }  … oder ein Feld eines anderen Formulars
                                    (ist das andere Formular leer, wird angezeigt)
     vorbelegen: "termin:erstgespraech" | "heute" | "feld:formular.feld" | "wert:fester Text"
     uhrzeit: true (bei datum) → zusätzliches Uhrzeit-Feld, aus dem Termin vorbelegt
   ========================================================================== */

(function () {
  const JN = "janein";
  const BLATT = "vorlagen/01-kundenanfrage/Bestandsaufnahme-Erstgespraech-Baustellenbesichtigung.pdf";

  window.FORMULARE = {
    /* Blatt „Bestandsaufnahme Heizung“, Teil 1 (Telefon) */
    bestandsaufnahme: {
      titel: "Bestandsaufnahme Heizung",
      vorlage: BLATT,
      felder: [
        { typ: "abschnitt", titel: "Anfrage" },
        { id: "datum", typ: "datum", label: "Anfrage vom", pflicht: true, breite: "drittel", vorbelegen: "heute" },
        { id: "kundenart", typ: "auswahl", label: "Kunde", optionen: ["Neukunde", "Stammkunde"], pflicht: true, breite: "drittel" },
        { id: "eigentum", typ: "auswahl", label: "Wohnsituation", optionen: ["Eigentümer", "Mieter"], pflicht: true, breite: "drittel" },
        { id: "kontakt", typ: "auswahl", label: "Wie kam der Kontakt zustande?", optionen: ["Website / Heizungsrechner", "Empfehlung", "Social Media", "Stammkunde", "Sonstiges"], pflicht: true },
        { id: "kontaktText", typ: "text", label: "Details zum Kontakt (z. B. empfohlen von …, Messe, Zeitung)" },

        { typ: "abschnitt", titel: "Kunde" },
        { id: "anrede", typ: "kunde", feld: "anrede", label: "Anrede", breite: "drittel", pflicht: true },
        { id: "vorname", typ: "kunde", feld: "vorname", label: "Vorname", breite: "drittel" },
        { id: "nachname", typ: "kunde", feld: "nachname", label: "Nachname", breite: "drittel", pflicht: true },
        { id: "strasse", typ: "kunde", feld: "strasse", label: "Straße", breite: "drittel", pflicht: true },
        { id: "hausnr", typ: "kunde", feld: "hausnr", label: "Hausnummer", breite: "drittel", pflicht: true },
        { id: "ort", typ: "kunde", feld: "ort", label: "PLZ & Ort", breite: "drittel", pflicht: true },
        { id: "email", typ: "kunde", feld: "email", label: "E-Mail", breite: "halb", pflicht: true },
        { id: "telefon", typ: "kunde", feld: "telefon", label: "Telefon privat", breite: "halb" },
        { id: "telefonGeschaeft", typ: "kunde", feld: "telefonGeschaeft", label: "Telefon geschäftlich", breite: "halb" },
        { id: "mobil", typ: "kunde", feld: "mobil", label: "Telefon mobil", breite: "halb" },
        { id: "rechnung", typ: "text", label: "Rechnungsadresse / Kunden-Nr. (falls abweichend)", breite: "halb" },
        { id: "bauvorhaben", typ: "text", label: "Abweichende Baustellenadresse", breite: "halb" },

        { typ: "abschnitt", titel: "Gebäude" },
        { id: "haus", typ: "auswahl", label: "Gebäude", optionen: ["Einfamilienhaus", "Mehrfamilienhaus", "ELW (Einliegerwohnung)"], pflicht: true, breite: 6 },
        { id: "etagen", typ: "liste", label: "Anzahl Etagen", optionen: Array.from({ length: 20 }, (_, i) => String(i + 1)), breite: "viertel", start: 7, einheitPlatz: true },
        { id: "einheiten", typ: "zahl", label: "Anzahl Wohneinheiten", breite: "viertel", start: 10 },
        { id: "personen", typ: "zahl", label: "Personen im Haushalt", breite: "viertel", start: 1 },
        { id: "baujahr", typ: "zahl", label: "Baujahr des Hauses", breite: "viertel" },
        { id: "qm", typ: "zahl", label: "Wohnfläche", einheit: "m²", breite: "viertel", pflicht: true },
        { typ: "untertitel", titel: "Sanierungsmaßnahmen" },
        { id: "sanierung", typ: "mehrfach", label: "Was wurde saniert?", optionen: ["Fenster", "Dach", "Fassadendämmung"], breite: 4 },
        { id: "sanierungJahr", typ: "zahl", label: "Jahr der Sanierung", breite: 2, start: 5 },

        { typ: "abschnitt", titel: "Vorhandene Heizung" },
        { id: "system", typ: "mehrfach", label: "Art", optionen: ["Zentralheizung", "Etagenheizung", "Dachheizzentrale", "Zusätzlicher Holzofen"], pflicht: true },
        { id: "energie", typ: "auswahl", label: "Energieträger", optionen: ["Gas", "Öl", "Sonstiges"], pflicht: true, breite: "halb" },
        { id: "energieText", typ: "text", label: "Welcher?", breite: "halb", wenn: { feld: "energie", wert: "Sonstiges" } },
        { id: "kessel", typ: "mehrfach", label: "Kessel / Technik", optionen: ["Brennwertkessel", "Brauchwasserwärmepumpe", "Solar"], breite: 7 },
        { id: "solarFuer", typ: "mehrfach", label: "Solar für", optionen: ["Heizung", "Warmwasser"], breite: 5, wenn: { feld: "kessel", wert: "Solar" } },
        { id: "kesselBaujahr", typ: "zahl", label: "Baujahr", breite: 2, start: 1 },
        { id: "kesselLeistung", typ: "zahl", label: "Leistung", einheit: "kW", breite: 2 },
        { id: "kesselNotiz", typ: "text", label: "Hersteller / Typ / Sonstiges", breite: 4 },
        { id: "rohrsystem", typ: "auswahl", label: "Rohrsystem", optionen: ["Einrohrsystem", "Zweirohrsystem"], breite: 4 },
        { id: "heizkoerper", typ: "liste", label: "Anzahl Heizkörper", optionen: [...Array.from({ length: 30 }, (_, i) => String(i + 1)), "mehr als 30"], breite: "drittel" },
        { id: "heizkreise", typ: "liste", label: "Anzahl Heizkreise", optionen: Array.from({ length: 10 }, (_, i) => String(i + 1)), breite: "drittel" },
        { id: "flaechenheizung", typ: "mehrfach", label: "Flächenheizung", optionen: ["FBH", "Wandheizung"], breite: "drittel" },

        { typ: "abschnitt", titel: "Heizraum" },
        { id: "heizraumLaenge", typ: "zahl", label: "Länge des Raumes", einheit: "m", breite: "drittel" },
        { id: "heizraumBreite", typ: "zahl", label: "Breite des Raumes", einheit: "m", breite: "drittel" },
        { id: "heizraumHoehe", typ: "zahl", label: "Höhe des Raumes", einheit: "m", breite: "drittel" },

        { typ: "abschnitt", titel: "Kamin / Schornstein" },
        { id: "kaminHoehe", typ: "liste", label: "Gesamthöhe", optionen: Array.from({ length: 60 }, (_, i) => String((i + 1) / 2).replace(".", ",")), einheit: "m", breite: "drittel" },
        { id: "kaminQuerschnitt", typ: "auswahl", label: "Querschnitt", optionen: ["Rund", "Quadratisch", "Rechteckig"], breite: "drittel" },
        { id: "kaminDurchmesser", typ: "liste", label: "Innen-Durchmesser", optionen: Array.from({ length: 41 }, (_, i) => String(i + 10)), einheit: "cm", breite: "drittel", wenn: { feld: "kaminQuerschnitt", wert: "Rund" } },
        { id: "kaminSchenkel", typ: "liste", label: "Schenkellänge", optionen: Array.from({ length: 41 }, (_, i) => String(i + 10)), einheit: "cm", breite: "drittel", wenn: { feld: "kaminQuerschnitt", wert: "Quadratisch" } },
        { id: "kaminSeiteA", typ: "liste", label: "Seite A", optionen: Array.from({ length: 41 }, (_, i) => String(i + 10)), einheit: "cm", breite: "drittel", start: 9, wenn: { feld: "kaminQuerschnitt", wert: "Rechteckig" } },
        { id: "kaminSeiteB", typ: "liste", label: "Seite B", optionen: Array.from({ length: 41 }, (_, i) => String(i + 10)), einheit: "cm", breite: "drittel", start: 9, wenn: { feld: "kaminQuerschnitt", wert: "Rechteckig" } },

        { typ: "abschnitt", titel: "Tankraum" },
        { id: "tankraumLaenge", typ: "zahl", label: "Länge des Raumes", einheit: "m", breite: "drittel" },
        { id: "tankraumBreite", typ: "zahl", label: "Breite des Raumes", einheit: "m", breite: "drittel" },
        { id: "tankraumHoehe", typ: "zahl", label: "Höhe des Raumes", einheit: "m", breite: "drittel" },
        { typ: "untertitel", titel: "Vormauerung" },
        { id: "vormauerungHoehe", typ: "zahl", label: "Höhe", einheit: "m", breite: "drittel" },
        { id: "vormauerungLaenge", typ: "zahl", label: "Länge", einheit: "m", breite: "drittel" },
        { typ: "untertitel", titel: "Tank" },
        { id: "tankart", typ: "auswahl", label: "Tankart", optionen: ["Erdtank", "Stahltank", "Kunststofftank"], breite: "drittel" },
        { id: "tankAnzahl", typ: "liste", label: "Anzahl Kunststofftanks", einheit: "Stk.", optionen: Array.from({ length: 10 }, (_, i) => String(i + 1)), breite: "drittel", start: 5, wenn: { feld: "tankart", wert: "Kunststofftank" } },
        { id: "tankVolumen", typ: "zahl", label: "Tankvolumen gesamt", einheit: "l", breite: "drittel", start: 1 },
        { id: "tankInhalt", typ: "zahl", label: "Aktueller Tankinhalt", einheit: "l", breite: "drittel" },
        { typ: "untertitel", titel: "Tür zum Tankraum" },
        { id: "tankraumTuer", typ: "auswahl", label: "Größe", optionen: ["Groß (1 × 2 m)", "Klein (1 × 1 m)"], breite: "drittel" },
        { id: "tuerVormauerung", typ: "janein", label: "Tür zur Vormauerung?", breite: "drittel" },

        { typ: "abschnitt", titel: "Verbrauch" },
        { id: "verbrauch", typ: "text", label: "Öl- / Gasverbrauch Ø pro Jahr", breite: "drittel" },
        { typ: "abschnitt", titel: "Zeitraum" },
        { id: "von", typ: "text", label: "Realisierung von", breite: "drittel" },
        { id: "bis", typ: "text", label: "bis (→ Lieferzeiten beachten)", breite: "drittel" },
        { typ: "abschnitt", titel: "Budget" },
        { id: "budget", typ: "regler", label: "Budgetvorstellung", min: 5000, max: 60000, schritt: 500, einheit: "€" },
        { id: "budgetRichtung", typ: "mehrfach", label: "Grobe Richtwerte genannt", optionen: ["Gas ca. 12–16 k", "Öl ca. 18–24 k", "Pellets ca. 35–40 k", "Wärmepumpe ca. 35–40 k", "Solar Brauchwasser ca. 9–14 k", "Solar für Heizung ca. 18–25 k"] },

        { typ: "abschnitt", titel: "Bemerkungen" },
        { id: "bemerkungen", typ: "textarea", label: "Bemerkungen" },
      ],
    },

    /* Blatt Teil 2 (Ausstellung) */
    erstgespraech: {
      titel: "Erstgespräch Heizung",
      vorlage: BLATT,
      felder: [
        { id: "datum", typ: "datum", uhrzeit: true, label: "Datum & Uhrzeit", pflicht: true, breite: "halb", vorbelegen: "termin:erstgespraech" },
        { id: "budgetBesprochen", typ: "zahl", label: "Besprochenes Budget", einheit: "€", breite: "halb" },
        { typ: "abschnitt", titel: "Art der neuen Heizung" },
        { id: "neu", typ: "mehrfach", label: "Neue Heizung", pflicht: true, optionen: ["Kesseltausch", "Gas", "Öl", "Pellets", "Wärmepumpe", "Festbrennstoffe / Biogas"] },
        { id: "neuText", typ: "text", label: "Festbrennstoffe / Biogas – welche?", wenn: { feld: "neu", wert: "Festbrennstoffe / Biogas" } },
        { id: "solar", typ: "mehrfach", label: "Solar / Photovoltaik", optionen: ["Warmwasserbereitung", "Heizungsunterstützung", "Photovoltaik"] },
        { id: "flaechen", typ: "mehrfach", label: "Wärmeverteilung (VL / RL)", optionen: ["Heizkörper 60 / 40", "Wandheizung 35 / 25", "Fußbodenheizung 35 / 25"] },
        { typ: "abschnitt", titel: "Angebotspauschale" },
        { id: "pauschale", typ: "auswahl", label: "Kostenberechnung für Angebot: 250 € (inkl. MwSt.)", optionen: ["vereinbart", "Kunde überlegt noch", "entfällt"], pflicht: true },
        { typ: "abschnitt", titel: "Angebot erstellen über" },
        { id: "angebote", typ: "tabelle", label: "Angebote", spalten: [{ id: "jn", titel: "Angebot", typ: "janein" }, { id: "preis", titel: "Preis" }],
          zeilen: ["Gas", "Öl", "Pellet", "Solar", "Wärmepumpe"] },
        { typ: "abschnitt", titel: "Sonstige Notizen" },
        { id: "skizzen", typ: "dateien", kategorie: "skizzen", label: "Skizze (Foto der Handskizze)" },
        { id: "notizen", typ: "textarea", label: "Notizen Erstgespräch" },
      ],
    },

    /* Nachweis nach § 71 Abs. 11 GEG (Seite 8 des Informationsblatts) */
    geg: {
      titel: "GEG-Beratung vor Einbau (§ 71 Abs. 11)",
      vorlage: "vorlagen/04-erstgespraech/GEG-Beratungsprotokoll.pdf",
      felder: [
        { typ: "abschnitt", titel: "Fachkundige Person (§ 60b / § 88 Abs. 1 GEG)" },
        { id: "fachkundig", typ: "text", label: "Name", pflicht: true, breite: "halb", vorbelegen: "wert:Brüll GmbH, vertreten durch Herrn André Winterfeld" },
        { id: "fachAdresse", typ: "text", label: "Anschrift", breite: "halb", vorbelegen: "wert:Deufringer Straße 19, 71134 Aidlingen-Dachtel" },
        { id: "qualifikation", typ: "auswahl", label: "Berechtigt als", pflicht: true, vorbelegen: "wert:Installateur/in und Heizungsbauer/in (Anlage A Nr. 24 HwO)",
          optionen: ["Installateur/in und Heizungsbauer/in (Anlage A Nr. 24 HwO)", "Schornsteinfeger/in (Anlage A Nr. 12 HwO)", "Ofen- und Luftheizungsbauer/in (Anlage A Nr. 2 HwO)", "Energieberater/in (Energieeffizienz-Expertenliste)", "anderweitig nach § 88 Abs. 1 GEG berechtigt"] },
        { typ: "abschnitt", titel: "Beratungsobjekt & Eigentümer" },
        { id: "strasse", typ: "kunde", feld: "strasse", label: "Straße", breite: "drittel" },
        { id: "hausnr", typ: "kunde", feld: "hausnr", label: "Hausnummer", breite: "drittel" },
        { id: "ort", typ: "kunde", feld: "ort", label: "PLZ & Ort", breite: "drittel" },
        { id: "eigentuemer", typ: "text", label: "Vorname / Nachname Eigentümer/in", pflicht: true, breite: "halb" },
        { id: "eigentuemerAdresse", typ: "text", label: "Anschrift Eigentümer/in, wenn abweichend", breite: "halb" },
        { typ: "abschnitt", titel: "Anlass & Inhalt der Beratung" },
        { id: "anlass", typ: "mehrfach", label: "Geplanter Einbau einer", pflicht: true, optionen: ["Gasheizung", "Ölheizung", "Heizung mit Nutzung fester Brennstoffe"] },
        { id: "inhalt", typ: "checkliste", modus: "haken", label: "Inhalt des Beratungsgesprächs", pflicht: true, punkte: [
          { id: "infoblatt", label: "Informationsblatt „Informationen vor dem Einbau einer neuen Heizung“ übergeben" },
          { id: "waermeplanung", label: "Mögliche Auswirkungen der Wärmeplanung in der Gemeinde des Objekts" },
          { id: "kosten", label: "Kostenrisiken durch CO₂- und Brennstoffpreise" },
          { id: "quote", label: "Grüne-Brennstoff-Quote ab 2029" },
        ] },
        { id: "vorberaten", typ: "auswahl", label: "Bereits beraten im Rahmen einer", optionen: ["Energieberatung", "Erstellung eines individuellen Sanierungsfahrplans (iSFP)", "nein"], breite: "halb" },
        { id: "vorberatenAm", typ: "datum", label: "am", breite: "halb", wenn: { feld: "vorberaten", wert: "Energieberatung" } },
        { id: "vorberatenAmIsfp", typ: "datum", label: "am", breite: "halb", wenn: { feld: "vorberaten", wert: "Erstellung eines individuellen Sanierungsfahrplans (iSFP)" } },
        { typ: "abschnitt", titel: "Unterschriften" },
        { id: "datum", typ: "datum", label: "Datum", pflicht: true, breite: "halb", vorbelegen: "termin:erstgespraech" },
        { id: "uEigentuemer", typ: "unterschrift", label: "Unterschrift Eigentümer/in", pflicht: true, breite: "halb" },
        { id: "uFachkundig", typ: "unterschrift", label: "Unterschrift fachkundige Person", pflicht: true, breite: "halb" },
      ],
    },

    /* Blatt Teil 3 (vor Ort) */
    baustellenbesichtigung: {
      titel: "Baustellenbesichtigung",
      vorlage: BLATT,
      felder: [
        { id: "datum", typ: "datum", uhrzeit: true, label: "Datum & Uhrzeit", pflicht: true, breite: "halb", vorbelegen: "termin:baustellenbesichtigung" },
        { typ: "abschnitt", titel: "Zugang zum Heizraum" },
        { id: "innentreppe", typ: "text", label: "Innentreppe – Maße", breite: "halb" },
        { id: "aussentreppe", typ: "text", label: "Außentreppe – Maße", breite: "halb" },
        { id: "kellertuer", typ: "text", label: "Kellertür – Durchgangsmaß", breite: "halb", pflicht: true },
        { id: "tueren", typ: "text", label: "Weitere Türen bis zum Heizraum", breite: "halb" },
        { id: "heizraumtuer", typ: "text", label: "Türe Heizraum", breite: "halb", pflicht: true },
        { id: "heizraum", typ: "text", label: "Heizraumgröße", breite: "halb", pflicht: true },
        { id: "kaminD", typ: "text", label: "Kamin Ø", breite: "drittel" },
        { id: "kaminL", typ: "text", label: "Kamin Länge", breite: "drittel" },
        { id: "solarleitung", typ: JN, label: "Zuführung Solarleitung möglich", breite: "drittel" },
        { id: "oellager", typ: JN, label: "Heizöllagerung", breite: "drittel", start: 1 },
        { typ: "untertitel", titel: "Checkliste Tankdemontage", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelTankart", typ: "mehrfach", label: "Tankart", optionen: ["Kellertank", "Batterietank", "Erdtank"], breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelMaterial", typ: "mehrfach", label: "Öltank Material", optionen: ["Kellertank (Stahl)", "PE-Batterietank", "Alu-Tank", "GFK Glasfaser"], breite: 8, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelGroesse", typ: "zahl", label: "Tankgröße", einheit: "Liter", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelInhalt", typ: "zahl", label: "Tankinhalt gesamt (gemessen)", einheit: "Liter", breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelSchlauch", typ: "zahl", label: "Schlauchlänge zum Abpumpen (vom Tank zum Fahrzeug)", einheit: "m", breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { typ: "hinweis", text: "Formel Batterietank: Tankgröße (L) × gemessene cm ÷ Tankhöhe in cm = Inhalt in Liter", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelEntsorgen", typ: JN, label: "Tankinhalt entsorgen", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelTransport", typ: JN, label: "Öltransport", breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelUmpumpen", typ: JN, label: "Restl. Öl umpumpen (bis 30 m, direkter Nachbar nicht über die Straße)", breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelVormauerung", typ: JN, label: "Vormauerung", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelVormauerungBauseits", typ: JN, label: "Beseitigung bauseits", breite: "drittel", wenn: { feld: "oelVormauerung", wert: "ja" } },
        { id: "oelVormauerungLaenge", typ: "zahl", label: "Wenn nein, Länge", einheit: "m", breite: "drittel", wenn: { feld: "oelVormauerungBauseits", wert: "nein" } },
        { id: "oelLuke", typ: JN, label: "Luke zur Tür", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelLukeBauseits", typ: JN, label: "Beseitigung bauseits", breite: "drittel", wenn: { feld: "oelLuke", wert: "ja" } },
        { id: "oelZugang", typ: "mehrfach", label: "Zugang Tankraum", optionen: ["Zugang zu UG und Tankraum über separaten Treppenabgang", "Zugang über Treppenhaus", "Erschwerter Zugang durch Wohnräume, Wendeltreppe usw."], wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelSonstiges", typ: "text", label: "Sonstiges", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelAbdeckung", typ: JN, label: "Abdeckmaterial Auslegeware erforderlich", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelAbdeckungMeter", typ: "zahl", label: "Wenn ja, Anzahl Meter", einheit: "m", breite: "drittel", wenn: { feld: "oelAbdeckung", wert: "ja" } },
        { id: "oelInnenhuelle", typ: JN, label: "Tankinnenhülle", breite: "drittel", start: 9, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelParken", typ: JN, label: "Parkmöglichkeit für Langsprinter mit Hänger und LKW bauseits durch Kunde", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelParkverbot", typ: "auswahl", label: "Notwendiges Parkverbot beantragen", optionen: ["Ja", "Nein", "Bauseits"], breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelAbnahme", typ: JN, label: "Amtliche Abnahme", breite: "drittel", wenn: { feld: "oellager", wert: "ja" } },
        { id: "oelBilder", typ: JN, label: "Bilder beigefügt", breite: "drittel", start: 1, wenn: { feld: "oellager", wert: "ja" } },
        { typ: "abschnitt", titel: "Weitere Angaben" },
        { id: "weitere", typ: "mehrfach", label: "Was wird benötigt?", optionen: ["Gerüst", "Steiger", "Straßensperrung", "Möbelpacker", "Tank leer pumpen", "Tankdemontage", "Demontage Tankraum-Mauer", "Demontage Tankraum-Stahltür", "Elektro klein", "Elektro groß", "Inbetriebnahme WP", "Türeinbau"] },
        { id: "check", typ: "checkliste", modus: "janein", label: "Fotos & Infos", pflicht: true, punkte: [
          { id: "heizraum", label: "Bilder Heizraum" },
          { id: "heizkoerper", label: "Bilder Heizkörper" },
          { id: "leitungen", label: "Bilder Leitungen" },
          { id: "parken", label: "Bilder Parkmöglichkeiten" },
          { id: "vormauerung", label: "Bilder Öltankraum (Vormauerung)", optional: true },
          { id: "zaehlerschrank", label: "Bilder Zählerschrank" },
          { id: "lager", label: "Bilder Lagermöglichkeiten", optional: true },
          { id: "garten", label: "Bilder Garten", optional: true },
          { id: "hausverwaltung", label: "Info Hausverwaltung", optional: true },
        ] },
        { id: "weitereText", typ: "text", label: "Sonstiges" },
        { id: "fotos", typ: "dateien", kategorie: "baustelle", label: "Fotos von der Besichtigung", pflicht: true },
        { typ: "abschnitt", titel: "Lagermöglichkeiten" },
        { id: "lagerJN", typ: JN, label: "Lagermöglichkeit für Material", breite: "drittel", start: 1 },
        { id: "lager", typ: "mehrfach", label: "Lager – wo?", optionen: ["Garage", "Keller"], breite: "drittel", wenn: { feld: "lagerJN", wert: "ja" } },
        { id: "lagerText", typ: "text", label: "Lager – Hinweise", breite: "drittel", wenn: { feld: "lagerJN", wert: "ja" } },
        { typ: "abschnitt", titel: "Fremdgewerke – wer macht das?" },
        { id: "elektriker", typ: JN, label: "Elektriker", pflicht: true, breite: "drittel", start: 1 },
        { id: "elektrikerWer", typ: "wer", gewerk: "Elektro", label: "Elektriker – wer?", breite: "drittel", wenn: { feld: "elektriker", wert: "ja" } },
        { id: "elektrikerWann", typ: "liste", label: "Elektriker – wann?", optionen: Array.from({ length: 10 }, (_, i) => `Tag ${i + 1}`), breite: "drittel", wenn: { feld: "elektriker", wert: "ja" } },
        { id: "tank", typ: JN, label: "Tankreinigung / -demontage", pflicht: true, breite: "drittel", start: 1 },
        { id: "tankWer", typ: "wer", gewerk: "Tankreinigung", label: "Tank – wer?", breite: "drittel", wenn: { feld: "tank", wert: "ja" } },
        { id: "tankWann", typ: "liste", label: "Tank – wann?", optionen: Array.from({ length: 10 }, (_, i) => `Tag ${i + 1}`), breite: "drittel", wenn: { feld: "tank", wert: "ja" } },
        { id: "geruest", typ: JN, label: "Gerüst / Steiger", pflicht: true, breite: "drittel", start: 1 },
        { id: "geruestWer", typ: "wer", gewerk: "Gerüstbau", label: "Gerüst – wer?", breite: "drittel", wenn: { feld: "geruest", wert: "ja" } },
        { id: "geruestWann", typ: "liste", label: "Gerüst – wann?", optionen: Array.from({ length: 10 }, (_, i) => `Tag ${i + 1}`), breite: "drittel", wenn: { feld: "geruest", wert: "ja" } },
        { id: "kamin", typ: JN, label: "Kamin / Abgasanlage (Fremdfirma)", pflicht: true, breite: "drittel", start: 1 },
        { id: "kaminWer", typ: "wer", gewerk: "Kaminbau", label: "Kamin – wer?", breite: "drittel", wenn: { feld: "kamin", wert: "ja" } },
        { id: "kaminWann", typ: "liste", label: "Kamin – wann?", optionen: Array.from({ length: 10 }, (_, i) => `Tag ${i + 1}`), breite: "drittel", wenn: { feld: "kamin", wert: "ja" } },
        { typ: "abschnitt", titel: "Stundeneinschätzung" },
        { id: "stunden", typ: "tabelle", label: "Geschätzte Stunden je Arbeitsablauf",
          zeilen: ["Staubschutz", "Demontage und Entsorgung Altanlage", "Tank leer pumpen / Tankdemontage", "Gerüst stellen", "Montage Heizungsanlage", "Abgasanlage / Kamin",
            "Elektroanschluss", "Externe Elektroinstallationsarbeiten", "Isolierungsarbeiten", "Heizkörper Ventile tauschen", "Gartenarbeit",
            "Befüllen, Spülen & Inbetriebnahme", "Einweisung Kunde", "Aufräumen & Abschluss Baustelle"],
          spalten: [{ id: "monteure", titel: "Monteure", typ: "zahl", breite: "90px" }, { id: "std", titel: "Stunden", typ: "zahl", breite: "90px" }, { id: "notiz", titel: "Notiz", breite: "45%" }],
          summe: { spalte: "std", mal: "monteure", einheit: "Std.", label: "Gesamt (Monteure × Stunden)" } },
        { typ: "abschnitt", titel: "Sonstige Notizen" },
        { id: "skizze", typ: "dateien", kategorie: "skizzen", auchAus: ["grundriss"], label: "Skizze Heizraum mit Bemaßung" },
        { id: "notizen", typ: "textarea", label: "Notizen Baustellenbesichtigung" },
      ],
    },

    tankdemontage: {
      titel: "Checkliste Tankdemontage",
      vorlage: "vorlagen/05-baustellenbesichtigung/Checkliste-Tankdemontage.pdf",
      felder: [
        { id: "datum", typ: "datum", label: "Datum", breite: "halb", vorbelegen: "termin:baustellenbesichtigung" },
        { id: "ansprechpartner", typ: "text", label: "Ansprechpartner vor Ort", breite: "halb" },
        { typ: "abschnitt", titel: "Tank" },
        { id: "tankart", typ: "auswahl", label: "Tankart", optionen: ["Kellertank", "Batterietank", "Erdtank"], pflicht: true },
        { id: "material", typ: "auswahl", label: "Material", optionen: ["Stahl", "PE", "Alu", "GFK / Glasfaser"], pflicht: true },
        { id: "groesse", typ: "zahl", label: "Tankgröße", einheit: "l", breite: "drittel", pflicht: true },
        { id: "inhalt", typ: "zahl", label: "Tankinhalt gesamt (gemessen)", einheit: "l", breite: "drittel" },
        { id: "schlauch", typ: "zahl", label: "Schlauchlänge Tank → Fahrzeug", einheit: "m", breite: "drittel" },
        { id: "formel", typ: "text", label: "Batterietank: Tankgröße (l) × gemessene cm ÷ Tankhöhe (cm) = Inhalt (l) – Rechnung", wenn: { feld: "tankart", wert: "Batterietank" } },
        { typ: "abschnitt", titel: "Öl & Entsorgung" },
        { id: "entsorgen", typ: JN, label: "Tankinhalt entsorgen", pflicht: true, breite: "drittel" },
        { id: "transport", typ: JN, label: "Öltransport", pflicht: true, breite: "drittel" },
        { id: "umpumpen", typ: JN, label: "Restöl umpumpen (bis 30 m, direkter Nachbar)", breite: "drittel" },
        { id: "vormauerung", typ: JN, label: "Vormauerung", breite: "drittel" },
        { id: "vormauerungBauseits", typ: JN, label: "Beseitigung bauseits", breite: "drittel", wenn: { feld: "vormauerung", wert: "ja" } },
        { id: "vormauerungLaenge", typ: "zahl", label: "wenn nein: Länge", einheit: "m", breite: "drittel", wenn: { feld: "vormauerungBauseits", wert: "nein" } },
        { id: "luke", typ: JN, label: "Luke zur Tür", breite: "halb" },
        { id: "lukeBauseits", typ: JN, label: "Beseitigung bauseits", breite: "halb", wenn: { feld: "luke", wert: "ja" } },
        { typ: "abschnitt", titel: "Zugang & Baustelle" },
        { id: "zugang", typ: "auswahl", label: "Zugang Tankraum", pflicht: true, optionen: ["separater Treppenabgang zu UG und Tankraum", "über Treppenhaus", "erschwert (durch Wohnräume, Wendeltreppe …)", "Sonstiges"] },
        { id: "zugangText", typ: "text", label: "Zugang – Sonstiges", wenn: { feld: "zugang", wert: "Sonstiges" } },
        { id: "abdeckung", typ: JN, label: "Abdeckmaterial / Auslegeware nötig", breite: "halb" },
        { id: "abdeckungM", typ: "zahl", label: "Meter", einheit: "m", breite: "halb", wenn: { feld: "abdeckung", wert: "ja" } },
        { id: "innenhuelle", typ: JN, label: "Tankinnenhülle", breite: "drittel" },
        { id: "parken", typ: JN, label: "Parkplatz für Langsprinter mit Hänger + LKW bauseits", breite: "drittel" },
        { id: "parkverbot", typ: "auswahl", label: "Parkverbot beantragen", optionen: ["ja", "nein", "bauseits"], breite: "drittel" },
        { id: "amtlich", typ: JN, label: "Amtliche Abnahme", breite: "halb" },
        { id: "bilder", typ: "dateien", kategorie: "baustelle", label: "Bilder Tank & Tankraum" },
        { id: "bemerkungen", typ: "textarea", label: "Bemerkungen" },
      ],
    },

    /* Anlage 6 „Technische Angaben über Feuerungsanlagen“ – das ausgefüllte Formular wird hochgeladen */
    taf: {
      titel: "Technische Angaben Feuerungsanlage (TAF)",
      felder: [
        { id: "vorlage", typ: "auswahl", label: "Verwendete Vorlage", pflicht: true, optionen: ["Gas · vorhandener Gaszähler", "Gas · neuer Gaszähler", "Gas · An- und Abmeldung", "Öl", "Pellet", "Pellet · Außenwandkamin"] },
        { id: "schornsteinfeger", typ: "text", label: "Bezirksschornsteinfeger (Name / Kehrbezirk)", breite: "halb" },
        { id: "gesendet", typ: "datum", label: "Vorgelegt am", pflicht: true, breite: "halb" },
        { id: "datei", typ: "dateien", kategorie: "behoerden", label: "Ausgefülltes TAF-Formular (PDF)", pflicht: true },
        { id: "rueckmeldung", typ: "text", label: "Rückmeldung Schornsteinfeger" },
      ],
    },

    baustellenplan: {
      titel: "Baustellenplan",
      felder: [
        /* vorbelegenAus: für jedes benötigte Fremdgewerk aus der Baustellenbesichtigung eine Zeile.
           Wird hier eine Firma gewählt, geht sie zurück in die Besichtigung (und der Partner bekommt Zugriff). */
        { id: "subs", typ: "tabelle", label: "Subunternehmer & Gewerke", pflicht: true, anfrage: "sub-anfrage", quelle: "baustellenbesichtigung",
          vorbelegenAus: [
            { gewerk: "Elektro", wenn: { feld: "elektriker", wert: "ja" }, wer: "elektrikerWer", wann: "elektrikerWann" },
            { gewerk: "Tankreinigung", wenn: { feld: "tank", wert: "ja" }, wer: "tankWer", wann: "tankWann" },
            { gewerk: "Gerüstbau", wenn: { feld: "geruest", wert: "ja" }, wer: "geruestWer", wann: "geruestWann" },
            { gewerk: "Kaminbau", wenn: { feld: "kamin", wert: "ja" }, wer: "kaminWer", wann: "kaminWann" },
          ],
          adressbuchLink: true,
          spalten: [{ id: "gewerk", titel: "Gewerk", typ: "gewerk" }, { id: "firma", titel: "Firma", typ: "adressbuch" }, { id: "termin", titel: "Termin" }, { id: "bestaetigt", titel: "bestätigt", typ: "haken" }] },
        { id: "anschluss", typ: "textarea", label: "Hinweise für die Monteure (Anschlüsse, Hydraulik, Besonderheiten)" },
        { id: "schluessel", typ: "text", label: "Schlüsselübergabe / Zugang" },
      ],
    },

    abschlag: {
      titel: "Abschlagsrechnung",
      felder: [
        { id: "betrag", typ: "zahl", label: "Betrag (netto)", einheit: "€", pflicht: true, breite: "halb" },
        { id: "am", typ: "datum", label: "gestellt am", pflicht: true, breite: "halb", vorbelegen: "heute" },
        { id: "datei", typ: "dateien", kategorie: "rechnungen", label: "Abschlagsrechnung als PDF", pflicht: true },
      ],
    },

    /* Prüfprotokoll für die Gasinstallation nach TRGI 2008 */
    gaspruefung: {
      titel: "Prüfprotokoll Gasinstallation (TRGI)",
      vorlage: "vorlagen/09-ausfuehrung/Pruefprotokoll-Gas-TRGI.pdf",
      felder: [
        { id: "auftrag", typ: "text", label: "Auftrags-Nr.", breite: "halb" },
        { id: "betrieb", typ: "auswahl", label: "Betriebszustand der Gasanlage", pflicht: true, breite: "halb", optionen: ["in Betrieb", "außer Betrieb", "neu verlegt", "Betrieb unterbrochen", "stillgelegt"] },
        { typ: "abschnitt", titel: "Installierte Gasgeräte" },
        { id: "geraete", typ: "tabelle", label: "Geräte", pflicht: true,
          spalten: [{ id: "anzahl", titel: "Anzahl", typ: "zahl" }, { id: "art", titel: "Geräteart" }, { id: "funktion", titel: "Funktion" }, { id: "hersteller", titel: "Hersteller" }, { id: "typ", titel: "Typ" }, { id: "qnl", titel: "QNL" }] },
        { typ: "abschnitt", titel: "Leitungsanlage" },
        { id: "vertLaenge", typ: "zahl", label: "Verteilungsleitung Länge", einheit: "m", breite: "drittel" },
        { id: "vertDN", typ: "text", label: "Nennweite DN", breite: "drittel" },
        { id: "zaehler", typ: "text", label: "Zählernummer", breite: "drittel" },
        { id: "verbrLaenge", typ: "zahl", label: "Verbrauchsleitung Länge", einheit: "m", breite: "drittel" },
        { id: "verbrDN", typ: "text", label: "Nennweite DN", breite: "drittel" },
        { id: "zaehlerstand", typ: "text", label: "Zählerstand vor Prüfung", breite: "drittel" },
        { typ: "abschnitt", titel: "Belastungsprüfung" },
        { id: "bDatum", typ: "datum", label: "Datum", breite: "drittel" },
        { id: "bPruefer", typ: "text", label: "Prüfer", breite: "drittel" },
        { id: "bGeraet", typ: "text", label: "Prüfmethode / Prüfgerät", breite: "drittel" },
        { id: "bDruck", typ: "text", label: "Prüfdruck / Prüfmedium / Prüfdauer", breite: "halb" },
        { id: "bErgebnis", typ: "auswahl", label: "Ergebnis", optionen: ["bestanden", "nicht bestanden"], breite: "halb" },
        { typ: "abschnitt", titel: "Dichtheitsprüfung" },
        { id: "dDatum", typ: "datum", label: "Datum", pflicht: true, breite: "drittel" },
        { id: "dPruefer", typ: "text", label: "Prüfer", pflicht: true, breite: "drittel" },
        { id: "dGeraet", typ: "text", label: "Prüfmethode / Prüfgerät", breite: "drittel" },
        { id: "dDruck", typ: "text", label: "Prüfdruck / Prüfmedium / Prüfdauer", breite: "halb" },
        { id: "dErgebnis", typ: "auswahl", label: "Ergebnis", pflicht: true, optionen: ["dicht", "undicht", "Leckmenge gemessen"], breite: "halb" },
        { id: "leck", typ: "text", label: "Leckmenge (l/h)", breite: "halb", wenn: { feld: "dErgebnis", wert: "Leckmenge gemessen" } },
        { id: "schluss", typ: JN, label: "Schlussprüfung durchgeführt", breite: "halb" },
        { typ: "abschnitt", titel: "Verbrennungsluft & Mängel" },
        { id: "luft", typ: "mehrfach", label: "Feststellungen", optionen: ["Verbrennungsluftversorgung Art A erfüllt", "Verbrennungsluftversorgung Art B erfüllt über Außenfugen", "Verbrennungsluftversorgung Art B erfüllt über Öffnungen ins Freie / Leitung", "Verbrennungsluftversorgung nicht sichergestellt", "Dichtheit muss innerhalb von 4 Wochen wiederhergestellt sein", "Anlage nicht (mehr) in Betrieb genommen", "GNB informiert (Zweitschrift)"] },
        { id: "maengel", typ: "textarea", label: "(Weitere) Mängel an der Anlage" },
        { id: "eingewiesen", typ: JN, label: "Betreiber eingewiesen, Bedienungsanleitungen übergeben, auf Wartung hingewiesen", pflicht: true },
        { typ: "abschnitt", titel: "Unterschriften" },
        { id: "datum", typ: "datum", label: "Datum", pflicht: true, breite: "halb", vorbelegen: "heute" },
        { id: "uKunde", typ: "unterschrift", label: "Unterschrift Eigentümer / Betreiber", pflicht: true, breite: "halb" },
        { id: "uPruefer", typ: "unterschrift", label: "Unterschrift Prüfer", pflicht: true, breite: "halb" },
      ],
    },

    restarbeiten: {
      titel: "Restarbeiten-Protokoll",
      vorlage: "vorlagen/09-ausfuehrung/Restarbeiten-Protokoll.pdf",
      erledigtWenn: "alleHaken",
      felder: [
        { id: "datum", typ: "datum", label: "Datum", breite: "halb", vorbelegen: "heute" },
        { id: "offen", typ: "tabelle", label: "Folgende Arbeiten sind noch offen",
          spalten: [{ id: "arbeit", titel: "Arbeit" }, { id: "wer", titel: "wer", typ: "person" }, { id: "erledigt", titel: "erledigt", typ: "haken" }] },
        { id: "zufrieden", typ: JN, label: "Die aufgelisteten Arbeiten sind alle zur Zufriedenheit des Kunden erledigt", pflicht: true },
        { id: "bemerkungen", typ: "textarea", label: "Wenn nein – Bemerkungen", wenn: { feld: "zufrieden", wert: "nein" } },
        { id: "uKunde", typ: "unterschrift", label: "Unterschrift Kunde", breite: "halb" },
        { id: "uMitarbeiter", typ: "unterschrift", label: "Unterschrift Mitarbeiter Firma Brüll", breite: "halb" },
      ],
    },

    einweisung: {
      titel: "Einweisung & Übergabe",
      felder: [
        { id: "datum", typ: "datum", uhrzeit: true, label: "Datum & Uhrzeit", pflicht: true, breite: "halb", vorbelegen: "termin:abnahme" },
        { id: "eingewiesen", typ: "text", label: "Eingewiesene Person(en)", breite: "halb" },
        { id: "check", typ: "checkliste", modus: "pruefung", label: "Übergabe", pflicht: true, punkte: [
          { id: "bedienung", label: "Bedienung der Anlage erklärt (Regelung, Zeiten, Temperaturen, Warmwasser)" },
          { id: "stoerung", label: "Verhalten bei Störung erklärt, Notdienst-Nummer hinterlassen" },
          { id: "anleitungen", label: "Bedienungsanleitungen und Unterlagen übergeben" },
          { id: "wartung", label: "Wartungsvertrag besprochen / übergeben" },
          { id: "abgleich", label: "Hydraulischer Abgleich durchgeführt und dokumentiert", optional: true },
          { id: "pellet", label: "Pellet: Reinigungsanleitung für den Kaminfeger übergeben", optional: true },
          { id: "sauber", label: "Heizraum sauber übergeben, Altgeräte entsorgt" },
        ] },
        { id: "anleitung", typ: "dateien", kategorie: "behoerden", label: "Übergebene Unterlagen (optional)" },
        { id: "bemerkungen", typ: "textarea", label: "Bemerkungen" },
        { typ: "abschnitt", titel: "Unterschriften" },
        { id: "uKunde", typ: "unterschrift", label: "Unterschrift Kunde", pflicht: true, breite: "halb" },
        { id: "uMitarbeiter", typ: "unterschrift", label: "Unterschrift Mitarbeiter", pflicht: true, breite: "halb" },
      ],
    },

    /* Baden-Württemberg: Nachweis nach dem Erneuerbare-Wärme-Gesetz */
    ewaermeg: {
      titel: "EWärmeG-Erfüllungserklärung",
      felder: [
        { id: "option", typ: "mehrfach", label: "Erfüllungsoption", pflicht: true, optionen: ["Holz / Pellets", "Biomethan", "Bioöl", "Photovoltaik", "Wärmepumpe / Solarthermie", "Sonstige"] },
        { id: "durch", typ: "auswahl", label: "Wer erstellt die Erklärung?", optionen: ["Brüll GmbH", "Kunde / Energieberater"], breite: "halb" },
        { id: "eingereicht", typ: "datum", label: "Bei der unteren Baurechtsbehörde eingereicht am", breite: "halb" },
        { id: "datei", typ: "dateien", kategorie: "behoerden", label: "Erklärung (PDF)" },
        { id: "bemerkungen", typ: "textarea", label: "Bemerkungen" },
      ],
    },
  };
})();
