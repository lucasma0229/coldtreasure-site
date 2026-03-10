/* ===================================================
ColdTreasure app.js (CMS Core) - Full Replace
- Primary data source: /api/posts
- Fallback data source: /assets/data/posts.json
- One detail page: /post/<slug>
- List pages render by CT_PAGE: news / record / archive / guide / feature
- Home latest cards (#homeNews) + home carousel init
- Auto-load /assets/js/header.js
=================================================== */

/* 1) Page identity -> body class */
(function () {
  const page = String(window.CT_PAGE || "").trim().toLowerCase();
  const map = {
    home: "page-home",
    news: "page-news",
    post: "page-post",
    record: "page-record",
    archive: "page-archive",
    guide: "page-guide",
    feature: "page-feature",
  };
  document.body.classList.add(map[page] || "page-unknown");
})();

(async function () {
  const CT_PAGE = String(window.CT_PAGE || "").trim().toLowerCase();
  const $ = (sel) => document.querySelector(sel);

  /* ---------- utils ---------- */
  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[m];
    });
  }

  function asText(v) {
    return v == null ? "" : String(v);
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null || v === "") return [];
    return [v];
  }

  function postUrl(p) {
    const raw = asText(p.slug || p.id).trim();
    return raw ? `/post/${encodeURIComponent(raw)}` : "/post/";
  }

  function pickCover(p) {
    return (
      p.thumb ||
      p.cover ||
      p.image ||
      p.hero ||
      p.coverImage ||
      p.cover_image ||
      "/assets/img/cover.jpg"
    );
  }

  function parseDateKey(v) {
    const s = asText(v).trim();
    if (!s) return NaN;

    const normalized = /^\d{4}$/.test(s) ? `${s}-01-01` : s;
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : NaN;
  }

  function normalizeSection(p) {
    const section = asText(p.section).trim().toLowerCase();
    if (section) return section;
    return "news";
  }

  function normalizePost(raw) {
    const id = asText(raw.id || raw.slug).trim();
    const slug = asText(raw.slug || raw.id).trim();
    const title = asText(raw.title || raw.name).trim();
    const summary = asText(raw.summary || raw.desc || raw.excerpt).trim();

    const brand = Array.isArray(raw.brand)
      ? raw.brand
      : Array.isArray(raw.brands)
      ? raw.brands
      : raw.brand
      ? [raw.brand]
      : [];

    const date = asText(
      raw.date || raw.publishAt || raw.release_date || raw.publishedAt || raw.publish_date
    ).trim();

    return {
      ...raw,
      id,
      slug,
      title,
      summary,
      brand,
      date,
      release_date: date,
      section: normalizeSection(raw),
      thumb: raw.thumb || raw.cover || raw.image || raw.hero || raw.coverImage || raw.cover_image || "",
      cover: raw.cover || raw.thumb || raw.image || raw.hero || raw.coverImage || raw.cover_image || "",
    };
  }

  function sortPostsDesc(posts) {
    return posts.slice().sort((a, b) => {
      const ak = parseDateKey(a.date || a.release_date || a.publishAt);
      const bk = parseDateKey(b.date || b.release_date || b.publishAt);

      if (Number.isFinite(ak) && Number.isFinite(bk)) return bk - ak;
      if (Number.isFinite(bk)) return 1;
      if (Number.isFinite(ak)) return -1;

      return asText(b.date || b.release_date || "").localeCompare(
        asText(a.date || a.release_date || "")
      );
    });
  }

  function waitForModulesLoaded(timeoutMs = 2500) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  async function fetchJsonArray(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);

    const json = await res.json();
    if (!Array.isArray(json)) throw new Error(`${url} is not an array`);
    return json;
  }

  async function loadPosts() {
    try {
      const apiPosts = await fetchJsonArray("/api/posts");
      const normalized = apiPosts.map(normalizePost);

      if (normalized.length > 0) {
        console.log("[ColdTreasure] using /api/posts");
        return normalized;
      }

      console.warn("[ColdTreasure] /api/posts is empty, fallback to posts.json");
    } catch (e) {
      console.warn("[ColdTreasure] failed to load /api/posts, fallback to posts.json", e);
    }

    try {
      const staticPosts = await fetchJsonArray("/assets/data/posts.json");
      console.log("[ColdTreasure] using /assets/data/posts.json");
      return staticPosts.map(normalizePost);
    } catch (e) {
      console.error("[ColdTreasure] failed to load fallback posts.json", e);
      throw e;
    }
  }

  async function ensureHeaderJS() {
    if (window.CT_HEADER_RUNTIME_INITED) return;

    const url = "/assets/js/header.js?v=4";
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  function tplNewsItem(p) {
    const href = postUrl(p);
    const title = esc(p.title || "Untitled");
    const summary = esc(p.summary || "");
    const date = esc(p.date || p.release_date || "");
    const brandText = esc(asArray(p.brand).join(" / "));
    const hero = pickCover(p);
    const v = encodeURIComponent((p.date || p.release_date || "1").toString());
    const brandHtml = brandText ? `<span class="pill">${brandText}</span>` : "";
    const dateHtml = date ? `<span class="date">${date}</span>` : "";

    return `
      <article class="news-item">
        <a class="news-media" href="${href}" aria-label="${title}">
          ${hero ? `<img src="${esc(hero)}?v=${v}" alt="${title}" loading="lazy">` : ``}
        </a>
        <div class="news-body">
          <div class="news-meta">${brandHtml}${dateHtml}</div>
          <h2 class="news-title"><a href="${href}">${title}</a></h2>
          ${summary ? `<p class="news-summary">${summary}</p>` : ``}
        </div>
      </article>
    `;
  }

  function tplListItem(p) {
    const href = postUrl(p);
    const cover = pickCover(p);
    const title = esc(p.title || "");
    const summary = esc(p.summary || "");
    const brand = esc(asArray(p.brand).join(", "));
    const model = esc(p.model || "");
    const date = esc(p.release_date || p.date || "");
    const meta = [brand, model, date].filter(Boolean).join(" · ");

    return `
      <a class="list-item" href="${href}">
        <div class="list-img">
          <img src="${esc(cover)}" alt="">
        </div>
        <div class="list-text">
          <div class="list-title">${title}</div>
          ${summary ? `<div class="list-summary">${summary}</div>` : ``}
          ${meta ? `<div class="list-meta">${meta}</div>` : ``}
        </div>
      </a>
    `;
  }

  function renderList(posts) {
    const listEl = $("#list");
    const emptyEl = $("#listEmpty");
    if (!listEl) return;

    const page = CT_PAGE || "news";
    const filtered = posts.filter((p) => normalizeSection(p) === page);

    const q = (() => {
      try {
        return (new URL(location.href).searchParams.get("q") || "").trim();
      } catch (e) {
        return "";
      }
    })();

    const qLower = q.toLowerCase();
    const searched = q
      ? filtered.filter((p) => {
          const hay = [
            p.title,
            p.summary,
            asArray(p.brand).join(" "),
            p.model,
            Array.isArray(p.tags) ? p.tags.join(" ") : p.tags,
            p.id,
            p.slug,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return hay.includes(qLower);
        })
      : filtered;

    const sorted = sortPostsDesc(searched);

    const statusEl = $("#pageStatus");
    if (statusEl) {
      statusEl.textContent = q ? `${sorted.length} posts · "${q}"` : `${sorted.length} posts`;
    }

    if (!sorted.length) {
      if (emptyEl) emptyEl.style.display = "block";
      listEl.innerHTML = "";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    if (page === "news") {
      listEl.innerHTML = `<section class="news-list">${sorted.map(tplNewsItem).join("")}</section>`;
    } else {
      listEl.innerHTML = sorted.map(tplListItem).join("");
    }
  }

  function renderHomeLatest(posts) {
    const homeNews = document.getElementById("homeNews");
    if (!homeNews) return;

    const newsOnly = posts.filter((p) => normalizeSection(p) === "news");
    const latest = sortPostsDesc(newsOnly).slice(0, 3);

    if (!latest.length) {
      homeNews.innerHTML = `
        <div class="home-news-empty">
          暂无文章
        </div>
      `;
      return;
    }

    homeNews.innerHTML = latest
      .map((p) => `
        <a class="news-card" href="${postUrl(p)}">
          <div class="card-media">
            <img src="${esc(pickCover(p))}" alt="${esc(p.title || "")}" loading="lazy">
          </div>
          <div class="card-body">
            <div class="card-meta">
              ${esc(p.date || p.release_date || "")}
              ${asArray(p.brand).length ? ` · ${esc(asArray(p.brand).join(", "))}` : ``}
            </div>
            <div class="card-title">${esc(p.title || "")}</div>
          </div>
        </a>
      `)
      .join("");
  }

  function initHomeCarousel() {
    if (CT_PAGE !== "home") return;

    const root = document.querySelector("[data-ct-carousel]");
    if (root) {
      if (root.dataset.inited === "1") return;
      root.dataset.inited = "1";

      const track = root.querySelector("[data-ct-track]");
      if (!track) return;

      const slides = Array.from(track.querySelectorAll(".ct-carousel__slide"));
      const prev = root.querySelector(".ct-carousel__nav--prev");
      const next = root.querySelector(".ct-carousel__nav--next");
      const dotsWrap = root.querySelector(".ct-carousel__dots");

      const n = slides.length;
      if (n <= 1) return;

      let i = 0;
      const dots = [];

      if (dotsWrap) {
        dotsWrap.innerHTML = "";
        for (let k = 0; k < n; k++) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "ct-carousel__dot" + (k === 0 ? " is-active" : "");
          b.setAttribute("aria-label", `Slide ${k + 1}`);
          b.addEventListener("click", () => go(k));
          dotsWrap.appendChild(b);
          dots.push(b);
        }
      }

      function render() {
        track.style.transform = `translateX(${-i * 100}%)`;
        dots.forEach((d, idx) => d.classList.toggle("is-active", idx === i));
      }

      function go(idx) {
        i = (idx + n) % n;
        render();
      }

      let timer = null;
      function stop() {
        if (timer) clearInterval(timer);
        timer = null;
      }

      function start() {
        stop();
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        timer = setInterval(() => go(i + 1), 6500);
      }

      function restart() {
        stop();
        start();
      }

      prev &&
        prev.addEventListener("click", () => {
          go(i - 1);
          restart();
        });

      next &&
        next.addEventListener("click", () => {
          go(i + 1);
          restart();
        });

      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", start);

      render();
      start();
      return;
    }

    const legacyRoot = document.querySelector("[data-hero]");
    if (!legacyRoot) return;
    if (legacyRoot.dataset.inited === "1") return;
    legacyRoot.dataset.inited = "1";

    const slides = Array.from(legacyRoot.querySelectorAll(".hero-slide"));
    const dots = Array.from(legacyRoot.querySelectorAll(".hero-dot"));
    const prev = legacyRoot.querySelector(".hero-arrow.is-prev");
    const next = legacyRoot.querySelector(".hero-arrow.is-next");

    let i = slides.findIndex((s) => s.classList.contains("is-active"));
    if (i < 0) i = 0;

    function render(n) {
      slides.forEach((s, idx) => s.classList.toggle("is-active", idx === n));
      dots.forEach((d, idx) => d.classList.toggle("is-active", idx === n));
      i = n;
    }

    function go(step) {
      render((i + step + slides.length) % slides.length);
    }

    prev && prev.addEventListener("click", () => go(-1));
    next && next.addEventListener("click", () => go(1));
    dots.forEach((d, idx) => d.addEventListener("click", () => render(idx)));

    let timer = null;
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function start() {
      stop();
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      timer = setInterval(() => go(1), 6500);
    }

    legacyRoot.addEventListener("mouseenter", stop);
    legacyRoot.addEventListener("mouseleave", start);

    render(i);
    start();
  }

  await waitForModulesLoaded();
  await ensureHeaderJS();
  initHomeCarousel();

  let posts = [];
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error("[ColdTreasure] failed to load all post sources:", e);

    const listEl = $("#list");
    const homeNews = document.getElementById("homeNews");

    if (listEl) {
      listEl.innerHTML = `<div class="empty">文章数据读取失败：请打开控制台查看报错（F12 → Console）</div>`;
    }

    if (homeNews) {
      homeNews.innerHTML = `<div class="home-news-empty">文章数据读取失败</div>`;
    }
    return;
  }

  renderList(posts);
  renderHomeLatest(posts);
})();

/* ===================================================
CT Hero Autoplay (safe for include injection)
=================================================== */
(function () {
  if (window.CT_HERO_AUTOPLAY) return;
  window.CT_HERO_AUTOPLAY = true;

  const ROOT_SEL = ".ct-hero";
  const SLIDE_SEL = ".ct-hero__slide";
  const DOT_SEL = ".ct-hero__dot, .ct-hero__dots button, [data-hero-dot]";
  const INTERVAL = 5000;

  let root = null;
  let timer = null;

  function qsa(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel));
  }

  function getActiveIndex(slides) {
    const i = slides.findIndex(
      (s) => s.classList.contains("is-active") || s.getAttribute("aria-current") === "true"
    );
    return i >= 0 ? i : 0;
  }

  function setActive(slides, idx) {
    slides.forEach((s, i) => s.classList.toggle("is-active", i === idx));
    const dots = qsa(DOT_SEL, root);
    if (dots.length) {
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    }
  }

  function next() {
    if (!root || document.hidden) return;
    const slides = qsa(SLIDE_SEL, root);
    if (slides.length <= 1) return;

    const cur = getActiveIndex(slides);
    const nxt = (cur + 1) % slides.length;
    setActive(slides, nxt);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    timer = setInterval(next, INTERVAL);
  }

  function bind() {
    root.addEventListener("pointerenter", stop, { passive: true });
    root.addEventListener("pointerleave", start, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });
  }

  function initIfReady() {
    if (root) return true;
    root = document.querySelector(ROOT_SEL);
    if (!root) return false;
    bind();
    start();
    return true;
  }

  (function wait() {
    if (!initIfReady()) requestAnimationFrame(wait);
  })();
})();
