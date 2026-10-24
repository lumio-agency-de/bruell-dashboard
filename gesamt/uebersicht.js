/* ==========================================================================
   Brüll Dashboard – Übersicht (Startseite)
   --------------------------------------------------------------------------
   Holt sich von Bad und Heizung je einen „Auszug“ (versteckter Rahmen mit
   ?auszug=1 – dort rechnet jeder Bereich mit seiner eigenen Logik) und zeigt
   alles als Widgets. Welche Widgets eine Person sieht, legt die
   Geschäftsführung unter „Übersicht anpassen“ fest.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const zwei = (n) => String(n).padStart(2, "0");
  const WT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const QS = location.search, DEMO = new URLSearchParams(QS).has("demo");
  const BEREICHE = [
    { id: "bad", titel: "Bad", icon: "i-projekte" },
    { id: "heizung", titel: "Heizung", icon: "i-projekte" },
  ];
  const ORT = { name: "Aidlingen-Dachtel", lat: 48.676, lon: 8.884 };

  /* ---------- Widgets ---------- */
  const WIDGETS = [
    { id: "kalender", titel: "Kalender", text: "Termine heute und in den nächsten Tagen" },
    { id: "mail", titel: "E-Mail", text: "Mails, die heute rausgehen sollten" },
    { id: "bad", titel: "Bad", text: "Fälliges und nächste Schritte im Bad" },
    { id: "heizung", titel: "Heizung", text: "Fälliges und nächste Schritte in der Heizung" },
    { id: "baustellen", titel: "Baustellen", text: "Laufende und startende Baustellen" },
    { id: "kennzahlen", titel: "Kennzahlen", text: "Umsatz, Auftragsbestand, Angebote" },
    { id: "personal", titel: "Personal", text: "Wer woran arbeitet, Auslastung" },
    { id: "neu", titel: "Neu vom Kunden", text: "Hochgeladene Fotos und Unterlagen" },
  ];
  const STANDARD = {
    geschaeftsfuehrung: WIDGETS.map((w) => w.id),
    planung: ["kalender", "mail", "bad", "heizung", "baustellen", "neu"],
    monteur: ["kalender", "baustellen"],
  };
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll/gesperrt */ } };
  const widgetsFuer = (person) => { const w = lesen("bruell:widgets", {})[person.id]; return Array.isArray(w) ? w : STANDARD[person.ebene] || STANDARD.planung; };

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("an"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("an"), 2600); }

  /* ---------- Wer ist angemeldet? (gemeinsame Anmeldung aller Bereiche) ---------- */
  function ich() {
    let email = null;
    try { email = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (e) { /* egal */ }
    email = email || lesen("bruell:sitzung", null);
    if (!email) return null;
    const k = lesen("bruell:konten", []).find((x) => x.email === email && x.aktiv !== false);
    return k ? { id: k.id, name: k.name || k.benutzer, ebene: k.ebene, mussAendern: k.mussAendern } : null;
  }
  function zumLogin() { try { sessionStorage.setItem("bruell:zurueck", "1"); } catch (e) { /* egal */ } location.replace("bad/" + QS); }
  function abmelden() {
    try { localStorage.removeItem("bruell:sitzung"); sessionStorage.removeItem("bruell:sitzung"); } catch (e) { /* egal */ }
    zumLogin();
  }

  /* ---------- Auszüge der Bereiche holen ---------- */
  function auszugHolen(bereich) {
    return new Promise((res) => {
      const f = document.createElement("iframe");
      f.src = `${bereich}/?auszug=1${DEMO ? "&demo=1" : ""}`;
      f.title = "Auszug " + bereich; f.tabIndex = -1;
      const fertig = (d) => { window.removeEventListener("message", hören); clearTimeout(t); f.remove(); res(d); };
      const hören = (e) => { if (e.origin === location.origin && e.data && e.data.typ === "bruell-auszug" && e.data.pfad.includes("/" + bereich + "/")) fertig(e.data.fehler ? { fehler: e.data.fehler } : e.data.daten); };
      const t = setTimeout(() => fertig({ fehler: "keine Antwort" }), 20000);
      window.addEventListener("message", hören);
      $("#auszuege").appendChild(f);
    });
  }

  /* ---------- Wetter (Open-Meteo, ohne Konto/Schlüssel) ---------- */
  const WETTER = {
    0: ["☀️", "klar"], 1: ["🌤️", "überwiegend sonnig"], 2: ["⛅️", "teils bewölkt"], 3: ["☁️", "bewölkt"], 45: ["🌫️", "Nebel"], 48: ["🌫️", "Reifnebel"],
    51: ["🌦️", "Nieselregen"], 53: ["🌦️", "Nieselregen"], 55: ["🌧️", "Nieselregen"], 61: ["🌦️", "leichter Regen"], 63: ["🌧️", "Regen"], 65: ["🌧️", "starker Regen"],
    66: ["🌧️", "Eisregen"], 67: ["🌧️", "Eisregen"], 71: ["🌨️", "leichter Schnee"], 73: ["🌨️", "Schnee"], 75: ["❄️", "starker Schnee"], 77: ["🌨️", "Schneegriesel"],
    80: ["🌦️", "Schauer"], 81: ["🌧️", "Schauer"], 82: ["⛈️", "heftige Schauer"], 85: ["🌨️", "Schneeschauer"], 86: ["🌨️", "Schneeschauer"], 95: ["⛈️", "Gewitter"], 96: ["⛈️", "Gewitter"], 99: ["⛈️", "Gewitter"],
  };
  async function wetterLaden() {
    const el = $("#wetter"); if (!el) return;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${ORT.lat}&longitude=${ORT.lon}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=4`;
      const w = await (await fetch(u)).json();
      const c = w.current, d = w.daily, sym = (k) => (WETTER[k] || ["🌡️", ""]);
      /* nachts Mond statt Sonne */
      const NACHT = { 0: "🌙", 1: "🌙", 2: "☁️" };
      const jetztSym = c.is_day === 0 && NACHT[c.weather_code] ? NACHT[c.weather_code] : sym(c.weather_code)[0];
      const jetztText = c.is_day === 0 && c.weather_code <= 1 ? "klare Nacht" : sym(c.weather_code)[1];
      el.innerHTML = `<div class="wt-jetzt"><span class="wt-sym" aria-hidden="true">${jetztSym}</span><b class="wt-temp">${Math.round(c.temperature_2m)}°</b></div>
        <small class="wt-text">${esc(jetztText)} · ${esc(ORT.name)}</small>
        <div class="wt-tage">${d.time.map((t, i) => `<span><small>${i === 0 ? "Heute" : WT[new Date(t + "T12:00").getDay()].slice(0, 2)}</small><i aria-hidden="true">${sym(d.weather_code[i])[0]}</i><b>${Math.round(d.temperature_2m_max[i])}°</b><small>${Math.round(d.temperature_2m_min[i])}°${d.precipitation_probability_max[i] >= 30 ? ` · ${d.precipitation_probability_max[i]} %` : ""}</small></span>`).join("")}</div>`;
    } catch (e) { el.innerHTML = `<p class="leise klein-text">Wetter gerade nicht erreichbar.</p>`; }
  }

  /* ---------- Hilfen ---------- */
  const datum = (s) => { if (!s) return null; const d = new Date(s.length > 10 ? s : s + "T00:00"); return isNaN(d) ? null : d; };
  const heute0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const tageBis = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - heute0()) / 864e5);
  const tagText = (d) => { const t = tageBis(d); return t === 0 ? "Heute" : t === 1 ? "Morgen" : `${WT[d.getDay()].slice(0, 2)}, ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`; };
  const uhr = (s) => (s && s.length > 10 ? s.slice(11, 16) : "");
  const geld = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " Mio. €" : n >= 1e4 ? Math.round(n / 1000) + " T€" : Math.round(n).toLocaleString("de-DE") + " €");
  const link = (b, pid) => `${b}/${QS}#/projekt/${pid}`;
  const tag = (b) => `<span class="ue-tag ${b}">${b === "bad" ? "Bad" : "Heizung"}</span>`;
  const vorname = (n) => String(n || "").split(" ")[0];
  const leer = (t) => `<p class="ue-leer">${esc(t)}</p>`;

  /* ---------- Widgets bauen (g = Größe: "k" klein, "m" mittel, "g" groß) ---------- */
  const anz = (g, k, m, gr) => (g === "k" ? k : g === "g" ? gr : m);
  const mehr = (l, n) => (l.length > n ? `<p class="ue-fuss">+ ${l.length - n} weitere</p>` : "");
  function wKalender(A, g) {
    const alle = Object.entries(A).flatMap(([b, a]) => ((a && a.termine) || []).map((t) => ({ ...t, b })));
    alle.sort((x, y) => x.d - y.d);
    const h = heute0(), mo = new Date(h); mo.setDate(h.getDate() - ((h.getDay() + 6) % 7));
    const woche = [...Array(7)].map((_, i) => { const d = new Date(mo); d.setDate(mo.getDate() + i); return d; });
    const anzahl = (d) => alle.filter((t) => tageBis(new Date(t.d)) === tageBis(d)).length;
    const bald = alle.filter((t) => tageBis(new Date(t.d)) <= anz(g, 7, 14, 31)), n = anz(g, 3, 6, 14), heute = anzahl(h);
    const zeile = (t) => `<li><a href="${link(t.b, t.pid)}"><span class="ue-zeit"><b>${esc(tagText(new Date(t.d)))}</b><small>${esc(uhr(t.s) || "ganztägig")}</small></span><span class="ue-zt"><b>${esc(t.label)}</b><small>${esc(t.name)}${t.ort && g !== "k" ? " · " + esc(t.ort) : ""}</small></span>${g === "k" ? "" : tag(t.b)}</a></li>`;
    return `${g === "k" ? `<p class="ue-gross-zahl"><b>${heute}</b><small>${heute === 1 ? "Termin" : "Termine"} heute</small></p>`
        : `<div class="ue-woche">${woche.map((d) => `<span class="${tageBis(d) === 0 ? "heute" : ""}${tageBis(d) < 0 ? " vorbei" : ""}"><small>${WT[d.getDay()].slice(0, 2)}</small><b>${d.getDate()}</b><i>${anzahl(d) ? "•".repeat(Math.min(3, anzahl(d))) : ""}</i></span>`).join("")}</div>`}
      ${bald.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${bald.slice(0, n).map(zeile).join("")}</ul>${mehr(bald, n)}` : leer("Keine Termine in nächster Zeit.")}
      ${g === "k" ? "" : `<p class="ue-fuss">Outlook-Kalender: wird angezeigt, sobald Microsoft 365 verbunden ist.</p>`}`;
  }
  function wMail(A, g) {
    const l = Object.entries(A).flatMap(([b, a]) => ((a && a.mails) || []).map((m) => ({ ...m, b }))), n = anz(g, 2, 6, 14);
    return `${g === "k" ? `<p class="ue-gross-zahl"><b>${l.length}</b><small>${l.length === 1 ? "Mail" : "Mails"} zu schreiben</small></p>` : ""}
      ${l.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((m) => `<li><a href="${link(m.b, m.pid)}"><span class="ue-ico" aria-hidden="true">✉</span><span class="ue-zt"><b>${esc(m.titel)}</b><small>${esc(m.name)}</small></span>${g === "k" ? "" : tag(m.b)}</a></li>`).join("")}</ul>${mehr(l, n)}` : g === "k" ? "" : leer("Keine Mails fällig – alles verschickt.")}
      <div class="ue-aktion"><a class="btn klein" href="https://outlook.office.com/mail/" target="_blank" rel="noopener">Postfach öffnen</a></div>
      ${g === "k" ? "" : `<p class="ue-fuss">Posteingang direkt hier: nach Anbindung an Microsoft 365.</p>`}`;
  }
  function wBereich(b, a, g) {
    if (!a || a.fehler) return leer("Bereich gerade nicht erreichbar.");
    const f = a.faellig || [], nf = anz(g, 3, 6, 14);
    return `${f.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${f.slice(0, nf).map((x) => `<li><a href="${link(b, x.pid)}"><span class="ue-punkt${x.ueber ? " rot" : ""}" aria-hidden="true"></span><span class="ue-zt"><b>${esc(x.text)}</b><small>${esc(x.name)}${x.unter && g !== "k" ? " · " + esc(x.unter) : ""}</small></span>${g === "k" ? "" : `<span class="ue-wann${x.ueber ? " rot" : ""}">${x.ueber ? "überfällig" : esc(tagText(new Date(x.d)))}</span>`}</a></li>`).join("")}</ul>${mehr(f, nf)}`
        : `<p class="ue-alles-gut"><span aria-hidden="true">✓</span> Nichts fällig</p>`}
      <div class="ue-aktion"><a class="btn klein voll" href="${b}/${QS}#/cockpit">${g === "k" ? "Öffnen" : (b === "bad" ? "Bad" : "Heizung") + " öffnen"} →</a>${g === "k" ? "" : `<a class="btn klein still" href="${b}/${QS}#/projekte">Projekte</a>`}</div>`;
  }
  function wBaustellen(A, g) {
    const l = Object.entries(A).flatMap(([b, a]) => ((a && a.baustellen) || []).map((x) => ({ ...x, b }))).sort((x, y) => (x.baustart || "").localeCompare(y.baustart || "")), n = anz(g, 2, 8, 20);
    return `${g === "k" ? `<p class="ue-gross-zahl"><b>${l.filter((x) => x.laeuftHeute).length}</b><small>laufen gerade</small></p>` : ""}
      ${l.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((x) => `<li><a href="${link(x.b, x.pid)}"><span class="ue-ico${x.laeuftHeute ? " an" : ""}" aria-hidden="true">${x.laeuftHeute ? "●" : "○"}</span><span class="ue-zt"><b>${esc(x.name)}</b><small>${esc(x.ort)}${x.team.length && g !== "k" ? " · " + esc(x.team.join(", ")) : ""}</small></span>${g === "k" ? "" : `<span class="ue-wann">${x.laeuftHeute ? "läuft" : "ab " + esc(tagText(datum(x.baustart)))}</span>${tag(x.b)}`}</a></li>`).join("")}</ul>${mehr(l, n)}` : leer("Diese Woche keine Baustellen.")}`;
  }
  function wKennzahlen(A, g) {
    const k = Object.entries(A).filter(([, a]) => a && a.kennzahlen).map(([b, a]) => ({ b, ...a.kennzahlen }));
    if (!k.length) return leer("Nur für die Geschäftsführung.");
    const s = (f) => k.reduce((x, y) => x + (y[f] || 0), 0);
    const ziel = Math.max(...k.map((x) => x.ziel || 0)), umsatz = s("umsatzJahr"), pr = ziel ? Math.min(100, Math.round((umsatz / ziel) * 100)) : 0;
    const kopf = `<div class="ue-kz-gross"><span><small>Umsatz ${new Date().getFullYear()}</small><b>${geld(umsatz)}</b></span>${ziel ? `<span class="ue-ring" style="--p:${pr}"><b>${pr} %</b><small>vom Ziel</small></span>` : ""}</div>`;
    if (g === "k") return kopf;
    const kacheln = `<div class="ue-kz${g === "g" ? " vier" : ""}">
        <span><b>${geld(s("bestand"))}</b><small>Auftragsbestand · ${s("auftraege")} Aufträge</small></span>
        <span><b>${geld(s("angeboteWert"))}</b><small>offene Angebote · ${s("angebote")}</small></span>
        <span><b>${s("anfragen")}</b><small>neue Anfragen</small></span>
        <span><b>${s("fertigJahr")}</b><small>fertig ${new Date().getFullYear()}</small></span></div>`;
    const tabelle = g === "g" ? `<table class="ue-tab"><thead><tr><th></th><th>Umsatz ${new Date().getFullYear()}</th><th>Auftragsbestand</th><th>offene Angebote</th><th>Anfragen</th><th>fertig</th><th>abgesagt</th></tr></thead>
        <tbody>${k.map((x) => `<tr><td>${tag(x.b)}</td><td>${geld(x.umsatzJahr || 0)}</td><td>${geld(x.bestand || 0)}</td><td>${geld(x.angeboteWert || 0)} · ${x.angebote}</td><td>${x.anfragen}</td><td>${x.fertigJahr}</td><td>${x.verloren}</td></tr>`).join("")}</tbody></table>` : "";
    return `${kopf}${kacheln}${tabelle}<div class="ue-aktion"><a class="btn klein still" href="bad/${QS}#/kennzahlen">Unternehmen Bad</a><a class="btn klein still" href="heizung/${QS}#/kennzahlen">Unternehmen Heizung</a></div>`;
  }
  function wPersonal(A, g) {
    const m = new Map();
    for (const [b, a] of Object.entries(A)) for (const t of (a && a.team) || []) {
      const x = m.get(t.kuerzel) || { ...t, bad: 0, heizung: 0, timer: null };
      x[b] = t.projekte; if (t.timer) x.timer = { ...t.timer, b }; m.set(t.kuerzel, x);
    }
    const l = [...m.values()].filter((x) => x.ebene !== "geschaeftsfuehrung" && !/Beispiel|eintragen/.test(x.name)).sort((x, y) => !!y.timer - !!x.timer || (y.bad + y.heizung) - (x.bad + x.heizung));
    const max = Math.max(1, ...l.map((x) => x.bad + x.heizung)), n = anz(g, 3, 8, 30);
    if (!l.length) return leer("Noch keine Mitarbeiter eingetragen.");
    return `${g === "k" ? `<p class="ue-gross-zahl"><b>${l.filter((x) => x.timer).length}</b><small>arbeiten gerade an Projekten</small></p>` : ""}
      <ul class="ue-team${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((x) => `<li><span class="kuerzel klein">${esc(x.kuerzel)}</span><span class="ue-zt"><b>${esc(g === "k" ? vorname(x.name) : x.name)}</b>${g === "k" ? "" : `<small>${x.timer ? `<span class="ue-live">▶ ${esc(x.timer.name)} seit ${esc(new Date(x.timer.seit).toTimeString().slice(0, 5))}</span>` : esc(x.funktion)}</small>`}</span>
        ${g === "k" ? "" : `<span class="ue-last" title="${x.bad} Bad · ${x.heizung} Heizung"><span class="b" style="width:${(x.bad / max) * 100}%"></span><span class="h" style="width:${(x.heizung / max) * 100}%"></span></span>`}<span class="ue-wann">${g === "g" ? `${x.bad} Bad · ${x.heizung} Hz.` : x.bad + x.heizung}</span></li>`).join("")}</ul>
      ${g === "k" ? "" : `<p class="ue-fuss"><span class="ue-leg b"></span> Bad <span class="ue-leg h"></span> Heizung · laufende Projekte je Person</p>`}
      ${PERSON && PERSON.ebene === "geschaeftsfuehrung" ? `<div class="ue-aktion"><a class="btn klein still" href="personal/${QS}">Personalkarten öffnen</a></div>` : ""}`;
  }
  function wNeu(A, g) {
    const l = Object.entries(A).flatMap(([b, a]) => ((a && a.neu) || []).map((x) => ({ ...x, b }))), n = anz(g, 3, 6, 20);
    return l.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((x) => `<li><a href="${link(x.b, x.pid)}"><span class="ue-ico an" aria-hidden="true">↑</span><span class="ue-zt"><b>${esc(x.name)}</b><small>${x.n} ${x.n === 1 ? "neue Datei" : "neue Dateien"}</small></span>${g === "k" ? "" : tag(x.b)}</a></li>`).join("")}</ul>${mehr(l, n)}` : leer("Nichts Neues von Kunden.");
  }

  /* ---------- Größe & Reihenfolge je Person ---------- */
  const STANDARD_REIHE = ["bad", "heizung", "kalender", "mail", "baustellen", "neu", "kennzahlen", "personal"];
  const STANDARD_GROESSE = { neu: "k", baustellen: "m" };
  const layoutVon = (p) => { const l = lesen("bruell:layout", {})[p.id] || {}; return { reihe: Array.isArray(l.reihe) ? l.reihe : STANDARD_REIHE, groesse: l.groesse || {} }; };
  const layoutSpeichern = (p, l) => { const alle = lesen("bruell:layout", {}); alle[p.id] = l; schreiben("bruell:layout", alle); };
  /* Größe je Widget: Breite in Vierteln (1–4) und Höhe in px (leer = so hoch wie der Inhalt) */
  const masseVon = (p, id) => {
    const v = layoutVon(p).groesse[id] || STANDARD_GROESSE[id] || "m";
    if (typeof v === "string") return { s: { k: 1, m: 2, g: 4 }[v] || 2, h: null };   // ältere Einstellung
    return { s: Math.min(4, Math.max(1, v.s || 2)), h: v.h || null };
  };
  const dichteVon = (s) => (s <= 1 ? "k" : s >= 4 ? "g" : "m");
  const groesseVon = (p, id) => dichteVon(masseVon(p, id).s);
  let BEARBEITEN = false;

  /* ---------- Seite ---------- */
  function begruessung() { const h = new Date().getHours(); return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"; }
  function seite(person, A) {
    const sicht = widgetsFuer(person), d = new Date(), lay = layoutVon(person);
    const zaehler = { mail: Object.values(A).reduce((x, a) => x + ((a && a.mails) || []).length, 0), bad: (A.bad && A.bad.faellig || []).length, heizung: (A.heizung && A.heizung.faellig || []).length };
    const inhalt = { kalender: (g) => wKalender(A, g), mail: (g) => wMail(A, g), bad: (g) => wBereich("bad", A.bad, g), heizung: (g) => wBereich("heizung", A.heizung, g), baustellen: (g) => wBaustellen(A, g), kennzahlen: (g) => wKennzahlen(A, g), personal: (g) => wPersonal(A, g), neu: (g) => wNeu(A, g) };
    const reihenfolge = [...lay.reihe, ...STANDARD_REIHE.filter((id) => !lay.reihe.includes(id))].filter((id) => sicht.includes(id));
    const karte = (id, i) => { const w = WIDGETS.find((x) => x.id === id), m = masseVon(person, id), g = dichteVon(m.s);
      return `<article class="ue-w g-${g} s-${m.s} w-${id}${m.h ? " feste-hoehe" : ""}" data-widget="${id}"${m.h ? ` style="height:${m.h}px"` : ""}${BEARBEITEN ? ' draggable="true"' : ""}><header>${BEARBEITEN ? '<span class="ue-greif" aria-hidden="true" title="Ziehen zum Verschieben">⠿</span>' : ""}<h2>${esc(w.titel)}</h2>${zaehler[id] ? `<span class="ue-badge">${zaehler[id]}</span>` : ""}
        ${BEARBEITEN ? `<span class="ue-bearb"><span class="ue-groesse" role="group" aria-label="Größe ${esc(w.titel)}">${[[1, "¼"], [2, "½"], [3, "¾"], [4, "1"]].map(([v, t]) => `<button type="button" class="${m.s === v ? "an" : ""}" data-aktion="w-groesse" data-id="${id}" data-wert="${v}" title="${t} Breite" aria-pressed="${m.s === v}">${t}</button>`).join("")}</span>
          <button type="button" class="ue-pfeil" data-aktion="w-schieben" data-id="${id}" data-wert="-1" title="nach vorne" aria-label="${esc(w.titel)} nach vorne"${i === 0 ? " disabled" : ""}>‹</button><button type="button" class="ue-pfeil" data-aktion="w-schieben" data-id="${id}" data-wert="1" title="nach hinten" aria-label="${esc(w.titel)} nach hinten"${i === reihenfolge.length - 1 ? " disabled" : ""}>›</button></span>` : ""}</header>
        <div class="ue-inhalt">${inhalt[id](g)}</div>${BEARBEITEN ? `<span class="ue-griff" data-griff="${id}" title="Ziehen: Breite und Höhe ändern · Doppelklick: Höhe automatisch" aria-hidden="true"></span>` : ""}</article>`; };
    return `<div class="seite uebersicht">
      <header class="ue-kopf">
        <div class="ue-gruss"><p class="eyebrow">${WT[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}</p>
          <h1>${begruessung()}, ${esc(vorname(person.name))}</h1>
          <p class="ue-lage">${zaehler.bad + zaehler.heizung ? `<b>${zaehler.bad + zaehler.heizung}</b> ${zaehler.bad + zaehler.heizung === 1 ? "Punkt ist" : "Punkte sind"} fällig` : "Nichts fällig"}${zaehler.mail ? ` · <b>${zaehler.mail}</b> ${zaehler.mail === 1 ? "Mail" : "Mails"} zu schreiben` : ""}</p></div>
        <div class="ue-zeitwetter">
          <div class="ue-uhr" aria-live="off"><b id="uhr">${zwei(d.getHours())}:${zwei(d.getMinutes())}</b><small>Uhr</small></div>
          <div class="ue-wetter" id="wetter"><p class="leise klein-text">Wetter wird geladen …</p></div>
        </div>
      </header>
      ${reihenfolge.length ? `<div class="ue-leiste">${BEARBEITEN ? `<span class="ue-tipp">Am <b>⠿</b> ziehen zum Verschieben · am Griff unten rechts ziehen für Breite und Höhe (Doppelklick: Höhe automatisch)</span><button class="btn klein still" data-aktion="w-zuruecksetzen">Zurücksetzen</button><button class="btn jetzt" data-aktion="w-bearbeiten">✓ Fertig</button>` : `<button class="btn" data-aktion="w-bearbeiten">✎ Widgets anpassen</button>`}</div>
        <section class="ue-raster${BEARBEITEN ? " bearbeiten" : ""}">${reihenfolge.map(karte).join("")}</section>`
        : `<div class="panel startfeld"><h2>Noch keine Widgets freigeschaltet</h2><p>Die Geschäftsführung kann unter „Übersicht anpassen“ festlegen, was hier erscheint.</p></div>`}
      ${person.ebene === "geschaeftsfuehrung" ? anpassen(A) : ""}
    </div>`;
  }
  /* Raster ohne Lücken: jede Karte belegt so viele 8-px-Zeilen, wie sie hoch ist */
  function rasterOrdnen() {
    const r = $(".ue-raster"); if (!r) return;
    const gap = parseFloat(getComputedStyle(r).rowGap) || 0, zeile = parseFloat(getComputedStyle(r).gridAutoRows) || 8;
    for (const w of $$(".ue-w", r)) { w.style.gridRowEnd = "auto"; const h = w.getBoundingClientRect().height; w.style.gridRowEnd = `span ${Math.ceil((h + gap) / (zeile + gap))}`; }
  }
  /* ---------- Bearbeiten: Größe am Griff ziehen, Widgets per Drag & Drop verschieben ---------- */
  function spaltenInfo() {
    const r = $(".ue-raster"), cs = getComputedStyle(r), spalten = cs.gridTemplateColumns.split(" ").length, gap = parseFloat(cs.columnGap) || 0;
    return { r, spalten, gap, breite: (r.clientWidth - gap * (spalten - 1)) / spalten };
  }
  function reiheSetzen(id, zielId, davor) {
    const lay = layoutVon(PERSON), reihe = [...lay.reihe, ...STANDARD_REIHE.filter((x) => !lay.reihe.includes(x))].filter((x) => x !== id);
    reihe.splice(reihe.indexOf(zielId) + (davor ? 0 : 1), 0, id);
    lay.reihe = reihe; layoutSpeichern(PERSON, lay);
  }
  let letzterTipp = {};
  function bearbeitenAn() {
    if (!BEARBEITEN || !$(".ue-raster")) return;
    /* Größe: Griff unten rechts – Breite rastet in Vierteln ein, Höhe frei */
    for (const griff of $$(".ue-griff")) {
      griff.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const w = griff.closest(".ue-w"), id = w.dataset.widget, info = spaltenInfo(), x0 = e.clientX, y0 = e.clientY, r0 = w.getBoundingClientRect();
        let span = Math.max(1, Math.round((r0.width + info.gap) / (info.breite + info.gap))), hoehe = null;
        griff.setPointerCapture(e.pointerId); w.classList.add("zieht-groesse");
        const bewegen = (ev) => {
          const n = Math.min(info.spalten, Math.max(1, Math.round((r0.width + ev.clientX - x0 + info.gap) / (info.breite + info.gap))));
          if (n !== span) { w.classList.remove("s-" + span); span = n; w.classList.add("s-" + n); }
          hoehe = Math.max(130, Math.round(r0.height + ev.clientY - y0));
          if (Math.abs(ev.clientY - y0) > 6) { w.style.height = hoehe + "px"; w.classList.add("feste-hoehe"); }
          rasterOrdnen();
        };
        const ende = (ev) => {
          griff.removeEventListener("pointermove", bewegen); griff.removeEventListener("pointerup", ende); griff.removeEventListener("pointercancel", ende);
          if (Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) {          /* nur angetippt: Doppeltipp = Höhe automatisch */
            w.classList.remove("zieht-groesse");
            const jetzt = Date.now();
            if (letzterTipp.id === id && jetzt - letzterTipp.t < 450) { const lay = layoutVon(PERSON); lay.groesse = { ...lay.groesse, [id]: { s: masseVon(PERSON, id).s, h: null } }; layoutSpeichern(PERSON, lay); letzterTipp = {}; return zeichnen(); }
            letzterTipp = { id, t: jetzt }; return;
          }
          const alt = masseVon(PERSON, id), h = Math.abs(ev.clientY - y0) > 6 ? hoehe : alt.h;
          const lay = layoutVon(PERSON); lay.groesse = { ...lay.groesse, [id]: { s: Math.min(4, span * (4 / info.spalten) | 0 || span), h } }; layoutSpeichern(PERSON, lay); zeichnen();
        };
        griff.addEventListener("pointermove", bewegen); griff.addEventListener("pointerup", ende); griff.addEventListener("pointercancel", ende);
      });
    }
    /* Verschieben: ganzes Widget ziehen */
    let gezogen = null;
    for (const w of $$(".ue-w[draggable]")) {
      w.addEventListener("dragstart", (e) => { gezogen = w.dataset.widget; w.classList.add("zieht"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", gezogen); } catch (x) { /* egal */ } });
      w.addEventListener("dragend", () => { w.classList.remove("zieht"); $$(".ue-w").forEach((x) => x.classList.remove("ziel-vor", "ziel-nach")); });
      w.addEventListener("dragover", (e) => {
        if (!gezogen || gezogen === w.dataset.widget) return;
        e.preventDefault(); const b = w.getBoundingClientRect(), davor = (e.clientY - b.top) / b.height < .5 || (e.clientX - b.left) / b.width < .3;
        w.classList.toggle("ziel-vor", davor); w.classList.toggle("ziel-nach", !davor);
      });
      w.addEventListener("dragleave", () => w.classList.remove("ziel-vor", "ziel-nach"));
      w.addEventListener("drop", (e) => {
        if (!gezogen || gezogen === w.dataset.widget) return;
        e.preventDefault(); reiheSetzen(gezogen, w.dataset.widget, w.classList.contains("ziel-vor")); gezogen = null; zeichnen();
      });
    }
  }
  function zeichnen(offen) {
    $("#main").innerHTML = seite(PERSON, AUSZUEGE);
    if (offen && $("#anpassen")) $("#anpassen").open = true;
    rasterOrdnen(); wetterLaden(); bearbeitenAn();
  }
  window.addEventListener("resize", () => { clearTimeout(rasterOrdnen.t); rasterOrdnen.t = setTimeout(rasterOrdnen, 120); });

  /* ---------- Übersicht anpassen (nur Geschäftsführung) ---------- */
  function personen(A) {
    const m = new Map();
    for (const a of Object.values(A)) for (const t of (a && a.team) || []) if (!m.has(t.kuerzel)) m.set(t.kuerzel, { id: t.kuerzel, name: t.name, ebene: t.ebene, funktion: t.funktion });
    return [...m.values()];
  }
  function anpassen(A) {
    const P = personen(A);
    return `<details class="panel ue-anpassen" id="anpassen"><summary><span>Übersicht anpassen</span><small>Welche Widgets sieht wer?</small></summary>
      <div class="tab-wrap ohne-rand"><table class="kz-tab ue-matrix"><thead><tr><th>Mitarbeiter</th>${WIDGETS.map((w) => `<th title="${esc(w.text)}">${esc(w.titel)}</th>`).join("")}</tr></thead>
      <tbody>${P.map((p) => { const s = widgetsFuer(p); return `<tr data-person="${esc(p.id)}"><td><b>${esc(p.name)}</b><br><small class="leise">${esc(p.funktion || p.ebene)}</small></td>${WIDGETS.map((w) => `<td class="mitte"><input type="checkbox" data-widget="${w.id}"${s.includes(w.id) ? " checked" : ""} aria-label="${esc(p.name + ": " + w.titel)}"></td>`).join("")}</tr>`; }).join("")}</tbody></table></div>
      <div class="aktionen panel-innen"><button class="btn jetzt" data-aktion="widgets-speichern">Übernehmen</button><button class="btn still" data-aktion="widgets-standard">Standard je Rolle</button>
        <span class="leise klein-text">Gilt sofort für die jeweilige Person. Im Demo-Modus nur in diesem Browser gespeichert.</span></div></details>`;
  }

  /* ---------- Leiste ---------- */
  function leiste(person) {
    $("#nav").innerHTML = `<a href="./${QS}" aria-current="page"><span class="nav-i i-cockpit" aria-hidden="true"></span>Übersicht</a>
      ${BEREICHE.map((b) => `<a href="${b.id}/${QS}#/cockpit"><span class="nav-i ${b.icon}" aria-hidden="true"></span>${esc(b.titel)}</a>`).join("")}
      ${person.ebene === "geschaeftsfuehrung" ? `<a href="personal/${QS}"><span class="nav-i i-konten" aria-hidden="true"></span>Personal</a><a href="bad/${QS}#/konten"><span class="nav-i i-einrichtung" aria-hidden="true"></span>Konten</a>` : ""}`;
    const ini = (person.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    $("#ich").innerHTML = `<div class="ich"><span class="ich-k">${esc(ini)}</span><span><b>${esc(person.name)}</b><small>${esc({ geschaeftsfuehrung: "Geschäftsführung", planung: "Planung / Bearbeitung", monteur: "Monteur" }[person.ebene] || "")}</small></span></div>
      <div class="ich-aktionen"><button class="btn klein hell" data-aktion="abmelden">Abmelden</button></div>
      ${DEMO ? '<p class="modus">Demo – Daten nur in diesem Browser</p>' : ""}`;
  }

  /* ---------- Start ---------- */
  let PERSON = null, AUSZUEGE = {};
  async function start() {
    PERSON = ich();
    if (!PERSON || PERSON.mussAendern) return zumLogin();
    if (PERSON.ebene === "partner") return location.replace("bad/" + QS);   // Partner arbeiten direkt in ihren Einsätzen
    try { localStorage.setItem("bruell:bereich", "uebersicht"); } catch (e) { /* egal */ }
    leiste(PERSON);
    const [bad, heizung] = await Promise.all(BEREICHE.map((b) => auszugHolen(b.id)));
    AUSZUEGE = { bad, heizung };
    if ([bad, heizung].every((a) => a && a.fehler)) { $("#main").innerHTML = `<div class="seite"><div class="panel startfeld"><h2>Bereiche nicht erreichbar</h2><p>Bitte neu laden oder erneut anmelden.</p><button class="btn" data-aktion="abmelden">Neu anmelden</button></div></div>`; return; }
    zeichnen();
  }
  setInterval(() => { const u = $("#uhr"); if (u) { const d = new Date(); u.textContent = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`; } }, 5000);

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-aktion]"); if (!a) return;
    const akt = a.dataset.aktion;
    if (akt === "abmelden") return abmelden();
    if (akt === "w-bearbeiten") { BEARBEITEN = !BEARBEITEN; return zeichnen(); }
    if (akt === "w-groesse" || akt === "w-schieben" || akt === "w-zuruecksetzen") {
      const lay = layoutVon(PERSON), id = a.dataset.id;
      if (akt === "w-groesse") lay.groesse = { ...lay.groesse, [id]: { s: Number(a.dataset.wert), h: masseVon(PERSON, id).h } };
      if (akt === "w-schieben") {
        const sicht = widgetsFuer(PERSON), reihe = [...lay.reihe, ...STANDARD_REIHE.filter((x) => !lay.reihe.includes(x))];
        const sichtbar = reihe.filter((x) => sicht.includes(x)), i = sichtbar.indexOf(id), j = i + Number(a.dataset.wert);
        if (j < 0 || j >= sichtbar.length) return;
        const ziel = sichtbar[j], a1 = reihe.indexOf(id), a2 = reihe.indexOf(ziel); [reihe[a1], reihe[a2]] = [reihe[a2], reihe[a1]]; lay.reihe = reihe;
      }
      if (akt === "w-zuruecksetzen") { layoutSpeichern(PERSON, { reihe: STANDARD_REIHE, groesse: {} }); toast("Standard-Anordnung"); return zeichnen(); }
      layoutSpeichern(PERSON, lay); return zeichnen();
    }
    if (akt === "widgets-speichern") {
      const neu = lesen("bruell:widgets", {});
      for (const tr of $$("[data-person]")) neu[tr.dataset.person] = $$("[data-widget]", tr).filter((x) => x.checked).map((x) => x.dataset.widget);
      schreiben("bruell:widgets", neu); toast("Übersicht angepasst");
      zeichnen(true);
    }
    if (akt === "widgets-standard") {
      for (const tr of $$("[data-person]")) { const p = personen(AUSZUEGE).find((x) => x.id === tr.dataset.person); const s = STANDARD[p.ebene] || STANDARD.planung; $$("[data-widget]", tr).forEach((x) => { x.checked = s.includes(x.dataset.widget); }); }
      toast("Standard gesetzt – mit „Übernehmen“ speichern");
    }
  });
  start();
})();
