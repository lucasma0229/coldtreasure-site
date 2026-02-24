/* ===================================================
ColdTreasure header.js (Full Replace)
- Runs after modules injected (modules:loaded)
- Nav active state
- Home overlay/solid switch
- Search Enter -> /news/?q=
=================================================== */

(function () {
  if (window.CT_HEADER_JS_INITED) return;
  window.CT_HEADER_JS_INITED = true;

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function waitModulesLoaded(timeoutMs = 2500) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      document.addEventListener("modules:loaded", finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }

  function initHeader() {
    const path = (location.pathname || "/").toLowerCase();
    const topbar = document.querySelector("[data-topbar]");
    if (!topbar) return;

    // ======== Nav active ========
    $$(".nav a").forEach(a => {
      a.classList.remove("is-active");
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isNews = (href === "/news/") && (path.startsWith("/news") || path.startsWith("/post"));
      const isSection = (href !== "/news/") && href !== "/" && path.startsWith(href);
      if (isNews || isSection) a.classList.add("is-active");
    });

    // ======== Search behavior ========
    const input = document.getElementById("ctSearchInput");
    if (input && !input.dataset.bound) {
      input.dataset.bound = "1";

      // URL 有 q 就回填（不依赖 /search）
      try {
        const q0 = new URL(location.href).searchParams.get("q") || "";
        if (q0) input.value = q0;
      } catch (e) {}

      input.addEventListener("keydown", (e) => {
        // 只处理 Enter（包含数字小键盘 Enter）
        if (e.key !== "Enter" && e.keyCode !== 13) return;

        e.preventDefault();
        const q = (input.value || "").trim();
        if (!q) return;

        location.href = `/news/?q=${encodeURIComponent(q)}`;
      });
    }

    // ======== Home detection ========
    const isHome =
      (String(window.CT_PAGE || "").toLowerCase() === "home") ||
      document.body.classList.contains("page-home") ||
      path === "/" || path === "/index.html";

    function syncNavH() {
      const h = Math.round(topbar.getBoundingClientRect().height || 72);
      document.documentElement.style.setProperty("--navH", h + "px");
    }

    function applyState() {
      syncNavH();
      const y = window.scrollY || document.documentElement.scrollTop || 0;

      if (!isHome) {
        document.documentElement.classList.remove("ct-nav--overlay");
        document.documentElement.classList.add("ct-nav--solid");
        return;
      }

      if (y <= 8) {
        document.documentElement.classList.add("ct-nav--overlay");
        document.documentElement.classList.remove("ct-nav--solid");
      } else {
        document.documentElement.classList.remove("ct-nav--overlay");
        document.documentElement.classList.add("ct-nav--solid");
      }
    }

    // 先跑一次
    requestAnimationFrame(applyState);

    // 只绑定一次（避免重复）
    if (!window.__CT_HEADER_STATE_BOUND__) {
      window.__CT_HEADER_STATE_BOUND__ = true;
      window.addEventListener("scroll", applyState, { passive: true });
      window.addEventListener("resize", applyState);
    }
  }

  // 等模块注入完再初始化
  (async function boot() {
    await waitModulesLoaded();
    initHeader();
  })();
})();
