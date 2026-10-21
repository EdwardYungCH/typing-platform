// 速成雙色拆碼圖：用 Make Me a Hanzi 的筆畫（Arphic PL UKai 字形）畫字，首碼部件紅、尾碼部件藍。
// 資料由 tools/build_zh_glyphs.py 產生；只有核對過倉頡碼的字才有檔案，其餘回傳 null。

const cache = new Map();
const ready = new Map();

export function loadGlyph(ch, base = '') {
  if (!cache.has(ch)) {
    cache.set(ch, fetch(`${base}assets/glyphs/${ch.codePointAt(0).toString(16)}.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(ch);
}

/** 一次載入一課的拆碼圖合集（tools/bundle_glyphs.py 產生）；之後同一課的字不用逐個抓。沒有的字仍會逐字抓。 */
const bundles = new Map();
export function loadGlyphBundle(name, base = '') {
  if (!bundles.has(name)) {
    bundles.set(name, fetch(`${base}assets/glyph-bundles/${name}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      .then((all) => { for (const [ch, g] of Object.entries(all)) { if (!cache.has(ch)) cache.set(ch, Promise.resolve(g)); ready.set(ch, g); } return all; }));
  }
  return bundles.get(name);
}

export function preloadGlyphs(chars, base = '') {
  return Promise.all([...new Set(chars)].map((c) => loadGlyph(c, base)));
}

/** 同步取得已載入的字形（未載入或沒有資料回傳 null）。 */
export async function glyphData(ch, base = '') {
  const g = await loadGlyph(ch, base);
  ready.set(ch, g);
  return g;
}
export function glyphNow(ch) { return ready.get(ch) ?? null; }

/**
 * 畫字。mode：plain（全部同色）、color（首紅尾藍，其他淡灰）、f（只亮首碼部件）、l（只亮尾碼部件）。
 */
let clipSeq = 0;
export function glyphSvg(g, mode = 'plain') {
  const cls = (r) => {
    if (mode === 'plain' || !g.r) return 'g-ink';
    if (mode === 'color') return r === 'f' ? 'g-first' : r === 'l' ? 'g-last' : 'g-dim';
    if (mode === 'f') return r === 'f' ? 'g-first' : 'g-ink';
    if (mode === 'l') return r === 'l' ? 'g-last' : 'g-ink';
    return 'g-ink';
  };
  // 切開的一筆（r 為 's'）：g.c[i] = [軸 'x'|'y', 值, 細於該值那段的角色, 大於等於那段的角色]，用兩個半平面裁切分開上色
  let defs = '';
  const paths = g.s.map((d, i) => {
    const c = g.r?.[i] === 's' && g.c?.[i];
    if (!c || mode === 'plain') return `<path class="${cls(g.r?.[i] === 's' ? '.' : g.r?.[i])}" d="${d}"/>`;
    // c = [軸, 切點, 各段角色]；舊格式 [軸, 值, 低段, 高段] 照樣支援
    const [ax, cut, ...rest] = c;
    const bounds = Array.isArray(cut) ? cut : [cut];
    const segs = Array.isArray(cut) ? rest[0] : rest;
    const edges = [-400, ...bounds, 1400];
    const rect = (a, b) => ax === 'x' ? `<rect x="${a}" y="-400" width="${b - a}" height="1800"/>` : `<rect x="-400" y="${a}" width="1800" height="${b - a}"/>`;
    return segs.map((role, k) => {
      const id = `gc${++clipSeq}`;
      defs += `<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${rect(edges[k], edges[k + 1])}</clipPath>`;
      return `<path class="${cls(role)}" d="${d}" clip-path="url(#${id})"/>`;
    }).join('');
  }).join('');
  return `<svg class="glyph" viewBox="0 0 1024 1024" aria-hidden="true"><g transform="scale(1,-1) translate(0,-900)">${defs ? `<defs>${defs}</defs>` : ''}${paths}</g></svg>`;
}
