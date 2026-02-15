(async function () {
  function setError(el, url, err) {
    console.error(err);
    el.innerHTML =
      '<pre style="padding:12px;border:1px solid #ddd;white-space:pre-wrap;">include error: ' +
      url +
      "</pre>";
  }

  async function injectOnce(root) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll("[data-include]"));
    if (!nodes.length) return 0;

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // 已处理过就跳过，避免死循环
      if (el.getAttribute("data-included") === "1") continue;

      var url = el.getAttribute("data-include");
      if (!url) continue;

      try {
        var res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        el.innerHTML = await res.text();
        el.setAttribute("data-included", "1");
      } catch (err) {
        el.setAttribute("data-included", "1");
        setError(el, url, err);
      }
    }
    return nodes.length;
  }

  // 递归：一直注入到没有新的 data-include 为止
  async function injectAll() {
    var total = 0;
    for (var pass = 0; pass < 10; pass++) {
      var n = await injectOnce(document);
      total += n;
      if (n === 0) break;
    }
    return total;
  }

  await injectAll();
  document.dispatchEvent(new Event("modules:loaded"));
})();
