/* ==========================================================================
   Brüll Dashboard – Lohnabrechnung (Unterpunkt von Personal, nur Geschäftsführung)
   --------------------------------------------------------------------------
   Ablauf: Löhne-ZIP vom Steuerberater → Auszahlungsbeträge je Mitarbeiter → nach Firmenkonto
   (Sparkasse / Raiffeisenbank) aufgeteilt überweisen → Lohnzettel in die Personalkarte.
   Die Beträge trägt man vorerst von Hand ein; später füllt sie der Dienst „lohn-eingang“
   auf dem Mac mini aus der ZIP-Datei. Überweisung als SEPA-Sammelüberweisung (pain.001.001.09,
   Zweck SALA) zum Hochladen ins Online-Banking – die Freigabe passiert dort mit TAN.
   Speicher (nur dieser Browser, nie im Repo):
     lohn:konten          Firmenkonten { firma, sparkasse:{iban,bic}, raiba:{iban,bic} }
     lohn:zuordnung       Pers.-Nr. → "sparkasse" | "raiba" (überschreibt die automatische Zuordnung)
     lohn:<JJJJ-MM>       Pers.-Nr. → { betrag, ueberwiesen, datum }
   ========================================================================== */
(function () {
  "use strict";
  const inhalt = document.getElementById("lo-inhalt");
  if (!inhalt) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Speichern fehlgeschlagen – Browser-Speicher voll.", true); } };
  const QS = location.search.replace(/[?&]nr=\d+/, "").replace(/^&/, "?");
  const qs = (extra) => { const p = new URLSearchParams(QS); for (const [k, v] of Object.entries(extra || {})) p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };

  const BANKEN = [["sparkasse", "Sparkasse"], ["raiba", "Raiffeisenbank"]];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const heute = new Date();
  let monat = new URLSearchParams(location.search).get("monat") || heute.getFullYear() + "-" + String(heute.getMonth() + 1).padStart(2, "0");

  const euro = (n) => (+n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const zahl = (v) => { const t = String(v ?? "").trim().replace(/\s|€/g, ""); if (!t) return 0; return parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };
  const ibanSauber = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
  const ibanOk = (v) => {
    const i = ibanSauber(v); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
    const r = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
    let m = 0; for (const z of r) m = (m * 10 + +z) % 97; return m === 1;
  };
  const ibanKurz = (v) => { const i = ibanSauber(v); return i ? i.slice(0, 4) + " … " + i.slice(-4) : ""; };
  const monatText = (m) => { const [j, mo] = m.split("-"); return MONATE[+mo - 1] + " " + j; };
  function toast(t, fehler) { const el = $("#toast"); if (!el) return; el.textContent = t; el.classList.toggle("fehler", !!fehler); el.classList.add("an"); clearTimeout(toast.z); toast.z = setTimeout(() => el.classList.remove("an"), 2600); }

  /* ---------- Mitarbeiter aus den Personalkarten ---------- */
  function mitarbeiter() {
    const [j, mo] = monat.split("-").map(Number), monatsAnfang = new Date(j, mo - 1, 1), monatsEnde = new Date(j, mo, 0);
    const datum = (t) => { const m = String(t || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
    return Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
      .filter((x) => x.d && (x.d.vorname || x.d.nachname))
      .filter((x) => { const a = datum(x.d.austritt), e = datum(x.d.einstellung); return (!a || a >= monatsAnfang) && (!e || e <= monatsEnde); })
      .sort((a, b) => +a.nr - +b.nr);
  }
  /* Zahlende Bank: Feld „Lohn wird bezahlt von“ in der Personalkarte. Ist es leer, wird vorläufig
     nach der Bank des Mitarbeiters zugeordnet (Raiffeisen-/Volksbank → Raiffeisenbank, sonst Sparkasse). */
  const bankFest = (x) => x.d.lohn_bank || lesen("lohn:zuordnung", {})[x.nr] || "";
  function bankVon(x) {
    return bankFest(x) || (/raiff|raiba|volksbank|\bvr[ -]?bank|\bvr\b/i.test(x.d.bank || "") ? "raiba" : "sparkasse");
  }
  const name = (d) => ((d.vorname || "") + " " + (d.nachname || "")).trim();

  /* ---------- Seite ---------- */
  let zeichnen = function () {
    const konten = lesen("lohn:konten", {}), werte = lesen("lohn:" + monat, {}), ma = mitarbeiter();
    const zeile = (x) => {
      const w = werte[x.nr] || {}, iban = ibanSauber(x.d.iban);
      const hinweis = !iban ? '<small class="lo-warn">IBAN fehlt in der Personalkarte</small>' : !ibanOk(iban) ? '<small class="lo-warn">IBAN ungültig</small>' : `<small>${esc(ibanKurz(iban))}${x.d.bank ? " · " + esc(x.d.bank) : ""}</small>`;
      return `<tr class="${w.ueberwiesen ? "lo-erledigt" : ""}" data-nr="${x.nr}">
        <td><a href="karte.html${qs({ nr: x.nr })}"><b>${esc(name(x.d))}</b></a><small>Nr. ${esc(x.nr)}</small></td>
        <td>${hinweis}${bankFest(x) ? "" : `<small class="lo-warn"><a href="karte.html${qs({ nr: x.nr })}">Zahlende Bank nicht festgelegt – in der Personalkarte wählen</a></small>`}</td>
        <td class="r"><input class="eingabe lo-betrag" inputmode="decimal" value="${w.betrag ? esc((+w.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ""}" placeholder="0,00" aria-label="Auszahlungsbetrag ${esc(name(x.d))}">${w.quelle ? `<small>aus ${esc(w.quelle)}</small>` : ""}</td>
        <td class="lo-mitte"><label class="lo-haken"><input type="checkbox" class="lo-ueberwiesen"${w.ueberwiesen ? " checked" : ""}> <span>${w.ueberwiesen ? "überwiesen" + (w.datum ? `<small>${esc(w.datum)}</small>` : "") : "offen"}</span></label></td>
        <td class="lo-mitte">${(() => { let lz = []; try { lz = JSON.parse(x.d._lohnzettel || "[]"); } catch (e) { /* alt */ }
          return lz.some((z) => z.monat === monat) ? `<a class="lo-zettel da" href="karte.html${qs({ nr: x.nr })}#lohnzettel" title="Lohnzettel liegt in der Personalkarte">✓ da</a>` : `<a class="lo-zettel" href="karte.html${qs({ nr: x.nr })}#lohnzettel" title="Noch kein Lohnzettel – hier hinzufügen, später automatisch aus der Löhne-ZIP">📩</a>`; })()}</td></tr>`;
    };
    const block = ([k, t]) => {
      const l = ma.filter((x) => bankVon(x) === k), summe = l.reduce((s, x) => s + zahl((werte[x.nr] || {}).betrag), 0), offen = l.filter((x) => !(werte[x.nr] || {}).ueberwiesen).length;
      const kto = konten[k] || {};
      return `<section class="panel lo-bankblock">
        <h2 class="panel-titel">${t} <span class="zahl">${l.length}</span><small>${kto.iban ? "von " + esc(ibanKurz(kto.iban)) : "Firmenkonto noch nicht hinterlegt"}</small></h2>
        <div class="panel-innen">
          ${l.length ? `<div class="lo-scroll"><table class="lo-tab"><thead><tr><th>Mitarbeiter</th><th>Empfänger-Konto</th><th class="r">Auszahlung</th><th class="lo-mitte">Status</th><th class="lo-mitte">Lohnzettel</th></tr></thead>
            <tbody>${l.map(zeile).join("")}</tbody>
            <tfoot><tr><td colspan="2"><b>Summe</b> <small>${offen ? offen + " offen" : "alle überwiesen"}</small></td><td class="r"><b>${euro(summe)}</b></td><td colspan="2"></td></tr></tfoot></table></div>`
            : '<p class="leise">Keine Mitarbeiter für dieses Konto.</p>'}
          <div class="lo-aktion">
            <button class="btn jetzt" type="button" data-sepa="${k}"${l.length ? "" : " disabled"}>⬇ SEPA-Datei ${t}</button>
            <button class="btn" type="button" data-alle="${k}"${offen ? "" : " disabled"}>Alle als überwiesen markieren</button>
          </div>
        </div></section>`;
    };
    const alle = ma.map((x) => zahl((werte[x.nr] || {}).betrag)), gesamt = alle.reduce((a, b) => a + b, 0), mitBetrag = alle.filter(Boolean).length;
    const ueberwiesen = ma.filter((x) => (werte[x.nr] || {}).ueberwiesen).length, imp = lesen("lohn:import:" + monat, null);
    const zettel = ma.filter((x) => { try { return JSON.parse(x.d._lohnzettel || "[]").some((z) => z.monat === monat); } catch (e) { return false; } }).length;

    inhalt.innerHTML = `
      <header class="kopf"><div><p class="eyebrow"><a href="./${QS}">Personal</a> · vertraulich</p><h1>Lohnabrechnung</h1><p class="unter leise">${esc(monatText(monat))} · ${ma.length} Mitarbeiter</p></div>
        <div class="kopf-aktionen"><button class="btn still" type="button" id="lo-zurueck" aria-label="Vormonat">‹</button><input class="eingabe" type="month" id="lo-monat" value="${monat}" aria-label="Monat"><button class="btn still" type="button" id="lo-vor" aria-label="Folgemonat">›</button></div></header>

      <ol class="lo-schritte" aria-label="Ablauf">
        <li class="lo-schritt${imp ? " fertig" : ""}"><b>1 · Löhne-ZIP</b><small>vom Steuerberater, hier ablegen</small><span class="lo-status">${imp ? "eingelesen " + esc(imp.datum) : "noch nicht eingelesen"}</span></li>
        <li class="lo-schritt${mitBetrag ? " fertig" : ""}"><b>2 · Beträge</b><small>Auszahlung je Mitarbeiter</small><span class="lo-status">${mitBetrag} von ${ma.length}</span></li>
        <li class="lo-schritt${ma.length && ueberwiesen === ma.length ? " fertig" : ""}"><b>3 · Überweisen</b><small>je Konto als SEPA-Datei, Freigabe mit TAN</small><span class="lo-status">${ueberwiesen} von ${ma.length}</span></li>
        <li class="lo-schritt${ma.length && zettel === ma.length ? " fertig" : ""}"><b>4 · Lohnzettel</b><small>in der Personalkarte des Mitarbeiters</small><span class="lo-status">${zettel} von ${ma.length}</span></li>
      </ol>

      <section class="panel lo-import">
        <label class="lo-drop" id="lo-drop">📦 <span><b>Löhne-ZIP vom Steuerberater hier ablegen</b><small>Hineinziehen oder klicken. Die ZIP wird hier im Browser entpackt (Passwort wird abgefragt), Auszahlungsbeträge und Lohnzettel werden über Personalnummer, IBAN oder Name automatisch zugeordnet – ohne KI. Auch einzelne PDFs oder die SEPA-XML gehen.</small></span>
          <input type="file" id="lo-zip" accept=".zip,.xml,.pdf,application/zip,application/pdf,text/xml" multiple hidden></label>
        ${BERICHT ? BERICHT : ""}
      </section>

      <div class="kpis vier lo-kpis">
        <div class="kpi"><span class="kpi-titel">Auszahlung gesamt</span><span class="kpi-zahl klein">${euro(gesamt)}</span><span class="kpi-unter">${esc(monatText(monat))}</span></div>
        ${BANKEN.map(([k, t]) => { const s = ma.filter((x) => bankVon(x) === k).reduce((a, x) => a + zahl((werte[x.nr] || {}).betrag), 0); return `<div class="kpi"><span class="kpi-titel">${t}</span><span class="kpi-zahl klein">${euro(s)}</span><span class="kpi-unter">${ma.filter((x) => bankVon(x) === k).length} Überweisungen</span></div>`; }).join("")}
        <div class="kpi"><span class="kpi-titel">Überwiesen</span><span class="kpi-zahl klein">${ueberwiesen} / ${ma.length}</span><span class="kpi-unter">${ma.length - ueberwiesen} offen</span></div>
      </div>

      ${BANKEN.map(block).join("")}

      <details class="panel lo-konten"${konten.sparkasse && konten.raiba ? "" : " open"}>
        <summary class="panel-titel">Firmenkonten <small>von hier wird überwiesen – bleibt nur in diesem Browser</small></summary>
        <div class="panel-innen">
          <div class="felder drei">
            <div class="feld breit"><label for="lo-firma">Kontoinhaber (Auftraggeber)</label><input class="eingabe" id="lo-firma" value="${esc(konten.firma || "Brüll GmbH")}"></div>
            ${BANKEN.map(([k, t]) => `<div class="feld"><label for="lo-${k}-iban">IBAN ${t}</label><input class="eingabe lo-konto" id="lo-${k}-iban" data-k="${k}" data-f="iban" value="${esc((konten[k] || {}).iban || "")}" placeholder="DE.."></div>
              <div class="feld"><label for="lo-${k}-bic">BIC ${t}</label><input class="eingabe lo-konto" id="lo-${k}-bic" data-k="${k}" data-f="bic" value="${esc((konten[k] || {}).bic || "")}" placeholder="optional"></div><div class="feld"></div>`).join("")}
          </div>
          <p class="leise klein-text">Von welchem Konto ein Lohn überwiesen wird, steht in der Personalkarte unter „Lohn wird bezahlt von“. Fehlt die Angabe, wird vorläufig nach der Bank des Mitarbeiters zugeordnet (Raiffeisen-/Volksbank → Raiffeisenbank, sonst Sparkasse).</p>
        </div>
      </details>
      ${einstellungen()}`;
  };

  /* ---------- Einstellungen: wer darf Lohnzettel hochladen? (Geschäftsführung immer) ---------- */
  const TITEL = { planung: "Planung / Bearbeitung", monteur: "Monteur", mitarbeiter: "Mitarbeiter" };
  function einstellungen() {
    if (!window.pkZugang) return "";
    const l = window.pkZugang.alle().filter((k) => k.ebene !== "geschaeftsfuehrung" && k.ebene !== "partner");
    return `<details class="panel lo-konten lo-einst"><summary class="panel-titel">Einstellungen <small>Wer darf Lohnzettel hochladen?</small></summary>
      <div class="panel-innen">
        <p class="leise klein-text">Die Geschäftsführung darf immer. Freigegebene Personen sehen im Menü „Lohnzettel“ und können bei allen Mitarbeitern Lohnzettel hinzufügen – sonst nichts aus der Personalakte. Alle anderen können ihre eigenen Lohnzettel nur herunterladen.</p>
        ${l.length ? `<ul class="lo-rechte">${l.map((k) => `<li><label><input type="checkbox" class="lo-recht" data-email="${esc(k.email)}"${k.lohnzettel ? " checked" : ""}${k.aktiv === false ? " disabled" : ""}> <b>${esc(k.name || k.benutzer)}</b> <small>${esc(TITEL[k.ebene] || k.ebene)} · ${esc(k.benutzer)}${k.aktiv === false ? " · gesperrt" : ""}</small></label></li>`).join("")}</ul>`
          : '<p class="leise">Noch keine Zugänge. Zugänge legst du in der Personalkarte unter „Zugang zum Dashboard“ an.</p>'}
      </div></details>`;
  }

  /* ---------- Nur Lohnzettel (Konto mit Freigabe, nicht Geschäftsführung) ---------- */
  function zeichnenZettel() {
    const ma = mitarbeiter(), hat = (x) => { try { return JSON.parse(x.d._lohnzettel || "[]").some((z) => z.monat === monat); } catch (e) { return false; } };
    const n = ma.filter(hat).length;
    inhalt.innerHTML = `
      <header class="kopf"><div><p class="eyebrow">Personal · vertraulich</p><h1>Lohnzettel</h1><p class="unter leise">${esc(monatText(monat))} · ${n} von ${ma.length} hochgeladen</p></div>
        <div class="kopf-aktionen"><button class="btn still" type="button" id="lo-zurueck" aria-label="Vormonat">‹</button><input class="eingabe" type="month" id="lo-monat" value="${monat}" aria-label="Monat"><button class="btn still" type="button" id="lo-vor" aria-label="Folgemonat">›</button></div></header>
      <section class="panel"><div class="panel-innen" style="padding-top:12px"><div class="lo-scroll"><table class="lo-tab"><thead><tr><th>Mitarbeiter</th><th class="lo-mitte">Lohnzettel ${esc(monatText(monat))}</th><th></th></tr></thead>
        <tbody>${ma.map((x) => `<tr data-nr="${x.nr}"><td><b>${esc(name(x.d))}</b><small>Nr. ${esc(x.nr)}</small></td>
          <td class="lo-mitte">${hat(x) ? '<span class="lo-zettel da">✓ da</span>' : '<span class="lo-zettel">fehlt</span>'}</td>
          <td class="r"><a class="btn klein" href="karte.html${qs({ nr: x.nr, lz: 1 })}#lohnzettel">📁 Lohnzettel-Ordner</a></td></tr>`).join("")}</tbody></table></div></div></section>`;
  }
  if (window.LOHN_NUR_ZETTEL) zeichnen = zeichnenZettel;

  /* ---------- Löhne-ZIP vom Steuerberater einlesen (fest programmiert, keine KI) ----------
     ZIP entpacken (zip.js, auch mit Passwort), darin:
       • SEPA-XML (pain.001): Betrag je Empfänger → Zuordnung über IBAN, sonst Name
       • PDF-Lohnzettel (pdf.js, auch mit Passwort): Personalnummer + „Auszahlungsbetrag“ aus dem Text,
         sonst Name → Betrag (falls keine XML) und Lohnzettel in die Personalkarte (Reiter Lohnzettel)
     Die Suchmuster sind allgemein gehalten und müssen mit einer echten Datei des Steuerberaters geprüft werden.
     Das Passwort bleibt nur im Speicher dieser Seite (wird nicht gespeichert). */
  let BERICHT = "", PW = null;
  const VENDOR = "../gesamt/vendor/";
  const skript = (src) => new Promise((ok, f) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => f(new Error("Konnte " + src + " nicht laden")); document.head.appendChild(el); });
  async function bibliotheken() {
    if (!window.zip) await skript(VENDOR + "zip.min.js");
    window.zip.configure({ useWebWorkers: false });
    if (!window.pdfjsLib) { await skript(VENDOR + "pdf.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + "pdf.worker.min.js"; }
  }
  function passwort(frage) {
    if (PW !== null && !frage) return PW;
    const p = prompt(frage || "Passwort für die Dateien vom Steuerberater:", "");
    if (p === null) throw new Error("Passwort-Eingabe abgebrochen");
    return (PW = p);
  }
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/\s+/g, " ").trim();
  const BETRAG = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/;
  async function entpacken(datei, tiefe = 0) {
    const r = new window.zip.ZipReader(new window.zip.BlobReader(datei)), raus = [];
    for (const e of await r.getEntries()) {
      if (e.directory) continue;
      let blob = null;
      for (let versuch = 0; versuch < 3 && !blob; versuch++) {
        try { blob = await e.getData(new window.zip.BlobWriter(), e.encrypted ? { password: passwort(versuch ? "Passwort falsch – bitte nochmal eingeben:" : "") } : {}); }
        catch (err) { if (!e.encrypted || !/password/i.test(err.message || "")) throw err; PW = null; }
      }
      if (!blob) throw new Error("ZIP-Passwort falsch");
      const f = new File([blob], e.filename.split("/").pop());
      if (/\.zip$/i.test(f.name) && tiefe < 2) raus.push(...await entpacken(f, tiefe + 1)); else raus.push(f);
    }
    await r.close();
    return raus;
  }
  async function pdfText(datei) {
    let doc = null, frage = "";
    for (let versuch = 0; versuch < 4 && !doc; versuch++) {
      try { doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await datei.arrayBuffer()), password: frage || PW !== null ? passwort(frage) : undefined }).promise; }
      catch (err) {
        if (err && err.name === "PasswordException") { frage = err.code === 2 ? `Passwort für „${datei.name}“ falsch – bitte nochmal:` : `„${datei.name}“ ist geschützt – Passwort:`; PW = null; continue; }
        throw err;
      }
    }
    if (!doc) throw new Error("PDF-Passwort falsch");
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); text += c.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n"; }
    return text;
  }
  const MON_NAMEN = ["januar", "februar", "marz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
  function monatAus(t) {
    const n = norm(t).replace(/maerz/g, "marz");
    let m = n.match(new RegExp("(" + MON_NAMEN.join("|") + ")\\s*(20\\d\\d)"));
    if (m) return m[2] + "-" + String(MON_NAMEN.indexOf(m[1]) + 1).padStart(2, "0");
    m = n.match(/(?:abrechnungs(?:monat|zeitraum)|monat|zeitraum)[^\d]{0,25}(0?[1-9]|1[0-2])[./-](20\d\d)/);
    if (m) return m[2] + "-" + String(+m[1]).padStart(2, "0");
    m = n.match(/(?:^|\D)(20\d\d)[-_.](0[1-9]|1[0-2])(?!\d)/) || null;
    if (m) return m[1] + "-" + m[2];
    m = n.match(/(?:^|\D)(0[1-9]|1[0-2])[-_.](20\d\d)(?!\d)/);
    return m ? m[2] + "-" + m[1] : "";
  }
  function lohnzettelAuslesen(text) {
    const persNr = (text.match(/pers(?:onal)?(?:\.|al)?\s*-?\s*(?:nr|nummer)\.?\s*:?\s*(\d{1,6})/i) || [])[1] || "";
    const muster = [/auszahlungsbetrag[^\d-]{0,40}(BETRAG)/i, /auszahlung[^\d-]{0,40}(BETRAG)/i, /(?:überweisung|ueberweisung)(?:sbetrag)?[^\d-]{0,40}(BETRAG)/i];
    let betrag = 0;
    for (const re of muster) { const m = text.match(new RegExp(re.source.replace("BETRAG", BETRAG.source), "i")); if (m) { betrag = zahl(m[1]); break; } }
    return { persNr: persNr ? String(+persNr) : "", betrag, monat: monatAus(text) };
  }
  function sepaAuslesen(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml"), tag = (el, n) => el.getElementsByTagNameNS("*", n);
    return [...tag(doc, "CdtTrfTxInf")].map((tx) => {
      const nm = tag(tx, "Cdtr")[0], ib = tag(tx, "CdtrAcct")[0];
      return { name: nm && tag(nm, "Nm")[0] ? tag(nm, "Nm")[0].textContent : "", iban: ib && tag(ib, "IBAN")[0] ? ibanSauber(tag(ib, "IBAN")[0].textContent) : "", betrag: parseFloat((tag(tx, "InstdAmt")[0] || {}).textContent || "0") || 0 };
    });
  }
  /* Alle Mitarbeiter (auch ausgeschiedene) zum Zuordnen */
  const alleMa = () => Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) })).filter((x) => x.d && (x.d.vorname || x.d.nachname));
  const sepaName = (t) => norm(t).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  function perName(l, text) {
    const t = sepaName(text), treffer = l.filter((x) => x.d.nachname && t.includes(sepaName(x.d.nachname)) && (!x.d.vorname || t.includes(sepaName(x.d.vorname))));
    return treffer.length === 1 ? treffer[0] : null;
  }
  /* Lohnzettel in die Personalkarte legen (gleicher Speicher wie personal/karte.html) */
  async function zettelAblegen(nr, m, datei) {
    await window.BruellDateien.put(nr + ":lz-" + m, datei);                  // Browser + auf dem Mac mini der Dateispeicher
    const d = lesen("pk_" + nr, {}); let lz = []; try { lz = JSON.parse(d._lohnzettel || "[]"); } catch (e) { /* alt */ }
    d._lohnzettel = JSON.stringify(lz.filter((x) => x.monat !== m).concat([{ monat: m, name: datei.name, groesse: datei.size, datum: new Date().toLocaleDateString("de-DE") }]));
    schreiben("pk_" + nr, d);
  }
  async function importieren(dateien) {
    BERICHT = '<p class="leise lo-bericht">Wird eingelesen …</p>'; zeichnen();
    try {
      await bibliotheken();
      let liste = [];
      for (const f of dateien) { if (/\.zip$/i.test(f.name)) liste.push(...await entpacken(f)); else liste.push(f); }
      const l = alleMa(), zeilen = [], pdfs = [], xmlBetraege = {};
      for (const f of liste) {
        if (/\.xml$/i.test(f.name)) {
          const tx = sepaAuslesen(await f.text());
          if (!tx.length) { zeilen.push({ datei: f.name, hinweis: "XML ohne Überweisungen – übersprungen" }); continue; }
          for (const t of tx) {
            const x = l.find((m) => t.iban && ibanSauber(m.d.iban) === t.iban) || perName(l, t.name);
            if (x) xmlBetraege[x.nr] = (xmlBetraege[x.nr] || 0) + t.betrag;
            zeilen.push({ datei: f.name, nr: x && x.nr, name: x ? name(x.d) : t.name, betrag: t.betrag, hinweis: x ? (t.iban && ibanSauber(x.d.iban) === t.iban ? "über IBAN" : "über Name") : "kein Mitarbeiter mit dieser IBAN / diesem Namen" });
          }
        } else if (/\.pdf$/i.test(f.name)) {
          const text = await pdfText(f), info = lohnzettelAuslesen(text);
          const x = (info.persNr && l.find((m) => m.nr === info.persNr)) || perName(l, text);
          pdfs.push({ f, x, info });
        } else zeilen.push({ datei: f.name, hinweis: "unbekannter Dateityp – übersprungen" });
      }
      /* Monat: aus den Lohnzetteln, sonst der gewählte */
      const gefunden = pdfs.map((p) => p.info.monat).filter(Boolean), haeufig = gefunden.sort((a, b) => gefunden.filter((v) => v === b).length - gefunden.filter((v) => v === a).length)[0];
      if (haeufig && haeufig !== monat && confirm(`Die Lohnzettel sind für ${monatText(haeufig)}. Dorthin übernehmen?\n(Abbrechen = in ${monatText(monat)} übernehmen)`)) monat = haeufig;
      const w = lesen("lohn:" + monat, {});
      for (const p of pdfs) {
        if (p.x) await zettelAblegen(p.x.nr, monat, p.f);
        zeilen.push({ datei: p.f.name, nr: p.x && p.x.nr, name: p.x ? name(p.x.d) : "", betrag: p.info.betrag || null, zettel: !!p.x,
          hinweis: !p.x ? "kein Mitarbeiter gefunden (Personalnummer/Name nicht erkannt)" : (p.info.persNr ? "über Personalnummer" : "über Name") + (p.info.betrag ? "" : " · Betrag nicht erkannt"),
          warn: p.x && p.info.betrag && xmlBetraege[p.x.nr] !== undefined && Math.abs(xmlBetraege[p.x.nr] - p.info.betrag) > 0.004 ? `⚠ weicht von der SEPA-XML ab (${euro(xmlBetraege[p.x.nr])}) – bitte prüfen` : "" });
        if (p.x && p.info.betrag && xmlBetraege[p.x.nr] === undefined) w[p.x.nr] = { ...(w[p.x.nr] || {}), betrag: p.info.betrag.toFixed(2), quelle: "Lohnzettel" };
      }
      for (const [nr, b] of Object.entries(xmlBetraege)) w[nr] = { ...(w[nr] || {}), betrag: b.toFixed(2), quelle: "SEPA-XML" };
      schreiben("lohn:" + monat, w);
      const ok = zeilen.filter((z) => z.nr).length, abw = zeilen.filter((z) => z.warn).length;
      schreiben("lohn:import:" + monat, { datum: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }), dateien: liste.length, zugeordnet: ok });
      BERICHT = `<div class="lo-bericht"><p><b>${liste.length} Datei(en) eingelesen · ${ok} von ${zeilen.length} Einträgen zugeordnet${zeilen.length - ok ? ` · <span class="lo-warn">${zeilen.length - ok} nicht zugeordnet</span>` : ""}${abw ? ` · <span class="lo-warn">${abw} Betrag weicht ab</span>` : ""}</b> – ${esc(monatText(monat))}</p>
        <div class="lo-scroll"><table class="lo-tab"><thead><tr><th>Datei</th><th>Mitarbeiter</th><th class="r">Betrag</th><th class="lo-mitte">Lohnzettel</th><th>Zuordnung</th></tr></thead><tbody>
        ${zeilen.map((z) => `<tr class="${z.nr ? "" : "lo-fehlt"}"><td><small>${esc(z.datei)}</small></td><td>${z.nr ? `<b>${esc(z.name)}</b><small>Nr. ${esc(z.nr)}</small>` : esc(z.name || "–")}</td><td class="r">${z.betrag ? euro(z.betrag) : "–"}</td><td class="lo-mitte">${z.zettel ? "✓" : "–"}</td><td><small>${esc(z.hinweis || "")}</small>${z.warn ? `<small class="lo-warn">${esc(z.warn)}</small>` : ""}</td></tr>`).join("")}
        </tbody></table></div><button class="btn klein still" type="button" id="lo-bericht-zu">Bericht schließen</button></div>`;
    } catch (err) {
      BERICHT = `<p class="lo-bericht lo-warn">Einlesen fehlgeschlagen: ${esc(err.message || err)}</p>`;
    }
    zeichnen();
  }

  /* ---------- SEPA-Sammelüberweisung (pain.001.001.09, Gehalt) ---------- */
  const sepaText = (t, max) => String(t || "").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "+")
    .replace(/[^A-Za-z0-9 \/\-?:().,'+]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  function sepa(k) {
    const konten = lesen("lohn:konten", {}), kto = konten[k] || {}, werte = lesen("lohn:" + monat, {}), t = BANKEN.find((b) => b[0] === k)[1];
    if (!ibanOk(kto.iban)) { toast(`Bitte zuerst die IBAN des Firmenkontos ${t} unten eintragen.`, true); $(".lo-konten").open = true; return; }
    const offen = mitarbeiter().filter((x) => bankVon(x) === k && !(werte[x.nr] || {}).ueberwiesen);
    const l = offen.filter((x) => zahl((werte[x.nr] || {}).betrag) > 0), ohne = offen.filter((x) => !(zahl((werte[x.nr] || {}).betrag) > 0));
    const fehlt = l.filter((x) => !ibanOk(x.d.iban));
    if (fehlt.length) { toast(`IBAN fehlt oder ist ungültig: ${fehlt.map((x) => name(x.d)).join(", ")} – bitte in der Personalkarte ergänzen.`, true); return; }
    if (!l.length) { toast("Keine offenen Überweisungen mit Betrag für " + t + "."); return; }
    if (ohne.length && !confirm(`Ohne Betrag – werden NICHT überwiesen:\n${ohne.map((x) => "• " + name(x.d)).join("\n")}\n\nSEPA-Datei nur für ${l.length} Mitarbeiter erstellen?`)) return;
    const jetzt = new Date(), id = "LOHN-" + monat.replace("-", "") + "-" + k.toUpperCase().slice(0, 4) + "-" + jetzt.getTime().toString(36).toUpperCase();
    const summe = l.reduce((s, x) => s + Math.round(zahl(werte[x.nr].betrag) * 100), 0) / 100, betrag = (n) => n.toFixed(2);
    const ausf = (() => { const d = new Date(jetzt); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
    const [, mo] = monat.split("-"), zweck = `Lohn/Gehalt ${mo}/${monat.slice(0, 4)}`;
    const agent = (bic) => bic ? `<FinInstnId><BICFI>${esc(ibanSauber(bic))}</BICFI></FinInstnId>` : "<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<CstmrCdtTrfInitn>
<GrpHdr><MsgId>${id}</MsgId><CreDtTm>${jetzt.toISOString().slice(0, 19)}</CreDtTm><NbOfTxs>${l.length}</NbOfTxs><CtrlSum>${betrag(summe)}</CtrlSum><InitgPty><Nm>${esc(sepaText(konten.firma || "Bruell GmbH", 70))}</Nm></InitgPty></GrpHdr>
<PmtInf><PmtInfId>${id}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${l.length}</NbOfTxs><CtrlSum>${betrag(summe)}</CtrlSum>
<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp></PmtTpInf>
<ReqdExctnDt><Dt>${ausf}</Dt></ReqdExctnDt>
<Dbtr><Nm>${esc(sepaText(konten.firma || "Bruell GmbH", 70))}</Nm></Dbtr><DbtrAcct><Id><IBAN>${ibanSauber(kto.iban)}</IBAN></Id></DbtrAcct><DbtrAgt>${agent(kto.bic)}</DbtrAgt><ChrgBr>SLEV</ChrgBr>
${l.map((x, i) => `<CdtTrfTxInf><PmtId><EndToEndId>${id.slice(0, 28)}-${i + 1}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${betrag(zahl(werte[x.nr].betrag))}</InstdAmt></Amt>${x.d.bic ? `<CdtrAgt>${agent(x.d.bic)}</CdtrAgt>` : ""}<Cdtr><Nm>${esc(sepaText(name(x.d), 70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${ibanSauber(x.d.iban)}</IBAN></Id></CdtrAcct><Purp><Cd>SALA</Cd></Purp><RmtInf><Ustrd>${esc(sepaText(zweck + " Pers.-Nr. " + x.nr, 140))}</Ustrd></RmtInf></CdtTrfTxInf>`).join("\n")}
</PmtInf>
</CstmrCdtTrfInitn>
</Document>
`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
    a.download = `Loehne ${monat} ${t}.xml`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast(`SEPA-Datei ${t}: ${l.length} Überweisungen, ${euro(summe)}. Im Online-Banking hochladen und mit TAN freigeben.`);
  }

  /* Neu zeichnen, ohne dass der Cursor beim Durchtippen der Beträge (Tab) verloren geht */
  function neuMitFokus() {
    const a = document.activeElement, tr = a && a.closest && a.closest("tr[data-nr]"), cls = a && a.classList && [...a.classList].find((c) => c.startsWith("lo-"));
    zeichnen();
    const neu = tr && cls && inhalt.querySelector(`tr[data-nr="${tr.dataset.nr}"] .${cls}`);
    if (neu) { neu.focus(); if (neu.select) neu.select(); }
  }

  /* ---------- Eingaben ---------- */
  function wert(nr, aenderung) {
    const w = lesen("lohn:" + monat, {}); w[nr] = { ...(w[nr] || {}), ...aenderung }; schreiben("lohn:" + monat, w);
  }
  inhalt.addEventListener("dragover", (e) => { const d = e.target.closest("#lo-drop"); if (d) { e.preventDefault(); d.classList.add("ziehen"); } });
  inhalt.addEventListener("dragleave", (e) => { const d = e.target.closest("#lo-drop"); if (d) d.classList.remove("ziehen"); });
  inhalt.addEventListener("drop", (e) => { const d = e.target.closest("#lo-drop"); if (!d) return; e.preventDefault(); d.classList.remove("ziehen"); if (e.dataTransfer.files.length) importieren([...e.dataTransfer.files]); });
  inhalt.addEventListener("change", (e) => {
    const t = e.target, tr = t.closest("tr[data-nr]"), nr = tr && tr.dataset.nr;
    if (t.id === "lo-zip") { const f = [...t.files]; t.value = ""; if (f.length) importieren(f); return; }
    if (t.id === "lo-monat" && t.value) { monat = t.value; return zeichnen(); }
    if (t.classList.contains("lo-betrag")) { const z = zahl(t.value); wert(nr, { betrag: z ? z.toFixed(2) : "", quelle: "" }); return setTimeout(neuMitFokus); }
    if (t.classList.contains("lo-ueberwiesen")) { wert(nr, { ueberwiesen: t.checked, datum: t.checked ? new Date().toLocaleDateString("de-DE") : "" }); return zeichnen(); }
    if (t.classList.contains("lo-recht") && window.pkZugang) { Promise.resolve(window.pkZugang.lohnzettel(t.dataset.email, t.checked)).catch((e) => alert("Freigabe konnte nicht gespeichert werden: " + (e.message || e))); toast(t.checked ? "Freigegeben: darf Lohnzettel hochladen" : "Freigabe entfernt"); return; }
    if (t.classList.contains("lo-konto") || t.id === "lo-firma") {
      const k = lesen("lohn:konten", {});
      if (t.id === "lo-firma") k.firma = t.value.trim(); else { k[t.dataset.k] = { ...(k[t.dataset.k] || {}), [t.dataset.f]: t.dataset.f === "iban" ? ibanSauber(t.value) : t.value.trim() }; }
      if (t.dataset.f === "iban" && t.value && !ibanOk(t.value)) toast("Diese IBAN ist ungültig – bitte prüfen.", true);
      schreiben("lohn:konten", k); return zeichnen();
    }
  });
  inhalt.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "lo-zurueck" || b.id === "lo-vor") { const [j, mo] = monat.split("-").map(Number), d = new Date(j, mo - 1 + (b.id === "lo-vor" ? 1 : -1), 1); monat = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); return zeichnen(); }
    if (b.dataset.sepa) return sepa(b.dataset.sepa);
    if (b.id === "lo-bericht-zu") { BERICHT = ""; return zeichnen(); }
    if (b.dataset.alle) {
      const t = BANKEN.find((x) => x[0] === b.dataset.alle)[1];
      if (!confirm(`Alle Löhne über ${t} für ${monatText(monat)} als überwiesen markieren?`)) return;
      const w = lesen("lohn:" + monat, {}), d = new Date().toLocaleDateString("de-DE");
      mitarbeiter().filter((x) => bankVon(x) === b.dataset.alle).forEach((x) => { w[x.nr] = { ...(w[x.nr] || {}), ueberwiesen: true, datum: (w[x.nr] || {}).datum || d }; });
      schreiben("lohn:" + monat, w); zeichnen();
    }
  });

  zeichnen();
})();
