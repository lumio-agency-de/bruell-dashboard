/* ==========================================================================
   Brüll Dashboard – Datenbank (Supabase auf dem Mac mini) für die Gesamt-Seiten
   --------------------------------------------------------------------------
   Aktiv nur, wenn der Server /gesamt/cloud.js ausliefert (setzt window.BRUELL_CLOUD; nicht im Repo).
   Ohne (GitHub Pages, lokal) bleibt alles wie bisher im Browser.

   Karten: Die Seiten lesen/schreiben weiter „pk_<Nr>“ (Personal) bzw. „fz_<Nr>“ (Fahrzeuge) im
   Browser-Speicher. Diese Datei hält den Speicher mit den Tabellen „personal“ / „fahrzeuge“ gleich:
     • beim Laden: Stand aus der Datenbank holen (Personal: GF alle, sonst nur die eigene; Fahrzeuge: nur GF)
     • beim Speichern einer Karte (GF): Änderung wird in die Datenbank geschrieben
     • Karten, die es bisher nur in diesem Browser gibt, übernimmt die GF einmalig per Knopf
     • gab es eine Karte im Browser schon vor der DB: leere DB-Felder werden ergänzt; abweichende
       Werte bietet ein Hinweis zum Übernehmen an (Browser-Fassung bleibt als <prefix>vordb_<Nr> gesichert)
   Fotos: Bucket „personal“, Pfad foto/<Nr>/foto  ↔  ph_<Nr> im Browser (Daten-URL) + window.PK_FOTOS.
   Tankbuchungen (Tabelle „tanken“, nur GF) → window.FZ_TANKEN / FZ_TANKEN_OFFEN.
   Ablage (Tabelle „ablage“, supabase/ablage.sql): übrige Schlüssel 1:1 – Werkzeuge, Bank/Buchhaltung, Lohn,
   Betriebsmonitor, Widget-Auswahl, eigene Übersicht-Anordnung. Ändern: GF (Anordnung: jeder seine eigene).
   Laden vor personal.js / uebersicht.js (braucht ../bad/app/vendor/supabase.js davor).
   ========================================================================== */
window.BruellDB = (function () {
  "use strict";
  const K = window.BRUELL_CLOUD;
  if (!K || !K.url || !K.anonKey || !window.supabase) return null;
  const sb = window.supabase.createClient(K.url, K.anonKey, { auth: { persistSession: true } });   // dieselbe Sitzung wie im Bad-Dashboard
  const PH = /^ph_(\d+)$/, FOTOSTAND = "bruell:ph-db", TANKEN = "bruell:tanken-db";
  const roh = { set: Storage.prototype.setItem, del: Storage.prototype.removeItem };
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const GEAENDERT = new Set();                                    // Live: welche Schlüssel die Datenbank gerade geändert hat
  const still = (k, v) => { try { if (localStorage.getItem(k) !== (v == null ? null : String(v))) GEAENDERT.add(k); v == null ? roh.del.call(localStorage, k) : roh.set.call(localStorage, k, v); } catch (e) { /* voll */ } };
  const ich = () => { try { const e = JSON.parse(sessionStorage.getItem("bruell:sitzung") || localStorage.getItem("bruell:sitzung") || "null"); return lesen("bruell:konten", []).find((x) => x.email === e) || null; } catch (e) { return null; } };
  const gf = () => (ich() || {}).ebene === "geschaeftsfuehrung";
  /* „Personal bearbeiten“ (gesamt/thema.js): darf Personalkarten + Fotos ändern, anlegen, löschen */
  const pb = () => !gf() && !!(window.BruellRechte && window.BruellRechte.personalBearbeiten && window.BruellRechte.personalBearbeiten());
  const schreibt = (s) => gf() || (s.tabelle === "personal" && pb());
  const leer = (v) => v == null || String(v).trim() === "" || v === "[]" || v === "{}";

  /* Sammlungen: Browser-Schlüssel ↔ Tabelle */
  const SAMMLUNGEN = [
    /* recht: wer diesen Bereich (Konten-Seite) freigegeben hat, liest alle Karten (alle: Funktion, sonst Tabelle) */
    { name: "Personalkarte", prefix: "pk_", tabelle: "personal", stand: "bruell:pk-db", uebernommen: "bruell:pk-uebernommen", eigene: "meine_personalkarte", recht: "personal", alle: "personal_alle", seite: /\/personal\/(index\.html)?$/ },
    { name: "Fahrzeugkarte", prefix: "fz_", tabelle: "fahrzeuge", stand: "bruell:fz-db", uebernommen: "bruell:fz-uebernommen", eigene: null, recht: "fahrzeuge", seite: /\/fahrzeuge\/(index\.html)?$/ },
  ].map((s) => ({ ...s, re: new RegExp("^" + s.prefix + "(\\d+)$"), abw: "bruell:abweichung:" + s.tabelle }));
  /* Ablage: Schlüssel, die 1:1 als Zeile gespeichert werden (Rechte prüft die Datenbank je Schlüssel) */
  const ABLAGE = /^(bruell:werkzeuge|buch:umsaetze|buch:rechnungen|bank:saldo|lohn:konten|lohn:(import:)?\d{4}-\d{2}|bm:\d{4}|bruell:widgets|bruell:raster:[^:]+)$/, ABLAGESTAND = "bruell:ablage-db";
  const ABLAGE_NAMEN = [[/^bruell:werkzeuge$/, "Werkzeuge"], [/^(buch|bank):/, "Bank/Buchhaltung"], [/^lohn:/, "Lohn"], [/^bm:/, "Betriebsmonitor"], [/^bruell:(widgets|raster)/, "Übersicht"]];
  const eigeneAnordnung = (k) => { const i = ich(); return !!i && k === "bruell:raster:" + i.id; };
  /* Beispieldaten (Bank-Demo) nicht in die Datenbank */
  const nurBeispiel = (k, v) => { try { const d = JSON.parse(v); if (k === "buch:umsaetze") return Array.isArray(d) && d.length > 0 && d.every((u) => String(u.id).startsWith("demo-")); if (k === "bank:saldo") return Object.values(d || {}).every((x) => !x || x.beispiel); } catch (e) { /* egal */ } return false; };
  const sammlungVon = (k) => { for (const s of SAMMLUNGEN) { const m = s.re.exec(k); if (m) return [s, m[1]]; } return null; };

  /* Ohne gültige Supabase-Sitzung: gespiegelte Anmeldung löschen → Seiten gehen zur Anmeldung.
     Karten/Fotos nur löschen, wenn sie aus der DB kamen (dort sicher). Was es nur hier gibt, bleibt. */
  function aufraeumen() {
    try {
      for (const s of SAMMLUNGEN) { Object.keys(lesen(s.stand, {})).forEach((nr) => roh.del.call(localStorage, s.prefix + nr)); roh.del.call(localStorage, s.stand); }
      Object.keys(lesen(FOTOSTAND, {})).forEach((nr) => roh.del.call(localStorage, "ph_" + nr));
      Object.keys(lesen(ABLAGESTAND, {})).forEach((k) => roh.del.call(localStorage, k));
      ["bruell:sitzung", "bruell:konten", FOTOSTAND, TANKEN, ABLAGESTAND].forEach((k) => roh.del.call(localStorage, k));
      sessionStorage.removeItem("bruell:sitzung");
    } catch (e) { /* egal */ }
  }
  const tokenKey = "sb-" + new URL(K.url).hostname.split(".")[0] + "-auth-token";
  if (!localStorage.getItem(tokenKey)) aufraeumen();          // synchron: vor personal.js, damit es sofort zur Anmeldung geht

  /* ---------- Karten: Datenbank → Browser ---------- */
  async function holen(s) {
    const neu = {};
    if (gf() || (s.tabelle === "personal" && pb())) {
      const { data, error } = await sb.from(s.tabelle).select("nr, daten, geaendert").eq("geloescht", false);
      if (error) throw error;
      data.forEach((r) => { neu[r.nr] = r; });
    } else if (s.recht && window.BruellRechte && window.BruellRechte.darf(s.recht)) {
      const { data, error } = s.alle ? await sb.rpc(s.alle) : await sb.from(s.tabelle).select("nr, daten, geaendert").eq("geloescht", false);
      if (error) throw error;
      (data || []).forEach((r) => { neu[r.nr] = r; });
      if (s.eigene) { const e = await sb.rpc(s.eigene); if (e.data) neu[e.data.nr] = e.data; }   // eigene Karte immer
    } else if (s.eigene) {
      const { data, error } = await sb.rpc(s.eigene);
      if (error) throw error;
      if (data) neu[data.nr] = data;
    }
    const alt = lesen(s.stand, {}), ergaenzt = [], abw = lesen(s.abw, {}); let geaendert = false;
    for (const [nr, r] of Object.entries(neu)) {
      const txt = JSON.stringify(r.daten), lokal = localStorage.getItem(s.prefix + nr);
      if (lokal === txt) continue;
      /* Karte gab es in diesem Browser schon vor der Datenbank (nie abgeglichen): nichts verlieren */
      if (lokal !== null && !(nr in alt)) {
        let l = {}; try { l = JSON.parse(lokal) || {}; } catch (e) { /* kaputt */ }
        if (!localStorage.getItem(s.prefix + "vordb_" + nr)) still(s.prefix + "vordb_" + nr, lokal);
        const zusammen = { ...r.daten }, anders = {};
        for (const [k, v] of Object.entries(l)) {
          if (leer(v)) continue;
          if (leer(zusammen[k])) zusammen[k] = v;                                  // leeres DB-Feld → aus dem Browser
          else if (JSON.stringify(zusammen[k]) !== JSON.stringify(v)) anders[k] = v; // abweichend → GF entscheidet
        }
        if (Object.keys(anders).length && gf()) abw[nr] = anders;
        const ztxt = JSON.stringify(zusammen);
        still(s.prefix + nr, ztxt); geaendert = true;
        if (ztxt !== txt && gf()) ergaenzt.push(nr);
        continue;
      }
      still(s.prefix + nr, txt); geaendert = true;
    }
    /* früher aus der DB gekommen, dort jetzt weg (gelöscht/keine Berechtigung mehr) → auch hier weg */
    for (const nr of Object.keys(alt)) if (!neu[nr] && localStorage.getItem(s.prefix + nr) !== null) { still(s.prefix + nr, null); geaendert = true; }
    /* Nicht-GF: im Browser nur, was die DB freigibt – Reste früherer Sitzungen/Vorlagen entfernen */
    if (!gf()) Object.keys(localStorage).map((k) => s.re.exec(k)).filter((m) => m && !neu[m[1]]).forEach((m) => { still(m[0], null); geaendert = true; });
    still(s.stand, JSON.stringify(Object.fromEntries(Object.entries(neu).map(([nr, r]) => [nr, r.geaendert]))));
    still(s.abw, Object.keys(abw).length ? JSON.stringify(abw) : null);
    ergaenzt.forEach((nr) => vormerken(s, nr));                    // ergänzte Felder (z. B. Adressen) zurück in die DB
    if (ergaenzt.length) melden(`${ergaenzt.length} ${s.name}${ergaenzt.length === 1 ? "" : "n"} um Angaben aus diesem Browser ergänzt`);
    return { geaendert, anzahl: Object.keys(neu).length };
  }

  /* ---------- Fotos: Dateispeicher → Browser ---------- */
  const alsDatenUrl = (blob) => new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = nein; r.readAsDataURL(blob); });
  async function fotosHolen(nrs) {
    /* höchstens alle 10 Minuten je Tab nachsehen – Fotos ändern sich selten */
    const zuletzt = +sessionStorage.getItem("bruell:ph-geprueft") || 0;
    if (Date.now() - zuletzt < 6e5 && localStorage.getItem(FOTOSTAND)) return false;
    const liste = await sb.rpc("personal_fotos");                    // eine Abfrage: { Nr: Stand } (nur erlaubte Fotos)
    if (liste.error) throw liste.error;
    sessionStorage.setItem("bruell:ph-geprueft", String(Date.now()));
    const alt = lesen(FOTOSTAND, {}), neu = {}; let geaendert = false;
    await Promise.all(nrs.filter((nr) => liste.data && liste.data[nr]).map(async (nr) => {
      const stand = liste.data[nr]; neu[nr] = stand;
      if (alt[nr] === stand && localStorage.getItem("ph_" + nr)) return;
      const dl = await sb.storage.from("personal").download("foto/" + nr + "/foto");
      if (dl.error || !dl.data) return;
      still("ph_" + nr, await alsDatenUrl(dl.data)); geaendert = true;
    }));
    still(FOTOSTAND, JSON.stringify(neu));
    /* Nicht-GF: nur das eigene Foto im Browser */
    if (!gf()) Object.keys(localStorage).map((k) => PH.exec(k)).filter((m) => m && !nrs.includes(m[1])).forEach((m) => { still(m[0], null); geaendert = true; });
    return geaendert;
  }
  /* Fotos auch für Seiten, die window.PK_FOTOS lesen (Übersicht) – sofort aus dem Speicher */
  try { window.PK_FOTOS = window.PK_FOTOS || {}; Object.keys(localStorage).forEach((k) => { const m = PH.exec(k); if (m && !window.PK_FOTOS[m[1]]) window.PK_FOTOS[m[1]] = localStorage.getItem(k); }); } catch (e) { /* egal */ }

  /* ---------- Fotos: Browser → Dateispeicher (nur GF, z. B. neues Foto in der Personalkarte) ---------- */
  async function fotoSenden(nr) {
    if (!schreibt(SAMMLUNGEN[0])) return;
    const url = localStorage.getItem("ph_" + nr); if (!url || !url.startsWith("data:")) return;
    const blob = await (await fetch(url)).blob();
    const { error } = await sb.storage.from("personal").upload("foto/" + nr + "/foto", blob, { upsert: true, contentType: blob.type || "image/jpeg" });
    if (error) melden("Foto speichern fehlgeschlagen: " + error.message, true);
  }

  /* ---------- Tankbuchungen (nur GF): sofort aus dem Speicher, frisch höchstens alle 10 Minuten ---------- */
  function tankenSetzen(zeilen) {
    const t = {}, offen = [];
    for (const z of zeilen || []) { const b = { id: z.id, datum: z.datum, ...z.daten }; if (z.nr) (t[z.nr] = t[z.nr] || []).push(b); else offen.push(b); }
    if (!window.FZ_TANKEN || !Object.keys(window.FZ_TANKEN).length) window.FZ_TANKEN = t;
    if (!window.FZ_TANKEN_OFFEN || !window.FZ_TANKEN_OFFEN.length) window.FZ_TANKEN_OFFEN = offen;
  }
  if (gf() || (window.BruellRechte && (window.BruellRechte.darf("fahrzeuge") || window.BruellRechte.darf("monitor")))) tankenSetzen(lesen(TANKEN, []));
  const tankenErlaubt = () => gf() || (window.BruellRechte && (window.BruellRechte.darf("fahrzeuge") || window.BruellRechte.darf("monitor")));
  async function tankenHolen() {
    if (!tankenErlaubt()) { still(TANKEN, null); return false; }
    const zuletzt = +sessionStorage.getItem("bruell:tanken-geprueft") || 0;
    if (Date.now() - zuletzt < 6e5 && localStorage.getItem(TANKEN)) return false;
    const { data, error } = await sb.from("tanken").select("id, nr, datum, daten").order("datum");
    if (error) throw error;
    sessionStorage.setItem("bruell:tanken-geprueft", String(Date.now()));
    const txt = JSON.stringify(data), anders = localStorage.getItem(TANKEN) !== txt;
    still(TANKEN, txt);
    return anders && data.length > 0;
  }

  /* ---------- Ablage: Datenbank → Browser ---------- */
  async function ablageHolen() {
    const { data, error } = await sb.from("ablage").select("schluessel, wert, geaendert").eq("geloescht", false);
    if (error) throw error;
    const alt = lesen(ABLAGESTAND, {}), neu = {}; let geaendert = false;
    for (const r of data) {
      neu[r.schluessel] = r.geaendert;
      const lokal = localStorage.getItem(r.schluessel);
      if (lokal === r.wert) continue;
      /* gab es hier schon vor der Datenbank: Browser-Fassung sichern, Datenbank gilt */
      if (lokal !== null && !(r.schluessel in alt) && !localStorage.getItem("vordb:" + r.schluessel)) still("vordb:" + r.schluessel, lokal);
      still(r.schluessel, r.wert); geaendert = true;
    }
    for (const k of Object.keys(alt)) if (!(k in neu) && localStorage.getItem(k) !== null) { still(k, null); geaendert = true; }
    /* Nicht-GF: nur, was die Datenbank freigibt (eigene Anordnung darf neu sein) */
    if (!gf()) Object.keys(localStorage).filter((k) => ABLAGE.test(k) && !(k in neu) && !eigeneAnordnung(k)).forEach((k) => { still(k, null); geaendert = true; });
    still(ABLAGESTAND, JSON.stringify(neu));
    return geaendert;
  }
  /* nur in diesem Browser (GF): einmalig übernehmen */
  const ablageNurHier = () => { const st = lesen(ABLAGESTAND, {}); return Object.keys(localStorage).filter((k) => ABLAGE.test(k) && !(k in st) && !nurBeispiel(k, localStorage.getItem(k)) && (!k.startsWith("bruell:raster:") || eigeneAnordnung(k))); };
  async function ablageUebernehmen() {
    const ks = ablageNurHier(), jetzt = Date.now();
    const zeilen = ks.map((k) => ({ schluessel: k, wert: localStorage.getItem(k), geaendert: jetzt, geloescht: false }));
    for (let i = 0; i < zeilen.length; i += 20) { const { error } = await sb.from("ablage").upsert(zeilen.slice(i, i + 20)); if (error) throw error; }
    const st = lesen(ABLAGESTAND, {}); ks.forEach((k) => { st[k] = jetzt; }); still(ABLAGESTAND, JSON.stringify(st));
    return ks.length;
  }

  /* ---------- Karten: Browser → Datenbank (nur GF) ---------- */
  const offen = new Map(); let timer = 0, bereit = false;         // Schlüssel "<tabelle>|<nr>" bzw. "ablage|<schlüssel>"
  /* Schreibschutz (gesamt/sperre.js): bearbeitet gerade jemand anders → nichts hochladen */
  const gesperrt = (k) => !!window.BRUELL_GESPERRT || (k === "bruell:werkzeuge" && !!window.BRUELL_WZ_GESPERRT);
  const darfHoch = (s, nr) => schreibt(s) && !gesperrt() && (pb() || nr in lesen(s.stand, {}) || lesen(s.uebernommen, false));
  function vormerken(s, nr) { if (!darfHoch(s, nr)) return; offen.set(s.tabelle + "|" + nr, [s, nr]); clearTimeout(timer); timer = setTimeout(senden, 500); }
  /* Ablage erst nach dem Abgleich hochladen (vorher steht im Browser evtl. ein alter Stand) */
  function ablageVormerken(k) {
    if (!bereit || !(gf() || eigeneAnordnung(k)) || (gesperrt(k) && !eigeneAnordnung(k))) return;
    const t = localStorage.getItem(k);
    if (t === null ? !(k in lesen(ABLAGESTAND, {})) : nurBeispiel(k, t)) return;   // Löschen nur, was in der DB ist; Bank-Demo nie
    offen.set("ablage|" + k, ["ablage", k]); clearTimeout(timer); timer = setTimeout(senden, 500);
  }
  let sendetGerade = 0, lokalZuletzt = 0;                         // Live-Abgleich wartet, solange hier geschrieben wird
  async function senden() {
    sendetGerade++;
    try { await sendenJetzt(); } finally { sendetGerade--; }
  }
  async function sendenJetzt() {
    const liste = [...offen.values()]; offen.clear(); if (!liste.length) return;
    const jetzt = Date.now();
    const ks = liste.filter(([x]) => x === "ablage").map(([, k]) => k);
    if (ks.length) {
      const zeilen = ks.map((k) => { const t = localStorage.getItem(k); return t === null ? { schluessel: k, wert: "", geaendert: jetzt, geloescht: true } : { schluessel: k, wert: t, geaendert: jetzt, geloescht: false }; });
      const { error } = await sb.from("ablage").upsert(zeilen);
      if (error) { melden("Speichern in der Datenbank fehlgeschlagen: " + error.message, true); ks.forEach((k) => offen.set("ablage|" + k, ["ablage", k])); }
      else { const st = lesen(ABLAGESTAND, {}); zeilen.forEach((z) => { if (z.geloescht) delete st[z.schluessel]; else st[z.schluessel] = jetzt; }); still(ABLAGESTAND, JSON.stringify(st)); }
    }
    for (const s of SAMMLUNGEN) {
      const nrs = liste.filter(([x]) => x === s).map(([, nr]) => nr); if (!nrs.length) continue;
      const zeilen = nrs.map((nr) => { const t = localStorage.getItem(s.prefix + nr); return t === null ? { nr, daten: {}, geaendert: jetzt, geloescht: true } : { nr, daten: JSON.parse(t), geaendert: jetzt, geloescht: false }; });
      const { error } = await sb.from(s.tabelle).upsert(zeilen);
      if (error) { melden("Speichern in der Datenbank fehlgeschlagen: " + error.message, true); nrs.forEach((nr) => offen.set(s.tabelle + "|" + nr, [s, nr])); continue; }
      const st = lesen(s.stand, {}); zeilen.forEach((z) => { if (z.geloescht) delete st[z.nr]; else st[z.nr] = jetzt; }); still(s.stand, JSON.stringify(st));
    }
  }
  Storage.prototype.setItem = function (k, v) {
    roh.set.call(this, k, v); if (this !== localStorage) return;
    const m = sammlungVon(k); if (m) vormerken(m[0], m[1]);
    if (m || ABLAGE.test(k) || PH.test(k)) lokalZuletzt = Date.now();
    if (ABLAGE.test(k)) ablageVormerken(k);
    const f = PH.exec(k); if (f && darfHoch(SAMMLUNGEN[0], f[1])) fotoSenden(f[1]);
  };
  Storage.prototype.removeItem = function (k) { roh.del.call(this, k); if (this !== localStorage) return; const m = sammlungVon(k); if (m || ABLAGE.test(k)) lokalZuletzt = Date.now(); if (m) vormerken(m[0], m[1]); if (ABLAGE.test(k)) ablageVormerken(k); };
  window.addEventListener("pagehide", () => { if (offen.size) senden(); });

  /* Einmalige Übernahme: Karten, die es nur in diesem Browser gibt */
  function nurHier(s = SAMMLUNGEN[0]) { const st = lesen(s.stand, {}); return Object.keys(localStorage).map((k) => s.re.exec(k)).filter(Boolean).map((m) => m[1]).filter((nr) => !(nr in st)); }
  async function uebernehmen(s = SAMMLUNGEN[0]) {
    const nrs = nurHier(s), jetzt = Date.now();
    const zeilen = nrs.map((nr) => ({ nr, daten: lesen(s.prefix + nr, {}), geaendert: jetzt, geloescht: false }));
    for (let i = 0; i < zeilen.length; i += 50) { const { error } = await sb.from(s.tabelle).upsert(zeilen.slice(i, i + 50)); if (error) throw error; }
    still(s.uebernommen, "true");
    const st = lesen(s.stand, {}); nrs.forEach((nr) => { st[nr] = jetzt; }); still(s.stand, JSON.stringify(st));
    return nrs.length;
  }
  /* Abweichende Browser-Werte übernehmen (GF hat entschieden) bzw. verwerfen */
  function abweichungUebernehmen(s) {
    const abw = lesen(s.abw, {});
    for (const [nr, felder] of Object.entries(abw)) { const d = lesen(s.prefix + nr, {}); localStorage.setItem(s.prefix + nr, JSON.stringify({ ...d, ...felder })); }   // setItem → wird hochgeladen
    still(s.abw, null); return Object.keys(abw).length;
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /* ---------- kleine Meldung unten ---------- */
  function melden(t, fehler) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.classList.add("an"); clearTimeout(melden.t); melden.t = setTimeout(() => el.classList.remove("an"), fehler ? 6000 : 2600);
  }

  /* Hinweise auf der Übersichtsseite der Sammlung (nur GF): „nur in diesem Browser“ + „abweichende Werte“ */
  function hinweis(id, html, knoepfe) {
    const ziel = document.querySelector("#main .seite"); if (!ziel || document.getElementById(id)) return;
    const box = document.createElement("section");
    box.id = id; box.className = "panel"; box.style.cssText = "margin:0 0 18px;padding:14px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap";
    box.innerHTML = `<span style="flex:1 1 280px">${html}</span>` + knoepfe.map(([t, kl], i) => `<button type="button" class="btn ${kl}" data-i="${i}">${t}</button>`).join("");
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      box.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      try { const t = await knoepfe[+b.dataset.i][2](); box.remove(); if (t) melden(t); }
      catch (err) { box.querySelectorAll("button").forEach((x) => { x.disabled = false; }); melden("Fehlgeschlagen: " + (err.message || err), true); }
    });
    ziel.prepend(box);
  }
  function hinweiseAnbieten() {
    if (!gf()) return;
    const nh = ablageNurHier();
    if (nh.length) {
      const was = [...new Set(nh.map((k) => (ABLAGE_NAMEN.find(([re]) => re.test(k)) || [, k])[1]))].join(", ");
      hinweis("db-uebernahme-ablage", `<b>Daten nur in diesem Browser: ${esc(was)}.</b><br><small class="leise">In die Datenbank auf dem Mac mini übernehmen – danach auf allen Geräten gleich.</small>`,
        [["In die Datenbank übernehmen", "jetzt", async () => `${await ablageUebernehmen()} Einträge übernommen`]]);
    }
    for (const s of SAMMLUNGEN) {
      if (!s.seite.test(location.pathname)) continue;
      const n = nurHier(s).length, abw = lesen(s.abw, {}), na = Object.keys(abw).length;
      const viele = (x) => `${x} ${s.name}${x === 1 ? "" : "n"}`;
      if (n) hinweis("db-uebernahme-" + s.tabelle, `<b>${viele(n)} nur in diesem Browser.</b><br><small class="leise">In die Datenbank auf dem Mac mini übernehmen – danach auf allen Geräten gleich.</small>`,
        [["In die Datenbank übernehmen", "jetzt", async () => `${await uebernehmen(s)} ${s.name}n übernommen`]]);
      if (na) hinweis("db-abweichung-" + s.tabelle, `<b>In diesem Browser stehen bei ${viele(na)} andere Werte als in der Datenbank</b> (${[...new Set(Object.values(abw).flatMap(Object.keys))].slice(0, 6).join(", ")}${Object.values(abw).flatMap(Object.keys).length > 6 ? " …" : ""}).<br><small class="leise">Die Datenbank-Werte werden angezeigt. Die Browser-Fassung ist gesichert.</small>`,
        [["Browser-Werte übernehmen", "jetzt", async () => { const x = abweichungUebernehmen(s); setTimeout(() => location.reload(), 900); return `${x} Karten aktualisiert`; }],
         ["Verwerfen", "still", async () => { still(s.abw, null); return "Datenbank-Werte bleiben"; }]]);
    }
  }

  /* ---------- Start ---------- */
  const fertig = (async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) { aufraeumen(); return { angemeldet: false }; }
    let geaendert = false, anzahl = 0;
    for (const s of SAMMLUNGEN) { const r = await holen(s); geaendert = geaendert || r.geaendert; if (s === SAMMLUNGEN[0]) anzahl = r.anzahl; }
    if (await fotosHolen(Object.keys(lesen(SAMMLUNGEN[0].stand, {})))) geaendert = true;
    if (await tankenHolen()) geaendert = true;
    if (await ablageHolen()) geaendert = true;
    bereit = true;
    /* Erster Besuch / neuer Stand aus der DB: einmal neu laden, damit die Seite ihn zeigt (nicht beim Tippen) */
    const frisch = performance.now() < 4000 && !document.querySelector("input:focus, textarea:focus, select:focus");
    if (geaendert && frisch && !sessionStorage.getItem("bruell:db-neu")) { sessionStorage.setItem("bruell:db-neu", "1"); location.reload(); return { geaendert, anzahl }; }
    sessionStorage.removeItem("bruell:db-neu");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hinweiseAnbieten); else setTimeout(hinweiseAnbieten, 300);
    return { angemeldet: true, geaendert, anzahl };
  })().catch((err) => { console.warn("Datenbank:", err); return { fehler: String(err.message || err) }; });

  /* ---------- Live: alle 10 s Änderungen anderer holen + „Wer ist gerade hier?“ (supabase/live.sql) ----------
     Betrifft eine Änderung die offene Seite, wird sie still neu geladen (gleiche Scroll-Position, gleicher
     Reiter) – aber nie, während jemand tippt, ein Dialog offen ist oder noch etwas hochgeladen wird. */
  const P = location.pathname, NR = (new URLSearchParams(location.search).get("nr") || "").replace(/\D/g, "");
  const INTERESSE = /\/personal\/karte\.html$/.test(P) ? new RegExp(`^(pk_|ph_)${NR}$|^bruell:werkzeuge$`)
    : /\/personal\/lohn\.html$/.test(P) ? /^(pk_\d+|lohn:.+)$/
    : /\/personal\/(index\.html)?$/.test(P) ? /^(pk_|ph_)\d+$/
    : /\/fahrzeuge\/karte\.html$/.test(P) ? new RegExp(`^fz_${NR}$`)
    : /\/fahrzeuge\/(index\.html)?$/.test(P) ? /^fz_\d+$/
    : /\/lager\/(index\.html)?$/.test(P) ? /^bruell:werkzeuge$/
    : /\/betrieb\/(bank|bank-sparkasse|bank-raiba|buchhaltung)\.html$/.test(P) ? /^(buch:|bank:|lohn:konten$)/
    : /\/betrieb\/(index\.html)?$/.test(P) ? /^bm:\d{4}$/
    : null;
  const SEITE = P.replace(/^.*?\/(personal|fahrzeuge|lager|betrieb|konten)\//, "$1/").replace(/^\/+/, "") + (NR ? "?nr=" + NR : "");
  let zuletztGetippt = 0, liveToken = "", neuLadenOffen = false;
  ["input", "keydown", "pointerdown"].forEach((t) => document.addEventListener(t, () => { zuletztGetippt = Date.now(); }, true));
  const ZUSTAND = "bruell:live-zustand";
  function ruhig() {
    const a = document.activeElement;
    return document.visibilityState === "visible" && !offen.size && Date.now() - zuletztGetippt > 15000
      && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !document.querySelector("dialog[open]");
  }
  function neuLaden() {
    const tabs = [...document.querySelectorAll(".tab-btn")], t = tabs.findIndex((b) => b.classList.contains("active"));
    try { sessionStorage.setItem(ZUSTAND, JSON.stringify({ pfad: location.pathname + location.search, y: scrollY, tab: t })); } catch (e) { /* egal */ }
    location.reload();
  }
  /* nach dem Neuladen: Reiter + Scroll-Position wiederherstellen */
  (function () {
    let z = null; try { z = JSON.parse(sessionStorage.getItem(ZUSTAND) || "null"); sessionStorage.removeItem(ZUSTAND); } catch (e) { /* egal */ }
    if (!z || z.pfad !== location.pathname + location.search) return;
    const los = () => setTimeout(() => { const b = document.querySelectorAll(".tab-btn")[z.tab]; if (z.tab > 0 && b) b.click(); scrollTo(0, z.y || 0); melden("Aktualisiert – jemand hat gerade etwas geändert"); }, 250);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los); else los();
  })();
  async function ablageNeu() {
    const st = lesen(ABLAGESTAND, {}), seit = Math.max(0, ...Object.values(st)) - 3e5;   // 5 min Puffer (Uhren der Geräte)
    const { data, error } = await sb.from("ablage").select("schluessel, wert, geaendert, geloescht").gt("geaendert", seit);
    if (error) throw error;
    for (const r of data) {
      if (offen.has("ablage|" + r.schluessel)) continue;              // eigene Änderung ist unterwegs
      if (r.geloescht) { if (r.schluessel in st) { delete st[r.schluessel]; still(r.schluessel, null); } continue; }
      st[r.schluessel] = r.geaendert; still(r.schluessel, r.wert);
    }
    still(ABLAGESTAND, JSON.stringify(st));
  }
  function anwesendZeigen(liste) {
    let el = document.getElementById("db-anwesend");
    if (!liste.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "db-anwesend"; el.setAttribute("aria-live", "polite");
      el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:50;display:flex;gap:6px;align-items:center;padding:6px 10px 6px 12px;border-radius:999px;background:var(--panel,#fff);border:1px solid var(--linie,#d9dde3);box-shadow:0 4px 14px rgba(0,0,0,.12);font-size:.8rem";
      document.body.appendChild(el); }
    el.innerHTML = `<span class="leise">Auch hier:</span>` + liste.map((p) => `<span title="${esc(p.name || p.kuerzel)}" style="display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 6px;border-radius:999px;background:var(--tinte,#13285c);color:#fff;font-weight:700;font-size:.72rem">${esc(String(p.kuerzel || "?").slice(0, 3))}</span>`).join("");
  }
  async function liveRunde() {
    if (document.visibilityState !== "visible") return;
    try { const a = await sb.rpc("anwesenheit_melden", { p_seite: SEITE }); if (!a.error) anwesendZeigen(a.data || []); } catch (e) { /* später */ }
    if (!INTERESSE) return;
    if (sendetGerade || offen.size || Date.now() - lokalZuletzt < 20000) return;   // hier wird gerade geändert → nichts überschreiben
    GEAENDERT.clear();
    try {
      for (const s of SAMMLUNGEN) if (!offen.size) await holen(s);
      if (!offen.size) await ablageNeu();
    } catch (e) { return; }
    if ([...GEAENDERT].some((k) => INTERESSE.test(k))) neuLadenOffen = true;
    if (neuLadenOffen && ruhig()) neuLaden();
  }
  fertig.then(async (r) => {
    if (!r || !r.angemeldet) return;
    try { const x = await sb.auth.getSession(); liveToken = (x.data.session && x.data.session.access_token) || ""; } catch (e) { /* egal */ }
    setTimeout(liveRunde, 1500); setInterval(liveRunde, 10000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") liveRunde(); });
  });
  window.addEventListener("pagehide", () => {
    if (!liveToken) return;
    fetch(K.url + "/rest/v1/rpc/anwesenheit_weg", { method: "POST", keepalive: true, headers: { apikey: K.anonKey, Authorization: "Bearer " + liveToken, "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  });

  /* Abmelden: Supabase-Sitzung beenden + aufräumen (sonst meldet das Bad-Dashboard sofort wieder an) */
  async function abmelden() {
    if (offen.size) await senden();
    try { await sb.auth.signOut(); } catch (e) { /* trotzdem aufräumen */ }
    try { roh.del.call(localStorage, tokenKey); } catch (e) { /* egal */ }
    aufraeumen();
  }

  return { sb, fertig, uebernehmen, nurHier, ablageNurHier, ablageUebernehmen, ich, abmelden, SAMMLUNGEN };
})();
