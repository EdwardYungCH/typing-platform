import { getProgress } from './storage.js';
import { loadCompanions, art, getChoice, nickOf, summary, stageOf, nextGoal } from './companion.js';

const data = await loadCompanions();
const { lessons } = await fetch('data/en-lessons.json').then((r) => r.json());
const root = document.getElementById('worlds');

for (const [w, info] of Object.entries(data.worlds)) {
  const s = summary(info.lang);
  const stage = stageOf(data.stages, s);
  const goal = nextGoal(data.stages, s);
  const cid = getChoice(w);
  const c = data.companions.find((x) => x.id === cid);

  const card = document.createElement('article');
  card.className = 'world-card card';
  card.dataset.w = w;

  const pet = c
    ? `<div class="pet-box"><img class="companion pet pet-float" width="120" height="120" src="${art(w, c.id, stage)}" alt="${c.name}"><div class="nm">${nickOf(w, c)}</div><span class="badge">${data.stages[stage].name}</span></div>`
    : `<a class="btn primary" href="pick.html?world=${w}">揀夥伴</a>`;

  const pct = Math.min(100, Math.round(((stage) / 4) * 100 + (goal ? Math.min(s.lessons / goal.stage.need.lessons, 1) * 25 : 0)));
  const growth = c ? `
    <div class="growth">
      <div class="bar" role="img" aria-label="成長進度 ${pct}%"><i style="width:${pct}%"></i></div>
      <small>${goal ? `下一階段「${goal.stage.name}」：${goal.need.join('、')}` : '已達到最高階段，你是傳說！'}</small>
    </div>` : '';

  card.innerHTML = `
    <div class="world-top">
      <div><span class="tag">${w === 'planet' ? 'ENGLISH' : '速成'}</span><h2>${info.name}</h2><p class="muted" style="margin:2px 0 0">${info.tagline}</p></div>
      ${pet}
    </div>${growth}`;

  if (w === 'planet') {
    const prog = getProgress('en');
    const ul = document.createElement('ul');
    ul.className = 'map';
    const unlockAll = new URLSearchParams(location.search).has('unlock'); // 老師預覽用
    let firstOpen = true;
    for (const l of lessons) {
      const p = prog[l.id];
      const open = unlockAll || l.id === 0 || prog[l.id - 1]?.done;
      const li = document.createElement('li');
      const a = document.createElement(open ? 'a' : 'div');
      const isNext = open && !p?.done && firstOpen;
      if (isNext) firstOpen = false;
      a.className = 'node' + (p?.done ? ' done' : '') + (open ? '' : ' locked') + (isNext ? ' next' : '');
      if (open) a.href = `type.html?lang=en&mode=lesson&id=${l.id}`;
      else a.setAttribute('aria-disabled', 'true');
      a.innerHTML = `
        <span class="num">${p?.done ? '✓' : open ? l.id : '🔒'}</span>
        <span class="t"><b>第 ${l.id} 課：${l.title}</b><span>${l.subtitle}</span></span>
        <span class="s" aria-label="${p?.stars ?? 0} 粒星">${p?.stars ? '★'.repeat(p.stars) : isNext ? '開始 ➜' : ''}</span>`;
      li.append(a);
      ul.append(li);
    }
    card.append(ul);
  } else {
    card.insertAdjacentHTML('beforeend', `
      <ul class="map"><li><a class="node" href="zh/lookup.html">
        <span class="num">查</span>
        <span class="t"><b>速成查碼</b><span>任何字的速成碼、拆字圖解和選字位置</span></span></a></li></ul>
      <p class="soon">速成課堂即將推出。建議先完成英文第 0、1 課，熟習十指基準位。</p>`);
  }
  root.append(card);
}
