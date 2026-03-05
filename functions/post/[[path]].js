// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // ✅ 关键：模板不再用 /post/index.html，避免 Pages 自动规范化引发 308 循环
  const templatePath = "/post-template.html";

  // 解析路径：[] / ["post"] / ["post","<id>"] / ["post","index.html"]
  const parts = url.pathname.split("/").filter(Boolean);

  const isPostRoot =
    (parts.length === 1 && parts[0] === "post") ||
    (parts.length === 0);

  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html";

  const pathId =
    parts.length >= 2 && parts[0] === "post" ? parts[1] : "";

  // ✅ 如果用户直接访问模板本身，就直接回源取静态资源（防任何递归）
  if (url.pathname === templatePath) {
    return context.env.ASSETS.fetch(req);
  }

  // 目标永远是模板页
  const target = new URL(url.origin + templatePath);

  // 保留 query
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 兼容：slug -> id
  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"));
  }

  // 兼容：/post/<xxx> 注入 id=<xxx>
  if (!isPostRoot && !isPostIndex && pathId && pathId !== "index.html") {
    target.searchParams.set("id", pathId);
  }

  // 不做 3xx，直接取静态模板资源
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
