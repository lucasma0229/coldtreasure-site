// assets/js/post.js
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

  // Notion / S3 presigned urls: do NOT append any query params
  function isSignedUrl(u) {
    const s = String(u || "");
    return /[?&]X-Amz-/i.test(s) || /notion\.so\/image/i.test(s);
  }

  // Only add cache-bust for local/static assets (optional).
  function withBust(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    if (isSignedUrl(u)) return u; // keep intact
    // 对绝对外链不做处理（减少风险）
    if (/^https?:\/\//i.test(u)) return u;

    const v = `v=${Date.now()}`;
    return u.includes("?") ? `${u}&${v}` : `${u}?${v}`;
  }

  // ✅ 同时支持：
  // 1) ?slug=xxx
  // 2) ?id=xxx
  // 3) /post/<slug> 或 /post/<slug>/  (推荐)
  function getSlugOrId() {
    let slug = "";
    let id = "";

    // 1) query: ?slug=xxx / ?id=xxx
    try {
      const u = new URL(location.href);
      slug = (u.searchParams.get("slug") || "").trim();
      id = (u.searchParams.get("id") || "").trim();
    } catch {}

    // 2) path: /post/<slug> 或 /post/<slug>/
    if (!slug && !id) {
      const path = String(location.pathname || "");
      // 匹配 /post/xxx 或 /post/xxx/
      const m = path.match(/^\/post\/([^\/?#]+)\/?$/i);
      if (m && m[1]) slug = decodeURIComponent(m[1]);
    }

    return { slug, id };
  }

  // -------- canonical / URL normalize (Direction B) --------
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

  // 把 ?slug=xxx / ?id=xxx 规范化为 /post/<slug>（不刷新）
  // 注意：只有拿到 slug 才做，因为 canonical 目标是 /post/<slug>
  function normalizeToCleanSlugPath(slug) {
    const s = String(slug || "").trim();
    if (!s) return;

    const u = new URL(location.href);

    const alreadyClean =
      u.pathname.toLowerCase() === "/post/" + s.toLowerCase() ||
      u.pathname.toLowerCase() === "/post/" + s.toLowerCase() + "/";

    // 如果已经是 /post/<slug> 形态，保持不动（但 canonical 仍设置）
    const cleanPath = `/post/${encodeURIComponent(s)}`;

    // 只有当当前是 query 形态时，才 replaceState
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
    // 你原本这里是 no-store + v=Date.now()，保留（最稳）
    const res = await fetch(`/api/posts?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error || `Failed to load /api/posts (${res.status})`;
      throw new Error(msg);
    }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts; // debug mode compatibility
    return [];
  }

  // -------- content rendering (blocks / plaintext) --------
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

      // default: paragraph
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

    // 静态旧文：content 可能是 blocks JSON（string）
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
      } catch {
        // fall through
      }
    }

    // 纯文本：按空行分段
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
    // ✅ 新结构：优先用 API 的 release_lines（已在 API 层做过去重/去标题）
    if (Array.isArray(post?.release_lines) && post.release_lines.length) {
      return post.release_lines.map((x) => String(x || "").trim()).filter(Boolean);
    }

    // 兼容旧字段：release_info（string）
    const s = String(post?.release_info || "").trim();
    if (!s) return [];

    const lines = s.includes("\n") ? s.split(/\r?\n/) : s.split(/；|;|\|/);
    return lines.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function renderReleaseInto(bodyEl, lines) {
    bodyEl.innerHTML = "";

    if (!lines || !lines.length) {
      // 没有发售信息则隐藏整个模块（保持页面干净）
      const sec = bodyEl.closest("[data-release]") || bodyEl.closest(".post-release");
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

    const sec = bodyEl.closest("[data-release]") || bodyEl.closest(".post-release");
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

      // 遇到下一个标题就停
      if (node.nodeType === 1 && ["H2", "H3", "H4"].includes(node.tagName)) break;

      // 跳过空白文本
      if (node.nodeType === 3 && !String(node.textContent || "").trim()) {
        node = next;
        continue;
      }

      collected.push(node);
      node = next;
    }

    // 如果没收集到内容，不迁移，但移除标题本身
    if (!collected.length) {
      hit.remove();
      return true;
    }

    releaseBodyEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const n of collected) frag.appendChild(n); // append 会自动从原位置移除
    hit.remove();
    releaseBodyEl.appendChild(frag);

    const sec = releaseBodyEl.closest("[data-release]") || releaseBodyEl.closest(".post-release");
    if (sec) sec.hidden = false;

    return true;
  }

  // -------- template render --------
  function buildPostDom(post) {
    const tpl = $("#tpl-post");
    if (!tpl) {
      // 兜底：没模板就直接写到 #app（防止页面空白）
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

    // meta: date + @brand + @keywords
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

    // hero
    const cover = String(post?.cover || "").trim();
    if (cover) {
      heroImg.src = withBust(cover);
      heroImg.alt = title;
      heroImg.loading = "eager";
    } else {
      const fig = heroImg.closest(".hero");
      if (fig) fig.hidden = true;
    }

    // summary：保持隐藏（你原逻辑不展示）
    summaryEl.textContent = "";
    summaryEl.hidden = true;

    // content
    setContentInto(contentEl, post);

    // release：优先渲染新结构；如果没有，再尝试从正文提取旧结构
    const releaseLines = normalizeReleaseLines(post);
    if (releaseLines.length) {
      renderReleaseInto(releaseBodyEl, releaseLines);
      if (releaseSec) releaseSec.hidden = false;
    } else {
      const moved = extractReleaseFromContent(contentEl, releaseBodyEl);
      if (!moved && releaseSec) releaseSec.hidden = true;
    }

    // gallery
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
    return `<div class="error"><b>Load failed</b><div style="margin-top:8px;">${escapeHtml(msg)}</div></div>`;
  }

  // -------- empty state (Direction D) --------
  function trySortRecent(posts) {
    // 尽量按 date 倒序（如果能 parse），否则保持原顺序
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
          const slug = String(p?.slug || "").trim();
          const title = String(p?.title || slug || "Untitled");
          const date = String(p?.date || "").trim();

          const href = slug ? `/post/${encodeURIComponent(slug)}` : "/news/";
          const meta = date ? `<div class="muted" style="font-size:13px; margin-top:4px;">${escapeHtml(date)}</div>` : "";

          return `
            <a class="recent-item" href="${href}" style="display:block; padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; text-decoration:none; color:inherit;">
              <div style="font-weight:600; line-height:1.2;">${escapeHtml(title)}</div>
              ${meta}
            </a>
          `;
        })
        .join("");
    } catch (e) {
      listEl.innerHTML = `<a href="/news/">去 News 浏览</a>`;
    }
  }

  // -------- main --------
  (async function main() {
    const app = $("#app");
    if (!app) return;

    await waitModulesLoaded();

    const { slug, id } = getSlugOrId();

    // ✅ D：/post/ 没有 slug/id 时，给“产品化”的入口页
    if (!slug && !id) {
      await renderEmptyState(app);
      // canonical 不设置（因为不是具体文章）
      return;
    }

    try {
      const list = await loadPosts();

      // 命中：slug 优先，否则 id
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

      // ✅ B：规范化 URL + canonical
      // - 如果当前是 ?slug= 或 ?id= 进来的，只要我们拿到了 hit.slug，就统一成 /post/<slug>
      const hitSlug = String(hit?.slug || "").trim();
      if (hitSlug) {
        normalizeToCleanSlugPath(hitSlug);
      }

      app.innerHTML = "";
      app.appendChild(buildPostDom(hit));
    } catch (e) {
      app.innerHTML = renderError(e?.message || String(e));
    }
  })();
})();
