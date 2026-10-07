import { getProgress } from './storage.js';
import { loadCompanions, art, getChoice, nickOf, summary, stageOf, nextGoal } from './companion.js';

const data = await loadCompanions();
const [en, zhL] = await Promise.all(['en', 'zh'].map((l) => fetch(`data/${l}-lessons.json`).then((r) => r.json())));
const lessonsOf = { en: en.lessons, zh: zhL.lessons };
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

  const prog = getProgress(info.lang);
  const ul = document.createElement('ul');
  ul.className = 'map';
  for (const l of lessonsOf[info.lang]) {
    const p = prog[l.id];
    const li = document.createElement('li');
    li.innerHTML = `<a class="node${p?.done ? ' done' : ''}" href="type.html?lang=${info.lang}&mode=lesson&id=${l.id}">
      <span class="num">${p?.done ? '✓' : l.id}</span>
      <span class="t"><b>第 ${l.id} 課：${l.title}</b><span>${l.subtitle}</span></span>
      <span class="s" aria-label="${p?.stars ?? 0} 粒星">${p?.stars ? '★'.repeat(p.stars) : ''}</span></a>`;
    ul.append(li);
  }
  card.append(ul);
  if (info.lang === 'zh') {
    card.insertAdjacentHTML('beforeend', `
      <ul class="map"><li><a class="node" href="zh/lookup.html">
        <span class="num">查</span>
        <span class="t"><b>速成查碼</b><span>任何字的速成碼、拆字圖解和選字位置</span></span></a></li></ul>
      <p class="soon">第 2 至 15 課製作中。建議先完成英文第 0、1 課，熟習十指基準位。</p>`);
  }
  root.append(card);
}
