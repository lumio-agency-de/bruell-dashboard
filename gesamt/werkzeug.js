/* ==========================================================================
   Brüll Dashboard – Werkzeug & Geräte
   --------------------------------------------------------------------------
   Eine gemeinsame Liste für die Personalkarte (Reiter „Werkzeug“) und den Bereich
   „Werkzeuge“ (Firmenlager). Jedes Werkzeug liegt entweder bei einem Mitarbeiter
   (bei = Pers.-Nr.) oder im Firmenlager (bei = "").
   Je Werkzeug: Stammdaten · Ausgabe · Rücknahme · Reparatur/Kosten.
   Speicher: localStorage „bruell:werkzeuge“ (nur dieser Browser, nie im Repo),
   Bilder in IndexedDB „bruell-dokumente“ unter „wz-bild:<id>“.
   ========================================================================== */
window.Werkzeug = (function () {
  "use strict";
  const KEY = "bruell:werkzeuge";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const alle = () => lesen(KEY, []);
  function speichern(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { alert("Speichern fehlgeschlagen – Browser-Speicher voll."); } }
  const heute = () => new Date().toISOString().slice(0, 10);
  const datumDE = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join(".") : iso || "");
  const jetzt = () => new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  const euro = (n) => (+n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const zahl = (v) => { const t = String(v ?? "").trim().replace(/\s|€/g, ""); return parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };

  /* Wer ist angemeldet (für „angelegt/geändert durch“) */
  function ich() {
    let e = null; try { e = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (x) { /* egal */ }
    e = e || lesen("bruell:sitzung", null);
    const k = e && lesen("bruell:konten", []).find((x) => x.email === e);
    return k ? k.name || k.benutzer : "";
  }
  /* Mitarbeiter aus den Personalkarten */
  function mitarbeiter() {
    return Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
      .filter((x) => x.d && (x.d.vorname || x.d.nachname) && !x.d.austritt).sort((a, b) => (a.d.nachname || "").localeCompare(b.d.nachname || ""));
  }
  const maName = (nr) => { const d = lesen("pk_" + nr, null); return d ? ((d.vorname || "") + " " + (d.nachname || "")).trim() : "Nr. " + nr; };

  const ZUSTAENDE = ["neu", "gut", "gebraucht", "defekt", "in Reparatur", "ausgemustert"];
  const VERRECHNUNG = ["keine", "pro Tag", "pro Stunde", "pauschal je Einsatz"];
  /* Stammdaten-Felder wie in der bisherigen Geräteverwaltung (links / rechts) */
  const FELDER = [
    ["nummer", "Nummer"], ["rfid", "RFID"],
    ["kurz1", "Kurztext 1", "breit"], ["kurz2", "Kurztext 2", "breit"],
    ["kostenart", "Kostenart", "liste"], ["seriennr", "Seriennummer"],
    ["anschaffung", "Anschaffungsdatum", "datum"], ["preis", "Anschaffungspreis (€)", "betrag"],
    ["garantie", "Garantie bis", "datum"], ["pruef", "Prüftermin", "datum"],
    ["verrechnung", "Verrechnungsart", "wahl", VERRECHNUNG], ["zustand", "Zustand", "wahl", ZUSTAENDE],
    ["artikelnr", "Artikelnummer"], ["gruppe", "Gerätegruppe", "liste"],
    ["lieferant", "Lieferant", "liste"],
  ];
  const titel = (w) => [w.nummer, w.kurz1].filter(Boolean).join(" · ") || "Neues Werkzeug";
  function pruefStatus(w) {
    if (!w.pruef) return "";
    const tage = Math.round((new Date(w.pruef) - new Date(heute())) / 86400000);
    return tage < 0 ? "ueberfaellig" : tage <= 30 ? "bald" : "";
  }

  /* ---------- Bilder (IndexedDB) ---------- */
  function db() { return new Promise((ok, f) => { const r = indexedDB.open("bruell-dokumente", 1); r.onupgradeneeded = () => r.result.createObjectStore("dateien"); r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error); }); }
  async function idb(art, fn) { const d = await db(); return new Promise((ok, f) => { const t = d.transaction("dateien", art), r = fn(t.objectStore("dateien")); t.oncomplete = () => ok(r && r.result); t.onerror = () => f(t.error); }); }
  function verkleinern(datei) {
    return new Promise((ok, f) => {
      const img = new Image(); img.onerror = () => f(new Error("Bild nicht lesbar"));
      img.onload = () => { const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? ok(b) : f(new Error("Bild nicht lesbar"))), "image/jpeg", 0.8); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(datei);
    });
  }
  async function bildZeigen(box, id) {
    const b = await idb("readonly", (st) => st.get("wz-bild:" + id)).catch(() => null);
    const el = box.querySelector(`.wz-bild[data-id="${id}"]`); if (!el) return;
    el.innerHTML = b ? `<img src="${URL.createObjectURL(b)}" alt="Bild">` : '<span class="leise">kein Bild</span>';
  }

  /* ---------- Darstellung ---------- */
  function listenwerte(feld) { return [...new Set(alle().map((w) => w[feld]).filter(Boolean))].sort(); }
  function feldHtml(w, [k, label, art, opt], nurLesen) {
    const dis = nurLesen ? " disabled" : "", v = w[k] ?? "";
    let input;
    if (art === "datum") input = `<input type="date" data-f="${k}" value="${esc(v)}"${dis}>`;
    else if (art === "wahl") input = `<select data-f="${k}"${dis}><option value=""></option>${opt.map((o) => `<option${o === v ? " selected" : ""}>${o}</option>`).join("")}</select>`;
    else if (art === "betrag") input = `<input type="text" inputmode="decimal" data-f="${k}" value="${v === "" ? "" : esc(String(v).replace(".", ","))}" placeholder="0,00"${dis}>`;
    else input = `<input type="text" data-f="${k}" value="${esc(v)}"${art === "liste" ? ` list="wz-liste-${k}"` : ""}${dis}>`;
    return `<label class="wz-feld${art === "breit" ? " breit" : ""}"><span>${label}</span>${input}</label>`;
  }
  function verlauf(l, spalten) {
    if (!l || !l.length) return '<p class="leise wz-leer">Noch keine Einträge.</p>';
    return `<table class="wz-tab"><thead><tr>${spalten.map(([, t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>${l.slice().reverse().map((e) => `<tr>${spalten.map(([k]) => `<td>${k === "datum" ? datumDE(e[k]) : k === "an" || k === "von" ? (e[k] ? esc(maName(e[k])) : "Firmenlager") : k === "kosten" ? euro(e[k]) : esc(e[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function karte(w, o) {
    const nl = o.nurLesen, st = pruefStatus(w), maOpt = mitarbeiter().filter((m) => m.nr !== String(w.bei)).map((m) => `<option value="${m.nr}">${esc((m.d.vorname || "") + " " + (m.d.nachname || ""))}</option>`).join("");
    const kosten = (w.reparaturen || []).reduce((a, r) => a + zahl(r.kosten), 0), offen = o.offen === w.id;
    return `<details class="wz-karte${w.zustand === "defekt" || w.zustand === "in Reparatur" ? " wz-defekt" : ""}" data-id="${w.id}"${offen ? " open" : ""}>
      <summary><span class="wz-titel"><b>${esc(titel(w))}</b><small>${esc([w.kurz2, w.seriennr && "SN " + w.seriennr, w.gruppe].filter(Boolean).join(" · "))}</small></span>
        <span class="wz-chips">${o.zeigeBei ? `<i class="${w.bei ? "" : "lager"}">${w.bei ? "👤 " + esc(maName(w.bei)) : "🏢 Firmenlager"}</i>` : ""}
          ${st ? `<i class="${st}">Prüfung ${st === "ueberfaellig" ? "überfällig" : "bald"} · ${datumDE(w.pruef)}</i>` : ""}${w.zustand ? `<i>${esc(w.zustand)}</i>` : ""}</span></summary>
      <div class="wz-innen">
        <nav class="wz-reiter" role="tablist">${[["st", "📋 Stammdaten"], ["aus", "↪ Ausgabe"], ["rueck", "↩ Rücknahme"], ["rep", "🔧 Reparatur/Kosten"]].map(([k, t], i) => `<button type="button" data-reiter="${k}" class="${i === 0 ? "an" : ""}">${t}</button>`).join("")}</nav>
        <section class="wz-pane an" data-pane="st">
          <div class="wz-st"><div class="wz-felder">${FELDER.map((f) => feldHtml(w, f, nl)).join("")}</div>
            <div class="wz-bildbox"><div class="wz-bild" data-id="${w.id}"><span class="leise">…</span></div>
              ${nl ? "" : `<label class="dok-knopf">📷 Bild wählen<input type="file" accept="image/*" hidden data-bild="${w.id}"></label>${w.bild ? `<button type="button" class="dok-knopf" data-bild-weg="${w.id}">Bild entfernen</button>` : ""}`}</div></div>
          <p class="wz-fuss"><span>angelegt: ${esc(w.angelegt ? w.angelegt.am + (w.angelegt.von ? " · " + w.angelegt.von : "") : "–")}</span><span>zuletzt geändert: ${esc(w.geaendert ? w.geaendert.am + (w.geaendert.von ? " · " + w.geaendert.von : "") : "–")}</span>
            ${nl ? "" : `<button type="button" class="wz-loeschen" data-loeschen="${w.id}">Werkzeug löschen</button>`}</p>
        </section>
        <section class="wz-pane" data-pane="aus">
          <p class="wz-stand">Zurzeit: <b>${w.bei ? "bei " + esc(maName(w.bei)) : "im Firmenlager"}</b></p>
          ${nl ? "" : `<div class="wz-form"><label><span>Ausgeben an</span><select data-aus-an><option value="">– Mitarbeiter wählen –</option>${maOpt}</select></label>
            <label><span>Datum</span><input type="date" data-aus-datum value="${heute()}"></label><label class="breit"><span>Bemerkung</span><input type="text" data-aus-bem placeholder="z. B. mit Koffer, Akku 2×"></label>
            <button type="button" class="btn jetzt klein" data-ausgeben="${w.id}">Ausgeben</button></div>`}
          ${verlauf(w.ausgaben, [["datum", "Datum"], ["an", "an"], ["von", "vorher"], ["durch", "durch"], ["bemerk", "Bemerkung"]])}
        </section>
        <section class="wz-pane" data-pane="rueck">
          ${nl ? "" : w.bei ? `<div class="wz-form"><label><span>Datum</span><input type="date" data-rueck-datum value="${heute()}"></label>
            <label><span>Zustand bei Rückgabe</span><select data-rueck-zustand>${ZUSTAENDE.map((z) => `<option${z === (w.zustand || "gut") ? " selected" : ""}>${z}</option>`).join("")}</select></label>
            <label class="breit"><span>Bemerkung</span><input type="text" data-rueck-bem placeholder="z. B. Kabel beschädigt"></label>
            <button type="button" class="btn jetzt klein" data-zuruecknehmen="${w.id}">Zurück ins Firmenlager</button></div>` : '<p class="wz-stand">Liegt im Firmenlager – nichts zurückzunehmen.</p>'}
          ${verlauf(w.ruecknahmen, [["datum", "Datum"], ["von", "von"], ["zustand", "Zustand"], ["durch", "durch"], ["bemerk", "Bemerkung"]])}
        </section>
        <section class="wz-pane" data-pane="rep">
          ${nl ? "" : `<div class="wz-form"><label><span>Datum</span><input type="date" data-rep-datum value="${heute()}"></label>
            <label class="breit"><span>Was wurde gemacht?</span><input type="text" data-rep-text placeholder="z. B. Kohlebürsten getauscht"></label>
            <label><span>Firma</span><input type="text" data-rep-firma list="wz-liste-lieferant"></label><label><span>Kosten (€)</span><input type="text" inputmode="decimal" data-rep-kosten placeholder="0,00"></label>
            <button type="button" class="btn jetzt klein" data-reparatur="${w.id}">Eintragen</button></div>`}
          ${verlauf(w.reparaturen, [["datum", "Datum"], ["text", "Reparatur"], ["firma", "Firma"], ["kosten", "Kosten"]])}
          <p class="wz-summe">Reparaturkosten gesamt: <b>${euro(kosten)}</b>${w.preis ? ` · Anschaffungspreis ${euro(w.preis)} · zusammen <b>${euro(kosten + zahl(w.preis))}</b>` : ""}</p>
        </section>
      </div></details>`;
  }

  /* ---------- Einbauen (Personalkarte: bei = Pers.-Nr. · Bereich: bei = null mit Filter) ---------- */
  function einbauen(box, o) {
    o = { nurLesen: false, ...o };
    const istKarte = o.bei !== undefined && o.bei !== null;
    let filter = o.filter || "lager", suche = "";
    function zeichnen() {
      const l = alle().filter((w) => istKarte ? String(w.bei) === String(o.bei) : filter === "lager" ? !w.bei : filter === "aus" ? !!w.bei : true)
        .filter((w) => !suche || [w.nummer, w.kurz1, w.kurz2, w.seriennr, w.gruppe, w.rfid, w.artikelnr, w.bei && maName(w.bei)].join(" ").toLowerCase().includes(suche))
        .sort((a, b) => (a.nummer || "").localeCompare(b.nummer || "", "de", { numeric: true }) || titel(a).localeCompare(titel(b)));
      const lager = alle().filter((w) => !w.bei);
      const kopf = istKarte
        ? (o.nurLesen ? "" : `<div class="wz-aktionen"><button type="button" class="dok-knopf" data-neu>+ Neues Werkzeug für diesen Mitarbeiter</button>
            ${lager.length ? `<select data-aus-lager aria-label="Aus dem Firmenlager ausgeben"><option value="">Aus dem Firmenlager ausgeben …</option>${lager.map((w) => `<option value="${w.id}">${esc(titel(w))}</option>`).join("")}</select>` : ""}</div>`)
        : `<div class="wz-aktionen"><div class="wz-filter">${[["lager", "Im Firmenlager"], ["aus", "Ausgegeben"], ["alle", "Alle"]].map(([k, t]) => `<button type="button" data-filter="${k}" class="${filter === k ? "an" : ""}">${t} <small>${alle().filter((w) => k === "lager" ? !w.bei : k === "aus" ? !!w.bei : true).length}</small></button>`).join("")}</div>
            <input type="search" class="eingabe" data-suche placeholder="Suchen: Nummer, Name, Seriennr. …" value="${esc(suche)}"><button type="button" class="btn jetzt" data-neu>+ Werkzeug ins Firmenlager</button></div>`;
      box.innerHTML = kopf + (l.length ? `<div class="wz-liste">${l.map((w) => karte(w, { ...o, zeigeBei: !istKarte })).join("")}</div>`
        : `<p class="leise wz-leer">${istKarte ? "Diesem Mitarbeiter ist kein Werkzeug ausgegeben." : suche ? "Keine Treffer." : filter === "lager" ? "Im Firmenlager ist noch kein Werkzeug eingetragen." : "Kein Werkzeug."}</p>`)
        + ["kostenart", "gruppe", "lieferant"].map((k) => `<datalist id="wz-liste-${k}">${listenwerte(k).map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`).join("");
      l.forEach((w) => bildZeigen(box, w.id));
      o.offen = null;
    }
    function aendern(id, fn, neuZeichnen) {
      const l = alle(), w = l.find((x) => x.id === id); if (!w) return;
      fn(w); w.geaendert = { am: jetzt(), von: ich() }; speichern(l);
      if (neuZeichnen) { o.offen = id; zeichnen(); }
    }
    const wert = (karteEl, sel) => (karteEl.querySelector(sel) || {}).value || "";
    box.addEventListener("change", async (e) => {
      const t = e.target, k = t.closest(".wz-karte"), id = k && k.dataset.id;
      if (t.dataset.f && id && !o.nurLesen) {
        const f = t.dataset.f, v = f === "preis" ? (zahl(t.value) ? zahl(t.value).toFixed(2) : "") : t.value.trim();
        aendern(id, (w) => { w[f] = v; });
        const s = k.querySelector(".wz-titel b"); if (s) s.textContent = titel(alle().find((w) => w.id === id));
        if (f === "preis" && v) t.value = String(v).replace(".", ",");
      }
      if (t.dataset.bild && t.files[0]) {
        try { const b = await verkleinern(t.files[0]); await idb("readwrite", (st) => st.put(b, "wz-bild:" + t.dataset.bild)); aendern(t.dataset.bild, (w) => { w.bild = true; }, true); }
        catch (err) { alert(err.message || err); }
      }
      if (t.matches("[data-aus-lager]") && t.value) {
        const w = alle().find((x) => x.id === t.value);
        if (w && confirm(`„${titel(w)}“ aus dem Firmenlager an ${maName(o.bei)} ausgeben?`))
          aendern(w.id, (x) => { x.ausgaben = (x.ausgaben || []).concat([{ datum: heute(), an: String(o.bei), von: "", durch: ich(), bemerk: "" }]); x.bei = String(o.bei); }, true);
        else t.value = "";
      }
    });
    box.addEventListener("input", (e) => { if (e.target.matches("[data-suche]")) { suche = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; zeichnen(); const s = box.querySelector("[data-suche]"); s.focus(); s.setSelectionRange(p, p); } });
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const k = b.closest(".wz-karte");
      if (b.dataset.reiter) { k.querySelectorAll(".wz-reiter button").forEach((x) => x.classList.toggle("an", x === b)); k.querySelectorAll(".wz-pane").forEach((p) => p.classList.toggle("an", p.dataset.pane === b.dataset.reiter)); return; }
      if (b.dataset.filter) { filter = b.dataset.filter; return zeichnen(); }
      if (b.hasAttribute("data-neu")) {
        const l = alle(), w = { id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bei: istKarte ? String(o.bei) : "", zustand: "gut", angelegt: { am: jetzt(), von: ich() }, ausgaben: [], ruecknahmen: [], reparaturen: [] };
        if (istKarte) w.ausgaben.push({ datum: heute(), an: String(o.bei), von: "", durch: ich(), bemerk: "neu angelegt" });
        l.push(w); speichern(l); o.offen = w.id; if (!istKarte && filter === "aus") filter = "lager";
        zeichnen(); const f = box.querySelector(`.wz-karte[data-id="${w.id}"] [data-f="nummer"]`); if (f) f.focus();
        return;
      }
      if (b.dataset.ausgeben) {
        const an = wert(k, "[data-aus-an]"); if (!an) return alert("Bitte einen Mitarbeiter wählen.");
        aendern(b.dataset.ausgeben, (w) => { w.ausgaben = (w.ausgaben || []).concat([{ datum: wert(k, "[data-aus-datum]") || heute(), an, von: w.bei || "", durch: ich(), bemerk: wert(k, "[data-aus-bem]") }]); w.bei = an; }, true);
        return;
      }
      if (b.dataset.zuruecknehmen) {
        aendern(b.dataset.zuruecknehmen, (w) => { const z = wert(k, "[data-rueck-zustand]"); w.ruecknahmen = (w.ruecknahmen || []).concat([{ datum: wert(k, "[data-rueck-datum]") || heute(), von: w.bei, zustand: z, durch: ich(), bemerk: wert(k, "[data-rueck-bem]") }]); w.bei = ""; if (z) w.zustand = z; }, true);
        return;
      }
      if (b.dataset.reparatur) {
        const text = wert(k, "[data-rep-text]"); if (!text) return alert("Bitte eintragen, was gemacht wurde.");
        aendern(b.dataset.reparatur, (w) => { w.reparaturen = (w.reparaturen || []).concat([{ datum: wert(k, "[data-rep-datum]") || heute(), text, firma: wert(k, "[data-rep-firma]"), kosten: zahl(wert(k, "[data-rep-kosten]")).toFixed(2) }]); }, true);
        setTimeout(() => { const kk = box.querySelector(`.wz-karte[data-id="${b.dataset.reparatur}"] [data-reiter="rep"]`); if (kk) kk.click(); });
        return;
      }
      if (b.dataset.bildWeg) { await idb("readwrite", (st) => st.delete("wz-bild:" + b.dataset.bildWeg)).catch(() => {}); aendern(b.dataset.bildWeg, (w) => { w.bild = false; }, true); return; }
      if (b.dataset.loeschen) {
        const w = alle().find((x) => x.id === b.dataset.loeschen);
        if (!w || !confirm(`„${titel(w)}“ endgültig löschen? Der Verlauf geht dabei verloren.\n(Ausgemusterte Geräte besser auf Zustand „ausgemustert“ setzen.)`)) return;
        speichern(alle().filter((x) => x.id !== w.id)); idb("readwrite", (st) => st.delete("wz-bild:" + w.id)).catch(() => {}); zeichnen();
      }
    });
    zeichnen();
    return { zeichnen };
  }

  /* Alte Tabelle „Ausgegebenes Werkzeug“ einer Personalkarte einmalig übernehmen */
  function uebernehmen(nr, wzTable) {
    const d = lesen("pk_" + nr, null); if (!d || d._wz_uebernommen) return;
    let rows = []; try { rows = JSON.parse(wzTable || d._wz_table || "[]"); } catch (e) { /* alt */ }
    const iso = (t) => { const m = String(t || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
    const l = alle();
    rows.filter((r) => r && String(r[0] || "").trim()).forEach((r, i) => {
      const zurueck = iso(r[3]);
      l.push({ id: "w" + Date.now().toString(36) + i + nr, kurz1: String(r[0]).trim(), seriennr: String(r[1] || "").trim(), zustand: String(r[4] || "").trim() || "gut", bei: zurueck ? "" : String(nr),
        angelegt: { am: jetzt(), von: "aus alter Personalkarte" }, ausgaben: [{ datum: iso(r[2]), an: String(nr), von: "", durch: "", bemerk: "aus alter Personalkarte" }],
        ruecknahmen: zurueck ? [{ datum: zurueck, von: String(nr), zustand: String(r[4] || ""), durch: "", bemerk: "aus alter Personalkarte" }] : [], reparaturen: [] });
    });
    speichern(l);
    d._wz_uebernommen = true; d._wz_table = "[]";
    try { localStorage.setItem("pk_" + nr, JSON.stringify(d)); } catch (e) { /* voll */ }
  }

  return { einbauen, uebernehmen, alle, pruefStatus };
})();
