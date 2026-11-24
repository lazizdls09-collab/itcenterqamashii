/* ==========================================================
   Content layer (Supabase).
     - ContentStore: team, winners, district photos, site text
       -> site_data table, key "content" (shared by all visitors)
     - Messages: contact messages -> contact_messages table
     - Images are uploaded to the "media" bucket (see uploadImage)
   The public site and admin use the same synchronous API: the latest
   known data is kept in memory and refreshed from Supabase.
   ========================================================== */
(() => {
  const DEFAULTS = {
    team: [
      { id: "team-1", sample: true, roleKey: "team.director", photo: null },
      { id: "team-2", sample: true, roleKey: "team.lead_instructor", photo: null },
      { id: "team-3", sample: true, roleKey: "team.instructor_py", photo: null },
      { id: "team-4", sample: true, roleKey: "team.instructor_ai", photo: null }
    ],
    winners: [
      { id: "win-1", sample: true, year: "2026", photo: null },
      { id: "win-2", sample: true, year: "2026", photo: null },
      { id: "win-3", sample: true, year: "2026", photo: null }
    ],
    winnerPages: [
      { id: "winner-page-1", photo: "assets/images/winners/winner-1.jpg", caption: "G‘olib o‘quvchilarimiz" },
      { id: "winner-page-2", photo: "assets/images/winners/winner-2.jpg", caption: "G‘olib o‘quvchilarimiz" },
      { id: "winner-page-3", photo: "assets/images/winners/winner-3.jpg", caption: "G‘olib o‘quvchilarimiz" }
    ],
    // district id -> [{ photo: URL, caption }]
    districtPhotos: {
      shahrisabz: [
        { photo: "assets/images/landmarks/landmark-mausoleum.jpg", caption: "Tarixiy obida (namuna rasm)" },
        { photo: "assets/images/landmarks/landmark-portal.jpg", caption: "Tarixiy bino (namuna rasm)" }
      ]
    }
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // Site text the admin can override. Empty string = the built-in translation.
  const SITE_COURSES = ["python", "ai", "data", "web", "smm", "english"];
  function normalizeSite(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const courses = {};
    SITE_COURSES.forEach((k) => {
      const c = (r.courses && r.courses[k]) || {};
      courses[k] = { title: String(c.title || ""), desc: String(c.desc || "") };
    });
    return { line1: String(r.line1 || ""), line2: String(r.line2 || ""), lead: String(r.lead || ""), courses };
  }

  function normalize(raw) {
    const stored = raw && typeof raw === "object" ? raw : {};
    const data = { ...clone(DEFAULTS), ...stored };
    delete data.videos;
    delete data.uploadedVideosAdded;
    delete data.settings;
    data.winners = (data.winners || []).map(({ videoKey, videoUrl, media, ...winner }) => winner);
    if (!Array.isArray(data.winnerPages)) data.winnerPages = clone(DEFAULTS.winnerPages);
    data.site = normalizeSite(stored.site);
    return data;
  }

  const emit = () => window.dispatchEvent(new CustomEvent("contentchange"));
  let cache = normalize(null);

  const ContentStore = {
    /** Returns a copy of the latest known content (synchronous). */
    load() { return clone(cache); },

    /** Fetches the shared content from Supabase and notifies the page. */
    async refresh() {
      const value = await window.Cloud.getSiteData("content");
      cache = normalize(value);
      emit();
      return cache;
    },

    /** Saves to Supabase. Rejects if the server refuses; the local copy is rolled back. */
    async save(data) {
      const next = normalize(data);
      if (!Array.isArray(next.winnerPages)) throw new TypeError("Winner album pages must be an array.");
      const prev = cache;
      cache = next;
      emit();
      try {
        await window.Cloud.setSiteData("content", next);
      } catch (err) {
        cache = prev;
        emit();
        throw err;
      }
    },

    async reset() {
      await window.Cloud.deleteSiteData("content");
      cache = normalize(null);
      emit();
    }
  };

  /** Resizes an image File to JPEG dataURL. */
  function resizeImage(file, max = 900) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad-image")); };
      img.src = url;
    });
  }

  /** Resizes a File and uploads it to storage. Resolves to the public URL. */
  async function uploadImage(file, folder, max = 900) {
    const dataUrl = await resizeImage(file, max);
    return window.Cloud.uploadImage(dataUrl, folder);
  }

  // ---------- Contact messages ----------
  let messages = [];
  const Messages = {
    list() { return messages.slice(); },
    async refresh() {
      messages = await window.Cloud.listRows("contact_messages");
      window.dispatchEvent(new CustomEvent("messageschange"));
      return messages;
    },
    async update(id, patch) {
      messages = messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      const rec = messages.find((m) => m.id === id);
      if (rec) await window.Cloud.upsertRow("contact_messages", id, rec);
    },
    async remove(id) {
      messages = messages.filter((m) => m.id !== id);
      await window.Cloud.deleteRow("contact_messages", id);
    }
  };

  window.ContentStore = ContentStore;
  window.Messages = Messages;
  window.resizeImage = resizeImage;
  window.uploadImage = uploadImage;

  // Public pages: load the shared content as soon as possible
  ContentStore.refresh().catch(() => { /* offline: keep defaults */ });
})();
