// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 1) 如果已经有 ?slug= 或 ?id=，直接把 /post/index.html 返回（保留 query）
  const hasSlug = url.searchParams.has("slug");
  const hasId = url.searchParams.has("id");

  // 2) 从路径里解析 /post/<slug>
  // pathname 可能是：
  // - /post
  // - /post/
  // - /post/air-jordan-6-psg-2026
  // - /post/index.html
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";
  const pathSlug =
    parts[0] === "post" && parts.length >= 2 ? parts[1] : "";

  // 3) 目标：永远用静态的 /post/index.html 来渲染
  const target = new URL(`${url.origin}/post/index.html`);

  // 保留原 query（如 utm / ref / 旧的 id 等）
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 4) 决策：
  // - /post 或 /post/：直接返回 index.html（页面会提示 Missing slug）
  // - /post/index.html：直接返回（正常静态页）
  // - /post/<slug>：注入 slug=pathSlug
  if (!hasSlug && !hasId && !isPostRoot && !isPostIndex && pathSlug) {
    target.searchParams.set("slug", pathSlug);
  }

  // 5) 用 ASSETS.fetch 取静态资源（不做 3xx redirect，避免循环）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
