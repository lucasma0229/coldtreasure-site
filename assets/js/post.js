/* ===================================================
ColdTreasure post.js (Full Replace)
- Primary: /api/posts (Notion -> Worker)
- Fallback: /assets/data/posts.json (legacy)
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

  async function waitModulesLoaded(timeoutMs = 1200) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  // ---------- loaders ----------
  async function loadNotionPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load /api/posts (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function loadLegacyPosts() {
    const res = await fetch(`/assets/data/posts.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load posts.json (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // Notion content: plain text -> <p>
  function renderNotionContent(content) {
    const text = (content || "").toString().trim();
    if (!text) return "";
    const paras = text.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);
    return paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  // Legacy content: blocks -> html
  function renderLegacyBlock(block) {
    if (!block || !block.type) return "";
    if (block.type === "p") return `<p>${esc(block.text || "")}</p>`;
    if (block.type === "h2") return `<h2>${esc(block.text || "")}</h2>`;
    if (block.type === "ul") {
      const items = (block.items || []).map((x) => `<li>${esc(x || "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return "";
  }

  function renderLegacyContent(arr) {
    const blocks = Array.isArray(arr) ? arr : [];
    return blocks.map(renderLegacyBlock).join("");
  }

  function isLegacyPost(post) {
    // legacy posts.json 通常是 content: []
    return Array.isArray(post?.content);
  }

  function pickHero(post) {
    return post.thumb || post.cover || post.hero || post.image || "";
  }

  function renderPost(post) {
    const title = post.title || "Untitled";
    const date = post.date || post.release_date || "";
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const keywords = Array.isArray(post.keywords) ? post.keywords : [];

    const metaParts = [];
    if (date) metaParts.push(esc(date));
    if (tags.length) metaParts.push(tags.map((t) => `#${esc(t)}`).join(" "));
    if (keywords.length) metaParts.push(keywords.map((k) => `@${esc(k)}`).join(" "));

    const heroFocus = normalizeFocus(post.heroFocus);
    const heroStyle = heroFocus ? ` style="--hero-focus:${esc(heroFocus)}"` : "";

    const heroSrc = pickHero(post);
    const heroHtml = heroSrc
      ? `
        <div class="hero"${heroStyle}>
          <img src="${esc(heroSrc)}" alt="${esc(title)}" loading="eager" />
        </div>
      `
      : "";

    const summaryHtml = post.summary ? `<div class="summary">${esc(post.summary)}</div>` : "";

    const contentHtml = isLegacyPost(post)
      ? `<div class="content">${renderLegacyContent(post.content)}</div>`
      : `<div class="content">${renderNotionContent(post.content)}</div>`;

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

  function findPost(posts, slug, id) {
    return posts.find((p) => {
      if (!p) return false;
      const pSlug = String(p.slug || "");
      const pId = String(p.id || "");

      if (slug && pSlug === slug) return true;
      if (!slug && id && pSlug === id) return true; // legacy: id=slug
      if (!slug && id && pId === id) return true;   // notion: id=pageId
      return false;
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
    // 1) try notion
    let post = null;
    try {
      const notionPosts = await loadNotionPosts();
      post = findPost(notionPosts, slug, id);
    } catch (_) {}

    // 2) fallback legacy
    if (!post) {
      const legacyPosts = await loadLegacyPosts();
      post = findPost(legacyPosts, slug, id);
    }

    if (!post) {
      app.innerHTML = `
        <div class="error">
          <b>Post not found</b>
          <div class="muted">未找到：<code>${esc(slug || id)}</code></div>
          <div class="muted" style="margin-top:8px;">
            若是新文章：检查 Notion 的 <code>publish</code> 与 <code>slug</code>。<br>
            若是旧文章：检查 <code>/assets/data/posts.json</code> 是否包含该 slug/id。
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
      </div>
    `;
  }
})();
