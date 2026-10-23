// 星星商店：看餘額、買和裝備稱號、鍵盤皮膚。全部資料在這部電腦（已登入會同步）。
import { applyWorld } from './world.js';
import { start as syncStart } from './sync.js';
import { loadShop, balance, earned, owned, equipped, buy, equip, titleName } from './wallet.js';

const me = await syncStart();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const world = params.get('world') === 'magic' ? 'magic' : 'planet';
applyWorld(world);
const items = await loadShop();
const KINDS = [['title', '稱號'], ['kb', '鍵盤皮膚']];
let kind = params.get('kind') ?? 'title';
const WORLDS = { planet: '鍵帽星系', magic: '字根魔法學院' };

function preview() {
  const e = equipped();
  const title = titleName(items);
  $('preview').innerHTML = `<div class="pv-text"><b style="font-size:22px">${me ? me.name : '你'}${title ? ` <span class="title-chip">${title}</span>` : ''}</b>
      <p class="muted" style="margin:4px 0 0">裝備中：${KINDS.map(([k, n]) => `${n}：${items.find((x) => x.id === e[k])?.name ?? '無'}`).join('　')}</p>
      <div class="tabs" style="margin:8px 0 0">${Object.entries(WORLDS).map(([w, n]) => `<a class="btn${w === world ? ' primary' : ''}" href="shop.html?world=${w}&kind=${kind}">${n}</a>`).join('')}</div></div>`;
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
    const face = it.kind === 'kb' ? `<span class="kb-swatch" style="--a:${it.colors[0]};--b:${it.colors[1]}"><i></i><i></i><i></i><i></i></span>` : `<span class="title-chip big">${it.name}</span>`;
    const btn = on ? `<button class="btn" data-off="${it.id}" type="button">脫下</button>` : has ? `<button class="btn primary" data-on="${it.id}" type="button">裝上</button>` : `<button class="btn primary" data-buy="${it.id}" type="button" ${can ? '' : 'disabled'}>★ ${it.price} 買</button>`;
    return `<div class="shop-item card${on ? ' on' : ''}${has ? ' has' : ''}">${face}<b>${it.name}</b><small>${it.desc}</small><div class="form-actions">${btn}${has ? '<span class="muted mini">已擁有</span>' : ''}</div></div>`;
  }).join('') || '<p class="muted">這個世界沒有這類貨品。</p>';
  $('grid').querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const it = items.find((x) => x.id === b.dataset.buy); const r = buy(it); if (!r.ok) alert(r.msg); else celebrate(it); preview(); render(); });
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
