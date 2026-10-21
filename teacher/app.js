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
  $('who').textContent = `${me.name}（${me.username}）${me.role === 'admin' ? '・管理員' : ''}`;
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
      <section class="card"><h2>問題回報 <span class="badge-n" id="fb-n" hidden></span></h2>
        <p class="hint">學生按網站右下角「回報問題」送來的訊息。</p>
        <div class="form-actions"><button class="btn" id="feedback" type="button">查看回報</button></div>
      </section>
      ${me.role === 'admin' ? `<section class="card"><h2>備份</h2>
        <p class="hint" id="bk-status">載入中…</p>
        <div class="form-actions"><a class="btn" id="bk-dl" href="/api/teacher/backup" download>下載備份</a><button class="btn" id="bk-restore" type="button">還原備份</button></div>
        <div id="bk-cloud"></div>
      </section>` : ''}
      <section class="card"><h2>帳戶</h2>
        <div class="form-actions">${me.role === 'admin' ? '<button class="btn" id="teachers" type="button">管理教師</button>' : ''}<button class="btn" id="mypw" type="button">改密碼</button></div>
        ${me.role === 'admin' ? '' : '<p class="hint">你只會看到自己的班級。要轉班或新增老師，請找管理員。</p>'}
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
  $('teachers')?.addEventListener('click', teachersDialog);
  $('feedback').onclick = feedbackDialog;
  feedbackCount();
  $('mypw').onclick = () => dialog(`<h2>更改我的密碼</h2><form id="df"><div class="field"><label>舊密碼</label><input id="o" type="password" required></div><div class="field"><label>新密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8"></div><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">更改</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => { await api('/api/teacher/password', { method: 'POST', body: { old: $('o').value, password: $('p').value } }); return '已更改。'; });
  $('practice').onclick = practiceDialog;
  if (me.role === 'admin') { backupStatus(); $('bk-dl').addEventListener('click', () => setTimeout(backupStatus, 2500)); $('bk-restore').onclick = restoreDialog; }
  renderClass();
}

async function backupStatus() {
  try {
    const r = await api('/api/teacher/backup/status');
    const days = r.lastBackup ? Math.floor((Date.now() - new Date(r.lastBackup)) / 86400000) : null;
    const when = r.lastBackup ? (days === 0 ? '今日' : `${days} 日前`) : '從未下載';
    $('bk-status').innerHTML = `上次下載備份：<b${days === null || days > 7 ? ' style="color:var(--bad)"' : ''}>${when}</b>。現有 ${r.counts.classes} 班、${r.counts.students} 個學生、${r.counts.test_attempts} 次評測。<br>建議每星期下載一次，存在學校的雲端硬碟。備份檔包括密碼資料，不要公開分享。`;
    cloudBackups(r);
  } catch { $('bk-status').textContent = '未能讀取備份狀態。'; }
}

/** R2 雲端自動備份：列出最近的檔、可下載、可立即備份 */
async function cloudBackups(status) {
  const box = $('bk-cloud');
  if (!status.r2) { box.innerHTML = '<p class="hint" style="margin-top:8px">雲端自動備份（每星期日早上）尚未啟用：在 Cloudflare 建立 R2 儲存桶 <code>typing-backups</code>，再打開 wrangler.jsonc 內的 r2_buckets 設定。</p>'; return; }
  try {
    const r = await api('/api/teacher/backup/cloud');
    const auto = status.lastAutoBackup ? new Date(status.lastAutoBackup).toLocaleString('zh-HK', { hour12: false }) : '尚未';
    box.innerHTML = `<h3 style="margin:12px 0 4px">雲端自動備份</h3><p class="hint">每星期日早上自動備份到 Cloudflare R2，保留最近 12 份。上次自動備份：${auto}。</p>
      <div class="form-actions"><button class="btn" id="bk-now" type="button">立即雲端備份</button></div>
      ${r.files.length ? `<ul class="mini" style="margin:6px 0 0;padding-left:18px">${r.files.slice(0, 12).map((f) => `<li><a href="/api/teacher/backup/cloud/${f.key}" download>${f.key}</a> <span class="muted">${Math.round(f.size / 1024)} KB</span></li>`).join('')}</ul>` : '<p class="muted">還沒有雲端備份。</p>'}`;
    $('bk-now').onclick = async () => { $('bk-now').disabled = true; try { await api('/api/teacher/backup/cloud', { method: 'POST', body: {} }); alert('已備份到雲端'); backupStatus(); } catch (e) { alert(e.message); } $('bk-now').disabled = false; };
  } catch (e) { box.innerHTML = `<p class="hint">${e.message}</p>`; }
}

function restoreDialog() {
  dialog(`<h2>還原備份</h2>
    <p class="hint" style="color:var(--bad)"><b>注意：</b>還原會用備份檔<b>取代網站上現有的全部資料</b>（教師、班級、學生、進度、評測、自訂練習），之後要重新登入。只在資料遺失或出錯時才用。</p>
    <form id="df"><div class="field"><label>備份檔（.json）</label><input type="file" id="bf" accept=".json,application/json" required></div>
    <p class="hint" id="bf-info"></p>
    <div class="field"><label>確認：請輸入「還原」兩個字</label><input id="bc" required autocomplete="off"></div>
    <p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">還原</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => {
      const f = $('bf').files[0];
      if (!f) throw new Error('請選擇備份檔');
      let backup;
      try { backup = JSON.parse(await f.text()); } catch { throw new Error('檔案不是有效的備份檔'); }
      const r = await api('/api/teacher/restore', { method: 'POST', body: { confirm: $('bc').value.trim(), backup } });
      $('dlg').dataset.keep = '1';
      setTimeout(() => location.reload(), 1800);
      return `已還原：${r.counts.classes ?? 0} 班、${r.counts.students ?? 0} 個學生。請重新登入。`;
    });
  $('bf').onchange = async () => {
    try {
      const d = JSON.parse(await $('bf').files[0].text());
      $('bf-info').textContent = d.app === 'typing-platform'
        ? `備份時間：${new Date(d.exportedAt).toLocaleString('zh-HK')}；${d.tables.classes?.length ?? 0} 班、${d.tables.students?.length ?? 0} 個學生、${d.tables.test_attempts?.length ?? 0} 次評測。`
        : '這不是打字平台的備份檔。';
    } catch { $('bf-info').textContent = '讀不到這個檔案。'; }
  };
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

let view = 'list';
const TEST_PASS = { 'en-s1': [10, 90], 'en-s2': [20, 90], 'en-s3': [30, 90], 'zh-s1': [6, 90], 'zh-s2': [12, 90], 'zh-s3': [18, 90] };

/** 全班報告：只用名單已有的資料（進度摘要、評測成績），不另外向伺服器取資料 */
function classReport(students) {
  if (!students.length) return '<p class="muted">還沒有學生。</p>';
  const n = students.length;
  const now = Date.now();
  const sm = (s) => s.summary ?? { en: { lessons: 0, bestWpm: 0 }, zh: { lessons: 0, bestWpm: 0 }, minutes: 0, lastActive: null };
  const days = (s) => (sm(s).lastActive ? Math.floor((now - new Date(sm(s).lastActive)) / 86400000) : null);
  const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0; };
  const name = (s) => `${s.class_no ?? ''} ${html(s.name)}`;
  const active7 = students.filter((s) => days(s) !== null && days(s) <= 7).length;
  const never = students.filter((s) => !sm(s).lastActive);
  const idle = students.filter((s) => days(s) !== null && days(s) > 14);
  const med = { en: median(students.map((s) => sm(s).en.lessons)), zh: median(students.map((s) => sm(s).zh.lessons)) };
  const behind = (lang) => students.filter((s) => sm(s).lastActive && sm(s)[lang].lessons <= med[lang] - 3);
  const tile = (label, value, sub = '') => `<div class="rp-tile"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  // 完成課數分佈（0–16 課），每格一個長條
  const dist = (lang) => {
    const cnt = Array(17).fill(0);
    for (const s of students) cnt[Math.min(16, sm(s)[lang].lessons)] += 1;
    const max = Math.max(...cnt, 1);
    return `<div class="rp-dist" role="img" aria-label="${lang === 'en' ? '英文' : '中文'}完成課數分佈">${cnt.map((c, i) => `<div class="rp-col" title="完成 ${i} 課：${c} 人"><span class="rp-bar" style="height:${(c / max) * 100}%"></span><i>${c || ''}</i><small>${i}</small></div>`).join('')}</div>`;
  };
  const list = (arr, extra = () => '') => arr.length ? `<ul class="rp-names">${arr.map((s) => `<li>${name(s)}${extra(s)}</li>`).join('')}</ul>` : '<p class="muted">沒有</p>';
  const testRows = TESTS.map(([id, label]) => {
    const done = students.filter((s) => s.tests[id]);
    if (!done.length) return `<tr><td>${label}</td><td class="num">0 / ${n}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="mini">—</td></tr>`;
    const w = done.map((s) => s.tests[id].wpm), a = done.map((s) => s.tests[id].accuracy);
    const pass = TEST_PASS[id];
    const passed = pass ? done.filter((s) => s.tests[id].wpm >= pass[0] && s.tests[id].accuracy >= pass[1]).length : null;
    const flagged = done.filter((s) => s.tests[id].flags.length).length;
    return `<tr><td>${label}</td><td class="num">${done.length} / ${n}</td><td class="num">${Math.round(median(w))}</td><td class="num">${Math.round(median(a))}%</td>
      <td class="num">${passed === null ? '—' : `${passed}（${Math.round((passed / done.length) * 100)}%）`}</td><td class="mini">${flagged ? `⚠ ${flagged} 人` : ''}</td></tr>`;
  }).join('');
  return `<div class="rp">
    <div class="rp-tiles">
      ${tile('學生', n)}${tile('最近 7 日有練習', `${active7} 人`, `${Math.round((active7 / n) * 100)}%`)}
      ${tile('英文完成課數（中位數）', med.en)}${tile('中文完成課數（中位數）', med.zh)}
      ${tile('英文最佳速度（中位數）', `${Math.round(median(students.map((s) => sm(s).en.bestWpm)))} WPM`)}${tile('中文最佳速度（中位數）', `${Math.round(median(students.map((s) => sm(s).zh.bestWpm)))} 字/分`)}
    </div>
    <div class="rp-grid">
      <section><h3>英文：完成課數分佈</h3>${dist('en')}<p class="hint">橫軸是完成了幾多課（0–16），長條是人數。</p></section>
      <section><h3>中文：完成課數分佈</h3>${dist('zh')}</section>
    </div>
    <h3>需要留意</h3>
    <div class="rp-grid">
      <section><h4>從未登入練習（${never.length}）</h4>${list(never)}</section>
      <section><h4>超過 14 日沒有練習（${idle.length}）</h4>${list(idle, (s) => `<small>${days(s)} 日</small>`)}</section>
      <section><h4>英文落後全班 3 課或以上（${behind('en').length}）</h4>${list(behind('en'), (s) => `<small>${sm(s).en.lessons} 課</small>`)}</section>
      <section><h4>中文落後全班 3 課或以上（${behind('zh').length}）</h4>${list(behind('zh'), (s) => `<small>${sm(s).zh.lessons} 課</small>`)}</section>
    </div>
    <h3>評測</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>評測</th><th>已做</th><th>速度中位數</th><th>準確率中位數</th><th>達標</th><th>可疑</th></tr></thead><tbody>${testRows}</tbody></table></div>
    <p class="hint">英文速度單位是 WPM，中文是每分鐘字數。達標＝同時達到該級的速度和準確率目標。</p>
  </div>`;
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
      <td class="num">${s.class_no ?? ''}</td><td>${html(s.sid)}</td><td><a href="student.html?id=${s.id}" title="看這位學生的詳細紀錄">${html(s.name)}</a></td>
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
      ${me.role === 'admin' ? '<button class="btn" id="owner">轉班</button>' : ''}
      ${students.length ? '' : `<button class="btn" id="delclass">刪除班級</button>`}
    </div>
    <div class="t-tabs" role="tablist"><button class="btn ${view === 'list' ? 'primary' : ''}" data-view="list" type="button">學生名單</button><button class="btn ${view === 'report' ? 'primary' : ''}" data-view="report" type="button">全班報告</button><button class="btn ${view === 'hw' ? 'primary' : ''}" data-view="hw" type="button">功課</button></div>
    ${view === 'report' ? classReport(students) : view === 'hw' ? '<div id="hw"><p class="muted">載入中…</p></div>' : `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>班號</th><th>學號</th><th>姓名</th><th>密碼</th>
      <th title="英文完成課數">英課</th><th>英星</th><th>英WPM</th><th title="中文完成課數">中課</th><th>中星</th><th>中字/分</th><th>分鐘</th><th>最後活動</th>
      ${TESTS.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="21" class="muted">還沒有學生。按「匯入學生」貼上名單。</td></tr>'}</tbody></table></div>
    <p class="hint">評測格：速度 準確率 星級；⚠ 表示伺服器重計時發現可疑（把滑鼠移上去看原因）。所有評測成績都由伺服器按按鍵紀錄重新計算。</p>`}
  </section>`;
  main.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { view = b.dataset.view; renderClass(); });
  if (view === 'hw') renderHomework(students);
  $('import').onclick = importDialog;
  $('slips').onclick = printSlips;
  $('classpw').onclick = () => dialog(`<h2>${html(current.name)} 全班改用同一個密碼</h2><form id="df"><div class="field"><label>新密碼（4–64 個字元）</label><input id="cp" required minlength="4" autocomplete="off"></div><p class="hint">全班學生的舊密碼會失效，已登入的裝置會被登出。</p><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">更改</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
    async () => { const r = await api(`/api/teacher/classes/${current.id}/password`, { method: 'POST', body: { password: $('cp').value.trim() } }); try { localStorage.setItem('teacher.commonPw', $('cp').value.trim()); } catch {} renderClass(); return `已更改 ${r.count} 人。`; });
  $('refresh').onclick = renderClass;
  $('owner')?.addEventListener('click', async () => {
    const { teachers } = await api('/api/teacher/teachers');
    dialog(`<h2>把 ${html(current.name)} 轉給另一位老師</h2><form id="df"><div class="field"><label>老師</label><select id="t">${teachers.map((t) => `<option value="${t.id}" ${t.id === current.teacher_id ? 'selected' : ''}>${html(t.name)}（${html(t.username)}）</option>`).join('')}</select></div><p class="form-msg" id="m"></p><div class="form-actions"><button class="btn primary">轉班</button><button class="btn ghost" type="button" id="close">取消</button></div></form>`,
      async () => { await api(`/api/teacher/classes/${current.id}/owner`, { method: 'POST', body: { teacherId: Number($('t').value) } }); setTimeout(() => location.reload(), 600); return '已轉班。'; });
  });
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
    <div class="field"><label>或選擇 CSV 檔</label><input type="file" id="file" accept=".csv,.txt">　<a href="student-template.csv" download class="hint">下載 Excel 範本（CSV）</a></div>
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


// ---------- 功課指派 ----------
const LESSON_NAMES = { en: {}, zh: {} };
async function lessonNames() {
  if (Object.keys(LESSON_NAMES.en).length) return LESSON_NAMES;
  for (const lang of ['en', 'zh']) {
    const d = await fetch(`../data/${lang}-lessons.json`).then((r) => r.json());
    for (const l of d.lessons) LESSON_NAMES[lang][l.id] = l.title;
  }
  return LESSON_NAMES;
}
async function renderHomework(students) {
  const names = await lessonNames();
  const { assignments } = await api(`/api/teacher/classes/${current.id}/assignments`);
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));
  const today = new Date().toISOString().slice(0, 10);
  const rows = assignments.map((a) => {
    const notDone = students.filter((s) => !a.doneBy.includes(s.id));
    const late = a.due && a.due < today;
    return `<tr><td>${a.lang === 'en' ? '英' : '中'} 第 ${a.lesson_id} 課</td><td>${html(names[a.lang][a.lesson_id] ?? '')}${a.note ? `<br><small class="muted">${html(a.note)}</small>` : ''}</td>
      <td class="mini">${a.due ? `${a.due}${late ? ' <span class="warn">已過期</span>' : ''}` : '—'}</td>
      <td class="num">${a.doneBy.length} / ${students.length}</td>
      <td class="mini">${notDone.length ? notDone.slice(0, 12).map((s) => `${s.class_no ?? ''} ${html(s.name)}`).join('、') + (notDone.length > 12 ? `…等 ${notDone.length} 人` : '') : '<span style="color:var(--ok)">全部完成</span>'}</td>
      <td class="act"><button class="btn" data-del="${a.id}">刪除</button></td></tr>`;
  }).join('');
  const opts = (lang) => Object.entries(names[lang]).map(([id, t]) => `<option value="${id}">第 ${id} 課：${html(t)}</option>`).join('');
  $('hw').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>功課</th><th>課題</th><th>截止</th><th>完成</th><th>未完成</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">還沒有功課。</td></tr>'}</tbody></table></div>
    <h3 style="margin:14px 0 6px">新增功課</h3>
    <form class="inline-form" id="hwf">
      <div class="field"><label>語言</label><select id="hl"><option value="zh">中文速成</option><option value="en">英文</option></select></div>
      <div class="field" style="flex:2 1 240px"><label>課</label><select id="hs">${opts('zh')}</select></div>
      <div class="field"><label>截止日</label><input type="date" id="hd"></div>
      <div class="field" style="flex:2 1 200px"><label>備註（學生會看到）</label><input id="hn" maxlength="200" placeholder="例如：下星期一前完成"></div>
      <button class="btn primary" type="submit">指派</button></form><p class="form-msg" id="hwm"></p>
    <p class="hint">學生登入後，首頁會見到「老師功課」；完成該課的過關小測就算做完。</p>`;
  $('hl').onchange = () => { $('hs').innerHTML = opts($('hl').value); };
  $('hwf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/api/teacher/classes/${current.id}/assignments`, { method: 'POST', body: { lang: $('hl').value, lessonId: Number($('hs').value), due: $('hd').value, note: $('hn').value } }); renderHomework(students); }
    catch (err) { msg($('hwm'), err.message); }
  };
  $('hw').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('刪除這份功課？')) { await api(`/api/teacher/assignments/${b.dataset.del}`, { method: 'DELETE' }); renderHomework(students); } });
}

// ---------- 問題回報 ----------
async function feedbackCount() {
  try {
    const { feedback } = await api('/api/teacher/feedback');
    const n = feedback.filter((f) => !f.resolved).length;
    $('fb-n').hidden = !n; $('fb-n').textContent = n;
  } catch { /* ignore */ }
}
async function feedbackDialog() {
  const { feedback } = await api('/api/teacher/feedback');
  dialog(`<h2>問題回報</h2><div class="result-list">${feedback.length ? `<table class="tbl"><thead><tr><th>時間</th><th>學生</th><th>頁面</th><th>內容</th><th></th></tr></thead><tbody>
    ${feedback.map((f) => `<tr class="${f.resolved ? 'muted' : ''}"><td class="mini">${new Date(f.created_at + 'Z').toLocaleString('zh-HK', { hour12: false })}</td>
      <td class="mini">${f.sid ? `${html(f.class_name ?? '')} ${html(f.name)}` : '未登入'}</td><td class="mini">${html(f.page)}</td>
      <td style="white-space:normal;max-width:360px">${html(f.message)}<br><small class="muted">${html((f.ua ?? '').replace(/^Mozilla\/5\.0 /, '').slice(0, 80))}</small></td>
      <td class="act">${f.resolved ? '已處理' : `<button class="btn" data-ok="${f.id}">已處理</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">還沒有回報。</p>'}</div>
    <div class="form-actions"><button class="btn primary" id="close" type="button">關閉</button></div>`);
  $('dlg').querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => { await api(`/api/teacher/feedback/${b.dataset.ok}/resolve`, { method: 'POST', body: {} }); feedbackCount(); feedbackDialog(); });
}

// ---------- 管理教師（管理員）----------
async function teachersDialog() {
  const { teachers } = await api('/api/teacher/teachers');
  dialog(`<h2>管理教師</h2><div class="result-list"><table class="tbl"><thead><tr><th>帳號</th><th>姓名</th><th>身份</th><th>班級</th><th></th></tr></thead><tbody>
    ${teachers.map((t) => `<tr data-id="${t.id}"><td>${html(t.username)}</td><td>${html(t.name)}</td>
      <td><select data-role="${t.id}" ${t.id === me.id ? 'disabled' : ''}><option value="teacher" ${t.role !== 'admin' ? 'selected' : ''}>老師</option><option value="admin" ${t.role === 'admin' ? 'selected' : ''}>管理員</option></select></td>
      <td class="num">${t.classes}</td>
      <td class="act"><button class="btn" data-pw="${t.id}">重設密碼</button><button class="btn" data-del="${t.id}">刪除</button></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:14px 0 6px">新增教師</h3>
    <form id="df" class="inline-form"><div class="field"><label>帳號</label><input id="u" required></div><div class="field"><label>姓名</label><input id="n" required></div>
      <div class="field"><label>密碼（至少 8 個字元）</label><input id="p" type="password" required minlength="8"></div>
      <div class="field"><label>身份</label><select id="r"><option value="teacher">老師（只看自己的班）</option><option value="admin">管理員</option></select></div>
      <button class="btn primary">新增</button></form><p class="form-msg" id="m"></p>
    <p class="hint">老師只看到自己建立的班級；管理員看全部，並可以備份、還原、轉班。要把班級轉給另一位老師，在班級頁的「轉班」做。</p>
    <div class="form-actions"><button class="btn ghost" id="close" type="button">關閉</button></div>`,
    async () => { await api('/api/teacher/add', { method: 'POST', body: { username: $('u').value, name: $('n').value, password: $('p').value, role: $('r').value } }); $('dlg').dataset.keep = '1'; setTimeout(teachersDialog, 800); return '已新增。'; });
  const d = $('dlg');
  d.querySelectorAll('[data-role]').forEach((sel) => sel.onchange = async () => { try { await api(`/api/teacher/teachers/${sel.dataset.role}/role`, { method: 'POST', body: { role: sel.value } }); } catch (e) { alert(e.message); teachersDialog(); } });
  d.querySelectorAll('[data-pw]').forEach((b) => b.onclick = async () => { const pw = prompt('新密碼（至少 8 個字元）：'); if (!pw) return; try { await api(`/api/teacher/teachers/${b.dataset.pw}/reset`, { method: 'POST', body: { password: pw } }); alert('已重設。'); } catch (e) { alert(e.message); } });
  d.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('刪除這位老師？')) return; try { await api(`/api/teacher/teachers/${b.dataset.del}`, { method: 'DELETE' }); teachersDialog(); } catch (e) { alert(e.message); } });
}
