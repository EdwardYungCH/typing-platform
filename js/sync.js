// 登入狀態和進度同步。
// 登入後：整份瀏覽器紀錄（課堂、步驟、弱項、掌握度、每日任務）當作一份快照存到伺服器；
// 每次有改動就延遲 1.5 秒推送一次；開頁時先拉取伺服器版本。
// 兩部電腦同時用：推送時附上「上次見到的伺服器版本」，伺服器已有較新版本就退回，這裏把兩份合併後再推送，不會互相覆蓋。
// 共用電腦：本機紀錄記下「屬於誰」（OWNER_KEY）；另一位同學登入時先清走，上一位同學的進度不會變成他的。

import { api } from './api.js';

const KEYS = { store: 'typing-platform:v1', mastery: 'typing-platform:mastery:v1', daily: 'typing-platform:daily:v1' };
const USER_KEY = 'typing-platform:user';       // sessionStorage：登入的學生（避免每頁都問伺服器）
const SYNCED_KEY = 'typing-platform:synced';   // 上次跟伺服器對齊時伺服器的 updatedAt
const DIRTY_KEY = 'typing-platform:dirty';     // 有未推送的改動
const OWNER_KEY = 'typing-platform:owner';     // 本機紀錄屬於哪位學生（學校代碼:學號）；沒有 = 未登入時練習的
const PENDING_TEST = 'typing-platform:pendingTest';
const PARK_KEY = 'typing-platform:parked';      // 登出時未能上載的紀錄（只給同一位同學下次登入時補上）

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } };
const ownerOf = (u) => (u ? `${u.school?.code ?? ''}:${u.sid}` : null);

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
    // 登入已過期，但這部電腦仍留着某位同學的紀錄：收起來，免得下一位用這部電腦的同學看到或接手
    if (!r.user && get(OWNER_KEY)) clearLocal();
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

function hasLocalData(s = snapshot()) {
  return !!(s.store && (Object.keys(s.store.lessons ?? {}).length || (s.store.attempts ?? []).length)) || !!(s.mastery && Object.keys(s.mastery).length);
}

function applySnapshot(data) {
  for (const [name, key] of Object.entries(KEYS)) set(key, data?.[name] ? JSON.stringify(data[name]) : null);
  try { window.dispatchEvent(new CustomEvent('tp:synced')); } catch { /* ignore */ }
}

export function clearLocal() {
  for (const key of Object.values(KEYS)) set(key, null);
  set(SYNCED_KEY, null); set(DIRTY_KEY, null); set(OWNER_KEY, null); set(PENDING_TEST, null);
  cacheUser(null);
}

// ---------- 合併兩份紀錄（同一位學生在兩部電腦的進度）：每項取較好的 ----------
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const later = (a, b) => (String(a ?? '') >= String(b ?? '') ? a : b);

function mergeBest(a, b) {
  if (!isObj(a)) return b ?? a;
  if (!isObj(b)) return a;
  const out = { ...b, ...a };
  for (const k of Object.keys(out)) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') out[k] = Math.max(x, y);
    else if (typeof x === 'boolean' || typeof y === 'boolean') out[k] = !!(x || y);
    else if (isObj(x) && isObj(y)) out[k] = mergeBest(x, y);
    else if (typeof x === 'string' && typeof y === 'string' && /^\d{4}-\d\d-\d\d/.test(x)) out[k] = later(x, y);
    else out[k] = x ?? y;
  }
  return out;
}

function mergeMap(a, b, fn) {
  const out = { ...(b ?? {}) };
  for (const [k, v] of Object.entries(a ?? {})) out[k] = k in out ? fn(v, out[k]) : v;
  return out;
}

function mergeStore(a, b) {
  if (!isObj(a)) return b; if (!isObj(b)) return a;
  const out = { ...b, ...a };
  out.lessons = mergeMap(a.lessons, b.lessons, (x, y) => ({ ...mergeBest(x, y), skipped: !!(x?.skipped && y?.skipped) }));
  // 步驟：最近一次以較新的為準，最佳成績取高
  out.steps = mergeMap(a.steps, b.steps, (x, y) => ({ ...mergeBest(x, y), latest: String(x?.latest?.at ?? '') >= String(y?.latest?.at ?? '') ? x?.latest : y?.latest }));
  const seen = new Set();
  out.attempts = [...(a.attempts ?? []), ...(b.attempts ?? [])].filter((t) => { const k = `${t?.at}|${t?.lessonId}|${t?.step}|${t?.mode}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => String(x?.at).localeCompare(String(y?.at))).slice(-500);
  out.tests = mergeMap(a.tests, b.tests, mergeBest);
  out.shortcuts = mergeMap(a.shortcuts, b.shortcuts, mergeBest);
  out.games = mergeMap(a.games, b.games, mergeBest);
  out.weak = mergeMap(a.weak, b.weak, (x, y) => mergeMap(x, y, mergeBest));
  // 設定：以這部電腦為準；錢包合併（已買的都保留、已用的星星取較多）
  out.settings = { ...(b.settings ?? {}), ...(a.settings ?? {}) };
  const wa = a.settings?.wallet, wb = b.settings?.wallet;
  if (isObj(wa) || isObj(wb)) {
    const w = { ...(wb ?? {}), ...(wa ?? {}) };
    w.spent = Math.max(wa?.spent ?? 0, wb?.spent ?? 0);
    w.owned = [...new Set([...(wa?.owned ?? []), ...(wb?.owned ?? [])])];
    w.bonus = { ...(wb?.bonus ?? {}), ...(wa?.bonus ?? {}) };
    out.settings.wallet = w;
  }
  return out;
}

export function mergeSnapshots(local, server) {
  return {
    store: mergeStore(local?.store, server?.store),
    // 掌握度：每項取最近見過的那份
    mastery: isObj(local?.mastery) || isObj(server?.mastery) ? mergeMap(local?.mastery, server?.mastery, (x, y) => (Number(x?.last ?? 0) >= Number(y?.last ?? 0) ? x : y)) : null,
    daily: isObj(local?.daily) || isObj(server?.daily) ? mergeMap(local?.daily, server?.daily, mergeBest) : null,
  };
}

/** 開頁時對齊：伺服器沒變就推送本機改動；伺服器有新版本而本機也有未推送改動就合併；否則用伺服器版本。 */
export async function pull() {
  const r = await api('/api/progress');
  const synced = get(SYNCED_KEY);
  if (!r.data) {
    // 伺服器空白：上載時附上「empty」，如果另一部電腦剛好同時上載了，伺服器會退回讓這裏合併
    set(SYNCED_KEY, 'empty');
    if (hasLocalData()) await push();
    else set(SYNCED_KEY, 'empty');
    return 'uploaded';
  }
  if (r.updatedAt === synced) {
    if (get(DIRTY_KEY)) await push();
    return 'same';
  }
  if (get(DIRTY_KEY) || (synced === null && hasLocalData())) {
    applySnapshot(mergeSnapshots(snapshot(), r.data));
    set(SYNCED_KEY, r.updatedAt);
    await push();
    return 'merged';
  }
  applySnapshot(r.data);
  set(SYNCED_KEY, r.updatedAt); set(DIRTY_KEY, null);
  return 'downloaded';
}

let timer = null;
export async function push(retry = 2) {
  const base = get(SYNCED_KEY);
  const headers = base ? { 'x-base': base } : {};
  try {
    const r = await api('/api/progress', { method: 'PUT', body: snapshot(), headers });
    set(SYNCED_KEY, r.updatedAt); set(DIRTY_KEY, null);
    return r;
  } catch (err) {
    // 另一部電腦剛更新過：合併後再送
    if (err.status === 409 && err.data?.data && retry > 0) {
      applySnapshot(mergeSnapshots(snapshot(), err.data.data));
      set(SYNCED_KEY, err.data.updatedAt);
      return push(retry - 1);
    }
    throw err;
  }
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
  if (!get(OWNER_KEY)) set(OWNER_KEY, ownerOf(user));
  try { await pull(); } catch { /* 離線照常用本機紀錄 */ }
  window.addEventListener('tp:changed', schedulePush);
  window.addEventListener('pagehide', () => { if (get(DIRTY_KEY)) { clearTimeout(timer); push().catch(() => {}); } });
  return user;
}

/**
 * 登入。本機紀錄屬於另一位同學：先清走。本機有未登入時的練習紀錄：
 * keepGuest = true 就併入這個帳戶（登入頁會先問學生），否則清走。
 */
export async function login(sid, password, { school = '', remember = false, keepGuest = false } = {}) {
  const r = await api('/api/login', { method: 'POST', body: { sid, password, school, remember } });
  const owner = get(OWNER_KEY), me = ownerOf(r.user);
  if ((owner && owner !== me) || (!owner && hasLocalData() && !keepGuest)) clearLocal();
  cacheUser(r.user);
  set(OWNER_KEY, me);
  set(SYNCED_KEY, null);
  // 上次登出時未能上載的紀錄：同一位同學就補上，其他人就刪走
  try {
    const park = JSON.parse(localStorage.getItem(PARK_KEY) ?? 'null');
    if (park) {
      localStorage.removeItem(PARK_KEY);
      if (park.owner === me && Date.now() - park.at < 30 * 86400000) { applySnapshot(mergeSnapshots(snapshot(), park.data)); set(DIRTY_KEY, '1'); }
    }
  } catch { /* ignore */ }
  await pull();
  return r.user;
}

/** 本機有沒有「未登入時練習」的紀錄（登入頁用來問學生要不要併入帳戶） */
export function hasGuestData() {
  return !get(OWNER_KEY) && hasLocalData();
}

/**
 * 登出：先把未上載的改動送出。送不出（離線、登入已過期）就把這份紀錄暫存起來（只記住屬於誰），
 * 同一位同學下次在這部電腦登入時會自動補上；其他同學登入時看不到、也會被清走。
 * 回傳 false 代表有改動未能上載。
 */
export async function logout() {
  let ok = true;
  if (get(DIRTY_KEY)) {
    try { await push(); } catch {
      ok = false;
      try { localStorage.setItem(PARK_KEY, JSON.stringify({ owner: get(OWNER_KEY), data: snapshot(), at: Date.now() })); } catch { /* ignore */ }
    }
  }
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch { /* ignore */ }
  clearLocal();
  return ok;
}
