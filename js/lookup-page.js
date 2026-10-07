import { applyWorld } from './world.js';
import { loadZh, ROOTS, ROOT_GROUPS, candidateIndex } from './zh-codes.js';

applyWorld('magic');
const $ = (id) => document.getElementById(id);
const zh = await loadZh('../');
$('source').textContent = `碼表來源：${zh.source}`;

const cap = (k, cls = '') => `<span class="cap ${cls}"><b>${ROOTS[k] ?? '?'}</b><small>${k}</small></span>`;
const isHan = (ch) => /\p{Script=Han}/u.test(ch);

function card(ch) {
  const q = zh.quickOf(ch);
  if (!q) return `<div class="card lk-miss"><b style="font-size:24px">${ch}</b>　速成碼表找不到這個字，可能是罕見字或異體字。</div>`;
  const cj = zh.cjOf(ch);
  const list = zh.candidates(q);
  const idx = candidateIndex(zh, ch);
  const page = Math.ceil(idx / 9);
  const num = ((idx - 1) % 9) + 1;
  let pickText;
  if (list.length === 1) pickText = '這組碼只有這個字，按<b>空白鍵</b>即可。';
  else if (idx === 1) pickText = `排<b>第 1 位</b>，按<b>空白鍵</b>或 <b>1</b> 即可。`;
  else if (page === 1) pickText = `排<b>第 ${idx} 位</b>，打完碼按數字 <b>${num}</b> 揀字。`;
  else pickText = `排<b>第 ${idx} 位</b>：要翻到第 ${page} 頁，再按 <b>${num}</b>（常用字很少要翻頁）。`;

  // 拆字圖解：倉頡全碼中，首碼和尾碼亮起，中間的碼變淡（速成不用打）
  let split = '';
  if (cj) {
    const parts = [...cj].map((k, i) => cap(k, i === 0 || i === cj.length - 1 ? 'key' : 'dim'));
    split = `<div class="lk-row"><h3>倉頡全碼（亮起的是速成要打的）</h3><div class="caps">${parts.join('')}</div></div>`;
  }
  const same = list.slice(0, 18).map((c, i) => `<span class="${c === ch ? 'me' : ''}">${c}<i>${i + 1}</i></span>`).join('');
  return `
    <article class="card lk-card">
      <div class="lk-char" lang="zh-Hant-HK">${ch}</div>
      <div class="lk-body">
        <div class="lk-row"><h3>速成碼</h3><div class="caps">${[...q].map((k) => cap(k, 'key')).join('<span class="arrow">＋</span>')}</div></div>
        ${split}
        <div class="lk-row"><h3>選字</h3><p class="pick" style="margin:0">${pickText}</p></div>
        <div class="lk-row"><h3>同碼字（前 18 個）</h3><div class="same">${same}</div></div>
      </div>
    </article>`;
}

function search(text) {
  const chars = [...new Set([...text].filter(isHan))].slice(0, 20);
  $('results').innerHTML = chars.length ? chars.map(card).join('') : '<p class="muted">請輸入中文字。</p>';
  const url = new URL(location.href);
  if (chars.length) url.searchParams.set('q', chars.join('')); else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); search($('q').value); });

$('roots').innerHTML = ROOT_GROUPS.map((g) => `
  <div class="root-group"><h3>${g.name}</h3><div class="caps">${[...g.keys].map((k) => cap(k)).join('')}</div></div>`).join('');

const init = new URLSearchParams(location.search).get('q');
if (init) { $('q').value = init; search(init); }
else { $('q').value = '明想學校'; search('明想學校'); }
