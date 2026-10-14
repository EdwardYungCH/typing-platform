import { applyWorld } from './world.js';
import { ROOTS, ROOT_GROUPS } from './zh-codes.js';
import { getWeak } from './storage.js';
import { start as syncStart } from './sync.js';
await syncStart();

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') === 'zh' ? 'zh' : 'en';
const enLessons = (await fetch('data/en-lessons.json').then((r) => r.json())).lessons;

const ZH_KINDS = [
  ['split', '拆字', '看字，打首碼和尾碼'],
  ['quick', '打字', '打碼後按數字揀字'],
  ['roots', '字根', '看字根按鍵'],
  ['chart', '輔助字形', '看字形按它所屬的鍵'],
  ['weak', '弱項加強', '只出你常錯的字和鍵'],
  ['ime', '真實輸入法', '用系統的微軟速成打字'],
];
const EN_KINDS = [
  ['words', '詞語', '只用學過的鍵'],
  ['keys', '單鍵組合', '隨機字母組'],
  ['sentences', '句子', '整句打出來'],
  ['weak', '弱項加強', '只出你常錯的鍵'],
];
const ZH_RANGES = [
  ['abcdefg', '第 1 課：日月金木水火土'],
  ['abcdefghijk', '第 1–2 課：＋竹戈十大'],
  ['abcdefghijklmn', '第 1–3 課：＋中一弓'],
  ['abcdefghijklmnopqr', '第 1–4 課：＋人心手口'],
  ['abcdefghijklmnopqrstu', '第 1–5 課：＋尸廿山'],
  ['abcdefghijklmnopqrstuvwy', '第 1–6 課：＋女田卜'],
  ['abcdefghijklmnopqrstuvwyx', '全部字根'],
];

function opt(name, value, label, sub, checked) {
  return `<label class="pr-opt"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
}

function render() {
  applyWorld(lang === 'zh' ? 'magic' : 'planet');
  $('tabs').innerHTML = ['en', 'zh'].map((l) => `<button type="button" class="btn ${l === lang ? 'primary' : ''}" data-lang="${l}">${l === 'en' ? '英文打字' : '中文速成'}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { lang = b.dataset.lang; history.replaceState(null, '', `?lang=${lang}`); render(); });
  const kinds = lang === 'zh' ? ZH_KINDS : EN_KINDS;
  $('kinds').innerHTML = kinds.map(([v, l, s], i) => opt('kind', v, l, s, i === 0)).join('');
  if (lang === 'zh') {
    $('range').innerHTML = ZH_RANGES.map(([v, l], i) => opt('keys', v, l, '', i === ZH_RANGES.length - 1)).join('');
  } else {
    const ranges = [];
    let acc = '';
    for (const l of enLessons) {
      const ks = (l.newKeys ?? []).map((k) => /^Key([A-Z])$/.exec(k)?.[1]?.toLowerCase()).filter(Boolean);
      if (!ks.length) continue;
      acc += ks.join('');
      ranges.push([acc, `第 1–${l.id} 課`, l.subtitle ?? '']);
    }
    $('range').innerHTML = ranges.map(([v, l, s], i) => opt('chars', v, l, s, i === ranges.length - 1)).join('');
  }
  $('form').onchange = () => { const k = $('form').kind.value; $('sec-range').hidden = ['weak', 'ime', 'sentences'].includes(k); };
  $('form').onchange();
  renderWeak();
}

function renderWeak() {
  const weak = getWeak(lang).slice(0, 12);
  const name = (k) => (lang === 'zh' && ROOTS[k] ? `${ROOTS[k]} ${k.toUpperCase()}` : k.length === 1 && /[a-z;,./]/.test(k) ? k.toUpperCase() : k);
  $('weak').innerHTML = `<h2>你的弱項</h2>` + (weak.length
    ? `<p class="muted">按錯誤率排序，做課堂和練習時會自動更新。</p><div class="weak-list">${weak.map((w) => `<span>${name(w.key)}<small>${w.errors}/${w.tries}</small></span>`).join('')}</div>`
    : `<p class="muted">還未有紀錄。先做幾課，這裏就會顯示你常錯的鍵和字。</p>`);
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  const f = $('form');
  const q = new URLSearchParams({ lang, mode: 'practice', kind: f.kind.value, count: $('count').value, time: $('time').value });
  if (lang === 'zh' && f.keys) q.set('keys', f.keys.value);
  if (lang === 'en' && f.chars) q.set('chars', f.chars.value);
  location.href = `type.html?${q}`;
};

render();
