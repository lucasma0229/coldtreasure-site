(async function () {
  async function injectPass(root) {
    const nodes = Array.from(root.querySelectorAll("[data-include]"))
      .filter(el => el.getAttribute("data-included") !== "1");

    for (const el of nodes) {
      const url = el.getAttribute("data-include");
      if (!url) continue;

      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const html = await res.text();

        // ✅ 关键：用 outerHTML 替换占位节点，避免“套壳”导致结构/样式漂移
        el.outerHTML = html;
      } catch (err) {
        console.error(err);

        // 失败时也用 outerHTML，避免留下 data-include 壳反复注入
        el.outerHTML =
          `<pre style="padding:12px;border:1px solid #ddd;white-space:pre-wrap;">include error: ${url}</pre>`;
      } finally {
        // 注意：el 已经被 outerHTML 替换，不能再 setAttribute
        // 这里不再标记 data-included，下一轮 query 会找不到旧节点，自然停止
      }
    }
    return nodes.length;
  }

  // =========================
  // CT Hero (Kith-like) init
  // =========================
  function initCTHero() {
    const root = document.querySelector("[data-ct-hero]");
    if (!root) return;

    const slides = Array.from(root.querySelectorAll(".ct-hero__slide"));
    const prevBtn = root.querySelector(".ct-hero__nav--prev");
    const nextBtn = root.querySelector(".ct-hero__nav--next");
    if (!slides.length || !prevBtn || !nextBtn) return;

    let i = slides.findIndex(s => s.classList.contains("is-active"));
    if (i < 0) i = 0;

    function show(n) {
      slides[i]?.classList.remove("is-active");
      i = (n + slides.length) % slides.length;
      slides[i].classList.add("is-active");
    }

    // 防止重复绑定（如果你未来某些页面重复 dispatch modules:loaded）
    if (root.__ctHeroBound) return;
    root.__ctHeroBound = true;

    prevBtn.addEventListener("click", () => show(i - 1));
    nextBtn.addEventListener("click", () => show(i + 1));

    // 键盘左右键（可留可删）
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "ArrowLeft") show(i - 1);
        if (e.key === "ArrowRight") show(i + 1);
      },
      { passive: true }
    );
  }

  // 递归注入：最多跑 10 轮，直到没有新的 data-include
  for (let i = 0; i < 10; i++) {
    const n = await injectPass(document);
    if (n === 0) break;
  }

  // ✅ 先广播：模块已就绪（给其它逻辑监听）
  document.dispatchEvent(new Event("modules:loaded"));

  // ✅ 再初始化：轮播（只在存在 data-ct-hero 时执行）
  // 用 requestAnimationFrame 确保 layout/style settle（更稳）
  requestAnimationFrame(initCTHero);
})();
