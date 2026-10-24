/* Brüll Dashboard – Hell/Dunkel. Läuft im <head> (kein Aufblitzen), merkt sich die Wahl für alle Seiten. */
(function () {
  "use strict";
  const KEY = "bruell:thema";
  let t = "hell"; try { t = localStorage.getItem(KEY) || "hell"; } catch (e) { /* egal */ }
  const setzen = (w) => { document.documentElement.dataset.thema = w; };
  setzen(t);
  if (window !== window.top) return;                       // Auszug-Rahmen der Übersicht: kein Knopf
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
})();
