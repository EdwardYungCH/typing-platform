// 學生詳細頁：每課每步成績、最近 30 天練習、弱項、評測（連按鍵回放）。資料全部由 /api/teacher/students/:id/detail 一次取回。
import { api } from '../js/api.js';
import { applyWorld } from '../js/world.js';
import { ROOTS } from '../js/zh-codes.js';

applyWorld('planet');
const $ = (id) => document.getElementById(id);
const app = $('app');
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FLAG_TEXT = { 'too-fast': '速度超出合理上限', robotic: '按鍵間隔過分平均（疑似程式代打）', 'time-mismatch': '用時跟伺服器記錄不符', 'client-mismatch': '瀏覽器報的分數跟伺服器重計相差很大', 'over-time': '超出時限', empty: '沒有作答' };
const TEST_NAME = { 'en-placement': '英文分級', 'en-s1': '英文中一', 'en-s2': '英文中二', 'en-s3': '英文中三', 'zh-placement': '速成分級', 'zh-s1': '速成中一', 'zh-s2': '速成中二', 'zh-s3': '速成中三' };
const id = Number(new URLSearchParams(location.search).get('id'));
$('print').onclick = () => window.print();

async function boot() {
  let d;
  try { d = await api(`/api/teacher/students/${id}/detail`); } catch (e) { app.innerHTML = `<p class="form-msg">${html(e.message)}</p>`; return; }
  const lessons = {};
  for (const lang of ['en', 'zh']) lessons[lang] = (await fetch(`../data/${lang}-lessons.json`).then((r) => r.json())).lessons;
  const s = d.student, P = d.progress ?? {}, store = P.store ?? {};
  if (s.class_id) $('back').href = `index.html#class=${s.class_id}`;
  document.title = `${s.name}｜學生紀錄`;

  // ---- 總覽 ----
  const attempts = store.attempts ?? [];
  const minutes = Math.round(attempts.reduce((a, x) => a + (x.seconds ?? 0), 0) / 60);
  const doneN = (lang) => Object.entries(store.lessons ?? {}).filter(([k, v]) => k.startsWith(lang + ':') && v.done).length;
  const best = (lang) => Math.round(Math.max(0, ...Object.entries(store.lessons ?? {}).filter(([k]) => k.startsWith(lang + ':')).map(([, v]) => v.bestWpm ?? 0)));
  const last = attempts.length ? attempts[attempts.length - 1].at : null;
  const tile = (l, v, sub = '') => `<div class="rp-tile"><small>${l}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;

  // ---- 最近 30 天 ----
  const days = [...Array(30)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 29 + i); return dt.toISOString().slice(0, 10); });
  const perDay = Object.fromEntries(days.map((x) => [x, 0]));
  for (const a of attempts) { const k = (a.at ?? '').slice(0, 10); if (k in perDay) perDay[k] += (a.seconds ?? 0) / 60; }
  const maxMin = Math.max(1, ...Object.values(perDay));
  const chart = `<div class="rp-dist days" role="img" aria-label="最近 30 天每日練習分鐘">${days.map((k) => `<div class="rp-col" title="${k}：${Math.round(perDay[k])} 分鐘"><span class="rp-bar" style="height:${(perDay[k] / maxMin) * 100}%"></span><i>${Math.round(perDay[k]) || ''}</i><small>${k.slice(8)}</small></div>`).join('')}</div>`;

  // ---- 每課每步 ----
  const stepsOf = (lang, lid) => Object.entries(store.steps ?? {}).filter(([k]) => k.startsWith(`${lang}:${lid}:`)).map(([k, v]) => [Number(k.split(':')[2]), v]).sort((a, b) => a[0] - b[0]);
  const lessonTable = (lang) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>課</th><th>星</th><th>最佳${lang === 'en' ? ' WPM' : '字/分'}</th><th>準確率</th><th>各步（最近成績）</th></tr></thead><tbody>
    ${lessons[lang].map((l) => {
      const r = store.lessons?.[`${lang}:${l.id}`];
      const st = stepsOf(lang, l.id);
      const stepsHtml = st.map(([i, v]) => { const t = l.steps[i - 1]?.title ?? `第 ${i} 步`; const lt = v.latest ?? {}; return `<span class="stp ${lt.accuracy != null && lt.accuracy < 80 ? 'low' : ''}" title="${html(t)}：最近 ${lt.accuracy != null ? Math.round(lt.accuracy) + '%' : '—'}${lt.wpm ? '、' + Math.round(lt.wpm) : ''}">${html(t)} ${lt.accuracy != null ? Math.round(lt.accuracy) + '%' : ''}${lt.stars ? '★'.repeat(lt.stars) : ''}</span>`; }).join('');
      return `<tr class="${r?.done ? '' : 'muted'}"><td>第 ${l.id} 課 ${html(l.title)}</td><td>${r?.stars ? '★'.repeat(r.stars) : r?.done ? '—' : ''}</td><td class="num">${r ? Math.round(r.bestWpm) : ''}</td><td class="num">${r ? Math.round(r.bestAccuracy) + '%' : ''}</td><td style="white-space:normal">${stepsHtml || '<span class="muted">未做</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;

  // ---- 弱項 ----
  const weak = (lang) => Object.entries(store.weak?.[lang] ?? {}).filter(([, v]) => v.tries >= 5).map(([k, v]) => ({ k, rate: v.errors / v.tries, ...v })).sort((a, b) => b.rate - a.rate).slice(0, 12);
  const weakHtml = (lang) => { const w = weak(lang); return w.length ? `<div class="rp-names">${w.map((x) => `<span>${lang === 'zh' && ROOTS[x.k] ? `${ROOTS[x.k]} ${x.k.toUpperCase()}` : html(x.k.length === 1 ? x.k.toUpperCase() : x.k)}<small>${Math.round(x.rate * 100)}%（${x.errors}/${x.tries}）</small></span>`).join('')}</div>` : '<p class="muted">資料不夠</p>'; };

  // ---- 評測 ----
  const testsHtml = d.tests.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>評測</th><th>開始</th><th>交卷</th><th>速度</th><th>準確率</th><th>星</th><th>標記</th><th></th></tr></thead><tbody>
    ${d.tests.map((t, i) => `<tr><td>${TEST_NAME[t.test_id] ?? t.test_id}</td><td class="mini">${new Date(t.started_at).toLocaleString('zh-HK', { hour12: false })}</td><td class="mini">${t.submitted_at ? new Date(t.submitted_at).toLocaleTimeString('zh-HK', { hour12: false }) : '未交'}</td>
      <td class="num">${t.wpm != null ? Math.round(t.wpm) : '—'}${t.client_wpm != null && Math.abs(t.client_wpm - t.wpm) > 2 ? ` <small class="muted">(瀏覽器 ${Math.round(t.client_wpm)})</small>` : ''}</td><td class="num">${t.accuracy != null ? Math.round(t.accuracy) + '%' : '—'}</td><td>${t.stars ? '★'.repeat(t.stars) : ''}</td>
      <td class="mini">${t.flags.length ? `<span class="warn">⚠</span> ${t.flags.map((f) => FLAG_TEXT[f] ?? f).join('；')}` : ''}</td>
      <td class="act">${t.keystrokes?.length ? `<button class="btn" data-replay="${i}">回放</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">未做過評測。</p>';

  app.innerHTML = `<h1 style="margin:0">${html(s.name)} <small class="muted">${html(s.sid)}・${s.year ? html(`${s.year} ${s.class_name}`) : '未編班'}${s.class_no ? ` (${s.class_no})` : ''}</small></h1>
    <p class="hint">進度最後更新：${d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-HK', { hour12: false }) : '從未同步'}</p>
    <div class="rp">
      <div class="rp-tiles">${tile('英文完成課數', `${doneN('en')} / 17`)}${tile('中文完成課數', `${doneN('zh')} / 16`)}${tile('總練習時間', `${minutes} 分鐘`, `${attempts.length} 次`)}
        ${tile('英文最佳速度', `${best('en')} WPM`)}${tile('中文最佳速度', `${best('zh')} 字/分`)}${tile('最後活動', last ? new Date(last).toLocaleDateString('zh-HK') : '—')}</div>
      <section class="card" style="margin-top:12px"><h3>最近 30 天練習時間（分鐘）</h3>${chart}</section>
      <section class="card" style="margin-top:12px"><h3>英文課堂</h3>${lessonTable('en')}<h4 style="margin-top:12px">常錯的鍵</h4>${weakHtml('en')}</section>
      <section class="card" style="margin-top:12px"><h3>中文速成課堂</h3>${lessonTable('zh')}<h4 style="margin-top:12px">常錯的字根／字</h4>${weakHtml('zh')}</section>
      <section class="card" style="margin-top:12px"><h3>評測</h3>${testsHtml}<p class="hint">「回放」按當時的按鍵紀錄逐字重現，可以看出是否有人代打或複製貼上。</p><div id="replay"></div></section>
    </div>`;
  app.querySelectorAll('[data-replay]').forEach((b) => b.onclick = () => replay(d.tests[Number(b.dataset.replay)]));
}

/** 按鍵回放：4 倍速，顯示打出的字和每下按鍵的間隔 */
let timer = null;
function replay(t) {
  clearInterval(timer);
  const ks = t.keystrokes;
  const box = $('replay');
  box.innerHTML = `<div class="card" style="margin-top:10px"><div class="form-actions" style="margin-bottom:8px"><b>${TEST_NAME[t.test_id] ?? t.test_id}</b> 回放（4 倍速）<span class="spacer"></span><button class="btn" id="rp-stop" type="button">停止</button></div>
    <p class="muted" style="white-space:pre-wrap;word-break:break-all;font-family:var(--mono, monospace)">${html(t.text)}</p>
    <p id="rp-out" style="white-space:pre-wrap;word-break:break-all;font-family:var(--mono, monospace);min-height:3em"></p>
    <p class="hint" id="rp-info"></p>${t.lang === 'zh' ? '<p class="hint">中文評測回放顯示的是按鍵序列（字根碼、數字揀字、空白鍵翻頁），不是上屏的字。</p>' : ''}</div>`;
  $('rp-stop').onclick = () => clearInterval(timer);
  const gaps = ks.slice(1).map((k, i) => k.t - ks[i].t).filter((g) => g > 0 && g < 5000);
  const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const sd = gaps.length ? Math.sqrt(gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / gaps.length) : 0;
  $('rp-info').textContent = `共 ${ks.length} 下按鍵；平均間隔 ${Math.round(avg)} 毫秒，標準差 ${Math.round(sd)}（真人通常 100 以上；太平均代表可能是程式代打）。`;
  let i = 0, out = '';
  const start = performance.now();
  timer = setInterval(() => {
    const now = (performance.now() - start) * 4;
    while (i < ks.length && ks[i].t <= now) {
      const k = ks[i].key;
      if (k === 'Backspace') out = out.slice(0, -1);
      else if (k.length === 1) out += k;
      else if (t.lang === 'zh' && k === ' ') out += ' ';
      i++;
    }
    $('rp-out').textContent = out;
    if (i >= ks.length) clearInterval(timer);
  }, 50);
}

boot();
