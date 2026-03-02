// assets/js/post.js
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  function setCanonical(path) {
    if (!path) return;
    const href = `${location.origin}${path}`;
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
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

  // ✅ 支持：
  // - /post/<slugOrId>
  // - /post/?slug=xxx
  // - /post/?id=xxx
  function getKey() {
    let slug = "";
    let id = "";

    try {
      const u = new URL(location.href);
      slug = (u.searchParams.get("slug") || "").trim();
      id = (u.searchParams.get("id") || "").trim();
    } catch {}

    if (!slug && !id) {
      const m = String(location.pathname || "").match(/^\/post\/([^\/?#]+)\/?$/i);
      if (m && m[1]) slug = decodeURIComponent(m[1]);
    }

    const key = (slug || id || "").trim();
    return { key, slug, id };
  }

  async function loadPosts() {
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.error || `Failed to load /api/posts (${res.status})`;
      throw new Error(msg);
    }

    // 兼容两种返回：数组 or {posts:[]}
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts;
    return [];
  }

  function renderBlocks(blocks) {
    const frag = document.createDocumentFragment();
    if (!Array.isArray(blocks)) return frag;

    for (const b of blocks) {
      const type = String(b?.type || "").toLowerCase();

      if (type === "h2") {
        const t = String(b?.text || "").trim();
        if (!t) continue;
        const h2 = document.createElement("h2");
        h2.textContent = t;
        frag.appendChild(h2);
        continue;
      }

      if (type === "ul") {
        const items = Array.isArray(b?.items) ? b.items : [];
        if (!items.length) continue;
        const ul = document.createElement("ul");
        for (const it of items) {
          const text = String(it || "").trim();
          if (!text) continue;
          const li = document.createElement("li");
          li.textContent = text;
          ul.appendChild(li);
        }
        if (ul.childNodes.length) frag.appendChild(ul);
        continue;
      }

      const t = String(b?.text || "").trim();
      if (!t) continue;
      const p = document.createElement("p");
      p.textContent = t;
      frag.appendChild(p);
    }

    return frag;
  }

  function setContent(container, post) {
    // 优先 blocks
    const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : null;
    if (blocks && blocks.length) {
      container.innerHTML = "";
      container.appendChild(renderBlocks(blocks));
      return;
    }

    // 次选 content（纯文本）
    const s = String(post?.content || "").trim();
    if (!s) {
      container.innerHTML = `<p class="muted">No content.</p>`;
      return;
    }

    container.innerHTML = "";
    const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      const p = document.createElement("p");
      p.textContent = part;
      container.appendChild(p);
    }
  }

  function normalizeReleaseLines(post) {
    if (Array.isArray(post?.release_lines) && post.release_lines.length) {
      return post.release_lines.map((x) => String(x || "").trim()).filter(Boolean);
    }
    const s = String(post?.release_info || "").trim();
    if (!s) return [];
    const lines = s.includes("\n") ? s.split(/\r?\n/) : s.split(/；|;|\|/);
    return lines.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function renderRelease(releaseBodyEl, lines) {
    releaseBodyEl.innerHTML = "";
    const sec =
      releaseBodyEl.closest("[data-release]") || releaseBodyEl.closest(".post-release");

    if (!lines.length) {
      if (sec) sec.hidden = true;
      return;
    }

    const ul = document.createElement("ul");
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
    releaseBodyEl.appendChild(ul);
    if (sec) sec.hidden = false;
  }

  function buildPostDom(post) {
    const tpl = $("#tpl-post");
    if (!tpl) {
      const fallback = document.createElement("article");
      fallback.innerHTML = `<h1>${escapeHtml(post?.title || "Untitled")}</h1>`;
      return fallback;
    }

    const node = tpl.content.firstElementChild.cloneNode(true);

    const titleEl = $(".post-title", node);
    const metaEl = $(".post-meta", node);
    const heroImg = $(".post-hero", node);
    const summaryEl = $(".post-summary", node);
    const contentEl = $(".post-content", node);
    const releaseBodyEl = $("[data-release-body]", node);
    const gallerySec = $(".post-gallery", node);
    const gridEl = $(".post-grid", node);

    const title = String(post?.title || "Untitled");
    titleEl.textContent = title;

    const metaParts = [];
    if (post?.date) metaParts.push(escapeHtml(post.date));
    if (post?.brand) metaParts.push(`@${escapeHtml(post.brand)}`);
    if (Array.isArray(post?.keywords)) {
      for (const k of post.keywords) {
        const kk = String(k || "").trim();
        if (kk) metaParts.push(`@${escapeHtml(kk)}`);
      }
    }
    metaEl.innerHTML = metaParts.join(" · ");

    const cover = String(post?.cover || "").trim();
    if (cover) {
      heroImg.src = cover;
      heroImg.alt = title;
      heroImg.loading = "eager";
    } else {
      const fig = heroImg.closest(".hero");
      if (fig) fig.hidden = true;
    }

    summaryEl.textContent = "";
    summaryEl.hidden = true;

    setContent(contentEl, post);

    const releaseLines = normalizeReleaseLines(post);
    renderRelease(releaseBodyEl, releaseLines);

    const gallery = Array.isArray(post?.gallery) ? post.gallery : [];
    if (gallery.length) {
      gridEl.innerHTML = "";
      for (const u of gallery) {
        const src = String(u || "").trim();
        if (!src) continue;
        const img = document.createElement("img");
        img.src = src;
        img.alt = title;
        img.loading = "lazy";
        gridEl.appendChild(img);
      }
      gallerySec.hidden = false;
    } else {
      gallerySec.hidden = true;
    }

    return node;
  }

  function renderError(msg) {
    return `
      <div class="error">
        <b>Load failed</b>
        <div style="margin-top:8px;">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  async function renderEmptyState(app) {
    app.innerHTML = `
      <section class="post-empty" style="padding:18px 0;">
        <h1 style="margin:0 0 8px 0;">Post</h1>
        <p class="muted" style="margin:0 0 14px 0;">
          你打开的是文章入口页。可从最新文章开始浏览，或回到 <a href="/news/">News</a>。
        </p>
        <div id="recentList" style="display:grid; gap:10px;"></div>
      </section>
    `;

    const listEl = $("#recentList", app);
    if (!listEl) return;

    try {
      const posts = await loadPosts();
      const items = posts.slice(0, 10);

      if (!items.length) {
        listEl.innerHTML = `<div class="muted">暂无文章。</div>`;
        return;
      }

      listEl.innerHTML = items
        .map((p) => {
          const slug = String(p?.slug || p?.id || "").trim();
          const title = String(p?.title || slug || "Untitled");
          const date = String(p?.date || "").trim();
          const href = slug ? `/post/${encodeURIComponent(slug)}` : "/news/";
          const meta = date
            ? `<div class="muted" style="font-size:13px; margin-top:4px;">${escapeHtml(date)}</div>`
            : "";
          return `
            <a href="${href}" style="display:block; padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; text-decoration:none; color:inherit;">
              <div style="font-weight:600; line-height:1.2;">${escapeHtml(title)}</div>
              ${meta}
            </a>
          `;
        })
        .join("");
    } catch {
      listEl.innerHTML = `<a href="/news/">去 News 浏览</a>`;
    }
  }

  (async function main() {
    const app = $("#app");
    if (!app) return;

    await waitModulesLoaded();

    const { key } = getKey();

    // /post/ 入口页
    if (!key) {
      await renderEmptyState(app);
      return;
    }

    try {
      const list = await loadPosts();

      // ✅ slug / id 任意命中
      const hit = list.find((p) => {
        const pSlug = String(p?.slug || "").trim();
        const pId = String(p?.id || "").trim();
        return pSlug === key || pId === key;
      });

      if (!hit) {
        app.innerHTML = renderError(`Post not found: ${key}`);
        return;
      }

      // ✅ 只设置 canonical，不做 replaceState（避免任何“看似重定向”的因素）
      const canonSlug = String(hit?.slug || hit?.id || "").trim();
      if (canonSlug) setCanonical(`/post/${encodeURIComponent(canonSlug)}`);

      app.innerHTML = "";
      app.appendChild(buildPostDom(hit));
    } catch (e) {
      app.innerHTML = renderError(e?.message || String(e));
    }
  })();
})();
