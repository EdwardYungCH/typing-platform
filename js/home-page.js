// 首頁：一個焦點（下一課）＋課程目錄＋其他入口。英文／中文用上方分頁切換，會記住上次看的。
import { getProgress, getSetting, setSetting, getStepResults } from './storage.js';
import { dailyProgress } from './daily.js';
import { start as syncStart } from './sync.js';
import { api } from './api.js';
import { loadShop, balance, titleName } from './wallet.js';
import { streakInfo, awardStreak } from './streak.js';
import { applyWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WORLDS = {
  planet: { lang: 'en', name: '英文打字', sub: '鍵帽星系', desc: '由基準鍵到整段文字，16 課' },
  magic: { lang: 'zh', name: '中文速成', sub: '字根魔法學院', desc: '字根、拆字、選字、常用字，16 課' },
};

const me = await syncStart();
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(min-width: 900px)').matches) {
  $('world-tabs').insertAdjacentHTML('beforebegin', '<p class="notice">你正在用手機或平板。打字課要有實體鍵盤，請用電腦練習；手機可以看進度、里程碑、快捷鍵學習卡和查碼。</p>');
}
if (me) {
  const a = $('acct');
  a.href = 'me.html'; a.textContent = `${me.name}（${me.className ?? me.sid}）`;
  $('note').textContent = `已登入 ${me.name}：紀錄會自動同步到伺服器。共用電腦練完記得在「我的帳戶」登出。`;
}
let homework = [];
if (me) { try { homework = (await api('/api/assignments')).assignments ?? []; } catch { /* 離線 */ } }
const shop = await loadShop();
awardStreak();
$('wallet').textContent = `★ ${balance()}`;
const [en, zhL] = await Promise.all(['en', 'zh'].map((l) => fetch(`data/${l}-lessons.json`).then((r) => r.json())));
const lessonsOf = { en: en.lessons, zh: zhL.lessons };

const param = new URLSearchParams(location.search).get('world');
let world = param && WORLDS[param] ? param : getSetting('homeWorld', 'planet');
if (!WORLDS[world]) world = 'planet';

function render() {
  setSetting('homeWorld', world);
  applyWorld(world);
  const info = WORLDS[world];
  const lang = info.lang;
  const lessons = lessonsOf[lang];
  const prog = getProgress(lang);
  const placement = getSetting(`placement:${lang}`, null);
  const dp = dailyProgress(lang);
  const st = streakInfo();
  const today = new Date().toISOString().slice(0, 10);
  const hwOf = (id) => homework.find((h) => h.lang === lang && h.lesson_id === id);

  $('world-tabs').innerHTML = Object.entries(WORLDS).map(([w, i]) => `<button class="wtab${w === world ? ' on' : ''}" data-w="${w}" type="button" aria-pressed="${w === world}">${i.name}<small>${i.sub}</small></button>`).join('');
  $('world-tabs').querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { world = b.dataset.w; render(); });

  // 焦點：下一課
  const current = lessons.find((l) => !prog[l.id]?.done) ?? lessons[lessons.length - 1];
  const allDone = lessons.every((l) => prog[l.id]?.done);
  const steps = getStepResults(lang, current.id);
  const stepsDone = Object.values(steps).filter((s) => s?.latest?.accuracy != null).length;
  const doneN = lessons.filter((l) => prog[l.id]?.done && !prog[l.id]?.skipped).length;
  const title = titleName(shop);
  $('next').innerHTML = `
    <div class="next-main">
      <p class="eyebrow">${allDone ? '全部完成' : doneN === 0 && !placement ? '由這裏開始' : '下一課'}<span>・${info.sub}</span></p>
      <h1>第 ${current.id} 課：${html(current.title)}</h1>
      <p class="lead">${html(current.subtitle ?? '')}${current.steps ? `　·　${current.steps.length} 步${stepsDone ? `，已做 ${stepsDone} 步` : ''}` : ''}</p>
      <div class="next-actions">
        <a class="btn primary" href="type.html?lang=${lang}&mode=lesson&id=${current.id}">${allDone ? '再做一次' : stepsDone ? '繼續這一課' : '開始這一課'}</a>
        <a class="btn" href="type.html?lang=${lang}&mode=daily">每日任務<span class="sub">${dp.finishedToday ? '今日已完成' : dp.done.length ? `今日已做 ${dp.done.length}／3` : '十分鐘重溫'}</span></a>
        ${placement === null && doneN === 0 ? `<a class="btn ghost" href="tests.html?lang=${lang}">先做分級測驗</a>` : ''}
      </div>
    </div>
    <div class="next-side">
      <div class="stat"><b>${doneN}<small>／${lessons.length}</small></b><span>完成課數</span></div>
      <div class="stat"><b>${st.current}<small> 天</small></b><span>${st.today ? '連續練習，今日已練' : st.current ? '連續練習，今日未練' : '今日還未練習'}</span>
        <div class="dots" aria-hidden="true">${st.week.map((w) => `<i class="${w.on ? 'on' : ''}${w.today ? ' today' : ''}"></i>`).join('')}</div></div>
      ${me && title ? `<div class="stat"><b class="title-name">${html(title)}</b><span>稱號</span></div>` : ''}
    </div>`;

  // 課程目錄
  $('toc').innerHTML = `<h2>課程目錄</h2>
    <ol class="toc-list">${lessons.map((l) => {
      const p = prog[l.id]; const hw = hwOf(l.id);
      const done = p?.done && !p?.skipped; const late = hw && hw.due && hw.due < today && !done;
      const state = p?.skipped ? '略過' : done ? `${'★'.repeat(p.stars ?? 0)}` : l === current ? '下一課' : '';
      return `<li class="${done ? 'done' : ''}${l === current ? ' cur' : ''}">
        <a href="type.html?lang=${lang}&mode=lesson&id=${l.id}">
          <span class="n">${l.id}</span>
          <span class="t"><b>${html(l.title)}</b><small>${html(l.subtitle ?? '')}${placement === l.id && !done ? '　分級測驗建議由這裏開始' : ''}</small>
            ${hw ? `<small class="hw${late ? ' late' : ''}">老師功課${hw.due ? `・${late ? '已過期' : '截止'} ${hw.due}` : ''}${hw.note ? `・${html(hw.note)}` : ''}</small>` : ''}</span>
          <span class="s ${done ? 'stars' : ''}">${state}</span>
        </a></li>`; }).join('')}</ol>`;

  // 其他入口
  const items = [
    ['practice.html?lang=' + lang, '練習區', lang === 'zh' ? '自由操練、弱項加強、真實輸入法' : '自由操練、弱項加強'],
    ['tests.html?lang=' + lang, '評測區', '分級測驗、限時評測（只做一次）'],
    ['milestones.html?lang=' + lang, '里程碑', lang === 'zh' ? '字根、輔助字形、常用字的掌握度' : '26 個鍵、常用詞、速度目標'],
    ['games.html?lang=' + lang, '小遊戲', lang === 'zh' ? '字根雨、限時快打' : '鍵雨、限時快打'],
    ...(lang === 'zh' ? [['zh/lookup.html', '速成查碼', '任何字的速成碼、拆字圖解和選字位置']] : []),
    ['shortcuts.html', '電腦快捷鍵', '複製、貼上、儲存、工作管理員等'],
    ['shop.html?world=' + world, '星星商店', '用星星換稱號和鍵盤皮膚'],
  ];
  $('side').innerHTML = `<h2>其他</h2><ul class="side-list">${items.map(([h, t, d]) => `<li><a href="${h}"><b>${t}</b><small>${d}</small></a></li>`).join('')}</ul>`;
}
render();
