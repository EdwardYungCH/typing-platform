import { applyWorld } from './world.js';
import { getTestResult, getSetting } from './storage.js';
import { fmt, fmtAcc } from './stats.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') === 'zh' ? 'zh' : 'en';
const tests = (await fetch('data/tests.json').then((r) => r.json())).tests;

function render() {
  applyWorld(lang === 'zh' ? 'magic' : 'planet');
  $('tabs').innerHTML = ['en', 'zh'].map((l) => `<button type="button" class="btn ${l === lang ? 'primary' : ''}" data-lang="${l}">${l === 'en' ? '英文打字' : '中文速成'}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { lang = b.dataset.lang; history.replaceState(null, '', `?lang=${lang}`); render(); });
  const unit = lang === 'zh' ? '字/分' : 'WPM';
  const placement = getSetting(`placement:${lang}`, null);
  $('list').innerHTML = `<ul class="map">${tests.filter((t) => t.lang === lang).map((t) => {
    const r = getTestResult(t.id);
    let right;
    if (r && t.kind === 'placement') right = `<span class="badge">已分級：由第 ${placement ?? 0} 課開始</span>`;
    else if (r) right = `<span class="s" title="已完成">${r.stars ? '★'.repeat(r.stars) : '—'} <small class="muted">${fmt(r.wpm)} ${unit}・${fmtAcc(r.accuracy)}%</small></span>`;
    else right = `<span class="badge">${Math.round(t.timeLimit / 60)} 分鐘</span>`;
    return `<li><a class="node${r ? ' done' : ''}" href="type.html?lang=${lang}&mode=test&id=${t.id}">
      <span class="num">${r ? '✓' : t.kind === 'placement' ? '級' : '測'}</span>
      <span class="t"><b>${t.title}</b><span>${t.subtitle}${r ? '　已完成，只可做一次' : ''}</span></span>${right}</a></li>`;
  }).join('')}</ul>`;
}
render();
