// 世界主題：英文 = 鍵帽星系（planet），中文 = 字根魔法學院（magic）。
// 頁面只要呼叫 applyWorld('planet' | 'magic')，顏色和背景就會整套切換。

export const WORLD_OF_LANG = { en: 'planet', zh: 'magic' };

export function applyWorld(world) {
  document.documentElement.dataset.world = world;
}

export function worldForLang(lang) {
  return WORLD_OF_LANG[lang] ?? 'planet';
}
