/* ==========================================================================
   Brüll Dashboard – Buchhaltung: Rechnungen mit Kontoauszügen abgleichen
   --------------------------------------------------------------------------
   Fest programmiert, keine KI. Ablauf:
     1. Kontoauszug einlesen (CAMT.052/053 als XML oder ZIP, oder CSV aus dem Online-Banking
        von Sparkasse / Raiffeisenbank)
     2. Rechnungen einlesen (CSV, z. B. Export aus KWP) oder von Hand eintragen
        – Ausgangsrechnungen (an Kunden) ↔ Geldeingänge, Eingangsrechnungen (Lieferanten) ↔ Geldausgänge
     3. Abgleich je Umsatz:
        • Rechnungsnummer im Verwendungszweck + Betrag gleich (auch mit 2 % / 3 % Skonto) → abgeglichen
        • mehrere Rechnungsnummern + Summe gleich → abgeglichen (Sammelzahlung)
        • keine Nummer, aber genau eine offene Rechnung mit gleichem Betrag und passendem Namen → abgeglichen
        • feste Regeln ohne Rechnung: Lohn/Gehalt, Bankentgelte, Finanzamt, Krankenkassen
        • alles andere → „prüfen“ (rot), mit Vorschlag wenn möglich
   Speicher (nur dieser Browser): buch:rechnungen, buch:umsaetze
   ========================================================================== */
(function () {
  "use strict";
  const box = document.getElementById("bu-inhalt");
  if (!box) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Speichern fehlgeschlagen – Browser-Speicher voll.", true); } };
  const euro = (c) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const cent = (v) => { if (typeof v === "number") return Math.round(v * 100); let t = String(v ?? "").trim().replace(/\s|€|EUR/gi, ""); if (!t) return 0;
    const neg = /^-|-$/.test(t) || /^\(.*\)$/.test(t); t = t.replace(/[-()+]/g, "");
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); return Math.round((parseFloat(t) || 0) * 100) * (neg ? -1 : 1); };
  const isoDatum = (t) => { t = String(t || "").trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/); return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
  const datumDE = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  const kompakt = (t) => norm(t).replace(/[^a-z0-9]/g, "");
  const iban = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
  function toast(t, fehler) { const el = $("#toast"); if (!el) return; el.textContent = t; el.classList.toggle("fehler", !!fehler); el.classList.add("an"); clearTimeout(toast.z); toast.z = setTimeout(() => el.classList.remove("an"), 3200); }
  const hash = (s) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

  let RE = lesen("buch:rechnungen", []), UM = lesen("buch:umsaetze", []);
  const sichern = () => { schreiben("buch:rechnungen", RE); schreiben("buch:umsaetze", UM); };
  const KONTEN = { sparkasse: "Sparkasse", raiba: "Raiffeisenbank" };
  let filterUm = "pruefen", filterRe = "offen", BERICHT = "";

  /* ---------- Kontoauszug lesen ---------- */
  function camt(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml"), t = (el, n) => el ? [...el.getElementsByTagNameNS("*", n)] : [], eins = (el, n) => t(el, n)[0];
    const kontoIban = iban((eins(eins(doc, "Acct"), "IBAN") || {}).textContent);
    return t(doc, "Ntry").flatMap((n) => {
      const betrag = cent(parseFloat((eins(n, "Amt") || {}).textContent || "0")), soll = ((eins(n, "CdtDbtInd") || {}).textContent || "") === "DBIT";
      const datum = isoDatum(((eins(eins(n, "BookgDt"), "Dt") || eins(eins(n, "BookgDt"), "DtTm") || eins(eins(n, "ValDt"), "Dt")) || {}).textContent);
      const details = t(n, "TxDtls"), liste = details.length ? details : [n];
      return liste.map((d) => {
        const teil = details.length > 1 && eins(d, "Amt") ? cent(parseFloat(eins(d, "Amt").textContent)) : betrag;
        const gegen = soll ? eins(d, "Cdtr") || eins(d, "CdtrAcct") : eins(d, "Dbtr") || eins(d, "DbtrAcct");
        const gegenKto = soll ? eins(d, "CdtrAcct") : eins(d, "DbtrAcct");
        return { datum, betrag: soll ? -teil : teil, name: ((eins(gegen, "Nm") || {}).textContent || "").trim(), iban: iban((eins(gegenKto, "IBAN") || {}).textContent),
          zweck: t(d, "Ustrd").map((u) => u.textContent).join(" ").replace(/\s+/g, " ").trim() || ((eins(n, "AddtlNtryInf") || {}).textContent || "").trim(), kontoIban };
      });
    });
  }
  function csvZeilen(text) {
    const kopf = text.split(/\r?\n/).find((z) => z.trim()) || "", trenn = (kopf.match(/;/g) || []).length >= (kopf.match(/,/g) || []).length ? ";" : ",";
    const zeilen = [], feld = []; let f = "", q = false, z = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === trenn) { z.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; z.push(f); f = ""; if (z.some((x) => x.trim())) zeilen.push(z); z = []; } else f += c;
    }
    z.push(f); if (z.some((x) => x.trim())) zeilen.push(z);
    void feld; return zeilen;
  }
  function spalte(kopf, ...muster) { for (const m of muster) { const i = kopf.findIndex((h) => m.test(norm(h).trim())); if (i >= 0) return i; } return -1; }
  function bankCsv(text) {
    const z = csvZeilen(text); let k = z.findIndex((r) => r.some((h) => /buchungstag|buchungsdatum/.test(norm(h)))); if (k < 0) throw new Error("CSV: Spalte „Buchungstag“ nicht gefunden");
    const kopf = z[k], i = {
      datum: spalte(kopf, /^buchungstag$/, /buchungstag/, /buchungsdatum/),
      betrag: spalte(kopf, /^betrag/, /^umsatz/), soll: spalte(kopf, /^soll/), haben: spalte(kopf, /^haben/),
      name: spalte(kopf, /beguenstigter\/zahlungspflichtiger/, /name zahlungsbeteiligter/, /zahlungsempfanger|empfanger\/zahlungspflichtiger/, /^name$/, /auftraggeber/),
      iban: spalte(kopf, /iban zahlungsbeteiligter/, /kontonummer\/iban/, /^iban$/, /empfanger.*iban|iban.*empfanger/),
      zweck: spalte(kopf, /verwendungszweck/, /^zweck/), konto: spalte(kopf, /iban auftragskonto/, /^auftragskonto$/),
    };
    if (i.betrag < 0 && i.soll < 0) throw new Error("CSV: Spalte „Betrag“ nicht gefunden");
    return z.slice(k + 1).filter((r) => r[i.datum]).map((r) => ({ datum: isoDatum(r[i.datum]), betrag: i.betrag >= 0 ? cent(r[i.betrag]) : cent(r[i.haben]) - Math.abs(cent(r[i.soll])),
      name: (r[i.name] || "").trim(), iban: iban(r[i.iban]), zweck: (r[i.zweck] || "").replace(/\s+/g, " ").trim(), kontoIban: iban(r[i.konto]) })).filter((u) => u.datum && u.betrag);
  }
  /* Bank-CSV kommt oft in Windows-Zeichensatz (Umlaute) – erst UTF-8 versuchen, sonst windows-1252 */
  async function text(f) { const b = await f.arrayBuffer(); try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (e) { return new TextDecoder("windows-1252").decode(b); } }
  const lohnKonten = () => lesen("lohn:konten", {});
  function kontoVon(kontoIban, wahl) {
    const k = lohnKonten();
    for (const key of Object.keys(KONTEN)) if (kontoIban && k[key] && iban(k[key].iban) === kontoIban) return key;
    return wahl;
  }
  async function zipLesen(datei) {
    if (!window.zip) await new Promise((ok, f) => { const s = document.createElement("script"); s.src = "../gesamt/vendor/zip.min.js"; s.onload = ok; s.onerror = f; document.head.appendChild(s); });
    window.zip.configure({ useWebWorkers: false });
    const r = new window.zip.ZipReader(new window.zip.BlobReader(datei)), raus = [];
    for (const e of await r.getEntries()) if (!e.directory) raus.push(new File([await e.getData(new window.zip.BlobWriter())], e.filename.split("/").pop()));
    await r.close(); return raus;
  }
  async function auszugEinlesen(dateien, wahl) {
    let neu = 0, doppelt = 0, liste = [];
    for (const f of dateien) { if (/\.zip$/i.test(f.name)) liste.push(...await zipLesen(f)); else liste.push(f); }
    for (const f of liste) {
      const inhalt = await text(f), um = /\.xml$/i.test(f.name) || /^\s*<\?xml|<Document/i.test(inhalt.slice(0, 300)) ? camt(inhalt) : bankCsv(inhalt);
      for (const u of um) {
        const konto = kontoVon(u.kontoIban, wahl), id = hash([konto, u.datum, u.betrag, u.name, u.zweck].join("|"));
        if (UM.some((x) => x.id === id)) { doppelt++; continue; }
        UM.push({ id, konto, datum: u.datum, betrag: u.betrag, name: u.name, iban: u.iban, zweck: u.zweck, status: "", rechnungen: [], hinweis: "" }); neu++;
      }
    }
    abgleichen(); sichern();
    BERICHT = `Kontoauszug: ${neu} neue Umsätze eingelesen${doppelt ? `, ${doppelt} schon vorhanden (übersprungen)` : ""}.`;
    zeichnen();
  }

  /* ---------- Rechnungen lesen ---------- */
  function rechnungenCsv(text, art) {
    const z = csvZeilen(text); let k = z.findIndex((r) => r.some((h) => /rechnung|beleg|re-?nr|nummer/.test(norm(h)))); if (k < 0) throw new Error("CSV: Spalte „Rechnungsnummer“ nicht gefunden");
    const kopf = z[k], i = { nr: spalte(kopf, /rechnungs?-?nr|rechnungsnummer/, /re-?nr/, /belegnummer|beleg-?nr|^beleg$/, /^nummer$|^nr\.?$/),
      datum: spalte(kopf, /rechnungsdatum/, /belegdatum/, /^datum$/, /datum/), partner: spalte(kopf, /^kunde|kundenname/, /lieferant/, /^name/, /firma/, /empfanger/),
      betrag: spalte(kopf, /brutto/, /endbetrag|gesamtbetrag|rechnungsbetrag/, /^betrag/, /summe/), faellig: spalte(kopf, /fallig/), art: spalte(kopf, /^art$|^typ$|belegart/) };
    if (i.nr < 0 || i.betrag < 0) throw new Error("CSV: Rechnungsnummer- oder Betrag-Spalte fehlt");
    return z.slice(k + 1).filter((r) => (r[i.nr] || "").trim()).map((r) => ({ nr: r[i.nr].trim(), datum: isoDatum(r[i.datum]), partner: (r[i.partner] || "").trim(), betrag: Math.abs(cent(r[i.betrag])),
      faellig: isoDatum(r[i.faellig]), art: i.art >= 0 && /eingang|kredit|liefer/i.test(r[i.art]) ? "ein" : i.art >= 0 && /ausgang|debit|kunde/i.test(r[i.art]) ? "aus" : art }));
  }
  function rechnungenDazu(l) {
    let neu = 0, alt = 0;
    for (const r of l) {
      const da = RE.find((x) => x.art === r.art && kompakt(x.nr) === kompakt(r.nr));
      if (da) { Object.assign(da, { ...r, id: da.id, bezahlt: da.bezahlt }); alt++; } else { RE.push({ ...r, id: "r" + hash(r.art + r.nr + Math.random()), bezahlt: null }); neu++; }
    }
    abgleichen(); sichern(); BERICHT = `Rechnungen: ${neu} neu, ${alt} aktualisiert.`; zeichnen();
  }

  /* ---------- Abgleich ---------- */
  const MA = () => Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => lesen(k, {})).filter((d) => d.nachname);
  const REGELN = [
    ["Lohn / Gehalt", (u) => u.betrag < 0 && (/lohn|gehalt|\bsala\b/i.test(u.zweck) || MA().some((d) => norm(u.name).includes(norm(d.nachname)) && norm(u.name).includes(norm(d.vorname || "")) ))],
    ["Bankentgelt", (u) => /entgelt|kontofuhrung|kontofuehrung|abschluss|zinsen|gebuhr|gebuehr|porto/i.test(norm(u.zweck + " " + u.name)) && Math.abs(u.betrag) < 50000 && !u.iban],
    ["Finanzamt / Steuer", (u) => /finanzamt|bundeskasse|steuerverwaltung/i.test(norm(u.name + " " + u.zweck))],
    ["Krankenkasse / Sozialversicherung", (u) => /\baok\b|techniker|barmer|\bdak\b|\bikk\b|knappschaft|\bbkk\b|sozialversicherung|berufsgenossenschaft|\bsoka\b/i.test(norm(u.name))],
  ];
  function nummernIn(zweck, kandidaten) {
    const z = kompakt(zweck), ziffern = (zweck.match(/\d+/g) || []);
    return kandidaten.filter((r) => { const k = kompakt(r.nr); if (k.length >= 4 && z.includes(k)) return true;
      const d = r.nr.replace(/\D/g, ""); return d.length >= 4 && ziffern.includes(d) || (d.length >= 5 && ziffern.some((x) => x.endsWith(d) && x.length - d.length <= 2)); });
  }
  const namePasst = (u, r) => { const w = norm(r.partner).split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !["gmbh", "und", "firma", "herr", "frau", "familie"].includes(x)); const n = norm(u.name + " " + u.zweck); return w.length && w.some((x) => n.includes(x)); };
  const rest = (r) => r.betrag - (r.teil || 0);
  const skonto = (betrag, ziel) => [0.98, 0.97].some((f) => Math.abs(Math.round(betrag * f) - ziel) <= 1);
  function abgleichen() {
    /* bezahlt-Markierungen aus automatischen Zuordnungen neu aufbauen, manuelle bleiben */
    /* Zahlungen je Rechnung neu aufbauen: von Hand zugeordnete zählen als (Teil-)Zahlung, bezahlt erst wenn alles da ist */
    RE.forEach((r) => { r.bezahlt = null; r.teil = 0; });
    UM.filter((u) => u.status === "manuell").sort((a, b) => a.datum.localeCompare(b.datum)).forEach((u) => (u.rechnungen || []).forEach((id) => {
      const r = RE.find((x) => x.id === id); if (!r) return;
      r.teil += u.rechnungen.length > 1 ? rest(r) : Math.abs(u.betrag);
      if (r.teil >= r.betrag - 1) r.bezahlt = { datum: u.datum, umsatz: u.id };
    }));
    for (const u of UM.slice().sort((a, b) => a.datum.localeCompare(b.datum))) {
      if (["manuell", "ohne"].includes(u.status)) continue;   // von Hand Entschiedenes bleibt
      u.status = "pruefen"; u.rechnungen = []; u.hinweis = ""; u.vorschlag = "";
      const art = u.betrag > 0 ? "aus" : "ein", betrag = Math.abs(u.betrag), offen = RE.filter((r) => r.art === art && !r.bezahlt);
      const treffer = nummernIn(u.zweck, offen);
      const setzen = (l, hinweis) => { u.status = "auto"; u.rechnungen = l.map((r) => r.id); u.hinweis = hinweis + (l.some((r) => r.teil) ? " (Restzahlung)" : ""); l.forEach((r) => { r.bezahlt = { datum: u.datum, umsatz: u.id, auto: true }; }); };
      if (treffer.length) {
        const summe = treffer.reduce((a, r) => a + rest(r), 0);
        if (summe === betrag) { setzen(treffer, treffer.length > 1 ? `Sammelzahlung ${treffer.length} Rechnungen` : "Rechnungsnummer + Betrag"); continue; }
        if (treffer.length === 1 && skonto(rest(treffer[0]), betrag)) { setzen(treffer, `mit Skonto (${euro(rest(treffer[0]) - betrag)} weniger)`); continue; }
        u.vorschlag = treffer.map((r) => r.id).join(","); u.hinweis = `Rechnung ${treffer.map((r) => r.nr).join(", ")} gefunden, aber Betrag ${betrag < summe ? "kleiner (Teilzahlung?)" : "größer"}: ${treffer.some((r) => r.teil) ? "offen noch" : "Rechnung"} ${euro(summe)}`;
        continue;
      }
      const gleich = offen.filter((r) => rest(r) === betrag), mitName = gleich.filter((r) => namePasst(u, r));
      if (mitName.length === 1) { setzen(mitName, "Betrag + Name (ohne Rechnungsnummer)"); continue; }
      const regel = REGELN.find(([, t]) => t(u));
      if (regel) { u.status = "regel"; u.hinweis = regel[0]; continue; }
      if (gleich.length) { u.vorschlag = gleich.map((r) => r.id).join(","); u.hinweis = gleich.length === 1 ? `Betrag passt zu ${gleich[0].nr} (${gleich[0].partner}), Name nicht` : `${gleich.length} offene Rechnungen mit gleichem Betrag`; continue; }
      u.hinweis = "keine passende Rechnung";
    }
  }

  /* ---------- Darstellung ---------- */
  const STATUS = { auto: ["abgeglichen", "ok"], manuell: ["von Hand zugeordnet", "ok"], regel: ["Regel", "regel"], ohne: ["ohne Rechnung (geprüft)", "regel"], pruefen: ["prüfen", "pruefen"] };
  const reNr = (id) => { const r = RE.find((x) => x.id === id); return r ? r : null; };
  function zeichnen() {
    const pr = UM.filter((u) => u.status === "pruefen"), ok = UM.filter((u) => u.status === "auto" || u.status === "manuell");
    const offenAus = RE.filter((r) => r.art === "aus" && !r.bezahlt), offenEin = RE.filter((r) => r.art === "ein" && !r.bezahlt), heute = new Date().toISOString().slice(0, 10);
    const um = UM.filter((u) => filterUm === "alle" || (filterUm === "pruefen" ? u.status === "pruefen" : filterUm === "ok" ? ["auto", "manuell"].includes(u.status) : ["regel", "ohne"].includes(u.status))).sort((a, b) => b.datum.localeCompare(a.datum));
    const re = RE.filter((r) => filterRe === "alle" || (filterRe === "offen" ? !r.bezahlt : filterRe === "bezahlt" ? !!r.bezahlt : r.art === filterRe)).sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
    const optionen = (u) => { const art = u.betrag > 0 ? "aus" : "ein", l = RE.filter((r) => r.art === art && !r.bezahlt).sort((a, b) => Math.abs(rest(a) - Math.abs(u.betrag)) - Math.abs(rest(b) - Math.abs(u.betrag))).slice(0, 40);
      const vor = (u.vorschlag || "").split(",").filter(Boolean);
      return `<option value="">Rechnung zuordnen …</option>${l.map((r) => `<option value="${r.id}"${vor[0] === r.id ? " selected" : ""}>${esc(r.nr)} · ${esc(r.partner || "–")} · ${euro(rest(r))}${r.teil ? " offen" : ""}${vor.includes(r.id) ? " ★" : ""}</option>`).join("")}`; };
    box.innerHTML = `
      <div class="kpis vier lo-kpis">
        <div class="kpi${pr.length ? " alarm" : ""}"><span class="kpi-titel">Händisch prüfen</span><span class="kpi-zahl klein">${pr.length}</span><span class="kpi-unter">Umsätze ohne passende Rechnung</span></div>
        <div class="kpi"><span class="kpi-titel">Automatisch abgeglichen</span><span class="kpi-zahl klein">${ok.length}</span><span class="kpi-unter">von ${UM.length} Umsätzen</span></div>
        <div class="kpi"><span class="kpi-titel">Offene Kundenrechnungen</span><span class="kpi-zahl klein">${euro(offenAus.reduce((a, r) => a + rest(r), 0))}</span><span class="kpi-unter">${offenAus.length} Rechnungen · ${offenAus.filter((r) => r.faellig && r.faellig < heute).length} überfällig</span></div>
        <div class="kpi"><span class="kpi-titel">Offene Lieferantenrechnungen</span><span class="kpi-zahl klein">${euro(offenEin.reduce((a, r) => a + rest(r), 0))}</span><span class="kpi-unter">${offenEin.length} Rechnungen</span></div>
      </div>
      ${BERICHT ? `<p class="bu-bericht">${esc(BERICHT)} <button type="button" class="btn klein still" data-a="bericht-zu">✕</button></p>` : ""}
      <section class="panel bu-import"><div class="bu-drops">
        <label class="lo-drop" data-drop="auszug">🏦 <span><b>Kontoauszug einlesen</b><small>CAMT (XML/ZIP) oder CSV aus dem Online-Banking. Konto:
          <select data-kontowahl onclick="event.stopPropagation()">${Object.entries(KONTEN).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select> (wird über die IBAN erkannt, wenn hinterlegt)</small></span>
          <input type="file" accept=".xml,.csv,.zip,.txt" multiple hidden data-datei="auszug"></label>
        <label class="lo-drop" data-drop="aus">🧾 <span><b>Ausgangsrechnungen (an Kunden)</b><small>CSV, z. B. Export „Offene Posten“ aus KWP</small></span><input type="file" accept=".csv,.txt" multiple hidden data-datei="aus"></label>
        <label class="lo-drop" data-drop="ein">📥 <span><b>Eingangsrechnungen (Lieferanten)</b><small>CSV-Liste</small></span><input type="file" accept=".csv,.txt" multiple hidden data-datei="ein"></label>
      </div></section>

      <section class="panel bu-block"><h2 class="panel-titel">Abgleich Kontoauszug ↔ Rechnungen <span class="zahl">${UM.length}</span></h2>
        <div class="panel-innen">
          <div class="wz-filter bu-filter">${[["pruefen", "Zu prüfen", pr.length], ["ok", "Abgeglichen", ok.length], ["regel", "Ohne Rechnung", UM.filter((u) => ["regel", "ohne"].includes(u.status)).length], ["alle", "Alle", UM.length]].map(([k, t, n]) => `<button type="button" data-fum="${k}" class="${filterUm === k ? "an" : ""}">${t} <small>${n}</small></button>`).join("")}</div>
          ${um.length ? `<div class="lo-scroll"><table class="lo-tab bu-tab"><thead><tr><th>Datum</th><th>Konto</th><th>Name / Verwendungszweck</th><th class="r">Betrag</th><th>Status</th><th>Rechnung / Aktion</th></tr></thead><tbody>
            ${um.map((u) => { const [st, kl] = STATUS[u.status] || STATUS.pruefen, rs = (u.rechnungen || []).map(reNr).filter(Boolean);
              return `<tr class="bu-${kl}" data-u="${u.id}"><td>${datumDE(u.datum)}</td><td><small>${esc(KONTEN[u.konto] || u.konto || "–")}</small></td>
                <td><b>${esc(u.name || "–")}</b><small class="bu-zweck">${esc(u.zweck)}</small></td>
                <td class="r ${u.betrag < 0 ? "bu-minus" : ""}">${euro(u.betrag)}</td>
                <td><span class="bu-st ${kl}">${st}</span>${u.hinweis ? `<small>${esc(u.hinweis)}</small>` : ""}</td>
                <td>${rs.length ? `${rs.map((r) => `<b>${esc(r.nr)}</b> <small>${esc(r.partner || "")} · ${euro(r.betrag)}</small>`).join("<br>")}${u.status !== "auto" ? ` <button type="button" class="btn klein still" data-a="loesen">lösen</button>` : ""}`
                  : u.status === "pruefen" ? `<div class="bu-aktion"><select data-zuordnen>${optionen(u)}</select><button type="button" class="btn klein" data-a="zuordnen">Zuordnen</button><button type="button" class="btn klein still" data-a="ohne">ohne Rechnung</button></div>`
                  : u.status === "ohne" ? `<button type="button" class="btn klein still" data-a="loesen">zurück auf prüfen</button>` : ""}</td></tr>`; }).join("")}
          </tbody></table></div>` : `<p class="leise">${UM.length ? "Keine Umsätze in dieser Ansicht." : "Noch kein Kontoauszug eingelesen."}</p>`}
        </div></section>

      <section class="panel bu-block"><h2 class="panel-titel">Rechnungen <span class="zahl">${RE.length}</span></h2>
        <div class="panel-innen">
          <div class="wz-filter bu-filter">${[["offen", "Offen"], ["bezahlt", "Bezahlt"], ["aus", "Ausgang"], ["ein", "Eingang"], ["alle", "Alle"]].map(([k, t]) => `<button type="button" data-fre="${k}" class="${filterRe === k ? "an" : ""}">${t}</button>`).join("")}</div>
          <form class="bu-neu" data-form="rechnung"><select name="art"><option value="aus">Ausgang (Kunde)</option><option value="ein">Eingang (Lieferant)</option></select>
            <input name="nr" placeholder="Rechnungsnr." required><input name="datum" type="date"><input name="partner" placeholder="Kunde / Lieferant"><input name="betrag" placeholder="Betrag brutto" inputmode="decimal" required><input name="faellig" type="date" title="fällig am">
            <button class="btn klein jetzt" type="submit">+ Rechnung</button></form>
          ${re.length ? `<div class="lo-scroll"><table class="lo-tab bu-tab"><thead><tr><th>Art</th><th>Nr.</th><th>Datum</th><th>Kunde / Lieferant</th><th class="r">Betrag</th><th>fällig</th><th>Status</th><th></th></tr></thead><tbody>
            ${re.map((r) => `<tr data-r="${r.id}"><td><small>${r.art === "aus" ? "Ausgang" : "Eingang"}</small></td><td><b>${esc(r.nr)}</b></td><td>${datumDE(r.datum)}</td><td>${esc(r.partner)}</td><td class="r">${euro(r.betrag)}</td>
              <td class="${!r.bezahlt && r.faellig && r.faellig < heute ? "bu-minus" : ""}">${datumDE(r.faellig)}</td><td>${r.bezahlt ? `<span class="bu-st ok">bezahlt ${datumDE(r.bezahlt.datum)}</span>` : r.teil ? `<span class="bu-st offen">teilbezahlt</span><small>${euro(r.teil)} bezahlt · offen ${euro(rest(r))}</small>` : '<span class="bu-st offen">offen</span>'}</td>
              <td><button type="button" class="btn klein still gefahr" data-a="re-weg" title="Rechnung löschen">✕</button></td></tr>`).join("")}
          </tbody></table></div>` : '<p class="leise">Noch keine Rechnungen.</p>'}
        </div></section>
      <p class="leise klein-text">Alle Daten liegen nur in diesem Browser. Regeln: Rechnungsnummer im Verwendungszweck + gleicher Betrag (auch 2 %/3 % Skonto, Sammelzahlungen) → abgeglichen; sonst gleicher Betrag + passender Name → abgeglichen; Lohn, Bankentgelte, Finanzamt, Krankenkassen → „ohne Rechnung“; alles andere → prüfen.</p>`;
  }

  /* ---------- Bedienung ---------- */
  async function dateien(art, l) {
    try {
      if (art === "auszug") await auszugEinlesen(l, ($("[data-kontowahl]", box) || {}).value || "sparkasse");
      else { const alle = []; for (const f of l) alle.push(...rechnungenCsv(await text(f), art)); rechnungenDazu(alle); }
    } catch (e) { BERICHT = "Einlesen fehlgeschlagen: " + (e.message || e); zeichnen(); }
  }
  box.addEventListener("change", (e) => { const t = e.target; if (t.dataset.datei && t.files.length) { const l = [...t.files]; t.value = ""; dateien(t.dataset.datei, l); } });
  box.addEventListener("dragover", (e) => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("ziehen"); } });
  box.addEventListener("dragleave", (e) => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("ziehen"); });
  box.addEventListener("drop", (e) => { const d = e.target.closest("[data-drop]"); if (!d) return; e.preventDefault(); d.classList.remove("ziehen"); if (e.dataTransfer.files.length) dateien(d.dataset.drop, [...e.dataTransfer.files]); });
  box.addEventListener("submit", (e) => {
    if (e.target.dataset.form !== "rechnung") return; e.preventDefault();
    const f = new FormData(e.target), b = Math.abs(cent(f.get("betrag")));
    if (!b) return toast("Bitte einen Betrag eintragen.", true);
    rechnungenDazu([{ art: f.get("art"), nr: String(f.get("nr")).trim(), datum: f.get("datum") || "", partner: String(f.get("partner")).trim(), betrag: b, faellig: f.get("faellig") || "" }]);
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.fum) { filterUm = b.dataset.fum; return zeichnen(); }
    if (b.dataset.fre) { filterRe = b.dataset.fre; return zeichnen(); }
    const tr = b.closest("tr"), u = tr && UM.find((x) => x.id === tr.dataset.u);
    if (b.dataset.a === "bericht-zu") { BERICHT = ""; return zeichnen(); }
    if (b.dataset.a === "zuordnen" && u) {
      const id = tr.querySelector("[data-zuordnen]").value; if (!id) return toast("Bitte eine Rechnung wählen.", true);
      const r = RE.find((x) => x.id === id), b2 = Math.abs(u.betrag), o = rest(r);
      if (b2 < o - 1 && !confirm(`Teilzahlung: ${euro(b2)} von offen ${euro(o)}.\nDie Rechnung bleibt mit ${euro(o - b2)} offen. Zuordnen?`)) return;
      if (b2 > o + 1 && !confirm(`Umsatz ${euro(b2)} ist größer als offen ${euro(o)}. Trotzdem zuordnen?`)) return;
      u.status = "manuell"; u.rechnungen = [id]; u.hinweis = b2 < o - 1 ? `Teilzahlung, Rest ${euro(o - b2)}` : "von Hand";
    }
    if (b.dataset.a === "ohne" && u) { const g = prompt("Kurzer Grund (z. B. Privatentnahme, Leasing, Versicherung):", ""); if (g === null) return; u.status = "ohne"; u.rechnungen = []; u.hinweis = g || "ohne Rechnung"; }
    if (b.dataset.a === "loesen" && u) { (u.rechnungen || []).forEach((id) => { const r = RE.find((x) => x.id === id); if (r && r.bezahlt && r.bezahlt.umsatz === u.id) r.bezahlt = null; }); u.status = ""; u.rechnungen = []; }
    if (b.dataset.a === "re-weg") { const r = RE.find((x) => x.id === tr.dataset.r); if (!r || !confirm(`Rechnung ${r.nr} löschen?`)) return; RE = RE.filter((x) => x !== r); UM.forEach((x) => { x.rechnungen = (x.rechnungen || []).filter((id) => id !== r.id); if (x.status === "manuell" && !x.rechnungen.length) x.status = ""; }); }
    if (["zuordnen", "ohne", "loesen", "re-weg"].includes(b.dataset.a)) { abgleichen(); sichern(); zeichnen(); }
  });

  zeichnen();
})();
