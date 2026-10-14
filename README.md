# 打字練習平台

中一至中三學生的打字練習網站，分英文打字和中文速成，每部分循「課堂 → 練習 → 評測」由零練到流暢。

目前進度：課堂、練習區、評測區、掌握度／每日任務／里程碑都已完成；**第 4 階段（帳戶與教師後台）**程式已寫好，等 Cloudflare 的 D1 資料庫設定好就可以用。未登入時紀錄只存在學生自己的瀏覽器；登入後同步到伺服器。

## 網站如何更新

1. 修改檔案後推送到 GitHub 的 `main` 分支。
2. Cloudflare Pages 會自動偵測並重新發佈，約 1 分鐘後生效。
3. 在 Cloudflare 的 Workers & Pages → 這個項目 → Deployments，可以看到每次發佈的狀態；失敗時按入去看建置紀錄。

### Cloudflare 設定

項目是 Cloudflare Workers 項目（名稱 `sphrc-typing-platform`）：

| 欄位 | 設定 |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`npm run build` 用 `build.mjs` 壓縮程式並輸出到 `dist/`；`wrangler.jsonc` 指定發佈 `dist/`，並把 `/api/*` 交給 `worker/index.js`。新增上線的資料夾時，要同時加入 `build.mjs` 的 `SITE_DIRS`。

### 開通帳戶功能（一次過，老師要做的事）

帳號、進度和評測成績存在 Cloudflare 的 **D1** 資料庫（跟網站同一個帳戶，免費額度每日 500 萬次讀取、10 萬次寫入）。

1. Cloudflare 後台 → **Storage & Databases → D1 SQL Database → Create**，名稱填 `typing-platform`。建立後複製它的 **Database ID**。
2. 在 GitHub 上打開 `wrangler.jsonc`，把 `"database_id": "請貼上你的 D1 Database ID"` 改成剛複製的 ID，儲存（commit）。
3. Cloudflare 後台 → Workers & Pages → 這個項目 → **Settings → Build**，把 Deploy command 改成：

   ```
   npx wrangler d1 migrations apply typing-platform --remote && npx wrangler deploy
   ```

   這樣每次發佈都會先建立或更新資料表（`migrations/` 資料夾），再發佈網站。
4. 等發佈完成，打開 `https://<你的網址>/teacher/`，網站會請你**建立第一個教師帳號**（只有資料庫空白時才會出現這一頁）。
5. 登入教師後台 → 新增班級 → 匯入學生（貼上「學號 姓名」名單）→ 列印帳號紙條派給學生。

學生用 `login.html` 以學號和密碼登入；忘記密碼由老師在後台重設。

### 伺服器做甚麼

| 功能 | 說明 |
| --- | --- |
| 登入 | 密碼以 PBKDF2 雜湊儲存；輸錯 8 次鎖 10 分鐘；session 存在 D1，cookie 只有 HttpOnly |
| 進度同步 | 學生每次有改動，瀏覽器整份紀錄（課堂、步驟、掌握度、每日任務、夥伴）延遲 1.5 秒送到伺服器；開頁時先拉取；登出會清掉這部電腦的紀錄 |
| 評測 | 開始時由伺服器發題和記時；交卷只送按鍵紀錄，伺服器用同一套引擎重新計算速度和準確率，並標記可疑情況（速度超出上限、按鍵間隔過分平均、用時不符、瀏覽器分數與伺服器重計相差很大）；每個評測只可做一次，老師可允許重做 |
| 教師後台 | 班級、匯入學生、重設密碼、帳號紙條、班級進度表（含評測核實標記）、匯出 CSV、新增教師 |

### 在自己電腦試伺服器功能

需要 Node 22 以上：

```
node --experimental-sqlite tools/dev-server.mjs 8787
```

然後開 `http://localhost:8787`。這個模擬伺服器用 Node 內置的 SQLite 代替 D1，資料只在記憶體（加第三個參數可存成檔案，例如 `tools/dev-server.mjs 8787 dev.sqlite`）。

## 在自己電腦試用

需要 Python（任何版本 3）：

```
python -m http.server 8000
```

然後用瀏覽器開 `http://localhost:8000`。直接雙擊 HTML 檔案不行，因為網頁要讀取 `data/` 內的 JSON 檔。

## 資料夾

| 位置 | 用途 |
| --- | --- |
| `index.html` | 首頁 |
| `type.html` | 打字畫面，所有課堂共用；網址例子 `type.html?lang=en&mode=lesson&id=1&step=2` |
| `css/base.css` | 全站顏色、字體、按鈕；深色模式 |
| `css/type.css` | 打字畫面、虛擬鍵盤、手形、結果彈窗 |
| `js/config.js` | 平台設定（預設設定、休息提示） |
| `js/api.js`、`js/sync.js` | 跟伺服器溝通；登入狀態和進度同步 |
| `login.html`、`me.html` | 學生登入、我的帳戶（改密碼、登出） |
| `teacher/` | 教師後台（單頁程式） |
| `worker/` | Cloudflare Worker：`index.js` 學生 API、`teacher.js` 教師 API、`auth.js` 密碼和 session、`score.js` 伺服器重新計分 |
| `migrations/` | D1 資料表（部署時自動執行） |
| `tools/dev-server.mjs` | 本機模擬伺服器 |
| `js/engine.js` | 打字引擎：比對、計時、記錄按鍵；題目產生 |
| `js/keyboard.js` | 虛擬鍵盤和手形提示 |
| `js/stats.js` | 速度、準確率、星級計算 |
| `js/storage.js` | 儲存層；所有頁面只透過這裏讀寫紀錄 |
| `js/type-page.js` | 打字畫面的流程：導覽、練習、小測、結果 |
| `data/fingers.json` | 鍵盤排位和每個鍵用哪隻手指 |
| `data/levels.json` | 等級、年級目標、星級規則 |
| `data/en-lessons.json` | 英文課堂內容 |
| `build.mjs` | 建置腳本：壓縮 JS 和 CSS，輸出到 `dist/` |
| `_headers` | Cloudflare 的安全標頭設定 |

## 如何修改課堂內容

課堂全部寫在 `data/en-lessons.json`，不用改程式。每課有 `steps`（步驟），步驟類型：

- `guide`：導覽頁，`slides` 內每頁有標題、重點和圖示（`posture` 坐姿圖、`keyboard` 鍵盤、`hands` 手形）。
- `drill`：練習。用 `text` 寫固定文字，或用 `gen` 自動出題：
  - `{"kind": "groups", "chars": "asdf", "groups": 16, "minLen": 2, "maxLen": 4}`：隨機字母組
  - `{"kind": "words", "words": ["ask", "sad"], "count": 18}`：隨機抽詞
- `test`：過關小測，加 `timeLimit`（秒）和 `pass`（例如 `{"accuracy": 90}` 或 `{"accuracy": 90, "wpm": 8}`）。

`display: "big"` 令文字放大置中，適合示範步驟。

## 成績計算

- 英文速度：每 5 個字元（包括空格）當 1 個字；Net WPM = Gross WPM − 未改正錯誤 ÷ 分鐘。
- 準確率：正確按鍵 ÷ 總按鍵；改正過的錯誤仍計入。
- 練習步驟預設「打錯要改正才可繼續」；小測用「可繼續但記錯」。
- 星級：達過關條件 1 粒；規則見 `data/levels.json`。

## 開發階段

1. 英文核心 ✓
2. 速成核心 ✓
3. 練習、評測、掌握度與每日任務 ✓
4. 帳戶與教師後台 ✓（程式完成，待開通 D1）
5. 徽章、訪客模式與試用
6. 第二年：高中二周目、課堂比賽模式

詳細規劃見「打字練習平台 — 功能規劃」文件。

## 英文課文來源

第 2–16 課由 `tools/gen_en_lessons.py` 產生，詞語取自開源的 google-10000-english（已排除不雅詞和網站縮寫），句子和段落為原創。重新產生：`python3 tools/gen_en_lessons.py <詞表檔路徑>`（第 0、1 課不受影響）。

## 中文碼表來源

`data/zh-codes.json` 由 `tools/build_zh_codes.py` 產生：

- 速成碼與選字次序：[rime-ms-quick](https://github.com/kanzaki1201/rime-ms-quick)（依 Windows 微軟速成整理；該儲存庫未附授權條款，正式推出前需向作者確認或改用其他來源）
- 倉頡全碼（拆字圖解）：[rime-cangjie](https://github.com/rime/rime-cangjie)，LGPL-3.0
- 字頻（常用字排序）：[rime-essay](https://github.com/rime/rime-essay)，LGPL-3.0

## 中文課文

第 2–15 課由 `tools/gen_zh_lessons.py` 產生（需先有 `data/zh-codes.json`），詞語和句子為原創。重新產生：`python3 tools/gen_zh_lessons.py`（第 0、1 課不受影響）。

## 速成雙色拆碼圖與字根表圖片

- `assets/glyphs/`：每個字的筆畫取自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)（字形來自 Arphic PL UKai，Arphic Public License；授權見 `assets/glyphs/COPYING.txt` 和 `tools/src/makemeahanzi-APL/`）。由 `tools/build_zh_glyphs.py` 按倉頡碼標出首碼（紅）和尾碼（藍）部件，對不上的字不收。
- `assets/shapes/`：由老師提供的字根與輔助字形表（`tools/src/shape-chart.jpg`）用 `tools/cut_shapes.py` 切成每個字形一張圖。
