// 速成雙色拆碼圖：用 Make Me a Hanzi 的筆畫（Arphic PL UKai 字形）畫字，首碼部件紅、尾碼部件藍。
// 資料由 tools/build_zh_glyphs.py 產生；只有核對過倉頡碼的字才有檔案，其餘回傳 null。

const cache = new Map();

export function loadGlyph(ch, base = '') {
  if (!cache.has(ch)) {
    cache.set(ch, fetch(`${base}assets/glyphs/${ch.codePointAt(0).toString(16)}.json`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(ch);
}

export function preloadGlyphs(chars, base = '') {
  return Promise.all([...new Set(chars)].map((c) => loadGlyph(c, base)));
}

/** 同步取得已載入的字形（未載入或沒有資料回傳 null）。 */
const ready = new Map();
export async function glyphData(ch, base = '') {
  const g = await loadGlyph(ch, base);
  ready.set(ch, g);
  return g;
}
export function glyphNow(ch) { return ready.get(ch) ?? null; }

/**
 * 畫字。mode：plain（全部同色）、color（首紅尾藍，其他淡灰）、f（只亮首碼部件）、l（只亮尾碼部件）。
 */
export function glyphSvg(g, mode = 'plain') {
  const cls = (r) => {
    if (mode === 'plain') return 'g-ink';
    if (mode === 'color') return r === 'f' ? 'g-first' : r === 'l' ? 'g-last' : 'g-dim';
    if (mode === 'f') return r === 'f' ? 'g-first' : 'g-ink';
    if (mode === 'l') return r === 'l' ? 'g-last' : 'g-ink';
    return 'g-ink';
  };
  const paths = g.s.map((d, i) => `<path class="${cls(g.r?.[i])}" d="${d}"/>`).join('');
  return `<svg class="glyph" viewBox="0 0 1024 1024" aria-hidden="true"><g transform="scale(1,-1) translate(0,-900)">${paths}</g></svg>`;
}
