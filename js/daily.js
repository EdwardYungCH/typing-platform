// 每日任務：由掌握度系統的「到期項目」產生一份三步的臨時課。
// type.html?lang=zh&mode=daily
// 中文：1 字根複習（到期的字根／輔助字形） 2 拆字（到期的字＋學過字根能打的常用字） 3 打字小測
// 英文：1 單鍵（到期的鍵） 2 詞語 3 句子

import * as mastery from './mastery.js';
import { getLessonResult } from './storage.js';

const ALL_ZH = 'abcdefghijklmnopqrstuvwy';
const EXCLUDE = new Set('呵喫縣臺爾啦黨');

/** 已完成課堂教過的鍵 */
function learnedKeys(lang, lessons) {
  const keys = new Set();
  for (const l of lessons) {
    if (!getLessonResult(lang, l.id)?.done) continue;
    for (const k of l.newKeys ?? []) { const m = /^Key([A-Z])$/.exec(k); if (m) keys.add(m[1].toLowerCase()); }
  }
  for (const id of Object.keys(mastery.all(lang))) if (id.startsWith('r:') || id.startsWith('k:')) keys.add(id.slice(2));
  return [...keys].filter((k) => lang === 'en' || ALL_ZH.includes(k));
}

function zhPool(zh, keys, { two = false, limit = 300 } = {}) {
  const set = new Set(keys);
  const out = [];
  for (const ch of zh.common) {
    const q = zh.quickOf(ch);
    if (EXCLUDE.has(ch) || !q || ![...q].every((k) => set.has(k))) continue;
    if (two && q.length !== 2) continue;
    out.push(ch);
    if (out.length >= limit) break;
  }
  return out;
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 今日任務的三個部分各自是否已完成 */
export function dailyProgress(lang) {
  const s = mastery.dailyState(lang);
  const done = s.done[mastery.today()] ?? [];
  return { done, streak: s.streak, finishedToday: done.length >= 3 };
}

export function buildDaily({ lang, zh, lessons, chartInfo }) {
  const keys = learnedKeys(lang, lessons);
  if (!keys.length) return null;
  const steps = [];
  const hintTail = '每日任務：三部分都做完就加一天連續紀錄。';

  if (lang === 'zh') {
    // 1 字根複習：到期的輔助字形優先，不夠就補到期的字根，再不夠就隨機補學過的
    const dueShapes = mastery.due('zh', 's:').map((id) => id.slice(2)).filter((x) => chartInfo?.[x]);
    const dueRoots = mastery.due('zh', 'r:').map((id) => id.slice(2));
    const allShapes = Object.keys(chartInfo ?? {}).filter((x) => keys.includes(x[0]));
    const items = shuffle([...new Set([...dueShapes, ...shuffle(allShapes).slice(0, Math.max(0, 12 - dueShapes.length))])]).slice(0, 20);
    const rootKeys = [...new Set([...dueRoots, ...keys])].join('');
    steps.push(items.length >= 6
      ? { type: 'drill', mode: 'chart', daily: 'review', title: '字根複習', gen: { kind: 'chart', items, keys: rootKeys, count: 20 },
          hint: `今日要重溫 ${dueShapes.length + dueRoots.length} 個字根／字形。看字形，按它所屬的鍵。` }
      : { type: 'drill', mode: 'roots', daily: 'review', title: '字根複習', gen: { kind: 'roots', keys: rootKeys, count: 20 },
          hint: '看字根，按對應的鍵。' });

    // 2 拆字：到期的字 + 學過字根能打的常用字
    const dueChars = mastery.due('zh', 'c:').map((id) => id.slice(2)).filter((ch) => zh.quickOf(ch));
    const pool = zhPool(zh, keys, { two: true });
    const splitChars = [...new Set([...dueChars.slice(0, 10), ...shuffle(pool)])].slice(0, 15);
    if (splitChars.length >= 5) steps.push({
      type: 'drill', mode: 'split', daily: 'split', title: '拆字', hints: 'less', colored: true, chartKeys: keys.join(''),
      gen: { kind: 'chars', chars: splitChars.join(''), count: splitChars.length, unique: true },
      hint: `先想首碼、再想尾碼。今日有 ${dueChars.length} 個字到期要重溫。`,
    });

    // 3 打字：用內置速成把字打出來
    const typePool = [...new Set([...dueChars, ...zhPool(zh, keys)])];
    if (typePool.length >= 5) steps.push({
      type: 'drill', mode: 'quick', daily: 'type', title: '打字小測',
      gen: { kind: 'chars', chars: shuffle(typePool).slice(0, 60).join(''), count: 15, unique: true },
      hint: '打出字根，數字鍵選字，空白鍵翻頁。',
    });
  } else {
    const dueKeys = mastery.due('en', 'k:').map((id) => id.slice(2));
    const chars = [...new Set([...dueKeys, ...keys])].join('');
    steps.push({ type: 'drill', daily: 'review', title: '單鍵複習', gen: { kind: 'groups', chars: (dueKeys.length ? dueKeys.join('') : chars) + 'asdfjkl', groups: 10, minLen: 2, maxLen: 4 },
                 hint: `今日要重溫 ${dueKeys.length} 個鍵。眼看螢幕，手指回到起始位置。` });
    const words = [...new Set(lessons.flatMap((l) => l.steps.flatMap((s) => s.gen?.words ?? [])).filter((w) => [...w].every((c) => chars.includes(c))))];
    if (words.length >= 10) steps.push({ type: 'drill', daily: 'split', title: '詞語', gen: { kind: 'words', words, count: 15 }, hint: '一個一個詞打，打錯要退回改正。' });
    const texts = lessons.filter((l) => getLessonResult('en', l.id)?.done).flatMap((l) => l.steps.map((s) => s.text).filter((t) => t && t.length > 25));
    steps.push({ type: 'drill', daily: 'type', title: '句子', text: texts.length ? texts[Math.floor(Math.random() * texts.length)] : 'a sad lad had a salad', hint: '打一段句子，保持準確。' });
  }
  for (const s of steps) s.hint = `${s.hint} ${hintTail}`;
  return { id: 0, title: '每日任務', subtitle: new Date().toLocaleDateString('zh-HK'), newKeys: [], daily: true, steps };
}
