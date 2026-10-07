import { applyWorld } from './world.js';
import { loadCompanions, art, getChoice, setChoice, getNick, setNick, summary, stageOf } from './companion.js';

const $ = (id) => document.getElementById(id);
const data = await loadCompanions();
const params = new URLSearchParams(location.search);
let world = params.get('world') in data.worlds ? params.get('world') : 'planet';
let sel = null;

function render() {
  applyWorld(world);
  $('tabs').innerHTML = '';
  for (const [w, info] of Object.entries(data.worlds)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (w === world ? ' primary' : '');
    b.textContent = `${info.name}（${info.lang === 'en' ? '英文' : '中文'}）`;
    b.onclick = () => { world = w; sel = null; render(); };
    $('tabs').append(b);
  }
  const list = data.companions.filter((c) => c.world === world);
  sel ??= getChoice(world) ?? list[0].id;
  const grid = $('grid');
  grid.innerHTML = '';
  for (const c of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-card';
    b.setAttribute('aria-pressed', c.id === sel);
    b.innerHTML = `<img class="companion" src="${art(world, c.id, 1)}" alt="" width="160" height="160"><b>${c.name}</b><small>${c.kind}</small>`;
    b.onclick = () => { sel = c.id; render(); };
    grid.append(b);
  }
  renderDetail(list.find((c) => c.id === sel));
}

function renderDetail(c) {
  const lang = data.worlds[world].lang;
  const cur = stageOf(data.stages, summary(lang));
  const d = $('detail');
  d.hidden = false;
  const owned = getChoice(world) === c.id;
  d.innerHTML = `
    <h2>${c.name} <span class="badge">${c.kind}</span></h2>
    <p class="muted">${c.intro}</p>
    <div class="evo">${data.stages.map((s) => `
      <figure class="${s.n > cur ? 'lock' : ''}">
        <img src="${art(world, c.id, s.n)}" alt="${c.name}・${s.name}" loading="lazy">
        <figcaption>${s.name}${s.badge ? '・' + s.badge : ''}</figcaption>
      </figure>`).join('')}
    </div>
    <div class="name-row">
      <label for="nick">夥伴名字</label>
      <input id="nick" maxlength="8" value="${owned ? getNick(world, c.name) : c.name}">
      <button class="btn primary" id="adopt" type="button">${owned ? '已選這位 ✓' : '選擇' + c.name}</button>
    </div>`;
  $('adopt').onclick = () => {
    setChoice(world, c.id);
    setNick(world, $('nick').value.trim() || c.name);
    location.href = 'index.html';
  };
}

render();
