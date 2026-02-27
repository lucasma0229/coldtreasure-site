// assets/js/posts-source.js
export async function fetchPostsUnified(){
  // 1) CMS / API source
  try{
    const r = await fetch("/api/posts", { cache: "no-store" });
    if(r.ok){
      const data = await r.json();
      // 兼容两种返回结构：数组 或 {posts:[...]}
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : null);
      if(arr && arr.length) return arr;
    }
  }catch(e){ /* ignore */ }

  // 2) fallback: old static source
  try{
    const r2 = await fetch("/assets/data/posts.json", { cache: "no-store" });
    if(!r2.ok) return [];
    const data2 = await r2.json();
    return Array.isArray(data2) ? data2 : (Array.isArray(data2?.posts) ? data2.posts : []);
  }catch(e){
    return [];
  }
}
