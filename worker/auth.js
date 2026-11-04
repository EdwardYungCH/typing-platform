// 密碼和登入狀態：PBKDF2 雜湊（瀏覽器和 Workers 都有的 WebCrypto），session 存在 D1，cookie 只有 HttpOnly。

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 16) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** 初始密碼：去掉容易混淆的字元（0 O 1 l I）；用拒絕取樣，每個字元機會均等。 */
export function randomPassword(len = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % chars.length);
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < limit && out.length < len) out += chars[b % chars.length];
    }
  }
  return out;
}

// Cloudflare Workers 的 PBKDF2 最多 100,000 次
const ITER = 100000;
export async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
  return { hash: toHex(bits), salt };
}

export async function verifyPassword(password, salt, hash) {
  const h = await hashPassword(password, salt);
  if (h.hash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.hash.length; i++) diff |= h.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/** 帳號不存在時也做一次雜湊，回應時間就跟「密碼錯」一樣，外人無法憑時間估帳號是否存在 */
export async function dummyVerify(password) {
  await hashPassword(password, '00000000000000000000000000000000');
  return false;
}

// ---------- Session ----------
// 學生：剔「記住我」= 30 日；不剔 = 關閉瀏覽器就登出，伺服器最多保留 10 小時（學校電腦室共用電腦）。
// 老師：剔「記住我」= 14 日；不剔 = 關閉瀏覽器就登出，伺服器最多 12 小時。
// 兩者都有閒置上限：學生 30 日、老師 7 日沒有用過就失效。
const COOKIE = { student: 'tp_s', teacher: 'tp_t' };
const LIFE = {
  student: { remember: 30 * 86400, temp: 10 * 3600, idle: 30 * 86400 },
  teacher: { remember: 14 * 86400, temp: 12 * 3600, idle: 7 * 86400 },
};

export function cookieHeader(kind, token, maxAgeSec) {
  const age = maxAgeSec ? `; Max-Age=${maxAgeSec}` : '';
  return `${COOKIE[kind]}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${age}`;
}

export function clearCookie(kind) {
  return `${COOKIE[kind]}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(req, name) {
  const raw = req.headers.get('Cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function createSession(db, kind, userId, remember = false) {
  const token = randomHex(32);
  const life = LIFE[kind];
  const sec = remember ? life.remember : life.temp;
  const now = new Date();
  const expires = new Date(now.getTime() + sec * 1000).toISOString();
  await db.prepare('INSERT INTO sessions (token, kind, user_id, expires_at, last_seen, remember) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(token, kind, userId, expires, now.toISOString(), remember ? 1 : 0).run();
  return { token, header: cookieHeader(kind, token, remember ? sec : 0) };
}

/** 讀 cookie 找出目前登入的學生或老師（連所屬學校）；沒有、過期、學校停用都回 null。 */
export async function currentUser(db, req, kind) {
  const token = readCookie(req, COOKIE[kind]);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const table = kind === 'student' ? 'students' : 'teachers';
  const u = await db.prepare(`SELECT u.*, s.expires_at AS _expires, s.last_seen AS _seen, sc.code AS school_code, sc.name AS school_name, sc.active AS school_active, sc.settings AS school_settings
    FROM sessions s JOIN ${table} u ON u.id = s.user_id LEFT JOIN schools sc ON sc.id = u.school_id
    WHERE s.token = ? AND s.kind = ?`).bind(token, kind).first();
  if (!u) return null;
  const now = Date.now();
  if (u._expires < new Date(now).toISOString()) return null;
  if (u._seen && Date.parse(u._seen) < now - LIFE[kind].idle * 1000) return null;
  // 學校停用：學生和該校老師都不能用（平台營運者例外）
  if (u.school_id && u.school_active === 0 && !u.is_owner) return null;
  // 每小時最多更新一次「最後使用」，減少寫入
  if (!u._seen || Date.parse(u._seen) < now - 3600000) {
    await db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').bind(new Date(now).toISOString(), token).run();
  }
  try { u.settings = JSON.parse(u.school_settings ?? '{}'); } catch { u.settings = {}; }
  u._token = token;
  return u;
}

export async function destroySession(db, req, kind) {
  const token = readCookie(req, COOKIE[kind]);
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

/** 改密碼後：登出這個人其他所有裝置（保留目前這個） */
export function revokeOthers(db, kind, userId, keepToken = '') {
  return db.prepare('DELETE FROM sessions WHERE kind = ? AND user_id = ? AND token != ?').bind(kind, userId, keepToken);
}

/** 清理過期 session 和舊的登入失敗紀錄（每次登入時和每日排程順便做）。 */
export async function sweep(db) {
  const now = new Date().toISOString();
  const day = new Date(Date.now() - 86400000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM login_fails WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)').bind(day, now),
  ]);
}

// ---------- 登入次數限制 ----------
// 同一個網絡（IP）：10 分鐘內失敗 300 次就暫停 10 分鐘（學校全校共用一個對外 IP，所以上限較寬）。
// 帳號 + 網絡：教師 8 次、學生 10 次就鎖 10 分鐘（同學亂試別人帳號，只會鎖住自己所在網絡，不會令本人在家也登入不到）。
// 帳號（不論網絡）：一小時內 50 次失敗才鎖 30 分鐘，防止有人換不同網絡慢慢估。
export const LIMITS = {
  ip: { max: 300, windowMin: 10, lockMin: 10 },
  teacherIp: { max: 8, windowMin: 15, lockMin: 10 },
  studentIp: { max: 10, windowMin: 15, lockMin: 10 },
  account: { max: 50, windowMin: 60, lockMin: 30 },
};

export function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'local';
}

/** 一次過查幾個 key 是否被鎖：回傳最遲的解鎖時間（ISO）或 null */
export async function lockedUntil(db, ...keys) {
  const rows = (await db.prepare(`SELECT locked_until FROM login_fails WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results;
  const now = new Date().toISOString();
  const locks = rows.map((r) => r.locked_until).filter((t) => t && t > now).sort();
  return locks.length ? locks[locks.length - 1] : null;
}

/** 記一次失敗（幾個 key 一起記）；超過上限就鎖 */
export async function recordFails(db, pairs) {
  const now = new Date();
  const keys = pairs.map(([k]) => k);
  const rows = new Map((await db.prepare(`SELECT * FROM login_fails WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results.map((r) => [r.key, r]));
  const stmts = [];
  for (const [key, { max, windowMin, lockMin }] of pairs) {
    const r = rows.get(key);
    const fresh = !r || new Date(r.window_start).getTime() < now.getTime() - windowMin * 60000;
    const count = fresh ? 1 : r.count + 1;
    const start = fresh ? now.toISOString() : r.window_start;
    const lock = count >= max ? new Date(now.getTime() + lockMin * 60000).toISOString() : null;
    stmts.push(db.prepare(`INSERT INTO login_fails (key, count, window_start, locked_until) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, locked_until = excluded.locked_until`)
      .bind(key, lock ? 0 : count, lock ? now.toISOString() : start, lock));
  }
  await db.batch(stmts);
}

export async function clearFails(db, ...keys) {
  await db.prepare(`DELETE FROM login_fails WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run();
}

/** 解鎖時間 → 「請 N 分鐘後再試」 */
export function waitMsg(until) {
  const min = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60000));
  return `請 ${min} 分鐘後再試`;
}
