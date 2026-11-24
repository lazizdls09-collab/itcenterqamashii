/* ==========================================================
   Supabase ulanishi (ochiq sayt va admin panel uchun umumiy).
   Faqat "publishable" kalit ishlatiladi: u brauzerda ochiq bo‘lishi
   mo‘ljallangan. Yozish huquqi Supabase RLS qoidalari bilan cheklangan:
   admin yozadi (tizimga kirgan foydalanuvchi), ochiq foydalanuvchi faqat o‘qiydi.
   ========================================================== */
(() => {
  const SUPABASE_URL = "https://oyjrnrhmgamfidkqfkvb.supabase.co";
  const SUPABASE_KEY = "sb_publishable_t3vvgQqml4Xxy3gFFRaMNQ_ib2HwO_f";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const BUCKET = "media";

  let clientPromise = null;

  function getClient() {
    if (!clientPromise) {
      clientPromise = new Promise((resolve, reject) => {
        if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
        const s = document.createElement("script");
        s.src = SUPABASE_JS;
        s.onload = () => resolve(window.supabase);
        s.onerror = () => reject(new Error("Supabase kutubxonasi yuklanmadi"));
        document.head.appendChild(s);
      })
        .then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }))
        .catch((err) => { clientPromise = null; throw err; });
    }
    return clientPromise;
  }

  const unwrap = (res) => { if (res.error) throw res.error; return res.data; };

  const Cloud = {
    client: getClient,

    async session() {
      const c = await getClient();
      const { data } = await c.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      const c = await getClient();
      return unwrap(await c.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
      const c = await getClient();
      await c.auth.signOut();
    },

    // Key/value documents (site content)
    async getSiteData(key) {
      const c = await getClient();
      const row = unwrap(await c.from("site_data").select("value").eq("key", key).maybeSingle());
      return row ? row.value : null;
    },
    async setSiteData(key, value) {
      const c = await getClient();
      unwrap(await c.from("site_data").upsert({ key, value, updated_at: new Date().toISOString() }));
    },
    async deleteSiteData(key) {
      const c = await getClient();
      unwrap(await c.from("site_data").delete().eq("key", key));
    },

    // Record tables (registrations, contact messages): each row = { id, data, created_at }
    async listRows(table) {
      const c = await getClient();
      const rows = unwrap(await c.from(table).select("id,data,created_at").order("created_at", { ascending: false }));
      return rows.map((r) => ({ ...r.data, id: r.id }));
    },
    async upsertRow(table, id, record) {
      const c = await getClient();
      unwrap(await c.from(table).upsert({ id, data: record }));
    },
    async deleteRow(table, id) {
      const c = await getClient();
      unwrap(await c.from(table).delete().eq("id", id));
    },

    // Image upload: dataURL -> JPEG file in the public "media" bucket -> public URL
    async uploadImage(dataUrl, folder) {
      const c = await getClient();
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      unwrap(await c.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
      return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
  };

  window.Cloud = Cloud;
})();
