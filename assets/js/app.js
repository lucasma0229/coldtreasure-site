// ColdTreasure Unified app.js (FINAL STABLE)

/* =========================
   0. Page identity
========================= */
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

  /* =========================
     1. utils
  ========================= */
  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  const asText = (v) => (v == null ? "" : String(v));
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  const postUrl = (p) => {
    const raw = asText(p.slug || p.id).trim();
    return raw ? `/post/${encodeURIComponent(raw)}` : "/post/";
  };

  const pickCover = (p) =>
    p.thumb || p.cover || p.image || p.hero || "/assets/img/cover.jpg";

  const sortPostsDesc = (posts) =>
    posts.slice().sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));

  /* =========================
     2. include modules (merged v3)
  ========================= */
  async function injectModules() {
    async function injectPass(root) {
      const nodes = Array.from(root.querySelectorAll("[data-include]"));
      for (const el of nodes) {
        const url = el.getAttribute("data-include");
        if (!url) continue;
        try {
          const res = await fetch(url, { cache: "no-store" });
          const html = await res.text();
          el.outerHTML = html;
        } catch (e) {
          console.error(e);
        }
      }
      return nodes.length;
    }

    for (let i = 0; i < 10; i++) {
      const n = await injectPass(document);
      if (n === 0) break;
    }
  }

  /* =========================
     3. Hero CMS
  ========================= */
  async function renderHero() {
    if (CT_PAGE !== "home") return;

    const stage = document.querySelector("[data-ct-hero]");
    if (!stage) return;

    try {
      const res = await fetch("/api/homepage", { cache: "no-store" });
      const data = await res.json();

      const hero = (data.hero || []).filter((i) => i.active && i.image);

      stage.innerHTML = hero
        .map(
          (item, i) => `
          <article class="ct-hero__slide ${i === 0 ? "is-active" : ""}">
            <img src="${esc(item.image)}" ${i === 0 ? 'loading="eager"' : 'loading="lazy"'}>
          </article>
        `
        )
        .join("");
    } catch (e) {
      console.error("Hero error", e);
    }
  }

  /* =========================
     4. wait image
  ========================= */
  function waitHeroReady() {
    return new Promise((resolve) => {
      const img = document.querySelector(".ct-hero__slide img");
      if (!img) return resolve();
      if (img.complete) return resolve();
      img.onload = resolve;
      setTimeout(resolve, 2000);
    });
  }

  /* =========================
     5. Hero init (核心稳定)
  ========================= */
  function initHero() {
    const stage = document.querySelector("[data-ct-hero]");
    if (!stage) return;

    const slides = [...stage.querySelectorAll(".ct-hero__slide")];
    if (!slides.length) return;

    let i = 0;

    function render() {
      slides.forEach((s, idx) => {
        s.classList.toggle("is-active", idx === i);
      });
    }

    render(); // 强制兜底

    setInterval(() => {
      i = (i + 1) % slides.length;
      render();
    }, 5000);
  }

  /* =========================
     6. posts
  ========================= */
  async function loadPosts() {
    try {
      const res = await fetch("/api/posts");
      return await res.json();
    } catch {
      const res = await fetch("/assets/data/posts.json");
      return await res.json();
    }
  }

  function renderHomeNews(posts) {
    const el = document.getElementById("homeNews");
    if (!el) return;

    const list = sortPostsDesc(posts).slice(0, window.innerWidth <= 768 ? 4 : 3);

    el.innerHTML = list
      .map(
        (p) => `
      <a class="news-card" href="${postUrl(p)}">
        <img src="${pickCover(p)}">
        <div>${esc(p.title)}</div>
      </a>
    `
      )
      .join("");
  }

  /* =========================
     7. start (唯一入口)
  ========================= */
  await injectModules();
  await renderHero();
  await waitHeroReady();
  initHero();

  const posts = await loadPosts();
  renderHomeNews(posts);
})();
