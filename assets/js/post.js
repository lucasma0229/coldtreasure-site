// /assets/js/post.js
(() => {
  const $app = document.getElementById("app");

  const esc = (s = "") =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  const getParam = (name) => {
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch { return ""; }
  };

  const norm = (s = "") => String(s ?? "").trim();

  const addCacheBuster = (url, v) => {
    const s = String(url || "");
    if (!s) return "";
    // 已有 query 就不强加，避免破坏签名 URL（Notion/S3）
    return s.includes("?") ? s : `${s}?v=${encodeURIComponent(v || "1")}`;
  };

  const showError = (msg) => {
    $app.innerHTML = `<div class="error"><b>Load failed</b><div style="margin-top:8px;">${esc(msg)}</div></div>`;
  };

  // ✅ 从 /api/posts 读取（Notion + 静态已合并）
  async function loadPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Failed to load /api/posts (${res.status})`);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts; // debug=1 兼容
    return [];
  }

  // ✅ 旧静态 blocks 渲染
  function renderBlocks(blocks) {
    if (!Array.isArray(blocks)) return "";
    return blocks.map((b) => {
      const type = String(b?.type || "").toLowerCase();

      if (type === "h2") return `<h2>${esc(b?.text || "")}</h2>`;
      if (type === "p") return `<p>${esc(b?.text || "")}</p>`;
      if (type === "quote" || type === "blockquote") return `<div style="margin:14px 0;padding:10px 12px;border-left:3px solid rgba(0,0,0,.12);background:rgba(0,0,0,.03);border-radius:10px;">${esc(b?.text || "")}</div>`;

      if (type === "ul") {
        const items = Array.isArray(b?.items) ? b.items : [];
        return `<ul>${items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>`;
      }

      if (type === "ol") {
        const items = Array.isArray(b?.items) ? b.items : [];
        return `<ol>${items.map((it) => `<li>${esc(it)}</li>`).join("")}</ol>`;
      }

      // 兜底
      const t = b?.text != null ? String(b.text) : "";
      return t ? `<p>${esc(t)}</p>` : "";
    }).join("");
  }

  // ✅ 兼容三种 content：
  // 1) string（Notion）
  // 2) array（旧静态 blocks）
  // 3) string but JSON（旧静态被序列化）
  function renderContent(post) {
    const c = post?.content;

    if (Array.isArray(c)) return renderBlocks(c);

    const s = String(c ?? "").trim();
    if (!s) return "";

    // 可能是 JSON 字符串
    if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return renderBlocks(parsed);
      } catch { /* ignore */ }
    }

    // 普通文本：按空行分段
    const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    return `<p>${esc(s)}</p>`;
  }

  function pickPost(posts, slug, id) {
    const s = norm(slug);
    const i = norm(id);

    if (s) {
      const hit = posts.find(p => norm(p?.slug) === s);
      if (hit) return hit;
    }
    if (i) {
      // 旧文章：很多用 id
      const hit = posts.find(p => norm(p?.id) === i);
      if (hit) return hit;

      // 兜底：有时旧数据把 id 放在 slug（或反过来）
      const hit2 = posts.find(p => norm(p?.slug) === i);
      if (hit2) return hit2;
    }
    return null;
  }

  function renderGallery(urls) {
    const arr = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!arr.length) return "";
    return `
      <section class="gallery">
        <h2>Gallery</h2>
        <div class="grid">
          ${arr.map(u => `<img src="${esc(addCacheBuster(u, "1"))}" alt="" loading="lazy">`).join("")}
        </div>
      </section>
    `;
  }

  async function main() {
    // 等 header/footer include 注入（避免布局跳）
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, 1200);
    });

    const slug = getParam("slug");
    const id = getParam("id");

    if (!slug && !id) {
      showError("Missing slug or id");
      return;
    }

    try {
      const posts = await loadPosts();
      const post = pickPost(posts, slug, id);

      if (!post) {
        showError("Post not found");
        return;
      }

      const title = post.title || "Untitled";
      const date = post.date || "";
      const brand = post.brand || "";
      const summary = (post.summary || "").trim();
      const cover = post.cover || post.hero || post.thumb || post.image || "";
      const gallery = post.gallery || [];

      // hero focus（可选字段）
      if (post?.hero_focus) {
        document.documentElement.style.setProperty("--hero-focus", String(post.hero_focus));
      }

      const metaBits = [];
      if (brand) metaBits.push(esc(brand));
      if (date) metaBits.push(esc(date));
      if (Array.isArray(post.keywords) && post.keywords.length) {
        metaBits.push("@ " + esc(post.keywords.slice(0, 4).join(" / ")));
      }

      const heroHtml = cover
        ? `<div class="hero"><img src="${esc(addCacheBuster(cover, date || "1"))}" alt="${esc(title)}" loading="lazy"></div>`
        : "";

      const summaryHtml = summary ? `<div class="summary">${esc(summary)}</div>` : "";
      const contentHtml = `<div class="content">${renderContent(post)}</div>`;
      const galleryHtml = renderGallery(gallery);

      $app.innerHTML = `
        <header>
          <h1>${esc(title)}</h1>
          <div class="meta">${metaBits.join(" · ")}</div>
        </header>
        ${heroHtml}
        ${summaryHtml}
        ${contentHtml}
        ${galleryHtml}
      `;

      document.title = `ColdTreasure | ${title}`;
    } catch (err) {
      showError(err?.message || String(err));
    }
  }

  // go
  if ($app) main();
})();
