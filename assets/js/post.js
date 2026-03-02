// /assets/js/post.js
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Notion / presigned urls: do NOT append any query params
  function isSignedUrl(u) {
    const s = String(u || "");
    return /[?&]X-Amz-/i.test(s) || /notion\.so\/image/i.test(s);
  }

  // Only add cache-bust for local/static assets (optional)
  function withBust(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (isSignedUrl(u)) return u;
    if (/^https?:\/\//i.test(u)) return u;
    const v = `v=${Date.now()}`;
    return u.includes("?") ? `${u}&${v}` : `${u}?${v}`;
  }

  // ✅ 同时支持：
  // 1) ?slug=xxx
  // 2) ?id=xxx
  // 3) /post/<slug-or-id> 或 /post/<slug-or-id>/
  function getSlugOrId() {
    let slug = "";
    let id = "";

    try {
      const u = new URL(location.href);
      slug = (u.searchParams.get("slug") || "").trim();
      id = (u.searchParams.get("id") || "").trim();
    } catch {}

    if (!slug && !id) {
      const path = String(location.pathname || "");
      const m = path.match(/^\/post\/([^\/?#]+)\/?$/i);
      if (m && m[1]) slug = decodeURIComponent(m[1]);
    }

    return { slug, id };
  }

  // -------- canonical / URL normalize --------
  function setCanonical(cleanPath) {
    if (!cleanPath) return;
    const href = `${location.origin}${cleanPath}`;
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      document.head.appendChild(el);
    }
    el.setAttribute("href", href);
  }

  // 把 ?slug=xxx / ?id=xxx 规范化为 /post/<key>（不刷新）
  function normalizeToCleanPath(key) {
    const s = String(key || "").trim();
    if (!s) return;

    const u = new URL(location.href);
    const cleanPath = `/post/${encodeURIComponent(s)}`;

    const alreadyClean =
      u.pathname.toLowerCase() === `/post/${s}`.toLowerCase() ||
      u.pathname.toLowerCase() === `/post/${s}/`.toLowerCase();

    const hasSlugQ = u.searchParams.has("slug");
    const hasIdQ = u.searchParams.has("id");

    if ((hasSlugQ || hasIdQ) && !alreadyClean) {
      history.replaceState(null, "", cleanPath);
    }

    setCanonical(cleanPath);
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
    if (!res.ok) {
      const msg = data?.error || `Failed to load /api/posts (${res.status})`;
      throw new Error(msg);
    }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts; // debug mode兼容
    return [];
  }

  // -------- blocks rendering --------
  function renderBlocksToFragment(blocks) {
    const frag = document.createDocumentFragment();
    if (!Array.isArray(blocks)) return frag;

    for (const b of blocks) {
      const type = String(b?.type || "").toLowerCase();

      if (type === "h2") {
        const t = String(b?.text || "").trim();
        if (!t) continue;
        const el = document.createElement("h2");
        el.textContent = t;
        frag.appendChild(el);
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

  function looksLikeBlocksJson(contentStr) {
    const s = String(contentStr || "").trim();
    return (s.startsWith("[") || s.startsWith("{")) && s.includes('"type"');
  }

  function setContentInto(container, post) {
    const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : null;
    if (blocks && blocks.length) {
      container.innerHTML = "";
      container.appendChild(renderBlocksToFragment(blocks));
      return;
    }

    const s = String(post?.content || "").trim();
    if (!s) {
      container.innerHTML = `<p class="muted">No content.</p>`;
      return;
    }

    if (looksLikeBlocksJson(s)) {
      try {
        const parsed = JSON.parse(s);
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.content)
          ? parsed.content
          : null;
        if (Array.isArray(arr)) {
          container.innerHTML = "";
          container.appendChild(renderBlocksToFragment(arr));
          return;
        }
      } catch {}
    }

    container.innerHTML = "";
    const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      const p = document.createElement("p");
      p.textContent = part;
      container.appendChild(p);
    }
  }

  // -------- release handling --------
  function normalizeReleaseLines(post) {
    if (Array.isArray(post?.release_lines) && post.release_lines.length) {
      return post.release_lines.map((x) => String(x || "").trim()).filter(Boolean);
    }
    const s = String(post?.release_info || "").trim();
    if (!s) return [];
    const lines = s.includes("\n") ? s.split(/\r?\n/) : s.split(/；|;|\|/);
    return lines.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function renderReleaseInto(bodyEl, lines) {
    bodyEl.innerHTML = "";
    const sec = bodyEl.closest("[data-release]") || bodyEl.closest(".post-release");

    if (!lines || !lines.length) {
      if (sec) sec.hidden = true;
      return;
    }

    const ul = document.createElement("ul");
    for (const line of lines) {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    }
    bodyEl.appendChild(ul);
    if (sec) sec.hidden = false;
  }

  // 旧文章：如果正文里包含“发售信息”标题，迁移到 release 区
  function extractReleaseFromContent(contentEl, releaseBodyEl) {
    if (!contentEl || !releaseBodyEl) return false;

    const headings = Array.from(contentEl.querySelectorAll("h2, h3, h4"));
    const hit = headings.find((h) => {
      const t = (h.textContent || "").trim().toLowerCase();
      return t === "发售信息" || t === "release info" || t === "release information";
    });
    if (!hit) return false;

    const collected = [];
    let node = hit.nextSibling;

    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === 1 && ["H2", "H3", "H4"].includes(node.tagName)) break;
      if (node.nodeType === 3 && !String(node.textContent || "").trim()) {
        node = next;
        continue;
      }
      collected.push(node);
      node = next;
    }

    hit.remove();

    const sec = releaseBodyEl.closest("[data-release]") || releaseBodyEl.closest(".post-release");
    if (!collected.length) {
      if (sec) sec.hidden = true;
      return true;
    }

    releaseBodyEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const n of collected) frag.appendChild(n);
    releaseBodyEl.appendChild(frag);

    if (sec) sec.hidden = false;
    return true;
  }

  // -------- template render --------
  function pickBrand(post) {
    const b = post?.brand;
    if (Array.isArray(b)) return String(b[0] || "").trim();
    return String(b || "").trim();
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
    const releaseSec = $("[data-release]", node);
    const releaseBodyEl = $("[data-release-body]", node);
    const gallerySec = $(".post-gallery", node);
    const gridEl = $(".post-grid", node);

    const title = post?.title || "Untitled";
    titleEl.textContent = title;

    const metaParts = [];
    if (post?.date) metaParts.push(escapeHtml(post.date));

    const brand = pickBrand(post);
    if (brand) metaParts.push(`@${escapeHtml(brand)}`);

    if (Array.isArray(post?.keywords)) {
      for (const k of post.keywords) {
        const kk = String(k || "").trim();
        if (kk) metaParts.push(`@${escapeHtml(kk)}`);
      }
    }
    metaEl.innerHTML = metaParts.join(" · ");

    const cover = String(post?.cover || "").trim();
    if (cover) {
      heroImg.src = withBust(cover);
      heroImg.alt = title;
      heroImg.loading = "eager";
    } else {
      const fig = heroImg.closest(".hero");
      if (fig) fig.hidden = true;
    }

    summaryEl.textContent = "";
    summaryEl.hidden = true;

    setContentInto(contentEl, post);

    const releaseLines = normalizeReleaseLines(post);
    if (releaseLines.length) {
      renderReleaseInto(releaseBodyEl, releaseLines);
      if (releaseSec) releaseSec.hidden = false;
    } else {
      const moved = extractReleaseFromContent(contentEl, releaseBodyEl);
      if (!moved && releaseSec) releaseSec.hidden = true;
    }

    const gallery = Array.isArray(post?.gallery) ? post.gallery : [];
    if (gallery.length) {
      gridEl.innerHTML = "";
      for (const u of gallery) {
        const src = withBust(u);
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

  function trySortRecent(posts) {
    const arr = Array.isArray(posts) ? posts.slice() : [];
    const scored = arr.map((p, idx) => {
      const raw = String(p?.date || "").trim();
      const t = raw ? Date.parse(raw) : NaN;
      return { p, idx, t: Number.isFinite(t) ? t : NaN };
    });

    const hasAny = scored.some((x) => Number.isFinite(x.t));
    if (!hasAny) return arr;

    scored.sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : -Infinity;
      const bt = Number.isFinite(b.t) ? b.t : -Infinity;
      if (bt !== at) return bt - at;
      return a.idx - b.idx;
    });

    return scored.map((x) => x.p);
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
      const posts = trySortRecent(await loadPosts());
      const items = posts.slice(0, 10);

      if (!items.length) {
        listEl.innerHTML = `<div class="muted">暂无文章。</div>`;
        return;
      }

      listEl.innerHTML = items
        .map((p) => {
          const key = String(p?.slug || p?.id || "").trim();
          const title = String(p?.title || key || "Untitled");
          const date = String(p?.date || "").trim();

          const href = key ? `/post/${encodeURIComponent(key)}` : "/news/";
          const meta = date
            ? `<div class="muted" style="font-size:13px; margin-top:4px;">${escapeHtml(date)}</div>`
            : "";

          return `
            <a class="recent-item" href="${href}" style="display:block; padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; text-decoration:none; color:inherit;">
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

  // -------- main --------
  (async function main() {
    const app = $("#app");
    if (!app) return;

    await waitModulesLoaded();

    const { slug, id } = getSlugOrId();

    if (!slug && !id) {
      await renderEmptyState(app);
      return;
    }

    try {
      const list = await loadPosts();

      // ✅ 关键修复：slug 优先，但 slug 也允许匹配 id（因为静态 posts.json 没 slug）
      const hit = list.find((p) => {
        const pSlug = String(p?.slug || "").trim();
        const pId = String(p?.id || "").trim();

        if (slug) return pSlug === slug || pId === slug;
        return pId === id;
      });

      if (!hit) {
        app.innerHTML = renderError(`Post not found: ${slug || id}`);
        return;
      }

      // ✅ canonical/normalize：优先 slug，否则 id
      const key = String(hit?.slug || hit?.id || "").trim();
      if (key) normalizeToCleanPath(key);

      app.innerHTML = "";
      app.appendChild(buildPostDom(hit));
    } catch (e) {
      app.innerHTML = renderError(e?.message || String(e));
    }
  })();
})();
