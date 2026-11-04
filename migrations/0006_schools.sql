-- 多校：每間學校一個學校代碼；教師、班級、學生、自訂練習、問題回報都屬於一間學校。
-- 這個檔只有 CREATE IF NOT EXISTS（重複執行沒有影響）。
-- 班級和學生的「每校唯一」需要重建資料表，由 worker/index.js 的 migrate() 按 meta.schema_version 只做一次。

CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,      -- 學校代碼（小寫英文字母、數字、-），學生登入時用
  name TEXT NOT NULL,             -- 學校名稱，顯示在頁首、報告、紙條
  active INTEGER NOT NULL DEFAULT 1,
  settings TEXT NOT NULL DEFAULT '{}',   -- 學校設定（JSON）：排行榜預設、評測要否老師開放、首次登入改密碼…
  note TEXT,                      -- 平台營運者備註（例如合約期）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 評測開放時段：老師按班開放某個評測，學生只可在時段內開始
CREATE TABLE IF NOT EXISTS test_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  test_id TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS test_windows_class ON test_windows(class_id);
