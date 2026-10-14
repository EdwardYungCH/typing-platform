// 跟伺服器（worker/index.js）溝通的小工具。沒有伺服器（例如本機只用 python http.server）時所有呼叫都會失敗，
// 各頁面要能照常以「只存在瀏覽器」模式運作。

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** 呼叫 /api/...；成功回傳 JSON，失敗拋出 ApiError（message 是伺服器的中文錯誤訊息）。 */
export async function api(path, { method = 'GET', body = null, raw = false } = {}) {
  const base = document.baseURI.includes('/zh/') || document.baseURI.includes('/teacher/') ? '../' : '';
  let res;
  try {
    res = await fetch(`${base}${path.replace(/^\//, '')}`, {
      method,
      credentials: 'same-origin',
      headers: body !== null ? { 'content-type': 'application/json' } : {},
      body: body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError('連不上伺服器，請檢查網絡', 0);
  }
  if (raw) return res;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new ApiError('這個網站沒有開啟伺服器功能', 404);
  const data = await res.json();
  if (!res.ok) throw new ApiError(data?.error ?? `伺服器錯誤（${res.status}）`, res.status);
  return data;
}
