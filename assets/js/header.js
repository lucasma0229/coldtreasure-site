// /assets/js/header.js
(function () {
  const path = (location.pathname || "/").toLowerCase();

  function markActiveNav() {
    document.querySelectorAll(".nav a").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isNews = (href === "/news/") && (path.startsWith("/news") || path.startsWith("/post"));
      const isSection = (href !== "/news/") && href !== "/" && path.startsWith(href);
      if (isNews || isSection) a.classList.add("is-active");
    });
  }

  function init() {
    const topbar = document.querySelector("[data-topbar]");
    if (!topbar) return;

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

    markActiveNav();
    applyState();
    window.addEventListener("scroll", applyState, { passive: true });
    window.addEventListener("resize", applyState);
  }

  // 关键：等 include 把 header 注入后再 init
  // 这里用一个很轻的轮询兜底（不会卡）
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (document.querySelector("[data-topbar]")) {
      clearInterval(timer);
      init();
    }
    if (tries > 50) clearInterval(timer); // ~5s 兜底停止
  }, 100);
})();
