/* Brüll Dashboard (Gesamt): Navigation Übersicht · Bad · Heizung in der linken Leiste der Bereiche.
   Wird beim Zusammenbau in beide Dashboards eingebunden – die Einzelversionen bleiben unverändert. */
(function () {
  if (window !== window.top) return;                       // Auszug-Rahmen der Übersicht: nichts tun
  const akt = document.currentScript && document.currentScript.dataset.bereich;
  const QS = location.search;
  const EINTRAEGE = [["", "Übersicht", "i-cockpit"], ["bad", "Bad", "i-projekte"], ["heizung", "Heizung", "i-projekte"]];
  /* Personal nur für die Geschäftsführung; alle anderen sehen ihre eigene Personalkarte (nur lesen).
     Konten der Ebene „mitarbeiter“ haben nur die Personalkarte → direkt dorthin. */
  const konto = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem("bruell:sitzung") || localStorage.getItem("bruell:sitzung") || "null");
      return s && (JSON.parse(localStorage.getItem("bruell:konten") || "[]")).find((x) => x.email === s && x.aktiv !== false);
    } catch (e) { return null; }
  };
  /* Demo (?demo=1): Test-Zugang „mitarbeiter“ / „demo1234“ – nur lesen, eigene Personalkarte.
     Verknüpft mit dem ersten Mitarbeiter (ohne Inhaber), der noch keinen eigenen Zugang hat. */
  if (/[?&]demo\b/.test(QS)) (async () => {
    try {
      const konten = JSON.parse(localStorage.getItem("bruell:konten") || "[]");
      if (konten.some((k) => k.benutzer === "mitarbeiter")) return;
      const norm = (t) => String(t || "").trim().toLowerCase();
      const pks = Object.keys(localStorage).filter((x) => /^pk_\d+$/.test(x)).map((x) => ({ nr: x.slice(3), d: JSON.parse(localStorage.getItem(x) || "{}") }))
        .filter((x) => x.nr !== "1" && x.d.vorname && !x.d.austritt).sort((a, b) => +a.nr - +b.nr);
      const frei = pks.find((x) => !konten.some((k) => String(k.pk || "") === x.nr || (k.id && norm(k.id) === norm(x.d.kuerzel)) || norm(k.name) === norm(x.d.vorname + " " + x.d.nachname)));
      if (!frei) return;
      const salz = "demo-mitarbeiter", d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salz + "|demo1234"));
      konten.push({ email: "mitarbeiter@konto.bad-dashboard.de", benutzer: "mitarbeiter", id: "pk-" + frei.nr, pk: frei.nr, ebene: "mitarbeiter",
        name: (frei.d.vorname + " " + (frei.d.nachname || "")).trim(), formulare: [], salz, hash: [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""), aktiv: true, mussAendern: false });
      localStorage.setItem("bruell:konten", JSON.stringify(konten));
    } catch (e) { /* ohne */ }
  })();
  /* Menü nach Rechten (gesamt/thema.js → BruellRechte; Konten-Seite) */
  const R = window.BruellRechte, k0 = konto();
  const darf = (b, k) => !!R && !!k && (R.admin(k) || R.darf(b, k));
  if (k0) {
    for (let i = EINTRAEGE.length - 1; i >= 0; i--) if (!darf(EINTRAEGE[i][0] || "uebersicht", k0)) EINTRAEGE.splice(i, 1);
    if (darf("personal", k0)) EINTRAEGE.push(["personal", "Personal", "i-konten"]);
    else if (k0.ebene !== "partner") EINTRAEGE.push(["personal/karte.html", "Meine Personalkarte", "i-konten"]);
    if (darf("fahrzeuge", k0)) EINTRAEGE.push(["fahrzeuge", "Fahrzeuge", "i-einrichtung"]);
    if (darf("werkzeuge", k0)) EINTRAEGE.push(["lager", "Werkzeuge", "i-werkzeug"]);
    if (darf("betrieb", k0) && ["buchhaltung", "bank", "monitor", "monat", "jahr", "abschluss"].some((b) => darf(b, k0))) EINTRAEGE.push(["betrieb", "Betrieb", "i-kennzahlen"]);
  }
  /* Bereich nicht freigegeben (oder Konto nur mit eigener Personalkarte) → Übersicht bzw. eigene Karte */
  function mitarbeiterWeiter() {
    const k = konto();
    if (!k || k.mussAendern || (document.body && document.body.classList.contains("vorraum"))) return false;
    if (k.ebene === "mitarbeiter" || !darf(akt, k)) { const s = R ? R.startseite(k) : null; location.replace("../" + (s === null ? "personal/karte.html" : s) + QS); return true; }
    return false;
  }
  if (mitarbeiterWeiter()) return;
  function einbauen() {
    const rail = document.querySelector(".rail"), nav = rail && rail.querySelector(".nav");
    if (!nav || rail.querySelector(".bereich-nav")) return;
    const d = document.createElement("nav");
    d.className = "bereich-nav"; d.setAttribute("aria-label", "Bereiche");
    d.innerHTML = EINTRAEGE.map(([id, t, i]) => `<a href="../${id ? id + (id.includes(".") ? "" : "/") : ""}${QS}" class="${id === akt ? "hier" : ""}"><span class="nav-i ${i}" aria-hidden="true"></span>${t}</a>`).join("")
      + `<p class="bereich-titel">${akt === "bad" ? "Bad" : "Heizung"}</p>`;
    nav.before(d);
  }
  /* Nach der Anmeldung zurück zur Übersicht, wenn man von dort kam */
  function zurueckPruefen() {
    let z = null; try { z = sessionStorage.getItem("bruell:zurueck"); } catch (e) { /* egal */ }
    if (!z) return;
    const ob = new MutationObserver(() => {
      if (!document.body.classList.contains("vorraum") && document.querySelector(".ich")) {
        ob.disconnect(); try { sessionStorage.removeItem("bruell:zurueck"); } catch (e) { /* egal */ }
        location.replace("../" + QS);
      }
    });
    ob.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }
  /* Nach der Anmeldung (ohne Neuladen) Mitarbeiter-Konten zur eigenen Personalkarte schicken */
  function mitarbeiterBeobachten() {
    const ob = new MutationObserver(() => { if (document.querySelector(".ich") && mitarbeiterWeiter()) ob.disconnect(); });
    ob.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }
  /* ⚙ Einstellungen (nur Admin) in die Ich-Leiste von Bad/Heizung – die zeichnet app.js, deshalb beobachten */
  function zahnradEinbauen() {
    const setzen = () => { const a = document.querySelector(".rail .ich-aktionen"); if (a && !a.querySelector(".einst-knopf") && R) a.insertAdjacentHTML("afterbegin", R.einstellungenKnopf("../")); };
    setzen(); new MutationObserver(setzen).observe(document.body, { subtree: true, childList: true });
  }
  const los = () => { einbauen(); zurueckPruefen(); mitarbeiterBeobachten(); zahnradEinbauen(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los); else los();
})();
