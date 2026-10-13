// 練習區：由網址參數產生一份臨時「課」給 type.html 執行。
// type.html?lang=zh&mode=practice&kind=split&keys=abcdefg&count=20
// kind（中文）：roots 字根、chart 字形、split 拆字、quick 打字、weak 弱項、ime 真實輸入法
// kind（英文）：keys 單鍵、words 詞語、sentences 句子、weak 弱項

import { getWeak } from './storage.js';

const ALL = 'abcdefghijklmnopqrstuvwyx';
const EXCLUDE = new Set('呵喫縣臺爾啦黨');  // 詞頻表帶來、不適合課堂的字

/** 從常用字中挑出只用指定字根就打得到的字。 */
function zhPool(zh, keys, { two = false, limit = 400 } = {}) {
  const set = new Set(keys);
  const out = [];
  for (const ch of zh.common) {
    const q = zh.quickOf(ch);
    if (EXCLUDE.has(ch)) continue;
    if (!q || ![...q].every((k) => set.has(k))) continue;
    if (two && q.length !== 2) continue;
    out.push(ch);
    if (out.length >= limit) break;
  }
  return out.join('');
}

function zhWeakChars(zh) {
  const weak = getWeak('zh');
  const chars = weak.filter((w) => w.key.length === 1 && /\p{Script=Han}/u.test(w.key)).map((w) => w.key);
  const keys = weak.filter((w) => /^[a-y]$/.test(w.key)).map((w) => w.key);
  return { chars, keys };
}

export function buildPractice(params, { lang, zh, enLessons }) {
  const kind = params.get('kind') ?? (lang === 'zh' ? 'split' : 'words');
  const count = Math.min(Math.max(Number(params.get('count') ?? 20), 5), 120);
  const keys = (params.get('keys') ?? ALL).toLowerCase().replace(/[^a-y]/g, '') || ALL;
  const timeLimit = Number(params.get('time') ?? 0) || 0;
  const title = { roots: '字根練習', chart: '字形練習', split: '拆字練習', quick: '打字練習', weak: '弱項加強', ime: '真實輸入法練習',
                  keys: '單鍵練習', words: '詞語練習', sentences: '句子練習' }[kind] ?? '練習';
  let step;

  if (lang === 'zh') {
    if (kind === 'roots') step = { type: 'drill', mode: 'roots', gen: { kind: 'roots', keys, count } };
    else if (kind === 'chart') step = { type: 'drill', mode: 'chart', gen: { kind: 'chart', keys, count } };
    else if (kind === 'split') step = { type: 'drill', mode: 'split', hints: params.get('hints') ?? 'less', chartKeys: keys, gen: { kind: 'chars', chars: zhPool(zh, keys, { two: true }), count, unique: true } };
    else if (kind === 'quick') step = { type: 'drill', mode: 'quick', gen: { kind: 'chars', chars: zhPool(zh, keys), count } };
    else if (kind === 'ime') step = { type: 'drill', mode: 'ime', gen: { kind: 'chars', chars: zhPool(zh, ALL, { limit: 600 }), count } };
    else if (kind === 'weak') {
      const { chars, keys: wk } = zhWeakChars(zh);
      if (chars.length >= 5) step = { type: 'drill', mode: 'split', hints: 'less', chartKeys: ALL, gen: { kind: 'chars', chars: chars.join(''), count: Math.min(count, chars.length) , unique: true } };
      else if (wk.length) step = { type: 'drill', mode: 'chart', gen: { kind: 'chart', keys: wk.join(''), count } };
      else step = null;
    }
  } else {
    const learned = new Set();
    for (const l of enLessons) for (const k of l.newKeys ?? []) { const m = /^Key([A-Z])$/.exec(k); if (m) learned.add(m[1].toLowerCase()); }
    const chars = params.get('chars') ?? [...learned].join('');
    if (kind === 'keys') step = { type: 'drill', gen: { kind: 'groups', chars, groups: Math.ceil(count / 2), minLen: 2, maxLen: 4 } };
    else if (kind === 'words') {
      const words = enLessons.flatMap((l) => l.steps.flatMap((s) => s.gen?.words ?? [])).filter((w) => [...w].every((c) => chars.includes(c)));
      step = { type: 'drill', gen: { kind: 'words', words: [...new Set(words)], count } };
    } else if (kind === 'sentences') {
      const texts = enLessons.flatMap((l) => l.steps.map((s) => s.text).filter((t) => t && t.length > 25));
      step = { type: 'drill', text: texts[Math.floor(Math.random() * texts.length)] ?? 'the quick brown fox jumps over the lazy dog' };
    } else if (kind === 'weak') {
      const weak = getWeak('en').filter((w) => w.key.length === 1).slice(0, 6).map((w) => w.key);
      step = weak.length ? { type: 'drill', gen: { kind: 'groups', chars: weak.join('') + 'asdfjkl', groups: Math.ceil(count / 2), minLen: 2, maxLen: 4 } } : null;
    }
  }
  if (!step) return null;
  if (timeLimit) step.timeLimit = timeLimit;
  step.title = title;
  step.hint = step.hint ?? '練習區：不計星，做完可以再來一組。';
  return { id: 0, title, subtitle: '練習區', newKeys: [], practice: true, steps: [step] };
}
