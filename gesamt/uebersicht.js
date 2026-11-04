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
  /* Rechte (gesamt/thema.js): Kachel nur, wenn mindestens einer ihrer Bereiche freigegeben ist */
  const R = window.BruellRechte;
  const darf = (b) => !!R && (R.admin() || R.darf(b));
  const WIDGET_RECHT = { bad: ["bad"], heizung: ["heizung"], kalender: ["bad", "heizung", "fahrzeuge"], mail: ["bad", "heizung"], baustellen: ["bad", "heizung"], neu: ["bad", "heizung"], kennzahlen: ["monitor"], personal: ["personal"] };
  const widgetErlaubt = (id) => (WIDGET_RECHT[id] || []).some(darf);
  const widgetsFuer = (person) => { const w = lesen("bruell:widgets", {})[person.id]; return (Array.isArray(w) ? w : STANDARD[person.ebene] || STANDARD.planung).filter(widgetErlaubt); };

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
  async function abmelden() {
    if (window.BruellDB) await window.BruellDB.abmelden();        // Mac mini: auch die Datenbank-Sitzung beenden
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
  /* Wetter 15 Minuten merken (sessionStorage) → beim Neuzeichnen/Seitenwechsel sofort da, keine Doppelabfrage */
  async function wetterLaden() {
    const el = $("#wetter"); if (!el) return;
    let gemerkt = null; try { gemerkt = JSON.parse(sessionStorage.getItem("bruell:wetter")); } catch (e) { /* egal */ }
    if (gemerkt && Date.now() - gemerkt.zeit < 9e5) { el.innerHTML = gemerkt.html; return; }
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
      try { sessionStorage.setItem("bruell:wetter", JSON.stringify({ zeit: Date.now(), html: el.innerHTML })); } catch (e) { /* egal */ }
    } catch (e) { el.innerHTML = `<p class="leise klein-text">Wetter gerade nicht erreichbar.</p>`; }
  }

  /* ---------- Hilfen ---------- */
  const datum = (s) => { if (!s) return null; const d = new Date(s.length > 10 ? s : s + "T00:00"); return isNaN(d) ? null : d; };
  const heute0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const tageBis = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - heute0()) / 864e5);
  const fDatum = (d) => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
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
  /* HU / TÜV der Fahrzeuge (nur Geschäftsführung): ab 3 Wochen vorher im Kalender, überfällige bleiben stehen.
     Daten: Fahrzeugkarten im Browser (fz_<Nr>), sonst personal/daten-lokal.js (nur auf dem eigenen Rechner). */
  const TUEV_VORLAUF = 21;
  function tuevTermine() {
    if (!PERSON || !darf("fahrzeuge")) return [];
    const fz = { ...(window.FZ_VOLL || {}) };
    try { Object.keys(localStorage).filter((k) => /^fz_\d+$/.test(k)).forEach((k) => { fz[k.slice(3)] = lesen(k, {}); }); } catch (e) { /* gesperrt */ }
    return Object.entries(fz).flatMap(([nr, f]) => {
      if (!f || f.fz_ausgeblendet) return [];                                       // nicht mehr im Bestand
      const s = String(f.fz_tuev || "").trim();
      let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/), d = null;
      if (m) d = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
      else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = new Date(+m[1], +m[2] - 1, +m[3]);
      else if ((m = s.match(/^(\d{1,2})[./](\d{4})$/))) d = new Date(+m[2], +m[1] - 1, 1);       // „03/2027“ → Monatsanfang
      if (!d || isNaN(d) || tageBis(d) > TUEV_VORLAUF) return [];
      return [{ d: +d, tuev: true, label: tageBis(d) < 0 ? "HU / TÜV überfällig" : "HU / TÜV fällig", name: [f.fz_kennzeichen, f.fz_modell].filter(Boolean).join(" · "),
        ort: f.fz_fahrer || "", href: `fahrzeuge/karte.html${QS ? QS + "&" : "?"}nr=${nr}` }];
    });
  }
  function wKalender(A, g) {
    const alle = [...Object.entries(A).filter(([b]) => darf(b)).flatMap(([b, a]) => ((a && a.termine) || []).map((t) => ({ ...t, b }))), ...tuevTermine()];
    alle.sort((x, y) => x.d - y.d);
    const h = heute0(), mo = new Date(h); mo.setDate(h.getDate() - ((h.getDay() + 6) % 7));
    const woche = [...Array(7)].map((_, i) => { const d = new Date(mo); d.setDate(mo.getDate() + i); return d; });
    const anzahl = (d) => alle.filter((t) => tageBis(new Date(t.d)) === tageBis(d)).length;
    const bald = alle.filter((t) => tageBis(new Date(t.d)) <= anz(g, 7, 14, 31)), n = anz(g, 3, 6, 14), heute = anzahl(h);
    const zeile = (t) => `<li><a href="${t.tuev ? esc(t.href) : link(t.b, t.pid)}"><span class="ue-zeit"><b>${esc(tageBis(new Date(t.d)) < 0 ? fDatum(new Date(t.d)) : tagText(new Date(t.d)))}</b><small>${esc(uhr(t.s) || "ganztägig")}</small></span><span class="ue-zt"><b>${esc(t.label)}</b><small>${esc(t.name)}${t.ort && g !== "k" ? " · " + esc(t.ort) : ""}</small></span>${g === "k" ? "" : t.tuev ? `<span class="ue-tag fahrzeug${tageBis(new Date(t.d)) < 0 ? " ueberfaellig" : ""}">Fahrzeug</span>` : tag(t.b)}</a></li>`;
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
    return `${kopf}${kacheln}${tabelle}<div class="ue-aktion"><a class="btn klein" href="betrieb/${QS}">Betriebsmonitor</a><a class="btn klein still" href="bad/${QS}#/kennzahlen">Unternehmen Bad</a><a class="btn klein still" href="heizung/${QS}#/kennzahlen">Unternehmen Heizung</a></div>`;
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
      <ul class="ue-team${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((x) => `<li>${fotoZu(x.name) ? `<img class="ue-foto" src="${esc(fotoZu(x.name))}" alt="">` : `<span class="kuerzel klein">${esc(x.kuerzel)}</span>`}<span class="ue-zt"><b>${esc(g === "k" ? vorname(x.name) : x.name)}</b>${g === "k" ? "" : `<small>${x.timer ? `<span class="ue-live">▶ ${esc(x.timer.name)} seit ${esc(new Date(x.timer.seit).toTimeString().slice(0, 5))}</span>` : esc(x.funktion)}</small>`}</span>
        ${g === "k" ? "" : `<span class="ue-last" title="${x.bad} Bad · ${x.heizung} Heizung"><span class="b" style="width:${(x.bad / max) * 100}%"></span><span class="h" style="width:${(x.heizung / max) * 100}%"></span></span>`}<span class="ue-wann">${g === "g" ? `${x.bad} Bad · ${x.heizung} Hz.` : x.bad + x.heizung}</span></li>`).join("")}</ul>
      ${g === "k" ? "" : `<p class="ue-fuss"><span class="ue-leg b"></span> Bad <span class="ue-leg h"></span> Heizung · laufende Projekte je Person</p>`}
      ${PERSON && PERSON.ebene === "geschaeftsfuehrung" ? `<div class="ue-aktion"><a class="btn klein still" href="personal/${QS}">Personalkarten öffnen</a></div>` : ""}`;
  }
  /* Foto zum Namen: lokaler Foto-Ordner (personal/fotos-lokal.js) oder Website-Foto aus personal/team.js */
  function fotoZu(name) {
    const glatt = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const n = glatt(name), t = window.PK_TEAM || {};
    const x = Object.entries(t).find(([, d]) => n.includes(glatt(d.vorname)) && n.includes(glatt(d.nachname)));
    return !x ? "" : (window.PK_FOTOS || {})[x[0]] || (x[1]._foto ? "personal/" + x[1]._foto : "");
  }
  function wNeu(A, g) {
    const l = Object.entries(A).flatMap(([b, a]) => ((a && a.neu) || []).map((x) => ({ ...x, b }))), n = anz(g, 3, 6, 20);
    return l.length ? `<ul class="ue-liste${g === "g" ? " zweispaltig" : ""}">${l.slice(0, n).map((x) => `<li><a href="${link(x.b, x.pid)}"><span class="ue-ico an" aria-hidden="true">↑</span><span class="ue-zt"><b>${esc(x.name)}</b><small>${x.n} ${x.n === 1 ? "neue Datei" : "neue Dateien"}</small></span>${g === "k" ? "" : tag(x.b)}</a></li>`).join("")}</ul>${mehr(l, n)}` : leer("Nichts Neues von Kunden.");
  }

  /* ---------- Anordnung je Person: freies Raster (GridStack, 12 Spalten) ----------
     bruell:raster = { Person-ID: { Widget-ID: { x, y, w, h } } } – ohne Eintrag stellt GridStack die Kachel selbst auf.
     Ältere Einstellung (bruell:layout: Reihenfolge + Breite in Vierteln) dient als Vorlage, bis neu angeordnet wurde. */
  const STANDARD_REIHE = ["bad", "heizung", "kalender", "mail", "baustellen", "neu", "kennzahlen", "personal"];
  const STANDARD_W = {}, STANDARD_H = { bad: 7, heizung: 7, kalender: 8, mail: 6, baustellen: 6, neu: 5, kennzahlen: 6, personal: 7 };
  const ZEILE = 48, ABSTAND = 9;                                   // Rasterzeile in px, halber Abstand zwischen Kacheln
  const altesLayout = (p) => { const l = lesen("bruell:layout", {})[p.id] || {}; return { reihe: Array.isArray(l.reihe) ? l.reihe : STANDARD_REIHE, groesse: l.groesse || {} }; };
  const rasterVon = (p) => lesen("bruell:raster", {})[p.id] || null;
  const rasterSpeichern = (p, r) => { const alle = lesen("bruell:raster", {}); if (r) alle[p.id] = r; else delete alle[p.id]; schreiben("bruell:raster", alle); };
  /* Platz einer Kachel: gespeichert, sonst aus der alten Einstellung (Breite ¼…1 → 3…12 Spalten) */
  function platzVon(p, id) {
    const r = rasterVon(p); if (r && r[id]) return r[id];
    const g = altesLayout(p).groesse[id], s = typeof g === "object" ? g.s : { k: 1, m: 2, g: 4 }[g];
    return { w: s ? s * 3 : STANDARD_W[id] || 6, h: typeof g === "object" && g.h ? Math.max(3, Math.round((g.h + 2 * ABSTAND) / ZEILE)) : STANDARD_H[id] || 6 };
  }
  const reihenfolgeVon = (p) => { const l = altesLayout(p); return [...l.reihe, ...STANDARD_REIHE.filter((id) => !l.reihe.includes(id))]; };
  /* Grundanordnung ohne Lücken: jede Kachel an die höchstmögliche Stelle (von links), in der gewohnten Reihenfolge */
  function packen(ids, p) {
    const hoehe = Array(12).fill(0), r = {};
    for (const id of ids) {
      const m = platzVon(p, id), w = Math.min(12, m.w); let best = null;
      for (let x = 0; x <= 12 - w; x++) { const y = Math.max(...hoehe.slice(x, x + w)); if (!best || y < best.y) best = { x, y }; }
      r[id] = { x: best.x, y: best.y, w, h: m.h };
      for (let i = best.x; i < best.x + w; i++) hoehe[i] = best.y + m.h;
    }
    return r;
  }
  /* Darstellung je Breite: klein (≤ 3 Spalten), mittel, groß (≥ 9 Spalten) */
  const dichteVon = (w) => (w <= 3 ? "k" : w >= 9 ? "g" : "m");
  let BEARBEITEN = false;

  /* ---------- Seite ---------- */
  function begruessung() { const h = new Date().getHours(); return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend"; }
  function seite(person, A) {
    const sicht = widgetsFuer(person), d = new Date();
    const zaehler = { mail: Object.values(A).reduce((x, a) => x + ((a && a.mails) || []).length, 0), bad: (A.bad && A.bad.faellig || []).length, heizung: (A.heizung && A.heizung.faellig || []).length };
    const inhalt = { kalender: (g) => wKalender(A, g), mail: (g) => wMail(A, g), bad: (g) => wBereich("bad", A.bad, g), heizung: (g) => wBereich("heizung", A.heizung, g), baustellen: (g) => wBaustellen(A, g), kennzahlen: (g) => wKennzahlen(A, g), personal: (g) => wPersonal(A, g), neu: (g) => wNeu(A, g) };
    const reihenfolge = reihenfolgeVon(person).filter((id) => sicht.includes(id)), gespeichert = rasterVon(person) || {};
    /* gespeicherte Plätze; was (noch) keinen hat, wird lückenlos darunter einsortiert */
    const ohne = reihenfolge.filter((id) => !gespeichert[id]), unten = Math.max(0, ...Object.entries(gespeichert).filter(([id]) => reihenfolge.includes(id)).map(([, m]) => m.y + m.h));
    const neu = packen(ohne, person); Object.values(neu).forEach((m) => { m.y += unten; });
    const karte = (id) => { const w = WIDGETS.find((x) => x.id === id), m = gespeichert[id] || neu[id], g = dichteVon(m.w);
      return `<div class="grid-stack-item" gs-id="${id}" gs-x="${m.x}" gs-y="${m.y}" gs-w="${m.w}" gs-h="${m.h}" gs-min-w="2" gs-min-h="3">
        <article class="grid-stack-item-content ue-w g-${g} w-${id}" data-widget="${id}"><header>${BEARBEITEN ? '<span class="ue-greif" aria-hidden="true" title="Hier anfassen und ziehen">⠿</span>' : ""}<h2>${esc(w.titel)}</h2>${zaehler[id] ? `<span class="ue-badge">${zaehler[id]}</span>` : ""}</header>
        <div class="ue-inhalt">${inhalt[id](g)}</div></article></div>`; };
    INHALT = inhalt;
    return `<div class="seite uebersicht">
      <header class="ue-kopf">
        <div class="ue-gruss"><img class="ue-logo" src="bad/app/img/logo.svg" alt="Brüll GmbH"><div class="ue-gruss-text"><p class="eyebrow">${WT[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}</p>
          <h1>${begruessung()}, ${esc(vorname(person.name))}</h1>
          <p class="ue-lage">${zaehler.bad + zaehler.heizung ? `<b>${zaehler.bad + zaehler.heizung}</b> ${zaehler.bad + zaehler.heizung === 1 ? "Punkt ist" : "Punkte sind"} fällig` : "Nichts fällig"}${zaehler.mail ? ` · <b>${zaehler.mail}</b> ${zaehler.mail === 1 ? "Mail" : "Mails"} zu schreiben` : ""}</p></div></div>
        <div class="ue-zeitwetter">
          <div class="ue-uhr" aria-live="off"><b id="uhr">${zwei(d.getHours())}:${zwei(d.getMinutes())}</b><small>Uhr</small></div>
          <div class="ue-wetter" id="wetter"><p class="leise klein-text">Wetter wird geladen …</p></div>
        </div>
      </header>
      ${reihenfolge.length ? `<div class="ue-leiste">${BEARBEITEN ? `<span class="ue-tipp">Kachel an der <b>Kopfzeile</b> anfassen und an jede Stelle ziehen · an <b>Rand oder Ecke</b> ziehen für die Größe</span><button class="btn klein still" data-aktion="w-zuruecksetzen">Zurücksetzen</button><button class="btn jetzt" data-aktion="w-bearbeiten">✓ Fertig</button>` : `<button class="btn" data-aktion="w-bearbeiten">✎ Widgets anpassen</button>`}</div>
        <section class="grid-stack ue-gitter${BEARBEITEN ? " bearbeiten" : ""}">${reihenfolge.map(karte).join("")}</section>`
        : `<div class="panel startfeld"><h2>Noch keine Widgets freigeschaltet</h2><p>Die Geschäftsführung kann unter „Übersicht anpassen“ festlegen, was hier erscheint.</p></div>`}
      ${person.ebene === "geschaeftsfuehrung" ? anpassen(A) : ""}
    </div>`;
  }
  /* ---------- Freies Raster (GridStack): im Bearbeiten-Modus Kopfzeile ziehen = verschieben, Rand/Ecke = Größe ---------- */
  let GITTER = null, INHALT = {};
  function gitterAn() {
    if (GITTER) { GITTER.destroy(false); GITTER = null; }
    const el = $(".ue-gitter"); if (!el || !window.GridStack) return;
    GITTER = window.GridStack.init({
      column: 12, cellHeight: ZEILE, margin: ABSTAND, float: true, animate: false, staticGrid: !BEARBEITEN,
      handle: ".ue-w > header", resizable: { handles: "e,se,s,sw,w" },
      columnOpts: { breakpoints: [{ w: 760, c: 1 }], layout: "list" },
    }, el);
    /* breiter/schmaler → Inhalt in passender Darstellung neu zeichnen; jede Änderung je Person merken */
    GITTER.on("resizestop", (e, item) => {
      const id = item.getAttribute("gs-id"), w = +item.getAttribute("gs-w"), g = dichteVon(w), art = item.querySelector(".ue-w");
      if (!art.classList.contains("g-" + g)) { art.classList.remove("g-k", "g-m", "g-g"); art.classList.add("g-" + g); art.querySelector(".ue-inhalt").innerHTML = INHALT[id](g); }
    });
    GITTER.on("change", () => {
      if (GITTER.getColumn() !== 12) return;                        // Handy-Ansicht (eine Spalte) nicht als Anordnung speichern
      const r = {}; GITTER.getGridItems().forEach((it) => { const n = it.gridstackNode; r[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h }; });
      rasterSpeichern(PERSON, r);
    });
  }
  function zeichnen(offen) {
    $("#main").innerHTML = seite(PERSON, AUSZUEGE);
    if (offen && $("#anpassen")) $("#anpassen").open = true;
    gitterAn(); wetterLaden();
  }

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
      ${BEREICHE.filter((b) => darf(b.id)).map((b) => `<a href="${b.id}/${QS}#/cockpit"><span class="nav-i ${b.icon}" aria-hidden="true"></span>${esc(b.titel)}</a>`).join("")}
      ${darf("personal") ? `<a href="personal/${QS}"><span class="nav-i i-konten" aria-hidden="true"></span>Personal</a>` : person.ebene !== "partner" ? `<a href="personal/karte.html${QS}"><span class="nav-i i-konten" aria-hidden="true"></span>Meine Personalkarte</a>` : ""}
      ${darf("fahrzeuge") ? `<a href="fahrzeuge/${QS}"><span class="nav-i i-einrichtung" aria-hidden="true"></span>Fahrzeuge</a>` : ""}${darf("werkzeuge") ? `<a href="lager/${QS}"><span class="nav-i i-werkzeug" aria-hidden="true"></span>Werkzeuge</a>` : ""}
      ${darf("betrieb") && ["buchhaltung", "bank", "monitor", "monat", "jahr", "abschluss"].some(darf) ? `<a href="betrieb/${QS}"><span class="nav-i i-kennzahlen" aria-hidden="true"></span>Betrieb</a>` : ""}`;
    const ini = (person.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    $("#ich").innerHTML = `<div class="ich"><span class="ich-k">${esc(ini)}</span><span><b>${esc(person.name)}</b><small>${esc({ geschaeftsfuehrung: "Geschäftsführung", planung: "Planung / Bearbeitung", monteur: "Monteur" }[person.ebene] || "")}</small></span></div>
      <div class="ich-aktionen">${R ? R.einstellungenKnopf("") : ""}<button class="btn klein hell" data-aktion="passwort">Passwort ändern</button><button class="btn klein hell" data-aktion="abmelden">Abmelden</button></div>
      ${DEMO ? '<p class="modus">Demo – Daten nur in diesem Browser</p>' : ""}`;
  }

  /* ---------- Start ---------- */
  let PERSON = null, AUSZUEGE = {};
  async function start() {
    PERSON = ich();
    if (!PERSON || PERSON.mussAendern) return zumLogin();
    if (PERSON.ebene === "partner") return location.replace("bad/" + QS);   // Partner arbeiten direkt in ihren Einsätzen
    if (PERSON.ebene === "mitarbeiter" || !darf("uebersicht")) { const s = R ? R.startseite() : null; return location.replace((s === null || s === "" ? "personal/karte.html" : s) + QS); }   // keine Übersicht → erste erlaubte Seite
    try { localStorage.setItem("bruell:bereich", "uebersicht"); } catch (e) { /* egal */ }
    leiste(PERSON);
    /* Sofort den zuletzt geladenen Stand zeigen (je Person), frische Auszüge ersetzen ihn, sobald sie da sind */
    const CACHE = "bruell:auszug-cache:" + PERSON.id + (DEMO ? ":demo" : ""), alt = lesen(CACHE, null);
    if (alt && alt.bad && alt.heizung) { AUSZUEGE = alt; zeichnen(); }
    /* nur Bereiche laden, die freigegeben sind (spart Zeit; ohne Freigabe keine Daten daraus) */
    const ohne = { fehler: "nicht freigegeben", aus: true };
    const [bad, heizung] = await Promise.all(BEREICHE.map((b) => (darf(b.id) ? auszugHolen(b.id) : Promise.resolve(ohne))));
    const genutzt = [bad, heizung].filter((a) => !a.aus);
    if (alt && alt.bad && alt.heizung && genutzt.length && genutzt.every((a) => a && a.fehler)) return;   // offline o. Ä.: alten Stand stehen lassen
    AUSZUEGE = { bad, heizung };
    if (genutzt.every((a) => !a.fehler)) schreiben(CACHE, AUSZUEGE);
    if (genutzt.length && genutzt.every((a) => a && a.fehler)) { $("#main").innerHTML = `<div class="seite"><div class="panel startfeld"><h2>Bereiche nicht erreichbar</h2><p>Bitte neu laden oder erneut anmelden.</p><button class="btn" data-aktion="abmelden">Neu anmelden</button></div></div>`; return; }
    zeichnen();
  }
  setInterval(() => { const u = $("#uhr"); if (u) { const d = new Date(); u.textContent = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`; } }, 5000);

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-aktion]"); if (!a) return;
    const akt = a.dataset.aktion;
    if (akt === "abmelden") return abmelden();
    if (akt === "passwort") return window.BruellPasswort && window.BruellPasswort.oeffnen();
    if (akt === "w-bearbeiten") { BEARBEITEN = !BEARBEITEN; return zeichnen(); }
    if (akt === "w-zuruecksetzen") { rasterSpeichern(PERSON, null); toast("Standard-Anordnung"); return zeichnen(); }
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
