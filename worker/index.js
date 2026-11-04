// Cloudflare Worker：/api/* 的伺服器程式（登入、進度同步、評測計分、教師後台、平台管理）。
// 靜態網頁由 wrangler.jsonc 的 assets 發佈；本機測試用 tools/dev-server.mjs。

import tests from '../data/tests.json' with { type: 'json' };
import * as auth from './auth.js';
import { verify } from './score.js';
import { teacherRoutes } from './teacher.js';
import { ownerRoutes } from './owner.js';
import { autoBackups, cleanup } from './backup.js';
import { ensureSchema } from './db.js';
import { json, fail, body, serverError } from './http.js';

const MAX_PROGRESS_BYTES = 400 * 1024;
const LANGS = ['en', 'zh'];
const num = (v, max = 1e6) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0; };
const isoOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? v : null);

/** 測驗定義：學生每次開始時由伺服器在幾份題目（forms）中隨機抽一份 */
export function testForms(t) {
  return Array.isArray(t.forms) && t.forms.length ? t.forms : [t.text];
}

/**
 * 由整份進度紀錄抽出老師後台和排行榜要看的摘要。
 * 所有數字都強制轉成有範圍的數字、所有字串都檢查格式，因為進度紀錄由學生的瀏覽器送來，不可信。
 */
export function summarize(data, nowMs = Date.now()) {
  const out = { en: { lessons: 0, stars: 0, bestWpm: 0 }, zh: { lessons: 0, stars: 0, bestWpm: 0 }, minutes: 0, streak: { en: 0, zh: 0 },
    lastActive: null, done: [], boardStars: 0, days: {}, title: null };
  const store = data?.store && typeof data.store === 'object' ? data.store : {};
  const lessons = store.lessons && typeof store.lessons === 'object' ? store.lessons : {};
  for (const [id, v] of Object.entries(lessons)) {
    const m = /^(en|zh):(\d{1,3})$/.exec(id);
    if (!m || !v || typeof v !== 'object' || !v.done) continue;
    const lang = m[1];
    const stars = Math.round(num(v.stars, 3));
    out.done.push(id);
    out[lang].lessons += 1;
    out[lang].stars += stars;
    out[lang].bestWpm = Math.max(out[lang].bestWpm, Math.round(num(v.bestWpm, 300) * 10) / 10);
    if (!v.skipped) out.boardStars += stars;
  }
  for (const r of Object.values(store.shortcuts && typeof store.shortcuts === 'object' ? store.shortcuts : {})) out.boardStars += Math.round(num(r?.stars, 3));
  const attempts = Array.isArray(store.attempts) ? store.attempts : [];
  let seconds = 0;
  const since = nowMs - 14 * 86400000;
  for (const a of attempts) {
    const s = num(a?.seconds, 3600);
    seconds += s;
    const at = isoOrNull(a?.at);
    if (at && Date.parse(at) > since) { const d = at.slice(0, 10); out.days[d] = (out.days[d] ?? 0) + s; }
    if (at && (!out.lastActive || at > out.lastActive)) out.lastActive = at;
  }
  for (const d of Object.keys(out.days)) out.days[d] = Math.round(out.days[d] / 60);
  out.minutes = Math.round(seconds / 60);
  for (const l of LANGS) out.streak[l] = Math.round(num(data?.daily?.[l]?.streak, 10000));
  const title = store.settings?.wallet?.equip?.title;
  if (typeof title === 'string' && /^[\w-]{1,40}$/.test(title)) out.title = title;
  return out;
}

/** 進度紀錄只收這三部分（js/sync.js 的 snapshot），每部分要是物件或 null */
function cleanProgress(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out = {};
  for (const k of ['store', 'mastery', 'daily']) {
    const v = data[k];
    if (v === undefined || v === null) { out[k] = null; continue; }
    if (typeof v !== 'object' || Array.isArray(v)) return null;
    out[k] = v;
  }
  return out;
}

/** 最近 7 日練習分鐘（由摘要的 days 計） */
function weekMinutes(days, nowMs = Date.now()) {
  const from = new Date(nowMs - 6 * 86400000).toISOString().slice(0, 10);
  return Object.entries(days ?? {}).filter(([d]) => d >= from).reduce((s, [, m]) => s + num(m, 1440), 0);
}

const userInfo = (s) => ({ sid: s.sid, name: s.name, className: s.class_name ?? null, classNo: s.class_no, mustChange: s.initial_pw !== null && s.initial_pw !== undefined,
  school: s.school_code ? { code: s.school_code, name: s.school_name } : null });

/** 找學校：給了代碼就用代碼；沒有給而平台只有一間啟用中的學校，就用那一間 */
async function findSchool(db, code) {
  code = String(code ?? '').trim().toLowerCase();
  if (code) return db.prepare('SELECT * FROM schools WHERE code = ? AND active = 1').bind(code).first();
  const rows = (await db.prepare('SELECT * FROM schools WHERE active = 1 LIMIT 2').all()).results;
  return rows.length === 1 ? rows[0] : null;
}

// ---------- 學生 ----------

async function studentRoutes(req, env, path, student) {
  const db = env.DB;
  const now = new Date().toISOString();

  // 登入頁要知道：這個平台有幾間學校（只有一間就不用填學校代碼）
  if (path === '/api/login-info') {
    const code = new URL(req.url).searchParams.get('school');
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM schools WHERE active = 1').first()).n;
    const s = code ? await findSchool(db, code) : n === 1 ? await findSchool(db, '') : null;
    return json({ multi: n > 1, school: s ? { code: s.code, name: s.name } : null, unknown: !!code && !s });
  }

  if (path === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    const sid = String(b?.sid ?? '').trim().toLowerCase();
    const pw = String(b?.password ?? '');
    if (!sid || !pw) return fail('請輸入學號和密碼');
    const school = await findSchool(db, b?.school);
    if (!school) return fail(String(b?.school ?? '').trim() ? '找不到這個學校代碼，請檢查老師給你的登入紙條' : '請輸入學校代碼', 400);
    const ipKey = `ip:${auth.clientIp(req)}`, accKey = `s:${school.id}:${sid}`, accIpKey = `${accKey}@${auth.clientIp(req)}`;
    const lock = await auth.lockedUntil(db, ipKey, accKey, accIpKey);
    if (lock) return fail(`登入錯誤太多次，${auth.waitMsg(lock)}`, 429);
    const s = await db.prepare('SELECT * FROM students WHERE school_id = ? AND sid = ?').bind(school.id, sid).first();
    const ok = s ? await auth.verifyPassword(pw, s.salt, s.pass_hash) : await auth.dummyVerify(pw);
    if (!ok) {
      await auth.recordFails(db, [[ipKey, auth.LIMITS.ip], [accKey, auth.LIMITS.account], [accIpKey, auth.LIMITS.studentIp]]);
      return fail('學號或密碼不對', 401);
    }
    await auth.clearFails(db, accKey, accIpKey);
    await auth.sweep(db);
    let st = {}; try { st = JSON.parse(school.settings || '{}') ?? {}; } catch { /* ignore */ }
    const remember = !!b?.remember && st.studentRemember !== false;
    const { header } = await auth.createSession(db, 'student', s.id, remember);
    const cls = s.class_id ? await db.prepare('SELECT name FROM classes WHERE id = ?').bind(s.class_id).first() : null;
    return json({ ok: true, user: userInfo({ ...s, class_name: cls?.name, school_code: school.code, school_name: school.name }) }, 200, { 'set-cookie': header });
  }

  if (path === '/api/logout' && req.method === 'POST') {
    await auth.destroySession(db, req, 'student');
    return json({ ok: true }, 200, { 'set-cookie': auth.clearCookie('student') });
  }

  if (path === '/api/me') {
    if (!student) return json({ user: null });
    const cls = student.class_id ? await db.prepare('SELECT name FROM classes WHERE id = ?').bind(student.class_id).first() : null;
    return json({ user: userInfo({ ...student, class_name: cls?.name }) });
  }

  if (path === '/api/password' && req.method === 'POST') {
    if (!student) return fail('請先登入', 401);
    const b = await body(req);
    const oldPw = String(b?.old ?? ''), newPw = String(b?.password ?? '');
    if (!(await auth.verifyPassword(oldPw, student.salt, student.pass_hash))) return fail('舊密碼不對', 401);
    if (newPw.length < 6 || newPw.length > 64) return fail('新密碼要 6–64 個字元');
    if (newPw === oldPw) return fail('新密碼不可以跟舊密碼一樣');
    const h = await auth.hashPassword(newPw);
    await db.batch([
      db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = NULL WHERE id = ?').bind(h.hash, h.salt, student.id),
      auth.revokeOthers(db, 'student', student.id, student._token),
    ]);
    return json({ ok: true });
  }

  // ----- 問題回報（要登入：學生或老師；每人每小時最多 5 次）-----
  if (path === '/api/feedback' && req.method === 'POST') {
    const teacher = student ? null : await auth.currentUser(db, req, 'teacher');
    if (!student && !teacher) return fail('請先登入再回報問題（未登入時可以把問題告訴老師）', 401);
    const who = student ? ['student_id', student.id] : ['teacher_id', teacher.id];
    const hourAgo = new Date(Date.now() - 3600000).toISOString().replace('T', ' ').slice(0, 19);
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE ${who[0]} = ? AND created_at > ?`).bind(who[1], hourAgo).first()).n;
    if (n >= 5) return fail('一小時內最多回報 5 次，請稍後再試', 429);
    const b = await body(req);
    const msg = String(b?.message ?? '').trim().slice(0, 1000);
    if (msg.length < 3) return fail('請寫幾個字說明問題');
    await db.prepare(`INSERT INTO feedback (${who[0]}, school_id, page, message, ua) VALUES (?, ?, ?, ?, ?)`)
      .bind(who[1], (student ?? teacher).school_id ?? null, String(b?.page ?? '').slice(0, 200), msg, (req.headers.get('User-Agent') ?? '').slice(0, 200)).run();
    return json({ ok: true });
  }

  if (!student) return fail('請先登入', 401);

  if (path === '/api/progress' && req.method === 'GET') {
    const p = await db.prepare('SELECT data, updated_at FROM progress WHERE student_id = ?').bind(student.id).first();
    return json({ data: p ? JSON.parse(p.data) : null, updatedAt: p?.updated_at ?? null });
  }

  if (path === '/api/progress' && req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_PROGRESS_BYTES) return fail('紀錄太大', 413);
    let data;
    try { data = cleanProgress(JSON.parse(text)); } catch { data = null; }
    if (!data) return fail('格式不對');
    // 兩部電腦同時用：瀏覽器送來它上次見到的版本（x-base）；伺服器已有較新版本就退回，讓瀏覽器先合併再送
    const base = req.headers.get('x-base');
    if (base !== null) {
      const cur = await db.prepare('SELECT data, updated_at FROM progress WHERE student_id = ?').bind(student.id).first();
      if (cur && cur.updated_at !== base) return json({ conflict: true, data: JSON.parse(cur.data), updatedAt: cur.updated_at }, 409);
    }
    const summary = JSON.stringify(summarize(data));
    await db.prepare(`INSERT INTO progress (student_id, data, summary, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET data = excluded.data, summary = excluded.summary, updated_at = excluded.updated_at`)
      .bind(student.id, JSON.stringify(data), summary, now).run();
    return json({ ok: true, updatedAt: now });
  }

  // ----- 老師功課 -----
  if (path === '/api/assignments' && req.method === 'GET') {
    const rows = student.class_id ? (await db.prepare(`SELECT a.id, a.lang, a.lesson_id, a.due, a.note, a.created_at, t.name AS teacher FROM assignments a JOIN teachers t ON t.id = a.teacher_id
      WHERE a.class_id = ? ORDER BY COALESCE(a.due, '9999'), a.id`).bind(student.class_id).all()).results : [];
    return json({ assignments: rows });
  }

  // ----- 班內排行榜：星星、本週練習分鐘、最佳速度；老師可按班關掉。只讀伺服器整理好的摘要 -----
  if (path === '/api/leaderboard' && req.method === 'GET') {
    if (!student.class_id) return json({ enabled: false, reason: '未編班' });
    const cls = await db.prepare('SELECT show_board FROM classes WHERE id = ?').bind(student.class_id).first();
    if (!cls?.show_board) return json({ enabled: false, reason: '老師關閉了這班的排行榜' });
    const rows = (await db.prepare('SELECT s.id, s.name, s.class_no, p.summary FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ?').bind(student.class_id).all()).results;
    const list = rows.map((r) => {
      let s = {}; try { s = JSON.parse(r.summary ?? '{}') ?? {}; } catch { /* ignore */ }
      return { id: r.id, name: r.name, no: r.class_no, stars: num(s.boardStars), week: Math.round(weekMinutes(s.days)),
        en: Math.round(num(s.en?.bestWpm, 300)), zh: Math.round(num(s.zh?.bestWpm, 300)), title: typeof s.title === 'string' ? s.title : null };
    });
    return json({ enabled: true, me: student.id, students: list });
  }

  // ----- 老師自訂練習：這班的、或全校的 -----
  if (path === '/api/practice' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT p.id, p.title, p.lang, p.kind, p.content, p.created_at, t.name AS teacher FROM custom_practice p JOIN teachers t ON t.id = p.teacher_id
      WHERE (p.class_id IS NULL AND p.school_id = ?) OR p.class_id = ? ORDER BY p.id DESC LIMIT 50`).bind(student.school_id, student.class_id ?? -1).all()).results;
    return json({ practices: rows });
  }

  // ----- 評測 -----
  const needWindow = !!student.settings?.testsNeedWindow;
  const openWindows = async () => {
    if (!student.class_id) return {};
    const rows = (await db.prepare('SELECT test_id, opens_at, closes_at FROM test_windows WHERE class_id = ? AND closes_at > ? ORDER BY opens_at').bind(student.class_id, now).all()).results;
    const out = {};
    for (const r of rows) if (!out[r.test_id] || r.opens_at <= now) out[r.test_id] = { opens: r.opens_at, closes: r.closes_at, open: r.opens_at <= now };
    return out;
  };

  if (path === '/api/test/results') {
    const rows = (await db.prepare('SELECT test_id, wpm, accuracy, seconds, stars, submitted_at, flags FROM test_attempts WHERE student_id = ? AND submitted_at IS NOT NULL').bind(student.id).all()).results;
    const out = {};
    for (const r of rows) out[r.test_id] = { wpm: r.wpm, accuracy: r.accuracy, seconds: r.seconds, stars: r.stars, at: r.submitted_at, flags: JSON.parse(r.flags) };
    return json({ results: out, needWindow, windows: await openWindows() });
  }

  if (path === '/api/test/start' && req.method === 'POST') {
    const b = await body(req);
    const t = tests.tests.find((x) => x.id === b?.testId);
    if (!t) return fail('沒有這個評測', 404);
    if (needWindow) {
      const w = (await openWindows())[t.id];
      if (!w?.open) return fail('老師未開放這個評測，請等老師通知', 403);
    }
    const prev = await db.prepare('SELECT id, submitted_at, restarts FROM test_attempts WHERE student_id = ? AND test_id = ?').bind(student.id, t.id).first();
    if (prev?.submitted_at) return fail('這個評測已經做過，要重做請找老師', 409);
    // 開始了但未交卷（例如中途關了網頁）：可以重新開始兩次，之後要老師重開
    const restarts = prev ? (prev.restarts ?? 0) + 1 : 0;
    if (restarts > 2) return fail('這個評測已經開始過 3 次，請找老師重開', 409);
    const forms = testForms(t);
    const text = forms[Math.floor(Math.random() * forms.length)];
    const id = auth.randomHex(16);
    await db.batch([
      ...(prev ? [db.prepare('DELETE FROM test_attempts WHERE id = ?').bind(prev.id)] : []),
      db.prepare('INSERT INTO test_attempts (id, student_id, test_id, lang, text, time_limit, started_at, restarts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, student.id, t.id, t.lang, text, t.timeLimit, now, restarts),
    ]);
    return json({ attemptId: id, text, timeLimit: t.timeLimit, startedAt: now, restarts });
  }

  if (path === '/api/test/submit' && req.method === 'POST') {
    const b = await body(req);
    const a = b?.attemptId ? await db.prepare('SELECT * FROM test_attempts WHERE id = ? AND student_id = ?').bind(String(b.attemptId), student.id).first() : null;
    if (!a) return fail('找不到這次評測（可能已重新開始過）', 404);
    if (a.submitted_at) return fail('已經交卷', 409);
    const t = tests.tests.find((x) => x.id === a.test_id);
    const serverElapsedSec = (Date.now() - new Date(a.started_at).getTime()) / 1000;
    // 60 分鐘寬限：網絡斷了，瀏覽器會把答卷留着稍後補交
    if (serverElapsedSec > a.time_limit + 60 * 60) return fail('評測已逾時，請找老師重開', 410);
    const keys = (Array.isArray(b.keystrokes) ? b.keystrokes : []).slice(0, 6000)
      .filter((k) => k && typeof k.key === 'string' && k.key.length <= 16 && Number.isFinite(Number(k.t)))
      .map((k) => ({ t: Math.max(0, Math.round(Number(k.t))), key: k.key }));
    const c = b.client && typeof b.client === 'object' ? b.client : {};
    const cnum = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
    const client = { wpm: cnum(c.wpm), accuracy: cnum(c.accuracy), seconds: cnum(c.seconds) };
    const r = verify({ lang: a.lang, text: a.text, timeLimit: a.time_limit, keystrokes: keys, pass: t?.pass ?? {}, serverElapsedSec, client });
    if (serverElapsedSec > a.time_limit + 180) r.flags.push('late');
    if (a.restarts) r.flags.push(`restart-${a.restarts}`);
    const res = await db.prepare(`UPDATE test_attempts SET submitted_at = ?, client_wpm = ?, client_acc = ?, client_seconds = ?, wpm = ?, accuracy = ?, seconds = ?, stars = ?, flags = ?, keystrokes = ?
      WHERE id = ? AND submitted_at IS NULL`)
      .bind(now, client.wpm, client.accuracy, client.seconds, r.wpm, r.accuracy, r.seconds, r.stars, JSON.stringify(r.flags), JSON.stringify(keys), a.id).run();
    if (!res.meta?.changes) return fail('已經交卷', 409);
    return json({ ok: true, result: r });
  }

  return null;
}

/** 寫入請求一定要來自本站網頁（瀏覽器會自動加 Origin 或 Sec-Fetch-Site） */
function sameOrigin(req, url) {
  const origin = req.headers.get('Origin');
  if (origin) return origin === url.origin;
  const site = req.headers.get('Sec-Fetch-Site');
  return site === 'same-origin' || site === 'none';
}

export default {
  // 每日排程（wrangler.jsonc 的 triggers.crons）：清理過期資料；星期日另外備份到 R2
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    await ensureSchema(env.DB, env);
    ctx.waitUntil((async () => {
      try { console.log('清理完成', JSON.stringify(await cleanup(env))); } catch (e) { console.error('清理失敗', e); }
      if (new Date(event.scheduledTime ?? Date.now()).getUTCDay() === 6 || env.BACKUP_DAILY) {
        if (!env.BACKUPS) { console.log('未設定 R2 儲存桶 BACKUPS，略過自動備份'); return; }
        try { console.log('自動備份完成', await autoBackups(env)); } catch (e) { console.error('自動備份失敗', e); }
      }
    })());
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, url)) return fail('不接受跨站請求', 403);
    try {
      if (!env.DB) return fail('伺服器未設定資料庫（wrangler.jsonc 的 d1_databases）', 503);
      await ensureSchema(env.DB, env);
      if (path.startsWith('/api/teacher/') || path.startsWith('/api/owner/')) {
        const teacher = await auth.currentUser(env.DB, req, 'teacher');
        const r = path.startsWith('/api/owner/') ? await ownerRoutes(req, env, path, teacher) : await teacherRoutes(req, env, path, teacher);
        return r ?? fail('沒有這個 API', 404);
      }
      const student = await auth.currentUser(env.DB, req, 'student');
      const r = await studentRoutes(req, env, path, student);
      return r ?? fail('沒有這個 API', 404);
    } catch (err) {
      return serverError(err, req);
    }
  },
};
