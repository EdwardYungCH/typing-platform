-- 打字練習平台：帳號、進度、評測（Cloudflare D1 / SQLite）
-- 部署時由 `wrangler d1 migrations apply DB --remote` 自動執行；本機測試用 tools/dev-server.mjs 讀同一個檔案。

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,            -- 例如 1A
  year TEXT NOT NULL,            -- 學年，例如 2027-28
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, year)
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT NOT NULL UNIQUE,      -- 學號，登入帳號，例如 s23001
  name TEXT NOT NULL,
  class_id INTEGER REFERENCES classes(id),
  class_no INTEGER,              -- 班號
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  initial_pw TEXT,               -- 初始密碼（學生改密碼後清空），供老師重印紙條
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS students_class ON students(class_id);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,            -- 'student' 或 'teacher'
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(kind, user_id);

-- 學生進度：整份瀏覽器紀錄（課堂、步驟、掌握度、每日任務、夥伴）以 JSON 存起，跨裝置同步
CREATE TABLE IF NOT EXISTS progress (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  data TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '{}',   -- 伺服器抽出的摘要（課數、星、速度），老師後台用
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 評測：開始時伺服器發題並記時；交卷時用按鍵紀錄重新計分
CREATE TABLE IF NOT EXISTS test_attempts (
  id TEXT PRIMARY KEY,           -- 隨機 id
  student_id INTEGER NOT NULL REFERENCES students(id),
  test_id TEXT NOT NULL,         -- 例如 en-s1
  lang TEXT NOT NULL,
  text TEXT NOT NULL,            -- 發出的題目
  time_limit INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  client_wpm REAL, client_acc REAL, client_seconds REAL,
  wpm REAL, accuracy REAL, seconds REAL, stars INTEGER,   -- 伺服器核實後的成績
  flags TEXT NOT NULL DEFAULT '[]',                        -- 合理性檢查標記
  keystrokes TEXT,               -- 按鍵紀錄（JSON）
  UNIQUE (student_id, test_id)
);
CREATE INDEX IF NOT EXISTS attempts_student ON test_attempts(student_id);
