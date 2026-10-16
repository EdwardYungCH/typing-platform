// 密碼和登入狀態：PBKDF2 雜湊（瀏覽器和 Workers 都有的 WebCrypto），session 存在 D1，cookie 只有 HttpOnly。

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 16) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** 初始密碼：6 位，去掉容易混淆的字元（0 O 1 l I）。 */
export function randomPassword(len = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return [...arr].map((b) => chars[b % chars.length]).join('');
}

export async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: toHex(bits), salt };
}

export async function verifyPassword(password, salt, hash) {
  const h = await hashPassword(password, salt);
  if (h.hash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.hash.length; i++) diff |= h.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

const COOKIE = { student: 'tp_s', teacher: 'tp_t' };
const DAYS = { student: 90, teacher: 14 };

export function cookieHeader(kind, token, maxAgeDays) {
  const age = maxAgeDays * 86400;
  return `${COOKIE[kind]}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
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

export async function createSession(db, kind, userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + DAYS[kind] * 86400000).toISOString();
  await db.prepare('INSERT INTO sessions (token, kind, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(token, kind, userId, expires).run();
  return { token, header: cookieHeader(kind, token, DAYS[kind]) };
}

/** 讀 cookie 找出目前登入的學生或老師；沒有就回 null。 */
export async function currentUser(db, req, kind) {
  const token = readCookie(req, COOKIE[kind]);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const s = await db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ? AND kind = ?').bind(token, kind).first();
  if (!s || s.expires_at < new Date().toISOString()) return null;
  const table = kind === 'student' ? 'students' : 'teachers';
  const user = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(s.user_id).first();
  if (!user) return null;
  user._token = token;
  return user;
}

export async function destroySession(db, req, kind) {
  const token = readCookie(req, COOKIE[kind]);
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

/** 偶爾清理過期 session（每次登入時順便做）。 */
export async function sweepSessions(db) {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
}

// ---------- 登入次數限制 ----------
// 同一個網絡（IP）：10 分鐘內失敗 60 次就暫停 10 分鐘（學校全校共用一個對外 IP，所以上限較寬）；
// 教師帳號：失敗 5 次鎖 15 分鐘；學生帳號另有 8 次鎖 10 分鐘（worker/index.js）。
export const LIMITS = { ip: { max: 60, windowMin: 10, lockMin: 10 }, teacher: { max: 5, windowMin: 15, lockMin: 15 } };

export function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ?? 'local';
}

/** 這個 key 現在是否被鎖：回傳解鎖時間（ISO）或 null */
export async function lockedUntil(db, key) {
  const r = await db.prepare('SELECT locked_until FROM login_fails WHERE key = ?').bind(key).first();
  return r?.locked_until && r.locked_until > new Date().toISOString() ? r.locked_until : null;
}

/** 記一次失敗；超過上限就鎖 */
export async function recordFail(db, key, { max, windowMin, lockMin }) {
  const now = new Date();
  const r = await db.prepare('SELECT * FROM login_fails WHERE key = ?').bind(key).first();
  const fresh = !r || new Date(r.window_start).getTime() < now.getTime() - windowMin * 60000;
  const count = fresh ? 1 : r.count + 1;
  const start = fresh ? now.toISOString() : r.window_start;
  const lock = count >= max ? new Date(now.getTime() + lockMin * 60000).toISOString() : null;
  await db.prepare(`INSERT INTO login_fails (key, count, window_start, locked_until) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, locked_until = excluded.locked_until`)
    .bind(key, lock ? 0 : count, lock ? now.toISOString() : start, lock).run();
  return lock;
}

export async function clearFails(db, key) {
  await db.prepare('DELETE FROM login_fails WHERE key = ?').bind(key).run();
}
