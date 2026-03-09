(() => {
  if (window.CT_SEARCH_OVERLAY_INITED) return;
  window.CT_SEARCH_OVERLAY_INITED = true;

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
    return slug ? `/post/?slug=${encodeURIComponent(slug)}` : "/post/";
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

    const releaseInfo = text(post.release_info);
    const m = releaseInfo.match(/货号：([^\n]+)/);
    return m ? text(m[1]) : "";
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

  function getDefaultItems(posts) {
    return sortDesc(posts).slice(0, 3);
  }

  function getSearchItems(posts, query) {
    const q = text(query);
    if (!q) return getDefaultItems(posts);

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
      const metaParts = [post.sku, post.releaseDate].filter(Boolean);
      return `
        <a class="ct-search-card" href="${esc(post.href)}">
          <div class="ct-search-card__media">
            ${post.cover ? `<img src="${esc(post.cover)}" alt="${esc(post.name)}" loading="lazy">` : `<div class="ct-search-card__placeholder"></div>`}
          </div>

          <div class="ct-search-card__body">
            <div class="ct-search-card__title">${esc(post.name)}</div>
            ${post.summary ? `<div class="ct-search-card__summary">${esc(post.summary)}</div>` : ``}
            ${metaParts.length ? `<div class="ct-search-card__meta">${esc(metaParts.join(" · "))}</div>` : ``}
          </div>
        </a>
      `;
    }).join("");
  }

  function updateMoreNewsLink(inputEl, moreLinkEl) {
    if (!moreLinkEl) return;
    const q = text(inputEl?.value);
    moreLinkEl.href = q ? `/news/?q=${encodeURIComponent(q)}` : "/news/";
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
      console.error("[CT Search Overlay] failed to load posts:", err);
      state.posts = [];
      state.loaded = true;
    } finally {
      state.loading = false;
    }
  }

  function closeOverlay() {
    const overlay = document.getElementById("ctSearchOverlay");
    if (!overlay) return;
    document.body.classList.remove("ct-search-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function openOverlay(initialValue = "") {
    const overlay = document.getElementById("ctSearchOverlay");
    const inputEl = document.getElementById("ctSearchOverlayInput");
    const listEl = document.getElementById("ctSearchResults");
    const moreLinkEl = document.getElementById("ctSearchMoreNews");

    if (!overlay || !inputEl || !listEl) return;

    document.body.classList.add("ct-search-open");
    overlay.setAttribute("aria-hidden", "false");

    await loadPosts();

    if (initialValue != null) inputEl.value = text(initialValue);
    updateMoreNewsLink(inputEl, moreLinkEl);

    const items = getSearchItems(state.posts, inputEl.value);
    renderCards(items, listEl);

    requestAnimationFrame(() => {
      inputEl.focus();
      inputEl.select();
    });
  }

  function bindEvents() {
    const trigger = document.querySelector("[data-search-trigger]");
    const triggerForm = document.querySelector("[data-search-trigger-form]");
    const overlay = document.getElementById("ctSearchOverlay");
    const inputEl = document.getElementById("ctSearchOverlayInput");
    const listEl = document.getElementById("ctSearchResults");
    const moreLinkEl = document.getElementById("ctSearchMoreNews");

    if (!trigger || !overlay || !inputEl || !listEl || !moreLinkEl) return;

    let debounceTimer = null;

    function handleOpenFromTrigger(e) {
      if (e) e.preventDefault();
      openOverlay(trigger.value || "");
    }

    trigger.addEventListener("focus", handleOpenFromTrigger);
    trigger.addEventListener("click", handleOpenFromTrigger);

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Tab") return;
      e.preventDefault();
      openOverlay(trigger.value || "");
    });

    if (triggerForm) {
      triggerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        openOverlay(trigger.value || "");
      });
    }

    overlay.querySelectorAll("[data-search-close]").forEach((btn) => {
      btn.addEventListener("click", closeOverlay);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("ct-search-open")) {
        closeOverlay();
      }
    });

    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const items = getSearchItems(state.posts, inputEl.value);
        renderCards(items, listEl);
        updateMoreNewsLink(inputEl, moreLinkEl);
      }, 160);
    });

    inputEl.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = text(inputEl.value);
      location.href = q ? `/news/?q=${encodeURIComponent(q)}` : "/news/";
    });
  }

  function init() {
    const ready = document.getElementById("ctSearchOverlay") && document.querySelector("[data-search-trigger]");
    if (!ready) return;
    bindEvents();
  }

  document.addEventListener("modules:loaded", init, { once: true });
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(init, 0);
  }
})();
