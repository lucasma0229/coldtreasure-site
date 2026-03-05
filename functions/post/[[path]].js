// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  const parts = url.pathname.split("/").filter(Boolean);
  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";

  // ✅ 1) /post/index.html 必须放行：原样返回静态资源
  if (isPostIndex) {
    return context.env.ASSETS.fetch(req);
  }

  // 兼容：/post  或 /post/
  const isPostRoot =
    (parts.length === 1 && parts[0] === "post") ||
    (parts.length === 0);

  // 兼容：/post/<xxx>
  const pathId = parts.length >= 2 && parts[0] === "post" ? parts[1] : "";

  // ✅ 2) 永远“内部改写”到静态页，但用 assets.local 避免回源再进函数
  const target = new URL("https://assets.local/post/index.html");

  // 保留 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // ✅ 3) 兼容：只有 slug 没有 id -> 补 id=slug
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // ✅ 4) 兼容：/post/<xxx> -> 注入 id=<xxx>
  if (!isPostRoot && pathId && pathId !== "index.html") {
    if (!target.searchParams.has("id")) {
      target.searchParams.set("id", pathId);
    }
  }

  // 不做 3xx：直接返回静态页内容（保持 method/headers）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
