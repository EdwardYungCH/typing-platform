// 首頁＝世界地圖：每課一個關卡點，夥伴站在目前關卡旁說話；下面是對話窗（出發、每日任務…）和村莊（道具店、公會…）。
// 兩個世界（英文鍵帽星系／中文字根魔法學院）用上方的分頁切換，會記住上次看的世界。
import { getProgress, getSetting, setSetting } from './storage.js';
import { loadCompanions, art, getChoice, nickOf, summary, stageOf, nextGoal } from './companion.js';
import { dailyProgress } from './daily.js';
import { start as syncStart } from './sync.js';
import { api } from './api.js';
import { loadShop, balance, petHtml, titleName } from './wallet.js';
import { weekStrip, awardStreak } from './streak.js';
import { applyWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const me = await syncStart();
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(min-width: 900px)').matches) {
  $('world-tabs').insertAdjacentHTML('beforebegin', '<p class="note" style="border:2px solid var(--warn);border-radius:12px;padding:10px 12px;background:#fff">你正在用手機或平板。打字課要有實體鍵盤，請用電腦練習；手機可以看進度、里程碑、快捷鍵學習卡和查碼。</p>');
}
if (me) {
  const a = $('acct');
  a.href = 'me.html'; a.textContent = `${me.name}（${me.className ?? me.sid}）`;
  $('note').textContent = `已登入 ${me.name}：紀錄會自動同步到伺服器。共用電腦練完記得在「我的帳戶」登出。`;
}
let homework = [];
if (me) { try { homework = (await api('/api/assignments')).assignments ?? []; } catch { /* 離線 */ } }
const data = await loadCompanions();
const shop = await loadShop();
awardStreak();
$('wallet').textContent = `★ ${balance()}`;
$('streak').innerHTML = weekStrip();
const [en, zhL] = await Promise.all(['en', 'zh'].map((l) => fetch(`data/${l}-lessons.json`).then((r) => r.json())));
const lessonsOf = { en: en.lessons, zh: zhL.lessons };

const param = new URLSearchParams(location.search).get('world');
let world = param && data.worlds[param] ? param : getSetting('homeWorld', 'planet');
if (!data.worlds[world]) world = 'planet';

// 關卡點位置：蛇形三行，由左下走到右上
function nodePos(i, n) {
  const perRow = Math.ceil(n / 3);
  const row = Math.floor(i / perRow);
  let col = i % perRow;
  const inRow = Math.min(perRow, n - row * perRow);
  if (row % 2 === 1) col = perRow - 1 - col - (perRow - inRow);
  const x = 7 + (col / Math.max(1, perRow - 1)) * 86;
  const y = 82 - row * 28;
  return { x, y };
}

const SAY = {
  planet: ['前面就是{t}！每打對一個字我就攻擊一次。', '今日也一起冒險吧！先由{t}開始。', '手指放好基準位，{t}等緊我哋！'],
  magic: ['{t}的魔法陣已經準備好，拆對首尾碼就能施法！', '今日的修行是{t}，慢慢來，先求準。', '魔法學院的鐘響了，{t}開始！'],
};

function render() {
  setSetting('homeWorld', world);
  applyWorld(world);
  const info = data.worlds[world];
  const lang = info.lang;
  const lessons = lessonsOf[lang];
  const prog = getProgress(lang);
  const placement = getSetting(`placement:${lang}`, null);
  const s = summary(lang);
  const stage = stageOf(data.stages, s);
  const goal = nextGoal(data.stages, s);
  const c = data.companions.find((x) => x.id === getChoice(world));
  const dp = dailyProgress(lang);
  const today = new Date().toISOString().slice(0, 10);
  const hwOf = (id) => homework.find((h) => h.lang === lang && h.lesson_id === id);

  $('world-tabs').innerHTML = Object.entries(data.worlds).map(([w, i]) => `<button class="wtab${w === world ? ' on' : ''}" data-w="${w}" type="button"><b>${i.name}</b><small>${i.tagline}</small></button>`).join('');
  $('world-tabs').querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { world = b.dataset.w; render(); });

  // 目前關卡：第一個未完成的課（略過的算完成）
  const current = lessons.find((l) => !prog[l.id]?.done) ?? lessons[lessons.length - 1];
  const n = lessons.length;
  const pts = lessons.map((l, i) => nodePos(i, n));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x * 11} ${p.y * 5.2}`).join(' ');
  const scene = world === 'planet' ? `
    <ellipse cx="160" cy="60" rx="90" ry="30" fill="#fff" opacity=".9"/><ellipse cx="230" cy="48" rx="60" ry="26" fill="#fff" opacity=".9"/>
    <ellipse cx="880" cy="50" rx="100" ry="32" fill="#fff" opacity=".9"/><ellipse cx="960" cy="40" rx="60" ry="24" fill="#fff" opacity=".9"/>
    <path d="M0 150 Q200 90 420 140 T 820 130 T 1100 150 V 520 H0z" fill="#8fdc77"/>
    <path d="M560 140 l60 -100 l60 100z" fill="#7a9bb5"/><path d="M600 72 l20 -32 l20 32z" fill="#fff"/><path d="M660 150 l50 -70 l50 70z" fill="#8aa8c0"/>
    <path d="M0 300 Q300 250 600 310 T 1100 300 V 520 H 0z" fill="#6fcc5c"/>
    <path d="M0 430 Q300 400 600 440 T 1100 430 V 520 H 0z" fill="#4aa83f"/>
    <circle cx="1010" cy="130" r="26" fill="#3d9a33"/><circle cx="1036" cy="146" r="30" fill="#46ad3b"/><rect x="1020" y="156" width="9" height="22" fill="#8b5a2b"/>
    <rect x="980" y="30" width="70" height="60" fill="#dfe6f3"/><rect x="972" y="16" width="86" height="18" fill="#b7c3d8"/><rect x="1006" y="60" width="18" height="30" fill="#5a4a3a"/><rect x="1013" y="-10" width="3" height="28" fill="#8b5a2b"/><path d="M1016 -10 l24 8 l-24 8z" fill="#e63946"/>` : `
    <circle cx="930" cy="60" r="44" fill="#fff6c8"/>
    <rect x="210" y="60" width="80" height="80" fill="#8d6bd8"/><path d="M202 60 l48 -56 l48 56z" fill="#6d4fc0"/><rect x="226" y="88" width="14" height="24" rx="7" fill="#fff6c8"/><rect x="260" y="88" width="14" height="24" rx="7" fill="#fff6c8"/>
    <rect x="1000" y="60" width="70" height="160" fill="#8d6bd8"/><path d="M992 60 l43 -56 l43 56z" fill="#6d4fc0"/>
    <path d="M0 300 Q300 260 600 310 T 1100 300 V 520 H 0z" fill="#b48ef0"/>
    <path d="M0 420 Q300 390 600 430 T 1100 420 V 520 H 0z" fill="#9b73e6"/>`;
  const curPos = pts[lessons.indexOf(current)];
  $('map').innerHTML = `<div class="map-inner">
    <svg class="map-bg" viewBox="0 0 1100 520" preserveAspectRatio="none" aria-hidden="true">${scene}
      <path d="${path}" stroke="#e9d9a8" stroke-width="26" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path}" stroke="#c9b27a" stroke-width="26" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 30" opacity=".45"/></svg>
    ${lessons.map((l, i) => {
      const p = prog[l.id]; const hw = hwOf(l.id); const done = p?.done; const isCur = l === current;
      const late = hw && hw.due && hw.due < today && !(done && !p?.skipped);
      const cls = `mnode${done ? ' done' : ''}${isCur ? ' cur' : ''}${!done && !isCur ? ' locked' : ''}`;
      return `<a class="${cls}" style="left:${pts[i].x}%;top:${pts[i].y}%" href="type.html?lang=${lang}&mode=lesson&id=${l.id}" title="第 ${l.id} 課：${html(l.title)}">
        <span class="dot">${p?.skipped ? '略' : done ? '✓' : l.id}</span>
        ${p?.stars ? `<span class="st">${'★'.repeat(p.stars)}</span>` : ''}
        ${hw ? `<span class="flag${late ? ' late' : ''}" title="老師功課${hw.due ? `・截止 ${hw.due}` : ''}">⚑</span>` : ''}
        ${placement === l.id && !done ? '<span class="tip">分級建議由這裏開始</span>' : ''}
      </a>`; }).join('')}
    ${c ? `<div class="map-pet" style="left:${curPos.x}%;top:${curPos.y}%">${petHtml(art(world, c.id, stage), c.name, { cls: 'companion pet-float', size: 84, items: shop })}</div>` : ''}
    <div class="map-label" style="left:${curPos.x}%;top:${curPos.y}%">第 ${current.id} 課：${html(current.title)}</div>
  </div>`;

  // 對話窗 + 村莊
  const say = c ? SAY[world][current.id % SAY[world].length].replace('{t}', `「${current.title}」`) : '先到夥伴之家揀一個夥伴，牠會陪你走完整張地圖。';
  const dailySub = dp.finishedToday ? `今日已完成 ✓` : dp.done.length ? `今日已做 ${dp.done.length}／3` : '每日十分鐘';
  const hwList = homework.filter((h) => h.lang === lang);
  const hwHtml = hwList.length ? `<div class="hw-board"><b>任務板（老師功課）</b>${hwList.map((h) => { const d = prog[h.lesson_id]?.done && !prog[h.lesson_id]?.skipped; const late = h.due && h.due < today && !d; return `<a href="type.html?lang=${lang}&mode=lesson&id=${h.lesson_id}" class="${d ? 'done' : late ? 'late' : ''}">第 ${h.lesson_id} 課 ${html(lessonsOf[lang].find((x) => x.id === h.lesson_id)?.title ?? '')}<small>${html(h.teacher)}老師${h.due ? `・${late ? '已過期' : '截止'} ${h.due}` : ''}${h.note ? `・${html(h.note)}` : ''}</small><span>${d ? '完成' : late ? '過期' : '未完成'}</span></a>`; }).join('')}</div>` : '';
  $('wins').innerHTML = `
    <div class="win talk">
      <div class="talk-head">${c ? `<b>${html(nickOf(world, c))}</b>${titleName(shop) ? ` <span class="title-chip">${titleName(shop)}</span>` : ''} <span class="badge lv">Lv ${s.lessons}・${data.stages[stage].name}</span>` : '<b>？？？</b>'}</div>
      <p class="talk-text">${html(say)}</p>
      ${c && goal ? `<p class="muted mini">下一階段「${goal.stage.name}」：${goal.need.join('、')}</p>` : ''}
      <div class="talk-actions">
        ${c ? `<a class="btn primary" href="type.html?lang=${lang}&mode=lesson&id=${current.id}">▶ 出發：第 ${current.id} 課</a>` : `<a class="btn primary" href="pick.html?world=${world}">揀夥伴</a>`}
        <a class="btn" href="type.html?lang=${lang}&mode=daily">每日任務<small>${dailySub}</small></a>
        <a class="btn" href="practice.html?lang=${lang}">練習場</a>
        <a class="btn" href="tests.html?lang=${lang}">評測塔</a>
        <a class="btn" href="milestones.html?lang=${lang}">里程碑</a>
        ${lang === 'zh' ? '<a class="btn" href="zh/lookup.html">查碼書</a>' : ''}
      </div>
      ${hwHtml}
    </div>
    <div class="win village">
      <b>村莊</b>
      <a href="shop.html?world=${world}"><span>道具店</span><small>用星星買裝備、稱號、鍵盤皮膚</small></a>
      <a href="board.html?lang=${lang}"><span>冒險者公會</span><small>本班排行榜</small></a>
      <a href="games.html?lang=${lang}"><span>遊樂場</span><small>${lang === 'zh' ? '字根雨、限時快打' : '鍵雨、限時快打'}</small></a>
      <a href="shortcuts.html"><span>快捷鍵道場</span><small>複製貼上、工作管理員等 Windows 快捷鍵</small></a>
    </div>`;
}
render();
