// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex = parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathSlug = parts[0] === "post" && parts.length >= 2 ? parts[1] : "";

  // ✅ 用 “assets.local” 避免同源 /post/index.html 被 Pages 的 trailing-slash / redirects 规则卷入循环
  const target = new URL("https://assets.local/post/index.html");

  // 保留原 query（utm/ref/旧的 id/slug 等）
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // /post/<slug> → 注入 slug
  if (!isPostRoot && !isPostIndex && pathSlug && pathSlug !== "index.html") {
    // 统一注入 slug
    if (!target.searchParams.has("slug")) {
      target.searchParams.set("slug", pathSlug);
    }
    // 兼容：如果你前端仍有人用 id 命中，也给一份
    if (!target.searchParams.has("id")) {
      target.searchParams.set("id", pathSlug);
    }
  }

  // 兼容：如果只有 slug 没有 id → 补 id=slug
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // ✅ 不做 3xx redirect，直接返回静态资源内容
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
