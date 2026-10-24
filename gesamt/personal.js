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

  /* ---------- Anmeldung: nur Geschäftsführung ---------- */
  function ich() {
    let email = null;
    try { email = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (e) { /* egal */ }
    email = email || lesen("bruell:sitzung", null);
    const k = email && lesen("bruell:konten", []).find((x) => x.email === email && x.aktiv !== false);
    return k ? { id: k.id, name: k.name || k.benutzer, ebene: k.ebene } : null;
  }
  const PERSON = ich();
  if (!PERSON) { try { sessionStorage.setItem("bruell:zurueck", "1"); } catch (e) { /* egal */ } location.replace("../bad/" + QS); return; }
  if (PERSON.ebene !== "geschaeftsfuehrung") { location.replace("../" + QS); return; }

  /* ---------- Leiste ---------- */
  function leiste() {
    const ini = (PERSON.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const nav = [["../", "Übersicht", "i-cockpit"], ["../bad/", "Bad", "i-projekte"], ["../heizung/", "Heizung", "i-projekte"], ["./", "Personal", "i-konten", true]];
    $("#rail").innerHTML = `<a class="marke" href="../${QS}"><img class="marke-logo" src="../bad/app/img/logo.svg" alt=""><span class="marke-text"><strong>Brüll GmbH</strong><small>Personal</small></span></a>
      <nav class="nav">${nav.map(([h, t, i, an]) => `<a href="${h}${QS}"${an ? ' aria-current="page"' : ""}><span class="nav-i ${i}" aria-hidden="true"></span>${t}</a>`).join("")}</nav>
      <div class="speicher"><div class="ich"><span class="ich-k">${esc(ini)}</span><span><b>${esc(PERSON.name)}</b><small>Geschäftsführung</small></span></div>
        <div class="ich-aktionen"><button class="btn klein hell" type="button" id="abmelden">Abmelden</button></div>
        <p class="modus">${DEMO ? "Demo – Daten nur in diesem Browser" : "Personaldaten – vertraulich"}</p></div>`;
    $("#abmelden").addEventListener("click", () => {
      try { localStorage.removeItem("bruell:sitzung"); sessionStorage.removeItem("bruell:sitzung"); sessionStorage.setItem("bruell:zurueck", "1"); } catch (e) { /* egal */ }
      location.replace("../bad/" + QS);
    });
  }

  /* ---------- Demo-Mitarbeiter (frei erfunden) ---------- */
  const jahr = new Date().getFullYear();
  const urlaub = (gen) => JSON.stringify([...Array(5)].map((_, i) => { const y = jahr - 3 + i, g = y < jahr ? 30 : y === jahr ? gen : 0; return { year: String(y), anspruch: "30", genommen: String(g), rest: String(30 - g), uebertrag: "0", bemerk: "" }; }));
  const DEMO_MA = [
    { nr: 901, vorname: "Max", nachname: "Muster", position: "Monteur – Bad", abt: ["bad_sanitaer"], kuerzel: "MM", gz_soll: "40:00", gz_ist: "43:30", gen: 12, einstellung: "01.03.2019", stars: [4, 5, 4, 3, 4] },
    { nr: 902, vorname: "Erika", nachname: "Beispiel", position: "Büro – Bad", abt: ["buero", "bad_sanitaer"], kuerzel: "EB", gz_soll: "23:00", gz_ist: "22:15", gen: 18, einstellung: "15.08.2021", stars: [5, 5, 5, 5, 4] },
    { nr: 903, vorname: "Tom", nachname: "Vorlage", position: "Heizungsbauer", abt: ["heizung", "kundendienst"], kuerzel: "TV", gz_soll: "40:00", gz_ist: "38:00", gen: 22, einstellung: "01.09.2016", stars: [5, 4, 4, 4, 5] },
    { nr: 904, vorname: "Lena", nachname: "Probe", position: "Auszubildende", abt: ["ausbildung", "bad_sanitaer"], kuerzel: "LP", gz_soll: "40:00", gz_ist: "40:00", gen: 9, einstellung: "01.09.2025", stars: [3, 4, 5, 4, 4] },
  ];
  function demoAnlegen() {
    if (!DEMO || Object.keys(localStorage).some((k) => /^pk_\d+$/.test(k))) return;
    for (const m of DEMO_MA) {
      const [fach, zuv, team, kund, init] = m.stars, toMin = (v) => { const [h, mi] = v.split(":"); return +h * 60 + +mi; }, s = toMin(m.gz_ist) - toMin(m.gz_soll);
      const d = { vorname: m.vorname, nachname: m.nachname, position: m.position, kuerzel: m.kuerzel, einstellung: m.einstellung, regelarbeitszeit: m.gz_soll.startsWith("23") ? "23std" : "40std",
        stammlohnart: m.position.startsWith("Auszu") ? "azubi" : m.gz_soll.startsWith("23") ? "teilzeit" : "normalstunden", gz_soll: m.gz_soll, gz_ist: m.gz_ist, gz_saldo: (s < 0 ? "-" : "") + Math.floor(Math.abs(s) / 60) + ":" + String(Math.abs(s) % 60).padStart(2, "0"),
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
  function resturlaub(d) { try { const u = JSON.parse(d._urlaub || "[]").find((x) => +x.year === jahr); return u ? +u.rest : null; } catch (e) { return null; } }
  function liste() {
    const q = ($("#suche") && $("#suche").value || "").trim().toLowerCase();
    const l = alle().filter((x) => !q || [x.nr, x.d.vorname, x.d.nachname, x.d.position, x.d.kuerzel].join(" ").toLowerCase().includes(q));
    const aktiv = l.filter((x) => !x.d.austritt), weg = l.filter((x) => x.d.austritt);
    const karte = (x) => {
      const d = x.d, foto = localStorage.getItem("ph_" + x.nr), ini = ((d.vorname || "")[0] || "") + ((d.nachname || "")[0] || "");
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

  /* ---------- Personalkarte: Kopfzeile aus den Daten ---------- */
  window.pkKopfAktualisieren = function () {
    const v = (id) => (document.getElementById(id) || {}).value || "";
    const name = (v("vorname") + " " + v("nachname")).trim() || "Neue Mitarbeiterin / neuer Mitarbeiter";
    const setz = (sel, t) => document.querySelectorAll(sel).forEach((el) => { el.textContent = t; });
    setz(".header-name", name); setz(".tb-title", name); setz(".header-position", v("position")); setz(".header-nr", "Pers.-Nr. " + PK_NR); setz(".tb-nr", "Nr. " + PK_NR);
    setz(".photo-initials", ((v("vorname")[0] || "") + (v("nachname")[0] || "")).toUpperCase() || "?");
    document.title = "Brüll · Personalkarte · " + name;
    const back = document.querySelector(".back-btn"); if (back) back.href = "./" + QS;
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
    window.addEventListener("beforeunload", () => { /* Hinweis: Speichern mit 💾 */ });
  }
})();
