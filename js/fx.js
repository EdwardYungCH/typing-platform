// 特效：連擊計數、粒子、夥伴歡呼。強度：0 關、1 輕、2 完整。
// 評測（focus 模式）時一律關閉，避免分心。

import { sfx } from './sound.js';

const MILESTONES = [10, 25, 50, 100, 200];

export class Fx {
  /** @param {{host: HTMLElement, pet?: HTMLElement|null, level: number, sound: boolean}} o */
  constructor({ host, pet = null, level = 1, sound = true }) {
    this.host = host;
    this.pet = pet;
    this.level = level;
    this.sound = sound;
    this.focus = false;
    this.combo = 0;
    this.best = 0;
    this.badge = document.createElement('div');
    this.badge.className = 'combo';
    this.badge.hidden = true;
    this.badge.setAttribute('aria-hidden', 'true');
    host.append(this.badge);
  }

  setFocus(on) {
    this.focus = on;
    if (on) this.reset();
  }

  get active() { return !this.focus && this.level > 0; }
  get playSound() { return !this.focus && this.sound; }

  reset() {
    this.combo = 0;
    this.badge.hidden = true;
  }

  /** 每次按鍵後呼叫。 */
  key(ok) {
    if (this.playSound) (ok ? sfx.key() : sfx.error());
    if (!ok) { this.reset(); return; }
    this.combo += 1;
    this.best = Math.max(this.best, this.combo);
    if (!this.active) return;
    if (this.combo >= 5) {
      this.badge.hidden = false;
      this.badge.textContent = `連擊 ×${this.combo}`;
      this.badge.classList.remove('bump');
      void this.badge.offsetWidth;
      this.badge.classList.add('bump');
      this.badge.dataset.tier = this.combo >= 50 ? '3' : this.combo >= 25 ? '2' : this.combo >= 10 ? '1' : '0';
    }
    if (MILESTONES.includes(this.combo)) this.milestone();
  }

  milestone() {
    const tier = MILESTONES.indexOf(this.combo) + 1;
    if (this.playSound) sfx.combo(tier);
    this.cheer();
    if (this.level >= 2) this.burst(8 + tier * 4);
  }

  cheer() {
    if (!this.pet || this.pet.hidden) return;
    this.pet.classList.remove('cheer');
    void this.pet.offsetWidth;
    this.pet.classList.add('cheer');
  }

  burst(n) {
    const r = this.badge.getBoundingClientRect();
    const h = this.host.getBoundingClientRect();
    const cx = (r.left + r.width / 2) - h.left;
    const cy = (r.top + r.height / 2) - h.top;
    const glyphs = ['✦', '★', '✧', '•'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'spark';
      p.textContent = glyphs[i % glyphs.length];
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const d = 50 + Math.random() * 60;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      p.style.color = i % 2 ? 'var(--star)' : 'var(--accent)';
      this.host.append(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }

  /** 完成一步。 */
  finish({ stars = 0, evolved = false } = {}) {
    if (this.focus) return;
    if (this.sound) (evolved ? sfx.evolve() : sfx.win(stars));
  }
}
