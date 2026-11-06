/* ==========================================================================
   Brüll Dashboard – Konten & Rechte (nur Admin = Geschäftsführung)
   --------------------------------------------------------------------------
   • Zugang anlegen: Person aus den Personalkarten wählen → Name + Benutzername (= Kürzel) automatisch
   • Rolle für Bad/Heizung (was man dort bearbeiten darf, regelt die Rolle in den Bereichen selbst)
   • Je Konto anhaken, welche Menüpunkte es sieht (gesamt/thema.js → BruellRechte); ändern dürfen in den
     Gesamt-Bereichen nur Admins. Die Datenbank prüft dasselbe (supabase/rechte.sql).
   • Passwort zurücksetzen, sperren, Lohnzettel-Freigabe
   Lokal (Demo/Test): Konten in bruell:konten. Mac mini (gesamt/db.js aktiv): Supabase.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const R = window.BruellRechte, box = $("#konten-inhalt");
  if (!box || !$("#rail").innerHTML) return;                                   // nicht angemeldet → personal.js leitet um
  if (!R.admin()) { location.replace("../" + location.search); return; }       // nur Admin

  /* Büro = früher „Planung“ (gleiche Rechte in Bad/Heizung, intern weiter „planung“); „Mitarbeiter“ nur noch für alte Konten */
  const ROLLEN = [["geschaeftsfuehrung", "Admin / Geschäftsführung"], ["planung", "Büro"], ["monteur", "Monteur"], ["partner", "Partner (extern)"]];
  const ALT = { mitarbeiter: "Mitarbeiter (alt – bitte Rolle wählen)" };
  const rolleTitel = (e) => (ROLLEN.find((r) => r[0] === e) || [, ALT[e] || e])[1];
  const rollenFuer = (e) => (ALT[e] ? [...ROLLEN, [e, ALT[e]]] : ROLLEN);
  const kontoEmail = (b) => { const x = String(b || "").trim().toLowerCase(); return x.includes("@") ? x : `${x}@konto.bad-dashboard.de`; };
  const startPasswort = () => { const z = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(10)); return [...r].map((b) => z[b % z.length]).join(""); };
  const datum = (s) => (s ? new Date(s).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "noch nie");
  const personen = () => Object.keys(localStorage).filter((k) => /^pk_\d+$/.test(k)).map((k) => ({ nr: k.slice(3), d: lesen(k, {}) }))
    .filter((x) => x.d && (x.d.vorname || x.d.nachname) && !x.d.austritt)
    .map((x) => ({ nr: x.nr, name: ((x.d.vorname || "") + " " + (x.d.nachname || "")).trim(), kuerzel: String(x.d.kuerzel || "").trim().toUpperCase(), position: x.d.position || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  /* ---------- Datenzugriff: Datenbank (Mac mini) oder Browser ---------- */
  const DB = window.BruellDB;
  async function rpc(name, args) { const r = await DB.sb.rpc(name, args); if (r.error) throw new Error(r.error.message); return r.data; }
  async function pruefsumme(salz, pw) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salz + "|" + pw)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
  const lokal = {
    get: () => lesen("bruell:konten", []),
    set: (l) => localStorage.setItem("bruell:konten", JSON.stringify(l)),
    mit(email, fn) { const l = this.get(), k = l.find((x) => x.email === email); if (!k) throw new Error("Konto nicht gefunden"); fn(k); this.set(l); },
  };
  const Konten = DB ? {
    liste: () => rpc("konten_liste"),
    async anlegen(k, pw) {
      await rpc("konto_anlegen", { p_benutzer: k.benutzer, p_passwort: pw, p_id: k.id, p_ebene: k.ebene, p_name: k.name, p_formulare: [] });
      await rpc("konto_personal", { p_email: kontoEmail(k.benutzer), p_pk: k.pk || null, p_lohnzettel: false });
      await rpc("konto_bereiche", { p_email: kontoEmail(k.benutzer), p_bereiche: k.bereiche });
    },
    bereiche: (email, l) => rpc("konto_bereiche", { p_email: email, p_bereiche: l }),
    rolle: (k, ebene) => rpc("konto_aendern", { p_id: k.id, p_ebene: ebene, p_name: k.name, p_formulare: [] }),
    passwort: (email, pw) => rpc("konto_passwort_zuruecksetzen", { p_email: email, p_passwort: pw }),
    aktiv: (email, an) => rpc("konto_aktiv", { p_email: email, p_aktiv: an }),
    loeschen: (email) => rpc("konto_loeschen", { p_email: email }),
  } : {
    liste: async () => lokal.get().map((k) => ({ ...k, bereicheWirksam: Array.isArray(k.bereiche) ? k.bereiche : R.STANDARD[k.ebene] || [] })),
    async anlegen(k, pw) {
      const l = lokal.get(), email = kontoEmail(k.benutzer), salz = startPasswort() + startPasswort();
      if (l.some((x) => x.email === email)) throw new Error("Benutzername schon vergeben");
      l.push({ email, benutzer: k.benutzer.toLowerCase(), id: k.id, pk: k.pk || "", ebene: k.ebene, name: k.name, formulare: [], salz, hash: await pruefsumme(salz, pw), aktiv: true, mussAendern: true, bereiche: k.bereiche });
      lokal.set(l);
    },
    bereiche: async (email, b) => lokal.mit(email, (k) => { k.bereiche = b; }),
    rolle: async (k, ebene) => lokal.mit(k.email, (x) => { x.ebene = ebene; }),
    passwort: async (email, pw) => { const salz = startPasswort() + startPasswort(), h = await pruefsumme(salz, pw); lokal.mit(email, (k) => { k.salz = salz; k.hash = h; k.mussAendern = true; }); },
    aktiv: async (email, an) => lokal.mit(email, (k) => { k.aktiv = an; }),
    loeschen: async (email) => { const l = lokal.get(); if (!l.some((x) => x.email === email)) throw new Error("Konto nicht gefunden"); lokal.set(l.filter((x) => x.email !== email)); },
  };

  /* ---------- Übersicht: welche Widgets jemand sieht (gleiche Liste wie gesamt/uebersicht.js) ---------- */
  const WIDGETS = [["kalender", "Kalender"], ["mail", "E-Mail"], ["bad", "Bad"], ["heizung", "Heizung"], ["baustellen", "Baustellen"], ["kennzahlen", "Kennzahlen"], ["personal", "Personal"], ["neu", "Neu vom Kunden"]];
  const WIDGET_RECHT = { bad: ["bad"], heizung: ["heizung"], kalender: ["bad", "heizung", "fahrzeuge"], mail: ["bad", "heizung"], baustellen: ["bad", "heizung"], neu: ["bad", "heizung"], kennzahlen: ["monitor"], personal: ["personal"] };
  const WIDGET_STANDARD = { geschaeftsfuehrung: WIDGETS.map((w) => w[0]), planung: ["kalender", "mail", "bad", "heizung", "baustellen", "neu"], monteur: ["kalender", "baustellen"] };
  const widgetsVon = (k) => { const w = lesen("bruell:widgets", {})[k.id]; return Array.isArray(w) ? w : WIDGET_STANDARD[k.ebene] || WIDGET_STANDARD.planung; };
  function widgetsSetzen(k, liste) { const alle = lesen("bruell:widgets", {}); if (liste) alle[k.id] = liste; else delete alle[k.id]; localStorage.setItem("bruell:widgets", JSON.stringify(alle)); }
  function widgetAuswahl(k, admin, w) {
    if (!admin && !w.includes("uebersicht")) return '<p class="leise">Sieht die Übersicht nicht (oben „Übersicht“ anhaken).</p>';
    const an = widgetsVon(k), eigen = Array.isArray(lesen("bruell:widgets", {})[k.id]);
    return `<label class="kt-haken"><input type="checkbox" data-a="w-standard"${eigen ? "" : " checked"}> Standard der Rolle verwenden</label>
      <div class="kt-bereiche">${WIDGETS.map(([id, titel]) => { const frei = admin || WIDGET_RECHT[id].some((b) => w.includes(b)), aus = !eigen || !frei;
        return `<label class="kt-haken${aus ? " aus" : ""}"${frei ? "" : ' title="Bereich dafür nicht freigegeben"'}><input type="checkbox" name="w-${esc(k.email)}" value="${id}"${an.includes(id) && frei ? " checked" : ""}${aus ? " disabled" : ""}> ${esc(titel)}</label>`; }).join("")}</div>
      <small class="leise">Ausgegraut = Bereich dafür nicht freigegeben. Gespeichert in diesem Browser.</small>`;
  }

  /* ---------- Anzeige ---------- */
  let KONTEN = [], OFFEN = "";
  const toast = (t) => { const el = $("#toast"); if (!el) return; el.textContent = t; el.classList.add("an"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("an"), 2600); };
  const haken = (name, wert, an, aus) => `<label class="kt-haken${aus ? " aus" : ""}"><input type="checkbox" name="${name}" value="${wert}"${an ? " checked" : ""}${aus ? " disabled" : ""}> ${esc(R.BEREICHE.find((b) => b.key === wert)?.titel || wert)}</label>`;
  function bereichsAuswahl(name, aktiv, gesperrt) {
    const haupt = R.BEREICHE.filter((b) => (!b.eltern || b.eltern === "personal") && b.key !== "personal_bearbeiten");
    return `<div class="kt-bereiche">${haupt.map((b) => `<div class="kt-gruppe">${haken(name, b.key, aktiv.includes(b.key), gesperrt)}${b.key === "personal" ? `<div class="kt-unter">${haken(name, "personal_bearbeiten", aktiv.includes("personal_bearbeiten"), gesperrt)}</div>` : ""}${b.key === "betrieb" ? `<div class="kt-unter">${R.BEREICHE.filter((u) => u.eltern === "betrieb").map((u) => haken(name, u.key, aktiv.includes(u.key), gesperrt)).join("")}</div>` : ""}</div>`).join("")}</div>`;
  }
  function zeichnen() {
    const ich = R.konto();
    KONTEN.sort((a, b) => (a.ebene === "partner") - (b.ebene === "partner") || String(a.name).localeCompare(String(b.name), "de"));
    box.innerHTML = `<div class="kt-leiste"><p class="leise">${KONTEN.filter((k) => k.aktiv !== false).length} aktive Zugänge · Benutzername = Kürzel aus der Personalkarte · ändern dürfen in Personal, Fahrzeuge, Werkzeuge und Betrieb nur Admins, alle anderen sehen ihre Bereiche nur lesend.</p>
        <button type="button" class="btn jetzt" data-a="neu">+ Zugang anlegen</button></div>
      <div class="kt-liste">${KONTEN.map((k) => {
        const admin = k.ebene === "geschaeftsfuehrung", eigen = ich && k.email === ich.email, w = k.bereicheWirksam || [];
        const status = k.aktiv === false ? '<span class="status-chip">gesperrt</span>' : k.mussAendern ? '<span class="status-chip pausiert">Startpasswort</span>' : `<small class="leise">zuletzt ${esc(datum(k.letzterLogin))}</small>`;
        return `<section class="panel kt-konto${OFFEN === k.email ? " offen" : ""}" data-email="${esc(k.email)}">
          <button type="button" class="kt-kopf" data-a="auf" aria-expanded="${OFFEN === k.email}"><span class="kt-k">${esc(String(k.benutzer || "").toUpperCase())}</span>
            <span class="kt-name"><b>${esc(k.name || k.benutzer)}</b><small>${esc(rolleTitel(k.ebene))}${k.pk ? ` · Pers.-Nr. ${esc(k.pk)}` : ""}</small></span>
            <span class="kt-chips">${admin ? '<span class="status-chip">Admin – alles</span>' : w.map((x) => `<span class="kt-chip">${esc((R.BEREICHE.find((b) => b.key === x) || {}).titel || x)}</span>`).join("") || '<small class="leise">nur eigene Personalkarte</small>'}</span>${status}</button>
          ${OFFEN === k.email ? `<div class="kt-detail">
            <div class="feld"><label>Rolle</label><select class="eingabe auto" data-a="rolle"${eigen ? " disabled" : ""}>${rollenFuer(k.ebene).map(([e, t]) => `<option value="${e}"${e === k.ebene ? " selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="feld"><label>Sieht im Menü</label>${admin ? '<p class="leise">Admins sehen alles und dürfen alles ändern.</p>' : `
              <label class="kt-haken"><input type="checkbox" data-a="standard"${Array.isArray(k.bereiche) ? "" : " checked"}> Standard der Rolle verwenden</label>
              ${bereichsAuswahl("b-" + k.email, w, !Array.isArray(k.bereiche))}`}</div>
            ${k.ebene !== "partner" ? `<div class="feld"><label>Widgets auf der Übersicht</label>${widgetAuswahl(k, admin, w)}</div>` : ""}
            <div class="kt-knoepfe">${k.pk ? `<a class="btn klein still" href="../personal/karte.html${location.search ? location.search + "&" : "?"}nr=${encodeURIComponent(k.pk)}">Personalkarte</a>` : ""}
              <button type="button" class="btn klein" data-a="pw">Neues Startpasswort</button>
              ${eigen ? "" : `<button type="button" class="btn klein ${k.aktiv === false ? "" : "still gefahr"}" data-a="sperre">${k.aktiv === false ? "Entsperren" : "Sperren"}</button>
              <button type="button" class="btn klein still gefahr" data-a="loeschen">Konto löschen</button>`}</div>
          </div>` : ""}</section>`;
      }).join("") || '<section class="panel"><p class="leise" style="padding:16px">Noch keine Zugänge.</p></section>'}</div>`;
  }
  async function laden() {
    try { KONTEN = await Konten.liste(); zeichnen(); }
    catch (e) { box.innerHTML = `<section class="panel"><p style="padding:16px">Konten konnten nicht geladen werden: ${esc(e.message || e)}</p></section>`; }
  }

  /* ---------- Dialoge ---------- */
  function dialog(html, setup) {
    const alt = $("#kt-dlg"); if (alt) alt.remove();
    const d = document.createElement("dialog"); d.id = "kt-dlg"; d.className = "dlg"; d.style.width = "min(640px, calc(100vw - 32px))";
    d.innerHTML = html; document.body.appendChild(d);
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-zu]")) d.close(); });
    d.addEventListener("close", () => d.remove());
    setup(d); d.showModal(); return d;
  }
  function passwortZeigen(name, benutzer, pw) {
    const text = `Zugang zum Brüll Dashboard\nAdresse: ${location.origin}/\nBenutzername: ${benutzer}\nStartpasswort: ${pw}\nBeim ersten Anmelden bitte ein eigenes Passwort festlegen.`;
    dialog(`<div class="dlg-kopf"><div><p class="eyebrow">${esc(name)}</p><h2>Zugangsdaten</h2><p>Nur jetzt sichtbar – bitte weitergeben. Beim ersten Anmelden wird ein eigenes Passwort verlangt.</p></div><button class="btn still" type="button" data-zu aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><dl class="infos gross"><dt>Adresse</dt><dd>${esc(location.origin)}/</dd><dt>Benutzername</dt><dd><b>${esc(benutzer)}</b></dd><dt>Startpasswort</dt><dd><b>${esc(pw)}</b></dd></dl></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-kopie>Kopieren</button><button class="btn jetzt" type="button" data-zu>Fertig</button></div>`, (d) => {
      d.querySelector("[data-kopie]").addEventListener("click", () => navigator.clipboard.writeText(text).then(() => toast("Zugangsdaten kopiert")));
    });
  }
  /* Externe Partner aus den Adressbüchern von Bad und Heizung (Einstellungen der Bereiche) */
  async function partnerListe() {
    const aus = (quelle, daten) => ((daten && daten.partner) || []).filter((x) => x && x.id && (x.firma || x.name)).map((x) => ({ quelle, id: x.id, firma: x.firma || x.name, gewerk: x.gewerk || "" }));
    if (DB) {
      const [b, h] = await Promise.all([DB.sb.from("einstellungen").select("daten").eq("id", 1).maybeSingle(), DB.sb.schema("heizung").from("einstellungen").select("daten").eq("id", 1).maybeSingle()]);
      return [...aus("bad", b.data && b.data.daten), ...aus("heizung", h.data && h.data.daten)];
    }
    return [...aus("bad", lesen("baddashboard:einstellungen", null)), ...aus("heizung", lesen("heizdashboard:einstellungen", null))];
  }
  const slugBenutzer = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/\b(gmbh|ug|kg|ohg|gbr|e\.?k\.?|co)\b/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20);
  async function neuDialog() {
    const ps = personen(), vergeben = new Set(KONTEN.map((k) => String(k.pk || "")));
    let pa = []; try { pa = await partnerListe(); } catch (e) { /* ohne Partner weiter */ }
    const paVergeben = new Set(KONTEN.map((k) => k.id)), BER = { bad: "Bad", heizung: "Heizung" };
    dialog(`<form id="kt-neu"><div class="dlg-kopf"><div><p class="eyebrow">Konten & Rechte</p><h2>Zugang anlegen</h2><p>Mitarbeiter (aus der Personalkarte) oder externen Partner (aus dem Adressbuch von Bad bzw. Heizung) wählen.</p></div><button class="btn still" type="button" data-zu aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="felder">
        <div class="feld"><label for="kt-p">Für wen?</label><select class="eingabe" id="kt-p" required><option value="">– bitte wählen –</option><optgroup label="Mitarbeiter (Personalkarte)">${ps.map((p) => `<option value="${p.nr}"${vergeben.has(p.nr) ? " disabled" : ""}>${esc(p.name)}${p.kuerzel ? ` (${esc(p.kuerzel)})` : ""}${vergeben.has(p.nr) ? " – hat schon einen Zugang" : ""}</option>`).join("")}</optgroup>${pa.length ? `<optgroup label="Partner (extern, aus dem Adressbuch)">${pa.map((x) => `<option value="partner:${x.quelle}:${esc(x.id)}"${paVergeben.has(x.id) ? " disabled" : ""}>${esc(x.firma)}${x.gewerk ? ` · ${esc(x.gewerk)}` : ""} (${BER[x.quelle]})${paVergeben.has(x.id) ? " – hat schon einen Zugang" : ""}</option>`).join("")}</optgroup>` : ""}</select></div>
        <div class="feld"><label for="kt-b">Benutzername</label><input class="eingabe" id="kt-b" required autocapitalize="characters" spellcheck="false" placeholder="Kürzel"></div>
        <div class="feld"><label for="kt-r">Rolle</label><select class="eingabe" id="kt-r">${ROLLEN.filter(([e]) => e !== "partner").map(([e, t]) => `<option value="${e}"${e === "planung" ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="feld"><label>Sieht im Menü</label><div id="kt-bereiche"></div></div>
      </div><p class="luecken versteckt" id="kt-f" role="alert"></p></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-zu>Abbrechen</button><button class="btn jetzt" type="submit">Anlegen</button></div></form>`, (d) => {
      const partnerWahl = () => { const v = d.querySelector("#kt-p").value, m = /^partner:(bad|heizung):(.+)$/.exec(v); return m && pa.find((x) => x.quelle === m[1] && x.id === m[2]); };
      const rolle = () => (partnerWahl() ? "partner" : d.querySelector("#kt-r").value);
      const bereicheZeigen = () => {
        const pw = partnerWahl(); d.querySelector("#kt-r").disabled = !!pw;
        if (pw) { d.querySelector("#kt-bereiche").innerHTML = `<p class="leise">Partner sehen nur ihre Einsätze in <b>${BER[pw.quelle]}</b>. Welche Formulare, stellst du in den Einstellungen ${BER[pw.quelle]} ein (dort einmal „Änderungen übernehmen“).</p>`; return; }
        d.querySelector("#kt-bereiche").innerHTML = rolle() === "geschaeftsfuehrung" ? '<p class="leise">Admins sehen alles und dürfen alles ändern.</p>' : bereichsAuswahl("neu", R.STANDARD[rolle()] || [], false); };
      bereicheZeigen();
      d.querySelector("#kt-r").addEventListener("change", bereicheZeigen);
      d.querySelector("#kt-p").addEventListener("change", (e) => {
        const p = ps.find((x) => x.nr === e.target.value), x = partnerWahl();
        if (p) d.querySelector("#kt-b").value = p.kuerzel || (p.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase());
        if (x) d.querySelector("#kt-b").value = slugBenutzer(x.firma).toUpperCase();
        bereicheZeigen();
      });
      d.querySelector("#kt-neu").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = d.querySelector("#kt-f"), p = ps.find((x) => x.nr === d.querySelector("#kt-p").value), benutzer = d.querySelector("#kt-b").value.trim().toUpperCase();
        const fehler = (t) => { f.textContent = t; f.classList.remove("versteckt"); };
        const x = partnerWahl();
        if (!p && !x) return fehler("Bitte einen Mitarbeiter oder Partner wählen.");
        if (!/^[A-Z0-9._-]{2,}$/i.test(benutzer)) return fehler("Benutzername: mindestens 2 Zeichen (Buchstaben, Ziffern).");
        if (KONTEN.some((k) => String(k.benutzer).toLowerCase() === benutzer.toLowerCase())) return fehler(`„${benutzer}“ ist schon vergeben – z. B. ${benutzer}2 nehmen.`);
        const bereiche = x ? [x.quelle] : rolle() === "geschaeftsfuehrung" ? null : [...d.querySelectorAll('input[name="neu"]:checked')].map((c) => c.value);
        const pw = startPasswort(), name = x ? x.firma : p.name;
        try { await Konten.anlegen(x ? { benutzer: benutzer.toLowerCase(), name, ebene: "partner", pk: "", id: x.id, bereiche } : { benutzer: benutzer.toLowerCase(), name, ebene: rolle(), pk: p.nr, id: p.kuerzel || "pk-" + p.nr, bereiche }, pw); }
        catch (err) { return fehler(err.message || String(err)); }
        d.close(); OFFEN = kontoEmail(benutzer); await laden(); passwortZeigen(name, benutzer, pw);
      });
    });
  }

  /* ---------- Bedienung ---------- */
  const kontoVon = (el) => KONTEN.find((k) => k.email === (el.closest("[data-email]") || {}).dataset?.email);
  box.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const k = kontoVon(a);
    try {
      if (a.dataset.a === "neu") return neuDialog();
      if (a.dataset.a === "auf") { OFFEN = OFFEN === k.email ? "" : k.email; return zeichnen(); }
      if (a.dataset.a === "pw") { if (!confirm(`Neues Startpasswort für ${k.benutzer.toUpperCase()} erzeugen? Das bisherige gilt dann nicht mehr.`)) return; const pw = startPasswort(); await Konten.passwort(k.email, pw); await laden(); return passwortZeigen(k.name, k.benutzer.toUpperCase(), pw); }
      if (a.dataset.a === "loeschen") {
        if (!confirm(`Zugang „${String(k.benutzer || "").toUpperCase()}“ (${k.name}) endgültig löschen?\n\nDie Person kann sich danach nicht mehr anmelden. Die Personalkarte bleibt erhalten. Nur vorübergehend? Dann lieber „Sperren“.`)) return;
        await Konten.loeschen(k.email); OFFEN = ""; toast("Zugang gelöscht"); return laden();
      }
      if (a.dataset.a === "sperre") { const an = k.aktiv === false; if (!an && !confirm(`${k.name} sperren? Die Person kann sich dann nicht mehr anmelden.`)) return; await Konten.aktiv(k.email, an); toast(an ? "Entsperrt" : "Gesperrt"); return laden(); }
    } catch (err) { alert(err.message || err); }
  });
  box.addEventListener("change", async (e) => {
    const t = e.target, k = kontoVon(t); if (!k) return;
    try {
      if (t.dataset.a === "rolle") { await Konten.rolle(k, t.value); toast("Rolle geändert"); return laden(); }
      if (t.dataset.a === "standard") { await Konten.bereiche(k.email, t.checked ? null : (k.bereicheWirksam || [])); toast(t.checked ? "Standard der Rolle" : "Eigene Auswahl"); return laden(); }
      if (t.dataset.a === "w-standard") { widgetsSetzen(k, t.checked ? null : widgetsVon(k)); toast(t.checked ? "Widgets: Standard der Rolle" : "Widgets: eigene Auswahl"); return zeichnen(); }
      if (t.name === "w-" + k.email) { widgetsSetzen(k, [...box.querySelectorAll(`input[name="w-${CSS.escape(k.email)}"]:checked`)].map((x) => x.value)); toast("Widgets gespeichert"); return; }
      if (t.name === "b-" + k.email) { await Konten.bereiche(k.email, [...box.querySelectorAll(`input[name="b-${CSS.escape(k.email)}"]:checked`)].map((x) => x.value)); toast("Gespeichert"); return laden(); }
    } catch (err) { alert(err.message || err); laden(); }
  });

  if (DB) DB.fertig.then(laden); else laden();
})();
