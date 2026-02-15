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
        el.innerHTML = await res.text();
      } catch (err) {
        console.error(err);
        el.innerHTML =
          `<pre style="padding:12px;border:1px solid #ddd;white-space:pre-wrap;">include error: ${url}</pre>`;
      } finally {
        el.setAttribute("data-included", "1");
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
