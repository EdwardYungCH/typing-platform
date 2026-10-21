// Cloudflare Worker：/api/* 的伺服器程式（登入、進度同步、評測計分、教師後台）。
// 靜態網頁由 wrangler.jsonc 的 assets 發佈；本機測試用 tools/dev-server.mjs。

import tests from '../data/tests.json' with { type: 'json' };
import * as auth from './auth.js';
import { verify } from './score.js';
import { teacherRoutes, autoBackup } from './teacher.js';
import { json, fail, body } from './http.js';
import schema1 from '../migrations/0001_init.sql';
import schema2 from '../migrations/0002_limits.sql';
import schema3 from '../migrations/0003_custom.sql';
import schema4 from '../migrations/0004_meta.sql';
import schema5 from '../migrations/0005_teacher2.sql';
const schema = [schema1, schema2, schema3, schema4, schema5].join('\n');

// 資料表：第一次有請求時建立（全部 CREATE IF NOT EXISTS，重複執行沒有影響）
let ready = null;
function ensureSchema(db) {
  // D1 的 exec 要求一句一行，所以把每個 CREATE 句子分開用 prepare 執行
  const stmts = schema.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
  ready ??= db.batch(stmts.map((x) => db.prepare(x))).then(() => addColumns(db)).catch((e) => { ready = null; throw e; });
  return ready;
}

// 後加的欄位（SQLite 沒有 ADD COLUMN IF NOT EXISTS）
const NEW_COLUMNS = [['teachers', 'role', "TEXT NOT NULL DEFAULT 'teacher'"]];
async function addColumns(db) {
  for (const [table, col, def] of NEW_COLUMNS) {
    const cols = (await db.prepare(`PRAGMA table_info(${table})`).all()).results.map((c) => c.name);
    if (!cols.includes(col)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
  }
  // 第一個教師是管理員（舊資料補上）
  await db.prepare("UPDATE teachers SET role = 'admin' WHERE id = (SELECT MIN(id) FROM teachers) AND NOT EXISTS (SELECT 1 FROM teachers WHERE role = 'admin')").run();
}

const MAX_PROGRESS_BYTES = 400 * 1024;


/** 由整份進度紀錄抽出老師後台要看的摘要 */
export function summarize(data) {
  const out = { en: { lessons: 0, stars: 0, bestWpm: 0 }, zh: { lessons: 0, stars: 0, bestWpm: 0 }, minutes: 0, streak: { en: 0, zh: 0 }, lastActive: null };
  const lessons = data?.store?.lessons ?? {};
  out.done = [];
  for (const [id, v] of Object.entries(lessons)) {
    const lang = id.split(':')[0];
    if (!out[lang] || !v?.done) continue;
    out.done.push(id);
    out[lang].lessons += 1;
    out[lang].stars += v.stars ?? 0;
    out[lang].bestWpm = Math.max(out[lang].bestWpm, v.bestWpm ?? 0);
  }
  const attempts = data?.store?.attempts ?? [];
  out.minutes = Math.round(attempts.reduce((s, a) => s + (a.seconds ?? 0), 0) / 60);
  if (attempts.length) out.lastActive = attempts[attempts.length - 1].at ?? null;
  for (const l of ['en', 'zh']) out.streak[l] = data?.daily?.[l]?.streak ?? 0;
  return out;
}

// ---------- 學生 ----------

async function studentRoutes(req, env, path, student) {
  const db = env.DB;
  const now = new Date().toISOString();

  if (path === '/api/login' && req.method === 'POST') {
    const b = await body(req);
    const sid = String(b?.sid ?? '').trim().toLowerCase();
    const pw = String(b?.password ?? '');
    if (!sid || !pw) return fail('請輸入學號和密碼');
    const ipKey = `ip:${auth.clientIp(req)}`;
    if (await auth.lockedUntil(db, ipKey)) return fail('這個網絡的登入錯誤太多，請 10 分鐘後再試', 429);
    const s = await db.prepare('SELECT * FROM students WHERE sid = ?').bind(sid).first();
    if (s?.locked_until && s.locked_until > now) return fail('輸錯太多次，請 10 分鐘後再試', 429);
    if (!s || !(await auth.verifyPassword(pw, s.salt, s.pass_hash))) {
      await auth.recordFail(db, ipKey, auth.LIMITS.ip);
      if (s) {
        const n = (s.fail_count ?? 0) + 1;
        const lock = n >= 8 ? new Date(Date.now() + 10 * 60000).toISOString() : null;
        await db.prepare('UPDATE students SET fail_count = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : n, lock, s.id).run();
      }
      return fail('學號或密碼不對', 401);
    }
    await db.prepare('UPDATE students SET fail_count = 0, locked_until = NULL WHERE id = ?').bind(s.id).run();
    await auth.sweepSessions(db);
    const { header } = await auth.createSession(db, 'student', s.id);
    const cls = s.class_id ? await db.prepare('SELECT name FROM classes WHERE id = ?').bind(s.class_id).first() : null;
    return json({ ok: true, user: { sid: s.sid, name: s.name, className: cls?.name ?? null, classNo: s.class_no, mustChange: !!s.initial_pw } }, 200, { 'set-cookie': header });
  }

  if (path === '/api/logout' && req.method === 'POST') {
    await auth.destroySession(db, req, 'student');
    return json({ ok: true }, 200, { 'set-cookie': auth.clearCookie('student') });
  }

  if (path === '/api/me') {
    if (!student) return json({ user: null });
    const cls = student.class_id ? await db.prepare('SELECT name FROM classes WHERE id = ?').bind(student.class_id).first() : null;
    return json({ user: { sid: student.sid, name: student.name, className: cls?.name ?? null, classNo: student.class_no, mustChange: !!student.initial_pw } });
  }

  if (path === '/api/password' && req.method === 'POST') {
    if (!student) return fail('請先登入', 401);
    const b = await body(req);
    const oldPw = String(b?.old ?? ''), newPw = String(b?.password ?? '');
    if (!(await auth.verifyPassword(oldPw, student.salt, student.pass_hash))) return fail('舊密碼不對', 401);
    if (newPw.length < 6 || newPw.length > 64) return fail('新密碼至少 6 個字元');
    const h = await auth.hashPassword(newPw);
    await db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = NULL WHERE id = ?').bind(h.hash, h.salt, student.id).run();
    return json({ ok: true });
  }

  if (path.startsWith('/api/progress') && !student) return fail('請先登入', 401);

  if (path === '/api/progress' && req.method === 'GET') {
    const p = await db.prepare('SELECT data, updated_at FROM progress WHERE student_id = ?').bind(student.id).first();
    return json({ data: p ? JSON.parse(p.data) : null, updatedAt: p?.updated_at ?? null });
  }

  if (path === '/api/progress' && req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_PROGRESS_BYTES) return fail('紀錄太大', 413);
    let data;
    try { data = JSON.parse(text); } catch { return fail('格式不對'); }
    if (!data || typeof data !== 'object') return fail('格式不對');
    const summary = JSON.stringify(summarize(data));
    await db.prepare(`INSERT INTO progress (student_id, data, summary, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET data = excluded.data, summary = excluded.summary, updated_at = excluded.updated_at`)
      .bind(student.id, JSON.stringify(data), summary, now).run();
    return json({ ok: true, updatedAt: now });
  }

  // ----- 問題回報（未登入也可以）-----
  if (path === '/api/feedback' && req.method === 'POST') {
    const b = await body(req);
    const msg = String(b?.message ?? '').trim().slice(0, 1000);
    if (msg.length < 3) return fail('請寫幾個字說明問題');
    await db.prepare('INSERT INTO feedback (student_id, page, message, ua) VALUES (?, ?, ?, ?)')
      .bind(student?.id ?? null, String(b?.page ?? '').slice(0, 200), msg, (req.headers.get('User-Agent') ?? '').slice(0, 200)).run();
    return json({ ok: true });
  }

  if (!student) return fail('請先登入', 401);

  // ----- 老師功課 -----
  if (path === '/api/assignments' && req.method === 'GET') {
    const rows = student.class_id ? (await db.prepare(`SELECT a.id, a.lang, a.lesson_id, a.due, a.note, a.created_at, t.name AS teacher FROM assignments a JOIN teachers t ON t.id = a.teacher_id
      WHERE a.class_id = ? ORDER BY COALESCE(a.due, '9999'), a.id`).bind(student.class_id).all()).results : [];
    return json({ assignments: rows });
  }

  // ----- 老師自訂練習 -----
  if (path === '/api/practice' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT p.id, p.title, p.lang, p.kind, p.content, p.created_at, t.name AS teacher FROM custom_practice p JOIN teachers t ON t.id = p.teacher_id
      WHERE p.class_id IS NULL OR p.class_id = ? ORDER BY p.id DESC LIMIT 50`).bind(student.class_id ?? -1).all()).results;
    return json({ practices: rows });
  }

  // ----- 評測 -----
  if (path === '/api/test/results') {
    const rows = (await db.prepare('SELECT test_id, wpm, accuracy, seconds, stars, submitted_at, flags FROM test_attempts WHERE student_id = ? AND submitted_at IS NOT NULL').bind(student.id).all()).results;
    const out = {};
    for (const r of rows) out[r.test_id] = { wpm: r.wpm, accuracy: r.accuracy, seconds: r.seconds, stars: r.stars, at: r.submitted_at, flags: JSON.parse(r.flags) };
    return json({ results: out });
  }

  if (path === '/api/test/start' && req.method === 'POST') {
    const b = await body(req);
    const t = tests.tests.find((x) => x.id === b?.testId);
    if (!t) return fail('沒有這個評測', 404);
    const prev = await db.prepare('SELECT id, submitted_at FROM test_attempts WHERE student_id = ? AND test_id = ?').bind(student.id, t.id).first();
    if (prev?.submitted_at) return fail('這個評測已經做過，要重做請找老師', 409);
    if (prev) await db.prepare('DELETE FROM test_attempts WHERE id = ?').bind(prev.id).run();
    const id = auth.randomHex(16);
    await db.prepare('INSERT INTO test_attempts (id, student_id, test_id, lang, text, time_limit, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, student.id, t.id, t.lang, t.text, t.timeLimit, now).run();
    return json({ attemptId: id, text: t.text, timeLimit: t.timeLimit, startedAt: now });
  }

  if (path === '/api/test/submit' && req.method === 'POST') {
    const b = await body(req);
    const a = b?.attemptId ? await db.prepare('SELECT * FROM test_attempts WHERE id = ? AND student_id = ?').bind(String(b.attemptId), student.id).first() : null;
    if (!a) return fail('找不到這次評測', 404);
    if (a.submitted_at) return fail('已經交卷', 409);
    const t = tests.tests.find((x) => x.id === a.test_id);
    const serverElapsedSec = (Date.now() - new Date(a.started_at).getTime()) / 1000;
    if (serverElapsedSec > a.time_limit + 60 * 60) return fail('評測已逾時，請找老師重開', 410);   // 60 分鐘寬限：網絡斷了可以稍後補交
    const r = verify({ lang: a.lang, text: a.text, timeLimit: a.time_limit, keystrokes: b.keystrokes, pass: t?.pass ?? {}, serverElapsedSec, client: b.client ?? null });
    const keys = JSON.stringify((Array.isArray(b.keystrokes) ? b.keystrokes : []).slice(0, 6000).map((k) => ({ t: k.t, key: k.key })));
    await db.prepare(`UPDATE test_attempts SET submitted_at = ?, client_wpm = ?, client_acc = ?, client_seconds = ?, wpm = ?, accuracy = ?, seconds = ?, stars = ?, flags = ?, keystrokes = ? WHERE id = ?`)
      .bind(now, b.client?.wpm ?? null, b.client?.accuracy ?? null, b.client?.seconds ?? null, r.wpm, r.accuracy, r.seconds, r.stars, JSON.stringify(r.flags), keys, a.id).run();
    return json({ ok: true, result: r });
  }

  return null;
}

export default {
  // 每週自動備份到 R2（wrangler.jsonc 的 triggers.crons）；未設定 BACKUPS 儲存桶時只記錄一句
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    if (!env.BACKUPS) { console.log('未設定 R2 儲存桶 BACKUPS，略過自動備份'); return; }
    await ensureSchema(env.DB);
    ctx.waitUntil(autoBackup(env).then((k) => console.log('自動備份完成', k)).catch((e) => console.error('自動備份失敗', e)));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    // 同源檢查：只接受本站網頁送來的寫入請求
    if (req.method !== 'GET') {
      const origin = req.headers.get('Origin');
      if (origin && origin !== url.origin) return fail('不接受跨站請求', 403);
    }
    try {
      if (!env.DB) return fail('伺服器未設定資料庫（wrangler.jsonc 的 d1_databases）', 503);
      await ensureSchema(env.DB);
      if (path.startsWith('/api/teacher/')) {
        const teacher = await auth.currentUser(env.DB, req, 'teacher');
        const r = await teacherRoutes(req, env, path, teacher);
        return r ?? fail('沒有這個 API', 404);
      }
      const student = await auth.currentUser(env.DB, req, 'student');
      const r = await studentRoutes(req, env, path, student);
      return r ?? fail('沒有這個 API', 404);
    } catch (err) {
      console.error(err);
      return fail(`伺服器錯誤：${err.message}`, 500);
    }
  },
};
