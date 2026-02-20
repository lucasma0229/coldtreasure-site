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

  // 递归注入：最多跑 10 轮，直到没有新的 data-include
  for (let i = 0; i < 10; i++) {
    const n = await injectPass(document);
    if (n === 0) break;
  }

  document.dispatchEvent(new Event("modules:loaded"));
})();
