// 登入狀態和進度同步。
// 登入後：整份瀏覽器紀錄（課堂、步驟、弱項、掌握度、每日任務、夥伴）當作一份快照存到伺服器；
// 每次有改動就延遲 1.5 秒推送一次；開頁時先拉取伺服器版本。
// 登出時清掉這部電腦的紀錄，免得下一個用同一部電腦的同學接手。

import { api } from './api.js';

const KEYS = { store: 'typing-platform:v1', mastery: 'typing-platform:mastery:v1', daily: 'typing-platform:daily:v1' };
const USER_KEY = 'typing-platform:user';       // sessionStorage：登入的學生（避免每頁都問伺服器）
const SYNCED_KEY = 'typing-platform:synced';   // 上次跟伺服器對齊時伺服器的 updatedAt
const DIRTY_KEY = 'typing-platform:dirty';     // 有未推送的改動

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };

export function cachedUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; }
}
function cacheUser(u) {
  try { u ? sessionStorage.setItem(USER_KEY, JSON.stringify(u)) : sessionStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

/** 目前登入的學生（問伺服器一次，之後用快取）；沒有伺服器或未登入回 null。 */
export async function currentUser({ refresh = false } = {}) {
  if (!refresh) {
    const c = cachedUser();
    if (c !== null) return c.sid ? c : null;
  }
  try {
    const r = await api('/api/me');
    cacheUser(r.user ?? { sid: null });
    return r.user ?? null;
  } catch {
    cacheUser({ sid: null });
    return null;
  }
}

export function snapshot() {
  const out = {};
  for (const [name, key] of Object.entries(KEYS)) {
    try { out[name] = JSON.parse(get(key)) ?? null; } catch { out[name] = null; }
  }
  return out;
}

function hasLocalData() {
  const s = snapshot();
  return !!(s.store && (Object.keys(s.store.lessons ?? {}).length || (s.store.attempts ?? []).length)) || !!(s.mastery && Object.keys(s.mastery).length);
}

function applySnapshot(data) {
  for (const [name, key] of Object.entries(KEYS)) set(key, data?.[name] ? JSON.stringify(data[name]) : null);
}

export function clearLocal() {
  for (const key of Object.values(KEYS)) set(key, null);
  set(SYNCED_KEY, null); set(DIRTY_KEY, null);
  cacheUser(null);
}

/** 開頁時對齊：伺服器有較新版本就覆蓋本機；本機有未推送的改動而伺服器沒變就推送；伺服器空白就把本機上載。 */
export async function pull() {
  const r = await api('/api/progress');
  const synced = get(SYNCED_KEY);
  if (!r.data) {
    if (hasLocalData()) await push();
    else set(SYNCED_KEY, 'empty');
    return 'uploaded';
  }
  if (r.updatedAt === synced) {
    if (get(DIRTY_KEY)) await push();
    return 'same';
  }
  applySnapshot(r.data);
  set(SYNCED_KEY, r.updatedAt); set(DIRTY_KEY, null);
  return 'downloaded';
}

let timer = null;
export async function push() {
  const r = await api('/api/progress', { method: 'PUT', body: snapshot() });
  set(SYNCED_KEY, r.updatedAt); set(DIRTY_KEY, null);
  return r;
}

function schedulePush() {
  set(DIRTY_KEY, '1');
  clearTimeout(timer);
  timer = setTimeout(() => push().catch(() => { /* 離線時留着 dirty，下次開頁再推 */ }), 1500);
}

/** 每頁開始時呼叫一次：登入了就拉取並監聽改動。回傳登入的學生或 null。 */
export async function start() {
  const user = await currentUser();
  if (!user) return null;
  try { await pull(); } catch { /* 離線照常用本機紀錄 */ }
  window.addEventListener('tp:changed', schedulePush);
  window.addEventListener('pagehide', () => { if (get(DIRTY_KEY)) { clearTimeout(timer); push().catch(() => {}); } });
  return user;
}

export async function login(sid, password) {
  const r = await api('/api/login', { method: 'POST', body: { sid, password } });
  // 換了人：之前那個人（或未登入時）的本機紀錄不應留給這位同學——除非伺服器仍是空白，那就當成他的
  const before = cachedUser();
  if (before?.sid && before.sid !== r.user.sid) clearLocal();
  cacheUser(r.user);
  set(SYNCED_KEY, null);
  await pull();
  return r.user;
}

export async function logout() {
  try { if (get(DIRTY_KEY)) await push(); } catch { /* ignore */ }
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch { /* ignore */ }
  clearLocal();
}
