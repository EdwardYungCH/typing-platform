# 平台營運手冊

給**平台營運者**看的文件：如何部署、開通學校、備份、監察和更新內容。老師的使用方法見網站上的 `help/teacher-guide.html`。

## 1. 架構

| 部分 | 用甚麼 | 說明 |
| --- | --- | --- |
| 網頁 | Cloudflare Workers 靜態資源（`dist/`） | `npm run build` 由 `build.mjs` 產生 |
| API | `worker/index.js`（學生）、`worker/teacher.js`（老師）、`worker/owner.js`（營運者） | 全部在 `/api/*` |
| 資料庫 | Cloudflare D1（SQLite） | 資料表定義在 `migrations/`；要重建資料表的升級在 `worker/db.js`，按 `meta.schema_version` 只做一次 |
| 雲端備份 | Cloudflare R2（`BACKUPS`） | 每星期日香港時間早上 4 時，每間學校一個檔，保留 12 份 |
| 每日清理 | Cron（`wrangler.jsonc` 的 `triggers`） | 過期登入、24 小時前的登入失敗紀錄、30 日前未交卷的評測、一年前已處理的問題回報 |

多校：每間學校有一個學校代碼（`schools.code`）。老師、班級、學生、自訂練習、問題回報都屬於一間學校；所有查詢都限定在老師自己的學校。教師帳號全平台唯一；學號只在同一間學校內唯一。

## 2. 第一次部署（新平台）

1. Cloudflare 帳戶升級到 **Workers Paid**（每月約 5 美元）。免費計劃每個請求只有 10 毫秒運算時間，登入和匯入學生的密碼雜湊會超時。
2. 建立 D1 資料庫 `typing-platform`，把 Database ID 填入 `wrangler.jsonc`。
3. 建立 R2 儲存桶 `typing-backups`，然後刪去 `wrangler.jsonc` 中 `r2_buckets` 那一行前面的 `//`。
4. 改 `wrangler.jsonc` 的 `name`（Worker 名稱）。現有的 `sphrc-typing-platform` 部署不要改名，否則 Cloudflare 會當成另一個項目。
5. 填好 `data/site.json`：`operator`（營運者名稱）、`contactEmail`（聯絡電郵）。私隱政策、使用條款、產品介紹頁會讀這個檔。
6. Cloudflare 項目的 Build command 用 `npm run build`，Deploy command 用：
   ```
   npx wrangler d1 migrations apply typing-platform --remote && npx wrangler deploy
   ```
7. 打開 `https://<網址>/teacher/`，做「首次設定」：輸入第一間學校的名稱和代碼，以及你自己的帳號。你會成為**平台營運者**（同時是這間學校的管理員）。

## 3. 由單校版本升級（現有部署）

第一次有人用 API 時，`worker/db.js` 會自動：

- 建立一間預設學校。代碼和名稱來自 `wrangler.jsonc` 的 `vars`：`DEFAULT_SCHOOL_CODE`、`DEFAULT_SCHOOL_NAME`。
- 把全部老師、班級、學生、自訂練習和問題回報放進這間學校。
- 重建 `classes` 和 `students` 資料表，令「班名＋學年」和「學號」改為每校唯一。外鍵在交易完結時才檢查，進度和評測紀錄不受影響。
- 最早的管理員成為平台營運者。

升級前建議先在舊後台下載一份備份。升級後：

- 學生仍可照舊登入，因為平台只有一間學校時不用填學校代碼。
- 多了第二間學校之後，學生要用紙條上的網址（`login.html?school=代碼`）登入，或者自己輸入學校代碼。

## 4. 開通一間新學校

教師後台 → 左邊「平台 → 全部學校」→「新增學校」：輸入學校名稱、學校代碼（小寫英文字母、數字，例如 `spc`），以及第一位管理員的姓名、帳號和密碼。把以下資料交給學校：

- 教師後台網址：`https://<網址>/teacher/`
- 管理員帳號和密碼（請對方登入後即時改密碼）
- 學校代碼
- 教師手冊：`https://<網址>/help/teacher-guide.html`

其他管理工作：

- 學校管理員忘記密碼：在「全部學校」的「⋯ → 重設管理員密碼」重設。
- 合約完結：先「暫停帳戶」。暫停後該校所有人即時登出，但資料保留。如需要，請學校下載備份。按私隱政策，學校停止使用後 30 日內要「刪除學校」，這個操作不能復原。

## 5. 備份和還原

- **自動**：每星期日自動備份到 R2，每間學校存在 `school-<學校編號>-<代碼>/` 之下；刪除學校時一併刪除。某間學校備份失敗時，該校「學校設定」頁會顯示提示，Cloudflare 的記錄也會有「自動備份失敗」。
- **手動**：學校管理員可以在「學校設定 → 備份」按「下載備份」或「立即雲端備份」。
- **還原**：只可以還原同一間學校的備份。還原會取代該校全部資料，其他學校不受影響。系統會先檢查備份檔，確保每個編號都指向同一份備份內的資料，所以改過的備份檔不能影響其他學校。
- 備份檔不含學生的初始密碼。還原後，未改過密碼的學生要由老師重設。
- 整個資料庫的災難復原：Cloudflare D1 有 **Time Travel**（最近 30 日任何時間點），在 Cloudflare 後台或用 `wrangler d1 time-travel` 還原。

## 6. 監察和錯誤

- 用戶看到「伺服器出錯（編號 ABC123）」時，到 Cloudflare 後台 → Workers → Observability → Logs，搜尋 `錯誤 ABC123` 就會找到詳細的錯誤內容。
- 自動化測試：
  - `node --experimental-sqlite tools/dev-server.mjs 8787`，然後執行 `python3 tools/test/api_test.py`。共 108 項，涵蓋多校隔離、權限、營運者帳戶保護、評測防作弊、同步衝突、備份還原和登入鎖。
  - `python3 -m http.server 8765`，然後執行 `python3 tools/test/play_all_en.py` 和 `play_all_zh.py`，自動打完每一課。
- 每次推送到 GitHub，GitHub Actions（`.github/workflows/test.yml`）會自動執行以上測試。

## 7. 保安設定摘要

| 項目 | 設定 |
| --- | --- |
| 密碼 | PBKDF2-SHA256，100,000 次（Workers 的上限）；學生初始密碼 6 個字元，去掉容易混淆的字元 |
| 登入次數限制 | 學生登入只按帳號限制，不鎖整個網絡（學校全校共用一個對外 IP）：同一帳號在同一網絡 10 次暫停 10 分鐘，一小時內 50 次暫停 30 分鐘。老師登入：同一帳號在同一網絡 8 次；同一網絡的老師登入 10 分鐘內失敗 100 次暫停 |
| 老師設的學生密碼 | 至少 6 個字元，不可以是 123456、全部相同字元等太常見的密碼 |
| 營運者帳戶 | 只有營運者本人可以改自己的密碼和身份；學校還原備份不會刪走營運者帳戶 |
| Session | 學生預設在關閉瀏覽器時失效（伺服器最多保留 10 小時），剔「記住我」可保留 30 日；老師 12 小時，或 14 日；閒置太久自動失效；改密碼會登出其他裝置 |
| 寫入請求 | 一定要來自本站網頁（檢查 Origin 或 Sec-Fetch-Site） |
| 評測 | 每個評測 3 份題目：第 1 份公開給未登入時試做，登入的正式評測由伺服器在另外 2 份中隨機抽（網站發佈的 `data/tests.json` 不含這 2 份）；伺服器記時，按按鍵紀錄重新計分；可以重新開始兩次，之後要老師重開；標記可疑情況 |
| 資料隔離 | 所有教師 API 都檢查學校和班級擁有權；學生進度只收已知欄位，摘要只存數字 |

## 8. 更新教學內容

| 內容 | 怎樣改 |
| --- | --- |
| 英文課 | 改 `tools/gen_en_lessons.py`，執行 `python3 tools/gen_en_lessons.py`。會更新 `data/en-lessons.json` 和句子庫 `data/en-sentences.json` |
| 中文課 | 改 `tools/gen_zh_lessons.py`，執行它，然後執行 `python3 tools/bundle_glyphs.py`。取碼規則以 `docs/cangjie-rules.md` 為準 |
| 評測題目 | `data/tests.json`。每個評測 3 份題目（`forms`），題目不可以跟課堂內容重複。中文題目改完要執行 `python3 tools/normalize_variants.py` |
| 異體字 | `tools/normalize_variants.py`，例如統一用微軟速成較易選到的「著」「裡」 |

## 9. 授權

第三方資料的授權見網站的 `credits.html`。要特別留意：

- 速成碼和選字次序來自 rime-ms-quick（依 Windows 微軟速成整理），未列明授權。商業銷售前，要取得作者的書面許可，或改用其他有明確授權的來源。
- 英文詞語的來源是 NGSL，授權為 CC BY-SA 4.0：須註明出處，改編的詞表亦須以相同授權發佈。
