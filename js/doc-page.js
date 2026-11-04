// 長文頁面：把 data/site.json 的產品資料填入 [data-site="欄位"]（產品名稱、營運者、聯絡電郵、更新日期）。
import { applyWorld } from './world.js';

applyWorld('planet');
const base = document.documentElement.dataset.base ?? '';
try {
  const site = await fetch(`${base}data/site.json`).then((r) => r.json());
  for (const el of document.querySelectorAll('[data-site]')) {
    const v = site[el.dataset.site];
    if (el.dataset.site === 'contactEmail') {
      if (v) { el.textContent = v; if (el.tagName === 'A') el.href = `mailto:${v}`; }
      else el.textContent = '（請向學校查詢）';
    } else if (v != null && v !== '') el.textContent = v;
  }
} catch { /* 讀不到就用頁面上的預設字 */ }
