import { currentUser, logout, push, snapshot } from './sync.js';
import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const next = params.get('next') || 'index.html';
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function render() {
  const user = await currentUser({ refresh: true });
  if (!user) {
    $('info').innerHTML = `<h2>未登入</h2><p class="hint">紀錄只存在這部電腦的瀏覽器內。登入後會在不同電腦之間同步，老師也能看到你的進度。</p>
      <div class="form-actions"><a class="btn primary" href="login.html">登入</a></div>`;
    return;
  }
  const s = snapshot();
  const lessons = Object.values(s.store?.lessons ?? {}).filter((l) => l.done).length;
  $('info').innerHTML = `<h2>${html(user.name)}</h2>
    <div class="row"><span>學號</span><b>${html(user.sid)}</b></div>
    <div class="row"><span>班別</span><b>${html(user.className ?? '—')}${user.classNo ? `（${user.classNo}）` : ''}</b></div>
    <div class="row"><span>已完成課數</span><b>${lessons}</b></div>
    <div class="row"><span>同步</span><b id="sync-state">已登入，改動會自動存到伺服器</b></div>
    <div class="form-actions"><button class="btn" id="sync-now" type="button">立即同步</button><button class="btn" id="logout" type="button">登出</button></div>
    <p class="hint">在共用電腦上練完記得登出，紀錄才不會留給下一位同學。</p>`;
  $('pwform').hidden = false;
  if (params.get('first') && user.mustChange) { $('first-hint').hidden = false; $('skip').hidden = false; $('skip').href = next; }
  $('sync-now').onclick = async () => {
    $('sync-state').textContent = '同步中…';
    try { await push(); $('sync-state').textContent = '已同步'; } catch (e) { $('sync-state').textContent = `同步失敗：${e.message}`; }
  };
  $('logout').onclick = async () => { await logout(); location.href = 'index.html'; };
}

$('pwform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('pwmsg'); m.className = 'form-msg'; m.textContent = '';
  if ($('new1').value !== $('new2').value) { m.textContent = '兩次輸入的新密碼不同'; return; }
  try {
    await api('/api/password', { method: 'POST', body: { old: $('old').value, password: $('new1').value } });
    m.className = 'form-msg ok'; m.textContent = '密碼已更改。';
    $('old').value = $('new1').value = $('new2').value = '';
    await currentUser({ refresh: true });
    if (params.get('first')) setTimeout(() => (location.href = next), 800);
  } catch (err) { m.textContent = err.message; }
});

render();
