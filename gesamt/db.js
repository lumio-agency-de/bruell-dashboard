/* ==========================================================================
   Brüll Dashboard – Datenbank (Supabase auf dem Mac mini) für die Gesamt-Seiten
   --------------------------------------------------------------------------
   Aktiv nur, wenn der Server /gesamt/cloud.js ausliefert (setzt window.BRUELL_CLOUD; nicht im Repo).
   Ohne (GitHub Pages, lokal) bleibt alles wie bisher im Browser.

   Personalkarten: Die Seiten lesen/schreiben weiter „pk_<Nr>“ im Browser-Speicher. Diese Datei hält
   den Speicher mit der Tabelle „personal“ gleich:
     • beim Laden: Stand aus der Datenbank holen (GF: alle Karten, sonst nur die eigene) → pk_<Nr>
     • beim Speichern einer Karte (GF): Änderung wird in die Datenbank geschrieben
     • Karten, die es bisher nur in diesem Browser gibt, übernimmt die GF einmalig per Knopf
   Fotos: Bucket „personal“, Pfad foto/<Nr>/foto  ↔  ph_<Nr> im Browser (Daten-URL) + window.PK_FOTOS.
   Laden vor personal.js / uebersicht.js (braucht ../bad/app/vendor/supabase.js davor).
   ========================================================================== */
window.BruellDB = (function () {
  "use strict";
  const K = window.BRUELL_CLOUD;
  if (!K || !K.url || !K.anonKey || !window.supabase) return null;
  const sb = window.supabase.createClient(K.url, K.anonKey, { auth: { persistSession: true } });   // dieselbe Sitzung wie im Bad-Dashboard
  const PK = /^pk_(\d+)$/, PH = /^ph_(\d+)$/, STAND = "bruell:pk-db", FOTOSTAND = "bruell:ph-db";   // STAND/FOTOSTAND: was zuletzt aus der DB kam
  const roh = { set: Storage.prototype.setItem, del: Storage.prototype.removeItem };
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const still = (k, v) => { try { v == null ? roh.del.call(localStorage, k) : roh.set.call(localStorage, k, v); } catch (e) { /* voll */ } };
  const ich = () => { try { const e = JSON.parse(sessionStorage.getItem("bruell:sitzung") || localStorage.getItem("bruell:sitzung") || "null"); return lesen("bruell:konten", []).find((x) => x.email === e) || null; } catch (e) { return null; } };
  const gf = () => (ich() || {}).ebene === "geschaeftsfuehrung";

  /* Ohne gültige Supabase-Sitzung: gespiegelte Anmeldung löschen → Seiten gehen zur Anmeldung.
     Personalkarten nur löschen, wenn sie aus der DB kamen (dort sicher). Karten, die es nur hier gibt,
     sowie Fotos/Fahrzeuge (noch nicht in der DB) bleiben – sonst gingen Daten verloren. */
  function aufraeumen() {
    try {
      const st = lesen(STAND, {}), fs = lesen(FOTOSTAND, {});
      Object.keys(st).forEach((nr) => roh.del.call(localStorage, "pk_" + nr));
      Object.keys(fs).forEach((nr) => roh.del.call(localStorage, "ph_" + nr));
      ["bruell:sitzung", "bruell:konten", STAND, FOTOSTAND].forEach((k) => roh.del.call(localStorage, k));
      sessionStorage.removeItem("bruell:sitzung");
    } catch (e) { /* egal */ }
  }
  const tokenKey = "sb-" + new URL(K.url).hostname.split(".")[0] + "-auth-token";
  if (!localStorage.getItem(tokenKey)) aufraeumen();          // synchron: vor personal.js, damit es sofort zur Anmeldung geht

  /* ---------- Personal: Datenbank → Browser ---------- */
  async function holen() {
    const neu = {};
    if (gf()) {
      const { data, error } = await sb.from("personal").select("nr, daten, geaendert").eq("geloescht", false);
      if (error) throw error;
      data.forEach((r) => { neu[r.nr] = r; });
    } else {
      const { data, error } = await sb.rpc("meine_personalkarte");
      if (error) throw error;
      if (data) neu[data.nr] = data;
    }
    const alt = lesen(STAND, {}); let geaendert = false;
    for (const [nr, r] of Object.entries(neu)) {
      const txt = JSON.stringify(r.daten);
      if (localStorage.getItem("pk_" + nr) !== txt) { still("pk_" + nr, txt); geaendert = true; }
    }
    /* früher aus der DB gekommen, dort jetzt weg (gelöscht/keine Berechtigung mehr) → auch hier weg */
    for (const nr of Object.keys(alt)) if (!neu[nr] && localStorage.getItem("pk_" + nr) !== null) { still("pk_" + nr, null); geaendert = true; }
    /* Nicht-GF: im Browser nur die eigene Karte – Reste früherer Sitzungen/Vorlagen entfernen */
    if (!gf()) Object.keys(localStorage).map((k) => PK.exec(k)).filter((m) => m && !neu[m[1]]).forEach((m) => { still(m[0], null); geaendert = true; });
    still(STAND, JSON.stringify(Object.fromEntries(Object.entries(neu).map(([nr, r]) => [nr, r.geaendert]))));
    return { geaendert, anzahl: Object.keys(neu).length };
  }

  /* ---------- Fotos: Dateispeicher → Browser ---------- */
  const alsDatenUrl = (blob) => new Promise((ok, nein) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = nein; r.readAsDataURL(blob); });
  async function fotosHolen(nrs) {
    const alt = lesen(FOTOSTAND, {}), neu = {}; let geaendert = false;
    await Promise.all(nrs.map(async (nr) => {
      const { data } = await sb.storage.from("personal").list("foto/" + nr, { limit: 5 });
      const f = (data || []).find((x) => x.name === "foto"); if (!f) return;
      const stand = f.updated_at || f.created_at || "1"; neu[nr] = stand;
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
    if (!gf()) return;
    const url = localStorage.getItem("ph_" + nr); if (!url || !url.startsWith("data:")) return;
    const blob = await (await fetch(url)).blob();
    const { error } = await sb.storage.from("personal").upload("foto/" + nr + "/foto", blob, { upsert: true, contentType: blob.type || "image/jpeg" });
    if (error) melden("Foto speichern fehlgeschlagen: " + error.message, true);
  }

  /* ---------- Personal: Browser → Datenbank (nur GF) ---------- */
  const offen = new Map(); let timer = 0;
  const darfHoch = (nr) => gf() && (nr in lesen(STAND, {}) || lesen("bruell:pk-uebernommen", false));
  function vormerken(nr) { if (!darfHoch(nr)) return; offen.set(nr, true); clearTimeout(timer); timer = setTimeout(senden, 500); }
  async function senden() {
    const nrs = [...offen.keys()]; offen.clear(); if (!nrs.length) return;
    const jetzt = Date.now(), zeilen = nrs.map((nr) => { const t = localStorage.getItem("pk_" + nr); return t === null ? { nr, daten: {}, geaendert: jetzt, geloescht: true } : { nr, daten: JSON.parse(t), geaendert: jetzt, geloescht: false }; });
    const { error } = await sb.from("personal").upsert(zeilen);
    if (error) { melden("Speichern in der Datenbank fehlgeschlagen: " + error.message, true); nrs.forEach((nr) => offen.set(nr, true)); return; }
    const st = lesen(STAND, {}); zeilen.forEach((z) => { if (z.geloescht) delete st[z.nr]; else st[z.nr] = jetzt; }); still(STAND, JSON.stringify(st));
  }
  Storage.prototype.setItem = function (k, v) {
    roh.set.call(this, k, v); if (this !== localStorage) return;
    const m = PK.exec(k); if (m) vormerken(m[1]);
    const f = PH.exec(k); if (f && darfHoch(f[1])) fotoSenden(f[1]);
  };
  Storage.prototype.removeItem = function (k) { roh.del.call(this, k); const m = this === localStorage && PK.exec(k); if (m) vormerken(m[1]); };
  window.addEventListener("pagehide", () => { if (offen.size) senden(); });

  /* Einmalige Übernahme: Karten, die es nur in diesem Browser gibt */
  function nurHier() { const st = lesen(STAND, {}); return Object.keys(localStorage).map((k) => PK.exec(k)).filter(Boolean).map((m) => m[1]).filter((nr) => !(nr in st)); }
  async function uebernehmen() {
    const nrs = nurHier(), jetzt = Date.now();
    const zeilen = nrs.map((nr) => ({ nr, daten: lesen("pk_" + nr, {}), geaendert: jetzt, geloescht: false }));
    for (let i = 0; i < zeilen.length; i += 50) { const { error } = await sb.from("personal").upsert(zeilen.slice(i, i + 50)); if (error) throw error; }
    still("bruell:pk-uebernommen", "true");
    const st = lesen(STAND, {}); nrs.forEach((nr) => { st[nr] = jetzt; }); still(STAND, JSON.stringify(st));
    return nrs.length;
  }

  /* ---------- kleine Meldung unten ---------- */
  function melden(t, fehler) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.classList.add("an"); clearTimeout(melden.t); melden.t = setTimeout(() => el.classList.remove("an"), fehler ? 6000 : 2600);
  }

  /* Hinweis + Knopf „Übernehmen“ auf der Mitarbeiter-Übersicht (nur GF, nur wenn es Karten nur im Browser gibt) */
  function uebernahmeAnbieten() {
    if (!gf() || !/\/personal\/(index\.html)?$/.test(location.pathname)) return;
    const n = nurHier().length, ziel = document.querySelector("#main .seite"); if (!n || !ziel || document.getElementById("db-uebernahme")) return;
    const box = document.createElement("section");
    box.id = "db-uebernahme"; box.className = "panel"; box.style.cssText = "margin:0 0 18px;padding:14px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap";
    box.innerHTML = `<span style="flex:1 1 280px"><b>${n} Personalkarte${n === 1 ? "" : "n"} nur in diesem Browser.</b><br><small class="leise">In die Datenbank auf dem Mac mini übernehmen – danach auf allen Geräten gleich.</small></span><button type="button" class="btn jetzt">In die Datenbank übernehmen</button>`;
    box.querySelector("button").addEventListener("click", async (e) => {
      e.target.disabled = true; e.target.textContent = "Übernehme …";
      try { const x = await uebernehmen(); box.remove(); melden(`${x} Personalkarten übernommen`); }
      catch (err) { e.target.disabled = false; e.target.textContent = "Nochmal versuchen"; melden("Übernahme fehlgeschlagen: " + (err.message || err), true); }
    });
    ziel.prepend(box);
  }

  /* ---------- Start ---------- */
  const fertig = (async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) { aufraeumen(); return { angemeldet: false }; }
    const r = await holen();
    if (await fotosHolen(Object.keys(lesen(STAND, {})))) r.geaendert = true;
    /* Erster Besuch / neuer Stand aus der DB: einmal neu laden, damit die Seite ihn zeigt (nicht beim Tippen) */
    const frisch = performance.now() < 4000 && !document.querySelector("input:focus, textarea:focus, select:focus");
    if (r.geaendert && frisch && !sessionStorage.getItem("bruell:db-neu")) { sessionStorage.setItem("bruell:db-neu", "1"); location.reload(); return r; }
    sessionStorage.removeItem("bruell:db-neu");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", uebernahmeAnbieten); else setTimeout(uebernahmeAnbieten, 300);
    return { angemeldet: true, ...r };
  })().catch((err) => { console.warn("Datenbank:", err); return { fehler: String(err.message || err) }; });

  /* Abmelden: Supabase-Sitzung beenden + aufräumen (sonst meldet das Bad-Dashboard sofort wieder an) */
  async function abmelden() {
    if (offen.size) await senden();
    try { await sb.auth.signOut(); } catch (e) { /* trotzdem aufräumen */ }
    try { roh.del.call(localStorage, tokenKey); } catch (e) { /* egal */ }
    aufraeumen();
  }

  return { sb, fertig, uebernehmen, nurHier, ich, abmelden };
})();
