/* Brüll Dashboard (Gesamt): Navigation Übersicht · Bad · Heizung in der linken Leiste der Bereiche.
   Wird beim Zusammenbau in beide Dashboards eingebunden – die Einzelversionen bleiben unverändert. */
(function () {
  if (window !== window.top) return;                       // Auszug-Rahmen der Übersicht: nichts tun
  const akt = document.currentScript && document.currentScript.dataset.bereich;
  const QS = location.search;
  const EINTRAEGE = [["", "Übersicht", "i-cockpit"], ["bad", "Bad", "i-projekte"], ["heizung", "Heizung", "i-projekte"]];
  /* Personal nur für die Geschäftsführung */
  try {
    const s = JSON.parse(sessionStorage.getItem("bruell:sitzung") || localStorage.getItem("bruell:sitzung") || "null");
    const k = s && (JSON.parse(localStorage.getItem("bruell:konten") || "[]")).find((x) => x.email === s);
    if (k && k.ebene === "geschaeftsfuehrung") EINTRAEGE.push(["personal", "Personal", "i-konten"], ["fahrzeuge", "Fahrzeuge", "i-einrichtung"], ["betrieb", "Betrieb", "i-kennzahlen"]);
  } catch (e) { /* ohne */ }
  function einbauen() {
    const rail = document.querySelector(".rail"), nav = rail && rail.querySelector(".nav");
    if (!nav || rail.querySelector(".bereich-nav")) return;
    const d = document.createElement("nav");
    d.className = "bereich-nav"; d.setAttribute("aria-label", "Bereiche");
    d.innerHTML = EINTRAEGE.map(([id, t, i]) => `<a href="../${id ? id + "/" : ""}${QS}" class="${id === akt ? "hier" : ""}"><span class="nav-i ${i}" aria-hidden="true"></span>${t}</a>`).join("")
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
  const los = () => { einbauen(); zurueckPruefen(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los); else los();
})();
