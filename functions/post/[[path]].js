// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 解析路径：/post/<slug>
  const parts = url.pathname.split("/").filter(Boolean);
  const isPostRoot = parts.length === 1 && parts[0] === "post";
  const pathSlug = (parts[0] === "post" && parts.length >= 2) ? parts[1] : "";

  // 目标：永远用静态的 /post/（目录页）来渲染，避免 /post/index.html → /post/ 的 301 循环
  const target = new URL(`${url.origin}/post/`);

  // 先把原 query 全部带过去
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 如果 URL 没带 ?slug / ?id，并且是 /post/<slug> 这种路径，就注入 slug
  const hasSlug = target.searchParams.has("slug");
  const hasId = target.searchParams.has("id");

  if (!hasSlug && !hasId && !isPostRoot && pathSlug) {
    target.searchParams.set("slug", pathSlug);
  }

  // 用 ASSETS.fetch 取静态页面（不做 3xx redirect，避免循环）
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
