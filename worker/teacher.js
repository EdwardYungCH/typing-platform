// 教師後台 API：首位教師設定、登入、班級、匯入學生、重設密碼、班級進度、匯出。

import * as auth from './auth.js';
import { json, fail, body } from './http.js';

const SID_RE = /^[a-z0-9_-]{3,20}$/;

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
    const t = await db.prepare('SELECT * FROM teachers WHERE username = ?').bind(String(b?.username ?? '').trim().toLowerCase()).first();
    if (!t || !(await auth.verifyPassword(String(b?.password ?? ''), t.salt, t.pass_hash))) return fail('帳號或密碼不對', 401);
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

  // ----- 學生 -----
  if (path === '/api/teacher/import' && req.method === 'POST') {
    const b = await body(req);
    const classId = Number(b?.classId);
    const cls = await db.prepare('SELECT id FROM classes WHERE id = ?').bind(classId).first();
    if (!cls) return fail('請先選班別');
    const rows = Array.isArray(b?.rows) ? b.rows.slice(0, 200) : [];
    const out = [];
    for (const r of rows) {
      const sid = String(r.sid ?? '').trim().toLowerCase();
      const name = String(r.name ?? '').trim().slice(0, 40);
      const no = Number.isFinite(Number(r.no)) && r.no !== '' && r.no !== null ? Number(r.no) : null;
      if (!SID_RE.test(sid) || !name) { out.push({ sid, name, status: '格式不對（學號只可用英文字母、數字、- _，3–20 個字元；姓名不可空）' }); continue; }
      const exist = await db.prepare('SELECT id FROM students WHERE sid = ?').bind(sid).first();
      if (exist) {
        await db.prepare('UPDATE students SET name = ?, class_id = ?, class_no = ? WHERE id = ?').bind(name, classId, no, exist.id).run();
        out.push({ sid, name, no, status: '已存在，更新了班別和姓名（密碼不變）' });
        continue;
      }
      const pw = auth.randomPassword();
      const h = await auth.hashPassword(pw);
      await db.prepare('INSERT INTO students (sid, name, class_id, class_no, pass_hash, salt, initial_pw) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(sid, name, classId, no, h.hash, h.salt, pw).run();
      out.push({ sid, name, no, password: pw, status: '新增' });
    }
    return json({ rows: out });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/slips$/))) {
    const cls = await db.prepare('SELECT * FROM classes WHERE id = ?').bind(mm[1]).first();
    const rows = (await db.prepare('SELECT sid, name, class_no, initial_pw FROM students WHERE class_id = ? ORDER BY class_no, sid').bind(mm[1]).all()).results;
    return json({ cls, students: rows });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/reset$/)) && req.method === 'POST') {
    const pw = auth.randomPassword();
    const h = await auth.hashPassword(pw);
    await db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = ?, fail_count = 0, locked_until = NULL WHERE id = ?').bind(h.hash, h.salt, pw, mm[1]).run();
    await db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?").bind(mm[1]).run();
    return json({ ok: true, password: pw });
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
