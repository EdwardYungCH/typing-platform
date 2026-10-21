-- 老師權限、功課指派、問題回報
-- teachers.role：'admin' 看全部班級、管理老師；'teacher' 只看自己的班（第一個教師自動是 admin）
-- SQLite 不能 ADD COLUMN IF NOT EXISTS：worker/index.js 會在建表後檢查欄位再加
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  lang TEXT NOT NULL,
  lesson_id INTEGER NOT NULL,
  due TEXT,                      -- 截止日（YYYY-MM-DD），可空
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS assignments_class ON assignments(class_id);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  page TEXT,
  message TEXT NOT NULL,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved INTEGER NOT NULL DEFAULT 0
);
