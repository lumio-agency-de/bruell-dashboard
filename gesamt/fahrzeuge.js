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
  const fotoVon = (nr) => localStorage.getItem("ph_" + nr) || (((window.PK_TEAM || {})[nr] || {})._foto ? "../personal/" + window.PK_TEAM[nr]._foto : "");

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
  const fristChip = (titel, wert) => { const f = frist(wert); return `<span class="fz-frist ${f ? f.stufe : ""}"><small>${titel}</small><b>${esc(f ? f.text : "–")}</b>${f && f.hinweis ? `<em>${esc(f.hinweis)}</em>` : ""}</span>`; };

  /* ---------- Fuhrpark-Liste ---------- */
  function liste() {
    const q = ($("#fz-suche") && $("#fz-suche").value || "").trim().toLowerCase();
    const l = alle().filter((x) => !q || [x.nr, x.d.fz_kennzeichen, x.d.fz_modell, x.d.fz_fahrer].join(" ").toLowerCase().includes(q));
    const faellig = alle().filter((x) => ["rot", "gelb"].includes((frist(x.d.fz_tuev) || {}).stufe) || ["rot", "gelb"].includes((frist(x.d.fz_fs_gueltig) || {}).stufe));
    $("#fz-anzahl").textContent = `${alle().length} Fahrzeuge${faellig.length ? ` · ${faellig.length} mit Frist in den nächsten 60 Tagen` : ""}`;
    $("#fz-liste").innerHTML = l.length ? `<div class="ma-raster">${l.map(({ nr, d }) => {
      const p = personZu(d.fz_fahrer), foto = p && fotoVon(p.nr), ini = (d.fz_fahrer || "").split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
      return `<a class="ma-karte fz-karte" href="karte.html${qs({ nr })}">
        <span class="fz-schild"><i>D</i>${esc(d.fz_kennzeichen || "ohne Kennz.")}</span>
        <span class="ma-text"><b>${esc(d.fz_modell || "Fahrzeug")}</b><small>${d.fz_typ ? `<span class="fz-art">${esc(d.fz_typ)}${d.fz_status ? " · " + esc(d.fz_status) : ""}</span> ` : ""}Fz.-Nr. ${esc(d.fz_nr_intern || String(nr).padStart(3, "0"))}${d.fz_km ? ` · ${esc(Number(d.fz_km).toLocaleString("de-DE"))} km` : ""}</small></span>
        <span class="fz-fahrer">${d.fz_fahrer ? `<span class="ma-foto klein">${foto ? `<img src="${esc(foto)}" alt="">` : `<b>${esc(ini)}</b>`}</span><span>${esc(d.fz_fahrer)}</span>` : `<span class="leise">Kein Fahrer zugewiesen</span>`}</span>
        <span class="ma-werte">${fristChip("HU / TÜV", d.fz_tuev)}${d.fz_typ === "Anhänger" ? "" : fristChip("Führerschein bis", d.fz_fs_gueltig)}${d.fz_leasing_ende ? fristChip("Leasing-Ende", d.fz_leasing_ende) : ""}</span></a>`;
    }).join("")}</div>` : `<p class="ue-leer">${q ? "Keine Treffer." : "Noch keine Fahrzeuge – „+ Fahrzeug“ anlegen."}</p>`;
  }
  function listeSeite() {
    inhalt.innerHTML = `<header class="kopf"><div><p class="eyebrow">Fuhrpark · vertraulich</p><h1>Fahrzeuge</h1><p class="unter leise" id="fz-anzahl"></p></div>
        <div class="kopf-aktionen"><input class="eingabe" type="search" id="fz-suche" placeholder="Kennzeichen, Modell, Fahrer …" aria-label="Fahrzeuge suchen">
          <button class="btn jetzt" type="button" id="fz-neu">+ Fahrzeug</button></div></header>
      <div id="fz-liste"></div>`;
    document.title = "Brüll · Fahrzeuge";
    liste();
    $("#fz-suche").addEventListener("input", liste);
    $("#fz-neu").addEventListener("click", () => {
      const max = Math.max(0, ...Object.keys(localStorage).filter((k) => /^fz_\d+$/.test(k)).map((k) => +k.slice(3)));
      location.href = "karte.html" + qs({ nr: max + 1 });
    });
  }

  /* ---------- Fahrzeugkarte ---------- */
  const JN = ["", "Ja", "Nein"];
  const BLOECKE = [
    ["Fahrzeug", [["fz_kennzeichen", "Kennzeichen"], ["fz_modell", "Fahrzeugtyp / Modell"], ["fz_typ", "Art", ["", "Transporter", "PKW", "LKW", "Anhänger"]], ["fz_status", "Leasing / Eigentum", ["", "Leasing", "Eigentum", "Miete"]], ["fz_nr_intern", "Fahrzeug-Nr. (intern)"], ["fz_km", "Kilometerstand", "number"], ["fz_tuev", "Nächste HU / TÜV", "datum"]]],
    ["Fahrer & Zuweisung", [["fz_fahrer", "Fahrer", "fahrer"], ["fz_zuweisung_seit", "Zugewiesen seit", "datum"], ["fz_fuehrerschein", "Führerschein Klasse"], ["fz_fs_gueltig", "Führerschein gültig bis", "datum"], ["fz_privatnutzung", "Privatnutzung erlaubt", JN]]],
    ["Tanken", [["fz_tankkarte", "Tankkarte vorhanden", JN], ["fz_dkv", "DKV-/Tankkarten-Nr."]]],
    ["Leasing & Steuer", [["fz_leasing_nr", "Leasing-Vertragsnr."], ["fz_leasingrate", "Leasingrate / Monat (€)"], ["fz_leasing_ende", "Leasing-Ende", "datum"], ["fz_steuer", "Kfz-Steuer / Jahr (€)"]]],
    ["Versicherung", [["fz_versicherungsgeber", "Versicherer"], ["fz_vers_nr", "Versicherungs-Nr."], ["fz_vers_beitrag", "Beitrag / Jahr (€)"]]],
  ];
  function karteSeite() {
    const nr = (new URLSearchParams(location.search).get("nr") || "").replace(/\D/g, "");
    if (!nr) { location.replace("./" + QS); return; }
    const key = "fz_" + nr, d = lesen(key, {}), neu = !localStorage.getItem(key);
    if (neu) d.fz_nr_intern = String(nr).padStart(3, "0");
    const ma = mitarbeiter();
    const feld = ([id, label, art]) => {
      const v = d[id] ?? "";
      let el;
      if (Array.isArray(art)) el = `<select class="eingabe" id="${id}">${art.map((o) => `<option value="${o}"${o === v ? " selected" : ""}>${o || "– bitte wählen –"}</option>`).join("")}</select>`;
      else if (art === "fahrer") el = `<select class="eingabe" id="${id}"><option value="">– niemand –</option>${ma.map((m) => `<option${m.name.toLowerCase() === String(v).trim().toLowerCase() ? " selected" : ""}>${esc(m.name)}</option>`).join("")}${v && !personZu(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
      else el = `<input class="eingabe" id="${id}" type="${art === "number" ? "number" : "text"}"${art === "datum" ? ' placeholder="TT.MM.JJJJ" inputmode="numeric"' : ""} value="${esc(v)}">`;
      return `<label class="form-group"><span>${label}</span>${el}</label>`;
    };
    inhalt.innerHTML = `<div class="topbar"><div class="topbar-left"><a class="back-btn" href="./${QS}">← Fahrzeuge</a><span class="tb-title" id="fz-titel"></span><span class="tb-nr">Fz. ${esc(d.fz_nr_intern || nr)}</span></div>
        <button class="btn jetzt btn-save" type="button" id="fz-speichern">💾 Speichern</button></div>
      <div class="pk-card fz-kartei">
        <div class="card-header"><div><div class="header-logo">Brüll GmbH · Fuhrpark</div><div class="header-name" id="fz-kopf"></div><div class="header-position" id="fz-kopf-fahrer"></div></div><span class="fz-schild gross" id="fz-kopf-schild"></span></div>
        <div class="fz-fristen" id="fz-fristen"></div>
        <div class="tab-content active">${BLOECKE.map(([t, f]) => `<div class="sec">${t}</div><div class="form-grid">${f.map(feld).join("")}</div>`).join("")}
          <div class="sec">Schäden / Bemerkungen</div><textarea class="eingabe" id="fz_schaeden" placeholder="Bekannte Schäden, Werkstatt, Unfälle …">${esc(d.fz_schaeden || "")}</textarea>
        </div>
        <div class="save-bar"><span class="leise klein-text" id="fz-status" aria-live="polite"></span>${neu ? "" : `<button class="btn still gefahr" type="button" id="fz-loeschen">Fahrzeug löschen</button>`}<button class="btn jetzt btn-save" type="button" id="fz-speichern2">💾 Speichern</button></div>
      </div>`;
    const wert = (id) => ($("#" + id) || {}).value || "";
    const kopf = () => {
      const p = personZu(wert("fz_fahrer"));
      $("#fz-kopf").textContent = wert("fz_modell") || "Neues Fahrzeug";
      $("#fz-kopf-fahrer").innerHTML = wert("fz_fahrer") ? `Fahrer: ${p ? `<a href="../personal/karte.html${qs({ nr: p.nr })}">${esc(wert("fz_fahrer"))}</a>` : esc(wert("fz_fahrer"))}` : "Kein Fahrer zugewiesen";
      $("#fz-kopf-schild").innerHTML = `<i>D</i>${esc(wert("fz_kennzeichen") || "—")}`;
      $("#fz-titel").textContent = [wert("fz_kennzeichen"), wert("fz_modell")].filter(Boolean).join(" · ") || "Neues Fahrzeug";
      $("#fz-fristen").innerHTML = fristChip("HU / TÜV", wert("fz_tuev")) + fristChip("Führerschein bis", wert("fz_fs_gueltig")) + fristChip("Leasing-Ende", wert("fz_leasing_ende"));
      document.title = "Brüll · Fahrzeug · " + ($("#fz-titel").textContent);
    };
    kopf();
    inhalt.addEventListener("input", kopf); inhalt.addEventListener("change", kopf);
    const speichern = () => {
      const neuD = { ...d };
      inhalt.querySelectorAll("input[id^='fz_'], select[id^='fz_'], textarea[id^='fz_']").forEach((el) => { neuD[el.id] = el.value.trim(); });
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
