// 中文題目產生：字根按鍵（roots）、指定字庫抽字（chars）。

export function generateZh(gen, rng) {
  if (gen.kind === 'roots') {
    const keys = [...gen.keys];
    let out = '';
    let prev = '';
    for (let i = 0; i < gen.count; i++) {
      let k;
      do { k = keys[Math.floor(rng() * keys.length)]; } while (keys.length > 1 && k === prev && rng() < 0.7);
      out += k;
      prev = k;
    }
    return out;
  }
  if (gen.kind === 'chars') {
    const pool = [...gen.chars];
    const out = [];
    for (let i = 0; i < gen.count; i++) {
      let c;
      do { c = pool[Math.floor(rng() * pool.length)]; } while (pool.length > 1 && c === out[out.length - 1]);
      out.push(c);
    }
    return out.join('');
  }
  throw new Error(`未知的中文題目類型：${gen.kind}`);
}
