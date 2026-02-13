/* ColdTreasure app.js
   - Home: only handles heroCarousel (static slides in index.html)
   - News/Record/Archive: renders list from /assets/data/posts.json into #rail
*/

(function () {
  const ready = (fn) =>
    document.readyState !== "loading"
      ? fn()
      : document.addEventListener("DOMContentLoaded", fn);

  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  const joinTags = (tags) => {
    if (!Array.isArray(tags)) return "";
    return tags
      .slice(0, 3)
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join("");
  };

  const toPostUrl = (p) => `/post/?id=${encodeURIComponent(p.id || "")}`;

  // =========================
  // Home Hero Carousel (static slides)
  // =========================
  function initHomeCarousel() {
    const root = document.getElementById("heroCarousel");
    const slidesWrap = document.getElementById("heroSlides");
    const dotsWrap = document.getElementById("heroDots");
    if (!root || !slidesWrap || !dotsWrap) return;

    const slides = Array.from(slidesWrap.querySelectorAll(".slide"));
    if (!slides.length) return;

    let idx = 0;
    let timer = null;

    // build dots
    dotsWrap.innerHTML = "";
    slides.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "dot" + (i === 0 ? " is-active" : "");
      b.type = "button";
      b.addEventListener("click", () => go(i));
      dotsWrap.appendChild(b);
    });
    const dots = Array.from(dotsWrap.querySelectorAll(".dot"));

    const paint = () => {
      slides.forEach((s, i) => s.classList.toggle("is-active", i === idx));
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    };

    const go = (i) => {
      idx = (i + slides.length) % slides.length;
      paint();
    };

    const next = () => go(idx + 1);
    const prev = () => go(idx - 1);

    const btnNext = root.querySelector(".car-btn.next");
    const btnPrev = root.querySelector(".car-btn.prev");
    btnNext && btnNext.addEventListener("click", next);
    btnPrev && btnPrev.addEventListener("click", prev);

    const start = () => {
      stop();
      timer = setInterval(next, 5000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);

    paint();
    if (slides.length > 1) start();
  }

  // =========================
  // List Pages (news/record/archive)
  // =========================
  async function initListPage(pageType) {
    const rail = document.getElementById("rail");
    if (!rail) return;

    let posts = [];
    try {
      const res = await fetch("/assets/data/posts.json", { cache: "no-store" });
      if (!res.ok) throw new Error("posts.json HTTP " + res.status);
      posts = await res.json();
      if (!Array.isArray(posts)) throw new Error("posts.json is not an array");
    } catch (e) {
      console.error("[ColdTreasure] failed to load posts.json:", e);
      rail.innerHTML = `<div class="empty">posts.json 读取失败：请打开控制台看报错（F12 → Console）</div>`;
      return;
    }

    // Filter
    const type = String(pageType || "news").toLowerCase();

    const filtered = posts.filter((p) => {
      const section = String(p.section || "").toLowerCase();

      if (type === "record") {
        return p.is_record === true || section === "record";
      }
      if (type === "archive") {
        return p.is_archive === true || section === "archive";
      }
      // news default (also allow explicit)
      return section === "" || section === "news" || section === "record" || section === "archive" || true;
    });

    // Sort: prefer newer release_date, fallback empty
    filtered.sort((a, b) =>
      String(b.release_date || "").localeCompare(String(a.release_date || ""))
    );

    // Render
    rail.innerHTML = filtered
      .map((p) => {
        const url = toPostUrl(p);
        const cover = p.cover || p.hero || "/assets/img/cover.jpg";
        const metaParts = [
          p.colorway ? esc(p.colorway) : "",
          p.price ? esc(p.price) : "",
          p.release_date ? esc(p.release_date) : "",
        ].filter(Boolean);

        return `
          <a class="rail-item" href="${url}">
            <div class="rail-img"><img src="${esc(cover)}" alt=""></div>
            <div class="rail-text">
              <div class="rail-meta">${joinTags(p.tags)}</div>
              <div class="rail-title2">${esc(p.title || "")}</div>
              <div class="rail-summary">${esc(p.summary || "")}</div>
              ${metaParts.length ? `<div class="rail-foot">${metaParts.join(" · ")}</div>` : ""}
            </div>
          </a>
        `;
      })
      .join("");

    // Reveal on scroll (optional)
    const reveal = document.querySelector(".reveal");
    if (reveal) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) reveal.classList.add("in-view");
          });
        },
        { threshold: 0.15 }
      );
      io.observe(reveal);
    }
  }

  // =========================
  // Boot
  // =========================
  ready(() => {
    const page = (window.CT_PAGE || "home").toLowerCase();

    if (page === "news" || page === "record" || page === "archive") {
      initListPage(page);
      return;
    }

    // home default
    initHomeCarousel();
  });
})();
