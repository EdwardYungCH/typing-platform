// 教師後台：首次設定、登入；班級（概覽、學生名單、功課、評測時段）、成績換算、自訂練習、問題回報、學校設定、平台管理。
// 網址 # 決定顯示哪一頁：#class=3&tab=roster、#view=marks、#view=practice、#view=feedback、#view=school、#view=platform
import { api } from '../js/api.js';
import { applyWorld } from '../js/world.js';

applyWorld('planet');
const $ = (id) => document.getElementById(id);
const app = $('app');
const html = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const TESTS = [['en-placement', '英文分級'], ['en-s1', '英文中一'], ['en-s2', '英文中二'], ['en-s3', '英文中三'], ['zh-placement', '速成分級'], ['zh-s1', '速成中一'], ['zh-s2', '速成中二'], ['zh-s3', '速成中三']];
const TEST_NAME = Object.fromEntries(TESTS);
// 評測達標（跟 data/tests.json 的過關條件一致）
let TARGET = {};
const FLAG_TEXT = { 'too-fast': '速度超出合理上限', robotic: '按鍵間隔過分平均（疑似程式代打）', 'time-mismatch': '用時跟伺服器記錄不符', 'client-mismatch': '瀏覽器報的分數跟伺服器重計相差很大',
  'over-time': '超出時限', empty: '沒有作答', late: '超過時限很久才交卷（可能斷了網絡後補交）', 'non-monotonic': '按鍵紀錄的時間次序不對（紀錄可能被改過）' };
const flagText = (f) => FLAG_TEXT[f] ?? (/^restart-(\d)$/.test(f) ? `中途重新開始過 ${f.slice(8)} 次` : f);

let me = null, classes = [], current = null;
const isAdmin = () => me?.role === 'admin';

function msg(el, text, ok = false) { if (!el) return; el.className = `form-msg${ok ? ' ok' : ''}`; el.textContent = text; }
const route = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const go = (h) => { if (location.hash.slice(1) === h) render(); else location.hash = h; };
const schoolYear = (d = new Date()) => (d.getMonth() >= 7 ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}` : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`);
const fmtTime = (iso) => (iso ? new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleString('zh-HK', { hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// ---------- 開始 ----------
async function boot() {
  const st = await api('/api/teacher/status').catch((e) => ({ error: e.message }));
  if (st.error) { app.innerHTML = `<section class="card"><h1>未能連接伺服器</h1><p class="form-msg">${html(st.error)}</p></section>`; return; }
  try { TARGET = Object.fromEntries((await fetch('../data/tests.json').then((r) => r.json())).tests.map((t) => [t.id, t.pass ?? {}])); } catch { /* ignore */ }
  me = st.user;
  if (st.setupNeeded) return renderSetup();
  if (!me) return renderLogin();
  $('who').textContent = me.name;
  $('school-name').textContent = me.school?.name ?? '教師後台';
  $('user-menu').hidden = false;
  $('logout').onclick = async () => { await api('/api/teacher/logout', { method: 'POST', body: {} }); location.reload(); };
  $('mypw').onclick = () => { $('user-menu').open = false; myPasswordDialog(); };
  await loadClasses();
  window.addEventListener('hashchange', render);
  render();
}
async function loadClasses() { classes = (await api('/api/teacher/classes')).classes; }

function renderSetup() {
  app.innerHTML = `<form class="card form-card" id="f"><h1>首次設定</h1>
    <p class="hint">這個平台還沒有任何帳號。先建立你的學校和你自己的管理員帳號（你會成為平台營運者，之後可以再加其他學校）。</p>
    <div class="field"><label for="sn">學校名稱</label><input id="sn" required placeholder="例如 聖保羅書院"></div>
    <div class="field"><label for="sc">學校代碼（學生登入時用；小寫英文字母、數字）</label><input id="sc" required pattern="[a-z0-9][a-z0-9\\-]{1,19}" placeholder="例如 spc" autocapitalize="none"></div>
    <div class="field"><label for="n">你的姓名</label><input id="n" required></div>
    <div class="field"><label for="u">教師帳號（英文、數字）</label><input id="u" required autocomplete="username" autocapitalize="none"></div>
    <div class="field"><label for="p">密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8" autocomplete="new-password"></div>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">建立並登入</button></div></form>`;
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/teacher/setup', { method: 'POST', body: { schoolName: $('sn').value, schoolCode: $('sc').value.trim().toLowerCase(), name: $('n').value, username: $('u').value, password: $('p').value } }); location.reload(); }
    catch (err) { msg($('m'), err.message); }
  };
}

function renderLogin() {
  app.innerHTML = `<form class="card form-card" id="f"><h1>教師登入</h1>
    <div class="field"><label for="u">帳號</label><input id="u" required autocomplete="username" autocapitalize="none"></div>
    <div class="field"><label for="p">密碼</label><input id="p" type="password" required autocomplete="current-password"></div>
    <label class="check" for="r"><input type="checkbox" id="r"> 記住我 14 日<span class="muted">（只在自己的電腦剔）</span></label>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">登入</button></div>
    <p class="hint">忘記密碼：請學校的管理員在「學校設定 → 教師」重設；管理員忘記密碼請聯絡平台營運者。</p></form>`;
  $('f').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/teacher/login', { method: 'POST', body: { username: $('u').value, password: $('p').value, remember: $('r').checked } }); location.reload(); } catch (err) { msg($('m'), err.message); } };
}

// ---------- 版面：左邊導覽 ----------
function nav(r) {
  const years = [...new Set(classes.map((c) => c.year))];
  const cur = (k, v) => (r[k] === String(v) ? ' aria-current="page"' : '');
  return `<nav class="t-nav" aria-label="後台導覽">
    <section><h2>班級</h2><ul>
      ${years.map((y) => `<li class="year">${html(y)}</li>${classes.filter((c) => c.year === y).map((c) => `<li><a href="#class=${c.id}"${cur('class', c.id)}><span>${html(c.name)}</span><small>${c.students} 人</small></a></li>`).join('')}`).join('') || '<li class="muted" style="padding:4px 10px;font-size:14px">還沒有班級</li>'}
      <li><button class="link add" type="button" id="newclass">＋ 新增班級</button></li></ul></section>
    <section><h2>工具</h2><ul>
      <li><a href="#view=marks"${cur('view', 'marks')}>成績換算</a></li>
      <li><a href="#view=practice"${cur('view', 'practice')}>自訂練習</a></li>
      <li><a href="#view=feedback"${cur('view', 'feedback')}><span>問題回報</span><span class="badge-n" id="fb-n" hidden></span></a></li></ul></section>
    ${isAdmin() ? `<section><h2>管理</h2><ul><li><a href="#view=school"${cur('view', 'school')}>學校設定</a></li></ul></section>` : ''}
    ${me.isOwner ? `<section><h2>平台</h2><ul><li><a href="#view=platform"${cur('view', 'platform')}>全部學校</a></li></ul></section>` : ''}
  </nav>`;
}

async function render() {
  const r = route();
  if (!r.class && !r.view && classes.length) r.class = String(classes[0].id);
  current = classes.find((c) => String(c.id) === r.class) ?? null;
  app.innerHTML = `<div class="t-layout">${nav(r)}<div class="t-main" id="main"><p class="muted">載入中…</p></div></div>`;
  $('newclass').onclick = newClassDialog;
  feedbackCount();
  const main = $('main');
  try {
    if (r.view === 'marks') await viewMarks(main);
    else if (r.view === 'practice') await viewPractice(main);
    else if (r.view === 'feedback') await viewFeedback(main);
    else if (r.view === 'school' && isAdmin()) await viewSchool(main);
    else if (r.view === 'platform' && me.isOwner) await viewPlatform(main);
    else if (current) await viewClass(main, r.tab ?? 'overview');
    else main.innerHTML = `<section class="card"><h1>歡迎使用教師後台</h1><p>第一步：按左邊「＋ 新增班級」，然後匯入學生名單，再列印帳號紙條派給學生。</p>
      <p class="hint">詳細步驟見右上角「教師手冊」。</p><div class="form-actions"><button class="btn primary" id="nc2" type="button">新增班級</button></div></section>`;
    $('nc2')?.addEventListener('click', newClassDialog);
  } catch (e) { main.innerHTML = `<section class="card"><p class="form-msg">${html(e.message)}</p></section>`; }
}

// ---------- 對話框 ----------
function dialog(inner, onSubmit, { wide = false } = {}) {
  const d = $('dlg');
  d.className = `t-dialog${wide ? ' wide' : ''}`;
  d.innerHTML = inner;
  delete d.dataset.keep;
  if (!d.open) d.showModal();
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  const f = d.querySelector('form[data-main]');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit], button:not([type])'); if (btn) btn.disabled = true;
    try { const t = await onSubmit(); msg(d.querySelector('.form-msg'), t ?? '完成', true); if (!d.dataset.keep) setTimeout(() => d.close(), 800); }
    catch (err) { msg(d.querySelector('.form-msg'), err.message); }
    if (btn) btn.disabled = false;
  };
  return d;
}
const actions = (label, cancel = '取消') => `<p class="form-msg" role="status"></p><div class="form-actions"><button class="btn primary" type="submit">${label}</button><button class="btn ghost" type="button" data-close>${cancel}</button></div>`;

function newClassDialog() {
  dialog(`<h2 id="dlg-title">新增班級</h2><form data-main>
    <div class="field"><label for="cn">班別</label><input id="cn" required maxlength="12" placeholder="例如 1A、中一甲" autocomplete="off"></div>
    <div class="field"><label for="cy">學年</label><input id="cy" required value="${schoolYear()}" pattern="\\d{4}-\\d{2}"></div>
    <p class="hint">學年格式：2026-27。新學年升班時，先開新學年的班，再在舊班的「班級設定 → 升班／調班」把學生移過去，學生的紀錄會跟着走。</p>
    ${actions('新增')}</form>`, async () => {
    const r = await api('/api/teacher/classes', { method: 'POST', body: { name: $('cn').value, year: $('cy').value } });
    await loadClasses(); go(`class=${r.id}`); return '已新增';
  });
}

function myPasswordDialog() {
  dialog(`<h2 id="dlg-title">更改我的密碼</h2><form data-main>
    <div class="field"><label for="o">舊密碼</label><input id="o" type="password" required autocomplete="current-password"></div>
    <div class="field"><label for="p">新密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8" autocomplete="new-password"></div>
    <p class="hint">更改後，你在其他電腦的登入會被登出。</p>${actions('更改')}</form>`,
  async () => { await api('/api/teacher/password', { method: 'POST', body: { old: $('o').value, password: $('p').value } }); return '已更改'; });
}

// ---------- 班級 ----------
const sm = (s) => s.summary ?? { en: { lessons: 0, stars: 0, bestWpm: 0 }, zh: { lessons: 0, stars: 0, bestWpm: 0 }, minutes: 0, lastActive: null, days: {} };
const daysSince = (s) => (sm(s).lastActive ? Math.floor((Date.now() - new Date(sm(s).lastActive)) / 86400000) : null);
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0; };
const weekMin = (s) => { const from = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv'); return Object.entries(sm(s).days ?? {}).filter(([d]) => d >= from).reduce((a, [, m]) => a + num(m), 0); };

/** 每位學生的「需要留意」：從未練習、14 日沒練、落後全班 3 課、評測可疑 */
function concerns(students) {
  const med = { en: median(students.map((s) => num(sm(s).en?.lessons))), zh: median(students.map((s) => num(sm(s).zh?.lessons))) };
  const out = new Map();
  for (const s of students) {
    const c = [];
    const d = daysSince(s);
    if (d === null) c.push(['bad', '從未練習']);
    else if (d > 14) c.push(['warn', `${d} 日沒練習`]);
    for (const [l, name] of [['en', '英文'], ['zh', '中文']]) if (d !== null && num(sm(s)[l]?.lessons) <= med[l] - 3) c.push(['warn', `${name}落後 ${med[l] - num(sm(s)[l]?.lessons)} 課`]);
    if (Object.values(s.tests ?? {}).some((t) => t.flags?.length)) c.push(['bad', '評測可疑']);
    out.set(s.id, c);
  }
  return { med, out };
}

async function viewClass(main, tab) {
  const { students } = await api(`/api/teacher/classes/${current.id}/students`);
  const tabs = [['overview', '概覽'], ['roster', `學生名單（${students.length}）`], ['hw', '功課'], ['tests', '評測']];
  main.innerHTML = `<div class="t-head">
      <div><h1>${html(current.name)} <small class="muted" style="font-size:var(--fs-md)">${html(current.year)}</small></h1>
      <p class="meta">${html(current.teacher)}・${students.length} 位學生・排行榜${current.show_board ? '開' : '關'}</p></div>
      <div class="t-actions">
        <button class="btn primary" id="import" type="button">匯入學生</button>
        <details class="menu"><summary class="btn">帳號</summary><div>
          <button type="button" id="slips">列印帳號紙條</button><button type="button" id="classpw">全班改用同一個密碼</button></div></details>
        <a class="btn" href="../api/teacher/classes/${current.id}/export.csv">匯出 CSV</a>
        <details class="menu"><summary class="btn">班級設定</summary><div>
          <button type="button" id="board">${current.show_board ? '關閉' : '開啟'}本班排行榜</button>
          <button type="button" id="move">升班／調班</button>
          ${isAdmin() ? '<button type="button" id="owner">轉給其他老師</button>' : ''}
          <hr><button type="button" class="danger" id="delclass">刪除班級…</button></div></details>
      </div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}</div>
    <section class="card" id="tab-body"></section>`;
  main.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => go(`class=${current.id}&tab=${b.dataset.tab}`));
  $('import').onclick = importDialog;
  $('slips').onclick = printSlips;
  $('classpw').onclick = classPasswordDialog;
  $('board').onclick = async () => {
    const on = !current.show_board;
    if (!on && !confirm('關閉本班排行榜？學生只會看到自己的紀錄。')) return;
    await api(`/api/teacher/classes/${current.id}/board`, { method: 'POST', body: { on } }); await loadClasses(); render();
  };
  $('move').onclick = () => moveDialog(students);
  $('owner')?.addEventListener('click', ownerDialog);
  $('delclass').onclick = () => deleteClassDialog(students.length);
  const body = $('tab-body');
  if (tab === 'roster') renderRoster(body, students);
  else if (tab === 'hw') await renderHomework(body, students);
  else if (tab === 'tests') await renderTests(body, students);
  else renderOverview(body, students);
}

function renderOverview(body, students) {
  if (!students.length) { body.innerHTML = '<h2>還沒有學生</h2><p>按右上角「匯入學生」，從 Excel 複製學號和姓名貼上就可以。</p>'; return; }
  const n = students.length;
  const { med, out } = concerns(students);
  const active7 = students.filter((s) => daysSince(s) !== null && daysSince(s) <= 7).length;
  const tile = (label, value, sub = '') => `<div class="rp-tile"><b>${value}</b><small>${label}</small>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const flagged = students.filter((s) => out.get(s.id).length);
  const dist = (lang) => {
    const cnt = Array(18).fill(0);
    for (const s of students) cnt[Math.min(17, num(sm(s)[lang]?.lessons))] += 1;
    const max = Math.max(...cnt, 1);
    return `<div class="rp-dist" role="img" aria-label="${lang === 'en' ? '英文' : '中文'}完成課數分佈">${cnt.map((c, i) => `<div class="rp-col" title="完成 ${i} 課：${c} 人"><span class="rp-bar" style="height:${(c / max) * 100}%"></span><i>${c || ''}</i><small>${i}</small></div>`).join('')}</div>`;
  };
  const testRows = TESTS.map(([id, label]) => {
    const done = students.filter((s) => s.tests[id]);
    if (!done.length) return '';
    const pass = TARGET[id] ?? {};
    const passed = done.filter((s) => s.tests[id].wpm >= (pass.wpm ?? 0) && s.tests[id].accuracy >= (pass.accuracy ?? 0)).length;
    const susp = done.filter((s) => s.tests[id].flags.length).length;
    return `<tr><td>${label}</td><td class="num">${done.length} / ${n}</td><td class="num">${Math.round(median(done.map((s) => s.tests[id].wpm)))}</td><td class="num">${Math.round(median(done.map((s) => s.tests[id].accuracy)))}%</td>
      <td class="num">${pass.wpm ? `${passed}（${Math.round((passed / done.length) * 100)}%）` : '—'}</td><td>${susp ? `<span class="status warn">${susp} 人</span>` : ''}</td></tr>`;
  }).join('');
  body.innerHTML = `<div class="rp">
    <div class="rp-tiles">${tile('最近 7 日有練習', `${active7} / ${n}`, `${Math.round((active7 / n) * 100)}%`)}${tile('英文完成課數（中位數）', med.en)}${tile('中文完成課數（中位數）', med.zh)}
      ${tile('英文最佳速度（中位數）', `${Math.round(median(students.map((s) => num(sm(s).en?.bestWpm))))}`, 'WPM')}${tile('中文最佳速度（中位數）', `${Math.round(median(students.map((s) => num(sm(s).zh?.bestWpm))))}`, '字/分')}</div>
    <h3>需要留意（${flagged.length}）</h3>
    ${flagged.length ? `<ul class="rp-names">${flagged.map((s) => `<li><a href="student.html?id=${s.id}">${s.class_no ?? ''} ${html(s.name)}</a> ${out.get(s.id).map(([k, t]) => `<span class="status ${k}">${t}</span>`).join(' ')}</li>`).join('')}</ul>` : '<p class="muted">全班都有練習，沒有特別需要留意的同學。</p>'}
    <div class="rp-grid" style="margin-top:12px">
      <section><h4>英文：完成課數分佈</h4>${dist('en')}</section>
      <section><h4>中文：完成課數分佈</h4>${dist('zh')}<p class="hint">橫軸是完成了幾多課，長條是人數。</p></section>
    </div>
    ${testRows ? `<h3>評測</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>評測</th><th class="num">已做</th><th class="num">速度中位數</th><th class="num">準確率中位數</th><th class="num">達標</th><th>可疑</th></tr></thead><tbody>${testRows}</tbody></table></div>` : ''}
  </div>`;
}

function renderRoster(body, students) {
  if (!students.length) { body.innerHTML = '<p class="muted">還沒有學生。按「匯入學生」貼上名單。</p>'; return; }
  const { out } = concerns(students);
  let only = sessionStorage.getItem('t.only') === '1';
  const draw = () => {
    const list = only ? students.filter((s) => out.get(s.id).length) : students;
    const testCell = (s) => {
      const done = TESTS.filter(([id]) => s.tests[id]);
      if (!done.length) return '<span class="muted">—</span>';
      return done.map(([id, l]) => { const t = s.tests[id]; return `<span class="mini" title="${l}：${Math.round(t.wpm)}，準確率 ${Math.round(t.accuracy)}%">${l.replace('英文', '英').replace('速成', '中')} ${Math.round(t.wpm)}</span>${t.flags.length ? ` <button class="flag-btn" type="button" data-flags="${html(t.flags.map(flagText).join('；'))}" data-who="${html(s.name)}" data-test="${l}">可疑</button>` : ''}`; }).join('<br>');
    };
    body.innerHTML = `<div class="t-filter"><label class="check" for="only"><input type="checkbox" id="only" ${only ? 'checked' : ''}> 只看需要留意的同學</label><span class="muted">共 ${list.length} 人</span></div>
      <div class="tbl-wrap"><table class="tbl">
      <thead><tr class="group"><th colspan="3">學生</th><th colspan="2">英文</th><th colspan="2">中文速成</th><th colspan="2">練習</th><th>評測</th><th></th></tr>
      <tr><th class="num">班號</th><th class="sticky">姓名</th><th>學號</th><th class="num">完成課數</th><th class="num">最佳 WPM</th><th class="num">完成課數</th><th class="num">最佳 字/分</th><th>最近練習</th><th class="num">本週分鐘</th><th>速度</th><th><span class="visually-hidden">操作</span></th></tr></thead>
      <tbody>${list.map((s) => {
        const S = sm(s), d = daysSince(s);
        const c = out.get(s.id);
        return `<tr data-id="${s.id}" data-sid="${html(s.sid)}" data-name="${html(s.name)}">
          <td class="num">${s.class_no ?? ''}</td><td class="sticky"><a href="student.html?id=${s.id}">${html(s.name)}</a>${c.length ? `<br>${c.map(([k, t]) => `<span class="status ${k}">${t}</span>`).join(' ')}` : ''}</td>
          <td class="mini">${html(s.sid)}${s.pw_initial ? '<br><span class="muted">未改初始密碼</span>' : ''}</td>
          <td class="num">${num(S.en?.lessons)}</td><td class="num">${Math.round(num(S.en?.bestWpm))}</td><td class="num">${num(S.zh?.lessons)}</td><td class="num">${Math.round(num(S.zh?.bestWpm))}</td>
          <td class="mini">${d === null ? '從未' : d === 0 ? '今日' : `${d} 日前`}</td><td class="num">${Math.round(weekMin(s))}</td>
          <td class="mini">${testCell(s)}</td>
          <td><details class="menu row-menu"><summary class="btn sm" aria-label="${html(s.name)} 的操作">⋯</summary><div>
            <a href="student.html?id=${s.id}">詳細紀錄</a><button type="button" data-act="reset">重設密碼</button><button type="button" data-act="retake">允許重做評測</button>
            <a href="../api/teacher/students/${s.id}/export" download>匯出個人資料</a><hr><button type="button" class="danger" data-act="del">刪除學生</button></div></details></td></tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">沒有需要留意的同學。</td></tr>'}</tbody></table></div>
      <p class="hint">「可疑」：伺服器重新計分時發現的問題（按一下看原因）。所有評測成績都由伺服器按按鍵紀錄重新計算。</p>`;
    $('only').onchange = () => { only = $('only').checked; try { sessionStorage.setItem('t.only', only ? '1' : '0'); } catch { /* ignore */ } draw(); };
    body.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => { b.closest('details').open = false; studentAction(b.dataset.act, b.closest('tr').dataset); });
    body.querySelectorAll('[data-flags]').forEach((b) => b.onclick = () => dialog(`<h2 id="dlg-title">${b.dataset.who}：${b.dataset.test}</h2><p>${html(b.dataset.flags)}</p>
      <p class="hint">可以在學生的「詳細紀錄」按「回放」看當時每一下按鍵；認為不公平可以「允許重做評測」。</p><div class="form-actions"><button class="btn primary" type="button" data-close>關閉</button></div>`));
  };
  draw();
}

async function studentAction(act, { id, sid, name }) {
  if (act === 'reset') {
    let last = ''; try { last = localStorage.getItem('teacher.commonPw') ?? ''; } catch { /* ignore */ }
    dialog(`<h2 id="dlg-title">重設 ${html(name)} 的密碼</h2><form data-main>
      <div class="field"><label for="np">新密碼（留空＝隨機產生 6 個字元）</label><input id="np" value="${html(last)}" autocomplete="off"></div>
      <p class="hint">學生在其他電腦的登入會被登出；如果因輸錯太多次被鎖，也會一併解鎖。</p>${actions('重設')}</form><div id="np-out"></div>`,
    async () => {
      const r = await api(`/api/teacher/students/${id}/reset`, { method: 'POST', body: { password: $('np').value.trim() } });
      $('dlg').dataset.keep = '1';
      $('np-out').innerHTML = `<p>${html(name)}（${html(sid)}）的新密碼：<span class="pw" style="font-size:22px">${html(r.password)}</span></p><p class="hint">請抄給學生；「列印帳號紙條」也會印出這個密碼。</p>`;
      render(); return '已重設';
    });
  } else if (act === 'retake') {
    dialog(`<h2 id="dlg-title">允許 ${html(name)} 重做評測</h2><form data-main>
      <div class="field"><label for="tt">評測</label><select id="tt">${TESTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <p class="hint">會刪除這個評測的舊成績和按鍵紀錄，學生可以再做一次。</p>${actions('允許重做')}</form>`,
    async () => { await api(`/api/teacher/students/${id}/retake`, { method: 'POST', body: { testId: $('tt').value } }); render(); return '已刪除舊成績'; });
  } else if (act === 'del') {
    if (!confirm(`刪除學生 ${name}（${sid}）？\n他的進度、評測成績和問題回報會一併刪除，不能復原。`)) return;
    await api(`/api/teacher/students/${id}`, { method: 'DELETE' });
    await loadClasses(); render();
  }
}

// 匯入：每行「學號 姓名」，可加班號；自動分批（每批 40 人）
function parseRows(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[\t,，;；]|\s+/).map((c) => c.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (!cells.length) continue;
    if (/^(學號|sid|id|班號|no)$/i.test(cells[0])) continue;   // 標題列
    let no = null, sid, name;
    if (cells.length >= 3 && /^\d{1,2}$/.test(cells[0])) { no = Number(cells[0]); sid = cells[1]; name = cells.slice(2).join(''); }
    else if (cells.length >= 3 && /^\d{1,2}$/.test(cells[cells.length - 1])) { no = Number(cells[cells.length - 1]); sid = cells[0]; name = cells.slice(1, -1).join(''); }
    else { sid = cells[0]; name = cells.slice(1).join(''); }
    out.push({ sid, name, no });
  }
  return out;
}

function importDialog() {
  dialog(`<h2 id="dlg-title">匯入學生到 ${html(current.name)}</h2>
    <form data-main class="import-box">
      <div class="field"><label for="rows">名單：每行一個學生「學號 姓名」，可在最前或最後加班號（從 Excel 直接複製貼上即可）</label>
        <textarea id="rows" placeholder="1 s27001 陳大文&#10;2 s27002 李小明"></textarea></div>
      <div class="file-pick"><input type="file" id="file" accept=".csv,.txt"><label class="btn sm" for="file">或選擇 CSV 檔…</label><span class="muted" id="fname"></span><a href="student-template.csv" download>下載範本</a></div>
      <fieldset><legend>密碼</legend>
        <label class="check" for="pm1"><input type="radio" name="pwmode" id="pm1" value="random" checked> 每人隨機產生（較安全）</label>
        <label class="check" for="pm2"><input type="radio" name="pwmode" id="pm2" value="common"> 全部用同一個密碼</label>
        <div class="field"><label for="cpw" class="visually-hidden">統一密碼</label><input id="cpw" autocomplete="off" placeholder="統一密碼（4–64 個字元）" disabled></div>
        <label class="check" for="applyold"><input type="checkbox" id="applyold" disabled> 已在系統內的學生也改用這個密碼</label></fieldset>
      <p class="hint">學號會成為學生的登入帳號。學生第一次登入時會被要求改密碼。</p>
      ${actions('匯入')}</form>
    <div class="result-list" id="res"></div>`,
  async () => {
    const rows = parseRows($('rows').value);
    if (!rows.length) throw new Error('沒有讀到任何學生');
    const common = document.querySelector('input[name="pwmode"]:checked').value === 'common';
    const password = common ? $('cpw').value.trim() : '';
    if (common && password.length < 4) throw new Error('請輸入統一密碼（至少 4 個字元），或選「每人隨機產生」');
    const all = [];
    for (let i = 0; i < rows.length; i += 40) {
      msg($('dlg').querySelector('.form-msg'), `處理中… ${Math.min(i + 40, rows.length)} / ${rows.length}`, true);
      const r = await api('/api/teacher/import', { method: 'POST', body: { classId: current.id, rows: rows.slice(i, i + 40), password, applyToExisting: common && $('applyold').checked } });
      all.push(...r.rows);
    }
    $('res').innerHTML = `<table class="tbl"><thead><tr><th>學號</th><th>姓名</th><th>密碼</th><th>結果</th></tr></thead><tbody>${all.map((x) => `<tr class="${x.error ? 'muted' : ''}"><td>${html(x.sid)}</td><td>${html(x.name)}</td><td class="pw">${html(x.password ?? '')}</td><td class="mini wrap">${x.error ? `<span class="status bad">未匯入</span> ` : ''}${html(x.status)}</td></tr>`).join('')}</tbody></table>`;
    $('dlg').dataset.keep = '1';
    await loadClasses();
    $('dlg').addEventListener('close', () => render(), { once: true });
    return `完成：新增 ${all.filter((x) => x.status === '新增').length} 人${all.some((x) => x.error) ? `，${all.filter((x) => x.error).length} 行未能匯入（見下表）` : ''}。之後可以按「帳號 → 列印帳號紙條」。`;
  }, { wide: true });
  $('file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('rows').value = await f.text(); $('fname').textContent = f.name; } };
  const sync = () => { const on = document.querySelector('input[name="pwmode"]:checked').value === 'common'; $('cpw').disabled = !on; $('applyold').disabled = !on; if (on) $('cpw').focus(); };
  document.querySelectorAll('input[name="pwmode"]').forEach((r) => r.onchange = sync);
  try { const last = localStorage.getItem('teacher.commonPw'); if (last) $('cpw').value = last; } catch { /* ignore */ }
  $('cpw').oninput = () => { try { localStorage.setItem('teacher.commonPw', $('cpw').value); } catch { /* ignore */ } };
}

function classPasswordDialog() {
  dialog(`<h2 id="dlg-title">${html(current.name)} 全班改用同一個密碼</h2><form data-main>
    <div class="field"><label for="cp">新密碼（4–64 個字元）</label><input id="cp" required minlength="4" autocomplete="off"></div>
    <p class="hint">全班學生的舊密碼會失效，已登入的電腦會被登出。學生登入後會被要求改密碼。</p>${actions('更改')}</form>`,
  async () => { const r = await api(`/api/teacher/classes/${current.id}/password`, { method: 'POST', body: { password: $('cp').value.trim() } }); try { localStorage.setItem('teacher.commonPw', $('cp').value.trim()); } catch { /* ignore */ } render(); return `已更改 ${r.count} 人`; });
}

function moveDialog(students) {
  const others = classes.filter((c) => c.id !== current.id);
  if (!others.length) { alert('先新增目標班級（例如新學年的班），才可以把學生移過去。'); return; }
  dialog(`<h2 id="dlg-title">升班／調班：把 ${html(current.name)} 的學生移到另一班</h2><form data-main>
    <div class="field"><label for="to">移到</label><select id="to">${others.map((c) => `<option value="${c.id}">${html(c.year)} ${html(c.name)}</option>`).join('')}</select></div>
    <fieldset><legend>學生</legend>
      <label class="check" for="all"><input type="checkbox" id="all" checked> 全班 ${students.length} 人</label>
      <div id="pick" hidden style="max-height:220px;overflow:auto;display:grid;gap:2px">${students.map((s) => `<label class="check" for="mv${s.id}"><input type="checkbox" id="mv${s.id}" value="${s.id}"> ${s.class_no ?? ''} ${html(s.name)}（${html(s.sid)}）</label>`).join('')}</div></fieldset>
    <label class="check" for="keepno"><input type="checkbox" id="keepno"> 保留原本的班號（一般升班會有新班號，所以預設清空）</label>
    <p class="hint">學生的課堂進度、評測成績都會跟着學生走。新學年的班號可以之後重新匯入名單更新（學號相同就只會更新班別和班號）。</p>
    ${actions('移班')}</form>`,
  async () => {
    const ids = $('all').checked ? null : [...$('pick').querySelectorAll('input:checked')].map((x) => Number(x.value));
    if (ids && !ids.length) throw new Error('請選擇學生');
    const r = await api(`/api/teacher/classes/${current.id}/move`, { method: 'POST', body: { toClassId: Number($('to').value), studentIds: ids, keepNumbers: $('keepno').checked } });
    await loadClasses(); render(); return `已移 ${r.moved} 人`;
  });
  $('all').onchange = () => { $('pick').hidden = $('all').checked; };
}

async function ownerDialog() {
  const { teachers } = await api('/api/teacher/teachers');
  dialog(`<h2 id="dlg-title">把 ${html(current.name)} 轉給另一位老師</h2><form data-main>
    <div class="field"><label for="tid">老師</label><select id="tid">${teachers.map((t) => `<option value="${t.id}" ${t.id === current.teacher_id ? 'selected' : ''}>${html(t.name)}（${html(t.username)}）</option>`).join('')}</select></div>
    ${actions('轉班')}</form>`,
  async () => { await api(`/api/teacher/classes/${current.id}/owner`, { method: 'POST', body: { teacherId: Number($('tid').value) } }); await loadClasses(); render(); return '已轉班'; });
}

function deleteClassDialog(n) {
  dialog(`<h2 id="dlg-title">刪除 ${html(current.year)} ${html(current.name)}</h2><form data-main>
    ${n ? `<p>班裏有 <b>${n}</b> 位學生。學生畢業或離校時可以連學生一起刪除：<b>他們的帳號、課堂進度、評測成績會永久刪除，不能復原</b>。</p>
      <p class="hint">只是升班或調班的話，請先用「班級設定 → 升班／調班」把學生移走，不要刪除。</p>
      <div class="field"><label for="cf">確認：請輸入班名「${html(current.name)}」</label><input id="cf" required autocomplete="off"></div>` : '<p>這個班沒有學生。刪除後，這班的功課和自訂練習也會一併刪除。</p>'}
    <p class="form-msg" role="status"></p><div class="form-actions"><button class="btn danger" type="submit">${n ? `刪除班級和 ${n} 位學生` : '刪除班級'}</button><button class="btn ghost" type="button" data-close>取消</button></div></form>`,
  async () => {
    await api(`/api/teacher/classes/${current.id}`, { method: 'DELETE', body: n ? { purge: true, confirm: $('cf').value.trim() } : {} });
    await loadClasses(); go(''); return '已刪除';
  });
}

async function printSlips() {
  const { cls, school, students } = await api(`/api/teacher/classes/${current.id}/slips`);
  const url = `${location.origin}/login.html?school=${encodeURIComponent(school.code)}`;
  $('slip-sheet').innerHTML = students.map((s) => `<div class="slip"><span class="s-school">${html(school.name)}・打字練習平台</span>
    <span class="s-name">${html(cls.name)}${s.class_no ? `（${s.class_no}）` : ''} ${html(s.name)}</span>
    <dl><dt>網址</dt><dd class="url">${html(url)}</dd><dt>學校代碼</dt><dd class="pw">${html(school.code)}</dd><dt>學號</dt><dd class="pw">${html(s.sid)}</dd>
    <dt>密碼</dt><dd class="pw">${s.initial_pw ? html(s.initial_pw) : s.initial_pw === '' ? '<small>請老師重設</small>' : '<small>已自行更改</small>'}</dd></dl></div>`).join('');
  $('slip-sheet').hidden = false;
  document.body.classList.add('print-slips');
  window.addEventListener('afterprint', () => { document.body.classList.remove('print-slips'); $('slip-sheet').hidden = true; }, { once: true });
  window.print();
}

// ---------- 功課 ----------
const LESSON_NAMES = { en: {}, zh: {} };
async function lessonNames() {
  if (Object.keys(LESSON_NAMES.en).length) return LESSON_NAMES;
  for (const lang of ['en', 'zh']) for (const l of (await fetch(`../data/${lang}-lessons.json`).then((r) => r.json())).lessons) LESSON_NAMES[lang][l.id] = l.title;
  return LESSON_NAMES;
}
async function renderHomework(body, students) {
  const names = await lessonNames();
  const { assignments } = await api(`/api/teacher/classes/${current.id}/assignments`);
  const today = new Date().toLocaleDateString('sv');
  const opts = (lang) => Object.entries(names[lang]).map(([id, t]) => `<option value="${id}">第 ${id} 課：${html(t)}</option>`).join('');
  body.innerHTML = `<h2>功課</h2>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>課</th><th>截止</th><th class="num">完成</th><th>未完成</th><th></th></tr></thead><tbody>
    ${assignments.map((a) => {
      const notDone = students.filter((s) => !a.doneBy.includes(s.id));
      return `<tr><td>${a.lang === 'en' ? '英文' : '速成'} 第 ${a.lesson_id} 課 ${html(names[a.lang][a.lesson_id] ?? '')}${a.note ? `<br><span class="mini">${html(a.note)}</span>` : ''}</td>
        <td class="mini">${a.due ? `${a.due}${a.due < today ? ' <span class="status warn">已過期</span>' : ''}` : '—'}</td>
        <td class="num">${a.doneBy.length} / ${students.length}</td>
        <td class="mini wrap">${notDone.length ? notDone.map((s) => `${s.class_no ?? ''} ${html(s.name)}`).join('、') : '<span class="status ok">全部完成</span>'}</td>
        <td><button class="btn sm" type="button" data-del="${a.id}">刪除</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">還沒有功課。</td></tr>'}</tbody></table></div>
    <h3 style="margin:20px 0 8px">派功課</h3>
    <form class="inline-form" id="hwf">
      <div class="field"><label for="hl">語言</label><select id="hl"><option value="zh">中文速成</option><option value="en">英文</option></select></div>
      <div class="field" style="flex:2 1 240px"><label for="hs">課</label><select id="hs">${opts('zh')}</select></div>
      <div class="field"><label for="hd">截止日</label><input type="date" id="hd"></div>
      <div class="field" style="flex:2 1 200px"><label for="hn">備註（學生會看到）</label><input id="hn" maxlength="200"></div>
      <button class="btn primary" type="submit">派功課</button></form><p class="form-msg" id="hwm"></p>
    <p class="hint">學生登入後首頁會見到「老師功課」；完成該課最後的過關小測就算做完。</p>`;
  $('hl').onchange = () => { $('hs').innerHTML = opts($('hl').value); };
  $('hwf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/api/teacher/classes/${current.id}/assignments`, { method: 'POST', body: { lang: $('hl').value, lessonId: Number($('hs').value), due: $('hd').value, note: $('hn').value } }); render(); }
    catch (err) { msg($('hwm'), err.message); }
  };
  body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('刪除這份功課？')) { await api(`/api/teacher/assignments/${b.dataset.del}`, { method: 'DELETE' }); render(); } });
}

// ---------- 評測（開放時段）----------
async function renderTests(body, students) {
  const { windows, needWindow } = await api(`/api/teacher/classes/${current.id}/windows`);
  const now = new Date().toISOString();
  const openOf = (id) => windows.find((w) => w.test_id === id && w.opens_at <= now && w.closes_at > now);
  const nextOf = (id) => windows.filter((w) => w.test_id === id && w.opens_at > now).sort((a, b) => (a.opens_at < b.opens_at ? -1 : 1))[0];
  body.innerHTML = `<h2>評測</h2>
    <p class="hint">${needWindow ? '本校設定：<b>學生只可以在老師開放的時段內開始評測。</b>' : '本校設定：學生隨時可以做評測（每個評測只可做一次）。如要在課堂上統一進行，可請學校管理員在「學校設定」開啟「評測要老師開放」。'}</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>評測</th><th class="num">已做</th><th class="num">達標</th><th>開放狀態</th><th></th></tr></thead><tbody>
    ${TESTS.map(([id, label]) => {
      const done = students.filter((s) => s.tests[id]);
      const pass = TARGET[id] ?? {};
      const passed = done.filter((s) => s.tests[id].wpm >= (pass.wpm ?? 0) && s.tests[id].accuracy >= (pass.accuracy ?? 0)).length;
      const w = openOf(id), nx = nextOf(id);
      return `<tr><td>${label}${pass.wpm ? `<br><span class="mini">目標 ${pass.wpm} ${id.startsWith('zh') ? '字/分' : 'WPM'}、準確率 ${pass.accuracy}%</span>` : ''}</td>
        <td class="num">${done.length} / ${students.length}</td><td class="num">${pass.wpm && done.length ? passed : '—'}</td>
        <td class="mini">${w ? `<span class="status ok">開放中</span> 至 ${fmtTime(w.closes_at)}` : nx ? `<span class="status info">已預約</span> ${fmtTime(nx.opens_at)}` : needWindow ? '<span class="status info">未開放</span>' : '隨時可做'}</td>
        <td><div class="t-actions">${w ? `<button class="btn sm" type="button" data-close-w="${w.id}">立即關閉</button>` : `<button class="btn sm" type="button" data-open="${id}" data-min="45">開放 45 分鐘</button>`}
          <button class="btn sm" type="button" data-sched="${id}">預約時段…</button></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <h3 style="margin:20px 0 8px">時段紀錄</h3>
    ${windows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>評測</th><th>開始</th><th>結束</th><th>老師</th></tr></thead><tbody>${windows.slice(0, 30).map((w) => `<tr><td>${TEST_NAME[w.test_id] ?? w.test_id}</td><td class="mini">${fmtTime(w.opens_at)}</td><td class="mini">${fmtTime(w.closes_at)}</td><td class="mini">${html(w.teacher)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有開放過。</p>'}`;
  body.querySelectorAll('[data-open]').forEach((b) => b.onclick = async () => {
    const opens = new Date(), closes = new Date(Date.now() + Number(b.dataset.min) * 60000);
    await api(`/api/teacher/classes/${current.id}/windows`, { method: 'POST', body: { testId: b.dataset.open, opens: opens.toISOString(), closes: closes.toISOString() } });
    render();
  });
  body.querySelectorAll('[data-close-w]').forEach((b) => b.onclick = async () => { await api(`/api/teacher/windows/${b.dataset.closeW}`, { method: 'DELETE' }); render(); });
  body.querySelectorAll('[data-sched]').forEach((b) => b.onclick = () => {
    const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
    dialog(`<h2 id="dlg-title">預約開放 ${TEST_NAME[b.dataset.sched]}</h2><form data-main>
      <div class="field"><label for="wo">開始</label><input type="datetime-local" id="wo" required value="${local(start)}"></div>
      <div class="field"><label for="wc">結束</label><input type="datetime-local" id="wc" required value="${local(new Date(start.getTime() + 45 * 60000))}"></div>
      <p class="hint">學生要在這段時間內按「開始」；開始後有完整的評測時間，不會因時段結束而中斷。</p>${actions('預約')}</form>`,
    async () => { await api(`/api/teacher/classes/${current.id}/windows`, { method: 'POST', body: { testId: b.dataset.sched, opens: new Date($('wo').value).toISOString(), closes: new Date($('wc').value).toISOString() } }); render(); return '已預約'; });
  });
}

// ---------- 成績換算 ----------
// 預設公式（滿分 100）：速度佔 70、準確率佔 30。剛達目標速度、準確率 90% → 60 分。
//   速度分：0 至目標速度 → 0–42 分；目標至 1.5 倍目標 → 42–70 分
//   準確率分：75% 以下 0 分，100% 滿 30 分
export function markOf(speed, acc, target) {
  if (!target) return null;
  const sp = speed <= target ? 42 * (speed / target) : 42 + 28 * Math.min(1, (speed - target) / (0.5 * target));
  const ac = 30 * Math.min(1, Math.max(0, (acc - 75) / 25));
  return Math.round(sp + ac);
}
async function viewMarks(main) {
  const years = [...new Set(classes.map((c) => c.year))];
  const r = route();
  const year = r.year ?? years[0] ?? schoolYear(), form = r.form ?? (classes.find((c) => c.year === year)?.name.match(/\d/)?.[0] ?? '1'), test = r.test ?? 'en-s1';
  main.innerHTML = `<div class="t-head"><div><h1>成績換算</h1><p class="meta">把評測的速度和準確率換算成 0–100 分，並計算全級排名，可以匯出到學校的成績表。</p></div></div>
    <section class="card"><form class="inline-form" id="mf">
      <div class="field"><label for="my">學年</label><select id="my">${(years.length ? years : [year]).map((y) => `<option ${y === year ? 'selected' : ''}>${html(y)}</option>`).join('')}</select></div>
      <div class="field"><label for="mfm">級別</label><select id="mfm">${[1, 2, 3, 4, 5, 6].map((f) => `<option value="${f}" ${String(f) === form ? 'selected' : ''}>中${'一二三四五六'[f - 1]}</option>`).join('')}</select></div>
      <div class="field" style="flex:2 1 160px"><label for="mt">評測</label><select id="mt">${TESTS.map(([v, l]) => `<option value="${v}" ${v === test ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="mtg">目標速度</label><input id="mtg" type="number" min="1" step="1" value="${TARGET[test]?.wpm ?? 15}"></div>
      <button class="btn primary" type="submit">計算</button></form>
      <p class="hint">計分方法：速度佔 70 分、準確率佔 30 分。剛好達到目標速度而準確率 90%，得 60 分；速度達目標 1.5 倍、準確率 100%，得滿分。班名以數字開頭（1A、S1A）才會算入該級。</p></section>
    <section class="card" id="mres"><p class="muted">選好後按「計算」。</p></section>`;
  $('mt').onchange = () => { $('mtg').value = TARGET[$('mt').value]?.wpm ?? 15; };
  $('mf').onsubmit = async (e) => {
    e.preventDefault();
    const q = { year: $('my').value, form: $('mfm').value, test: $('mt').value };
    history.replaceState(null, '', `#view=marks&year=${q.year}&form=${q.form}&test=${q.test}`);
    const target = Number($('mtg').value) || 15;
    const d = await api(`/api/teacher/form?year=${encodeURIComponent(q.year)}&form=${q.form}&test=${q.test}`);
    const all = d.form.map((x) => markOf(x.wpm, x.accuracy, target)).sort((a, b) => b - a);
    const rankOf = (m) => all.findIndex((x) => x <= m) + 1;
    const rows = d.students.map((s) => { const m = s.wpm === null ? null : markOf(s.wpm, s.accuracy, target); return { ...s, mark: m, rank: m === null ? null : rankOf(m) }; });
    const unit = q.test.startsWith('zh') ? '字/分' : 'WPM';
    $('mres').innerHTML = `<div class="t-head" style="margin-bottom:8px"><div><h2 style="margin:0">${q.year} 中${'一二三四五六'[q.form - 1]}・${TEST_NAME[q.test]}</h2>
      <p class="meta">全級 ${d.total} 人，已做 ${d.form.length} 人；全級平均 ${all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : '—'} 分，中位數 ${all.length ? Math.round(median(all)) : '—'} 分</p></div>
      <div class="t-actions"><button class="btn" type="button" id="mcsv">匯出 CSV</button><button class="btn" type="button" id="mprint">列印</button></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>班別</th><th class="num">班號</th><th>姓名</th><th>學號</th><th class="num">速度（${unit}）</th><th class="num">準確率</th><th class="num">分數</th><th class="num">全級名次</th><th>標記</th></tr></thead><tbody>
      ${rows.map((s) => `<tr class="${s.mark === null ? 'muted' : ''}"><td>${html(s.className)}</td><td class="num">${s.no ?? ''}</td><td>${html(s.name)}</td><td class="mini">${html(s.sid)}</td>
        <td class="num">${s.wpm === null ? '未做' : Math.round(s.wpm * 10) / 10}</td><td class="num">${s.accuracy === null ? '' : `${Math.round(s.accuracy * 10) / 10}%`}</td>
        <td class="num"><b>${s.mark ?? ''}</b></td><td class="num">${s.rank ? `${s.rank} / ${all.length}` : ''}</td><td class="mini">${s.flags?.length ? `<span class="status warn">${html(s.flags.map(flagText).join('；'))}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">這一級沒有你可以看的班。</td></tr>'}</tbody></table></div>
      <p class="hint">名次以全級分數計（同分同名次）。其他老師的班只計入名次，不會顯示姓名。</p>`;
    $('mprint').onclick = () => window.print();
    $('mcsv').onclick = () => {
      const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
      const lines = [['班別', '班號', '學號', '姓名', `速度(${unit})`, '準確率', '分數', '全級名次', '標記'].map(cell).join(',')]
        .concat(rows.map((s) => [s.className, s.no ?? '', s.sid, s.name, s.wpm === null ? '' : Math.round(s.wpm * 10) / 10, s.accuracy === null ? '' : Math.round(s.accuracy * 10) / 10, s.mark ?? '', s.rank ?? '', (s.flags ?? []).map(flagText).join(' ')].map(cell).join(',')));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
      a.download = `${q.year}-S${q.form}-${q.test}-marks.csv`; a.click();
    };
  };
  if (r.year) $('mf').requestSubmit();
}

// ---------- 自訂練習 ----------
const P_KINDS = { zh: [['text', '整段打字（連標點，要揀字）'], ['chars', '字表打字（隨機出字，要揀字）'], ['split', '字表拆字（只打首尾碼）']], en: [['text', '整段打字'], ['words', '詞語（用空格或逗號分隔）']] };
async function viewPractice(main) {
  const { practices } = await api('/api/teacher/practice');
  const kindName = (p) => (P_KINDS[p.lang].find(([k]) => k === p.kind) ?? [, p.kind])[1];
  main.innerHTML = `<div class="t-head"><div><h1>自訂練習</h1><p class="meta">貼一段文章或一批字詞，學生在「練習區 → 老師出的練習」就會看到。</p></div></div>
    <section class="card"><h2>新增練習</h2><form class="t-form" id="pf">
      <div class="inline-form"><div class="field" style="flex:2 1 220px"><label for="pt">標題</label><input id="pt" required maxlength="40" placeholder="例如：中一 第一單元詞語"></div>
        <div class="field"><label for="pl">語言</label><select id="pl"><option value="zh">中文速成</option><option value="en">英文</option></select></div>
        <div class="field" style="flex:2 1 220px"><label for="pk">類型</label><select id="pk"></select></div>
        <div class="field"><label for="pc">給</label><select id="pc">${isAdmin() ? '<option value="">全校學生</option>' : ''}${classes.map((c) => `<option value="${c.id}">${html(c.year)} ${html(c.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="pcn">內容</label><textarea id="pcn" required rows="6" placeholder="貼上文章或字表"></textarea></div>
      <p class="hint">中文：網站內置速成打不到的字和符號（例如 （）《》……）會自動刪去，並告訴你刪了甚麼。英文：半形標點可以照用。</p>
      <p class="form-msg" id="pm" role="status"></p><div class="form-actions"><button class="btn primary" type="submit">新增</button></div></form></section>
    <section class="card"><h2>已出的練習</h2>${practices.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>標題</th><th>類型</th><th>對象</th><th>內容</th><th>老師</th><th></th></tr></thead><tbody>${practices.map((p) => `<tr>
      <td>${html(p.title)}</td><td class="mini">${p.lang === 'zh' ? '中文' : '英文'}・${html(kindName(p))}</td><td class="mini">${p.class_name ? html(`${p.class_year} ${p.class_name}`) : '全校'}</td>
      <td class="mini">${html([...p.content].slice(0, 24).join(''))}${[...p.content].length > 24 ? '…' : ''}（${[...p.content].length} 字）</td><td class="mini">${html(p.teacher)}</td>
      <td>${p.teacher_id === me.id || isAdmin() ? `<button class="btn sm" type="button" data-del="${p.id}">刪除</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有自訂練習。</p>'}</section>`;
  const syncKinds = () => { $('pk').innerHTML = P_KINDS[$('pl').value].map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); };
  $('pl').onchange = syncKinds; syncKinds();
  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/teacher/practice', { method: 'POST', body: { title: $('pt').value, lang: $('pl').value, kind: $('pk').value, classId: $('pc').value || null, content: $('pcn').value } });
      alert(`已新增（${r.length} 字）${r.removed ? `\n以下字元打不到，已刪去：${r.removed}` : ''}`); render();
    } catch (err) { msg($('pm'), err.message); }
  };
  main.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('刪除這個練習？')) { await api(`/api/teacher/practice/${b.dataset.del}`, { method: 'DELETE' }); render(); } });
}

// ---------- 問題回報 ----------
async function feedbackCount() {
  try { const { feedback } = await api('/api/teacher/feedback'); const n = feedback.filter((f) => !f.resolved).length; $('fb-n').hidden = !n; $('fb-n').textContent = n; } catch { /* ignore */ }
}
async function viewFeedback(main) {
  const { feedback } = await api('/api/teacher/feedback');
  main.innerHTML = `<div class="t-head"><div><h1>問題回報</h1><p class="meta">學生和老師按網站右下角「回報問題」送來的訊息。${isAdmin() ? '你是管理員，看到全校的回報。' : '你看到自己班學生的回報。'}</p></div></div>
    <section class="card">${feedback.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>時間</th><th>誰</th><th>頁面</th><th>內容</th><th></th></tr></thead><tbody>
    ${feedback.map((f) => `<tr class="${f.resolved ? 'muted' : ''}"><td class="mini">${fmtTime(f.created_at)}</td>
      <td class="mini">${f.sid ? `${html(f.class_name ?? '')} ${html(f.name)}` : f.teacher_name ? `${html(f.teacher_name)}（老師）` : '—'}</td><td class="mini">${html(f.page)}</td>
      <td class="wrap" style="max-width:420px">${html(f.message)}<br><span class="mini">${html((f.ua ?? '').replace(/^Mozilla\/5\.0 /, '').slice(0, 80))}</span></td>
      <td>${f.resolved ? '<span class="status ok">已處理</span>' : `<button class="btn sm" type="button" data-ok="${f.id}">標記已處理</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有回報。</p>'}
    <p class="hint">技術問題（例如網站出錯）請把內容轉告平台營運者。已處理的回報一年後會自動刪除。</p></section>`;
  main.querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => { await api(`/api/teacher/feedback/${b.dataset.ok}/resolve`, { method: 'POST', body: {} }); render(); });
}

// ---------- 學校設定（管理員）----------
async function viewSchool(main) {
  const [{ teachers }, bk] = await Promise.all([api('/api/teacher/teachers'), api('/api/teacher/backup/status')]);
  const s = me.school ?? { settings: {} };
  const days = bk.lastBackup ? Math.floor((Date.now() - new Date(bk.lastBackup)) / 86400000) : null;
  main.innerHTML = `<div class="t-head"><div><h1>學校設定</h1><p class="meta">學校代碼：<span class="pw">${html(s.code)}</span>（學生登入時用；印在帳號紙條上）</p></div></div>
    <section class="card"><h2>學校</h2><form class="t-form" id="sf">
      <div class="field"><label for="sname">學校名稱（顯示在登入頁、紙條、報告）</label><input id="sname" required maxlength="60" value="${html(s.name)}"></div>
      <div class="settings-list">
        <label class="check" for="s1"><input type="checkbox" id="s1" ${s.settings.testsNeedWindow ? 'checked' : ''}><span>評測要老師開放<small>開啟後，學生只可以在老師按班開放的時段內開始評測（適合在課堂上統一進行）。</small></span></label>
        <label class="check" for="s2"><input type="checkbox" id="s2" ${s.settings.boardDefault ? 'checked' : ''}><span>新開的班預設開啟排行榜<small>每班老師仍可以自行開關。</small></span></label>
        <label class="check" for="s3"><input type="checkbox" id="s3" ${s.settings.studentRemember ? 'checked' : ''}><span>學生登入時可以選「記住我 30 日」<small>關閉後學生一律在關閉瀏覽器時登出（全校共用電腦時建議關閉）。</small></span></label>
      </div>
      <p class="form-msg" id="sm" role="status"></p><div class="form-actions"><button class="btn primary" type="submit">儲存</button></div></form></section>
    <section class="card"><h2>教師</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>姓名</th><th>帳號</th><th>身份</th><th class="num">班級</th><th></th></tr></thead><tbody>
      ${teachers.map((t) => `<tr><td>${html(t.name)}</td><td class="mini">${html(t.username)}</td>
        <td><label class="visually-hidden" for="role${t.id}">${html(t.name)} 的身份</label><select id="role${t.id}" data-role="${t.id}" ${t.id === me.id ? 'disabled' : ''}><option value="teacher" ${t.role !== 'admin' ? 'selected' : ''}>老師</option><option value="admin" ${t.role === 'admin' ? 'selected' : ''}>管理員</option></select></td>
        <td class="num">${t.classes}</td><td><div class="t-actions"><button class="btn sm" type="button" data-pw="${t.id}" data-name="${html(t.name)}">重設密碼</button>${t.id === me.id ? '' : `<button class="btn sm danger" type="button" data-deltea="${t.id}">刪除</button>`}</div></td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin:18px 0 8px">新增教師</h3>
      <form class="inline-form" id="tf"><div class="field"><label for="tn">姓名</label><input id="tn" required></div><div class="field"><label for="tu">帳號</label><input id="tu" required autocapitalize="none" placeholder="例如 ${html(s.code)}.chan"></div>
        <div class="field"><label for="tp">密碼（至少 8 個字元）</label><input id="tp" type="password" required minlength="8" autocomplete="new-password"></div>
        <div class="field"><label for="tr">身份</label><select id="tr"><option value="teacher">老師（只看自己的班）</option><option value="admin">管理員</option></select></div>
        <button class="btn primary" type="submit">新增</button></form><p class="form-msg" id="tm"></p>
      <p class="hint">教師帳號全平台唯一，建議用「學校代碼.姓氏」。老師只看到自己的班；管理員看全校，並可以改學校設定、管理教師、備份和還原。</p></section>
    <section class="card"><h2>備份</h2>
      <p>上次下載備份：<b${days === null || days > 7 ? ' style="color:var(--bad)"' : ''}>${bk.lastBackup ? (days === 0 ? '今日' : `${days} 日前`) : '從未下載'}</b>。現有 ${bk.counts.classes} 班、${bk.counts.students} 位學生、${bk.counts.test_attempts} 次評測。</p>
      <p class="hint">${bk.r2 ? `平台每星期日早上自動備份到雲端（保留最近 12 份）。上次自動備份：${bk.lastAutoBackup ? fmtTime(bk.lastAutoBackup) : '尚未'}${bk.lastAutoError ? `；<span style="color:var(--bad)">上次自動備份失敗，請通知平台營運者</span>` : ''}。` : '雲端自動備份：未開啟（請聯絡平台營運者）。'}建議每月下載一份，存在學校的雲端硬碟。備份檔包括密碼雜湊，不要公開分享。</p>
      <div class="form-actions"><a class="btn" id="bk-dl" href="../api/teacher/backup" download>下載備份</a>${bk.r2 ? '<button class="btn" id="bk-now" type="button">立即雲端備份</button><button class="btn" id="bk-list" type="button">雲端備份檔…</button>' : ''}<button class="btn danger" id="bk-restore" type="button">還原備份…</button></div></section>`;
  $('sf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/teacher/school', { method: 'POST', body: { name: $('sname').value, settings: { testsNeedWindow: $('s1').checked, boardDefault: $('s2').checked, studentRemember: $('s3').checked } } });
      me.school = r.school; $('school-name').textContent = r.school.name; msg($('sm'), '已儲存', true); } catch (err) { msg($('sm'), err.message); }
  };
  $('tf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/teacher/add', { method: 'POST', body: { name: $('tn').value, username: $('tu').value, password: $('tp').value, role: $('tr').value } }); render(); } catch (err) { msg($('tm'), err.message); } };
  main.querySelectorAll('[data-role]').forEach((sel) => sel.onchange = async () => { try { await api(`/api/teacher/teachers/${sel.dataset.role}/role`, { method: 'POST', body: { role: sel.value } }); } catch (e) { alert(e.message); render(); } });
  main.querySelectorAll('[data-pw]').forEach((b) => b.onclick = () => dialog(`<h2 id="dlg-title">重設 ${b.dataset.name} 的密碼</h2><form data-main>
    <div class="field"><label for="np">新密碼（至少 8 個字元）</label><input id="np" required minlength="8" autocomplete="off"></div><p class="hint">這位老師所有電腦的登入會被登出。</p>${actions('重設')}</form>`,
    async () => { await api(`/api/teacher/teachers/${b.dataset.pw}/reset`, { method: 'POST', body: { password: $('np').value } }); return '已重設'; }));
  main.querySelectorAll('[data-deltea]').forEach((b) => b.onclick = async () => { if (!confirm('刪除這位老師？他出過的功課和練習會轉到你名下。')) return; try { await api(`/api/teacher/teachers/${b.dataset.deltea}`, { method: 'DELETE' }); render(); } catch (e) { alert(e.message); } });
  $('bk-dl').addEventListener('click', () => setTimeout(render, 3000));
  $('bk-now')?.addEventListener('click', async (e) => { e.target.disabled = true; try { await api('/api/teacher/backup/cloud', { method: 'POST', body: {} }); alert('已備份到雲端'); render(); } catch (err) { alert(err.message); e.target.disabled = false; } });
  $('bk-list')?.addEventListener('click', async () => {
    const r = await api('/api/teacher/backup/cloud');
    dialog(`<h2 id="dlg-title">雲端備份檔</h2>${r.files.length ? `<ul>${r.files.map((f) => `<li><a href="../api/teacher/backup/cloud/${encodeURIComponent(f.key)}" download>${html(f.key)}</a> <span class="muted">${Math.round(f.size / 1024)} KB</span></li>`).join('')}</ul>` : '<p class="muted">還沒有雲端備份。</p>'}
      <div class="form-actions"><button class="btn primary" type="button" data-close>關閉</button></div>`);
  });
  $('bk-restore').onclick = restoreDialog;
}

function restoreDialog() {
  dialog(`<h2 id="dlg-title">還原備份</h2>
    <p class="hint" style="color:var(--bad)"><b>注意：</b>還原會用備份檔<b>取代本校現有的全部資料</b>（教師、班級、學生、進度、評測、自訂練習），所有人要重新登入。其他學校的資料不受影響。只在資料遺失或出錯時才用。</p>
    <form data-main><div class="file-pick"><input type="file" id="bf" accept=".json,application/json" required><label class="btn sm" for="bf">選擇備份檔（.json）…</label><span class="muted" id="bf-info"></span></div>
    <div class="field"><label for="bc">確認：請輸入「還原」兩個字</label><input id="bc" required autocomplete="off"></div>
    <p class="hint">還原後，未改過密碼的學生，紙條上的密碼會顯示「請老師重設」（備份檔不保存初始密碼）。</p>
    <p class="form-msg" role="status"></p><div class="form-actions"><button class="btn danger" type="submit">還原</button><button class="btn ghost" type="button" data-close>取消</button></div></form>`,
  async () => {
    const f = $('bf').files[0];
    if (!f) throw new Error('請選擇備份檔');
    let backup;
    try { backup = JSON.parse(await f.text()); } catch { throw new Error('檔案不是有效的備份檔'); }
    const r = await api('/api/teacher/restore', { method: 'POST', body: { confirm: $('bc').value.trim(), backup } });
    $('dlg').dataset.keep = '1';
    setTimeout(() => location.reload(), 2000);
    return `已還原：${r.counts.classes ?? 0} 班、${r.counts.students ?? 0} 位學生。請重新登入。`;
  });
  $('bf').onchange = async () => {
    try {
      const d = JSON.parse(await $('bf').files[0].text());
      $('bf-info').textContent = d.app === 'typing-platform' ? `${d.school?.name ?? ''} ${new Date(d.exportedAt).toLocaleString('zh-HK')}；${d.tables.classes?.length ?? 0} 班、${d.tables.students?.length ?? 0} 位學生` : '這不是打字平台的備份檔';
    } catch { $('bf-info').textContent = '讀不到這個檔案'; }
  };
}

// ---------- 平台管理（營運者）----------
async function viewPlatform(main) {
  const { schools } = await api('/api/owner/schools');
  main.innerHTML = `<div class="t-head"><div><h1>全部學校</h1><p class="meta">你是平台營運者：可以新增學校、暫停或刪除學校帳戶、重設學校管理員的密碼。各校老師只看到自己學校的資料。</p></div></div>
    <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>學校</th><th>代碼</th><th>管理員</th><th class="num">老師</th><th class="num">班級</th><th class="num">學生</th><th>最近有學生練習</th><th>狀態</th><th></th></tr></thead><tbody>
    ${schools.map((s) => `<tr class="${s.active ? '' : 'muted'}"><td>${html(s.name)}${s.note ? `<br><span class="mini">${html(s.note)}</span>` : ''}</td><td class="pw">${html(s.code)}</td><td class="mini">${html(s.admins ?? '')}</td>
      <td class="num">${s.teachers}</td><td class="num">${s.classes}</td><td class="num">${s.students}</td><td class="mini">${s.last_active ? fmtTime(s.last_active) : '—'}</td>
      <td>${s.active ? '<span class="status ok">使用中</span>' : '<span class="status warn">已暫停</span>'}</td>
      <td><details class="menu row-menu"><summary class="btn sm" aria-label="${html(s.name)} 的操作">⋯</summary><div>
        <button type="button" data-edit="${s.id}">更改名稱／備註</button><button type="button" data-reset="${s.id}">重設管理員密碼</button>
        ${s.id === me.school?.id || s.code === me.school?.code ? '' : `<button type="button" data-toggle="${s.id}" data-on="${s.active ? 0 : 1}">${s.active ? '暫停帳戶' : '恢復帳戶'}</button><hr><button type="button" class="danger" data-delete="${s.id}" data-code="${html(s.code)}">刪除學校…</button>`}</div></details></td></tr>`).join('')}</tbody></table></div></section>
    <section class="card"><h2>新增學校</h2><form class="t-form" id="nf">
      <div class="inline-form"><div class="field" style="flex:2 1 220px"><label for="ns">學校名稱</label><input id="ns" required maxlength="60"></div>
        <div class="field"><label for="nc">學校代碼</label><input id="nc" required pattern="[a-z0-9][a-z0-9\\-]{1,19}" autocapitalize="none" placeholder="例如 spc"></div></div>
      <div class="inline-form"><div class="field"><label for="na">第一位管理員姓名</label><input id="na" required></div>
        <div class="field"><label for="nu">管理員帳號</label><input id="nu" required autocapitalize="none"></div>
        <div class="field"><label for="np2">管理員密碼（至少 8 個字元）</label><input id="np2" required minlength="8" autocomplete="off"></div></div>
      <div class="field"><label for="nn">備註（只有營運者看到，例如合約期、聯絡人）</label><input id="nn" maxlength="500"></div>
      <p class="form-msg" id="nm" role="status"></p><div class="form-actions"><button class="btn primary" type="submit">新增學校</button></div></form></section>`;
  $('nf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/owner/schools', { method: 'POST', body: { schoolName: $('ns').value, schoolCode: $('nc').value.trim().toLowerCase(), name: $('na').value, username: $('nu').value, password: $('np2').value, note: $('nn').value } });
      alert(`已新增。請把以下資料交給學校管理員：\n網址：${location.origin}/teacher/\n帳號：${$('nu').value}\n密碼：${$('np2').value}\n學校代碼：${$('nc').value}`); render(); } catch (err) { msg($('nm'), err.message); }
  };
  const byId = (id) => schools.find((s) => String(s.id) === String(id));
  main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => { const s = byId(b.dataset.edit); dialog(`<h2 id="dlg-title">${html(s.name)}</h2><form data-main>
    <div class="field"><label for="en">學校名稱</label><input id="en" required value="${html(s.name)}"></div><div class="field"><label for="ent">備註</label><input id="ent" value="${html(s.note ?? '')}"></div>${actions('儲存')}</form>`,
    async () => { await api(`/api/owner/schools/${s.id}`, { method: 'POST', body: { name: $('en').value, note: $('ent').value } }); render(); return '已儲存'; }); });
  main.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => { const s = byId(b.dataset.reset); dialog(`<h2 id="dlg-title">重設 ${html(s.name)} 管理員密碼</h2><form data-main>
    <div class="field"><label for="ru">管理員帳號</label><input id="ru" required value="${html((s.admins ?? '').split(' ')[0] ?? '')}"></div><div class="field"><label for="rp">新密碼（至少 8 個字元）</label><input id="rp" required minlength="8" autocomplete="off"></div>${actions('重設')}</form>`,
    async () => { await api(`/api/owner/schools/${s.id}/reset-admin`, { method: 'POST', body: { username: $('ru').value, password: $('rp').value } }); return '已重設'; }); });
  main.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => { const on = b.dataset.on === '1'; if (!on && !confirm('暫停這間學校？該校所有老師和學生會即時登出，之後不能登入，直至恢復。資料會保留。')) return; await api(`/api/owner/schools/${b.dataset.toggle}`, { method: 'POST', body: { active: on } }); render(); });
  main.querySelectorAll('[data-delete]').forEach((b) => b.onclick = () => dialog(`<h2 id="dlg-title">刪除學校</h2><form data-main>
    <p><b>這間學校全部老師、班級、學生、進度和評測會永久刪除，不能復原。</b>建議先請學校下載備份。</p>
    <div class="field"><label for="dc">確認：請輸入學校代碼「${b.dataset.code}」</label><input id="dc" required autocomplete="off"></div>
    <p class="form-msg" role="status"></p><div class="form-actions"><button class="btn danger" type="submit">永久刪除</button><button class="btn ghost" type="button" data-close>取消</button></div></form>`,
    async () => { const r = await api(`/api/owner/schools/${b.dataset.delete}`, { method: 'DELETE', body: { confirm: $('dc').value.trim() } }); render(); return `已刪除（${r.deletedStudents} 位學生）`; }));
}

boot().catch((e) => { app.innerHTML = `<p class="form-msg">${html(e.message)}</p>`; });
