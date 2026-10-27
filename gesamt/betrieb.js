/* ==========================================================================
   Brüll Dashboard – Betriebsmonitor (nur Geschäftsführung)
   --------------------------------------------------------------------------
   betrieb/index.html#cockpit | #stundensatz | #planung | #soll-ist
   • Stundensatz: Kosten + Materialaufschlag + verkaufbare Stunden → Zielstundensatz
     (Mitarbeiter aus Personal, Fahrzeugkosten aus dem Fuhrpark, Ein-/Austritt anteilig)
   • Jahresplanung: Soll je Monat, aus dem Stundensatz vorbelegt, frei änderbar
   • Soll-Ist: Ist-Zahlen aus DATEV (BWA oder SuSa als CSV) oder von Hand
   • Cockpit: alles auf einen Blick + Auftragsbestand/Angebote aus Bad und Heizung (Auszug)
   Speicher: bm:<Jahr> (Demo: bm-demo:<Jahr>) im Browser – im Betrieb Datenbank auf dem Mac mini.
   Online nur verschlüsselt: „Sichern“ → betrieb/daten-lokal.js (.gitignore) → node werkzeuge/tresor.js
   Anmeldung + Leiste kommen aus personal.js.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const QS = location.search, DEMO = new URLSearchParams(QS).has("demo");
  const inhalt = $("#bm-inhalt");
  if (!inhalt || !$("#rail").innerHTML) return;            // nicht angemeldet → personal.js leitet um

  const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const MONAT = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const HEUTE = new Date(), JAHR_JETZT = HEUTE.getFullYear();
  const eur = (n) => (Math.round(Number(n) || 0)).toLocaleString("de-DE") + " €";
  const eur2 = (n) => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const zahl = (n, st = 0) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
  const pz = (n) => (isFinite(n) ? Math.round(n) : 0) + " %";
  const num = (s) => { if (typeof s === "number") return s; const t = String(s ?? "").replace(/[€%\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); const n = parseFloat(t); return isFinite(n) ? n : 0; };
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("an"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("an"), 2600); }

  /* ---------- Speicher ---------- */
  const PRE = DEMO ? "bm-demo:" : "bm:";
  let JAHR = +(lesen("bm:jahr", JAHR_JETZT)) || JAHR_JETZT;
  const speichern = () => { D.geaendert = Date.now(); try { localStorage.setItem(PRE + JAHR, JSON.stringify(D)); localStorage.setItem("bm:jahr", JSON.stringify(JAHR)); } catch (e) { toast("Speichern nicht möglich – Browser-Speicher voll?"); } };

  /* Gesicherter Stand aus betrieb/daten-lokal.js oder dem Tresor (window.BM_DATEN) übernehmen, wenn neuer */
  if (!DEMO && window.BM_DATEN && window.BM_DATEN.jahre) {
    for (const [j, d] of Object.entries(window.BM_DATEN.jahre)) {
      const alt = lesen("bm:" + j, null);
      if (!alt || (d.geaendert || 0) > (alt.geaendert || 0)) { try { localStorage.setItem("bm:" + j, JSON.stringify(d)); } catch (e) { /* voll */ } }
    }
  }

  /* ---------- Vorbelegung ---------- */
  const KOSTEN_VORLAGE = ["Raumkosten (Miete, Nebenkosten)", "Versicherungen & Beiträge", "Werkzeug & Geräte", "Büro, EDV & Software (KWP …)", "Werbung", "Abschreibungen",
    "Steuerberater & Beratung", "Kalkulatorischer Unternehmerlohn", "Sonstige Kosten"];
  /* produktiver Anteil nach Position (Startwert, frei änderbar) */
  function produktivVon(pos) {
    const p = String(pos || "").toLowerCase();
    if (/inhaber|geschäftsf/.test(p)) return 20;
    if (/büro|buchhaltung|aushilfe/.test(p) && !/meister/.test(p)) return 0;
    if (/meister/.test(p)) return 50;
    if (/azubi|auszubild/.test(p)) return 45;
    return 85;
  }
  const isoAus = (de) => { const m = String(de || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : (/^\d{4}-\d\d-\d\d$/.test(de || "") ? de : ""); };
  function personenAusPersonal() {
    return Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
      .filter((x) => x.d && (x.d.vorname || x.d.nachname)).sort((a, b) => +a.nr - +b.nr)
      .map((x) => ({ nr: x.nr, name: ((x.d.vorname || "") + " " + (x.d.nachname || "")).trim(), rolle: x.d.position || "",
        wochenStd: /teilzeit|23/.test(x.d.regelarbeitszeit || "") ? 23 : 40, produktiv: produktivVon(x.d.position), lohnJahr: 0,
        eintritt: isoAus(x.d.einstellung), austritt: isoAus(x.d.austritt) }));
  }
  function leer() {
    return { satz: { personen: personenAusPersonal(), agAnteil: 21, tage: { urlaub: 30, feiertage: 10, krank: 10, schulung: 2 },
      kosten: KOSTEN_VORLAGE.map((bez) => ({ bez, betrag: 0 })), fahrzeugeAuto: true, fahrzeugeBetrag: 0,
      material: 0, aufschlag: 25, gewinn: 0, istSatz: 0 }, plan: null, ist: {}, geaendert: 0 };
  }
  /* Demo: frei erfundener Betrieb (14 Personen) – keine echten Zahlen */
  function demo(j) {
    const P = [["Inhaber", 40, 20, 78000], ["Meister Bad", 40, 55, 58000], ["Badbauer 1", 40, 85, 44000], ["Badbauer 2", 40, 85, 42000], ["Fliesenleger", 40, 88, 43000],
      ["Meister Heizung", 40, 55, 60000], ["Heizungsbauer 1", 40, 85, 45000], ["Heizungsbauer 2", 40, 85, 43000], ["Kundendienst", 40, 80, 46000],
      ["Azubi Bad", 40, 45, 13000], ["Azubi Heizung", 40, 45, 12000, `${j}-09-01`], ["Büro Bad", 23, 0, 26000], ["Büro Heizung", 40, 0, 41000], ["Buchhaltung", 23, 0, 25000]];
    const d = leer();
    d.satz.personen = P.map(([rolle, w, pr, l, ein], i) => ({ nr: "d" + (i + 1), name: rolle, rolle, wochenStd: w, produktiv: pr, lohnJahr: l, eintritt: ein || "", austritt: i === 3 ? `${j}-06-30` : "" }));
    d.satz.kosten = [[KOSTEN_VORLAGE[0], 54000], [KOSTEN_VORLAGE[1], 21000], [KOSTEN_VORLAGE[2], 26000], [KOSTEN_VORLAGE[3], 19000], [KOSTEN_VORLAGE[4], 12000],
      [KOSTEN_VORLAGE[5], 38000], [KOSTEN_VORLAGE[6], 16000], [KOSTEN_VORLAGE[7], 0], [KOSTEN_VORLAGE[8], 14000]].map(([bez, betrag]) => ({ bez, betrag }));
    Object.assign(d.satz, { fahrzeugeAuto: false, fahrzeugeBetrag: 96000, material: 640000, aufschlag: 22, gewinn: 120000, istSatz: 69 });
    const sais = [.82, .88, 1, 1.04, 1.05, 1.02, .98, .74, 1.08, 1.12, 1.1, .86], r = (i, s) => 1 + Math.sin(i * 2.3 + s) * .06;
    const R = rechnen(d, j), mq = d.satz.material / R.umsatz;
    for (let m = 0; m < Math.min(12, j < JAHR_JETZT ? 12 : j > JAHR_JETZT ? 0 : HEUTE.getMonth()); m++) {
      const u = R.umsatz / 12 * sais[m] * r(m, 1) * .97;
      d.ist[m + 1] = { umsatz: Math.round(u), material: Math.round(u * mq * r(m, 3)), personal: Math.round(R.personal / 12 * r(m, 5) * 1.02), sonstige: Math.round(R.gemein / 12 * r(m, 2)),
        stunden: Math.round(R.stunden / 12 * sais[m] * r(m, 4) * .95), quelle: "Demo" };
    }
    return d;
  }
  let D;

  /* ---------- Fahrzeugkosten aus dem Fuhrpark (fz_<Nr> + DKV-Tankvorgänge) ---------- */
  function fahrzeugKosten() {
    if (DEMO) return { n: 0, leasing: 0, vers: 0, steuer: 0, tanken: 0, summe: 0, tankMonate: 0 };
    let leasing = 0, vers = 0, steuer = 0, tanken = 0, n = 0;
    for (const k of Object.keys(localStorage).filter((x) => /^fz_\d+$/.test(x))) {
      const f = lesen(k, {}); if (!f || f.fz_ausgeblendet || /verkauft|abgemeldet/i.test(f.fz_status || "")) continue;
      n++; leasing += num(f.fz_leasingrate) * 12; vers += num(f.fz_vers_beitrag); steuer += num(f.fz_steuer);
    }
    /* Tanken: Durchschnitt der letzten vollen Monate × 12 */
    const monate = {};
    for (const l of Object.values(window.FZ_TANKEN || {})) for (const b of l) { const m = (b.datum || "").slice(0, 7); if (m) monate[m] = (monate[m] || 0) + (b.betrag || 0); }
    const ms = Object.keys(monate).sort().slice(-6);
    if (ms.length) tanken = ms.reduce((a, m) => a + monate[m], 0) / ms.length * 12;
    return { n, leasing, vers, steuer, tanken, summe: leasing + vers + steuer + tanken, tankMonate: ms.length };
  }

  /* ---------- Rechnen ---------- */
  const tageIm = (j) => (new Date(j + 1, 0, 1) - new Date(j, 0, 1)) / 864e5;
  function werktage(j, m) {        // Mo–Fr im Jahr (m = undefined) oder im Monat m (0–11)
    let n = 0; const von = new Date(j, m ?? 0, 1), bis = m == null ? new Date(j + 1, 0, 1) : new Date(j, m + 1, 1);
    for (const d = new Date(von); d < bis; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
    return n;
  }
  function anteilImJahr(p, j) {
    const von = Math.max(new Date(j, 0, 1, 12), p.eintritt ? new Date(p.eintritt + "T12:00") : 0);
    const bis = Math.min(new Date(j, 11, 31, 12), p.austritt ? new Date(p.austritt + "T12:00") : Infinity);
    return bis < von ? 0 : Math.min(1, (Math.round((bis - von) / 864e5) + 1) / tageIm(j));
  }
  function rechnen(d = D, j = JAHR) {
    const s = d.satz, t = s.tage, wt = werktage(j), arbeitstage = Math.max(0, wt - t.feiertage - t.urlaub - t.krank - t.schulung);
    const pers = s.personen.map((p) => {
      const anteil = anteilImJahr(p, j), anwesend = arbeitstage * (p.wochenStd || 0) / 5 * anteil, verkaufbar = anwesend * (p.produktiv || 0) / 100;
      return { ...p, anteil, anwesend, verkaufbar, kosten: (p.lohnJahr || 0) * anteil * (1 + s.agAnteil / 100) };
    });
    const fz = fahrzeugKosten(), fahrzeuge = s.fahrzeugeAuto && fz.n ? fz.summe : s.fahrzeugeBetrag || 0;
    const stunden = pers.reduce((a, p) => a + p.verkaufbar, 0), personal = pers.reduce((a, p) => a + p.kosten, 0);
    const gemein = s.kosten.reduce((a, k) => a + (k.betrag || 0), 0) + fahrzeuge;
    const materialDB = (s.material || 0) * s.aufschlag / 100, kosten = personal + gemein;
    const ausStunden = kosten + (s.gewinn || 0) - materialDB;
    const ziel = stunden ? ausStunden / stunden : 0, selbst = stunden ? (kosten - materialDB) / stunden : 0;
    const umsatz = ausStunden + (s.material || 0) * (1 + s.aufschlag / 100);
    return { wt, arbeitstage, pers, fz, fahrzeuge, stunden, personal, gemein, materialDB, kosten, ausStunden, ziel, selbst, umsatz, ergebnis: s.gewinn || 0 };
  }
  /* Plan je Monat: aus dem Stundensatz nach Werktagen verteilt (Kosten gleichmäßig) – Einträge von Hand haben Vorrang */
  function planMonate(d = D, j = JAHR) {
    const r = rechnen(d, j), wt = werktage(j);
    return MON.map((_, m) => {
      const f = werktage(j, m) / wt, h = (d.plan && d.plan[m]) || {};
      const auto = { umsatz: r.umsatz * f, material: (d.satz.material || 0) * f, personal: r.personal / 12, sonstige: r.gemein / 12, stunden: r.stunden * f };
      const o = {}; for (const k of Object.keys(auto)) o[k] = h[k] != null && h[k] !== "" ? h[k] : auto[k];
      o.hand = Object.keys(h).some((k) => h[k] != null && h[k] !== "");
      return o;
    });
  }
  const erg = (x) => (x.umsatz || 0) - (x.material || 0) - (x.personal || 0) - (x.sonstige || 0);
  const summe = (l, f) => l.reduce((a, x) => a + (typeof f === "function" ? f(x) : x[f] || 0), 0);
  /* Monate mit Ist-Zahlen (bis zum letzten gebuchten Monat) */
  const istMonate = () => Object.keys(D.ist).map(Number).filter((m) => D.ist[m] && D.ist[m].umsatz).sort((a, b) => a - b);

  D = lesen(PRE + JAHR, null) || (DEMO ? demo(JAHR) : leer());

  /* ---------- Auszug Bad / Heizung (Auftragsbestand, Angebote) ---------- */
  let AUSZUG = null;
  function auszugHolen(bereich) {
    return new Promise((res) => {
      const f = document.createElement("iframe");
      f.src = `../${bereich}/?auszug=1${DEMO ? "&demo=1" : ""}`; f.title = "Auszug " + bereich; f.tabIndex = -1;
      const fertig = (x) => { window.removeEventListener("message", hören); clearTimeout(t); f.remove(); res(x); };
      const hören = (e) => { if (e.origin === location.origin && e.data && e.data.typ === "bruell-auszug" && e.data.pfad.includes("/" + bereich + "/")) fertig(e.data.fehler ? null : e.data.daten); };
      const t = setTimeout(() => fertig(null), 20000);
      window.addEventListener("message", hören);
      $("#auszuege").appendChild(f);
    });
  }
  Promise.all(["bad", "heizung"].map(auszugHolen)).then(([bad, heizung]) => { AUSZUG = { bad: bad && bad.kennzahlen, heizung: heizung && heizung.kennzahlen }; if (seite() === "cockpit") zeichnen(); });

  /* ---------- Bausteine ---------- */
  const f = (pfad, wert, art = "zahl", extra = "") => art === "text"
    ? `<input class="eingabe" data-f="${pfad}" data-art="text" value="${esc(wert)}" ${extra}>`
    : art === "datum" ? `<input class="eingabe" type="date" data-f="${pfad}" data-art="text" value="${esc(wert)}" ${extra}>`
    : `<input class="eingabe bm-zahl" inputmode="decimal" data-f="${pfad}" value="${wert === "" || wert == null ? "" : esc(zahl(wert, 2))}" ${extra}>`;
  const ampel = (q, gut = 1, mittel = .9) => (q >= gut ? ["gruen", "✓", "im Plan"] : q >= mittel ? ["gelb", "!", "knapp"] : ["rot", "✕", "unter Plan"]);
  const ampelChip = (q, gut, mittel) => { const [c, i, t] = ampel(q, gut, mittel); return `<span class="bm-ampel ${c}"><i aria-hidden="true">${i}</i>${t}</span>`; };
  const TABS = [["cockpit", "Cockpit"], ["stundensatz", "Stundensatz"], ["planung", "Jahresplanung"], ["soll-ist", "Soll-Ist"]];
  const seite = () => (TABS.find(([id]) => "#" + id === location.hash) || TABS[0])[0];
  function kopf(titel, unter) {
    const jahre = [JAHR_JETZT - 1, JAHR_JETZT, JAHR_JETZT + 1];
    return `<header class="kopf"><div><p class="eyebrow">Betriebsmonitor · ${DEMO ? "Demo" : "vertraulich"}</p><h1>${titel}</h1>${unter ? `<p class="unter leise">${unter}</p>` : ""}</div>
      <div class="kopf-aktionen"><div class="seg" role="group" aria-label="Jahr">${jahre.map((j) => `<button class="seg-k${j === JAHR ? " an" : ""}" type="button" data-jahr="${j}">${j}</button>`).join("")}</div>
        <button class="btn still" type="button" id="bm-sichern" title="Stand als betrieb/daten-lokal.js sichern (für Tresor/anderen Rechner)">⬇ Sichern</button></div></header>
      <nav class="bm-tabs" aria-label="Betriebsmonitor">${TABS.map(([id, t]) => `<a href="#${id}"${id === seite() ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`;
  }

  /* ---------- Cockpit ---------- */
  function balken(plan) {
    const max = Math.max(1, ...plan.map((p) => p.umsatz), ...MON.map((_, m) => (D.ist[m + 1] || {}).umsatz || 0)) * 1.08;
    const B = 640, H = 200, u = 22, o = 10, L = 44, sp = (B - L) / 12, bw = Math.min(16, sp / 2 - 3);
    const y = (v) => o + (H - o - u) * (1 - v / max), stufen = [0, .25, .5, .75, 1].map((q) => max / 1.08 * q);
    const rund = (x, yy, w, h) => h <= 0 ? "" : `M${x},${H - u}V${yy + Math.min(4, h)}q0,-4 4,-4h${w - 8}q4,0 4,4V${H - u}Z`;
    return `<svg class="bm-chart" viewBox="0 0 ${B} ${H}" role="img" aria-label="Umsatz je Monat, Plan und Ist">
      ${stufen.map((v) => `<line x1="${L}" x2="${B}" y1="${y(v)}" y2="${y(v)}" class="gitter"/><text x="${L - 6}" y="${y(v) + 3}" class="achse rechts">${v ? zahl(v / 1000) + " T€" : ""}</text>`).join("")}
      ${plan.map((p, m) => {
        const x = L + m * sp + sp / 2, ist = (D.ist[m + 1] || {}).umsatz || 0, hp = H - u - y(p.umsatz), hi = H - u - y(ist);
        return `<g class="bm-mon"><title>${MONAT[m]}: Plan ${eur(p.umsatz)}${ist ? ` · Ist ${eur(ist)} (${pz(ist / p.umsatz * 100)})` : " · noch kein Ist"}</title>
          <rect x="${L + m * sp}" y="0" width="${sp}" height="${H}" class="treffer"/>
          <path d="${rund(x - bw - 1, y(p.umsatz), bw, hp)}" class="plan"/>${ist ? `<path d="${rund(x + 1, y(ist), bw, hi)}" class="ist"/>` : ""}
          <text x="${x}" y="${H - 6}" class="achse mitte">${MON[m]}</text></g>`;
      }).join("")}</svg>
      <p class="bm-legende"><span><i class="plan"></i>Plan</span><span><i class="ist"></i>Ist</span></p>`;
  }
  function cockpit() {
    const r = rechnen(), plan = planMonate(), im = istMonate(), bis = im.length ? im[im.length - 1] : 0;
    const pl = plan.slice(0, bis), ist = MON.slice(0, bis).map((_, m) => D.ist[m + 1] || {});
    const pU = summe(pl, "umsatz"), iU = summe(ist, "umsatz"), pE = summe(pl, erg), iE = summe(ist, erg);
    const iRoh = iU - summe(ist, "material"), pRoh = pU - summe(pl, "material");
    /* Stundensatz + Auslastung nur über Monate, für die schon Stunden eingetragen sind */
    const mH = ist.map((x, m) => [x, pl[m]]).filter(([x]) => x.stunden > 0), iH = summe(mH, ([x]) => x.stunden), pH = summe(mH, ([, p]) => p.stunden);
    const istSatz = iH ? summe(mH, ([x]) => (x.umsatz || 0) - (x.material || 0) * (1 + D.satz.aufschlag / 100)) / iH : 0;
    const k = Object.values(AUSZUG || {}).filter(Boolean), ks = (fd) => k.reduce((a, x) => a + (x[fd] || 0), 0);
    const bestand = ks("bestand"), reichweite = r.umsatz ? bestand / (r.umsatz / 12) : 0, quote = ks("fertigJahr") + ks("verloren") ? ks("fertigJahr") / (ks("fertigJahr") + ks("verloren")) * 100 : 0;
    const satzQ = r.ziel && D.satz.istSatz ? D.satz.istSatz / r.ziel : 0;
    const kachel = (titel, wert, unter, chip, href) => `<a class="kpi bm-kpi" href="${href || "#soll-ist"}"><span class="kpi-titel">${titel}</span><span class="kpi-zahl">${wert}</span><span class="kpi-unter">${unter}</span>${chip || ""}</a>`;
    /* Hinweise */
    const h = [];
    if (!r.stunden) h.push(["rot", "Im Stundensatz fehlen noch Mitarbeiter oder Wochenstunden.", "#stundensatz"]);
    else if (!r.personal) h.push(["gelb", "Bruttolöhne im Stundensatz eintragen – sonst fehlen die Personalkosten.", "#stundensatz"]);
    if (r.stunden && D.satz.istSatz && satzQ < 1) h.push(["rot", `Ihr Verrechnungssatz (${eur2(D.satz.istSatz)}) liegt ${eur2(r.ziel - D.satz.istSatz)} unter dem Zielstundensatz – das sind ${eur((r.ziel - D.satz.istSatz) * r.stunden)} im Jahr.`, "#stundensatz"]);
    const fehlt = JAHR === JAHR_JETZT ? HEUTE.getMonth() - (HEUTE.getDate() > 20 ? 0 : 1) : JAHR < JAHR_JETZT ? 12 : 0;
    if (fehlt > bis) h.push(["gelb", `Ist-Zahlen fehlen ab ${MONAT[bis]} – DATEV-Auswertung importieren.`, "#soll-ist"]);
    for (const [fd, t] of [["personal", "Personalkosten"], ["sonstige", "Sonstige Kosten"], ["material", "Material"]]) {
      const p = summe(pl, fd), i = summe(ist, fd);
      if (bis && p && i > p * 1.05) h.push(["gelb", `${t} bisher ${pz((i / p - 1) * 100)} über Plan (${eur(i - p)}).`, "#soll-ist"]);
    }
    return `${kopf(`Betriebsmonitor ${JAHR}`, bis ? `Stand: Ist bis ${MONAT[bis - 1]} ${JAHR}` : "Noch keine Ist-Zahlen")}
      <section class="bm-kpis">
        ${kachel("Zielstundensatz", r.ziel ? eur2(r.ziel) : "–", D.satz.istSatz ? `Ihr Satz: ${eur2(D.satz.istSatz)}` : "Verrechnungssatz eintragen", satzQ ? ampelChip(satzQ, 1, .95) : "", "#stundensatz")}
        ${kachel("Umsatz bis " + (bis ? MON[bis - 1] : "–"), bis ? eur(iU) : "–", bis ? `Plan ${eur(pU)} · ${pz(iU / pU * 100)}` : `Plan ${JAHR}: ${eur(r.umsatz)}`, bis ? ampelChip(iU / pU) : "")}
        ${kachel("Ergebnis bis " + (bis ? MON[bis - 1] : "–"), bis ? eur(iE) : "–", bis ? `Plan ${eur(pE)}` : `Ziel ${JAHR}: ${eur(r.ergebnis)}`, bis ? ampelChip(pE > 0 ? iE / pE : iE >= pE ? 1 : 0) : "")}
        ${kachel("Rohertrag", bis ? pz(iRoh / iU * 100) : "–", bis ? `${eur(iRoh)} · Plan ${pz(pRoh / pU * 100)}` : "Umsatz minus Material", bis ? ampelChip((iRoh / iU) / (pRoh / pU), .99, .95) : "")}
        ${kachel("Ist-Stundensatz", istSatz ? eur2(istSatz) : "–", iH ? `${zahl(iH)} Std. · Ziel ${eur2(r.ziel)}` : "Stunden im Soll-Ist eintragen", istSatz && r.ziel ? ampelChip(istSatz / r.ziel, 1, .95) : "")}
        ${kachel("Auslastung", iH && pH ? pz(iH / pH * 100) : "–", pH ? `verkaufte zu geplanten Stunden` : "", iH && pH ? ampelChip(iH / pH, .97, .9) : "")}
        ${kachel("Auftragsbestand", AUSZUG ? eur(bestand) : "…", AUSZUG ? `${ks("auftraege")} Aufträge · reicht ${zahl(reichweite, 1)} Monate` : "wird aus Bad & Heizung geladen", AUSZUG && r.umsatz ? ampelChip(reichweite / 3, 1, .67) : "", "../" + QS)}
        ${kachel("Offene Angebote", AUSZUG ? eur(ks("angeboteWert")) : "…", AUSZUG ? `${ks("angebote")} Angebote · Abschlussquote ${pz(quote)}` : "", "", "../" + QS)}
      </section>
      <div class="bm-zwei">
        <section class="panel"><h2 class="panel-titel">Umsatz je Monat <small>Plan und Ist ${JAHR}</small></h2><div class="panel-innen">${balken(plan)}</div></section>
        <section class="panel"><h2 class="panel-titel">Worauf achten <small>${h.length || "alles im Plan"}</small></h2><div class="panel-innen">
          ${h.length ? `<ul class="bm-hinweise">${h.map(([c, t, l]) => `<li class="${c}"><a href="${l}">${esc(t)}</a></li>`).join("")}</ul>` : `<p class="leise">Keine Auffälligkeiten.</p>`}
          ${k.length ? `<table class="bm-tab klein"><thead><tr><th></th><th>Umsatz ${JAHR}</th><th>Bestand</th><th>Angebote</th></tr></thead><tbody>
            ${Object.entries(AUSZUG).filter(([, x]) => x).map(([b, x]) => `<tr><td>${b === "bad" ? "Bad" : "Heizung"}</td><td>${eur(x.umsatzJahr)}</td><td>${eur(x.bestand)}</td><td>${eur(x.angeboteWert)}</td></tr>`).join("")}</tbody></table>
            <p class="leise klein-text">Umsatz hier = abgeschlossene Projekte in den Dashboards. Maßgeblich für Soll-Ist sind die DATEV-Zahlen.</p>` : ""}
        </div></section>
      </div>`;
  }

  /* ---------- Stundensatz ---------- */
  function ergebnis(r) {
    const s = D.satz, z = (t, w, cls = "") => `<div class="bm-z ${cls}"><span>${t}</span><b>${w}</b></div>`;
    return `<h2 class="panel-titel">Ergebnis</h2><div class="panel-innen">
      <div class="bm-gross"><small>Zielstundensatz netto</small><b>${r.stunden ? eur2(r.ziel) : "–"}</b><span class="leise">Selbstkosten je Stunde: ${r.stunden ? eur2(r.selbst) : "–"}</span></div>
      ${r.pers.some((p) => p.verkaufbar > 0 && !p.lohnJahr) ? `<p class="bm-beispiel">⚠ Bei ${r.pers.filter((p) => p.anteil > 0 && !p.lohnJahr).length} Personen fehlt der Bruttolohn – der Stundensatz ist so noch zu niedrig.</p>` : ""}
      ${z("Personalkosten (inkl. AG-Anteil)", eur(r.personal))}${z("Gemeinkosten inkl. Fahrzeuge", eur(r.gemein))}${z("= Kosten gesamt", eur(r.kosten), "summe")}
      ${z("+ Gewinnziel", eur(s.gewinn))}${z("− Beitrag aus Materialaufschlag", eur(r.materialDB))}${z("= muss über Stunden reinkommen", eur(r.ausStunden), "summe")}
      ${z("÷ verkaufbare Stunden", zahl(r.stunden) + " Std.")}
      ${z("Planumsatz " + JAHR, eur(r.umsatz), "summe")}
      ${r.stunden ? `<p class="bm-beispiel">Schon <b>5 € zu wenig</b> pro Stunde kosten <b>${eur(5 * r.stunden)}</b> Gewinn im Jahr.${s.istSatz ? ` Mit Ihrem Satz von ${eur2(s.istSatz)} ${s.istSatz >= r.ziel ? `bleiben <b>${eur((s.istSatz - r.ziel) * r.stunden)}</b> über dem Ziel.` : `fehlen <b>${eur((r.ziel - s.istSatz) * r.stunden)}</b> zum Gewinnziel.`}` : ""}</p>
        <p class="leise klein-text">Materialaufschlag +5 Punkte → Zielstundensatz ${eur2(r.ziel - (s.material || 0) * .05 / r.stunden)}</p>` : ""}
    </div>`;
  }
  function stundensatz() {
    const s = D.satz, r = rechnen(), fz = r.fz;
    const personen = r.pers.map((p, i) => `<tr${p.anteil < 1 ? ' class="anteilig"' : ""}>
        <td>${f(`satz.personen.${i}.name`, p.name, "text", 'aria-label="Name"')}<small class="leise">${esc(p.rolle && p.rolle !== p.name ? p.rolle : "")}</small></td>
        <td>${f(`satz.personen.${i}.wochenStd`, p.wochenStd, "zahl", 'aria-label="Wochenstunden"')}</td>
        <td>${f(`satz.personen.${i}.produktiv`, p.produktiv, "zahl", 'aria-label="produktiv in Prozent"')}</td>
        <td>${f(`satz.personen.${i}.lohnJahr`, p.lohnJahr, "zahl", 'aria-label="Bruttolohn im Jahr"')}</td>
        <td class="bm-daten">${f(`satz.personen.${i}.eintritt`, p.eintritt, "datum", 'aria-label="Eintritt" title="Eintritt"')}${f(`satz.personen.${i}.austritt`, p.austritt, "datum", 'aria-label="Austritt" title="Austritt"')}</td>
        <td class="r">${zahl(p.verkaufbar)}${p.anteil < 1 ? `<small class="leise">${pz(p.anteil * 100)} d. J.</small>` : ""}</td>
        <td><button class="btn klein still gefahr" type="button" data-weg="${i}" aria-label="${esc(p.name)} entfernen">✕</button></td></tr>`).join("");
    return `${kopf("Stundensatz-Check", "Was muss eine Stunde " + JAHR + " wirklich kosten?")}
      <div class="bm-satz">
        <div class="bm-links">
          <section class="panel"><h2 class="panel-titel">Mitarbeiter <small>${zahl(r.stunden)} verkaufbare Std. · ${r.arbeitstage} Arbeitstage</small></h2><div class="panel-innen">
            <div class="bm-scroll"><table class="bm-tab bm-pers"><thead><tr><th>Name</th><th>Std./ Woche</th><th>pro&shy;duktiv %</th><th>Brutto&shy;lohn / Jahr</th><th>Eintritt / Austritt</th><th class="r">verkaufbar</th><th></th></tr></thead>
              <tbody>${personen}</tbody></table></div>
            <div class="bm-aktion"><button class="btn klein" type="button" id="bm-person">+ Person</button><button class="btn klein still" type="button" id="bm-personal">Aus Personal neu laden</button></div>
            <p class="leise klein-text">Produktiv = Anteil der Anwesenheit, der beim Kunden abgerechnet wird. Ein- und Austritte im Jahr zählen anteilig. Bruttolöhne aus dem DATEV-Lohnjournal.</p>
            <div class="felder vier">
              <div class="feld"><label>Urlaubstage</label>${f("satz.tage.urlaub", s.tage.urlaub)}</div><div class="feld"><label>Feiertage (Mo–Fr)</label>${f("satz.tage.feiertage", s.tage.feiertage)}</div>
              <div class="feld"><label>Krankheitstage Ø</label>${f("satz.tage.krank", s.tage.krank)}</div><div class="feld"><label>Schulungstage</label>${f("satz.tage.schulung", s.tage.schulung)}</div>
              <div class="feld"><label>AG-Anteil Lohnneben&shy;kosten %</label>${f("satz.agAnteil", s.agAnteil)}</div>
            </div></div></section>
          <section class="panel"><h2 class="panel-titel">Gemeinkosten im Jahr <small>${eur(r.gemein)}</small></h2><div class="panel-innen">
            <table class="bm-tab"><tbody>${s.kosten.map((k, i) => `<tr><td>${f(`satz.kosten.${i}.bez`, k.bez, "text", 'aria-label="Kostenart"')}</td><td class="bm-betrag">${f(`satz.kosten.${i}.betrag`, k.betrag, "zahl", 'aria-label="Betrag"')}</td><td><button class="btn klein still gefahr" type="button" data-kweg="${i}" aria-label="entfernen">✕</button></td></tr>`).join("")}
              <tr class="bm-fz"><td><label class="bm-check"><input type="checkbox" data-f="satz.fahrzeugeAuto" ${s.fahrzeugeAuto ? "checked" : ""}> Fahrzeuge aus dem Fuhrpark</label>
                <small class="leise">${fz.n ? `${fz.n} Fahrzeuge: Leasing ${eur(fz.leasing)} · Versicherung ${eur(fz.vers)} · Steuer ${eur(fz.steuer)} · Tanken ${fz.tankMonate ? eur(fz.tanken) + ` (Ø ${fz.tankMonate} Mon. DKV)` : "–"}` : "Keine Fahrzeugdaten – Betrag von Hand"}</small></td>
                <td class="bm-betrag">${s.fahrzeugeAuto && fz.n ? `<b>${eur(fz.summe)}</b>` : f("satz.fahrzeugeBetrag", s.fahrzeugeBetrag)}</td><td></td></tr></tbody></table>
            <div class="bm-aktion"><button class="btn klein" type="button" id="bm-kosten">+ Kostenart</button></div>
            <p class="leise klein-text">Werte aus der BWA des Vorjahres (Steuerberater/DATEV). Fahrzeugreparaturen unter „Sonstige Kosten“.</p></div></section>
          <section class="panel"><h2 class="panel-titel">Material &amp; Ziel</h2><div class="panel-innen"><div class="felder">
            <div class="feld"><label>Materialeinsatz / Jahr (Einkauf)</label>${f("satz.material", s.material)}</div><div class="feld"><label>Materialaufschlag %</label>${f("satz.aufschlag", s.aufschlag)}</div>
            <div class="feld"><label>Gewinnziel / Jahr</label>${f("satz.gewinn", s.gewinn)}</div><div class="feld"><label>Ihr Verrechnungssatz heute (netto)</label>${f("satz.istSatz", s.istSatz)}</div>
          </div></div></section>
        </div>
        <aside class="panel bm-ergebnis" id="bm-ergebnis">${ergebnis(r)}</aside>
      </div>`;
  }

  /* ---------- Jahresplanung ---------- */
  const FELDER = [["umsatz", "Umsatz"], ["material", "Material"], ["personal", "Personal"], ["sonstige", "Sonstige Kosten"], ["stunden", "verk. Stunden"]];
  function planung() {
    const p = planMonate(), r = rechnen();
    return `${kopf("Jahresplanung " + JAHR, `Aus dem Stundensatz vorbelegt (Planumsatz ${eur(r.umsatz)}, nach Werktagen verteilt). Eigene Werte überschreiben die Vorbelegung.`)}
      <section class="panel"><div class="panel-innen bm-scroll"><table class="bm-tab bm-monate"><thead><tr><th></th>${MON.map((m) => `<th>${m}</th>`).join("")}<th class="r">Jahr</th></tr></thead><tbody>
        ${FELDER.map(([k, t]) => `<tr><th>${t}</th>${p.map((x, m) => `<td class="${D.plan && D.plan[m] && D.plan[m][k] != null && D.plan[m][k] !== "" ? "hand" : ""}">${f(`plan.${m}.${k}`, Math.round(x[k]), "zahl", `aria-label="${t} ${MONAT[m]}"`)}</td>`).join("")}<td class="r"><b>${k === "stunden" ? zahl(summe(p, k)) : eur(summe(p, k))}</b></td></tr>`).join("")}
        <tr class="summe"><th>Ergebnis</th>${p.map((x) => `<td class="r">${eur(erg(x))}</td>`).join("")}<td class="r"><b>${eur(summe(p, erg))}</b></td></tr>
      </tbody></table></div>
      <div class="bm-aktion"><button class="btn klein still" type="button" id="bm-plan-neu">Von Hand geänderte Werte zurücksetzen</button></div></section>`;
  }

  /* ---------- Soll-Ist ---------- */
  function sollIst() {
    const p = planMonate(), im = istMonate();
    const zeile = (m) => {
      const pl = p[m], i = D.ist[m + 1] || {}, da = !!i.umsatz;
      const abw = (fd, kosten) => { if (!da) return ""; const d = (fd === "erg" ? erg(i) - erg(pl) : (i[fd] || 0) - pl[fd]); const gut = kosten ? d <= 0 : d >= 0; return `<small class="${gut ? "plus" : "minus"}">${d >= 0 ? "+" : "−"}${fd === "stunden" ? zahl(Math.abs(d)) : eur(Math.abs(d))}</small>`; };
      return `<tr${da ? "" : ' class="ohne"'}><th>${MONAT[m]}${i.quelle ? `<small class="leise">${esc(i.quelle)}</small>` : ""}</th>
        ${FELDER.map(([k]) => `<td>${f(`ist.${m + 1}.${k}`, i[k] ?? "", "zahl", `placeholder="${zahl(pl[k])}" aria-label="${k} ${MONAT[m]} Ist"`)}${abw(k, k !== "umsatz" && k !== "stunden")}</td>`).join("")}
        <td class="r">${da ? eur(erg(i)) : `<span class="leise">${eur(erg(pl))}</span>`}${abw("erg")}</td></tr>`;
    };
    const bis = im.length ? im[im.length - 1] : 0, pl = p.slice(0, bis), ist = MON.slice(0, bis).map((_, m) => D.ist[m + 1] || {});
    return `${kopf("Soll-Ist " + JAHR, "Ist-Zahlen aus DATEV importieren oder von Hand eintragen. Grau = Plan.")}
      <div class="bm-aktion oben"><label class="btn jetzt">⬆ DATEV-Auswertung importieren (CSV)<input type="file" id="bm-datev" accept=".csv,.txt,text/csv" hidden></label>
        <span class="leise klein-text">BWA (Kurzfristige Erfolgsrechnung) oder Summen- und Saldenliste aus DATEV Unternehmen online / vom Steuerberater, als CSV.</span></div>
      <div id="bm-import"></div>
      <section class="panel"><div class="panel-innen bm-scroll"><table class="bm-tab bm-ist"><thead><tr><th>Monat</th>${FELDER.map(([, t]) => `<th>${t}</th>`).join("")}<th class="r">Ergebnis</th></tr></thead>
        <tbody>${MON.map((_, m) => zeile(m)).join("")}</tbody>
        ${bis ? `<tfoot><tr><th>Bis ${MON[bis - 1]}</th>${FELDER.map(([k]) => `<td class="r"><b>${k === "stunden" ? zahl(summe(ist, k)) : eur(summe(ist, k))}</b><small class="leise">Plan ${k === "stunden" ? zahl(summe(pl, k)) : eur(summe(pl, k))}</small></td>`).join("")}<td class="r"><b>${eur(summe(ist, erg))}</b><small class="leise">Plan ${eur(summe(pl, erg))}</small></td></tr></tfoot>` : ""}
      </table></div></section>
      <p class="leise klein-text">Stunden: verkaufte (abgerechnete) Stunden des Monats – später automatisch aus KWP.</p>`;
  }

  /* ---------- DATEV-Import (CSV: BWA oder SuSa) ---------- */
  const BWA = { umsatz: /^umsatzerl(ö|oe)se/, gesamtleistung: /^gesamtleistung/, material: /^(mat\.?\s*\/?\s*wareneinkauf|material|wareneinsatz|wareneinkauf)/, personal: /^personalkosten/, gesamtkosten: /^gesamtkosten/,
    einzeln: /^(raumkosten|betriebliche steuern|versicherungen|besondere kosten|fahrzeugkosten|werbe|kosten warenabgabe|abschreibungen|reparatur|sonstige kosten)/ };
  const SKR = { "03": [["umsatz", 8000, 8999], ["material", 3000, 3999], ["personal", 4100, 4199], ["sonstige", 4200, 4999]],
    "04": [["umsatz", 4000, 4999], ["material", 5000, 5999], ["personal", 6000, 6199], ["sonstige", 6200, 6999]] };
  let IMPORT = null;
  async function datevLesen(datei) {
    const buf = await datei.arrayBuffer(); let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
    const trenner = (text.match(/;/g) || []).length >= (text.match(/,/g) || []).length / 2 ? ";" : ",";
    const zeilen = text.split(/\r?\n/).map((z) => { const out = []; let cur = "", q = false; for (const ch of z) { if (ch === '"') q = !q; else if (ch === trenner && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; }).filter((z) => z.some((c) => c));
    const istZahl = (c) => /^-?[\d.]+(,\d+)?\s*[SH]?$/.test(c) && /\d/.test(c);
    /* Kopfzeile: letzte Zeile vor der ersten Datenzeile mit mehreren Texten */
    const ersteDaten = zeilen.findIndex((z) => z.filter(istZahl).length >= 1 && z.some((c) => /[a-zäöü]{3}/i.test(c)));
    const kopfZ = zeilen.slice(0, Math.max(0, ersteDaten)).reverse().find((z) => z.filter((c) => c && !istZahl(c)).length >= 2) || [];
    const daten = zeilen.slice(Math.max(0, ersteDaten));
    const susa = daten.filter((z) => /^\d{4}$/.test(z[0])).length > daten.length * .5;
    const spalten = [];
    const breite = Math.max(...daten.map((z) => z.length));
    for (let c = susa ? 1 : 0; c < breite; c++) if (daten.filter((z) => istZahl(z[c] || "") && !/^\d{4,}$/.test(z[c])).length >= daten.length * .3) spalten.push({ c, name: kopfZ[c] || `Spalte ${c + 1}` });
    /* Monatsspalte bevorzugen (nicht „kumuliert“, „%“ oder „Jan – Okt“), Monat aus der Überschrift erkennen */
    const kum = (n) => /kum|%|\s[-–]\s|bis|jahr/i.test(n);
    const wahl = spalten.find((s) => /monat/i.test(s.name) && !kum(s.name)) || spalten.find((s) => !kum(s.name)) || spalten[0];
    const mName = wahl && MON.findIndex((m) => new RegExp("\\b" + m.slice(0, 3), "i").test(wahl.name.replace("Mrz", "Mär")));
    const vorMonat = mName >= 0 ? mName + 1 : JAHR === JAHR_JETZT ? Math.max(1, HEUTE.getMonth()) : 12;
    IMPORT = { name: datei.name, daten, susa, spalten, spalte: wahl ? wahl.c : 0, skr: "03", monat: vorMonat, istZahl };
    importZeigen();
  }
  function importWerte() {
    const I = IMPORT, wert = (z) => { const c = String(z[I.spalte] || ""); return I.istZahl(c) ? num(c.replace(/\s*[SH]$/, "")) : 0; };
    const w = { umsatz: 0, material: 0, personal: 0, sonstige: 0 };
    if (I.susa) {
      for (const z of I.daten) { const k = +z[0]; for (const [fd, a, b] of SKR[I.skr]) if (k >= a && k <= b) w[fd] += Math.abs(wert(z)); }
    } else {
      const label = (z) => (z.find((c) => c && !I.istZahl(c) && !/^\d+$/.test(c)) || "").toLowerCase().trim();
      const erste = (re) => { const z = I.daten.find((x) => re.test(label(x))); return z ? Math.abs(wert(z)) : null; };
      w.umsatz = erste(BWA.umsatz) ?? erste(BWA.gesamtleistung) ?? 0;
      w.material = erste(BWA.material) ?? 0; w.personal = erste(BWA.personal) ?? 0;
      const gk = erste(BWA.gesamtkosten);
      w.sonstige = gk != null ? Math.max(0, gk - w.personal) : I.daten.filter((x) => BWA.einzeln.test(label(x))).reduce((a, x) => a + Math.abs(wert(x)), 0);
    }
    for (const k of Object.keys(w)) w[k] = Math.round(w[k]);
    return w;
  }
  function importZeigen() {
    const ziel = $("#bm-import"); if (!ziel) return;
    if (!IMPORT) { ziel.innerHTML = ""; return; }
    const I = IMPORT, w = importWerte();
    ziel.innerHTML = `<section class="panel bm-imp"><h2 class="panel-titel">Import: ${esc(I.name)} <small>${I.susa ? "Summen- und Saldenliste" : "BWA"} · ${I.daten.length} Zeilen</small></h2><div class="panel-innen">
      <div class="felder vier">
        <div class="feld"><label>Für Monat</label><select class="eingabe" id="bm-imp-monat">${MONAT.map((t, m) => `<option value="${m + 1}"${m + 1 === I.monat ? " selected" : ""}>${t} ${JAHR}</option>`).join("")}</select></div>
        <div class="feld"><label>Wert-Spalte</label><select class="eingabe" id="bm-imp-spalte">${I.spalten.map((s) => `<option value="${s.c}"${s.c === I.spalte ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
        ${I.susa ? `<div class="feld"><label>Kontenrahmen</label><select class="eingabe" id="bm-imp-skr"><option value="03"${I.skr === "03" ? " selected" : ""}>SKR 03</option><option value="04"${I.skr === "04" ? " selected" : ""}>SKR 04</option></select></div>` : ""}
      </div>
      <p class="leise klein-text">Die Spalte muss den <b>Monatswert</b> enthalten (nicht „kumuliert“). Bitte prüfen:</p>
      <div class="bm-z"><span>Umsatz</span><b>${eur(w.umsatz)}</b></div><div class="bm-z"><span>Material / Wareneinkauf</span><b>${eur(w.material)}</b></div>
      <div class="bm-z"><span>Personalkosten</span><b>${eur(w.personal)}</b></div><div class="bm-z"><span>Sonstige Kosten</span><b>${eur(w.sonstige)}</b></div>
      <div class="bm-z summe"><span>Ergebnis</span><b>${eur(erg(w))}</b></div>
      <div class="bm-aktion"><button class="btn voll" type="button" id="bm-imp-ok">Für ${MONAT[I.monat - 1]} übernehmen</button><button class="btn still" type="button" id="bm-imp-weg">Abbrechen</button></div>
    </div></section>`;
  }

  /* ---------- Zeichnen + Eingaben ---------- */
  function zeichnen() {
    const fokus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.f, y = scrollY;
    inhalt.innerHTML = { cockpit, stundensatz, planung, "soll-ist": sollIst }[seite()]();
    $$(".bm-tabs a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + seite() ? "page" : "false"));
    importZeigen();
    if (fokus) { const el = inhalt.querySelector(`[data-f="${fokus}"]`); if (el) { el.focus({ preventScroll: true }); if (el.select && el.type !== "checkbox" && el.type !== "date") el.select(); } }
    scrollTo(0, y);
  }
  function setzen(pfad, wert) {
    const t = pfad.split("."); let o = D;
    if (t[0] === "plan" && !D.plan) D.plan = {};
    for (let i = 0; i < t.length - 1; i++) { if (o[t[i]] == null) o[t[i]] = {}; o = o[t[i]]; }
    o[t[t.length - 1]] = wert;
  }
  const wertVon = (el) => el.type === "checkbox" ? el.checked : el.dataset.art === "text" ? el.value : el.value.trim() === "" ? (/^(plan|ist)\./.test(el.dataset.f) ? "" : 0) : num(el.value);
  inhalt.addEventListener("input", (e) => {
    const el = e.target; if (!el.dataset.f || el.type === "checkbox") return;
    setzen(el.dataset.f, wertVon(el)); speichern();
    const box = $("#bm-ergebnis"); if (box) box.innerHTML = ergebnis(rechnen());       // live
  });
  inhalt.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "bm-datev") { if (el.files[0]) datevLesen(el.files[0]).catch(() => toast("Datei konnte nicht gelesen werden.")); el.value = ""; return; }
    if (el.id === "bm-imp-monat") { IMPORT.monat = +el.value; return importZeigen(); }
    if (el.id === "bm-imp-spalte") { IMPORT.spalte = +el.value; return importZeigen(); }
    if (el.id === "bm-imp-skr") { IMPORT.skr = el.value; return importZeigen(); }
    if (!el.dataset.f) return;
    setzen(el.dataset.f, wertVon(el)); speichern();
    setTimeout(zeichnen);                                    // nach dem Fokuswechsel neu zeichnen, Fokus bleibt
  });
  inhalt.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.jahr) { JAHR = +b.dataset.jahr; D = lesen(PRE + JAHR, null) || jahrNeu(); speichern(); return zeichnen(); }
    if (b.id === "bm-sichern") return sichern();
    if (b.id === "bm-person") { D.satz.personen.push({ nr: "", name: "Neue Person", rolle: "", wochenStd: 40, produktiv: 85, lohnJahr: 0, eintritt: "", austritt: "" }); speichern(); return zeichnen(); }
    if (b.dataset.weg) { const p = D.satz.personen[+b.dataset.weg]; if (confirm(`${p.name} aus der Berechnung entfernen?`)) { D.satz.personen.splice(+b.dataset.weg, 1); speichern(); zeichnen(); } return; }
    if (b.id === "bm-personal") {
      const neu = personenAusPersonal(); if (!neu.length) return toast("Keine Mitarbeiter in Personal gefunden.");
      const alt = new Map(D.satz.personen.filter((p) => p.nr).map((p) => [p.nr, p]));
      D.satz.personen = [...neu.map((p) => alt.has(p.nr) ? { ...p, ...alt.get(p.nr), eintritt: p.eintritt || alt.get(p.nr).eintritt, austritt: p.austritt } : p), ...D.satz.personen.filter((p) => !p.nr)];
      speichern(); toast(`${neu.length} Mitarbeiter aus Personal übernommen – Löhne und Anteile bleiben.`); return zeichnen();
    }
    if (b.id === "bm-kosten") { D.satz.kosten.push({ bez: "Neue Kostenart", betrag: 0 }); speichern(); return zeichnen(); }
    if (b.dataset.kweg) { D.satz.kosten.splice(+b.dataset.kweg, 1); speichern(); return zeichnen(); }
    if (b.id === "bm-plan-neu") { if (confirm("Alle von Hand geänderten Planwerte zurücksetzen?")) { D.plan = null; speichern(); zeichnen(); } return; }
    if (b.id === "bm-imp-weg") { IMPORT = null; return importZeigen(); }
    if (b.id === "bm-imp-ok") {
      const m = IMPORT.monat, w = importWerte(), alt = D.ist[m] || {};
      if (alt.umsatz && !confirm(`Für ${MONAT[m - 1]} gibt es schon Ist-Zahlen. Überschreiben?`)) return;
      D.ist[m] = { ...alt, ...w, quelle: "DATEV " + IMPORT.name.slice(0, 30) };
      IMPORT = null; speichern(); toast(`${MONAT[m - 1]} übernommen.`); return zeichnen();
    }
  });
  /* Neues Jahr: Stundensatz-Grundlagen aus dem Vorjahr übernehmen */
  function jahrNeu() {
    if (DEMO) return demo(JAHR);
    const vj = lesen(PRE + (JAHR - 1), null), d = leer();
    if (vj) d.satz = JSON.parse(JSON.stringify(vj.satz));
    return d;
  }
  /* Sichern: alle Jahre als betrieb/daten-lokal.js (für den Tresor bzw. einen anderen Rechner) */
  function sichern() {
    const jahre = {}; for (const k of Object.keys(localStorage).filter((x) => x.startsWith(PRE))) jahre[k.slice(PRE.length)] = lesen(k, null);
    const blob = new Blob([`/* Betriebsmonitor – vertraulich, nur lokal (.gitignore). Online nur verschlüsselt: node werkzeuge/tresor.js */\nwindow.BM_DATEN = ${JSON.stringify({ stand: Date.now(), jahre })};\n`], { type: "text/javascript" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "daten-lokal.js"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Gesichert – Datei nach „Dashboard Gesamt/betrieb/“ legen.");
  }

  window.addEventListener("hashchange", () => { scrollTo(0, 0); zeichnen(); });
  zeichnen();
})();
