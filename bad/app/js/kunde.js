/* Kundenportal: Der Kunde lädt über seinen persönlichen Link Fotos und
   Unterlagen hoch. Er sieht nur Firmenname, seine Anrede und was er selbst
   hochgeladen hat – keine Projektdaten. */

(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const token = location.hash.replace(/^#\/?/, "").trim();
  const main = $("#portal");
  let info = null;

  function toast(text, fehler) {
    const t = $("#toast");
    t.textContent = text; t.className = "toast an" + (fehler ? " fehler" : "");
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 3000);
  }

  function firma() {
    const f = { ...window.FIRMA, ...((info && info.firma) || {}) };
    f.adresse = { ...window.FIRMA.adresse, ...(f.adresse || {}) };
    f.farben = { ...window.FIRMA.farben, ...(f.farben || {}) };
    return f;
  }

  /* Welche Ordner bietet das Portal in diesem Level an? */
  function kategorien(phase) {
    const phasen = [...window.ABLAUF].sort((a, b) => a.nr - b.nr);
    let quelle = [...phasen].reverse().find((p) => p.nr <= phase && p.portal);
    if (!quelle) quelle = phasen.find((p) => p.portal);
    const ids = [...new Set([...(quelle ? quelle.portal : []), "sonstiges"])];
    return ids.map((id) => window.KATEGORIEN.find((k) => k.id === id)).filter(Boolean);
  }

  function anrede() {
    const n = info.nachname || "";
    return { "Herr": `Guten Tag Herr ${n}`, "Frau": `Guten Tag Frau ${n}`, "Herr und Frau": `Guten Tag Frau und Herr ${n}`, "Familie": `Guten Tag Familie ${n}` }[info.anrede] || "Guten Tag";
  }

  function render() {
    const f = firma();
    document.documentElement.style.setProperty("--tinte", f.farben.tinte);
    document.documentElement.style.setProperty("--akzent", f.farben.akzent);
    document.title = `Unterlagen hochladen · ${f.name}`;
    const hoch = info.hochgeladen || [];
    main.innerHTML = `
      <header class="portal-kopf"><img src="${esc(f.logo)}" alt="" class="portal-logo"><div><strong>${esc(f.name)}</strong><span>${esc(f.bereich || "")}</span></div></header>
      <section class="portal-intro">
        <h1>${esc(anrede())},</h1>
        <p>hier können Sie uns Fotos und Unterlagen für Ihr neues Bad schicken – direkt vom Handy oder Computer, ohne Anmeldung. Alles landet sicher bei uns im Projekt.</p>
      </section>
      ${kategorien(info.phase).map((k) => {
        const l = hoch.filter((d) => d.kategorie === k.id);
        return `<section class="portal-karte${l.length ? " hat" : ""}" data-kat="${esc(k.id)}">
          <div class="pk-kopf"><span class="pk-status" aria-hidden="true">${l.length ? "✓" : ""}</span><div><h2>${esc(k.kundeTitel || k.titel)}</h2><p>${esc(k.hinweis || "")}</p></div></div>
          ${l.length ? `<ul class="pk-liste">${l.map((d) => `<li>${esc(d.name)}</li>`).join("")}</ul>` : ""}
          <ul class="pk-laufend"></ul>
          <label class="btn ${l.length ? "" : "voll"} gross pk-knopf"><input type="file" multiple accept="image/*,application/pdf,.heic,.heif" data-kat="${esc(k.id)}" hidden>
            ${l.length ? "Weitere hinzufügen" : "Fotos aufnehmen oder Dateien wählen"}</label>
        </section>`;
      }).join("")}
      <footer class="portal-fuss">
        <p>Fragen? Rufen Sie uns an: <a href="tel:${esc(String(f.telefon).replace(/[^\d+]/g, ""))}">${esc(f.telefon)}</a> · <a href="mailto:${esc(f.email)}">${esc(f.email)}</a></p>
        <p>${esc(f.name)} · ${esc(f.adresse.strasse)} · ${esc(f.adresse.ort)}</p>
        <p class="klein">Ihre Dateien werden ausschließlich für die Planung und Ausführung Ihres Bauvorhabens verwendet. ${f.website ? `Datenschutzhinweise: <a href="https://${esc(String(f.website).replace(/^https?:\/\//, ""))}" target="_blank" rel="noopener">${esc(f.website)}</a>` : ""}</p>
      </footer>`;
  }

  main.addEventListener("change", async (e) => {
    const input = e.target;
    if (!input.dataset.kat || !input.files.length) return;
    const kat = input.dataset.kat;
    const karte = input.closest(".portal-karte");
    const laufend = $(".pk-laufend", karte);
    let ok = 0;
    for (const file of [...input.files]) {
      const li = document.createElement("li");
      li.className = "laedt"; li.textContent = file.name;
      laufend.appendChild(li);
      if (file.size > 50e6) { li.className = "fehler"; li.textContent = `${file.name} – zu groß (max. 50 MB)`; continue; }
      try {
        await Daten.portalHochladen(token, kat, file);
        li.className = "fertig"; ok++;
        info.hochgeladen = [...(info.hochgeladen || []), { kategorie: kat, name: file.name, am: new Date().toISOString() }];
      } catch (err) { li.className = "fehler"; li.textContent = `${file.name} – ${err.message || "fehlgeschlagen"}`; }
    }
    input.value = "";
    if (ok) {
      toast(ok === 1 ? "Danke! Die Datei ist bei uns angekommen." : `Danke! ${ok} Dateien sind bei uns angekommen.`);
      setTimeout(render, 900);
    }
  });

  (async () => {
    if (!token) { main.innerHTML = fehlerSeite("Dieser Link ist unvollständig."); return; }
    try { info = await Daten.portalInfo(token); } catch (e) { info = null; }
    if (!info) { main.innerHTML = fehlerSeite("Dieser Link ist ungültig oder abgelaufen."); return; }
    render();
  })();

  function fehlerSeite(text) {
    const f = window.FIRMA;
    return `<header class="portal-kopf"><img src="${esc(f.logo)}" alt="" class="portal-logo"><div><strong>${esc(f.name)}</strong></div></header>
      <section class="portal-intro"><h1>Hoppla.</h1><p>${esc(text)} Bitte melden Sie sich kurz bei uns, dann schicken wir Ihnen einen neuen Link: <a href="tel:${esc(String(f.telefon).replace(/[^\d+]/g, ""))}">${esc(f.telefon)}</a></p></section>`;
  }
})();
