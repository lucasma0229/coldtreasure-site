/* ===================================================
ColdTreasure post.js (Full Replace)
- Render post by ?slug=xxx (case-insensitive) + supports /post/<slug>
- Fetch from /api/posts (Notion -> Cloudflare Functions)
- Render content (plain text with \n)
- Render gallery (if provided)
=================================================== */
(async function () {
  const $ = (sel) => document.querySelector(sel);

  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }

  function normSlug(s = "") {
    return String(s).trim().toLowerCase();
  }

  function getSlug() {
    const u = new URL(location.href);
    const q = (u.searchParams.get("slug") || "").trim();
    if (q) return q;

    // 支持 /post/<slug> 或 /post/<slug>/
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "post") return parts[1].trim();

    return "";
  }

  async function fetchPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Failed to fetch /api/posts (${res.status})`);
    return Array.isArray(data) ? data : [];
  }

  function renderContent(text = "") {
    const raw = String(text || "").trim();
    if (!raw) return `<p class="muted">暂无正文</p>`;

    const safe = esc(raw);

    // 双换行切段；单换行变 <br>
    return safe
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, "<br>"))
      .map((p) => `<p>${p}</p>`)
      .join("");
  }

  function normalizeGallery(g) {
    if (!g) return [];
    if (Array.isArray(g)) return g.filter(Boolean).map(String);
    return [];
  }

  function renderGallery(gallery) {
    const arr = normalizeGallery(gallery);
    if (!arr.length) return "";

    return `
      <section class="gallery">
        <h2>Gallery</h2>
        <div class="grid">
          ${arr.map((src) => `<img src="${esc(src)}" alt="" loading="lazy" />`).join("")}
        </div>
      </section>
    `;
  }

  function renderPost(post) {
    const title = post?.title || "Untitled";
    const date = post?.date || "";
    const cover = post?.cover || "";
    const content = post?.content || "";
    const gallery = post?.gallery || [];

    const meta = [date].filter(Boolean).map(esc).join(" · ");

    const heroHtml = cover
      ? `
        <div class="hero">
          <img src="${esc(cover)}" alt="${esc(title)}" loading="eager" />
        </div>
      `
      : "";

    return `
      <article>
        <h1>${esc(title)}</h1>
        <div class="meta">${meta || ""}</div>
        ${heroHtml}
        <div class="content">
          ${renderContent(content)}
        </div>
        ${renderGallery(gallery)}
      </article>
    `;
  }

  async function waitModulesLoaded(timeoutMs = 1200) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  // -------- boot --------
  const app = $("#app") || document.body;
  const slugRaw = getSlug();

  await waitModulesLoaded();

  if (!slugRaw) {
    app.innerHTML = `
      <div class="error">
        <b>Missing slug</b>
        <div class="muted">URL 需要带参数：<code>?slug=xxx</code></div>
      </div>
    `;
    return;
  }

  try {
    const posts = await fetchPosts();
    const slug = normSlug(slugRaw);

    // ✅ slug 大小写无关匹配
    const post = posts.find((p) => p && normSlug(p.slug || "") === slug);

    if (!post) {
      app.innerHTML = `
        <div class="error">
          <b>Post not found</b>
          <div class="muted">未找到 slug = <code>${esc(slugRaw)}</code> 的文章。</div>
          <div class="muted" style="margin-top:8px;">请确认：Notion 里 publish 已勾选、slug 填对。</div>
        </div>
      `;
      return;
    }

    app.innerHTML = renderPost(post);
  } catch (err) {
    app.innerHTML = `
      <div class="error">
        <b>Load failed</b>
        <div class="muted">${esc(err?.message || err)}</div>
        <div class="muted" style="margin-top:8px;">
          重点检查：<code>/api/posts</code> 是否可访问、Functions 是否部署成功。
        </div>
      </div>
    `;
  }
})();
