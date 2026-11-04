/* ==========================================================================
   Brüll Dashboard – Personal (nur Geschäftsführung)
   --------------------------------------------------------------------------
   • personal/index.html  → Mitarbeiter-Übersicht (Karten, Suche, Import)
   • personal/karte.html  → Personalkarte ?nr=<Pers.-Nr.>  (Funktionen der alten Karten)
   Speicherformat wie in den alten Personalkarten: pk_<Nr> (Daten), ph_<Nr> (Foto),
   fz_<Nr> (Fahrzeugkarten-Abgleich). Im Demo-Modus liegt alles nur in diesem Browser –
   im Betrieb kommt es in die Datenbank auf dem Mac mini. Echte Daten nie ins Repo!
   ========================================================================== */
var PK_NR = (new URLSearchParams(location.search).get("nr") || "").replace(/\D/g, "") || "0";

(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const QS = location.search.replace(/[?&]nr=\d+/, "").replace(/^&/, "?");
  const DEMO = new URLSearchParams(location.search).has("demo");
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const qs = (extra) => { const p = new URLSearchParams(QS); for (const [k, v] of Object.entries(extra || {})) p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };

  /* ---------- Anmeldung ----------
     Geschäftsführung: alles. Alle anderen (auch Ebene „mitarbeiter“ = nur Personalkarte): nur die
     EIGENE Personalkarte, nur lesen. Verknüpfung Konto → Karte über konto.pk, sonst Kürzel oder Name.
     Achtung: Auf GitHub Pages ist das nur Bedienung, kein Schutz – echte Rechte erst auf dem Mac mini. */
  function ich() {
    let email = null;
    try { email = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (e) { /* egal */ }
    email = email || lesen("bruell:sitzung", null);
    const k = email && lesen("bruell:konten", []).find((x) => x.email === email && x.aktiv !== false);
    return k ? { id: k.id, name: k.name || k.benutzer, ebene: k.ebene, email: k.email, pk: k.pk ? String(k.pk) : "", mussAendern: !!k.mussAendern, lohnzettel: !!k.lohnzettel } : null;
  }
  const EBENE_TITEL = { geschaeftsfuehrung: "Geschäftsführung", planung: "Planung / Bearbeitung", monteur: "Monteur", mitarbeiter: "Mitarbeiter", partner: "Partner" };
  const norm = (t) => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  /* Personalnummer zu einem Konto */
  function pkVon(k) {
    if (k.pk) return String(k.pk);
    const l = Object.keys(localStorage).filter((x) => /^pk_\d+$/.test(x)).map((x) => ({ nr: x.slice(3), d: lesen(x, {}) }));
    const t = l.find((x) => k.id && norm(x.d.kuerzel) === norm(k.id)) || l.find((x) => k.name && norm((x.d.vorname || "") + " " + (x.d.nachname || "")) === norm(k.name));
    return t ? t.nr : "";
  }
  /* Konto zu einer Personalkarte (für „Zugang zum Dashboard“) */
  function kontoVon(nr) {
    const l = lesen("bruell:konten", []);
    return l.find((k) => String(k.pk || "") === String(nr)) || l.find((k) => k.ebene !== "partner" && !k.pk && pkVon(k) === String(nr)) || null;
  }
  const PERSON = ich();
  if (!PERSON || PERSON.mussAendern) { try { sessionStorage.setItem("bruell:zurueck", "1"); } catch (e) { /* egal */ } location.replace("../bad/" + QS); return; }   // Startpasswort wird bei der Anmeldung geändert
  const GF = PERSON.ebene === "geschaeftsfuehrung";
  /* Freigabe „Lohnzettel hochladen“ (Lohnabrechnung → Einstellungen): Seite Lohnzettel + Reiter Lohnzettel fremder Karten */
  const LZ_FREI = !GF && PERSON.lohnzettel, HIER = document.body.dataset.bereich || "";
  if (!GF) PERSON.pk = pkVon(PERSON);
  /* ---------- Zugang nach Rechten (gesamt/thema.js → BruellRechte; Konten-Seite) ----------
     Admin (GF): alles. Alle anderen: nur freigegebene Bereiche, dort nur lesen; die eigene Personalkarte immer. */
  const R = window.BruellRechte, KONTO = R.konto(), darf = (b) => GF || R.darf(b, KONTO);
  const SEITE = R.bereichVon((location.pathname.match(/\/(personal|fahrzeuge|lager|betrieb|konten)\/(.*)$/) || []).slice(1).join("/"));
  const eigeneKarte = PERSON.pk ? "../personal/karte.html" + qs({ nr: PERSON.pk }) : "";
  if (!GF) {
    const weg = () => {                                              // erste erlaubte Seite
      if (eigeneKarte) return location.replace(eigeneKarte);
      const s = R.startseite(KONTO);
      if (s !== null) return location.replace("../" + s + (s.includes("?") ? QS.replace(/^\?/, "&") : QS));
      document.addEventListener("DOMContentLoaded", () => { document.body.innerHTML = '<main class="main"><div class="seite"><div class="panel startfeld"><h2>Kein Bereich freigegeben</h2><p>Bitte an die Geschäftsführung wenden.</p></div></div></main>'; });
    };
    document.documentElement.classList.add("nur-lesen");             // ändern dürfen in den Gesamt-Bereichen nur Admins
    if (LZ_FREI && HIER === "lohn" && !darf("lohn")) window.LOHN_NUR_ZETTEL = true;
    else if (SEITE === "karte") {
      if (PERSON.pk && PK_NR === PERSON.pk) { window.PK_NUR_LESEN = true; if (LZ_FREI) window.PK_LZ_DARF = true; }
      else if (LZ_FREI && new URLSearchParams(location.search).has("lz")) { window.PK_NUR_LESEN = window.PK_NUR_LOHNZETTEL = window.PK_LZ_DARF = true; }
      else if (darf("personal")) window.PK_NUR_LESEN = true;
      else { weg(); return; }
    } else if (SEITE === "konten" || !darf(SEITE)) { weg(); return; }
  }

  /* ---------- Leiste ---------- */
  function leiste() {
    const ini = (PERSON.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const hier = document.body.dataset.bereich || "personal";
    const UNTER = document.body.dataset.unter || "";
    const BETRIEB_UNTER = [["buchhaltung", "../betrieb/buchhaltung.html", "Buchhaltung"], ["bank", "../betrieb/bank.html", "Bank"], ["monitor", "../betrieb/", "Betriebsmonitor"],
      ["monat", "../betrieb/monat.html", "Auswertung Monat"], ["jahr", "../betrieb/jahr.html", "Auswertung Jahr"], ["abschluss", "../betrieb/abschluss.html", "Jahresabschluss"]];
    /* Menü nach Rechten: [Adresse, Titel, Symbol, aktiv, Klasse] */
    /* Auf-/Zuklappen der Unterpunkte (Personal, Betrieb) – eigene Wahl gemerkt, sonst offen, wenn man gerade darin ist */
    const AUF = lesen("bruell:nav-auf", {}), offen = (g, drin) => (g in AUF ? !!AUF[g] : drin);
    const nav = [], add = (h, t, i, an, kl, gruppe, eltern) => nav.push([h, t, i, an, kl, gruppe, eltern]);
    if (darf("uebersicht")) add("../", "Übersicht", "i-cockpit");
    if (darf("bad")) add("../bad/", "Bad", "i-projekte");
    if (darf("heizung")) add("../heizung/", "Heizung", "i-projekte");
    if (darf("personal")) {
      add("../personal/", "Personal", "i-konten", hier === "personal", "", darf("lohn") ? "personal" : "");
      if (darf("lohn")) add("../personal/lohn.html", "Lohnabrechnung", "i-lohn", hier === "lohn", "nav-unter", "", "personal");
    } else {
      if (eigeneKarte) add(eigeneKarte, "Meine Personalkarte", "i-konten", hier !== "lohn" && PK_NR === PERSON.pk);
      if (darf("lohn")) add("../personal/lohn.html", "Lohnabrechnung", "i-lohn", hier === "lohn");
      else if (LZ_FREI) add("../personal/lohn.html", "Lohnzettel", "i-lohn", hier === "lohn" || !!window.PK_NUR_LOHNZETTEL);
    }
    if (darf("fahrzeuge")) add("../fahrzeuge/", "Fahrzeuge", "i-einrichtung", hier === "fahrzeuge");
    if (darf("werkzeuge")) add("../lager/", "Werkzeuge", "i-werkzeug", hier === "werkzeuge");
    const bu = BETRIEB_UNTER.filter(([u]) => darf(u));
    if (darf("betrieb") && bu.length) {
      add(bu.some(([u]) => u === "monitor") ? "../betrieb/" : bu[0][1], "Betrieb", "i-kennzahlen", hier === "betrieb" && !UNTER, "", "betrieb");
      /* Unterpunkte (auf-/zuklappbar); unter „Bank“ die beiden Firmenkonten, sobald man im Bankbereich ist */
      bu.forEach(([u, h, t]) => {
        add(h, t, "i-unter", UNTER === u, "nav-unter", "", "betrieb");
        if (u === "bank" && /^bank/.test(UNTER)) { add("../betrieb/bank-sparkasse.html", "Sparkasse", "i-unter", UNTER === "bank-sparkasse", "nav-unter nav-unter2", "", "betrieb"); add("../betrieb/bank-raiba.html", "Raiffeisenbank", "i-unter", UNTER === "bank-raiba", "nav-unter nav-unter2", "", "betrieb"); }
      });
    }
    $("#rail").innerHTML = `<a class="marke" href="../${QS}"><img class="marke-logo" src="../bad/app/img/logo.svg" alt=""><span class="marke-text"><strong>Brüll GmbH</strong><small>${{ fahrzeuge: "Fahrzeuge", werkzeuge: "Werkzeuge", betrieb: "Betrieb", lohn: "Lohnabrechnung", konten: "Einstellungen" }[hier] || "Personal"}</small></span></a>
      <nav class="nav">${nav.map(([h, t, i, an, kl, gruppe, eltern]) => {
        const a = `<a href="${h.includes("?") ? h : h + QS}"${kl ? ` class="${kl}"` : ""}${an ? ' aria-current="page"' : ""}${eltern ? ` data-in="${eltern}"${offen(eltern, hier === (eltern === "personal" ? "lohn" : "betrieb") && !!UNTER || (eltern === "personal" && hier === "lohn")) ? "" : " hidden"}` : ""}><span class="nav-i ${i}" aria-hidden="true"></span>${t}</a>`;
        if (!gruppe) return a;
        const auf = offen(gruppe, gruppe === "personal" ? hier === "lohn" : hier === "betrieb" && !!UNTER);
        return `<div class="nav-gruppe">${a}<button type="button" class="nav-auf" data-gruppe="${gruppe}" aria-expanded="${auf}" aria-label="${t}: Unterpunkte ${auf ? "einklappen" : "aufklappen"}" title="${auf ? "Einklappen" : "Aufklappen"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>`;
      }).join("")}</nav>
      <div class="speicher"><div class="ich"><span class="ich-k">${esc(ini)}</span><span><b>${esc(PERSON.name)}</b><small>${esc(EBENE_TITEL[PERSON.ebene] || "")}</small></span></div>
        <div class="ich-aktionen">${R.einstellungenKnopf("../", hier === "konten")}<button class="btn klein hell" type="button" id="pw-aendern">Passwort ändern</button><button class="btn klein hell" type="button" id="abmelden">Abmelden</button></div>
        <p class="modus">${!GF ? (LZ_FREI ? "Lohnzettel hochladen freigegeben" : "Nur lesen") + (DEMO ? " · Demo" : "") : DEMO ? "Demo – Daten nur in diesem Browser" : hier === "betrieb" ? "Betriebszahlen – vertraulich" : "Personaldaten – vertraulich"}</p></div>`;
    $("#pw-aendern").addEventListener("click", () => window.BruellPasswort && window.BruellPasswort.oeffnen());
    $("#rail").addEventListener("click", (e) => {
      const b = e.target.closest(".nav-auf"); if (!b) return;
      const g = b.dataset.gruppe, auf = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", auf); b.title = auf ? "Einklappen" : "Aufklappen"; b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/(auf|ein)klappen$/, auf ? "einklappen" : "aufklappen"));
      document.querySelectorAll(`#rail [data-in="${g}"]`).forEach((x) => { x.hidden = !auf; });
      const s = lesen("bruell:nav-auf", {}); s[g] = auf; try { localStorage.setItem("bruell:nav-auf", JSON.stringify(s)); } catch (err) { /* egal */ }
    });
    $("#abmelden").addEventListener("click", async () => {
      if (window.BruellDB) await window.BruellDB.abmelden();      // Mac mini: auch die Datenbank-Sitzung beenden
      try { localStorage.removeItem("bruell:sitzung"); sessionStorage.removeItem("bruell:sitzung"); sessionStorage.setItem("bruell:zurueck", "1"); } catch (e) { /* egal */ }
      location.replace("../bad/" + QS);
    });
  }

  /* ---------- Demo-Mitarbeiter (frei erfunden) ---------- */
  const jahr = new Date().getFullYear();
  const urlaub = (gen) => JSON.stringify([...Array(5)].map((_, i) => { const y = jahr - 3 + i, g = y < jahr ? 30 : y === jahr ? gen : 0; return { year: String(y), anspruch: "30", genommen: String(g), rest: String(30 - g), uebertrag: "0", bemerk: "" }; }));
  const DEMO_MA = [
    { nr: 901, vorname: "Max", nachname: "Muster", position: "Monteur – Bad", abt: ["bad_sanitaer"], kuerzel: "MM", gz_soll: "173:20", gz_ist: "176:50", gen: 12, einstellung: "01.03.2019", stars: [4, 5, 4, 3, 4] },
    { nr: 902, vorname: "Erika", nachname: "Beispiel", position: "Büro – Bad", abt: ["buero", "bad_sanitaer"], kuerzel: "EB", gz_soll: "99:40", gz_ist: "98:55", gen: 18, einstellung: "15.08.2021", stars: [5, 5, 5, 5, 4] },
    { nr: 903, vorname: "Tom", nachname: "Vorlage", position: "Heizungsbauer", abt: ["heizung", "kundendienst"], kuerzel: "TV", gz_soll: "173:20", gz_ist: "171:20", gen: 22, einstellung: "01.09.2016", stars: [5, 4, 4, 4, 5] },
    { nr: 904, vorname: "Lena", nachname: "Probe", position: "Auszubildende", abt: ["ausbildung", "bad_sanitaer"], kuerzel: "LP", gz_soll: "173:20", gz_ist: "173:20", gen: 9, einstellung: "01.09.2025", stars: [3, 4, 5, 4, 4] },
  ];
  /* Echte Mitarbeiter vorladen: vollständig aus personal/daten-lokal.js (nur auf dem eigenen Rechner),
     sonst Name/Position/Abteilung aus personal/team.js. Vorhandene Karten werden nie überschrieben. */
  function mitarbeiterVorladen() {
    const quelle = window.PK_VOLL || window.PK_TEAM;
    if (!quelle) return false;
    for (const nr of ["901", "902", "903", "904"]) { const d = lesen("pk_" + nr, null); if (d && /@beispiel\.de$/.test(d.email || "")) localStorage.removeItem("pk_" + nr); }   // erfundene Demo-Mitarbeiter weg
    for (const [nr, d] of Object.entries(quelle)) {
      const alt = lesen("pk_" + nr, null);
      if (!alt) { try { localStorage.setItem("pk_" + nr, JSON.stringify(d)); } catch (e) { /* voll */ } }
      else if (window.PK_VOLL && Object.keys(alt).length < Object.keys(d).length) { try { localStorage.setItem("pk_" + nr, JSON.stringify({ ...d, ...alt })); } catch (e) { /* voll */ } }  // Teil-Karte aus team.js mit allen Daten ergänzen
    }
    return true;
  }
  /* Fahrzeuge aus den Personalkarten anlegen (fz_<Nr>, Format der alten Fahrzeugkarten).
     Zuordnung Pers.-Nr. → Fahrzeug-Nr. aus den Links „Fahrzeugkarte öffnen“ der alten Karten. */
  const FZ_ZUORDNUNG = { 34: 1, 2: 2, 31: 3, 46: 4, 21: 5, 50: 6, 51: 7, 37: 8, 1: 9 };
  const FZ_AUS_PK = [["fz_kennzeichen", "fz_kennzeichen"], ["fz_modell", "fz_modell"], ["fz_seit", "fz_zuweisung_seit"], ["fz_fuehrerschein", "fz_fuehrerschein"],
    ["fz_fs_gueltig", "fz_fs_gueltig"], ["fz_km", "fz_km"], ["fz_tuev", "fz_tuev"], ["fz_tankkarte", "fz_tankkarte"], ["fz_privatnutzung", "fz_privatnutzung"], ["fz_schaden", "fz_schaeden"]];
  function fahrzeugeVorladen() {
    /* Neuer Excel-Stand (werkzeuge/excel_import.py): Fahrzeuge + Kleidung einmalig übernehmen */
    const stand = window.DATEN_STAND;
    if (stand && localStorage.getItem("bruell:datenstand") !== stand) {
      for (const [nr, f] of Object.entries(window.FZ_VOLL || {})) {
        try { localStorage.setItem("fz_" + nr, JSON.stringify({ ...lesen("fz_" + nr, {}), ...f })); } catch (e) { /* voll */ }
      }
      for (const [nr, d] of Object.entries(window.PK_VOLL || {})) {
        const alt = lesen("pk_" + nr, null);
        if (alt && d._ak_table) { alt._ak_table = d._ak_table; try { localStorage.setItem("pk_" + nr, JSON.stringify(alt)); } catch (e) { /* voll */ } }
      }
      try { localStorage.setItem("bruell:datenstand", stand); } catch (e) { /* egal */ }
    }
    for (const [pnr, vnr] of Object.entries(FZ_ZUORDNUNG)) {
      if (localStorage.getItem("fz_" + vnr)) continue;
      const d = lesen("pk_" + pnr, null);
      if (!d || !d.fz_kennzeichen) continue;
      const fz = { fz_nr_intern: String(vnr).padStart(3, "0"), fz_fahrer: ((d.vorname || "") + " " + (d.nachname || "")).trim() };
      for (const [pk, f] of FZ_AUS_PK) if (d[pk]) fz[f] = d[pk];
      try { localStorage.setItem("fz_" + vnr, JSON.stringify(fz)); } catch (e) { /* voll */ }
    }
  }
  function demoAnlegen() {
    /* Mac mini (Datenbank): nur die Geschäftsführung bekommt die Vorlage (zum Übernehmen) – alle anderen sehen nur, was die DB freigibt */
    if (window.BruellDB && !GF) return;
    if (mitarbeiterVorladen()) return fahrzeugeVorladen();
    if (!DEMO || Object.keys(localStorage).some((k) => /^pk_\d+$/.test(k))) return;
    for (const m of DEMO_MA) {
      const [fach, zuv, team, kund, init] = m.stars, toMin = (v) => { const [h, mi] = v.split(":"); return +h * 60 + +mi; }, s = toMin(m.gz_ist) - toMin(m.gz_soll);
      const d = { vorname: m.vorname, nachname: m.nachname, position: m.position, kuerzel: m.kuerzel, einstellung: m.einstellung, regelarbeitszeit: m.gz_soll.startsWith("99") ? "23std" : "40std",
        stammlohnart: m.position.startsWith("Auszu") ? "azubi" : m.gz_soll.startsWith("99") ? "teilzeit" : "normalstunden", gz_soll: m.gz_soll, gz_ist: m.gz_ist, gz_saldo: (s < 0 ? "-" : "") + Math.floor(Math.abs(s) / 60) + ":" + String(Math.abs(s) % 60).padStart(2, "0"),
        krank: "2", abteilung_multi: JSON.stringify(m.abt), abteilung: m.abt[0], _urlaub: urlaub(m.gen), _kinder: "[]", _ak_table: JSON.stringify([["Arbeitshose", "AH-01", "Brüll Navy", "52", "2"], ["T-Shirt", "TS-02", "Logo", "L", "4"]]),
        _wz_table: "[]", _ak_bestellung_rows: "[]", stars_fach: fach, stars_zuv: zuv, stars_team: team, stars_kund: kund, stars_init: init, email: m.vorname.toLowerCase() + "@beispiel.de" };
      try { localStorage.setItem("pk_" + m.nr, JSON.stringify(d)); } catch (e) { /* voll */ }
    }
  }

  /* ---------- Mitarbeiterliste aus dem Speicher ---------- */
  const ABT = { inhaber: "👑 Inhaber", bad_sanitaer: "🛁 Bad", heizung: "🔥 Heizung", buero: "📁 Büro", kundendienst: "🔧 Kundendienst", ausbildung: "🎓 Ausbildung", meister: "⭐ Meister", buchhaltung: "💰 Buchhaltung", fliesen: "🪟 Fliesen" };
  function alle() {
    return Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
      .filter((x) => x.d && (x.d.vorname || x.d.nachname)).sort((a, b) => +a.nr - +b.nr);
  }
  /* Foto: selbst hochgeladen (ph_<Nr>) oder von der Website (personal/fotos) */
  const fotoVon = (nr) => localStorage.getItem("ph_" + nr) || (window.PK_FOTOS || {})[nr] || (((window.PK_TEAM || {})[nr] || {})._foto || "");
  function resturlaub(d) { try { const u = JSON.parse(d._urlaub || "[]").find((x) => +x.year === jahr); return u ? +u.rest : null; } catch (e) { return null; } }
  function liste() {
    const q = ($("#suche") && $("#suche").value || "").trim().toLowerCase();
    const l = alle().filter((x) => !q || [x.nr, x.d.vorname, x.d.nachname, x.d.position, x.d.kuerzel].join(" ").toLowerCase().includes(q));
    const aktiv = l.filter((x) => !x.d.austritt), weg = l.filter((x) => x.d.austritt);
    const karte = (x) => {
      const d = x.d, foto = fotoVon(x.nr), ini = ((d.vorname || "")[0] || "") + ((d.nachname || "")[0] || "");
      let abt = []; try { abt = JSON.parse(d.abteilung_multi || "[]"); } catch (e) { /* alt */ }
      const ru = resturlaub(d), saldo = d.gz_saldo || "";
      return `<a class="ma-karte${d.austritt ? " ausgetreten" : ""}" href="karte.html${qs({ nr: x.nr })}">
        <span class="ma-foto">${foto ? `<img src="${foto}" alt="">` : `<b>${esc(ini.toUpperCase())}</b>`}</span>
        <span class="ma-text"><b>${esc((d.vorname || "") + " " + (d.nachname || ""))}</b><small>${esc(d.position || "—")} · Nr. ${esc(x.nr)}</small>
          <span class="ma-chips">${abt.map((a) => `<i>${esc(ABT[a] || a)}</i>`).join("")}</span></span>
        <span class="ma-werte"><span><small>Gleitzeit</small><b class="${saldo.startsWith("-") ? "minus" : ""}">${esc(saldo || "–")}</b></span><span><small>Resturlaub ${jahr}</small><b>${ru == null ? "–" : ru + " T."}</b></span></span></a>`;
    };
    $("#liste").innerHTML = (aktiv.length ? `<div class="ma-raster">${aktiv.map(karte).join("")}</div>` : `<p class="ue-leer">${q ? "Keine Treffer." : "Noch keine Mitarbeiter – „+ Mitarbeiter“ oder „Alte Personalkarten importieren“."}</p>`)
      + (weg.length ? `<h2 class="ma-zwischen">Ausgeschieden</h2><div class="ma-raster">${weg.map(karte).join("")}</div>` : "");
    $("#anzahl").textContent = `${aktiv.length} ${aktiv.length === 1 ? "Mitarbeiter" : "Mitarbeiter"}${weg.length ? ` · ${weg.length} ausgeschieden` : ""}`;
  }

  /* ---------- Import alter Personalkarten (Dateien bleiben auf dem Rechner) ---------- */
  function importieren(dateien) {
    const status = $("#import-status"); let fertig = 0, ok = 0;
    status.textContent = `Importiere ${dateien.length} Karte(n) …`;
    const naechste = async (i) => {
      if (i >= dateien.length) { status.textContent = `✓ ${ok} von ${dateien.length} Karten importiert. Fotos bitte in der jeweiligen Karte hochladen.`; return liste(); }
      const f = dateien[i], text = await f.text(), m = text.match(/const SK = 'pk_(\d+)'/);
      if (!m) { fertig++; return naechste(i + 1); }
      const nr = m[1];
      if (localStorage.getItem("pk_" + nr) && !confirm(`Für Nr. ${nr} gibt es schon Daten. Mit der Datei „${f.name}“ überschreiben?`)) return naechste(i + 1);
      localStorage.removeItem("pk_" + nr);
      /* Die alte Karte läuft in einem unsichtbaren Rahmen und speichert sich mit ihrer eigenen Funktion */
      const html = text.replace("Browser-Speicher voll.\nBitte", "Browser-Speicher voll.\\nBitte")   /* Fehler der Original-Karten: Zeilenumbruch in Meldung … */
        .replace(/function addAkRow\(\)\{const tb=[^\n]*\n/, "function addAkRow(){\n")                   /* … und doppelte Zeile bei „Kleidung“ */
        .replace(/<script>\s*\/\* auto-localhost-redirect \*\/[\s\S]*?<\/script>/, "").replace(/<script src="[^"]*"><\/script>/g, "")
        .replace(/<img id="photoImg" src="[^"]*"/, '<img id="photoImg" src=""')
        + `<script>try{saveData()}catch(e){} parent.postMessage({typ:"pk-import",nr:"${nr}"},"*");</script>`;
      const fr = document.createElement("iframe"); fr.hidden = true; fr.setAttribute("aria-hidden", "true");
      const fertigMit = (e) => { if (e.source === fr.contentWindow && e.data && e.data.typ === "pk-import" && e.data.nr === nr) { window.removeEventListener("message", fertigMit); fr.remove(); if (localStorage.getItem("pk_" + nr)) ok++; naechste(i + 1); } };
      window.addEventListener("message", fertigMit);
      fr.srcdoc = html.replace(/<head>/i, "<head><script>function applyPendingQty(){}<\/script>");
      document.body.appendChild(fr);
    };
    naechste(0);
  }

  /* ---------- Zugang zum Dashboard für eine Personalkarte (nur Geschäftsführung) ----------
     Gleiches Kontoformat wie die Anmeldung in Bad/Heizung (bruell:konten, Prüfsumme statt Passwort).
     Neue Konten bekommen die Ebene „mitarbeiter“: nur die eigene Personalkarte, nur lesen. */
  const kontoEmail = (b) => { const x = String(b || "").trim().toLowerCase(); return x.includes("@") ? x : `${x}@konto.bad-dashboard.de`; };
  const zufall = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, n);
  async function pruefsumme(salz, pw) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salz + "|" + pw));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const startPasswort = () => { const z = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(10)); return [...r].map((b) => z[b % z.length]).join(""); };
  window.pkZugang = GF ? {
    konto: kontoVon,
    titel: (e) => EBENE_TITEL[e] || e || "",
    /* Benutzername = Kürzel aus der Personalkarte (z. B. „DB“ für Daniel Brüll), sonst Anfangsbuchstaben */
    vorschlag: (vorname, nachname, kuerzel) => String(kuerzel || "").trim().toUpperCase() || (norm(vorname).replace(/[^a-z]/g, "").slice(0, 1) + norm(nachname).replace(/[^a-z]/g, "").slice(0, 1)).toUpperCase(),
    async anlegen(nr, benutzer, name) {
      benutzer = String(benutzer || "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{2,}$/.test(benutzer)) throw new Error("Benutzername: mindestens 2 Zeichen, nur Buchstaben a–z, Ziffern, Punkt, Strich.");
      const l = lesen("bruell:konten", []), email = kontoEmail(benutzer);
      if (l.some((k) => k.email === email)) throw new Error("Benutzername schon vergeben.");
      const pw = startPasswort(), salz = zufall(24);
      l.push({ email, benutzer, id: "pk-" + nr, pk: String(nr), ebene: "mitarbeiter", name, formulare: [], salz, hash: await pruefsumme(salz, pw), aktiv: true, mussAendern: true });
      localStorage.setItem("bruell:konten", JSON.stringify(l));
      return pw;
    },
    async zuruecksetzen(email) {
      const l = lesen("bruell:konten", []), k = l.find((x) => x.email === email); if (!k) throw new Error("Konto nicht gefunden.");
      const pw = startPasswort(); k.salz = zufall(24); k.hash = await pruefsumme(k.salz, pw); k.mussAendern = true;
      localStorage.setItem("bruell:konten", JSON.stringify(l)); return pw;
    },
    /* Freigabe „Lohnzettel hochladen“ */
    lohnzettel(email, an) {
      const l = lesen("bruell:konten", []), k = l.find((x) => x.email === email); if (!k) return;
      k.lohnzettel = !!an; localStorage.setItem("bruell:konten", JSON.stringify(l));
    },
    alle: () => lesen("bruell:konten", []),
    aktiv(email, an) {
      const l = lesen("bruell:konten", []), k = l.find((x) => x.email === email); if (!k) return;
      if (k.email === PERSON.email) throw new Error("Das eigene Konto kann nicht gesperrt werden.");
      k.aktiv = an; localStorage.setItem("bruell:konten", JSON.stringify(l));
    },
  } : null;
  /* Mac mini (Datenbank): Zugänge liegen in Supabase – gleiche Bedienung, aber über die Datenbank-Funktionen.
     Die Kontenliste (konten_liste) wird zwischengespeichert, damit die Karte sofort zeigen kann, ob es einen Zugang gibt. */
  if (window.pkZugang && window.BruellDB) {
    const sb = window.BruellDB.sb, KL = "bruell:konten-db";
    const liste = () => lesen(KL, []);
    const laden = async () => { const { data, error } = await sb.rpc("konten_liste"); if (error) throw error; try { localStorage.setItem(KL, JSON.stringify(data || [])); } catch (e) { /* voll */ } if (window.zugangZeichnen) window.zugangZeichnen(); return data; };
    const pruefen = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
    Object.assign(window.pkZugang, {
      konto: (nr) => liste().find((k) => String(k.pk || "") === String(nr)) || null,
      alle: liste,
      async anlegen(nr, benutzer, name) {
        benutzer = String(benutzer || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{2,}$/.test(benutzer)) throw new Error("Benutzername: mindestens 2 Zeichen, nur Buchstaben a–z, Ziffern, Punkt, Strich.");
        if (liste().some((k) => String(k.benutzer).toLowerCase() === benutzer)) throw new Error("Benutzername schon vergeben.");
        const pw = startPasswort();
        pruefen(await sb.rpc("konto_anlegen", { p_benutzer: benutzer, p_passwort: pw, p_id: "pk-" + nr, p_ebene: "mitarbeiter", p_name: name, p_formulare: [] }));
        pruefen(await sb.rpc("konto_personal", { p_email: kontoEmail(benutzer), p_pk: String(nr), p_lohnzettel: false }));
        await laden(); return pw;
      },
      async zuruecksetzen(email) { const pw = startPasswort(); pruefen(await sb.rpc("konto_passwort_zuruecksetzen", { p_email: email, p_passwort: pw })); await laden(); return pw; },
      async lohnzettel(email, an) { const k = liste().find((x) => x.email === email); if (!k) return; pruefen(await sb.rpc("konto_personal", { p_email: email, p_pk: k.pk || null, p_lohnzettel: !!an })); await laden(); },
      async aktiv(email, an) {
        if (email === PERSON.email) throw new Error("Das eigene Konto kann nicht gesperrt werden.");
        pruefen(await sb.rpc("konto_aktiv", { p_email: email, p_aktiv: !!an })); await laden();
      },
    });
    window.BruellDB.fertig.then((r) => r && r.angemeldet && laden()).catch((e) => console.warn("Konten:", e));
  }

  /* ---------- Personalkarte: Kopfzeile aus den Daten ---------- */
  window.pkKopfAktualisieren = function () {
    const v = (id) => (document.getElementById(id) || {}).value || "";
    const name = (v("vorname") + " " + v("nachname")).trim() || "Neue Mitarbeiterin / neuer Mitarbeiter";
    const setz = (sel, t) => document.querySelectorAll(sel).forEach((el) => { el.textContent = t; });
    setz(".header-name", name); setz(".tb-title", name); setz(".header-position", v("position")); setz(".header-nr", "Pers.-Nr. " + PK_NR); setz(".tb-nr", "Nr. " + PK_NR);
    setz(".photo-initials", ((v("vorname")[0] || "") + (v("nachname")[0] || "")).toUpperCase() || "?");
    document.title = "Brüll · Personalkarte · " + name;
    const back = document.querySelector(".back-btn"); if (back) back.href = "./" + QS;
    const img = document.getElementById("photoImg"), f = fotoVon(PK_NR);
    /* „Fahrzeugkarte öffnen“ → Fahrzeug-Bereich (oder zuweisen, wenn keins da ist) */
    const fzLink = document.querySelector('.pk-card a[href*="fahrzeuge/"]');
    if (fzLink) {
      const n = name.toLowerCase(), key = Object.keys(localStorage).find((k) => /^fz_\d+$/.test(k) && (lesen(k, {}).fz_fahrer || "").trim().toLowerCase() === n);
      fzLink.removeAttribute("target");
      fzLink.href = key ? "../fahrzeuge/karte.html" + qs({ nr: key.slice(3) }) : "../fahrzeuge/" + QS;
      fzLink.textContent = key ? "🚐 Fahrzeugkarte öffnen" : "🚐 Fahrzeug zuweisen";
    }
    if (img && f && !img.getAttribute("src")) { img.src = f; img.style.display = "block"; const ph = document.getElementById("ph"); if (ph) ph.style.display = "none"; }
  };

  /* ---------- Start ---------- */
  leiste();
  demoAnlegen();
  if ($("#liste")) {
    liste();
    $("#suche").addEventListener("input", liste);
    $("#neu").addEventListener("click", () => {
      const max = Math.max(0, ...Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => +k.slice(3)).filter((n) => n < 900));
      location.href = "karte.html" + qs({ nr: max + 1 });
    });
    $("#import").addEventListener("change", (e) => { if (e.target.files.length) importieren([...e.target.files]); e.target.value = ""; });
  }
  if (document.body.classList.contains("karte-seite")) {
    document.addEventListener("input", (e) => { if (["vorname", "nachname", "position"].includes(e.target.id)) window.pkKopfAktualisieren(); });
    /* Abteilungs-Chips → Position (z. B. Ausbildung + Heizung = „Azubi – Heizung“) */
    const ROLLE = [["inhaber", "Inhaber"], ["meister", "Meister"], ["ausbildung", "Azubi"], ["buero", "Büro"], ["buchhaltung", "Buchhaltung"], ["kundendienst", "Kundendienst"]];
    const BEREICH = [["bad_sanitaer", "Bad"], ["heizung", "Heizung"], ["fliesen", "Fliesen"]];
    document.addEventListener("change", (e) => {
      if (e.target.name !== "abt") return;
      const an = [...document.querySelectorAll('input[name="abt"]:checked')].map((c) => c.value);
      const teile = [...ROLLE, ...BEREICH].filter(([k]) => an.includes(k)).map(([, t]) => t);
      const pos = document.getElementById("position");
      if (pos) { pos.value = teile.join(" – "); window.pkKopfAktualisieren(); }
    });
    window.addEventListener("beforeunload", () => { /* Hinweis: Speichern mit 💾 */ });
  }
})();
