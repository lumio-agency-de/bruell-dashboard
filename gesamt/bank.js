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

  /* ---------- Bankseite: Einlesen + Statistik ---------- */
  const STATUS = { auto: ["abgeglichen", "ok"], manuell: ["von Hand", "ok"], regel: ["ohne Rechnung", "regel"], ohne: ["ohne Rechnung", "regel"], pruefen: ["prüfen", "pruefen"], "": ["noch nicht abgeglichen", "regel"] };
  const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  function seite(box, konto) {
    let suche = "", zeitraum = "12", bericht = "", mehr = false;
    const UMk = () => lesen(KEY, []).filter((u) => !konto || u.konto === konto);
    function monate() {
      const h = new Date(), l = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); l.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
      return l;
    }
    function diagramm(um) {
      const ms = monate(), daten = ms.map((m) => { const l = um.filter((u) => u.datum.startsWith(m)); return { m, ein: l.filter((u) => u.betrag > 0).reduce((a, u) => a + u.betrag, 0), aus: -l.filter((u) => u.betrag < 0).reduce((a, u) => a + u.betrag, 0) }; });
      const max = Math.max(1, ...daten.flatMap((d) => [d.ein, d.aus])), W = 720, H = 220, L = 56, B = 26, T = 10, bw = (W - L - 8) / 12, sk = (v) => (H - B - T) * v / max;
      const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
      return `<div class="bk-chart"><div class="bk-legende"><span><i class="bk-ein"></i>Eingänge</span><span><i class="bk-aus"></i>Ausgänge</span></div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Eingänge und Ausgänge der letzten 12 Monate">
          ${ticks.map((t) => `<line class="gitter" x1="${L}" x2="${W - 4}" y1="${H - B - sk(t)}" y2="${H - B - sk(t)}"/><text class="achse" x="${L - 6}" y="${H - B - sk(t) + 4}" text-anchor="end">${esc(euroKurz(t))}</text>`).join("")}
          ${daten.map((d, i) => { const x = L + i * bw, w = Math.max(4, bw / 2 - 5);
            const balken = (v, dx, kl) => v ? `<path class="${kl}" d="M${x + dx},${H - B} v${-Math.max(0, sk(v) - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${Math.max(0, sk(v) - 4)} z"/>` : "";
            return `<g class="bk-monat" data-tip="${esc(MON[+d.m.slice(5) - 1] + " " + d.m.slice(0, 4))}|${esc(euro(d.ein))}|${esc(euro(d.aus))}|${esc(euro(d.ein - d.aus))}">
              <rect class="bk-hit" x="${x}" y="${T}" width="${bw}" height="${H - B - T}"/>${balken(d.ein, 3, "bk-ein")}${balken(d.aus, 3 + w + 2, "bk-aus")}
              <text class="achse" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${MON[+d.m.slice(5) - 1]}</text></g>`; }).join("")}
          <line class="basis" x1="${L}" x2="${W - 4}" y1="${H - B}" y2="${H - B}"/></svg><div class="bk-tip" hidden></div>
        <details class="bk-tabelle"><summary>Als Tabelle</summary><table class="lo-tab"><thead><tr><th>Monat</th><th class="r">Eingänge</th><th class="r">Ausgänge</th><th class="r">Saldo</th></tr></thead><tbody>
          ${daten.slice().reverse().map((d) => `<tr><td>${MON[+d.m.slice(5) - 1]} ${d.m.slice(0, 4)}</td><td class="r">${euro(d.ein)}</td><td class="r">${euro(d.aus)}</td><td class="r">${euro(d.ein - d.aus)}</td></tr>`).join("")}</tbody></table></details></div>`;
    }
    function top(um, vz) {
      const s = {}; um.filter((u) => vz > 0 ? u.betrag > 0 : u.betrag < 0).forEach((u) => { const n = (u.name || "(ohne Namen)").trim(); s[n] = (s[n] || 0) + Math.abs(u.betrag); });
      const l = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 6), max = l.length ? l[0][1] : 1;
      return l.length ? `<ul class="bk-top">${l.map(([n, v]) => `<li><span class="bk-top-name">${esc(n)}</span><span class="bk-top-balken"><i class="${vz > 0 ? "bk-ein" : "bk-aus"}" style="width:${Math.max(2, Math.round(v / max * 100))}%"></i></span><b>${euro(v)}</b></li>`).join("")}</ul>` : '<p class="leise">Keine Umsätze im Zeitraum.</p>';
    }
    function zeichnen() {
      const alle = UMk().sort((a, b) => b.datum.localeCompare(a.datum)), saldi = lesen(SALDO, {}), h = new Date();
      const von = zeitraum === "monat" ? h.toISOString().slice(0, 7) : zeitraum === "jahr" ? String(h.getFullYear()) : monate()[0];
      const imZ = alle.filter((u) => zeitraum === "12" ? u.datum >= von + "-01" : u.datum.startsWith(von));
      const ein = imZ.filter((u) => u.betrag > 0).reduce((a, u) => a + u.betrag, 0), aus = imZ.filter((u) => u.betrag < 0).reduce((a, u) => a + u.betrag, 0);
      const pruefen = alle.filter((u) => u.status === "pruefen").length;
      const liste = alle.filter((u) => !suche || norm([u.name, u.zweck, u.datum, (u.betrag / 100).toFixed(2)].join(" ")).includes(norm(suche)));
      const stand = (k) => saldi[k] ? `${euro(saldi[k].betrag)}` : "–", standDatum = (k) => saldi[k] ? `Stand ${datumDE(saldi[k].datum)}` : "aus dem nächsten Kontoauszug";
      const kopfKpi = konto
        ? `<div class="kpi"><span class="kpi-titel">Kontostand</span><span class="kpi-zahl klein">${stand(konto)}</span><span class="kpi-unter">${standDatum(konto)}</span></div>`
        : Object.keys(KONTEN).map((k) => `<a class="kpi" href="bank-${k}.html${location.search}"><span class="kpi-titel">${KONTEN[k]}</span><span class="kpi-zahl klein">${stand(k)}</span><span class="kpi-unter">${standDatum(k)}</span></a>`).join("");
      box.innerHTML = `
        ${konto ? `<section class="panel lo-import"><label class="lo-drop" data-drop>🏦 <span><b>Kontoauszug ${KONTEN[konto]} einlesen</b><small>CAMT (XML oder ZIP) oder CSV aus dem Online-Banking der ${KONTEN[konto]}. Schon eingelesene Umsätze werden übersprungen. Die Buchhaltung gleicht die Umsätze danach automatisch mit den Rechnungen ab.</small></span><input type="file" accept=".xml,.csv,.zip,.txt" multiple hidden data-datei></label>
          ${bericht ? `<p class="bu-bericht">${esc(bericht)}</p>` : ""}</section>` : ""}
        <div class="bk-zeitraum wz-filter">${[["monat", "Dieser Monat"], ["jahr", "Dieses Jahr"], ["12", "Letzte 12 Monate"]].map(([k, t]) => `<button type="button" data-zr="${k}" class="${zeitraum === k ? "an" : ""}">${t}</button>`).join("")}</div>
        <div class="kpis vier lo-kpis">
          ${kopfKpi}
          <div class="kpi"><span class="kpi-titel">Eingänge</span><span class="kpi-zahl klein">${euro(ein)}</span><span class="kpi-unter">${imZ.filter((u) => u.betrag > 0).length} Buchungen</span></div>
          <div class="kpi"><span class="kpi-titel">Ausgänge</span><span class="kpi-zahl klein">${euro(-aus)}</span><span class="kpi-unter">${imZ.filter((u) => u.betrag < 0).length} Buchungen</span></div>
          ${konto ? `<a class="kpi${pruefen ? " alarm" : ""}" href="buchhaltung.html${location.search}"><span class="kpi-titel">In der Buchhaltung prüfen</span><span class="kpi-zahl klein">${pruefen}</span><span class="kpi-unter">Umsätze ohne passende Rechnung →</span></a>` : ""}
        </div>
        <section class="panel"><h2 class="panel-titel">Eingänge und Ausgänge je Monat <small>letzte 12 Monate${konto ? "" : " · beide Konten"}</small></h2><div class="panel-innen">${alle.length ? diagramm(alle) : '<p class="leise">Noch kein Kontoauszug eingelesen.</p>'}</div></section>
        <div class="bk-zwei">
          <section class="panel"><h2 class="panel-titel">Größte Zahler <small>${zeitraum === "monat" ? "dieser Monat" : zeitraum === "jahr" ? "dieses Jahr" : "12 Monate"}</small></h2><div class="panel-innen">${top(imZ, 1)}</div></section>
          <section class="panel"><h2 class="panel-titel">Größte Empfänger <small>${zeitraum === "monat" ? "dieser Monat" : zeitraum === "jahr" ? "dieses Jahr" : "12 Monate"}</small></h2><div class="panel-innen">${top(imZ, -1)}</div></section>
        </div>
        <section class="panel"><h2 class="panel-titel">Umsätze <span class="zahl">${alle.length}</span></h2><div class="panel-innen">
          <input type="search" class="eingabe bk-suche" data-suche placeholder="Suchen: Name, Verwendungszweck, Betrag …" value="${esc(suche)}">
          ${liste.length ? `<div class="lo-scroll"><table class="lo-tab bu-tab"><thead><tr><th>Datum</th>${konto ? "" : "<th>Konto</th>"}<th>Name / Verwendungszweck</th><th class="r">Betrag</th><th>Buchhaltung</th></tr></thead><tbody>
            ${liste.slice(0, mehr ? 1000 : 60).map((u) => { const [st, kl] = STATUS[u.status || ""] || STATUS[""]; return `<tr class="${u.status === "pruefen" ? "bu-pruefen" : ""}"><td>${datumDE(u.datum)}</td>${konto ? "" : `<td><small>${KONTEN[u.konto] || "–"}</small></td>`}<td><b>${esc(u.name || "–")}</b><small class="bu-zweck">${esc(u.zweck)}</small></td><td class="r ${u.betrag < 0 ? "bu-minus" : ""}">${euro(u.betrag)}</td><td><span class="bu-st ${kl}">${st}</span>${u.hinweis ? `<small>${esc(u.hinweis)}</small>` : ""}</td></tr>`; }).join("")}
          </tbody></table></div>${liste.length > 60 && !mehr ? `<button type="button" class="btn klein still" data-mehr>Alle ${liste.length} anzeigen</button>` : ""}` : `<p class="leise">${alle.length ? "Keine Treffer." : "Noch keine Umsätze."}</p>`}
        </div></section>`;
    }
    box.addEventListener("change", async (e) => { if (e.target.matches("[data-datei]") && e.target.files.length) { const l = [...e.target.files]; e.target.value = ""; await laden(l); } });
    box.addEventListener("dragover", (e) => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("ziehen"); } });
    box.addEventListener("dragleave", (e) => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("ziehen"); });
    box.addEventListener("drop", (e) => { const d = e.target.closest("[data-drop]"); if (!d) return; e.preventDefault(); d.classList.remove("ziehen"); if (e.dataTransfer.files.length) laden([...e.dataTransfer.files]); });
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.zr) { zeitraum = b.dataset.zr; zeichnen(); } if (b.hasAttribute("data-mehr")) { mehr = true; zeichnen(); } });
    box.addEventListener("input", (e) => { if (e.target.matches("[data-suche]")) { suche = e.target.value; const p = e.target.selectionStart; zeichnen(); const s = box.querySelector("[data-suche]"); s.focus(); s.setSelectionRange(p, p); } });
    /* Tooltip im Diagramm */
    box.addEventListener("pointermove", (e) => {
      const g = e.target.closest(".bk-monat"), tip = box.querySelector(".bk-tip"); if (!tip) return;
      box.querySelectorAll(".bk-monat.an").forEach((x) => x !== g && x.classList.remove("an"));
      if (!g) { tip.hidden = true; return; }
      g.classList.add("an"); const [m, ein, aus, sa] = g.dataset.tip.split("|"), r = box.querySelector(".bk-chart").getBoundingClientRect();
      tip.innerHTML = `<b>${m}</b><span><i class="bk-ein"></i>Eingänge <b>${ein}</b></span><span><i class="bk-aus"></i>Ausgänge <b>${aus}</b></span><span>Saldo <b>${sa}</b></span>`;
      tip.hidden = false; tip.style.left = Math.min(r.width - 190, Math.max(0, e.clientX - r.left + 12)) + "px"; tip.style.top = Math.max(0, e.clientY - r.top - 20) + "px";
    });
    box.addEventListener("pointerleave", () => { const tip = box.querySelector(".bk-tip"); if (tip) tip.hidden = true; box.querySelectorAll(".bk-monat.an").forEach((x) => x.classList.remove("an")); });
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
