// 教師後台 API：首次設定、登入、老師管理、學校設定、班級、匯入學生、重設密碼、班級進度、功課、評測時段、匯出、備份還原。
// 每位老師屬於一間學校（teachers.school_id）；所有查詢都限定在老師自己的學校之內。

import * as auth from './auth.js';
import { json, fail, body, csvCell } from './http.js';
import { quickOf } from './score.js';
import { backupResponse, cloudList, cloudGet, cloudBackup, restoreSchool } from './backup.js';
import tests from '../data/tests.json' with { type: 'json' };

const SID_RE = /^[a-z0-9_-]{3,20}$/;
const USER_RE = /^[a-z0-9_.-]{3,30}$/;
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,19}$/;
// 班名：字母、數字、中文，1–12 個字元（1A、S1A、中一甲、1Lily 都可以）
const CLASS_RE = /^[\p{L}\p{N}]{1,12}$/u;
const YEAR_RE = /^\d{4}-\d{2}$/;
const TEST_IDS = tests.tests.map((t) => t.id);

const PW_OK = (pw) => pw.length >= 4 && pw.length <= 64;
const PW_MSG = '學生密碼要 4–64 個字元';
const MAX_IMPORT = 50;   // 每次最多匯入 50 人（每人一次密碼雜湊，太多會超過伺服器單次運算時限；網頁會自動分批送）

export const SETTING_KEYS = { testsNeedWindow: false, boardDefault: true, studentRemember: true };
export function cleanSettings(raw, base = {}) {
  const out = { ...SETTING_KEYS, ...base };
  for (const k of Object.keys(SETTING_KEYS)) if (raw && typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}
export const schoolInfo = (t) => ({ code: t.school_code, name: t.school_name, settings: cleanSettings(t.settings) });

/** 設定學生密碼（記下 initial_pw 讓紙條印得出），清除登入鎖，並登出該學生所有裝置 */
function passwordStmts(db, student, pw, h) {
  return [db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = ?, fail_count = 0, locked_until = NULL WHERE id = ?').bind(h.hash, h.salt, pw, student.id),
    db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?").bind(student.id),
    db.prepare("DELETE FROM login_fails WHERE key = ? OR key LIKE ?").bind(`s:${student.school_id}:${student.sid}`, `s:${student.school_id}:${student.sid}@%`)];
}

/** 整理老師貼上的練習內容：中文只留碼表有的字和中文標點；英文只留可打的 ASCII。 */
const ZH_PUNCT = '，。；：？！「」、';
function cleanPractice(lang, kind, raw) {
  const removed = new Set();
  let content;
  if (lang === 'zh') {
    // 只留內置速成打得到的字：碼要是 a–y 一至兩個字母（（）《》…… 等符號的碼以 z 開頭，學生打不到）
    const keep = (c) => ZH_PUNCT.includes(c) || /^[a-y]{1,2}$/.test(quickOf(c) ?? '');
    const src = raw.replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/:/g, '：').replace(/;/g, '；').replace(/\s+/g, '');
    content = [...src].filter((c) => { if (keep(c)) return true; removed.add(c); return false; }).join('');
    if (kind !== 'text') content = [...new Set([...content].filter((c) => !ZH_PUNCT.includes(c)))].join('');
  } else {
    content = raw.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
    content = [...content].filter((c) => { if (/[ -~\n]/.test(c)) return true; removed.add(c); return false; }).join('');
    content = kind === 'words' ? [...new Set(content.split(/[\s,]+/).filter(Boolean))].join(' ') : content.replace(/\s+/g, ' ').trim();
  }
  if (content.length < (lang === 'zh' ? 2 : 3)) return { error: '內容太短（中文至少 2 個字、英文至少 3 個字母）' };
  if (content.length > 3000) return { error: '內容太長（最多 3000 字）' };
  return { content, removed: [...removed].filter((c) => !/\s/.test(c)).join(''), length: [...content].length };
}

const parseJson = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

/** 首次設定和平台營運者新增學校共用：建立學校和它的第一位管理員 */
export async function createSchoolWithAdmin(db, b, { owner = false } = {}) {
  const code = String(b?.schoolCode ?? '').trim().toLowerCase();
  const schoolName = String(b?.schoolName ?? '').trim().slice(0, 60);
  const username = String(b?.username ?? '').trim().toLowerCase();
  const password = String(b?.password ?? '');
  const name = String(b?.name ?? '').trim().slice(0, 40);
  if (!CODE_RE.test(code)) return { error: '學校代碼只可用小寫英文字母、數字和 -，2–20 個字元（例如 sphrc）' };
  if (!schoolName) return { error: '請輸入學校名稱' };
  if (!USER_RE.test(username)) return { error: '帳號只可用英文字母、數字、. _ -，3–30 個字元' };
  if (password.length < 8) return { error: '密碼至少 8 個字元' };
  if (!name) return { error: '請輸入姓名' };
  if (await db.prepare('SELECT id FROM schools WHERE code = ?').bind(code).first()) return { error: '這個學校代碼已被使用', status: 409 };
  if (await db.prepare('SELECT id FROM teachers WHERE username = ?').bind(username).first()) return { error: '這個教師帳號已存在（教師帳號全平台唯一，可以加學校代碼，例如 sphrc.chan）', status: 409 };
  const h = await auth.hashPassword(password);
  const settings = JSON.stringify(cleanSettings(b?.settings));
  const [s] = await db.batch([db.prepare('INSERT INTO schools (code, name, settings, note) VALUES (?, ?, ?, ?)').bind(code, schoolName, settings, String(b?.note ?? '').slice(0, 500) || null)]);
  const schoolId = s.meta.last_row_id;
  const t = await db.prepare("INSERT INTO teachers (username, name, pass_hash, salt, role, school_id, is_owner) VALUES (?, ?, ?, ?, 'admin', ?, ?)")
    .bind(username, name, h.hash, h.salt, schoolId, owner ? 1 : 0).run();
  return { schoolId, teacherId: t.meta.last_row_id };
}

export async function teacherRoutes(req, env, path, teacher) {
  const db = env.DB;
  const m = (re) => path.match(re);
  let mm;

  if (path === '/api/teacher/status') {
    const c = await db.prepare('SELECT COUNT(*) AS n FROM teachers').first();
    return json({ setupNeeded: (c?.n ?? 0) === 0, user: teacher ? { id: teacher.id, username: teacher.username, name: teacher.name, role: teacher.role ?? 'teacher',
      isOwner: !!teacher.is_owner, school: schoolInfo(teacher) } : null });
  }

  // 首次設定：平台上還沒有任何教師 → 建立第一間學校和平台營運者
  if (path === '/api/teacher/setup' && req.method === 'POST') {
    const c = await db.prepare('SELECT COUNT(*) AS n FROM teachers').first();
    if ((c?.n ?? 0) > 0) return fail('已經設定好，請登入', 409);
    const b = await body(req);
    // 舊版升級後可能已有一間空的預設學校
    const existing = await db.prepare('SELECT id FROM schools ORDER BY id LIMIT 1').first();
    let teacherId;
    if (existing) {
      const username = String(b?.username ?? '').trim().toLowerCase(), password = String(b?.password ?? ''), name = String(b?.name ?? '').trim().slice(0, 40);
      if (!USER_RE.test(username) || password.length < 8 || !name) return fail('請填好帳號（3–30 個英文字母或數字）、姓名和至少 8 個字元的密碼');
      const h = await auth.hashPassword(password);
      teacherId = (await db.prepare("INSERT INTO teachers (username, name, pass_hash, salt, role, school_id, is_owner) VALUES (?, ?, ?, ?, 'admin', ?, 1)").bind(username, name, h.hash, h.salt, existing.id).run()).meta.last_row_id;
      if (b?.schoolName) await db.prepare('UPDATE schools SET name = ? WHERE id = ?').bind(String(b.schoolName).slice(0, 60), existing.id).run();
    } else {
      const r = await createSchoolWithAdmin(db, b, { owner: true });
      if (r.error) return fail(r.error, r.status ?? 400);
      teacherId = r.teacherId;
    }
    const { header } = await auth.createSession(db, 'teacher', teacherId, false);
    return json({ ok: true }, 200, { 'set-cookie': header });
  }

  if (path === '/api/teacher/login' && req.method === 'POST') {
    const b = await body(req);
    const username = String(b?.username ?? '').trim().toLowerCase();
    const ip = auth.clientIp(req);
    const ipKey = `ip:${ip}`, tKey = `t:${username}`, tIpKey = `t:${username}@${ip}`;
    const lock = await auth.lockedUntil(db, ipKey, tKey, tIpKey);
    if (lock) return fail(`登入錯誤太多次，${auth.waitMsg(lock)}`, 429);
    const t = await db.prepare('SELECT t.*, s.active AS school_active FROM teachers t LEFT JOIN schools s ON s.id = t.school_id WHERE t.username = ?').bind(username).first();
    const pw = String(b?.password ?? '');
    const ok = t ? await auth.verifyPassword(pw, t.salt, t.pass_hash) : await auth.dummyVerify(pw);
    if (!ok) {
      await auth.recordFails(db, [[ipKey, auth.LIMITS.ip], [tKey, auth.LIMITS.account], [tIpKey, auth.LIMITS.teacherIp]]);
      return fail('帳號或密碼不對', 401);
    }
    if (t.school_active === 0 && !t.is_owner) return fail('這間學校的帳戶已暫停，請聯絡平台營運者', 403);
    await auth.clearFails(db, tKey, tIpKey);
    await auth.sweep(db);
    const { header } = await auth.createSession(db, 'teacher', t.id, !!b?.remember);
    return json({ ok: true, user: { username: t.username, name: t.name, role: t.role ?? 'teacher' } }, 200, { 'set-cookie': header });
  }

  if (path === '/api/teacher/logout' && req.method === 'POST') {
    await auth.destroySession(db, req, 'teacher');
    return json({ ok: true }, 200, { 'set-cookie': auth.clearCookie('teacher') });
  }

  if (!teacher) return fail('請先以教師身份登入', 401);
  const S = teacher.school_id;
  const isAdmin = teacher.role === 'admin';
  /** 這位老師可不可以操作這個班（同校；管理員全部可以；老師只可以自己的班） */
  const getClass = async (classId) => {
    const c = await db.prepare('SELECT * FROM classes WHERE id = ? AND school_id = ?').bind(Number(classId), S).first();
    return c && (isAdmin || c.teacher_id === teacher.id) ? c : null;
  };
  const getStudent = async (studentId) => {
    const s = await db.prepare('SELECT s.*, c.teacher_id FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND s.school_id = ?').bind(Number(studentId), S).first();
    return s && (isAdmin || s.teacher_id === teacher.id) ? s : null;
  };
  const NO = () => fail('這不是你的班級', 403);
  const ADMIN = (what) => fail(`只有管理員可以${what}`, 403);

  // ----- 學校設定（管理員）-----
  if (path === '/api/teacher/school' && req.method === 'POST') {
    if (!isAdmin) return ADMIN('更改學校設定');
    const b = await body(req);
    const name = String(b?.name ?? '').trim().slice(0, 60);
    if (!name) return fail('請輸入學校名稱');
    const settings = cleanSettings(b?.settings, cleanSettings(teacher.settings));
    await db.prepare('UPDATE schools SET name = ?, settings = ? WHERE id = ?').bind(name, JSON.stringify(settings), S).run();
    return json({ ok: true, school: { code: teacher.school_code, name, settings } });
  }

  // ----- 老師管理（管理員）-----
  if (path === '/api/teacher/add' && req.method === 'POST') {
    if (!isAdmin) return ADMIN('新增教師');
    const b = await body(req);
    const username = String(b?.username ?? '').trim().toLowerCase();
    const password = String(b?.password ?? '');
    const name = String(b?.name ?? '').trim().slice(0, 40);
    if (!USER_RE.test(username)) return fail('帳號只可用英文字母、數字、. _ -，3–30 個字元');
    if (password.length < 8) return fail('密碼至少 8 個字元');
    if (!name) return fail('請輸入姓名');
    const h = await auth.hashPassword(password);
    try {
      await db.prepare('INSERT INTO teachers (username, name, pass_hash, salt, role, school_id) VALUES (?, ?, ?, ?, ?, ?)').bind(username, name, h.hash, h.salt, b?.role === 'admin' ? 'admin' : 'teacher', S).run();
      return json({ ok: true });
    } catch { return fail('這個帳號已存在（教師帳號全平台唯一）', 409); }
  }
  if (path === '/api/teacher/teachers') {
    if (!isAdmin) return ADMIN('看教師名單');
    const rows = (await db.prepare(`SELECT t.id, t.username, t.name, t.role, t.created_at, COUNT(c.id) AS classes FROM teachers t LEFT JOIN classes c ON c.teacher_id = t.id
      WHERE t.school_id = ? GROUP BY t.id ORDER BY t.id`).bind(S).all()).results;
    return json({ teachers: rows });
  }
  const sameSchoolTeacher = (id) => db.prepare('SELECT * FROM teachers WHERE id = ? AND school_id = ?').bind(Number(id), S).first();
  if ((mm = m(/^\/api\/teacher\/teachers\/(\d+)\/role$/)) && req.method === 'POST') {
    if (!isAdmin) return ADMIN('更改');
    if (!(await sameSchoolTeacher(mm[1]))) return fail('找不到這位老師', 404);
    const b = await body(req); const role = b?.role === 'admin' ? 'admin' : 'teacher';
    if (Number(mm[1]) === teacher.id && role !== 'admin') return fail('不能取消自己的管理員身份');
    await db.prepare('UPDATE teachers SET role = ? WHERE id = ?').bind(role, mm[1]).run();
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/teacher\/teachers\/(\d+)\/reset$/)) && req.method === 'POST') {
    if (!isAdmin) return ADMIN('重設');
    const t = await sameSchoolTeacher(mm[1]);
    if (!t) return fail('找不到這位老師', 404);
    const b = await body(req); const pw = String(b?.password ?? '');
    if (pw.length < 8) return fail('密碼至少 8 個字元');
    const h = await auth.hashPassword(pw);
    await db.batch([db.prepare('UPDATE teachers SET pass_hash = ?, salt = ? WHERE id = ?').bind(h.hash, h.salt, t.id), db.prepare("DELETE FROM sessions WHERE kind = 'teacher' AND user_id = ?").bind(t.id),
      db.prepare("DELETE FROM login_fails WHERE key = ? OR key LIKE ?").bind(`t:${t.username}`, `t:${t.username}@%`)]);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/teacher\/teachers\/(\d+)$/)) && req.method === 'DELETE') {
    if (!isAdmin) return ADMIN('刪除');
    const t = await sameSchoolTeacher(mm[1]);
    if (!t) return fail('找不到這位老師', 404);
    if (t.id === teacher.id) return fail('不能刪除自己');
    if (t.is_owner) return fail('不能刪除平台營運者');
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM classes WHERE teacher_id = ?').bind(t.id).first()).n;
    if (n) return fail('這位老師還有班級，先把班級轉給其他老師');
    // 他出過的功課、練習、評測時段轉到刪除他的管理員名下，學生看到的內容不受影響
    await db.batch([
      db.prepare('UPDATE assignments SET teacher_id = ? WHERE teacher_id = ?').bind(teacher.id, t.id),
      db.prepare('UPDATE custom_practice SET teacher_id = ? WHERE teacher_id = ?').bind(teacher.id, t.id),
      db.prepare('UPDATE test_windows SET teacher_id = ? WHERE teacher_id = ?').bind(teacher.id, t.id),
      db.prepare('UPDATE feedback SET teacher_id = NULL WHERE teacher_id = ?').bind(t.id),
      db.prepare("DELETE FROM sessions WHERE kind = 'teacher' AND user_id = ?").bind(t.id),
      db.prepare('DELETE FROM teachers WHERE id = ?').bind(t.id)]);
    return json({ ok: true });
  }

  if (path === '/api/teacher/password' && req.method === 'POST') {
    const b = await body(req);
    if (!(await auth.verifyPassword(String(b?.old ?? ''), teacher.salt, teacher.pass_hash))) return fail('舊密碼不對', 401);
    const pw = String(b?.password ?? '');
    if (pw.length < 8) return fail('新密碼至少 8 個字元');
    const h = await auth.hashPassword(pw);
    await db.batch([db.prepare('UPDATE teachers SET pass_hash = ?, salt = ? WHERE id = ?').bind(h.hash, h.salt, teacher.id), auth.revokeOthers(db, 'teacher', teacher.id, teacher._token)]);
    return json({ ok: true });
  }

  // ----- 班級 -----
  if (path === '/api/teacher/classes' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT c.id, c.name, c.year, c.teacher_id, c.show_board, t.name AS teacher, COUNT(s.id) AS students
      FROM classes c JOIN teachers t ON t.id = c.teacher_id LEFT JOIN students s ON s.class_id = c.id
      WHERE c.school_id = ? ${isAdmin ? '' : 'AND c.teacher_id = ?'} GROUP BY c.id ORDER BY c.year DESC, c.name`).bind(S, ...(isAdmin ? [] : [teacher.id])).all()).results;
    return json({ classes: rows });
  }

  if (path === '/api/teacher/classes' && req.method === 'POST') {
    const b = await body(req);
    const name = String(b?.name ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const year = String(b?.year ?? '').trim();
    if (!CLASS_RE.test(name)) return fail('班別只可用字母、數字或中文，最多 12 個字（例如 1A、S1A、中一甲）');
    if (!YEAR_RE.test(year)) return fail('學年格式：2027-28');
    const owner = isAdmin && b?.teacherId ? await sameSchoolTeacher(b.teacherId) : teacher;
    if (!owner) return fail('找不到這位老師');
    try {
      const r = await db.prepare('INSERT INTO classes (school_id, name, year, teacher_id, show_board) VALUES (?, ?, ?, ?, ?)')
        .bind(S, name, year, owner.id, cleanSettings(teacher.settings).boardDefault ? 1 : 0).run();
      return json({ ok: true, id: r.meta.last_row_id });
    } catch { return fail('這個學年已有這個班', 409); }
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)$/)) && req.method === 'DELETE') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const b = await body(req);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM students WHERE class_id = ?').bind(cls.id).first()).n;
    // 畢業／離校：連學生和他們的全部紀錄一起刪（要輸入班名確認）
    if (n > 0 && b?.purge !== true) return fail('班裏還有學生：先把學生移班，或選「連學生一起刪除」');
    if (n > 0 && String(b?.confirm ?? '').toUpperCase() !== cls.name) return fail(`請輸入班名「${cls.name}」確認刪除`);
    const inCls = 'SELECT id FROM students WHERE class_id = ?';
    await db.batch([
      db.prepare(`DELETE FROM test_attempts WHERE student_id IN (${inCls})`).bind(cls.id),
      db.prepare(`DELETE FROM progress WHERE student_id IN (${inCls})`).bind(cls.id),
      db.prepare(`DELETE FROM feedback WHERE student_id IN (${inCls})`).bind(cls.id),
      db.prepare(`DELETE FROM sessions WHERE kind = 'student' AND user_id IN (${inCls})`).bind(cls.id),
      db.prepare('DELETE FROM students WHERE class_id = ?').bind(cls.id),
      db.prepare('DELETE FROM assignments WHERE class_id = ?').bind(cls.id),
      db.prepare('DELETE FROM custom_practice WHERE class_id = ?').bind(cls.id),
      db.prepare('DELETE FROM test_windows WHERE class_id = ?').bind(cls.id),
      db.prepare('DELETE FROM classes WHERE id = ?').bind(cls.id)]);
    return json({ ok: true, deletedStudents: n });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/board$/)) && req.method === 'POST') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const b = await body(req);
    await db.prepare('UPDATE classes SET show_board = ? WHERE id = ?').bind(b?.on ? 1 : 0, cls.id).run();
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/owner$/)) && req.method === 'POST') {
    if (!isAdmin) return ADMIN('轉班');
    const cls = await getClass(mm[1]);
    if (!cls) return fail('找不到這個班', 404);
    const b = await body(req);
    const t = await sameSchoolTeacher(b?.teacherId);
    if (!t) return fail('找不到這位老師');
    await db.prepare('UPDATE classes SET teacher_id = ? WHERE id = ?').bind(t.id, cls.id).run();
    return json({ ok: true });
  }

  // 升班／調班：把學生移到另一班（兩班都要是你可以管理的班）；紀錄跟着學生走
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/move$/)) && req.method === 'POST') {
    const from = await getClass(mm[1]);
    if (!from) return NO();
    const b = await body(req);
    const to = await getClass(b?.toClassId);
    if (!to) return fail('找不到目標班別，或不是你可以管理的班');
    if (to.id === from.id) return fail('目標班別跟原本的一樣');
    const ids = Array.isArray(b?.studentIds) ? b.studentIds.map(Number).filter(Number.isInteger).slice(0, 300) : null;
    const keepNo = b?.keepNumbers !== false;
    let r;
    if (ids && ids.length) {
      const stmts = [];
      for (let i = 0; i < ids.length; i += 90) {
        const part = ids.slice(i, i + 90);
        stmts.push(db.prepare(`UPDATE students SET class_id = ?${keepNo ? '' : ', class_no = NULL'} WHERE class_id = ? AND id IN (${part.map(() => '?').join(',')})`).bind(to.id, from.id, ...part));
      }
      r = (await db.batch(stmts)).reduce((s, x) => s + (x.meta?.changes ?? 0), 0);
    } else {
      r = (await db.prepare(`UPDATE students SET class_id = ?${keepNo ? '' : ', class_no = NULL'} WHERE class_id = ?`).bind(to.id, from.id).run()).meta?.changes ?? 0;
    }
    return json({ ok: true, moved: r });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/students$/))) {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const rows = (await db.prepare(`SELECT s.id, s.sid, s.name, s.class_no, s.initial_pw IS NOT NULL AS pw_initial, s.created_at,
        p.summary, p.updated_at AS progress_at
      FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ? ORDER BY s.class_no, s.sid`).bind(cls.id).all()).results;
    const tests = (await db.prepare(`SELECT a.student_id, a.test_id, a.wpm, a.accuracy, a.stars, a.flags, a.submitted_at FROM test_attempts a JOIN students s ON s.id = a.student_id
      WHERE s.class_id = ? AND a.submitted_at IS NOT NULL`).bind(cls.id).all()).results;
    const byStudent = {};
    for (const t of tests) (byStudent[t.student_id] ??= {})[t.test_id] = { wpm: t.wpm, accuracy: t.accuracy, stars: t.stars, flags: parseJson(t.flags, []), at: t.submitted_at };
    return json({ cls, students: rows.map((r) => ({ ...r, summary: r.summary ? parseJson(r.summary, null) : null, tests: byStudent[r.id] ?? {} })) });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/export\.csv$/))) {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const rows = (await db.prepare(`SELECT s.id, s.sid, s.name, s.class_no, p.summary FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ? ORDER BY s.class_no, s.sid`).bind(cls.id).all()).results;
    const tests = (await db.prepare(`SELECT a.student_id, a.test_id, a.wpm, a.accuracy, a.stars, a.flags FROM test_attempts a JOIN students s ON s.id = a.student_id
      WHERE s.class_id = ? AND a.submitted_at IS NOT NULL`).bind(cls.id).all()).results;
    const tmap = {};
    for (const t of tests) (tmap[t.student_id] ??= {})[t.test_id] = t;
    const head = ['班號', '學號', '姓名', '英文完成課數', '英文星星', '英文最佳WPM', '中文完成課數', '中文星星', '中文最佳字/分', '練習分鐘', ...TEST_IDS.flatMap((t) => [`${t} 速度`, `${t} 準確率`, `${t} 星`, `${t} 標記`])];
    const lines = [head.map(csvCell).join(',')];
    for (const r of rows) {
      const s = r.summary ? parseJson(r.summary, null) : null;
      const tm = tmap[r.id] ?? {};
      const cells = [r.class_no ?? '', r.sid, r.name, s?.en?.lessons ?? 0, s?.en?.stars ?? 0, Math.round(s?.en?.bestWpm ?? 0), s?.zh?.lessons ?? 0, s?.zh?.stars ?? 0, Math.round(s?.zh?.bestWpm ?? 0), s?.minutes ?? 0];
      for (const t of TEST_IDS) { const x = tm[t]; cells.push(x ? Math.round(x.wpm * 10) / 10 : '', x ? Math.round(x.accuracy * 10) / 10 : '', x ? x.stars : '', x ? parseJson(x.flags, []).join(' ') : ''); }
      lines.push(cells.map(csvCell).join(','));
    }
    const fname = encodeURIComponent(`${cls.year}-${cls.name}.csv`);
    return new Response('﻿' + lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${fname}`, 'cache-control': 'no-store' } });
  }

  // 全級成績（換算分數和全級排名用）：自己可以管理的班有姓名；全級其他班只有數字（不顯示是誰）
  if (path === '/api/teacher/form' && req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const year = String(q.get('year') ?? ''), form = String(q.get('form') ?? ''), testId = String(q.get('test') ?? '');
    if (!YEAR_RE.test(year) || !/^[1-6]$/.test(form) || !TEST_IDS.includes(testId)) return fail('請選學年、級別和評測');
    const rows = (await db.prepare(`SELECT a.wpm, a.accuracy, a.flags, s.id, s.sid, s.name, s.class_no, c.id AS class_id, c.name AS class_name, c.teacher_id
      FROM classes c JOIN students s ON s.class_id = c.id LEFT JOIN test_attempts a ON a.student_id = s.id AND a.test_id = ? AND a.submitted_at IS NOT NULL
      WHERE c.school_id = ? AND c.year = ? AND (c.name LIKE ? OR c.name LIKE ?) ORDER BY c.name, s.class_no, s.sid`)
      .bind(testId, S, year, `${form}%`, `S${form}%`).all()).results;
    const mine = (r) => isAdmin || r.teacher_id === teacher.id;
    return json({
      students: rows.filter(mine).map((r) => ({ id: r.id, sid: r.sid, name: r.name, no: r.class_no, className: r.class_name, wpm: r.wpm, accuracy: r.accuracy, flags: parseJson(r.flags, []) })),
      form: rows.filter((r) => r.wpm !== null).map((r) => ({ wpm: r.wpm, accuracy: r.accuracy })),
      total: rows.length,
    });
  }

  // ----- 評測開放時段 -----
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/windows$/)) && req.method === 'GET') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const rows = (await db.prepare('SELECT w.*, t.name AS teacher FROM test_windows w JOIN teachers t ON t.id = w.teacher_id WHERE w.class_id = ? ORDER BY w.opens_at DESC LIMIT 100').bind(cls.id).all()).results;
    return json({ windows: rows, needWindow: cleanSettings(teacher.settings).testsNeedWindow });
  }
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/windows$/)) && req.method === 'POST') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const b = await body(req);
    const testId = String(b?.testId ?? '');
    if (!TEST_IDS.includes(testId)) return fail('請選評測');
    const opens = new Date(b?.opens ?? Date.now()), closes = new Date(b?.closes ?? '');
    if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime()) || closes <= opens) return fail('請填開始和結束時間（結束要遲於開始）');
    if (closes - opens > 31 * 86400000) return fail('一個時段最長 31 日');
    await db.prepare('INSERT INTO test_windows (class_id, test_id, opens_at, closes_at, teacher_id) VALUES (?, ?, ?, ?, ?)').bind(cls.id, testId, opens.toISOString(), closes.toISOString(), teacher.id).run();
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/teacher\/windows\/(\d+)$/)) && req.method === 'DELETE') {
    const w = await db.prepare('SELECT class_id FROM test_windows WHERE id = ?').bind(Number(mm[1])).first();
    if (!w || !(await getClass(w.class_id))) return NO();
    // 即時關閉：結束時間改成現在（保留紀錄）
    await db.prepare('UPDATE test_windows SET closes_at = ? WHERE id = ?').bind(new Date().toISOString(), Number(mm[1])).run();
    return json({ ok: true });
  }

  // ----- 備份與還原（管理員；只包括自己學校的資料）-----
  if ((path.startsWith('/api/teacher/backup') || path === '/api/teacher/restore') && !isAdmin) return ADMIN('備份和還原');
  if (path === '/api/teacher/backup' && req.method === 'GET') return backupResponse(env, teacher);
  if (path === '/api/teacher/backup/status') {
    const keys = [`last_backup:${S}`, `last_auto_backup:${S}`, `last_auto_backup_error:${S}`, 'last_backup', 'last_auto_backup'];
    const meta = Object.fromEntries((await db.prepare(`SELECT key, value FROM meta WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results.map((r) => [r.key, r.value]));
    const c = await db.prepare(`SELECT (SELECT COUNT(*) FROM students WHERE school_id = ?1) AS students, (SELECT COUNT(*) FROM classes WHERE school_id = ?1) AS classes,
      (SELECT COUNT(*) FROM test_attempts a JOIN students s ON s.id = a.student_id WHERE s.school_id = ?1) AS test_attempts`).bind(S).first();
    return json({ lastBackup: meta[`last_backup:${S}`] ?? meta.last_backup ?? null, lastAutoBackup: meta[`last_auto_backup:${S}`] ?? meta.last_auto_backup ?? null,
      lastAutoError: meta[`last_auto_backup_error:${S}`] ?? null, r2: !!env.BACKUPS, counts: c });
  }
  if (path === '/api/teacher/backup/cloud' && req.method === 'GET') return cloudList(env, teacher);
  if (path === '/api/teacher/backup/cloud' && req.method === 'POST') return cloudBackup(env, teacher);
  if ((mm = m(/^\/api\/teacher\/backup\/cloud\/([\w.-]+)$/)) && req.method === 'GET') return cloudGet(env, teacher, mm[1]);
  if (path === '/api/teacher/restore' && req.method === 'POST') return restoreSchool(env, teacher, await body(req));

  // ----- 自訂練習 -----
  if (path === '/api/teacher/practice' && req.method === 'GET') {
    const rows = (await db.prepare(`SELECT p.*, c.name AS class_name, c.year AS class_year, t.name AS teacher FROM custom_practice p
      LEFT JOIN classes c ON c.id = p.class_id JOIN teachers t ON t.id = p.teacher_id
      WHERE p.school_id = ? ${isAdmin ? '' : 'AND (p.teacher_id = ? OR c.teacher_id = ? OR p.class_id IS NULL)'} ORDER BY p.id DESC`).bind(S, ...(isAdmin ? [] : [teacher.id, teacher.id])).all()).results;
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
    if (classId && !(await getClass(classId))) return fail('找不到這個班別，或不是你的班');
    if (!classId && !isAdmin) return fail('只有管理員可以出給全校學生；請選一班');
    const res = await db.prepare('INSERT INTO custom_practice (teacher_id, class_id, school_id, title, lang, kind, content) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(teacher.id, classId, S, title, lang, kind, r.content).run();
    return json({ ok: true, id: res.meta?.last_row_id, removed: r.removed, length: r.length });
  }
  if ((mm = m(/^\/api\/teacher\/practice\/(\d+)$/)) && req.method === 'DELETE') {
    const pr = await db.prepare('SELECT teacher_id, class_id FROM custom_practice WHERE id = ? AND school_id = ?').bind(Number(mm[1]), S).first();
    if (!pr || !(isAdmin || pr.teacher_id === teacher.id)) return NO();
    await db.prepare('DELETE FROM custom_practice WHERE id = ?').bind(Number(mm[1])).run();
    return json({ ok: true });
  }

  // ----- 學生 -----
  if (path === '/api/teacher/import' && req.method === 'POST') {
    const b = await body(req);
    const cls = await getClass(b?.classId);
    if (!cls) return fail('請先選班別（而且要是你的班）');
    const rows = Array.isArray(b?.rows) ? b.rows : [];
    if (rows.length > MAX_IMPORT) return fail(`每次最多 ${MAX_IMPORT} 人（網頁會自動分批；請重新整理網頁再試）`);
    // 老師可指定全部學生用同一個密碼；留空就每人隨機
    const common = b?.password ? String(b.password) : '';
    if (common && !PW_OK(common)) return fail(PW_MSG);
    const commonHash = common ? await auth.hashPassword(common) : null;
    const clean = rows.map((r) => ({
      sid: String(r?.sid ?? '').trim().toLowerCase(), name: String(r?.name ?? '').trim().slice(0, 40),
      no: r?.no !== '' && r?.no !== null && Number.isInteger(Number(r?.no)) && Number(r.no) >= 0 && Number(r.no) < 1000 ? Number(r.no) : null }));
    const sids = [...new Set(clean.filter((r) => SID_RE.test(r.sid)).map((r) => r.sid))];
    const existing = new Map();
    if (sids.length) {
      for (const x of (await db.prepare(`SELECT s.id, s.sid, s.school_id, s.class_id, c.teacher_id, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.school_id = ? AND s.sid IN (${sids.map(() => '?').join(',')})`).bind(S, ...sids).all()).results) existing.set(x.sid, x);
    }
    const out = [], stmts = [], seen = new Set();
    for (const { sid, name, no } of clean) {
      if (!SID_RE.test(sid) || !name) { out.push({ sid, name, status: '格式不對（學號只可用英文字母、數字、- _，3–20 個字元；姓名不可空）', error: true }); continue; }
      if (seen.has(sid)) { out.push({ sid, name, status: '同一批重複，略過', error: true }); continue; }
      seen.add(sid);
      const ex = existing.get(sid);
      if (ex) {
        // 學號已屬於其他老師的班：一般老師不可以搶過來（防止誤改別班學生），請管理員處理
        if (!isAdmin && ex.class_id && ex.teacher_id !== teacher.id) { out.push({ sid, name, status: `這個學號已在 ${ex.class_name} 班（其他老師的班），請管理員調班`, error: true }); continue; }
        stmts.push(db.prepare('UPDATE students SET name = ?, class_id = ?, class_no = ? WHERE id = ?').bind(name, cls.id, no, ex.id));
        if (common && b?.applyToExisting) {
          stmts.push(...passwordStmts(db, { id: ex.id, sid, school_id: S }, common, commonHash));
          out.push({ sid, name, no, password: common, status: '已存在，更新了班別、姓名和密碼' });
        } else out.push({ sid, name, no, status: '已存在，更新了班別和姓名（密碼不變）' });
        continue;
      }
      const pw = common || auth.randomPassword();
      const h = commonHash ?? await auth.hashPassword(pw);
      stmts.push(db.prepare('INSERT INTO students (school_id, sid, name, class_id, class_no, pass_hash, salt, initial_pw) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(S, sid, name, cls.id, no, h.hash, h.salt, pw));
      out.push({ sid, name, no, password: pw, status: '新增' });
    }
    if (stmts.length) await db.batch(stmts);
    return json({ rows: out });
  }

  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/slips$/))) {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const rows = (await db.prepare('SELECT sid, name, class_no, initial_pw FROM students WHERE class_id = ? ORDER BY class_no, sid').bind(cls.id).all()).results;
    return json({ cls, school: schoolInfo(teacher), students: rows });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/reset$/)) && req.method === 'POST') {
    const s = await getStudent(mm[1]);
    if (!s) return NO();
    const b = await body(req);
    const pw = b?.password ? String(b.password) : auth.randomPassword();
    if (!PW_OK(pw)) return fail(PW_MSG);
    await db.batch(passwordStmts(db, s, pw, await auth.hashPassword(pw)));
    return json({ ok: true, password: pw });
  }

  // 全班改用同一個密碼
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/password$/)) && req.method === 'POST') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const b = await body(req);
    const pw = String(b?.password ?? '');
    if (!PW_OK(pw)) return fail(PW_MSG);
    const h = await auth.hashPassword(pw);
    const r = await db.batch([
      db.prepare('UPDATE students SET pass_hash = ?, salt = ?, initial_pw = ?, fail_count = 0, locked_until = NULL WHERE class_id = ?').bind(h.hash, h.salt, pw, cls.id),
      db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id IN (SELECT id FROM students WHERE class_id = ?)").bind(cls.id)]);
    return json({ ok: true, count: r[0].meta?.changes ?? 0 });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/retake$/)) && req.method === 'POST') {
    const s = await getStudent(mm[1]);
    if (!s) return NO();
    const b = await body(req);
    await db.prepare('DELETE FROM test_attempts WHERE student_id = ? AND test_id = ?').bind(s.id, String(b?.testId ?? '')).run();
    return json({ ok: true });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/tests$/))) {
    const s = await getStudent(mm[1]);
    if (!s) return NO();
    const rows = (await db.prepare('SELECT test_id, started_at, submitted_at, client_wpm, client_acc, wpm, accuracy, seconds, stars, flags, restarts FROM test_attempts WHERE student_id = ? ORDER BY started_at').bind(s.id).all()).results;
    return json({ attempts: rows.map((r) => ({ ...r, flags: parseJson(r.flags, []) })) });
  }

  // 學生詳細頁：整份進度（課堂每步、練習紀錄、弱項）和評測（連按鍵紀錄）
  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/detail$/))) {
    const s0 = await getStudent(mm[1]);
    if (!s0) return NO();
    const s = await db.prepare('SELECT s.id, s.sid, s.name, s.class_no, s.class_id, s.created_at, c.name AS class_name, c.year FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?').bind(s0.id).first();
    const p = await db.prepare('SELECT data, updated_at FROM progress WHERE student_id = ?').bind(s0.id).first();
    const tests = (await db.prepare('SELECT id, test_id, lang, text, time_limit, started_at, submitted_at, client_wpm, client_acc, wpm, accuracy, seconds, stars, flags, keystrokes, restarts FROM test_attempts WHERE student_id = ? ORDER BY started_at').bind(s0.id).all()).results;
    return json({ student: s, progress: p ? parseJson(p.data, null) : null, updatedAt: p?.updated_at ?? null,
      tests: tests.map((t) => ({ ...t, flags: parseJson(t.flags, []), keystrokes: t.keystrokes ? parseJson(t.keystrokes, null) : null })) });
  }

  // 個人資料查閱（《個人資料（私隱）條例》的查閱要求）：學生全部紀錄，一個 JSON 檔（不含密碼）
  if ((mm = m(/^\/api\/teacher\/students\/(\d+)\/export$/))) {
    const s0 = await getStudent(mm[1]);
    if (!s0) return NO();
    const s = await db.prepare('SELECT s.sid, s.name, s.class_no, s.created_at, c.name AS class_name, c.year FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?').bind(s0.id).first();
    const p = await db.prepare('SELECT data, updated_at FROM progress WHERE student_id = ?').bind(s0.id).first();
    const t = (await db.prepare('SELECT test_id, started_at, submitted_at, wpm, accuracy, seconds, stars, flags, text, keystrokes FROM test_attempts WHERE student_id = ?').bind(s0.id).all()).results;
    const f = (await db.prepare('SELECT page, message, created_at FROM feedback WHERE student_id = ?').bind(s0.id).all()).results;
    const out = { exportedAt: new Date().toISOString(), school: teacher.school_name, student: s, progress: p ? parseJson(p.data, null) : null, progressUpdatedAt: p?.updated_at ?? null,
      tests: t.map((x) => ({ ...x, flags: parseJson(x.flags, []), keystrokes: x.keystrokes ? parseJson(x.keystrokes, null) : null })), feedback: f };
    return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="student-${s0.sid}.json"` } });
  }

  // ----- 功課指派 -----
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/assignments$/)) && req.method === 'GET') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const rows = (await db.prepare("SELECT a.*, t.name AS teacher FROM assignments a JOIN teachers t ON t.id = a.teacher_id WHERE a.class_id = ? ORDER BY COALESCE(a.due, '9999'), a.id").bind(cls.id).all()).results;
    // 每份功課誰做了：用 progress.summary 的 done 清單
    const done = (await db.prepare('SELECT s.id, p.summary FROM students s LEFT JOIN progress p ON p.student_id = s.id WHERE s.class_id = ?').bind(cls.id).all()).results;
    const doneMap = {};
    for (const d of done) doneMap[d.id] = parseJson(d.summary ?? '{}', {}).done ?? [];
    return json({ assignments: rows.map((a) => ({ ...a, doneBy: Object.entries(doneMap).filter(([, ids]) => Array.isArray(ids) && ids.includes(`${a.lang}:${a.lesson_id}`)).map(([id]) => Number(id)) })), students: done.length });
  }
  if ((mm = m(/^\/api\/teacher\/classes\/(\d+)\/assignments$/)) && req.method === 'POST') {
    const cls = await getClass(mm[1]);
    if (!cls) return NO();
    const b = await body(req);
    const lang = b?.lang === 'en' ? 'en' : 'zh';
    const lesson = Number(b?.lessonId);
    if (!Number.isInteger(lesson) || lesson < 0 || lesson > 30) return fail('請選課');
    const due = /^\d{4}-\d{2}-\d{2}$/.test(b?.due ?? '') ? b.due : null;
    const dup = await db.prepare('SELECT id FROM assignments WHERE class_id = ? AND lang = ? AND lesson_id = ?').bind(cls.id, lang, lesson).first();
    if (dup) return fail('這一課已經派過給這班；要改截止日請先刪除再派', 409);
    await db.prepare('INSERT INTO assignments (class_id, teacher_id, lang, lesson_id, due, note) VALUES (?, ?, ?, ?, ?, ?)').bind(cls.id, teacher.id, lang, lesson, due, String(b?.note ?? '').slice(0, 200)).run();
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/teacher\/assignments\/(\d+)$/)) && req.method === 'DELETE') {
    const a = await db.prepare('SELECT class_id FROM assignments WHERE id = ?').bind(Number(mm[1])).first();
    if (!a || !(await getClass(a.class_id))) return NO();
    await db.prepare('DELETE FROM assignments WHERE id = ?').bind(Number(mm[1])).run();
    return json({ ok: true });
  }

  // ----- 問題回報：管理員看全校；老師看自己班學生和自己的 -----
  if (path === '/api/teacher/feedback') {
    const rows = (await db.prepare(`SELECT f.id, f.page, f.message, f.ua, f.created_at, f.resolved, s.sid, s.name, c.name AS class_name, t.name AS teacher_name
      FROM feedback f LEFT JOIN students s ON s.id = f.student_id LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN teachers t ON t.id = f.teacher_id
      WHERE f.school_id = ? ${isAdmin ? '' : 'AND (c.teacher_id = ? OR f.teacher_id = ?)'} ORDER BY f.resolved, f.id DESC LIMIT 200`).bind(S, ...(isAdmin ? [] : [teacher.id, teacher.id])).all()).results;
    return json({ feedback: rows });
  }
  if ((mm = m(/^\/api\/teacher\/feedback\/(\d+)\/resolve$/)) && req.method === 'POST') {
    const f = await db.prepare('SELECT f.id, f.teacher_id, c.teacher_id AS class_teacher FROM feedback f LEFT JOIN students s ON s.id = f.student_id LEFT JOIN classes c ON c.id = s.class_id WHERE f.id = ? AND f.school_id = ?').bind(Number(mm[1]), S).first();
    if (!f || !(isAdmin || f.class_teacher === teacher.id || f.teacher_id === teacher.id)) return NO();
    await db.prepare('UPDATE feedback SET resolved = 1 WHERE id = ?').bind(f.id).run();
    return json({ ok: true });
  }

  if ((mm = m(/^\/api\/teacher\/students\/(\d+)$/)) && req.method === 'DELETE') {
    const s = await getStudent(mm[1]);
    if (!s) return NO();
    await db.batch([
      db.prepare('DELETE FROM test_attempts WHERE student_id = ?').bind(s.id),
      db.prepare('DELETE FROM progress WHERE student_id = ?').bind(s.id),
      db.prepare('DELETE FROM feedback WHERE student_id = ?').bind(s.id),
      db.prepare("DELETE FROM sessions WHERE kind = 'student' AND user_id = ?").bind(s.id),
      db.prepare('DELETE FROM students WHERE id = ?').bind(s.id),
    ]);
    return json({ ok: true });
  }

  return null;
}
