/* Speicher: Browser (localStorage) als Grundlage, optional eine Datendatei
   (z. B. auf dem Netzlaufwerk), damit das ganze Büro dieselben Projekte sieht.
   Die Datei wird beim Speichern zuerst neu gelesen und projektweise
   zusammengeführt (neuere Änderung gewinnt) — so überschreiben sich zwei
   Kolleginnen nicht gegenseitig. */

(function () {
  "use strict";

  const LS_KEY = "baddashboard:v1";
  const IDB_NAME = "baddashboard";
  const DATEI_HINWEIS = "badprojekte.json";

  const leer = () => ({
    version: 1,
    projekte: [],
    einstellungen: null,
    einstellungenGeaendert: 0,
    notizen: {},
    notizenGeaendert: 0,
  });

  let daten = leer();
  let dateiHandle = null;
  let dateiStand = 0;          // lastModified der Datei beim letzten Lesen/Schreiben
  let dateiStatus = "aus";     // aus | verbunden | getrennt | fehler
  let speichernTimer = null;
  const hoerer = new Set();

  /* ---------- IndexedDB nur für den Datei-Handle ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(v, k);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) { /* ohne IndexedDB geht es auch */ }
  }
  async function idbGet(k) {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const r = db.transaction("kv").objectStore("kv").get(k);
        r.onsuccess = () => res(r.result); r.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }

  /* ---------- Zusammenführen ---------- */
  function zusammenfuehren(lokal, fremd) {
    const out = leer();
    const map = new Map();
    for (const p of fremd.projekte || []) map.set(p.id, p);
    for (const p of lokal.projekte || []) {
      const f = map.get(p.id);
      if (!f || (p.geaendert || 0) >= (f.geaendert || 0)) map.set(p.id, p);
    }
    out.projekte = [...map.values()];
    const lE = lokal.einstellungenGeaendert || 0, fE = fremd.einstellungenGeaendert || 0;
    out.einstellungen = lE >= fE ? lokal.einstellungen : fremd.einstellungen;
    out.einstellungenGeaendert = Math.max(lE, fE);
    const lN = lokal.notizenGeaendert || 0, fN = fremd.notizenGeaendert || 0;
    out.notizen = lN >= fN ? (lokal.notizen || {}) : (fremd.notizen || {});
    out.notizenGeaendert = Math.max(lN, fN);
    return out;
  }

  function pruefen(obj) {
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.projekte)) {
      throw new Error("Das ist keine Dashboard-Datendatei.");
    }
    return Object.assign(leer(), obj);
  }

  /* ---------- localStorage ---------- */
  function lokalLaden() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) daten = pruefen(JSON.parse(raw));
    } catch (e) { daten = leer(); }
  }
  function lokalSchreiben() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(daten)); } catch (e) { /* voll/gesperrt */ }
  }

  /* ---------- Datei ---------- */
  async function dateiLesen() {
    const f = await dateiHandle.getFile();
    const text = await f.text();
    return { stand: f.lastModified, inhalt: text.trim() ? pruefen(JSON.parse(text)) : leer() };
  }
  async function dateiSchreiben() {
    const { stand, inhalt } = await dateiLesen();
    if (stand !== dateiStand) daten = zusammenfuehren(daten, inhalt);
    const w = await dateiHandle.createWritable();
    await w.write(JSON.stringify(daten, null, 1));
    await w.close();
    dateiStand = (await dateiHandle.getFile()).lastModified;
    lokalSchreiben();
  }

  async function erlaubnis(handle, fragen) {
    const opt = { mode: "readwrite" };
    if ((await handle.queryPermission(opt)) === "granted") return true;
    if (fragen && (await handle.requestPermission(opt)) === "granted") return true;
    return false;
  }

  async function dateiAktivieren(handle, mitLokalenDaten) {
    dateiHandle = handle;
    const { stand, inhalt } = await dateiLesen();
    daten = mitLokalenDaten ? zusammenfuehren(daten, inhalt) : inhalt;
    dateiStand = stand;
    dateiStatus = "verbunden";
    await idbSet("datei", handle);
    await dateiSchreiben();
    melden();
  }

  function melden() { for (const f of hoerer) f(); }

  /* ---------- öffentliche Schnittstelle ---------- */
  const Store = {
    get daten() { return daten; },
    get dateiStatus() { return dateiStatus; },
    get dateiName() { return dateiHandle ? dateiHandle.name : null; },
    dateiMoeglich: typeof window.showOpenFilePicker === "function",

    async start() {
      lokalLaden();
      if (!Store.dateiMoeglich) return;
      const h = await idbGet("datei");
      if (!h) return;
      dateiHandle = h;
      try {
        if (await erlaubnis(h, false)) await dateiAktivieren(h, true);
        else dateiStatus = "getrennt";
      } catch (e) { dateiStatus = "getrennt"; }
    },

    beobachten(fn) { hoerer.add(fn); return () => hoerer.delete(fn); },

    /* nach jeder Änderung aufrufen */
    speichern() {
      lokalSchreiben();
      if (dateiStatus !== "verbunden") return;
      clearTimeout(speichernTimer);
      speichernTimer = setTimeout(async () => {
        try { await dateiSchreiben(); Store.zuletzt = Date.now(); }
        catch (e) { dateiStatus = "fehler"; }
        melden();
      }, 400);
    },

    /* Änderungen der Kolleg:innen holen (bei Fokus/alle 20 s) */
    async abgleichen() {
      if (dateiStatus !== "verbunden") return false;
      try {
        const f = await dateiHandle.getFile();
        if (f.lastModified === dateiStand) return false;
        const { stand, inhalt } = await dateiLesen();
        daten = zusammenfuehren(daten, inhalt);
        dateiStand = stand;
        lokalSchreiben();
        return true;
      } catch (e) { dateiStatus = "fehler"; melden(); return false; }
    },

    async dateiNeu() {
      const h = await window.showSaveFilePicker({
        suggestedName: DATEI_HINWEIS,
        types: [{ description: "Dashboard-Daten", accept: { "application/json": [".json"] } }],
      });
      await h.createWritable().then((w) => w.write("").then(() => w.close()));
      await dateiAktivieren(h, true);
    },
    async dateiOeffnen() {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: "Dashboard-Daten", accept: { "application/json": [".json"] } }],
      });
      await dateiAktivieren(h, true);
    },
    async dateiWiederverbinden() {
      if (!dateiHandle) return;
      if (await erlaubnis(dateiHandle, true)) await dateiAktivieren(dateiHandle, true);
    },
    async dateiTrennen() {
      dateiHandle = null; dateiStatus = "aus";
      await idbSet("datei", null);
      melden();
    },

    exportText() { return JSON.stringify(daten, null, 1); },
    importieren(text) {
      daten = zusammenfuehren(daten, pruefen(JSON.parse(text)));
      Store.speichern();
      melden();
    },
    zuletzt: 0,
  };

  window.Store = Store;
})();
