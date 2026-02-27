/* ===================================================
ColdTreasure post.js (Full Replace)
- Render post by ?slug=xxx (preferred) OR ?id=xxx (legacy)
- Fetch from /api/posts (Notion-backed)
- Inject into <main id="app">
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

  function getKey() {
    const u = new URL(location.href);
    const slug = (u.searchParams.get("slug") || "").trim();
    const id = (u.searchParams.get("id") || "").trim();
    return { slug, id, key: slug || id };
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

  async function loadPostsFromAPI() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load /api/posts (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ---- content render helpers ----
  function renderBlock(block) {
    if (!block || !block.type) return "";
    if (block.type === "p") return `<p>${esc(block.text || "")}</p>`;
    if (block.type === "h2") return `<h2>${esc(block.text || "")}</h2>`;
    if (block.type === "ul") {
      const items = (block.items || []).map((x) => `<li>${esc(x || "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return "";
  }

  function renderContent(content) {
    // 1) 旧格式：block array
    if (Array.isArray(content)) {
      return content.map(renderBlock).join("");
    }

    // 2) 新格式：string（Notion 返回的正文，含 \n）
    if (typeof content === "string") {
      const text = content.replace(/\r\n/g, "\n").trim();
      if (!text) return "";
      // 按空行分段 -> <p>
      const paras = text.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
      return paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    }

    return "";
  }

  function pickHero(post) {
    return post.thumb || post.cover || post.hero || post.image || "";
  }

  function renderPost(post) {
    const brand = Array.isArray(post.brand) ? post.brand.join(" / ") : (post.brand || "");
    const tags = Array.isArray(post.tags) ? post.tags : [];

    const metaParts = [];
    if (brand) metaParts.push(esc(brand));
    if (post.date) metaParts.push(esc(post.date));
    if (tags.length) metaParts.push(tags.map((t) => `#${esc(t)}`).join(" "));

    const heroFocus = normalizeFocus(post.heroFocus);
    const heroStyle = heroFocus ? ` style="--hero-focus:${esc(heroFocus)}"` : "";

    const heroSrc = pickHero(post);
    const heroHtml = heroSrc
      ? `
        <div class="hero"${heroStyle}>
          <img src="${esc(heroSrc)}" alt="${esc(post.title || "")}" loading="eager" />
        </div>
      `
      : "";

    const contentHtml = renderContent(post.content);

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
        <h1>${esc(post.title || "Untitled")}</h1>
        <div class="meta">${metaParts.join(" · ")}</div>
        ${heroHtml}
        ${post.summary ? `<div class="summary">${esc(post.summary)}</div>` : ""}
        <div class="content">${contentHtml}</div>
        ${galleryHtml}
      </article>
    `;
  }

  // -------- boot --------
  const app = $("#app") || document.body;
  await waitModulesLoaded();

  const { slug, id, key } = getKey();

  if (!key) {
    app.innerHTML = `
      <div class="error">
        <b>Missing slug</b>
        <div class="muted">URL 需要带参数：<code>?slug=xxx</code>（兼容 <code>?id=xxx</code>）</div>
      </div>
    `;
    return;
  }

  try {
    const posts = await loadPostsFromAPI();

    // 优先 slug 匹配，其次 id 匹配（兼容旧链接）
    const post = posts.find((p) => {
      if (!p) return false;

      const pSlug = String(p.slug || "");
      const pId   = String(p.id || "");
      
      // 1) ?slug=xxx -> 优先按 slug 找
      if (slug && pSlug === slug) return true;

      // 2) 兼容旧链接：?id=xxx 但 xxx 其实是 slug
      if (!slug && id && pSlug === id) return true;

      // 3) 新逻辑：?id=xxx 且 xxx 是 Notion page id
      if (!slug && id && pSlug === id) return true;

      return false;
    });

    if (!post) {
      app.innerHTML = `
        <div class="error">
          <b>Post not found</b>
          <div class="muted">未找到：<code>${esc(key)}</code></div>
          <div class="muted" style="margin-top:8px;">
            重点检查：该条目在 Notion 中 <code>publish</code> 是否已勾选；以及 <code>slug</code> 是否填写正确。
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
        <div class="muted" style="margin-top:8px;">
          重点检查：<code>/api/posts</code> 是否可访问（打开看是否返回 JSON）。
        </div>
      </div>
    `;
  }
})();
