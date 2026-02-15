(async function () {
  var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-include]"));

  function setError(el, url, err) {
    console.error(err);
    el.innerHTML = '<pre style="padding:12px;border:1px solid #ddd;white-space:pre-wrap;">include error: ' + url + "</pre>";
  }

  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var url = el.getAttribute("data-include");
    if (!url) continue;

    try {
      var res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      el.innerHTML = await res.text();
    } catch (err) {
      setError(el, url, err);
    }
  }

  document.dispatchEvent(new Event("modules:loaded"));
})();
