// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 解析 /post/<id>
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex = parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathId = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // 目标永远是静态页
  const target = new URL(`${url.origin}/post/index.html`);

  // 先原样保留 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 兼容：如果只有 slug，没有 id，则补 id=slug（你的 posts.json 主键是 id）
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // 兼容：/post/<xxx> 注入 id=<xxx>
  if (!isPostRoot && !isPostIndex && pathId) {
    // 避免 /post/index.html 被当成 id
    if (pathId !== "index.html") {
      target.searchParams.set("id", pathId);
    }
  }

  // 不做 3xx，直接取静态资源（带上原 request 的 method/headers）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
