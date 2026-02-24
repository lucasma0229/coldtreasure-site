/* ===================================================
   ColdTreasure post.js (Full Replace)
   - Render post by ?id=xxx
   - Inject into <main id="app">
   - NO "source" / NO source_url output
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

  function getId() {
    const u = new URL(location.href);
    return (u.searchParams.get("id") || "").trim();
  }

  function normalizeFocus(v) {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v) && v.length >= 2) return `${v[0]}% ${v[1]}%`;
    if (typeof v === "object" && v.x != null && v.y != null) return `${v.x}% ${v.y}%`;
    return "";
  }

  async function loadPosts() {
    const res = await fetch(`/assets/data/posts.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load posts.json (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

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

  function renderPost(post) {
    const brand = Array.isArray(post.brand) ? post.brand.join(" / ") : (post.brand || "");
    const tags = Array.isArray(post.tags) ? post.tags : [];

    const metaParts = [];
    if (brand) metaParts.push(esc(brand));
    if (post.date) metaParts.push(esc(post.date));
    if (tags.length) metaParts.push(tags.map((t) => `#${esc(t)}`).join(" "));

    const heroFocus = normalizeFocus(post.heroFocus);
    const heroStyle = heroFocus ? ` style="--hero-focus:${esc(heroFocus)}"` : "";

    const heroSrc = post.thumb || post.cover || post.hero || post.image || "";
    const heroHtml = heroSrc ? `
      <div class="hero"${heroStyle}>
        <img src="${esc(heroSrc)}" alt="${esc(post.title || "")}" loading="eager" />
      </div>
    ` : "";

    const contentHtml = (post.content || []).map(renderBlock).join("");

    const gallery = Array.isArray(post.gallery) ? post.gallery : [];
    const galleryHtml = gallery.length ? `
      <section class="gallery">
        <h2>Gallery</h2>
        <div class="grid">
          ${gallery.map((src) => `<img src="${esc(src)}" alt="" loading="lazy" />`).join("")}
        </div>
      </section>
    ` : "";

    // ✅ 注意：这里没有任何 source / source_url 的渲染
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
  const id = getId();

  await waitModulesLoaded();

  if (!id) {
    app.innerHTML = `<div class="error"><b>Missing id</b><div class="muted">URL 需要带参数：<code>?id=xxx</code></div></div>`;
    return;
  }

  try {
    const posts = await loadPosts();
    const post = posts.find((p) => p && String(p.id) === id);

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
  } catch (err) {
    app.innerHTML = `
      <div class="error">
        <b>Load failed</b>
        <div class="muted">${esc(err?.message || err)}</div>
        <div class="muted" style="margin-top:8px;">
          重点检查：<code>assets/data/posts.json</code> 是否已部署生效（Ctrl+F5）。
        </div>
      </div>
    `;
  }
})();
