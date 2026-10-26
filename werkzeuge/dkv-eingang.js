#!/usr/bin/env node
/* DKV-Eingang: überwacht den Ordner „DKV-Eingang“ rund um die Uhr. Sobald dort eine DKV-Rechnung (PDF) oder ein
   DKV-Export (CSV) liegt, wird sie ausgelesen:
     • Tankvorgänge je Fahrzeug (Zuordnung über Kennzeichen, sonst DKV-Kartennummer) → window.FZ_TANKEN
     • höchster plausibler Kilometerstand → fz_km der Fahrzeugkarte
     • nicht zuordenbare Buchungen → window.FZ_TANKEN_OFFEN (im Dashboard sichtbar)
   Danach wandert die Datei nach DKV-Eingang/verarbeitet/ (bei Fehlern nach DKV-Eingang/fehler/ + Begründung).
   Heute schreibt der Dienst in personal/daten-lokal.js (und erneuert den Tresor), auf dem Mac mini später in die Datenbank.
     node werkzeuge/dkv-eingang.js            → läuft dauerhaft (prüft alle 10 Sekunden)
     node werkzeuge/dkv-eingang.js --einmal   → verarbeitet, was da ist, und beendet sich
   Ordner ändern: DKV_EINGANG=/pfad node werkzeuge/dkv-eingang.js
*/
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");
const { lesen } = require("./dkv-lesen");

const HIER = path.resolve(__dirname, "..");
const EINGANG = path.resolve(process.env.DKV_EINGANG || path.join(HIER, "DKV-Eingang"));
const DATEN = path.join(HIER, "personal/daten-lokal.js");
const TAKT = 10_000;
for (const o of ["", "verarbeitet", "fehler"]) fs.mkdirSync(path.join(EINGANG, o), { recursive: true });

const jetzt = () => new Date().toLocaleString("de-DE");
function log(text) {
  const zeile = `${jetzt()}  ${text}`;
  console.log(zeile);
  fs.appendFileSync(path.join(EINGANG, "protokoll.txt"), zeile + "\n");
}
const normK = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ziffern = (s) => String(s || "").replace(/\D/g, "");
const TANKEN = /diesel|super|benzin|e10|e5|lpg|autogas|strom/i;   // zählt als Tankvorgang (AdBlue, Wäsche … nur im Betrag)

/* ---------- daten-lokal.js lesen/schreiben ---------- */
function datenLesen() {
  const w = {};
  vm.runInNewContext(fs.readFileSync(DATEN, "utf8"), { window: w });
  return { FZ_VOLL: w.FZ_VOLL || {}, FZ_TANKEN: w.FZ_TANKEN || {}, FZ_TANKEN_OFFEN: w.FZ_TANKEN_OFFEN || [] };
}
function datenSchreiben(werte) {
  let src = fs.readFileSync(DATEN, "utf8");
  for (const [k, v] of Object.entries(werte)) {
    const zeile = `window.${k} = ${JSON.stringify(v)};`;
    const re = new RegExp(`^window\\.${k} = .*;\\s*$`, "m");
    src = re.test(src) ? src.replace(re, () => zeile) : src.replace(/\n?$/, "\n") + zeile + "\n";
  }
  fs.writeFileSync(DATEN, src); fs.chmodSync(DATEN, 0o600);
}

/* ---------- eine Datei verarbeiten ---------- */
function verarbeiten(datei) {
  const name = path.basename(datei);
  const { rechnung, buchungen } = lesen(datei);
  if (!buchungen.length) throw new Error("Keine Tankvorgänge erkannt. Ist das eine DKV-Rechnung bzw. ein DKV-Export?");

  const d = datenLesen();
  const fahrzeuge = Object.entries(d.FZ_VOLL);
  const finden = (b) => {
    const k = normK(b.kennz), z = ziffern(b.karte);
    return (k && fahrzeuge.find(([, f]) => normK(f.fz_kennzeichen) === k))
      || (z.length >= 5 && fahrzeuge.find(([, f]) => ziffern(f.fz_dkv) && ziffern(f.fz_dkv).endsWith(z.slice(-5))))
      || null;
  };
  const schluessel = (b) => [b.datum, normK(b.kennz) || ziffern(b.karte), b.betrag, b.menge, b.km].join("|");
  const bekannt = new Set([...Object.values(d.FZ_TANKEN).flat(), ...d.FZ_TANKEN_OFFEN].map((b) => b.id));

  let neu = 0, doppelt = 0, offen = 0;
  const kmNeu = {}, proFz = {};
  const zaehlen = (k, b) => { const s = (proFz[k] = proFz[k] || { n: 0, eur: 0 }); if (TANKEN.test(b.produkt || "Diesel")) s.n++; s.eur += b.betrag || 0; };
  for (const b of buchungen) {
    const eintrag = { id: schluessel(b), ...b, rechnung: rechnung || name, quelle: name };
    if (bekannt.has(eintrag.id)) { doppelt++; continue; }
    bekannt.add(eintrag.id);
    const treffer = finden(b);
    if (!treffer) { d.FZ_TANKEN_OFFEN.push(eintrag); offen++; zaehlen("nicht zugeordnet", b); continue; }
    const [nr, f] = treffer;
    zaehlen(f.fz_kennzeichen || nr, b);
    (d.FZ_TANKEN[nr] = d.FZ_TANKEN[nr] || []).push(eintrag); neu++;
  }

  /* Kilometerstand: höchster Wert, der zum bisherigen Stand passt (nicht kleiner, nicht > 50 000 km Sprung) */
  for (const [nr, liste] of Object.entries(d.FZ_TANKEN)) {
    liste.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    const f = d.FZ_VOLL[nr]; if (!f) continue;
    let km = Number(f.fz_km) || 0, wann = f.fz_km_datum || "";
    for (const b of liste) if (b.km && b.km >= km && (!km || b.km - km < 50000)) { km = b.km; wann = b.datum; }
    if (km && km !== Number(f.fz_km)) { f.fz_km = String(km); f.fz_km_datum = wann; kmNeu[f.fz_kennzeichen || nr] = km; }
  }

  datenSchreiben({ FZ_VOLL: d.FZ_VOLL, FZ_TANKEN: d.FZ_TANKEN, FZ_TANKEN_OFFEN: d.FZ_TANKEN_OFFEN });

  log(`✓ ${name}${rechnung ? ` (Rechnung ${rechnung})` : ""}: ${neu} neu, ${doppelt} schon bekannt, ${offen} nicht zugeordnet`);
  for (const [k, s] of Object.entries(proFz)) log(`    ${k.padEnd(16)} ${String(s.n).padStart(3)}× getankt  ${s.eur.toFixed(2).replace(".", ",").padStart(10)} €`);
  for (const [k, km] of Object.entries(kmNeu)) log(`    Kilometerstand ${k}: ${km.toLocaleString("de-DE")} km`);
}

/* Tresor für die Online-Version erneuern (nur wenn das Datenpasswort lokal hinterlegt ist) */
function tresorErneuern() {
  if (!fs.existsSync(path.join(__dirname, "tresor-passwort.txt"))) return;
  try { execFileSync(process.execPath, [path.join(__dirname, "tresor.js")], { stdio: "pipe" }); log("  Tresor erneuert (für die Online-Version noch pushen)"); }
  catch (e) { log("  ⚠ Tresor konnte nicht erneuert werden: " + e.message); }
}

/* ---------- Ordner überwachen ---------- */
const groessen = new Map();                              // Datei erst verarbeiten, wenn sie fertig kopiert ist
function runde() {
  const dateien = fs.readdirSync(EINGANG).filter((f) => /\.(pdf|csv)$/i.test(f) && !f.startsWith("."));
  let etwas = false;
  for (const f of dateien) {
    const p = path.join(EINGANG, f), g = fs.statSync(p).size;
    if (groessen.get(f) !== g) { groessen.set(f, g); continue; }
    groessen.delete(f);
    const stempel = new Date().toISOString().slice(0, 10) + "_";
    try { verarbeiten(p); fs.renameSync(p, path.join(EINGANG, "verarbeitet", stempel + f)); etwas = true; }
    catch (e) {
      log(`✗ ${f}: ${e.message}`);
      fs.renameSync(p, path.join(EINGANG, "fehler", stempel + f));
      fs.writeFileSync(path.join(EINGANG, "fehler", stempel + f + ".txt"), `${jetzt()}\n${e.stack || e.message}\n`);
    }
  }
  if (etwas) tresorErneuern();
  return dateien.length;
}

if (process.argv.includes("--einmal")) {
  runde(); setTimeout(() => { runde(); }, 1100);         // zweite Runde: Größe ist dann bestätigt
} else {
  log(`DKV-Eingang läuft – überwacht ${EINGANG}`);
  runde(); setInterval(runde, TAKT);
}
