// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 解析 /post/<slug>
  const parts = url.pathname.split("/").filter(Boolean);
  const pathSlug = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // 永远用静态 /post/index.html 渲染（关键：它必须被 _routes.json exclude 掉）
  const target = new URL(`${url.origin}/post/index.html`);

  // 保留原 query（utm/ref/旧 id 等）
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 如果路径里带 slug 且 query 里没有 slug/id，则注入 slug
  const hasSlug = url.searchParams.has("slug");
  const hasId = url.searchParams.has("id");
  if (!hasSlug && !hasId && pathSlug && pathSlug !== "index.html") {
    target.searchParams.set("slug", pathSlug);
  }

  // 取静态资源：不做 3xx redirect，避免循环
  return context.env.ASSETS.fetch(target);
}
