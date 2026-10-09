// 儲存層：所有頁面只透過這裏存取紀錄。
// 第 1–3 階段（free 模式）存在瀏覽器 localStorage；
// 第 4 階段（school 模式）改為把按鍵紀錄送去伺服器計分，其他頁面毋須改動。

import { CONFIG } from './config.js';

const KEY = 'typing-platform:v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { lessons: {}, attempts: [], settings: {} };
  } catch {
    return { lessons: {}, attempts: [], settings: {} };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 私密瀏覽或空間不足時無法儲存，網站照常運作
  }
}

/** 儲存一次作答的結果（不存按鍵細節，免得佔空間）。 */
export function saveAttempt({ lang, mode, lessonId, step, stats, stars }) {
  if (CONFIG.MODE !== 'free') throw new Error('school 模式於第 4 階段加入');
  const data = readAll();
  data.attempts.push({
    at: new Date().toISOString(),
    lang, mode, lessonId, step,
    wpm: Math.round(stats.netWpm * 10) / 10,
    accuracy: Math.round(stats.accuracy * 10) / 10,
    seconds: Math.round(stats.seconds),
    stars,
  });
  if (data.attempts.length > 500) data.attempts = data.attempts.slice(-500);
  writeAll(data);
}

/** 記錄某課的最好成績；回傳更新後的紀錄。 */
export function saveLessonResult(lang, lessonId, { stars, wpm = 0, accuracy = 0 }) {
  const data = readAll();
  const id = `${lang}:${lessonId}`;
  const prev = data.lessons[id] ?? { stars: 0, bestWpm: 0, bestAccuracy: 0, done: false };
  const next = {
    done: true,
    stars: Math.max(prev.stars, stars),
    bestWpm: Math.max(prev.bestWpm, wpm),
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
    updated: new Date().toISOString(),
  };
  data.lessons[id] = next;
  writeAll(data);
  return { prev, next };
}

export function getLessonResult(lang, lessonId) {
  return readAll().lessons[`${lang}:${lessonId}`] ?? null;
}

export function getProgress(lang) {
  const out = {};
  for (const [id, v] of Object.entries(readAll().lessons)) {
    const [l, n] = id.split(':');
    if (l === lang) out[n] = v;
  }
  return out;
}

export function getSetting(name, fallback) {
  return readAll().settings[name] ?? fallback;
}

export function setSetting(name, value) {
  const data = readAll();
  data.settings[name] = value;
  writeAll(data);
}

/** 本節連續打字時間（秒），用作休息提醒。 */
export function addTypingTime(seconds) {
  try {
    const now = Date.now();
    const raw = JSON.parse(sessionStorage.getItem(KEY + ':rest')) ?? { total: 0, last: now };
    // 停了超過 5 分鐘當作已經休息過
    const total = now - raw.last > 5 * 60000 ? seconds : raw.total + seconds;
    sessionStorage.setItem(KEY + ':rest', JSON.stringify({ total, last: now }));
    return total;
  } catch {
    return 0;
  }
}

export function resetTypingTime() {
  try { sessionStorage.removeItem(KEY + ':rest'); } catch { /* 無需處理 */ }
}

/** 記錄某課某一步最近一次的成績（重做時會刷新），以及該步的最佳成績。 */
export function saveStepResult(lang, lessonId, step, { accuracy = null, wpm = null, stars = null, unit = '' } = {}) {
  const data = readAll();
  data.steps ??= {};
  const id = `${lang}:${lessonId}:${step}`;
  const prev = data.steps[id];
  const latest = { accuracy, wpm, stars, unit, at: new Date().toISOString() };
  data.steps[id] = {
    latest,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy ?? 0),
    bestWpm: Math.max(prev?.bestWpm ?? 0, wpm ?? 0),
  };
  writeAll(data);
}

export function getStepResults(lang, lessonId) {
  const out = {};
  const pre = `${lang}:${lessonId}:`;
  for (const [id, v] of Object.entries(readAll().steps ?? {})) if (id.startsWith(pre)) out[Number(id.slice(pre.length))] = v;
  return out;
}
