// 教師後台 API：首位教師設定、登入、班級、匯入學生、重設密碼、班級進度、匯出。

import * as auth from './auth.js';
import { json, fail, body } from './http.js';
import { quickOf } from './score.js';

const SID_RE = /^[a-z0-9_-]{3,20}$/;

const PW_OK = (pw) => pw.length >= 4 && pw.length <= 64;
const PW_MSG = '學生密碼要 4–64 個字元';

/** 設定學生密碼（記下 initial_pw 讓紙條印得出），並登出該學生所有裝置 */
function passwordStmts(db, id, pw, h) {
  return [db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = ?, fail_count = 0, locked_until = NULL WHERE id = ?').bind(h.hash, h.salt, pw, id),
          db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?").bind(id)];
}
async function setPassword(db, id, pw, h) {
  h ??= await auth.hashPassword(pw);
  await db.batch(passwordStmts(db, id, pw, h));
}

/** 整理老師貼上的練習內容：中文只留碼表有的字和中文標點；英文只留可打的 ASCII。 */
const ZH_PUNCT = '，。；：？！「」、';
// 備份的資料表和欄位（還原時只接受這些欄位）
const BACKUP_COLS = {
  teachers: ['id', 'username', 'name', 'pass_hash', 'salt', 'created_at'],
  classes: ['id', 'name', 'year', 'teacher_id', 'created_at'],
  students: ['id', 'sid', 'name', 'class_id', 'class_no', 'pass_hash', 'salt', 'initial_pw', 'fail_count', 'locked_until', 'created_at'],
  progress: ['student_id', 'data', 'summary', 'updated_at'],
  test_attempts: ['id', 'student_id', 'test_id', 'lang', 'text', 'time_limit', 'started_at', 'submitted_at', 'client_wpm', 'client_acc', 'client_seconds',
    'wpm', 'accuracy', 'seconds', 'stars', 'flags', 'keystrokes'],
  custom_practice: ['id', 'teacher_id', 'class_id', 'title', 'lang', 'kind', 'content', 'created_at'],
};
function cleanPractice(lang, kind, raw) {
  const removed = new Set();
  let content;
  if (lang === 'zh') {
    const keep = (c) => ZH_PUNCT.includes(c) || quickOf(c);
    const src = raw.replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/:/g, '：').replace(/;/g, '；').replace(/\s+/g, kind === 'text' ? '' : '');
    content = [...src].filter((c) => { if (keep(c)) return true; removed.add(c); return false; }).join('');
    if (kind !== 'text') content = [...new Set([...content].filter((c) => !ZH_PUNCT.includes(c)))].join('');
  } else {
    content = raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-');
    content = [...content].filter((c) => { if (/[ -~\n]/.test(c)) return true; removed.add(c); return false; }).join('');
    content = kind === 'words' ? [...new Set(content.split(/[\s,]+/).filter(Boolean))].join(' ') : content.replace(/\s+/g, ' ').trim();
  }
  if (content.length < (lang === 'zh' ? 2 : 3)) return { error: '內容太短（中文至少 2 個字、英文至少 3 個字母）' };
  if (content.length > 3000) return { error: '內容太長（最多 3000 字）' };
  return { content, removed: [...removed].filter((c) => !/\s/.test(c)).join(''), length: [...content].length };
}

export async function teacherRoutes(req, env, path, teacher) {
  const db = env.DB;
  const m = (re) => path.match(re);

  if (path === '/api/teacher/status') {
    const c = await db.prepare('SELECT COUNT(*) AS n FROM teachers').first();
    return json({ setupNeeded: (c?.n ?? 0) === 0, user: teacher ? { username: teacher.username, name: teacher.name } : null });
  }

  if (path === '/api/teacher/setup' && req.method === 'POST') {
    const c = await db.prepare('SELECT COUNT(*) AS n FROM teachers').first();
    if ((c?.n ?? 0) > 0) return fail('已經有教師帳號，請登入後在後台新增教師', 409);
    return createTeacher(db, await body(req), true);
  }

  if (path === '/api/teacher/login' && req.method === 'POST') {
    const b = await body(req);
    const username = String(b?.username ?? '').trim().toLowerCase();
    const ipKey = `ip:${auth.clientIp(req)}`, tKey = `t:${username}`;
    if (await auth.lockedUntil(db, ipKey)) return fail('這個網絡的登入錯誤太多，請 10 分鐘後再試', 429);
    if (await auth.lockedUntil(db, tKey)) return fail('這個教師帳號輸錯太多次，請 15 分鐘後再試', 429);
    const t = await db.prepare('SELECT * FROM teachers WHERE username = ?').bind(username).first();
    if (!t || !(await auth.verifyPassword(String(b?.password ?? ''), t.salt, t.pass_hash))) {
      await auth.recordFail(db, ipKey, auth.LIMITS.ip);
      await auth.recordFail(db, tKey, auth.LIMITS.teacher);
      return fail('帳號或密碼不對', 401);
    }
    await auth.clearFails(db, tKey);
    const { header } = await auth.createSession(db, 'teacher', t.id);
    return json({ ok: true, user: { username: t.username, name: t.name } }, 200, { 'set-cookie': header });
  }

  if (path === '/api/teacher/logout' && req.method === 'POST') {
    await auth.destroySession(db, req, 'teacher');
    return json({ ok: true }, 200, { 'set-cookie': auth.clearCookie('teacher') });
  }

  if (!teacher) return fail('請先以教師身份登入', 401);

  if (path === '/api/teacher/add' && req.method === 'POST') return createTeacher(db, await body(req), false);

  if (path === '/api/teacher/password' && req.method === 'POST') {
    const b = await body(req);
    if (!(await auth.verifyPassword(String(b?.old ?? ''), teacher.salt, teacher.pass_hash))) return fail('舊密碼不對', 401);
    const pw = String(b?.password ?? '');
    if (pw.length < 8) return fail('新密碼至少 8 個字元');
    const h = await auth.hashPassword(pw);
    await db.prepare('UPDATE teachers SET pass_hash = ?, salt = ? WHERE id = ?').bind(h.hash, h.salt, teacher.id).run();
    return json({ ok: true });
  }

  // ----- 班級 -----
  if (path === '/api/teacher/classes' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT c.id, c.name, c.year, c.teacher_id, t.name AS teacher, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS students
      FROM classes c JOIN teachers t ON t.id = c.teacher_id ORDER BY c.year DESC, c.name`).all()).results;
    return json({ classes: rows });
  }

  if (path === '/api/teacher/classes' && req.method === 'POST') {
    const b = await body(req);
    const name = String(b?.name ?? '').trim().toUpperCase();
    const year = String(b?.year ?? '').trim();
    if (!/^[1-6][A-Z]$/.test(name)) return fail('班別格式：1A、2B…');
    if (!/^\d{4}-\d{2}$/.test(year)) return fail('學年格式：2027-28');
    try {
      const r = await db.prepare('INSERT INTO classes (name, year, teacher_id) VALUES (?, ?, ?)').bind(name, year, teacher.id).run();
      return json({ ok: true, id: r.meta.last_row_id });
    } catch { return fail('這個學年已有這個班', 409); }
  }

  let mm;
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)$/)) && req.method === 'DELETE') {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE class_id = ?').bind(mm[1]).first();
    if (n.n > 0) return fail('班裏還有學生，先把學生刪除或移班');
    await db.prepare('DELETE FROM classes WHERE id = ?').bind(mm[1]).run();
    return json({ ok: true });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/students$/))) {
    const rows = (await db.prepare(`SELECT s.id, s.sid, s.name, s.class_no, s.initial_pw IS NOT NULL AS pw_initial, s.created_at,
        p.summary, p.updated_at AS progress_at
      FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ? ORDER BY s.class_no, s.sid`).bind(mm[1]).all()).results;
    const ids = rows.map((r) => r.id);
    const tests = ids.length ? (await db.prepare(`SELECT student_id, test_id, wpm, accuracy, stars, flags, submitted_at FROM test_attempts WHERE submitted_at IS NOT NULL AND student_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : [];
    const byStudent = {};
    for (const t of tests) (byStudent[t.student_id] ??= {})[t.test_id] = { wpm: t.wpm, accuracy: t.accuracy, stars: t.stars, flags: JSON.parse(t.flags), at: t.submitted_at };
    return json({ students: rows.map((r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null, tests: byStudent[r.id] ?? {} })) });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/export\.csv$/))) {
    const cls = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(mm[1]).first();
    if (!cls) return fail('沒有這個班', 404);
    const rows = (await db.prepare(`SELECT s.sid, s.name, s.class_no, p.summary FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ? ORDER BY s.class_no, s.sid`).bind(cls.id).all()).results;
    const ids = (await db.prepare('SELECT id, sid FROM students WHERE class_id = ?').bind(cls.id).all()).results;
    const idOf = Object.fromEntries(ids.map((r) => [r.sid, r.id]));
    const tests = ids.length ? (await db.prepare(`SELECT student_id, test_id, wpm, accuracy, stars, flags FROM test_attempts WHERE submitted_at IS NOT NULL AND student_id IN (${ids.map(() => '?').join(',')})`).bind(...ids.map((r) => r.id)).all()).results : [];
    const tmap = {};
    for (const t of tests) (tmap[t.student_id] ??= {})[t.test_id] = t;
    const testIds = ['en-placement', 'en-s1', 'en-s2', 'en-s3', 'zh-placement', 'zh-s1', 'zh-s2', 'zh-s3'];
    const head = ['班號', '學號', '姓名', '英文完成課數', '英文星星', '英文最佳WPM', '中文完成課數', '中文星星', '中文最佳字/分', '練習分鐘', ...testIds.flatMap((t) => [`${t} 速度`, `${t} 準確率`, `${t} 星`, `${t} 標記`])];
    const lines = [head.join(',')];
    for (const r of rows) {
      const s = r.summary ? JSON.parse(r.summary) : null;
      const tm = tmap[idOf[r.sid]] ?? {};
      const cells = [r.class_no ?? '', r.sid, r.name, s?.en.lessons ?? 0, s?.en.stars ?? 0, Math.round(s?.en.bestWpm ?? 0), s?.zh.lessons ?? 0, s?.zh.stars ?? 0, Math.round(s?.zh.bestWpm ?? 0), s?.minutes ?? 0];
      for (const t of testIds) { const x = tm[t]; cells.push(x ? Math.round(x.wpm * 10) / 10 : '', x ? Math.round(x.accuracy * 10) / 10 : '', x ? x.stars : '', x ? JSON.parse(x.flags).join(' ') : ''); }
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    return new Response('﻿' + lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${cls.year}-${cls.name}.csv"` } });
  }

  // ----- 備份與還原 -----
  // 備份檔包括全部資料（連密碼雜湊），不包括登入中的 session 和登入失敗紀錄
  if (path === '/api/teacher/backup' && req.method === 'GET') {
    const tables = {};
    for (const t of Object.keys(BACKUP_COLS)) tables[t] = (await db.prepare(`SELECT ${BACKUP_COLS[t].join(', ')} FROM ${t}`).all()).results;
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO meta (key, value) VALUES ('last_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now).run();
    const name = `typing-backup-${now.slice(0, 10)}.json`;
    return new Response(JSON.stringify({ app: 'typing-platform', version: 1, exportedAt: now, by: teacher.username, tables }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
  }
  if (path === '/api/teacher/backup/status') {
    const r = await db.prepare("SELECT value FROM meta WHERE key = 'last_backup'").first();
    const counts = {};
    for (const t of ['students', 'classes', 'test_attempts']) counts[t] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
    return json({ lastBackup: r?.value ?? null, counts });
  }
  if (path === '/api/teacher/restore' && req.method === 'POST') {
    const b = await body(req);
    if (b?.confirm !== '還原') return fail('請輸入「還原」確認');
    const d = b?.backup;
    if (d?.app !== 'typing-platform' || d?.version !== 1 || !d.tables) return fail('這不是打字平台的備份檔');
    if (!(d.tables.teachers ?? []).length) return fail('備份檔沒有教師帳號，不能還原');
    const stmts = [];
    // 先刪後加，按外鍵次序；D1 的 batch 是一個交易，中途出錯會全部還原
    for (const t of ['sessions', 'login_fails', 'test_attempts', 'progress', 'custom_practice', 'students', 'classes', 'teachers']) stmts.push(db.prepare(`DELETE FROM ${t}`));
    for (const t of ['teachers', 'classes', 'students', 'progress', 'test_attempts', 'custom_practice']) {
      const cols = BACKUP_COLS[t];
      const rows = d.tables[t] ?? [];
      // 一句插入多行（每句最多 100 個參數；進度和按鍵紀錄較大，一句最多 20 行）
      const per = Math.max(1, Math.min(Math.floor(100 / cols.length), t === 'progress' || t === 'test_attempts' ? 4 : 20));
      for (let i = 0; i < rows.length; i += per) {
        const part = rows.slice(i, i + per);
        const one = `(${cols.map(() => '?').join(', ')})`;
        stmts.push(db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES ${part.map(() => one).join(', ')}`).bind(...part.flatMap((row) => cols.map((c) => row[c] ?? null))));
      }
    }
    try { await db.batch(stmts); } catch (e) { return fail(`還原失敗，資料沒有改動：${e.message}`, 400); }
    return json({ ok: true, counts: Object.fromEntries(Object.entries(d.tables).map(([k, v]) => [k, v.length])) }, 200, { 'set-cookie': auth.clearCookie('teacher') });
  }

  // ----- 自訂練習 -----
  if (path === '/api/teacher/practice' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT p.*, c.name AS class_name, c.year AS class_year, t.name AS teacher FROM custom_practice p
      LEFT JOIN classes c ON c.id = p.class_id JOIN teachers t ON t.id = p.teacher_id ORDER BY p.id DESC`).all()).results;
    return json({ practices: rows });
  }
  if (path === '/api/teacher/practice' && req.method === 'POST') {
    const b = await body(req);
    const title = String(b?.title ?? '').trim().slice(0, 40);
    const lang = b?.lang === 'en' ? 'en' : 'zh';
    const kinds = lang === 'zh' ? ['text', 'chars', 'split'] : ['text', 'words'];
    const kind = kinds.includes(b?.kind) ? b.kind : kinds[0];
    const r = cleanPractice(lang, kind, String(b?.content ?? ''));
    if (!title) return fail('請輸入標題');
    if (r.error) return fail(r.error);
    const classId = b?.classId ? Number(b.classId) : null;
    if (classId && !(await db.prepare('SELECT id FROM classes WHERE id = ?').bind(classId).first())) return fail('找不到這個班別');
    const res = await db.prepare('INSERT INTO custom_practice (teacher_id, class_id, title, lang, kind, content) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(teacher.id, classId, title, lang, kind, r.content).run();
    return json({ ok: true, id: res.meta?.last_row_id, removed: r.removed, length: r.length });
  }
  if ((mm = m(/^\/api\/teacher\/practice\/(\d+)$/)) && req.method === 'DELETE') {
    await db.prepare('DELETE FROM custom_practice WHERE id = ?').bind(mm[1]).run();
    return json({ ok: true });
  }

  // ----- 學生 -----
  if (path === '/api/teacher/import' && req.method === 'POST') {
    const b = await body(req);
    const classId = Number(b?.classId);
    const cls = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(classId).first();
    if (!cls) return fail('請先選班別');
    const rows = Array.isArray(b?.rows) ? b.rows.slice(0, 200) : [];
    // 老師可指定全部學生用同一個密碼；留空就每人隨機
    const common = b?.password ? String(b.password) : '';
    if (common && !PW_OK(common)) return fail(PW_MSG);
    const commonHash = common ? await auth.hashPassword(common) : null;
    // 查詢次數要少（Cloudflare 免費計劃每個請求最多 50 次資料庫查詢）：先一次過查已有學號，再用一個 batch 寫入
    const clean = rows.map((r) => ({
      sid: String(r.sid ?? '').trim().toLowerCase(), name: String(r.name ?? '').trim().slice(0, 40),
      no: Number.isFinite(Number(r.no)) && r.no !== '' && r.no !== null ? Number(r.no) : null }));
    const sids = [...new Set(clean.filter((r) => SID_RE.test(r.sid)).map((r) => r.sid))];
    const existing = new Map();
    for (let i = 0; i < sids.length; i += 90) {
      const part = sids.slice(i, i + 90);
      for (const x of (await db.prepare(`SELECT id, sid FROM students WHERE sid IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) existing.set(x.sid, x.id);
    }
    const out = [], stmts = [], seen = new Set();
    for (const { sid, name, no } of clean) {
      if (!SID_RE.test(sid) || !name) { out.push({ sid, name, status: '格式不對（學號只可用英文字母、數字、- _，3–20 個字元；姓名不可空）' }); continue; }
      if (seen.has(sid)) { out.push({ sid, name, status: '同一批重複，略過' }); continue; }
      seen.add(sid);
      const id = existing.get(sid);
      if (id) {
        stmts.push(db.prepare('UPDATE students SET name = ?, class_id = ?, class_no = ? WHERE id = ?').bind(name, classId, no, id));
        if (common && b?.applyToExisting) {
          stmts.push(...passwordStmts(db, id, common, commonHash));
          out.push({ sid, name, no, password: common, status: '已存在，更新了班別、姓名和密碼' });
        } else out.push({ sid, name, no, status: '已存在，更新了班別和姓名（密碼不變）' });
        continue;
      }
      const pw = common || auth.randomPassword();
      const h = commonHash ?? await auth.hashPassword(pw);
      stmts.push(db.prepare('INSERT INTO students (sid, name, class_id, class_no, pass_hash, salt, initial_pw) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sid, name, classId, no, h.hash, h.salt, pw));
      out.push({ sid, name, no, password: pw, status: '新增' });
    }
    if (stmts.length) await db.batch(stmts);
    return json({ rows: out });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/slips$/))) {
    const cls = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(mm[1]).first();
    const rows = (await db.prepare('SELECT sid, name, class_no, initial_pw FROM students WHERE class_id = ? ORDER BY class_no, sid').bind(mm[1]).all()).results;
    return json({ cls, students: rows });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/reset$/)) && req.method === 'POST') {
    const b = await body(req);
    const pw = b?.password ? String(b.password) : auth.randomPassword();
    if (!PW_OK(pw)) return fail(PW_MSG);
    await setPassword(db, Number(mm[1]), pw);
    return json({ ok: true, password: pw });
  }

  // 全班改用同一個密碼
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/password$/)) && req.method === 'POST') {
    const b = await body(req);
    const pw = String(b?.password ?? '');
    if (!PW_OK(pw)) return fail(PW_MSG);
    const h = await auth.hashPassword(pw);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM students WHERE class_id = ?').bind(mm[1]).first()).n;
    await db.batch([
      db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = ?, fail_count = 0, locked_until = NULL WHERE class_id = ?').bind(h.hash, h.salt, pw, mm[1]),
      db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id IN (SELECT id FROM students WHERE class_id = ?)").bind(mm[1])]);
    return json({ ok: true, count: n });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/retake$/)) && req.method === 'POST') {
    const b = await body(req);
    await db.prepare('DELETE FROM test_attempts WHERE student_id = ? AND test_id = ?').bind(mm[1], String(b?.testId ?? '')).run();
    return json({ ok: true });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/tests$/))) {
    const rows = (await db.prepare('SELECT test_id, started_at, submitted_at, client_wpm, client_acc, wpm, accuracy, seconds, stars, flags FROM test_attempts WHERE student_id = ? ORDER BY started_at').bind(mm[1]).all()).results;
    return json({ attempts: rows.map((r) => ({ ...r, flags: JSON.parse(r.flags) })) });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)$/)) && req.method === 'DELETE') {
    const id = mm[1];
    await db.batch([
      db.prepare('DELETE FROM test_attempts WHERE student_id = ?').bind(id),
      db.prepare('DELETE FROM progress WHERE student_id = ?').bind(id),
      db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?").bind(id),
      db.prepare('DELETE FROM students WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  return null;
}

async function createTeacher(db, b, first) {
  const username = String(b?.username ?? '').trim().toLowerCase();
  const password = String(b?.password ?? '');
  const name = String(b?.name ?? '').trim().slice(0, 40);
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return fail('帳號只可用英文字母、數字、. _ -，3–30 個字元');
  if (password.length < 8) return fail('密碼至少 8 個字元');
  if (!name) return fail('請輸入姓名');
  const h = await auth.hashPassword(password);
  try {
    const r = await db.prepare('INSERT INTO teachers (username, name, pass_hash, salt) VALUES (?, ?, ?, ?)').bind(username, name, h.hash, h.salt).run();
    if (first) {
      const { header } = await auth.createSession(db, 'teacher', r.meta.last_row_id);
      return json({ ok: true, user: { username, name } }, 200, { 'set-cookie': header });
    }
    return json({ ok: true });
  } catch { return fail('這個帳號已存在', 409); }
}
