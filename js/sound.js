// 音效：全部用瀏覽器內置的 Web Audio 即時合成，不需要音效檔。
// 學生可在打字頁頂欄關閉；評測時自動靜音（專注模式）。

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = null, t = 0.08, type = 'sine', v = 0.08, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + t + 0.02);
}

export const sfx = {
  key() { if (enabled) tone({ f: 620 + Math.random() * 60, f2: 380, t: 0.05, type: 'triangle', v: 0.05 }); },
  error() { if (enabled) tone({ f: 170, f2: 110, t: 0.14, type: 'sine', v: 0.09 }); },
  combo(level = 1) {
    if (!enabled) return;
    const base = 523.25 * Math.pow(1.122, Math.min(level, 4));
    [0, 4, 7].forEach((st, i) => tone({ f: base * Math.pow(2, st / 12), t: 0.18, type: 'sine', v: 0.07, delay: i * 0.06 }));
  },
  win(stars = 1) {
    if (!enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.slice(0, 2 + Math.min(stars, 2)).forEach((f, i) => tone({ f, t: 0.22, type: 'triangle', v: 0.08, delay: i * 0.09 }));
  },
  evolve() {
    if (!enabled) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone({ f, t: 0.3, type: 'sine', v: 0.07, delay: i * 0.1 }));
  },
};
