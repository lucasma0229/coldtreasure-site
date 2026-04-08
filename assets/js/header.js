(() => {
  if (window.CT_HEADER_RUNTIME_INITED) return;
  window.CT_HEADER_RUNTIME_INITED = true;

  const ESC_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  const esc = (s = "") => String(s).replace(/[&<>"']/g, (m) => ESC_MAP[m]);

  const state = {
    posts: [],
    loaded: false,
    loading: false
  };

  function text(v) {
    return v == null ? "" : String(v).trim();
  }

  function parseDateValue(v) {
    const s = text(v);
    if (!s) return NaN;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }

  function sortDesc(posts) {
    return posts.slice().sort((a, b) => {
      const at = parseDateValue(a.publishAt || a.date);
      const bt = parseDateValue(b.publishAt || b.date);
      if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
      if (Number.isFinite(bt)) return 1;
      if (Number.isFinite(at)) return -1;
      return 0;
    });
  }

  function getName(post) {
    const shoeName = text(post.shoeName);
    if (shoeName) return shoeName;

    if (Array.isArray(post.release_lines) && post.release_lines.length) {
      const first = text(post.release_lines[0]);
      if (first.startsWith("鞋款：")) return first.replace(/^鞋款：/, "").trim();
      if (first) return first;
    }

    return text(post.title);
  }

  function getSummary(post) {
    return text(post.summary) || text(post.excerpt) || "";
  }

  function getCover(post) {
    return text(post.cover) || "";
  }

  function getSlug(post) {
    return text(post.slug) || text(post.id);
  }

  function getHref(post) {
    const slug = getSlug(post);
    return slug ? `/post/${encodeURIComponent(slug)}` : "/post/";
  }

  function getReleaseDate(post) {
    if (Array.isArray(post.release_lines)) {
      const line = post.release_lines.find((item) => text(item).startsWith("发售时间："));
      if (line) return text(line).replace(/^发售时间：/, "").trim();
    }
    return text(post.publishAt) || text(post.date) || "";
  }

  function getSku(post) {
    if (Array.isArray(post.release_lines)) {
      const line = post.release_lines.find((item) => text(item).startsWith("货号："));
      if (line) return text(line).replace(/^货号：/, "").trim();
    }
    return "";
  }

  function getKeywords(post) {
    return Array.isArray(post.keywords) ? post.keywords.map(text).filter(Boolean) : [];
  }

  function normalize(post) {
    return {
      raw: post,
      name: getName(post),
      title: text(post.title),
      summary: getSummary(post),
      cover: getCover(post),
      href: getHref(post),
      sku: getSku(post),
      releaseDate: getReleaseDate(post),
      keywords: getKeywords(post),
      publishAt: text(post.publishAt) || text(post.date)
    };
  }

  function scorePost(post, query) {
    const q = text(query).toLowerCase();
    if (!q) return 0;

    let score = 0;
    const name = post.name.toLowerCase();
    const title = post.title.toLowerCase();
    const summary = post.summary.toLowerCase();
    const keywords = post.keywords.join(" ").toLowerCase();

    if (name === q) score += 1200;
    else if (name.startsWith(q)) score += 900;
    else if (name.includes(q)) score += 700;

    if (keywords.includes(q)) score += 400;
    if (title.includes(q)) score += 240;
    if (summary.includes(q)) score += 100;

    return score;
  }

  function defaultItems(posts) {
    return sortDesc(posts).slice(0, 3);
  }

  function searchItems(posts, query) {
    const q = text(query);
    if (!q) return defaultItems(posts);

    return posts
      .map((post) => ({ post, score: scorePost(post, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const at = parseDateValue(a.post.publishAt);
        const bt = parseDateValue(b.post.publishAt);
        if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
        return 0;
      })
      .slice(0, 3)
      .map((item) => item.post);
  }

  function renderCards(posts, listEl) {
    if (!listEl) return;

    if (!posts.length) {
      listEl.innerHTML = `
        <div class="ct-search-empty">
          <div class="ct-search-empty__title">No Results</div>
          <div class="ct-search-empty__text">没有找到对应资讯，请尝试更换关键词。</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = posts.map((post) => {
      const meta = [post.sku, post.releaseDate].filter(Boolean).join(" · ");
      return `
        <a class="ct-search-card" href="${esc(post.href)}">
          <div class="ct-search-card__media">
            ${post.cover ? `<img src="${esc(post.cover)}" alt="${esc(post.name)}" loading="lazy">` : ``}
          </div>
          <div class="ct-search-card__body">
            <div class="ct-search-card__title">${esc(post.name)}</div>
            ${post.summary ? `<div class="ct-search-card__summary">${esc(post.summary)}</div>` : ``}
            ${meta ? `<div class="ct-search-card__meta">${esc(meta)}</div>` : ``}
          </div>
        </a>
      `;
    }).join("");
  }

  function updateMoreNewsLink(inputEl, linkEl) {
    if (!linkEl) return;
    const q = text(inputEl?.value);
    linkEl.href = q ? `/news/?q=${encodeURIComponent(q)}` : "/news/";
  }

  async function loadPosts() {
    if (state.loaded || state.loading) return;
    state.loading = true;

    try {
      const res = await fetch("/api/posts", { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/posts HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error("/api/posts is not an array");

      state.posts = json
        .filter((item) => {
          const status = text(item.status).toLowerCase();
          return !status || status === "published";
        })
        .map(normalize);

      state.loaded = true;
    } catch (err) {
      console.error("[CT header search] failed to load posts:", err);
      state.posts = [];
      state.loaded = true;
    } finally {
      state.loading = false;
    }
  }

  function initNavState() {
    const topbar = document.querySelector("[data-topbar]");
    if (!topbar) return;

    const path = (location.pathname || "/").toLowerCase();

    document.querySelectorAll(".nav a").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isNews = href === "/news/" && (path.startsWith("/news") || path.startsWith("/post"));
      const isSection = href !== "/news/" && href !== "/" && path.startsWith(href);
      if (isNews || isSection) a.classList.add("is-active");
    });

    const isHome =
      (String(window.CT_PAGE || "").toLowerCase() === "home") ||
      document.body.classList.contains("page-home") ||
      path === "/" ||
      path === "/index.html";

    function syncNavH() {
      const h = Math.round(topbar.getBoundingClientRect().height || 72);
      document.documentElement.style.setProperty("--navH", h + "px");
    }

    function applyState() {
      syncNavH();

      const y = window.scrollY || document.documentElement.scrollTop || 0;

      if (!isHome) {
        document.documentElement.classList.remove("ct-nav--overlay");
        document.documentElement.classList.add("ct-nav--solid");
        return;
      }

      if (y <= 8) {
        document.documentElement.classList.add("ct-nav--overlay");
        document.documentElement.classList.remove("ct-nav--solid");
      } else {
        document.documentElement.classList.remove("ct-nav--overlay");
        document.documentElement.classList.add("ct-nav--solid");
      }
    }

    requestAnimationFrame(applyState);
    window.addEventListener("scroll", applyState, { passive: true });
    window.addEventListener("resize", applyState);
  }

  function closeOverlay() {
    const overlay = document.getElementById("ctSearchOverlay");
    const trigger = document.getElementById("ctSearchTrigger");
    if (!overlay) return;

    document.body.classList.remove("ct-search-open");
    overlay.setAttribute("aria-hidden", "true");

    if (trigger) trigger.blur();
  }

  async function openOverlay(initialValue = "") {
    const overlay = document.getElementById("ctSearchOverlay");
    const inputEl = document.getElementById("ctSearchOverlayInput");
    const listEl = document.getElementById("ctSearchResults");
    const moreEl = document.getElementById("ctSearchMoreNews");

    if (!overlay || !inputEl || !listEl) return;

    document.body.classList.add("ct-search-open");
    overlay.setAttribute("aria-hidden", "false");

    await loadPosts();

    inputEl.value = text(initialValue);
    const items = searchItems(state.posts, inputEl.value);
    renderCards(items, listEl);
    updateMoreNewsLink(inputEl, moreEl);

    requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          inputEl.focus({ preventScroll: true });
        } catch (e) {
          inputEl.focus();
        }
        inputEl.select();
      }, 80);
    });
  }

  function initSearchOverlay() {
    const trigger = document.querySelector("[data-search-trigger]");
    const triggerForm = document.querySelector("[data-search-trigger-form]");
    const overlay = document.getElementById("ctSearchOverlay");
    const overlayInput = document.getElementById("ctSearchOverlayInput");
    const listEl = document.getElementById("ctSearchResults");
    const moreEl = document.getElementById("ctSearchMoreNews");

    if (!trigger || !triggerForm || !overlay || !overlayInput || !listEl) return;

    try {
      const q = new URL(location.href).searchParams.get("q") || "";
      if (q) {
        trigger.value = q;
        overlayInput.value = q;
        updateMoreNewsLink(overlayInput, moreEl);
      }
    } catch (e) {}

    function handleOpen(e) {
      if (e) e.preventDefault();
      openOverlay(trigger.value || "");
    }

    trigger.addEventListener("click", handleOpen);

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Tab") return;
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openOverlay(trigger.value || "");
      }
    });

    triggerForm.addEventListener("submit", handleOpen);

    overlay.querySelectorAll("[data-search-close]").forEach((el) => {
      el.addEventListener("click", closeOverlay);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("ct-search-open")) {
        closeOverlay();
      }
    });

    let timer = null;
    overlayInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const items = searchItems(state.posts, overlayInput.value);
        renderCards(items, listEl);
        updateMoreNewsLink(overlayInput, moreEl);
      }, 140);
    });

    overlayInput.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = text(overlayInput.value);
      location.href = q ? `/news/?q=${encodeURIComponent(q)}` : "/news/";
    });
  }

  function boot() {
    initNavState();
    initSearchOverlay();
  }

  document.addEventListener("modules:loaded", boot, { once: true });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 0);
  }
})();
