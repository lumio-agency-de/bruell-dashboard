/* ==========================================================================
   Brüll Dashboard – eigenes Passwort ändern (Übersicht, Personal, Fahrzeuge, Werkzeuge, Betrieb)
   --------------------------------------------------------------------------
   Aufruf: BruellPasswort.oeffnen()  → Dialog „Passwort ändern“ für das angemeldete Konto.
   Lokal (Demo/Test): Konto in bruell:konten, gleiches Verfahren wie bad/app/js/daten.js
   (Salz + SHA-256). Mac mini (gesamt/db.js aktiv): Supabase – altes Passwort prüfen, updateUser, passwort_geaendert.
   Fremde Passwörter setzt die Geschäftsführung in Bad → Konten zurück.
   ========================================================================== */
window.BruellPasswort = (function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lesen = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const token = () => [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
  async function pruefsumme(salz, pw) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salz + "|" + pw));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function sitzung() {
    let email = null;
    try { email = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (e) { /* egal */ }
    return email || lesen("bruell:sitzung", null);
  }

  async function aendern(alt, neu) {
    if (String(neu).length < 8) throw new Error("Das neue Passwort braucht mindestens 8 Zeichen.");
    if (alt === neu) throw new Error("Bitte ein anderes Passwort als das bisherige wählen.");
    const db = window.BruellDB;
    if (db) {                                                   // Mac mini: Passwort liegt in der Datenbank
      const email = sitzung(); if (!email) throw new Error("Nicht angemeldet – bitte neu anmelden.");
      const a = await db.sb.auth.signInWithPassword({ email, password: alt });
      if (a.error) throw new Error("Das aktuelle Passwort stimmt nicht.");
      const u = await db.sb.auth.updateUser({ password: neu });
      if (u.error) throw new Error(u.error.message);
      await db.sb.rpc("passwort_geaendert");
      const l = lesen("bruell:konten", []), k = l.find((x) => x.email === email); if (k) { k.mussAendern = false; localStorage.setItem("bruell:konten", JSON.stringify(l)); }
      return;
    }
    const email = sitzung(), l = lesen("bruell:konten", []), k = email && l.find((x) => x.email === email);
    if (!k) throw new Error("Nicht angemeldet – bitte neu anmelden.");
    if (k.hash !== (await pruefsumme(k.salz, alt))) throw new Error("Das aktuelle Passwort stimmt nicht.");
    k.salz = token(); k.hash = await pruefsumme(k.salz, neu); k.mussAendern = false;
    localStorage.setItem("bruell:konten", JSON.stringify(l));
  }

  function meldung(t) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.classList.add("an"); clearTimeout(meldung.t); meldung.t = setTimeout(() => el.classList.remove("an"), 2600);
  }

  function oeffnen() {
    const email = sitzung(), k = email && lesen("bruell:konten", []).find((x) => x.email === email);
    const alt = document.getElementById("pw-dlg"); if (alt) alt.remove();
    const dlg = document.createElement("dialog");
    dlg.id = "pw-dlg"; dlg.className = "dlg"; dlg.style.width = "min(460px, calc(100vw - 32px))";
    dlg.innerHTML = `<form id="pw-form"><div class="dlg-kopf"><div><p class="eyebrow">${esc(k ? k.name || k.benutzer : "")}</p><h2>Passwort ändern</h2></div><button class="btn still" type="button" data-zu aria-label="Schließen">✕</button></div>
      <div class="dlg-inhalt"><div class="felder">
        <div class="feld"><label for="pw-0">Aktuelles Passwort</label><input class="eingabe" id="pw-0" type="password" autocomplete="current-password" required></div>
        <div class="feld"><label for="pw-1">Neues Passwort (mind. 8 Zeichen)</label><input class="eingabe" id="pw-1" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="feld"><label for="pw-2">Neues Passwort wiederholen</label><input class="eingabe" id="pw-2" type="password" autocomplete="new-password" minlength="8" required></div>
      </div><p class="luecken versteckt" id="pw-f" role="alert"></p></div>
      <div class="dlg-fuss"><button class="btn" type="button" data-zu>Abbrechen</button><button class="btn jetzt" type="submit">Speichern</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-zu]")) dlg.close(); });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.querySelector("#pw-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = dlg.querySelector("#pw-f"), v = (id) => dlg.querySelector(id).value;
      const fehler = (t) => { f.textContent = t; f.classList.remove("versteckt"); };
      if (v("#pw-1") !== v("#pw-2")) return fehler("Die beiden neuen Passwörter stimmen nicht überein.");
      try { await aendern(v("#pw-0"), v("#pw-1")); dlg.close(); meldung("Passwort geändert"); }
      catch (err) { fehler(err.message || String(err)); }
    });
    dlg.showModal();
    dlg.querySelector("#pw-0").focus();
  }

  return { oeffnen };
})();
