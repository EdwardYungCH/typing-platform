import { currentUser, logout, push, snapshot } from './sync.js';
import { api } from './api.js';
import { readAll, getWeak, getTestResult } from './storage.js';
import { ROOTS } from './zh-codes.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const next = params.get('next') || 'index.html';
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function render() {
  const user = await currentUser({ refresh: true });
  report(user).catch((e) => ($('report-body').innerHTML = `<p class="muted">未能產生報告：${html(e.message)}</p>`));
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

/** 我的學習報告：用這部電腦（已登入則已同步）的紀錄砌出來，可以列印或存成 PDF 交給老師、家長 */
async function report(user) {
  const store = readAll();
  const lessons = {};
  for (const lang of ['en', 'zh']) lessons[lang] = (await fetch(`data/${lang}-lessons.json`).then((r) => r.json())).lessons;
  const attempts = store.attempts ?? [];
  const minutes = Math.round(attempts.reduce((a, x) => a + (x.seconds ?? 0), 0) / 60);
  const doneN = (lang) => lessons[lang].filter((l) => store.lessons?.[`${lang}:${l.id}`]?.done && !store.lessons[`${lang}:${l.id}`].skipped).length;
  const best = (lang) => Math.round(Math.max(0, ...attempts.filter((a) => a.lang === lang).map((a) => a.wpm ?? 0)));
  const dayset = new Set(attempts.map((a) => (a.at ?? '').slice(0, 10)));
  const tile = (l, v, sub = '') => `<div class="rp-tile"><small>${l}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const days = [...Array(30)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 29 + i); return dt.toISOString().slice(0, 10); });
  const perDay = Object.fromEntries(days.map((x) => [x, 0]));
  for (const a of attempts) { const k = (a.at ?? '').slice(0, 10); if (k in perDay) perDay[k] += (a.seconds ?? 0) / 60; }
  const maxMin = Math.max(1, ...Object.values(perDay));
  const chart = `<div class="rp-dist days" role="img" aria-label="最近 30 天每日練習分鐘">${days.map((k) => `<div class="rp-col" title="${k}：${Math.round(perDay[k])} 分鐘"><span class="rp-bar" style="height:${(perDay[k] / maxMin) * 100}%"></span><i>${Math.round(perDay[k]) || ''}</i><small>${k.slice(8)}</small></div>`).join('')}</div>`;
  const table = (lang) => `<table class="rp-table"><thead><tr><th>課</th><th>星</th><th>最佳${lang === 'en' ? ' WPM' : '字/分'}</th><th>準確率</th></tr></thead><tbody>${lessons[lang].map((l) => {
    const r = store.lessons?.[`${lang}:${l.id}`];
    return `<tr class="${r?.done ? '' : 'muted'}"><td>第 ${l.id} 課 ${html(l.title)}</td><td class="rp-stars">${r?.skipped ? '<span class="muted">略過</span>' : r?.stars ? '★'.repeat(r.stars) : ''}</td><td class="num">${r && !r.skipped ? Math.round(r.bestWpm ?? r.wpm ?? 0) : ''}</td><td class="num">${r && !r.skipped ? Math.round(r.bestAccuracy ?? r.accuracy ?? 0) + '%' : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
  const weak = (lang) => { const w = getWeak(lang).filter((x) => x.tries >= 5).slice(0, 10); return w.length ? `<div class="rp-names">${w.map((x) => `<span>${lang === 'zh' && ROOTS[x.key] ? `${ROOTS[x.key]} ${x.key.toUpperCase()}` : html(x.key.length === 1 ? x.key.toUpperCase() : x.key)}<small>${Math.round(x.rate * 100)}%</small></span>`).join('')}</div>` : '<p class="muted">暫時沒有明顯弱項。</p>'; };
  const tests = ['en-placement', 'en-s1', 'en-s2', 'en-s3', 'zh-placement', 'zh-s1', 'zh-s2', 'zh-s3'].map((id) => [id, getTestResult(id)]).filter(([, r]) => r);
  const TEST_NAME = { 'en-placement': '英文分級', 'en-s1': '英文中一', 'en-s2': '英文中二', 'en-s3': '英文中三', 'zh-placement': '速成分級', 'zh-s1': '速成中一', 'zh-s2': '速成中二', 'zh-s3': '速成中三' };
  const testsHtml = tests.length ? `<table class="rp-table"><thead><tr><th>評測</th><th>日期</th><th>速度</th><th>準確率</th><th>星</th></tr></thead><tbody>${tests.map(([id, r]) => `<tr><td>${TEST_NAME[id]}</td><td>${(r.at ?? '').slice(0, 10)}</td><td class="num">${Math.round(r.wpm ?? r.netWpm ?? 0)}</td><td class="num">${Math.round(r.accuracy ?? 0)}%</td><td class="rp-stars">${r.stars ? '★'.repeat(r.stars) : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">未做過評測。</p>';
  $('report-body').innerHTML = `<p class="hint">${user ? `${html(user.name)}（${html(user.sid)}${user.className ? `・${html(user.className)}` : ''}）` : '未登入：只有這部電腦的紀錄'}・報告日期 ${new Date().toLocaleDateString('zh-HK')}</p>
    <div class="rp-tiles">${tile('英文完成課數', `${doneN('en')} / ${lessons.en.length}`)}${tile('中文完成課數', `${doneN('zh')} / ${lessons.zh.length}`)}${tile('總練習時間', `${minutes} 分鐘`, `${attempts.length} 次・${dayset.size} 日`)}${tile('英文最佳速度', `${best('en')} WPM`)}${tile('中文最佳速度', `${best('zh')} 字/分`)}</div>
    <h3 style="margin:14px 0 0">最近 30 天練習時間（分鐘）</h3>${chart}
    <div class="rp-two" style="margin-top:14px"><div><h3 style="margin:0">英文課堂</h3>${table('en')}<h4 style="margin:10px 0 6px">常錯的鍵</h4>${weak('en')}</div>
    <div><h3 style="margin:0">中文速成課堂</h3>${table('zh')}<h4 style="margin:10px 0 6px">常錯的字根／字</h4>${weak('zh')}</div></div>
    <h3 style="margin:14px 0 0">評測</h3>${testsHtml}`;
}
$('print').onclick = () => window.print();

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
