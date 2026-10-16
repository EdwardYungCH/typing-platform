-- 老師自訂練習：指派給一班（class_id）或全部學生（class_id 為 NULL）
CREATE TABLE IF NOT EXISTS custom_practice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  class_id INTEGER REFERENCES classes(id),
  title TEXT NOT NULL,
  lang TEXT NOT NULL,            -- 'zh' 或 'en'
  kind TEXT NOT NULL,            -- zh：text 整段打字、chars 字表打字、split 字表拆字；en：text 整段、words 詞語
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS custom_class ON custom_practice(class_id);
