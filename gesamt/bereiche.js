/* Brüll Dashboard (Gesamt): Bereichs-Umschalter Bad | Heizung in der linken Leiste.
   Wird beim Zusammenbau in beide Dashboards eingebunden – die Einzelversionen bleiben unverändert. */
(function () {
  const BEREICHE = [["bad", "Bad"], ["heizung", "Heizung"]];
  const akt = document.currentScript && document.currentScript.dataset.bereich;
  try { localStorage.setItem("bruell:bereich", akt); } catch (e) { /* egal */ }
  function einbauen() {
    const rail = document.querySelector(".rail"), marke = rail && rail.querySelector(".marke");
    if (!marke || rail.querySelector(".bereich-wahl")) return;
    const d = document.createElement("nav");
    d.className = "bereich-wahl"; d.setAttribute("aria-label", "Bereich");
    d.innerHTML = BEREICHE.map(([id, t]) => `<a href="../${id}/${location.search}" class="${id === akt ? "an" : ""}"${id === akt ? ' aria-current="page"' : ""}>${t}</a>`).join("");
    marke.after(d);
    document.title = document.title.replace(/^(Bad|Heizungs)-Dashboard/, "Brüll Dashboard · " + (akt === "bad" ? "Bad" : "Heizung"));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", einbauen); else einbauen();
})();
