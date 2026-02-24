/* ===================================================
   ColdTreasure post.js (CMS Post Renderer)
   - Route: /post/?id=<id>
   - Data: /assets/data/posts.json
   - Renders: title, meta, hero(3:2), summary, content blocks, gallery, source
   =================================================== */

(async function () {
  const $ = (sel) => document.querySelector(sel);

  function esc(str) {
    return String(str ?? "")
      .replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m]));
  }

  function asText(v) { return (v == null) ? "" : String(v); }

  function getId() {
    const u = new URL(location.href);
    return u.searchParams.get("id")?.trim() || "";
  }

  function normalizeFocus(v) {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && v.length >= 2) return `${v[0]}% ${v[1]}%`;
    if (typeof v === "object" && v.x != null && v.y != null) return `${v.x}% ${v.y}%`;
    return "";
  }

  async function waitForModulesLoaded(timeoutMs = 1200) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  async function loadPosts() {
    const res = await fetch(`/assets/data/posts.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load posts.json (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  function renderBlock(block) {
    if (!block || !block.type) return "";
    const t = String(block.type).toLowerCase();

    if (t === "p") {
      return `<p>${esc(block.text || "")}</p>`;
    }

    if (t === "h2") {
      return `<h2>${esc(block.text || "")}</h2>`;
    }

    if (t === "ul") {
      const items = Array.isArray(block.items) ? block.items : [];
      const lis = items.map(x => `<li>${esc(x)}</li>`).join("");
      return `<ul>${lis}</ul>`;
    }

    // 未来 Notion 接入：可以在这里扩展更多 block 类型
    return "";
  }

  function pickHero(post) {
    return post.hero || post.cover || post.thumb || post.image || "";
  }

  function renderPost(post) {
    const title = esc(post.title || post.name || "Untitled");

    const brand = Array.isArray(post.brand) ? post.brand.join(" / ") : asText(post.brand);
    const date = asText(post.date || post.release_date);

    const tags = Array.isArray(post.tags) ? post.tags : [];
    const tagText = tags.length ? tags.map(t => `#${asText(t)}`).join(" ") : "";

    const metaParts = [];
    if (brand) metaParts.push(esc(brand));
    if (date) metaParts.push(esc(date));
    if (tagText) metaParts.push(esc(tagText));

    const heroFocus = normalizeFocus(post.heroFocus);
    const heroStyle = heroFocus ? ` style="--hero-focus:${esc(heroFocus)}"` : "";

    const heroSrc = pickHero(post);
    const heroHtml = heroSrc ? `
      <div class="hero"${heroStyle}>
        <img src="${esc(heroSrc)}" alt="${title}" loading="eager" />
      </div>
    ` : "";

    const summary = post.summary ? `<div class="summary">${esc(post.summary)}</div>` : "";

    const contentBlocks = Array.isArray(post.content) ? post.content : [];
    const contentHtml = contentBlocks.map(renderBlock).join("");

    const gallery = Array.isArray(post.gallery) ? post.gallery : [];
    const galleryHtml = gallery.length ? `
      <section class="gallery">
        <h2>Gallery</h2>
        <div class="grid">
          ${gallery.map(src => `<img src="${esc(src)}" alt="" loading="lazy" />`).join("")}
        </div>
      </section>
    ` : "";

    const sourceUrl = asText(post.source_url).trim();
    const sourceHtml = sourceUrl ? `
      <p class="muted" style="margin-top:18px;">
        Source: <a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sourceUrl)}</a>
      </p>
    ` : "";

    return `
      <article>
        <h1>${title}</h1>
        <div class="meta">${metaParts.join(" · ")}</div>
        ${heroHtml}
        ${summary}
        <div class="content">${contentHtml}</div>
        ${galleryHtml}
        ${sourceHtml}
      </article>
    `;
  }

  // ---------------- boot ----------------
  const app = $("#app") || document.body;

  // 等 header/footer 注入完成后再渲染正文（避免跳动）
  await waitForModulesLoaded(1200);

  const id = getId();
  if (!id) {
    app.innerHTML = `<div class="error"><b>Missing id</b><div class="muted">URL 需要带参数：<code>?id=xxx</code></div></div>`;
    return;
  }

  try {
    const posts = await loadPosts();
    const post = posts.find(p => p && String(p.id) === id);

    if (!post) {
      app.innerHTML = `
        <div class="error">
          <b>Post not found</b>
          <div class="muted">未找到 id = <code>${esc(id)}</code> 的文章。</div>
          <div class="muted" style="margin-top:8px;">请确认：<code>assets/data/posts.json</code> 中存在同名 id。</div>
        </div>
      `;
      return;
    }

    app.innerHTML = renderPost(post);
    document.title = `ColdTreasure | ${post.title || "Post"}`;
  } catch (err) {
    app.innerHTML = `
      <div class="error">
        <b>Load failed</b>
        <div class="muted">${esc(err?.message || err)}</div>
        <div class="muted" style="margin-top:8px;">
          重点检查：<code>assets/data/posts.json</code> 是否部署生效（Ctrl+F5）。
        </div>
      </div>
    `;
  }
})();
