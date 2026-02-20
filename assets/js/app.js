(function () {
  const page = String(window.CT_PAGE || "").toLowerCase();

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
  const CT_PAGE = (window.CT_PAGE || "").toLowerCase();
  const $ = (sel) => document.querySelector(sel);

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

  // ✅ Hero carousel (HOME)
  function initHeroCarousel() {
    const hero = document.querySelector(".hero");
    if (!hero) return;

    // 允许你的 hero 容器里放一个 <img> 或者空容器都行
    // 优先使用 data-hero-images，其次用默认两张图
    const attr = hero.getAttribute("data-hero-images");
    const images = (attr ? attr.split(",") : [
      "/assets/img/hero/coldtreasure-hero-1.jpg",
      "/assets/img/hero/coldtreasure-hero-2.jpg",
    ]).map(s => s.trim()).filter(Boolean);

    if (images.length <= 1) return;

    // 建一个最小结构（不依赖你现有 HTML）
    hero.classList.add("hero--carousel");
    hero.innerHTML = `
      <div class="hero-track"></div>
      <button class="hero-nav hero-prev" aria-label="Previous">‹</button>
      <button class="hero-nav hero-next" aria-label="Next">›</button>
      <div class="hero-dots" aria-label="Carousel pagination"></div>
    `;

    const track = hero.querySelector(".hero-track");
    const dots = hero.querySelector(".hero-dots");
    const prevBtn = hero.querySelector(".hero-prev");
    const nextBtn = hero.querySelector(".hero-next");

    track.innerHTML = images.map((src, i) => `
      <div class="hero-slide" data-i="${i}">
        <img src="${esc(src)}" alt="" loading="${i === 0 ? "eager" : "lazy"}">
      </div>
    `).join("");

    dots.innerHTML = images.map((_, i) =>
      `<button class="hero-dot" data-i="${i}" aria-label="Go to slide ${i + 1}"></button>`
    ).join("");

    let idx = 0;
    let timer = null;

    const setActive = (n) => {
      idx = (n + images.length) % images.length;
      track.style.transform = `translateX(${-idx * 100}%)`;
      dots.querySelectorAll(".hero-dot").forEach((b, i) => {
        if (i === idx) b.classList.add("is-active");
        else b.classList.remove("is-active");
      });
    };

    const start = () => {
      stop();
      timer = setInterval(() => setActive(idx + 1), 4500);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    prevBtn.addEventListener("click", () => { setActive(idx - 1); start(); });
    nextBtn.addEventListener("click", () => { setActive(idx + 1); start(); });

    dots.addEventListener("click", (e) => {
      const b = e.target.closest(".hero-dot");
      if (!b) return;
      const n = parseInt(b.getAttribute("data-i"), 10);
      if (Number.isFinite(n)) { setActive(n); start(); }
    });

    hero.addEventListener("mouseenter", stop);
    hero.addEventListener("mouseleave", start);

    // reduced motion：不自动轮播
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(0);
      return;
    }

    setActive(0);
    start();
  }

  // ✅ 关键：等模块注入完成后再开始（避免 “找不到元素”）
  await waitForModulesLoaded();

  // 初始化 hero 轮播（只要首页有 .hero 就会启动）
  initHeroCarousel();

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

  // 列表渲染（首页没有 #list 的话会自动跳过）
  renderList(posts);
})();

/* ===============================
HOME — Latest 3 posts loader
=============================== */
document.addEventListener("modules:loaded", async () => {
  const homeNews = document.getElementById("homeNews");
  if (!homeNews) return;

  try {
    const res = await fetch("/assets/data/posts.json?v=" + Date.now());
    const posts = await res.json();

    const latest = posts
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
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

  } catch (e) {
    console.error("home news load fail", e);
  }
});
