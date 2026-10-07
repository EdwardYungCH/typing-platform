# 打字練習平台

中一至中三學生的打字練習網站，分英文打字和中文速成，每部分循「課堂 → 練習 → 評測」由零練到流暢。

目前進度：**第 1 階段（英文核心）**，已完成打字畫面、虛擬鍵盤、手形提示，以及英文第 0、1 課。紀錄暫時只存在學生自己的瀏覽器。

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

`npm run build` 用 `build.mjs` 壓縮程式並輸出到 `dist/`；`wrangler.jsonc` 指定只發佈 `dist/`。新增上線的資料夾時，要同時加入 `build.mjs` 的 `SITE_DIRS`。

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
| `js/config.js` | 平台設定（free／school 模式、預設設定） |
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

1. 英文核心（2026 年 11–12 月）← 現時
2. 速成核心（2027 年 1–2 月）
3. 練習、評測與手機模式（2027 年 3–4 月）
4. 帳戶與教師後台（2027 年 5–6 月）
5. 徽章、訪客模式與試用（2027 年 7–8 月）
6. 第二年：高中二周目、課堂比賽模式

詳細規劃見「打字練習平台 — 功能規劃」文件。

## 英文課文來源

第 2–16 課由 `tools/gen_en_lessons.py` 產生，詞語取自開源的 google-10000-english（已排除不雅詞和網站縮寫），句子和段落為原創。重新產生：`python3 tools/gen_en_lessons.py <詞表檔路徑>`（第 0、1 課不受影響）。
