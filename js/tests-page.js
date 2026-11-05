import { applyWorld } from './world.js';
import { getTestResult, getSetting, saveTestResult } from './storage.js';
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
      try {
        const r = await api('/api/test/submit', { method: 'POST', body: pend.payload });
        if (r?.result) saveTestResult(pend.testId, { wpm: r.result.wpm, accuracy: r.result.accuracy, seconds: r.result.seconds, stars: r.result.stars ?? 0, verified: true });
        localStorage.removeItem('typing-platform:pendingTest');
        alert('上次未能交卷的評測已經補交。');
      } catch (e) { if (e.status && e.status !== 0) localStorage.removeItem('typing-platform:pendingTest'); }
      if (localStorage.getItem('typing-platform:pendingTest')) { try { await api('/api/test/results'); } catch { /* still offline */ } }
    } else if (pend) localStorage.removeItem('typing-platform:pendingTest');
    if (pend && Date.now() - pend.at < 60 * 60000) { try { const r = await api('/api/test/results'); if (r.results[pend.testId]) localStorage.removeItem('typing-platform:pendingTest'); } catch { /* ignore */ } }
  } catch { /* ignore */ }
}
let serverResults = null, needWindow = false, windows = {};
if (me) { try { const r = await api('/api/test/results'); serverResults = r.results; needWindow = !!r.needWindow; windows = r.windows ?? {}; } catch { /* 離線時用本機紀錄 */ } }
const hm = (iso) => new Date(iso).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const resultOf = (id) => (serverResults ? serverResults[id] ?? null : getTestResult(id));

function render() {
  applyWorld(lang === 'zh' ? 'magic' : 'planet');
  $('tabs').setAttribute('role', 'tablist');
  $('tabs').innerHTML = ['en', 'zh'].map((l) => `<button type="button" role="tab" aria-selected="${l === lang}" data-lang="${l}">${l === 'en' ? '英文打字' : '中文速成'}</button>`).join('');
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
    // 學校要求老師開放評測：未開放的只顯示，不可按
    const w = windows[t.id];
    const locked = !r && me && needWindow && !w?.open;
    const when = !r && w ? (w.open ? `　開放至 ${hm(w.closes)}` : `　${hm(w.opens)} 開放`) : '';
    const level = { 'en-placement': '分級', 'zh-placement': '分級', 'en-s1': '中一', 'en-s2': '中二', 'en-s3': '中三', 'zh-s1': '中一', 'zh-s2': '中二', 'zh-s3': '中三' }[t.id] ?? '測';
    const inner = `<span class="num">${r ? '✓' : level}</span>
      <span class="t"><b>${t.title}</b><span>${t.subtitle}${r ? '　已完成，只可做一次' : locked ? '　老師未開放' : ''}${when}</span></span>${locked ? '<span class="badge">未開放</span>' : right}`;
    if (locked) return `<li><div class="node locked" aria-disabled="true">${inner}</div></li>`;
    return `<li><a class="node${r ? ' done' : ''}" href="type.html?lang=${lang}&mode=test&id=${t.id}" data-confirm="${r || t.kind === 'placement' ? '' : '1'}" data-title="${t.title}" data-min="${Math.round(t.timeLimit / 60)}">${inner}</a></li>`;
  }).join('')}</ul>`;
  $('list').querySelectorAll('a[data-confirm="1"]').forEach((a) => a.onclick = (e) => {
    if (!confirm(`「${a.dataset.title}」只可以做一次，${a.dataset.min} 分鐘內不能暫停。\n\n請確認：已切換到英文輸入、Caps Lock 已關、雙手放好、周圍安靜。現在開始？`)) e.preventDefault();
  });
}
if (me) document.getElementById('note').textContent = `已登入 ${me.name}：評測成績由伺服器核實和保存，每個評測只可做一次；要重做請找老師。`;
render();
