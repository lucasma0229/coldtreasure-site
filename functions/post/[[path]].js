export async function onRequest(context) {

  const req = context.request
  const url = new URL(req.url)

  // ⭐ 防止循环：index.html 直接返回静态资源
  if (url.pathname === "/post/index.html") {
    return context.env.ASSETS.fetch(req)
  }

  const parts = url.pathname.split("/").filter(Boolean)

  const isPostRoot =
    (parts.length === 1 && parts[0] === "post") ||
    (parts.length === 0)

  const isPostIndex =
    parts.length === 2 && parts[0] === "post" && parts[1] === "index.html"

  const pathId =
    parts.length >= 2 && parts[0] === "post"
      ? parts[1]
      : ""

  const target = new URL(`${url.origin}/post/index.html`)

  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v)
  }

  if (target.searchParams.has("slug") && !target.searchParams.has("id")) {
    target.searchParams.set("id", target.searchParams.get("slug"))
  }

  if (!isPostRoot && !isPostIndex && pathId && pathId !== "index.html") {
    target.searchParams.set("id", pathId)
  }

  return context.env.ASSETS.fetch(new Request(target.toString(), req))
}
