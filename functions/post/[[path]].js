// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 解析路径
  const parts = url.pathname.split("/").filter(Boolean);
  // 可能是：[] / ["post"] / ["post","index.html"] / ["post","<id>"]
  const isPostRoot =
    (parts.length === 1 && parts[0] === "post") ||
    (parts.length === 0); // 极端情况兜底

  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";

  const pathId =
    parts.length >= 2 && parts[0] === "post" ? parts[1] : "";

  // 目标永远是静态页
  const target = new URL(`${url.origin}/post/index.html`);

  // 保留原 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 兼容：如果只有 slug，没有 id，则补 id=slug
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // 兼容：/post/<xxx> 注入 id=<xxx>
  if (!isPostRoot && !isPostIndex && pathId && pathId !== "index.html") {
    target.searchParams.set("id", pathId);
  }

  // 不做 3xx，直接取静态资源（沿用原 method/headers）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
