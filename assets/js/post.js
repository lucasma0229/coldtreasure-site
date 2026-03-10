(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[m];
    });

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

  function setMetaTag(selector, createFn, attrs) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = createFn();
      document.head.appendChild(el);
    }

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || String(v).trim() === "") continue;
      el.setAttribute(k, String(v));
    }
  }

  function setTitle(t) {
    const title = String(t || "").trim();
    if (title) document.title = title;
  }

  function stripText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function pickExcerpt(post, maxLen = 160) {
    const explicit = stripText(post?.excerpt || post?.summary || "");
    if (explicit) return explicit.slice(0, maxLen);

    const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : null;
    if (blocks && blocks.length) {
      for (const b of blocks) {
        const type = String(b?.type || "").toLowerCase();
        if (type === "p" || type === "paragraph" || !type) {
          const t = stripText(b?.text || "");
          if (t) return t.slice(0, maxLen);
        }
      }
    }

    const raw = stripText(post?.content || "");
    if (!raw) return "";
    return raw.slice(0, maxLen);
  }

  function applyAutoMeta(post, canonPath) {
    const pageTitle = String(post?.title || "Post").trim();
    const brandSuffix = "ColdTreasure";
    const fullTitle = pageTitle ? `${pageTitle} | ${brandSuffix}` : brandSuffix;
    const desc = pickExcerpt(post, 160);
    const cover = String(post?.cover || "").trim();
    const url = canonPath ? `${location.origin}${canonPath}` : location.href;

    setTitle(fullTitle);

    setMetaTag(
      'meta[name="description"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        return m;
      },
      { content: desc }
    );

    setMetaTag(
      'meta[property="og:title"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:title");
        return m;
      },
      { content: pageTitle }
    );

    setMetaTag(
      'meta[property="og:description"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:description");
        return m;
      },
      { content: desc }
    );

    setMetaTag(
      'meta[property="og:image"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:image");
        return m;
      },
      { content: cover }
    );

    setMetaTag(
      'meta[property="og:type"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:type");
        return m;
      },
      { content: "article" }
    );

    setMetaTag(
      'meta[property="og:site_name"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:site_name");
        return m;
      },
      { content: brandSuffix }
    );

    setMetaTag(
      'meta[property="og:url"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("property", "og:url");
        return m;
      },
      { content: url }
    );

    setMetaTag(
      'meta[name="twitter:card"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:card");
        return m;
      },
      { content: "summary_large_image" }
    );

    setMetaTag(
      'meta[name="twitter:title"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:title");
        return m;
      },
      { content: pageTitle }
    );

    setMetaTag(
      'meta[name="twitter:description"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:description");
        return m;
      },
      { content: desc }
    );

    setMetaTag(
      'meta[name="twitter:image"]',
      () => {
        const m = document.createElement("meta");
        m.setAttribute("name", "twitter:image");
        return m;
      },
      { content: cover }
    );
  }

  function setJsonLd(id, schemaObject) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
    }

    el.textContent = JSON.stringify(schemaObject, null, 2);

    if (!document.head.contains(el)) {
      document.head.appendChild(el);
    }
  }

  function setArticleSchema(post, canonPath) {
    const title = String(post?.title || "").trim();
    const image = String(post?.cover || "").trim();
    const datePublished = String(post?.publishAt || post?.date || "").trim();
    const authorName = String(post?.author || "").trim() || "ColdTreasure";
    const description = pickExcerpt(post, 160);
    const url = canonPath ? `${location.origin}${canonPath}` : location.href;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": url,
      },
      url,
      ...(image ? { image: [image] } : {}),
      ...(datePublished ? { datePublished } : {}),
      ...(datePublished ? { dateModified: datePublished } : {}),
      ...(description ? { description } : {}),
      author: {
        "@type": "Person",
        name: authorName,
      },
      publisher: {
        "@type": "Organization",
        name: "ColdTreasure",
        url: "https://coldtreasure.com",
        logo: {
          "@type": "ImageObject",
          url: "https://coldtreasure.com/CT_TRUE_16.png",
        },
      },
    };

    setJsonLd("ld-json-article", schema);
  }

  function setBreadcrumbSchema(post, canonPath) {
    const title = String(post?.title || "").trim() || "Post";
    const articleUrl = canonPath ? `${location.origin}${canonPath}` : location.href;

    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://coldtreasure.com/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "News",
          item: "https://coldtreasure.com/news/",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: title,
          item: articleUrl,
        },
      ],
    };

    setJsonLd("ld-json-breadcrumb", schema);
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

  function getKey() {
    let slug = "";
    let id = "";

    try {
      const u = new URL(location.href);
      slug = (u.searchParams.get("slug") || "").trim();
      id = (u.searchParams.get("id") || "").trim();
    } catch {}

    if (!slug && !id) {
      const m = String(location.pathname || "").match(/^\/post\/([^/?#]+)\/?$/i);
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

    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts;
    return [];
  }

  async function loadPostByKey({ slug, id, key }) {
    const tryUrls = [];
    const s = String(slug || "").trim();
    const i = String(id || "").trim();
    const k = String(key || "").trim();

    if (s) tryUrls.push(`/api/post?slug=${encodeURIComponent(s)}`);
    if (i) tryUrls.push(`/api/post?id=${encodeURIComponent(i)}`);
    if (k && k !== s && k !== i) tryUrls.push(`/api/post?key=${encodeURIComponent(k)}`);

    for (const url of tryUrls) {
      try {
        const res = await fetch(`${url}&v=${Date.now()}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) continue;
        if (data && typeof data === "object") return data;
      } catch {}
    }

    return null;
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
    const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : null;
    if (blocks && blocks.length) {
      container.innerHTML = "";
      container.appendChild(renderBlocks(blocks));
      return;
    }

    const s = String(post?.content || "").trim();
    if (!s) {
      container.innerHTML = `<p class="muted">No content.</p>`;
      return;
    }

    container.innerHTML = "";
    const parts = s
      .split(/\n{2,}/)
      .map((x) => x.trim())
      .filter(Boolean);

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
    if (!releaseBodyEl) return;

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
    if (titleEl) titleEl.textContent = title;

    const metaParts = [];
    const publishDate = String(post?.publishAt || post?.date || "").trim();
    if (publishDate) metaParts.push(escapeHtml(publishDate));

    const author = String(post?.author || "").trim();
    if (author) metaParts.push(`By ${escapeHtml(author)}`);

    if (post?.brand) metaParts.push(`@${escapeHtml(post.brand)}`);

    if (Array.isArray(post?.keywords)) {
      for (const k of post.keywords) {
        const kk = String(k || "").trim();
        if (kk) metaParts.push(`@${escapeHtml(kk)}`);
      }
    }

    if (metaEl) metaEl.innerHTML = metaParts.join(" · ");

    const cover = String(post?.cover || "").trim();
    if (cover && heroImg) {
      heroImg.src = cover;
      heroImg.alt = title;
      heroImg.loading = "eager";
    } else if (heroImg) {
      const fig = heroImg.closest(".hero");
      if (fig) fig.hidden = true;
    }

    if (summaryEl) {
      summaryEl.textContent = "";
      summaryEl.hidden = true;
    }

    if (contentEl) setContent(contentEl, post);

    const releaseLines = normalizeReleaseLines(post);
    renderRelease(releaseBodyEl, releaseLines);

    const gallery = Array.isArray(post?.gallery) ? post.gallery : [];
    if (gallery.length && gridEl && gallerySec) {
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
    } else if (gallerySec) {
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
          const date = String(p?.publishAt || p?.date || "").trim();
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

  function isAlreadyCanonical(canonPath) {
    try {
      const u = new URL(location.href);
      const cleanPathNow = String(u.pathname || "").replace(/\/+$/, "") || "/";
      const cleanCanon = String(canonPath || "").replace(/\/+$/, "") || "/";
      const hasQuery = u.searchParams && Array.from(u.searchParams.keys()).length > 0;
      return cleanPathNow === cleanCanon && !hasQuery;
    } catch {
      return false;
    }
  }

  (async function main() {
    const app = $("#app");
    if (!app) return;

    await waitModulesLoaded();

    (function normalizePostUrlOnce() {
      try {
        const u = new URL(location.href);
        if (u.pathname !== "/post/" && u.pathname !== "/post") return;

        const id = (u.searchParams.get("id") || "").trim();
        const slug = (u.searchParams.get("slug") || "").trim();
        const key = slug || id;
        if (!key) return;

        const destPath = `/post/${encodeURIComponent(key)}`;
        if (location.pathname === destPath) return;

        const lockKey = "ct_post_norm_lock";
        if (sessionStorage.getItem(lockKey) === destPath) return;
        sessionStorage.setItem(lockKey, destPath);

        location.replace(destPath);
      } catch {}
    })();

    const keyInfo = getKey();
    const { key, slug, id } = keyInfo;

    if (!key) {
      await renderEmptyState(app);
      return;
    }

    try {
      let hit = await loadPostByKey({ slug, id, key });

      if (!hit) {
        const list = await loadPosts();
        hit = list.find((p) => {
          const pSlug = String(p?.slug || "").trim();
          const pId = String(p?.id || "").trim();
          return pSlug === key || pId === key;
        });
      }

      if (!hit) {
        app.innerHTML = renderError(`Post not found: ${key}`);
        return;
      }

      const canonSlug = String(hit?.slug || hit?.id || "").trim();
      const canonPath = canonSlug ? `/post/${encodeURIComponent(canonSlug)}` : "";

      if (canonPath) setCanonical(canonPath);

      applyAutoMeta(hit, canonPath);
      setArticleSchema(hit, canonPath);
      setBreadcrumbSchema(hit, canonPath);

      if (canonPath && !isAlreadyCanonical(canonPath)) {
        try {
          history.replaceState(null, "", canonPath);
        } catch {}
      }

      app.innerHTML = "";
      app.appendChild(buildPostDom(hit));
    } catch (e) {
      app.innerHTML = renderError(e?.message || String(e));
    }
  })();
})();
