// 速度、準確率和星級計算。
// 這裏的結果只作即時顯示；第 4 階段起，正式成績由伺服器用按鍵紀錄重新計算。

/** 英文：每 5 個字元（包括空格）當作 1 個字。 */
export function computeStats(engine) {
  const ms = engine.elapsedMs();
  const minutes = ms / 60000;
  const charKeys = engine.keystrokes.filter((k) => k.ok !== null);
  const total = charKeys.length;
  const correct = charKeys.filter((k) => k.ok).length;
  const typed = engine.pos;
  const uncorrected = engine.status.filter((s) => s === 'bad').length;

  const gross = minutes > 0 ? typed / 5 / minutes : 0;
  const net = minutes > 0 ? Math.max(0, gross - uncorrected / minutes) : 0;
  const accuracy = total > 0 ? (correct / total) * 100 : 100;

  return {
    seconds: ms / 1000,
    typed,
    totalKeys: total,
    correctKeys: correct,
    errors: total - correct,
    uncorrected,
    grossWpm: gross,
    netWpm: net,
    accuracy,
    keyErrors: keyErrorTable(charKeys),
    speedCurve: speedCurve(charKeys, ms),
  };
}

/** 每個「應該按的字元」打錯幾次、平均反應時間（熱圖和弱鍵用）。 */
function keyErrorTable(keys) {
  const table = {};
  let prevT = 0;
  for (const k of keys) {
    const ch = k.expected;
    if (ch === undefined || ch === null) continue;
    const row = (table[ch] ??= { tries: 0, errors: 0, timeSum: 0, hits: 0 });
    row.tries += 1;
    if (!k.ok) row.errors += 1;
    else {
      row.timeSum += k.t - prevT;
      row.hits += 1;
    }
    prevT = k.t;
  }
  return table;
}

/** 每 5 秒的速度（WPM），畫速度曲線用。 */
function speedCurve(keys, ms) {
  const bucket = 5000;
  const n = Math.max(1, Math.ceil(ms / bucket));
  const counts = new Array(n).fill(0);
  for (const k of keys) {
    if (!k.ok) continue;
    counts[Math.min(n - 1, Math.floor(k.t / bucket))] += 1;
  }
  return counts.map((c) => (c / 5) / (bucket / 60000));
}

/**
 * 星級：未達過關條件 0 粒；達到 1 粒；更好 2–3 粒（規則在 data/levels.json）。
 * @param {{accuracy?:number, wpm?:number}} pass  過關條件
 */
export function starsFor(stats, pass, rules) {
  const accNeed = pass.accuracy ?? 0;
  const wpmNeed = pass.wpm ?? 0;
  const passed = stats.accuracy >= accNeed && stats.netWpm >= wpmNeed;
  if (!passed) return 0;

  const accOver = stats.accuracy - accNeed;
  if (!wpmNeed) {
    if (accOver >= rules.three.accPlus) return 3;
    if (accOver >= rules.two.accPlus) return 2;
    return 1;
  }
  const ratio = stats.netWpm / wpmNeed;
  if (ratio >= rules.three.speedRatio && accOver >= rules.three.accPlus) return 3;
  if (ratio >= rules.two.speedRatio || accOver >= rules.two.accPlus) return 2;
  return 1;
}

export function fmt(n, digits = 0) {
  return Number.isFinite(n) ? n.toFixed(digits) : '0';
}

/** 準確率向下取整，免得 99.8% 顯示成 100% 而學生以為零錯誤。 */
export function fmtAcc(n) {
  return Number.isFinite(n) ? String(Math.floor(n)) : '100';
}
