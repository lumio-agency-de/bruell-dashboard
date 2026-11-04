/* ==========================================================================
   Brüll Dashboard – Dateien (Dokumente, Lohnzettel, Fahrzeug-Dokumente)
   --------------------------------------------------------------------------
   BruellDateien.put(schluessel, datei) / .get(schluessel) / .del(schluessel)
   Immer: Ablage im Browser (IndexedDB „bruell-dokumente“, Store „dateien“) – wie bisher.
   Mac mini (gesamt/db.js aktiv): zusätzlich im geschützten Dateispeicher (Supabase Storage);
   Öffnen holt die Datei bei Bedarf vom Server (auch an einem anderen Gerät).
     „<Nr>:lz-<JJJJ-MM>“  → Bucket personal   lohnzettel/<Nr>/lz-<JJJJ-MM>
     „<Nr>:<Feld-ID>“     → Bucket personal   dokumente/<Nr>/<Feld-ID>
     „fz:<Nr>:<Zeile>“    → Bucket fahrzeuge  dokumente/<Nr>/<Zeile>
     andere (z. B. „wz-bild:…“) bleiben nur im Browser.
   Rechte prüft die Datenbank (supabase/personal.sql, fahrzeuge.sql).
   Laden nach db.js (falls vorhanden) und vor der Seite.
   ========================================================================== */
window.BruellDateien = (function () {
  "use strict";
  let dbP;
  const idb = () => (dbP = dbP || new Promise((ok, f) => { const r = indexedDB.open("bruell-dokumente", 1); r.onupgradeneeded = () => r.result.createObjectStore("dateien"); r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error); }));
  async function lokal(art, fn) {
    const d = await idb();
    return new Promise((ok, f) => { const t = d.transaction("dateien", art), req = fn(t.objectStore("dateien")); t.oncomplete = () => ok(req && req.result); t.onerror = () => f(t.error); });
  }
  const sicher = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_");
  function ziel(k) {
    let m;
    if ((m = /^fz:(\d+):(.+)$/.exec(k))) return ["fahrzeuge", `dokumente/${m[1]}/${sicher(m[2])}`];
    if ((m = /^(\d+):(lz-.+)$/.exec(k))) return ["personal", `lohnzettel/${m[1]}/${sicher(m[2])}`];
    if ((m = /^(\d+):(.+)$/.exec(k))) return ["personal", `dokumente/${m[1]}/${sicher(m[2])}`];
    return null;
  }
  const server = () => window.BruellDB && window.BruellDB.sb;

  async function put(k, datei) {
    await lokal("readwrite", (st) => st.put(datei, k));
    const z = ziel(k), sb = server(); if (!z || !sb) return;
    const { error } = await sb.storage.from(z[0]).upload(z[1], datei, { upsert: true, contentType: datei.type || "application/octet-stream" });
    if (error) throw new Error("Hochladen auf den Server fehlgeschlagen: " + error.message);
  }
  async function get(k) {
    const hier = await lokal("readonly", (st) => st.get(k)).catch(() => null);
    if (hier) return hier;
    const z = ziel(k), sb = server(); if (!z || !sb) return null;
    const { data, error } = await sb.storage.from(z[0]).download(z[1]);
    if (error || !data) return null;
    lokal("readwrite", (st) => st.put(data, k)).catch(() => {});          // für das nächste Mal zwischenspeichern
    return data;
  }
  async function del(k) {
    await lokal("readwrite", (st) => st.delete(k)).catch(() => {});
    const z = ziel(k), sb = server(); if (!z || !sb) return;
    await sb.storage.from(z[0]).remove([z[1]]);
  }

  /* Einmal je Sitzung (nur GF): Dateien, die bisher nur in diesem Browser liegen, auf den Server laden */
  async function abgleichen() {
    const sb = server(); if (!sb || sessionStorage.getItem("bruell:dateien-abgeglichen")) return 0;
    const ich = window.BruellDB.ich && window.BruellDB.ich(); if (!ich || ich.ebene !== "geschaeftsfuehrung") return 0;
    const da = (await sb.rpc("personal_dateien")).data || {};
    const fz = (await sb.storage.from("fahrzeuge").list("dokumente", { limit: 1000 })).data || [];
    const fzDa = new Set();
    for (const ordner of fz) { const l = (await sb.storage.from("fahrzeuge").list("dokumente/" + ordner.name, { limit: 1000 })).data || []; l.forEach((f) => fzDa.add(`dokumente/${ordner.name}/${f.name}`)); }
    const schluessel = await lokal("readonly", (st) => st.getAllKeys()).catch(() => []);
    let n = 0;
    for (const k of schluessel) {
      const z = ziel(String(k)); if (!z) continue;
      if (z[0] === "personal" ? da[z[1]] : fzDa.has(z[1])) continue;
      const datei = await lokal("readonly", (st) => st.get(k)).catch(() => null); if (!datei) continue;
      const { error } = await sb.storage.from(z[0]).upload(z[1], datei, { upsert: true, contentType: datei.type || "application/octet-stream" });
      if (!error) n++;
    }
    sessionStorage.setItem("bruell:dateien-abgeglichen", "1");
    return n;
  }
  if (server()) window.BruellDB.fertig.then((r) => r && r.angemeldet && abgleichen()).then((n) => { if (n) console.info(`Dateien: ${n} aus diesem Browser auf den Server geladen`); }).catch((e) => console.warn("Dateien:", e));

  return { put, get, del, abgleichen, ziel };
})();
