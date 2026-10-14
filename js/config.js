// 平台設定。紀錄一律先存在瀏覽器；學生登入後由 js/sync.js 同步到伺服器（Cloudflare Worker + D1）。

export const CONFIG = {

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
