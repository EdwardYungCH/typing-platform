// 內置速成引擎：模擬微軟速成「打碼 → 選字」，並記錄每一下按鍵。
// 介面跟 TypingEngine 相同（pos、status、keystrokes、elapsedMs…），打字頁可以共用。
// block 模式（課堂練習）：按錯的鍵不會入組字框，揀錯字不會上屏；
// continue 模式（評測）：可以打錯、揀錯，錯字照樣上屏並記錄。

export const PAGE = 9; // 微軟速成每頁 9 個候選字

// 微軟速成（全形標點）：組字框空着時按這些鍵，直接打出中文標點
export const PUNCT = { ',': '，', '.': '。', ';': '；', ':': '：', '?': '？', '!': '！', '[': '「', ']': '」', '\\': '、' };
export const KEY_OF_PUNCT = Object.fromEntries(Object.entries(PUNCT).map(([k, v]) => [v, k]));

export class QuickEngine {
  /**
   * @param {object} o
   * @param {string} o.text 要打的中文字（每個字一格）
   * @param {object} o.zh   loadZh() 的結果
   */
  constructor({ text, zh, errorMode = 'block', timeLimit = 0, onKey, onFinish, onTick, onIme }) {
    this.chars = [...text];
    this.text = this.chars;              // 打字頁用 text[pos] 和 text.length
    this.zh = zh;
    this.errorMode = errorMode;
    this.timeLimit = timeLimit;
    this.onKey = onKey;
    this.onFinish = onFinish;
    this.onTick = onTick;
    this.onIme = onIme;

    this.pos = 0;
    this.status = new Array(this.chars.length).fill('todo');
    this.errorAt = new Set();
    this.keystrokes = [];
    this.comp = '';      // 組字框內的碼
    this.page = 0;       // 候選字頁數
    this.committed = []; // 實際上屏的字
    this.started = false;
    this.finished = false;
    this.startTime = 0;
    this.endTime = 0;

    this._onKeyDown = (e) => this.handleKey(e);
    this._block = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('paste', this._block);
    window.addEventListener('drop', this._block);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('paste', this._block);
    window.removeEventListener('drop', this._block);
    clearInterval(this._timer);
  }

  get expectedChar() { return this.chars[this.pos]; }
  get expectedCode() { return this.zh.quickOf(this.expectedChar) ?? ''; }

  /** 目前組字框的候選字（全部）。 */
  get candidates() { return this.comp ? this.zh.candidates(this.comp) : []; }

  /** 目前這一頁的候選字。 */
  get pageItems() { return this.candidates.slice(this.page * PAGE, this.page * PAGE + PAGE); }

  /** 下一個應該按的鍵（給虛擬鍵盤和手形提示用）：字母、' '、數字、'Backspace'、'PageDown'。 */
  nextKey() {
    const ch = this.expectedChar;
    if (ch === undefined) return null;
    if (KEY_OF_PUNCT[ch]) return this.comp ? 'Backspace' : KEY_OF_PUNCT[ch];
    const code = this.expectedCode;
    if (!code) return null;
    if (!code.startsWith(this.comp)) return 'Backspace';
    if (this.comp.length < code.length) return code[this.comp.length];
    const idx = this.zh.candidates(code).indexOf(ch);
    const page = Math.floor(idx / PAGE);
    if (page > this.page) return 'PageDown';
    if (page < this.page) return 'PageUp';
    const n = idx % PAGE;
    return n === 0 ? ' ' : String(n + 1);
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
    if (this.finished) return;
    if (!e.isTrusted) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // 學生開着系統中文輸入法：網站收不到英文字母，提示他切換
    if (e.isComposing || e.key === 'Process') { this.onIme?.(); return; }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const isLetter = /^[a-y]$/.test(key) || key === 'x';
    const isPick = key === ' ' || /^[1-9]$/.test(key);
    const isNav = key === 'PageDown' || key === 'PageUp' || key === 'Backspace' || key === 'Escape';
    const isPunct = !!PUNCT[key] && !this.comp;
    if (!isLetter && !isPick && !isNav && !isPunct) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!this.started) this.start();

    const want = this.nextKey();
    let ok = true;

    if (key === 'Backspace' || key === 'Escape') {
      if (!this.comp) return;
      this.comp = key === 'Escape' ? '' : this.comp.slice(0, -1);
      this.page = 0;
      this._log(e, key, want, null);
    } else if (key === 'PageDown' || key === 'PageUp') {
      const pages = Math.ceil(this.candidates.length / PAGE);
      if (!pages) return;
      this.page = Math.min(Math.max(this.page + (key === 'PageDown' ? 1 : -1), 0), pages - 1);
      this._log(e, key, want, null);
    } else if (isPunct) {
      const right = PUNCT[key] === this.expectedChar;
      ok = right;
      this._log(e, key, want, ok);
      if (right) this._commit(PUNCT[key], true);
      else {
        this.errorAt.add(this.pos);
        if (this.errorMode === 'continue') this._commit(PUNCT[key], false);
      }
    } else if (isLetter) {
      ok = key === want;
      if (this.comp.length >= 2) ok = false;            // 速成最多兩碼
      else if (ok || this.errorMode === 'continue') { this.comp += key; this.page = 0; }
      this._log(e, key, want, ok);
      if (!ok) this.errorAt.add(this.pos);
    } else if (isPick) {
      const n = key === ' ' ? 0 : Number(key) - 1;
      const pick = this.pageItems[n];
      const right = pick !== undefined && pick === this.expectedChar;
      ok = right;
      this._log(e, key, want, ok);
      if (right) this._commit(pick, true);
      else {
        this.errorAt.add(this.pos);
        if (this.errorMode === 'continue' && pick !== undefined) this._commit(pick, false);
      }
    }

    this.lastKey = { key, code: e.code, ok };
    this.onKey?.(e, this);
    if (this.pos >= this.chars.length) this.finish();
  }

  _commit(ch, right) {
    this.committed.push(ch);
    this.status[this.pos] = right ? (this.errorAt.has(this.pos) ? 'fixed' : 'ok') : 'bad';
    this.pos += 1;
    this.comp = '';
    this.page = 0;
  }

  _log(e, key, expected, ok) {
    this.keystrokes.push({ t: Math.round(performance.now() - this.startTime), key, code: e.code, expected, ok });
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.endTime = this.started ? performance.now() : 0;
    clearInterval(this._timer);
    this.detach();
    this.onFinish?.(this);
  }
}

/** 中文成績：字／分鐘（只計正確上屏的字），準確率按鍵計算。 */
export function computeZhStats(eng) {
  const ms = eng.elapsedMs();
  const minutes = ms / 60000;
  const keys = eng.keystrokes.filter((k) => k.ok !== null);
  const correctKeys = keys.filter((k) => k.ok).length;
  const right = eng.status.filter((s) => s === 'ok' || s === 'fixed').length;
  const cpm = minutes > 0 ? right / minutes : 0;
  return {
    seconds: ms / 1000,
    typed: eng.pos,
    totalKeys: keys.length,
    correctKeys,
    errors: keys.length - correctKeys,
    uncorrected: eng.status.filter((s) => s === 'bad').length,
    netWpm: cpm,      // 沿用欄位名稱，令星級和過關計算可共用；單位是「字／分鐘」
    grossWpm: cpm,
    cpm,
    accuracy: keys.length ? (correctKeys / keys.length) * 100 : 100,
  };
}
