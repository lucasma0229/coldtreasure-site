// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 目标：永远用静态 /post/index.html 渲染（不做 3xx，避免循环）
  const target = new URL(`${url.origin}/post/index.html`);

  // 1) 先保留原 query（utm / ref / 旧参数等）
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 2) 兼容：如果带 slug，但你的数据实际用的是 id，则把 slug 映射为 id
  if (url.searchParams.has("slug") && !url.searchParams.has("id")) {
    target.searchParams.set("id", url.searchParams.get("slug"));
  }

  // 3) 从路径解析 /post/<id>
  // pathname 可能是：
  // - /post
  // - /post/
  // - /post/air-jordan-6-psg-2026
  // - /post/index.html
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex = parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathId = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // 4) 如果既没有 id，也没有 slug（或 slug 已映射成 id），并且是 /post/<id>，则注入 id
  const hasId = target.searchParams.has("id");
  if (!hasId && !isPostRoot && !isPostIndex && pathId) {
    target.searchParams.set("id", pathId);
  }

  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
