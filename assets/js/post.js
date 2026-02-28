// /assets/js/post.js
(() => {
  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Notion / S3 presigned urls: do NOT append any query params
  function isSignedUrl(u) {
    const s = String(u || "");
    return /[?&]X-Amz-/i.test(s) || /notion\.so\/image/i.test(s);
  }

  // Only add cache-bust for local static assets (optional).
  function withBust(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (isSignedUrl(u)) return u; // keep intact
    const v = `v=${Date.now()}`;
    return u.includes("?") ? `${u}&${v}` : `${u}?${v}`;
  }

  function getSlugOrId() {
    try {
      const sp = new URL(location.href).searchParams;
      const slug = (sp.get("slug") || "").trim();
      const id = (sp.get("id") || "").trim();
      return { slug, id };
    } catch {
      return { slug: "", id: "" };
    }
  }

  async function waitModulesLoaded() {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, 1200);
    });
  }

  async function loadPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok) throw new Error(data?.error || `Failed to load /api/posts (${res.status})`);

    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts; // debug mode compatibility
    return [];
  }

  // -------- content rendering (fix old "乱码" json blocks) --------
  function looksLikeBlocks(contentStr) {
    const s = String(contentStr || "").trim();
    return (s.startsWith("[") || s.startsWith("{")) && s.includes('"type"');
  }

  function renderBlocks(blocks) {
    if (!Array.isArray(blocks)) return "";

    return blocks
      .map((b) => {
        const type = String(b?.type || "").toLowerCase();
        if (type === "p") {
          const t = escapeHtml(b?.text || "");
          return t ? `<p>${t}</p>` : "";
        }
        if (type === "h2") {
          const t = escapeHtml(b?.text || "");
          return t ? `<h2>${t}</h2>` : "";
        }
        if (type === "ul") {
          const items = Array.isArray(b?.items) ? b.items : [];
          const lis = items
            .map((it) => `<li>${escapeHtml(it || "")}</li>`)
            .join("");
          return lis ? `<ul>${lis}</ul>` : "";
        }
        // fallback
        const t = escapeHtml(b?.text || "");
        return t ? `<p>${t}</p>` : "";
      })
      .filter(Boolean)
      .join("");
  }

  function renderContent(contentStr) {
    const s = String(contentStr || "").trim();
    if (!s) return "";

    // If it's blocks JSON from old static posts.json
    if (looksLikeBlocks(s)) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return renderBlocks(parsed);
        // sometimes wrapped object: {content:[...]}
        if (Array.isArray(parsed?.content)) return renderBlocks(parsed.content);
      } catch {
        // fall through
      }
    }

    // Plain text: split by blank lines into paragraphs
    const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  }

  // -------- release info rendering --------
  function renderReleaseInfo(releaseInfo, title) {
    const s = String(releaseInfo || "").trim();
    if (!s) return "";

    // If user already wrote multiple lines, use them; else split by common separators
    const lines = s.includes("\n")
      ? s.split("\n")
      : s.split(/；|;|\|/);

    const cleaned = lines.map((x) => x.trim()).filter(Boolean);

    // If it looks like a single sentence, keep as one item; else list items
    const items = cleaned.length ? cleaned : [s];

    const lis = items.map((it) => `<li>${escapeHtml(it)}</li>`).join("");

    // Optional first item: model name
    const head = title ? `<li>鞋款：${escapeHtml(title)}</li>` : "";

    return `
      <h2>发售信息</h2>
      <ul>
        ${head}
        ${lis}
      </ul>
    `;
  }

  // -------- template --------
  function renderPost(post) {
    const title = post?.title || "Untitled";
    const date = post?.date || "";
    const brand = post?.brand || "";
    const keywords = Array.isArray(post?.keywords) ? post.keywords : [];
    const cover = String(post?.cover || "").trim();
    const gallery = Array.isArray(post?.gallery) ? post.gallery : [];

    const metaParts = [];
    if (date) metaParts.push(escapeHtml(date));
    if (brand) metaParts.push(`@${escapeHtml(brand)}`);
    for (const k of keywords) metaParts.push(`@${escapeHtml(k)}`);

    const heroHtml = cover
      ? `
        <div class="hero">
          <img src="${escapeHtml(withBust(cover))}" alt="${escapeHtml(title)}" loading="eager" />
        </div>
      `
      : "";

    // ✅ summary NOT shown on post page — only content
    const contentHtml = renderContent(post?.content);

    const releaseHtml = renderReleaseInfo(post?.release_info, title);

    const galleryHtml =
      gallery.length > 0
        ? `
        <section class="gallery">
          <h2>Gallery</h2>
          <div class="grid">
            ${gallery
              .map((u) => {
                const src = withBust(u); // will NOT bust for signed urls
                return `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" />`;
              })
              .join("")}
          </div>
        </section>
      `
        : "";

    return `
      <article>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${metaParts.join(" · ")}</div>
        ${heroHtml}
        <section class="content">
          ${contentHtml || `<p class="muted">No content.</p>`}
          ${releaseHtml}
        </section>
        ${galleryHtml}
      </article>
    `;
  }

  function renderError(msg) {
    return `<div class="error"><b>Load failed</b><div style="margin-top:8px;">${escapeHtml(msg)}</div></div>`;
  }

  // -------- main --------
  (async function main() {
    const app = $("#app");
    if (!app) return;

    await waitModulesLoaded();

    const { slug, id } = getSlugOrId();
    if (!slug && !id) {
      app.innerHTML = renderError("Missing ?slug=... or ?id=...");
      return;
    }

    try {
      const list = await loadPosts();

      const hit = list.find((p) => {
        const pSlug = String(p?.slug || "").trim();
        const pId = String(p?.id || "").trim();
        if (slug) return pSlug === slug;
        return pId === id;
      });

      if (!hit) {
        app.innerHTML = renderError(`Post not found: ${slug || id}`);
        return;
      }

      app.innerHTML = renderPost(hit);
    } catch (e) {
      app.innerHTML = renderError(e?.message || String(e));
    }
  })();
})();
