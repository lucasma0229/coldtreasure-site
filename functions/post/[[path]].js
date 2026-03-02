export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 已经带 slug 或 id：直接转到静态 /post/index.html（保留 query）
  const hasSlug = url.searchParams.has("slug");
  const hasId = url.searchParams.has("id");

  // 解析 /post/<slug>
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex = parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathSlug = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // 永远用静态的 /post/index.html 渲染（这条必须在 _routes.json 里 exclude）
  const target = new URL(`${url.origin}/post/index.html`);

  // 保留原 query（utm/ref/旧 id 等）
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 只有当 URL 里没带 slug/id，且访问的是 /post/<slug> 时，注入 slug
  if (!hasSlug && !hasId && !isPostRoot && !isPostIndex && pathSlug) {
    target.searchParams.set("slug", pathSlug);
  }

  // 用 ASSETS.fetch 获取静态资源，不做 3xx，避免循环
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
