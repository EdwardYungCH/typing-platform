// 小遊戲：鍵雨（字根雨）和限時快打。只出學生已學過的鍵、字根和字，所以是課堂的延伸，不是另一套內容。
// 成績存在這部電腦（已登入會同步）；破個人紀錄每日每款遊戲獎 1 粒星。
import { applyWorld, worldForLang } from './world.js';
import { start as syncStart } from './sync.js';
import { getProgress, getSetting, setSetting, readAll, notifyChanged } from './storage.js';
import { loadZh, ROOTS } from './zh-codes.js';
import { generateText, makeRng } from './engine.js';
import { grantBonus, balance } from './wallet.js';
import { sfx, setSoundEnabled } from './sound.js';

await syncStart();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
applyWorld(worldForLang(lang));
$('eyebrow').textContent = lang === 'zh' ? '字根魔法學院・小遊戲' : '鍵帽星系・小遊戲';
$(lang === 'zh' ? 'l-zh' : 'l-en').classList.add('primary');
setSoundEnabled(getSetting('sound', true));

// ---------- 學過的內容 ----------
const lessons = (await fetch(`data/${lang}-lessons.json`).then((r) => r.json())).lessons;
const prog = getProgress(lang);
const doneLessons = lessons.filter((l) => prog[l.id]?.done);
const CODE_CHAR = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Space: ' ' };
const keyChar = (code) => /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? /^Digit(\d)$/.exec(code)?.[1] ?? CODE_CHAR[code] ?? null;

let keys = [], words = [], zh = null, chars = [];
if (lang === 'en') {
  for (const l of doneLessons) for (const k of l.newKeys ?? []) { const c = keyChar(k); if (c && c !== ' ') keys.push(c); }
  keys = [...new Set(keys.filter((c) => /^[a-z]$/.test(c)))];
  if (keys.length < 4) keys = [...'asdfjkl'];
  const pool = new Set();
  for (const l of doneLessons) for (const s of l.steps) { const t = s.text ?? (s.gen ? generateText(s.gen, makeRng(1)) : ''); for (const w of t.split(/\s+/)) if (/^[a-z]{2,8}$/.test(w)) pool.add(w); }
  words = [...pool].filter((w) => [...w].every((c) => keys.includes(c)));
  if (words.length < 10) words = ['add', 'all', 'ask', 'sad', 'lad', 'fad', 'dad', 'fall', 'salad', 'flask', 'jak', 'lass'].filter((w) => [...w].every((c) => keys.includes(c))).concat(words);
  if (words.length < 5) words = ['as', 'ad', 'sad', 'lad', 'all', 'fall'];
} else {
  zh = await loadZh();
  const ks = new Set();
  for (const l of doneLessons) for (const s of l.steps) for (const k of s.gen?.keys ?? []) if (ROOTS[k]) ks.add(k);
  keys = [...ks];
  if (keys.length < 4) keys = [...'abcdefg'];
  // 學過的字根能拆出的常用字（只要首尾碼都學過）
  chars = zh.common.filter((ch) => { const q = zh.quickOf(ch); return q && q.length === 2 && [...q].every((k) => keys.includes(k)); }).slice(0, 300);
}

// ---------- 成績 ----------
function games() { return readAll().games ?? {}; }
function saveScore(game, score) {
  const data = readAll();
  data.games ??= {}; data.gameDays ??= [];
  const k = `${lang}:${game}`;
  const g = (data.games[k] ??= { best: 0, plays: 0 });
  g.plays += 1;
  const record = score > g.best;
  if (record) g.best = score;
  const today = new Date().toLocaleDateString('sv');
  if (!data.gameDays.includes(today)) data.gameDays.push(today);
  if (data.gameDays.length > 400) data.gameDays = data.gameDays.slice(-400);
  try { localStorage.setItem('typing-platform:v1', JSON.stringify(data)); } catch { /* ignore */ }
  notifyChanged();
  let bonus = 0;
  if (record && score > 0 && grantBonus(`game:${lang}:${game}:${today}`, 1, '小遊戲破紀錄')) bonus = 1;
  return { record, bonus, best: g.best };
}

// ---------- 選單 ----------
const GAMES = [
  { id: 'rain', name: lang === 'zh' ? '字根雨' : '鍵雨', desc: lang === 'zh' ? `字根（${keys.length > 10 ? '和常用字' : ''}）由上面落下，落地前按對它的鍵${chars.length ? '；字要打首尾兩碼' : ''}。60 秒，3 條命。` : '字母由上面落下，落地前按對它。60 秒，3 條命。', run: runRain },
  { id: 'blitz', name: '限時快打', desc: lang === 'zh' ? '30 秒內打出最多的字（首尾碼），打錯扣 2 秒。' : '30 秒內打出最多的詞，打錯扣 2 秒。', run: runBlitz },
];
function menu() {
  const g = games();
  $('app').innerHTML = `<h1 style="margin:0 0 4px">遊樂場</h1><p class="muted" style="margin:0 0 14px">只會出你學過的${lang === 'zh' ? '字根和字' : '鍵'}（已學 ${keys.length} 個${lang === 'zh' && chars.length ? `，可拆的常用字 ${chars.length} 個` : ''}）。破個人紀錄每日每款遊戲 +1 ★。</p>
    <div class="game-grid">${GAMES.map((x) => `<button class="card game-card" data-g="${x.id}" type="button"><b>${x.name}</b><span>${x.desc}</span><small>最佳：${g[`${lang}:${x.id}`]?.best ?? 0}・玩過 ${g[`${lang}:${x.id}`]?.plays ?? 0} 次</small></button>`).join('')}</div>`;
  $('app').querySelectorAll('[data-g]').forEach((b) => b.onclick = () => GAMES.find((x) => x.id === b.dataset.g).run());
}

function result(game, score, extra) {
  const r = saveScore(game, score);
  const g = GAMES.find((x) => x.id === game);
  $('app').innerHTML = `<section class="card game-over"><h2>${r.record && score > 0 ? '新紀錄！' : '完成'}</h2><div class="score">${score}</div><p class="muted">${g.name}・最佳 ${r.best}${extra ? `・${extra}` : ''}</p>
    ${r.bonus ? `<p class="bonus">+${r.bonus} ★　星星 ${balance()}</p>` : ''}
    <div class="form-actions" style="justify-content:center"><button class="btn primary" id="again" type="button">再玩一次</button><button class="btn" id="back" type="button">全部遊戲</button></div></section>`;
  $('again').onclick = () => g.run(); $('back').onclick = menu;
  sfx.win(r.record ? 3 : 1);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
let keyHandler = null;
function listen(fn) { if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = fn; window.addEventListener('keydown', fn); }
function stopListen() { if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = null; }

// ---------- 鍵雨 ----------
function runRain() {
  const DUR = 60;
  $('app').innerHTML = `<div class="game-top"><span>分數 <b id="score">0</b></span><span>命 <b id="lives">♥♥♥</b></span><span>時間 <b id="time">${DUR}</b></span><button class="btn ghost" id="quit" type="button">離開</button></div>
    <div class="rain" id="rain"><div class="ground"></div></div><p class="hint" id="hint">按鍵盤上對應的鍵。${lang === 'zh' && chars.length ? '字要先打首碼再打尾碼。' : ''}</p>`;
  const box = $('rain');
  let score = 0, lives = 3, t0 = performance.now(), last = 0, spawnAt = 0, drops = [], over = false, combo = 0, raf;
  let typed = '';   // 速成字：已打的首碼
  $('quit').onclick = () => end();
  const H = () => box.clientHeight - 34;
  function spawn(now) {
    const useChar = lang === 'zh' && chars.length && Math.random() < 0.35;
    const d = document.createElement('div');
    const elapsed = (now - t0) / 1000;
    let key, label;
    if (useChar) { const ch = pick(chars); key = zh.quickOf(ch); label = ch; d.className = 'drop ch'; }
    else { key = pick(keys); label = lang === 'zh' ? ROOTS[key] : key.toUpperCase(); d.className = 'drop'; }
    d.textContent = label; d.dataset.key = key;
    d.style.left = `${8 + Math.random() * 84}%`;
    box.append(d);
    drops.push({ el: d, key, y: -40, v: (55 + elapsed * 1.6 + Math.random() * 25) });   // px/秒，隨時間加速
  }
  function frame(now) {
    if (over) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    const elapsed = (now - t0) / 1000;
    $('time').textContent = Math.max(0, Math.ceil(DUR - elapsed));
    if (elapsed >= DUR) return end();
    if (now >= spawnAt) { spawn(now); spawnAt = now + Math.max(450, 1400 - elapsed * 14); }
    for (const d of drops) { d.y += d.v * dt; d.el.style.transform = `translateY(${d.y}px)`; }
    const fallen = drops.filter((d) => d.y > H());
    for (const d of fallen) { d.el.classList.add('miss'); setTimeout(() => d.el.remove(), 300); lives--; combo = 0; sfx.error(); }
    if (fallen.length) { drops = drops.filter((d) => !fallen.includes(d)); $('lives').textContent = '♥'.repeat(Math.max(0, lives)) || '—'; box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 300); }
    if (lives <= 0) return end();
    raf = requestAnimationFrame(frame);
  }
  listen((e) => {
    if (e.target.closest('dialog, input, textarea, button')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : null;
    if (!k) return;
    e.preventDefault();
    // 最低的一個符合的先消
    const sorted = [...drops].sort((a, b) => b.y - a.y);
    let hit = sorted.find((d) => d.key === k);
    if (!hit && lang === 'zh') {
      const want = typed ? typed + k : k;
      const cand = sorted.find((d) => d.key.length === 2 && d.key.startsWith(want));
      if (cand && want.length === 1) { typed = want; cand.el.classList.add('half'); return; }
      if (cand && want.length === 2) hit = cand;
    }
    typed = '';
    drops.forEach((d) => d.el.classList.remove('half'));
    if (!hit) { combo = 0; sfx.error(); box.classList.add('flash-bad'); setTimeout(() => box.classList.remove('flash-bad'), 150); return; }
    combo++; score += hit.key.length === 2 ? 3 : 1 + (combo >= 10 ? 1 : 0);
    $('score').textContent = score;
    hit.el.style.setProperty('--y', `${hit.y}px`); hit.el.classList.add('hit'); setTimeout(() => hit.el.remove(), 250);
    drops = drops.filter((d) => d !== hit);
    sfx.key(); if (combo % 10 === 0) sfx.combo(1);
  });
  function end() { over = true; cancelAnimationFrame(raf); stopListen(); result('rain', score, lives > 0 ? `時間到` : '三條命用完'); }
  raf = requestAnimationFrame((now) => { t0 = now; last = now; spawnAt = now + 300; frame(now); });
}

// ---------- 限時快打 ----------
function runBlitz() {
  const DUR = 30;
  const pool = lang === 'zh' ? (chars.length >= 10 ? chars : null) : words;
  if (!pool) { alert('要先完成多幾課、學多些字根，才有足夠的字可以玩。'); return; }
  $('app').innerHTML = `<div class="game-top"><span>打了 <b id="score">0</b></span><span>錯 <b id="errs">0</b></span><span>時間 <b id="time">${DUR}</b></span><button class="btn ghost" id="quit" type="button">離開</button></div>
    <div class="blitz"><div class="target" id="target"></div><div class="typed" id="typed">&nbsp;</div><div class="bar"><i id="bar"></i></div></div><p class="hint">${lang === 'zh' ? '打首碼和尾碼（不用揀字）。' : '打完一個詞按空白鍵或直接打下一個。'}打錯扣 2 秒。</p>`;
  let score = 0, errs = 0, timeLeft = DUR, cur = '', typed = '', over = false, last = performance.now(), raf;
  const next = () => { cur = pick(pool); typed = ''; draw(); };
  const want = () => (lang === 'zh' ? zh.quickOf(cur) : cur);
  function draw() {
    const w = want();
    $('target').innerHTML = lang === 'zh' ? `<span class="big">${cur}</span><span class="code">${[...w].map((k, i) => `<b class="${i < typed.length ? 'done' : ''}">${ROOTS[k]}<small>${k.toUpperCase()}</small></b>`).join('')}</span>` : [...w].map((c, i) => `<b class="${i < typed.length ? 'done' : ''}">${c}</b>`).join('');
    $('typed').textContent = typed || ' ';
  }
  $('quit').onclick = () => end();
  listen((e) => {
    if (e.target.closest('dialog, input, textarea, button')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : null;
    if (!k) return;
    e.preventDefault();
    if (k === ' ') return;
    const w = want();
    if (w[typed.length] === k) { typed += k; sfx.key(); if (typed === w) { score++; $('score').textContent = score; next(); } else draw(); }
    else { errs++; timeLeft -= 2; $('errs').textContent = errs; sfx.error(); $('target').classList.add('bad'); setTimeout(() => $('target').classList.remove('bad'), 150); }
  });
  function frame(now) {
    if (over) return;
    timeLeft -= (now - last) / 1000; last = now;
    $('time').textContent = Math.max(0, Math.ceil(timeLeft));
    $('bar').style.width = `${Math.max(0, timeLeft / DUR) * 100}%`;
    if (timeLeft <= 0) return end();
    raf = requestAnimationFrame(frame);
  }
  function end() { over = true; cancelAnimationFrame(raf); stopListen(); result('blitz', score, `打錯 ${errs} 次`); }
  next(); raf = requestAnimationFrame(frame);
}

menu();
