# 自動測試（本機）

先在專案根目錄開本機伺服器：`python3 -m http.server 8765 &`

- `python3 tools/test/play_all_zh.py` — 用程式按正確答案把中文 16 課每一步打完一次，印出 PROBLEM 行即有問題，`done []` 即全部通過。
- `python3 tools/test/check_en.py` — 檢查英文課文每個字元都能對應鍵盤。
- `python3 tools/test/check_fx.py` — 連擊特效與評測專注模式。

截圖放在 `tools/test/shots/`（不入庫）。Chromium 路徑：`/opt/pw-browsers/chromium`。
