#!/usr/bin/env node
/* Ordner-Sync für das Bad-Dashboard
   ------------------------------------------------------------------
   Läuft auf dem Büro-Rechner bzw. dem NAS und hält einen ganz normalen
   Ordner mit dem Dashboard abgeglichen:

   1. Sichtbare Ordnerstruktur
      <Wurzel>/<Projektnr>_<Nachname>_<Vorname>/<Ordner aus dem Dashboard>/…
      Dateien aus dem Dashboard (auch Kunden-Uploads) landen dort automatisch.
      Was jemand im Explorer in einen Projektordner legt, erscheint im Dashboard.

   2. Palette-Eingang
      <Wurzel>/_Eingang Palette/  – Palette CAD speichert Exposé, Angebot und
      Renderings hierhin. Steht die Projektnummer im Dateinamen
      (z. B. „B-2026-014 Exposé.pdf“), wird die Datei dem Projekt zugeordnet,
      in den passenden Ordner sortiert und hochgeladen.

   Gelöscht wird nie automatisch – weder im Ordner noch im Dashboard.

   Start:  node ordner-sync.mjs --wurzel "/volume1/Projekte Bad" [--einmal]
   Umgebung (oder Datei .env daneben):
     SUPABASE_URL=https://…          (bzw. die Adresse des eigenen Servers)
     SUPABASE_SERVICE_KEY=…          (service_role – bleibt nur auf diesem Gerät!)
   Node 18 oder neuer, keine weiteren Pakete nötig.
*/
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = "akten";
const EINGANG = "_Eingang Palette";
const STATUS_DATEI = ".ordner-sync.json";
const RUHEZEIT_MS = 15_000;          // Datei muss so lange unverändert sein, bevor sie hochgeht (Kopiervorgang fertig)
const INTERVALL_MS = 60_000;

/* ---------- Einstellungen ---------- */
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
const env = { ...leseEnv(path.join(HIER, ".env")), ...process.env };
const URL_ = (arg("url") || env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY || "";
const WURZEL = arg("wurzel") || env.SYNC_WURZEL;
const EINMAL = args.includes("--einmal");
if (!URL_ || !KEY || !WURZEL) {
  console.error("Bitte SUPABASE_URL, SUPABASE_SERVICE_KEY und --wurzel <Ordner> angeben (siehe Kopf dieser Datei).");
  process.exit(1);
}

function leseEnv(f) {
  try {
    return Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).filter((z) => /^\s*[A-Z_]+\s*=/.test(z))
      .map((z) => { const i = z.indexOf("="); return [z.slice(0, i).trim(), z.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  } catch { return {}; }
}

/* Ordnerliste aus einstellungen/ablauf.js – dieselbe wie im Dashboard */
function kategorien() {
  const datei = path.resolve(HIER, "../../einstellungen/ablauf.js");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(datei, "utf8"), sandbox, { filename: datei });
  return sandbox.window.KATEGORIEN.filter((k) => !k.nurMitDateien);
}
const KAT = kategorien();
const ordnerName = (k) => `${String(KAT.indexOf(k) + 1).padStart(2, "0")} ${k.titel}`;
const katAusOrdner = (name) => KAT.find((k) => ordnerName(k) === name || k.titel === name);

/* Palette-Exporte einsortieren */
function paletteKategorie(name) {
  if (/expos/i.test(name)) return "expose";
  if (/angebot/i.test(name)) return "angebot";
  if (/auftrag/i.test(name)) return "auftrag";
  if (/bestell|auswahl|material/i.test(name)) return "auswahl";
  return "planung";                                   // Renderings, Grundrisse, Ansichten
}

/* ---------- Supabase (REST, ohne Zusatzpakete) ---------- */
const kopf = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function rest(pfad, opt = {}) {
  const r = await fetch(`${URL_}/rest/v1/${pfad}`, { ...opt, headers: { ...kopf, "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${opt.method || "GET"} ${pfad}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const objektUrl = (p) => `${URL_}/storage/v1/object/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;
async function herunterladen(pfad) {
  const r = await fetch(objektUrl(pfad), { headers: kopf });
  if (!r.ok) throw new Error(`Download ${pfad}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function hochladen(pid, kat, datei, quelle = "team") {
  const name = path.basename(datei), puffer = await fsp.readFile(datei), typ = mimeTyp(name);
  const pfad = `projekte/${pid}/${kat}/${crypto.randomUUID().slice(0, 8)}-${name.replace(/[^\w.\-äöüÄÖÜß ]+/g, "_").replace(/\s+/g, "_")}`;
  const r = await fetch(objektUrl(pfad), { method: "POST", headers: { ...kopf, "Content-Type": typ }, body: puffer });
  if (!r.ok) throw new Error(`Upload ${name}: ${r.status} ${await r.text()}`);
  const [rec] = await rest("dateien", { method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ projekt_id: pid, kategorie: kat, name, typ, groesse: puffer.length, pfad, quelle, neu: true }) });
  return rec;
}
function mimeTyp(n) {
  const e = n.split(".").pop().toLowerCase();
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
    gif: "image/gif", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain",
    mp4: "video/mp4", mov: "video/quicktime" }[e] || "application/octet-stream";
}

/* ---------- Status (welche Datei ist schon abgeglichen) ---------- */
const statusPfad = path.join(WURZEL, STATUS_DATEI);
let st = { projekte: {}, dateien: {}, lokal: {} };   // projekte: id→Ordnername · dateien: pfad→relativ · lokal: relativ→pfad
try { st = { ...st, ...JSON.parse(fs.readFileSync(statusPfad, "utf8")) }; } catch { /* erster Lauf */ }
const sichern = () => fsp.writeFile(statusPfad, JSON.stringify(st, null, 1));

const sauber = (t) => String(t || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
function projektOrdner(p) {
  if (!st.projekte[p.id]) {
    const k = p.daten.kunde || {};
    let n = sauber([p.daten.projektnr || "ohne Nr", k.nachname, k.vorname].filter(Boolean).join("_")) || p.id;
    const vergeben = new Set(Object.values(st.projekte));
    while (vergeben.has(n)) n += "_2";
    st.projekte[p.id] = n;                           // Name bleibt stabil, auch wenn sich Daten ändern
  }
  return st.projekte[p.id];
}
const frei = async (ziel) => {                       // nie überschreiben
  let z = ziel, i = 2;
  while (fs.existsSync(z)) { const e = path.extname(ziel); z = `${ziel.slice(0, -e.length || undefined)} (${i++})${e}`; }
  return z;
};
const ruhig = async (f) => Date.now() - (await fsp.stat(f)).mtimeMs > RUHEZEIT_MS;
const log = (...a) => console.log(new Date().toLocaleString("de-DE"), ...a);

/* ---------- ein Durchlauf ---------- */
async function durchlauf() {
  const projekte = await rest("projekte?select=id,daten&geloescht=eq.false");
  const dateien = await rest("dateien?select=*&order=am");
  await fsp.mkdir(path.join(WURZEL, EINGANG), { recursive: true });

  for (const p of projekte) {
    const basis = path.join(WURZEL, projektOrdner(p));
    for (const k of KAT) await fsp.mkdir(path.join(basis, ordnerName(k)), { recursive: true });
  }

  /* 1. Dashboard → Ordner */
  for (const d of dateien) {
    if (st.dateien[d.pfad]) continue;
    const p = projekte.find((x) => x.id === d.projekt_id); if (!p) continue;
    const k = KAT.find((x) => x.id === d.kategorie) || { id: d.kategorie, titel: d.kategorie };
    const dir = path.join(WURZEL, projektOrdner(p), KAT.includes(k) ? ordnerName(k) : sauber(k.titel));
    await fsp.mkdir(dir, { recursive: true });
    const ziel = await frei(path.join(dir, sauber(d.name)));
    await fsp.writeFile(ziel, await herunterladen(d.pfad));
    const rel = path.relative(WURZEL, ziel);
    st.dateien[d.pfad] = rel; st.lokal[rel] = d.pfad;
    log("↓", rel);
  }

  /* 2. Ordner → Dashboard */
  for (const p of projekte) {
    const basis = path.join(WURZEL, projektOrdner(p));
    for (const k of KAT) {
      const dir = path.join(basis, ordnerName(k));
      for (const name of await fsp.readdir(dir).catch(() => [])) {
        if (name.startsWith(".") || name.startsWith("~$")) continue;
        const f = path.join(dir, name), rel = path.relative(WURZEL, f);
        if (st.lokal[rel] || !(await fsp.stat(f)).isFile() || !(await ruhig(f))) continue;
        const rec = await hochladen(p.id, k.id, f);
        st.dateien[rec.pfad] = rel; st.lokal[rel] = rec.pfad;
        log("↑", rel);
      }
    }
  }

  /* 3. Palette-Eingang → Projekt */
  const eingang = path.join(WURZEL, EINGANG);
  for (const name of await fsp.readdir(eingang)) {
    if (name.startsWith(".")) continue;
    const f = path.join(eingang, name);
    if (!(await fsp.stat(f)).isFile() || !(await ruhig(f))) continue;
    const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const p = projekte.filter((x) => x.daten.projektnr && norm(name).includes(norm(x.daten.projektnr)))
      .sort((a, b) => norm(b.daten.projektnr).length - norm(a.daten.projektnr).length)[0];
    if (!p) continue;                                 // ohne Projektnummer bleibt die Datei im Eingang liegen
    const kat = paletteKategorie(name), k = KAT.find((x) => x.id === kat);
    const ziel = await frei(path.join(WURZEL, projektOrdner(p), ordnerName(k), name));
    await fsp.rename(f, ziel);
    const rel = path.relative(WURZEL, ziel), rec = await hochladen(p.id, kat, ziel);
    st.dateien[rec.pfad] = rel; st.lokal[rel] = rec.pfad;
    log("Palette →", rel);
  }
  await sichern();
}

/* ---------- Start ---------- */
log(`Ordner-Sync: ${WURZEL} ⇄ ${URL_}`);
const lauf = async () => { try { await durchlauf(); } catch (e) { log("Fehler:", e.message); if (EINMAL) process.exitCode = 1; } };
await lauf();
if (!EINMAL) setInterval(lauf, INTERVALL_MS);
