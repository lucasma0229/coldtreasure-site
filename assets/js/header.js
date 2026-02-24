/* ===================================================
   ColdTreasure header.js (Stable)
   - Nav active state
   - Home overlay/solid behavior (sets --navH)
   - Search: Enter -> /news/?q=...
   - Safe with include.v3 async injection
=================================================== */

(function () {
  if (window.CT_HEADER_INITED) return;
  window.CT_HEADER_INITED = true;

  function init() {
    const path = (location.pathname || "/").toLowerCase();
    const topbar = document.querySelector("[data-topbar]");
    if (!topbar) return false;

    // ======== Nav active ========
    document.querySelectorAll(".nav a").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isNews = (href === "/news/") && (path.startsWith("/news") || path.startsWith("/post"));
      const isSection = (href !== "/news/") && href !== "/" && path.startsWith(href);
      if (isNews || isSection) a.classList.add("is-active");
    });

    // ======== Search behavior ========
    const input = document.getElementById("ctSearchInput");
    if (input) {
      try {
        const q0 = new URL(location.href).searchParams.get("q") || "";
        if (q0) input.value = q0;
      } catch (e) {}

      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const q = (input.value || "").trim();
        if (!q) return;
        location.href = `/news/?q=${encodeURIComponent(q)}`;
      });
    }

    // ======== Home detection ========
    const isHome =
      path === "/" ||
      path === "/index.html" ||
      document.body.classList.contains("page-home") ||
      (String(window.CT_PAGE || "").toLowerCase() === "home");

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

    // 初始 + 监听
    requestAnimationFrame(applyState);
    window.addEventListener("scroll", applyState, { passive: true });
    window.addEventListener("resize", applyState);

    return true;
  }

  // 1) 先尝试一次（如果 header 已经在了就直接成功）
  if (init()) return;

  // 2) 等 include 注入完成后再 init（关键）
  document.addEventListener("modules:loaded", () => {
    init();
  }, { once: true });

  // 3) 兜底：防止 modules:loaded 没触发（极少数情况）
  setTimeout(() => init(), 1500);
})();
