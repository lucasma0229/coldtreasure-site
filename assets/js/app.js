// assets/js/app.js
(() => {
  const DATA_URL = "/assets/data/posts.json";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escapeHtml = (s = "") =>
    s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  function normalizePost(p) {
    return {
      id: String(p.id || ""),
      title: String(p.title || ""),
      section: String(p.section || "news"),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      brand: String(p.brand || ""),
      model: String(p.model || ""),
      colorway: String(p.colorway || ""),
      release_date: String(p.release_date || ""),
      price: String(p.price || ""),
      summary: String(p.summary || ""),
      cover: String(p.cover || ""),
      hero: String(p.hero || p.cover || ""),
      pics: Array.isArray(p.pics) ? p.pics : [],
      content: String(p.content || ""),
    };
  }

  async function loadPosts() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load posts.json: ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map(normalizePost).filter(p => p.id && p.title);
  }

  function postUrl(id) {
    return `/post/?id=${encodeURIComponent(id)}`;
  }

  function mountHome(posts) {
    // 兼容你不同版本的 index.html：有哪个容器就用哪个
    const heroRoot =
      $("#hero") ||
      $("#featured") ||
      $("#carousel") ||
      $(".hero") ||
      document.body;

    const listRoot =
      $("#list") ||
      $("#feed") ||
      $("#rightList") ||
      $("#latest") ||
      $(".list") ||
      document.body;

    // 如果你的 index.html 是纯空壳，这里直接注入一套最小布局
    if (!$("#ct-root")) {
      const wrap = document.createElement("div");
      wrap.id = "ct-root";
      wrap.innerHTML = `
        <div style="max-width:1180px;margin:24px auto;padding:0 16px;">
          <div style="display:flex;gap:18px;align-items:flex-start;">
            <div id="ct-hero" style="flex:6;min-width:0;"></div>
            <div id="ct-list" style="flex:4;min-width:0;"></div>
          </div>
        </div>
      `;
      document.body.innerHTML = "";
      document.body.appendChild(wrap);
    }

    const hero = $("#ct-hero") || heroRoot;
    const list = $("#ct-list") || listRoot;

    const top = posts.slice(0, 5);
    const first = top[0];

    // Hero / 轮播（先做“可点的大图 + 摘要”，后续再升级真正轮播）
    hero.innerHTML = `
      <a href="${postUrl(first.id)}" style="display:block;text-decoration:none;color:inherit;">
        <div style="border-radius:16px;overflow:hidden;background:#111;">
          <img src="${escapeHtml(first.hero || first.cover)}" alt="${escapeHtml(first.title)}"
               style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover;">
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:20px;font-weight:700;line-height:1.25;">${escapeHtml(first.title)}</div>
          <div style="margin-top:8px;opacity:.8;line-height:1.5;">${escapeHtml(first.summary)}</div>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;opacity:.85;font-size:12px;">
            ${first.tags.slice(0,5).map(t => `<span style="padding:4px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.12)">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      </a>
    `;

    // Right list 5 个入口
    list.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${top.map(p => `
          <a href="${postUrl(p.id)}" style="display:flex;gap:12px;text-decoration:none;color:inherit;">
            <div style="width:120px;flex:0 0 120px;border-radius:12px;overflow:hidden;background:#eee;">
              <img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}"
                   style="width:100%;height:84px;object-fit:cover;display:block;">
            </div>
            <div style="min-width:0;flex:1;">
              <div style="font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(p.title)}
              </div>
              <div style="margin-top:6px;opacity:.8;font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${escapeHtml(p.summary)}
              </div>
              <div style="margin-top:6px;opacity:.75;font-size:12px;">
                ${escapeHtml(p.brand)} · ${escapeHtml(p.model)} · ${escapeHtml(p.release_date || "")}
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    `;
  }

  async function main() {
    try {
      const posts = await loadPosts();
      if (!posts.length) {
        document.body.innerHTML = `<div style="padding:24px;">posts.json 为空或格式不对。</div>`;
        return;
      }
      // 按“最新在前”：如果你 later 用 YYYY-MM-DD 更准
      posts.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
      mountHome(posts);
    } catch (e) {
      document.body.innerHTML = `
        <div style="padding:24px;">
          <div style="font-weight:700;">页面脚本加载失败</div>
          <pre style="white-space:pre-wrap;margin-top:12px;opacity:.85;">${escapeHtml(String(e && e.stack || e))}</pre>
        </div>
      `;
      console.error(e);
    }
  }

  // 确保 DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
