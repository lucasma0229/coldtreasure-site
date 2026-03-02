export async function onRequest(context) {
  const url = new URL(context.request.url);

  const parts = url.pathname.split("/").filter(Boolean);
  const pathId =
    parts[0] === "post" && parts.length >= 2 ? parts[1] : "";

  const target = new URL(`${url.origin}/post/index.html`);

  if (pathId) {
    target.searchParams.set("id", pathId);
  }

  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }

  return context.env.ASSETS.fetch(target);
}
