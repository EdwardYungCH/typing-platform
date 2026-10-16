// 教師後台：首位教師設定、登入、班級、匯入學生、密碼紙條、班級進度、評測核實、匯出 CSV。
import { api } from '../js/api.js';
import { applyWorld } from '../js/world.js';

applyWorld('planet');
const $ = (id) => document.getElementById(id);
const app = $('app');
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TESTS = [['en-placement', '英分級'], ['en-s1', '英中一'], ['en-s2', '英中二'], ['en-s3', '英中三'], ['zh-placement', '中分級'], ['zh-s1', '中中一'], ['zh-s2', '中中二'], ['zh-s3', '中中三']];
const FLAG_TEXT = { 'too-fast': '速度超出合理上限', robotic: '按鍵間隔過分平均（疑似程式代打）', 'time-mismatch': '用時跟伺服器記錄不符', 'client-mismatch': '瀏覽器報的分數跟伺服器重計相差很大', 'over-time': '超出時限', empty: '沒有作答' };

let me = null;
let classes = [];
let current = null;

function msg(el, text, ok = false) { el.className = `form-msg${ok ? ' ok' : ''}`; el.textContent = text; }

async function boot() {
  const st = await api('/api/teacher/status').catch((e) => ({ error: e.message }));
  if (st.error) { app.innerHTML = `<p class="form-msg">${html(st.error)}</p><p class="hint">教師後台需要伺服器。本機測試請用 <code>node --experimental-sqlite tools/dev-server.mjs</code>。</p>`; return; }
  me = st.user;
  if (st.setupNeeded) return renderSetup();
  if (!me) return renderLogin();
  $('who').textContent = `${me.name}（${me.username}）`;
  $('logout').hidden = false;
  $('logout').onclick = async () => { await api('/api/teacher/logout', { method: 'POST', body: {} }); location.reload(); };
  classes = (await api('/api/teacher/classes')).classes;
  const want = Number(new URLSearchParams(location.hash.slice(1)).get('class'));
  current = classes.find((c) => c.id === want) ?? classes[0] ?? null;
  renderMain();
}

function renderSetup() {
  app.innerHTML = `<form class="card form-card" id="f"><h2>建立第一個教師帳號</h2>
    <p class="hint">這個網站還沒有教師帳號。建立後請記好密碼；之後可以在後台新增其他老師。</p>
    <div class="field"><label>帳號（英文／數字）</label><input id="u" required autocomplete="username"></div>
    <div class="field"><label>姓名</label><input id="n" required></div>
    <div class="field"><label>密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8" autocomplete="new-password"></div>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">建立並登入</button></div></form>`;
  $('f').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/teacher/setup', { method: 'POST', body: { username: $('u').value, name: $('n').value, password: $('p').value } }); location.reload(); } catch (err) { msg($('m'), err.message); } };
}

function renderLogin() {
  app.innerHTML = `<form class="card form-card" id="f"><h2>教師登入</h2>
    <div class="field"><label>帳號</label><input id="u" required autocomplete="username"></div>
    <div class="field"><label>密碼</label><input id="p" type="password" required autocomplete="current-password"></div>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">登入</button></div></form>`;
  $('f').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/teacher/login', { method: 'POST', body: { username: $('u').value, password: $('p').value } }); location.reload(); } catch (err) { msg($('m'), err.message); } };
}

function renderMain() {
  const year = new Date();
  const defYear = year.getMonth() >= 7 ? `${year.getFullYear()}-${String(year.getFullYear() + 1).slice(2)}` : `${year.getFullYear() - 1}-${String(year.getFullYear()).slice(2)}`;
  app.innerHTML = `<div class="t-layout">
    <aside class="t-side">
      <section class="card"><h2>班級</h2>
        <ul class="class-list" id="classes">${classes.map((c) => `<li><a href="#class=${c.id}" data-id="${c.id}" ${current?.id === c.id ? 'aria-current="true"' : ''}><span>${html(c.year)} ${html(c.name)}</span><small>${c.students} 人</small></a></li>`).join('') || '<li class="muted">還沒有班級</li>'}</ul>
        <form class="inline-form" id="newclass" style="margin-top:10px">
          <div class="field"><label>班別</label><input id="cname" placeholder="1A" required></div>
          <div class="field"><label>學年</label><input id="cyear" value="${defYear}" required></div>
          <button class="btn" type="submit">新增</button>
        </form><p class="form-msg" id="cmsg"></p>
      </section>
      <section class="card"><h2>自訂練習</h2>
        <p class="hint">貼一段文章或一批字，學生在「練習區」的「老師出的練習」就會看到。</p>
        <div class="form-actions"><button class="btn" id="practice" type="button">管理自訂練習</button></div>
      </section>
      <section class="card"><h2>帳戶</h2>
        <div class="form-actions"><button class="btn" id="addteacher" type="button">新增教師</button><button class="btn" id="mypw" type="button">改密碼</button></div>
      </section>
    </aside>
    <section class="t-main" id="main"></section></div>
    <dialog class="t-dialog" id="dlg"></dialog>`;
  $('classes').querySelectorAll('a').forEach((a) => a.onclick = (e) => { e.preventDefault(); current = classes.find((c) => c.id === Number(a.dataset.id)); location.hash = `class=${current.id}`; renderMain(); });
  $('newclass').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/teacher/classes', { method: 'POST', body: { name: $('cname').value, year: $('cyear').value } }); classes = (await api('/api/teacher/classes')).classes; current = classes.find((c) => c.id === r.id); renderMain(); }
    catch (err) { msg($('cmsg'), err.message); }
  };
  $('addteacher').onclick = () => dialog(`<h2>新增教師</h2><form id="df"><div class="field"><label>帳號</label><input id="u" required></div><div class="field"><label>姓名</label><input id="n" required></div><div class="field"><label>密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8"></div><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">新增</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => { await api('/api/teacher/add', { method: 'POST', body: { username: $('u').value, name: $('n').value, password: $('p').value } }); return '已新增。'; });
  $('mypw').onclick = () => dialog(`<h2>更改我的密碼</h2><form id="df"><div class="field"><label>舊密碼</label><input id="o" type="password" required></div><div class="field"><label>新密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8"></div><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">更改</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => { await api('/api/teacher/password', { method: 'POST', body: { old: $('o').value, password: $('p').value } }); return '已更改。'; });
  $('practice').onclick = practiceDialog;
  renderClass();
}

const P_KINDS = { zh: [['text', '整段打字（連標點，要揀字）'], ['chars', '字表打字（隨機出字，要揀字）'], ['split', '字表拆字（只打首尾碼）']],
                  en: [['text', '整段打字'], ['words', '詞語（用空格或逗號分隔）']] };
async function practiceDialog() {
  const { practices } = await api('/api/teacher/practice');
  const kindName = (p) => (P_KINDS[p.lang].find(([k]) => k === p.kind) ?? [, p.kind])[1];
  const list = practices.length ? `<table class="tbl"><thead><tr><th>標題</th><th>語言／類型</th><th>對象</th><th>內容</th><th></th></tr></thead><tbody>${practices.map((p) => `<tr data-id="${p.id}">
      <td>${html(p.title)}</td><td class="mini">${p.lang === 'zh' ? '中文' : '英文'}・${html(kindName(p))}</td><td class="mini">${p.class_name ? html(`${p.class_year} ${p.class_name}`) : '全部學生'}</td>
      <td class="mini">${html([...p.content].slice(0, 24).join(''))}${[...p.content].length > 24 ? '…' : ''}（${[...p.content].length} 字）</td>
      <td class="act"><button class="btn" data-del="${p.id}">刪除</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">還沒有自訂練習。</p>';
  dialog(`<h2>自訂練習</h2><div class="result-list">${list}</div>
    <h3 style="margin:14px 0 6px">新增</h3>
    <form id="df" class="import-box">
      <div class="inline-form"><div class="field"><label>標題</label><input id="pt" required maxlength="40" placeholder="例如：中一 第一單元詞語"></div>
        <div class="field"><label>語言</label><select id="pl"><option value="zh">中文速成</option><option value="en">英文</option></select></div>
        <div class="field"><label>類型</label><select id="pk"></select></div>
        <div class="field"><label>給</label><select id="pc"><option value="">全部學生</option>${classes.map((c) => `<option value="${c.id}" ${current?.id === c.id ? 'selected' : ''}>${html(c.year)} ${html(c.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label>內容</label><textarea id="pcn" required placeholder="貼上文章或字表"></textarea></div>
      <p class="hint">中文：碼表沒有的字和符號會自動刪去；英文半形標點可以照用。</p>
      <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">新增</button><button class="btn ghost" type="button" id="close">關閉</button></div></form>`,
    async () => {
      const r = await api('/api/teacher/practice', { method: 'POST', body: { title: $('pt').value, lang: $('pl').value, kind: $('pk').value, classId: $('pc').value || null, content: $('pcn').value } });
      $('dlg').dataset.keep = '1';
      setTimeout(practiceDialog, 900);
      return `已新增（${r.length} 字）${r.removed ? `；以下字元打不到，已刪去：${r.removed}` : ''}`;
    });
  const syncKinds = () => { $('pk').innerHTML = P_KINDS[$('pl').value].map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); };
  $('pl').onchange = syncKinds; syncKinds();
  $('dlg').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('刪除這個練習？')) return;
    await api(`/api/teacher/practice/${b.dataset.del}`, { method: 'DELETE' });
    practiceDialog();
  });
}

function dialog(inner, onSubmit) {
  const d = $('dlg');
  d.innerHTML = inner;
  delete d.dataset.keep;
  d.showModal();
  d.querySelector('#close')?.addEventListener('click', () => d.close());
  const f = d.querySelector('#df');
  if (f) f.onsubmit = async (e) => { e.preventDefault(); try { const t = await onSubmit(); msg(d.querySelector('#m'), t, true); if (!d.dataset.keep) setTimeout(() => d.close(), 700); } catch (err) { msg(d.querySelector('#m'), err.message); } };
}

async function renderClass() {
  const main = $('main');
  if (!current) { main.innerHTML = '<section class="card"><h2>先新增一個班級</h2><p class="hint">在左邊輸入班別和學年，然後匯入學生。</p></section>'; return; }
  main.innerHTML = '<section class="card"><p class="muted">載入中…</p></section>';
  const { students } = await api(`/api/teacher/classes/${current.id}/students`);
  const rows = students.map((s) => {
    const sm = s.summary;
    const tests = TESTS.map(([id, label]) => {
      const t = s.tests[id];
      if (!t) return `<td class="mini">—</td>`;
      const warn = t.flags.length ? `<span class="warn" title="${html(t.flags.map((f) => FLAG_TEXT[f] ?? f).join('；'))}">⚠</span>` : '';
      return `<td class="num" title="${label}">${Math.round(t.wpm)} <span class="mini">${Math.round(t.accuracy)}%</span> ${'★'.repeat(t.stars)}${warn}</td>`;
    }).join('');
    const last = sm?.lastActive ? new Date(sm.lastActive).toLocaleDateString('zh-HK') : '—';
    return `<tr data-id="${s.id}" data-sid="${html(s.sid)}" data-name="${html(s.name)}">
      <td class="num">${s.class_no ?? ''}</td><td>${html(s.sid)}</td><td>${html(s.name)}</td>
      <td class="mini">${s.pw_initial ? '初始' : '已自改'}</td>
      <td class="num">${sm?.en.lessons ?? 0}</td><td class="num">${sm?.en.stars ?? 0}</td><td class="num">${Math.round(sm?.en.bestWpm ?? 0)}</td>
      <td class="num">${sm?.zh.lessons ?? 0}</td><td class="num">${sm?.zh.stars ?? 0}</td><td class="num">${Math.round(sm?.zh.bestWpm ?? 0)}</td>
      <td class="num">${sm?.minutes ?? 0}</td><td class="mini">${last}</td>${tests}
      <td class="act"><button class="btn" data-act="reset">重設密碼</button><button class="btn" data-act="retake">重做評測</button><button class="btn" data-act="del">刪除</button></td></tr>`;
  }).join('');
  main.innerHTML = `<section class="card">
    <h2>${html(current.year)} ${html(current.name)}　<small class="muted">${students.length} 人</small></h2>
    <div class="t-toolbar">
      <button class="btn primary" id="import">匯入學生</button>
      <button class="btn" id="slips">列印帳號紙條</button><button class="btn" id="classpw">全班統一密碼</button>
      <a class="btn" href="../api/teacher/classes/${current.id}/export.csv">匯出 CSV</a>
      <button class="btn" id="refresh">重新整理</button>
      ${students.length ? '' : `<button class="btn" id="delclass">刪除班級</button>`}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>班號</th><th>學號</th><th>姓名</th><th>密碼</th>
      <th title="英文完成課數">英課</th><th>英星</th><th>英WPM</th><th title="中文完成課數">中課</th><th>中星</th><th>中字/分</th><th>分鐘</th><th>最後活動</th>
      ${TESTS.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="21" class="muted">還沒有學生。按「匯入學生」貼上名單。</td></tr>'}</tbody></table></div>
    <p class="hint">評測格：速度 準確率 星級；⚠ 表示伺服器重計時發現可疑（把滑鼠移上去看原因）。所有評測成績都由伺服器按按鍵紀錄重新計算。</p>
  </section>`;
  $('import').onclick = importDialog;
  $('slips').onclick = printSlips;
  $('classpw').onclick = () => dialog(`<h2>${html(current.name)} 全班改用同一個密碼</h2><form id="df"><div class="field"><label>新密碼（4–64 個字元）</label><input id="cp" required minlength="4" autocomplete="off"></div><p class="hint">全班學生的舊密碼會失效，已登入的裝置會被登出。</p><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">更改</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => { const r = await api(`/api/teacher/classes/${current.id}/password`, { method: 'POST', body: { password: $('cp').value.trim() } }); try { localStorage.setItem('teacher.commonPw', $('cp').value.trim()); } catch {} renderClass(); return `已更改 ${r.count} 人。`; });
  $('refresh').onclick = renderClass;
  $('delclass')?.addEventListener('click', async () => { if (confirm('刪除這個班級？')) { await api(`/api/teacher/classes/${current.id}`, { method: 'DELETE' }); location.hash = ''; location.reload(); } });
  main.querySelectorAll('button[data-act]').forEach((b) => b.onclick = () => studentAction(b.dataset.act, b.closest('tr').dataset));
}

async function studentAction(act, { id, sid, name }) {
  if (act === 'reset') {
    let last = ''; try { last = localStorage.getItem('teacher.commonPw') ?? ''; } catch {}
    const pw = prompt(`重設 ${name}（${sid}）的密碼。\n輸入新密碼（留空＝隨機產生）：`, last);
    if (pw === null) return;
    const r = await api(`/api/teacher/students/${id}/reset`, { method: 'POST', body: { password: pw.trim() } });
    dialog(`<h2>新密碼</h2><p>${html(name)}（${html(sid)}）的新密碼：</p><p class="pw" style="font-size:24px">${r.password}</p><p class="hint">請抄給學生；學生登入後可以自己再改。「列印帳號紙條」也會印出這個密碼。</p><div class="form-actions"><button class="btn primary" id="close">關閉</button></div>`);
    renderClass();
  } else if (act === 'retake') {
    dialog(`<h2>允許重做評測</h2><p>${html(name)}（${html(sid)}）</p><form id="df"><div class="field"><label>評測</label><select id="t">${TESTS.map(([v, l]) => `<option value="${v}">${l}（${v}）</option>`).join('')}</select></div><p class="hint">會刪除這個評測的舊成績，學生可以再做一次。</p><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">允許重做</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
      async () => { await api(`/api/teacher/students/${id}/retake`, { method: 'POST', body: { testId: $('t').value } }); renderClass(); return '已刪除舊成績。'; });
  } else if (act === 'del') {
    if (!confirm(`刪除學生 ${name}（${sid}）？他的進度和評測成績會一併刪除，不能復原。`)) return;
    await api(`/api/teacher/students/${id}`, { method: 'DELETE' });
    classes = (await api('/api/teacher/classes')).classes; current = classes.find((c) => c.id === current.id); renderMain();
  }
}

function parseRows(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[\t,，;；]|\s{2,}|\s+/).map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    if (/^(學號|sid|id)$/i.test(cells[0])) continue;   // 標題列
    let no = null, sid, name;
    if (cells.length >= 3 && /^\d{1,2}$/.test(cells[0])) { no = Number(cells[0]); sid = cells[1]; name = cells.slice(2).join(''); }
    else if (cells.length >= 3 && /^\d{1,2}$/.test(cells[cells.length - 1])) { no = Number(cells[cells.length - 1]); sid = cells[0]; name = cells.slice(1, -1).join(''); }
    else { sid = cells[0]; name = cells.slice(1).join(''); }
    out.push({ sid, name, no });
  }
  return out;
}

function importDialog() {
  dialog(`<h2>匯入學生到 ${html(current.name)}</h2>
    <p class="hint">每行一個學生：<b>學號 姓名</b>（可加班號在最前或最後；用空格、逗號或 Tab 分隔，從 Excel 直接複製貼上也可以）。學號會成為登入帳號。</p>
    <form id="df" class="import-box"><div class="field"><textarea id="rows" placeholder="1 s27001 陳大文\n2 s27002 李小明"></textarea></div>
    <div class="field"><label>或選擇 CSV 檔</label><input type="file" id="file" accept=".csv,.txt"></div>
    <div class="field"><label>密碼</label>
      <label class="check"><input type="radio" name="pwmode" value="common" checked> 全部用同一個密碼</label>
      <input id="cpw" autocomplete="off" placeholder="例如 sphrc2027（4–64 個字元）">
      <label class="check"><input type="checkbox" id="applyold"> 已在系統內的學生也改用這個密碼</label>
      <label class="check"><input type="radio" name="pwmode" value="random"> 每人隨機產生</label></div>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">匯入</button><button class="btn ghost" type="button" id="close">取消</button></div></form>
    <div class="result-list" id="res"></div>`,
    async () => {
      const rows = parseRows($('rows').value);
      if (!rows.length) throw new Error('沒有讀到任何學生');
      const common = document.querySelector('input[name="pwmode"]:checked').value === 'common';
      const password = common ? $('cpw').value.trim() : '';
      if (common && password.length < 4) throw new Error('請輸入統一密碼（至少 4 個字元），或選「每人隨機產生」');
      const r = await api('/api/teacher/import', { method: 'POST', body: { classId: current.id, rows, password, applyToExisting: common && $('applyold').checked } });
      $('res').innerHTML = `<table class="tbl"><thead><tr><th>學號</th><th>姓名</th><th>密碼</th><th>結果</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td>${html(x.sid)}</td><td>${html(x.name)}</td><td class="pw">${html(x.password ?? '')}</td><td class="mini">${html(x.status)}</td></tr>`).join('')}</tbody></table><p class="hint">密碼之後可在「列印帳號紙條」再看。</p>`;
      $('dlg').dataset.keep = '1';
      classes = (await api('/api/teacher/classes')).classes; current = classes.find((c) => c.id === current.id);
      $('classes').querySelector(`a[data-id="${current.id}"] small`).textContent = `${current.students} 人`;
      renderClass();
      return `完成：新增 ${r.rows.filter((x) => x.password).length} 人，關閉這個視窗後可見名單`;
    });
  $('file').onchange = async (e) => { const f = e.target.files[0]; if (f) $('rows').value = await f.text(); };
  try { const last = localStorage.getItem('teacher.commonPw'); if (last) $('cpw').value = last; } catch {}
  $('cpw').oninput = () => { try { localStorage.setItem('teacher.commonPw', $('cpw').value); } catch {} };
  const sync = () => { const on = document.querySelector('input[name="pwmode"]:checked').value === 'common'; $('cpw').disabled = !on; $('applyold').disabled = !on; };
  document.querySelectorAll('input[name="pwmode"]').forEach((r) => r.onchange = sync);
}

async function printSlips() {
  const { cls, students } = await api(`/api/teacher/classes/${current.id}/slips`);
  $('print').innerHTML = students.map((s) => `<div class="slip"><b>${html(cls.name)}${s.class_no ? ` (${s.class_no})` : ''}　${html(s.name)}</b><br>網址：${location.origin}/login.html<br>學號：<span class="pw">${html(s.sid)}</span><br>密碼：<span class="pw">${s.initial_pw ? html(s.initial_pw) : '（已自行更改）'}</span></div>`).join('');
  $('print').hidden = false;
  window.print();
}

boot().catch((e) => { app.innerHTML = `<p class="form-msg">${html(e.message)}</p>`; });
