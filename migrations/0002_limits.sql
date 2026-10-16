-- 登入失敗次數（防止有人用程式不停估密碼）：key 例如 ip:1.2.3.4、t:老師帳號
CREATE TABLE IF NOT EXISTS login_fails (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  locked_until TEXT
);
