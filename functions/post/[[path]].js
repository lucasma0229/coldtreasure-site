// functions/post/[[path]].js
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // 模板页：固定走这个，避免 /post/index.html 被 Pages 自动规范化
  const templatePath = "/post-template.html";

  // 解析路径：
  // /post
  // /post/
  // /post/index.html
  // /post/<slug>
  const parts = url.pathname.split("/").filter(Boolean);

  const isPostRoot =
    (parts.length === 1 && parts[0] === "post") ||
    parts.length === 0;

  const isPostIndex =
    parts.length === 2 &&
    parts[0] === "post" &&
    parts[1] === "index.html";

  const pathKey =
    parts.length >= 2 && parts[0] === "post"
      ? decodeURIComponent(parts[1])
      : "";

  // 如果直接访问模板本身，就直接回源静态资源，避免递归
  if (url.pathname === templatePath) {
    return context.env.ASSETS.fetch(req);
  }

  // 一律内部转给模板页
  const target = new URL(url.origin + templatePath);

  // 原 query 全部保留
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  // 兼容旧链接：如果只有 id，没有 slug，就补一个 slug
  if (target.searchParams.has("id") && !target.searchParams.has("slug")) {
    target.searchParams.set("slug", target.searchParams.get("id"));
  }

  // 标准路径 /post/<xxx> ：优先注入 slug，而不是 id
  if (!isPostRoot && !isPostIndex && pathKey && pathKey !== "index.html") {
    target.searchParams.set("slug", pathKey);
  }

  // 内部重写，不做 3xx 跳转
  return context.env.ASSETS.fetch(new Request(target.toString(), req));
}
