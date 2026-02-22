// /assets/js/header.js
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  function markActiveNav() {
    const path = (location.pathname || "/").toLowerCase();
    document.querySelectorAll(".nav a").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isNews =
        href === "/news/" && (path.startsWith("/news") || path.startsWith("/post"));
      const isSection = href !== "/news/" && href !== "/" && path.startsWith(href);
      if (isNews || isSection) a.classList.add("is-active");
    });
  }

  function initTopbar(topbar) {
    if (!topbar || topbar.__ct_inited) return;
    topbar.__ct_inited = true;

    const path = (location.pathname || "/").toLowerCase();
    const isHome =
      (String(window.CT_PAGE || "").toLowerCase() === "home") ||
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

    applyState();
    window.addEventListener("scroll", applyState, { passive: true });
    window.addEventListener("resize", applyState);
  }

  function bootIfReady() {
    markActiveNav();
    const topbar = $("[data-topbar]");
    if (topbar) initTopbar(topbar);
    return !!topbar;
  }

  // 1) DOMReady 先试一次
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootIfReady);
  } else {
    bootIfReady();
  }

  // 2) 监听异步注入：header 被 include 进来时再 init
  const mo = new MutationObserver(() => {
    if (bootIfReady()) mo.disconnect();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // 3) 兜底：万一 observer 被挡，轮询一小段时间
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (bootIfReady() || tries > 40) clearInterval(t); // ~4s
  }, 100);
})();
