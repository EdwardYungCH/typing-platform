// 虛擬鍵盤和手形提示。
// 畫出鍵盤（按手指上色）、令下一個要按的鍵發光、按下時有動畫，並在手形圖標示手指。

let fingerData = null;

export async function loadFingers() {
  if (fingerData) return fingerData;
  const res = await fetch('data/fingers.json');
  fingerData = await res.json();
  fingerData.byCode = {};
  fingerData.byChar = {};
  for (const row of fingerData.layout) {
    for (const k of row) {
      fingerData.byCode[k.code] = k;
      if (k.key !== undefined) fingerData.byChar[k.key] = { code: k.code, shift: false, finger: k.finger };
      if (k.shift !== undefined) fingerData.byChar[k.shift] = { code: k.code, shift: true, finger: k.finger };
    }
  }
  return fingerData;
}

// 某個字元要按哪個鍵、用哪隻手指；大寫和符號要配合對側的 Shift。
export function keyForChar(ch) {
  const info = fingerData?.byChar[ch];
  if (!info) return null;
  if (!info.shift) return info;
  const hand = info.finger[0];
  const shiftCode = hand === 'L' ? 'ShiftRight' : 'ShiftLeft';
  return { ...info, shiftCode, shiftFinger: hand === 'L' ? 'R5' : 'L5' };
}

export function fingerName(id) {
  return fingerData?.fingers[id]?.name ?? '';
}

function keyLabel(k) {
  if (k.label !== undefined) return k.label;
  if (/^[a-z]$/.test(k.key)) return k.key.toUpperCase();
  return k.key;
}

export class VirtualKeyboard {
  constructor(container, { showFingers = true, compact = false } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'vkb' + (compact ? ' compact' : '');
    this.root.setAttribute('aria-hidden', 'true');
    this.keys = {};
    this.showFingers = showFingers;
    container.append(this.root);
    this.render();
  }

  render() {
    const data = fingerData;
    for (const row of data.layout) {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkb-row';
      for (const k of row) {
        if (k.offset) {
          const pad = document.createElement('div');
          pad.className = 'vkb-pad';
          pad.style.flexGrow = k.offset;
          rowEl.append(pad);
        }
        const el = document.createElement('div');
        const color = data.fingers[k.finger].color;
        el.className = `vkb-key f-${color}`;
        el.style.flexGrow = k.width ?? 1;
        el.dataset.code = k.code;
        if (data.bumps.includes(k.code)) el.classList.add('bump');
        if (k.label !== undefined) el.classList.add('mod');
        const cap = document.createElement('span');
        cap.className = 'cap';
        cap.textContent = keyLabel(k);
        el.append(cap);
        if (k.shift && !/^[A-Z]$/.test(k.shift)) {
          const sub = document.createElement('span');
          sub.className = 'cap-shift';
          sub.textContent = k.shift;
          el.append(sub);
        }
        rowEl.append(el);
        this.keys[k.code] = el;
      }
      if (row[0].offset) {
        const pad = document.createElement('div');
        pad.className = 'vkb-pad';
        pad.style.flexGrow = 15 - row[0].offset - (row[0].width ?? 1);
        rowEl.append(pad);
      }
      this.root.append(rowEl);
    }
    this.setFingers(this.showFingers);
  }

  setFingers(on) {
    this.showFingers = on;
    this.root.classList.toggle('show-fingers', on);
  }

  // 只顯示某些鍵的顏色（例如課堂只教的新鍵）；null 表示全部。
  focusKeys(codes) {
    for (const [code, el] of Object.entries(this.keys)) {
      el.classList.toggle('dim', !!codes && !codes.includes(code));
    }
  }

  setNext(codes) {
    for (const el of this.root.querySelectorAll('.next')) el.classList.remove('next');
    for (const code of codes ?? []) this.keys[code]?.classList.add('next');
  }

  press(code, ok = true) {
    const el = this.keys[code];
    if (!el) return;
    el.classList.remove('down', 'wrong');
    void el.offsetWidth;
    el.classList.add(ok ? 'down' : 'wrong');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('down', 'wrong'), 220);
  }

  setHidden(hidden) {
    this.root.classList.toggle('blind', hidden);
  }
}

// 手形圖：兩隻手的俯視圖，標示要用的手指。
const HAND_SVG = `
<svg viewBox="0 0 420 150" class="hands-svg" role="img" aria-label="手形提示">
  <g class="hand left">
    <rect class="palm" x="28" y="78" width="132" height="64" rx="26"/>
    <rect class="finger f-violet" data-finger="L5" x="30" y="44" width="24" height="52" rx="12"/>
    <rect class="finger f-blue"   data-finger="L4" x="60" y="22" width="25" height="72" rx="12.5"/>
    <rect class="finger f-green"  data-finger="L3" x="91" y="12" width="25" height="82" rx="12.5"/>
    <rect class="finger f-orange" data-finger="L2" x="122" y="24" width="25" height="70" rx="12.5"/>
    <rect class="finger f-gray thumb" data-finger="TH" x="150" y="88" width="48" height="24" rx="12" transform="rotate(-24 150 100)"/>
  </g>
  <g class="hand right">
    <rect class="palm" x="260" y="78" width="132" height="64" rx="26"/>
    <rect class="finger f-orange" data-finger="R2" x="273" y="24" width="25" height="70" rx="12.5"/>
    <rect class="finger f-green"  data-finger="R3" x="304" y="12" width="25" height="82" rx="12.5"/>
    <rect class="finger f-blue"   data-finger="R4" x="335" y="22" width="25" height="72" rx="12.5"/>
    <rect class="finger f-violet" data-finger="R5" x="366" y="44" width="24" height="52" rx="12"/>
    <rect class="finger f-gray thumb" data-finger="TH" x="222" y="88" width="48" height="24" rx="12" transform="rotate(24 270 100)"/>
  </g>
</svg>`;

export class Hands {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'hands';
    this.root.innerHTML = HAND_SVG + '<p class="hands-label" aria-live="polite"></p>';
    this.label = this.root.querySelector('.hands-label');
    container.append(this.root);
  }

  setFinger(ids, text = '') {
    for (const f of this.root.querySelectorAll('.finger')) {
      f.classList.toggle('active', ids.includes(f.dataset.finger));
    }
    this.label.textContent = text;
  }
}
