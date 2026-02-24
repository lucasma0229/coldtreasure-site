/* ===================================================
ColdTreasure app.js (CMS Core) - Full Replace
- One data source: /assets/data/posts.json
- One detail page: /post/?id=<id>
- List pages render by CT_PAGE: news / record / archive / guide / feature
- Home latest cards (#homeNews) + home carousel init
- Auto-load /assets/js/header.js so you don't bump every page
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
      "'": "&#39;",
    }[m]));
  }

  function asText(v) { return (v == null) ? "" : String(v); }

  // ✅ CMS route: single template page
  function postUrl(p) {
    const id = encodeURIComponent(asText(p.id));
    return `/post/?id=${id}`;
  }

  function pickCover(p) {
    return p.thumb || p.cover || p.image || p.hero || "/assets/img/cover.jpg";
  }

  function parseDateKey(v) {
    const s = asText(v).trim();
    if (!s) return NaN;
    const normalized = /^\d{4}$/.test(s) ? `${s}-01-01` : s;
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : NaN;
  }

  // wait modules injected (include.v3.js emits modules:loaded)
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

  /* ---------- header.js auto-loader ---------- */
  async function ensureHeaderJS() {
    // 如果 header.js 已经初始化了，直接结束
    if (window.CT_HEADER_INITED) return;

    // 如果你未来要 bump header.js，只需要改这个 v
    const url = "/assets/js/header.js?v=1";

    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // 不阻塞主流程
      document.head.appendChild(s);
    });
  }

  /* ---------- templates ---------- */
  function tplNewsItem(p) {
    const id = asText(p.id);
    const href = postUrl(p);
    const title = esc(p.title || p.name || id || "Untitled");
    const summary = esc(p.summary || p.desc || "");
    const date = esc(p.date || p.release_date || "");
    const brand = Array.isArray(p.brand) ? esc(p.brand.join(" / ")) : esc(p.brand || "");

    const hero = pickCover(p);
    const v = encodeURIComponent((p.date || p.release_date || "1").toString());

    const brandHtml = brand ? `<span class="pill">${brand}</span>` : "";
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

    const brand = Array.isArray(p.brand) ? esc(p.brand.join(", ")) : esc(p.brand || "");
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

  /* ---------- list rendering (news / record / archive / guide / feature) ---------- */
  function renderList(posts) {
    const listEl = $("#list");
    const emptyEl = $("#listEmpty");
    if (!listEl) return;

    const page = CT_PAGE || "news";
    const filtered = posts.filter((p) => asText(p.section || "news").toLowerCase() === page);

    // ✅ Search filter: /news/?q=
    const q = (() => {
      try { return (new URL(location.href).searchParams.get("q") || "").trim(); }
      catch (e) { return ""; }
    })();

    const qLower = q.toLowerCase();
    const searched = q
      ? filtered.filter((p) => {
          const hay = [
            p.title, p.summary,
            Array.isArray(p.brand) ? p.brand.join(" ") : p.brand,
            p.model,
            Array.isArray(p.tags) ? p.tags.join(" ") : p.tags,
            p.id
          ].filter(Boolean).join(" ").toLowerCase();
          return hay.includes(qLower);
        })
      : filtered;

    searched.sort((a, b) => {
      const ak = parseDateKey(a.date || a.release_date);
      const bk = parseDateKey(b.date || b.release_date);
      if (Number.isFinite(ak) && Number.isFinite(bk)) return bk - ak;
      return asText(b.date || b.release_date || "").localeCompare(asText(a.date || a.release_date || ""));
    });

    const statusEl = $("#pageStatus");
    if (statusEl) {
      statusEl.textContent = q ? `${searched.length} posts · "${q}"` : `${searched.length} posts`;
    }

    if (!searched.length) {
      if (emptyEl) emptyEl.style.display = "block";
      listEl.innerHTML = "";
      return;
    }

    if (page === "news") {
      listEl.innerHTML = `<section class="news-list">${searched.map(tplNewsItem).join("")}</section>`;
    } else {
      listEl.innerHTML = searched.map(tplListItem).join("");
    }
  }

  /* ---------- HOME: Latest 3 posts cards (#homeNews) ---------- */
  function renderHomeLatest(posts) {
    const homeNews = document.getElementById("homeNews");
    if (!homeNews) return;

    const newsOnly = posts.filter((p) => asText(p.section || "news").toLowerCase() === "news");

    const latest = newsOnly
      .slice()
      .sort((a, b) => {
        const ak = parseDateKey(a.date || a.release_date);
        const bk = parseDateKey(b.date || b.release_date);
        if (Number.isFinite(ak) && Number.isFinite(bk)) return bk - ak;
        return asText(b.date || b.release_date || "").localeCompare(asText(a.date || a.release_date || ""));
      })
      .slice(0, 3);

    homeNews.innerHTML = latest.map((p) => `
      <a class="news-card" href="${postUrl(p)}">
        <div class="card-media">
          <img src="${esc(p.thumb || p.cover || p.image || p.hero || "")}" alt="">
        </div>
        <div class="card-body">
          <div class="card-meta">${esc(p.date || p.release_date || "")} · ${esc(Array.isArray(p.brand) ? p.brand.join(", ") : (p.brand || ""))}</div>
          <div class="card-title">${esc(p.title || "")}</div>
        </div>
      </a>
    `).join("");
  }

  /* ---------- HOME: Carousel init (NEW structure + legacy fallback) ---------- */
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
      function go(idx) { i = (idx + n) % n; render(); }

      let timer = null;
      function stop() { if (timer) clearInterval(timer); timer = null; }
      function start() {
        stop();
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        timer = setInterval(() => go(i + 1), 6500);
      }
      function restart() { stop(); start(); }

      prev && prev.addEventListener("click", () => { go(i - 1); restart(); });
      next && next.addEventListener("click", () => { go(i + 1); restart(); });

      root.addEventListener("mouseenter", stop);
      root.addEventListener("mouseleave", start);

      render();
      start();
      return;
    }

    // legacy fallback
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
    function go(step) { render((i + step + slides.length) % slides.length); }

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

  // ✅ 关键：模块注入后再加载 header.js（确保 [data-topbar] 已存在）
  await ensureHeaderJS();

  initHomeCarousel();

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

  renderList(posts);
  renderHomeLatest(posts);
})();

/* ===================================================
   CT Hero Autoplay (safe for include injection)
   =================================================== */
(function(){
  const ROOT_SEL  = ".ct-hero";
  const SLIDE_SEL = ".ct-hero__slide";
  const DOT_SEL   = ".ct-hero__dot, .ct-hero__dots button, [data-hero-dot]";
  const INTERVAL  = 5000;

  let root = null;
  let timer = null;

  function qsa(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

  function getActiveIndex(slides){
    const i = slides.findIndex(s => s.classList.contains("is-active") || s.getAttribute("aria-current")==="true");
    return i >= 0 ? i : 0;
  }

  function setActive(slides, idx){
    slides.forEach((s, i) => s.classList.toggle("is-active", i === idx));
    // 如果你有 dot，也同步一下（可选）
    const dots = qsa(DOT_SEL, root);
    if (dots.length) {
      dots.forEach((d,i)=> d.classList.toggle("is-active", i===idx));
    }
  }

  function next(){
    if (!root || document.hidden) return;
    const slides = qsa(SLIDE_SEL, root);
    if (slides.length <= 1) return;

    const cur = getActiveIndex(slides);
    const nxt = (cur + 1) % slides.length;
    setActive(slides, nxt);
  }

  function stop(){
    if (timer) { clearInterval(timer); timer = null; }
  }

  function start(){
    stop();
    timer = setInterval(next, INTERVAL);
  }

  function bind(){
    // hover / touch 时暂停
    root.addEventListener("pointerenter", stop, {passive:true});
    root.addEventListener("pointerleave", start, {passive:true});

    // tab 切换恢复
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });
  }

  function initIfReady(){
    if (root) return true;
    root = document.querySelector(ROOT_SEL);
    if (!root) return false;

    bind();
    start();
    // console.log("[CT] hero autoplay ON");
    return true;
  }

  // 等 include 把 hero 注入进来
  (function wait(){
    if (!initIfReady()) requestAnimationFrame(wait);
  })();
})();
