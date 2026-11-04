// 平台營運者 API：管理多間學校（新增學校和第一位管理員、停用／啟用、改名、重設管理員密碼、刪除學校）。
// 平台營運者是 teachers.is_owner = 1 的教師（首次設定平台的那一位）。

import * as auth from './auth.js';
import { json, fail, body } from './http.js';
import { createSchoolWithAdmin, cleanSettings } from './teacher.js';
import { deleteSchoolStmts } from './backup.js';

export async function ownerRoutes(req, env, path, teacher) {
  const db = env.DB;
  if (!teacher) return fail('請先以教師身份登入', 401);
  if (!teacher.is_owner) return fail('只有平台營運者可以使用', 403);
  let mm;

  if (path === '/api/owner/schools' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT sc.id, sc.code, sc.name, sc.active, sc.note, sc.created_at, sc.settings,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = sc.id) AS teachers,
        (SELECT COUNT(*) FROM classes c WHERE c.school_id = sc.id) AS classes,
        (SELECT COUNT(*) FROM students s WHERE s.school_id = sc.id) AS students,
        (SELECT MAX(p.updated_at) FROM progress p JOIN students s ON s.id = p.student_id WHERE s.school_id = sc.id) AS last_active,
        (SELECT GROUP_CONCAT(t.username, ' ') FROM teachers t WHERE t.school_id = sc.id AND t.role = 'admin') AS admins
      FROM schools sc ORDER BY sc.id`).all()).results;
    return json({ schools: rows.map((r) => ({ ...r, settings: cleanSettings((() => { try { return JSON.parse(r.settings); } catch { return {}; } })()) })), me: teacher.school_id });
  }

  if (path === '/api/owner/schools' && req.method === 'POST') {
    const r = await createSchoolWithAdmin(db, await body(req));
    if (r.error) return fail(r.error, r.status ?? 400);
    return json({ ok: true, id: r.schoolId });
  }

  if ((mm = path.match(/^\/api\/owner\/schools\/(\d+)$/)) && req.method === 'POST') {
    const s = await db.prepare('SELECT * FROM schools WHERE id = ?').bind(Number(mm[1])).first();
    if (!s) return fail('沒有這間學校', 404);
    const b = await body(req);
    const name = b?.name !== undefined ? String(b.name).trim().slice(0, 60) : s.name;
    if (!name) return fail('請輸入學校名稱');
    const active = b?.active !== undefined ? (b.active ? 1 : 0) : s.active;
    if (!active && s.id === teacher.school_id) return fail('不能停用自己所屬的學校');
    const note = b?.note !== undefined ? String(b.note).slice(0, 500) : s.note;
    await db.batch([
      db.prepare('UPDATE schools SET name = ?, active = ?, note = ? WHERE id = ?').bind(name, active, note, s.id),
      // 停用：即時登出該校所有學生和老師
      ...(!active ? [db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id IN (SELECT id FROM students WHERE school_id = ?)").bind(s.id),
        db.prepare("DELETE FROM sessions WHERE kind = 'teacher' AND user_id IN (SELECT id FROM teachers WHERE school_id = ? AND is_owner = 0)").bind(s.id)] : []),
    ]);
    return json({ ok: true });
  }

  // 學校管理員忘記密碼：由平台營運者重設
  if ((mm = path.match(/^\/api\/owner\/schools\/(\d+)\/reset-admin$/)) && req.method === 'POST') {
    const b = await body(req);
    const t = await db.prepare("SELECT * FROM teachers WHERE school_id = ? AND username = ? AND role = 'admin'").bind(Number(mm[1]), String(b?.username ?? '').trim().toLowerCase()).first();
    if (!t) return fail('這間學校沒有這個管理員帳號');
    const pw = String(b?.password ?? '');
    if (pw.length < 8) return fail('密碼至少 8 個字元');
    const h = await auth.hashPassword(pw);
    await db.batch([db.prepare('UPDATE teachers SET pass_hash = ?, salt = ? WHERE id = ?').bind(h.hash, h.salt, t.id),
      db.prepare("DELETE FROM sessions WHERE kind = 'teacher' AND user_id = ?").bind(t.id),
      db.prepare('DELETE FROM login_fails WHERE key = ? OR key LIKE ?').bind(`t:${t.username}`, `t:${t.username}@%`)]);
    return json({ ok: true });
  }

  // 刪除學校（合約完結）：刪除該校全部老師、班級、學生和紀錄；不可復原，要輸入學校代碼確認
  if ((mm = path.match(/^\/api\/owner\/schools\/(\d+)$/)) && req.method === 'DELETE') {
    const s = await db.prepare('SELECT * FROM schools WHERE id = ?').bind(Number(mm[1])).first();
    if (!s) return fail('沒有這間學校', 404);
    if (s.id === teacher.school_id) return fail('不能刪除自己所屬的學校');
    const b = await body(req);
    if (String(b?.confirm ?? '') !== s.code) return fail(`請輸入學校代碼「${s.code}」確認刪除`);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').bind(s.id).first()).n;
    await db.batch([...deleteSchoolStmts(db, s.id), db.prepare('DELETE FROM meta WHERE key LIKE ?').bind(`%:${s.id}`), db.prepare('DELETE FROM schools WHERE id = ?').bind(s.id)]);
    return json({ ok: true, deletedStudents: n });
  }

  return null;
}
