/* ==========================================================================
   Brüll Dashboard – verschlüsselte Daten (Fahrzeuge + Mitarbeiterfotos)
   personal/daten-tresor.js liegt öffentlich, ist aber AES-verschlüsselt (werkzeuge/tresor.js).
   Nach Eingabe des Datenpasswortes wird im Browser entschlüsselt und für diese Sitzung
   (oder auf Wunsch auf diesem Gerät) gemerkt. Lokal mit daten-lokal.js passiert hier nichts.
   Muss VOR personal.js / uebersicht.js geladen werden (setzt window.FZ_VOLL, PK_FOTOS, DATEN_STAND).
   ========================================================================== */
(function () {
  "use strict";
  const T = window.DATEN_TRESOR;
  if (!T || window.FZ_VOLL) return;              // keine Tresor-Datei oder echte lokale Daten vorhanden
  const KEY = "bruell:tresor";
  const holen = () => { try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { return null; } };
  const weg = () => { try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* egal */ } };

  /* 1) schon entsperrt → sofort (synchron) bereitstellen */
  const txt = holen();
  if (txt) {
    try {
      const d = JSON.parse(txt);
      if (d.stand === T.stand) {
        window.FZ_VOLL = d.FZ_VOLL; window.PK_FOTOS = d.PK_FOTOS; window.DATEN_STAND = d.DATEN_STAND;
        window.TRESOR_SPERREN = () => { weg(); location.reload(); };
        return;
      }
    } catch (e) { /* kaputt → neu entsperren */ }
    weg();                                       // alter Stand → neu entsperren
  }

  /* 2) Entsperren nur auf den Personal- und Fahrzeugseiten anbieten */
  if (!/\/(personal|fahrzeuge)\//.test(location.pathname)) return;
  const ab = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  async function entschluesseln(pw) {
    const basis = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: ab(T.salt), iterations: T.iter, hash: "SHA-256" }, basis, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(T.iv) }, key, ab(T.daten)));
  }
  function leiste() {
    const ziel = document.querySelector("main") || document.body;   // nicht in .seite – die wird neu gezeichnet
    const f = document.createElement("form");
    f.className = "tresor";
    f.innerHTML = `<div class="tresor-text"><strong>🔒 Fahrzeugdaten &amp; Mitarbeiterfotos sind verschlüsselt</strong>
        <span class="leise">Mit dem Datenpasswort entsperren – es wird nur in diesem Browser entschlüsselt.</span></div>
      <div class="tresor-eingabe">
        <input class="eingabe" type="password" name="pw" autocomplete="current-password" placeholder="Datenpasswort" aria-label="Datenpasswort" required>
        <button class="btn jetzt" type="submit">Entsperren</button>
        <label class="tresor-merken"><input type="checkbox" name="merken"> auf diesem Gerät merken</label>
      </div>
      <p class="tresor-fehler" aria-live="polite"></p>`;
    ziel.prepend(f);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const knopf = f.querySelector("button"), fehler = f.querySelector(".tresor-fehler");
      knopf.disabled = true; knopf.textContent = "Entsperre …"; fehler.textContent = "";
      try {
        const d = JSON.parse(await entschluesseln(f.pw.value));
        d.stand = T.stand;
        const s = JSON.stringify(d);
        try { (f.merken.checked ? localStorage : sessionStorage).setItem(KEY, s); }
        catch (x) { sessionStorage.setItem(KEY, s); }
        location.reload();
      } catch (x) {
        fehler.textContent = "Das Passwort stimmt nicht.";
        knopf.disabled = false; knopf.textContent = "Entsperren"; f.pw.select();
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(leiste)); else setTimeout(leiste);
})();
