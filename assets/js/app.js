(async function () {
  const CT_PAGE = (window.CT_PAGE || "").toLowerCase(); // 期望：news / record / archive
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

  // ✅ 统一文章链接：与首页一致（/news/<id>/）
  // 同时按 section 走不同目录：/news/ /record/ /archive/
  function postUrl(p) {
    const id = encodeURIComponent(asText(p.id));
    const section = asText(p.section || CT_PAGE || "news").toLowerCase();
    const base = (section === "record" || section === "archive" || section === "news") ? section : "news";
    return `/${base}/${id}/`;
  }

  function pickCover(p) {
    return p.cover || p.hero || "/assets/img/cover.jpg";
  }

  // ✅ 更稳的排序键：优先 date/release_date，可解析就按时间，否则按字符串
  function parseDateKey(v) {
    const s = asText(v).trim();
    if (!s) return NaN;
    // 允许 "2026" 这种：按年份 1/1 处理
    const normalized = /^\d{4}$/.test(s) ? `${s}-01-01` : s;
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : NaN;
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

  // ✅ 只在列表页渲染（有 #list 才渲染）
  if (!listEl) return;

  // 过滤 section：posts.json 约定 section: news / record / archive
  const page = CT_PAGE || "news";
  const filtered = posts.filter(p => asText(p.section || "news").toLowerCase() === page);

  // 排序：最新在前（能解析日期就按日期，不能就按字符串兜底）
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

  // 渲染列表
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
})();
