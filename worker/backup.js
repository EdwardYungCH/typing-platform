// 備份、還原、清理。備份按學校分開：每份只有一間學校的資料。
// 備份檔一邊讀資料庫一邊寫出（分頁讀取），學校再大也不會用盡伺服器記憶體。

import * as auth from './auth.js';
import { json, fail } from './http.js';

// 備份的資料表和欄位（還原時只接受這些欄位；school_id 不寫入備份，還原時一律設為目前學校）
export const BACKUP = {
  teachers: { cols: ['id', 'username', 'name', 'pass_hash', 'salt', 'created_at', 'role'], where: 'school_id = ?1' },
  classes: { cols: ['id', 'name', 'year', 'teacher_id', 'created_at', 'show_board'], where: 'school_id = ?1' },
  // 初始密碼不寫入備份（備份檔外流也不會洩露學生密碼）；只記「仍未改過密碼」（空字串）
  students: { cols: ['id', 'sid', 'name', 'class_id', 'class_no', 'pass_hash', 'salt', 'initial_pw', 'created_at'], where: 'school_id = ?1',
    select: { initial_pw: "CASE WHEN initial_pw IS NULL THEN NULL ELSE '' END" } },
  progress: { cols: ['student_id', 'data', 'summary', 'updated_at'], where: 'student_id IN (SELECT id FROM students WHERE school_id = ?1)', page: 50 },
  test_attempts: { cols: ['id', 'student_id', 'test_id', 'lang', 'text', 'time_limit', 'started_at', 'submitted_at', 'client_wpm', 'client_acc', 'client_seconds',
    'wpm', 'accuracy', 'seconds', 'stars', 'flags', 'keystrokes', 'restarts'], where: 'student_id IN (SELECT id FROM students WHERE school_id = ?1)', page: 100 },
  custom_practice: { cols: ['id', 'teacher_id', 'class_id', 'title', 'lang', 'kind', 'content', 'created_at'], where: 'school_id = ?1' },
  assignments: { cols: ['id', 'class_id', 'teacher_id', 'lang', 'lesson_id', 'due', 'note', 'created_at'], where: 'class_id IN (SELECT id FROM classes WHERE school_id = ?1)' },
  test_windows: { cols: ['id', 'class_id', 'test_id', 'opens_at', 'closes_at', 'teacher_id', 'created_at'], where: 'class_id IN (SELECT id FROM classes WHERE school_id = ?1)' },
  feedback: { cols: ['id', 'student_id', 'teacher_id', 'page', 'message', 'ua', 'created_at', 'resolved'], where: 'school_id = ?1' },
};
// 舊備份檔沒有的欄位用這些預設值
const DEFAULTS = { role: 'teacher', resolved: 0, show_board: 1, restarts: 0, flags: '[]', summary: '{}' };
const HAS_SCHOOL = ['teachers', 'classes', 'students', 'custom_practice', 'feedback'];

const enc = new TextEncoder();
const setMeta = (db, key, value) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value);

/** 逐頁讀出一間學校的資料，用 emit(文字) 寫出整份備份 JSON */
async function writeBackup(db, school, by, emit) {
  const now = new Date().toISOString();
  await emit(`{"app":"typing-platform","version":2,"exportedAt":${JSON.stringify(now)},"by":${JSON.stringify(by)},"school":${JSON.stringify({ id: school.id, code: school.code, name: school.name, settings: school.settings })},"tables":{`);
  let firstTable = true;
  for (const [t, def] of Object.entries(BACKUP)) {
    await emit(`${firstTable ? '' : ','}${JSON.stringify(t)}:[`);
    firstTable = false;
    const sel = def.cols.map((c) => (def.select?.[c] ? `${def.select[c]} AS ${c}` : c)).join(', ');
    let last = -1, first = true;
    for (;;) {
      const rows = (await db.prepare(`SELECT rowid AS _r, ${sel} FROM ${t} WHERE (${def.where}) AND rowid > ?2 ORDER BY rowid LIMIT ${def.page ?? 500}`).bind(school.id, last).all()).results;
      if (!rows.length) break;
      for (const r of rows) {
        last = r._r;
        delete r._r;
        await emit((first ? '' : ',') + JSON.stringify(r));
        first = false;
      }
      if (rows.length < (def.page ?? 500)) break;
    }
    await emit(']');
  }
  await emit('}}');
  return now;
}

const schoolOf = (t) => ({ id: t.school_id, code: t.school_code, name: t.school_name, settings: t.settings ?? {} });
const fileName = (code, now) => `typing-backup-${code}-${now.slice(0, 19).replace(/[T:]/g, '-')}.json`;

/** 管理員下載備份：直接串流給瀏覽器 */
export function backupResponse(env, teacher) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const now = new Date().toISOString();
  (async () => {
    try {
      const at = await writeBackup(env.DB, schoolOf(teacher), teacher.username, (s) => w.write(enc.encode(s)));
      await setMeta(env.DB, `last_backup:${teacher.school_id}`, at).run();
      await w.close();
    } catch (e) { console.error('備份失敗', e); await w.abort(e); }
  })();
  return new Response(readable, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="${fileName(teacher.school_code, now).replace(/-\d\d-\d\d-\d\d\.json$/, '.json')}"` } });
}

/** 寫一份備份到 R2；超過 8 MB 用分段上載，記憶體只需要放一段 */
async function backupToR2(env, school, by) {
  const PART = 8 * 1024 * 1024;
  const now = new Date().toISOString();
  const key = `${schoolPrefix(school)}${fileName(school.code, now)}`;
  let chunks = [], size = 0, upload = null, n = 1;
  const parts = [];
  const join = () => { const out = new Uint8Array(size); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } chunks = []; size = 0; return out; };
  const flush = async () => {
    upload ??= await env.BACKUPS.createMultipartUpload(key, { httpMetadata: { contentType: 'application/json' } });
    parts.push(await upload.uploadPart(n++, join()));
  };
  try {
    await writeBackup(env.DB, school, by, async (s) => { const b = enc.encode(s); chunks.push(b); size += b.length; if (size >= PART) await flush(); });
    if (upload) { if (size) await flush(); await upload.complete(parts); } else await env.BACKUPS.put(key, join(), { httpMetadata: { contentType: 'application/json' } });
  } catch (e) { if (upload) await upload.abort().catch(() => {}); throw e; }
  // 每間學校只保留最近 12 份
  const list = await env.BACKUPS.list({ prefix: schoolPrefix(school), limit: 500 });
  const keys = list.objects.map((o) => o.key).sort();
  if (keys.length > 12) await env.BACKUPS.delete(keys.slice(0, keys.length - 12));
  await env.DB.batch([setMeta(env.DB, `last_auto_backup:${school.id}`, now), env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(`last_auto_backup_error:${school.id}`)]);
  return key;
}

/** 每週排程：逐間學校備份到 R2；某間失敗就記下錯誤（後台會顯示），繼續下一間 */
export async function autoBackups(env) {
  const schools = (await env.DB.prepare('SELECT * FROM schools WHERE active = 1').all()).results;
  const out = [];
  for (const s of schools) {
    let settings = {}; try { settings = JSON.parse(s.settings || '{}'); } catch { /* ignore */ }
    try { out.push(await backupToR2(env, { ...s, settings }, 'cron')); } catch (e) {
      console.error(`學校 ${s.code} 自動備份失敗`, e);
      await setMeta(env.DB, `last_auto_backup_error:${s.id}`, `${new Date().toISOString()} ${String(e?.message ?? e).slice(0, 200)}`).run();
    }
  }
  return out;
}

// 雲端備份按「學校編號-代碼」分資料夾：學校刪除後代碼即使再用，新學校也看不到舊學校的備份
export const schoolPrefix = (s) => `school-${s.id}-${s.code}/`;
const cloudPrefix = (t) => schoolPrefix({ id: t.school_id, code: t.school_code });
/** 刪除學校時一併刪除它的雲端備份 */
export async function deleteCloudBackups(env, school) {
  if (!env.BACKUPS) return 0;
  const keys = (await env.BACKUPS.list({ prefix: schoolPrefix(school), limit: 1000 })).objects.map((o) => o.key);
  if (keys.length) await env.BACKUPS.delete(keys);
  return keys.length;
}
export async function cloudList(env, teacher) {
  if (!env.BACKUPS) return json({ enabled: false, files: [] });
  const list = await env.BACKUPS.list({ prefix: cloudPrefix(teacher), limit: 100 });
  const files = list.objects.map((o) => ({ key: o.key.slice(cloudPrefix(teacher).length), size: o.size, uploaded: o.uploaded }));
  // 舊版（單一學校時期）的備份：只有平台營運者看到
  if (teacher.is_owner) for (const o of (await env.BACKUPS.list({ prefix: 'typing-backup-', limit: 100 })).objects) files.push({ key: o.key, size: o.size, uploaded: o.uploaded, legacy: true });
  return json({ enabled: true, files: files.sort((x, y) => (String(x.uploaded) < String(y.uploaded) ? 1 : -1)) });
}
export async function cloudGet(env, teacher, name) {
  if (!env.BACKUPS) return fail('未設定雲端備份', 503);
  const key = name.startsWith('typing-backup-') && teacher.is_owner && !name.startsWith(`typing-backup-${teacher.school_code}-`) ? name : cloudPrefix(teacher) + name;
  const obj = await env.BACKUPS.get(key);
  if (!obj) return fail('沒有這個備份', 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}
export async function cloudBackup(env, teacher) {
  if (!env.BACKUPS) return fail('未設定雲端備份（平台營運者要在 Cloudflare 建立 R2 儲存桶，見管理手冊）', 503);
  return json({ ok: true, key: (await backupToR2(env, schoolOf(teacher), teacher.username)).slice(cloudPrefix(teacher).length) });
}

/** 刪除一間學校的全部資料（還原前、或平台營運者刪除學校時用）；回傳 SQL 句子，由呼叫者放進同一個 batch */
export function deleteSchoolStmts(db, S, { teachers = true, keepOwner = false } = {}) {
  const tw = keepOwner ? 'school_id = ? AND is_owner = 0' : 'school_id = ?';
  const st = 'SELECT id FROM students WHERE school_id = ?';
  const cl = 'SELECT id FROM classes WHERE school_id = ?';
  return [
    db.prepare(`DELETE FROM sessions WHERE kind = 'student' AND user_id IN (${st})`).bind(S),
    ...(teachers ? [db.prepare(`DELETE FROM sessions WHERE kind = 'teacher' AND user_id IN (SELECT id FROM teachers WHERE ${tw})`).bind(S)] : []),
    db.prepare('DELETE FROM feedback WHERE school_id = ?').bind(S),
    db.prepare(`DELETE FROM test_windows WHERE class_id IN (${cl})`).bind(S),
    db.prepare(`DELETE FROM assignments WHERE class_id IN (${cl})`).bind(S),
    db.prepare('DELETE FROM custom_practice WHERE school_id = ?').bind(S),
    db.prepare(`DELETE FROM test_attempts WHERE student_id IN (${st})`).bind(S),
    db.prepare(`DELETE FROM progress WHERE student_id IN (${st})`).bind(S),
    db.prepare('DELETE FROM students WHERE school_id = ?').bind(S),
    db.prepare('DELETE FROM classes WHERE school_id = ?').bind(S),
    ...(teachers ? [db.prepare(`DELETE FROM teachers WHERE ${tw}`).bind(S)] : []),
  ];
}

/** 檢查備份檔：欄位型別、互相指向的編號都要在同一份備份之內（防止有人改備份檔去影響其他學校的資料） */
function validateBackup(d, teacher) {
  if (d?.app !== 'typing-platform' || ![1, 2].includes(d?.version) || !d.tables || typeof d.tables !== 'object') return '這不是打字平台的備份檔';
  if (d.version === 2 && d.school?.code && d.school.code !== teacher.school_code) return `這是另一間學校（${d.school.name ?? d.school.code}）的備份檔，不能還原到這間學校`;
  if (d.version === 2 && d.school?.id && d.school.id !== teacher.school_id) return '這份備份屬於另一間（可能已刪除的）同代碼學校，不能還原到這間學校';
  const T = {};
  for (const t of Object.keys(BACKUP)) {
    const rows = d.tables[t] ?? [];
    if (!Array.isArray(rows)) return `備份檔的 ${t} 格式不對`;
    if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return `備份檔的 ${t} 有不正確的資料`;
    T[t] = rows;
  }
  // 編號要是正整數而且不可太大（太大會令整個資料庫之後的編號失準）
  const intId = (v) => Number.isInteger(v) && v > 0 && v < 1e9;
  const optInt = (v, max) => v === null || v === undefined || (Number.isInteger(v) && v >= 0 && v <= max);
  const str = (v, re) => typeof v === 'string' && re.test(v);
  const ids = (t, k = 'id') => new Set(T[t].map((r) => r[k]));
  if (!T.teachers.length) return '備份檔沒有教師帳號，不能還原';
  if (!T.teachers.some((r) => r.role === 'admin')) return '備份檔沒有管理員，不能還原';
  for (const r of T.teachers) if (!intId(r.id) || typeof r.username !== 'string' || !/^[a-z0-9_.-]{3,30}$/.test(r.username) || typeof r.pass_hash !== 'string' || typeof r.salt !== 'string') return '備份檔的教師資料不正確';
  for (const r of T.teachers) if (!['admin', 'teacher', undefined].includes(r.role)) return '備份檔的教師身份不正確';
  for (const r of T.teachers) if (typeof r.name !== 'string' || r.name.length > 40) return '備份檔的教師姓名不正確';
  const tIds = ids('teachers'), cIds = ids('classes'), sIds = ids('students');
  if (tIds.size !== T.teachers.length || cIds.size !== T.classes.length || sIds.size !== T.students.length) return '備份檔有重複的編號';
  for (const r of T.classes) if (!intId(r.id) || !tIds.has(r.teacher_id) || !str(r.name, /^[\p{L}\p{N}]{1,12}$/u) || !str(r.year, /^\d{4}-\d{2}$/)) return '備份檔的班級資料不正確';
  for (const r of T.students) if (!intId(r.id) || !str(r.sid, /^[a-z0-9_-]{3,20}$/) || typeof r.name !== 'string' || r.name.length > 40 || !optInt(r.class_no, 999)
    || (r.class_id !== null && r.class_id !== undefined && !cIds.has(r.class_id))) return '備份檔的學生資料不正確';
  for (const r of T.test_attempts) if (!str(r.id, /^[0-9a-f]{8,64}$/) || !str(r.test_id, /^[\w-]{1,20}$/) || !['en', 'zh'].includes(r.lang)) return '備份檔的評測資料不正確';
  for (const r of T.assignments) if (!intId(r.id) || !['en', 'zh'].includes(r.lang) || !optInt(r.lesson_id, 99)) return '備份檔的功課資料不正確';
  for (const r of T.test_windows) if (!intId(r.id) || !str(r.test_id, /^[\w-]{1,20}$/)) return '備份檔的評測時段資料不正確';
  for (const t of ['custom_practice', 'feedback']) for (const r of T[t]) if (!intId(r.id)) return `備份檔的 ${t} 編號不正確`;
  for (const t of ['progress', 'test_attempts']) for (const r of T[t]) if (!sIds.has(r.student_id)) return `備份檔的 ${t} 指向不存在的學生`;
  for (const r of T.progress) if (typeof r.data !== 'string' || r.data.length > 400 * 1024) return '備份檔的進度資料不正確';
  for (const t of ['custom_practice', 'assignments', 'test_windows']) for (const r of T[t]) {
    if (!tIds.has(r.teacher_id)) return `備份檔的 ${t} 指向不存在的老師`;
    if ((t !== 'custom_practice' || (r.class_id !== null && r.class_id !== undefined)) && !cIds.has(r.class_id)) return `備份檔的 ${t} 指向不存在的班級`;
  }
  for (const r of T.feedback) {
    if (r.student_id !== null && r.student_id !== undefined && !sIds.has(r.student_id)) return '備份檔的問題回報指向不存在的學生';
    if (r.teacher_id !== null && r.teacher_id !== undefined && !tIds.has(r.teacher_id)) return '備份檔的問題回報指向不存在的老師';
  }
  return { T };
}

/** 還原：刪除這間學校現有的資料，換成備份檔的內容（一個交易：中途出錯會全部還原，資料不變） */
export async function restoreSchool(env, teacher, b) {
  const db = env.DB;
  if (b?.confirm !== '還原') return fail('請輸入「還原」確認');
  const v = validateBackup(b?.backup, teacher);
  if (typeof v === 'string') return fail(v);
  const { T } = v;
  const S = teacher.school_id;
  // 平台營運者的帳戶不會被備份檔取代（否則同校管理員還原一份備份，平台就沒有營運者）
  const owners = (await db.prepare('SELECT id, username FROM teachers WHERE school_id = ? AND is_owner = 1').bind(S).all()).results;
  const ownerByName = new Map(owners.map((o) => [o.username, o.id]));
  const remap = new Map();
  for (const r of T.teachers) {
    if (ownerByName.has(r.username)) remap.set(r.id, ownerByName.get(r.username));
    else if (owners.some((o) => o.id === r.id)) return fail('還原失敗，資料沒有改動：備份檔的教師編號跟平台營運者的帳戶重複，請聯絡平台營運者處理。');
  }
  T.teachers = T.teachers.filter((r) => !ownerByName.has(r.username));
  for (const t of ['classes', 'custom_practice', 'assignments', 'test_windows', 'feedback']) {
    T[t] = T[t].map((r) => (remap.has(r.teacher_id) ? { ...r, teacher_id: remap.get(r.teacher_id) } : r));
  }
  const stmts = deleteSchoolStmts(db, S, { keepOwner: true });
  for (const [t, def] of Object.entries(BACKUP)) {
    const cols = HAS_SCHOOL.includes(t) ? [...def.cols, 'school_id'] : def.cols;
    const rows = T[t];
    // 一句插入多行（每句最多 100 個參數；進度和按鍵紀錄較大，一句最多 4 行）
    const per = Math.max(1, Math.min(Math.floor(100 / cols.length), t === 'progress' || t === 'test_attempts' ? 4 : 20));
    for (let i = 0; i < rows.length; i += per) {
      const part = rows.slice(i, i + per);
      const one = `(${cols.map(() => '?').join(', ')})`;
      stmts.push(db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES ${part.map(() => one).join(', ')}`)
        .bind(...part.flatMap((row) => cols.map((c) => {
          if (c === 'school_id') return S;
          const x = row[c] ?? DEFAULTS[c] ?? null;
          return x !== null && typeof x === 'object' ? JSON.stringify(x) : x;
        }))));
    }
  }
  try { await db.batch(stmts); } catch (e) {
    const clash = /UNIQUE|PRIMARY KEY|constraint/i.test(String(e?.message));
    return fail(clash ? '還原失敗，資料沒有改動：備份檔的帳號或編號跟平台上其他學校重複。請聯絡平台營運者處理。' : '還原失敗，資料沒有改動：備份檔內容不正確', 400);
  }
  return json({ ok: true, counts: Object.fromEntries(Object.entries(T).map(([k, rows]) => [k, rows.length])) }, 200, { 'set-cookie': auth.clearCookie('teacher') });
}

/** 每日清理：過期登入、登入失敗紀錄、30 日前開始但未交卷的評測、一年前已處理的問題回報、一年前結束的評測時段 */
export async function cleanup(env) {
  const db = env.DB;
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const agoSql = (days) => ago(days).replace('T', ' ').slice(0, 19);
  await auth.sweep(db);
  const r = await db.batch([
    db.prepare('DELETE FROM test_attempts WHERE submitted_at IS NULL AND started_at < ?').bind(ago(30)),
    db.prepare('DELETE FROM feedback WHERE resolved = 1 AND created_at < ?').bind(agoSql(365)),
    db.prepare('DELETE FROM test_windows WHERE closes_at < ?').bind(ago(365)),
  ]);
  return { abandonedTests: r[0].meta?.changes ?? 0, oldFeedback: r[1].meta?.changes ?? 0, oldWindows: r[2].meta?.changes ?? 0 };
}
