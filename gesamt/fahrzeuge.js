/* ==========================================================================
   Brüll Dashboard – Fahrzeuge (nur Geschäftsführung)
   --------------------------------------------------------------------------
   • fahrzeuge/index.html  → Fuhrpark (Kennzeichen, Fahrer, HU/TÜV, Führerschein)
   • fahrzeuge/karte.html  → Fahrzeugkarte ?nr=<Fahrzeug-Nr.>
   Speicherformat der alten Fahrzeugkarten: fz_<Nr>. Die Personalkarte gleicht sich über
   fz_fahrer („Vorname Nachname“) automatisch ab. Anmeldung + Leiste kommen aus personal.js.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const QS = location.search.replace(/[?&]nr=\d+/, "").replace(/^&/, "?");
  const qs = (extra) => { const p = new URLSearchParams(QS); for (const [k, v] of Object.entries(extra || {})) p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };
  const inhalt = $("#fz-inhalt");
  if (!inhalt || !$("#rail").innerHTML) return;            // nicht angemeldet → personal.js leitet um

  /* ---------- Daten ---------- */
  const alle = () => Object.keys(localStorage).filter((k) => /^fz_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
    .filter((x) => x.d && (x.d.fz_kennzeichen || x.d.fz_modell)).sort((a, b) => +a.nr - +b.nr);
  const mitarbeiter = () => Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
    .filter((x) => x.d && (x.d.vorname || x.d.nachname) && !x.d.austritt)
    .map((x) => ({ nr: x.nr, name: ((x.d.vorname || "") + " " + (x.d.nachname || "")).trim() })).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const personZu = (name) => mitarbeiter().find((m) => m.name.toLowerCase() === String(name || "").trim().toLowerCase());
  const fotoVon = (nr) => localStorage.getItem("ph_" + nr) || (window.PK_FOTOS || {})[nr] || (((window.PK_TEAM || {})[nr] || {})._foto ? "../personal/" + window.PK_TEAM[nr]._foto : "");

  /* Datum TT.MM.JJJJ (oder JJJJ-MM-TT) → Ampel: überfällig / in 60 Tagen / ok */
  function frist(wert) {
    const s = String(wert || "").trim(); if (!s) return null;
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/), d;
    if (m) d = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = new Date(+m[1], +m[2] - 1, +m[3]);
    else if ((m = s.match(/^(\d{1,2})[./](\d{4})$/))) d = new Date(+m[2], +m[1], 0);      // „03/2027“ → Monatsende
    if (!d || isNaN(d)) return { text: s, stufe: "" };
    const tage = Math.round((d - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return { text: s, tage, stufe: tage < 0 ? "rot" : tage <= 60 ? "gelb" : "gruen", hinweis: tage < 0 ? `seit ${-tage} T. überfällig` : tage <= 60 ? `in ${tage} T.` : "" };
  }
  /* ---------- Tanken (DKV, aus werkzeuge/dkv-eingang.js) ---------- */
  const TANKEN = window.FZ_TANKEN || {};
  const eur = (n) => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const MONAT = (iso) => new Date(iso.slice(0, 7) + "-01T12:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  function tankMonate(nr) {                              // [{ monat: "2026-10", n, liter, eur }] – neuester zuerst; AdBlue, Wäsche … nur im Betrag
    const m = {};
    for (const b of TANKEN[nr] || []) { const k = (b.datum || "").slice(0, 7); const x = (m[k] = m[k] || { monat: k, n: 0, liter: 0, eur: 0 }); if (/diesel|super|benzin|e10|e5|lpg|autogas|strom/i.test(b.produkt || "Diesel")) { x.n++; x.liter += b.menge || 0; } x.eur += b.betrag || 0; }
    return Object.values(m).sort((a, b) => (a.monat < b.monat ? 1 : -1));
  }
  /* Kilometerstand aus den DKV-Buchungen in die Fahrzeugkarte übernehmen (nur wenn höher als der bisherige) */
  for (const [nr, liste] of Object.entries(TANKEN)) {
    const key = "fz_" + nr, d = lesen(key, null); if (!d) continue;
    const letzte = liste.filter((b) => b.km).sort((a, b) => (a.datum < b.datum ? -1 : 1)).pop();
    if (letzte && letzte.km > (Number(d.fz_km) || 0) && letzte.km - (Number(d.fz_km) || 0) < 50000) {
      d.fz_km = String(letzte.km); d.fz_km_datum = letzte.datum;
      try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* voll */ }
    }
  }

  const AUGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const AUGE_ZU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/></svg>';

  const fristChip = (titel, wert) => { const f = frist(wert); return `<span class="fz-frist ${f ? f.stufe : ""}"><small>${titel}</small><b>${esc(f ? f.text : "–")}</b>${f && f.hinweis ? `<em>${esc(f.hinweis)}</em>` : ""}</span>`; };

  /* ---------- Fuhrpark-Liste ---------- */
  function liste() {
    const q = ($("#fz-suche") && $("#fz-suche").value || "").trim().toLowerCase();
    const l = alle().filter((x) => !q || [x.nr, x.d.fz_kennzeichen, x.d.fz_modell, x.d.fz_fahrer].join(" ").toLowerCase().includes(q))
      .sort((a, b) => !!a.d.fz_ausgeblendet - !!b.d.fz_ausgeblendet);                    // ausgeblendete ans Ende
    const aus = alle().filter((x) => x.d.fz_ausgeblendet).length;
    const faellig = alle().filter((x) => !x.d.fz_ausgeblendet).filter((x) => ["rot", "gelb"].includes((frist(x.d.fz_tuev) || {}).stufe) || ["rot", "gelb"].includes((frist(x.d.fz_fs_gueltig) || {}).stufe));
    $("#fz-anzahl").textContent = `${alle().length - aus} Fahrzeuge im Bestand${aus ? ` · ${aus} ausgeblendet` : ""}${faellig.length ? ` · ${faellig.length} mit Frist in den nächsten 60 Tagen` : ""}`;
    $("#fz-liste").innerHTML = l.length ? `<div class="ma-raster">${l.map(({ nr, d }) => {
      const p = personZu(d.fz_fahrer), foto = p && fotoVon(p.nr), ini = (d.fz_fahrer || "").split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
      const zu = !!d.fz_ausgeblendet, t = tankMonate(nr)[0];
      return `<div class="fz-huelle${zu ? " zu" : ""}"><a class="ma-karte fz-karte" href="karte.html${qs({ nr })}">
        <span class="fz-schild"><i>D</i>${esc(d.fz_kennzeichen || "ohne Kennz.")}</span>
        <span class="ma-text"><b>${esc(d.fz_modell || "Fahrzeug")}</b><small>${d.fz_typ ? `<span class="fz-art">${esc(d.fz_typ)}${d.fz_status ? " · " + esc(d.fz_status) : ""}</span> ` : ""}Fz.-Nr. ${esc(d.fz_nr_intern || String(nr).padStart(3, "0"))}${d.fz_km ? ` · ${esc(Number(d.fz_km).toLocaleString("de-DE"))} km` : ""}${zu ? " · nicht mehr im Bestand" : ""}</small>${t && !zu ? `<small class="fz-tank-kurz">⛽ ${esc(MONAT(t.monat))}: ${t.n}× getankt · ${eur(t.eur)}</small>` : ""}</span>
        <span class="fz-fahrer">${d.fz_fahrer ? `<span class="ma-foto klein">${foto ? `<img src="${esc(foto)}" alt="">` : `<b>${esc(ini)}</b>`}</span><span>${esc(d.fz_fahrer)}</span>` : `<span class="leise">Kein Fahrer zugewiesen</span>`}</span>
        <span class="ma-werte">${fristChip("HU / TÜV", d.fz_tuev)}${d.fz_typ === "Anhänger" ? "" : fristChip("Führerschein bis", d.fz_fs_gueltig)}${d.fz_leasing_ende ? fristChip("Leasing-Ende", d.fz_leasing_ende) : ""}</span></a>
        <button class="fz-auge" type="button" data-nr="${nr}" aria-pressed="${zu}" title="${zu ? "Wieder einblenden" : "Ausblenden (nicht mehr im Bestand)"}" aria-label="${esc(d.fz_kennzeichen || "Fahrzeug")} ${zu ? "einblenden" : "ausblenden"}">${zu ? AUGE_ZU : AUGE}</button></div>`;
    }).join("")}</div>` : `<p class="ue-leer">${q ? "Keine Treffer." : "Noch keine Fahrzeuge – „+ Fahrzeug“ anlegen."}</p>`;
  }
  function offenHinweis() {
    const o = window.FZ_TANKEN_OFFEN || [];
    if (!o.length) return "";
    return `<details class="fz-offen"><summary><b>⛽ ${o.length} Tankvorgang${o.length > 1 ? "e" : ""} aus der DKV-Rechnung keinem Fahrzeug zugeordnet</b>
        <span class="leise">Kennzeichen bzw. DKV-Karten-Nr. in der Fahrzeugkarte prüfen</span></summary>
      <table class="fz-tank-tab"><thead><tr><th>Datum</th><th>Karte / Kennzeichen</th><th>Ware</th><th class="r">Liter</th><th class="r">Betrag</th></tr></thead><tbody>
      ${o.map((b) => `<tr><td>${esc(b.datum.split("-").reverse().join("."))}</td><td>${esc(b.kennz || b.karte || "–")}</td><td>${esc(b.produkt || "")}</td><td class="r">${b.menge != null ? esc(b.menge.toLocaleString("de-DE")) : "–"}</td><td class="r">${eur(b.betrag)}</td></tr>`).join("")}</tbody></table></details>`;
  }
  function listeSeite() {
    inhalt.innerHTML = `<header class="kopf"><div><p class="eyebrow">Fuhrpark · vertraulich</p><h1>Fahrzeuge</h1><p class="unter leise" id="fz-anzahl"></p></div>
        <div class="kopf-aktionen"><input class="eingabe" type="search" id="fz-suche" placeholder="Kennzeichen, Modell, Fahrer …" aria-label="Fahrzeuge suchen">
          <button class="btn jetzt" type="button" id="fz-neu">+ Fahrzeug</button></div></header>
      ${offenHinweis()}<div id="fz-liste"></div>`;
    document.title = "Brüll · Fahrzeuge";
    liste();
    $("#fz-suche").addEventListener("input", liste);
    $("#fz-liste").addEventListener("click", (e) => {
      const b = e.target.closest(".fz-auge"); if (!b) return;
      const key = "fz_" + b.dataset.nr, d = lesen(key, {});
      if (d.fz_ausgeblendet) delete d.fz_ausgeblendet; else d.fz_ausgeblendet = new Date().toISOString().slice(0, 10);
      try { localStorage.setItem(key, JSON.stringify(d)); } catch (x) { return; }
      try { new BroadcastChannel("bruell_fz").postMessage({ type: "fz_saved", nr: b.dataset.nr }); } catch (x) { /* alt */ }
      liste();
      const neu = $(`.fz-auge[data-nr="${b.dataset.nr}"]`); if (neu) neu.focus();
    });
    $("#fz-neu").addEventListener("click", () => {
      const max = Math.max(0, ...Object.keys(localStorage).filter((k) => /^fz_\d+$/.test(k)).map((k) => +k.slice(3)));
      location.href = "karte.html" + qs({ nr: max + 1 });
    });
  }

  /* ---------- Fahrzeugkarte (Reiter wie die alten Fahrzeugkarten) ---------- */
  const JN = ["", "Ja", "Nein"];
  const REITER = [
    ["fz", "🚗 Fahrzeug", [
      ["Fahrzeugidentifikation", [["fz_kennzeichen", "Kennzeichen"], ["fz_modell", "Fahrzeugtyp / Modell"], ["fz_typ", "Fahrzeugkategorie", ["", "Transporter", "PKW", "LKW", "Anhänger"]], ["fz_status", "Leasing / Eigentum", ["", "Leasing", "Eigentum", "Miete"]],
        ["fz_nr_intern", "Fahrzeug-Nr. (intern)"], ["fz_km", "Kilometerstand", "number"], ["fz_fin", "Fahrgestellnummer (FIN)"]]],
      ["Fahrer & Führerschein", [["fz_fahrer", "Fahrer", "fahrer"], ["fz_zuweisung_seit", "Zugewiesen seit", "datum"], ["fz_fuehrerschein", "Führerschein Klasse"], ["fz_fs_gueltig", "Führerschein gültig bis", "datum"], ["fz_privatnutzung", "Privatnutzung erlaubt", JN]]]]],
    ["kosten", "💶 Leasing & Vers.", [
      ["Leasing & Steuer", [["fz_leasingrate", "Leasingrate / Monat (€)"], ["fz_steuer", "Kfz-Steuer / Jahr (€)"], ["fz_leasing_nr", "Leasing-Vertragsnr."], ["fz_leasing_ende", "Leasing-Ende", "datum"]]],
      ["Versicherung", [["fz_vers_beitrag", "Beitrag ½-jährlich (€)"], ["fz_vers_nr", "Versicherungs-Nr."], ["fz_versicherungsgeber", "Versicherer"]]]]],
    ["kraftstoff", "⛽ Kraftstoff", [
      ["DKV-Tankkarte", [["fz_tankkarte", "Tankkarte vorhanden", JN], ["fz_dkv", "DKV-/Tankkarten-Nr."], ["fz_kraftstoff", "Kraftstoffart", ["", "Diesel", "Benzin", "Elektro", "Hybrid"]]]],
      "tank", ["_fz_verbrauch", "Kraftstoffverbrauch (von Hand)", [["Datum", "datum"], ["Liter", "zahl"], ["Betrag (€)", "zahl"], ["Tankstelle"], ["Bemerkung"]]]]],
    ["wartung", "🔧 Wartung", [
      ["HU / TÜV & Kundendienst", [["fz_tuev", "Nächste HU / TÜV", "datum"], ["fz_kundendienst", "Nächster Kundendienst", "datum"], ["fz_reifen", "Reifengröße"], ["fz_winterreifen", "Winterreifen aufgezogen am", "datum"]]],
      ["_fz_wartung", "Wartungshistorie", [["Datum", "datum"], ["Art", ["", "Inspektion", "HU / TÜV", "Reparatur", "Reifenwechsel", "Kundendienst", "Sonstiges"]], ["Werkstatt"], ["Kosten (€)", "zahl"], ["Bemerkung"]]]]],
    ["notizen", "📝 Notizen", [["text", "fz_schaeden", "Schäden & Mängel", "Bekannte Schäden, Unfälle, offene Mängel …"], ["text", "fz_notizen", "Allgemeine Bemerkungen", "Notizen zum Fahrzeug …"]]],
    ["dokumente", "📄 Dokumente", [["_fz_dokumente", "Dokumente & Schriftverkehr", [["Datum", "datum"], ["Typ", ["", "Rechnung", "Vertrag", "Schadenmeldung", "Gutachten", "Fahrzeugschein", "Sonstiges"]], ["Bezeichnung"], ["Betrag (€)", "zahl"], ["Ablage / Dateipfad"], ["Notiz"]], { datei: true }]]],
  ];
  const tabelleLesen = (d, k) => { try { const x = JSON.parse(d[k] || "[]"); return Array.isArray(x) ? x : []; } catch (e) { return []; } };
  function tankBlock(nr) {
    const mon = tankMonate(nr), liste = (TANKEN[nr] || []).slice().sort((a, b) => (a.datum < b.datum ? 1 : -1));
    if (!mon.length) return `<div class="sec">Tankvorgänge (DKV)</div><p class="leise klein-text">Noch keine DKV-Buchungen – sobald der DKV-Abruf läuft, erscheinen sie hier automatisch.</p>`;
    const d = lesen("fz_" + nr, {});
    return `<div class="sec">Tankvorgänge (DKV)</div>
      <p class="leise klein-text">Automatisch aus den DKV-Rechnungen${d.fz_km_datum ? ` · Kilometerstand laut DKV vom ${esc(d.fz_km_datum.split("-").reverse().join("."))}` : ""}</p>
      <div class="fz-tank-monate">${mon.slice(0, 6).map((m) => `<div><small>${esc(MONAT(m.monat))}</small><b>${m.n}× getankt</b><span>${eur(m.eur)}${m.liter ? ` · ${m.liter.toLocaleString("de-DE", { maximumFractionDigits: 1 })} l` : ""}</span></div>`).join("")}</div>
      <details class="fz-tank-details"><summary>Alle ${liste.length} Tankvorgänge anzeigen</summary>
      <table class="fz-tank-tab"><thead><tr><th>Datum</th><th>Ware</th><th class="r">Liter</th><th class="r">Betrag</th><th class="r">km-Stand</th></tr></thead><tbody>
      ${liste.map((b) => `<tr><td>${esc(b.datum.split("-").reverse().join("."))}</td><td>${esc(b.produkt || "")}</td><td class="r">${b.menge != null ? esc(b.menge.toLocaleString("de-DE")) : "–"}</td><td class="r">${eur(b.betrag)}</td><td class="r">${b.km ? esc(b.km.toLocaleString("de-DE")) : "–"}</td></tr>`).join("")}</tbody></table></details>`;
  }
  function karteSeite() {
    const nr = (new URLSearchParams(location.search).get("nr") || "").replace(/\D/g, "");
    if (!nr) { location.replace("./" + QS); return; }
    const key = "fz_" + nr, d = lesen(key, {}), neu = !localStorage.getItem(key);
    if (neu) d.fz_nr_intern = String(nr).padStart(3, "0");
    const ma = mitarbeiter();
    const auswahl = (o, v, attr) => `<select class="eingabe" ${attr}>${o.map((x) => `<option value="${esc(x)}"${x === v ? " selected" : ""}>${x || "– bitte wählen –"}</option>`).join("")}${v && !o.includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
    const feld = ([id, label, art]) => {
      const v = d[id] ?? "";
      let el;
      if (Array.isArray(art)) el = auswahl(art, v, `id="${id}"`);
      else if (art === "fahrer") el = `<select class="eingabe" id="${id}"><option value="">– niemand –</option>${ma.map((m) => `<option${m.name.toLowerCase() === String(v).trim().toLowerCase() ? " selected" : ""}>${esc(m.name)}</option>`).join("")}${v && !personZu(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
      else el = `<input class="eingabe" id="${id}" type="${art === "number" ? "number" : "text"}"${art === "datum" ? ' placeholder="TT.MM.JJJJ" inputmode="numeric"' : ""} value="${esc(v)}">`;
      return `<label class="form-group"><span>${label}</span>${el}</label>`;
    };
    /* Tabellen (Verbrauch, Wartung, Dokumente): Zeilen bearbeiten, + Zeile, × löschen */
    const zelle = (sp, v) => Array.isArray(sp[1]) ? auswahl(sp[1], v, "") : `<input class="eingabe" type="text" value="${esc(v)}"${sp[1] === "datum" ? ' placeholder="TT.MM.JJJJ" inputmode="numeric"' : sp[1] === "zahl" ? ' inputmode="decimal"' : ""}>`;
    /* Datei-Zelle (nur Dokumente): versteckt Zeilen-ID + Dateiname, Datei liegt über gesamt/dateien.js unter „fz:<Nr>:<ID>“ */
    const neueId = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const dateiZelle = (id, name) => `<td class="fz-datei"><input type="hidden" data-zid value="${esc(id)}"><input type="hidden" data-zname value="${esc(name)}">${name ? `<button type="button" class="btn klein still" data-datei-oeffnen title="Öffnen">📄 ${esc(name)}</button>` : ""}<label class="btn klein">${name ? "Ersetzen" : "📎 Datei"}<input type="file" hidden data-datei-wahl></label></td>`;
    const zeile = (spalten, werte, datei) => `<tr>${spalten.map((sp, i) => `<td>${zelle(sp, (werte || [])[i] ?? "")}</td>`).join("")}${datei ? dateiZelle((werte || [])[spalten.length] || neueId(), (werte || [])[spalten.length + 1] || "") : ""}<td><button type="button" class="btn klein still" data-zeile-weg aria-label="Zeile löschen">×</button></td></tr>`;
    const tabelle = ([k, titel, spalten, opt]) => `<div class="sec">${titel}</div><div class="fz-tabelle"><table class="fz-tank-tab" data-tabelle="${k}"><thead><tr>${spalten.map((s) => `<th>${s[0]}</th>`).join("")}${opt && opt.datei ? "<th>Datei</th>" : ""}<th></th></tr></thead>
      <tbody>${tabelleLesen(d, k).map((w) => zeile(spalten, w, opt && opt.datei)).join("")}</tbody></table>
      <button type="button" class="btn klein" data-zeile-neu="${k}">+ Zeile</button></div>`;
    const TAB_SPALTEN = Object.fromEntries(REITER.flatMap(([, , b]) => b.filter((x) => Array.isArray(x) && typeof x[0] === "string" && x[0].startsWith("_")).map((x) => [x[0], x])));
    const block = (b) => b === "tank" ? tankBlock(nr)
      : b[0] === "text" ? `<div class="sec">${b[2]}</div><textarea class="eingabe" id="${b[1]}" placeholder="${b[3]}">${esc(d[b[1]] || "")}</textarea>`
      : String(b[0]).startsWith("_") ? tabelle(b)
      : `<div class="sec">${b[0]}</div><div class="form-grid">${b[1].map(feld).join("")}</div>`;
    inhalt.innerHTML = `<div class="topbar"><div class="topbar-left"><a class="back-btn" href="./${QS}">← Fahrzeuge</a><span class="tb-title" id="fz-titel"></span><span class="tb-nr">Fz. ${esc(d.fz_nr_intern || nr)}</span></div>
        <button class="btn jetzt btn-save" type="button" id="fz-speichern">💾 Speichern</button></div>
      <div class="pk-card fz-kartei">
        <div class="card-header"><div><div class="header-logo">Brüll GmbH · Fuhrpark</div><div class="header-name" id="fz-kopf"></div><div class="header-position" id="fz-kopf-fahrer"></div></div><span class="fz-schild gross" id="fz-kopf-schild"></span></div>
        <div class="fz-fristen" id="fz-fristen"></div>
        <div class="tabs" role="tablist">${REITER.map(([id, t], i) => `<button type="button" class="tab-btn${i ? "" : " active"}" role="tab" data-reiter="${id}">${t}</button>`).join("")}</div>
        ${REITER.map(([id, , bloecke], i) => `<div class="tab-content${i ? "" : " active"}" id="fz-tab-${id}" role="tabpanel">${bloecke.map(block).join("")}</div>`).join("")}
        <div class="save-bar"><span class="leise klein-text" id="fz-status" aria-live="polite"></span>${neu ? "" : `<button class="btn still gefahr" type="button" id="fz-loeschen">Fahrzeug löschen</button>`}<button class="btn jetzt btn-save" type="button" id="fz-speichern2">💾 Speichern</button></div>
      </div>`;
    /* Reiter umschalten (gemerkt in der Adresse: #reiter) */
    const zeige = (id) => {
      if (!REITER.some((r) => r[0] === id)) id = REITER[0][0];
      inhalt.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.reiter === id));
      inhalt.querySelectorAll(".tab-content").forEach((c) => c.classList.toggle("active", c.id === "fz-tab-" + id));
    };
    zeige(location.hash.slice(1));
    inhalt.addEventListener("click", (e) => {
      const r = e.target.closest("[data-reiter]"); if (r) { zeige(r.dataset.reiter); history.replaceState(null, "", "#" + r.dataset.reiter); return; }
      const n = e.target.closest("[data-zeile-neu]"); if (n) { const sp = TAB_SPALTEN[n.dataset.zeileNeu], tb = inhalt.querySelector(`[data-tabelle="${n.dataset.zeileNeu}"] tbody`); tb.insertAdjacentHTML("beforeend", zeile(sp[2], [], sp[3] && sp[3].datei)); tb.lastElementChild.querySelector("input:not([type=hidden]), select").focus(); return; }
      const w = e.target.closest("[data-zeile-weg]");
      if (w) { const tr = w.closest("tr"), name = (tr.querySelector("[data-zname]") || {}).value; if (name && !confirm(`Zeile mit der Datei „${name}“ löschen?`)) return; if (name) window.BruellDateien.del("fz:" + nr + ":" + tr.querySelector("[data-zid]").value).catch(() => {}); tr.remove(); if (name) speichern(); return; }
      const o = e.target.closest("[data-datei-oeffnen]");
      if (o) {
        const tr = o.closest("tr"), fenster = window.open("", "_blank");             // sofort öffnen, sonst blockt der Browser
        window.BruellDateien.get("fz:" + nr + ":" + tr.querySelector("[data-zid]").value).then((f) => {
          if (!f) { if (fenster) fenster.close(); alert("Die Datei wurde nicht gefunden – bitte neu hochladen."); return; }
          const url = URL.createObjectURL(f); if (fenster) fenster.location.href = url; else location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000);
        });
      }
    });
    inhalt.addEventListener("change", async (e) => {
      const wahl = e.target.closest("[data-datei-wahl]"); if (!wahl || !wahl.files[0]) return;
      const f = wahl.files[0], tr = wahl.closest("tr"), td = wahl.closest("td"), id = tr.querySelector("[data-zid]").value;
      $("#fz-status").textContent = "Lade „" + f.name + "“ hoch …";
      try { await window.BruellDateien.put("fz:" + nr + ":" + id, f); }
      catch (err) { $("#fz-status").textContent = "Datei konnte nicht gespeichert werden: " + (err.message || err); return; }
      td.outerHTML = dateiZelle(id, f.name);
      const z = tr.querySelectorAll("td input:not([type=hidden]), td select"); if (z[2] && !z[2].value) z[2].value = f.name.replace(/\.[^.]+$/, "");   // Bezeichnung vorschlagen
      if (z[0] && !z[0].value) z[0].value = new Date().toLocaleDateString("de-DE");
      speichern();
    });
    const wert = (id) => ($("#" + id) || {}).value || "";
    const kopf = () => {
      const p = personZu(wert("fz_fahrer"));
      $("#fz-kopf").textContent = wert("fz_modell") || "Neues Fahrzeug";
      $("#fz-kopf-fahrer").innerHTML = wert("fz_fahrer") ? `Fahrer: ${p ? `<a href="../personal/karte.html${qs({ nr: p.nr })}">${esc(wert("fz_fahrer"))}</a>` : esc(wert("fz_fahrer"))}` : "Kein Fahrer zugewiesen";
      $("#fz-kopf-schild").innerHTML = `<i>D</i>${esc(wert("fz_kennzeichen") || "—")}`;
      $("#fz-titel").textContent = [wert("fz_kennzeichen"), wert("fz_modell")].filter(Boolean).join(" · ") || "Neues Fahrzeug";
      $("#fz-fristen").innerHTML = fristChip("HU / TÜV", wert("fz_tuev")) + fristChip("Kundendienst", wert("fz_kundendienst")) + fristChip("Führerschein bis", wert("fz_fs_gueltig")) + fristChip("Leasing-Ende", wert("fz_leasing_ende"));
      document.title = "Brüll · Fahrzeug · " + ($("#fz-titel").textContent);
    };
    kopf();
    inhalt.addEventListener("input", kopf); inhalt.addEventListener("change", kopf);
    const speichern = () => {
      const neuD = { ...d };
      inhalt.querySelectorAll("input[id^='fz_'], select[id^='fz_'], textarea[id^='fz_']").forEach((el) => { neuD[el.id] = el.value.trim(); });
      inhalt.querySelectorAll("[data-tabelle]").forEach((tab) => {
        const zeilen = [...tab.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("input:not([type=file]), select")].map((x) => x.value.trim()))
          .filter((z, i, alle) => z.some((v, j) => v && !(tab.querySelector("[data-zid]") && j === z.length - 2)));   // leere Zeilen weg (Zeilen-ID allein zählt nicht)
        neuD[tab.dataset.tabelle] = JSON.stringify(zeilen);
      });
      if (!neuD.fz_kennzeichen && !neuD.fz_modell) { $("#fz-status").textContent = "Bitte mindestens Kennzeichen oder Modell eintragen."; return; }
      try { localStorage.setItem(key, JSON.stringify(neuD)); } catch (e) { $("#fz-status").textContent = "Speichern fehlgeschlagen – Browser-Speicher voll."; return; }
      try { new BroadcastChannel("bruell_fz").postMessage({ type: "fz_saved", nr }); } catch (e) { /* alt */ }
      Object.assign(d, neuD);
      $("#fz-status").textContent = "✓ Gespeichert " + new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      if (neu) history.replaceState(null, "", location.href);
    };
    $("#fz-speichern").addEventListener("click", speichern); $("#fz-speichern2").addEventListener("click", speichern);
    if ($("#fz-loeschen")) $("#fz-loeschen").addEventListener("click", () => {
      if (!confirm(`Fahrzeug ${wert("fz_kennzeichen") || nr} wirklich löschen?`)) return;
      localStorage.removeItem(key); location.replace("./" + QS);
    });
  }

  if (document.body.dataset.ansicht === "karte") karteSeite(); else listeSeite();
})();
