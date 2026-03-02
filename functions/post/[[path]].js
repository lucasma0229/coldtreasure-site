export async function onRequest(context) {
  const url = new URL(context.request.url);

  const pathParts = url.pathname.split("/").filter(Boolean);
  const slug = pathParts[1] || "";

  if (!slug) {
    return context.env.ASSETS.fetch(new Request(`${url.origin}/post/index.html`));
  }

  const newUrl = new URL(`${url.origin}/post/index.html`);
  newUrl.searchParams.set("slug", slug);

  return context.env.ASSETS.fetch(new Request(newUrl.toString()));
}
