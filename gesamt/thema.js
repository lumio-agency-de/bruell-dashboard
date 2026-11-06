/* Brüll Dashboard – Hell/Dunkel. Läuft im <head> (kein Aufblitzen), merkt sich die Wahl für alle Seiten. */
(function () {
  "use strict";
  const KEY = "bruell:thema";
  let t = "hell"; try { t = localStorage.getItem(KEY) || "hell"; } catch (e) { /* egal */ }
  const setzen = (w) => { document.documentElement.dataset.thema = w; };
  setzen(t);
  if (window !== window.top) return;                       // Auszug-Rahmen der Übersicht: kein Knopf

  /* App-Symbol + Installieren (Schreibtisch, Dock, Startmenü, Home-Bildschirm): auf jeder Seite dieselbe App
     (manifest.webmanifest in der Dashboard-Wurzel, Symbole in gesamt/icons/) – Wurzel aus dem Pfad dieser Datei */
  const wurzel = ((document.currentScript && document.currentScript.src) || "").replace(/gesamt\/thema\.js.*$/, "");
  if (wurzel && !document.querySelector('link[rel="manifest"]')) {
    const kopf = (tag, attr) => { const el = document.createElement(tag); Object.entries(attr).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); };
    kopf("link", { rel: "manifest", href: wurzel + "manifest.webmanifest" });
    kopf("link", { rel: "apple-touch-icon", href: wurzel + "gesamt/icons/apple-touch-icon.png" });
    kopf("meta", { name: "apple-mobile-web-app-title", content: "Brüll" });
    kopf("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    kopf("meta", { name: "mobile-web-app-capable", content: "yes" });
  }
  function knopf() {
    if (document.querySelector(".thema-knopf")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "thema-knopf";
    const beschriften = () => { const d = document.documentElement.dataset.thema === "dunkel"; b.title = b.ariaLabel = d ? "Helle Ansicht" : "Dunkle Ansicht"; b.setAttribute("aria-pressed", d); };
    b.innerHTML = '<svg class="mond" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
      + '<svg class="sonne" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>';
    beschriften();
    b.addEventListener("click", () => {
      const neu = document.documentElement.dataset.thema === "dunkel" ? "hell" : "dunkel";
      setzen(neu); beschriften();
      try { localStorage.setItem(KEY, neu); } catch (e) { /* egal */ }
    });
    document.body.appendChild(b);
  }
  /* Andere Tabs/Seiten ziehen mit */
  window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { setzen(e.newValue); const b = document.querySelector(".thema-knopf"); if (b) b.setAttribute("aria-pressed", e.newValue === "dunkel"); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", knopf); else knopf();

  /* Schneller Seitenwechsel: Menü-Ziele werden beim Zeigen mit der Maus (bzw. beim Antippen) vorab geladen.
     Gesamt-Seiten fertig vorbereitet (prerender); Bad/Heizung nur abgerufen, damit dort nichts
     „im Hintergrund“ startet (z. B. Schreibschutz eines Projekts). Browser ohne Unterstützung ignorieren das. */
  if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) {
    /* Muster als Objekt: Abfrage (?demo=1) und Anker (#/…) sind dann automatisch beliebig */
    const app = { href_matches: { pathname: "(.*)/(bad|heizung)/(.*)" } };
    const aus = [{ href_matches: { pathname: "(.*)/kunde.html" } }, { selector_matches: "[data-kein-vorladen]" }];
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify({
      prerender: [{ where: { and: [{ href_matches: { pathname: "/*" } }, { not: app }, ...aus.map((a) => ({ not: a }))] }, eagerness: "moderate" }],
      prefetch: [{ where: { and: [app, ...aus.map((a) => ({ not: a }))] }, eagerness: "moderate" }],
    });
    document.head.appendChild(s);
  }
})();

/* ==========================================================================
   Rechte: welche Menüpunkte (Bereiche) das angemeldete Konto sieht. Hier, weil thema.js auf JEDER Seite
   läuft (auch Bad/Heizung). Admin = Geschäftsführung: alles, und nur er ändert in den Gesamt-Bereichen –
   Ausnahme Personal: mit „Personal bearbeiten“ ändern auch andere die Personalkarten.
   Konto.bereiche (Konten-Seite) – sonst Standard je Ebene. Die Datenbank prüft dasselbe (supabase/rechte.sql).
   ========================================================================== */
window.BruellRechte = (function () {
  "use strict";
  /* Schlüssel, Name, Adresse ab Dashboard-Wurzel, Symbol, übergeordneter Punkt */
  const BEREICHE = [
    ["uebersicht", "Übersicht", "", "i-cockpit"], ["bad", "Bad", "bad/", "i-projekte"], ["heizung", "Heizung", "heizung/", "i-projekte"],
    ["personal", "Personal", "personal/", "i-konten"], ["personal_bearbeiten", "Personal bearbeiten", "", "i-konten", "personal"], ["lohn", "Lohnabrechnung", "personal/lohn.html", "i-lohn", "personal"],
    ["fahrzeuge", "Fahrzeuge", "fahrzeuge/", "i-einrichtung"], ["werkzeuge", "Werkzeuge", "lager/", "i-werkzeug"],
    ["betrieb", "Betrieb", "betrieb/", "i-kennzahlen"], ["buchhaltung", "Buchhaltung", "betrieb/buchhaltung.html", "i-unter", "betrieb"],
    ["bank", "Bank", "betrieb/bank.html", "i-unter", "betrieb"], ["monitor", "Betriebsmonitor", "betrieb/", "i-unter", "betrieb"],
    ["monat", "Auswertung Monat", "betrieb/monat.html", "i-unter", "betrieb"], ["jahr", "Auswertung Jahr", "betrieb/jahr.html", "i-unter", "betrieb"],
    ["abschluss", "Jahresabschluss", "betrieb/abschluss.html", "i-unter", "betrieb"],
  ].map(([key, titel, pfad, icon, eltern]) => ({ key, titel, pfad, icon, eltern: eltern || "" }));
  const STANDARD = {
    geschaeftsfuehrung: BEREICHE.map((b) => b.key),
    planung: ["uebersicht", "bad", "heizung"], monteur: ["uebersicht", "bad", "heizung"], partner: ["bad"], mitarbeiter: [],
  };
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  function konto() {
    try {
      const e = JSON.parse(sessionStorage.getItem("bruell:sitzung") || localStorage.getItem("bruell:sitzung") || "null");
      return (e && lesen("bruell:konten", []).find((k) => k.email === e && k.aktiv !== false)) || null;
    } catch (e) { return null; }
  }
  const admin = (k = konto()) => !!k && k.ebene === "geschaeftsfuehrung";
  const wirksam = (k = konto()) => !k ? [] : admin(k) ? STANDARD.geschaeftsfuehrung : Array.isArray(k.bereiche) ? k.bereiche : (STANDARD[k.ebene] || []);
  /* Unterpunkt nur mit übergeordnetem Punkt (Betrieb → Buchhaltung …); Lohnabrechnung auch einzeln */
  function darf(key, k = konto()) {
    const l = wirksam(k), b = BEREICHE.find((x) => x.key === key);
    if (!b || !l.includes(key)) return false;
    if (key === "personal_bearbeiten") return l.includes("personal");          // Stufe zu „Personal“, allein wirkungslos
    return !b.eltern || b.eltern === "personal" || l.includes(b.eltern);
  }
  /* Personalkarten ändern/anlegen/löschen: Admin oder Freigabe „Personal“ + „bearbeiten“ (z. B. Personalbüro) */
  const personalBearbeiten = (k = konto()) => admin(k) || darf("personal_bearbeiten", k);
  /* Bereich der aktuellen Seite (Pfad ab Dashboard-Wurzel) */
  function bereichVon(pfad) {
    const p = String(pfad || "").replace(/^\/+/, "").replace(/index\.html$/, "");
    if (/^konten\//.test(p)) return "konten";
    if (/^personal\/karte\.html/.test(p)) return "karte";
    if (/^betrieb\/bank/.test(p)) return "bank";
    const treffer = BEREICHE.filter((b) => b.pfad && p.startsWith(b.pfad)).sort((a, b) => b.pfad.length - a.pfad.length)[0];
    if (treffer && treffer.key === "betrieb") return p === "betrieb/" ? "monitor" : "betrieb";
    return treffer ? treffer.key : "uebersicht";
  }
  /* ⚙ Einstellungen (nur Admin) – Knopf neben „Passwort ändern“; wurzel = Weg zur Dashboard-Wurzel ("" / "../") */
  const ZAHNRAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';
  const einstellungenKnopf = (wurzel = "", aktiv = false) => admin()
    ? `<a class="btn klein hell einst-knopf${aktiv ? " aktiv" : ""}" href="${wurzel}konten/${location.search.replace(/[?&]nr=[^&]*/, "").replace(/^&/, "?")}" title="Einstellungen" aria-label="Einstellungen"${aktiv ? ' aria-current="page"' : ""}>${ZAHNRAD}</a>` : "";
  /* Erste erlaubte Seite (Pfad ab Dashboard-Wurzel): Übersicht → erster freigegebener Bereich → eigene Personalkarte; null = nichts */
  function startseite(k = konto()) {
    if (!k) return null;
    if (darf("uebersicht", k) || admin(k)) return "";
    for (const b of BEREICHE) if (b.pfad && b.key !== "betrieb" && darf(b.key, k)) return b.pfad;
    return k.pk ? "personal/karte.html?nr=" + encodeURIComponent(k.pk) : null;
  }
  return { BEREICHE, STANDARD, konto, admin, wirksam, darf, personalBearbeiten, bereichVon, einstellungenKnopf, startseite };
})();
