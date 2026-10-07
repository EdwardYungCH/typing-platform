// 打字畫面的控制程式：讀取課堂資料，逐步執行「導覽／練習／小測」，顯示結果。
// 網址例子：type.html?lang=en&mode=lesson&id=1&step=2

import { CONFIG } from './config.js';
import { TypingEngine, generateText, makeRng } from './engine.js';
import { VirtualKeyboard, Hands, loadFingers, keyForChar, fingerName } from './keyboard.js';
import { computeStats, starsFor, fmt, fmtAcc } from './stats.js';
import * as store from './storage.js';
import { applyWorld, worldForLang } from './world.js';
import * as pet from './companion.js';
import { Fx } from './fx.js';
import { setSoundEnabled } from './sound.js';
import { QuickEngine, computeZhStats, PAGE } from './quick-engine.js';
import { loadZh, ROOTS } from './zh-codes.js';
import { generateZh } from './zh-gen.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
const lessonId = Number(params.get('id') ?? 0);

const state = {
  lesson: null,
  lessons: [],
  levels: null,
  stepIndex: 0,
  maxReached: 0,
  engine: null,
  kb: null,
  hands: null,
  testResult: null,
};

init().catch((err) => {
  console.error(err);
  $('lesson-title').textContent = '載入失敗';
  $('step-hint').textContent = '請重新整理頁面；如果問題持續，請告訴老師。';
});

async function init() {
  const [, lessonsData, levels] = await Promise.all([
    loadFingers(),
    fetch(`data/${lang}-lessons.json`).then((r) => r.json()),
    fetch('data/levels.json').then((r) => r.json()),
  ]);
  state.lessons = lessonsData.lessons;
  state.levels = levels;
  state.lesson = state.lessons.find((l) => l.id === lessonId);
  if (!state.lesson) {
    $('lesson-title').textContent = '找不到這一課';
    return;
  }

  applyWorld(worldForLang(lang));
  if (lang === 'zh') state.zh = await loadZh();
  state.world = worldForLang(lang);
  state.petData = await pet.loadCompanions();
  state.petId = pet.getChoice(state.world);
  const showFingers = store.getSetting('showFingers', CONFIG.defaults.showFingers);
  state.kb = new VirtualKeyboard($('keyboard'), { showFingers });
  state.hands = new Hands($('hands'));
  setupFingerToggle(showFingers);
  setupFx();

  const L = state.lesson;
  document.title = `第 ${L.id} 課：${L.title}｜打字練習`;
  $('crumb').textContent = lang === 'en' ? '英文打字' : '中文速成';
  $('lesson-eyebrow').textContent = `第 ${L.id} 課`;
  $('lesson-title').textContent = `${L.title}　${L.subtitle ?? ''}`.trim();

  const startStep = Math.min(Math.max(Number(params.get('step') ?? 1) - 1, 0), L.steps.length - 1);
  state.maxReached = startStep;
  renderSteps();
  runStep(startStep);
}

function setupFx() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const level = store.getSetting('fxLevel', reduce ? 0 : 2);
  const sound = store.getSetting('sound', CONFIG.defaults.sound);
  setSoundEnabled(sound);
  $('stage').classList.add('fx-host');
  state.fx = new Fx({ host: $('stage'), pet: $('pet-top'), level, sound });
  const names = ['關', '輕', '全'];
  const paint = () => {
    $('toggle-fx').textContent = `特效：${names[state.fx.level]}`;
    $('toggle-sound').textContent = `音效：${state.fx.sound ? '開' : '關'}`;
    $('toggle-sound').setAttribute('aria-pressed', String(state.fx.sound));
  };
  $('toggle-fx').addEventListener('click', (e) => {
    state.fx.level = (state.fx.level + 1) % 3;
    store.setSetting('fxLevel', state.fx.level);
    if (!state.fx.level) state.fx.reset();
    paint(); e.currentTarget.blur();
  });
  $('toggle-sound').addEventListener('click', (e) => {
    state.fx.sound = !state.fx.sound;
    setSoundEnabled(state.fx.sound);
    store.setSetting('sound', state.fx.sound);
    paint(); e.currentTarget.blur();
  });
  paint();
}

function setupFingerToggle(initial) {
  const btn = $('toggle-fingers');
  const apply = (on) => {
    btn.textContent = `手指顏色：${on ? '開' : '關'}`;
    btn.setAttribute('aria-pressed', String(on));
    state.kb.setFingers(on);
  };
  apply(initial);
  btn.addEventListener('click', () => {
    const on = !state.kb.showFingers;
    store.setSetting('showFingers', on);
    apply(on);
    btn.blur();
  });
}

// ---------- 步驟列 ----------

function renderSteps() {
  const ol = $('steps');
  ol.innerHTML = '';
  state.lesson.steps.forEach((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'step-pill';
    b.textContent = `${i + 1}. ${s.title}`;
    if (i === state.stepIndex) b.setAttribute('aria-current', 'step');
    if (i < state.maxReached || (i === state.maxReached && i < state.stepIndex)) b.classList.add('done');
    b.disabled = i > state.maxReached;
    b.addEventListener('click', () => { b.blur(); runStep(i); });
    li.append(b);
    ol.append(li);
  });
}

// ---------- 執行一個步驟 ----------

function runStep(i) {
  state.engine?.detach();
  state.guideCleanup?.();
  state.guideCleanup = null;
  state.stepIndex = i;
  state.maxReached = Math.max(state.maxReached, i);
  hidePanel();
  renderSteps();

  const step = state.lesson.steps[i];
  const url = new URL(location.href);
  url.searchParams.set('step', i + 1);
  history.replaceState(null, '', url);

  $('step-title').textContent = step.title;
  $('step-hint').textContent = step.hint ?? '';

  // 課堂只教的鍵（第 0 課以外）：其他鍵變淡，令學生專注
  const focusKeys = state.lesson.newKeys?.length ? [...state.lesson.newKeys, 'Space'] : null;
  state.kb.focusKeys(focusKeys);

  // 速成課：鍵盤顯示字根（評測時隱藏，免得變成「看鍵盤找字根」）
  state.kb.setRootLabels(lang === 'zh' && step.type !== 'test' && !step.hideRoots ? ROOTS : null);
  $('ime').hidden = true;
  state.mode = step.mode ?? (lang === 'zh' ? 'roots' : 'en');
  state.unit = { quick: '字/分', roots: '個/分', en: 'WPM' }[state.mode] ?? 'WPM';
  $('m-unit').textContent = ` ${state.unit}`;
  // 速成評測不提示下一個鍵（否則變成跟住發光的鍵按）
  state.hideNext = lang === 'zh' && step.type === 'test';
  showTopPet(step.type !== 'test');
  const focus = step.type === 'test';
  state.fx.setFocus(focus);
  document.body.classList.toggle('focus-mode', focus);
  if (step.type === 'guide') runGuide(step);
  else runTyping(step);
}

// ---------- 導覽（第 0 課）----------

function runGuide(step) {
  showTypingUI(false);
  const box = $('guide');
  box.hidden = false;
  let idx = 0;

  const render = () => {
    const s = step.slides[idx];
    box.innerHTML = `
      <div class="slide">
        <div class="slide-text">
          <p class="slide-count">${idx + 1} / ${step.slides.length}</p>
          <h3>${s.title}</h3>
          <ul>${s.points.map((p) => `<li>${p}</li>`).join('')}</ul>
        </div>
        <div class="slide-visual">${s.show === 'posture' ? POSTURE_SVG : ''}${s.example ? exampleHtml(s.example, s.exampleCode) : ''}${s.imeDemo ? imeDemoHtml(s.imeDemo) : ''}</div>
      </div>
      <div class="slide-nav">
        <button class="btn" type="button" data-nav="prev" ${idx === 0 ? 'disabled' : ''}>上一頁</button>
        <span class="muted kbd-tip">按 Enter 下一頁</span>
        <button class="btn primary" type="button" data-nav="next">${idx === step.slides.length - 1 ? '開始練習' : '下一頁'}</button>
      </div>`;

    $('kb-area').hidden = s.show === 'posture';
    $('keyboard').hidden = s.show === 'hands';
    state.kb.setFingers(s.fingers ? true : store.getSetting('showFingers', CONFIG.defaults.showFingers));
    state.kb.setNext(s.highlight ?? []);
    state.kb.setRootLabels(s.rootLabels ? ROOTS : null);
    if (s.show === 'hands') state.hands.setFinger(['L2', 'R2'], '兩隻食指放在 F 和 J 的凸點上');
    else state.hands.setFinger([], '');
  };

  const go = (d) => {
    if (d > 0 && idx === step.slides.length - 1) {
      cleanup();
      finishStep({ guide: true });
      return;
    }
    idx = Math.min(Math.max(idx + d, 0), step.slides.length - 1);
    render();
  };

  const onClick = (e) => {
    const nav = e.target.closest('[data-nav]')?.dataset.nav;
    if (nav) go(nav === 'next' ? 1 : -1);
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const cleanup = () => {
    box.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
    box.hidden = true;
    $('keyboard').hidden = false;
    $('kb-area').hidden = false;
    state.kb.setFingers(store.getSetting('showFingers', CONFIG.defaults.showFingers));
  };

  box.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  state.guideCleanup = cleanup;
  render();
}

// ---------- 打字練習和小測 ----------

function makeText(step) {
  if (step.text) return step.text;
  if (step.gen.kind === 'roots' || step.gen.kind === 'chars') return generateZh(step.gen, makeRng());
  return generateText(step.gen, makeRng());
}

function statsOf(eng) {
  if (state.mode === 'quick') return computeZhStats(eng);
  const st = computeStats(eng);
  if (state.mode === 'roots') {
    const per = st.seconds > 0 ? st.correctKeys / (st.seconds / 60) : 0;
    st.netWpm = per;
    st.grossWpm = per;
  }
  return st;
}

function runTyping(step) {
  showTypingUI(true);
  if (state.mode === 'quick') return runQuick(step);

  const text = makeText(step);
  const textEl = $('text');
  const extra = state.mode === 'roots' ? ' roots' : '';
  textEl.className = 'text' + (step.display === 'big' ? ' big' : '') + extra;
  $('text-wrap').className = 'text-wrap' + (step.display === 'big' ? ' big' : '');
  $('text-wrap').scrollTop = 0;
  const spans = renderText(textEl, text, state.mode === 'roots' ? ROOTS : null);

  $('start-hint').hidden = false;
  $('m-time-label').textContent = step.timeLimit ? '剩餘時間' : '時間';
  updateMeters(null, step);

  const engine = new TypingEngine({
    text,
    errorMode: step.type === 'test' ? 'continue' : store.getSetting('errorMode', CONFIG.defaults.errorMode),
    timeLimit: step.timeLimit ?? 0,
    onKey: (e, eng) => {
      $('start-hint').hidden = true;
      state.kb.press(eng.lastKey.code, eng.lastKey.ok);
      state.fx.key(eng.lastKey.ok);
      paint(spans, eng);
      updateMeters(eng, step);
      if (!eng.lastKey.ok) flashError(spans[eng.errorMode === 'block' ? eng.pos : eng.pos - 1]);
    },
    onTick: (eng) => updateMeters(eng, step),
    onFinish: (eng) => onTypingDone(step, eng),
  });
  state.engine = engine;
  paint(spans, engine);
  engine.attach();
}

// ---------- 速成（內置選字窗）----------

const zcap = (k, cls = '') => `<span class="zcap ${cls}"><b>${ROOTS[k] ?? k}</b><small>${k}</small></span>`;

function pickHint(ch) {
  const code = state.zh.quickOf(ch);
  const idx = state.zh.candidates(code).indexOf(ch);
  if (idx === 0) return '按空白鍵';
  if (idx < PAGE) return `按 ${idx + 1}`;
  return `按 PageDown 翻到第 ${Math.floor(idx / PAGE) + 1} 頁，再按 ${(idx % PAGE) + 1}`;
}

function runQuick(step) {
  const text = makeText(step);
  const textEl = $('text');
  textEl.className = 'text zh' + (step.display === 'big' ? ' big' : '');
  $('text-wrap').className = 'text-wrap' + (step.display === 'big' ? ' big' : '');
  $('text-wrap').scrollTop = 0;
  const spans = renderText(textEl, text, null, true);
  const isTest = step.type === 'test';
  $('ime').hidden = false;
  $('start-hint').hidden = false;
  $('start-hint').textContent = '請先切換到英文輸入（不要開系統的速成），網站內置了速成選字窗。';
  $('m-time-label').textContent = step.timeLimit ? '剩餘時間' : '時間';
  updateMeters(null, step);

  let imeWarn = false;
  const engine = new QuickEngine({
    text,
    zh: state.zh,
    errorMode: isTest ? 'continue' : 'block',
    timeLimit: step.timeLimit ?? 0,
    onIme: () => { imeWarn = true; renderIme(engine, isTest, true); },
    onKey: (e, eng) => {
      imeWarn = false;
      $('start-hint').hidden = true;
      state.kb.press(eng.lastKey.code, eng.lastKey.ok !== false);
      if (eng.lastKey.ok !== null) state.fx.key(eng.lastKey.ok);
      paint(spans, eng);
      renderIme(eng, isTest, imeWarn);
      updateMeters(eng, step);
      if (eng.lastKey.ok === false) flashError(spans[eng.errorMode === 'block' ? eng.pos : Math.max(0, eng.pos - 1)]);
    },
    onTick: (eng) => updateMeters(eng, step),
    onFinish: (eng) => { $('ime').hidden = true; onTypingDone(step, eng); },
  });
  state.engine = engine;
  paint(spans, engine);
  renderIme(engine, isTest, false);
  engine.attach();
}

function renderIme(eng, isTest, warn) {
  const ch = eng.expectedChar;
  const comp = eng.comp
    ? [...eng.comp].map((k) => zcap(k, 'key')).join('')
    : '<span class="empty">組字框</span>';
  const items = eng.pageItems;
  const pages = Math.ceil(eng.candidates.length / PAGE);
  const cands = items.map((c, i) => `<span class="${!isTest && c === ch ? 'want' : ''}"><i>${i + 1}</i>${c}</span>`).join('');
  let hint = '';
  if (!isTest && ch) {
    const code = state.zh.quickOf(ch) ?? '';
    hint = `<span class="hint">「${ch}」＝ ${[...code].map((k) => `${ROOTS[k]} ${k.toUpperCase()}`).join(' ＋ ')}，${pickHint(ch)}</span>`;
  }
  $('ime').innerHTML = `
    <div class="comp">${comp}</div>
    <div class="cands">${cands}</div>
    ${pages > 1 ? `<span class="pg">${eng.page + 1} / ${pages} 頁</span>` : ''}
    ${hint}
    ${warn ? '<span class="warn">偵測到系統中文輸入法：請按 Shift 或 Win＋空白鍵切換回英文，再打一次。</span>' : ''}`;
}

function showTypingUI(on) {
  $('text-wrap').hidden = !on;
  $('meters').hidden = !on;
  $('start-hint').hidden = !on;
  document.querySelector('.progress').hidden = !on;
  $('guide').hidden = on;
  if (!on) $('ime').hidden = true;
  $('start-hint').textContent = '雙手放在基準位，準備好就直接打第一個字。';
}

/** 文字逐字放入 span；每個詞連同後面的空格包成一組，令換行只發生在詞與詞之間。 */
function renderText(el, text, display = null, eachWord = false) {
  el.innerHTML = '';
  const spans = [];
  let word = document.createElement('span');
  word.className = 'word';
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch' + (ch === ' ' ? ' space' : '');
    s.textContent = ch === ' ' ? ' ' : (display?.[ch] ?? ch);
    spans.push(s);
    word.append(s);
    if (ch === ' ' || eachWord || display || i === text.length - 1) {
      el.append(word);
      word = document.createElement('span');
      word.className = 'word';
    }
  });
  return spans;
}

function paint(spans, eng) {
  spans.forEach((s, i) => {
    const st = eng.status[i];
    s.classList.toggle('ok', st === 'ok');
    s.classList.toggle('fixed', st === 'fixed');
    s.classList.toggle('bad', st === 'bad');
    s.classList.toggle('cur', i === eng.pos && !eng.finished);
  });
  const cur = spans[eng.pos];
  if (cur) keepInView(cur);
  showNextKey(eng.nextKey ? eng.nextKey() : eng.text[eng.pos]);
  $('m-progress').style.width = `${(eng.pos / eng.text.length) * 100}%`;
}

/** 令目前一行保持在第 2 行（第一行時除外），每次捲動剛好一整行。 */
function keepInView(span) {
  const wrap = $('text-wrap');
  const lineH = parseFloat(getComputedStyle($('text')).lineHeight);
  const line = Math.round(span.offsetTop / lineH);
  const target = Math.max(0, line - 1) * lineH;
  if (Math.abs(wrap.scrollTop - target) > 1) wrap.scrollTo({ top: target, behavior: 'smooth' });
}

function showNextKey(ch) {
  if (state.hideNext) {
    state.kb.setNext([]);
    state.hands.setFinger([], '');
    return;
  }
  if (ch === 'Backspace') {
    state.kb.setNext(['Backspace']);
    state.hands.setFinger(['R5'], '碼打錯了：用右手尾指按 Backspace 刪除');
    return;
  }
  if (ch === 'PageDown' || ch === 'PageUp') {
    state.kb.setNext([]);
    state.hands.setFinger([], `要找的字不在這一頁：按 ${ch} 翻頁`);
    return;
  }
  if (ch === undefined || ch === null) {
    state.kb.setNext([]);
    state.hands.setFinger([], '');
    return;
  }
  const info = keyForChar(ch);
  if (!info) {
    state.kb.setNext([]);
    state.hands.setFinger([], '');
    return;
  }
  const codes = info.shiftCode ? [info.code, info.shiftCode] : [info.code];
  const fingers = info.shiftFinger ? [info.finger, info.shiftFinger] : [info.finger];
  state.kb.setNext(codes);
  const keyText = ch === ' ' ? '空白鍵' : ch.toUpperCase();
  let label = `用${fingerName(info.finger)}按 ${keyText}`;
  if (lang === 'zh' && ROOTS[ch] && state.kb.root.classList.contains('roots')) label += `（${ROOTS[ch]}）`;
  if (lang === 'zh' && /^[2-9]$/.test(ch)) label = `用${fingerName(info.finger)}按 ${ch} 揀字`;
  if (lang === 'zh' && ch === ' ') label = '用拇指按空白鍵揀第 1 個字';
  if (info.finger === 'TH') label = '用拇指按空白鍵';
  if (info.shiftFinger) label = `${fingerName(info.shiftFinger)}按住 Shift，${fingerName(info.finger)}按 ${ch}`;
  state.hands.setFinger(fingers, label);
}

function flashError(span) {
  if (!span) return;
  span.classList.remove('err');
  void span.offsetWidth;
  span.classList.add('err');
}

function updateMeters(eng, step) {
  if (!eng || !eng.started) {
    $('m-wpm').textContent = '0';
    $('m-acc').textContent = '100';
    $('m-time').textContent = step.timeLimit ? clock(step.timeLimit) : '0:00';
    return;
  }
  const st = statsOf(eng);
  $('m-wpm').textContent = fmt(st.netWpm);
  $('m-acc').textContent = fmtAcc(st.accuracy);
  $('m-time').textContent = step.timeLimit ? clock(eng.remainingSec()) : clock(st.seconds);
}

function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- 完成步驟 ----------

function onTypingDone(step, eng) {
  const stats = statsOf(eng);
  const typingTotal = store.addTypingTime(stats.seconds);
  let stars = null;
  if (step.type === 'test') {
    stars = starsFor(stats, step.pass ?? {}, state.levels.stars);
    state.testResult = { stats, stars };
  }
  store.saveAttempt({
    lang, mode: 'lesson', lessonId, step: state.stepIndex + 1, stats, stars: stars ?? 0,
  });
  finishStep({ stats, stars, step, rest: typingTotal >= CONFIG.restReminderMinutes * 60 });
}

function finishStep({ stats, stars, step, rest, guide }) {
  const L = state.lesson;
  const isLast = state.stepIndex === L.steps.length - 1;
  const isTest = step?.type === 'test';
  const passed = !isTest || stars > 0;

  if (rest) store.resetTypingTime();
  $('panel-rest').hidden = !rest;

  const actions = [];
  const statsList = [];
  if (stats) {
    statsList.push(['速度', `${fmt(stats.netWpm)} ${state.unit}`]);
    statsList.push(['準確率', `${fmtAcc(stats.accuracy)}%`]);
    statsList.push(['用時', clock(stats.seconds)]);
    statsList.push(['打錯', `${stats.errors} 次`]);
  }

  let title;
  let msg = '';
  if (isTest && !passed) {
    title = '差一點就過關';
    msg = `準確率要達 ${step.pass.accuracy}% 才過關。慢慢來，先求準。`;
    actions.push(['再試一次', () => runStep(state.stepIndex), true]);
    actions.push(['回到練習', () => runStep(Math.max(0, state.stepIndex - 1)), false]);
  } else if (isLast) {
    const before = currentStage();
    const best = saveLessonDone(stars, stats);
    state.evolvedFrom = currentStage() > before ? before : null;
    title = isTest ? '過關！' : '完成這一課！';
    msg = best;
    const next = state.lessons.find((l) => l.id === L.id + 1);
    if (next) actions.push([`下一課：${next.title}`, () => goLesson(next.id), true]);
    else actions.push(['回到首頁', () => (location.href = 'index.html'), true]);
    actions.push(['再做一次', () => runStep(isTest ? state.stepIndex : 0), false]);
  } else {
    title = guide ? '準備好了！' : '做得好！';
    msg = guide ? '接下來把手放在鍵盤上試一試。' : '繼續下一步。';
    const nextStep = L.steps[state.stepIndex + 1];
    state.maxReached = Math.max(state.maxReached, state.stepIndex + 1);
    actions.push([`下一步：${nextStep.title}`, () => runStep(state.stepIndex + 1), true]);
    if (!guide) actions.push(['再練一次', () => runStep(state.stepIndex), false]);
  }

  renderPanelPet();
  state.fx.setFocus(false);
  state.fx.finish({ stars: stars ?? 0, evolved: state.evolvedFrom !== null && state.evolvedFrom !== undefined });
  showPanel({ title, msg, stars: isTest ? stars : null, stats: statsList, actions });
  state.evolvedFrom = null;
}

function currentStage() {
  return pet.stageOf(state.petData.stages, pet.summary(lang));
}

function showTopPet(on) {
  const img = $('pet-top');
  if (!state.petId || !on) { img.hidden = true; return; }
  img.src = pet.art(state.world, state.petId, currentStage());
  img.hidden = false;
}

function renderPanelPet() {
  const box = $('panel-pet');
  box.hidden = true;
  if (!state.petId) return;
  const stage = currentStage();
  const c = state.petData.companions.find((x) => x.id === state.petId);
  const nick = pet.nickOf(state.world, c);
  const stageName = state.petData.stages[stage].name;
  const evolved = state.evolvedFrom !== null && state.evolvedFrom !== undefined;
  box.innerHTML = evolved
    ? `<div class="evolve"><img class="companion before" src="${pet.art(state.world, c.id, state.evolvedFrom)}" alt=""><span class="arrow">➜</span><img class="companion after" src="${pet.art(state.world, c.id, stage)}" alt="${nick}"></div><p class="pet-say">${nick} 進化成「${stageName}」了！</p>`
    : `<img class="companion pet-float" src="${pet.art(state.world, c.id, stage)}" alt="${nick}"><p class="pet-say">${nick}為你加油！</p>`;
  box.hidden = false;
}

function saveLessonDone(stars, stats) {
  const { prev, next } = store.saveLessonResult(lang, lessonId, {
    stars: stars ?? 0,
    wpm: state.mode === 'roots' ? 0 : (stats?.netWpm ?? 0),  // 字根練習的「個/分」不算打字速度
    accuracy: stats?.accuracy ?? 0,
  });
  if (stars && next.stars > prev.stars && prev.done) return `新紀錄：${next.stars} 粒星！`;
  if (stars && stars < 3) return '想拿更多星星？可以再試一次，打得更準、更快。';
  return '已解鎖下一課。';
}

function goLesson(id) {
  const url = new URL(location.href);
  url.searchParams.set('id', id);
  url.searchParams.set('step', 1);
  location.href = url.toString();
}

// ---------- 結果彈窗 ----------

function showPanel({ title, msg, stars, stats, actions }) {
  $('panel-title').textContent = title;
  $('panel-msg').textContent = msg;
  const starsEl = $('panel-stars');
  starsEl.innerHTML = '';
  if (stars !== null && stars !== undefined) {
    for (let i = 1; i <= 3; i++) {
      const s = document.createElement('span');
      s.className = 'star' + (i <= stars ? ' on' : '');
      s.textContent = '★';
      starsEl.append(s);
    }
    starsEl.setAttribute('aria-label', `${stars} 粒星`);
  }
  const dl = $('panel-stats');
  dl.innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  dl.hidden = stats.length === 0;

  const box = $('panel-actions');
  box.innerHTML = '';
  actions.forEach(([label, fn, primary]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (primary ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    box.append(b);
  });

  $('overlay').hidden = false;
  state.kb.setNext([]);
  state.hands.setFinger([], '');
  // 延遲一點才接受 Enter，避免學生打完最後一個字時誤按
  setTimeout(() => {
    box.querySelector('.primary')?.focus();
    state.panelKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); box.querySelector('.primary')?.click(); }
    };
    window.addEventListener('keydown', state.panelKey);
  }, 400);
}

function hidePanel() {
  $('overlay').hidden = true;
  if (state.panelKey) window.removeEventListener('keydown', state.panelKey);
  state.panelKey = null;
}

// ---------- 速成導覽的例子 ----------

function exampleHtml(ch) {
  const zh = state.zh;
  const q = zh.quickOf(ch);
  const cj = zh.cjOf(ch) ?? q;
  return `<div class="zh-ex">
    <div class="big" lang="zh-Hant-HK">${ch}</div>
    <div class="row"><span class="lbl">倉頡全碼</span>${[...cj].map((k, i) => zcap(k, i === 0 || i === cj.length - 1 ? 'key' : 'dim')).join('')}</div>
    <div class="row"><span class="lbl">速成</span>${[...q].map((k) => zcap(k, 'key')).join('<span>＋</span>')}<span class="muted">只打首尾兩碼</span></div>
  </div>`;
}

function imeDemoHtml(ch) {
  const zh = state.zh;
  const q = zh.quickOf(ch);
  const list = zh.candidates(q).slice(0, PAGE);
  return `<div class="zh-ex"><div class="ime" style="margin:0">
    <div class="comp">${[...q].map((k) => zcap(k, 'key')).join('')}</div>
    <div class="cands">${list.map((c, i) => `<span class="${c === ch ? 'want' : ''}"><i>${i + 1}</i>${c}</span>`).join('')}</div>
    <span class="hint">打「${ch}」：先按 ${[...q].map((k) => k.toUpperCase()).join('、')}，再${pickHint(ch)}</span>
  </div></div>`;
}

// ---------- 坐姿圖 ----------

const POSTURE_SVG = `
<svg viewBox="0 0 320 240" class="posture" role="img" aria-label="正確坐姿示意圖">
  <line x1="10" y1="226" x2="310" y2="226" class="ground"/>
  <rect x="190" y="138" width="120" height="8" rx="2" class="desk"/>
  <line x1="300" y1="146" x2="300" y2="226" class="desk-leg"/>
  <rect x="236" y="62" width="62" height="46" rx="4" class="screen"/>
  <line x1="267" y1="108" x2="267" y2="138" class="desk-leg"/>
  <rect x="196" y="132" width="44" height="6" rx="2" class="kbd"/>
  <path d="M86 70 L86 150" class="chair"/>
  <path d="M86 150 L150 150 M118 150 L118 226" class="chair"/>
  <circle cx="112" cy="58" r="16" class="body"/>
  <path d="M106 76 L106 146 L162 146 L162 222 L182 222" class="body"/>
  <path d="M108 92 L134 124 L198 128" class="body"/>
  <path d="M128 60 L236 60" class="guide-line"/>
  <text x="150" y="52" class="note">視線平視螢幕上緣</text>
  <text x="128" y="110" class="note">手肘約 90°</text>
  <text x="60" y="200" class="note">雙腳平放</text>
  <text x="18" y="112" class="note">背部挺直</text>
</svg>`;
