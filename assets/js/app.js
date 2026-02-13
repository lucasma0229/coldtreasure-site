(async function () {
  const CT_PAGE = (window.CT_PAGE || "home").toLowerCase();

  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#list");
  const emptyEl = $("#listEmpty");

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

  function postUrl(p) {
    // 你的文章页是 /post/?id=xxx
    return `/post/?id=${encodeURIComponent(p.id)}`;
  }

  function pickCover(p) {
    return p.cover || p.hero || "/assets/img/cover.jpg";
  }

  function sortKey(p) {
    // 你目前 release_date 多是 "2026" 或 "2026-02-24" 这类字符串
    // 这里做一个“尽量可比”的排序键：优先 date/release_date，否则空
    return asText(p.date || p.release_date || "");
  }

  // 读取 posts.json
  let posts = [];
  try {
    const res = await fetch("/assets/data/posts.json", { cache: "no-store" });
    if (!res.ok) throw new Error("posts.json HTTP " + res.status);
    posts = await res.json();
    if (!Array.isArray(posts)) throw new Error("posts.json is not an array");
  } catch (e) {
    console.error("[ColdTreasure] failed to load posts.json:", e);
    if (listEl) {
      listEl.innerHTML = `<div class="empty">posts.json 读取失败：请打开控制台查看报错（F12 → Console）</div>`;
    }
    return;
  }

  // 只在列表页渲染（news/record/archive）
  if (!listEl) return;

  // 过滤 section
  // 约定：posts.json 每条有 "section": "news" / "record" / "archive"
  const filtered = posts
    .filter(p => asText(p.section || "news").toLowerCase() === CT_PAGE);

  // 排序：倒序（最新在前）
  filtered.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  if (!filtered.length) {
    if (emptyEl) emptyEl.style.display = "block";
    listEl.innerHTML = "";
    return;
  }

  // 渲染列表
  listEl.innerHTML = filtered.map(p => {
    const url = postUrl(p);
    const cover = pickCover(p);
    const title = esc(p.title || "");
    const summary = esc(p.summary || "");
    const brand = esc(p.brand || "");
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
})();
