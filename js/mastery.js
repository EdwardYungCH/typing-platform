// 掌握度：每個字根（r:a）、輔助字形（s:a-1）、字（c:明）、英文鍵（k:f）都有一個「盒子」和「到期日」。
// 第一次就答對 → 升一盒，下次隔更久才出現；答錯 → 跌兩盒，很快再出現。
// 盒子 0..5 的間隔（日）：0 即日、1 一日、2 三日、3 七日、4 十四日、5 三十日。盒子 3 或以上算「掌握」。

import { notifyChanged } from './storage.js';

const KEY = 'typing-platform:mastery:v1';
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const MASTER_BOX = 3;

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
function writeAll(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 無法儲存時照常運作 */ }
  notifyChanged();
}

const DAY = 86400000;
export const today = () => Math.floor(Date.now() / DAY);

/** 記錄一批作答：results = { id: { ok: 答對次數, err: 答錯次數 } }。每項按「這次有沒有錯」升降盒。 */
export function record(lang, results) {
  const d = readAll();
  const m = (d[lang] ??= {});
  const t = today();
  for (const [id, r] of Object.entries(results)) {
    const it = (m[id] ??= { box: 0, due: t, ok: 0, err: 0, seen: 0 });
    it.ok += r.ok ?? 0;
    it.err += r.err ?? 0;
    it.seen += 1;
    if ((r.err ?? 0) > 0) it.box = Math.max(0, it.box - 2);
    else it.box = Math.min(INTERVAL_DAYS.length - 1, it.box + 1);
    it.due = t + INTERVAL_DAYS[it.box];
    it.last = t;
  }
  writeAll(d);
}

/** 把一些項目加入（例如完成課堂後，該課的字根和字形都進入重溫名單）。 */
export function introduce(lang, ids) {
  const d = readAll();
  const m = (d[lang] ??= {});
  const t = today();
  for (const id of ids) m[id] ??= { box: 0, due: t, ok: 0, err: 0, seen: 0 };
  writeAll(d);
}

export function all(lang) { return readAll()[lang] ?? {}; }
export function get(lang, id) { return all(lang)[id] ?? null; }

/** 今日到期（含逾期）的項目，最急的在前；prefix 例如 'r:' 'c:'。 */
export function due(lang, prefix = '', limit = 100) {
  const t = today();
  return Object.entries(all(lang))
    .filter(([id, it]) => id.startsWith(prefix) && it.due <= t)
    .sort((a, b) => (a[1].due - b[1].due) || (a[1].box - b[1].box))
    .slice(0, limit)
    .map(([id]) => id);
}

/** 進度統計：某類項目中，有幾個已掌握（box ≥ 3）、幾個學過。 */
export function stats(lang, prefix, universe = null) {
  const m = all(lang);
  const ids = universe ?? Object.keys(m).filter((id) => id.startsWith(prefix));
  let mastered = 0, learning = 0;
  for (const id of ids) {
    const it = m[id];
    if (!it) continue;
    if (it.box >= MASTER_BOX) mastered += 1; else learning += 1;
  }
  return { total: ids.length, mastered, learning, untouched: ids.length - mastered - learning };
}

/** 每日任務與連續日數 */
const DKEY = 'typing-platform:daily:v1';
function dailyAll() {
  try { return JSON.parse(localStorage.getItem(DKEY)) ?? {}; } catch { return {}; }
}
/** 每種語言各自一個連續日數 */
export function dailyState(lang) {
  return dailyAll()[lang] ?? { streak: 0, last: null, done: {} };
}
export function markDailyDone(lang, part) {
  const all = dailyAll();
  const s = (all[lang] ??= { streak: 0, last: null, done: {} });
  const t = today();
  s.done[t] ??= [];
  if (!s.done[t].includes(part)) s.done[t].push(part);
  if (s.done[t].length >= 3 && s.last !== t) {
    s.streak = s.last === t - 1 ? s.streak + 1 : 1;
    s.last = t;
  }
  for (const k of Object.keys(s.done)) if (Number(k) < t - 60) delete s.done[k];
  try { localStorage.setItem(DKEY, JSON.stringify(all)); } catch { /* ignore */ }
  notifyChanged();
  return s;
}
