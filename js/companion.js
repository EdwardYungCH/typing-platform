// 夥伴系統：選夥伴、按進度計算成長階段、輸出圖片路徑。
// 原則：只會成長、不會退化；只看進度，不看運氣或金錢。

import { getProgress, getSetting, setSetting } from './storage.js';

let dataPromise;
export function loadCompanions() {
  dataPromise ??= fetch('data/companions.json').then((r) => r.json());
  return dataPromise;
}

export function art(world, id, stage) {
  return `assets/companions/${world}/${id}-${stage}.svg`;
}

export function getChoice(world) {
  return getSetting(`companion:${world}`, null);
}

export function setChoice(world, id) {
  setSetting(`companion:${world}`, id);
}

export function getNick(world, fallback) {
  return getSetting(`companionNick:${world}`, fallback);
}

export function setNick(world, name) {
  setSetting(`companionNick:${world}`, String(name).slice(0, 8));
}

/** 只接受該夥伴名單內的名字，其他一律當作預設名。 */
export function validNick(c, name) {
  return c.names.includes(name) ? name : c.names[0];
}

/** 目前進度的摘要：完成課數、最佳速度、最佳準確率。 */
export function summary(lang) {
  const list = Object.values(getProgress(lang));
  return {
    lang,
    lessons: list.filter((p) => p.done).length,
    wpm: Math.max(0, ...list.map((p) => p.bestWpm ?? 0)),
    acc: Math.max(0, ...list.map((p) => p.bestAccuracy ?? 0)),
  };
}

/** 中文用「字／分鐘」門檻，英文用 WPM。 */
function speedNeed(need, s) {
  return s.lang === 'zh' ? (need.cpm ?? need.wpm) : need.wpm;
}

/** 按進度算出階段（0 至 4）。 */
export function stageOf(stages, s) {
  let cur = 0;
  for (const st of stages) {
    const n = st.need;
    if (s.lessons >= n.lessons && s.wpm >= speedNeed(n, s) && s.acc >= n.acc) cur = st.n;
    else break;
  }
  return cur;
}

/** 下一階段還差甚麼，用來顯示在夥伴旁邊。 */
export function nextGoal(stages, s) {
  const cur = stageOf(stages, s);
  const nx = stages[cur + 1];
  if (!nx) return null;
  const need = [];
  if (s.lessons < nx.need.lessons) need.push(`完成 ${nx.need.lessons} 課（現在 ${s.lessons}）`);
  const sp = speedNeed(nx.need, s);
  if (s.wpm < sp) need.push(s.lang === 'zh' ? `速度達每分鐘 ${sp} 字` : `速度達 ${sp} WPM`);
  if (s.acc < nx.need.acc) need.push(`準確率達 ${nx.need.acc}%`);
  return { stage: nx, need };
}

/** 孵化前（仍是蛋）可隨意換；孵化後（幼年或以上）鎖定，只可改名字。 */
export function isLocked(world, stages, lang) {
  return !!getChoice(world) && stageOf(stages, summary(lang)) >= 1;
}

/** 顯示用名字：已驗證，就算有人改了瀏覽器紀錄也只會顯示名單內的名字。 */
export function nickOf(world, c) {
  return validNick(c, getNick(world, c.name));
}
