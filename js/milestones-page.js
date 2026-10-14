// 里程碑：用掌握度紀錄算出幾個大目標的進度，並列出未掌握的項目。

import { applyWorld } from './world.js';
import { ROOTS, loadZh, chartGlyphs } from './zh-codes.js';
import { getProgress } from './storage.js';
import * as mastery from './mastery.js';
import { dailyProgress } from './daily.js';
import { start as syncStart } from './sync.js';
await syncStart();

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let lang = params.get('lang') === 'zh' ? 'zh' : 'en';

const enLessons = (await fetch('data/en-lessons.json').then((r) => r.json())).lessons;
let zh = null, chartInfo = {};

const html = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar(label, sub, done, total, extra = '') {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<article class="card ms-item${done >= total && total ? ' done' : ''}">
    <div class="ms-head"><b>${label}</b><span class="ms-num">${done}／${total}</span></div>
    <div class="ms-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    <p class="muted ms-sub">${sub}</p>${extra}</article>`;
}

function zhMilestones() {
  const m = mastery.all('zh');
  const rootIds = Object.keys(ROOTS).map((k) => `r:${k}`);
  const shapeIds = Object.keys(chartInfo).map((x) => `s:${x}`);
  const roots = mastery.stats('zh', 'r:', rootIds);
  const shapes = mastery.stats('zh', 's:', shapeIds);
  const top300 = zh.common.slice(0, 300);
  const top500 = zh.common.slice(0, 500);
  const splitOk = top300.filter((ch) => (m[`c:${ch}`]?.ok ?? 0) > 0).length;
  const typed = mastery.stats('zh', 'c:', top500.map((ch) => `c:${ch}`));
  const prog = getProgress('zh');
  const lessonsDone = Object.values(prog).filter((p) => p.done).length;

  const weakRoots = rootIds.filter((id) => m[id] && m[id].box < mastery.MASTER_BOX).map((id) => id.slice(2));
  const weakShapes = shapeIds.filter((id) => m[id] && m[id].box < mastery.MASTER_BOX).map((id) => id.slice(2));
  const weakChars = top500.filter((ch) => m[`c:${ch}`] && m[`c:${ch}`].box < mastery.MASTER_BOX);

  $('list').innerHTML = [
    bar('完成 16 課', '第 0 至 15 課全部過關', lessonsDone, 16),
    bar('認齊 24 個字根＋難字鍵', '看字根立刻按對鍵（24 個字根加難字鍵 X）', roots.mastered, rootIds.length,
      weakRoots.length ? `<p class="ms-weak">未穩的：${weakRoots.map((k) => `<span class="chip">${ROOTS[k]} <small>${k.toUpperCase()}</small></span>`).join('')}</p>` : ''),
    bar('認齊輔助字形', `課堂教過的 ${shapeIds.length} 個字形，看到就知道屬於哪個鍵`, shapes.mastered, shapeIds.length,
      weakShapes.length ? `<p class="ms-weak">未穩的：${weakShapes.slice(0, 40).map((x) => `<span class="chip chip-img">${chartGlyphs(x[0], 1).replace(`${x[0]}-0.png`, `${x}.png`)}<small>${x[0].toUpperCase()}</small></span>`).join('')}${weakShapes.length > 40 ? ` …共 ${weakShapes.length} 個` : ''}</p>` : ''),
    bar('拆對 300 個常用字', '最常用 300 字每個都至少拆對過一次', splitOk, 300),
    bar('打熟 500 個常用字', '最常用 500 字都到「掌握」程度（隔幾日再打仍然對）', typed.mastered, 500,
      weakChars.length ? `<p class="ms-weak">未穩的：${weakChars.slice(0, 60).map((ch) => `<span class="chip">${ch}</span>`).join('')}${weakChars.length > 60 ? ` …共 ${weakChars.length} 個` : ''}</p>` : ''),
  ].join('');
  $('detail').innerHTML = `<h2>怎樣算「掌握」？</h2><p class="muted">每個字根、字形、字都有一個盒子（0 至 5）。答對一次升一盒，下次要隔更久才再出現（即日、1 日、3 日、7 日、14 日、30 日）；答錯跌兩盒，很快再出現。盒子到 3 或以上算掌握。每日任務就是按這個到期日安排重溫。</p>
    <p class="muted">夥伴的成長看的是過關課數和速度；里程碑看的是記得多少字根和字。兩邊都齊，才是真正學會速成。</p>`;
}

function enMilestones() {
  const m = mastery.all('en');
  const keys = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const keyIds = keys.map((k) => `k:${k}`);
  const st = mastery.stats('en', 'k:', keyIds);
  const prog = getProgress('en');
  const list = Object.values(prog);
  const lessonsDone = list.filter((p) => p.done).length;
  const bestWpm = Math.max(0, ...list.map((p) => p.bestWpm ?? 0));
  const bestAcc = Math.max(0, ...list.map((p) => p.bestAccuracy ?? 0));
  const weak = keyIds.filter((id) => m[id] && m[id].box < mastery.MASTER_BOX).map((id) => id.slice(2));
  $('list').innerHTML = [
    bar(`完成 ${enLessons.length} 課`, '第 0 課到最後一課全部過關', lessonsDone, enLessons.length),
    bar('掌握 26 個鍵', '每個字母不用看鍵盤也按得對', st.mastered, 26,
      weak.length ? `<p class="ms-weak">未穩的：${weak.map((k) => `<span class="chip">${k.toUpperCase()}</span>`).join('')}</p>` : ''),
    bar('速度 20 WPM', `目前最佳 ${Math.round(bestWpm)} WPM`, Math.min(20, Math.round(bestWpm)), 20),
    bar('速度 30 WPM', '夥伴成年的門檻', Math.min(30, Math.round(bestWpm)), 30),
    bar('準確率 95%', `目前最佳 ${Math.floor(bestAcc)}%`, Math.min(95, Math.floor(bestAcc)), 95),
  ].join('');
  $('detail').innerHTML = `<h2>怎樣算「掌握」？</h2><p class="muted">每個鍵有一個盒子（0 至 5）。一輪練習裏全對就升一盒，下次隔更久才重溫；有錯就跌兩盒。盒子到 3 或以上算掌握。</p>`;
}

async function render() {
  applyWorld(lang === 'zh' ? 'magic' : 'planet');
  document.title = `里程碑｜${lang === 'zh' ? '中文速成' : '英文打字'}`;
  $('tabs').innerHTML = ['en', 'zh'].map((l) => `<button type="button" class="btn ${l === lang ? 'primary' : ''}" data-lang="${l}">${l === 'en' ? '英文打字' : '中文速成'}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; history.replaceState(null, '', `?lang=${lang}`); render(); }));
  const dp = dailyProgress(lang);
  const due = mastery.due(lang).length;
  $('daily').innerHTML = `<div class="ms-head"><b>每日任務</b><span class="ms-num">${dp.finishedToday ? '今日已完成 ✓' : `今日 ${dp.done.length}／3`}</span></div>
    <p class="muted ms-sub">連續 ${dp.streak} 天。今日有 ${due} 個項目到期要重溫。</p>
    <a class="btn primary" href="type.html?lang=${lang}&mode=daily">${dp.finishedToday ? '再做一次' : '開始今日任務'}</a>`;
  if (lang === 'zh') {
    if (!zh) {
      zh = await loadZh();
      chartInfo = (await fetch('data/zh-shapes.json').then((r) => r.json())).chartInfo ?? {};
    }
    zhMilestones();
  } else enMilestones();
}

render();
