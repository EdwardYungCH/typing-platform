// 連續練習天數：任何課堂、練習、每日任務、評測、小遊戲的作答都算「今日有練」。
// 連續 = 由今日（或昨日，今日未練仍保留）向前數每日都有練的日數。每滿 7 天獎 5 粒星（錢包記錄，不會重發）。
import { readAll } from './storage.js';
import { grantBonus } from './wallet.js';

const day = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const shift = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return day(new Date(y, m - 1, d + n)); };

/** 有練習的日子（本地日期）集合 */
export function practiceDays() {
  const s = new Set();
  for (const a of readAll().attempts ?? []) if (a.at) s.add(day(a.at));
  for (const d of readAll().gameDays ?? []) s.add(d);
  return s;
}

export function streakInfo() {
  const days = practiceDays();
  const today = day(new Date());
  let cur = 0, cursor = days.has(today) ? today : shift(today, -1);
  while (days.has(cursor)) { cur++; cursor = shift(cursor, -1); }
  // 最長紀錄
  let best = 0;
  for (const d of days) { if (days.has(shift(d, -1))) continue; let n = 0, c = d; while (days.has(c)) { n++; c = shift(c, 1); } best = Math.max(best, n); }
  const week = [...Array(7)].map((_, i) => { const d = shift(today, i - 6); return { d, on: days.has(d), today: d === today }; });
  return { current: cur, best, today: days.has(today), week, days: days.size };
}

/** 發連續天數獎勵：每到 7、14、21… 天發一次（同一段連續只發一次） */
export function awardStreak() {
  const { current, today } = streakInfo();
  if (!today || current < 7 || current % 7 !== 0) return 0;
  // 用「這段連續的起點日期＋天數」做 key，斷了再連才會再發
  const start = shift(day(new Date()), -(current - 1));
  return grantBonus(`streak:${start}:${current}`, 5, `連續練習 ${current} 天`) ? 5 : 0;
}

/** 首頁用的 7 日條 HTML */
export function weekStrip() {
  const s = streakInfo();
  return `<div class="streak"><div class="dots">${s.week.map((w) => `<span class="${w.on ? 'on' : ''}${w.today ? ' today' : ''}" title="${w.d}">${w.d.slice(8)}</span>`).join('')}</div>
    <div class="st-text"><b>${s.current > 0 ? `連續 ${s.current} 天` : '今日還未練習'}</b><small>${s.today ? '今日已練 ✓' : s.current > 0 ? '今日練一練就保持連續' : '練一步就開始連續紀錄'}${s.best > 1 ? `・最長 ${s.best} 天` : ''}</small></div></div>`;
}
