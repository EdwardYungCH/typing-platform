// 伺服器重新計分：只信按鍵紀錄，不信瀏覽器送來的分數。
// 英文照 js/engine.js（continue 模式）重播；中文照 js/quick-engine.js（內置速成、continue 模式）重播。

import zhCodes from '../data/zh-codes.json' with { type: 'json' };
import { starsFor } from '../js/stats.js';
import levels from '../data/levels.json' with { type: 'json' };

const PAGE = 9;
const PUNCT = { ',': '，', '.': '。', ';': '；', ':': '：', '?': '？', '!': '！', '[': '「', ']': '」', '\\': '、' };
const KEY_OF_PUNCT = Object.fromEntries(Object.entries(PUNCT).map(([k, v]) => [v, k]));
const CAP = { en: 150, zh: 120 };   // 合理上限：英文 WPM、中文 字／分鐘

let quickOfMap = null;
function quickOf(ch) {
  if (!quickOfMap) {
    quickOfMap = new Map();
    for (const code of Object.keys(zhCodes.quick).sort()) for (const c of zhCodes.quick[code]) if (!quickOfMap.has(c)) quickOfMap.set(c, code);
    for (const [c, code] of Object.entries(zhCodes.qfix)) quickOfMap.set(c, code);
  }
  return quickOfMap.get(ch) ?? null;
}
const candidates = (code) => [...(zhCodes.quick[code] ?? '')];

function clean(keystrokes) {
  if (!Array.isArray(keystrokes)) return [];
  return keystrokes
    .filter((k) => k && typeof k.key === 'string' && Number.isFinite(k.t) && k.t >= 0)
    .slice(0, 6000);
}

/** 英文：每 5 字元算 1 字；淨速度 = 毛速度 − 未改正錯字／分鐘。 */
export function replayEn(text, keystrokes) {
  const chars = [...text];
  const status = new Array(chars.length).fill('todo');
  let pos = 0, total = 0, correct = 0;
  for (const k of keystrokes) {
    if (pos >= chars.length) break;
    if (k.key === 'Backspace') {
      if (pos > 0) { pos -= 1; status[pos] = 'todo'; }
      continue;
    }
    if (k.key.length !== 1) continue;
    total += 1;
    const ok = k.key === chars[pos];
    if (ok) { correct += 1; status[pos] = 'ok'; } else status[pos] = 'bad';
    pos += 1;
  }
  const uncorrected = status.filter((s) => s === 'bad').length;
  return { typed: pos, total, correct, uncorrected, done: pos >= chars.length,
    speed: (minutes) => Math.max(0, pos / 5 / minutes - uncorrected / minutes) };
}

/** 中文（內置速成，評測一定是選字模式）：字／分鐘 = 打對的字數 ÷ 分鐘。 */
export function replayZh(text, keystrokes) {
  const chars = [...text];
  const status = new Array(chars.length).fill('todo');
  let pos = 0, comp = '', page = 0, total = 0, correct = 0;
  const errorAt = new Set();
  const commit = (right) => { status[pos] = right ? (errorAt.has(pos) ? 'fixed' : 'ok') : 'bad'; pos += 1; comp = ''; page = 0; };
  for (const k of keystrokes) {
    if (pos >= chars.length) break;
    const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
    const expected = chars[pos];
    const code = quickOf(expected) ?? '';
    // 組字框空着時 Backspace：刪走剛上屏的錯字（跟 js/quick-engine.js 一致）
    if (key === 'Backspace' && !comp && pos > 0 && status[pos - 1] === 'bad') { pos -= 1; status[pos] = 'todo'; page = 0; continue; }
    if (key === 'Backspace' || key === 'Escape') { comp = key === 'Escape' ? '' : comp.slice(0, -1); page = 0; continue; }
    if (key === ' ' && comp && candidates(comp).length === 1) {
      // 只有一個候選字：空白鍵直接出字（跟 js/quick-engine.js 一致）
      total += 1;
      const right = candidates(comp)[0] === expected;
      if (right) correct += 1; else errorAt.add(pos);
      commit(right);
      continue;
    }
    if (key === ' ' || key === 'PageDown' || key === 'PageUp') {
      const pages = Math.ceil(candidates(comp).length / PAGE);
      if (!pages) continue;
      page = key === ' ' ? (page + 1) % pages : Math.min(Math.max(page + (key === 'PageDown' ? 1 : -1), 0), pages - 1);
      continue;
    }
    if (PUNCT[key] && !comp) {
      total += 1;
      const right = PUNCT[key] === expected;
      if (right) correct += 1; else errorAt.add(pos);
      commit(right);
      continue;
    }
    if (/^[a-z]$/.test(key)) {
      total += 1;
      let ok = code.startsWith(comp) && key === (code[comp.length] ?? '');
      if (comp.length >= 2) ok = false; else { comp += key; page = 0; }
      if (ok) correct += 1; else errorAt.add(pos);
      continue;
    }
    if (/^[1-9]$/.test(key)) {
      total += 1;
      const pick = candidates(comp)[page * PAGE + Number(key) - 1];
      const right = pick !== undefined && pick === expected;
      if (right) correct += 1; else errorAt.add(pos);
      if (right || pick !== undefined) commit(right);
      continue;
    }
  }
  const right = status.filter((s) => s === 'ok' || s === 'fixed').length;
  return { typed: pos, total, correct, uncorrected: status.filter((s) => s === 'bad').length, done: pos >= chars.length,
    speed: (minutes) => right / minutes };
}

/** 核實一次評測：回傳成績、星級和合理性標記。 */
export function verify({ lang, text, timeLimit, keystrokes, pass, serverElapsedSec, client }) {
  const keys = clean(keystrokes);
  const flags = [];
  const r = lang === 'zh' ? replayZh(text, keys) : replayEn(text, keys);
  const lastT = keys.length ? keys[keys.length - 1].t / 1000 : 0;
  // 打齊全文：用時是最後一下按鍵；未打齊：到時自動完結，用時等於時限
  let seconds = r.done ? lastT : (timeLimit || lastT);
  if (timeLimit && seconds > timeLimit + 1) { seconds = timeLimit; flags.push('over-time'); }
  const minutes = Math.max(seconds, 5) / 60;   // 最少當 5 秒，免得一兩下按鍵算出天文數字
  const wpm = r.speed(minutes);
  const accuracy = r.total ? (r.correct / r.total) * 100 : 0;

  if (wpm > CAP[lang]) flags.push('too-fast');
  if (serverElapsedSec !== null && serverElapsedSec + 3 < seconds) flags.push('time-mismatch');
  if (keys.length >= 50) {
    const gaps = [];
    for (let i = 1; i < keys.length; i++) gaps.push(keys[i].t - keys[i - 1].t);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    if (sd < 15) flags.push('robotic');
  }
  if (!r.total) flags.push('empty');
  if (client && Number.isFinite(client.wpm) && Math.abs(client.wpm - wpm) > Math.max(5, wpm * 0.15)) flags.push('client-mismatch');

  const stats = { netWpm: wpm, accuracy };
  const stars = pass && Object.keys(pass).length ? starsFor(stats, pass, levels.stars) : 0;
  return { wpm, accuracy, seconds, stars, typed: r.typed, errors: r.total - r.correct, flags };
}
