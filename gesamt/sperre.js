/* ==========================================================================
   Brüll Dashboard – Schreibschutz für die Gesamt-Seiten (nur Mac mini / Datenbank, nur Admins)
   --------------------------------------------------------------------------
   Immer nur eine Person bearbeitet gleichzeitig (Admins; Personalkarten auch mit „Personal bearbeiten“) – wie bei den Projekten in Bad/Heizung
   (gleiche Funktionen sperre_holen / sperre_freigeben, Tabelle „sperren“, 90 s ohne Lebenszeichen = frei).
     Personalkarte <Nr>    → gesamt:personal:<Nr>; erst beim Anfassen der Werkzeuge auf der Karte auch gesamt:werkzeuge
                             (belegt → nur die Werkzeuge auf der Karte nur lesen)
     Fahrzeugkarte <Nr>    → gesamt:fahrzeug:<Nr>
     Werkzeuge             → gesamt:werkzeuge
     Lohn                  → gesamt:lohn
     Bank / Buchhaltung    → gesamt:buchhaltung
     Betriebsmonitor       → gesamt:monitor
   Ist etwas belegt: Seite lädt neu im Nur-Lesen-Modus (window.BRUELL_GESPERRT, html.nur-lesen) mit Hinweis
   „… bearbeitet gerade“; alle 15 s wird nachgesehen, sobald frei → wieder bearbeitbar. gesamt/db.js lädt im
   Nur-Lesen-Modus nichts hoch. Nach 10 Minuten ohne Eingabe wird die Seite freigegeben (kein Lebenszeichen mehr).
   Laden nach db.js und vor personal.js.
   ========================================================================== */
(function () {
  "use strict";
  const DB = window.BruellDB;
  if (!DB) return;
  const ich = DB.ich && DB.ich();
  const ADMIN = !!ich && ich.ebene === "geschaeftsfuehrung";
  const PB = !ADMIN && !!(window.BruellRechte && window.BruellRechte.personalBearbeiten && window.BruellRechte.personalBearbeiten());
  if (!ADMIN && !PB) return;                                          // ändern dürfen hier nur Admins (Personalkarten auch „Personal bearbeiten“)

  const P = location.pathname, nr = (new URLSearchParams(location.search).get("nr") || "").replace(/\D/g, "");
  const RES = (/\/personal\/karte\.html$/.test(P) ? (nr ? ["personal:" + nr] : [])
    : /\/personal\/lohn\.html$/.test(P) ? ["lohn"]
    : /\/fahrzeuge\/karte\.html$/.test(P) ? (nr ? ["fahrzeug:" + nr] : [])
    : /\/lager\/(index\.html)?$/.test(P) ? ["werkzeuge"]
    : /\/betrieb\/(bank|bank-sparkasse|bank-raiba|buchhaltung)\.html$/.test(P) ? ["buchhaltung"]
    : /\/betrieb\/(index\.html)?$/.test(P) ? ["monitor"]
    : []).map((r) => "gesamt:" + r);
  if (!RES.length || (!ADMIN && !RES.every((r) => r.startsWith("gesamt:personal:")))) return;
  const OPT = ADMIN && /\/personal\/karte\.html$/.test(P) ? ["gesamt:werkzeuge"] : [];   // nur „wenn frei“ (Werkzeuge ändern nur Admins)

  const MERK = "bruell:gesperrt:" + RES.join("|"), sb = DB.sb, name = ich.name || ich.benutzer || "";
  let belegt = null;
  try { belegt = JSON.parse(sessionStorage.getItem(MERK) || "null"); } catch (e) { /* egal */ }
  if (belegt) { window.BRUELL_GESPERRT = belegt; document.documentElement.classList.add("nur-lesen", "gesperrt"); }

  /* alle Ressourcen holen; ist eine belegt → schon geholte wieder freigeben */
  async function holen(erzwingen) {
    const geholt = [];
    for (const r of RES) {
      const { data, error } = await sb.rpc("sperre_holen", { p_ressource: r, p_name: name, p_erzwingen: !!erzwingen });
      if (error) throw error;
      if (!data || !data.frei) { for (const g of geholt) sb.rpc("sperre_freigeben", { p_ressource: g }); return data || { frei: false }; }
      geholt.push(r);
    }
    return { frei: true };
  }
  const neuLaden = () => location.reload();

  /* ---------- Hinweis im Nur-Lesen-Modus ---------- */
  function hinweis() {
    const ziel = document.querySelector("#main .seite") || document.querySelector("#main"); if (!ziel || document.getElementById("sperre-hinweis")) return;
    const seit = belegt.seit ? new Date(belegt.seit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";
    const box = document.createElement("section");
    box.id = "sperre-hinweis"; box.className = "panel"; box.setAttribute("role", "status");
    box.style.cssText = "margin:0 0 18px;padding:14px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;border-left:4px solid var(--orange, #e8892b)";
    box.innerHTML = `<span style="flex:1 1 280px"><b>🔒 ${esc(belegt.name || belegt.wer || "Jemand")} bearbeitet das gerade${seit ? " (seit " + seit + " Uhr)" : ""}.</b><br>
      <small class="leise">Du siehst alles, kannst aber nichts ändern. Sobald die Seite frei ist, wird sie hier automatisch bearbeitbar.</small></span>
      <button type="button" class="btn still" data-sperre-uebernehmen>Trotzdem übernehmen</button>`;
    box.querySelector("[data-sperre-uebernehmen]").addEventListener("click", async () => {
      if (!confirm(`${belegt.name || "Die andere Person"} bearbeitet gerade. Wirklich übernehmen? Ihre Seite wechselt dann auf „nur lesen“.`)) return;
      try { const r = await holen(true); if (r.frei) { sessionStorage.removeItem(MERK); neuLaden(); } } catch (e) { alert(e.message || e); }
    });
    ziel.prepend(box);
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /* Felder sperren, die die Seite selbst nicht sperrt (z. B. Betriebsmonitor) */
  function felderSperren() {
    document.querySelectorAll("#main input:not([type=search]):not([type=hidden]), #main textarea, #main select:not([data-filter])").forEach((el) => { if (!el.closest("#sperre-hinweis")) el.disabled = true; });
  }

  if (belegt) {
    const los = () => { hinweis(); felderSperren(); new MutationObserver(() => { hinweis(); felderSperren(); }).observe(document.getElementById("main") || document.body, { childList: true, subtree: true }); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los); else los();
    /* alle 15 s nachsehen; frei → mit Schreibschutz für mich neu laden */
    DB.fertig.then(() => setInterval(async () => {
      try { const r = await holen(false); if (r.frei) { sessionStorage.removeItem(MERK); neuLaden(); } } catch (e) { /* später nochmal */ }
    }, 15000));
    return;
  }

  /* ---------- Ich bearbeite: holen, Lebenszeichen alle 30 s, nach 10 min Ruhe loslassen ---------- */
  let zuletzt = Date.now(), ruhend = false, token = "", optFrei = [];
  /* zusätzliche Bereiche (Werkzeuge auf der Personalkarte): belegt → nur dieser Teil nur lesen (Ereignis an werkzeug.js) */
  async function optHolen(nurGehaltene) {
    for (const r of nurGehaltene ? optFrei.slice() : OPT) {
      const { data, error } = await sb.rpc("sperre_holen", { p_ressource: r, p_name: name, p_erzwingen: false });
      if (error) continue;
      const frei = !!(data && data.frei), war = optFrei.includes(r);
      if (frei && !war) optFrei.push(r);
      if (!frei && (war || !window.BRUELL_WZ_GESPERRT)) {
        optFrei = optFrei.filter((x) => x !== r);
        window.BRUELL_WZ_GESPERRT = { wer: data && data.wer, name: data && data.name };
        document.dispatchEvent(new CustomEvent("bruell:teil-gesperrt", { detail: { ressource: r, ...window.BRUELL_WZ_GESPERRT } }));
      }
    }
  }
  const aktiv = () => {
    zuletzt = Date.now();
    if (ruhend) { ruhend = false; holen(false).then((r) => { if (!r.frei) verloren(r); else optHolen(true); }).catch(() => {}); }
  };
  ["input", "change", "keydown", "pointerdown"].forEach((t) => document.addEventListener(t, aktiv, true));
  function verloren(r) { sessionStorage.setItem(MERK, JSON.stringify({ wer: r.wer, name: r.name, seit: r.seit })); neuLaden(); }

  DB.fertig.then(async (st) => {
    if (!st || !st.angemeldet) return;
    try { const s = await sb.auth.getSession(); token = (s.data.session && s.data.session.access_token) || ""; } catch (e) { /* egal */ }
    try { const r = await holen(false); if (!r.frei) return verloren(r); } catch (e) { console.warn("Schreibschutz:", e); return; }
    /* Werkzeuge auf der Karte: erst holen, wenn jemand dort etwas anfasst */
    if (OPT.length) ["pointerdown", "focusin"].forEach((t) => document.addEventListener(t, (e) => {
      if (!optFrei.length && !window.BRUELL_WZ_GESPERRT && e.target.closest && e.target.closest("#wzBereich")) optHolen();
    }, true));
    setInterval(async () => {
      if (Date.now() - zuletzt > 6e5) { ruhend = true; return; }      // 10 min nichts getan → läuft nach 90 s ab
      try { const r = await holen(false); if (!r.frei) return verloren(r); await optHolen(true); } catch (e) { /* Netz kurz weg */ }
    }, 30000);
  });
  /* beim Verlassen sofort freigeben (keepalive, damit es auch beim Seitenwechsel ankommt) */
  window.addEventListener("pagehide", () => {
    if (!token || ruhend) return;
    const K = window.BRUELL_CLOUD;
    for (const r of [...RES, ...optFrei]) fetch(K.url + "/rest/v1/rpc/sperre_freigeben", { method: "POST", keepalive: true,
      headers: { apikey: K.anonKey, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ p_ressource: r }) }).catch(() => {});
  });
})();
