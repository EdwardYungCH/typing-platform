// 回應小工具
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const fail = (msg, status = 400) => json({ error: msg }, status);
export async function body(req) {
  try { return await req.json(); } catch { return null; }
}
/** 伺服器出錯：詳情只寫入記錄（Cloudflare 後台 Observability 可搜尋編號），回應只給一個編號，不洩露內部資料 */
export function serverError(err, req) {
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[錯誤 ${id}] ${req?.method} ${req ? new URL(req.url).pathname : ''}`, err?.stack ?? err);
  return fail(`伺服器出錯（編號 ${id}），請稍後再試；如果一直出現，請把編號告訴老師或系統管理員`, 500);
}
/** CSV 一格：加引號；以 = + - @ 開頭的加一個 ' 防止 Excel 當成公式執行 */
export function csvCell(v) {
  let s = String(v ?? '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
