// 星星錢包：星星是學生唯一的「貨幣」。
// 賺到的星星 = 每課星數（中英合計，略過的課不算）＋ 快捷鍵課星數 ＋ 獎勵（每日任務、連續天數）。
// 花掉的記在 wallet.spent；買過的貨品記在 wallet.items，裝備中的記在 wallet.equip。
// 課的星數日後打得更好會增加，所以餘額每次都重新計算，不會因為重算而「蝕錢」。

import { readAll, getSetting, setSetting, getShortcutResults } from './storage.js';

const W = () => getSetting('wallet', { spent: 0, items: [], equip: {}, bonus: {} });
const save = (w) => setSetting('wallet', w);

/** 課堂和快捷鍵課賺到的星星 */
export function starsFromLessons() {
  const all = readAll();
  let n = 0;
  for (const [k, v] of Object.entries(all.lessons ?? {})) if (v.done && !v.skipped && /^(en|zh):/.test(k)) n += v.stars ?? 0;
  for (const r of Object.values(getShortcutResults() ?? {})) n += r.stars ?? 0;
  return n;
}

/** 獎勵星星（每日任務、連續天數等）：key 防止同一獎勵發兩次 */
export function grantBonus(key, n, label) {
  const w = W();
  if (w.bonus[key]) return false;
  w.bonus[key] = { n, label, at: new Date().toISOString() };
  save(w);
  return true;
}

export function bonusTotal() {
  return Object.values(W().bonus).reduce((a, b) => a + (b.n ?? 0), 0);
}

export function earned() { return starsFromLessons() + bonusTotal(); }
export function spent() { return W().spent ?? 0; }
export function balance() { return Math.max(0, earned() - spent()); }

export function owned(id) { return W().items.includes(id); }
export function equipped() { return W().equip ?? {}; }

/** 買貨品：餘額夠就扣星、記下、並自動裝上 */
export function buy(item) {
  const w = W();
  if (w.items.includes(item.id)) return { ok: false, msg: '已經買了' };
  if (balance() < item.price) return { ok: false, msg: `星星不夠：還差 ${item.price - balance()} 粒` };
  w.spent = (w.spent ?? 0) + item.price;
  w.items.push(item.id);
  w.equip[item.kind] = item.id;
  save(w);
  return { ok: true };
}

/** 裝備或脫下（id 為 null 就脫下） */
export function equip(kind, id) {
  const w = W();
  if (id && !w.items.includes(id)) return false;
  if (id) w.equip[kind] = id; else delete w.equip[kind];
  save(w);
  return true;
}

let catalog;
export async function loadShop(base = '') {
  catalog ??= fetch(`${base}data/shop.json`).then((r) => r.json()).then((d) => d.items);
  return catalog;
}

/** 裝備中的貨品（已載入商店資料後用） */
export function equippedItems(items) {
  const e = equipped();
  const out = {};
  for (const [kind, id] of Object.entries(e)) { const it = items.find((x) => x.id === id); if (it) out[kind] = it; }
  return out;
}

/** 夥伴圖加上飾物：把 <img> 包起來，頭頂／臉旁放 emoji。size 是圖的 CSS 寬度。 */
export function petHtml(src, alt, { cls = 'companion', size = 120, items = null, extra = '' } = {}) {
  const e = items ? equippedItems(items) : {};
  const acc = [];
  if (e.hat) acc.push(`<span class="pet-acc hat" aria-hidden="true">${e.hat.emoji}</span>`);
  if (e.face) acc.push(`<span class="pet-acc face" aria-hidden="true">${e.face.emoji}</span>`);
  return `<span class="pet-wrap" style="--pet:${size}px"><img class="${cls}" width="${size}" height="${size}" src="${src}" alt="${alt}" ${extra}>${acc.join('')}</span>`;
}

/** 稱號（裝備了才有） */
export function titleName(items) { return equippedItems(items).title?.name ?? ''; }

/** 打字頁鍵盤皮膚：設在 <html data-kb="..."> */
export function applyKeyboardSkin(items) {
  const kb = equippedItems(items).kb;
  if (kb) { document.documentElement.dataset.kb = kb.id; document.documentElement.style.setProperty('--kb-a', kb.colors[0]); document.documentElement.style.setProperty('--kb-b', kb.colors[1]); }
  else { delete document.documentElement.dataset.kb; }
}
