// 平台設定。第 1–3 階段用 free 模式（紀錄存在瀏覽器）；
// 第 4 階段接上 Supabase 後改為 school，並填入連線資料。

export const CONFIG = {
  MODE: 'free',            // 'free' 或 'school'
  SUPABASE_URL: '',        // 第 4 階段填寫
  SUPABASE_ANON_KEY: '',   // 第 4 階段填寫（公開金鑰，可放在網頁）

  // 學生可在設定中更改的預設值
  defaults: {
    errorMode: 'block',    // block：打錯要改正才可繼續；continue：可繼續但記錯
    sound: true,
    fontScale: 1,
    showFingers: true,
  },

  // 連續打字多久提示休息（分鐘）
  restReminderMinutes: 20,
};
