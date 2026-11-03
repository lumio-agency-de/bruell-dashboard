/* ==========================================================================
   Brüll Dashboard – Bank (Sparkasse / Raiffeisenbank)
   --------------------------------------------------------------------------
   Kontoauszüge werden NUR hier eingelesen (Betrieb → Bank → Sparkasse / Raiffeisenbank):
   CAMT.052/053 (XML oder ZIP) oder CSV aus dem Online-Banking. Die Umsätze landen in
   „buch:umsaetze“ – dieselbe Liste, mit der die Buchhaltung die Rechnungen abgleicht.
   Kontostand aus der CAMT-Schlussbilanz bzw. der CSV-Spalte „Saldo nach Buchung“ → „bank:saldo“.
   Window.Bank stellt Lesen + Hilfsfunktionen bereit; Bank.seite() zeichnet die Bankseiten.
   ========================================================================== */
window.Bank = (function () {
  "use strict";
  const KEY = "buch:umsaetze", SALDO = "bank:saldo";
  const KONTEN = { sparkasse: "Sparkasse", raiba: "Raiffeisenbank" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const euro = (c) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const euroKurz = (c) => (Math.abs(c) >= 100000000 ? (c / 100000000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " Mio. €" : Math.abs(c) >= 1000000 ? Math.round(c / 100000).toLocaleString("de-DE") + " T€" : euro(c));
  const cent = (v) => { if (typeof v === "number") return Math.round(v * 100); let t = String(v ?? "").trim().replace(/\s|€|EUR/gi, ""); if (!t) return 0;
    const neg = /^-|-$/.test(t) || /^\(.*\)$/.test(t); t = t.replace(/[-()+]/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); return Math.round((parseFloat(t) || 0) * 100) * (neg ? -1 : 1); };
  const isoDatum = (t) => { t = String(t || "").trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  const datumDE = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  const iban = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
  const hash = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

  /* ---------- Dateien lesen ---------- */
  async function text(f) { const b = await f.arrayBuffer(); try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (e) { return new TextDecoder("windows-1252").decode(b); } }
  function csvZeilen(t) {
    const kopf = t.split(/\r?\n/).find((z) => z.trim()) || "", trenn = (kopf.match(/;/g) || []).length >= (kopf.match(/,/g) || []).length ? ";" : ",";
    const zeilen = []; let f = "", q = false, z = [];
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === trenn) { z.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; z.push(f); f = ""; if (z.some((x) => x.trim())) zeilen.push(z); z = []; } else f += c;
    }
    z.push(f); if (z.some((x) => x.trim())) zeilen.push(z);
    return zeilen;
  }
  function spalte(kopf, ...muster) { for (const m of muster) { const i = kopf.findIndex((h) => m.test(norm(h).trim())); if (i >= 0) return i; } return -1; }
  function camt(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml"), t = (el, n) => el ? [...el.getElementsByTagNameNS("*", n)] : [], eins = (el, n) => t(el, n)[0];
    const kontoIban = iban((eins(eins(doc, "Acct"), "IBAN") || {}).textContent);
    /* Kontostand: Schlussbilanz CLBD (sonst ITBD/CLAV) */
    let saldo = null;
    for (const b of t(doc, "Bal")) {
      const cd = ((eins(b, "Cd") || {}).textContent || "").trim();
      if (!["CLBD", "ITBD", "CLAV"].includes(cd)) continue;
      const betrag = cent(parseFloat((eins(b, "Amt") || {}).textContent || "0")) * (((eins(b, "CdtDbtInd") || {}).textContent || "") === "DBIT" ? -1 : 1);
      const datum = isoDatum(((eins(eins(b, "Dt"), "Dt") || eins(eins(b, "Dt"), "DtTm")) || {}).textContent);
      if (!saldo || cd === "CLBD" || datum > saldo.datum) saldo = { datum, betrag };
    }
    const um = t(doc, "Ntry").flatMap((n) => {
      const betrag = cent(parseFloat((eins(n, "Amt") || {}).textContent || "0")), soll = ((eins(n, "CdtDbtInd") || {}).textContent || "") === "DBIT";
      const datum = isoDatum(((eins(eins(n, "BookgDt"), "Dt") || eins(eins(n, "BookgDt"), "DtTm") || eins(eins(n, "ValDt"), "Dt")) || {}).textContent);
      const details = t(n, "TxDtls"), liste = details.length ? details : [n];
      return liste.map((d) => {
        const teil = details.length > 1 && eins(d, "Amt") ? cent(parseFloat(eins(d, "Amt").textContent)) : betrag;
        const gegen = soll ? eins(d, "Cdtr") || eins(d, "CdtrAcct") : eins(d, "Dbtr") || eins(d, "DbtrAcct"), gegenKto = soll ? eins(d, "CdtrAcct") : eins(d, "DbtrAcct");
        return { datum, betrag: soll ? -teil : teil, name: ((eins(gegen, "Nm") || {}).textContent || "").trim(), iban: iban((eins(gegenKto, "IBAN") || {}).textContent),
          zweck: t(d, "Ustrd").map((u) => u.textContent).join(" ").replace(/\s+/g, " ").trim() || ((eins(n, "AddtlNtryInf") || {}).textContent || "").trim() };
      });
    });
    return { kontoIban, saldo, um };
  }
  function bankCsv(t) {
    const z = csvZeilen(t), k = z.findIndex((r) => r.some((h) => /buchungstag|buchungsdatum/.test(norm(h)))); if (k < 0) throw new Error("CSV: Spalte „Buchungstag“ nicht gefunden");
    const kopf = z[k], i = {
      datum: spalte(kopf, /^buchungstag$/, /buchungstag/, /buchungsdatum/), betrag: spalte(kopf, /^betrag/, /^umsatz/), soll: spalte(kopf, /^soll/), haben: spalte(kopf, /^haben/),
      name: spalte(kopf, /beguenstigter\/zahlungspflichtiger/, /name zahlungsbeteiligter/, /zahlungsempfanger|empfanger\/zahlungspflichtiger/, /^name$/, /auftraggeber/),
      iban: spalte(kopf, /iban zahlungsbeteiligter/, /kontonummer\/iban/, /^iban$/, /empfanger.*iban|iban.*empfanger/),
      zweck: spalte(kopf, /verwendungszweck/, /^zweck/), konto: spalte(kopf, /iban auftragskonto/, /^auftragskonto$/), saldo: spalte(kopf, /saldo nach buchung/, /^saldo$/, /kontostand/),
    };
    if (i.betrag < 0 && i.soll < 0) throw new Error("CSV: Spalte „Betrag“ nicht gefunden");
    const zeilen = z.slice(k + 1).filter((r) => r[i.datum]);
    const um = zeilen.map((r) => ({ datum: isoDatum(r[i.datum]), betrag: i.betrag >= 0 ? cent(r[i.betrag]) : cent(r[i.haben]) - Math.abs(cent(r[i.soll])),
      name: (r[i.name] || "").trim(), iban: iban(r[i.iban]), zweck: (r[i.zweck] || "").replace(/\s+/g, " ").trim(), saldo: i.saldo >= 0 && String(r[i.saldo] || "").trim() ? cent(r[i.saldo]) : null })).filter((u) => u.datum && u.betrag);
    const mitSaldo = um.filter((u) => u.saldo !== null).sort((a, b) => b.datum.localeCompare(a.datum));
    return { kontoIban: i.konto >= 0 && zeilen[0] ? iban(zeilen[0][i.konto]) : "", saldo: mitSaldo.length ? { datum: mitSaldo[0].datum, betrag: mitSaldo[0].saldo } : null, um };
  }
  async function zipLesen(datei) {
    if (!window.zip) await new Promise((ok, f) => { const s = document.createElement("script"); s.src = "../gesamt/vendor/zip.min.js"; s.onload = ok; s.onerror = f; document.head.appendChild(s); });
    window.zip.configure({ useWebWorkers: false });
    const r = new window.zip.ZipReader(new window.zip.BlobReader(datei)), raus = [];
    for (const e of await r.getEntries()) if (!e.directory) raus.push(new File([await e.getData(new window.zip.BlobWriter())], e.filename.split("/").pop()));
    await r.close(); return raus;
  }
  /* Konto über die Firmen-IBAN (Lohnabrechnung → Firmenkonten) erkennen */
  function kontoVon(kontoIban) { const k = lesen("lohn:konten", {}); for (const key of Object.keys(KONTEN)) if (kontoIban && k[key] && iban(k[key].iban) === kontoIban) return key; return ""; }

  /* Kontoauszug-Dateien für ein Konto einlesen → { neu, doppelt, anderes } */
  async function einlesen(dateien, konto) {
    const UM = lesen(KEY, []), saldi = lesen(SALDO, {}); let neu = 0, doppelt = 0, anderes = 0; const liste = [];
    for (const f of dateien) { if (/\.zip$/i.test(f.name)) liste.push(...await zipLesen(f)); else liste.push(f); }
    for (const f of liste) {
      const inhalt = await text(f), r = /\.xml$/i.test(f.name) || /^\s*<\?xml|<Document/i.test(inhalt.slice(0, 300)) ? camt(inhalt) : bankCsv(inhalt);
      const erkannt = kontoVon(r.kontoIban), k = erkannt || konto;
      if (erkannt && erkannt !== konto) anderes += r.um.length;
      for (const u of r.um) {
        const id = hash([k, u.datum, u.betrag, u.name, u.zweck].join("|"));
        if (UM.some((x) => x.id === id)) { doppelt++; continue; }
        UM.push({ id, konto: k, datum: u.datum, betrag: u.betrag, name: u.name, iban: u.iban, zweck: u.zweck, status: "", rechnungen: [], hinweis: "" }); neu++;
      }
      if (r.saldo && r.saldo.datum && (!saldi[k] || r.saldo.datum >= saldi[k].datum)) saldi[k] = { ...r.saldo, eingelesen: new Date().toISOString().slice(0, 10) };
    }
    if (!schreiben(KEY, UM)) throw new Error("Browser-Speicher voll");
    schreiben(SALDO, saldi);
    return { neu, doppelt, anderes, dateien: liste.length };
  }

  /* ---------- Bankseite (Aufbau nach Vorlage): Kontoverlauf · Einnahmen/Ausgaben je Monat ·
     Ausgaben · Einnahmen (Ring + Liste) · Umsätze. Umbuchungen zwischen den Firmenkonten zählen nicht. ---------- */
  const STATUS = { auto: ["abgeglichen", "ok"], manuell: ["von Hand", "ok"], regel: ["ohne Rechnung", "regel"], ohne: ["ohne Rechnung", "regel"], pruefen: ["prüfen", "pruefen"], "": ["noch nicht abgeglichen", "regel"] };
  const MON = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sept", "Okt", "Nov", "Dez"];
  /* Kategorienfarben (geprüft, hell/dunkel über CSS-Variablen --bk-1 … --bk-7), Sonstige grau */
  const FARBEN = 7;
  const tsd = (c) => { const e = Math.abs(c) / 100; return (c < 0 ? "-" : "") + (e >= 1000 ? (e / 1000).toLocaleString("de-DE", { maximumFractionDigits: e >= 10000 ? 0 : 1 }) + " Tsd. €" : Math.round(e).toLocaleString("de-DE") + " €"); };
  const euroRund = (c) => Math.round(c / 100).toLocaleString("de-DE") + " €";
  function zeitraumVon(z) {
    const h = new Date(), m = (d) => d.toISOString().slice(0, 10);
    if (z === "letzter") { const a = new Date(h.getFullYear(), h.getMonth() - 1, 1), b = new Date(h.getFullYear(), h.getMonth(), 0); return [m(new Date(a - a.getTimezoneOffset() * 6e4)), m(new Date(b - b.getTimezoneOffset() * 6e4))]; }
    if (z === "dieser") return [h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0") + "-01", "9999"];
    if (z === "jahr") return [h.getFullYear() + "-01-01", "9999"];
    const a = new Date(h.getFullYear(), h.getMonth() - 11, 1); return [a.getFullYear() + "-" + String(a.getMonth() + 1).padStart(2, "0") + "-01", "9999"];
  }
  const ZR = [["letzter", "Letzter Monat"], ["dieser", "Dieser Monat"], ["jahr", "Dieses Jahr"], ["12", "Letzte 12 Monate"]];
  function seite(box, konto) {
    let suche = "", bericht = "", zrAus = "letzter", zrEin = "letzter", verlauf = "12";
    const firmenIbans = () => Object.values(lesen("lohn:konten", {})).map((k) => iban(k && k.iban)).filter(Boolean);
    const UMk = () => lesen(KEY, []).filter((u) => !konto || u.konto === konto);
    const umbuchung = (u) => !!u.iban && firmenIbans().includes(u.iban);
    function monate() { const h = new Date(), l = []; for (let i = 11; i >= 0; i--) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); l.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); } return l; }
    /* Kontostand je Tag rückwärts aus dem letzten bekannten Saldo */
    function standVerlauf(alle) {
      const saldi = lesen(SALDO, {}), ks = konto ? [konto] : Object.keys(KONTEN).filter((k) => saldi[k]);
      if (!ks.length || ks.some((k) => !saldi[k])) return null;
      const tage = [...new Set(alle.map((u) => u.datum).concat(ks.map((k) => saldi[k].datum)))].sort(), punkte = {};
      ks.forEach((k) => {
        const s = saldi[k], l = alle.filter((u) => u.konto === k);
        const stand = (d) => s.betrag - l.filter((u) => u.datum > d && u.datum <= s.datum).reduce((a, u) => a + u.betrag, 0) + l.filter((u) => u.datum > s.datum && u.datum <= d).reduce((a, u) => a + u.betrag, 0);
        tage.forEach((d) => { punkte[d] = (punkte[d] || 0) + stand(d); });
      });
      return Object.entries(punkte).sort((a, b) => a[0].localeCompare(b[0]));
    }
    function panelVerlauf(alle) {
      const pts0 = standVerlauf(alle);
      if (!pts0) return `<p class="leise">Der Kontostand kommt aus dem Kontoauszug (CAMT-Schlussbilanz oder CSV-Spalte „Saldo nach Buchung“). ${konto ? "" : "Für die Summe braucht es den Stand beider Konten."}</p>`;
      const ab = (() => { const h = new Date(); const d = new Date(h.getFullYear(), h.getMonth() - +verlauf, h.getDate()); return d.toISOString().slice(0, 10); })();
      const pts = pts0.filter(([d]) => d >= ab); if (pts.length < 2) return '<p class="leise">Zu wenige Buchungen im Zeitraum.</p>';
      const W = 560, H = 210, L = 8, R = 62, T = 10, B = 26, vs = pts.map((p) => p[1]), min = Math.min(...vs), max = Math.max(...vs), sp = max - min || 1;
      const t0 = new Date(pts[0][0]).getTime(), t1 = new Date(pts[pts.length - 1][0]).getTime() || t0 + 1;
      const x = (d) => L + (W - L - R) * (new Date(d).getTime() - t0) / (t1 - t0 || 1), y = (v) => T + (H - T - B) * (1 - (v - min) / sp);
      const linie = pts.map(([d, v], i) => (i ? "L" : "M") + x(d).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
      const ticks = [max, min + sp * 2 / 3, min + sp / 3, min], xt = [0, 0.25, 0.5, 0.75, 1].map((f) => pts[Math.round(f * (pts.length - 1))][0]);
      return `<div class="bk-chart bk-verlauf"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kontoverlauf">
        ${ticks.map((v) => `<line class="gitter" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="achse" x="${W - R + 6}" y="${y(v) + 4}">${esc(tsd(v))}</text>`).join("")}
        <path class="bk-flaeche" d="${linie} L${x(pts[pts.length - 1][0])},${H - B} L${x(pts[0][0])},${H - B} Z"/><path class="bk-linie" d="${linie}"/>
        ${xt.map((d, i) => `<text class="achse" x="${x(d)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"}">${datumDE(d).replace(/^0/, "").replace(/\.0/, ".")}</text>`).join("")}
        <g class="bk-punkte">${pts.map(([d, v]) => `<circle cx="${x(d)}" cy="${y(v)}" r="7" data-tip="${esc(datumDE(d))}|Kontostand|${esc(euro(v))}"/>`).join("")}</g></svg><div class="bk-tip" hidden></div></div>`;
    }
    function panelMonate(alle) {
      const ms = monate(), d = ms.map((m) => { const l = alle.filter((u) => u.datum.startsWith(m) && !umbuchung(u)); return { m, ein: l.filter((u) => u.betrag > 0).reduce((a, u) => a + u.betrag, 0), aus: -l.filter((u) => u.betrag < 0).reduce((a, u) => a + u.betrag, 0) }; });
      const ein = d.reduce((a, x) => a + x.ein, 0), aus = d.reduce((a, x) => a + x.aus, 0), max = Math.max(1, ...d.flatMap((x) => [x.ein, x.aus]));
      const W = 560, H = 190, B = 22, T = 6, bw = W / 12, sk = (v) => (H - B - T) * v / max;
      const balken = (x, w, v, kl) => v ? `<path class="${kl}" d="M${x},${H - B} v${-Math.max(0, sk(v) - 3)} q0,-3 3,-3 h${w - 6} q3,0 3,3 v${Math.max(0, sk(v) - 3)} z"/>` : "";
      return `<div class="bk-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Einnahmen und Ausgaben je Monat">
        ${d.map((x, i) => { const w = (bw - 10) / 2; return `<g class="bk-monat" data-tip="${esc(MON[+x.m.slice(5) - 1] + " " + x.m.slice(0, 4))}|Einnahmen|${esc(euro(x.ein))}|Ausgaben|${esc(euro(x.aus))}|Ergebnis|${esc(euro(x.ein - x.aus))}">
          <rect class="bk-hit" x="${i * bw}" y="0" width="${bw}" height="${H - B}"/>${balken(i * bw + 4, w, x.ein, "bk-ein")}${balken(i * bw + 6 + w, w, x.aus, "bk-aus")}
          <text class="achse" x="${i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${MON[+x.m.slice(5) - 1]} ${x.m.slice(2, 4)}</text></g>`; }).join("")}
        <line class="basis" x1="0" x2="${W}" y1="${H - B}" y2="${H - B}"/></svg><div class="bk-tip" hidden></div>
        <p class="bk-summen"><span><i class="bk-ein"></i>Einnahmen <b>${euroRund(ein)}</b></span><span><i class="bk-aus"></i>Ausgaben <b>${euroRund(aus)}</b></span><span>Ergebnis <b class="${ein - aus < 0 ? "bu-minus" : "bk-plus"}">${euroRund(ein - aus)}</b></span><span>Ø je Monat <b class="${ein - aus < 0 ? "bu-minus" : "bk-plus"}">${euroRund((ein - aus) / 12)}</b></span></p>
        <details class="bk-tabelle"><summary>Als Tabelle</summary><table class="lo-tab"><thead><tr><th>Monat</th><th class="r">Einnahmen</th><th class="r">Ausgaben</th><th class="r">Ergebnis</th></tr></thead><tbody>
          ${d.slice().reverse().map((x) => `<tr><td>${MON[+x.m.slice(5) - 1]} ${x.m.slice(0, 4)}</td><td class="r">${euro(x.ein)}</td><td class="r">${euro(x.aus)}</td><td class="r">${euro(x.ein - x.aus)}</td></tr>`).join("")}</tbody></table></details></div>`;
    }
    function panelRing(alle, vz, zr) {
      const [von, bis] = zeitraumVon(zr), l = alle.filter((u) => u.datum >= von && u.datum <= bis && (vz > 0 ? u.betrag > 0 : u.betrag < 0) && !umbuchung(u));
      const g = {}; l.forEach((u) => { const n = (u.name || "(ohne Namen)").trim(), k = norm(n); g[k] = g[k] || { n, s: 0, z: 0 }; g[k].s += Math.abs(u.betrag); g[k].z++; });
      const sort = Object.values(g).sort((a, b) => b.s - a.s), ges = sort.reduce((a, x) => a + x.s, 0);
      if (!ges) return '<p class="leise">Keine Buchungen im Zeitraum.</p>';
      const teile = sort.slice(0, FARBEN).map((x, i) => ({ ...x, f: "bk-" + (i + 1) }));
      if (sort.length > FARBEN) { const r = sort.slice(FARBEN); teile.push({ n: `Sonstige (${r.length} weitere)`, s: r.reduce((a, x) => a + x.s, 0), z: 0, f: "bk-rest" }); }
      const R = 70, r = 48, C = 90; let w0 = -Math.PI / 2;
      const bogen = (s) => { const w = s / ges * Math.PI * 2, w1 = w0 + w, gross = w > Math.PI ? 1 : 0, p = (a, rr) => `${(C + rr * Math.cos(a)).toFixed(2)},${(C + rr * Math.sin(a)).toFixed(2)}`;
        const d = w >= Math.PI * 2 - 1e-6 ? `M${C},${C - R} A${R},${R} 0 1 1 ${C - 0.01},${C - R} L${C - 0.01},${C - r} A${r},${r} 0 1 0 ${C},${C - r} Z` : `M${p(w0, R)} A${R},${R} 0 ${gross} 1 ${p(w1, R)} L${p(w1, r)} A${r},${r} 0 ${gross} 0 ${p(w0, r)} Z`; w0 = w1; return d; };
      return `<div class="bk-ring"><svg viewBox="0 0 180 180" role="img" aria-label="${vz > 0 ? "Einnahmen" : "Ausgaben"} nach Name">
          ${teile.map((x) => `<path class="${x.f}" d="${bogen(x.s)}" data-tip="${esc(x.n)}|${vz > 0 ? "Einnahmen" : "Ausgaben"}|${esc(euro(x.s))} · ${Math.round(x.s / ges * 1000) / 10} %"/>`).join("")}
          <text x="90" y="84" text-anchor="middle" class="bk-ring-klein">Gesamt</text><text x="90" y="104" text-anchor="middle" class="bk-ring-gross">${esc(tsd(ges))}</text></svg>
        <ul class="bk-top">${teile.map((x) => `<li><span class="bk-top-name"><i class="${x.f}"></i>${esc(x.n)}${x.z > 1 ? ` (${x.z}×)` : ""}</span><b>${euroRund(x.s)} · ${(x.s / ges * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</b>
          <span class="bk-top-balken"><i class="${x.f}" style="width:${Math.max(1, x.s / teile[0].s * 100)}%"></i></span></li>`).join("")}</ul></div><div class="bk-tip" hidden></div>`;
    }
    function zeichnen() {
      const alle = UMk().sort((a, b) => b.datum.localeCompare(a.datum)), saldi = lesen(SALDO, {});
      const pruefen = alle.filter((u) => u.status === "pruefen").length, ganz = lesen(SALDO, {});
      const liste = alle.filter((u) => !suche || norm([u.name, u.zweck, datumDE(u.datum), (u.betrag / 100).toFixed(2).replace(".", ",")].join(" ")).includes(norm(suche)));
      const stand = konto ? (saldi[konto] ? euro(saldi[konto].betrag) : "–") : (Object.keys(KONTEN).every((k) => ganz[k]) ? euro(Object.keys(KONTEN).reduce((a, k) => a + ganz[k].betrag, 0)) : "–");
      const standUnter = konto ? (saldi[konto] ? `Stand ${datumDE(saldi[konto].datum)}` : "aus dem nächsten Kontoauszug") : Object.keys(KONTEN).map((k) => `${KONTEN[k]} ${ganz[k] ? euro(ganz[k].betrag) : "–"}`).join(" · ");
      const zrWahl = (art, w) => `<select class="bk-wahl" data-zr="${art}">${ZR.map(([k, t]) => `<option value="${k}"${k === w ? " selected" : ""}>${t}</option>`).join("")}</select>`;
      const kontoText = konto ? KONTEN[konto] : "beide Firmenkonten";
      box.innerHTML = `
        ${konto ? `<section class="panel lo-import"><label class="lo-drop" data-drop>🏦 <span><b>Kontoauszug ${KONTEN[konto]} einlesen</b><small>CAMT (XML oder ZIP) oder CSV aus dem Online-Banking. Schon eingelesene Umsätze werden übersprungen; die Buchhaltung gleicht danach automatisch ab.</small></span><input type="file" accept=".xml,.csv,.zip,.txt" multiple hidden data-datei></label>
          ${bericht ? `<p class="bu-bericht">${esc(bericht)}</p>` : ""}</section>` : ""}
        <div class="kpis vier lo-kpis bk-kpis">
          <div class="kpi"><span class="kpi-titel">Kontostand${konto ? "" : " gesamt"}</span><span class="kpi-zahl klein">${stand}</span><span class="kpi-unter">${standUnter}</span></div>
          <a class="kpi${pruefen ? " alarm" : ""}" href="buchhaltung.html${location.search}"><span class="kpi-titel">In der Buchhaltung prüfen</span><span class="kpi-zahl klein">${pruefen}</span><span class="kpi-unter">Umsätze ohne passende Rechnung →</span></a>
        </div>
        ${alle.length ? `<div class="bk-raster">
          <section class="panel bk-p-verlauf"><div class="bk-kopf"><h2>Kontoverlauf</h2><small>${konto ? "Kontostand" : "Summe der Kontostände"} aus den Kontoauszügen · ${kontoText}</small>
            <select class="bk-wahl" data-verlauf>${[["3", "3 Monate"], ["6", "6 Monate"], ["12", "12 Monate"]].map(([k, t]) => `<option value="${k}"${k === verlauf ? " selected" : ""}>${t}</option>`).join("")}</select></div>${panelVerlauf(alle)}</section>
          <section class="panel bk-p-monate"><div class="bk-kopf"><h2>Einnahmen und Ausgaben je Monat</h2><small>Letzte 12 Monate · Umbuchungen zwischen den Firmenkonten zählen nicht · ${kontoText}</small></div>${panelMonate(alle)}</section>
          <section class="panel bk-p-aus"><div class="bk-kopf"><h2>Ausgaben</h2><small>Ohne Umbuchungen zwischen den Firmenkonten</small>${zrWahl("aus", zrAus)}</div>${panelRing(alle, -1, zrAus)}</section>
          <section class="panel bk-p-um"><div class="bk-kopf"><h2>Umsätze</h2><small>Aus den Kontoauszügen · neueste zuerst</small>
            <input type="search" class="bk-wahl bk-suche" data-suche placeholder="Suchen: Name, Verwendungszweck, Betrag …" value="${esc(suche)}"></div>
            <div class="bk-umliste">${liste.length ? `<table class="lo-tab bu-tab"><thead><tr><th>Datum</th><th>Empfänger / Auftraggeber</th><th class="r">Betrag</th></tr></thead><tbody>
              ${liste.slice(0, 400).map((u) => { const [st, kl] = STATUS[u.status || ""] || STATUS[""]; return `<tr class="${u.status === "pruefen" ? "bu-pruefen" : ""}" title="Buchhaltung: ${esc(st)}${u.hinweis ? " – " + esc(u.hinweis) : ""}"><td>${datumDE(u.datum)}${konto ? "" : `<small>${KONTEN[u.konto] || ""}</small>`}</td><td><b>${esc(u.name || "–")}</b><small class="bu-zweck">${esc(u.zweck)}</small></td><td class="r"><span class="${u.betrag < 0 ? "bu-minus" : ""}">${euro(u.betrag)}</span>${u.status === "pruefen" ? '<small class="lo-warn">prüfen</small>' : umbuchung(u) ? "<small>Umbuchung</small>" : ""}</td></tr>`; }).join("")}
              </tbody></table>` : '<p class="leise">Keine Treffer.</p>'}</div></section>
          <section class="panel bk-p-ein"><div class="bk-kopf"><h2>Einnahmen</h2><small>Ohne Umbuchungen zwischen den Firmenkonten</small>${zrWahl("ein", zrEin)}</div>${panelRing(alle, 1, zrEin)}</section>
        </div>` : `<section class="panel"><div class="panel-innen" style="padding-top:16px"><p class="leise">Noch kein Kontoauszug eingelesen${konto ? " – oben hineinziehen" : " – unter Bank → Sparkasse oder Raiffeisenbank"}.</p></div></section>`}`;
    }
    box.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.matches("[data-datei]") && t.files.length) { const l = [...t.files]; t.value = ""; return laden(l); }
      if (t.dataset.zr === "aus") { zrAus = t.value; zeichnen(); } if (t.dataset.zr === "ein") { zrEin = t.value; zeichnen(); }
      if (t.matches("[data-verlauf]")) { verlauf = t.value; zeichnen(); }
    });
    box.addEventListener("dragover", (e) => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("ziehen"); } });
    box.addEventListener("dragleave", (e) => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("ziehen"); });
    box.addEventListener("drop", (e) => { const d = e.target.closest("[data-drop]"); if (!d) return; e.preventDefault(); d.classList.remove("ziehen"); if (e.dataTransfer.files.length) laden([...e.dataTransfer.files]); });
    box.addEventListener("input", (e) => { if (e.target.matches("[data-suche]")) { suche = e.target.value; const p = e.target.selectionStart; zeichnen(); const s = box.querySelector("[data-suche]"); s.focus(); s.setSelectionRange(p, p); } });
    /* Tooltips: Monatsbalken, Verlaufspunkte, Ringsegmente */
    box.addEventListener("pointermove", (e) => {
      const ziel = e.target.closest("[data-tip]"), panel = e.target.closest(".panel"), tip = panel && panel.querySelector(".bk-tip");
      box.querySelectorAll(".an[data-tip]").forEach((x) => x !== ziel && x.classList.remove("an"));
      box.querySelectorAll(".bk-tip").forEach((t) => { if (t !== tip || !ziel) t.hidden = true; });
      if (!ziel || !tip) return;
      ziel.classList.add("an"); const f = ziel.dataset.tip.split("|"), r = tip.parentElement.getBoundingClientRect();
      let html = `<b>${f[0]}</b>`; for (let i = 1; i < f.length; i += 2) html += `<span>${/Einnahmen/.test(f[i]) && f.length > 3 ? '<i class="bk-ein"></i>' : /Ausgaben/.test(f[i]) && f.length > 3 ? '<i class="bk-aus"></i>' : ""}${f[i]} <b>${f[i + 1]}</b></span>`;
      tip.innerHTML = html; tip.hidden = false;
      tip.style.left = Math.min(r.width - 200, Math.max(0, e.clientX - r.left + 14)) + "px"; tip.style.top = Math.max(0, e.clientY - r.top - 10) + "px";
    });
    box.addEventListener("pointerleave", () => { box.querySelectorAll(".bk-tip").forEach((t) => { t.hidden = true; }); box.querySelectorAll(".an[data-tip]").forEach((x) => x.classList.remove("an")); });
    async function laden(l) {
      try { const r = await einlesen(l, konto); bericht = `${r.neu} neue Umsätze eingelesen${r.doppelt ? `, ${r.doppelt} schon vorhanden` : ""}${r.anderes ? `. Achtung: ${r.anderes} Umsätze gehören laut IBAN zum anderen Firmenkonto und wurden dort abgelegt.` : "."}`; }
      catch (err) { bericht = "Einlesen fehlgeschlagen: " + (err.message || err); }
      if (window.BuchAbgleich) window.BuchAbgleich();
      zeichnen();
    }
    zeichnen();
  }

  return { KONTEN, einlesen, seite, umsaetze: () => lesen(KEY, []), hilfe: { esc, lesen, euro, cent, isoDatum, datumDE, norm, iban, hash, text, csvZeilen, spalte } };
})();
