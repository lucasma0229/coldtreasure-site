// /assets/js/post.js
(function () {
  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(s = "") { return String(s ?? "").trim(); }

  function getParam(name) {
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch { return ""; }
  }

  // 关键：不要破坏带 query 的 URL
  function appendCacheBust(url, key = "v") {
    const u = norm(url);
    if (!u) return "";
    // 已经有 query -> 用 &
    return u.includes("?") ? `${u}&${key}=${Date.now()}` : `${u}?${key}=${Date.now()}`;
  }

  async function loadPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Failed to load /api/posts (${res.status})`);
    return Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
  }

  // blocks -> HTML（旧文章 content_blocks）
  function renderBlocks(blocks) {
    if (!Array.isArray(blocks) || !blocks.length) return "";
    const out = [];

    for (const b of blocks) {
      if (!b) continue;

      if (typeof b === "string") {
        out.push(`<p>${escapeHtml(b)}</p>`);
        continue;
      }

      const type = norm(b.type).toLowerCase();
      if (type === "h2") {
        out.push(`<h2>${escapeHtml(b.text || "")}</h2>`);
      } else if (type === "ul") {
        const items = Array.isArray(b.items) ? b.items : [];
        if (items.length) {
          out.push(`<ul>${items.map(it => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`);
        }
      } else {
        const txt = norm(b.text);
        if (txt) out.push(`<p>${escapeHtml(txt)}</p>`);
      }
    }

    return out.join("\n");
  }

  // 纯文本 content -> HTML
  function renderTextContent(text) {
    const t = norm(text);
    if (!t) return "";
    const paras = t.split(/\n\s*\n/).map(s => norm(s)).filter(Boolean);
    return paras.map(p => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`).join("\n");
  }

  function renderReleaseInfo(releaseInfo) {
    const t = norm(releaseInfo);
    if (!t) return "";
    const lines = t.split(/\n+/).map(s => norm(s)).filter(Boolean);
    if (!lines.length) return "";

    return `
      <h2>发售信息</h2>
      <ul>
        ${lines.map(x => `<li>${escapeHtml(x)}</li>`).join("")}
      </ul>
    `;
  }

  function renderGallery(gallery, title) {
    if (!Array.isArray(gallery) || !gallery.length) return "";
    return `
      <section class="gallery">
        <h2>Gallery</h2>
        <div class="grid">
          ${gallery.map((src) => `
            <img src="${escapeHtml(appendCacheBust(src))}" alt="${escapeHtml(title)}" loading="lazy">
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderPost(post) {
    const title = norm(post.title) || "Untitled";
    const date = norm(post.date);
    const brand = norm(post.brand);
    const keywords = Array.isArray(post.keywords) ? post.keywords : [];

    // ✅ 只认 cover 作为文章页封面（Notion/静态都统一）
    const hero = norm(post.cover);

    // ✅ 正文：优先 blocks（旧文），否则 text（新文）
    const blocksHtml = renderBlocks(post.content_blocks);
    const textHtml = blocksHtml ? "" : renderTextContent(post.content);

    const releaseHtml = renderReleaseInfo(post.release_info);
    const galleryHtml = renderGallery(post.gallery, title);

    const metaBits = [];
    if (date) metaBits.push(escapeHtml(date));
    if (brand) metaBits.push(`@${escapeHtml(brand)}`);
    if (keywords.length) metaBits.push(keywords.map(k => `@${escapeHtml(k)}`).join(" "));

    return `
      <article>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${metaBits.join(" · ")}</div>

        ${hero ? `
          <div class="hero">
            <!-- ✅ 不要用 ?v= 覆盖 Notion 的 query，改成安全追加 -->
            <img src="${escapeHtml(appendCacheBust(hero))}" alt="${escapeHtml(title)}">
          </div>
        ` : ""}

        <!-- ✅ 按你的要求：文章页不再显示 summary -->

        <section class="content">
          ${blocksHtml || textHtml || ""}
          ${releaseHtml || ""}
        </section>

        ${galleryHtml || ""}
      </article>
    `;
  }

  async function main() {
    const app = $("#app");
    if (!app) return;

    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, 1200);
    });

    const slug = norm(getParam("slug"));
    const id = norm(getParam("id"));

    try {
      const posts = await loadPosts();
      const post = posts.find(p =>
        (slug && norm(p.slug) === slug) ||
        (id && (norm(p.id) === id || norm(p.slug) === id))
      );

      if (!post) {
        app.innerHTML = `<div class="error"><b>Not found</b><div style="margin-top:8px;">slug=${escapeHtml(slug)} id=${escapeHtml(id)}</div></div>`;
        return;
      }

      app.innerHTML = renderPost(post);

    } catch (err) {
      app.innerHTML = `<div class="error"><b>Load failed</b><div style="margin-top:8px;">${escapeHtml(err.message || err)}</div></div>`;
    }
  }

  main();
})();
