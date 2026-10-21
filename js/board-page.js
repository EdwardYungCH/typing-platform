// 本班排行榜：由伺服器按全班同學已同步的進度計算。未登入或老師關掉就不顯示排名。
import { applyWorld } from './world.js';
import { start as syncStart } from './sync.js';
import { api } from './api.js';
import { loadShop } from './wallet.js';

const me = await syncStart();
const $ = (id) => document.getElementById(id);
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
applyWorld(new URLSearchParams(location.search).get('lang') === 'zh' ? 'magic' : 'planet');
const shop = await loadShop();
const BOARDS = [
  ['stars', '星星榜', (s) => s.stars, (v) => `★ ${v}`],
  ['week', '本週練習榜', (s) => s.week, (v) => `${v} 分鐘`],
  ['en', '英文速度榜', (s) => s.en, (v) => `${v} WPM`],
  ['zh', '速成速度榜', (s) => s.zh, (v) => `${v} 字/分`],
];
let which = new URLSearchParams(location.search).get('board') ?? 'stars';

if (!me) {
  $('app').innerHTML = '<section class="card form-card" style="margin-left:0"><p>排行榜要<a href="login.html?next=board.html">登入</a>後才看到：伺服器會按全班同學的紀錄排名。</p></section>';
} else {
  let d;
  try { d = await api('/api/leaderboard'); } catch (e) { $('app').innerHTML = `<p class="form-msg">${html(e.message)}</p>`; d = null; }
  if (d && !d.enabled) $('app').innerHTML = `<section class="card form-card" style="margin-left:0"><p class="muted">${html(d.reason)}。你自己的紀錄在「我的帳戶」仍然看得到。</p></section>`;
  else if (d) render(d);
}

function render(d) {
  $('tabs').innerHTML = BOARDS.map(([k, n]) => `<button class="btn${k === which ? ' primary' : ''}" data-k="${k}" type="button">${n}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { which = b.dataset.k; render(d); });
  const [, name, val, fmt] = BOARDS.find((b) => b[0] === which);
  const list = d.students.map((s) => ({ ...s, v: val(s) })).filter((s) => s.v > 0).sort((a, b) => b.v - a.v || (a.no ?? 99) - (b.no ?? 99));
  let rank = 0, prev = null;
  list.forEach((s, i) => { if (s.v !== prev) { rank = i + 1; prev = s.v; } s.rank = rank; });
  const mine = list.find((s) => s.id === d.me);
  const top = list.slice(0, 10);
  const medal = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;
  const titleOf = (s) => s.title ? `<span class="title-chip">${html(shop.find((x) => x.id === s.title)?.name ?? '')}</span>` : '';
  $('app').innerHTML = `<section class="card board">
    <h2>${name}</h2>
    <p class="muted mine">${mine ? `你排第 <b>${mine.rank}</b>（${fmt(mine.v)}）` : '你還未上榜：完成一步就會出現。'}・全班 ${d.students.length} 人，${list.length} 人有紀錄</p>
    <ol class="board-list">${top.map((s) => `<li class="${s.id === d.me ? 'me' : ''}${s.rank <= 3 ? ' top' : ''}"><span class="rk">${medal(s.rank)}</span><span class="nm">${html(s.name)} ${titleOf(s)}</span><b>${fmt(s.v)}</b></li>`).join('') || '<li class="muted">還沒有人有紀錄。</li>'}</ol>
    ${mine && mine.rank > 10 ? `<ol class="board-list" start="${mine.rank}"><li class="me"><span class="rk">${mine.rank}</span><span class="nm">${html(mine.name)} ${titleOf(mine)}</span><b>${fmt(mine.v)}</b></li></ol>` : ''}
  </section>
  <p class="note muted">排名按已同步到伺服器的紀錄計算；在「我的帳戶」按「立即同步」可更新。只顯示前 10 名和你自己。</p>`;
}
