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
    // 若页面没用 include.js / 没有模块系统，也要能继续执行（兜底）
    return new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      document.addEventListener("modules:loaded", finish, { once: true });

      // 兜底：超时也继续（避免卡死）
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

    // ✅ 只在列表页渲染（有 #list 才渲染）
    if (!listEl) return;

    // 列表页仍按 section 过滤展示（news/record/archive）
    const page = CT_PAGE || "news";
    const filtered = posts.filter(p => asText(p.section || "news").toLowerCase() === page);

    // 最新在前
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

  // ✅ 关键：等模块注入完成后再开始（避免 “找不到元素”）
  await waitForModulesLoaded();

  let posts = [];
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error("[ColdTreasure] failed to load posts.json:", e);

    // 只有在列表页（存在 #list）才显示错误提示
    const listEl = $("#list");
    if (listEl) {
      listEl.innerHTML = `<div class="empty">posts.json 读取失败：请打开控制台查看报错（F12 → Console）</div>`;
    }
    return;
  }

  // 列表渲染（首页没有 #list 的话会自动跳过）
  renderList(posts);
})();
