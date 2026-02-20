/* ===================================================
   ColdTreasure app.js (Full Replace)
   - Keeps existing list rendering logic
   - Rebuilds HOME carousel init (no DOM overwrite)
   - Fixes esc() scope issue for homeNews loader
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
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function asText(v) { return (v == null) ? "" : String(v); }

  // ✅ A 路线：所有详情页统一 /news/<id>/
  function postUrl(p) {
    const id = encodeURIComponent(asText(p.id));
    return `/news/${id}/`;
  }

  function pickCover(p) {
    return p.cover || p.hero || "/assets/img/cover.jpg";
  }

  function parseDateKey(v) {
    const s = asText(v).trim();
    if (!s) return NaN;
    const normalized = /^\d{4}$/.test(s) ? `${s}-01-01` : s;
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : NaN;
  }

  // 等待模块注入完成：由 include.js 触发 modules:loaded
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

  async function loadPosts() {
    const res = await fetch("/assets/data/posts.json", { cache: "no-store" });
    if (!res.ok) throw new Error("posts.json HTTP " + res.status);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("posts.json is not an array");
    return json;
  }

  /* ---------- list rendering (news / record / archive etc.) ---------- */
  function renderList(posts) {
    const listEl = $("#list");
    const emptyEl = $("#listEmpty");
    if (!listEl) return;

    const page = CT_PAGE || "news";
    const filtered = posts.filter(p => asText(p.section || "news").toLowerCase() === page);

    filtered.sort((a, b) => {
      const ak = parseDateKey(a.date || a.release_date);
      const bk = parseDateKey(b.date || b.release_date);
      if (Number.isFinite(ak) && Number.isFinite(bk)) return bk - ak;
      return asText(b.date || b.release_date || "").localeCompare(asText(a.date || a.release_date || ""));
    });

    if (!filtered.length) {
      if (emptyEl) emptyEl.style.display = "block";
      listEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = filtered.map(p => {
      const url = postUrl(p);
      const cover = pickCover(p);
      const title = esc(p.title || "");
      const summary = esc(p.summary || "");

      const brand = Array.isArray(p.brand) ? esc(p.brand.join(", ")) : esc(p.brand || "");
      const model = esc(p.model || "");
      const date = esc(p.release_date || p.date || "");

      const meta = [brand, model, date].filter(Boolean).join(" · ");

      return `
        <a class="list-item" href="${url}">
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
    }).join("");
  }

  /* ---------- HOME: Latest 3 posts cards (#homeNews) ---------- */
  function renderHomeLatest(posts) {
    const homeNews = document.getElementById("homeNews");
    if (!homeNews) return;

    const latest = posts
      .slice()
      .sort((a, b) => parseDateKey(b.date) - parseDateKey(a.date))
      .slice(0, 3);

    homeNews.innerHTML = latest.map(p => `
      <a class="news-card" href="/news/${encodeURIComponent(p.id)}/">
        <div class="card-media">
          <img src="${esc(p.thumb || p.cover || p.image || p.hero || "")}" alt="">
        </div>
        <div class="card-body">
          <div class="card-meta">${esc(p.date || "")} · ${esc((p.brand || []).join(", "))}</div>
          <div class="card-title">${esc(p.title || "")}</div>
        </div>
      </a>
    `).join("");
  }

  /* ---------- HOME: Carousel init (NEW structure) ---------- */
  function initHomeCarousel() {
    if (CT_PAGE !== "home") return;

    // Prefer new rebuilt carousel structure
    const root = document.querySelector("[data-ct-carousel]");
    if (root) {
      // prevent double init (include can re-run)
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

      // Build dots (clean rebuild each init)
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

      prev && prev.addEventListener("click", () => { go(i - 1); restart(); });
      next && next.addEventListener("click", () => { go(i + 1); restart(); });

      // Autoplay (quiet)
      let timer = null;
      function stop() {
        if (timer) clearInterval(timer);
        timer = null;
      }
      function start() {
        stop();
        // reduced motion：不自动轮播
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        timer = setInterval(() => go(i + 1), 6500);
      }
      function restart() { stop(); start(); }

      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", start);

      // Minimal swipe
      let x0 = null;
      root.addEventListener("touchstart", (e) => {
        x0 = e.touches?.[0]?.clientX ?? null;
      }, { passive: true });

      root.addEventListener("touchend", (e) => {
        const x1 = e.changedTouches?.[0]?.clientX ?? null;
        if (x0 == null || x1 == null) return;
        const dx = x1 - x0;
        if (Math.abs(dx) < 40) return;
        go(i + (dx < 0 ? 1 : -1));
        restart();
        x0 = null;
      }, { passive: true });

      render();
      start();
      return;
    }

    // Fallback: legacy hero-stage carousel if exists (keeps your older pages safe)
    const legacyRoot = document.querySelector("[data-hero]");
    if (!legacyRoot) return;
    if (legacyRoot.dataset.inited === "1") return;
    legacyRoot.dataset.inited = "1";

    const slides = Array.from(legacyRoot.querySelectorAll(".hero-slide"));
    const dots = Array.from(legacyRoot.querySelectorAll(".hero-dot"));
    const prev = legacyRoot.querySelector(".hero-arrow.is-prev");
    const next = legacyRoot.querySelector(".hero-arrow.is-next");

    let i = slides.findIndex(s => s.classList.contains("is-active"));
    if (i < 0) i = 0;

    function render(n) {
      slides.forEach((s, idx) => s.classList.toggle("is-active", idx === n));
      dots.forEach((d, idx) => d.classList.toggle("is-active", idx === n));
      i = n;
    }

    function go(step) {
      const n = (i + step + slides.length) % slides.length;
      render(n);
    }

    prev && prev.addEventListener("click", () => go(-1));
    next && next.addEventListener("click", () => go(1));
    dots.forEach((d, idx) => d.addEventListener("click", () => render(idx)));

    let timer = null;
    function stop() { if (timer) clearInterval(timer); timer = null; }
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

  /* ---------- boot ---------- */
  await waitForModulesLoaded();

  // HOME carousel (new + legacy safe)
  initHomeCarousel();

  // Load posts once, then render what exists on this page
  let posts = [];
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error("[ColdTreasure] failed to load posts.json:", e);

    const listEl = $("#list");
    if (listEl) {
      listEl.innerHTML = `<div class="empty">posts.json 读取失败：请打开控制台查看报错（F12 → Console）</div>`;
    }
    return;
  }

  // News list / record list / archive list (auto-skip if #list absent)
  renderList(posts);

  // Home latest cards (auto-skip if #homeNews absent)
  renderHomeLatest(posts);
})();
