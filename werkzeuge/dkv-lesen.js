/* Liest eine DKV-Rechnung bzw. Transaktionsliste und liefert die einzelnen Tankvorgänge.
     PDF  → Text über pdftotext (Poppler), Spalten anhand der Kopfzeile („Datum … Menge … Betrag … km“)
     CSV  → Export aus dem DKV-Kundenportal, Spalten anhand der Überschriften
   Ergebnis: { rechnung, buchungen: [{ datum: "JJJJ-MM-TT", karte, kennz, produkt, station, menge, betrag, km }] }
   Zum Testen: node werkzeuge/dkv-lesen.js <Datei>
*/
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const zahl = (s) => {                                    // „1.234,56“ / „1234.56“ / „-12,30“ → Zahl
  s = String(s ?? "").replace(/[€\s]/g, "").replace(/EUR/i, "");
  if (!s) return null;
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");      // „123.456“ = Tausenderpunkt (km)
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const datum = (s) => {                                   // TT.MM.JJ(JJ) / JJJJ-MM-TT → JJJJ-MM-TT
  let m = String(s || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
};
const KARTE = /\b(7043\d{2}[\s.]?\d{6}[\s.]?\d{5}|\*{2,}[\s\d]{4,})/;              // DKV-Kartennummer (ggf. teilweise maskiert)
const KENNZ = /\b([A-ZÄÖÜ]{1,3})[-\s]([A-Z]{1,2})[-\s]?(\d{1,4}[EH]?)\b/;          // z. B. BB-DB 2655, BB-DB 650E
const PRODUKT = /diesel|super|benzin|e10|e5|adblue|lpg|autogas|strom|wäsche|waesche|öl|oel|maut|parken/i;

/* ---------- CSV ---------- */
function ausCsv(text) {
  const zeilen = text.replace(/^﻿/, "").split(/\r?\n/).filter((z) => z.trim());
  const trenner = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ";" : ",";
  const teilen = (z) => { const out = []; let cur = "", q = false; for (const ch of z) { if (ch === '"') q = !q; else if (ch === trenner && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const kopf = teilen(zeilen[0]).map((h) => h.toLowerCase());
  const spalte = (...re) => { for (const r of re) { const i = kopf.findIndex((h) => r.test(h)); if (i >= 0) return i; } return -1; };
  const S = {
    karte: spalte(/karten.?n/, /^karte/, /card/), kennz: spalte(/kennz/, /kfz/, /licen[cs]e/), datum: spalte(/^(transaktions|liefer|tank|beleg)?.?datum/, /date/),
    km: spalte(/km.?stand/, /kilometer/, /^km$/, /odometer|mileage/), menge: spalte(/menge/, /liter/, /quantity/), produkt: spalte(/waren/, /produkt/, /artikel/, /product/),
    station: spalte(/station|tankstelle/, /^ort$/, /location|site/), betrag: spalte(/brutto/, /gesamt/, /betrag/, /amount|total/), rechnung: spalte(/rechnungs.?n/, /invoice/),
  };
  if (S.datum < 0 || S.betrag < 0) throw new Error("CSV: Spalten „Datum“ und „Betrag“ nicht gefunden – Überschriften: " + kopf.join(" | "));
  const w = (z, k) => (S[k] >= 0 ? z[S[k]] || "" : "");
  const buchungen = zeilen.slice(1).map(teilen).map((z) => ({
    datum: datum(w(z, "datum")), karte: w(z, "karte"), kennz: w(z, "kennz"), produkt: w(z, "produkt"), station: w(z, "station"),
    menge: zahl(w(z, "menge")), betrag: zahl(w(z, "betrag")), km: zahl(w(z, "km")) || null,
  })).filter((b) => b.datum && b.betrag != null);
  const rnr = S.rechnung >= 0 ? teilen(zeilen[1] || "")[S.rechnung] : "";
  return { rechnung: rnr || "", buchungen };
}

/* ---------- PDF ---------- */
function ausPdf(datei) {
  const text = execFileSync("pdftotext", ["-layout", datei, "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const zeilen = text.split(/\n/);
  const rnr = (text.match(/Rechnungs?-?\s*(?:nr|nummer)\.?\s*:?\s*([A-Z0-9\-\/]{5,})/i) || [])[1] || "";
  let karte = "", kennz = "", spalten = null;
  const buchungen = [];
  for (const z of zeilen) {
    /* Kopfzeile einer Transaktionstabelle → Spaltenpositionen merken */
    if (/datum/i.test(z) && /(menge|liter)/i.test(z) && /(betrag|brutto|wert)/i.test(z)) {
      const pos = (re) => { const m = z.match(re); return m ? m.index : -1; };
      spalten = { km: pos(/km(-|\s)?stand|kilometer|\bkm\b/i), menge: pos(/menge|liter/i), betrag: pos(/brutto|betrag|wert/i) };
      continue;
    }
    /* Karten-/Fahrzeugwechsel (Zwischenüberschrift „Karte 7043… Kennzeichen BB-DB 2655“) */
    const mk = z.match(KARTE), mz = z.match(KENNZ);
    const d = z.match(/^\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/);
    if (!d) { if (mk) karte = mk[1]; if (mz) kennz = mz[0]; continue; }
    if (!PRODUKT.test(z)) continue;                      // Datumszeile ohne Ware (z. B. Zahlungen) überspringen
    /* Zahlen der Zeile mit Position */
    const zahlen = [...z.matchAll(/-?\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|-?\d+(?:,\d{1,3})?/g)].map((m) => ({ s: m[0], i: m.index, n: zahl(m[0]) }))
      .filter((x) => x.i > d.index + d[0].length + 1 && !/^\d{1,2}:\d{2}/.test(z.slice(x.i)) && z[x.i - 1] !== ":");   // Uhrzeit überspringen
    const naechste = (p) => (p < 0 ? null : zahlen.reduce((best, x) => (!best || Math.abs(x.i - p) < Math.abs(best.i - p) ? x : best), null));
    const mitKomma = zahlen.filter((x) => x.s.includes(","));
    let betrag = spalten ? naechste(spalten.betrag) : null, menge = spalten ? naechste(spalten.menge) : null, km = spalten && spalten.km >= 0 ? naechste(spalten.km) : null;
    if (!betrag || !betrag.s.includes(",")) betrag = mitKomma[mitKomma.length - 1] || null;          // Bruttobetrag steht ganz rechts
    if (!menge || !menge.s.includes(",")) menge = mitKomma[0] !== betrag ? mitKomma[0] : null;
    if (km && (km.s.includes(",") || km.n < 100)) km = null;                                          // km ist eine ganze Zahl
    const zk = z.match(KARTE), zz = z.match(KENNZ);
    buchungen.push({
      datum: datum(d[1]), karte: zk ? zk[1] : karte, kennz: zz ? zz[0] : kennz,
      produkt: (z.match(PRODUKT) || [""])[0], station: "",
      menge: menge ? menge.n : null, betrag: betrag ? betrag.n : null, km: km ? km.n : null,
    });
  }
  return { rechnung: rnr, buchungen: buchungen.filter((b) => b.betrag != null) };
}

function lesen(datei) {
  const endung = path.extname(datei).toLowerCase();
  if (endung === ".pdf") return ausPdf(datei);
  if (endung === ".csv" || endung === ".txt") {
    const roh = fs.readFileSync(datei), t = roh.toString("utf8");
    return ausCsv(t.includes("�") ? roh.toString("latin1") : t);                    // Excel-CSV oft Windows-1252
  }
  throw new Error("Dateityp " + endung + " wird nicht unterstützt (PDF oder CSV).");
}
module.exports = { lesen, zahl, datum };

if (require.main === module) {
  const r = lesen(process.argv[2]);
  console.log(JSON.stringify(r, null, 2));
}
