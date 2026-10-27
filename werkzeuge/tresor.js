#!/usr/bin/env node
/* Verschlüsselt die vertraulichen Daten für die Online-Version:
     Fahrzeuge + Tankvorgänge (window.FZ_VOLL/FZ_TANKEN aus personal/daten-lokal.js) + Mitarbeiterfotos (window.PK_FOTOS aus personal/fotos-lokal.js)
     + Betriebsmonitor (window.BM_DATEN aus betrieb/daten-lokal.js, „Sichern“ im Betriebsmonitor)
   → personal/daten-tresor.js (AES-256-GCM, Schlüssel per PBKDF2-SHA256 aus dem Datenpasswort).
   Ohne Passwort ist die Datei wertlos; das Dashboard fragt es ab (gesamt/tresor.js) und entschlüsselt nur im Browser.
     node werkzeuge/tresor.js                → Passwort aus werkzeuge/tresor-passwort.txt (nur lokal, .gitignore)
     node werkzeuge/tresor.js "<Passwort>"   → Passwort setzen/ändern (wird in tresor-passwort.txt gemerkt)
*/
const fs = require("fs"), path = require("path"), vm = require("vm"), { webcrypto: c } = require("crypto");
const HIER = path.resolve(__dirname, ".."), PW_DATEI = path.join(__dirname, "tresor-passwort.txt");
const ITER = 310000;

(async () => {
  let pw = process.argv[2];
  if (pw) fs.writeFileSync(PW_DATEI, pw + "\n", { mode: 0o600 });
  else if (fs.existsSync(PW_DATEI)) pw = fs.readFileSync(PW_DATEI, "utf8").trim();
  if (!pw) { console.error("Kein Datenpasswort: node werkzeuge/tresor.js \"<Passwort>\""); process.exit(1); }

  const win = {};
  for (const f of ["personal/daten-lokal.js", "personal/fotos-lokal.js", "betrieb/daten-lokal.js"]) {
    const p = path.join(HIER, f);
    if (fs.existsSync(p)) vm.runInNewContext(fs.readFileSync(p, "utf8"), { window: win });
  }
  const inhalt = { FZ_VOLL: win.FZ_VOLL || {}, FZ_TANKEN: win.FZ_TANKEN || {}, FZ_TANKEN_OFFEN: win.FZ_TANKEN_OFFEN || [], PK_FOTOS: win.PK_FOTOS || {}, DATEN_STAND: win.DATEN_STAND || "", ...(win.BM_DATEN ? { BM_DATEN: win.BM_DATEN } : {}) };
  const stand = String(Date.now());

  const salt = c.getRandomValues(new Uint8Array(16)), iv = c.getRandomValues(new Uint8Array(12));
  const basis = await c.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  const key = await c.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, basis, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const daten = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(inhalt))));
  const b64 = (u) => Buffer.from(u).toString("base64");

  const ziel = path.join(HIER, "personal/daten-tresor.js");
  fs.writeFileSync(ziel, `/* Verschlüsselte Fahrzeugdaten + Mitarbeiterfotos (AES-256-GCM). Ohne Datenpasswort nicht lesbar. Erzeugt mit werkzeuge/tresor.js */
window.DATEN_TRESOR = ${JSON.stringify({ v: 1, stand, iter: ITER, salt: b64(salt), iv: b64(iv), daten: b64(daten) })};
`);
  /* Cache-Version in den Seiten hochsetzen, damit Browser die neue Datei holen */
  for (const f of ["index.html", "personal/index.html", "personal/karte.html", "fahrzeuge/index.html", "fahrzeuge/karte.html", "betrieb/index.html"]) {
    const p = path.join(HIER, f), alt = fs.readFileSync(p, "utf8");
    fs.writeFileSync(p, alt.replace(/daten-tresor\.js\?v=\d+/g, "daten-tresor.js?v=" + stand));
  }
  console.log(`✓ ${Object.keys(inhalt.FZ_VOLL).length} Fahrzeuge, ${Object.keys(inhalt.PK_FOTOS).length} Fotos${inhalt.BM_DATEN ? ", Betriebsmonitor" : ""} verschlüsselt → personal/daten-tresor.js (${Math.round(fs.statSync(ziel).size / 1024)} KB)`);
})();
