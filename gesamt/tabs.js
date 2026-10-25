/* Brüll Dashboard (Gesamt) – Tab-Leiste unten fürs Handy (Übersicht · Bad · Heizung · Personal · Fahrzeuge).
   Eigenes Element direkt im <body> (nicht in der wischbaren Kopfleiste – dort verschwindet ein fester
   Balken in Safari auf dem iPhone). Die Einträge kommen aus dem Menü der Seite und folgen ihm bei Änderungen.
   Außerdem führt das Logo in Bad/Heizung zurück zur Übersicht. Aussehen: gesamt/mobil.css */
(function () {
  "use strict";
  if (window !== window.top) return;                       // Auszug-Rahmen der Übersicht
  const QS = location.search;
  function bauen() {
    const quelle = document.querySelector(".rail .bereich-nav") || document.querySelector("body.oben-leiste .rail > .nav, body.personal-seite .rail > .nav");
    const marke = document.querySelector(".rail .bereich-nav") && document.querySelector(".rail .marke");
    if (marke && marke.getAttribute("href") !== "../" + QS) { marke.setAttribute("href", "../" + QS); marke.title = "Zur Übersicht"; }
    if (!quelle) return;
    const links = [...quelle.querySelectorAll("a")];
    const an = (a) => a.classList.contains("hier") || a.getAttribute("aria-current") === "page";
    const sig = links.map((a) => a.getAttribute("href") + (an(a) ? "*" : "")).join("|");
    let t = document.querySelector(".tabbar-mobil");
    if (t && t.dataset.sig === sig) return;
    if (!t) { t = document.createElement("nav"); t.className = "tabbar-mobil"; t.setAttribute("aria-label", "Bereiche"); document.body.appendChild(t); }
    t.dataset.sig = sig;
    t.innerHTML = links.map((a) => `<a href="${a.getAttribute("href")}"${an(a) ? ' aria-current="page"' : ""}><span class="nav-i" aria-hidden="true"></span>${a.textContent.trim()}</a>`).join("");
  }
  const los = () => { bauen(); new MutationObserver(bauen).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los); else los();
})();
