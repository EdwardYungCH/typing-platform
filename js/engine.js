// 打字引擎：逐字比對、計時、記錄每一下按鍵。
// 只接受真實鍵盤按鍵（isTrusted），不接受貼上或程式模擬的按鍵。

export class TypingEngine {
  /**
   * @param {object} opts
   * @param {string} opts.text            要打的文字
   * @param {'block'|'continue'} [opts.errorMode]  block：打錯要改正；continue：可繼續但記錯
   * @param {number} [opts.timeLimit]      時限（秒）；到時自動完結
   * @param {Function} [opts.onKey]        每次按鍵後呼叫 (event, engine)
   * @param {Function} [opts.onFinish]     完成時呼叫 (engine)
   * @param {Function} [opts.onTick]       計時中每 250 毫秒呼叫 (engine)
   */
  constructor({ text, errorMode = 'block', timeLimit = 0, onKey, onFinish, onTick }) {
    this.text = text;
    this.errorMode = errorMode;
    this.timeLimit = timeLimit;
    this.onKey = onKey;
    this.onFinish = onFinish;
    this.onTick = onTick;

    this.pos = 0;
    this.status = new Array(text.length).fill('todo'); // todo | ok | fixed | bad
    this.errorAt = new Set();
    this.keystrokes = [];   // { t, key, code, expected, ok }
    this.startTime = 0;
    this.endTime = 0;
    this.started = false;
    this.finished = false;
    this.paused = false;

    this._onKeyDown = (e) => this.handleKey(e);
    this._onPaste = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('paste', this._onPaste);
    window.addEventListener('drop', this._onPaste);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('paste', this._onPaste);
    window.removeEventListener('drop', this._onPaste);
    clearInterval(this._timer);
  }

  get expected() {
    return this.text[this.pos];
  }

  elapsedMs() {
    if (!this.started) return 0;
    return (this.finished ? this.endTime : performance.now()) - this.startTime;
  }

  remainingSec() {
    if (!this.timeLimit) return null;
    return Math.max(0, this.timeLimit - this.elapsedMs() / 1000);
  }

  start() {
    this.started = true;
    this.startTime = performance.now();
    this._timer = setInterval(() => {
      if (this.timeLimit && this.elapsedMs() >= this.timeLimit * 1000) this.finish();
      else this.onTick?.(this);
    }, 250);
  }

  handleKey(e) {
    if (this.finished || this.paused) return;
    if (!e.isTrusted) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.key === 'Process') return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.errorMode === 'continue' && this.pos > 0) {
        this.pos -= 1;
        this.status[this.pos] = 'todo';
        this.keystrokes.push({ t: this._now(), key: 'Backspace', code: e.code, expected: null, ok: null });
        this.lastKey = { key: 'Backspace', code: e.code, ok: true };
        this.onKey?.(e, this);
      }
      return;
    }

    if (e.key.length !== 1) return;  // Shift、Tab、方向鍵等不計
    e.preventDefault();               // 例如空白鍵不會捲動頁面
    if (e.repeat) return;             // 按住不放不計

    if (!this.started) this.start();

    const expected = this.expected;
    const ok = e.key === expected;
    this.keystrokes.push({ t: this._now(), key: e.key, code: e.code, expected, ok });

    if (ok) {
      this.status[this.pos] = this.errorAt.has(this.pos) ? 'fixed' : 'ok';
      this.pos += 1;
    } else {
      this.errorAt.add(this.pos);
      if (this.errorMode === 'continue') {
        this.status[this.pos] = 'bad';
        this.pos += 1;
      }
    }

    this.lastKey = { key: e.key, code: e.code, ok };
    this.onKey?.(e, this);
    if (this.pos >= this.text.length) this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.endTime = this.started ? performance.now() : 0;
    clearInterval(this._timer);
    this.detach();
    this.onFinish?.(this);
  }

  _now() {
    return Math.round(performance.now() - this.startTime);
  }
}

// ---- 題目產生 ----

// 可重現的亂數（同一個種子產生同一份題目，方便日後伺服器核對）。
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateText(spec, rng = makeRng()) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  if (spec.kind === 'groups') {
    const chars = [...spec.chars];
    const groups = [];
    for (let i = 0; i < spec.groups; i++) {
      const len = spec.minLen + Math.floor(rng() * (spec.maxLen - spec.minLen + 1));
      let g = '';
      for (let j = 0; j < len; j++) g += pick(chars);
      groups.push(g);
    }
    return groups.join(' ');
  }

  if (spec.kind === 'words') {
    const out = [];
    let last = '';
    while (out.length < spec.count) {
      const w = pick(spec.words);
      if (w === last && spec.words.length > 1) continue;
      out.push(w);
      last = w;
    }
    return out.join(' ');
  }

  throw new Error(`未知的題目類型：${spec.kind}`);
}
