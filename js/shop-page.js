// 星星商店：看餘額、預覽夥伴、買和裝備貨品。全部資料在這部電腦（已登入會同步）。
import { applyWorld } from './world.js';
import { start as syncStart } from './sync.js';
import { loadCompanions, art, getChoice, nickOf, summary, stageOf } from './companion.js';
import { loadShop, balance, earned, owned, equipped, buy, equip, petHtml, titleName } from './wallet.js';

await syncStart();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const world = params.get('world') === 'magic' ? 'magic' : 'planet';
applyWorld(world);
const data = await loadCompanions();
const items = await loadShop();
const KINDS = [['hat', '頭部裝備'], ['face', '手持裝備'], ['title', '稱號'], ['kb', '鍵盤皮膚'], ['skill', '技能']];
let kind = params.get('kind') ?? 'hat';

function preview() {
  const info = data.worlds[world];
  const cid = getChoice(world);
  const c = data.companions.find((x) => x.id === cid);
  const stage = stageOf(data.stages, summary(info.lang));
  const e = equipped();
  const title = titleName(items);
  $('preview').innerHTML = `${c ? petHtml(art(world, c.id, stage), c.name, { size: 140, items, cls: 'companion pet-float' }) : '<p class="muted">還未揀夥伴。</p>'}
    <div class="pv-text"><b>${c ? nickOf(world, c) : ''}${title ? ` <span class="title-chip">${title}</span>` : ''}</b>
      <p class="muted" style="margin:4px 0 0">裝備中：${KINDS.filter(([k]) => k !== 'skill').map(([k, n]) => `${n}：${items.find((x) => x.id === e[k])?.name ?? '無'}`).join('　')}　技能：${items.filter((x) => x.kind === 'skill' && owned(x.id)).map((x) => x.name).join('、') || '無'}</p>
      <div class="tabs" style="margin:8px 0 0">${Object.entries(data.worlds).map(([w, i]) => `<a class="btn${w === world ? ' primary' : ''}" href="shop.html?world=${w}&kind=${kind}">${i.name}</a>`).join('')}</div></div>`;
  $('bal').textContent = balance();
  $('earned').textContent = `共賺 ${earned()}`;
}

function render() {
  $('tabs').innerHTML = KINDS.map(([k, n]) => `<button class="btn${k === kind ? ' primary' : ''}" data-k="${k}" type="button">${n}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { kind = b.dataset.k; render(); });
  const e = equipped();
  const list = items.filter((it) => it.kind === kind && (!it.world || it.world === world));
  $('grid').innerHTML = list.map((it) => {
    const has = owned(it.id), on = e[kind] === it.id, can = balance() >= it.price;
    const face = it.kind === 'skill' ? `<span class="skill-icon">${{ 'sk-hint': '燈', 'sk-shield': '盾', 'sk-coin': '金' }[it.id] ?? '技'}</span>` : it.kind === 'kb' ? `<span class="kb-swatch" style="--a:${it.colors[0]};--b:${it.colors[1]}"><i></i><i></i><i></i><i></i></span>` : it.kind === 'title' ? `<span class="title-chip big">${it.name}</span>` : `<span class="emoji">${it.emoji}</span>`;
    const btn = it.kind === 'skill' ? (has ? '<span class="badge">已學會</span>' : `<button class="btn primary" data-buy="${it.id}" type="button" ${can ? '' : 'disabled'}>★ ${it.price} 學習</button>`) : on ? `<button class="btn" data-off="${it.id}" type="button">脫下</button>` : has ? `<button class="btn primary" data-on="${it.id}" type="button">裝上</button>` : `<button class="btn primary" data-buy="${it.id}" type="button" ${can ? '' : 'disabled'}>★ ${it.price} 買</button>`;
    return `<div class="shop-item card${on ? ' on' : ''}${has ? ' has' : ''}">${face}<b>${it.name}</b><small>${it.desc}</small><div class="form-actions">${btn}${has ? '<span class="muted mini">已擁有</span>' : ''}</div></div>`;
  }).join('') || '<p class="muted">這個世界沒有這類貨品。</p>';
  $('grid').querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const it = items.find((x) => x.id === b.dataset.buy); const r = buy(it); if (!r.ok) alert(r.msg); else { celebrate(it); } preview(); render(); });
  $('grid').querySelectorAll('[data-on]').forEach((b) => b.onclick = () => { equip(kind, b.dataset.on); preview(); render(); });
  $('grid').querySelectorAll('[data-off]').forEach((b) => b.onclick = () => { equip(kind, null); preview(); render(); });
}

function celebrate(it) {
  const p = $('preview');
  p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
  const say = document.createElement('div'); say.className = 'shop-say'; say.textContent = `買了「${it.name}」！`;
  p.append(say); setTimeout(() => say.remove(), 1800);
}

preview(); render();
