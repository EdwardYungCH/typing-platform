// 戰鬥層：打字頁上方的「夥伴 vs 怪物」。
// 怪物 HP＝這一步要打的字數，打對一個字夥伴攻擊一次；打錯怪物反擊，夥伴扣 1 HP。
// 夥伴 HP 歸零只是「倒下」重打這一步（不影響星星）。正式評測（評測塔）不用戰鬥層。
// 怪物全部原創，按世界和步驟輪流出場；過關小測是 BOSS。

const MONSTERS = {
  planet: [
    { name: '蘑菇小兵', svg: '<ellipse cx="50" cy="40" rx="44" ry="30" fill="#e63946"/><circle cx="30" cy="30" r="7" fill="#fff"/><circle cx="60" cy="22" r="6" fill="#fff"/><circle cx="72" cy="42" r="5" fill="#fff"/><rect x="30" y="60" width="40" height="40" rx="12" fill="#ffe8c8"/><circle cx="42" cy="76" r="4" fill="#1f2a44"/><circle cx="58" cy="76" r="4" fill="#1f2a44"/><path d="M42 90 q8 -6 16 0" stroke="#1f2a44" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="32" y="100" width="12" height="12" rx="4" fill="#c97b3a"/><rect x="56" y="100" width="12" height="12" rx="4" fill="#c97b3a"/>' },
    { name: '鍵帽小滴', svg: '<path d="M50 10 C 30 40, 15 55, 15 75 a35 35 0 0 0 70 0 C 85 55, 70 40, 50 10z" fill="#5bc0ff" stroke="#1d6fd8" stroke-width="3"/><circle cx="40" cy="72" r="5" fill="#1f2a44"/><circle cx="60" cy="72" r="5" fill="#1f2a44"/><path d="M40 86 q10 8 20 0" stroke="#1f2a44" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="38" y="30" width="24" height="16" rx="4" fill="#fff" opacity=".7"/>' },
    { name: '太空章魚', svg: '<circle cx="50" cy="45" r="32" fill="#c4a6ff" stroke="#7c3aed" stroke-width="3"/><circle cx="38" cy="42" r="6" fill="#fff"/><circle cx="62" cy="42" r="6" fill="#fff"/><circle cx="40" cy="43" r="3" fill="#1f2a44"/><circle cx="64" cy="43" r="3" fill="#1f2a44"/><path d="M20 70 q-10 30 5 40 M35 76 q-5 30 8 36 M50 78 q0 30 0 36 M65 76 q5 30 -8 36 M80 70 q10 30 -5 40" stroke="#7c3aed" stroke-width="8" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="20" rx="36" ry="10" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>' },
    { name: '機械蜘蛛', svg: '<ellipse cx="50" cy="60" rx="30" ry="24" fill="#8a94a8" stroke="#4b5878" stroke-width="3"/><circle cx="40" cy="55" r="6" fill="#ff5a5f"/><circle cx="60" cy="55" r="6" fill="#ff5a5f"/><path d="M22 50 l-18 -20 M22 62 l-20 4 M24 74 l-16 22 M78 50 l18 -20 M78 62 l20 4 M76 74 l16 22" stroke="#4b5878" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="42" y="72" width="16" height="6" rx="2" fill="#1f2a44"/>' },
    { name: '星海巨獸', boss: true, svg: '<path d="M10 95 Q 20 30 50 25 Q 80 30 90 95z" fill="#1d6fd8" stroke="#0b2a8a" stroke-width="3"/><path d="M50 25 l-8 -18 l8 6 l8 -6z" fill="#ffd23c"/><circle cx="38" cy="58" r="8" fill="#fff"/><circle cx="62" cy="58" r="8" fill="#fff"/><circle cx="40" cy="60" r="4" fill="#1f2a44"/><circle cx="64" cy="60" r="4" fill="#1f2a44"/><path d="M34 78 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8" stroke="#fff" stroke-width="3" fill="none"/><path d="M10 95 l-8 -14 M90 95 l8 -14" stroke="#0b2a8a" stroke-width="4"/>' },
  ],
  magic: [
    { name: '亂碼幽靈', svg: '<path d="M20 100 V 50 a30 30 0 0 1 60 0 V 100 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8z" fill="#f3e8ff" stroke="#6d4fc0" stroke-width="3"/><circle cx="40" cy="50" r="5" fill="#2e1065"/><circle cx="60" cy="50" r="5" fill="#2e1065"/><path d="M42 66 q8 6 16 0" stroke="#2e1065" stroke-width="3" fill="none" stroke-linecap="round"/><text x="24" y="92" font-size="14" font-family="Noto Sans TC" font-weight="900" fill="#6d4fc0">月日？</text>' },
    { name: '墨水妖', svg: '<path d="M50 15 C 25 45, 12 60, 12 78 a38 38 0 0 0 76 0 C 88 60, 75 45, 50 15z" fill="#2e1065" stroke="#1a0940" stroke-width="3"/><circle cx="38" cy="74" r="6" fill="#fff"/><circle cx="62" cy="74" r="6" fill="#fff"/><circle cx="40" cy="75" r="3" fill="#2e1065"/><circle cx="64" cy="75" r="3" fill="#2e1065"/><path d="M40 90 q10 -6 20 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="20" cy="40" r="5" fill="#2e1065"/><circle cx="82" cy="50" r="4" fill="#2e1065"/>' },
    { name: '書蟲', svg: '<rect x="15" y="60" width="70" height="40" rx="6" fill="#c97b3a" stroke="#8b5a2b" stroke-width="3"/><rect x="22" y="66" width="56" height="28" fill="#fff6c8"/><circle cx="30" cy="48" r="14" fill="#7fe0a0" stroke="#1f8f4e" stroke-width="3"/><circle cx="50" cy="48" r="14" fill="#7fe0a0" stroke="#1f8f4e" stroke-width="3"/><circle cx="70" cy="48" r="14" fill="#7fe0a0" stroke="#1f8f4e" stroke-width="3"/><circle cx="74" cy="44" r="3" fill="#1f2a44"/><circle cx="66" cy="44" r="3" fill="#1f2a44"/><path d="M78 36 l6 -10 M64 36 l-6 -10" stroke="#1f8f4e" stroke-width="3"/>' },
    { name: '筆靈', svg: '<rect x="42" y="10" width="16" height="70" rx="4" fill="#ffd23c" stroke="#b58f00" stroke-width="3"/><path d="M42 80 l8 18 l8 -18z" fill="#ffe8c8" stroke="#b58f00" stroke-width="3"/><path d="M46 92 l4 6 l4 -6z" fill="#2e1065"/><rect x="40" y="10" width="20" height="12" rx="3" fill="#ff8a9a"/><circle cx="47" cy="40" r="3" fill="#2e1065"/><circle cx="53" cy="40" r="3" fill="#2e1065"/><path d="M46 50 q4 4 8 0" stroke="#2e1065" stroke-width="2" fill="none"/><path d="M30 30 q-15 10 -5 25 M70 30 q15 10 5 25" stroke="#c4a6ff" stroke-width="4" fill="none" stroke-linecap="round"/>' },
    { name: '錯字大魔王', boss: true, svg: '<path d="M15 95 Q 15 25 50 20 Q 85 25 85 95z" fill="#5b2ea6" stroke="#2e1065" stroke-width="3"/><path d="M28 30 l-10 -20 l16 10z M72 30 l10 -20 l-16 10z" fill="#2e1065"/><circle cx="38" cy="55" r="9" fill="#ffd23c"/><circle cx="62" cy="55" r="9" fill="#ffd23c"/><circle cx="40" cy="56" r="4" fill="#2e1065"/><circle cx="64" cy="56" r="4" fill="#2e1065"/><path d="M34 76 l8 8 l8 -8 l8 8 l8 -8" stroke="#ffd23c" stroke-width="3" fill="none"/><text x="36" y="92" font-size="16" font-family="Noto Sans TC" font-weight="900" fill="#ff8a9a">錯</text>' },
  ],
};

const CHEER = ['好球！', '命中！', '再來！', '漂亮！', '連擊！'];
const HURT = ['哎呀！', '小心！', '慢慢來！', '先求準！'];

export class Battle {
  /** @param {{ host: HTMLElement, world: string, petSrc: string|null, petName: string, petHtml: (src:string)=>string }} o */
  constructor({ host, world, petSrc, petName, petHtml, shield = false }) {
    this.host = host; this.world = world; this.petSrc = petSrc; this.petName = petName; this.petHtml = petHtml; this.shield = shield;
    this.active = false;
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onDown = null;   // 夥伴倒下時呼叫（重打這一步）
  }

  /** 開始一戰：total＝要打的字數，boss＝過關小測 */
  start({ total, boss = false, index = 0 }) {
    const list = MONSTERS[this.world] ?? MONSTERS.planet;
    const m = boss ? list[list.length - 1] : list[index % (list.length - 1)];
    this.monster = m; this.total = Math.max(1, total); this.hp = this.total;
    this.petMax = Math.max(8, Math.round(this.total / 4)); this.petHp = this.petMax;
    this.combo = 0; this.active = true; this.shieldLeft = this.shield ? 1 : 0;
    this.host.hidden = false;
    this.host.innerHTML = `<div class="bt-side pet">${this.petSrc ? this.petHtml(this.petSrc) : '<div class="bt-nopet"></div>'}<div class="win bt-bar"><div class="bt-row"><b>${this.petName}</b><span id="bt-pet-hp">${this.petHp} / ${this.petMax}</span></div><div class="bt-hp"><i id="bt-pet-bar" style="width:100%;background:#7fe0a0"></i></div></div></div>
      <div class="bt-mid"><div class="bt-say" id="bt-say" hidden></div><div class="bt-vs">${boss ? 'BOSS' : 'VS'}</div></div>
      <div class="bt-side mon"><svg class="bt-mon${boss ? ' boss' : ''}" id="bt-mon" viewBox="0 0 100 120" role="img" aria-label="${m.name}">${m.svg}</svg><div class="win bt-bar"><div class="bt-row"><b>${m.name}</b><span id="bt-mon-hp">${this.hp} / ${this.total}</span></div><div class="bt-hp"><i id="bt-mon-bar" style="width:100%;background:#e63946"></i></div></div></div>`;
  }

  stop() { this.active = false; this.host.hidden = true; this.host.innerHTML = ''; }

  key(ok) {
    if (!this.active) return;
    if (ok) {
      this.combo++;
      this.hp = Math.max(0, this.hp - 1);
      this.bar('mon', this.hp, this.total, '#e63946');
      this.anim(this.host.querySelector('.bt-side.pet'), 'lunge');
      this.anim(this.host.querySelector('#bt-mon'), 'hurt');
      this.float(this.host.querySelector('.bt-side.mon'), '-1', 'dmg');
      if (this.combo % 5 === 0) { this.say(CHEER[(this.combo / 5) % CHEER.length]); if (this.petHp < this.petMax) { this.petHp++; this.bar('pet', this.petHp, this.petMax, '#7fe0a0'); } }
    } else {
      this.combo = 0;
      if (this.shieldLeft > 0) { this.shieldLeft--; this.say('連擊盾擋住了！'); this.anim(this.host.querySelector('.bt-side.pet'), 'hurt'); return; }
      this.petHp = Math.max(0, this.petHp - 1);
      this.bar('pet', this.petHp, this.petMax, this.petHp <= 2 ? '#ff8a9a' : '#7fe0a0');
      this.anim(this.host.querySelector('#bt-mon'), 'attack');
      this.anim(this.host.querySelector('.bt-side.pet'), 'hurt');
      this.float(this.host.querySelector('.bt-side.pet'), '-1', 'dmg bad');
      this.say(HURT[Math.floor(Math.random() * HURT.length)]);
      if (this.petHp === 0) this.down();
    }
  }

  bar(who, v, max, color) {
    const b = this.host.querySelector(`#bt-${who}-bar`), t = this.host.querySelector(`#bt-${who}-hp`);
    if (b) { b.style.width = `${(v / max) * 100}%`; b.style.background = color; }
    if (t) t.textContent = `${v} / ${max}`;
  }

  anim(el, cls) {
    if (!el || this.reduce) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 450);
  }

  float(el, text, cls) {
    if (!el || this.reduce) return;
    if (el.querySelectorAll('.bt-float').length >= 3) return;   // 打得很快時不要疊一堆數字
    const d = document.createElement('span'); d.className = `bt-float ${cls}`; d.textContent = text;
    el.append(d); d.addEventListener('animationend', () => d.remove()); setTimeout(() => d.remove(), 900);
  }

  say(text) {
    const s = this.host.querySelector('#bt-say'); if (!s) return;
    s.textContent = text; s.hidden = false;
    clearTimeout(this.sayT); this.sayT = setTimeout(() => { s.hidden = true; }, 1200);
  }

  /** 這一步打完：怪物倒下 */
  win() {
    if (!this.active) return;
    this.active = false;
    const m = this.host.querySelector('#bt-mon'); if (m) m.classList.add('defeated');
    this.say(this.monster?.boss ? 'BOSS 擊敗！' : '打倒了！');
  }

  /** 夥伴 HP 歸零：倒下，這一步重來 */
  down() {
    this.active = false;
    const p = this.host.querySelector('.bt-side.pet'); if (p) p.classList.add('down');
    this.say(`${this.petName}倒下了…再試一次！`);
    setTimeout(() => this.onDown?.(), 900);
  }
}
