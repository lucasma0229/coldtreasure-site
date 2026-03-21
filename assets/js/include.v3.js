// include.v3.js
(async function () {
  async function injectPass(root) {
    const nodes = Array.from(root.querySelectorAll("[data-include]")).filter(
      (el) => el.getAttribute("data-included") !== "1"
    );

    for (const el of nodes) {
      const url = el.getAttribute("data-include");
      if (!url) continue;

      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const html = await res.text();
        el.outerHTML = html;
      } catch (err) {
        console.error(err);
        el.outerHTML = `<pre style="padding:12px;border:1px solid #ddd;white-space:pre-wrap;">include error: ${url}</pre>`;
      }
    }

    return nodes.length;
  }

  for (let i = 0; i < 10; i++) {
    const n = await injectPass(document);
    if (n === 0) break;
  }

  document.dispatchEvent(new Event("modules:loaded"));
})();
