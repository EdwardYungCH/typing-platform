import { applyWorld } from './world.js';
import { loadCompanions, art, getChoice, nickOf, summary, stageOf, nextGoal } from './companion.js';

const $ = (id) => document.getElementById(id);
const data = await loadCompanions();
const qs = new URLSearchParams(location.search).get('world');
let world = qs in data.worlds ? qs : 'planet';

function render() {
  applyWorld(world);
  const info = data.worlds[world];
  const s = summary(info.lang);
  const cur = stageOf(data.stages, s);
  const goal = nextGoal(data.stages, s);
  $('lead').textContent = `${info.name}：目前進度達到「${data.stages[cur].name}」。` +
    (goal ? `下一階段「${goal.stage.name}」：${goal.need.join('、')}。` : '全部階段都解鎖了！');

  $('tabs').innerHTML = '';
  for (const [w, i] of Object.entries(data.worlds)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (w === world ? ' primary' : '');
    b.textContent = i.name;
    b.onclick = () => { world = w; render(); };
    $('tabs').append(b);
  }

  const mine = getChoice(world);
  $('list').innerHTML = data.companions.filter((c) => c.world === world).map((c) => `
    <section class="card detail">
      <h2>${mine === c.id ? nickOf(world, c) : c.name}
        <span class="badge">${c.kind}</span>${mine === c.id ? ' <span class="badge">我的夥伴</span>' : ''}</h2>
      <p class="muted" style="margin:4px 0 0">${c.intro}</p>
      <div class="evo">${data.stages.map((st) => `
        <figure class="${st.n > cur ? 'lock' : ''}">
          <img src="${art(world, c.id, st.n)}" alt="${c.name}・${st.name}" loading="lazy">
          <figcaption>${st.name}${st.badge ? '・' + st.badge : ''}</figcaption>
        </figure>`).join('')}
      </div>
    </section>`).join('<div style="height:14px"></div>');
}
render();
