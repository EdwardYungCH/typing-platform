import { applyWorld } from './world.js';
import { getTestResult, getSetting } from './storage.js';
import { fmt, fmtAcc } from './stats.js';
import { start as syncStart } from './sync.js';
import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') === 'zh' ? 'zh' : 'en';
const tests = (await fetch('data/tests.json').then((r) => r.json())).tests;
const me = await syncStart();
let serverResults = null;
if (me) { try { serverResults = (await api('/api/test/results')).results; } catch { /* 離線時用本機紀錄 */ } }
const resultOf = (id) => (serverResults ? serverResults[id] ?? null : getTestResult(id));

function render() {
  applyWorld(lang === 'zh' ? 'magic' : 'planet');
  $('tabs').innerHTML = ['en', 'zh'].map((l) => `<button type="button" class="btn ${l === lang ? 'primary' : ''}" data-lang="${l}">${l === 'en' ? '英文打字' : '中文速成'}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { lang = b.dataset.lang; history.replaceState(null, '', `?lang=${lang}`); if (me) document.getElementById('note').textContent = `已登入 ${me.name}：評測成績由伺服器核實和保存，每個評測只可做一次；要重做請找老師。`;
render(); });
  const unit = lang === 'zh' ? '字/分' : 'WPM';
  const placement = getSetting(`placement:${lang}`, null);
  $('list').innerHTML = `<ul class="map">${tests.filter((t) => t.lang === lang).map((t) => {
    const r = resultOf(t.id);
    let right;
    if (r && t.kind === 'placement') right = `<span class="badge">已分級：由第 ${placement ?? 0} 課開始</span>`;
    else if (r) right = `<span class="s" title="已完成">${r.stars ? '★'.repeat(r.stars) : '—'} <small class="muted">${fmt(r.wpm)} ${unit}・${fmtAcc(r.accuracy)}%</small></span>`;
    else right = `<span class="badge">${Math.round(t.timeLimit / 60)} 分鐘</span>`;
    return `<li><a class="node${r ? ' done' : ''}" href="type.html?lang=${lang}&mode=test&id=${t.id}">
      <span class="num">${r ? '✓' : t.kind === 'placement' ? '級' : '測'}</span>
      <span class="t"><b>${t.title}</b><span>${t.subtitle}${r ? '　已完成，只可做一次' : ''}</span></span>${right}</a></li>`;
  }).join('')}</ul>`;
}
if (me) document.getElementById('note').textContent = `已登入 ${me.name}：評測成績由伺服器核實和保存，每個評測只可做一次；要重做請找老師。`;
render();
