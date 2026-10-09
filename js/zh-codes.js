// 中文碼表：速成碼、選字次序、倉頡全碼、字根名稱。
// 資料由 tools/build_zh_codes.py 產生（data/zh-codes.json）。

export const ROOTS = {
  a: '日', b: '月', c: '金', d: '木', e: '水', f: '火', g: '土',
  h: '竹', i: '戈', j: '十', k: '大', l: '中', m: '一', n: '弓',
  o: '人', p: '心', q: '手', r: '口',
  s: '尸', t: '廿', u: '山', v: '女', w: '田', y: '卜',
  x: '難',
};

export const ROOT_GROUPS = [
  { name: '哲理類', keys: 'abcdefg' },
  { name: '筆畫類', keys: 'hijklmn' },
  { name: '人體類', keys: 'opqr' },
  { name: '字形類', keys: 'stuvwy' },
  { name: '特別鍵', keys: 'x' },
];

let cache = null;

/** 讀取碼表（只讀一次）。路徑相對於目前頁面，子資料夾頁面傳入 '../'。 */
export async function loadZh(base = '') {
  if (cache) return cache;
  const d = await fetch(`${base}data/zh-codes.json`).then((r) => r.json());
  const q = new Map();
  for (const code of Object.keys(d.quick).sort()) {
    for (const ch of d.quick[code]) if (!q.has(ch)) q.set(ch, code);
  }
  for (const [ch, code] of Object.entries(d.qfix)) q.set(ch, code);
  cache = {
    quickOf: (ch) => q.get(ch) ?? null,
    cjOf: (ch) => d.cj[ch] ?? null,
    /** 某速成碼的候選字（微軟速成次序） */
    candidates: (code) => [...(d.quick[code] ?? '')],
    common: [...d.common],
    source: d._source,
  };
  return cache;
}

/** 某字在它的速成碼候選字中排第幾（1 起計）；找不到回傳 0。 */
export function candidateIndex(zh, ch) {
  const code = zh.quickOf(ch);
  if (!code) return 0;
  return zh.candidates(code).indexOf(ch) + 1;
}

/** 輔助字形的顯示：有文字用文字，沒有就用字形表圖片（CSS mask 上色）。 */
// 注意：CSS 自訂屬性裏的相對網址會按樣式表位置解釋，所以這裏先轉成完整網址
const abs = (path) => new URL(path, document.baseURI).href;

export function shapeGlyph(sh, base = '') {
  if (sh.img) return `<span class="sg" role="img" aria-label="${sh.name}" style="--sg:url('${abs(`${base}assets/shapes/${sh.img}.png`)}')"></span>`;
  return sh.shape;
}

/** 字形表圖片中某個鍵的全部字形。 */
export function chartGlyphs(key, count, base = '') {
  return Array.from({ length: count }, (_, i) =>
    `<span class="sg" role="img" aria-label="${ROOTS[key]}的輔助字形" style="--sg:url('${abs(`${base}assets/shapes/${key}-${i}.png`)}')"></span>`).join('');
}
