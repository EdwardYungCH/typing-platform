// 快捷鍵課：學習（卡片）→ 練習（逐個按，錯了有提示）→ 小測（不給提示，計分）；另有總測驗。
// 瀏覽器攔得到的組合鍵（real）可以真的按；Windows 或瀏覽器會先處理的（Win 鍵、Alt＋Tab、Ctrl＋W…）用螢幕鍵盤點選。
import { applyWorld } from './world.js';
import { saveShortcutResult, getShortcutResults } from './storage.js';
import { start as syncStart } from './sync.js';

await syncStart();
applyWorld('planet');
const $ = (id) => document.getElementById(id);
const app = $('app');
const data = await fetch('data/shortcuts.json').then((r) => r.json());
const UNITS = data.units;
const ALL_ITEMS = UNITS.flatMap((u) => u.items.map((it) => ({ ...it, unit: u.id })));
const params = new URLSearchParams(location.search);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MODS = ['Ctrl', 'Shift', 'Alt', 'Win'];
const kbd = (keys) => keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">＋</span>');

// ---------- 按鍵比對 ----------
/** 螢幕鍵盤每個鍵：顯示名稱 → KeyboardEvent.code */
const ROWS = [
  ['Esc', 'F2', 'F4', 'F5', 'F11', 'F12'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '+', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '.'],
  ['Ctrl', 'Win', 'Alt', 'Space', '←', '→', 'Home', 'End', 'Delete'],
];
const CODE_OF = { Esc: 'Escape', '-': 'Minus', '+': 'Equal', '.': 'Period', '←': 'ArrowLeft', '→': 'ArrowRight', Space: 'Space', Tab: 'Tab',
  Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End' };
const codeOf = (k) => CODE_OF[k] ?? (/^F\d+$/.test(k) ? k : /^\d$/.test(k) ? `Digit${k}` : `Key${k}`);

/** 一個組合鍵的標準寫法：修飾鍵（固定次序）＋主鍵 code */
function comboKey(mods, code) { return [...MODS.filter((m) => mods.has(m)), code].join('+'); }
const itemCombo = (it) => comboKey(new Set(it.keys.filter((k) => MODS.includes(k))), it.code);
function eventCombo(e) {
  const mods = new Set();
  if (e.ctrlKey) mods.add('Ctrl'); if (e.shiftKey) mods.add('Shift'); if (e.altKey) mods.add('Alt'); if (e.metaKey) mods.add('Win');
  return comboKey(mods, e.code);
}
const isModifierCode = (c) => /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/.test(c);

// ---------- 單元列表 ----------
function renderUnits() {
  $('back-units').hidden = true;
  const res = getShortcutResults();
  const star = (r) => (r ? `<span class="sc-stars" aria-label="${r.stars} 粒星">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span><small>最佳 ${r.score}/${r.total}</small>` : '<small>未做小測</small>');
  app.innerHTML = `<h1 style="margin:0">電腦快捷鍵</h1>
    <p class="muted">Windows 11 最常用的快捷鍵。每個單元：先看「學習」，再「練習」（可以真的按），最後做「小測」。</p>
    <div class="sc-units">${UNITS.map((u, i) => `<a class="sc-unit card" href="?unit=${u.id}">
      <span class="num">${i + 1}</span><span class="t"><b>${esc(u.title)}</b><span>${esc(u.subtitle)}・${u.items.length} 個</span></span>
      <span class="r">${star(res[u.id])}</span></a>`).join('')}
      <a class="sc-unit card" href="?unit=all"><span class="num">總</span><span class="t"><b>總測驗</b><span>全部單元隨機抽 20 題</span></span><span class="r">${star(res.all)}</span></a>
    </div>
    <p class="hint">有些快捷鍵（例如 Win＋D、Alt＋Tab、Ctrl＋W）會被 Windows 或瀏覽器先處理，網頁收不到，所以要在螢幕鍵盤上點選；平時在電腦上就可以真的用。</p>`;
}

// ---------- 單元頁 ----------
let cleanup = null;
function renderUnit(unitId, tab = 'learn') {
  cleanup?.(); cleanup = null;
  $('back-units').hidden = false;
  const all = unitId === 'all';
  const unit = all ? { id: 'all', title: '總測驗', subtitle: '全部單元', items: ALL_ITEMS } : UNITS.find((u) => u.id === unitId);
  if (!unit) return renderUnits();
  if (all) tab = 'quiz';
  const tabs = all ? '' : `<div class="sc-tabs">${[['learn', '1 學習'], ['practice', '2 練習'], ['quiz', '3 小測']].map(([t, l]) => `<button class="btn ${t === tab ? 'primary' : ''}" data-tab="${t}" type="button">${l}</button>`).join('')}</div>`;
  app.innerHTML = `<h1 style="margin:0">${esc(unit.title)}</h1><p class="muted">${esc(unit.subtitle)}</p>${tabs}<section class="card sc-body" id="body"></section>`;
  app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => renderUnit(unitId, b.dataset.tab));
  if (tab === 'learn') learn(unit);
  else run(unit, tab === 'quiz', all);
}

function learn(unit) {
  $('body').innerHTML = `<div class="sc-cards">${unit.items.map((it) => `<div class="sc-card">
      <div class="sc-keys">${kbd(it.keys)}</div><b>${esc(it.action)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}
      ${it.real ? '' : '<small class="sc-tag">網頁收不到：練習時用螢幕鍵盤</small>'}</div>`).join('')}</div>
    <div class="form-actions"><button class="btn primary" id="go" type="button">開始練習</button></div>`;
  $('go').onclick = () => renderUnit(unit.id, 'practice');
}

// ---------- 練習／小測 ----------
function run(unit, quiz, all) {
  // 練習：每個一次，錯了的放回後面再做；小測：隨機抽題（單元最多 12 題、總測驗 20 題），約三成是「這組鍵做甚麼」選擇題
  const pool = shuffle(unit.items);
  const n = quiz ? Math.min(all ? 20 : 12, pool.length) : pool.length;
  const queue = pool.slice(0, n).map((it, i) => ({ it, kind: quiz && i % 3 === 2 ? 'choose' : 'do', tries: 0 }));
  let pos = 0, score = 0, firstTry = 0, wrongTotal = 0, picked = new Set(), locked = false;
  const total = queue.length;

  function render() {
    const q = queue[pos];
    if (!q) return finish();
    picked = new Set(); locked = false;
    const { it } = q;
    const head = `<div class="sc-count">${quiz ? '小測' : '練習'}　第 ${Math.min(pos + 1, queue.length)} / ${queue.length} 題${quiz ? '' : `　一次答對 ${firstTry}`}</div>`;
    if (q.kind === 'choose') {
      const opts = shuffle([it, ...shuffle(ALL_ITEMS.filter((x) => x.id !== it.id && x.action !== it.action)).slice(0, 3)]);
      $('body').innerHTML = `${head}<div class="sc-q"><div class="sc-keys big">${kbd(it.keys)}</div><p>這組快捷鍵做甚麼？</p></div>
        <div class="sc-opts">${opts.map((o, i) => `<button class="btn sc-opt" data-id="${o.id}" type="button"><i>${i + 1}</i>${esc(o.action)}</button>`).join('')}</div><p class="sc-msg" id="msg"></p>`;
      $('body').querySelectorAll('.sc-opt').forEach((b) => b.onclick = () => answer(b.dataset.id === it.id, b));
      return;
    }
    $('body').innerHTML = `${head}<div class="sc-q"><p class="sc-action">${esc(it.action)}</p>
      <p class="muted">${it.real ? '在鍵盤上按這組快捷鍵（也可以在下面點選再按「確定」）。' : '這組快捷鍵網頁收不到：在下面的螢幕鍵盤點選，再按「確定」。'}</p></div>
      <div class="sc-picked" id="picked" aria-live="polite"><span class="muted">還未選鍵</span></div>
      ${vkeyboard()}
      <div class="form-actions"><button class="btn primary" id="ok" type="button">確定</button><button class="btn ghost" id="clr" type="button">清除</button></div>
      <p class="sc-msg" id="msg"></p>`;
    $('body').querySelectorAll('.vk').forEach((b) => b.onclick = () => {
      if (locked) return;
      const k = b.dataset.k;
      if (picked.has(k)) picked.delete(k); else picked.add(k);
      b.classList.toggle('on', picked.has(k));
      showPicked();
    });
    $('ok').onclick = () => {
      if (locked || !picked.size) return;
      const mods = new Set([...picked].filter((k) => MODS.includes(k)));
      const mains = [...picked].filter((k) => !MODS.includes(k));
      answer(mains.length === 1 && comboKey(mods, codeOf(mains[0])) === itemCombo(it));
    };
    $('clr').onclick = () => { picked.clear(); $('body').querySelectorAll('.vk.on').forEach((b) => b.classList.remove('on')); showPicked(); };
  }

  function showPicked() {
    const keys = [...MODS.filter((m) => picked.has(m)), ...[...picked].filter((k) => !MODS.includes(k))];
    $('picked').innerHTML = keys.length ? kbd(keys) : '<span class="muted">還未選鍵</span>';
  }

  function answer(right, btn) {
    if (locked) return;
    const q = queue[pos];
    const { it } = q;
    q.tries += 1;
    if (right) {
      locked = true;
      if (q.tries === 1) { firstTry += 1; if (quiz) score += 1; }
      btn?.classList.add('ok');
      $('msg').className = 'sc-msg ok';
      $('msg').innerHTML = `✔ 答對！${kbd(it.keys)}　${esc(it.action)}${it.note ? `<br><small>${esc(it.note)}</small>` : ''}<br><small>按 Enter 或「下一題」繼續</small>`;
      $('msg').insertAdjacentHTML('beforeend', ' <button class="btn" id="next" type="button">下一題</button>');
      $('next').onclick = next;
      return;
    }
    wrongTotal += 1;
    btn?.classList.add('bad');
    $('msg').className = 'sc-msg bad';
    if (quiz) {
      // 小測：答錯就記錯，顯示答案，到下一題
      locked = true;
      $('msg').innerHTML = `✘ 不對。答案：${kbd(it.keys)}　${esc(it.action)}　<button class="btn" id="next" type="button">下一題</button>`;
      $('next').onclick = next;
      return;
    }
    // 練習：第一次錯給提示，第二次顯示答案；這一題放到最後再做一次
    $('msg').innerHTML = q.tries === 1 ? `不對，再試一次。提示：${it.keys.length > 1 ? `要按 ${it.keys.length} 個鍵，第一個是 <kbd>${esc(it.keys[0])}</kbd>` : '只按一個鍵'}`
      : `答案是 ${kbd(it.keys)}，照着做一次。`;
    if (q.tries === 2 && !queue.slice(pos + 1).some((x) => x.it.id === it.id)) queue.push({ it, kind: 'do', tries: 1 });
  }

  function next() { pos += 1; render(); }

  function finish() {
    if (quiz) {
      const { stars } = saveShortcutResult(unit.id, { score, total });
      $('body').innerHTML = `<div class="sc-done"><h2>小測完成</h2><p class="sc-score">${score} / ${total}</p>
        <p class="sc-stars big" aria-label="${stars} 粒星">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="muted">95% 三粒星、80% 兩粒星、60% 一粒星。成績會記錄，可以再做提高。</p>
        <div class="form-actions"><button class="btn primary" id="again" type="button">再做一次</button><a class="btn" href="shortcuts.html">全部單元</a></div></div>`;
    } else {
      $('body').innerHTML = `<div class="sc-done"><h2>練習完成</h2><p>一次答對 ${firstTry} / ${total} 個${wrongTotal ? `，答錯 ${wrongTotal} 次` : ''}。</p>
        <div class="form-actions"><button class="btn primary" id="toquiz" type="button">去做小測</button><button class="btn" id="again" type="button">再練一次</button></div></div>`;
      $('toquiz').onclick = () => renderUnit(unit.id, 'quiz');
    }
    $('again').onclick = () => run(unit, quiz, all);
  }

  // 真實按鍵：只在「做」的題目、未答對時處理；一律 preventDefault，免得 Ctrl＋S、Ctrl＋P 等觸發瀏覽器功能
  const onKey = (e) => {
    const q = queue[pos];
    if (!q) return;
    if (locked) { if (e.key === 'Enter') { e.preventDefault(); next(); } return; }
    if (q.kind === 'choose') { if (/^[1-4]$/.test(e.key)) { e.preventDefault(); $('body').querySelectorAll('.sc-opt')[Number(e.key) - 1]?.click(); } return; }
    if (isModifierCode(e.code) || e.repeat) return;
    if (!q.it.real && !e.ctrlKey && !e.altKey && !e.metaKey) return;   // 系統快捷鍵：普通打字不算答
    e.preventDefault();
    if (!q.it.real) {
      $('msg').className = 'sc-msg';
      $('msg').textContent = '這一題網頁收不到真實按鍵，請在螢幕鍵盤點選。';
      return;
    }
    answer(eventCombo(e) === itemCombo(q.it));
  };
  window.addEventListener('keydown', onKey);
  cleanup = () => window.removeEventListener('keydown', onKey);
  render();
}

function vkeyboard() {
  return `<div class="vkb" role="group" aria-label="螢幕鍵盤">${ROWS.map((r) => `<div class="vkr">${r.map((k) => `<button type="button" class="vk${MODS.includes(k) ? ' mod' : ''}${k.length > 2 ? ' wide' : ''}${k === 'Space' ? ' space' : ''}" data-k="${k}">${k === 'Win' ? '⊞ Win' : esc(k)}</button>`).join('')}</div>`).join('')}</div>`;
}

const u = params.get('unit');
if (u) renderUnit(u); else renderUnits();
