// 資料表建立和升級。
// 1. migrations/*.sql 全部是 CREATE IF NOT EXISTS，每次 worker 啟動執行一次（重複執行沒有影響）。
// 2. 後加的欄位：SQLite 沒有 ADD COLUMN IF NOT EXISTS，所以先查 PRAGMA table_info 再加。
// 3. 要重建資料表的升級（例如把「學號全平台唯一」改成「每間學校唯一」）按 meta.schema_version 只做一次。

import schema1 from '../migrations/0001_init.sql';
import schema2 from '../migrations/0002_limits.sql';
import schema3 from '../migrations/0003_custom.sql';
import schema4 from '../migrations/0004_meta.sql';
import schema5 from '../migrations/0005_teacher2.sql';
import schema6 from '../migrations/0006_schools.sql';

const schema = [schema1, schema2, schema3, schema4, schema5, schema6].join('\n');
export const SCHEMA_VERSION = 6;

const NEW_COLUMNS = [
  ['teachers', 'role', "TEXT NOT NULL DEFAULT 'teacher'"],
  ['teachers', 'school_id', 'INTEGER'],
  ['teachers', 'is_owner', 'INTEGER NOT NULL DEFAULT 0'],
  ['classes', 'show_board', 'INTEGER NOT NULL DEFAULT 1'],
  ['custom_practice', 'school_id', 'INTEGER'],
  ['feedback', 'school_id', 'INTEGER'],
  ['feedback', 'teacher_id', 'INTEGER'],
  ['test_attempts', 'restarts', 'INTEGER NOT NULL DEFAULT 0'],
  ['sessions', 'last_seen', 'TEXT'],
  ['sessions', 'remember', 'INTEGER NOT NULL DEFAULT 1'],
];

let ready = null;
export function ensureSchema(db, env = {}) {
  ready ??= run(db, env).catch((e) => { ready = null; throw e; });
  return ready;
}

async function run(db, env) {
  // D1 的 exec 要求一句一行，所以把每個 CREATE 句子分開用 prepare 執行
  const stmts = schema.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
  await db.batch(stmts.map((x) => db.prepare(x)));
  for (const [table, col, def] of NEW_COLUMNS) {
    const cols = (await db.prepare(`PRAGMA table_info(${table})`).all()).results.map((c) => c.name);
    if (!cols.includes(col)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
  }
  const v = Number((await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").first())?.value ?? 0);
  if (v < 6) {
    try { await toV6(db, env); } catch (e) {
      // 另一個 worker 同時在升級：再查一次版本，已升級就當成功
      const again = Number((await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").first())?.value ?? 0);
      if (again < 6) throw e;
    }
  }
}

/**
 * 第 6 版：多校。
 * - 已有資料：建立一間預設學校（代碼取 env.DEFAULT_SCHOOL_CODE，否則 school），全部老師、班級、學生歸入這間學校；
 *   最早的管理員成為平台營運者（is_owner）。
 * - 重建 classes（班名+學年 每校唯一）和 students（學號 每校唯一）。
 *   做法：先把資料抄到沒有約束的臨時表，刪舊表、用新定義建表、抄回去。
 *   外鍵延後到交易完結才檢查（PRAGMA defer_foreign_keys），所以 progress、test_attempts 等指向學生的資料不受影響。
 */
async function toV6(db, env) {
  const teachers = (await db.prepare('SELECT COUNT(*) AS n FROM teachers').first()).n;
  let schoolId = (await db.prepare('SELECT MIN(id) AS id FROM schools').first())?.id ?? null;
  if (!schoolId && teachers > 0) {
    const code = String(env.DEFAULT_SCHOOL_CODE ?? 'school').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'school';
    const name = String(env.DEFAULT_SCHOOL_NAME ?? '本校').slice(0, 60);
    schoolId = (await db.prepare('INSERT INTO schools (code, name) VALUES (?, ?)').bind(code, name).run()).meta.last_row_id;
  }
  const sid = schoolId ?? null;
  const q = (sql, ...args) => db.prepare(sql).bind(...args);
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys = true'),
    // 班級
    db.prepare('CREATE TABLE classes_v5 AS SELECT * FROM classes'),
    db.prepare('DROP TABLE classes'),
    db.prepare(`CREATE TABLE classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER REFERENCES schools(id),
      name TEXT NOT NULL,
      year TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      show_board INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, name, year)
    )`),
    q('INSERT INTO classes (id, school_id, name, year, teacher_id, show_board, created_at) SELECT id, ?, name, year, teacher_id, show_board, created_at FROM classes_v5', sid),
    db.prepare('DROP TABLE classes_v5'),
    // 學生
    db.prepare('CREATE TABLE students_v5 AS SELECT * FROM students'),
    db.prepare('DROP TABLE students'),
    db.prepare(`CREATE TABLE students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER REFERENCES schools(id),
      sid TEXT NOT NULL,
      name TEXT NOT NULL,
      class_id INTEGER REFERENCES classes(id),
      class_no INTEGER,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      initial_pw TEXT,
      fail_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, sid)
    )`),
    q(`INSERT INTO students (id, school_id, sid, name, class_id, class_no, pass_hash, salt, initial_pw, fail_count, locked_until, created_at)
       SELECT id, ?, sid, name, class_id, class_no, pass_hash, salt, initial_pw, fail_count, locked_until, created_at FROM students_v5`, sid),
    db.prepare('DROP TABLE students_v5'),
    db.prepare('CREATE INDEX IF NOT EXISTS students_class ON students(class_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS classes_school ON classes(school_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS attempts_test ON test_attempts(test_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS feedback_school ON feedback(school_id)'),
    db.prepare("UPDATE teachers SET role = 'admin' WHERE id = (SELECT MIN(id) FROM teachers) AND NOT EXISTS (SELECT 1 FROM teachers WHERE role = 'admin')"),
    q('UPDATE teachers SET school_id = ? WHERE school_id IS NULL', sid),
    q('UPDATE custom_practice SET school_id = ? WHERE school_id IS NULL', sid),
    q('UPDATE feedback SET school_id = ? WHERE school_id IS NULL', sid),
    db.prepare("UPDATE teachers SET is_owner = 1 WHERE id = (SELECT MIN(id) FROM teachers WHERE role = 'admin') AND NOT EXISTS (SELECT 1 FROM teachers WHERE is_owner = 1)"),
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '6') ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  ]);
}
