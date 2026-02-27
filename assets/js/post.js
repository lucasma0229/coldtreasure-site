/* ===================================================
ColdTreasure post.js (Full Replace)
- Fetch from /api/posts (Notion -> Worker)
- Support:
  1) ?slug=xxx
  2) ?id=<Notion page id>
  3) legacy: ?id=slug
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

  function getParams() {
    const u = new URL(location.href);
    return {
      slug: (u.searchParams.get("slug") || "").trim(),
      id: (u.searchParams.get("id") || "").trim(),
    };
  }

  function normalizeFocus(v) {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && v.length >= 2) return `${v[0]}% ${v[1]}%`;
    if (typeof v === "object" && v.x != null && v.y != null) return `${v.x}% ${v.y}%`;
    return "";
  }

  async function loadPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load /api/posts (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  function renderContent(content) {
    // Notion -> API 当前给的是纯文本（包含 \n）
    const text = (content || "").toString().trim();
    if (!text) return "";

    // 以空行分段；段内保留换行 -> <br>
    const paras = text.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);
    return paras
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function renderPost(post) {
    const title = post.title || "Untitled";
    const date = post.date || "";
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const keywords = Array.isArray(post.keywords) ? post.keywords : [];

    const metaParts = [];
    if (date) metaParts.push(esc(date));
    if (tags.length) metaParts.push(tags.map((t) => `#${esc(t)}`).join(" "));
    if (keywords.length) metaParts.push(keywords.map((k) => `@${esc(k)}`).join(" "));

    const heroFocus = normalizeFocus(post.heroFocus);
    const heroStyle = heroFocus ? ` style="--hero-focus:${esc(heroFocus)}"` : "";

    const heroSrc = post.thumb || post.cover || post.hero || post.image || "";
    const heroHtml = heroSrc
      ? `
        <div class="hero"${heroStyle}>
          <img src="${esc(heroSrc)}" alt="${esc(title)}" loading="eager" />
        </div>
      `
      : "";

    const summaryHtml = post.summary ? `<div class="summary">${esc(post.summary)}</div>` : "";
    const contentHtml = `<div class="content">${renderContent(post.content)}</div>`;

    // gallery 如果你 API 以后补了，也能直接吃
    const gallery = Array.isArray(post.gallery) ? post.gallery : [];
    const galleryHtml = gallery.length
      ? `
        <section class="gallery">
          <h2>Gallery</h2>
          <div class="grid">
            ${gallery.map((src) => `<img src="${esc(src)}" alt="" loading="lazy" />`).join("")}
          </div>
        </section>
      `
      : "";

    return `
      <article>
        <h1>${esc(title)}</h1>
        <div class="meta">${metaParts.join(" · ")}</div>
        ${heroHtml}
        ${summaryHtml}
        ${contentHtml}
        ${galleryHtml}
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
  const { slug, id } = getParams();

  await waitModulesLoaded();

  if (!slug && !id) {
    app.innerHTML = `
      <div class="error">
        <b>Missing slug / id</b>
        <div class="muted">URL 需要带参数：<code>?slug=xxx</code> 或 <code>?id=xxx</code></div>
      </div>
    `;
    return;
  }

  try {
    const posts = await loadPosts();

    // 兼容逻辑：
    // 1) ?slug=xxx -> 按 slug
    // 2) ?id=xxx 且 xxx 其实是 slug -> 也按 slug
    // 3) ?id=Notion page id -> 按 id
    const post = posts.find((p) => {
      if (!p) return false;
      const pSlug = String(p.slug || "");
      const pId = String(p.id || "");

      if (slug && pSlug === slug) return true;
      if (!slug && id && pSlug === id) return true;   // legacy: id=slug
      if (!slug && id && pId === id) return true;     // id=notionId

      return false;
    });

    if (!post) {
      app.innerHTML = `
        <div class="error">
          <b>Post not found</b>
          <div class="muted">未找到：<code>${esc(slug || id)}</code></div>
          <div class="muted" style="margin-top:8px;">
            重点检查：Notion 里该条 <code>publish</code> 是否已勾选，并且 <code>slug</code> 是否填写正确。
          </div>
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
        <div class="muted" style="margin-top:8px;">重点检查：<code>/api/posts</code> 是否能正常打开。</div>
      </div>
    `;
  }
})();
