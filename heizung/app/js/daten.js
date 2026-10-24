/* Datenschicht — eine Schnittstelle, zwei Betriebsarten:
     lokal  Projekte im Browser (localStorage), Dateien in IndexedDB.
            Gut zum Ausprobieren; der Kunden-Link funktioniert nur im selben Browser.
     cloud  Supabase: Login fürs Team, Projekte + Dateien für alle, Kunden-Uploads
            über den persönlichen Link von überall.
   Wird von app.js (Team) und kunde.js (Kundenportal) benutzt. */

(function () {
  "use strict";

  const LS = { projekte: "heizdashboard:projekte", einstellungen: "heizdashboard:einstellungen", links: "heizdashboard:links" };
  const BUCKET = "akten";
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const token = () => [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
  const sicher = (n) => n.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);

  /* Zugang aus firma.js – oder, falls dort leer, im Browser hinterlegt (Einrichtung → Cloud verbinden) */
  /* Benutzername → interne Login-Adresse (wie konto_email() in schema.sql) */
  const kontoEmail = (b) => { const x = String(b || "").trim().toLowerCase(); return x.includes("@") ? x : `${x}@konto.heizungs-dashboard.de`; };
  async function pruefsumme(salz, pw) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salz + "|" + pw));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const normMitglied = (m) => m && { id: m.id, ebene: m.ebene, name: m.name, benutzer: m.benutzer || m.email, email: m.email, mussAendern: !!(m.mussAendern ?? m.muss_aendern), aktiv: m.aktiv !== false, formulare: m.formulare || [] };

  function cloudKonfig() {
    const c = (window.FIRMA && window.FIRMA.cloud) || {};
    if (c.url && c.anonKey) return c;
    try { const l = JSON.parse(localStorage.getItem("heizdashboard:cloud")); if (l && l.url && l.anonKey) return l; } catch (e) { /* keiner */ }
    return null;
  }

  /* ---------- Fotos vor dem Upload verkleinern (Handyfotos sind 5–10 MB) ---------- */
  async function verkleinern(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5e6) return file;
    try {
      const bmp = await createImageBitmap(file);
      const max = 2400, f = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch (e) { return file; }
  }

  /* ---------- IndexedDB (lokaler Modus: Dateien) ---------- */
  let idbPromise;
  function idb() {
    idbPromise = idbPromise || new Promise((res, rej) => {
      const r = indexedDB.open("heizdashboard-dateien", 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("meta", { keyPath: "id" }).createIndex("projekt", "projekt_id");
        db.createObjectStore("blobs");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return idbPromise;
  }
  async function tx(stores, modus, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, modus);
      let ergebnis;
      Promise.resolve(fn(t)).then((x) => (ergebnis = x));
      t.oncomplete = () => res(ergebnis);
      t.onerror = () => rej(t.error);
    });
  }
  const anfrage = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const lesen = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("Speicher voll", e); } };

  /* =====================================================================
     Lokal
     ===================================================================== */
  const Lokal = {
    modus: "lokal",
    angemeldet: false,
    mitglied: null,
    /* Konten im Browser (Demo/Test). Passwörter nur als Prüfsumme. */
    _konten() { return lesen("bruell:konten", []); },
    _speichernKonten(l) { schreiben("bruell:konten", l); },
    ersteinrichtungNoetig() { return !this._konten().some((k) => k.ebene === "geschaeftsfuehrung" && k.aktiv !== false); },
    async start() {
      let email = null;
      try { email = JSON.parse(sessionStorage.getItem("bruell:sitzung")); } catch (e) { /* kein Tab-Speicher */ }
      email = email || lesen("bruell:sitzung", null);
      const k = email && this._konten().find((x) => x.email === email && x.aktiv !== false);
      this.mitglied = normMitglied(k); this.angemeldet = !!k; this.nutzer = k ? k.benutzer : null;
      return this.angemeldet;
    },
    async anmelden(benutzer, passwort) {
      const email = kontoEmail(benutzer), l = this._konten(), k = l.find((x) => x.email === email);
      if (!k || k.hash !== (await pruefsumme(k.salz, passwort))) throw new Error("Benutzername oder Passwort falsch.");
      if (k.aktiv === false) throw new Error("Dieses Konto ist gesperrt. Bitte an die Geschäftsführung wenden.");
      k.letzterLogin = new Date().toISOString(); this._speichernKonten(l);
      schreiben("bruell:sitzung", email);
      try { sessionStorage.setItem("bruell:sitzung", JSON.stringify(email)); } catch (e) { /* egal */ }
      this.mitglied = normMitglied(k); this.angemeldet = true; this.nutzer = k.benutzer;
    },
    async abmelden() { try { localStorage.removeItem("bruell:sitzung"); sessionStorage.removeItem("bruell:sitzung"); } catch (e) { /* egal */ } this.angemeldet = false; this.mitglied = null; },
    /* Schreibschutz (lokal: zwischen Tabs dieses Browsers) */
    async sperreHolen(res, name, erzwingen) {
      const l = lesen("heizdashboard:sperren", {}), v = l[res], ich = this.mitglied.id, jetzt = Date.now();
      if (v && v.bis > jetzt && v.wer !== ich && !(erzwingen && this.mitglied.ebene === "geschaeftsfuehrung")) return { frei: false, wer: v.wer, name: v.name, seit: v.seit };
      l[res] = { wer: ich, name, seit: v && v.wer === ich && v.bis > jetzt ? v.seit : jetzt, bis: jetzt + 90000 };
      schreiben("heizdashboard:sperren", l);
      return { frei: true };
    },
    async sperreFreigeben(res) {
      const l = lesen("heizdashboard:sperren", {});
      if (l[res] && this.mitglied && l[res].wer === this.mitglied.id) { delete l[res]; schreiben("heizdashboard:sperren", l); }
    },
    async passwortAendern(neu) {
      if (String(neu).length < 8) throw new Error("Mindestens 8 Zeichen.");
      const l = this._konten(), k = l.find((x) => x.email === this.mitglied.email);
      k.salz = token(); k.hash = await pruefsumme(k.salz, neu); k.mussAendern = false; this._speichernKonten(l);
      this.mitglied.mussAendern = false;
    },
    async konten() { return this._konten().map((k) => ({ email: k.email, benutzer: k.benutzer, id: k.id, ebene: k.ebene, name: k.name, aktiv: k.aktiv !== false, mussAendern: !!k.mussAendern, letzterLogin: k.letzterLogin || null })); },
    async kontoAnlegen({ benutzer, passwort, id, ebene, name, formulare }, ohneGf) {
      if (!ohneGf && (!this.mitglied || this.mitglied.ebene !== "geschaeftsfuehrung")) throw new Error("nicht erlaubt");
      if (String(passwort).length < 8) throw new Error("Passwort zu kurz (mind. 8 Zeichen)");
      const email = kontoEmail(benutzer);
      let l = this._konten();
      if (l.some((k) => k.email === email && k.id !== id)) throw new Error("Benutzername schon vergeben");
      l = l.filter((k) => k.id !== id && k.email !== email);
      const salz = token();
      l.push({ email, benutzer: String(benutzer).trim().toLowerCase(), id, ebene, name, formulare: formulare || [], salz, hash: await pruefsumme(salz, passwort), aktiv: true, mussAendern: !ohneGf || ohneGf === "muss" });
      this._speichernKonten(l);
    },
    async kontoZuruecksetzen(email, passwort) {
      if (String(passwort).length < 8) throw new Error("Passwort zu kurz (mind. 8 Zeichen)");
      const l = this._konten(), k = l.find((x) => x.email === email);
      k.salz = token(); k.hash = await pruefsumme(k.salz, passwort); k.mussAendern = true; this._speichernKonten(l);
    },
    async kontoAktiv(email, aktiv) {
      if (email === this.mitglied.email) throw new Error("Das eigene Konto kann nicht gesperrt werden.");
      const l = this._konten(); l.find((x) => x.email === email).aktiv = aktiv; this._speichernKonten(l);
    },
    async kontoAendern(id, ebene, name, formulare) {
      const l = this._konten(); l.filter((k) => k.id === id).forEach((k) => { k.ebene = ebene; k.name = name; k.formulare = formulare || []; }); this._speichernKonten(l);
    },
    async projekteLaden() { return lesen(LS.projekte, []); },
    async projektSpeichern(p, alle) { schreiben(LS.projekte, alle); },
    async einstellungenLaden() { return lesen(LS.einstellungen, null); },
    async einstellungenSpeichern(e) { schreiben(LS.einstellungen, e); },
    async dateien(pid) {
      return tx(["meta"], "readonly", (t) => anfrage(t.objectStore("meta").index("projekt").getAll(pid)))
        .then((l) => (l || []).sort((a, b) => a.am.localeCompare(b.am)));
    },
    async alleDateien() {
      return tx(["meta"], "readonly", (t) => anfrage(t.objectStore("meta").getAll())).then((l) => l || []);
    },
    async dateiVerschieben(rec, kat) {
      rec.kategorie = kat;
      await tx(["meta"], "readwrite", (t) => t.objectStore("meta").put({ ...rec }));
    },
    async hochladen(pid, kategorie, file, quelle = "team") {
      file = await verkleinern(file);
      const rec = { id: uid(), projekt_id: pid, kategorie, name: file.name, typ: file.type, groesse: file.size,
        pfad: `lokal/${pid}/${kategorie}/${uid()}`, quelle, neu: quelle === "kunde", am: new Date().toISOString() };
      await tx(["meta", "blobs"], "readwrite", (t) => { t.objectStore("meta").put(rec); t.objectStore("blobs").put(file, rec.id); });
      if (quelle === "kunde") {
        const alle = lesen(LS.projekte, []); const p = alle.find((x) => x.id === pid);
        if (p) { p.geaendert = Date.now(); schreiben(LS.projekte, alle); }
      }
      return rec;
    },
    async dateiUrl(rec) {
      const blob = await tx(["blobs"], "readonly", (t) => anfrage(t.objectStore("blobs").get(rec.id)));
      return blob ? URL.createObjectURL(blob) : null;
    },
    async dateiLoeschen(rec) { await tx(["meta", "blobs"], "readwrite", (t) => { t.objectStore("meta").delete(rec.id); t.objectStore("blobs").delete(rec.id); }); },
    async gesehen(pid) {
      const l = await this.dateien(pid);
      await tx(["meta"], "readwrite", (t) => l.filter((d) => d.neu).forEach((d) => t.objectStore("meta").put({ ...d, neu: false })));
    },
    async uploadLink(p) {
      const links = lesen(LS.links, {});
      let t = Object.keys(links).find((k) => links[k] === p.id);
      if (!t) { t = token(); links[t] = p.id; schreiben(LS.links, links); }
      return t;
    },
    async abgleichen() { return false; },
    partnerAuftraege: null,  // lokal berechnet app.js den Auszug selbst
    /* Kennzahlen (Umsatz, Kosten) – nur Geschäftsführung */
    async zahlenLaden() { return lesen("heizdashboard:zahlen", {}); },
    async zahlenSpeichern(pid, daten) { const z = lesen("heizdashboard:zahlen", {}); z[pid] = daten; schreiben("heizdashboard:zahlen", z); },
    /* Portal (lokal: gleicher Browser) */
    async portalInfo(t) {
      const pid = lesen(LS.links, {})[t];
      const p = lesen(LS.projekte, []).find((x) => x.id === pid && !x.geloescht);
      if (!p) return null;
      const hoch = (await this.dateien(pid)).filter((d) => d.quelle === "kunde").map((d) => ({ kategorie: d.kategorie, name: d.name, am: d.am }));
      return { firma: lesen(LS.einstellungen, null), anrede: p.kunde.anrede, vorname: p.kunde.vorname, nachname: p.kunde.nachname, phase: p.phase, hochgeladen: hoch };
    },
    async portalHochladen(t, kategorie, file) {
      const pid = lesen(LS.links, {})[t];
      if (!pid) throw new Error("Link ungültig");
      return this.hochladen(pid, kategorie, file, "kunde");
    },
  };

  /* =====================================================================
     Cloud (Supabase)
     ===================================================================== */
  function Cloud(konf) {
    const sb = window.supabase.createClient(konf.url, konf.anonKey, { auth: { persistSession: true } });
    /* Kundenportal immer anonym – auch wenn im selben Browser jemand vom Team angemeldet ist */
    let anonym = null;
    const sbKunde = () => (anonym = anonym || window.supabase.createClient(konf.url, konf.anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "heizdashboard-portal" } }));
    let stand = 0;
    return {
      modus: "cloud",
      konf,
      sb,
      angemeldet: false,
      nutzer: null,
      mitglied: null,
      ersteinrichtungNoetig() { return false; },
      async _mitgliedLaden(email) {
        const { data } = await sb.from("mitglieder").select("*").eq("email", String(email || "").toLowerCase()).maybeSingle();
        this.mitglied = data && data.aktiv !== false ? normMitglied(data) : null;
      },
      async start() {
        const { data } = await sb.auth.getSession();
        this.angemeldet = !!data.session;
        this.nutzer = data.session ? data.session.user.email : null;
        if (this.angemeldet) await this._mitgliedLaden(this.nutzer);
        return this.angemeldet;
      },
      async anmelden(benutzer, passwort) {
        const { data, error } = await sb.auth.signInWithPassword({ email: kontoEmail(benutzer), password: passwort });
        if (error) {
          if (/banned/i.test(error.message || error.code || "")) throw new Error("Dieses Konto ist gesperrt. Bitte an die Geschäftsführung wenden.");
          throw new Error(error.message === "Invalid login credentials" ? "Benutzername oder Passwort falsch." : error.message);
        }
        this.angemeldet = true; this.nutzer = data.user.email;
        await this._mitgliedLaden(this.nutzer);
      },
      async abmelden() { await sb.auth.signOut(); this.angemeldet = false; this.mitglied = null; },
      async sperreHolen(res, name, erzwingen) {
        const { data, error } = await sb.rpc("sperre_holen", { p_ressource: res, p_name: name, p_erzwingen: !!erzwingen });
        if (error) throw error;
        return data && data.seit ? { ...data, seit: new Date(data.seit).getTime() } : data;
      },
      async sperreFreigeben(res) { await sb.rpc("sperre_freigeben", { p_ressource: res }); },
      async passwortAendern(neu) {
        if (String(neu).length < 8) throw new Error("Mindestens 8 Zeichen.");
        const { error } = await sb.auth.updateUser({ password: neu });
        if (error) throw new Error(/same|different/i.test(error.message) ? "Bitte ein neues Passwort wählen, nicht das Startpasswort." : error.message);
        await sb.rpc("passwort_geaendert");
        if (this.mitglied) this.mitglied.mussAendern = false;
      },
      async konten() {
        const { data, error } = await sb.rpc("konten_liste");
        if (error) throw error;
        return data || [];
      },
      async kontoAnlegen({ benutzer, passwort, id, ebene, name, formulare }) {
        const { error } = await sb.rpc("konto_anlegen", { p_benutzer: benutzer, p_passwort: passwort, p_id: id, p_ebene: ebene, p_name: name, p_formulare: formulare || [] });
        if (error) throw new Error(error.message);
      },
      async kontoZuruecksetzen(email, passwort) {
        const { error } = await sb.rpc("konto_passwort_zuruecksetzen", { p_email: email, p_passwort: passwort });
        if (error) throw new Error(error.message);
      },
      async kontoAktiv(email, aktiv) {
        const { error } = await sb.rpc("konto_aktiv", { p_email: email, p_aktiv: aktiv });
        if (error) throw new Error(error.message);
      },
      async kontoAendern(id, ebene, name, formulare) {
        const { error } = await sb.rpc("konto_aendern", { p_id: id, p_ebene: ebene, p_name: name, p_formulare: formulare || [] });
        if (error) throw new Error(error.message);
      },
      async zahlenLaden() {
        const { data, error } = await sb.from("kennzahlen").select("projekt_id,daten");
        if (error) throw error;
        return Object.fromEntries((data || []).map((r) => [r.projekt_id, r.daten]));
      },
      async zahlenSpeichern(pid, daten) {
        const { error } = await sb.from("kennzahlen").upsert({ projekt_id: pid, daten, geaendert: Date.now() });
        if (error) throw error;
      },
      async partnerAuftraege() {
        const { data, error } = await sb.rpc("partner_auftraege");
        if (error) throw error;
        return data || [];
      },
      async partnerMelden(pid, erledigt, notiz) {
        const { data, error } = await sb.rpc("partner_melden", { p_projekt: pid, p_erledigt: erledigt, p_notiz: notiz });
        if (error || !data) throw new Error("Meldung fehlgeschlagen");
      },
      async projekteLaden() {
        const { data, error } = await sb.from("projekte").select("daten,geaendert");
        if (error) throw error;
        stand = Math.max(0, ...data.map((r) => r.geaendert));
        return data.map((r) => ({ ...r.daten, geaendert: r.geaendert }));
      },
      async projektSpeichern(p) {
        /* erst aktualisieren (dürfen auch Monteure), nur wenn neu: anlegen (nur das Büro) */
        const zeile = { daten: p, geaendert: p.geaendert, geloescht: !!p.geloescht };
        const { data, error } = await sb.from("projekte").update(zeile).eq("id", p.id).select("id");
        if (error) throw error;
        if (!data.length) { const r = await sb.from("projekte").insert({ id: p.id, ...zeile }); if (r.error) throw r.error; }
        stand = Math.max(stand, p.geaendert);
      },
      async einstellungenLaden() {
        const { data } = await sb.from("einstellungen").select("daten").eq("id", 1).maybeSingle();
        return data ? data.daten : null;
      },
      async einstellungenSpeichern(e) {
        const { error } = await sb.from("einstellungen").upsert({ id: 1, daten: e, geaendert: Date.now() });
        if (error) throw error;
      },
      async dateien(pid) {
        const { data, error } = await sb.from("dateien").select("*").eq("projekt_id", pid).order("am");
        if (error) throw error;
        return data;
      },
      async alleDateien() {
        const { data, error } = await sb.from("dateien").select("*").order("am");
        if (error) throw error;
        return data || [];
      },
      async dateiVerschieben(rec, kat) {
        const { error } = await sb.from("dateien").update({ kategorie: kat }).eq("id", rec.id);
        if (error) throw error;
        rec.kategorie = kat;
      },
      async hochladen(pid, kategorie, file, quelle = "team") {
        file = await verkleinern(file);
        const pfad = `projekte/${pid}/${kategorie}/${uid()}-${sicher(file.name)}`;
        const up = await sb.storage.from(BUCKET).upload(pfad, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw up.error;
        const rec = { projekt_id: pid, kategorie, name: file.name, typ: file.type, groesse: file.size, pfad, quelle };
        const { data, error } = await sb.from("dateien").insert(rec).select().single();
        if (error) throw error;
        return data;
      },
      async dateiUrl(rec) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(rec.pfad, 600);
        if (error) throw error;
        return data.signedUrl;
      },
      async dateiLoeschen(rec) {
        await sb.storage.from(BUCKET).remove([rec.pfad]);
        await sb.from("dateien").delete().eq("id", rec.id);
      },
      async gesehen(pid) { await sb.from("dateien").update({ neu: false }).eq("projekt_id", pid).eq("neu", true); },
      async uploadLink(p) {
        const { data } = await sb.from("upload_links").select("token").eq("projekt_id", p.id).gt("gueltig_bis", new Date().toISOString()).limit(1);
        if (data && data[0]) return data[0].token;
        const t = token();
        const { error } = await sb.from("upload_links").insert({ token: t, projekt_id: p.id });
        if (error) throw error;
        return t;
      },
      /* geänderte Projekte holen (Kolleg:innen, Kunden-Uploads) */
      async abgleichen() {
        const { data, error } = await sb.from("projekte").select("daten,geaendert").gt("geaendert", stand);
        if (error || !data.length) return [];
        stand = Math.max(stand, ...data.map((r) => r.geaendert));
        return data.map((r) => ({ ...r.daten, geaendert: r.geaendert }));
      },
      /* Portal */
      async portalInfo(t) {
        const { data, error } = await sbKunde().rpc("portal_info", { p_token: t });
        if (error) throw error;
        return data;
      },
      async portalHochladen(t, kategorie, file) {
        file = await verkleinern(file);
        const pfad = `kunde/${t}/${kategorie}/${uid()}-${sicher(file.name)}`;
        const up = await sbKunde().storage.from(BUCKET).upload(pfad, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw new Error("Upload fehlgeschlagen");
        const { data, error } = await sbKunde().rpc("portal_upload_melden", { p_token: t, p_pfad: pfad, p_kategorie: kategorie, p_name: file.name, p_typ: file.type, p_groesse: file.size });
        if (error || !data) throw new Error("Upload konnte nicht zugeordnet werden");
        return { name: file.name, kategorie };
      },
    };
  }

  const konf = cloudKonfig();
  window.Daten = konf && window.supabase ? Cloud(konf) : Lokal;
  window.Daten.kontoEmail = kontoEmail;
})();
