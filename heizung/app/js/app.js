/* Heizungs-Dashboard — das Arbeits-Dashboard.
   Jede Phase ist ein Level: erst wenn alle Pflichtschritte erledigt sind,
   wird die nächste freigeschaltet. Formulare, Dateien und Kunden-Uploads
   liegen direkt im Projekt. */

(function () {
  "use strict";

  const PHASEN = [...window.ABLAUF].sort((a, b) => a.nr - b.nr);
  const N = PHASEN.length;
  const phase = (nr) => PHASEN.find((p) => p.nr === nr);
  const ersteNr = PHASEN[0].nr;
  const naechsteNr = (nr) => { const i = PHASEN.findIndex((p) => p.nr === nr); return i >= 0 && i < N - 1 ? PHASEN[i + 1].nr : null; };
  const phaseIndex = (nr) => PHASEN.findIndex((p) => p.nr === nr);
  const KAT = window.KATEGORIEN;
  const katTitel = (id) => (KAT.find((k) => k.id === id) || { titel: id }).titel;

  const TERMINE = [
    { key: "erstgespraech",          label: "Erstgespräch",           typ: "datetime-local" },
    { key: "baustellenbesichtigung", label: "Baustellenbesichtigung", typ: "datetime-local" },
    { key: "baustart",               label: "Baustart",               typ: "date" },
    { key: "abnahme",                label: "Einweisung",             typ: "datetime-local" },
  ];
  const STATUS = [
    { id: "aktiv", label: "Aktiv" },
    { id: "pausiert", label: "Pausiert" },
    { id: "abgeschlossen", label: "Abgeschlossen" },
    { id: "verloren", label: "Abgesagt" },
  ];
  const ANREDEN = ["Herr", "Frau", "Herr und Frau", "Familie"];
  const EBENE_TITEL = Object.fromEntries((window.EBENEN || []).map((e) => [e.id, e.titel]));
  const GESPERRT_MONTEUR = ["angebot", "auftrag", "rechnungen"];
  const PARTNER_ORDNER = ["planung", "skizzen", "baustelle", "auswahl"];

  /* ---------- Helfer ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const zwei = (n) => String(n).padStart(2, "0");
  const isoTag = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
  const heute = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const plusTage = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const datum = (s) => { if (!s) return null; const d = new Date(s.length <= 10 ? s + "T00:00" : s); return isNaN(d) ? null : d; };
  const tageBis = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - heute()) / 864e5); };
  const WT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const fDatum = (d) => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
  const fKurz = (d) => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
  const fUhr = (d) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  const hatUhrzeit = (s) => s && s.length > 10;
  const fTermin = (s) => {
    const d = datum(s); if (!d) return "";
    const t = tageBis(d);
    const tag = t === 0 ? "heute" : t === 1 ? "morgen" : t === -1 ? "gestern" : `${WT[d.getDay()].slice(0, 2)}, ${fDatum(d)}`;
    return hatUhrzeit(s) ? `${tag}, ${fUhr(d)} Uhr` : tag;
  };
  const relativ = (d) => { const t = tageBis(d); return t === 0 ? "heute" : t > 0 ? `in ${t} ${t === 1 ? "Tag" : "Tagen"}` : `seit ${-t} ${t === -1 ? "Tag" : "Tagen"}`; };
  const groesse = (b) => (b > 1e6 ? (b / 1e6).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB");
  const istBild = (d) => /^image\//.test(d.typ || "") || /\.(jpe?g|png|webp|gif)$/i.test(d.name);

  function toast(text, art) {
    const t = $("#toast");
    t.textContent = text; t.className = "toast an" + (art ? " " + art : "");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.className = "toast"), 2600);
  }
  async function kopieren(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  }
  function herunterladen(name, text, typ = "application/json") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: typ }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Zustand ---------- */
  const S = {
    projekte: [],
    dateien: [],            // Metadaten aller Dateien (für Zähler & Fortschritt)
    einstellungen: null,
    filter: { suche: "", wer: "", status: "offen", abschnitt: "" },
    akteTab: "dateien",
    ordnerOffen: null,
    ansicht: {},            // projektId → angezeigtes Level
    zeigeFehler: false,
    ich: null,              // { id, name, ebene, gewerk? }
    voll: null,             // lokal als Partner: alle Projekte (nur zum Speichern von Meldungen)
    nurMeine: true,
    zahlen: {},             // Kennzahlen je Projekt (nur Geschäftsführung)
    kzZeitraum: "12m",
  };
  const urlCache = new Map();

  /* ---------- Einstellungen ---------- */
  function cfg() {
    const basis = window.FIRMA;
    const e = S.einstellungen;
    if (!e) return basis;
    const out = { ...basis, ...e };
    for (const k of ["adresse", "farben", "programme", "fristen", "ziele", "geschaeftszeiten", "kalkulation", "arbeitszeit"]) out[k] = { ...(basis[k] || {}), ...(e[k] || {}) };
    out.team = e.team || basis.team;
    out.partner = e.partner || basis.partner || [];
    out.cloud = Daten.konf || basis.cloud;
    return out;
  }
  const leute = (rolle) => cfg().team.filter((m) => m.rolle === rolle && m.name);
  const namen = (rolle) => leute(rolle).map((m) => m.name).join(" oder ") || rolle;
  /* Heizungsexperten eines Projekts (mehrere möglich); ältere Projekte haben nur „zustaendig“ */
  const experten = (p) => (p.experten && p.experten.length ? p.experten : p.zustaendig ? [p.zustaendig] : []);
  const kuerzelListe = () => cfg().team.filter((m) => m.kuerzel).map((m) => m.kuerzel);
  /* „A“, „A und B“, „A, B und C“ */
  const aufzaehlen = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} und ${l[l.length - 1]}` : l[0] || "");
  function ersetzen(text, p) {
    const c = cfg();
    return String(text).replace(/\{([a-zA-Z0-9.]+)\}/g, (m, key) => {
      /* {besichtiger}: wer in Level 5 für die Baustellenbesichtigung ausgewählt ist */
      /* {experteHat}: in Level 1 ausgewählte Heizungsexperten + passendes Verb („… hat“ / „… und … haben“) */
      /* {besichtigerHat}: in Level 5 für die Baustellenbesichtigung ausgewählte Mitarbeiter + Verb */
      if (key === "besichtigerHat") { const n = ((p && p.besichtiger) || []).map((k) => mitgliedZu(k)?.name || k); return n.length > 1 ? `${aufzaehlen(n)} haben` : `${n[0] || "Der Mitarbeiter"} hat`; }
      if (key === "experteHat") { const n = (p ? experten(p) : []).map((k) => mitgliedZu(k)?.name || k); return n.length > 1 ? `${aufzaehlen(n)} haben` : `${n[0] || "Der Heizungsexperte"} hat`; }
      if (key === "besichtiger") return ((p && p.besichtiger) || []).map((k) => mitgliedZu(k)?.name || k).join(" und ") || "Baustellenleiter";
      if (key.startsWith("programm.")) return c.programme[key.slice(9)] ?? m;
      if (c.team.some((t) => t.rolle === key)) return namen(key);
      return m;
    });
  }
  function anwenden() {
    const c = cfg();
    const r = document.documentElement.style;
    r.setProperty("--tinte", c.farben.tinte);
    r.setProperty("--akzent", c.farben.akzent);
    $("#marke-name").textContent = c.name;
    $("#marke-bereich").textContent = c.bereich;
    $("#marke-logo").src = c.logo;
    document.title = `${c.kurzname || c.name} · Heizungs-Dashboard`;
  }

  /* ---------- Ebenen & Rechte ---------- */
  function mitgliedZu(id) {
    const c = cfg();
    const t = c.team.find((m) => m.kuerzel === id);
    if (t) return { id, name: t.name, ebene: t.ebene || "planung" };
    const pa = (c.partner || []).find((x) => x.id === id);
    if (pa) return { id, name: pa.firma, ebene: "partner", gewerk: pa.gewerk };
    return null;
  }
  const ebene = () => (S.ich ? S.ich.ebene : "geschaeftsfuehrung");
  const istGF = () => ebene() === "geschaeftsfuehrung";
  const istBuero = () => ebene() === "geschaeftsfuehrung" || ebene() === "planung";
  /* ---------- Rechte je Schritt (Konten → Wer sieht was) ----------
     Haken = die Ebene sieht den Schritt samt Inhalt. Erledigen darf, wer ihn sieht und laut ablauf.js zuständig ist.
     Ohne eigene Einstellung gilt der Standard unten. Die Geschäftsführung sieht und darf immer alles. */
  const ALLE_SCHRITTE = PHASEN.flatMap((ph) => ph.schritte.map((s) => Object.assign(s, { _nr: ph.nr })));
  const RECHTE_EBENEN = ["planung", "monteur", "partner"];
  const gewerkFormulare = () => new Set(Object.values(cfg().gewerke || {}).flat());
  const MONTEUR_STANDARD_LEVEL = [5, 9, 10];
  function rechteStandard(s) {
    const l = ["planung"];
    const zust = s.ebene || ["planung"];
    if (zust.includes("monteur") || (MONTEUR_STANDARD_LEVEL.includes(s._nr) && s.typ !== "mail" && !["abschlag", "rechnung", "team"].includes(s.id))) l.push("monteur");
    if (zust.includes("partner") || (s.typ === "formular" && gewerkFormulare().has(s.formular))) l.push("partner");
    return l;
  }
  const siehtListe = (s) => { const r = (cfg().rechte || {})[s.id]; return Array.isArray(r) ? r : rechteStandard(s); };
  const siehtSchritt = (s) => istGF() || siehtListe(s).includes(ebene());
  const darfSchritt = (s) => istGF() || (siehtSchritt(s) && (s.ebene || ["planung"]).includes(ebene()));
  const formularSchritte = (fid) => ALLE_SCHRITTE.filter((s) => s.typ === "formular" && s.formular === fid);
  const siehtFormular = (fid) => istGF() || (formularSchritte(fid).length ? formularSchritte(fid).some(siehtSchritt) : istBuero());
  /* Formulare, die ein Partner sieht: freigegeben UND (eigenes Gewerk oder keinem Gewerk zugeordnet) */
  function partnerFormulare(gewerk) {
    const eigene = (cfg().gewerke || {})[gewerk] || [], alleG = gewerkFormulare();
    return [...new Set(ALLE_SCHRITTE.filter((s) => s.typ === "formular" && siehtListe(s).includes("partner") && (eigene.includes(s.formular) || !alleG.has(s.formular))).map((s) => s.formular))];
  }
  const darfKat = (kat) => istBuero() || (ebene() === "monteur" ? !GESPERRT_MONTEUR.includes(kat) : PARTNER_ORDNER.includes(kat));
  const darfHochladen = (kat) => istBuero() || (ebene() === "monteur" ? ["baustelle", "fertig"].includes(kat) : kat === "baustelle");
  const darfFormular = (fid) => istGF() || (formularSchritte(fid).length ? formularSchritte(fid).some(darfSchritt) : istBuero());
  const zugewiesen = (p) => !!S.ich && (p.zugriff || []).includes(S.ich.id);
  const ebenenText = (l) => (l || ["planung"]).map((e) => EBENE_TITEL[e] || e).join(" / ");
  const monteure = () => cfg().team.filter((m) => m.ebene === "monteur" && m.name);

  /* Was ein Partner von einem Projekt sehen darf (gleicher Auszug wie partner_auftraege() in der Cloud) */
  function partnerSicht(p, partner) {
    const forms = partnerFormulare(partner.gewerk);
    const k = p.kunde || {};
    return {
      id: p.id, projektnr: p.projektnr, phase: p.phase, status: p.status, geaendert: p.geaendert,
      kunde: { anrede: k.anrede, vorname: k.vorname, nachname: k.nachname, strasse: k.strasse, hausnr: k.hausnr, ort: k.ort, telefon: k.telefon, mobil: k.mobil },
      ordner: ordnerFuer(p, partner.id, "partner"),
      termine: { baustart: (p.termine || {}).baustart, abnahme: (p.termine || {}).abnahme },
      formulare: Object.fromEntries(forms.filter((f) => (p.formulare || {})[f]).map((f) => [f, p.formulare[f]])),
      meldung: (p.partnerStatus || {})[partner.id] || null,
    };
  }

  /* ---------- Kennzahlen: Zeitpunkte & Geld ---------- */
  const TAG = 864e5;
  function levelZeit(p, nr) {
    if (p.level && p.level[nr]) return p.level[nr];
    if (nr === ersteNr) return p.angelegt || null;
    const v = (p.verlauf || []).find((e) => e.text && e.text.startsWith(`Level ${zwei(nr)} `));
    return v ? v.ts : null;
  }
  const abschlussZeit = (p) => p.abgeschlossenAm || ((p.verlauf || []).find((e) => /^Projekt abgeschlossen/.test(e.text || "")) || {}).ts || null;
  const tage = (a, b) => (a && b && b >= a ? (b - a) / TAG : null);
  const schnitt = (l) => { const x = l.filter((v) => v != null && !isNaN(v)); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
  const eur = (n) => (n == null || isNaN(n) ? "—" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
  const tageText = (n) => (n == null ? "—" : `${n < 10 ? n.toFixed(1).replace(".", ",") : Math.round(n)} ${Math.round(n) === 1 ? "Tag" : "Tage"}`);
  const prozent = (n) => (n == null || isNaN(n) ? "—" : `${Math.round(n * 100)} %`);
  const ZAHLFELDER = [
    { k: "angebot", l: "Angebotssumme (netto)" }, { k: "auftrag", l: "Auftragswert (netto)" }, { k: "abschlag", l: "Abschlagsrechnung (netto)" }, { k: "rechnung", l: "Schlussrechnung (netto, nach Abschlag)" },
    { k: "material", l: "Material", kosten: true }, { k: "sub", l: "Subunternehmer", kosten: true }, { k: "lohn", l: "Montage / Lohn", kosten: true }, { k: "sonst", l: "Sonstige Kosten", kosten: true },
  ];
  function geld(p) {
    const z = S.zahlen[p.id] || {}, n = (k) => Number(z[k]) || 0, summe = (l, k) => (l || []).reduce((a, x) => a + (Number(x[k]) || 0), 0);
    /* Umsatz = Abschlag + Schlussrechnung (Restbetrag) + Nachträge; solange nicht abgerechnet: Auftragswert */
    const umsatz = (n("rechnung") ? n("rechnung") + n("abschlag") : n("auftrag")) + n("nachtraege");
    const timerMs = (p.zeiten || []).reduce((a, x) => a + dauerMs(x), 0);
    const stunden = timerMs / 36e5 + summe(z.extraStunden, "h");
    const satz = Number(z.stundensatz ?? (cfg().kalkulation || {}).stundensatz) || 0;
    const lohn = n("lohn") || stunden * satz;
    const partnerH = summe(z.partnerZeiten, "h"), partner = summe(z.partnerZeiten, "kosten") || n("sub");
    const sonst = summe(z.sonstiges, "betrag") + n("sonst");
    const kosten = n("material") + lohn + partner + sonst;
    return { angebot: n("angebot"), auftrag: n("auftrag"), umsatz, kosten, hatKosten: kosten > 0, db: umsatz - kosten, marge: umsatz && kosten ? (umsatz - kosten) / umsatz : null,
      stunden, timerStunden: timerMs / 36e5, satz, lohn, partner, partnerH, sonst, material: n("material"), materialSoll: n("materialSoll"), stundenSoll: n("stundenSoll"),
      dbProStunde: stunden ? (umsatz - kosten) / stunden : null, abgeschlossen: z.nkAbgeschlossen || null };
  }

  /* Adresse mit Hausnummer */
  const strHnr = (k) => [k.strasse, k.hausnr].filter(Boolean).join(" ");
  const adr = (k) => [strHnr(k), k.ort].filter(Boolean).join(", ");

  /* ---------- Ordner-Zugriff: fest je Rolle bzw. je Partner-Gewerk (Konten → „Ordner & Bilder“) ---------- */
  function freigabeStandard(art) {
    const fs = cfg().freigabeStandard || {};
    if (Array.isArray(fs[art])) return fs[art];
    if (art.startsWith("partner:") && Array.isArray(fs.partner)) return fs.partner;   // ältere Einstellung ohne Gewerk
    return ordnerStandard(art);
  }
  /* Werkseinstellung, solange unter Konten → „Ordner & Bilder“ nichts gespeichert ist */
  const ordnerStandard = (art) => art === "planung" ? KAT.map((k) => k.id)
    : art === "monteur" ? KAT.map((k) => k.id).filter((k) => !GESPERRT_MONTEUR.includes(k)) : [...PARTNER_ORDNER];
  const partnerArt = (id) => "partner:" + (((cfg().partner || []).find((x) => x.id === id) || {}).gewerk || "");
  function ordnerFuer(p, personId, art) {
    if (p && p.ordner && ebene() === "partner") return p.ordner;            // Partner-Auszug
    return freigabeStandard(art === "partner" ? partnerArt(personId) : art);
  }
  const darfKatP = (pid, kat) => {
    if (istGF()) return true;
    if (ebene() === "planung") return freigabeStandard("planung").includes(kat);
    const p = S.projekte.find((x) => x.id === pid);
    return ordnerFuer(p, S.ich && S.ich.id, ebene()).includes(kat);
  };

  function teamVerwaltung(p) {
    const z = p.zugriff || [], st = p.partnerStatus || {};
    const personen = [...monteure().map((m) => ({ id: m.kuerzel, name: m.name, art: "monteur", unter: "Monteur" })), ...(cfg().partner || []).map((x) => ({ id: x.id, name: x.firma, art: "partner", unter: "Partner · " + x.gewerk }))];
    const frei = personen.filter((x) => !z.includes(x.id));
    const zugewiesen = personen.filter((x) => z.includes(x.id));
    return `<div class="zuweisen">${istBuero() ? `<select class="eingabe auto" data-zuweisen aria-label="Person zuweisen"><option value="">+ Monteur oder Partner zuweisen …</option>
        ${frei.filter((x) => x.art === "monteur").length ? `<optgroup label="Monteure">${frei.filter((x) => x.art === "monteur").map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</optgroup>` : ""}
        ${frei.filter((x) => x.art === "partner").length ? `<optgroup label="Externe Partner">${frei.filter((x) => x.art === "partner").map((x) => `<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.unter.replace("Partner · ", ""))}</option>`).join("")}</optgroup>` : ""}</select>` : ""}
      ${zugewiesen.length ? `<ul class="zugewiesen">${zugewiesen.map((x) => { return `<li>
        <div class="zw-kopf"><b>${esc(x.name)}</b><small>${esc(x.unter)}</small>${st[x.id] ? `<small class="${st[x.id].erledigt ? "gruen" : ""}">${st[x.id].erledigt ? "✓ erledigt gemeldet" : "Rückmeldung"} ${fKurz(new Date(st[x.id].am))}${st[x.id].notiz ? ": " + esc(st[x.id].notiz) : ""}</small>` : ""}
          ${istBuero() ? `<button class="btn klein still gefahr" data-aktion="zuweisen" data-id="${esc(x.id)}">Entfernen</button>` : ""}</div>
</li>`; }).join("")}</ul>`
        : `<p class="leise klein-text">Noch niemand zugewiesen.</p>`}</div>`;
  }

  /* ---------- Projekte ---------- */
  const alle = () => S.projekte.filter((p) => !p.geloescht && (ebene() !== "monteur" || zugewiesen(p)));
  const finde = (id) => S.projekte.find((p) => p.id === id && !p.geloescht);
  const dateienVon = (pid, kat) => S.dateien.filter((d) => d.projekt_id === pid && (!kat || d.kategorie === kat) && darfKatP(pid, d.kategorie));
  function anzeigeName(p) {
    const k = p.kunde || {};
    if (k.anrede === "Familie") return `Familie ${k.nachname}`;
    if (k.vorname) return `${k.vorname} ${k.nachname}`;
    return `${k.anrede || ""} ${k.nachname}`.trim();
  }

  const offen = new Set();
  let speicherTimer;
  function speichern(p) {
    if (ebene() === "partner") return;
    p.geaendert = Date.now();
    offen.add(p.id);
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(async () => {
      const ids = [...offen]; offen.clear();
      try {
        if (Daten.modus === "lokal") await Daten.projektSpeichern(null, S.projekte);
        else for (const id of ids) await Daten.projektSpeichern(S.projekte.find((x) => x.id === id));
      } catch (e) { ids.forEach((i) => offen.add(i)); toast("Nicht gespeichert – Verbindung prüfen", "fehler"); }
    }, 350);
  }
  function aendern(p, fn, log) {
    if (gesperrt(p)) { toast(`Schreibgeschützt – ${S.sperre.name || "jemand anderes"} bearbeitet gerade`, "fehler"); return false; }
    fn(p);
    if (log) { p.verlauf = p.verlauf || []; p.verlauf.unshift({ ts: Date.now(), text: log, von: S.ich ? S.ich.name : "" }); }
    speichern(p);
  }
  function neuesProjekt(kunde, extra = {}) {
    const p = {
      id: uid(), kunde: { anrede: "Herr", vorname: "", nachname: "", strasse: "", hausnr: "", ort: "", email: "", telefon: "", telefonGeschaeft: "", mobil: "", ...kunde },
      projektnr: "", zustaendig: "", status: "aktiv", phase: ersteNr, schritte: {}, formulare: {}, termine: {}, mails: {},
      downloadCode: "", wiedervorlage: "", wiedervorlageNotiz: "", notiz: "", verlauf: [{ ts: Date.now(), text: "Anfrage angelegt" }],
      angelegt: Date.now(), geaendert: Date.now(), level: { [ersteNr]: Date.now() }, ...extra,
    };
    S.projekte.push(p);
    speichern(p);
    return p;
  }

  /* ---------- Spiel-Logik: Schritte & Level ---------- */
  const sKey = (nr, s) => `${nr}:${s.id}`;
  /* Stand eines Schritts – bei verschobenen Schritten (frueher: n) auch unter der alten Level-Nummer */
  const schrittStand = (p, nr, s) => { const l = p.schritte || {}; return l[sKey(nr, s)] || (s.frueher ? l[`${s.frueher}:${s.id}`] : null) || {}; };
  /* wenn: eine Bedingung oder eine Liste (eine davon genügt); undLeer: "formular.feld" muss noch leer sein */
  function bedingung(p, nr, c) {
    if (c.undLeer) { const [fid, feld] = c.undLeer.split("."); const x = Formular.werteVon(p, fid)[feld]; if (x !== undefined && x !== "") return false; }
    if (c.schritt) return ((p.schritte || {})[`${c.nr || nr}:${c.schritt}`] || {}).wahl === c.wert;
    if (c.formular) {
      const w = Formular.werteVon(p, c.formular)[c.feld];
      return Array.isArray(w) ? w.includes(c.wert) : w === c.wert;
    }
    return true;
  }
  function schrittGilt(p, nr, s) {
    if (!s.wenn) return true;
    return (Array.isArray(s.wenn) ? s.wenn : [s.wenn]).some((c) => bedingung(p, nr, c));
  }
  function schrittErledigt(p, nr, s) {
    if (p.demo && nr < p.phase) return true;
    const st = schrittStand(p, nr, s);
    switch (s.typ) {
      case "formular": return Formular.status(s.formular, p, dateienVon(p.id)).vollstaendig;
      case "dateien": return !!st.ersatz || dateienVon(p.id, s.kategorie).length >= (s.min || 1);
      case "termin": return !!(p.termine || {})[s.termin];
      case "mail": return !!(p.mails || {})[s.mail];
      case "erledigt": return !!st.erledigt;
      case "abschluss": return p.status === "abgeschlossen";
      case "entscheidung": { const o = (s.optionen || []).find((x) => x.id === st.wahl); return !!o && o.weiter !== false; }
      case "feld": return s.feld === "zustaendig" ? experten(p).length > 0 : s.mehrere ? (p[s.feld] || []).length > 0 : !!String(p[s.feld] || "").trim();
      case "team": return (p.zugriff || []).length > 0;
    }
    return false;
  }
  function phaseStatus(p, nr) {
    const ph = phase(nr);
    const liste = ph.schritte.filter((s) => schrittGilt(p, nr, s)).map((s) => ({ s, pflicht: s.pflicht !== false, erledigt: schrittErledigt(p, nr, s) }));
    const pflicht = liste.filter((x) => x.pflicht);
    const fertig = pflicht.filter((x) => x.erledigt);
    return { liste, pflicht: pflicht.length, fertig: fertig.length, komplett: fertig.length === pflicht.length, offen: pflicht.filter((x) => !x.erledigt) };
  }
  function naechsterSchritt(p) {
    if (p.status === "abgeschlossen") return "Abgeschlossen";
    const st = phaseStatus(p, p.phase);
    return st.komplett ? "Bereit für das nächste Level" : ersetzen(st.offen[0].s.titel, p);
  }

  /* ---------- Schreibschutz: ein Projekt bearbeitet immer nur eine Person ---------- */
  const gesperrt = (p) => !!(p && S.sperre && S.sperre.pid === p.id && !S.sperre.frei);
  const sperrtMit = () => istBuero() || ebene() === "monteur";
  async function sperreAktualisieren(pid, erzwingen) {
    if (!sperrtMit() || !pid) { S.sperre = null; return; }
    let r;
    try { r = await Daten.sperreHolen(pid, S.ich.name, erzwingen); } catch (e) { return; }
    const vorher = S.sperre && S.sperre.pid === pid ? S.sperre.frei : null;
    S.sperre = { pid, ...r };
    if (vorher !== null && vorher !== r.frei) {
      toast(r.frei ? "Das Projekt ist jetzt frei – du kannst bearbeiten." : `${r.name || "Jemand"} hat die Bearbeitung übernommen – nur noch mitlesen.`, r.frei ? undefined : "fehler");
      if (!beschaeftigt()) render();
    }
  }
  async function sperreLoslassen(pid) { if (pid && sperrtMit()) { try { await Daten.sperreFreigeben(pid); } catch (e) { /* läuft ab */ } } }
  const aktuellePid = () => { const r = route(); return r.name === "projekt" && ebene() !== "partner" ? r.arg : null; };
  setInterval(() => { const pid = aktuellePid(); if (pid && S.ich) sperreAktualisieren(pid); }, 30000);
  window.addEventListener("pagehide", () => { const pid = aktuellePid(); if (pid) sperreLoslassen(pid); });
  function sperrBanner(p) {
    if (!gesperrt(p)) return "";
    const seit = S.sperre.seit ? new Date(S.sperre.seit) : null;
    return `<div class="sperr-banner" role="status"><span class="schloss-mini" aria-hidden="true"></span><span><b>Schreibgeschützt</b> – ${esc(S.sperre.name || "Jemand")} bearbeitet dieses Projekt${seit ? ` seit ${fUhr(seit)} Uhr` : ""}. Du kannst mitlesen; sobald es frei ist, kannst du hier weiterarbeiten.</span>${istGF() ? `<button class="btn klein" data-aktion="sperre-uebernehmen">Bearbeitung übernehmen</button>` : ""}</div>`;
  }

  /* ---------- Arbeitszeit: Timer je Person und Projekt ---------- */
  const zeitDarf = () => istBuero() || ebene() === "monteur";
  const pauseLaeuft = (z) => (z.pausen || []).some((x) => !x.ende);
  const dauerMs = (z) => Math.max(0, (z.ende || Date.now()) - z.start - (z.pausen || []).reduce((a, x) => a + ((x.ende || z.ende || Date.now()) - x.start), 0));
  const hms = (ms) => { const t = Math.floor(ms / 1000); return `${zwei(Math.floor(t / 3600))}:${zwei(Math.floor((t % 3600) / 60))}:${zwei(t % 60)}`; };
  const stunden = (ms) => `${(ms / 36e5).toFixed(2).replace(".", ",")} h`;
  const meineZeit = (p) => S.ich && (p.zeiten || []).find((z) => z.wer === S.ich.id && !z.ende);
  const meinLaufender = () => alle().map((p) => ({ p, z: meineZeit(p) })).find((x) => x.z);
  function timerHtml(p) {
    if (!zeitDarf()) return "";
    const z = meineZeit(p);
    if (!z) return `<button class="btn" data-aktion="zeit-start">▶ Arbeitszeit starten</button>`;
    const pause = pauseLaeuft(z);
    return `<span class="timer${pause ? " pause" : ""}" title="Meine Arbeitszeit an diesem Projekt"><span class="timer-punkt" aria-hidden="true"></span><span data-timer="${p.id}">${hms(dauerMs(z))}</span>${pause ? " · Pause" : ""}</span>
      ${pause ? `<button class="btn" data-aktion="zeit-weiter">Fortsetzen</button>` : `<button class="btn" data-aktion="zeit-pause">Pause</button>`}<button class="btn voll" data-aktion="zeit-stop">Beenden</button>`;
  }
  setInterval(() => {
    $$("[data-timer]").forEach((el) => { const p = finde(el.dataset.timer); const z = p && meineZeit(p); if (z) el.textContent = hms(dauerMs(z)); });
  }, 1000);
  /* Abwesenheit: letzte Aktivität (über alle Tabs) merken, Timer rückwirkend pausieren */
  const AKTIV_KEY = "heizdashboard:aktiv";
  const abwesendMs = () => (Number((cfg().arbeitszeit || {}).abwesendNachMin) || 10) * 60000;
  const letzteAktivitaet = () => { try { return Number(localStorage.getItem(AKTIV_KEY)) || Date.now(); } catch (e) { return Date.now(); } };
  let aktivGemerkt = 0, systemIdle = false;
  function aktivitaet() {
    if (systemIdle) return;
    const jetzt = Date.now();
    if (jetzt - aktivGemerkt > 15000) { aktivGemerkt = jetzt; try { localStorage.setItem(AKTIV_KEY, String(jetzt)); } catch (e) { /* egal */ } }
    rueckkehrPruefen();
  }
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((t) => window.addEventListener(t, aktivitaet, { passive: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aktivitaet(); });
  function autoPause(seit) {
    const l = meinLaufender(); if (!l || pauseLaeuft(l.z)) return;
    const ab = Math.max(seit, l.z.start);
    aendern(l.p, () => { l.z.pausen = [...(l.z.pausen || []), { start: ab, ende: null, auto: true }]; }, `Arbeitszeit automatisch pausiert (abwesend seit ${fUhr(new Date(ab))} Uhr)`);
    if (route().name === "projekt") { kopfNeu(l.p); teilRendern(l.p); } else statusLeiste();
  }
  let rueckkehrOffen = false;
  function rueckkehrPruefen() {
    const l = meinLaufender(); if (!l || rueckkehrOffen) return;
    const pa = (l.z.pausen || []).find((x) => !x.ende && x.auto); if (!pa) return;
    rueckkehrOffen = true;
    const weg = Math.round((Date.now() - pa.start) / 60000);
    dialog(`<div class="dlg-kopf"><div><p class="eyebrow">${esc(anzeigeName(l.p))}</p><h2>Willkommen zurück</h2><p>Du warst ca. ${weg} Min. nicht aktiv. Die Arbeitszeit wurde ab ${fUhr(new Date(pa.start))} Uhr automatisch pausiert.</p></div></div>
      <div class="dlg-fuss"><button class="btn still" data-dlg="stop">Timer beenden</button><button class="btn" data-dlg="behalten">Ich habe weitergearbeitet – Pause verwerfen</button><button class="btn jetzt" data-dlg="weiter">Weiter stempeln</button></div>`, (dlg) => {
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-dlg]"); if (!b) return;
        const jetzt = Date.now();
        if (b.dataset.dlg === "weiter") aendern(l.p, () => { pa.ende = jetzt; }, "Arbeitszeit fortgesetzt");
        if (b.dataset.dlg === "behalten") aendern(l.p, () => { l.z.pausen = l.z.pausen.filter((x) => x !== pa); }, "Automatische Pause verworfen (weitergearbeitet)");
        rueckkehrOffen = false; dlg.close();
        if (b.dataset.dlg === "stop") { aendern(l.p, () => { pa.ende = pa.start; }); return zeitStopDialog(l.p); }
        if (route().name === "projekt") { kopfNeu(l.p); teilRendern(l.p); } else statusLeiste();
      });
      dlg.addEventListener("cancel", () => { rueckkehrOffen = false; });
    });
  }
  /* alle 30 s: zu lange keine Aktivität? (auch nach geschlossenem Browser) */
  function abwesenheitPruefen() {
    if (!S.ich || systemIdle) return;
    const seit = letzteAktivitaet();
    if (Date.now() - seit > abwesendMs()) autoPause(seit);
  }
  setInterval(abwesenheitPruefen, 30000);
  /* Chrome/Edge: Abwesenheit am ganzen Rechner erkennen (Erlaubnis nötig) */
  async function systemAbwesenheit() {
    if (!("IdleDetector" in window)) return;
    try {
      if ((await IdleDetector.requestPermission()) !== "granted") return;
      const d = new IdleDetector();
      d.addEventListener("change", () => {
        if (d.userState === "idle") { systemIdle = true; autoPause(Date.now() - abwesendMs()); }
        else { systemIdle = false; aktivitaet(); }
      });
      await d.start({ threshold: Math.max(60000, abwesendMs()) });
    } catch (e) { /* nicht verfügbar – Seiten-Aktivität reicht */ }
  }

  function zeitStopDialog(p) {
    const z = meineZeit(p); if (!z) return;
    dialog(`<form id="zeit-form"><div class="dlg-kopf"><div><p class="eyebrow">${esc(anzeigeName(p))}</p><h2>Arbeitszeit beenden</h2><p>${hms(dauerMs(z))} erfasst${(z.pausen || []).length ? ` (ohne ${z.pausen.length} ${z.pausen.length === 1 ? "Pause" : "Pausen"})` : ""}.</p></div><button class="btn still" type="button" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="feld"><label for="zt">Was wurde gemacht? (optional)</label><input class="eingabe" id="zt" placeholder="z. B. Abriss, Vorwand, Fertigmontage, Angebot erstellt …"></div></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-aktion="dlg-zu">Weiterlaufen lassen</button><button class="btn jetzt" type="submit">Beenden & speichern</button></div></form>`, (dlg) => {
      $("#zeit-form", dlg).addEventListener("submit", (e) => {
        e.preventDefault(); e.stopPropagation();
        const notiz = $("#zt", dlg).value.trim(), jetzt = Date.now();
        aendern(p, () => { (z.pausen || []).forEach((x) => { if (!x.ende) x.ende = jetzt; }); z.ende = jetzt; z.notiz = notiz; }, `Arbeitszeit ${stunden(dauerMs(z))}${notiz ? " – " + notiz : ""}`);
        dlg.close(); toast(`${stunden(dauerMs(z))} gespeichert`); kopfNeu(p); teilRendern(p);
      });
    });
  }

  /* ---------- Outlook: Termin als Kalendereintrag (.ics), Mail als Entwurf (.eml) ---------- */
  const IN_AUSSTELLUNG = ["erstgespraech"];
  function icsDatei(p, key) {
    const def = TERMINE.find((t) => t.key === key), w = (p.termine || {})[key]; if (!w) return;
    const c = cfg(), k = p.kunde, d = datum(w), stamp = (x) => `${x.getFullYear()}${zwei(x.getMonth() + 1)}${zwei(x.getDate())}T${zwei(x.getHours())}${zwei(x.getMinutes())}00`;
    const ort = IN_AUSSTELLUNG.includes(key) ? `${c.name}, ${c.adresse.strasse}, ${c.adresse.ort}` : adr(k);
    const ganztag = !hatUhrzeit(w);
    let bis = new Date(d.getTime() + 60 * 60000);
    if (ganztag) { const ab = datum((p.termine || {}).abnahme); bis = key === "baustart" && ab ? plusTage(new Date(ab.toDateString()), 1) : plusTage(d, 1); }
    const tag = (x) => `${x.getFullYear()}${zwei(x.getMonth() + 1)}${zwei(x.getDate())}`;
    const txt = (t) => String(t || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Heizungs-Dashboard//DE", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:${p.id}-${key}@heizungs-dashboard`, `DTSTAMP:${stamp(new Date())}`,
      ganztag ? `DTSTART;VALUE=DATE:${tag(d)}` : `DTSTART;TZID=Europe/Berlin:${stamp(d)}`,
      ganztag ? `DTEND;VALUE=DATE:${tag(bis)}` : `DTEND;TZID=Europe/Berlin:${stamp(bis)}`,
      `SUMMARY:${txt(`${def.label} – ${anzeigeName(p)}`)}`, `LOCATION:${txt(ort)}`,
      `DESCRIPTION:${txt(`${anzeigeName(p)}${p.projektnr ? " · Projekt " + p.projektnr : ""}\nTel. ${[k.telefon, k.mobil].filter(Boolean).join(" / ") || "—"}\n${location.origin + location.pathname}#/projekt/${p.id}`)}`,
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    herunterladen(`${def.label} ${anzeigeName(p)}.ics`.replace(/[\\/:*?"<>|]/g, ""), ics, "text/calendar");
    aendern(p, () => {}, `${def.label} in den Kalender übernommen`);
  }
  const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
  async function emlDatei(p, betreff, text, anhaenge, an) {
    const grenze = "----=_Teil_" + uid().replace(/-/g, "");
    const teile = [`--${grenze}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text).replace(/.{76}/g, "$&\r\n")];
    let fehlend = 0;
    for (const a of anhaenge) {
      try {
        const blob = await (await fetch(a.url)).blob();
        const daten = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
        teile.push(`--${grenze}`, `Content-Type: ${blob.type || "application/octet-stream"}; name="=?UTF-8?B?${b64(a.name)}?="`, "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="=?UTF-8?B?${b64(a.name)}?="`, "", daten.replace(/.{76}/g, "$&\r\n"));
      } catch (e) { fehlend++; }
    }
    teile.push(`--${grenze}--`, "");
    const kopf = ["X-Unsent: 1", `To: ${an !== undefined ? an : p.kunde.email || ""}`, `Subject: =?UTF-8?B?${b64(betreff)}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${grenze}"`, "", ""].join("\r\n");
    herunterladen(`${betreff}.eml`.replace(/[\\/:*?"<>|]/g, ""), kopf + teile.join("\r\n"), "message/rfc822");
    return fehlend;
  }

  /* ---------- Termine prüfen: Reihenfolge, Wochentag, Geschäftszeiten ---------- */
  const WOCHENTAG_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  function terminFehler(p, key, wert) {
    if (!wert) return null;
    const d = datum(wert); if (!d) return "Ungültiges Datum.";
    const gz = cfg().geschaeftszeiten || { tage: [1, 2, 3, 4, 5], von: "07:00", bis: "18:00" };
    const def = TERMINE.find((t) => t.key === key);
    if (!(gz.tage || []).includes(d.getDay())) return `${def.label} am ${WOCHENTAG_LANG[d.getDay()]}? An diesem Tag finden keine Termine statt – bitte einen Werktag wählen.`;
    if (hatUhrzeit(wert)) {
      const hm = fUhr(d);
      if (hm < gz.von || hm > gz.bis) return `${hm} Uhr liegt außerhalb der Geschäftszeiten (${gz.von}–${gz.bis} Uhr).`;
    }
    const i = TERMINE.findIndex((t) => t.key === key), t = p.termine || {};
    const vergleich = (a, b) => (hatUhrzeit(a) && hatUhrzeit(b) ? datum(a) - datum(b) : tageBis(datum(a)) - tageBis(datum(b)));
    for (const frueher of TERMINE.slice(0, i)) {
      if (t[frueher.key] && vergleich(wert, t[frueher.key]) < 0) return `${def.label} kann nicht vor dem Termin „${frueher.label}“ (${fTermin(t[frueher.key])}) liegen.`;
    }
    for (const spaeter of TERMINE.slice(i + 1)) {
      if (t[spaeter.key] && vergleich(wert, t[spaeter.key]) > 0) return `${def.label} kann nicht nach dem Termin „${spaeter.label}“ (${fTermin(t[spaeter.key])}) liegen.`;
    }
    return null;
  }
  function feldFehler(el, text) {
    const box = el.closest(".q-aktion, .termin-zeile") || el.parentElement;
    $$(".feld-fehler", box.parentElement).forEach((x) => x.remove());
    el.classList.toggle("ungueltig", !!text);
    if (text) { box.insertAdjacentHTML("afterend", `<p class="feld-fehler" role="alert">${esc(text)}</p>`); el.focus(); }
  }

  /* ---------- Fälligkeiten (Cockpit) ---------- */
  function faelligkeiten(p) {
    if (p.geloescht || p.status === "abgeschlossen" || p.status === "verloren") return [];
    const f = cfg().fristen, t = p.termine || {}, m = p.mails || {}, out = [];
    const add = (text, d, unter) => out.push({ p, text, d, unter, ueber: tageBis(d) < 0 });
    const wv = datum(p.wiedervorlage);
    if (wv && tageBis(wv) <= 0) add(p.wiedervorlageNotiz || "Wiedervorlage", wv, "Wiedervorlage");
    if (p.status === "pausiert") return out;
    const eg = datum(t.erstgespraech);
    if (p.phase === 2 && eg && tageBis(eg) >= 0 && tageBis(eg) <= f.erinnerungVorErstgespraech && !dateienVon(p.id, "bilder-alt").length && !((p.schritte || {})["2:fotos"] || {}).ersatz)
      add("Fotos fehlen – Kunden anrufen", plusTage(eg, -f.erinnerungVorErstgespraech), `Erstgespräch ${fTermin(t.erstgespraech)}`);
    if (p.phase === 3 && eg && tageBis(eg) <= 2) add("Musterangebot fertigstellen", plusTage(eg, -2), `Erstgespräch ${fTermin(t.erstgespraech)}`);
    if (p.phase === 4 && eg && !((p.schritte || {})["4:ergebnis"] || {}).wahl && tageBis(plusTage(eg, f.angebotsverfolgung)) <= 0)
      add("Angebotsverfolgung – nachfragen", plusTage(eg, f.angebotsverfolgung), `Erstgespräch war ${fTermin(t.erstgespraech)}`);
    const bs = datum(t.baustart);
    /* Schornsteinfeger braucht die TAF mindestens 10 Tage vor Baubeginn – nur bei Feuerstätten (nicht reine Wärmepumpe) */
    const neu = Formular.werteVon(p, "erstgespraech").neu || [];
    if (bs && p.phase >= 7 && p.phase <= 8 && neu.some((x) => x !== "Wärmepumpe") && !Formular.werteVon(p, "taf").gesendet && tageBis(plusTage(bs, -(f.tafVorBaustart ?? 14))) <= 0)
      add("TAF an den Bezirksschornsteinfeger", plusTage(bs, -(f.tafVorBaustart ?? 14)), `Baustart ${fTermin(t.baustart)} – spätestens 10 Tage vorher`);
    if (bs && p.phase <= 9 && tageBis(bs) >= 0 && tageBis(bs) <= f.kundenerinnerungVorBaustart && !m.baustart)
      add("Kundenerinnerung vor Baustart senden", plusTage(bs, -f.kundenerinnerungVorBaustart), `Baustart ${fTermin(t.baustart)}`);
    const an = datum(t.abnahme);
    if (p.phase >= 10 && an && tageBis(an) <= 0 && !m.schlussrechnung) add("Schlussrechnung senden", an, `Einweisung ${fTermin(t.abnahme)}`);
    /* x Tage nach der Schlussrechnung: Abschluss prüfen & Google-Bewertung checken (bis eine Entscheidung getroffen ist) */
    const bw = ((p.schritte || {})["11:bewertung"] || {}).wahl;
    if (m.schlussrechnung && !["erhalten", "erinnert", "warten"].includes(bw)) {
      const d = plusTage(new Date(m.schlussrechnung), f.bewertungNachRechnung ?? 7);
      if (tageBis(d) <= 0) add("Abschluss prüfen & Google-Bewertung checken", d, `Schlussrechnung gesendet am ${fDatum(new Date(m.schlussrechnung))}`);
    }
    return out;
  }

  /* ---------- Vorschaubilder ---------- */
  async function dateiUrl(d) {
    if (urlCache.has(d.id)) return urlCache.get(d.id);
    const u = await Daten.dateiUrl(d);
    urlCache.set(d.id, u);
    return u;
  }
  function vorschauenLaden(root = document) {
    $$("img[data-vorschau]", root).forEach(async (img) => {
      const d = S.dateien.find((x) => x.id === img.dataset.vorschau);
      if (!d) return;
      try { img.src = await dateiUrl(d); } catch (e) { /* ohne Vorschau */ }
    });
  }

  /* ---------- Bausteine ---------- */
  function fliesen(p) {
    const i = phaseIndex(p.phase), fertig = p.status === "abgeschlossen";
    return `<span class="fliesen" aria-label="Level ${i + 1} von ${N}">${PHASEN.map((_, k) => `<span class="fliese${fertig || k < i ? " fertig" : k === i ? " jetzt" : ""}"></span>`).join("")}</span>`;
  }
  const opt = (liste, wert) => liste.map((x) => {
    const [v, l] = typeof x === "string" ? [x, x] : [x.id, x.label];
    return `<option value="${esc(v)}"${v === wert ? " selected" : ""}>${esc(l)}</option>`;
  }).join("");

  /* Datei-Ablage einer Kategorie: Vorschauen + Upload-Feld */
  function ablage(p, kat, kompakt, ohneUpload) {
    const l = dateienVon(p.id, kat);
    return `<div class="ablage${kompakt ? " kompakt" : ""}" data-ablage="${esc(kat)}">
      ${l.length ? `<ul class="thumbs">${l.map((d) => `<li><button type="button" class="thumb${d.neu ? " neu" : ""}" data-aktion="datei" data-datei="${esc(d.id)}" title="${esc(d.name)}">
        ${istBild(d) ? `<img data-vorschau="${esc(d.id)}" alt="">` : `<span class="typ">${esc((d.name.split(".").pop() || "").toUpperCase().slice(0, 4))}</span>`}
        <span class="thumb-name">${esc(d.name)}</span>${d.quelle === "kunde" ? '<span class="vom-kunden">Kunde</span>' : d.quelle === "partner" ? '<span class="vom-kunden partner">Partner</span>' : ""}</button></li>`).join("")}</ul>` : ""}
      ${!ohneUpload && darfHochladen(kat) && darfKatP(p.id, kat) ? `<label class="drop"><input type="file" multiple data-upload="${esc(kat)}" hidden>
        <span class="drop-icon" aria-hidden="true">＋</span><span>Dateien hierher ziehen oder <u>auswählen</u></span></label>` : l.length ? "" : '<p class="leise klein-text">Noch keine Dateien.</p>'}</div>`;
  }

  /* ================================================================
     Cockpit
     ================================================================ */
  function ansichtCockpit() {
    const meine = ebene() === "planung" && S.nurMeine;
    const laufend = alle().filter((p) => (p.status === "aktiv" || p.status === "pausiert") && (!meine || experten(p).includes(S.ich.id)));
    const faellig = laufend.flatMap(faelligkeiten).sort((a, b) => a.d - b.d);
    const neu = S.dateien.filter((d) => d.neu && finde(d.projekt_id));
    const termine = [];
    for (const p of alle()) for (const t of TERMINE) { const d = datum((p.termine || {})[t.key]); if (d && tageBis(d) >= 0 && tageBis(d) <= 14 && p.status !== "verloren") termine.push({ p, t, d, s: p.termine[t.key] }); }
    termine.sort((a, b) => a.d - b.d);
    const d = new Date();
    const queue = laufend.filter((p) => p.status === "aktiv").map((p) => ({ p, st: phaseStatus(p, p.phase) })).sort((a, b) => (b.st.komplett - a.st.komplett) || (b.p.phase - a.p.phase));
    const neuNachProjekt = {};
    for (const x of neu) (neuNachProjekt[x.projekt_id] = neuNachProjekt[x.projekt_id] || []).push(x);

    return `<div class="seite cockpit">
      <header class="kopf"><div><p class="eyebrow">${WT[d.getDay()]}, ${fDatum(d)}${S.ich ? " · " + esc(S.ich.name) : ""}</p><h1>Cockpit</h1></div>
        ${ebene() === "planung" ? `<div class="kopf-aktionen"><div class="seg"><button class="seg-k${S.nurMeine ? " an" : ""}" data-aktion="nur-meine" data-wert="1">Meine Projekte</button><button class="seg-k${S.nurMeine ? "" : " an"}" data-aktion="nur-meine" data-wert="0">Alle</button></div></div>` : ""}</header>
      <section class="kpis">
        ${window.ABSCHNITTE.map((a) => {
          const l = laufend.filter((p) => p.phase >= a.von && p.phase <= a.bis);
          return `<a class="kpi" href="#/projekte?abschnitt=${a.id}"><span class="kpi-zahl">${l.length}</span><span class="kpi-titel">${esc(a.titel)}</span><span class="kpi-unter">Level ${zwei(a.von)}–${zwei(a.bis)}</span></a>`;
        }).join("")}
        <div class="kpi ${neu.length ? "alarm" : ""}"><span class="kpi-zahl">${neu.length}</span><span class="kpi-titel">Neu vom Kunden</span><span class="kpi-unter">${neu.length ? "Dateien warten" : "nichts Neues"}</span></div>
      </section>

      <div class="cockpit-raster">
        <section class="panel">
          <h2 class="panel-titel">Fällig ${faellig.length ? `<span class="zahl">${faellig.length}</span>` : ""}</h2>
          <ul class="liste">${faellig.length ? faellig.map((f) => `<li><a class="zeile" href="#/projekt/${f.p.id}">
            <span class="marker ${f.ueber ? "ueber" : "jetzt"}"></span>
            <span><span class="zeile-titel">${esc(f.text)}</span><span class="zeile-unter">${esc(anzeigeName(f.p))} · ${esc(f.unter)}</span></span>
            <span class="zeile-rechts ${f.ueber ? "ueberfaellig" : ""}">${f.ueber ? relativ(f.d) : "heute"}</span></a></li>`).join("")
            : `<li class="leer-hinweis">Nichts überfällig.</li>`}</ul>

          <h2 class="panel-titel abstand">Als Nächstes</h2>
          <ul class="liste">${queue.length ? queue.map(({ p, st }) => `<li><a class="zeile" href="#/projekt/${p.id}">
            <span class="lv-mini${st.komplett ? " bereit" : ""}">${zwei(p.phase)}</span>
            <span><span class="zeile-titel">${esc(naechsterSchritt(p))}</span><span class="zeile-unter">${esc(anzeigeName(p))} · ${esc(phase(p.phase).titel)}</span></span>
            <span class="zeile-rechts">${st.fertig}/${st.pflicht}</span></a></li>`).join("")
            : `<li class="leer-hinweis">Keine laufenden Projekte. <button class="btn klein" data-aktion="neu">+ Neue Anfrage</button></li>`}</ul>
        </section>

        <div class="spalte">
          <section class="panel">
            <h2 class="panel-titel">Neu vom Kunden ${neu.length ? `<span class="zahl">${neu.length}</span>` : ""}</h2>
            <ul class="liste">${Object.keys(neuNachProjekt).length ? Object.entries(neuNachProjekt).map(([pid, l]) => { const p = finde(pid); return `<li><a class="zeile" href="#/projekt/${pid}">
              <span class="marker jetzt"></span><span><span class="zeile-titel">${esc(anzeigeName(p))}</span><span class="zeile-unter">${l.length} ${l.length === 1 ? "Datei" : "Dateien"} · ${esc([...new Set(l.map((x) => katTitel(x.kategorie)))].join(", "))}</span></span>
              <span class="zeile-rechts">${fTermin(String(l[l.length - 1].am).slice(0, 10))}</span></a></li>`; }).join("")
              : `<li class="leer-hinweis">Hier landen Fotos und Unterlagen, die Kunden über ihren Link hochladen.</li>`}</ul>
          </section>
          ${istGF() ? teamPanel() : ""}
          <section class="panel">
            <h2 class="panel-titel">Termine · 14 Tage</h2>
            <ul class="liste">${termine.length ? termine.map((t) => `<li><a class="zeile" href="#/projekt/${t.p.id}">
              <span class="marker termin"></span><span><span class="zeile-titel">${esc(t.t.label)}</span><span class="zeile-unter">${esc(anzeigeName(t.p))}${t.p.kunde.ort ? " · " + esc(t.p.kunde.ort) : ""}</span></span>
              <span class="zeile-rechts">${esc(fTermin(t.s))}</span></a></li>`).join("") : `<li class="leer-hinweis">Keine Termine.</li>`}</ul>
          </section>
        </div>
      </div>

    </div>`;
  }

  /* Geschäftsführung: wer hat wie viel auf dem Tisch? */
  function teamPanel() {
    const aktiv = alle().filter((p) => p.status === "aktiv" || p.status === "pausiert");
    const zeilen = cfg().team.filter((m) => m.name).map((m) => {
      const l = m.ebene === "monteur" ? aktiv.filter((p) => (p.zugriff || []).includes(m.kuerzel)) : aktiv.filter((p) => experten(p).includes(m.kuerzel));
      return { m, l };
    }).filter((x) => x.m.ebene !== "geschaeftsfuehrung");
    const max = Math.max(1, ...zeilen.map((x) => x.l.length));
    return `<section class="panel"><h2 class="panel-titel">Team-Auslastung</h2>
      <ul class="auslastung">${zeilen.map(({ m, l }) => `<li><span class="kuerzel klein">${esc(m.kuerzel)}</span><span class="al-name">${esc(m.name)}<small>${esc(EBENE_TITEL[m.ebene] || "")}</small></span>
        <span class="al-balken"><span style="width:${Math.round((l.length / max) * 100)}%"></span></span><span class="al-zahl">${l.length}</span></li>`).join("")}</ul></section>`;
  }

  /* ================================================================
     Nachkalkulation je Heizung (nur Geschäftsführung)
     ================================================================ */
  function ansichtNachkalkulation(pid) {
    const p = finde(pid);
    if (!p || !istGF()) return `<div class="seite"><a class="btn" href="#/projekte">← zurück</a></div>`;
    const z = S.zahlen[p.id] || {}, g = geld(p), zu = !!g.abgeschlossen, dis = zu ? " disabled" : "";
    const zahl = (k, l, ph = "€", typ = "number") => `<div class="feld"><label for="nk-${k}">${l}</label><input class="eingabe" id="nk-${k}" type="${typ}" ${typ === "number" ? 'inputmode="decimal" min="0" step="any"' : ""} data-nk="${k}" value="${esc(z[k] ?? "")}" placeholder="${ph}"${dis}></div>`;
    const tab = (key, spalten, neu) => {
      const l = z[key] || [];
      return `<div class="tab-wrap"><table class="ff-tab"><thead><tr>${spalten.map((s2) => `<th>${s2[1]}</th>`).join("")}<th></th></tr></thead><tbody>
        ${l.map((row, i) => `<tr>${spalten.map(([sk, , typ, opts]) => `<td>${opts ? `<select class="eingabe" data-nk-tab="${key}" data-zeile="${i}" data-spalte="${sk}"${dis}><option value=""></option>${opts.map((o) => `<option${row[sk] === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>` : `<input class="eingabe" data-nk-tab="${key}" data-zeile="${i}" data-spalte="${sk}" value="${esc(row[sk] ?? "")}"${typ === "zahl" ? ' type="number" inputmode="decimal" step="any"' : ""}${dis}>`}</td>`).join("")}
          <td class="mitte">${zu ? "" : `<button class="btn klein still" data-aktion="nk-weg" data-tab="${key}" data-zeile="${i}" aria-label="Zeile entfernen">✕</button>`}</td></tr>`).join("") || `<tr><td colspan="${spalten.length + 1}" class="leise">Noch keine Einträge.</td></tr>`}</tbody></table></div>
        ${zu ? "" : `<button class="btn klein" data-aktion="nk-neu" data-tab="${key}">+ ${neu}</button>`}`;
    };
    const proPerson = {};
    (p.zeiten || []).forEach((x) => { proPerson[x.name] = (proPerson[x.name] || 0) + dauerMs(x) / 36e5; });
    const t = p.termine || {}, start = levelZeit(p, ersteNr), auftrag = levelZeit(p, 6), ende = abschlussZeit(p);
    const bs = datum(t.baustart), an = datum(t.abnahme);
    const h = (x) => `${(x || 0).toFixed(1).replace(".", ",")} h`;
    const abw = (ist, soll, einheit) => (soll ? `<small class="${ist > soll ? "schlecht" : "gut"}">${ist > soll ? "+" : ""}${einheit === "h" ? h(ist - soll) : eur(ist - soll)} ggü. Kalkulation</small>` : "");
    return `<div class="seite nachkalkulation" data-projekt="${p.id}">
      <header class="f-kopf panel"><a class="btn still" href="#/projekt/${p.id}">← ${esc(anzeigeName(p))}</a>
        <div class="f-titel"><p class="eyebrow">Nachkalkulation · nur Geschäftsführung${p.projektnr ? " · Nr. " + esc(p.projektnr) : ""}</p><h1>${esc(anzeigeName(p))}</h1></div>
        <div class="f-status">${zu ? `<span class="ok">✓ abgeschlossen ${fDatum(new Date(g.abgeschlossen))}</span>` : "in Arbeit"}</div>
        <div class="kopf-aktionen">${zu ? `<button class="btn" data-aktion="nk-oeffnen">Wieder öffnen</button>` : `<button class="btn jetzt" data-aktion="nk-abschliessen">Nachkalkulation abschließen</button>`}</div></header>
      <section class="kpis vier">
        <div class="kpi"><span class="kpi-zahl klein">${eur(g.umsatz || null)}</span><span class="kpi-titel">Umsatz</span><span class="kpi-unter">inkl. Nachträge</span></div>
        <div class="kpi"><span class="kpi-zahl klein">${eur(g.kosten || null)}</span><span class="kpi-titel">Kosten</span><span class="kpi-unter">Material, Lohn, Partner, Sonstiges</span></div>
        <div class="kpi"><span class="kpi-zahl klein">${g.umsatz && g.kosten ? eur(g.db) : "—"}</span><span class="kpi-titel">Deckungsbeitrag</span><span class="kpi-unter">Marge ${prozent(g.marge)}</span></div>
        <div class="kpi"><span class="kpi-zahl klein">${g.dbProStunde != null ? eur(g.dbProStunde) : "—"}</span><span class="kpi-titel">DB pro Stunde</span><span class="kpi-unter">${h(g.stunden)} gesamt</span></div>
      </section>
      <div class="cockpit-raster">
        <div class="spalte">
          <section class="panel"><h2 class="panel-titel">Erlöse</h2><div class="panel-innen felder">
            ${zahl("angebot", "Angebotssumme (netto)")}${zahl("auftrag", "Auftragswert (netto)")}${zahl("nachtraege", "Nachträge (netto)")}
            ${zahl("abschlag", "Abschlagsrechnung (netto)")}${zahl("abschlagBezahlt", "Abschlag bezahlt am", "", "date")}
            ${zahl("rechnung", "Schlussrechnung (netto, nach Abschlag)")}${zahl("rechnungBezahlt", "Schlussrechnung bezahlt am", "", "date")}</div></section>
          <section class="panel"><h2 class="panel-titel">Stunden eigener Mitarbeiter <small>aus dem Timer + Zusatzstunden</small></h2><div class="panel-innen">
            <dl class="infos">${Object.entries(proPerson).map(([n, x]) => `<dt>${esc(n)}</dt><dd>${h(x)} <small class="leise">(Timer)</small></dd>`).join("") || "<dt>Timer</dt><dd>noch keine Zeiten erfasst</dd>"}</dl>
            <p class="q-gruppe">Zusatzstunden (nicht gestempelt)</p>
            ${tab("extraStunden", [["wer", "Person", "", cfg().team.filter((m) => m.name).map((m) => m.name)], ["h", "Stunden", "zahl"], ["notiz", "Tätigkeit"]], "Stunden nachtragen")}
            <div class="felder abstand-o">${zahl("stundensatz", "Kostensatz je Stunde (€)", String((cfg().kalkulation || {}).stundensatz || "aus Einrichtung"))}${zahl("stundenSoll", "Kalkulierte Stunden (Angebot)", "h")}</div>
            <dl class="infos zahl-summe"><dt>Stunden gesamt</dt><dd>${h(g.stunden)} ${abw(g.stunden, g.stundenSoll, "h")}</dd><dt>Lohnkosten</dt><dd>${g.satz ? eur(g.lohn) : `<span class="leise">Kostensatz fehlt</span>`}</dd></dl></div></section>
        </div>
        <div class="spalte">
          <section class="panel"><h2 class="panel-titel">Externe Partner</h2><div class="panel-innen">
            ${tab("partnerZeiten", [["partner", "Partner", "", (cfg().partner || []).map((x) => x.firma)], ["gewerk", "Gewerk", "", Object.keys(cfg().gewerke || {})], ["h", "Stunden", "zahl"], ["kosten", "Kosten (€)", "zahl"]], "Partnerzeit")}
            <dl class="infos zahl-summe"><dt>Partner gesamt</dt><dd>${eur(g.partner || null)} · ${h(g.partnerH)}</dd></dl></div></section>
          <section class="panel"><h2 class="panel-titel">Material & Sonstiges</h2><div class="panel-innen">
            <div class="felder">${zahl("materialSoll", "Material kalkuliert (Angebot)")}${zahl("material", "Material tatsächlich")}</div>
            ${g.materialSoll ? `<p class="klein-text">${abw(g.material, g.materialSoll, "€")}</p>` : ""}
            <p class="q-gruppe">Sonstige Kosten</p>
            ${tab("sonstiges", [["text", "Wofür (z. B. Entsorgung, Fahrten)"], ["betrag", "Betrag (€)", "zahl"]], "Kostenposition")}</div></section>
          <section class="panel"><h2 class="panel-titel">Dauer</h2><dl class="infos panel-innen">
            <dt>Erstkontakt</dt><dd>${start ? fDatum(new Date(start)) : "—"}</dd>
            <dt>Auftrag</dt><dd>${auftrag ? `${fDatum(new Date(auftrag))} · nach ${tageText(tage(start, auftrag))}` : "—"}</dd>
            <dt>Bauzeit</dt><dd>${bs && an ? `${fDatum(bs)} – ${fDatum(an)} · ${tageText(tage(bs, an))}` : "—"}</dd>
            <dt>Abschluss</dt><dd>${ende ? `${fDatum(new Date(ende))} · gesamt ${tageText(tage(start, ende))}` : "läuft noch"}</dd></dl></section>
        </div>
      </div></div>`;
  }
  let nkTimer;
  async function nkSpeichern(p) {
    clearTimeout(nkTimer);
    nkTimer = setTimeout(async () => { try { await Daten.zahlenSpeichern(p.id, S.zahlen[p.id]); } catch (e) { toast("Nicht gespeichert", "fehler"); } }, 300);
  }

  /* ================================================================
     Kennzahlen (nur Geschäftsführung)
     ================================================================ */
  function ansichtKennzahlen(ordnerId) {
    const zr = S.kzZeitraum, jetzt = Date.now();
    const jahrStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    /* Zeitraum + Vergleichszeitraum gleicher Länge davor */
    const [ab, bis, vAb, vBis] = zr === "12m" ? [jetzt - 365 * TAG, jetzt, jetzt - 730 * TAG, jetzt - 365 * TAG]
      : zr === "jahr" ? [jahrStart, jetzt, jahrStart - 365 * TAG, jetzt - 365 * TAG] : [0, jetzt, null, null];
    const projekte = S.projekte.filter((p) => !p.geloescht);
    const erreicht = (p, nr) => p.status === "abgeschlossen" || p.phase >= nr || !!(p.level && p.level[nr]);

    function werte(von, bis2) {
      const fertig = projekte.filter((p) => p.status === "abgeschlossen" && (abschlussZeit(p) || 0) >= von && (abschlussZeit(p) || 0) < bis2);
      const anfragen = projekte.filter((p) => { const t = levelZeit(p, ersteNr) || 0; return t >= von && t < bis2; });
      const auftraege = anfragen.filter((p) => erreicht(p, 6));
      const abgesagt = anfragen.filter((p) => p.status === "verloren");
      const g = fertig.map(geld), mitK = g.filter((x) => x.umsatz && x.hatKosten);
      const umsatzK = mitK.reduce((a, x) => a + x.umsatz, 0), db = mitK.reduce((a, x) => a + x.db, 0);
      return {
        fertig, anfragen, auftraege, abgesagt,
        umsatz: g.reduce((a, x) => a + x.umsatz, 0), db: mitK.length ? db : null, marge: umsatzK ? db / umsatzK : null,
        proBad: schnitt(g.map((x) => x.umsatz || null)), kostenProBad: schnitt(mitK.map((x) => x.kosten)),
        quote: auftraege.length + abgesagt.length ? auftraege.length / (auftraege.length + abgesagt.length) : null,
        dauer: schnitt(fertig.map((p) => tage(levelZeit(p, ersteNr), abschlussZeit(p)))),
        dauerAuftrag: schnitt(auftraege.map((p) => tage(levelZeit(p, ersteNr), levelZeit(p, 6)))),
      };
    }
    const W = werte(ab, bis), V = vAb != null ? werte(vAb, vBis) : null;

    /* Pfeil zum Vorzeitraum; „besser“ hängt an der Kennzahl (kürzere Dauer = besser) */
    const delta = (jetztW, vorW, art = "mehr") => {
      if (!V || jetztW == null || vorW == null || vorW === 0) return "";
      const d = (jetztW - vorW) / Math.abs(vorW);
      if (Math.abs(d) < 0.005) return `<span class="delta gleich">± 0 %</span>`;
      const gut = art === "mehr" ? d > 0 : d < 0;
      return `<span class="delta ${gut ? "gut" : "schlecht"}">${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 100))} %</span>`;
    };
    const vgl = zr === "12m" ? "ggü. Vorjahreszeitraum" : zr === "jahr" ? "ggü. Vorjahr bis heute" : "";

    /* Bestand & Pipeline */
    const laufend = projekte.filter((p) => p.status === "aktiv" || p.status === "pausiert");
    const offeneAngebote = laufend.filter((p) => p.phase >= 4 && p.phase <= 5).reduce((a, p) => a + geld(p).angebot, 0);
    const bestand = laufend.filter((p) => p.phase >= 6).reduce((a, p) => a + (geld(p).auftrag || geld(p).angebot), 0);
    const monatsSchnitt = (() => { const w = werte(jetzt - 365 * TAG, jetzt); return w.umsatz / 12; })();
    const reichweite = monatsSchnitt ? bestand / monatsSchnitt : null;

    /* Jahresziel */
    const ziel = Number((cfg().ziele || {}).jahresumsatz) || 0;
    const istJahr = werte(jahrStart, jetzt).umsatz;
    const prognose = istJahr + bestand;
    const zielBalken = ziel ? `<div class="ziel">
        <div class="ziel-spur"><span class="ziel-ist" style="width:${Math.min(100, (istJahr / ziel) * 100)}%"></span><span class="ziel-bestand" style="width:${Math.max(0, Math.min(100 - (istJahr / ziel) * 100, (bestand / ziel) * 100))}%"></span></div>
        <div class="ziel-legende"><span><i class="ist"></i>Abgerechnet ${eur(istJahr)} · ${prozent(istJahr / ziel)}</span><span><i class="bestand"></i>Auftragsbestand ${eur(bestand)}</span><span>Ziel ${eur(ziel)} · Prognose ${prozent(prognose / ziel)}</span></div></div>`
      : `<p class="leise">Noch kein Jahresziel hinterlegt – unter Einrichtung → Ziele eintragen.</p>`;

    /* Offene Forderungen */
    const forderungen = [];
    projekte.forEach((p) => {
      const z = S.zahlen[p.id] || {};
      if (Number(z.abschlag) && !z.abschlagBezahlt) forderungen.push({ p, art: "Abschlag", betrag: Number(z.abschlag), seit: levelZeit(p, 10) });
      if (Number(z.rechnung) && !z.rechnungBezahlt) forderungen.push({ p, art: "Schlussrechnung", betrag: Number(z.rechnung), seit: levelZeit(p, 12) || abschlussZeit(p) });
    });
    forderungen.sort((a, b) => (a.seit || 0) - (b.seit || 0));
    const fSumme = forderungen.reduce((a, f) => a + f.betrag, 0);

    /* Vertriebstrichter */
    const stufen = [[ersteNr, "Anfrage"], [3, "Erstgespräch"], [5, "Angebot besprochen"], [6, "Auftrag"]];
    const trichter = [...stufen.map(([nr, l]) => ({ l, n: W.anfragen.filter((p) => erreicht(p, nr)).length })), { l: "Abgeschlossen", n: W.anfragen.filter((p) => p.status === "abgeschlossen").length }];
    const maxT = Math.max(1, trichter[0].n);

    /* Kapazität: nächste 8 Kalenderwochen */
    const montag = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const kw = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const t = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - t); const j = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - j) / TAG + 1) / 7); };
    const wochen = Array.from({ length: 8 }, (_, i) => { const s = montag(new Date()); s.setDate(s.getDate() + i * 7); return s; });
    const baustellen = laufend.filter((p) => (p.termine || {}).baustart).map((p) => {
      const s = datum(p.termine.baustart), e = datum(p.termine.abnahme) || plusTage(s, 14);
      return { p, s, e };
    });
    const zeilen = [...monteure().map((m) => ({ id: m.kuerzel, name: m.name })), { id: null, name: "ohne Monteur" }];
    const kap = zeilen.map((z) => ({ ...z, wochen: wochen.map((w) => { const we = plusTage(w, 7); return baustellen.filter((b) => b.s < we && b.e >= w && (z.id ? (b.p.zugriff || []).includes(z.id) : !monteure().some((m) => (b.p.zugriff || []).includes(m.kuerzel)))); }) })).filter((z) => z.id || z.wochen.some((l) => l.length));

    /* Zeit je Level, Umsatz je Monat, Kontaktwege */
    const proLevel = PHASEN.map((ph, i) => {
      const l = projekte.map((p) => { const a = levelZeit(p, ph.nr); if (!a || a < ab) return null; return tage(a, i < N - 1 ? levelZeit(p, PHASEN[i + 1].nr) : abschlussZeit(p)); }).filter((v) => v != null);
      return { ph, d: schnitt(l), n: l.length };
    });
    const maxL = Math.max(1, ...proLevel.map((x) => x.d || 0));
    const heuteM = new Date(); heuteM.setDate(1); heuteM.setHours(0, 0, 0, 0);
    const monate = Array.from({ length: 12 }, (_, i) => { const d = new Date(heuteM); d.setMonth(d.getMonth() - 11 + i); return { d, summe: 0, n: 0 }; });
    projekte.filter((p) => p.status === "abgeschlossen").forEach((p) => {
      const t = abschlussZeit(p); if (!t) return; const d = new Date(t);
      const m = monate.find((x) => x.d.getFullYear() === d.getFullYear() && x.d.getMonth() === d.getMonth());
      if (m) { m.summe += geld(p).umsatz; m.n++; }
    });
    const maxM = Math.max(1, ...monate.map((m) => m.summe));
    const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const wege = {};
    W.anfragen.forEach((p) => { const k = Formular.werteVon(p, "bestandsaufnahme").kontakt || "nicht erfasst"; const w = (wege[k] = wege[k] || { n: 0, auftrag: 0, verloren: 0 }); w.n++; if (erreicht(p, 6)) w.auftrag++; if (p.status === "verloren") w.verloren++; });
    const fehlend = W.fertig.filter((p) => !geld(p).umsatz).length;

    const kachel = (wert, titel, unter, d = "") => `<div class="kpi"><span class="kpi-zahl klein">${wert}</span><span class="kpi-titel">${titel} ${d}</span><span class="kpi-unter">${unter}</span></div>`;
    const K = {
      umsatz: kachel(eur(W.umsatz), "Umsatz", `${W.fertig.length} abgeschlossene Heizungen ${vgl ? "· " + vgl : ""}`, delta(W.umsatz, V && V.umsatz)),
      db: kachel(W.db != null ? eur(W.db) : "—", "Deckungsbeitrag", W.marge != null ? `Marge ${prozent(W.marge)}` : "Kosten fehlen", delta(W.marge, V && V.marge)),
      proBad: kachel(eur(W.proBad), "Ø Umsatz pro Heizung", `Ø Kosten ${eur(W.kostenProBad)}`, delta(W.proBad, V && V.proBad)),
      quote: kachel(W.quote != null ? prozent(W.quote) : "—", "Abschlussquote", `${W.auftraege.length} Aufträge · ${W.abgesagt.length} Absagen`, delta(W.quote, V && V.quote)),
      dauer: kachel(tageText(W.dauer), "Erstkontakt → Abschluss", "Ø Dauer je Heizung", delta(W.dauer, V && V.dauer, "weniger")),
      dauerAuftrag: kachel(tageText(W.dauerAuftrag), "Erstkontakt → Auftrag", "Ø bis zur Unterschrift", delta(W.dauerAuftrag, V && V.dauerAuftrag, "weniger")),
      bestand: kachel(eur(bestand), "Auftragsbestand", reichweite != null ? `reicht für ca. ${reichweite.toFixed(1).replace(".", ",")} Monate` : "Level 06–13, noch nicht abgerechnet"),
      forderungen: kachel(eur(fSumme), "Offene Forderungen", `${forderungen.length} Rechnungen unbezahlt`),
      angebote: kachel(eur(offeneAngebote), "Offene Angebote", "Level 04–05, noch nicht entschieden"),
    };
    const P = {
      ziel: `<section class="panel ziel-panel"><h2 class="panel-titel">Jahresziel ${new Date().getFullYear()}</h2><div class="panel-innen">${zielBalken}</div></section>`,
      kapazitaet: `<section class="panel"><h2 class="panel-titel">Kapazität · nächste 8 Wochen <small>laufende Baustellen je Monteur (Baustart bis Abnahme)</small></h2>
          <div class="tab-wrap ohne-rand"><table class="kap"><thead><tr><th></th>${wochen.map((w) => `<th>KW ${kw(w)}<small>${fKurz(w)}</small></th>`).join("")}</tr></thead>
          <tbody>${kap.map((z) => `<tr><th scope="row">${esc(z.name)}</th>${z.wochen.map((l) => `<td class="${l.length > 1 ? "voll" : l.length ? "belegt" : ""}">${l.map((b) => `<a href="#/projekt/${b.p.id}" title="${esc(anzeigeName(b.p))}">${esc(b.p.kunde.nachname)}</a>`).join("")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="9" class="leise">Keine geplanten Baustellen.</td></tr>`}</tbody></table></div>
          <p class="vb-max">Doppelt belegte Wochen sind markiert. Zuweisung im Projekt unter Akte → Team.</p></section>`,
      trichter: `<section class="panel"><h2 class="panel-titel">Vertriebstrichter <small>Anfragen im Zeitraum</small></h2>
            <ul class="hbalken trichter">${trichter.map((t, i) => `<li tabindex="0"><span class="hb-label">${esc(t.l)}</span><span class="hb-spur"><span class="hb-balken" style="width:${Math.max(t.n ? 2 : 0, (t.n / maxT) * 100)}%"></span></span>
              <span class="hb-wert">${t.n}</span><span class="tip">${i ? `${trichter[i - 1].n ? prozent(t.n / trichter[i - 1].n) : "—"} von „${esc(trichter[i - 1].l)}“` : `${t.n} Anfragen`}</span></li>`).join("")}</ul></section>`,
      forderungen: `<section class="panel"><h2 class="panel-titel">Offene Forderungen</h2>
            <table class="kz-tab"><tbody>${forderungen.slice(0, 8).map((f) => `<tr><td><a href="#/projekt/${f.p.id}">${esc(anzeigeName(f.p))}</a><br><small class="leise">${f.art}${f.seit ? ` · seit ${tageText(tage(f.seit, jetzt))}` : ""}</small></td><td class="r">${eur(f.betrag)}</td></tr>`).join("") || '<tr><td class="leise">Alles bezahlt.</td></tr>'}</tbody></table>
            ${forderungen.length > 8 ? `<p class="vb-max">+ ${forderungen.length - 8} weitere</p>` : ""}</section>`,
      zeitLevel: `<section class="panel"><h2 class="panel-titel">Wo die Zeit hingeht <small>Ø Tage je Level</small></h2>
          <ul class="hbalken">${proLevel.map((x) => `<li tabindex="0"><span class="hb-label">${zwei(x.ph.nr)} ${esc(x.ph.titel)}</span>
            <span class="hb-spur">${x.d != null ? `<span class="hb-balken" style="width:${Math.max(2, (x.d / maxL) * 100)}%"></span>` : ""}</span>
            <span class="hb-wert">${tageText(x.d)}</span><span class="tip">${x.n ? `${x.n} ${x.n === 1 ? "Projekt" : "Projekte"} · Ø ${tageText(x.d)}` : "noch keine Daten"}</span></li>`).join("")}</ul></section>`,
      umsatzMonat: `<section class="panel"><h2 class="panel-titel">Umsatz je Monat <small>abgeschlossene Heizungen, netto</small></h2>
            <div class="vbalken" aria-label="Umsatz je Monat">${monate.map((m) => `<div class="vb" tabindex="0"><span class="vb-spur"><span class="vb-balken" style="height:${m.summe ? Math.max(3, (m.summe / maxM) * 100) : 0}%"></span></span><span class="vb-monat">${MON[m.d.getMonth()]}</span>
              <span class="tip">${MON[m.d.getMonth()]} ${m.d.getFullYear()}: ${eur(m.summe)} · ${m.n} ${m.n === 1 ? "Heizung" : "Heizungen"}</span></div>`).join("")}</div>
            <p class="vb-max">Höchster Monat: ${eur(Math.max(...monate.map((m) => m.summe)))} · Ø ${eur(monatsSchnitt)}</p></section>`,
      wege: `<section class="panel"><h2 class="panel-titel">Woher die Anfragen kommen</h2>
            <table class="kz-tab"><thead><tr><th>Kontaktweg</th><th>Anfragen</th><th>Aufträge</th><th>Quote</th></tr></thead><tbody>
            ${Object.entries(wege).sort((a, b) => b[1].n - a[1].n).map(([k, w]) => `<tr><td>${esc(k)}</td><td>${w.n}</td><td>${w.auftrag}</td><td>${w.auftrag + w.verloren ? prozent(w.auftrag / (w.auftrag + w.verloren)) : "—"}</td></tr>`).join("") || '<tr><td colspan="4" class="leise">Noch keine Anfragen im Zeitraum.</td></tr>'}</tbody></table></section>`,
      nachkalkulation: (() => {
        const l = projekte.filter((p) => p.status === "abgeschlossen" || (p.status === "aktiv" && p.phase >= 6)).sort((a, b) => (abschlussZeit(b) || b.geaendert || 0) - (abschlussZeit(a) || a.geaendert || 0));
        const h = (x) => (x ? `${x.toFixed(1).replace(".", ",")} h` : "—");
        return `<section class="panel"><h2 class="panel-titel">Nachkalkulationen <small>je Heizung · Klick öffnet die Nachkalkulation</small></h2>
        <div class="tab-wrap ohne-rand"><table class="kz-tab breit"><thead><tr><th>Kunde</th><th>Status</th><th class="r">Stunden</th><th class="r">Lohn</th><th class="r">Partner</th><th class="r">Material</th><th class="r">Umsatz</th><th class="r">DB</th><th class="r">Marge</th><th class="r">DB/h</th></tr></thead><tbody>
        ${l.map((p) => { const g = geld(p); return `<tr><td><a href="#/projekt/${p.id}/nachkalkulation">${esc(anzeigeName(p))}</a></td><td>${g.abgeschlossen ? '<span class="gruen">✓ abgeschlossen</span>' : p.status === "abgeschlossen" ? '<span class="status-chip pausiert">offen</span>' : `Level ${zwei(p.phase)}`}</td>
          <td class="r">${h(g.stunden)}</td><td class="r">${g.lohn ? eur(g.lohn) : "—"}</td><td class="r">${g.partner ? eur(g.partner) : "—"}</td><td class="r">${g.material ? eur(g.material) : "—"}</td><td class="r">${eur(g.umsatz || null)}</td><td class="r">${g.umsatz && g.hatKosten ? eur(g.db) : "—"}</td><td class="r">${prozent(g.marge)}</td><td class="r">${g.dbProStunde != null ? eur(g.dbProStunde) : "—"}</td></tr>`; }).join("") || '<tr><td colspan="10" class="leise">Noch keine Aufträge.</td></tr>'}</tbody></table></div></section>`;
      })(),
      fertig: `<section class="panel"><h2 class="panel-titel">Abgeschlossene Heizungen</h2>
        <div class="tab-wrap ohne-rand"><table class="kz-tab breit"><thead><tr><th>Kunde</th><th>Erstkontakt</th><th>Abschluss</th><th>Dauer</th><th class="r">Umsatz</th><th class="r">Kosten</th><th class="r">Deckungsbeitrag</th><th class="r">Marge</th></tr></thead><tbody>
        ${W.fertig.sort((a, b) => abschlussZeit(b) - abschlussZeit(a)).map((p) => { const g = geld(p), a = levelZeit(p, ersteNr), e = abschlussZeit(p); return `<tr><td><a href="#/projekt/${p.id}/nachkalkulation">${esc(anzeigeName(p))}</a></td><td>${a ? fDatum(new Date(a)) : "—"}</td><td>${e ? fDatum(new Date(e)) : "—"}</td><td>${tageText(tage(a, e))}</td>
          <td class="r">${eur(g.umsatz || null)}</td><td class="r">${eur(g.kosten || null)}</td><td class="r">${g.umsatz && g.hatKosten ? eur(g.db) : "—"}</td><td class="r">${prozent(g.marge)}</td></tr>`; }).join("") || '<tr><td colspan="8" class="leise">Im Zeitraum wurde noch keine Heizung abgeschlossen.</td></tr>'}</tbody></table></div></section>`,
    };
    const kurz = (n) => (n == null || isNaN(n) ? "—" : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1).replace(".", ",")} T€` : eur(n));
    const gesamtStunden = projekte.reduce((a, p) => a + geld(p).stunden, 0), mitStunden = projekte.filter((p) => geld(p).stunden > 0).length;
    const ORDNER = [
      { id: "finanzen", titel: "Finanzen", vorschau: [["Umsatz", kurz(W.umsatz)], ["Marge", prozent(W.marge)], ["Bestand", kurz(bestand)], ["Offen", kurz(fSumme)]],
        inhalt: () => `${P.ziel}<section class="kpis vier">${K.umsatz}${K.db}${K.proBad}${K.bestand}</section><div class="cockpit-raster">${P.umsatzMonat}<div class="spalte">${K.forderungen}${P.forderungen}</div></div>` },
      { id: "vertrieb", titel: "Vertrieb", vorschau: [["Quote", W.quote != null ? prozent(W.quote) : "—"], ["Anfragen", String(W.anfragen.length)], ["Aufträge", String(W.auftraege.length)], ["Angebote", kurz(offeneAngebote)]],
        inhalt: () => `<section class="kpis vier">${K.quote}${K.angebote}</section><div class="cockpit-raster">${P.trichter}${P.wege}</div>` },
      { id: "zeit", titel: "Zeit & Ablauf", vorschau: [["bis Abschluss", tageText(W.dauer)], ["bis Auftrag", tageText(W.dauerAuftrag)], ["Langsamstes", (proLevel.slice().sort((a, b) => (b.d || 0) - (a.d || 0))[0] || {}).ph ? zwei(proLevel.slice().sort((a, b) => (b.d || 0) - (a.d || 0))[0].ph.nr) : "—"], ["Projekte", String(W.fertig.length)]],
        inhalt: () => `<section class="kpis vier">${K.dauer}${K.dauerAuftrag}</section>${P.zeitLevel}` },
      { id: "kapazitaet", titel: "Kapazität & Team", vorschau: [["Baustellen", String(baustellen.length)], ["Monteure", String(monteure().length)], ["Doppelt", String(kap.reduce((a, z) => a + z.wochen.filter((l) => l.length > 1).length, 0))], ["Laufend", String(laufend.length)]],
        inhalt: () => `${P.kapazitaet}${teamPanel()}` },
      { id: "ziele", titel: "Ziele & Kalkulation", vorschau: [["Umsatzziel", (cfg().ziele || {}).jahresumsatz ? kurz((cfg().ziele || {}).jahresumsatz) : "—"], ["Kostensatz", (cfg().kalkulation || {}).stundensatz ? geld((cfg().kalkulation || {}).stundensatz) + "/h" : "—"]],
        inhalt: () => zieleFormular() },
      { id: "nachkalkulation", titel: "Nachkalkulation", vorschau: [["Stunden", gesamtStunden ? Math.round(gesamtStunden) + " h" : "—"], ["Ø pro Heizung", mitStunden ? (gesamtStunden / mitStunden).toFixed(1).replace(".", ",") + " h" : "—"], ["DB", W.db != null ? kurz(W.db) : "—"], ["Offen", String(projekte.filter((p) => p.status === "abgeschlossen" && !geld(p).abgeschlossen).length)]],
        inhalt: () => `${P.nachkalkulation}${P.fertig}` },
    ];
    const zeitraum = `<div class="seg" role="radiogroup" aria-label="Zeitraum">${[["12m", "12 Monate"], ["jahr", "Dieses Jahr"], ["alle", "Gesamt"]].map(([id, l]) => `<button class="seg-k${zr === id ? " an" : ""}" data-aktion="kz-zeitraum" data-wert="${id}" role="radio" aria-checked="${zr === id}">${l}</button>`).join("")}</div>`;
    const offen = ORDNER.find((o) => o.id === ordnerId);
    const hinweis = fehlend ? `<p class="luecken">${fehlend} abgeschlossene${fehlend === 1 ? " Heizung hat" : " Heizungen haben"} noch keine Umsatzzahlen – in der Nachkalkulation des Bads eintragen.</p>` : "";
    if (offen) return `<div class="seite kennzahlen">
      <header class="kopf"><div><p class="eyebrow"><a href="#/kennzahlen">Unternehmen</a> / Ordner</p><h1>${esc(offen.titel)}</h1></div><div class="kopf-aktionen">${zeitraum}</div></header>
      ${hinweis}${offen.inhalt()}</div>`;
    return `<div class="seite kennzahlen">
      <header class="kopf"><div><p class="eyebrow">Nur für die Geschäftsführung</p><h1>Unternehmen</h1></div><div class="kopf-aktionen">${zeitraum}</div></header>
      ${hinweis}
      <section class="ordner-raster">${ORDNER.map((o) => `<a class="app-ordner" href="#/kennzahlen/${o.id}">
        <span class="ao-kachel">${o.vorschau.map(([l, v]) => `<span class="ao-mini"><b>${esc(v)}</b><small>${esc(l)}</small></span>`).join("")}</span>
        <span class="ao-titel">${esc(o.titel)}</span></a>`).join("")}</section>
    </div>`;
  }

  /* ================================================================
     Monteur: Meine Baustellen
     ================================================================ */
  function ansichtBaustellen() {
    const liste = alle().filter((p) => p.status !== "verloren").sort((a, b) => String((a.termine || {}).baustart || "9").localeCompare(String((b.termine || {}).baustart || "9")));
    return `<div class="seite"><header class="kopf"><div><p class="eyebrow">${esc(S.ich.name)} · Monteur</p><h1>Meine Baustellen</h1></div></header>
      ${liste.length ? `<div class="karten">${liste.map((p) => {
        const k = p.kunde, st = phaseStatus(p, p.phase);
        const meine = st.liste.filter((x) => !x.erledigt && darfSchritt(x.s));
        return `<article class="panel einsatz-karte"><header><span class="lv-mini">${zwei(p.phase)}</span><div><h2>${esc(anzeigeName(p))}</h2><p>${esc(adr(k))}</p></div></header>
          <dl class="infos"><dt>Baustart</dt><dd>${esc(fTermin((p.termine || {}).baustart) || "—")}</dd><dt>Abnahme</dt><dd>${esc(fTermin((p.termine || {}).abnahme) || "—")}</dd><dt>Telefon</dt><dd>${[k.telefon, k.mobil].filter(Boolean).map((x) => `<a href="tel:${esc(x.replace(/[^\d+]/g, ""))}">${esc(x)}</a>`).join(" · ") || "—"}</dd></dl>
          ${meine.length ? `<p class="q-gruppe">Für dich offen</p><ul class="einfach">${meine.map((x) => `<li>${esc(ersetzen(x.s.titel, p))}</li>`).join("")}</ul>` : ""}
          <footer class="aktionen"><a class="btn voll" href="#/projekt/${p.id}">Öffnen <span class="pfeil">→</span></a>${p.downloadCode ? `<button class="btn" data-aktion="palettemove" data-id="${p.id}">3D-Planung (${esc(cfg().programme.app3d)})</button>` : ""}
          ${k.strasse ? `<a class="btn still" href="https://maps.google.com/?q=${encodeURIComponent(adr(k))}" target="_blank" rel="noopener">Route</a>` : ""}</footer></article>`;
      }).join("")}</div>` : `<div class="panel startfeld"><h2>Keine Baustellen</h2><p>Sobald dich das Büro einer Baustelle zuweist, erscheint sie hier.</p></div>`}</div>`;
  }

  /* ================================================================
     Externer Partner: Meine Einsätze
     ================================================================ */
  function ansichtEinsaetze() {
    const liste = S.projekte.filter((p) => p.status !== "verloren");
    return `<div class="seite"><header class="kopf"><div><p class="eyebrow">${esc(S.ich.name)} · ${esc(S.ich.gewerk || "Partner")}</p><h1>Meine Einsätze</h1></div></header>
      ${liste.length ? `<div class="karten">${liste.map((p) => `<a class="panel einsatz-karte link" href="#/projekt/${p.id}">
        <header><span class="lv-mini${p.meldung && p.meldung.erledigt ? " bereit" : ""}">${p.meldung && p.meldung.erledigt ? "✓" : zwei(p.phase)}</span><div><h2>${esc(anzeigeName(p))}</h2><p>${esc(adr(p.kunde))}</p></div></header>
        <dl class="infos"><dt>Baustart</dt><dd>${esc(fTermin(p.termine.baustart) || "noch offen")}</dd><dt>Status</dt><dd>${p.meldung ? (p.meldung.erledigt ? "Erledigt gemeldet" : "Rückmeldung gesendet") : "Offen"}</dd></dl></a>`).join("")}</div>`
        : `<div class="panel startfeld"><h2>Keine Einsätze</h2><p>Sobald Sie einer Baustelle zugewiesen werden, erscheint es hier.</p></div>`}</div>`;
  }
  function ansichtEinsatz(id) {
    const p = S.projekte.find((x) => x.id === id);
    if (!p) return `<div class="seite"><a class="btn" href="#/cockpit">← Meine Einsätze</a></div>`;
    const k = p.kunde, c = cfg();
    const ctx = { firma: c, dateien: dateienVon(p.id), kopfzeile: anzeigeName(p) };
    const forms = Object.keys(p.formulare || {}).filter((f) => Formular.def(f));
    return `<div class="seite einsatz" data-projekt="${p.id}">
      <header class="p-kopf"><div><p class="eyebrow"><a href="#/cockpit">Meine Einsätze</a> / ${esc(S.ich.gewerk || "")}</p><h1>${esc(anzeigeName(p))}</h1>
        <div class="p-kontakt"><span>${esc(adr(k))}</span>${k.strasse ? `<a href="https://maps.google.com/?q=${encodeURIComponent(adr(k))}" target="_blank" rel="noopener">Route</a>` : ""}
        ${[k.telefon, k.mobil].filter(Boolean).map((x) => `<a href="tel:${esc(x.replace(/[^\d+]/g, ""))}">${esc(x)}</a>`).join("")}</div></div></header>
      <div class="arbeit">
        <div class="spalte">
          <section class="panel"><h2 class="panel-titel">Unterlagen für Ihr Gewerk</h2>
            <div class="einsatz-docs">${forms.length ? forms.map((f) => Formular.druck(f, p, ctx)).join("") : '<p class="leer-hinweis">Noch keine Unterlagen freigegeben.</p>'}</div></section>
          ${(() => { const o = ordnerFuer(p, S.ich.id, "partner").filter((k) => k !== "baustelle"); return o.length ? `<section class="panel"><h2 class="panel-titel">Freigegebene Ordner</h2><div class="panel-innen">${o.map((k) => `<p class="q-gruppe">${esc(katTitel(k))}</p>${ablage(p, k)}`).join("")}</div></section>` : ""; })()}
        </div>
        <div class="spalte">
          <section class="panel"><h2 class="panel-titel">Termine</h2><dl class="infos panel-innen"><dt>Baustart</dt><dd>${esc(fTermin(p.termine.baustart) || "noch offen")}</dd><dt>Abnahme</dt><dd>${esc(fTermin(p.termine.abnahme) || "—")}</dd><dt>Ansprechpartner</dt><dd>${esc(namen("projektleiter"))} · <a href="tel:${esc(String(c.telefon).replace(/[^\d+]/g, ""))}">${esc(c.telefon)}</a></dd></dl></section>
          ${ordnerFuer(p, S.ich.id, "partner").includes("baustelle") ? `<section class="panel"><h2 class="panel-titel">Fotos von der Baustelle</h2><div class="panel-innen">${ablage(p, "baustelle")}</div></section>` : ""}
          <section class="panel"><h2 class="panel-titel">Rückmeldung ans Büro</h2><div class="panel-innen">
            ${p.meldung ? `<p class="${p.meldung.erledigt ? "gruen" : ""}"><b>${p.meldung.erledigt ? "✓ Erledigt gemeldet" : "Rückmeldung gesendet"}</b> am ${fKurz(new Date(p.meldung.am))}${p.meldung.notiz ? ` – ${esc(p.meldung.notiz)}` : ""}</p>` : ""}
            <textarea class="eingabe" id="meldung-text" rows="3" placeholder="Hinweis fürs Büro (optional) – z. B. Material fehlt, Termin verschoben …"></textarea>
            <div class="aktionen"><button class="btn jetzt" data-aktion="melden" data-erledigt="1">Gewerk erledigt melden</button><button class="btn" data-aktion="melden" data-erledigt="0">Nur Hinweis senden</button></div></div></section>
        </div></div></div>`;
  }

  /* ================================================================
     Projekte
     ================================================================ */
  function ansichtProjekte() {
    if (!alle().length) {
      return `<div class="seite"><header class="kopf"><div><p class="eyebrow">Projekte</p><h1>Noch leer</h1></div></header>
        <div class="panel startfeld"><h2>Die erste Anfrage anlegen</h2>
          <p>Jede Heizung läuft als Projekt durch ${N} Level. Leg eine echte Anfrage an – oder probier das Dashboard erst mit Beispielprojekten aus (lassen sich unter „Einrichtung“ wieder entfernen).</p>
          <div class="aktionen"><button class="btn jetzt" data-aktion="neu">+ Neue Anfrage</button><button class="btn" data-aktion="demo">Beispielprojekte laden</button></div></div></div>`;
    }
    const f = S.filter;
    return `<div class="seite">
      <header class="kopf"><div><p class="eyebrow">Projekte</p><h1>Alle Heizungen</h1></div>
        <div class="kopf-aktionen">${istBuero() ? `<button class="btn jetzt" data-aktion="neu">+ Neue Anfrage</button>` : ""}<div class="seg reiter" role="tablist">${[["offen", "In Bearbeitung"], ["abgeschlossen", "Abgeschlossen"], ["verloren", "Abgesagt"], ...(istGF() ? [["papierkorb", "Papierkorb"]] : [])].map(([id, l]) => {
          const n = id === "papierkorb" ? papierkorb().length : alle().filter((p) => (id === "offen" ? p.status === "aktiv" || p.status === "pausiert" : p.status === id)).length;
          return `<button class="seg-k${(f.status === id || (id === "offen" && !["abgeschlossen", "verloren", "papierkorb"].includes(f.status))) ? " an" : ""}" role="tab" data-aktion="projekte-reiter" data-wert="${id}">${l} <small>${n}</small></button>`; }).join("")}</div></div></header>
      <div class="werkzeuge">
        <input class="eingabe feld-suche" type="search" placeholder="Name, Ort, Projektnummer …" data-filter="suche" value="${esc(f.suche)}" aria-label="Suchen">
        <select class="eingabe auto" data-filter="abschnitt" aria-label="Abschnitt"><option value="">Alle Abschnitte</option>${opt(window.ABSCHNITTE.map((a) => ({ id: a.id, label: a.titel })), f.abschnitt)}</select>
        <select class="eingabe auto" data-filter="wer" aria-label="Zuständig"><option value="">Alle Zuständigen</option>${opt(kuerzelListe(), f.wer)}</select>
      </div>
      <div id="projektliste">${projektListe()}</div></div>`;
  }
  const papierkorb = () => S.projekte.filter((p) => typeof p.geloescht === "number" && Date.now() - p.geloescht < 30 * TAG);
  function projektListe() {
    const f = S.filter, q = f.suche.trim().toLowerCase();
    if (f.status === "papierkorb" && istGF()) {
      const l = papierkorb();
      return `<section class="abschnitt"><div class="abschnitt-kopf"><h2>Papierkorb</h2><span class="phasen">gelöschte Projekte, 30 Tage wiederherstellbar</span><span class="anzahl">${l.length}</span></div>
        ${l.map((p) => `<div class="projekt-zeile"><span><span class="p-name">${esc(anzeigeName(p))}</span><br><span class="p-ort">${esc([p.projektnr, p.kunde.ort].filter(Boolean).join(" · ") || "—")}</span></span>
          <span class="p-phase">Gelöscht am ${fDatum(new Date(p.geloescht))}<small>Level ${zwei(p.phase)} · ${esc(phase(p.phase).titel)}</small></span><span></span><span></span>
          <button class="btn klein" data-aktion="wiederherstellen" data-id="${p.id}">Wiederherstellen</button></div>`).join("") || '<p class="leer-hinweis">Der Papierkorb ist leer.</p>'}</section>`;
    }
    const liste = alle().filter((p) => {
      if (f.status === "offen" && !(p.status === "aktiv" || p.status === "pausiert")) return false;
      if (f.status !== "offen" && f.status !== "alle" && p.status !== f.status) return false;
      if (f.wer && !experten(p).includes(f.wer)) return false;
      if (q && ![p.kunde.nachname, p.kunde.vorname, p.kunde.ort, p.projektnr, p.kunde.strasse, p.kunde.hausnr].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    if (!liste.length) return `<p class="leer-hinweis">Keine Projekte für diese Auswahl.</p>`;
    if (f.status === "abgeschlossen" || f.status === "verloren") {
      const fertig = f.status === "abgeschlossen";
      const sortiert = liste.sort((a, b) => (fertig ? (abschlussZeit(b) || 0) - (abschlussZeit(a) || 0) : (b.geaendert || 0) - (a.geaendert || 0)));
      return `<section class="abschnitt"><div class="abschnitt-kopf"><h2>${fertig ? "Abgeschlossene Heizungen" : "Abgesagte Anfragen"}</h2><span class="anzahl">${sortiert.length}</span></div>
        ${sortiert.map((p) => { const a = levelZeit(p, ersteNr), e = fertig ? abschlussZeit(p) : p.geaendert; return `<a class="projekt-zeile" href="#/projekt/${p.id}">
          <span><span class="p-name">${esc(anzeigeName(p))}</span>${p.demo ? `<span class="status-chip">Beispiel</span>` : ""}<br><span class="p-ort">${esc([p.projektnr, p.kunde.ort].filter(Boolean).join(" · ") || "—")}</span></span>
          <span class="p-phase">${fertig ? "Abgeschlossen" : `Abgesagt in Level ${zwei(p.phase)}`}<small>${a ? "Erstkontakt " + fDatum(new Date(a)) : ""}${e ? ` · ${fertig ? "fertig" : "zuletzt"} ${fDatum(new Date(e))}` : ""}${fertig && a && e ? ` · ${tageText(tage(a, e))}` : ""}</small></span>
          ${fliesen(p)}<span class="p-termin">${(p.zeiten || []).length ? stunden((p.zeiten || []).reduce((x, z) => x + dauerMs(z), 0)) : ""}</span>
          <span class="kuerzel" title="Zuständig">${esc(p.zustaendig || "–")}</span></a>`; }).join("")}</section>`;
    }
    return window.ABSCHNITTE.filter((a) => !f.abschnitt || a.id === f.abschnitt).map((a) => {
      const teil = liste.filter((p) => p.phase >= a.von && p.phase <= a.bis).sort((x, y) => y.phase - x.phase || x.kunde.nachname.localeCompare(y.kunde.nachname, "de"));
      if (!teil.length) return "";
      return `<section class="abschnitt"><div class="abschnitt-kopf"><h2>${esc(a.titel)}</h2><span class="phasen">Level ${a.von}–${a.bis}</span><span class="anzahl">${teil.length}</span></div>
        ${teil.map((p) => {
          const st = phaseStatus(p, p.phase);
          const neu = dateienVon(p.id).filter((d) => d.neu).length;
          return `<a class="projekt-zeile" href="#/projekt/${p.id}">
            <span><span class="p-name">${esc(anzeigeName(p))}</span>${p.status !== "aktiv" ? `<span class="status-chip ${p.status}">${esc(STATUS.find((s) => s.id === p.status)?.label)}</span>` : ""}${p.demo ? `<span class="status-chip">Beispiel</span>` : ""}${neu ? `<span class="status-chip neu">${neu} neu</span>` : ""}<br><span class="p-ort">${esc([p.projektnr, p.kunde.ort].filter(Boolean).join(" · ") || "—")}</span></span>
            <span class="p-phase">${zwei(p.phase)} ${esc(phase(p.phase).titel)}<small>${esc(naechsterSchritt(p))}</small></span>
            ${fliesen(p)}
            <span class="p-termin">${st.fertig}/${st.pflicht} Schritte</span>
            <span class="kuerzel" title="Zuständig">${esc(p.zustaendig || "–")}</span></a>`;
        }).join("")}</section>`;
    }).join("");
  }

  /* ================================================================
     Projekt — die Spielfläche
     ================================================================ */
  function ansichtProjekt(id) {
    const p = finde(id);
    if (!p) return `<div class="seite"><header class="kopf"><div><p class="eyebrow">Projekt</p><h1>Nicht gefunden</h1></div></header><a class="btn" href="#/projekte">← Zu den Projekten</a></div>`;
    const nr = S.ansicht[id] && S.ansicht[id] <= p.phase ? S.ansicht[id] : p.phase;
    S.ansicht[id] = nr;
    return `<div class="seite projekt${gesperrt(p) ? " schreibschutz" : ""}" data-projekt="${p.id}">
      ${sperrBanner(p)}
      ${projektKopf(p)}
      <nav class="karte" aria-label="Level">${levelKarte(p, nr)}</nav>
      <div class="arbeit">
        <div id="mission">${mission(p, nr)}</div>
        <aside class="akte" id="akte">${akte(p)}</aside>
      </div></div>`;
  }
  function projektKopf(p) {
    const k = p.kunde;
    const tel = [k.telefon, k.mobil, k.telefonGeschaeft].filter(Boolean);
    const neu = dateienVon(p.id).filter((d) => d.neu).length;
    return `<header class="p-kopf">
      <div><p class="eyebrow"><a href="#/projekte">Projekte</a> / ${p.projektnr ? "Nr. " + esc(p.projektnr) + " · " : ""}Level ${zwei(p.phase)} von ${N}${p.status !== "aktiv" ? " · " + esc(STATUS.find((s) => s.id === p.status)?.label) : ""}</p>
        <h1>${esc(anzeigeName(p))}</h1>
        <div class="p-kontakt">
          ${k.strasse || k.ort ? `<span>${esc(adr(k))}</span>` : ""}
          ${tel.map((t) => `<a href="tel:${esc(t.replace(/[^\d+]/g, ""))}">${esc(t)}</a>`).join("")}
          ${k.email && istBuero() ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ""}
          ${p.zustaendig ? `<span class="kuerzel klein" title="Zuständig">${esc(p.zustaendig)}</span>` : ""}
        </div></div>
      <div class="kopf-aktionen">
        <span class="timer-box" id="timer-box">${timerHtml(p)}</span>
        ${neu && istBuero() ? `<button class="btn jetzt" data-aktion="akte-tab" data-tab="dateien">${neu} neu vom Kunden</button>` : ""}
        ${istBuero() ? `<button class="btn" data-aktion="kundenlink">Kundenlink</button>` : ""}
        ${p.downloadCode ? `<button class="btn" data-aktion="palettemove" title="Code kopieren und PaletteMove öffnen">3D in ${esc(cfg().programme.app3d)}</button>` : ""}
        ${istGF() ? `<button class="btn still gefahr" data-aktion="loeschen">Löschen</button>` : ""}
      </div></header>`;
  }
  function levelKarte(p, ansicht) {
    const i = phaseIndex(p.phase), fertigAlle = p.status === "abgeschlossen";
    return `<ol class="levels">${PHASEN.map((ph, k) => {
      const z = fertigAlle || k < i ? "fertig" : k === i ? "jetzt" : "zu";
      return `<li class="lv ${z}${ph.nr === ansicht ? " ansicht" : ""}">
        <button type="button" data-aktion="level" data-nr="${ph.nr}" ${z === "zu" ? 'aria-disabled="true"' : ""} title="${zwei(ph.nr)} ${esc(ph.titel)}${z === "zu" ? " – noch gesperrt" : ""}">
          <span class="lv-knoten">${z === "fertig" ? "✓" : z === "zu" ? '<span class="schloss" aria-hidden="true"></span>' : zwei(ph.nr)}</span>
          <span class="lv-titel">${esc(ph.titel)}</span></button></li>`;
    }).join("")}</ol>`;
  }

  function mission(p, nr) {
    const ph = phase(nr);
    const st = phaseStatus(p, nr);
    const istJetzt = nr === p.phase && p.status !== "abgeschlossen";
    const prozent = st.pflicht ? Math.round((st.fertig / st.pflicht) * 100) : 100;
    const weiter = naechsteNr(nr);
    return `<section class="mission panel${istJetzt ? "" : " vergangen"}">
      <header class="mission-kopf">
        <span class="mission-nr">${zwei(nr)}</span>
        <div><p class="eyebrow">${istJetzt ? "Aktuelles Level" : "Abgeschlossenes Level"} · ${esc(window.ABSCHNITTE.find((a) => nr >= a.von && nr <= a.bis).titel)}</p>
          <h2>${esc(ph.titel)}</h2><p class="mission-ziel">${esc(ersetzen(ph.ziel))}</p></div>
        <div class="fortschritt" role="progressbar" aria-valuenow="${prozent}" aria-valuemin="0" aria-valuemax="100" aria-label="Fortschritt">
          <span class="fs-zahl">${st.fertig}<small>/${st.pflicht}</small></span><span class="fs-balken"><span style="width:${prozent}%"></span></span></div>
      </header>
      <ol class="quests">${st.liste.map((x, k) => quest(p, nr, x, k)).join("")}</ol>
      <footer class="mission-fuss">${istJetzt && !istBuero()
        ? `<span class="offen-text">${st.komplett ? "Alles erledigt – das Büro schaltet das nächste Level frei." : `Noch offen: ${st.offen.map((x) => esc(ersetzen(x.s.titel, p))).join(" · ")}`}</span>`
        : istJetzt
        ? (st.komplett
          ? `<span class="bereit-text">Alles erledigt – Level freischalten.</span><button class="btn jetzt gross" data-aktion="abschliessen">${weiter ? `Weiter zu Level ${zwei(weiter)}: ${esc(phase(weiter).titel)}` : "Projekt abschließen & archivieren"} <span class="pfeil">→</span></button>`
          : `<span class="offen-text">Noch offen: ${st.offen.map((x) => esc(ersetzen(x.s.titel, p))).join(" · ")}</span><button class="btn gross gesperrt" data-aktion="offen-zeigen">${weiter ? `Weiter zu Level ${zwei(weiter)}` : "Projekt abschließen"} <span class="schloss-mini" aria-hidden="true"></span></button>`)
        : `<span class="offen-text">Dieses Level ist abgeschlossen. Änderungen bleiben möglich.</span><button class="btn voll" data-aktion="level" data-nr="${p.phase}">Zum aktuellen Level ${zwei(p.phase)}</button>`}
      </footer></section>`;
  }

  function quest(p, nr, x, k) {
    const s = x.s, key = sKey(nr, s), st = schrittStand(p, nr, s);
    const titel = ersetzen(s.titel, p);
    let inhalt = "", meta = "";
    switch (s.typ) {
      case "formular": {
        const fs = Formular.status(s.formular, p, dateienVon(p.id));
        meta = fs.vollstaendig ? "vollständig" : fs.begonnen ? `${fs.ok} von ${fs.gesamt} Pflichtfeldern` : "noch nicht begonnen";
        inhalt = `<div class="q-aktion"><a class="btn ${x.erledigt ? "" : "voll"}" href="#/projekt/${p.id}/formular/${s.formular}">${fs.begonnen ? "Formular bearbeiten" : "Formular ausfüllen"} <span class="pfeil">→</span></a>
          ${fs.begonnen ? `<button class="btn still" data-aktion="drucken" data-formular="${s.formular}">Drucken</button>` : ""}</div>`;
        break;
      }
      case "dateien": {
        const n = dateienVon(p.id, s.kategorie).length;
        meta = st.ersatz ? `abgehakt: ${esc(st.ersatz)}` : `${n}${s.min > 1 ? ` von ${s.min}` : ""} ${n === 1 ? "Datei" : "Dateien"} in „${esc(katTitel(s.kategorie))}“`;
        inhalt = `${s.vorlage ? `<div class="q-vorlagen">${s.vorlage.map((v) => `<a class="btn klein" href="${esc(v.datei)}" target="_blank" rel="noopener">↓ ${esc(v.titel)}</a>`).join("")}</div>` : ""}
          ${ablage(p, s.kategorie, true)}
          <div class="q-unter">${s.kundenlink ? `<button class="btn klein" data-aktion="kundenlink">Kundenlink kopieren</button>` : ""}
          ${s.ersatz && !n ? (st.ersatz ? `<button class="btn klein still" data-aktion="ersatz-weg" data-key="${key}">Rückgängig</button>` : `<button class="btn klein still" data-aktion="ersatz" data-key="${key}" data-text="${esc(s.ersatz)}">Ohne Dateien abhaken: ${esc(s.ersatz)}</button>`) : ""}</div>`;
        break;
      }
      case "termin": {
        const def = TERMINE.find((t) => t.key === s.termin);
        const v = (p.termine || {})[s.termin] || "";
        meta = v ? fTermin(v) : "noch kein Termin";
        inhalt = `<div class="q-aktion"><input class="eingabe auto" type="${def.typ}" data-termin="${s.termin}" value="${esc(v)}" aria-label="${esc(def.label)}">${v ? `<button class="btn klein" data-aktion="ics" data-termin-key="${s.termin}" title="Termin als Kalendereintrag für Outlook">📅 In Outlook-Kalender</button>` : ""}</div>`;
        break;
      }
      case "mail": {
        const am = (p.mails || {})[s.mail];
        meta = am ? `gesendet ${fKurz(new Date(am))}` : "noch nicht gesendet";
        inhalt = `<div class="q-aktion"><button class="btn ${am ? "" : "voll"}" data-aktion="mail" data-mail="${s.mail}">${am ? "Erneut öffnen" : "Mail schreiben"} <span class="pfeil">→</span></button></div>`;
        break;
      }
      case "erledigt":
        meta = st.erledigt ? `bestätigt ${fKurz(new Date(st.am))}${st.von ? " · " + esc(st.von) : ""}` : "";
        inhalt = `<div class="q-aktion"><button class="btn ${st.erledigt ? "an" : ""}" data-aktion="bestaetigen" data-key="${key}" aria-pressed="${!!st.erledigt}">${st.erledigt ? "✓ Erledigt" : "Als erledigt bestätigen"}</button></div>`;
        break;
      case "entscheidung":
        meta = st.wahl ? esc(ersetzen((s.optionen.find((o) => o.id === st.wahl) || {}).label || "")) : "";
        if (s.seitMail && (p.mails || {})[s.seitMail]) {
          const gs = new Date(p.mails[s.seitMail]), fr = (cfg().fristen || {}).bewertungNachRechnung ?? 7;
          meta = (meta ? meta + " · " : "") + `Schlussrechnung gesendet am ${fDatum(gs)}${st.wahl ? "" : ` · prüfen ab ${fDatum(plusTage(gs, fr))}`}`;
        }
        inhalt = `<div class="chips">${s.optionen.map((o) => `<button type="button" class="chip${st.wahl === o.id ? " an" : ""}${o.status === "verloren" ? " warn" : ""}" data-aktion="wahl" data-key="${key}" data-nr="${nr}" data-schritt="${s.id}" data-wert="${o.id}">${esc(ersetzen(o.label))}</button>`).join("")}</div>`;
        break;
      case "abschluss": {
        const st13 = phaseStatus(p, nr);
        meta = p.status === "abgeschlossen" ? `abgeschlossen ${abschlussZeit(p) ? "am " + fDatum(new Date(abschlussZeit(p))) : ""}` : "";
        inhalt = p.status === "abgeschlossen" ? ""
          : p.phase === nr && st13.komplett && istBuero() ? `<div class="q-aktion"><button class="btn jetzt" data-aktion="abschliessen">Projekt abschließen & archivieren →</button></div>`
          : `<p class="leise klein-text">Möglich, sobald die Punkte oben erledigt sind.</p>`;
        break;
      }
      case "team": {
        const z = p.zugriff || [];
        meta = z.length ? `${z.length} zugewiesen` : "noch niemand";
        inhalt = teamVerwaltung(p);
        break;
      }
      case "feld": {
        const v = s.feld === "zustaendig" ? experten(p).join(", ") : s.mehrere ? (p[s.feld] || []).join(", ") : p[s.feld] || "";
        meta = v ? (s.mehrzeilig ? "notiert" : esc(v)) : "";
        inhalt = s.mehrzeilig
          ? `<div class="q-aktion q-notiz"><textarea class="eingabe" data-pfeld="${s.feld}" rows="4" aria-label="${esc(titel)}" placeholder="${esc(s.platzhalter || "eintragen")}">${esc(v)}</textarea></div>`
          : s.feld === "zustaendig" || s.mehrere
          ? expertenAuswahl(p, s.feld, s.rolle)
          : s.optionen
          ? `<div class="q-aktion"><select class="eingabe auto" data-pfeld="${s.feld}" aria-label="${esc(titel)}"><option value="">– bitte wählen –</option>${s.optionen.map((o) => `<option${v === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`
          : `<div class="q-aktion"><input class="eingabe ${s.platzhalter ? "breit" : "auto"}" data-pfeld="${s.feld}" value="${esc(v)}" aria-label="${esc(titel)}" placeholder="${esc(s.platzhalter || "eintragen")}"></div>`;
        break;
      }
    }
    const darf = darfSchritt(s);
    if (!siehtSchritt(s)) inhalt = `<p class="q-fremd">Nicht freigegeben – erledigt: ${esc(ebenenText(s.ebene))}</p>`;
    else if (!darf) {
      if (s.typ === "formular") inhalt = Object.keys(Formular.werteVon(p, s.formular)).length ? `<div class="q-aktion"><a class="btn" href="#/projekt/${p.id}/formular/${s.formular}">Ansehen</a></div>` : "";
      else if (s.typ === "dateien") inhalt = ablage(p, s.kategorie, true);
      else inhalt = "";
      inhalt += `<p class="q-fremd">Erledigt: ${esc(ebenenText(s.ebene))}</p>`;
    }
    const fehltHier = S.zeigeOffen && !x.erledigt && x.pflicht && darf && nr === p.phase;
    return `<li class="quest ${x.erledigt ? "erledigt" : "offen"}${x.pflicht ? "" : " optional"}${darf ? "" : " fremd"}${fehltHier ? " fehlt" : ""}" data-quest="${key}">
      <span class="q-marker" aria-hidden="true">${x.erledigt ? "✓" : k + 1}</span>
      <div class="q-inhalt">${fehltHier ? '<p class="q-fehlt">Fehlt noch – bitte erledigen</p>' : ""}<div class="q-kopf"><h3>${esc(titel)}</h3>${x.pflicht || s.typ === "abschluss" ? "" : '<span class="q-tag">optional</span>'}${meta ? `<span class="q-meta">${meta}</span>` : ""}</div>
        ${s.hinweis ? `<p class="q-hinweis">${esc(ersetzen(s.hinweis))}</p>` : ""}${inhalt}</div></li>`;
  }

  /* Heizungsexperten wählen: Dropdown mit allen Mitarbeitern, Mehrfachauswahl */
  /* Mehrfachauswahl von Mitarbeitern: Heizungsexperten (feld „zustaendig“) oder z. B. „besichtiger“ (Liste im Projekt) */
  function expertenAuswahl(p, feld = "zustaendig", rolle = "heizungsexperte") {
    const gew = feld === "zustaendig" ? experten(p) : p[feld] || [];
    const ma = cfg().team.filter((m) => m.name && m.kuerzel && (feld !== "zustaendig" || m.ebene !== "monteur"))
      .sort((a, b) => (b.rolle === rolle) - (a.rolle === rolle));
    const namen = gew.map((k) => mitgliedZu(k)?.name || k).join(", ");
    return `<details class="mehrwahl"><summary class="eingabe">${namen ? esc(namen) : '<span class="leise">Mitarbeiter auswählen …</span>'}</summary>
      <div class="mehrwahl-liste">${ma.map((m) => `<label><input type="checkbox" data-experte="${esc(m.kuerzel)}" data-experte-feld="${esc(feld)}"${gew.includes(m.kuerzel) ? " checked" : ""}> ${esc(m.name)} <span class="leise">(${esc(m.kuerzel)} · ${esc(m.bezeichnung || m.rolle)})</span></label>`).join("")}</div></details>`;
  }

  /* Akte rechts: Dateien, Kunde, Termine, Verlauf */
  function akte(p) {
    if (!istBuero() && !["dateien", "kunde", "termine", "zeiten"].includes(S.akteTab)) S.akteTab = "dateien";
    const t = S.akteTab;
    if (S.akteTab === "zahlen" && !istGF()) S.akteTab = "dateien";
    const tabs = istBuero() ? [["dateien", "Dateien"], ["kunde", "Kunde"], ["team", "Team"], ["termine", "Termine"], ["zeiten", "Zeiten"], ["verlauf", "Verlauf"], ...(istGF() ? [["zahlen", "Nachkalkulation"]] : [])] : [["dateien", "Dateien"], ["kunde", "Kunde"], ["termine", "Termine"], ["zeiten", "Zeiten"]];
    let inhalt = "";
    if (!istBuero() && (t === "kunde" || t === "termine")) {
      const k = p.kunde;
      inhalt = t === "kunde"
        ? `<dl class="infos"><dt>Kunde</dt><dd>${esc(anzeigeName(p))}</dd><dt>Adresse</dt><dd>${esc(adr(k) || "—")}${k.strasse ? ` · <a href="https://maps.google.com/?q=${encodeURIComponent(adr(k))}" target="_blank" rel="noopener">Karte</a>` : ""}</dd>
           <dt>Telefon</dt><dd>${[k.telefon, k.mobil].filter(Boolean).map((x) => `<a href="tel:${esc(x.replace(/[^\d+]/g, ""))}">${esc(x)}</a>`).join(" · ") || "—"}</dd><dt>Zuständig im Büro</dt><dd>${esc(p.zustaendig || "—")}</dd></dl>`
        : `<dl class="infos">${TERMINE.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(fTermin((p.termine || {})[d.key]) || "—")}</dd>`).join("")}</dl>`;
    } else if (t === "zeiten") {
      const alleZ = (p.zeiten || []).filter((z) => istBuero() || z.wer === S.ich.id).sort((a, b) => b.start - a.start);
      const proPerson = {};
      alleZ.forEach((z) => { proPerson[z.name] = (proPerson[z.name] || 0) + dauerMs(z); });
      const summe = alleZ.reduce((a, z) => a + dauerMs(z), 0);
      inhalt = `<p class="leise klein-text">Jede Zeit wird mit Person, Start, Ende und Pausen gespeichert${istGF() ? "; nur die Geschäftsführung kann Einträge löschen" : ""}.</p>
        <dl class="infos zahl-summe"><dt>Gesamt</dt><dd><b>${stunden(summe)}</b></dd>${Object.entries(proPerson).map(([n, ms]) => `<dt>${esc(n)}</dt><dd>${stunden(ms)}</dd>`).join("")}</dl>
        <ul class="verlauf zeiten">${alleZ.map((z) => { const a = new Date(z.start); return `<li><time>${fKurz(a)} ${fUhr(a)}</time><span><b>${z.ende ? stunden(dauerMs(z)) : `läuft · ${hms(dauerMs(z))}`}</b> · ${esc(z.name)}${z.ende ? ` · bis ${fUhr(new Date(z.ende))}` : ""}${(z.pausen || []).length ? ` · ${z.pausen.length} Pause${z.pausen.length > 1 ? "n" : ""}` : ""}${z.notiz ? `<small class="von">${esc(z.notiz)}</small>` : ""}
          ${istGF() && z.ende ? `<button class="btn klein still gefahr" data-aktion="zeit-loeschen" data-zeit="${z.id}">Löschen</button>` : ""}</span></li>`; }).join("") || '<li class="leer-hinweis">Noch keine Arbeitszeit erfasst. Oben im Projekt „Arbeitszeit starten“.</li>'}</ul>`;
    } else if (t === "zahlen") {
      const g = geld(p), start = levelZeit(p, ersteNr), ende = abschlussZeit(p);
      inhalt = `<p class="leise klein-text">Nur für die Geschäftsführung. Erlöse, Stunden, Partnerzeiten, Material – alles für diese Heizung.</p>
        <dl class="infos zahl-summe"><dt>Umsatz</dt><dd>${eur(g.umsatz || null)}</dd><dt>Kosten</dt><dd>${eur(g.kosten || null)}</dd><dt>Deckungsbeitrag</dt><dd>${g.umsatz && g.kosten ? eur(g.db) : "—"} ${g.marge != null ? `· ${prozent(g.marge)}` : ""}</dd>
          <dt>Stunden</dt><dd>${g.stunden ? g.stunden.toFixed(1).replace(".", ",") + " h" : "—"}</dd><dt>Dauer</dt><dd>${start ? (ende ? tageText(tage(start, ende)) : `läuft seit ${tageText(tage(start, Date.now()))}`) : "—"}</dd>
          <dt>Status</dt><dd>${g.abgeschlossen ? `abgeschlossen ${fDatum(new Date(g.abgeschlossen))}` : "offen"}</dd></dl>
        <a class="btn voll" href="#/projekt/${p.id}/nachkalkulation">Nachkalkulation öffnen <span class="pfeil">→</span></a>`;
    } else if (t === "team") {
      inhalt = `<p class="leise klein-text">Zugewiesene sehen dieses Projekt. Welche Ordner sie sehen, ist unter Konten → „Ordner & Bilder“ je Rolle bzw. Gewerk festgelegt. </p>${teamVerwaltung(p)}`;
    } else if (t === "dateien") {
      inhalt = `<ul class="ordner">${KAT.filter((k) => darfKatP(p.id, k.id) && (!k.nurMitDateien || dateienVon(p.id, k.id).length)).map((k) => {
        const l = dateienVon(p.id, k.id), neu = l.filter((d) => d.neu).length, auf = S.ordnerOffen === k.id;
        return `<li class="${auf ? "auf" : ""}"><button class="ordner-k" data-aktion="ordner" data-kat="${k.id}" aria-expanded="${auf}">
          <span class="ordner-icon" aria-hidden="true"></span><span class="ordner-name">${esc(k.titel)}</span>
          ${neu ? `<span class="badge">${neu} neu</span>` : ""}<span class="ordner-zahl">${l.length || ""}</span></button>
          ${auf ? ablage(p, k.id) : ""}</li>`;
      }).join("")}</ul>`;
    } else if (t === "kunde") {
      const k = p.kunde;
      const f = (feld, label, typ = "text", breit) => `<div class="feld${breit ? " breit" : ""}"><label for="k-${feld}">${label}</label><input class="eingabe" id="k-${feld}" type="${typ}" data-kfeld="${feld}" value="${esc(k[feld])}"></div>`;
      inhalt = `<div class="felder">
        <div class="feld"><label for="k-anrede">Anrede</label><select class="eingabe" id="k-anrede" data-kfeld="anrede">${opt(ANREDEN, k.anrede)}</select></div>
        ${f("vorname", "Vorname")}${f("nachname", "Nachname")}${f("telefon", "Telefon", "tel")}${f("mobil", "Mobil", "tel")}${f("telefonGeschaeft", "Tel. geschäftl.", "tel")}
        ${f("email", "E-Mail", "email", true)}${f("strasse", "Straße")}${f("hausnr", "Hausnummer")}${f("ort", "PLZ & Ort", "text", true)}
        <div class="feld"><label for="k-status">Status</label><select class="eingabe" id="k-status" data-pfeld="status">${opt(STATUS, p.status)}</select></div>
        <div class="feld"><label for="k-zust">Zuständig</label><select class="eingabe" id="k-zust" data-pfeld="zustaendig"><option value="">–</option>${opt(kuerzelListe(), p.zustaendig)}</select></div>
        <div class="feld"><label for="k-wv">Wiedervorlage</label><input class="eingabe" id="k-wv" type="date" data-pfeld="wiedervorlage" value="${esc(p.wiedervorlage)}"></div>
        <div class="feld"><label for="k-wvn">Worum geht's</label><input class="eingabe" id="k-wvn" data-pfeld="wiedervorlageNotiz" value="${esc(p.wiedervorlageNotiz)}"></div>
        <div class="feld breit"><label for="k-notiz">Notizen</label><textarea class="eingabe" id="k-notiz" data-pfeld="notiz" rows="4">${esc(p.notiz)}</textarea></div>
      </div>${istGF() ? `<button class="btn still gefahr klein" data-aktion="loeschen">Projekt löschen</button>` : ""}`;
    } else if (t === "termine") {
      inhalt = TERMINE.map((d) => `<div class="termin-zeile"><span>${esc(d.label)}${(p.termine || {})[d.key] && istBuero() ? `<button class="ics-mini" data-aktion="ics" data-termin-key="${d.key}" title="In Outlook-Kalender eintragen" aria-label="${esc(d.label)} in Outlook-Kalender">📅</button>` : ""}</span><input class="eingabe" type="${d.typ}" data-termin="${d.key}" value="${esc((p.termine || {})[d.key] || "")}" aria-label="${esc(d.label)}"></div>`).join("") + `<p class="leise klein-text abstand-o">📅 legt den Termin als Kalendereintrag an – öffnen, dann übernimmt Outlook ihn.</p>`;
    } else {
      inhalt = `<ul class="verlauf">${(p.verlauf || []).map((v) => { const d = new Date(v.ts); return `<li><time>${fKurz(d)} ${fUhr(d)}</time><span>${esc(v.text)}${v.von ? `<small class="von">${esc(v.von)}</small>` : ""}</span></li>`; }).join("")}</ul>`;
    }
    return `<div class="panel akte-panel"><div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" aria-selected="${t === id}" class="tab${t === id ? " an" : ""}" data-aktion="akte-tab" data-tab="${id}">${l}${id === "dateien" && dateienVon(p.id).length ? ` <small>${dateienVon(p.id).length}</small>` : ""}</button>`).join("")}</div>
      <div class="akte-inhalt">${inhalt}</div></div>`;
  }

  function teilRendern(p) {
    const nr = S.ansicht[p.id] || p.phase;
    const m = $("#mission"); if (m) m.innerHTML = mission(p, nr);
    const k = $(".karte"); if (k) k.innerHTML = levelKarte(p, nr);
    const a = $("#akte"); if (a && !a.contains(document.activeElement)) a.innerHTML = akte(p);
    vorschauenLaden();
  }
  function kopfNeu(p) { const k = $(".p-kopf"); if (k) k.outerHTML = projektKopf(p); statusLeiste(); }

  /* ================================================================
     Formular-Seite
     ================================================================ */
  function ansichtFormular(pid, fid) {
    const p = finde(pid), d = Formular.def(fid);
    if (!p || !d) return `<div class="seite"><a class="btn" href="#/projekte">← zurück</a></div>`;
    if (!siehtFormular(fid)) return `<div class="seite"><a class="btn" href="#/projekt/${p.id}">← ${esc(anzeigeName(p))}</a><p class="leer-hinweis">Dieses Formular ist für dich nicht freigegeben.</p></div>`;
    const lesen = !darfFormular(fid) || gesperrt(p);
    if (!lesen && Formular.vorbelegen(fid, p)) speichern(p);
    if (!lesen && fid === "baustellenplan" && subsVorbelegen(p)) speichern(p);
    const st = Formular.status(fid, p, dateienVon(p.id));
    return `<div class="seite formularseite${lesen ? " nur-lesen" : ""}" data-projekt="${p.id}" data-formular="${fid}">
      ${sperrBanner(p)}
      <header class="f-kopf panel">
        <a class="btn still" href="#/projekt/${p.id}">← ${esc(anzeigeName(p))}</a>
        <div class="f-titel"><p class="eyebrow">${lesen ? "Formular · nur ansehen" : "Formular · wird automatisch gespeichert"}</p><h1>${esc(d.titel)}</h1></div>
        <div class="f-status" id="f-status">${formularStatusHtml(st)}</div>
        <div class="kopf-aktionen">${d.vorlage ? `<a class="btn still" href="${esc(d.vorlage)}" target="_blank" rel="noopener" title="Original-Vorlage">Papiervorlage</a>` : ""}
          ${fid === "abnahme" && !lesen ? `<button class="btn" data-aktion="maengel">Mängel → Restarbeiten</button>` : ""}
          <button class="btn" data-aktion="drucken" data-formular="${fid}">Drucken / PDF</button>
          ${lesen ? `<a class="btn voll" href="#/projekt/${p.id}">Zurück</a>` : `<button class="btn jetzt" data-aktion="formular-fertig">Fertig</button>`}</div>
      </header>
      <fieldset class="panel f-flaeche" id="f-flaeche"${lesen ? " disabled" : ""}>${Formular.editor(fid, p, { dateien: dateienVon(p.id), zeigeFehler: S.zeigeFehler, ablage: (kat, k, o) => ablage(p, kat, k, o), firma: cfg(), projektName: anzeigeName(p), projektNr: p.projektnr || "" })}</fieldset></div>`;
  }
  const formularStatusHtml = (st) => `<span class="${st.vollstaendig ? "ok" : ""}">${st.vollstaendig ? "✓ vollständig" : `${st.ok} von ${st.gesamt} Pflichtfeldern`}</span>`;
  function formularNeuZeichnen(p, fid, ganz) {
    const st = Formular.status(fid, p, dateienVon(p.id));
    const s = $("#f-status"); if (s) s.innerHTML = formularStatusHtml(st);
    if (ganz) {
      const fl = $("#f-flaeche"); if (!fl) return;
      const y = window.scrollY;
      fl.innerHTML = Formular.editor(fid, p, { dateien: dateienVon(p.id), zeigeFehler: S.zeigeFehler, ablage: (kat, k, o) => ablage(p, kat, k, o), firma: cfg(), projektName: anzeigeName(p), projektNr: p.projektnr || "" });
      window.scrollTo(0, y); vorschauenLaden(fl); unterschriftenAn(); blattStiftAn();
    }
  }
  /* Baustellenplan: Gewerke + Firmen aus den „Wer“-Feldern der Projekt-Übersicht übernehmen */
  /* Baustellenplan: je benötigtem Gewerk eine Zeile – Firma aus der Projekt-Übersicht, Termin aus dem Gewerke-Formular.
     Leere Felder bestehender Zeilen werden nachgefüllt, Eingaben im Plan bleiben unangetastet. */
  const subsFeld = () => (Formular.def("baustellenplan").felder || []).find((f) => f.id === "subs") || {};
  const subsQuellen = () => subsFeld().vorbelegenAus || [];
  const subsQuelle = () => subsFeld().quelle || "projektuebersicht";   // Formular mit den „Wer?“-Feldern
  function subsVorbelegen(p) {
    const w = formularWerte(p, "baustellenplan"), pu = Formular.werteVon(p, subsQuelle());
    let rows = (Array.isArray(w.subs) ? w.subs : []).filter((r) => r && Object.values(r).some((x) => x !== "" && x != null && x !== false));
    let geaendert = rows.length !== (w.subs || []).length;
    for (const q of subsQuellen()) {
      const v = pu[q.wenn.feld];
      if (!(Array.isArray(v) ? v.includes(q.wenn.wert) : v === q.wenn.wert)) continue;
      const firma = q.wer && pu[q.wer] ? Formular.werName(pu[q.wer], cfg()) : "";
      const [tf, tk] = (q.termin || "").split("."), termin = tf ? Formular.werteVon(p, tf)[tk] : "";
      const tText = q.wann && pu[q.wann] ? pu[q.wann] : termin ? fDatum(new Date(termin + "T00:00")) : "";
      let r = rows.find((x) => x.gewerk === q.gewerk);
      if (!r) { rows.push((r = { gewerk: q.gewerk, _auto: 1 })); geaendert = true; }
      if (!r.firma && firma) { r.firma = firma; geaendert = true; }
      if (!r.termin && tText) { r.termin = tText; geaendert = true; }
    }
    if (geaendert) w.subs = rows;
    return geaendert;
  }
  /* Firma im Plan gewählt → zurück in die Projekt-Übersicht + Partner bekommt Zugriff */
  function subsFirmaUebernehmen(p, row) {
    const q = subsQuellen().find((x) => x.gewerk === row.gewerk && x.wer); if (!q) return;
    const c = cfg(), pa = (c.partner || []).find((x) => x.firma === row.firma);
    const id = pa ? pa.id : row.firma === Formular.werName(Formular.EIGEN, c) ? Formular.EIGEN : null;
    if (!id) return;
    const pu = formularWerte(p, subsQuelle());
    if (pu[q.wer] !== id) pu[q.wer] = id;
    if (pa && !(p.zugriff || []).includes(pa.id)) { p.zugriff = [...(p.zugriff || []), pa.id]; (p.verlauf = p.verlauf || []).unshift({ ts: Date.now(), text: `Automatisch zugewiesen (${row.gewerk}): ${pa.firma}`, von: S.ich ? S.ich.name : "" }); }
  }
  function formularWerte(p, fid) {
    p.formulare = p.formulare || {};
    return (p.formulare[fid] = p.formulare[fid] || { werte: {} }).werte;
  }

  /* Original-Blatt: Stift-Ebene */
  function blattStiftAn() {
    $$("canvas[data-blatt-stift]").forEach((c) => {
      if (c.dataset.an) return; c.dataset.an = 1;
      const box = c.closest(".blatt"), ctx = c.getContext("2d");
      const alt = $(".bl-zeichnung", box);
      if (alt) { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); alt.remove(); }; img.src = alt.src; }
      box.dataset.modus = S.blattModus || "fuellen";
      let zieht = false, last = null, gemalt = false;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      c.addEventListener("pointerdown", (e) => { if (box.dataset.modus === "fuellen") return; zieht = true; last = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
      c.addEventListener("pointermove", (e) => {
        if (!zieht) return; const q = pos(e), radier = box.dataset.modus === "radierer";
        ctx.globalCompositeOperation = radier ? "destination-out" : "source-over";
        ctx.strokeStyle = "#c0262d"; ctx.lineWidth = radier ? 26 : (e.pressure && e.pointerType === "pen" ? 1.5 + e.pressure * 3 : 2.6); ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...q); ctx.stroke(); last = q; gemalt = true;
      });
      const ende = () => {
        if (!zieht) return; zieht = false; if (!gemalt) return; gemalt = false;
        const seite = $(".formularseite"); const p = finde(seite.dataset.projekt); const fid = seite.dataset.formular;
        aendern(p, () => { formularWerte(p, fid).blattZeichnung = c.toDataURL("image/png"); });
      };
      c.addEventListener("pointerup", ende); c.addEventListener("pointercancel", ende);
    });
  }

  /* Unterschriftenfelder */
  function unterschriftenAn() {
    $$(".sign").forEach((box) => {
      const c = $("canvas", box); if (c.dataset.an) return; c.dataset.an = 1;
      const ctx = c.getContext("2d");
      let zieht = false, last = null, gemalt = false;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      c.addEventListener("pointerdown", (e) => {
        zieht = true; last = pos(e); c.setPointerCapture(e.pointerId);
        const img = $("img", box); if (img) { img.remove(); ctx.clearRect(0, 0, c.width, c.height); }
        const h = $(".sign-hinweis", box); if (h) h.remove();
      });
      c.addEventListener("pointermove", (e) => {
        if (!zieht) return; const q = pos(e);
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--tinte").trim() || "#042461";
        ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...q); ctx.stroke(); last = q; gemalt = true;
      });
      const ende = () => {
        if (!zieht) return; zieht = false; if (!gemalt) return;
        const seite = $(".formularseite"); const p = finde(seite.dataset.projekt); const fid = seite.dataset.formular;
        aendern(p, () => { formularWerte(p, fid)[box.dataset.sign] = c.toDataURL("image/png"); });
        box.classList.add("voll"); formularNeuZeichnen(p, fid);
      };
      c.addEventListener("pointerup", ende); c.addEventListener("pointercancel", ende);
    });
  }

  /* ================================================================
     Drucken (Formulare)
     ================================================================ */
  function druckKontext(p) {
    const c = cfg();
    return { firma: c, projektName: anzeigeName(p), projektNr: p.projektnr || "", dateien: dateienVon(p.id), kopfzeile: `${anzeigeName(p)}${p.projektnr ? " · Projekt " + p.projektnr : ""}${p.kunde.ort ? " · " + adr(p.kunde) : ""}` };
  }
  function drucken(html) {
    $("#druck").innerHTML = html;
    const bilder = $$("#druck img");
    Promise.all(bilder.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => setTimeout(() => window.print(), 50));
  }
  /* ================================================================
     Dialoge
     ================================================================ */
  function dialog(html, setup) {
    const alt = $("#dlg");
    const dlg = alt.cloneNode(false); // frisches Element = keine alten Listener
    dlg.removeAttribute("open");
    if (alt.open) alt.close();
    alt.replaceWith(dlg);
    dlg.innerHTML = html;
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest('[data-aktion="dlg-zu"]')) dlg.close(); });
    if (setup) setup(dlg);
    dlg.showModal();
    return dlg;
  }

  function neuDialog() {
    dialog(`<form id="neu-form">
      <div class="dlg-kopf"><div><p class="eyebrow">Level 01 · Kundenanfrage</p><h2>Neue Anfrage</h2><p>Das Nötigste reicht – der Rest kommt in die Bestandsaufnahme.</p></div><button class="btn still" type="button" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="felder">
        <div class="feld"><label for="n-anrede">Anrede</label><select class="eingabe" id="n-anrede" name="anrede">${opt(ANREDEN, "Herr")}</select></div>
        <div class="feld"><label for="n-vorname">Vorname</label><input class="eingabe" id="n-vorname" name="vorname"></div>
        <div class="feld"><label for="n-nachname">Nachname *</label><input class="eingabe" id="n-nachname" name="nachname" required></div>
        <div class="feld"><label for="n-tel">Telefon</label><input class="eingabe" id="n-tel" name="telefon" type="tel"></div>
        <div class="feld breit"><label for="n-mail">E-Mail</label><input class="eingabe" id="n-mail" name="email" type="email"></div>
      </div></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-aktion="dlg-zu">Abbrechen</button><button class="btn jetzt" type="submit">Anlegen & Bestandsaufnahme starten <span class="pfeil">→</span></button></div></form>`, (dlg) => {
      $("#neu-form", dlg).addEventListener("submit", (e) => {
        e.preventDefault(); e.stopPropagation();
        const d = Object.fromEntries(new FormData(e.target));
        if (!d.nachname.trim()) return;
        const p = neuesProjekt({ ...d, nachname: d.nachname.trim() });
        dlg.close();
        location.hash = `#/projekt/${p.id}/formular/bestandsaufnahme`;
      });
      setTimeout(() => $("#n-vorname", dlg).focus(), 30);
    });
  }

  async function kundenLink(p) {
    const t = await Daten.uploadLink(p);
    const basis = cfg().cloud.portalUrl || new URL("kunde.html", location.href).href;
    return `${basis.replace(/#.*$/, "")}#${t}`;
  }
  async function kundenlinkDialog(p) {
    let link;
    try { link = await kundenLink(p); } catch (e) { return toast("Link konnte nicht erstellt werden", "fehler"); }
    const lokal = Daten.modus === "lokal";
    dialog(`<div class="dlg-kopf"><div><p class="eyebrow">${esc(anzeigeName(p))}</p><h2>Persönlicher Kundenlink</h2>
        <p>Über diesen Link lädt der Kunde Fotos und Unterlagen hoch – ohne Anmeldung, direkt vom Handy. Alles landet automatisch im richtigen Ordner dieses Projekts.</p></div>
        <button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt">
        <div class="link-feld"><input class="eingabe" readonly value="${esc(link)}" id="kl-link" aria-label="Kundenlink"><button class="btn voll" data-dlg="kopieren">Kopieren</button></div>
        ${lokal ? `<p class="luecken">Lokaler Modus: Der Link funktioniert nur hier in diesem Browser (zum Ausprobieren). Für echte Kunden die Cloud einrichten – siehe Einrichtung.</p>` : ""}
        <p class="anhang-info">Der Link steckt automatisch in der Terminbestätigung und in der Freigabe-Mail. Er ist 180 Tage gültig.</p>
      </div>
      <div class="dlg-fuss"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Kundenansicht öffnen</a></div>`, (dlg) => {
      dlg.addEventListener("click", async (e) => {
        if (e.target.dataset.dlg === "kopieren") { await kopieren(link); toast("Link kopiert"); }
      });
    });
  }

  function anrede(p, stil) {
    const n = p.kunde.nachname || "‹Nachname›";
    const t = {
      formell: { "Herr": `Sehr geehrter Herr ${n},`, "Frau": `Sehr geehrte Frau ${n},`, "Herr und Frau": `Sehr geehrte Frau ${n}, sehr geehrter Herr ${n},`, "Familie": `Sehr geehrte Familie ${n},` },
      hallo: { "Herr": `Hallo Herr ${n},`, "Frau": `Hallo Frau ${n},`, "Herr und Frau": `Hallo Frau ${n}, hallo Herr ${n},`, "Familie": `Hallo Familie ${n},` },
      gutentag: { "Herr": `Guten Tag Herr ${n},`, "Frau": `Guten Tag Frau ${n},`, "Herr und Frau": `Guten Tag Frau und Herr ${n},`, "Familie": `Guten Tag liebe Familie ${n},` },
    };
    return (t[stil] || t.formell)[p.kunde.anrede] || t.formell.Herr;
  }
  function mailBauen(m, p, optionen, link, extra = {}) {
    const c = cfg(), luecken = [];
    let text = m.text.replace(/\[\[(\w+)\]\]([\s\S]*?)\[\[\/\1\]\]/g, (_, id, inhalt) => (optionen[id] ? inhalt : ""));
    const label = (k) => (TERMINE.find((t) => t.key === k) || {}).label || k;
    text = text.replace(/\{([a-zA-Z.]+)\}/g, (ganz, key) => {
      const fehlt = (was) => { if (!luecken.includes(was)) luecken.push(was); return `‹${was}›`; };
      if (key in extra) return extra[key] || fehlt(extra["_label:" + key] || key);
      if (key === "anrede") return anrede(p, m.anredeStil);
      if (key === "nachname") return p.kunde.nachname || fehlt("Nachname");
      if (key === "downloadCode") return p.downloadCode || fehlt(`${c.programme.app3d}-Code`);
      if (key === "uploadLink") return link || fehlt("Upload-Link");
      if (key === "berater") return leute("geschaeftsfuehrer")[0]?.name || fehlt("Geschäftsführer");
      if (key === "heizungsexperte") return experten(p).map((k) => mitgliedZu(k)?.name || k).join(" und ") || leute("heizungsexperte")[0]?.name || fehlt("Heizungsexperte");
      if (key === "firma.name") return c.name;
      if (key === "firma.kurzname") return c.kurzname || c.name;
      if (key === "firma.adresse") return `${c.adresse.strasse}, ${c.adresse.ort}`;
      if (key === "firma.mapsLink") return c.adresse.mapsLink;
      if (key === "firma.website") return c.website;
      if (key === "firma.telefon") return c.telefon || fehlt("Telefon");
      if (key === "firma.heizungsrechner") return c.heizungsrechner || fehlt("Link Heizungsrechner");
      if (key === "bzaNr") return p.bzaNr || fehlt("BZA-Nummer");
      if (key === "bzdNr") return p.bzdNr || fehlt("BZD-Nummer");
      const [tk, teil] = key.split(".");
      if (TERMINE.some((t) => t.key === tk)) {
        const s = (p.termine || {})[tk], d = datum(s);
        if (!d) return fehlt(`Termin ${label(tk)}`);
        if (teil === "wochentag") return WT[d.getDay()];
        if (teil === "uhrzeit") return hatUhrzeit(s) ? fUhr(d) : fehlt(`Uhrzeit ${label(tk)}`);
        if (teil === "kurz") return fKurz(d);
        return fDatum(d);
      }
      return ganz;
    });
    return { text: text.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + (extra._ohneSignatur ? "" : signatur()), luecken };
  }
  /* Signatur des angemeldeten Nutzers (Name, Funktion, Durchwahl, E-Mail) */
  function signatur() {
    const c = cfg(), t = S.ich && c.team.find((m) => m.kuerzel === S.ich.id);
    if (!t || !t.name) return "";
    return "\n\n" + [t.name, t.bezeichnung && `${t.bezeichnung} · ${c.name}`, t.telefon && `Telefon ${t.telefon}`, t.email].filter(Boolean).join("\n");
  }
  async function mailDialog(mailId, p) {
    const m = window.MAILVORLAGEN.find((x) => x.id === mailId);
    const optionen = {};
    let link = null;
    if (/\{uploadLink\}/.test(m.text)) { try { link = await kundenLink(p); } catch (e) { /* Lücke */ } }
    const mailto = (dlg) => `mailto:${encodeURIComponent(p.kunde.email || "")}?subject=${encodeURIComponent($("#mail-betreff", dlg).value)}&body=${encodeURIComponent($("#mail-text", dlg).value)}`;
    const zeichnen = (dlg) => {
      const { text, luecken } = mailBauen(m, p, optionen, link);
      dlg.innerHTML = `<div class="dlg-kopf"><div><p class="eyebrow">Level ${zwei(m.phase)} · ${esc(anzeigeName(p))}</p><h2>${esc(m.titel)}</h2>
          <p>${p.kunde.email ? `An: ${esc(p.kunde.email)}` : "Beim Kunden ist noch keine E-Mail-Adresse hinterlegt."}</p></div><button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
        <div class="dlg-inhalt">
          ${m.optionen.length ? `<div class="optionen"><p class="q-gruppe">Diese Absätze mitschicken:</p>${m.optionen.map((o) => `<label><input type="checkbox" data-option="${o.id}"${optionen[o.id] ? " checked" : ""}> ${esc(o.label)}</label>`).join("")}</div>` : ""}
          ${luecken.length ? `<div class="luecken">Noch offen: ${luecken.map(esc).join(", ")} – im Projekt nachtragen oder im Text ersetzen.</div>` : ""}
          <div class="feld"><label for="mail-betreff">Betreff</label><input class="eingabe" id="mail-betreff" value="${esc(m.betreff)}"></div>
          <div class="feld abstand-o"><label for="mail-text">Text</label><textarea class="eingabe mail-text" id="mail-text">${esc(text)}</textarea></div>
          <p class="anhang-info">Anhänge: ${m.anhangDateien ? m.anhangDateien.map((f, i) => `<a href="${esc(f)}" download>${esc(m.anhaenge[i] || f.split("/").pop())}</a>`).join(", ") : m.anhaenge.map(esc).join(", ") || "keine"} · Absender: ${esc(cfg().kundenPostfach)}</p></div>
        <div class="dlg-fuss">${m.datei ? `<a class="btn links still" href="${esc(m.datei)}">Original-Vorlage</a>` : '<span class="links"></span>'}<button class="btn" data-dlg="kopieren">Text kopieren</button>
          <a class="btn still" data-dlg="mailto" href="#">Einfache Mail</a><button class="btn voll" data-dlg="eml">In Outlook öffnen</button><button class="btn jetzt" data-dlg="gesendet">Als gesendet markieren</button></div>
        <p class="anhang-info dlg-hinweis">„In Outlook öffnen“ erzeugt einen fertigen Entwurf mit Anhängen – Datei öffnen, in Outlook prüfen und absenden.</p>`;
      $('[data-dlg="mailto"]', dlg).href = mailto(dlg);
    };
    dialog("", (dlg) => {
      zeichnen(dlg);
      dlg.addEventListener("click", async (e) => {
        const a = e.target.closest("[data-dlg]"); if (!a) return;
        if (a.dataset.dlg === "kopieren") { await kopieren($("#mail-text", dlg).value); toast("Text kopiert"); }
        if (a.dataset.dlg === "mailto") a.href = mailto(dlg);
        if (a.dataset.dlg === "eml") {
          const anh = [...(m.anhangDateien || []).map((f, i) => ({ url: f, name: (m.anhaenge[i] || f.split("/").pop()) + (/\.pdf$/i.test(m.anhaenge[i] || "") ? "" : ".pdf") }))];
          for (const kat of m.anhangOrdner || []) for (const d of dateienVon(p.id, kat).slice(-1)) { try { anh.push({ url: await dateiUrl(d), name: d.name }); } catch (e) { /* ohne */ } }
          const fehlt = await emlDatei(p, $("#mail-betreff", dlg).value, $("#mail-text", dlg).value, anh);
          toast(fehlt ? `Entwurf erstellt – ${fehlt} Anhang/Anhänge bitte selbst anfügen` : "Entwurf erstellt – Datei öffnen, dann in Outlook absenden");
        }
        if (a.dataset.dlg === "gesendet") {
          aendern(p, (x) => { x.mails = x.mails || {}; x.mails[m.id] = Date.now(); }, `Mail „${m.titel}“ gesendet`);
          dlg.close(); toast("Als gesendet vermerkt"); teilRendern(p);
        }
      });
      dlg.addEventListener("change", (e) => { const o = e.target.dataset.option; if (o) { optionen[o] = e.target.checked; zeichnen(dlg); } });
      dlg.addEventListener("input", (e) => { if (e.target.id === "mail-text" || e.target.id === "mail-betreff") $('[data-dlg="mailto"]', dlg).href = mailto(dlg); });
    });
  }

  /* ---------- Anfrage an einen Subunternehmer (aus dem Baustellenplan) ---------- */
  async function subAnfrageDialog(p, zeile) {
    const m = window.MAILVORLAGEN.find((x) => x.id === "sub-anfrage"); if (!m) return;
    const row = ((Formular.werteVon(p, "baustellenplan").subs) || [])[zeile]; if (!row || !row.firma) return toast("Erst eine Firma wählen", "fehler");
    const c = cfg(), pa = (c.partner || []).find((x) => x.firma === row.firma);
    if (!pa) return toast("Die Firma steht nicht im Adressbuch – dort anlegen, dann anfragen.", "fehler");
    const gewerk = row.gewerk || pa.gewerk || "";
    const bb = Formular.werteVon(p, "baustellenbesichtigung");
    const masse = [["Heizraumgröße", bb.heizraum], ["Kellertür (Durchgang)", bb.kellertuer], ["Türe Heizraum", bb.heizraumtuer], ["Kamin Ø / Länge", [bb.kaminD, bb.kaminL].filter(Boolean).join(" / ")]].filter(([, v]) => v).map(([l, v]) => `  – ${l}: ${v}`).join("\n");
    const forms = ((c.gewerke || {})[gewerk] || []).filter((f) => !["projektuebersicht", "auswahl", "baustellenbesichtigung"].includes(f) && Formular.def(f));
    const leistungen = forms.map((f) => Formular.text(f, p, c)).filter(Boolean).join("\n\n");
    const extra = {
      anrede: pa.name ? `Hallo ${pa.name},` : "Sehr geehrte Damen und Herren,",
      gewerk, termin: row.termin || "", masse, leistungen,
      "baustelle.adresse": [adr(p.kunde)].filter(Boolean).join("") || "", "baustelle.ort": (p.kunde.ort || "").replace(/^\d{5}\s*/, ""),
      "_label:termin": "Einsatztermin im Baustellenplan", "_label:masse": "Maße (Baustellenbesichtigung)", "_label:leistungen": "Leistungen (Gewerke-Formular)",
      "_label:baustelle.adresse": "Adresse", "_label:baustelle.ort": "Ort",
    };
    /* Anhänge: alle Dateien aus den für das Gewerk freigegebenen Ordnern */
    const ordner = freigabeStandard("partner:" + gewerk);
    const anh = S.dateien.filter((d) => d.projekt_id === p.id && ordner.includes(d.kategorie));
    const aus = new Set();
    const optionen = Object.fromEntries(m.optionen.filter((o) => o.an).map((o) => [o.id, true]));
    const groesse = (b) => b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
    const zeichnen = (dlg) => {
      const { text, luecken } = mailBauen(m, p, optionen, null, extra);
      const betreff = mailBauen({ ...m, text: m.betreff }, p, {}, null, { ...extra, _ohneSignatur: true }).text;
      const summe = anh.filter((d) => !aus.has(d.id)).reduce((a, d) => a + (d.groesse || 0), 0);
      dlg.innerHTML = `<div class="dlg-kopf"><div><p class="eyebrow">Anfrage · ${esc(gewerk)} · ${esc(anzeigeName(p))}</p><h2>${esc(pa.firma)}</h2>
          <p>${pa.email ? `An: ${esc(pa.email)}` : "Im Adressbuch ist noch keine E-Mail-Adresse hinterlegt."}${pa.telefon ? ` · Tel. ${esc(pa.telefon)}` : ""}</p></div><button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
        <div class="dlg-inhalt">
          <div class="optionen"><p class="q-gruppe">Diese Absätze mitschicken:</p>${m.optionen.map((o) => `<label><input type="checkbox" data-option="${o.id}"${optionen[o.id] ? " checked" : ""}> ${esc(o.label)}</label>`).join("")}</div>
          ${luecken.length ? `<div class="luecken">Noch offen: ${luecken.map(esc).join(", ")} – im Projekt nachtragen oder im Text ersetzen.</div>` : ""}
          <div class="feld"><label for="mail-betreff">Betreff</label><input class="eingabe" id="mail-betreff" value="${esc(betreff)}"></div>
          <div class="feld abstand-o"><label for="mail-text">Text</label><textarea class="eingabe mail-text" id="mail-text">${esc(text)}</textarea></div>
          <div class="anhang-wahl"><p class="q-gruppe">Anhänge aus den freigegebenen Ordnern (${esc(gewerk)}): ${ordner.map(katTitel).map(esc).join(", ") || "keine"}</p>
            ${anh.length ? `<ul>${anh.map((d) => `<li><label><input type="checkbox" data-anhang="${esc(d.id)}"${aus.has(d.id) ? "" : " checked"}> ${esc(d.name)} <small>${esc(katTitel(d.kategorie))}${d.groesse ? " · " + groesse(d.groesse) : ""}</small></label></li>`).join("")}</ul>
              <p class="leise klein-text">Zusammen ${groesse(summe)}${summe > 20 * 1048576 ? " – viele Mailserver nehmen nur bis ca. 20 MB an, ggf. Fotos abwählen." : ""}</p>` : '<p class="leise klein-text">In diesen Ordnern liegen noch keine Dateien.</p>'}</div>
        </div>
        <div class="dlg-fuss"><span class="links"></span><button class="btn" data-dlg="kopieren">Text kopieren</button>
          <button class="btn voll" data-dlg="eml">In Outlook öffnen</button><button class="btn jetzt" data-dlg="gesendet">Als angefragt markieren</button></div>
        <p class="anhang-info dlg-hinweis">„In Outlook öffnen“ erzeugt einen fertigen Entwurf an ${esc(pa.email || "den Partner")} mit den gewählten Anhängen – Datei öffnen, prüfen und absenden.</p>`;
    };
    dialog("", (dlg) => {
      zeichnen(dlg);
      dlg.addEventListener("click", async (e) => {
        const a = e.target.closest("[data-dlg]"); if (!a) return;
        if (a.dataset.dlg === "kopieren") { await kopieren($("#mail-text", dlg).value); toast("Text kopiert"); }
        if (a.dataset.dlg === "eml") {
          const liste = [];
          for (const d of anh.filter((x) => !aus.has(x.id))) { try { liste.push({ url: await dateiUrl(d), name: d.name }); } catch (err) { /* ohne */ } }
          const fehlt = await emlDatei(p, $("#mail-betreff", dlg).value, $("#mail-text", dlg).value, liste, pa.email || "");
          toast(fehlt ? `Entwurf erstellt – ${fehlt} Anhang/Anhänge bitte selbst anfügen` : "Entwurf erstellt – Datei öffnen, dann in Outlook absenden");
        }
        if (a.dataset.dlg === "gesendet") {
          aendern(p, () => { const r = (formularWerte(p, "baustellenplan").subs || [])[zeile]; if (r) r.angefragt = Date.now(); }, `Anfrage an ${pa.firma} (${gewerk}) gesendet`);
          dlg.close(); toast("Als angefragt vermerkt"); const r = route(); if (r.sub === "formular") formularNeuZeichnen(p, r.subArg, true); else teilRendern(p);
        }
      });
      dlg.addEventListener("change", (e) => {
        const o = e.target.dataset.option, an = e.target.dataset.anhang;
        if (o) { optionen[o] = e.target.checked; zeichnen(dlg); }
        if (an) { e.target.checked ? aus.delete(an) : aus.add(an); zeichnen(dlg); }
      });
    });
  }

  async function dateiDialog(d) {
    const p = finde(d.projekt_id);
    let url; try { url = await dateiUrl(d); } catch (e) { return toast("Datei nicht erreichbar", "fehler"); }
    const pdf = /pdf/i.test(d.typ || d.name);
    /* Slideshow: alle Bilder desselben Ordners */
    const bilder = istBild(d) ? dateienVon(d.projekt_id, d.kategorie).filter(istBild) : [];
    const pos = bilder.findIndex((x) => x.id === d.id);
    const pfeile = bilder.length > 1;
    dialog(`<div class="dlg-kopf"><div><p class="eyebrow">${esc(katTitel(d.kategorie))}${d.quelle === "kunde" ? " · vom Kunden" : d.quelle === "partner" ? " · vom Partner" : ""}${pfeile ? ` · Bild ${pos + 1} von ${bilder.length}` : ""}</p><h2>${esc(d.name)}</h2><p>${groesse(d.groesse || 0)} · ${esc(new Date(d.am).toLocaleString("de-DE"))}</p></div><button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt vorschau${pfeile ? " slideshow" : ""}">${pfeile ? `<button class="slide-pfeil links" data-dlg="zurueck" aria-label="Vorheriges Bild">‹</button>` : ""}${istBild(d) ? `<img src="${esc(url)}" alt="">` : pdf ? `<iframe src="${esc(url)}" title="${esc(d.name)}"></iframe>` : `<p>Keine Vorschau – bitte herunterladen.</p>`}${pfeile ? `<button class="slide-pfeil rechts" data-dlg="vor" aria-label="Nächstes Bild">›</button>` : ""}</div>
      ${pfeile ? `<div class="slide-leiste">${bilder.map((x, i) => `<button class="slide-mini${i === pos ? " an" : ""}" data-dlg="bild" data-i="${i}" aria-label="Bild ${i + 1}"><img data-vorschau="${esc(x.id)}" alt=""></button>`).join("")}</div>` : ""}
      <div class="dlg-fuss"><button class="btn still gefahr links" data-dlg="loeschen">Löschen</button>
        <select class="eingabe auto" data-dlg-kat aria-label="In Ordner verschieben">${KAT.map((k) => `<option value="${k.id}"${k.id === d.kategorie ? " selected" : ""}>${esc(k.titel)}</option>`).join("")}</select>
        <a class="btn" href="${esc(url)}" download="${esc(d.name)}" target="_blank" rel="noopener">Herunterladen</a></div>`, (dlg) => {
      if (pfeile) {
        vorschauenLaden(dlg);
        const geh = (i) => dateiDialog(bilder[(i + bilder.length) % bilder.length]);
        dlg.addEventListener("click", (e) => {
          const b = e.target.closest("[data-dlg]"); if (!b) return;
          if (b.dataset.dlg === "vor") geh(pos + 1);
          if (b.dataset.dlg === "zurueck") geh(pos - 1);
          if (b.dataset.dlg === "bild") geh(Number(b.dataset.i));
        });
        dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); geh(pos + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); geh(pos - 1); } });
        setTimeout(() => { const v = $('[data-dlg="vor"]', dlg); if (v) v.focus(); }, 30);
      }
      dlg.addEventListener("click", async (e) => {
        if (e.target.dataset.dlg !== "loeschen" || !confirm(`„${d.name}“ löschen?`)) return;
        await Daten.dateiLoeschen(d);
        S.dateien = S.dateien.filter((x) => x.id !== d.id);
        aendern(p, () => {}, `Datei gelöscht: ${d.name}`);
        dlg.close(); allesNeu();
      });
      dlg.addEventListener("change", async (e) => {
        if (!e.target.matches("[data-dlg-kat]")) return;
        try { await Daten.dateiVerschieben(d, e.target.value); toast(`Verschoben nach „${katTitel(d.kategorie)}“`); allesNeu(); }
        catch (err) { toast("Verschieben fehlgeschlagen", "fehler"); }
      });
    });
  }

  /* Level geschafft */
  function levelUp(nr) {
    const el = $("#levelup");
    el.innerHTML = nr ? `<span class="lu-nr">${zwei(nr)}</span><span><small>Level freigeschaltet</small><b>${esc(phase(nr).titel)}</b></span>` : `<span class="lu-nr">✓</span><span><small>Geschafft</small><b>Projekt abgeschlossen</b></span>`;
    el.classList.remove("an"); void el.offsetWidth; el.classList.add("an");
    setTimeout(() => el.classList.remove("an"), 2600);
  }

  /* ================================================================
     Einrichtung
     ================================================================ */
  function ansichtEinrichtung() {
    const c = cfg();
    const f = (pfad, label, wert, typ = "text") => `<div class="feld"><label for="c-${pfad}">${label}</label><input class="eingabe" id="c-${pfad}" type="${typ}" data-cfg="${pfad}" value="${esc(wert)}"></div>`;
    const rollen = [...new Set([...window.FIRMA.team.map((t) => t.rolle), ...c.team.map((t) => t.rolle)])];
    const demo = alle().some((p) => p.demo);
    const cloud = Daten.modus === "cloud";
    return `<div class="seite">
      <header class="kopf"><div><p class="eyebrow">Einrichtung</p><h1>Firma & Team</h1></div>
        <div class="kopf-aktionen"><button class="btn jetzt" data-aktion="cfg-speichern">Übernehmen</button></div></header>
      <div class="einr">
        <section class="panel"><h3>Betriebsart: ${cloud ? "Cloud" : "Lokal"}</h3>
          <p class="leise">${cloud ? `Verbunden mit <b>${esc(c.cloud.url)}</b>${Daten.nutzer ? ` als <b>${esc(Daten.nutzer)}</b>` : ""}. Projekte, Dateien und Kunden-Uploads liegen in der Cloud – für alle im Team gleich.`
            : "Projekte und Dateien liegen nur in diesem Browser. Zum Ausprobieren ideal; für mehrere Arbeitsplätze und echte Kunden-Links die Cloud einrichten: Anleitung in <code>supabase/ANLEITUNG-CLOUD.md</code>, Zugangsdaten in <code>einstellungen/firma.js</code> unter <code>cloud</code>."}</p>
          <div class="aktionen">
            ${cloud ? `<button class="btn" data-aktion="abmelden">Abmelden</button>` : ""}
            ${cloud && !(window.FIRMA.cloud || {}).url ? `<button class="btn still gefahr" data-aktion="cloud-trennen">Cloud trennen</button>` : ""}
            <button class="btn" data-aktion="export">Projekte sichern (JSON)</button>
            <label class="btn">Sicherung einspielen<input type="file" accept=".json,application/json" data-aktion="import" hidden></label>
            ${demo ? `<button class="btn still gefahr" data-aktion="demo-weg">Beispielprojekte entfernen</button>` : `<button class="btn still" data-aktion="demo">Beispielprojekte laden</button>`}
          </div></section>
        ${cloud ? "" : `<section class="panel"><h3>Cloud verbinden</h3>
          <p class="leise">Zugangsdaten aus dem Supabase-Projekt (Project Settings → API). Sie werden nur in diesem Browser gespeichert; für alle Arbeitsplätze und das Kundenportal gehören sie in <code>einstellungen/firma.js</code>.</p>
          <div class="felder drei">
            <div class="feld"><label for="cl-url">Project URL</label><input class="eingabe" id="cl-url" placeholder="https://xxxx.supabase.co"></div>
            <div class="feld"><label for="cl-key">anon / publishable key</label><input class="eingabe" id="cl-key"></div>
            <div class="feld"><label for="cl-portal">Adresse des Kundenportals</label><input class="eingabe" id="cl-portal" placeholder="https://…/kunde.html"></div>
          </div><div class="aktionen"><button class="btn voll" data-aktion="cloud-verbinden">Verbinden</button></div></section>`}
        <section class="panel"><h3>Firma</h3><div class="felder drei">
          ${f("name", "Firmenname", c.name)}${f("kurzname", "Kurzname (in Mails)", c.kurzname)}${f("bereich", "Untertitel", c.bereich)}
          ${f("adresse.strasse", "Straße", c.adresse.strasse)}${f("adresse.ort", "PLZ & Ort", c.adresse.ort)}${f("adresse.mapsLink", "Google-Maps-Link", c.adresse.mapsLink, "url")}
          ${f("telefon", "Telefon", c.telefon)}${f("email", "E-Mail", c.email, "email")}${f("website", "Website", c.website)}
          ${f("kundenPostfach", "Postfach für Kundenmails", c.kundenPostfach, "email")}${f("logo", "Logo-Datei", c.logo)}
        </div></section>
        <section class="panel"><h3>Farben</h3><div class="felder drei">
          <div class="feld"><span class="lab">Grundfarbe</span><div class="farbe"><input type="color" data-cfg="farben.tinte" value="${esc(c.farben.tinte)}" aria-label="Grundfarbe"><code>${esc(c.farben.tinte)}</code></div></div>
          <div class="feld"><span class="lab">Akzent („jetzt dran“)</span><div class="farbe"><input type="color" data-cfg="farben.akzent" value="${esc(c.farben.akzent)}" aria-label="Akzentfarbe"><code>${esc(c.farben.akzent)}</code></div></div>
        </div></section>

        <section class="panel"><h3>Programme</h3><div class="felder drei">
          ${Object.entries(c.programme).map(([k, v]) => f("programme." + k, { erp: "Warenwirtschaft / ERP", heizungsrechner: "Kostenrechner", foerderung: "Förderantrag" }[k] || k, v)).join("")}
        </div></section>
        <section class="panel"><h3>Geschäftszeiten</h3><p class="leise">Termine außerhalb dieser Zeiten und an Wochenenden werden nicht angenommen.</p><div class="felder drei">
          ${f("geschaeftszeiten.von", "Termine ab", (c.geschaeftszeiten || {}).von || "07:00", "time")}
          ${f("geschaeftszeiten.bis", "Termine bis", (c.geschaeftszeiten || {}).bis || "18:00", "time")}
        </div></section>
        <section class="panel"><h3>Fristen (Tage)</h3><div class="felder drei">
          ${f("fristen.erinnerungVorErstgespraech", "Fotos fehlen – Tage vor Erstgespräch", c.fristen.erinnerungVorErstgespraech, "number")}
          ${f("fristen.angebotsverfolgung", "Angebotsverfolgung – Tage nach Erstgespräch", c.fristen.angebotsverfolgung, "number")}
          ${f("fristen.tafVorBaustart", "TAF an Schornsteinfeger – Tage vor Baustart", c.fristen.tafVorBaustart ?? 14, "number")}
          ${f("fristen.kundenerinnerungVorBaustart", "Kundenerinnerung – Tage vor Baustart", c.fristen.kundenerinnerungVorBaustart, "number")}
          ${f("fristen.bewertungNachRechnung", "Google-Bewertung prüfen – Tage nach Schlussrechnung", c.fristen.bewertungNachRechnung ?? 7, "number")}
        </div></section>
        <section class="panel"><h3>Für eine andere Firma übernehmen</h3>
          <p class="leise">Einstellungen übernehmen, dann als <code>firma.js</code> herunterladen und im Ordner <code>einstellungen/</code> ersetzen. Level, Formulare und Mailtexte stehen in <code>ablauf.js</code>, <code>formulare.js</code> und <code>mailvorlagen.js</code> – siehe <code>ANLEITUNG.md</code>.</p>
          <div class="aktionen"><button class="btn" data-aktion="cfg-datei">firma.js herunterladen</button><button class="btn still gefahr" data-aktion="cfg-reset">Auf firma.js zurücksetzen</button></div></section>
      </div></div>`;
  }
  /* ---------- Partner-Adressbuch (Büro liest, Geschäftsführung pflegt) ---------- */
  const ADR_FELDER = [["firma", "Firma"], ["gewerk", "Gewerk"], ["name", "Ansprechpartner"], ["strasse", "Straße & Nr."], ["ort", "PLZ & Ort"], ["telefon", "Telefon"], ["mobil", "Mobil"], ["email", "E-Mail"], ["notiz", "Notiz"]];
  const partnerZeileAdr = (x) => {
    const gf = istGF();
    const feld = ([k, l]) => k === "gewerk"
      ? `<label class="feld"><span class="lab">${l}</span><select class="eingabe" data-partner="gewerk"${gf ? "" : " disabled"}>${opt(Object.keys(cfg().gewerke || {}), x.gewerk)}</select></label>`
      : `<label class="feld${k === "notiz" ? " breit" : ""}"><span class="lab">${l}</span><input class="eingabe" data-partner="${k}" type="${k === "email" ? "email" : k === "telefon" || k === "mobil" ? "tel" : "text"}" value="${esc(x[k] || "")}"${gf ? "" : " readonly"}></label>`;
    const tel = x.telefon || x.mobil;
    return `<tr data-id="${esc(x.id || "")}" data-suche="${esc(Object.values(x).join(" ").toLowerCase())}"><td><div class="adr-karte">${ADR_FELDER.map(feld).join("")}
      <div class="adr-aktionen">${tel ? `<a class="btn klein" href="tel:${esc(tel.replace(/[^\d+]/g, ""))}">Anrufen</a>` : ""}${x.email ? `<a class="btn klein" href="mailto:${esc(x.email)}">E-Mail</a>` : ""}
      ${gf ? `<button class="btn klein still gefahr" data-aktion="team-weg">Entfernen</button>` : ""}</div></div></td></tr>`;
  };
  function ansichtAdressbuch() {
    const l = (cfg().partner || []).slice().sort((a, b) => (a.gewerk || "").localeCompare(b.gewerk || "") || (a.firma || "").localeCompare(b.firma || ""));
    return `<div class="seite adressbuch">
      <header class="kopf"><div><p class="eyebrow">Externe Partner</p><h1>Adressbuch</h1>
        <p class="unter leise">${l.length} Partner. ${istGF() ? "Änderungen mit „Übernehmen“ speichern – Zugänge stehen unter Konten." : "Pflegen kann die Geschäftsführung."}</p></div>
        <div class="kopf-aktionen"><input class="eingabe suche" type="search" placeholder="Suchen: Firma, Gewerk, Ort …" data-filter="adressbuch" aria-label="Partner suchen">
        ${istGF() ? `<button class="btn" data-aktion="adr-neu">+ Partner</button><button class="btn jetzt" data-aktion="adr-speichern">Übernehmen</button>` : ""}</div></header>
      <table class="adr-tab"><tbody id="partner">${l.map(partnerZeileAdr).join("") || '<tr><td class="leer-hinweis">Noch keine Partner eingetragen.</td></tr>'}</tbody></table>
    </div>`;
  }

  function zieleFormular() {
    const c = cfg(), f = (pfad, label, wert, typ = "text") => `<div class="feld"><label for="c-${pfad}">${label}</label><input class="eingabe" id="c-${pfad}" type="${typ}" data-cfg="${pfad}" value="${esc(wert)}"></div>`;
    return `<section class="panel"><h2 class="panel-titel">Ziele</h2><div class="panel-innen"><div class="felder drei">
        ${f("ziele.jahresumsatz", `Umsatzziel ${new Date().getFullYear()} (netto, €)`, (c.ziele || {}).jahresumsatz || "", "number")}</div></div></section>
      <section class="panel"><h2 class="panel-titel">Kalkulation</h2><div class="panel-innen"><p class="leise">Interner Kostensatz je Mitarbeiterstunde (Lohn inkl. Nebenkosten). Wird in jeder Nachkalkulation mit den Timer-Stunden verrechnet; pro Projekt änderbar.</p><div class="felder drei">
        ${f("kalkulation.stundensatz", "Kostensatz je Stunde (€)", (c.kalkulation || {}).stundensatz || "", "number")}</div>
        <div class="aktionen"><button class="btn jetzt" data-aktion="cfg-speichern">Übernehmen</button></div></div></section>`;
  }
  const EBENE_OPT = () => (window.EBENEN || []).filter((e) => e.id !== "partner").map((e) => ({ id: e.id, label: e.titel }));
  /* Zugang einer Person (Konto) als Zelle + Aktionen */
  function zugangZellen(id) {
    const k = (S.konten || []).find((x) => x.id === id), selbst = S.ich && S.ich.id === id;
    if (!k) return `<td class="zugang"><span class="leise">kein Zugang</span></td><td class="aktionen-zelle"><button class="btn klein voll" data-aktion="konto-neu" data-id="${esc(id || "")}">Zugang anlegen</button></td>`;
    const status = !k.aktiv ? '<span class="status-chip">gesperrt</span>' : k.mussAendern ? '<span class="status-chip pausiert">Startpasswort</span>' : `<small>${k.letzterLogin ? "zuletzt " + fKurz(new Date(k.letzterLogin)) : "noch nie angemeldet"}</small>`;
    return `<td class="zugang"><b>${esc(k.benutzer)}</b>${status}</td><td class="aktionen-zelle">
      <button class="btn klein" data-aktion="konto-reset" data-email="${esc(k.email)}" data-name="${esc(k.name || "")}">Passwort zurücksetzen</button>
      ${selbst ? "" : `<button class="btn klein still ${k.aktiv ? "gefahr" : ""}" data-aktion="konto-aktiv" data-email="${esc(k.email)}" data-wert="${k.aktiv ? "0" : "1"}">${k.aktiv ? "Sperren" : "Entsperren"}</button>`}</td>`;
  }
  /* Funktion = Rolle im Ablauf + Bezeichnung (Signatur) in einem */
  const FUNKTIONEN = [
    { rolle: "geschaeftsfuehrer", bezeichnung: "Geschäftsführer" },
    { rolle: "heizungsexperte", bezeichnung: "Heizungsexperte" },
    { rolle: "projektleiter", bezeichnung: "Projektleiter" },
    { rolle: "baustellenleiter", bezeichnung: "Baustellenleiter" },
    { rolle: "monteur", bezeichnung: "Monteur" },
    { rolle: "buero", bezeichnung: "Büro" },
  ];
  const funktionOpt = (m) => {
    const l = [...FUNKTIONEN];
    if (m.rolle && !l.some((f) => f.rolle === m.rolle && f.bezeichnung === m.bezeichnung)) l.push({ rolle: m.rolle, bezeichnung: m.bezeichnung || m.rolle });
    const akt = l.find((f) => f.rolle === m.rolle && f.bezeichnung === m.bezeichnung) || l.find((f) => f.rolle === m.rolle) || l[1];
    return l.map((f) => `<option value="${esc(f.rolle + "|" + f.bezeichnung)}"${f === akt ? " selected" : ""}>${esc(f.bezeichnung)}</option>`).join("");
  };
  const teamZeile = (m) => `<tr data-id="${esc(m.kuerzel || "")}"><td><input class="eingabe" data-team="name" value="${esc(m.name || "")}" aria-label="Name"></td><td><select class="eingabe" data-team="funktion" aria-label="Funktion">${funktionOpt(m)}</select></td><td><input class="eingabe kurz" data-team="kuerzel" value="${esc(m.kuerzel || "")}" aria-label="Kürzel"></td>
    <td><select class="eingabe" data-team="ebene" aria-label="Ebene">${opt(EBENE_OPT(), m.ebene || "planung")}</select></td><td><input class="eingabe" data-team="telefon" value="${esc(m.telefon || "")}" aria-label="Durchwahl" placeholder="Durchwahl"></td><td><input class="eingabe" type="email" data-team="email" value="${esc(m.email || "")}" aria-label="E-Mail"></td>${zugangZellen(m.kuerzel)}<td><button class="btn still" data-aktion="team-weg" aria-label="Entfernen">✕</button></td></tr>`;
  const partnerKonto = (x) => `<tr data-id="${esc(x.id)}"><td><b>${esc(x.firma)}</b><br><small class="leise">${esc([x.gewerk, x.name].filter(Boolean).join(" · "))}</small></td>${zugangZellen(x.id)}</tr>`;
  const partnerZeile = (x) => `<tr data-id="${esc(x.id || "")}"><td><input class="eingabe" data-partner="firma" value="${esc(x.firma || "")}" aria-label="Firma"></td><td><select class="eingabe" data-partner="gewerk" aria-label="Gewerk">${opt(Object.keys(cfg().gewerke || {}), x.gewerk)}</select></td>
    <td><input class="eingabe" data-partner="name" value="${esc(x.name || "")}" aria-label="Ansprechpartner"></td><td><input class="eingabe" data-partner="telefon" value="${esc(x.telefon || "")}" aria-label="Telefon"></td>${x.id ? zugangZellen(x.id) : '<td></td><td></td>'}<td><button class="btn still" data-aktion="team-weg" aria-label="Entfernen">✕</button></td></tr>`;
  const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "partner";
  function cfgSammeln() {
    const c = JSON.parse(JSON.stringify(cfg()));
    for (const el of $$("[data-cfg]")) {
      const pfad = el.dataset.cfg.split(".");
      let ziel = c; while (pfad.length > 1) ziel = ziel[pfad.shift()];
      ziel[pfad[0]] = el.type === "number" ? Number(el.value) || 0 : el.value.trim();
    }
    if ($("#team")) c.team = $$("#team tr").map((tr) => {
      const m = Object.fromEntries($$("[data-team]", tr).map((el) => [el.dataset.team, el.value.trim()]));
      if (m.funktion) { const [rolle, bezeichnung] = m.funktion.split("|"); Object.assign(m, { rolle, bezeichnung }); delete m.funktion; }
      return m;
    }).filter((m) => m.name || m.kuerzel);
    if ($("#ordnerrechte")) c.freigabeStandard = Object.fromEntries(ordnerSpalten().map(([e]) => [e, $$("#ordnerrechte [data-r-ordner]").filter((z) => $(`[data-r-e="${e}"]`, z).checked).map((z) => z.dataset.rOrdner)]));
    if ($("#rechte")) c.rechte = Object.fromEntries($$("#rechte [data-r-schritt]").map((z) => [z.dataset.rSchritt, $$("[data-r-e]", z).filter((x) => x.checked).map((x) => x.dataset.rE)]));
    if ($("#partner")) {
      const ids = new Set(), alt = cfg().partner || [];
      c.partner = $$("#partner tr[data-id]").map((tr) => {
        const x = Object.fromEntries($$("[data-partner]", tr).map((el) => [el.dataset.partner, el.value.trim()]));
        let id = tr.dataset.id || "p-" + slug(x.firma || "");
        if (!tr.dataset.id) while (ids.has(id) || alt.some((a) => a.id === id)) id += "-2";
        ids.add(id); return { ...(alt.find((a) => a.id === id) || {}), id, ...x };
      }).filter((x) => x.firma);
    }
    delete c.cloud;
    return c;
  }

  /* ================================================================
     Konten & Rechte (nur Geschäftsführung)
     ================================================================ */
  function rechteMatrix() {
    const zelle = (attr, an, teil) => `<span class="r-zelle"><input type="checkbox" ${attr}${an ? " checked" : ""}${teil ? " data-teil" : ""}></span>`;
    const levels = PHASEN.map((ph) => {
      const zeilen = ph.schritte.map((s) => {
        const l = siehtListe(s);
        return `<div class="r-zeile r-schritt" data-r-schritt="${esc(s.id)}"><span class="r-titel">${esc(ersetzen(s.titel))}<small>${esc({ formular: "Formular", dateien: "Dateien", termin: "Termin", mail: "Mail", erledigt: "Bestätigung", entscheidung: "Entscheidung", feld: "Eintrag", team: "Zuweisung" }[s.typ] || "")} · erledigt: ${esc(ebenenText(s.ebene))}</small></span>
          <span class="r-zelle r-gf" aria-label="Geschäftsführung: ja">✓</span>${RECHTE_EBENEN.map((e) => zelle(`data-r-e="${e}" aria-label="${esc((EBENE_TITEL[e] || e) + ": " + s.titel)}"`, l.includes(e))).join("")}</div>`;
      }).join("");
      const kopf = RECHTE_EBENEN.map((e) => { const n = ph.schritte.filter((s) => siehtListe(s).includes(e)).length; return zelle(`data-r-level="${e}" aria-label="${esc((EBENE_TITEL[e] || e) + ": ganzes Level " + ph.nr)}"`, n === ph.schritte.length, n > 0 && n < ph.schritte.length); }).join("");
      return `<div class="r-level" data-r-nr="${ph.nr}"><div class="r-zeile r-kopf"><button type="button" class="r-auf" data-aktion="r-auf" aria-expanded="false"><span class="r-pfeil" aria-hidden="true">›</span><b>${zwei(ph.nr)}</b> ${esc(ph.titel)}<small>${ph.schritte.length} Schritte</small></button>
        <span class="r-zelle r-gf">alle</span>${kopf}</div><div class="r-schritte" hidden>${zeilen}</div></div>`;
    }).join("");
    return `<section class="panel" id="rechte"><div class="r-titelzeile"><h2 class="panel-titel">Wer sieht was</h2><span class="kopf-aktionen"><button type="button" class="btn klein still" data-aktion="r-alle" data-wert="1">Alle aufklappen</button><button type="button" class="btn klein still" data-aktion="r-alle" data-wert="0">Alle zuklappen</button><button type="button" class="btn klein still" data-aktion="r-standard">Standard wiederherstellen</button></span></div>
      <p class="leise klein-text panel-innen">Haken = diese Ebene sieht den Schritt mit Inhalt (Formulare, Dateien). Erledigen darf, wer ihn sieht und im Ablauf dafür zuständig ist. Die Geschäftsführung sieht immer alles. Mit „Änderungen übernehmen“ speichern.</p>
      <div class="r-matrix"><div class="r-zeile r-th"><span>Level / Schritt</span><span>${esc(EBENE_TITEL.geschaeftsfuehrung || "Geschäftsführung")}</span>${RECHTE_EBENEN.map((e) => `<span>${esc(EBENE_TITEL[e] || e)}</span>`).join("")}</div>${levels}</div>
      <p class="vb-max">Ordner je Projekt gibt das Büro im Reiter „Team“ frei. ${Daten.modus === "cloud" ? "Die Datenbank setzt Ordner- und Partner-Freigaben durch." : "Im Demo-Modus liegen die Daten nur in diesem Browser."}</p></section>`;
  }
  const ordnerSpalten = () => [["planung", EBENE_TITEL.planung || "Planung"], ["monteur", EBENE_TITEL.monteur || "Monteur"],
    ...Object.keys(cfg().gewerke || {}).map((g) => ["partner:" + g, "Partner " + g])];
  function ordnerMatrix() {
    const zelle = (attr, an) => `<span class="r-zelle"><input type="checkbox" ${attr}${an ? " checked" : ""}></span>`;
    const SP = ordnerSpalten();
    const ord = KAT.filter((k) => !k.nurMitDateien);
    const zeilen = ord.map((k) => `<div class="r-zeile r-schritt" data-r-ordner="${esc(k.id)}"><span class="r-titel">${esc(k.titel)}${k.kunde ? "<small>auch per Kundenlink befüllt</small>" : ""}</span>
      <span class="r-zelle r-gf" aria-label="Geschäftsführung: ja">✓</span>${SP.map(([e, t]) => zelle(`data-r-e="${esc(e)}" aria-label="${esc(t + ": " + k.titel)}"`, freigabeStandard(e).includes(k.id))).join("")}</div>`).join("");
    return `<section class="panel" id="ordnerrechte"><div class="r-titelzeile"><h2 class="panel-titel">Ordner & Bilder</h2><span class="kopf-aktionen"><button type="button" class="btn klein still" data-aktion="r-ordner-standard">Standard wiederherstellen</button></span></div>
      <p class="leise klein-text panel-innen">Auf welche Projektordner – und damit welche Bilder und Dokumente – jede Rolle zugreifen kann. Gilt für alle Projekte. Externe Partner sehen die Ordner ihres Gewerks (Gewerk steht im Adressbuch). Mit „Änderungen übernehmen“ speichern.</p>
      <div class="r-scroll"><div class="r-matrix breit" style="--sp:${SP.length}"><div class="r-zeile r-th"><span>Ordner</span><span>${esc(EBENE_TITEL.geschaeftsfuehrung || "Geschäftsführung")}</span>${SP.map(([, t]) => `<span>${esc(t)}</span>`).join("")}</div>
      <div class="r-level offen" data-r-nr="ordner"><div class="r-zeile r-kopf"><span class="r-auf r-statisch"><b>${ord.length}</b> Ordner<small>alle an- oder abwählen</small></span><span class="r-zelle r-gf">alle</span>${SP.map(([e, t]) => zelle(`data-r-level="${esc(e)}" aria-label="${esc(t + ": alle Ordner")}"`, false)).join("")}</div>
      <div class="r-schritte">${zeilen}</div></div></div></div></section>`;
  }
  function rechteTeilzustand() {
    $$(".r-matrix .r-level").forEach((lv) => [...new Set($$("[data-r-level]", lv).map((x) => x.dataset.rLevel))].forEach((e) => {
      const alleK = $$(`.r-schritt [data-r-e="${e}"]`, lv), n = alleK.filter((x) => x.checked).length, k = $(`[data-r-level="${e}"]`, lv);
      k.checked = n === alleK.length; k.indeterminate = n > 0 && n < alleK.length;
    }));
  }
  function ansichtKonten() {
    const c = cfg();
    const rollen = [...new Set([...window.FIRMA.team.map((t) => t.rolle), ...c.team.map((t) => t.rolle)])];
    const anzahl = (S.konten || []).filter((k) => k.aktiv).length;
    return `<div class="seite konten">
      <header class="kopf"><div><p class="eyebrow">Nur für die Geschäftsführung</p><h1>Konten & Rechte</h1>
        <p class="unter leise">${anzahl} aktive ${anzahl === 1 ? "Zugang" : "Zugänge"}. Jede Person meldet sich mit eigenem Benutzernamen und Passwort an und sieht nur, was ihre Ebene erlaubt.</p></div>
        <div class="kopf-aktionen"><button class="btn jetzt" data-aktion="konten-speichern">Änderungen übernehmen</button></div></header>
      ${S.kontenFehler ? `<p class="luecken">${esc(S.kontenFehler)}</p>` : ""}
      <section class="panel"><h2 class="panel-titel">Mitarbeiter</h2>
        <div class="tab-wrap ohne-rand"><table class="team-tabelle konten-tab"><thead><tr><th>Name</th><th>Funktion</th><th>Kürzel</th><th>Ebene</th><th>Telefon</th><th>E-Mail</th><th>Zugang</th><th></th><th></th></tr></thead>
        <tbody id="team">${c.team.map((m) => teamZeile(m)).join("")}</tbody></table></div>
        <div class="aktionen panel-innen"><button class="btn klein" data-aktion="team-neu">+ Person</button><span class="leise klein-text">Neue Personen erst mit „Änderungen übernehmen“ speichern, dann den Zugang anlegen.</span></div></section>
      <section class="panel"><h2 class="panel-titel">Externe Partner <small>sehen nur zugewiesene Einsätze und ihr Gewerk</small></h2>
        <div class="tab-wrap ohne-rand"><table class="team-tabelle konten-tab"><thead><tr><th>Firma</th><th>Zugang</th><th></th></tr></thead>
        <tbody>${(c.partner || []).map((x) => partnerKonto(x)).join("") || '<tr><td colspan="3" class="leise">Noch keine Partner – im Adressbuch anlegen.</td></tr>'}</tbody></table></div>
        <div class="aktionen panel-innen"><a class="btn klein" href="#/adressbuch">Partner im Adressbuch pflegen</a></div></section>
      ${rechteMatrix()}
      ${ordnerMatrix()}
    </div>`;
  }
  async function kontenLaden() {
    try { S.konten = await Daten.konten(); S.kontenFehler = ""; }
    catch (e) { S.konten = []; S.kontenFehler = "Konten konnten nicht geladen werden: " + (e.message || e); }
    S.kontenGeladen = true;
  }
  const startpasswort = () => { const w = ["Fliese", "Wanne", "Dusche", "Spiegel", "Armatur", "Becken"]; return `${w[Math.floor(Math.random() * w.length)]}-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).slice(2, 5)}`; };
  const benutzerVorschlag = (name) => String(name || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9.-]/g, "") || "mitarbeiter";
  function zugangErgebnis(dlg, name, benutzer, pw) {
    const url = location.origin + location.pathname;
    const text = `Zugang zum Heizungs-Dashboard\nAdresse: ${url}\nBenutzername: ${benutzer}\nStartpasswort: ${pw}\nBeim ersten Anmelden bitte ein eigenes Passwort festlegen.`;
    dlg.innerHTML = `<div class="dlg-kopf"><div><p class="eyebrow">${esc(name)}</p><h2>Zugang bereit</h2><p>Bitte persönlich weitergeben. Das Startpasswort wird nur jetzt angezeigt; beim ersten Anmelden vergibt ${esc(name.split(" ")[0])} ein eigenes.</p></div><button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><dl class="infos gross"><dt>Adresse</dt><dd>${esc(url)}</dd><dt>Benutzername</dt><dd><b>${esc(benutzer)}</b></dd><dt>Startpasswort</dt><dd><code class="pw">${esc(pw)}</code></dd></dl></div>
      <div class="dlg-fuss"><button class="btn" data-dlg="kopieren">Zugangsdaten kopieren</button><button class="btn jetzt" data-aktion="dlg-zu">Fertig</button></div>`;
    $('[data-dlg="kopieren"]', dlg).addEventListener("click", async () => { await kopieren(text); toast("Zugangsdaten kopiert"); });
  }
  function kontoNeuDialog(id) {
    const m = mitgliedZu(id);
    if (!m) return toast("Erst „Änderungen übernehmen“, dann den Zugang anlegen", "fehler");
    const vorschlag = m.ebene === "partner" ? slug(m.name).replace(/-/g, "") : benutzerVorschlag(m.name);
    dialog(`<form id="konto-form"><div class="dlg-kopf"><div><p class="eyebrow">${esc(EBENE_TITEL[m.ebene] || "")}</p><h2>Zugang für ${esc(m.name)}</h2><p>Benutzername und Startpasswort festlegen. Beim ersten Anmelden wird ein eigenes Passwort verlangt.</p></div><button class="btn still" type="button" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="felder">
        <div class="feld"><label for="kn-b">Benutzername</label><input class="eingabe" id="kn-b" value="${esc(vorschlag)}" autocapitalize="none" spellcheck="false" required pattern="[A-Za-z0-9._@-]{2,60}"></div>
        <div class="feld"><label for="kn-p">Startpasswort (mind. 8 Zeichen)</label><input class="eingabe" id="kn-p" value="${esc(startpasswort())}" minlength="8" required></div>
      </div><p class="luecken versteckt" id="kn-f"></p></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-aktion="dlg-zu">Abbrechen</button><button class="btn jetzt" type="submit">Zugang anlegen</button></div></form>`, (dlg) => {
      $("#konto-form", dlg).addEventListener("submit", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const b = $("#kn-b", dlg).value.trim(), pw = $("#kn-p", dlg).value;
        try {
          await Daten.kontoAnlegen({ benutzer: b, passwort: pw, id: m.id, ebene: m.ebene, name: m.name, formulare: m.ebene === "partner" ? partnerFormulare(m.gewerk) : [] });
          await kontenLaden(); render(); zugangErgebnis(dlg, m.name, b.toLowerCase(), pw);
        } catch (err) { const f = $("#kn-f", dlg); f.textContent = err.message || String(err); f.classList.remove("versteckt"); }
      });
    });
  }
  function kontoResetDialog(email, name) {
    const pw = startpasswort();
    dialog(`<div class="dlg-kopf"><div><p class="eyebrow">${esc(name)}</p><h2>Passwort zurücksetzen?</h2><p>${esc(name)} bekommt ein neues Startpasswort und muss beim nächsten Anmelden ein eigenes festlegen.</p></div><button class="btn still" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="feld"><label for="kr-p">Neues Startpasswort</label><input class="eingabe" id="kr-p" value="${esc(pw)}" minlength="8"></div><p class="luecken versteckt" id="kr-f"></p></div>
      <div class="dlg-fuss"><button class="btn" data-aktion="dlg-zu">Abbrechen</button><button class="btn jetzt" data-dlg="reset">Zurücksetzen</button></div>`, (dlg) => {
      $('[data-dlg="reset"]', dlg).addEventListener("click", async () => {
        const neu = $("#kr-p", dlg).value;
        try { await Daten.kontoZuruecksetzen(email, neu); await kontenLaden(); render(); zugangErgebnis(dlg, name, (S.konten.find((k) => k.email === email) || {}).benutzer || email, neu); }
        catch (err) { const f = $("#kr-f", dlg); f.textContent = err.message || String(err); f.classList.remove("versteckt"); }
      });
    });
  }
  function passwortDialog() {
    dialog(`<form id="pw-form"><div class="dlg-kopf"><div><p class="eyebrow">${esc(S.ich.name)}</p><h2>Passwort ändern</h2></div><button class="btn still" type="button" data-aktion="dlg-zu" aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="felder"><div class="feld"><label for="pw-1">Neues Passwort (mind. 8 Zeichen)</label><input class="eingabe" id="pw-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="feld"><label for="pw-2">Wiederholen</label><input class="eingabe" id="pw-2" type="password" autocomplete="new-password" minlength="8" required></div></div><p class="luecken versteckt" id="pw-f"></p></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-aktion="dlg-zu">Abbrechen</button><button class="btn jetzt" type="submit">Speichern</button></div></form>`, (dlg) => {
      $("#pw-form", dlg).addEventListener("submit", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const a = $("#pw-1", dlg).value, b = $("#pw-2", dlg).value, f = $("#pw-f", dlg);
        if (a !== b) { f.textContent = "Die Passwörter stimmen nicht überein."; return f.classList.remove("versteckt"); }
        try { await Daten.passwortAendern(a); dlg.close(); toast("Passwort geändert"); }
        catch (err) { f.textContent = err.message || String(err); f.classList.remove("versteckt"); }
      });
    });
  }

  /* Je ein Übungsprojekt für André und Steven, beide in Level 01 */
  function musterProjekte() {
    [["André", "AW", "Herr"], ["Steven", "SW", "Herr"]].forEach(([vorname, kz, anrede]) => {
      if (alle().some((p) => p.muster === kz)) return;
      neuesProjekt({ anrede, vorname, nachname: "Musterprojekt", ort: "71134 Aidlingen", strasse: "Übungsweg", hausnr: "1", email: `${kz.toLowerCase()}@beispiel.de`, telefon: "07056 000000" },
        { demo: true, muster: kz, zustaendig: kz, notiz: `Übungsprojekt für ${vorname} – zum Ausprobieren aller Level.` });
    });
  }

  /* ---------- Beispielprojekte ---------- */
  function demoLaden() {
    const t = (n, h) => { const d = plusTage(new Date(), n); if (d.getDay() === 6) d.setDate(d.getDate() + 2); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return h ? `${isoTag(d)}T${h}` : isoTag(d); };
    const pl = leute("heizungsexperte").map((m) => m.kuerzel), bl = leute("baustellenleiter").map((m) => m.kuerzel).slice(0, 1);
    const mk = (kunde, ph, extra) => {
      const level = {}; let tt = Date.now() - (ph * 6 + 4) * TAG;
      PHASEN.filter((x) => x.nr <= ph).forEach((x) => { level[x.nr] = tt; tt += 6 * TAG; });
      const p = neuesProjekt(kunde, { demo: true, phase: ph, angelegt: level[ersteNr], level, ...extra });
      if (istGF() && ph >= 3) { const w = 22000 + ph * 1100; S.zahlen[p.id] = { angebot: w, ...(ph >= 5 ? { auftrag: w } : {}), ...(ph >= 9 ? { abschlag: Math.round(w * 0.3) } : {}) }; Daten.zahlenSpeichern(p.id, S.zahlen[p.id]); }
      return p;
    };
    /* abgeschlossene und abgesagte Heizungen mit Verlauf und Zahlen – damit „Kennzahlen“ etwas zeigt */
    const DAUER = [2, 6, 5, 9, 12, 21, 8, 10, 5, 4, 12];
    const fertigBsp = [
      ["Herr", "Klaus", "Hartmann", "71139 Ehningen", 330, 38400, 26100, "Empfehlung", "Wärmepumpe"],
      ["Frau", "Sabine", "Weidner", "71083 Herrenberg", 290, 15800, 10900, "Website / Heizungsrechner", "Gas"],
      ["Familie", "", "Lorenz", "71034 Böblingen", 240, 39500, 27400, "Website / Heizungsrechner", "Pellets"],
      ["Herr und Frau", "", "Stängle", "71155 Altdorf", 190, 21900, 15200, "Stammkunde", "Öl"],
      ["Frau", "Ingrid", "Bauer", "71134 Aidlingen", 150, 36700, 25300, "Empfehlung", "Wärmepumpe"],
      ["Herr", "Tobias", "Riedel", "71131 Jettingen", 120, 14600, 10100, "Social Media", "Gas"],
    ];
    fertigBsp.forEach(([anrede, vorname, nachname, ort, vor, umsatz, kosten, kontakt, art], i) => {
      const start = Date.now() - vor * TAG, level = {}; let t = start;
      PHASEN.forEach((ph, k) => { level[ph.nr] = t; t += (DAUER[k] + ((i * 3 + k) % 5) - 2) * TAG; });
      const p = neuesProjekt({ anrede, vorname, nachname, ort }, { demo: true, phase: PHASEN[N - 1].nr, status: "abgeschlossen", angelegt: start, level, abgeschlossenAm: t,
        projektnr: `H-2026-00${i + 1}`, zustaendig: pl[i % Math.max(pl.length, 1)] || "", formulare: { bestandsaufnahme: { werte: { kontakt } }, erstgespraech: { werte: { neu: [art] } } } });
      const bez = isoTag(new Date(t + 12 * TAG));
      if (istGF()) { S.zahlen[p.id] = { angebot: umsatz, auftrag: umsatz, abschlag: Math.round(umsatz * 0.3), abschlagBezahlt: bez, rechnung: Math.round(umsatz * 0.7), ...(i < 5 ? { rechnungBezahlt: bez } : {}), material: Math.round(kosten * 0.62), sub: Math.round(kosten * 0.1), lohn: Math.round(kosten * 0.25), sonst: Math.round(kosten * 0.03) }; Daten.zahlenSpeichern(p.id, S.zahlen[p.id]); }
    });
    [["Herr", "Peter", "Absage", 200, "Website / Heizungsrechner"], ["Frau", "Maria", "Vergleich", 100, "Social Media"]].forEach(([anrede, vorname, nachname, vor, kontakt]) =>
      neuesProjekt({ anrede, vorname, nachname, ort: "71088 Holzgerlingen" }, { demo: true, phase: 4, status: "verloren", angelegt: Date.now() - vor * TAG, level: { 1: Date.now() - vor * TAG }, formulare: { bestandsaufnahme: { werte: { kontakt } } } }));
    musterProjekte();
    mk({ anrede: "Familie", nachname: "Beispiel", ort: "71134 Aidlingen", strasse: "Lindenweg", hausnr: "4", telefon: "07031 000000", email: "familie@beispiel.de" }, 1, {});
    mk({ anrede: "Frau", vorname: "Anna", nachname: "Muster", ort: "71083 Herrenberg", strasse: "Hauptstr.", hausnr: "12", email: "anna@beispiel.de" }, 2,
      { zustaendig: pl[0] || "", termine: { erstgespraech: t(3, "10:00") }, schritte: { "2:kwp-kunde": { erledigt: true, am: Date.now() } },
        formulare: { bestandsaufnahme: { werte: { kontakt: "Website / Heizungsrechner", system: "Zentralheizung", energie: "Öl", kesselBaujahr: 1994, qm: 165 } } } });
    mk({ anrede: "Herr und Frau", nachname: "Probst", ort: "71032 Böblingen", strasse: "Am Wald", hausnr: "3", email: "probst@beispiel.de" }, 4,
      { zustaendig: pl[0] || "", projektnr: "H-2026-027", termine: { erstgespraech: t(-9, "15:00") },
        formulare: { erstgespraech: { werte: { neu: ["Gas"], flaechen: ["Heizkörper 60 / 40"], pauschale: "vereinbart" } } } });
    mk({ anrede: "Herr", vorname: "Jonas", nachname: "Vorlage", ort: "71101 Schönaich", strasse: "Gartenstr.", hausnr: "8", email: "jonas@beispiel.de" }, 6,
      { zustaendig: pl[0] || "", besichtiger: bl, projektnr: "H-2026-019", termine: { erstgespraech: t(-30, "10:00"), baustellenbesichtigung: t(-12, "08:30") },
        formulare: { erstgespraech: { werte: { neu: ["Wärmepumpe"], solar: ["Photovoltaik"], flaechen: ["Fußbodenheizung 35 / 25"] } },
          baustellenbesichtigung: { werte: { weitere: ["Tank leer pumpen", "Tankdemontage", "Elektro groß", "Inbetriebnahme WP"], elektriker: "ja", tank: "ja", geruest: "nein", kamin: "nein" } } } });
    const mo = monteure().map((m) => m.kuerzel), pa = (cfg().partner || []).map((x) => x.id);
    mk({ anrede: "Familie", nachname: "Testfeld", ort: "71093 Weil im Schönbuch", strasse: "Schulstr.", hausnr: "1", email: "testfeld@beispiel.de", telefon: "07157 000000" }, 9,
      { zustaendig: pl[0] || "", besichtiger: bl, projektnr: "H-2026-011", termine: { baustart: t(5), abnahme: t(9, "10:00") }, zugriff: [...mo.slice(0, 1), ...pa],
        notiz: "Interne Notiz: Kunde zahlt in zwei Raten.",
        schritte: { "6:foerderung": { wahl: "ja", am: Date.now() }, "6:zusage": { wahl: "zusage", am: Date.now() } }, bzaNr: "BZA-1234567",
        formulare: { erstgespraech: { werte: { neu: ["Gas"], solar: ["Warmwasserbereitung"], flaechen: ["Heizkörper 60 / 40"] } },
          baustellenbesichtigung: { werte: { heizraum: "3,2 × 2,8 m", kellertuer: "80 × 195 cm", heizraumtuer: "75 × 195 cm", kaminD: "18 cm", weitere: ["Elektro klein", "Tank leer pumpen", "Tankdemontage"], elektriker: "ja", elektrikerWer: pa[0] || "eigen", tank: "ja", tankWer: pa[1] || "eigen", geruest: "nein", kamin: "nein" } },
          tankdemontage: { werte: { tankart: "Batterietank", material: "PE", groesse: 6000, inhalt: 900 } } } });
  }

  const keinZugang = () => `<div class="login"><div class="panel login-karte"><h1>Kein Zugang</h1><p>Dieses Konto ist keiner Ebene zugeordnet oder gesperrt. Bitte an die Geschäftsführung wenden – sie verwaltet die Zugänge unter „Konten“.</p><button class="btn" data-aktion="abmelden">Abmelden</button></div></div>`;
  const DEMO_KONTEN = [["chef", "DB"], ["andre", "AW"], ["steven", "SW"], ["bauleiter", "BL"], ["monteur", "MO"], ["elektro", "p-elektro"], ["tank", "p-tank"]];
  const DEMO_PW = "demo1234";
  const istDemo = () => { try { return localStorage.getItem("heizdashboard:demo") === "1"; } catch (e) { return false; } };
  async function demoKontenAnlegen() {
    const vorhanden = new Set((await Daten.konten()).map((k) => k.id));
    for (const [b, id] of DEMO_KONTEN) {
      const m = mitgliedZu(id); if (!m || vorhanden.has(id)) continue;
      await Daten.kontoAnlegen({ benutzer: b, passwort: DEMO_PW, id, ebene: m.ebene, name: m.name, formulare: m.ebene === "partner" ? partnerFormulare(m.gewerk) : [] }, true);
    }
    try { localStorage.setItem("heizdashboard:demo", "1"); } catch (e) { /* egal */ }
  }
  function vorraum(html) { document.body.classList.add("vorraum"); $("#main").innerHTML = html; const f = $("#main input"); if (f) setTimeout(() => f.focus(), 30); }

  /* ================================================================
     Auszug für die Übersichtsseite (Brüll Dashboard): mit ?auszug=1 berechnet der Bereich
     seine Fälligkeiten, Termine, Mails, Baustellen, Team und Kennzahlen und meldet sie an die Übersicht.
     ================================================================ */
  const AUSZUG = new URLSearchParams(location.search).has("auszug");
  function auszug() {
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    const laufend = alle().filter((p) => p.status === "aktiv" || p.status === "pausiert");
    const kurz = (p) => ({ pid: p.id, name: anzeigeName(p), ort: (p.kunde || {}).ort || "", zust: p.zustaendig || "", zugriff: p.zugriff || [] });
    const faellig = laufend.flatMap(faelligkeiten).sort((a, b) => a.d - b.d).map((f) => ({ ...kurz(f.p), text: f.text, unter: f.unter, d: +f.d, ueber: f.ueber }));
    const naechstes = laufend.filter((p) => p.status === "aktiv").map((p) => {
      const st = phaseStatus(p, p.phase), o = st.offen[0];
      return { ...kurz(p), phase: p.phase, level: phase(p.phase).titel, schritt: o ? ersetzen(o.s.titel, p) : "Level abschließen", fertig: st.fertig, pflicht: st.pflicht, komplett: st.komplett };
    }).sort((a, b) => (b.komplett - a.komplett) || (b.phase - a.phase));
    const termine = [];
    for (const p of alle()) for (const t of TERMINE) {
      const d = datum((p.termine || {})[t.key]);
      if (d && tageBis(d) >= 0 && tageBis(d) <= 31 && p.status !== "verloren") termine.push({ ...kurz(p), label: t.label, s: p.termine[t.key], d: +d });
    }
    termine.sort((a, b) => a.d - b.d);
    const mails = [];
    for (const p of laufend.filter((x) => x.status === "aktiv")) for (const s of phase(p.phase).schritte)
      if (s.typ === "mail" && schrittGilt(p, p.phase, s) && !(p.mails || {})[s.mail]) mails.push({ ...kurz(p), titel: ersetzen(s.titel), an: (p.kunde || {}).email || "" });
    const neu = {};
    for (const d of S.dateien.filter((x) => x.neu && finde(x.projekt_id))) { const p = finde(d.projekt_id); (neu[p.id] = neu[p.id] || { ...kurz(p), n: 0 }).n++; }
    const baustellen = laufend.filter((p) => { const bs = datum((p.termine || {}).baustart), ab = datum((p.termine || {}).abnahme); return bs && tageBis(bs) <= 7 && (!ab || tageBis(ab) >= 0) && p.phase >= 9; })
      .map((p) => ({ ...kurz(p), baustart: p.termine.baustart, abnahme: p.termine.abnahme || "", phase: p.phase, level: phase(p.phase).titel,
        team: (p.zugriff || []).map((id) => (mitgliedZu(id) || {}).name || id), laeuftHeute: tageBis(datum(p.termine.baustart)) <= 0 }));
    const team = cfg().team.filter((m) => m.name).map((m) => {
      const l = m.ebene === "monteur" ? laufend.filter((p) => (p.zugriff || []).includes(m.kuerzel)) : laufend.filter((p) => p.zustaendig === m.kuerzel);
      const timer = alle().map((p) => ({ p, z: (p.zeiten || []).find((z) => z.wer === m.kuerzel && !z.ende) })).find((x) => x.z);
      return { kuerzel: m.kuerzel, name: m.name, ebene: m.ebene, funktion: m.bezeichnung || "", projekte: l.length, timer: timer ? { name: anzeigeName(timer.p), seit: timer.z.start } : null };
    });
    let kennzahlen = null;
    if (istGF()) {
      const jahr = new Date().getFullYear(), sum = (l, f) => l.reduce((a, p) => a + (f(p) || 0), 0);
      const fertigJahr = alle().filter((p) => p.status === "abgeschlossen" && p.abgeschlossenAm && new Date(p.abgeschlossenAm).getFullYear() === jahr);
      kennzahlen = {
        anfragen: laufend.filter((p) => p.phase <= 3).length,
        angebote: laufend.filter((p) => p.phase >= 4 && p.phase <= 5).length, angeboteWert: sum(laufend.filter((p) => p.phase >= 4 && p.phase <= 5), (p) => geld(p).angebot),
        bestand: sum(laufend.filter((p) => p.phase >= 6), (p) => geld(p).auftrag || geld(p).angebot), auftraege: laufend.filter((p) => p.phase >= 6).length,
        umsatzJahr: sum(fertigJahr, (p) => geld(p).umsatz), fertigJahr: fertigJahr.length, ziel: (cfg().ziele || {}).jahresumsatz || 0,
        verloren: alle().filter((p) => p.status === "verloren").length,
      };
    }
    return { titel: cfg().bereich || "", ich: { id: S.ich.id, name: S.ich.name, ebene: S.ich.ebene }, laufend: laufend.length,
      abschnitte: (window.ABSCHNITTE || []).map((a) => ({ titel: a.titel, n: laufend.filter((p) => p.phase >= a.von && p.phase <= a.bis).length })),
      faellig, naechstes, termine, mails, neu: Object.values(neu), baustellen, team, kennzahlen, firma: { name: cfg().name, adresse: cfg().adresse } };
  }
  function auszugSenden() {
    try { parent.postMessage({ typ: "bruell-auszug", pfad: location.pathname, daten: auszug() }, location.origin); }
    catch (e) { parent.postMessage({ typ: "bruell-auszug", pfad: location.pathname, fehler: String(e && e.message || e) }, location.origin); }
  }
  async function weiter() {
    if (!Daten.angemeldet) return vorraum(Daten.ersteinrichtungNoetig() ? ansichtErsteinrichtung() : ansichtLogin());
    if (!Daten.mitglied) return vorraum(keinZugang());
    if (Daten.mitglied.mussAendern) return vorraum(ansichtPasswortPflicht());
    await laden();
    if (AUSZUG) return auszugSenden();
    document.body.classList.remove("vorraum");
    S.kontenGeladen = false;
    letztePid = aktuellePid();
    if (letztePid) await sperreAktualisieren(letztePid);
    render();
    abwesenheitPruefen();
  }
  const loginKopf = (unter) => `<img src="${esc(cfg().logo)}" alt="" class="login-logo"><h1>${esc(cfg().name)}</h1><p class="leise">${unter}</p>`;
  function ansichtErsteinrichtung(fehler) {
    const gf = cfg().team.find((t) => t.ebene === "geschaeftsfuehrung") || cfg().team[0];
    return `<div class="login"><form class="panel login-karte" id="erst-form">${loginKopf("Ersteinrichtung · Zugang für die Geschäftsführung")}
      <p>Es gibt noch keine Konten. Lege zuerst den Zugang für <b>${esc(gf.name)}</b> an – danach vergibt die Geschäftsführung unter „Konten“ alle weiteren Zugänge.</p>
      ${fehler ? `<p class="luecken">${esc(fehler)}</p>` : ""}
      <div class="feld"><label for="e-b">Benutzername</label><input class="eingabe" id="e-b" value="${esc(benutzerVorschlag(gf.name))}" autocapitalize="none" spellcheck="false" required></div>
      <div class="feld"><label for="e-p1">Passwort (mind. 8 Zeichen)</label><input class="eingabe" id="e-p1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="feld"><label for="e-p2">Wiederholen</label><input class="eingabe" id="e-p2" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn jetzt gross" type="submit">Zugang anlegen & anmelden</button></form></div>`;
  }
  function ansichtPasswortPflicht(fehler) {
    return `<div class="login"><form class="panel login-karte" id="pflicht-form">${loginKopf("Willkommen, " + esc((Daten.mitglied.name || "").split(" ")[0]))}
      <p>Du meldest dich zum ersten Mal an (oder dein Passwort wurde zurückgesetzt). Bitte lege jetzt dein eigenes Passwort fest.</p>
      ${fehler ? `<p class="luecken">${esc(fehler)}</p>` : ""}
      <div class="feld"><label for="pf-1">Neues Passwort (mind. 8 Zeichen)</label><input class="eingabe" id="pf-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="feld"><label for="pf-2">Wiederholen</label><input class="eingabe" id="pf-2" type="password" autocomplete="new-password" minlength="8" required></div>
      <button class="btn jetzt gross" type="submit">Passwort speichern</button><button class="btn still" type="button" data-aktion="abmelden">Abmelden</button></form></div>`;
  }

  /* ================================================================
     Login (Cloud)
     ================================================================ */
  function ansichtLogin(fehler) {
    const demo = istDemo() && Daten.modus === "lokal";
    return `<div class="login"><div class="login-spalte"><form class="panel login-karte" id="login-form">${loginKopf("Heizungs-Dashboard · Anmeldung")}
      ${fehler ? `<p class="luecken">${esc(fehler)}</p>` : ""}
      <div class="feld"><label for="l-b">Benutzername</label><input class="eingabe" id="l-b" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="feld"><label for="l-pw">Passwort</label><input class="eingabe" id="l-pw" type="password" autocomplete="current-password" required></div>
      <button class="btn jetzt gross" type="submit">Anmelden</button>
      <p class="leise klein-text">Passwort vergessen? Die Geschäftsführung setzt es unter „Konten“ zurück.</p></form>
      ${demo ? `<section class="panel demo-konten"><h2>Demo-Zugänge</h2><p class="leise klein-text">Zum Ausprobieren – Passwort für alle: <code>${DEMO_PW}</code>. Klick füllt die Anmeldung aus.</p>
        <ul>${DEMO_KONTEN.map(([b, id]) => { const m = mitgliedZu(id); return m ? `<li><button type="button" class="demo-k" data-aktion="demo-login" data-b="${b}"><b>${b}</b><span>${esc(m.name)} · ${esc(EBENE_TITEL[m.ebene] || "")}</span></button></li>` : ""; }).join("")}</ul></section>` : ""}</div></div>`;
  }

  /* ================================================================
     Router & Rendern
     ================================================================ */
  function route() {
    const [pfad, query] = location.hash.replace(/^#\/?/, "").split("?");
    const teile = (pfad || "cockpit").split("/");
    return { name: teile[0], arg: teile[1], sub: teile[2], subArg: teile[3], query: new URLSearchParams(query || "") };
  }
  function render() {
    if (!S.ich) return;
    anwenden();
    if (route().name === "konten" && istGF() && !S.kontenGeladen) { S.kontenGeladen = true; kontenLaden().then(() => { if (route().name === "konten") render(); }); }
    const r = route();
    if (r.name === "projekte" && r.query.get("abschnitt")) { S.filter.abschnitt = r.query.get("abschnitt"); S.filter.status = "offen"; }
    const e = ebene();
    const html =
      e === "partner" ? (r.name === "projekt" ? ansichtEinsatz(r.arg) : ansichtEinsaetze()) :
      r.name === "projekt" && r.sub === "formular" ? ansichtFormular(r.arg, r.subArg) :
      r.name === "projekt" && r.sub === "nachkalkulation" ? ansichtNachkalkulation(r.arg) :
      r.name === "projekt" ? ansichtProjekt(r.arg) :
      e === "monteur" ? ansichtBaustellen() :
      r.name === "projekte" ? ansichtProjekte() :
      r.name === "einrichtung" && istGF() ? ansichtEinrichtung() :
      r.name === "kennzahlen" && istGF() ? ansichtKennzahlen(r.arg) :
      r.name === "konten" && istGF() ? ansichtKonten() :
      r.name === "adressbuch" ? ansichtAdressbuch() : ansichtCockpit();
    $("#main").innerHTML = html;
    if ($(".r-matrix")) rechteTeilzustand();
    navRendern();
    const nav = r.name === "projekt" ? (istBuero() ? "projekte" : "cockpit") : ["einrichtung", "projekte", "kennzahlen", "konten", "adressbuch"].includes(r.name) ? r.name : "cockpit";
    $$(".nav a").forEach((a) => (a.dataset.nav === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    statusLeiste();
    vorschauenLaden();
    unterschriftenAn();
    blattStiftAn();
    if (r.name === "projekt" && !r.sub && istBuero()) gesehenMarkieren(r.arg);
  }
  function navRendern() {
    const e = ebene();
    const punkte = e === "partner" ? [["cockpit", "Meine Einsätze", "projekte"]]
      : e === "monteur" ? [["cockpit", "Meine Baustellen", "projekte"]]
      : [["cockpit", "Cockpit", "cockpit"], ["projekte", "Projekte", "projekte"], ["adressbuch", "Adressbuch", "adressbuch"], ...(istGF() ? [["kennzahlen", "Unternehmen", "kennzahlen"], ["konten", "Konten", "konten"], ["einrichtung", "Einrichtung", "einrichtung"]] : [])];
    $(".nav").innerHTML = punkte.map(([id, l, i]) => `<a href="#/${id}" data-nav="${id}"><span class="nav-i i-${i}" aria-hidden="true"></span>${l}</a>`).join("");
    const nk = $(".neu-knopf"); if (nk) nk.hidden = !istBuero();
  }
  function allesNeu() {
    const r = route();
    if (r.name === "projekt" && r.sub === "formular") { const p = finde(r.arg); if (p) return formularNeuZeichnen(p, r.subArg, true); }
    if (r.name === "projekt" && !r.sub && ebene() !== "partner") { const p = finde(r.arg); if (p) { kopfNeu(p); return teilRendern(p); } }
    render();
  }
  function statusLeiste() {
    const el = $("#speicher"); if (!el) return;
    if (!S.ich) { el.innerHTML = ""; return; }
    const cloud = Daten.modus === "cloud";
    el.innerHTML = `<div class="ich"><span class="ich-k">${esc((S.ich.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase())}</span><span><b>${esc(S.ich.name)}</b><small>${esc(EBENE_TITEL[S.ich.ebene] || "")}</small></span></div>
      ${(() => { const l = meinLaufender(); return l ? `<a class="rail-timer" href="#/projekt/${l.p.id}"><span class="timer-punkt" aria-hidden="true"></span>${esc(l.p.kunde.nachname)} · <span data-timer="${l.p.id}">${hms(dauerMs(l.z))}</span>${pauseLaeuft(l.z) ? " · Pause" : ""}</a>` : ""; })()}
      <div class="ich-aktionen"><button class="btn klein hell" data-aktion="passwort">Passwort ändern</button><button class="btn klein hell" data-aktion="abmelden">Abmelden</button></div>
      <p class="sp-zeile"><span class="punkt${cloud ? " an" : ""}"></span>${cloud ? "Cloud verbunden" : "Demo – Daten nur in diesem Browser"}</p>`;
  }

  /* „neu vom Kunden“ wird beim Öffnen als gesehen gespeichert, bleibt aber bis zum nächsten Laden hervorgehoben */
  async function gesehenMarkieren(pid) {
    if (!S.dateien.some((d) => d.projekt_id === pid && d.neu)) return;
    try { await Daten.gesehen(pid); } catch (e) { /* später erneut */ }
  }

  /* ---------- Hochladen ---------- */
  async function hochladen(p, kat, files) {
    files = [...files]; if (!files.length) return;
    if (gesperrt(p)) return toast(`Schreibgeschützt – ${S.sperre.name || "jemand anderes"} bearbeitet gerade`, "fehler");
    $$(`[data-ablage="${kat}"] .drop`).forEach((z) => z.classList.add("laedt"));
    let ok = 0;
    for (const f of files) {
      if (f.size > 50e6) { toast(`${f.name} ist größer als 50 MB`, "fehler"); continue; }
      try { const d = await Daten.hochladen(p.id, kat, f, ebene() === "partner" ? "partner" : "team"); S.dateien.push(d); ok++; }
      catch (e) { toast(`Upload fehlgeschlagen: ${f.name}`, "fehler"); }
    }
    if (ok) { aendern(p, () => {}, `${ok} ${ok === 1 ? "Datei" : "Dateien"} in „${katTitel(kat)}“ abgelegt`); toast(`${ok} ${ok === 1 ? "Datei" : "Dateien"} abgelegt`); }
    allesNeu();
  }

  /* ================================================================
     Ereignisse
     ================================================================ */
  const aktuellesProjekt = () => { const el = $("#main [data-projekt]"); return el ? finde(el.dataset.projekt) : null; };
  const schrittTitel = (key) => { const [nr, id] = key.split(":"); return (phase(Number(nr)).schritte.find((s) => s.id === id) || {}).titel || id; };

  document.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-aktion]");
    if (!a || a.closest("dialog")) return;
    const akt = a.dataset.aktion;
    const p = aktuellesProjekt();

    if (akt === "neu") return istBuero() ? neuDialog() : null;
    if (akt === "projekte-reiter") { S.filter.status = a.dataset.wert; if (a.dataset.wert !== "offen") S.filter.abschnitt = ""; return render(); }
    if (akt === "nur-meine") { S.nurMeine = a.dataset.wert === "1"; return render(); }
    if (akt === "kz-zeitraum") { S.kzZeitraum = a.dataset.wert; return render(); }
    if (akt === "freigabe" && p && istBuero()) {
      const id = a.dataset.id, kat = a.dataset.kat;
      aendern(p, (x) => {
        x.freigaben = { ...(x.freigaben || {}) };
        const l = new Set(ordnerFuer(x, id, a.dataset.art)); l.has(kat) ? l.delete(kat) : l.add(kat);
        x.freigaben[id] = [...l];
      }, `Freigabe ${katTitel(kat)} für ${(mitgliedZu(id) || {}).name || id} ${ordnerFuer(p, id, a.dataset.art).includes(kat) ? "entzogen" : "erteilt"}`);
      $("#akte").innerHTML = akte(p); return teilRendern(p);
    }
    if (akt === "palettemove") {
      const q = a.dataset.id ? finde(a.dataset.id) : p; if (!q || !q.downloadCode) return;
      await kopieren(q.downloadCode);
      const c = cfg().programme, link = c.app3dLink ? c.app3dLink.replace("{code}", encodeURIComponent(q.downloadCode)) : c.app3dStore;
      toast(c.app3dLink ? `${c.app3dApp || c.app3d} wird geöffnet` : `Code ${q.downloadCode} kopiert – in ${c.app3d} einfügen`);
      setTimeout(() => { location.href = link; }, 400); return;
    }
    if (akt === "wiederherstellen" && istGF()) {
      const q = S.projekte.find((x) => x.id === a.dataset.id); if (!q) return;
      q.geloescht = false; aendern(q, () => {}, "Aus dem Papierkorb wiederhergestellt"); toast("Projekt wiederhergestellt"); return render();
    }
    if (akt === "zuweisen" && p && istBuero()) {
      const id = a.dataset.id, m = mitgliedZu(id);
      aendern(p, (x) => { const z = new Set(x.zugriff || []); z.has(id) ? z.delete(id) : z.add(id); x.zugriff = [...z]; }, `${(p.zugriff || []).includes(id) ? "Entfernt" : "Zugewiesen"}: ${m ? m.name : id}`);
      $("#akte").innerHTML = akte(p); return teilRendern(p);
    }
    if (akt === "melden" && p && ebene() === "partner") {
      const erledigt = a.dataset.erledigt === "1", notiz = ($("#meldung-text") || {}).value || "";
      if (!erledigt && !notiz.trim()) return toast("Bitte einen Hinweis eintragen", "fehler");
      try {
        if (Daten.modus === "cloud") await Daten.partnerMelden(p.id, erledigt, notiz.trim());
        else {
          const v = S.voll.find((x) => x.id === p.id);
          v.partnerStatus = { ...(v.partnerStatus || {}), [S.ich.id]: { erledigt, notiz: notiz.trim(), am: Date.now() } };
          v.verlauf = [{ ts: Date.now(), text: `${S.ich.name}: ${erledigt ? "Gewerk erledigt" : "Rückmeldung"}${notiz.trim() ? " – " + notiz.trim() : ""}` }, ...(v.verlauf || [])];
          v.geaendert = Date.now();
          await Daten.projektSpeichern(null, S.voll);
        }
        p.meldung = { erledigt, notiz: notiz.trim(), am: Date.now() };
        toast(erledigt ? "Erledigt gemeldet – danke!" : "Hinweis gesendet"); return render();
      } catch (err) { return toast("Senden fehlgeschlagen", "fehler"); }
    }
    if (akt === "r-auf") { const lv = a.closest(".r-level"), box = $(".r-schritte", lv), auf = box.hidden; box.hidden = !auf; a.setAttribute("aria-expanded", String(auf)); lv.classList.toggle("offen", auf); return; }
    if (akt === "r-alle") { $$("#rechte .r-level").forEach((lv) => { const auf = a.dataset.wert === "1"; $(".r-schritte", lv).hidden = !auf; $(".r-auf", lv).setAttribute("aria-expanded", String(auf)); lv.classList.toggle("offen", auf); }); return; }
    if (akt === "r-ordner-standard") {
      if (!confirm("Ordner-Zugriff auf den Standard zurücksetzen? Gespeichert wird erst mit „Änderungen übernehmen“.")) return;
      $$("#ordnerrechte [data-r-ordner]").forEach((z) => $$("[data-r-e]", z).forEach((x) => { x.checked = ordnerStandard(x.dataset.rE).includes(z.dataset.rOrdner); }));
      rechteTeilzustand(); toast("Standard gesetzt – mit „Änderungen übernehmen“ speichern"); return;
    }
    if (akt === "r-standard") {
      if (!confirm("Alle Haken auf den Standard zurücksetzen? Gespeichert wird erst mit „Änderungen übernehmen“.")) return;
      $$("#rechte [data-r-schritt]").forEach((z) => { const st = rechteStandard(ALLE_SCHRITTE.find((s) => s.id === z.dataset.rSchritt)); $$("[data-r-e]", z).forEach((x) => { x.checked = st.includes(x.dataset.rE); }); });
      rechteTeilzustand(); toast("Standard gesetzt – mit „Änderungen übernehmen“ speichern"); return;
    }
    if (akt === "adr-neu" && istGF()) { $(".adr-tab .leer-hinweis")?.closest("tr").remove(); $("#partner").insertAdjacentHTML("afterbegin", partnerZeileAdr({ gewerk: Object.keys(cfg().gewerke || {})[0] }).replace('data-id=""', 'data-id="" data-neu')); $("#partner [data-partner=firma]").focus(); return; }
    if (akt === "adr-speichern" && istGF()) {
      const neu = cfgSammeln();
      try { S.einstellungen = neu; await Daten.einstellungenSpeichern(neu); toast("Adressbuch gespeichert"); } catch (err) { toast("Nicht gespeichert: " + (err.message || err), "fehler"); }
      return render();
    }
    if (akt === "partner-neu") { $("#partner").insertAdjacentHTML("beforeend", partnerZeile({ gewerk: Object.keys(cfg().gewerke || {})[0] })); return; }
    if (akt === "neu-laden") return location.reload();
    if (akt === "kundenlink" && p) return kundenlinkDialog(p);
    if (akt === "mail" && p) return mailDialog(a.dataset.mail, p);
    if (akt === "sub-anfrage" && p) return subAnfrageDialog(p, Number(a.dataset.zeile));
    if (akt === "datei") { const d = S.dateien.find((x) => x.id === a.dataset.datei); if (d) dateiDialog(d); return; }
    if (akt === "drucken" && p) return drucken(Formular.druck(a.dataset.formular, p, druckKontext(p)));
    if (akt === "demo") { demoLaden(); toast("Beispielprojekte geladen"); location.hash = "#/cockpit"; return render(); }
    if (akt === "demo-weg") {
      if (!confirm("Alle Beispielprojekte entfernen?")) return;
      alle().filter((x) => x.demo).forEach((x) => aendern(x, (y) => { y.geloescht = true; }));
      toast("Beispiele entfernt"); return render();
    }
    if (akt === "level" && p) {
      const nr = Number(a.dataset.nr);
      if (nr > p.phase) { const li = a.closest(".lv"); li.classList.remove("wackeln"); void li.offsetWidth; li.classList.add("wackeln"); return toast(`Gesperrt – erst Level ${zwei(p.phase)} abschließen`); }
      S.ansicht[p.id] = nr; return teilRendern(p);
    }
    if ((akt === "nk-neu" || akt === "nk-weg" || akt === "nk-abschliessen" || akt === "nk-oeffnen") && p && istGF()) {
      const z = (S.zahlen[p.id] = { ...(S.zahlen[p.id] || {}) });
      if (akt === "nk-neu") z[a.dataset.tab] = [...(z[a.dataset.tab] || []), {}];
      if (akt === "nk-weg") z[a.dataset.tab] = (z[a.dataset.tab] || []).filter((_, i) => i !== Number(a.dataset.zeile));
      if (akt === "nk-abschliessen") { z.nkAbgeschlossen = Date.now(); aendern(p, () => {}, "Nachkalkulation abgeschlossen"); }
      if (akt === "nk-oeffnen") { delete z.nkAbgeschlossen; aendern(p, () => {}, "Nachkalkulation wieder geöffnet"); }
      nkSpeichern(p); const y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    if (akt === "ics" && p) return icsDatei(p, a.dataset.terminKey);
    if (akt === "sperre-uebernehmen" && p && istGF()) {
      if (!confirm(`Bearbeitung von ${S.sperre.name} übernehmen? Nicht gespeicherte Eingaben von ${S.sperre.name} können verloren gehen.`)) return;
      await sperreAktualisieren(p.id, true); toast("Du bearbeitest jetzt dieses Projekt"); return render();
    }
    if (akt === "zeit-start" && p && zeitDarf()) {
      const lauf = meinLaufender();
      if (lauf && lauf.p.id !== p.id) {
        if (!confirm(`Bei „${anzeigeName(lauf.p)}“ läuft noch deine Arbeitszeit (${hms(dauerMs(lauf.z))}). Dort beenden und hier starten?`)) return;
        const jetzt = Date.now();
        aendern(lauf.p, () => { (lauf.z.pausen || []).forEach((x) => { if (!x.ende) x.ende = jetzt; }); lauf.z.ende = jetzt; }, `Arbeitszeit ${stunden(dauerMs(lauf.z))}`);
      }
      aendern(p, (x) => { x.zeiten = x.zeiten || []; x.zeiten.push({ id: uid(), wer: S.ich.id, name: S.ich.name, start: Date.now(), ende: null, pausen: [], level: x.phase }); }, "Arbeitszeit gestartet");
      aktivGemerkt = 0; aktivitaet(); systemAbwesenheit();
      kopfNeu(p); statusLeiste(); return teilRendern(p);
    }
    if (akt === "zeit-pause" && p) { const z = meineZeit(p); if (z) aendern(p, () => { z.pausen = [...(z.pausen || []), { start: Date.now(), ende: null }]; }); kopfNeu(p); statusLeiste(); return teilRendern(p); }
    if (akt === "zeit-weiter" && p) { const z = meineZeit(p); if (z) aendern(p, () => { (z.pausen || []).forEach((x) => { if (!x.ende) x.ende = Date.now(); }); }); kopfNeu(p); statusLeiste(); return teilRendern(p); }
    if (akt === "zeit-stop" && p) return zeitStopDialog(p);
    if (akt === "zeit-loeschen" && p && istGF()) {
      const z = (p.zeiten || []).find((x) => x.id === a.dataset.zeit); if (!z || !confirm("Diesen Zeiteintrag löschen?")) return;
      aendern(p, (x) => { x.zeiten = x.zeiten.filter((y) => y.id !== z.id); }, `Zeiteintrag gelöscht: ${z.name}, ${stunden(dauerMs(z))}`);
      return teilRendern(p);
    }
    if (akt === "offen-zeigen" && p) {
      const st = phaseStatus(p, p.phase);
      S.zeigeOffen = true; teilRendern(p);
      const q = $(".quest.fehlt");
      if (q) { q.scrollIntoView({ behavior: "smooth", block: "center" }); const z = $("input, select, textarea, a.btn, button", q); if (z) setTimeout(() => z.focus({ preventScroll: true }), 350); }
      return toast(`Noch ${st.offen.length} ${st.offen.length === 1 ? "Schritt" : "Schritte"} offen – rot markiert`, "fehler");
    }
    if (akt === "abschliessen" && p) {
      S.zeigeOffen = false;
      if (!phaseStatus(p, p.phase).komplett) return;
      const n = naechsteNr(p.phase);
      if (n) aendern(p, (x) => { x.phase = n; x.level = { ...(x.level || {}), [n]: Date.now() }; }, `Level ${zwei(n)} „${phase(n).titel}“ freigeschaltet`);
      else aendern(p, (x) => { x.status = "abgeschlossen"; x.abgeschlossenAm = Date.now(); }, "Projekt abgeschlossen & archiviert");
      S.ansicht[p.id] = p.phase; levelUp(n);
      kopfNeu(p); teilRendern(p); window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (akt === "bestaetigen" && p) {
      const key = a.dataset.key; const an = !((p.schritte || {})[key] || {}).erledigt;
      aendern(p, (x) => { x.schritte = x.schritte || {}; x.schritte[key] = an ? { erledigt: true, am: Date.now(), von: S.ich.name || "" } : {}; }, an ? `Erledigt: ${ersetzen(schrittTitel(key), p)}` : null);
      return teilRendern(p);
    }
    if (akt === "wahl" && p) {
      const nr = Number(a.dataset.nr), s = phase(nr).schritte.find((x) => x.id === a.dataset.schritt), o = s.optionen.find((x) => x.id === a.dataset.wert);
      aendern(p, (x) => {
        x.schritte = x.schritte || {}; x.schritte[a.dataset.key] = { wahl: o.id, am: Date.now() };
        if (o.status) x.status = o.status; else if (x.status !== "aktiv" && x.status !== "abgeschlossen") x.status = "aktiv";
        if (o.wiedervorlage) { x.wiedervorlage = isoTag(plusTage(new Date(), o.wiedervorlage)); x.wiedervorlageNotiz = `${ersetzen(s.titel)} – nachfassen`; }
      }, `${ersetzen(s.titel)}: ${ersetzen(o.label)}`);
      if (o.status === "verloren") toast("Projekt als abgesagt markiert");
      else if (o.wiedervorlage) toast(`Wiedervorlage in ${o.wiedervorlage} Tagen gesetzt`);
      kopfNeu(p); return teilRendern(p);
    }
    if (akt === "setze-feld" && p) { aendern(p, (x) => { x[a.dataset.feld] = a.dataset.wert; }, `Zuständig: ${a.dataset.wert}`); kopfNeu(p); return teilRendern(p); }
    if (akt === "ersatz" && p) { aendern(p, (x) => { x.schritte = x.schritte || {}; x.schritte[a.dataset.key] = { ersatz: a.dataset.text, am: Date.now() }; }, `Abgehakt: ${a.dataset.text}`); return teilRendern(p); }
    if (akt === "ersatz-weg" && p) { aendern(p, (x) => { delete x.schritte[a.dataset.key]; }); return teilRendern(p); }
    if (akt === "akte-tab" && p) { S.akteTab = a.dataset.tab; $("#akte").innerHTML = akte(p); vorschauenLaden($("#akte")); if (a.closest(".p-kopf")) $("#akte").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (akt === "ordner" && p) { S.ordnerOffen = S.ordnerOffen === a.dataset.kat ? null : a.dataset.kat; $("#akte").innerHTML = akte(p); vorschauenLaden($("#akte")); return; }
    if (akt === "loeschen" && p && istGF()) { if (!confirm(`Projekt „${anzeigeName(p)}“ löschen? Es liegt danach 30 Tage im Papierkorb (Projekte → Papierkorb) und kann wiederhergestellt werden.`)) return; aendern(p, (x) => { x.geloescht = Date.now(); }, "In den Papierkorb gelegt"); location.hash = "#/projekte"; return; }
    if (akt === "formular-fertig" && p) {
      const fid = $(".formularseite").dataset.formular, st = Formular.status(fid, p, dateienVon(p.id));
      if (!st.vollstaendig && !S.zeigeFehler) {
        S.zeigeFehler = true; formularNeuZeichnen(p, fid, true);
        const f = $(".ff.fehlt, .ff-check li.fehlt");
        if (f) { f.scrollIntoView({ behavior: "smooth", block: "center" }); const z = $("input:not([type=hidden]), select, textarea, button", f); if (z) setTimeout(() => z.focus({ preventScroll: true }), 350); }
        return toast(`Noch ${st.fehlend.length} Pflichtangaben offen – erneut „Fertig“ zum Verlassen`);
      }
      S.zeigeFehler = false; location.hash = `#/projekt/${p.id}`; return;
    }
    if (akt === "maengel" && p) {
      const w = Formular.werteVon(p, "abnahme"), d = Formular.def("abnahme"), neu = [];
      d.felder.filter((f) => f.typ === "checkliste").forEach((f) => f.punkte.forEach((pt) => { const e2 = (w[f.id] || {})[pt.id]; if (e2 && e2.s === "mangel") neu.push({ arbeit: pt.label + (e2.n ? ` – ${e2.n}` : ""), wer: "", erledigt: false }); }));
      if (!neu.length) return toast("Keine Mängel markiert");
      aendern(p, () => { const r = formularWerte(p, "restarbeiten"); r.offen = [...(r.offen || []), ...neu]; }, `${neu.length} Mängel in Restarbeiten übernommen`);
      return toast(`${neu.length} Mängel in Restarbeiten übernommen`);
    }
    if (akt === "abmelden") { await sperreLoslassen(aktuellePid()); await Daten.abmelden(); location.hash = "#/cockpit"; location.reload(); return; }
    if (akt === "passwort" && S.ich) return passwortDialog();
    if (akt === "demo-login") { $("#l-b").value = a.dataset.b; $("#l-pw").value = DEMO_PW; $("#l-pw").focus(); return; }
    if (akt === "konto-neu" && istGF()) return kontoNeuDialog(a.dataset.id);
    if (akt === "konto-reset" && istGF()) return kontoResetDialog(a.dataset.email, a.dataset.name);
    if (akt === "konto-aktiv" && istGF()) {
      const an = a.dataset.wert === "1";
      if (!an && !confirm("Zugang sperren? Die Person kann sich dann nicht mehr anmelden.")) return;
      try { await Daten.kontoAktiv(a.dataset.email, an); await kontenLaden(); toast(an ? "Zugang entsperrt" : "Zugang gesperrt"); render(); }
      catch (err) { toast(err.message || "Nicht möglich", "fehler"); }
      return;
    }
    if (akt === "konten-speichern" && istGF()) {
      const neu = cfgSammeln();
      const selbst = neu.team.find((t) => t.kuerzel === S.ich.id);
      if (!selbst || selbst.ebene !== "geschaeftsfuehrung") return toast("Die eigene Ebene (Geschäftsführung) kann nicht geändert oder entfernt werden.", "fehler");
      const doppelt = neu.team.map((t) => t.kuerzel).filter((k, i, l) => k && l.indexOf(k) !== i);
      if (doppelt.length) return toast(`Kürzel doppelt: ${doppelt.join(", ")}`, "fehler");
      try {
        S.einstellungen = neu; await Daten.einstellungenSpeichern(S.einstellungen);
        for (const k of S.konten || []) {
          const m = mitgliedZu(k.id);
          if (!m) { if (k.aktiv && k.id !== S.ich.id) await Daten.kontoAktiv(k.email, false); continue; }
          const forms = m.ebene === "partner" ? partnerFormulare(m.gewerk) : [];
          if (m.ebene !== k.ebene || m.name !== k.name || m.ebene === "partner") await Daten.kontoAendern(k.id, m.ebene, m.name, forms);
        }
        await kontenLaden(); toast("Übernommen"); render();
      } catch (err) { toast("Nicht gespeichert: " + (err.message || err), "fehler"); }
      return;
    }
    if (akt === "cloud-verbinden") {
      const k = { url: $("#cl-url").value.trim().replace(/\/$/, ""), anonKey: $("#cl-key").value.trim(), portalUrl: $("#cl-portal").value.trim() };
      if (!/^https?:\/\//.test(k.url) || !k.anonKey) return toast("URL und Key eintragen", "fehler");
      try { localStorage.setItem("heizdashboard:cloud", JSON.stringify(k)); } catch (err) { return toast("Browser-Speicher gesperrt", "fehler"); }
      location.hash = "#/cockpit"; location.reload(); return;
    }
    if (akt === "cloud-trennen") { if (!confirm("Cloud-Verbindung in diesem Browser trennen?")) return; await Daten.abmelden(); localStorage.removeItem("heizdashboard:cloud"); location.reload(); return; }

    /* Einrichtung */
    if (akt === "cfg-speichern") {
      S.einstellungen = cfgSammeln();
      try {
        await Daten.einstellungenSpeichern(S.einstellungen);
        toast("Einstellungen übernommen");
      } catch (err) { toast("Nicht gespeichert: " + (err.message || err), "fehler"); }
      return render();
    }
    if (akt === "cfg-reset") { if (!confirm("Änderungen verwerfen und firma.js verwenden?")) return; S.einstellungen = null; await Daten.einstellungenSpeichern(null); return render(); }
    if (akt === "cfg-datei") { const c = { ...cfgSammeln(), cloud: window.FIRMA.cloud }; return herunterladen("firma.js", `/* Firma — erzeugt mit dem Heizungs-Dashboard am ${fDatum(new Date())}. Ersetzt einstellungen/firma.js. */\n\nwindow.FIRMA = ${JSON.stringify(c, null, 2)};\n`, "text/javascript"); }
    if (akt === "team-neu") {
      const rollen = [...new Set(cfg().team.map((t) => t.rolle))];
      $("#team").insertAdjacentHTML("beforeend", teamZeile({ rolle: "heizungsexperte", bezeichnung: "Heizungsexperte", ebene: "planung" }).replace(/<td class="zugang">[\s\S]*?<\/td><td class="aktionen-zelle">[\s\S]*?<\/td>/, '<td class="zugang"><span class="leise">erst übernehmen</span></td><td></td>'));
      return;
    }
    if (akt === "team-weg") return a.closest("tr").remove();
    if (akt === "export") return herunterladen(`heizungs-dashboard-projekte-${isoTag(new Date())}.json`, JSON.stringify({ projekte: S.projekte, einstellungen: S.einstellungen }, null, 1));
  });

  /* Regler: auch ein Klick auf die Mittelstellung zählt als Eingabe */
  document.addEventListener("click", (e) => {
    const r = e.target.closest && e.target.closest(".ff-regler.unberuehrt input[type=range]");
    if (r) r.dispatchEvent(new Event("input", { bubbles: true }));
  });

  /* Original-Blatt: Werkzeuge */
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-blatt-modus]");
    if (m) {
      S.blattModus = m.dataset.blattModus;
      $$("[data-blatt-modus]").forEach((b) => b.classList.toggle("an", b === m));
      $$(".blatt").forEach((b) => (b.dataset.modus = S.blattModus));
      return;
    }
    const l = e.target.closest("[data-blatt-leeren]");
    if (l && confirm("Alle Zeichnungen auf dem Blatt löschen?")) {
      const seite = $(".formularseite"), p = finde(seite.dataset.projekt), fid = seite.dataset.formular;
      aendern(p, () => { delete formularWerte(p, fid).blattZeichnung; });
      formularNeuZeichnen(p, fid, true);
    }
  });
  document.addEventListener("keydown", (e) => {
    const z = e.target.closest && e.target.closest("tr[data-ff-wahl]");
    if (z && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); z.click(); }
  });

  /* Formular-Bedienung (Knöpfe, Chips, Checklisten) */
  document.addEventListener("click", (e) => {
    const seite = e.target.closest(".formularseite"); if (!seite) return;
    const b = e.target.closest("[data-ff-wahl],[data-ff-mehr],[data-check],[data-tab-neu],[data-tab-plus],[data-tab-weg],[data-sign-weg],[data-sprung]");
    if (!b) return;
    if (b.hasAttribute("data-sprung")) { e.preventDefault(); const z = document.getElementById(b.getAttribute("href").slice(1)); if (z) z.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const p = finde(seite.dataset.projekt), fid = seite.dataset.formular, w = formularWerte(p, fid);
    aendern(p, () => {
      if (b.dataset.ffWahl) {
        const f = Formular.def(fid).felder.find((x) => x.id === b.dataset.ffWahl);
        if (f && f.typ === "kunde") p.kunde[f.feld] = b.dataset.wert;
        else w[b.dataset.ffWahl] = w[b.dataset.ffWahl] === b.dataset.wert ? "" : b.dataset.wert;
      } else if (b.dataset.ffMehr) {
        const arr = new Set(w[b.dataset.ffMehr] || []); arr.has(b.dataset.wert) ? arr.delete(b.dataset.wert) : arr.add(b.dataset.wert); w[b.dataset.ffMehr] = [...arr];
      } else if (b.dataset.check) {
        const o = (w[b.dataset.check] = w[b.dataset.check] || {}); const e2 = (o[b.dataset.punkt] = o[b.dataset.punkt] || {});
        e2.s = b.dataset.wert === "toggle" ? !e2.s : e2.s === b.dataset.wert ? "" : b.dataset.wert;
      } else if (b.dataset.tabNeu) {
        const rows = (w[b.dataset.tabNeu] = w[b.dataset.tabNeu] || []);
        const fd = Formular.def(fid).felder.find((x) => x.id === b.dataset.tabNeu);
        if (fd && fd.zeilen) while (rows.length < fd.zeilen.length) rows.push({});
        rows.push({});
      }
      else if (b.dataset.tabPlus) {
        const rows = (w[b.dataset.tabPlus] = w[b.dataset.tabPlus] || []);
        const fd = Formular.def(fid).felder.find((x) => x.id === b.dataset.tabPlus);
        while (rows.length < fd.zeilen.length) rows.push({});
        rows.push({ _nach: Number(b.dataset.nach) });
      }
      else if (b.dataset.tabWeg) { w[b.dataset.tabWeg].splice(Number(b.dataset.zeile), 1); }
      else if (b.dataset.signWeg) { delete w[b.dataset.signWeg]; }
    });
    formularNeuZeichnen(p, fid, true);
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.closest("dialog")) return;
    const seite = el.closest(".formularseite");
    if (seite && (el.dataset.ff || el.dataset.tab || el.dataset.checkNotiz)) {
      const p = finde(seite.dataset.projekt), fid = seite.dataset.formular, w = formularWerte(p, fid);
      if (el.type === "range") {
        const box = el.closest(".ff-regler"), o = box && $("[data-regler-ausgabe]", box);
        if (o) o.textContent = `${Number(el.value).toLocaleString("de-DE")}${el.dataset.einheit ? " " + el.dataset.einheit : ""}`;
        if (box) box.classList.remove("unberuehrt");
      }
      aendern(p, () => {
        if (el.dataset.kunde) p.kunde[el.dataset.kunde] = el.value;
        else if (el.dataset.ff) w[el.dataset.ff] = el.type === "range" ? Number(el.value) : el.value;
        else if (el.dataset.tab) {
          const rows = (w[el.dataset.tab] = w[el.dataset.tab] || []); const i = Number(el.dataset.zeile);
          for (let k = 0; k <= i; k++) rows[k] = rows[k] || {};
          rows[i][el.dataset.spalte] = el.type === "checkbox" ? el.checked : el.value;
        } else if (el.dataset.checkNotiz) {
          const o = (w[el.dataset.checkNotiz] = w[el.dataset.checkNotiz] || {}); (o[el.dataset.punkt] = o[el.dataset.punkt] || {}).n = el.value;
        }
      });
      const sm = el.dataset.tab && seite.querySelector(`[data-summe="${el.dataset.tab}"]`);
      if (sm) sm.textContent = Formular.summe((Formular.def(fid).felder || []).find((f) => f.id === el.dataset.tab), w[el.dataset.tab]);
      formularNeuZeichnen(p, fid);
      return;
    }
    if (el.dataset.filter === "adressbuch") { const q = el.value.trim().toLowerCase(); $$("#partner tr").forEach((tr) => { tr.hidden = !!q && !(tr.dataset.suche || "").includes(q) && !$$("input", tr).some((i) => i.value.toLowerCase().includes(q)); }); return; }
    if (el.dataset.filter === "suche") { S.filter.suche = el.value; $("#projektliste").innerHTML = projektListe(); return; }
    if (el.type === "color") { document.documentElement.style.setProperty(el.dataset.cfg === "farben.tinte" ? "--tinte" : "--akzent", el.value); el.nextElementSibling.textContent = el.value; }
  });

  document.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.closest("dialog")) return;
    const p = aktuellesProjekt();
    if (el.dataset.upload && p) { await hochladen(p, el.dataset.upload, el.files); el.value = ""; return; }
    const seite = el.closest(".formularseite");
    if (seite) {
      /* „Wer macht das?“: gewählter Partner bekommt automatisch Zugriff aufs Projekt */
      const fd = el.dataset.ff && (Formular.def(seite.dataset.formular).felder || []).find((f) => f.id === el.dataset.ff);
      if (fd && fd.typ === "wer" && el.value && el.value !== Formular.EIGEN && istBuero()) {
        const q = finde(seite.dataset.projekt), m = mitgliedZu(el.value);
        if (q && !(q.zugriff || []).includes(el.value)) aendern(q, (x) => { x.zugriff = [...(x.zugriff || []), el.value]; }, `Automatisch zugewiesen (${fd.gewerk || fd.label}): ${m ? m.name : el.value}`);
      }
      /* Bedingungen (z. B. „wenn Mehrfamilienhaus“) neu auswerten, sobald ein Feld fertig ist */
      /* Firma aus dem Adressbuch gewählt → Gewerk der Zeile ergänzen, falls leer */
      const og = el.dataset.tab && el.tagName === "SELECT" && el.selectedOptions[0] && el.selectedOptions[0].dataset.gewerk;
      if (og) {
        const q = finde(seite.dataset.projekt), rows = formularWerte(q, seite.dataset.formular)[el.dataset.tab] || [], row = rows[Number(el.dataset.zeile)];
        if (row && !row.gewerk) aendern(q, () => { row.gewerk = og; });
      }
      if (seite.dataset.formular === "baustellenplan" && el.dataset.tab === "subs" && el.dataset.spalte === "firma" && el.value) {
        const q = finde(seite.dataset.projekt), row = (formularWerte(q, "baustellenplan").subs || [])[Number(el.dataset.zeile)];
        if (row) aendern(q, (x) => subsFirmaUebernehmen(x, row));
      }
      if ((el.dataset.ff && el.tagName === "SELECT") || (el.dataset.tab && (el.type === "checkbox" || el.tagName === "SELECT"))) formularNeuZeichnen(finde(seite.dataset.projekt), seite.dataset.formular, true);
      return;
    }
    if (el.matches(".r-matrix [data-r-level]")) { $$(`.r-schritt [data-r-e="${el.dataset.rLevel}"]`, el.closest(".r-level")).forEach((x) => { x.checked = el.checked; }); return rechteTeilzustand(); }
    if (el.matches(".r-matrix [data-r-e]")) return rechteTeilzustand();
    if (el.matches("[data-zuweisen]") && p && istBuero() && el.value) {
      const id = el.value, m = mitgliedZu(id);
      aendern(p, (x) => { x.zugriff = [...new Set([...(x.zugriff || []), id])]; }, `Zugewiesen: ${m ? m.name : id}`);
      $("#akte").innerHTML = akte(p); return teilRendern(p);
    }
    if (el.dataset.termin && p) {
      const def = TERMINE.find((t) => t.key === el.dataset.termin);
      const fehler = terminFehler(p, def.key, el.value);
      if (fehler) { el.value = (p.termine || {})[def.key] || ""; feldFehler(el, fehler); toast("Termin nicht übernommen", "fehler"); return; }
      feldFehler(el, null);
      aendern(p, (x) => { x.termine = x.termine || {}; if (el.value) x.termine[def.key] = el.value; else delete x.termine[def.key]; }, el.value ? `${def.label}: ${fTermin(el.value)}` : `${def.label} entfernt`);
      return teilRendern(p);
    }
    if (el.dataset.experte && p) {
      const feld = el.dataset.experteFeld || "zustaendig", k = el.dataset.experte;
      const alt = feld === "zustaendig" ? experten(p) : p[feld] || [];
      const neu = el.checked ? [...alt.filter((x) => x !== k), k] : alt.filter((x) => x !== k);
      const m = mitgliedZu(k);
      const was = feld === "zustaendig" ? "Heizungsexperte" : "Baustellenbesichtigung";
      aendern(p, (x) => {
        if (feld === "zustaendig") { x.experten = neu; x.zustaendig = neu[0] || ""; return; }
        x[feld] = neu;
        /* Monteure sehen nur Projekte, denen sie zugewiesen sind → bei Auswahl Zugriff geben */
        if (el.checked && m && m.ebene === "monteur" && !(x.zugriff || []).includes(k)) x.zugriff = [...(x.zugriff || []), k];
      }, `${was}: ${m ? m.name : k} ${el.checked ? "hinzugefügt" : "entfernt"}`);
      kopfNeu(p); teilRendern(p);
      const d = document.querySelector("details.mehrwahl"); if (d) d.open = true;
      return;
    }
    if (el.dataset.pfeld && p) {
      const k = el.dataset.pfeld;
      aendern(p, (x) => { x[k] = el.value.trim(); if (k === "zustaendig") x.experten = x[k] ? [x[k], ...experten(p).filter((e) => e !== x[k])] : []; }, k === "angebotNotiz" ? "Notizen zum Angebot geändert" : k === "status" ? `Status: ${STATUS.find((s) => s.id === el.value)?.label}` : k === "projektnr" ? `Projektnummer: ${el.value.trim()}` : k === "bzaNr" ? `BZA-Nummer: ${el.value.trim()}` : k === "bzdNr" ? `BZD-Nummer: ${el.value.trim()}` : k === "anzahlung" ? `Anzahlung: ${el.value}` : k === "wunschtermin" ? `Wunschtermin: ${el.value.trim()}` : k === "downloadCode" ? `Download-Code: ${el.value.trim()}` : null);
      kopfNeu(p); return teilRendern(p);
    }
    if ((el.dataset.nk || el.dataset.nkTab) && p && istGF()) {
      const z = (S.zahlen[p.id] = { ...(S.zahlen[p.id] || {}) });
      const wert = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
      if (el.dataset.nk) { if (wert === "") delete z[el.dataset.nk]; else z[el.dataset.nk] = wert; }
      else {
        const l = (z[el.dataset.nkTab] = [...(z[el.dataset.nkTab] || [])]), i = Number(el.dataset.zeile);
        l[i] = { ...(l[i] || {}), [el.dataset.spalte]: wert };
        if (el.dataset.spalte === "partner") { const pa = (cfg().partner || []).find((x) => x.firma === wert); if (pa && !l[i].gewerk) l[i].gewerk = pa.gewerk; }
      }
      nkSpeichern(p); const y = window.scrollY; render(); window.scrollTo(0, y); return;
    }
    if (el.dataset.zahl && p && istGF()) {
      const z = { ...(S.zahlen[p.id] || {}) };
      if (el.value === "") delete z[el.dataset.zahl]; else z[el.dataset.zahl] = el.type === "date" ? el.value : Number(el.value);
      S.zahlen[p.id] = z;
      try { await Daten.zahlenSpeichern(p.id, z); } catch (err) { return toast("Zahlen nicht gespeichert", "fehler"); }
      $("#akte").innerHTML = akte(p); return;
    }
    if (el.dataset.kfeld && p) { aendern(p, (x) => { x.kunde[el.dataset.kfeld] = el.value.trim(); }); kopfNeu(p); return; }
    if (el.dataset.filter && el.dataset.filter !== "adressbuch") { S.filter[el.dataset.filter] = el.value; $("#projektliste").innerHTML = projektListe(); return; }
    if (el.dataset.aktion === "import" && el.files[0]) {
      try {
        const d = JSON.parse(await el.files[0].text());
        for (const q of d.projekte || []) { const alt = S.projekte.find((x) => x.id === q.id); if (!alt || (q.geaendert || 0) > (alt.geaendert || 0)) { if (alt) Object.assign(alt, q); else S.projekte.push(q); speichern(alt || q); } }
        toast("Sicherung eingespielt"); render();
      } catch (err) { toast("Keine gültige Sicherung", "fehler"); }
    }
    if (el.type === "color") el.nextElementSibling.textContent = el.value;
  });

  /* Drag & Drop auf Ablagen */
  document.addEventListener("dragover", (e) => { const z = e.target.closest && e.target.closest(".drop"); if (z) { e.preventDefault(); z.classList.add("ueber"); } });
  document.addEventListener("dragleave", (e) => { const z = e.target.closest && e.target.closest(".drop"); if (z) z.classList.remove("ueber"); });
  document.addEventListener("drop", (e) => {
    const z = e.target.closest && e.target.closest(".drop"); if (!z) return;
    e.preventDefault(); z.classList.remove("ueber");
    const p = aktuellesProjekt(); if (p) hochladen(p, z.closest("[data-ablage]").dataset.ablage, e.dataTransfer.files);
  });

  document.addEventListener("submit", async (e) => {
    const id = e.target.id;
    if (!["login-form", "erst-form", "pflicht-form"].includes(id)) return;
    e.preventDefault();
    const knopf = $("button[type=submit]", e.target); if (knopf) knopf.disabled = true;
    try {
      if (id === "login-form") await Daten.anmelden($("#l-b").value, $("#l-pw").value);
      if (id === "erst-form") {
        if ($("#e-p1").value !== $("#e-p2").value) throw new Error("Die Passwörter stimmen nicht überein.");
        const gf = cfg().team.find((t) => t.ebene === "geschaeftsfuehrung") || cfg().team[0];
        await Daten.kontoAnlegen({ benutzer: $("#e-b").value, passwort: $("#e-p1").value, id: gf.kuerzel, ebene: "geschaeftsfuehrung", name: gf.name }, true);
        await Daten.anmelden($("#e-b").value, $("#e-p1").value);
      }
      if (id === "pflicht-form") {
        if ($("#pf-1").value !== $("#pf-2").value) throw new Error("Die Passwörter stimmen nicht überein.");
        await Daten.passwortAendern($("#pf-1").value);
        toast("Passwort gespeichert – willkommen!");
      }
      await weiter();
    } catch (err) {
      const m = err.message || String(err);
      vorraum(id === "login-form" ? ansichtLogin(m) : id === "erst-form" ? ansichtErsteinrichtung(m) : ansichtPasswortPflicht(m));
    }
  });

  let letztePid = null;
  window.addEventListener("hashchange", async () => {
    const pid = aktuellePid();
    if (letztePid && letztePid !== pid) sperreLoslassen(letztePid);
    if (pid && pid !== letztePid) { S.sperre = null; await sperreAktualisieren(pid); }
    letztePid = pid;
  });
  window.addEventListener("hashchange", () => { S.zeigeFehler = false; S.zeigeOffen = false; render(); window.scrollTo(0, 0); $("#main").focus({ preventScroll: true }); });

  /* ---------- Abgleich: Kolleg:innen & Kunden-Uploads ---------- */
  const beschaeftigt = () => $("#dlg").open || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  async function abgleich() {
    if (!Daten.angemeldet || !S.ich) return;
    const sp = aktuellePid(); if (sp) await sperreAktualisieren(sp);
    let neu = false;
    try {
      if (ebene() === "partner") {
        const vorher = S.projekte.map((x) => x.geaendert).join();
        await laden(); neu = S.projekte.map((x) => x.geaendert).join() !== vorher;
      } else if (Daten.modus === "cloud") {
        for (const q of await Daten.abgleichen()) {
          if (offen.has(q.id)) continue;
          const i = S.projekte.findIndex((x) => x.id === q.id);
          if (i < 0) S.projekte.push(q); else if ((q.geaendert || 0) > (S.projekte[i].geaendert || 0)) S.projekte[i] = q;
          neu = true;
        }
        if (neu) S.dateien = await Daten.alleDateien();
      } else if (!offen.size) {
        const l = await Daten.projekteLaden();
        if (l.map((x) => x.geaendert).join() !== S.projekte.map((x) => x.geaendert).join()) { S.projekte = l; neu = true; }
        const d = await Daten.alleDateien();
        if (d.length !== S.dateien.length) { S.dateien = d; neu = true; }
      }
    } catch (e) { /* offline – später erneut */ }
    if (neu && !beschaeftigt()) allesNeu();
  }
  window.addEventListener("focus", abgleich);
  window.addEventListener("storage", abgleich);
  setInterval(abgleich, 15000);

  async function laden() {
    S.einstellungen = await Daten.einstellungenLaden();
    if (S.einstellungen && S.einstellungen.name === "Daniel Brüll GmbH") S.einstellungen.name = window.FIRMA.name; // Umbenennung Okt. 2026
    const m = Daten.mitglied;
    if (!m) throw Object.assign(new Error("kein-zugang"), { keinZugang: true });
    const basis = mitgliedZu(m.id) || {};
    S.ich = { ...basis, id: m.id, name: m.name || basis.name || m.benutzer, ebene: m.ebene };
    if (S.ich.ebene === "partner") {
      if (Daten.modus === "cloud") S.projekte = await Daten.partnerAuftraege();
      else {
        S.voll = await Daten.projekteLaden();
        S.projekte = S.voll.filter((p) => !p.geloescht && (p.zugriff || []).includes(S.ich.id)).map((p) => partnerSicht(p, { id: S.ich.id, gewerk: S.ich.gewerk }));
      }
    } else S.projekte = await Daten.projekteLaden();
    S.dateien = await Daten.alleDateien();
    S.zahlen = S.ich.ebene === "geschaeftsfuehrung" ? (await Daten.zahlenLaden().catch(() => ({}))) || {} : {};
  }

  /* ---------- Start ---------- */
  (async () => {
    anwenden();
    try {
      S.einstellungen = await Daten.einstellungenLaden();
      /* Vorschau-Link mit ?demo=1: Demo-Zugänge, Beispielprojekte und ein Beispielziel */
      if (new URLSearchParams(location.search).has("demo") && Daten.modus === "lokal") {
        await demoKontenAnlegen();
        const vorhanden = await Daten.projekteLaden();
        if (vorhanden.length && !vorhanden.some((p) => p.muster)) {
          S.projekte = vorhanden; musterProjekte();
          clearTimeout(speicherTimer); offen.clear(); await Daten.projektSpeichern(null, S.projekte);
        }
        if (!vorhanden.length) {
          S.projekte = []; demoLaden();
          clearTimeout(speicherTimer); offen.clear(); await Daten.projektSpeichern(null, S.projekte);
          if (!(cfg().ziele || {}).jahresumsatz) { S.einstellungen = { ...(S.einstellungen || {}), ziele: { jahresumsatz: 320000 } }; await Daten.einstellungenSpeichern(S.einstellungen); }
        }
      }
      await Daten.start();
      await weiter();
    } catch (e) {
      if (e.keinZugang) return vorraum(keinZugang());
      vorraum(`<div class="login"><div class="panel login-karte"><h1>Keine Verbindung</h1><p>${esc(e.message || e)}</p><button class="btn" data-aktion="neu-laden">Erneut versuchen</button></div></div>`);
    }
  })();
})();
