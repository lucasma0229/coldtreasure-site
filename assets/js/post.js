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

      // 兼容：如果有人把字符串塞进 blocks
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
        // 默认段落
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

    // 以空行分段
    const paras = t.split(/\n\s*\n/).map(s => norm(s)).filter(Boolean);
    return paras.map(p => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`).join("\n");
  }

  function renderReleaseInfo(releaseInfo) {
    const t = norm(releaseInfo);
    if (!t) return "";

    // 支持多行（你 Notion 里就是多行）
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
            <img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">
          `).join("")}
        </div>
      </section>
    `;
  }

  function pickHero(post) {
    return norm(post.cover) || "";
  }

  function pickSummary(post) {
    const s = norm(post.summary);
    if (s) return s;
    // 没 summary 就从 content 截取
    const c = norm(post.content);
    if (!c) return "";
    return c.length > 160 ? (c.slice(0, 160) + "…") : c;
  }

  function renderPost(post) {
    const title = norm(post.title) || "Untitled";
    const date = norm(post.date);
    const brand = norm(post.brand);
    const keywords = Array.isArray(post.keywords) ? post.keywords : [];
    const hero = pickHero(post);
    const summary = pickSummary(post);

    // ✅ 关键：优先用 content_blocks（旧文），否则用 content（新文）
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
            <img src="${escapeHtml(hero)}?v=${encodeURIComponent(date || "1")}" alt="${escapeHtml(title)}">
          </div>
        ` : ""}

        ${summary ? `<p class="summary">${escapeHtml(summary)}</p>` : ""}

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

    // 等 include 模块先注入（避免顶部跳动）
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

      // 兼容：既支持 ?slug= 也支持 ?id=
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
