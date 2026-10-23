import { getProgress, getSetting } from './storage.js';
import { dailyProgress } from './daily.js';
import { start as syncStart } from './sync.js';
import { api } from './api.js';
import { loadShop, balance, titleName } from './wallet.js';
import { weekStrip, awardStreak } from './streak.js';

const me = await syncStart();
// 手機沒有實體鍵盤，課堂做不到：提示用電腦
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(min-width: 900px)').matches) {
  document.getElementById('worlds').insertAdjacentHTML('beforebegin', '<p class="note" style="border:1px solid var(--warn);border-radius:12px;padding:10px 12px">你正在用手機或平板。打字課要有實體鍵盤，請用電腦練習；手機可以看進度、里程碑、快捷鍵學習卡和查碼。</p>');
}
if (me) {
  const a = document.getElementById('acct');
  a.href = 'me.html'; a.textContent = `${me.name}（${me.className ?? me.sid}）`;
  document.getElementById('note').textContent = `已登入 ${me.name}：紀錄會自動同步到伺服器。共用電腦練完記得在「我的帳戶」登出。`;
}

// 老師功課
let homework = [];
if (me) { try { homework = (await api('/api/assignments')).assignments ?? []; } catch { /* 離線 */ } }
const data = { worlds: { planet: { lang: 'en', name: '鍵帽星系', tagline: '英文打字・星際冒險' }, magic: { lang: 'zh', name: '字根魔法學院', tagline: '中文速成・魔法修行' } } };
const shop = await loadShop();
awardStreak();
// 頂欄：星星餘額（按入商店）；英雄區下面：連續天數
document.getElementById('wallet').innerHTML = `★ ${balance()}`;
document.getElementById('streak').innerHTML = weekStrip();
const [en, zhL] = await Promise.all(['en', 'zh'].map((l) => fetch(`data/${l}-lessons.json`).then((r) => r.json())));
const lessonsOf = { en: en.lessons, zh: zhL.lessons };
const root = document.getElementById('worlds');

for (const [w, info] of Object.entries(data.worlds)) {

  const card = document.createElement('article');
  card.className = 'world-card card';
  card.dataset.w = w;



  card.innerHTML = `
    <div class="world-top">
      <div><span class="tag">${w === 'planet' ? 'ENGLISH' : '速成'}</span><h2>${info.name}</h2><p class="muted" style="margin:2px 0 0">${info.tagline}</p></div>
      ${titleName(shop) ? `<span class="title-chip">${titleName(shop)}</span>` : ''}
    </div>`;

  const prog = getProgress(info.lang);
  const placement = getSetting(`placement:${info.lang}`, null);
  const ul = document.createElement('ul');
  ul.className = 'map';
  for (const l of lessonsOf[info.lang]) {
    const p = prog[l.id];
    const li = document.createElement('li');
    li.innerHTML = `<a class="node${p?.done ? ' done' : ''}" href="type.html?lang=${info.lang}&mode=lesson&id=${l.id}">
      <span class="num">${p?.skipped ? '略' : p?.done ? '✓' : l.id}</span>
      <span class="t"><b>第 ${l.id} 課：${l.title}</b><span>${l.subtitle}${placement === l.id ? '　<b class="badge">分級測驗建議由這裏開始</b>' : ''}</span></span>
      <span class="s" aria-label="${p?.stars ?? 0} 粒星">${p?.stars ? '★'.repeat(p.stars) : ''}</span></a>`;
    ul.append(li);
  }
  // 老師功課（這個世界的）
  const hw = homework.filter((h) => h.lang === info.lang);
  if (hw.length) {
    const today = new Date().toISOString().slice(0, 10);
    card.insertAdjacentHTML('beforeend', `<div class="hw"><h3>老師功課</h3><ul class="map">${hw.map((h) => {
      const l = lessonsOf[info.lang].find((x) => x.id === h.lesson_id); const done = prog[h.lesson_id]?.done && !prog[h.lesson_id]?.skipped;
      const late = h.due && h.due < today && !done;
      return `<li><a class="node${done ? ' done' : ''}${late ? ' late' : ''}" href="type.html?lang=${info.lang}&mode=lesson&id=${h.lesson_id}">
        <span class="num">${done ? '✓' : '課'}</span><span class="t"><b>第 ${h.lesson_id} 課：${l?.title ?? ''}</b><span>${h.teacher}老師${h.due ? `・${late ? '已過期' : '截止'} ${h.due}` : ''}${h.note ? `・${h.note}` : ''}</span></span>
        <span class="badge">${done ? '已完成' : late ? '過期' : '未完成'}</span></a></li>`; }).join('')}</ul></div>`);
  }
  card.append(ul);
  const dp = dailyProgress(info.lang);
  const dailySub = dp.finishedToday ? `今日已完成 ✓　連續 ${dp.streak} 天` : dp.done.length ? `今日已做 ${dp.done.length}／3 部分` : `每日十分鐘，重溫到期的字根和字${dp.streak ? `　連續 ${dp.streak} 天` : ''}`;
  card.insertAdjacentHTML('beforeend', `<ul class="map"><li><a class="node${dp.finishedToday ? ' done' : ''}" href="type.html?lang=${info.lang}&mode=daily">
    <span class="num">${dp.finishedToday ? '✓' : '日'}</span><span class="t"><b>每日任務</b><span>${dailySub}</span></span></a></li>
    <li><a class="node" href="milestones.html?lang=${info.lang}">
    <span class="num">程</span><span class="t"><b>里程碑</b><span>${info.lang === 'zh' ? '認齊字根、認齊輔助字形、拆對和打熟常用字' : '掌握 26 個鍵、打熟常用詞、速度目標'}</span></span></a></li></ul>`);
  card.insertAdjacentHTML('beforeend', `<ul class="map"><li><a class="node" href="practice.html?lang=${info.lang}">
    <span class="num">練</span><span class="t"><b>練習區</b><span>自由操練、弱項加強${info.lang === 'zh' ? '、真實輸入法' : ''}</span></span></a></li>
    <li><a class="node" href="tests.html?lang=${info.lang}">
    <span class="num">測</span><span class="t"><b>評測區</b><span>分級測驗、限時評測（只做一次）</span></span></a></li>
    <li><a class="node" href="games.html?lang=${info.lang}">
    <span class="num">玩</span><span class="t"><b>小遊戲</b><span>${info.lang === 'zh' ? '字根雨、限時快打：只出你學過的字根和字' : '鍵雨、限時快打：只出你學過的鍵'}</span></span></a></li></ul>`)
  if (info.lang === 'zh') {
    card.insertAdjacentHTML('beforeend', `
      <ul class="map"><li><a class="node" href="zh/lookup.html">
        <span class="num">查</span>
        <span class="t"><b>速成查碼</b><span>任何字的速成碼、拆字圖解和選字位置</span></span></a></li></ul>`);
  }
  root.append(card);
}
