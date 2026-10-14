// 回應小工具
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const fail = (msg, status = 400) => json({ error: msg }, status);
export async function body(req) {
  try { return await req.json(); } catch { return null; }
}
