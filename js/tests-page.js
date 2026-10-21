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
// 上次交卷失敗、暫存在這部電腦的作答：先補交
if (me) {
  try {
    const pend = JSON.parse(localStorage.getItem('typing-platform:pendingTest') ?? 'null');
    if (pend && Date.now() - pend.at < 60 * 60000) {
      try { await api('/api/test/submit', { method: 'POST', body: pend.payload }); alert('上次未能交卷的評測已經補交。'); } catch (e) { if (e.status && e.status !== 0) localStorage.removeItem('typing-platform:pendingTest'); }
      if (localStorage.getItem('typing-platform:pendingTest')) { try { await api('/api/test/results'); } catch { /* still offline */ } }
    } else if (pend) localStorage.removeItem('typing-platform:pendingTest');
    if (pend && Date.now() - pend.at < 60 * 60000) { try { const r = await api('/api/test/results'); if (r.results[pend.testId]) localStorage.removeItem('typing-platform:pendingTest'); } catch { /* ignore */ } }
  } catch { /* ignore */ }
}
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
    return `<li><a class="node${r ? ' done' : ''}" href="type.html?lang=${lang}&mode=test&id=${t.id}" data-confirm="${r || t.kind === 'placement' ? '' : '1'}" data-title="${t.title}" data-min="${Math.round(t.timeLimit / 60)}">
      <span class="num">${r ? '✓' : t.kind === 'placement' ? '級' : '測'}</span>
      <span class="t"><b>${t.title}</b><span>${t.subtitle}${r ? '　已完成，只可做一次' : ''}</span></span>${right}</a></li>`;
  }).join('')}</ul>`;
  $('list').querySelectorAll('a[data-confirm="1"]').forEach((a) => a.onclick = (e) => {
    if (!confirm(`「${a.dataset.title}」只可以做一次，${a.dataset.min} 分鐘內不能暫停。\n\n請確認：已切換到英文輸入、雙手放好、周圍安靜。現在開始？`)) e.preventDefault();
  });
}
if (me) document.getElementById('note').textContent = `已登入 ${me.name}：評測成績由伺服器核實和保存，每個評測只可做一次；要重做請找老師。`;
render();
