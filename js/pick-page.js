import { applyWorld } from './world.js';
import { loadCompanions, art, getChoice, setChoice, nickOf, setNick, summary, stageOf, isLocked, validNick } from './companion.js';

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
  const locked = isLocked(world, data.stages, data.worlds[world].lang);
  if (locked) sel = getChoice(world);
  const grid = $('grid');
  grid.innerHTML = '';
  for (const c of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-card';
    b.setAttribute('aria-pressed', c.id === sel);
    b.innerHTML = `<img class="companion" src="${art(world, c.id, 1)}" alt="" width="160" height="160"><b>${c.name}</b><small>${c.kind}</small>`;
    if (locked && c.id !== sel) { b.disabled = true; b.style.opacity = '0.35'; b.style.cursor = 'not-allowed'; }
    b.onclick = () => { sel = c.id; render(); };
    grid.append(b);
  }
  renderDetail(list.find((c) => c.id === sel), locked);
}

function renderDetail(c, locked) {
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
      <select id="nick">${c.names.map((n) => `<option${n === validNick(c, owned ? nickOf(world, c) : c.name) ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn primary" id="adopt" type="button">${owned ? (locked ? '儲存' : '已選這位 ✓') : '選擇' + c.name}</button>
    </div>
    ${locked ? '<p class="muted" style="margin:10px 0 0">🔒 夥伴已經孵化，這個學年不能再換，名字也只能從名單中揀。需要重新選擇請找老師。</p>' : '<p class="muted" style="margin:10px 0 0">夥伴孵化（完成第 1 課）之前可以隨意換；孵化後就會鎖定，所以想清楚才選喔。</p>'}`;
  $('adopt').onclick = () => {
    if (!locked) setChoice(world, c.id);
    setNick(world, validNick(c, $('nick').value));
    location.href = 'index.html';
  };
}

render();
