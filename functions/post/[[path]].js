// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // /post
  // /post/
  // /post/<slugOrId>
  // /post/index.html (兜底)
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";

  const pathKey =
    parts[0] === "post" && parts.length >= 2 ? parts[1] : "";

  // ✅ 永远回源到静态页（不做 redirect）
  const target = new URL("/post/index.html", url);

  // 保留原 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // ✅ 统一注入：slug + id（两套系统都能命中）
  // 1) /post/<xxx> -> ?slug=<xxx>&id=<xxx>
  // 2) /post/?slug=xxx -> 补 id
  // 3) /post/?id=xxx -> 补 slug
  if (!isPostRoot && !isPostIndex && pathKey && pathKey !== "index.html") {
    if (!target.searchParams.has("slug")) target.searchParams.set("slug", pathKey);
    if (!target.searchParams.has("id")) target.searchParams.set("id", pathKey);
  } else {
    const qSlug = target.searchParams.get("slug");
    const qId = target.searchParams.get("id");
    if (qSlug && !qId) target.searchParams.set("id", qSlug);
    if (qId && !qSlug) target.searchParams.set("slug", qId);
  }

  // ✅ 用 ASSETS.fetch 拿静态文件（不走 3xx）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
