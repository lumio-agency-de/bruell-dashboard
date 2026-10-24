/* Digitale Formulare: Darstellung, Pflichtprüfung, Druckfassung.
   Die Definitionen stehen in einstellungen/formulare.js. */

(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BREITE = { halb: 6, drittel: 4, viertel: 3 };
  const ANREDEN = ["Herr", "Frau", "Herr und Frau", "Familie"];

  const def = (id) => window.FORMULARE[id];
  const werteVon = (p, id) => ((p.formulare || {})[id] || {}).werte || {};

  function wert(p, f, w) {
    if (f.typ === "kunde") return (p.kunde || {})[f.feld] || "";
    return w[f.id];
  }

  function sichtbar(f, w, p) {
    if (!f.wenn) return true;
    if (f.wenn.formular) {
      const fremd = werteVon(p, f.wenn.formular);
      if (!Object.keys(fremd).length || fremd[f.wenn.feld] === undefined || fremd[f.wenn.feld] === "") return true; // noch nicht ausgefüllt → anzeigen
      const v = fremd[f.wenn.feld];
      return Array.isArray(v) ? v.includes(f.wenn.wert) : v === f.wenn.wert;
    }
    const ref = def.aktuell && def.aktuell.felder.find((x) => x.id === f.wenn.feld);
    const v = ref ? wert(p, ref, w) : w[f.wenn.feld];
    return Array.isArray(v) ? v.includes(f.wenn.wert) : v === f.wenn.wert;
  }

  /* „Wer“-Auswahl: eigene Monteure oder externe Partner */
  const EIGEN = "eigen";
  let firmaCache = null;
  const werName = (id, firma) => {
    const fa = firma || firmaCache || window.FIRMA;
    if (!id) return "";
    if (id === EIGEN) return `${fa.kurzname || fa.name} (eigene Monteure)`;
    const pa = (fa.partner || []).find((x) => x.id === id);
    return pa ? pa.firma : id;
  };
  const quellWert = (f, p) => { const [fid, feld] = f.quelle.split("."); return werteVon(p, fid)[feld]; };

  /* Regler: Zahl aus dem gespeicherten Wert (alte Angaben wie „ca. 15.000 €“ werden übernommen) */
  function reglerZahl(f, v) {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.min(f.max, Math.max(f.min, n)) : null;
  }
  const reglerText = (f, n) => `${Number(n).toLocaleString("de-DE")}${f.einheit ? " " + f.einheit : ""}`;
  const katName = (k) => ((window.KATEGORIEN || []).find((x) => x.id === k) || { titel: k }).titel;
  function gefuellt(f, v, p, dateien) {
    switch (f.typ) {
      case "abschnitt": case "untertitel": return true;
      case "wer": return f.quelle ? true : !!v;
      case "mehrfach": return Array.isArray(v) && v.length > 0;
      case "dateien": return dateien.filter((d) => d.kategorie === f.kategorie || (f.auchAus || []).includes(d.kategorie)).length > 0;
      case "tabelle": {
        if (!Array.isArray(v)) return false;
        if (f.zeilen && f.alleZeilen) return f.zeilen.every((_, i) => v[i] && v[i][f.alleZeilen] !== undefined && String(v[i][f.alleZeilen]).trim() !== "");
        if (f.zeilen) return v.some((r) => r && Object.values(r).some((x) => x !== "" && x != null && x !== false));
        return v.length > 0;
      }
      case "checkliste": {
        const o = v || {};
        return f.punkte.filter((pt) => !pt.optional).every((pt) => o[pt.id] && o[pt.id].s);
      }
      default: return v !== undefined && v !== null && String(v).trim() !== "";
    }
  }

  /* Status eines Formulars: wie viele Pflichtfelder sind erfüllt? */
  /* Feste Zeilen + Kopien („Waschtisch 1/2 …“) + freie eigene Zeilen in Anzeige-Reihenfolge */
  function tabellenZeilen(f, rows) {
    const fest = f.zeilen.length, out = [];
    f.zeilen.forEach((z, i) => {
      const kopien = rows.map((r, k) => ({ r, k })).filter((x) => x.k >= fest && x.r && x.r._nach === i);
      out.push({ label: kopien.length ? `${z} 1` : z, r: rows[i] || {}, i, basis: i });
      kopien.forEach((x, n) => out.push({ label: x.r._label || `${z} ${n + 2}`, kopie: true, r: x.r, i: x.k, basis: i }));
    });
    rows.forEach((r, k) => { if (k >= fest && r && r._nach === undefined) out.push({ eigen: true, r, i: k }); });
    return out;
  }

  function status(id, p, dateien = []) {
    const d = def(id); def.aktuell = d;
    const w = werteVon(p, id);
    const pflicht = d.felder.filter((f) => f.pflicht && sichtbar(f, w, p));
    const fehlend = pflicht.filter((f) => !gefuellt(f, f.typ === "kunde" ? wert(p, f, w) : w[f.id], p, dateien));
    let extra = true;
    if (d.erledigtWenn === "alleHaken") {
      const t = d.felder.find((f) => f.typ === "tabelle");
      const rows = Array.isArray(w[t.id]) ? w[t.id] : [];
      extra = rows.every((r) => r.erledigt);
      if (!extra) fehlend.push({ label: `${rows.filter((r) => !r.erledigt).length} offene Restarbeiten` });
    }
    const begonnen = Object.keys(w).length > 0;
    return { gesamt: pflicht.length, ok: pflicht.length - fehlend.filter((f) => f.id).length, fehlend, vollstaendig: fehlend.length === 0 && (begonnen || pflicht.length > 0) && extra, begonnen };
  }

  /* ---------------- Editor ---------------- */
  function feldHtml(f, p, w, ctx) {
    if (!sichtbar(f, w, p)) return "";
    const span = typeof f.breite === "number" ? f.breite : BREITE[f.breite] || 12;
    const v = wert(p, f, w);
    const fehlt = ctx.zeigeFehler && f.pflicht && f.typ !== "checkliste" && !gefuellt(f, v, p, ctx.dateien);
    const lab = f.label ? `<span class="ff-label">${esc(f.label)}${f.pflicht ? ' <i class="pf" title="Pflichtfeld">•</i>' : ""}</span>` : "";
    const wrap = (inner, cls = "") => `<div class="ff${fehlt ? " fehlt" : ""} ${cls}" style="--span:${span}${f.start ? `;--start:${f.start}` : ""}"${f.start ? " data-start" : ""} data-feld-box="${esc(f.id)}">${inner}${fehlt ? '<span class="ff-fehlt-text">Pflichtfeld – bitte ausfüllen</span>' : ""}</div>`;
    const attr = `data-ff="${esc(f.id)}"`;

    switch (f.typ) {
      case "untertitel":
        return `<h4 class="ff-untertitel">${esc(f.titel)}</h4>`;
      case "abschnitt":
        return `<h3 class="ff-abschnitt" id="abs-${esc(f.titel.replace(/\W+/g, "-"))}">${esc(f.titel)}</h3>`;
      case "datum":
        if (f.uhrzeit) return wrap(`${lab}<span class="ff-datumzeit"><input class="eingabe" ${attr} type="date" value="${esc(v)}" aria-label="${esc(f.label)}">
          <input class="eingabe zeit" data-ff="${esc(f.id)}Zeit" type="time" step="300" value="${esc(w[f.id + "Zeit"] || "")}" aria-label="Uhrzeit"><span class="einheit">Uhr</span></span>`);
      // fallthrough
      case "text": case "zahl":
        return wrap(`<label>${lab}<span class="ff-eingabe-wrap"><input class="eingabe" ${attr} type="${f.typ === "zahl" ? "number" : f.typ === "datum" ? "date" : "text"}" value="${esc(v)}"${f.typ === "zahl" ? ' inputmode="decimal" step="any"' : ""}>${f.einheit || f.einheitPlatz ? `<span class="einheit">${esc(f.einheit || "")}</span>` : ""}</span></label>`);
      case "regler": {
        const n = reglerZahl(f, v), gesetzt = n != null;
        return wrap(`<label class="ff-regler${gesetzt ? "" : " unberuehrt"}">${lab}<output class="regler-wert" data-regler-ausgabe>${gesetzt ? esc(reglerText(f, n)) : "bitte einstellen"}</output>
          <input type="range" class="regler" ${attr} min="${f.min}" max="${f.max}" step="${f.schritt || 1}" value="${gesetzt ? n : Math.round((f.min + f.max) / 2 / (f.schritt || 1)) * (f.schritt || 1)}" data-einheit="${esc(f.einheit || "")}">
          <span class="regler-skala" aria-hidden="true"><span>${esc(reglerText(f, f.min))}</span><span>${esc(reglerText(f, f.max))}</span></span></label>`);
      }
      case "textarea":
        return wrap(`<label>${lab}<textarea class="eingabe" ${attr} rows="3">${esc(v)}</textarea></label>`);
      case "kunde":
        if (f.feld === "anrede") return wrap(`<label>${lab}<select class="eingabe" ${attr} data-kunde="anrede">${ANREDEN.map((a) => `<option${a === v ? " selected" : ""}>${a}</option>`).join("")}</select></label>`);
        return wrap(`<label>${lab}<input class="eingabe" ${attr} data-kunde="${esc(f.feld)}" type="${f.feld === "email" ? "email" : /telefon|mobil/i.test(f.feld) ? "tel" : "text"}" value="${esc(v)}"></label>`);
      case "wer": {
        const fa = ctx.firma || window.FIRMA; firmaCache = fa;
        if (f.quelle) {
          const qv = quellWert(f, p);
          return wrap(`${lab}<div class="ff-zentral">${qv ? `<b>${esc(werName(qv, fa))}</b>` : '<span class="leise">noch nicht festgelegt</span>'}<small>zentral aus der Projekt-Übersicht</small></div>`);
        }
        const partner = fa.partner || [];
        const passend = partner.filter((x) => !f.gewerk || x.gewerk === f.gewerk), andere = partner.filter((x) => f.gewerk && x.gewerk !== f.gewerk);
        const o = (id, l) => `<option value="${esc(id)}"${v === id ? " selected" : ""}>${esc(l)}</option>`;
        return wrap(`<label>${lab}<select class="eingabe" ${attr}><option value="">– bitte wählen –</option>${o(EIGEN, werName(EIGEN, fa))}
          ${passend.length ? `<optgroup label="${esc(f.gewerk ? "Partner " + f.gewerk : "Externe Partner")}">${passend.map((x) => o(x.id, x.firma)).join("")}</optgroup>` : ""}
          ${andere.length ? `<optgroup label="Andere Partner">${andere.map((x) => o(x.id, `${x.firma} · ${x.gewerk}`)).join("")}</optgroup>` : ""}</select></label>`);
      }
      case "janein":
        return wrap(`${lab}<div class="seg" role="radiogroup">${["ja", "nein"].map((o) => `<button type="button" class="seg-k${v === o ? " an" : ""}" data-ff-wahl="${esc(f.id)}" data-wert="${o}" role="radio" aria-checked="${v === o}">${o === "ja" ? "Ja" : "Nein"}</button>`).join("")}</div>
          ${f.beiJaFormular && v === "ja" && def(f.beiJaFormular) ? (() => { const n = Object.keys(werteVon(p, f.beiJaFormular)).filter((k) => !k.startsWith("_")).length;
            return `<a class="btn ${n ? "" : "jetzt "}klein ff-folge" href="#/projekt/${esc(p.id)}/formular/${esc(f.beiJaFormular)}">${esc(def(f.beiJaFormular).titel)} ${n ? "ansehen" : "ausfüllen"} →</a>`; })() : ""}
          ${f.beiJa && v === "ja" ? `<input class="eingabe ff-beija" data-ff="${esc(f.id)}Text" value="${esc(w[f.id + "Text"] || "")}" placeholder="${esc(f.beiJa === true ? "Details …" : f.beiJa)}" aria-label="${esc(f.label)} – Details">` : ""}`);
      case "auswahl":
        return wrap(`${lab}<div class="chips" role="radiogroup">${f.optionen.map((o) => `<button type="button" class="chip${v === o ? " an" : ""}" data-ff-wahl="${esc(f.id)}" data-wert="${esc(o)}" role="radio" aria-checked="${v === o}">${esc(o)}</button>`).join("")}</div>`);
      case "liste":
        return wrap(`<label>${lab}<span class="ff-eingabe-wrap"><select class="eingabe" ${attr}><option value="">– bitte wählen –</option>${f.optionen.map((o) => `<option${v === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>${f.einheit || f.einheitPlatz ? `<span class="einheit">${esc(f.einheit || "")}</span>` : ""}</span></label>`);
      case "mehrfach": {
        const arr = Array.isArray(v) ? v : [];
        return wrap(`${lab}<div class="chips">${f.optionen.map((o) => `<button type="button" class="chip mehr${arr.includes(o) ? " an" : ""}" data-ff-mehr="${esc(f.id)}" data-wert="${esc(o)}" aria-pressed="${arr.includes(o)}">${esc(o)}</button>`).join("")}</div>`);
      }
      case "dateien": {
        /* auchAus: Dateien aus anderen Ordnern hier mit anzeigen (z. B. Grundriss aus Level 2), Upload bleibt im eigenen Ordner */
        const fremd = (f.auchAus || []).filter((k) => ctx.dateien.some((d) => d.kategorie === k));
        return wrap(`${lab}${fremd.map((k) => `<p class="ff-quelle">Übernommen aus „${esc(katName(k))}“</p>${ctx.ablage(k, true, true)}`).join("")}
          ${fremd.length ? '<p class="ff-quelle">Weitere Skizzen / Dateien hinzufügen</p>' : ""}${ctx.ablage(f.kategorie, true)}`);
      }
      case "unterschrift":
        return wrap(`${lab}<div class="sign${v ? " voll" : ""}" data-sign="${esc(f.id)}">
          <canvas width="900" height="260" aria-label="Unterschriftenfeld"></canvas>
          ${v ? `<img src="${esc(v)}" alt="Unterschrift">` : `<span class="sign-hinweis">Hier unterschreiben – mit Finger, Stift oder Maus</span>`}
          <button type="button" class="btn klein still" data-sign-weg="${esc(f.id)}">Löschen</button></div>`);
      case "tabelle": {
        const rows = Array.isArray(v) ? v : [];
        const fest = f.zeilen ? f.zeilen.length : 0;
        const zeilen = f.zeilen ? tabellenZeilen(f, rows) : rows.map((r, i) => ({ r, i }));
        const zelle = (s, r, i) => {
          const val = r[s.id];
          const a = `data-tab="${esc(f.id)}" data-zeile="${i}" data-spalte="${esc(s.id)}"`;
          if (s.typ === "haken") return `<td class="mitte"><input type="checkbox" class="haken" ${a}${val ? " checked" : ""} aria-label="${esc(s.titel)}"></td>`;
          if (s.typ === "gewerk") {
            const g = Object.keys((ctx.firma || window.FIRMA).gewerke || {});
            return `<td><select class="eingabe" ${a} aria-label="${esc(s.titel)}"><option value=""></option>${g.map((n) => `<option${val === n ? " selected" : ""}>${esc(n)}</option>`).join("")}${val && !g.includes(val) ? `<option selected>${esc(val)}</option>` : ""}</select></td>`;
          }
          if (s.typ === "adressbuch") {
            /* Firma aus dem Partner-Adressbuch – passend zum Gewerk der Zeile zuerst */
            const fa = ctx.firma || window.FIRMA, pa = fa.partner || [], eigen = werName(EIGEN, fa);
            const passend = pa.filter((x) => r.gewerk && x.gewerk === r.gewerk), rest = pa.filter((x) => !passend.includes(x));
            const o = (x) => `<option value="${esc(x.firma)}" data-gewerk="${esc(x.gewerk || "")}"${val === x.firma ? " selected" : ""}>${esc(x.firma)}${r.gewerk && x.gewerk === r.gewerk ? "" : ` · ${esc(x.gewerk || "")}`}</option>`;
            const treffer = pa.find((x) => x.firma === val), tel = treffer && (treffer.telefon || treffer.mobil);
            return `<td><select class="eingabe" ${a} aria-label="${esc(s.titel)}"><option value=""></option><option value="${esc(eigen)}"${val === eigen ? " selected" : ""}>${esc(eigen)}</option>
              ${passend.length ? `<optgroup label="${esc("Adressbuch · " + r.gewerk)}">${passend.map(o).join("")}</optgroup>` : ""}
              ${rest.length ? `<optgroup label="${passend.length ? "Weitere aus dem Adressbuch" : "Adressbuch"}">${rest.map(o).join("")}</optgroup>` : ""}
              ${val && val !== eigen && !treffer ? `<option selected>${esc(val)}</option>` : ""}</select>
              ${tel ? `<a class="tz-tel" href="tel:${esc(tel.replace(/[^\d+]/g, ""))}">${esc(tel)}</a>` : ""}</td>`;
          }
          if (s.typ === "person") {
            const fa = ctx.firma || window.FIRMA;
            const namen = [...(fa.team || []).filter((m) => m.name).map((m) => m.name), ...(fa.partner || []).map((x) => x.firma)];
            return `<td><select class="eingabe" ${a}><option value=""></option>${namen.map((n) => `<option${val === n ? " selected" : ""}>${esc(n)}</option>`).join("")}${val && !namen.includes(val) ? `<option selected>${esc(val)}</option>` : ""}</select></td>`;
          }
          if (s.typ === "janein") return `<td><select class="eingabe" ${a}><option value=""></option><option value="ja"${val === "ja" ? " selected" : ""}>ja</option><option value="nein"${val === "nein" ? " selected" : ""}>nein</option></select></td>`;
          return `<td><input class="eingabe" ${a} value="${esc(val)}"${s.typ === "zahl" ? ' inputmode="decimal"' : ""} aria-label="${esc(s.titel)}"></td>`;
        };
        return wrap(`${lab}${f.adressbuchLink ? '<a class="ff-adresslink" href="#/adressbuch">Adressbuch öffnen →</a>' : ""}<div class="tab-wrap"><table class="ff-tab"><thead><tr>${f.zeilen ? "<th></th>" : ""}${f.spalten.map((s) => `<th>${esc(s.titel)}</th>`).join("")}${f.anfrage ? "<th>Anfrage</th>" : ""}${!f.zeilen || rows.length > fest ? "<th></th>" : ""}</tr></thead>
          <tbody>${zeilen.map(({ label, eigen, kopie, basis, r, i }) => `<tr class="${eigen ? "eigen" : ""}${kopie ? " kopie" : ""}">${label && !eigen ? `<th scope="row"><span class="tz-label">${esc(label)}</span>${f.zeilen && !kopie ? `<button type="button" class="tz-plus" data-tab-plus="${esc(f.id)}" data-nach="${basis}" title="Weitere Zeile „${esc(f.zeilen[basis])}“ hinzufügen" aria-label="Weitere Zeile ${esc(f.zeilen[basis])}">+</button>` : ""}</th>` : eigen ? `<th scope="row"><input class="eingabe" data-tab="${esc(f.id)}" data-zeile="${i}" data-spalte="_label" value="${esc(r._label || "")}" placeholder="Eigene Zeile" aria-label="Bezeichnung"></th>` : ""}${f.spalten.map((s) => zelle(s, r, i)).join("")}${f.anfrage ? `<td class="tz-anfrage"><button type="button" class="btn klein${r.angefragt ? " still" : ""}" data-aktion="sub-anfrage" data-zeile="${i}"${r.firma ? "" : " disabled title=\"Erst eine Firma wählen\""}>${r.angefragt ? `✓ angefragt ${new Date(r.angefragt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}` : "Anfrage ✉"}</button></td>` : ""}${!f.zeilen || eigen || kopie ? `<td class="mitte"><button type="button" class="btn klein still" data-tab-weg="${esc(f.id)}" data-zeile="${i}" aria-label="Zeile entfernen">✕</button></td>` : f.zeilen && rows.length > fest ? "<td></td>" : ""}</tr>`).join("")}</tbody></table></div>
          <button type="button" class="btn klein" data-tab-neu="${esc(f.id)}">${f.zeilen ? "+ Eigene Zeile" : "+ Zeile"}</button>`, "breit-tab");
      }
      case "checkliste": {
        const o = v || {};
        return wrap(`${lab}<ul class="ff-check">${f.punkte.map((pt) => {
          const e = o[pt.id] || {};
          if (e.s === true) e.s = "ja"; // ältere Einträge mit Häkchen
          const seg = (opts) => `<div class="seg klein">${opts.map(([k, l]) => `<button type="button" class="seg-k${e.s === k ? " an " + k : ""}" data-check="${esc(f.id)}" data-punkt="${esc(pt.id)}" data-wert="${k}">${l}</button>`).join("")}</div>`;
          const knoepfe = f.modus === "pruefung" ? seg([["ok", "In Ordnung"], ["mangel", "Mangel"], ["entfaellt", "Entfällt"]])
            : f.modus === "janein" ? seg([["ja", "Ja"], ["nein", "Nein"]])
            : `<button type="button" class="haken-k${e.s ? " an" : ""}" data-check="${esc(f.id)}" data-punkt="${esc(pt.id)}" data-wert="toggle" aria-pressed="${!!e.s}"><span></span></button>`;
          const offen = ctx.zeigeFehler && f.pflicht && !pt.optional && !e.s;
          return `<li class="${e.s === "mangel" ? "mangel" : ""}${offen ? " fehlt" : ""}">${f.modus === "haken" || !f.modus ? knoepfe : ""}<span class="ck-label">${esc(pt.label)}${pt.optional ? ' <small>(bei Bedarf)</small>' : ""}</span>${f.modus === "haken" || !f.modus ? "" : knoepfe}
            <input class="eingabe ck-notiz" placeholder="Notiz (optional)" data-check-notiz="${esc(f.id)}" data-punkt="${esc(pt.id)}" value="${esc(e.n || "")}"></li>`;
        }).join("")}</ul>`, "breit-tab");
      }
    }
    return "";
  }

  /* ---------------- Original-Blätter ----------------
     Das Papierformular originalgetreu nachgebaut – mit denselben Daten wie das
     Formular, zum Antippen/Ausfüllen und mit Stift-Ebene zum Zeichnen. */
  const BLAETTER = {
    tuer(p, w, ctx, lesen) {
      const f = ctx.firma, adr = f.adresse || {};
      const kreuz = (feld, wert, text) => {
        const an = w[feld] === wert;
        return lesen ? `<span class="bl-check${an ? " an" : ""}"><i></i>${esc(text)}</span>`
          : `<button type="button" class="bl-check${an ? " an" : ""}" data-ff-wahl="${feld}" data-wert="${esc(wert)}" aria-pressed="${an}"><i></i>${esc(text)}</button>`;
      };
      const zeile = (feld, wert, a, b) => {
        const an = w[feld] === wert;
        return `<tr class="${an ? "an" : ""}"${lesen ? "" : ` data-ff-wahl="${feld}" data-wert="${esc(wert)}" tabindex="0" role="button" aria-pressed="${an}"`}><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
      };
      const eingabe = (feld, wert, cls = "") => lesen ? `<span class="bl-wert ${cls}">${esc(wert || "")}</span>` : `<input class="bl-eingabe ${cls}" data-ff="${feld}" value="${esc(wert || "")}">`;
      const B = [["62,5–66,5 cm → 61,0 cm", "62,5 cm – 66,5 cm", "61,0 cm"], ["75,0–79,0 cm → 73,5 cm", "75,0 cm – 79,0 cm", "73,5 cm"], ["87,5–91,5 cm → 86,0 cm", "87,5 cm – 91,5 cm", "86,0 cm"], ["100,0–104,0 cm → 98,5 cm", "100,0 cm – 104,0 cm", "98,5 cm"]];
      const H = [["200,0–202,5 cm → 198,5 cm", "200,0 cm – 202,5 cm", "198,5 cm"], ["212,5–215,0 cm → 211,0 cm", "212,5 cm – 215,0 cm", "211,0 cm"]];
      const WS = [["9,0 cm", "9,0 cm – 10,7 cm"], ["12,0 cm", "12,0 cm – 13,7 cm"], ["14,0 cm", "14,0 cm – 15,7 cm"], ["16,0 cm", "16,0 cm – 17,7 cm"], ["20,0 cm", "20,0 cm – 21,7 cm"], ["26,5 cm", "26,5 cm – 28,2 cm"], ["33,0 cm", "33,0 cm – 34,7 cm"]];
      return `<div class="blatt" data-blatt="tuer">
        <div class="bl-seite">
          <header class="bl-kopf"><h4>Angaben zur Türen-Bestellung:</h4><img src="${esc(f.logo)}" alt="" class="bl-logo"></header>
          <div class="bl-reihe"><span>Projektname:</span>${eingabe("blattProjekt", w.blattProjekt ?? ctx.projektName, "linie")}<span>Projektnummer:</span>${eingabe("blattNr", w.blattNr ?? ctx.projektNr, "linie")}</div>
          <div class="bl-reihe oben"><span>Lieferadresse:</span><div class="bl-adresse">${esc(f.name)}<br>${esc(f.bereich || "")}<br>${esc(adr.strasse || "")}<br>${esc(adr.ort || "")}</div></div>
          <div class="bl-mitte">
            <figure class="bl-tuer"><img src="app/img/tuer.jpg" alt="Tür, Höhe und Breite Türblatt"><figcaption>Abbildung DIN links</figcaption></figure>
            <div class="bl-rechts">
              <div class="bl-optionen"><span><u>Anschlag</u>:</span> <span class="bl-stapel">${kreuz("anschlag", "DIN links", "DIN links")}${kreuz("anschlag", "DIN rechts", "DIN rechts")}</span>
                <span><u>mit WC-Riegel</u>:</span> <span class="bl-stapel">${kreuz("riegel", "ja", "ja")}${kreuz("riegel", "nein", "nein")}</span></div>
              <div class="bl-optionen"><span><u>Tür öffnet</u>:</span> ${kreuz("oeffnet", "in Raum / nach innen", "in Raum/nach innen")}${kreuz("oeffnet", "in Flur / nach außen", "in Flur/nach außen")}</div>
              <p class="bl-titel"><u>Angaben zur Breite</u>:</p>
              <table class="bl-tab"><thead><tr><th>Maueröffnung<br>min. – max.</th><th>Türblattaußenmaß<br>B (nach DIN 18101)</th></tr></thead><tbody>${B.map(([v, a, b]) => zeile("breite", v, a, b)).join("")}</tbody></table>
              <p class="bl-titel"><u>Angaben zur Höhe</u>:</p>
              <table class="bl-tab"><thead><tr><th>Maueröffnung<br>min. – max.</th><th>Türblattaußenmaß<br>H (nach DIN 18101)</th></tr></thead><tbody>${H.map(([v, a, b]) => zeile("hoehe", v, a, b)).join("")}</tbody></table>
            </div>
          </div>
          <div class="bl-unten">
            <div><p class="bl-titel"><u>Angaben zur Wandstärke</u>:</p>
              <table class="bl-tab"><thead><tr><th>Normzarge<br>Wandstärke in cm</th><th>Verstellbereich<br>+1,7 cm / von - bis</th></tr></thead><tbody>${WS.map(([v, b]) => zeile("wand", v, v, b)).join("")}</tbody></table></div>
            <div><p class="bl-titel"><u>Farbangaben</u>:</p>
              <table class="bl-tab farbe"><tbody><tr><th>Frontseite</th><td>${eingabe("farbeFront", w.farbeFront)}</td></tr><tr><th>Rückseite</th><td>${eingabe("farbeRueck", w.farbeRueck)}</td></tr></tbody></table></div>
          </div>
          <footer class="bl-fuss"><span>${esc(adr.strasse || "")}<br>${esc(adr.ort || "")}</span><span>Tel. ${esc(f.telefon || "")}</span><span>${esc(f.email || "")}<br>${esc(f.website || "")}</span></footer>
        </div>
        ${w.blattZeichnung ? `<img class="bl-zeichnung" src="${esc(w.blattZeichnung)}" alt="">` : ""}
        ${lesen ? "" : `<canvas class="bl-stift" width="900" height="1273" data-blatt-stift="tuer" aria-label="Zeichenfläche"></canvas>`}
      </div>`;
    },
  };

  function editor(id, p, ctx) {
    const d = def(id); def.aktuell = d;
    const w = werteVon(p, id);
    if (d.blatt) {
      const original = (w._ansicht || "original") === "original";
      const umschalter = `<div class="bl-umschalter"><div class="seg" role="radiogroup" aria-label="Ansicht">${[["original", "Original-Blatt"], ["formular", "Formular"]].map(([k, l]) => `<button type="button" class="seg-k${(w._ansicht || "original") === k ? " an" : ""}" data-ff-wahl="_ansicht" data-wert="${k}">${l}</button>`).join("")}</div>
        ${original ? `<div class="bl-werkzeug" role="toolbar" aria-label="Werkzeuge"><button type="button" class="btn klein an" data-blatt-modus="fuellen">Ausfüllen</button><button type="button" class="btn klein" data-blatt-modus="stift">✎ Stift</button><button type="button" class="btn klein" data-blatt-modus="radierer">Radierer</button><button type="button" class="btn klein still gefahr" data-blatt-leeren="tuer">Zeichnung löschen</button></div>` : ""}</div>`;
      if (original) return `${umschalter}<div class="bl-rahmen">${BLAETTER[d.blatt](p, w, ctx)}</div><div class="ff-raster bl-rest">${d.felder.filter((f) => f.ausserhalbBlatt).map((f) => feldHtml(f, p, w, ctx)).join("")}</div>`;
      return `${umschalter}<div class="ff-raster">${d.felder.map((f) => feldHtml(f, p, w, ctx)).join("")}</div>`;
    }
    const abschnitte = d.felder.filter((f) => f.typ === "abschnitt");
    return `<div class="ff-layout">
      ${abschnitte.length > 2 ? `<nav class="ff-index" aria-label="Abschnitte">${abschnitte.map((a) => `<a href="#abs-${esc(a.titel.replace(/\W+/g, "-"))}" data-sprung>${esc(a.titel)}</a>`).join("")}</nav>` : ""}
      <div class="ff-raster">${d.felder.map((f) => feldHtml(f, p, w, ctx)).join("")}</div></div>`;
  }

  /* Startwerte (Datum aus Termin, heute …) beim ersten Öffnen */
  function vorbelegen(id, p) {
    const d = def(id);
    p.formulare = p.formulare || {};
    const fo = (p.formulare[id] = p.formulare[id] || { werte: {} });
    let geaendert = false;
    for (const f of d.felder) {
      /* Uhrzeit aus dem Termin übernehmen – auch nachträglich, wenn das Datum schon steht und zum Termin passt */
      if (f.uhrzeit && f.vorbelegen && f.vorbelegen.startsWith("termin:") && !fo.werte[f.id + "Zeit"]) {
        const t = (p.termine || {})[f.vorbelegen.slice(7)] || "";
        if (t.length > 10 && (!fo.werte[f.id] || fo.werte[f.id] === t.slice(0, 10))) { fo.werte[f.id + "Zeit"] = t.slice(11, 16); geaendert = true; }
      }
      if (!f.vorbelegen || fo.werte[f.id]) continue;
      if (f.vorbelegen === "heute") fo.werte[f.id] = new Date().toISOString().slice(0, 10);
      else if (f.vorbelegen.startsWith("wert:")) fo.werte[f.id] = f.vorbelegen.slice(5);
      else if (f.vorbelegen.startsWith("feld:")) { const [fid, feld] = f.vorbelegen.slice(5).split("."); const x = werteVon(p, fid)[feld]; if (x) fo.werte[f.id] = x; }
      else if (f.vorbelegen.startsWith("termin:")) { const t = (p.termine || {})[f.vorbelegen.slice(7)]; if (t) fo.werte[f.id] = t.slice(0, 10); }
      if (fo.werte[f.id]) geaendert = true;
    }
    return geaendert;
  }

  /* ---------------- Druckfassung ---------------- */
  function druckWert(f, v, ctx) {
    const leer = '<span class="d-leer">—</span>';
    switch (f.typ) {
      case "wer": { const x = f.quelle ? quellWert(f, ctx.p) : v; return x ? esc(werName(x, ctx.firma)) : leer; }
      case "regler": { const n = reglerZahl(f, v); return n != null ? esc(reglerText(f, n)) : leer; }
      case "janein": { if (!v) return leer; const t = v === "ja" && f.beiJa && ctx.w ? ctx.w[f.id + "Text"] : ""; return (v === "ja" ? "Ja" : "Nein") + (t ? " – " + esc(t) : ""); }
      case "mehrfach": return Array.isArray(v) && v.length ? esc(v.join(", ")) : leer;
      case "datum": { if (!v) return leer; const z = f.uhrzeit && ctx.w ? ctx.w[f.id + "Zeit"] : ""; return esc(new Date(v + "T00:00").toLocaleDateString("de-DE")) + (z ? `, ${esc(z)} Uhr` : ""); }
      case "unterschrift": return v ? `<img class="d-sign" src="${esc(v)}" alt="Unterschrift">` : '<span class="d-linie"></span>';
      case "dateien": { const n = ctx.dateien.filter((d) => d.kategorie === f.kategorie || (f.auchAus || []).includes(d.kategorie)); return n.length ? esc(n.map((d) => d.name).join(", ")) : leer; }
      default: return v !== undefined && v !== "" ? esc(v).replace(/\n/g, "<br>") + (f.einheit ? " " + esc(f.einheit) : "") : leer;
    }
  }
  /* Formular als Klartext (z. B. „Leistungen“ in der Anfrage an einen Subunternehmer) */
  function text(id, p, firma) {
    const d = def(id); if (!d) return "";
    def.aktuell = d;
    const w = werteVon(p, id), aus = [];
    for (const f of d.felder) {
      if (!f.id || !sichtbar(f, w, p) || ["dateien", "unterschrift", "checkliste", "abschnitt", "untertitel", "wer"].includes(f.typ)) continue;
      const v = f.typ === "wer" && f.quelle ? quellWert(f, p) : w[f.id];
      if (f.typ === "tabelle") {
        const rows = Array.isArray(v) ? v : [];
        const zeilen = f.zeilen ? tabellenZeilen(f, rows) : rows.map((r, i) => ({ r, i }));
        const l = zeilen.filter(({ r }) => r && !Object.values(r).every((x) => x === "" || x == null || x === false) && !(f.spalten[0] && f.spalten[0].typ === "janein" && r[f.spalten[0].id] !== "ja"))
          .map(({ label, r }) => "  – " + [label || r._label, ...f.spalten.filter((s) => s.typ !== "janein" && r[s.id] !== undefined && r[s.id] !== "" && r[s.id] !== false).map((s) => `${s.titel}: ${r[s.id] === true ? "✓" : r[s.id]}`)].filter(Boolean).join(", "));
        if (l.length) aus.push(`${f.label}:`, ...l);
        continue;
      }
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
      let t = v;
      if (f.typ === "janein") t = v === "ja" ? "Ja" + (f.beiJa && w[f.id + "Text"] ? " – " + w[f.id + "Text"] : "") : "Nein";
      else if (f.typ === "mehrfach") t = v.join(", ");
      else if (f.typ === "wer") t = werName(v, firma);
      else if (f.typ === "datum") t = new Date(v + "T00:00").toLocaleDateString("de-DE");
      else if (f.typ === "regler") t = reglerText(f, reglerZahl(f, v));
      else if (f.einheit) t = `${v} ${f.einheit}`;
      aus.push(`${f.label}: ${t}`);
    }
    return aus.join("\n");
  }
  function druck(id, p, ctx) {
    const d = def(id); def.aktuell = d;
    const w = werteVon(p, id);
    if (d.blatt && (w._ansicht || "original") === "original") return `<section class="d-seite d-blatt">${BLAETTER[d.blatt](p, w, ctx, true)}</section>`;
    const teile = d.felder.filter((f) => sichtbar(f, w, p)).map((f) => {
      const v = wert(p, f, w);
      if (f.typ === "abschnitt") return `<h3>${esc(f.titel)}</h3>`;
      if (f.typ === "untertitel") return `<h4>${esc(f.titel)}</h4>`;
      if (f.typ === "tabelle") {
        const rows = Array.isArray(v) ? v : [];
        const zeilen = f.zeilen ? tabellenZeilen(f, rows).map((z) => ({ label: z.eigen ? (z.r._label || "Eigene Zeile") : z.label, r: z.r })) : rows.map((r) => ({ r }));
        if (!zeilen.length) return `<div class="d-zeile"><b>${esc(f.label)}</b><span class="d-leer">keine Einträge</span></div>`;
        return `<table class="d-tab"><thead><tr>${f.zeilen ? "<th></th>" : ""}${f.spalten.map((s) => `<th>${esc(s.titel)}</th>`).join("")}</tr></thead><tbody>${zeilen.map(({ label, r }) => `<tr>${label ? `<th>${esc(label)}</th>` : ""}${f.spalten.map((s) => `<td>${s.typ === "haken" ? (r[s.id] ? "✓" : "") : esc(r[s.id] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
      if (f.typ === "checkliste") {
        const o = v || {};
        const txt = { true: "✓", ja: "Ja", nein: "Nein", ok: "in Ordnung", mangel: "MANGEL", entfaellt: "entfällt" };
        return `<table class="d-tab d-check"><tbody>${f.punkte.map((pt) => { const e = o[pt.id] || {}; return `<tr><td>${esc(pt.label)}</td><td class="${e.s === "mangel" ? "d-mangel" : ""}">${e.s ? txt[e.s] : "☐"}</td><td>${esc(e.n || "")}</td></tr>`; }).join("")}</tbody></table>`;
      }
      return `<div class="d-zeile${f.typ === "unterschrift" ? " d-unterschrift" : ""}"><b>${esc(f.label)}</b><span>${druckWert(f, v, { ...ctx, p, w })}</span></div>`;
    }).join("");
    return `<section class="d-seite"><header class="d-kopf"><img src="${esc(ctx.firma.logo)}" alt=""><div><strong>${esc(d.titel)}</strong><span>${esc(ctx.kopfzeile)}</span></div></header>
      <div class="d-inhalt">${teile}</div>
      <footer class="d-fuss">${esc(ctx.firma.name)} · ${esc(ctx.firma.adresse.strasse)} · ${esc(ctx.firma.adresse.ort)} · Tel. ${esc(ctx.firma.telefon)} · ${esc(ctx.firma.email)}</footer></section>`;
  }

  window.Formular = { text, werName, EIGEN, def, werteVon, sichtbar: (f, w, p) => sichtbar(f, w, p), status, editor, vorbelegen, druck, gefuellt };
})();
