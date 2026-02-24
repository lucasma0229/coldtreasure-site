(async function () {

  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  if (!id) {
    document.body.innerHTML = "<h1>Missing post id</h1>";
    return;
  }

  let posts = [];
  try {
    const res = await fetch("/assets/data/posts.json", { cache: "no-store" });
    posts = await res.json();
  } catch (e) {
    document.body.innerHTML = "<h1>Failed to load posts.json</h1>";
    return;
  }

  const post = posts.find(p => String(p.id) === id);

  if (!post) {
    document.body.innerHTML = "<h1>Post not found</h1>";
    return;
  }

  // 根据你的 post/index.html 结构渲染
  document.querySelector("h1").innerHTML = esc(post.title || "");
  
})();
