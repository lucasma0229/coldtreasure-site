(async function () {
  const $ = (id) => document.getElementById(id);

  const heroImg = $("heroImg");
  const heroMeta = $("heroMeta");
  const heroTitle = $("heroTitle");
  const heroSummary = $("heroSummary");
  const heroBtn = $("heroBtn");
  const heroDots = $("heroDots");
  const rail = $("rail");

  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }

  function joinTags(tags) {
    if (!Array.isArray(tags)) return "";
    return tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("");
  }

  function toPostUrl(p) {
    // 你的站内文章页路由：/post/?id=xxx
    return `/post/?id=${encodeURIComponent(p.id)}`;
  }

  function safeImg(el, src) {
    el.src = src || "/assets/img/cover.jpg";
    el.onerror = () => { el.onerror = null; el.src = "/assets/img/cover.jpg"; };
  }

  let posts = [];
  try {
    const res = await fetch("/assets/data/posts.json", { cache: "no-store" });
    if (!res.ok) throw new Error("posts.json HTTP " + res.status);
    posts = await res.json();
    if (!Array.isArray(posts)) throw new Error("posts.json is not an array");
  } catch (e) {
    console.error("[ColdTreasure] failed to load posts.json:", e);
    // 页面至少给个提示，不要“空”
    rail.innerHTML = `<div class="empty">posts.json 读取失败：请打开控制台看报错（F12 → Console）</div>`;
    return;
  }

  // 按 release_date 倒序（字符串也能凑合用）
  posts.sort((a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")));

  // 右侧 5 条入口
  const rightList = posts.slice(0, 5);
  rail.innerHTML = rightList.map(p => {
    const url = toPostUrl(p);
    const cover = p.cover || p.hero || "/assets/img/cover.jpg";
    return `
      <a class="rail-item" href="${url}">
        <div class="rail-img"><img src="${esc(cover)}" alt=""></div>
        <div class="rail-text">
          <div class="rail-meta">${joinTags(p.tags)}</div>
          <div class="rail-title2">${esc(p.title || "")}</div>
          <div class="rail-summary">${esc(p.summary || "")}</div>
        </div>
      </a>
    `;
  }).join("");

  // 左侧轮播：取前 6 条
  const carousel = posts.slice(0, Math.min(6, posts.length));
  let idx = 0;
  let timer = null;

  function renderHero(i) {
    const p = carousel[i];
    if (!p) return;

    const cover = p.hero || p.cover || "/assets/img/cover.jpg";
    safeImg(heroImg, cover);

    heroMeta.innerHTML = `
      ${joinTags(p.tags)}
      <span class="meta-split">·</span>
      <span class="meta">${esc(p.brand || "")}</span>
      <span class="meta-split">·</span>
      <span class="meta">${esc(p.model || "")}</span>
      <span class="meta-split">·</span>
      <span class="meta">${esc(p.release_date || "")}</span>
    `;

    heroTitle.textContent = p.title || "";
    heroSummary.textContent = p.summary || "";
    heroBtn.href = toPostUrl(p);

    // dots
    heroDots.innerHTML = carousel.map((_, k) =>
      `<button class="dot ${k === i ? "on" : ""}" aria-label="dot"></button>`
    ).join("");

    [...heroDots.querySelectorAll(".dot")].forEach((b, k) => {
      b.onclick = () => { idx = k; renderHero(idx); restart(); };
    });
  }

  function restart() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      idx = (idx + 1) % carousel.length;
      renderHero(idx);
    }, 4500);
  }

  renderHero(0);
  if (carousel.length > 1) restart();
})();
