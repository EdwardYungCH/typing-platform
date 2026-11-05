// 學生登入：平台有多間學校時要填學校代碼（登入紙條上的網址會自動帶入）；Caps Lock 提示；共用電腦「不是我」。
import { login, logout, currentUser, hasGuestData } from './sync.js';
import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const next = params.get('next') || 'index.html';
if (!/^[a-z][\w./?=&-]*$/i.test(next) || next.includes('//')) location.replace('index.html');

// 已登入：問一句「是不是你」，免得下一位同學用了上一位同學的帳戶
const me = await currentUser({ refresh: true });
if (me) {
  $('already').hidden = false;
  $('form').hidden = true;
  $('already-text').textContent = `這部電腦現在登入了 ${me.className ? `${me.className} ` : ''}${me.name}（${me.sid}）。`;
  $('continue').href = next;
  $('switch').onclick = async () => { if (!(await logout())) alert('上一位同學有部分紀錄未能上載（可能是網絡問題），他下次在這部電腦登入時會自動補上。'); location.reload(); };
}

// 單校版本：不用學校代碼。只檢查伺服器在不在（純靜態網頁時提示學生可以直接練習）
try { await api('/api/me'); } catch (e) { if (e.status === 0 || /伺服器功能/.test(e.message)) $('msg').textContent = '這個網站沒有開啟登入功能，可以直接練習（紀錄只存在這部電腦）。'; }

$('keep-row').hidden = !hasGuestData();

const caps = (e) => { if (e.getModifierState) $('caps').hidden = !e.getModifierState('CapsLock'); };
$('pw').addEventListener('keydown', caps);
$('pw').addEventListener('keyup', caps);

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('msg').className = 'form-msg';
  $('msg').textContent = '';
  if (!$('sid').value.trim() || !$('pw').value) { $('msg').textContent = '請輸入學號和密碼'; return; }
  $('go').disabled = true;
  try {
    const user = await login($('sid').value.trim(), $('pw').value, { remember: $('remember').checked, keepGuest: !$('keep-row').hidden && $('keep').checked });
    $('msg').className = 'form-msg ok';
    $('msg').textContent = `歡迎，${user.name}！`;
    location.href = user.mustChange ? `me.html?first=1&next=${encodeURIComponent(next)}` : next;
  } catch (err) {
    $('msg').className = 'form-msg';
    $('msg').textContent = err.message;
    $('go').disabled = false;
  }
});
