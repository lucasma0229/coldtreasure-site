/* ===================================================
ColdTreasure header.js
- Nav active state
- Home overlay/solid behavior (sets --navH)
- Search: Enter -> /news/?q=...
- Safe to call multiple times (has global lock)
=================================================== */

(function () {
  // 全局锁：避免重复绑定
  if (window.CT_HEADER_INITED) return;
  window.CT_HEADER_INITED = true;

  const path = (location.pathname || "/").toLowerCase();
  const topbar = document.querySelector("[data-topbar]");
  if (!topbar) return;

  // ======== Nav active ========
  document.querySelectorAll(".nav a").forEach((a) => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    const isNews = href === "/news/" && (path.startsWith("/news") || path.startsWith("/post"));
    const isSection = href !== "/news/" && href !== "/" && path.startsWith(href);
    if (isNews || isSection) a.classList.add("is-active");
  });

  // ======== Search behavior ========
  const input = document.getElementById("ctSearchInput");
  if (input) {
    // 只要 URL 里有 q，就回填
    try {
      const q0 = new URL(location.href).searchParams.get("q") || "";
      if (q0) input.value = q0;
    } catch (e) {}

    // Enter 跳转
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const q = (input.value || "").trim();
      if (!q) return;

      // 统一走 News 列表页的过滤（你现在的搜索就是这个路线）
      location.href = `/news/?q=${encodeURIComponent(q)}`;
    });
  }

  // ======== Home detection ========
  const isHome =
    String(window.CT_PAGE || "").toLowerCase() === "home" ||
    document.body.classList.contains("page-home") ||
    path === "/" ||
    path === "/index.html";

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

  // 初始执行（确保布局稳定）
  requestAnimationFrame(applyState);

  window.addEventListener("scroll", applyState, { passive: true });
  window.addEventListener("resize", applyState);
})();
