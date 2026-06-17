// engine.mjs — paginated, DataCamp-style Core Python lab runner (no SCORM).
// Each week is a sequence of one-per-page steps: a concept LESSON, then its
// CHALLENGE (two-pane: instructions left, editor right). Reuses the course
// engine's logic modules; Pyodide loads only on challenge pages.
import { evaluateChecks } from './lib/checks.mjs';
import { computeScore, lessonStatus } from './lib/scoring.mjs';
import { runExercise } from './lib/runner.mjs';

const $ = (sel) => document.querySelector(sel);

const params = new URLSearchParams(location.search);
const week = String(params.get('week') || '1').padStart(2, '0');
let stepIndex = Math.max(1, parseInt(params.get('step') || '1', 10) || 1);

// ---- inline markdown: `code` -> <code>, **bold** -> <strong> (textContent only) ----
function renderInline(el, text) {
  el.textContent = '';
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('`')) {
      const c = document.createElement('code');
      c.textContent = tok.slice(1, -1);
      el.appendChild(c);
    } else {
      const b = document.createElement('strong');
      b.textContent = tok.slice(2, -2);
      el.appendChild(b);
    }
    last = re.lastIndex;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

// ---- localStorage progress per week ----
function readProgress() {
  try { return JSON.parse(localStorage.getItem(`csc211-week-${week}`)) || {}; } catch (_) { return {}; }
}
function writeProgress(obj) {
  try { localStorage.setItem(`csc211-week-${week}`, JSON.stringify(obj)); } catch (_) { /* non-fatal */ }
}

let LAB = null;
let STEPS = [];
let pyodide = null;

function buildSteps() {
  STEPS = [];
  const all = [...LAB.exercises, ...(LAB.stretch || [])];
  for (const ex of all) {
    STEPS.push({ kind: 'lesson', ex });
    STEPS.push({ kind: 'exercise', ex });
  }
}

function href(k) { return `lab.html?week=${week}&step=${k}`; }

function renderWeekBar() {
  const bar = $('#weekbar');
  bar.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = LAB.title;
  const meta = document.createElement('p');
  meta.className = 'stepmeta';
  meta.textContent = `Step ${stepIndex} of ${STEPS.length}`;
  const track = document.createElement('div');
  track.className = 'progress';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${Math.round((stepIndex / STEPS.length) * 100)}%`;
  track.appendChild(fill);
  bar.append(h, meta, track);
}

function exampleBlock(lesson) {
  const wrap = document.createElement('div');
  if (lesson.example) {
    const pre = document.createElement('pre');
    pre.className = 'example';
    pre.textContent = lesson.example;
    wrap.appendChild(pre);
  }
  if (lesson.output) {
    const lbl = document.createElement('div');
    lbl.className = 'exout-label';
    lbl.textContent = 'Output';
    const out = document.createElement('pre');
    out.className = 'exout';
    out.textContent = lesson.output;
    wrap.append(lbl, out);
  }
  return wrap;
}

function renderLesson(step) {
  const app = $('#app');
  app.className = 'app lesson-view';
  app.innerHTML = '';
  const lesson = step.ex.lesson || { title: 'Concept', body: step.ex.prompt };
  const card = document.createElement('section');
  card.className = 'lesson-card';
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = 'Lesson';
  const h = document.createElement('h2');
  h.textContent = lesson.title || 'Concept';
  const body = document.createElement('div');
  body.className = 'lesson-body';
  for (const para of String(lesson.body || '').split('\n\n')) {
    const p = document.createElement('p');
    renderInline(p, para);
    body.appendChild(p);
  }
  card.append(kicker, h, body, exampleBlock(lesson));
  const cta = document.createElement('a');
  cta.className = 'btn primary cta';
  cta.href = href(stepIndex + 1);
  cta.textContent = 'Start the challenge →';
  card.appendChild(cta);
  app.appendChild(card);
}

function renderExercise(step) {
  const ex = step.ex;
  const app = $('#app');
  app.className = 'app split';
  app.innerHTML = '';

  // left: instructions
  const left = document.createElement('section');
  left.className = 'pane instructions';
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = ex.required === false ? 'Challenge · stretch' : 'Challenge';
  const prompt = document.createElement('h2');
  renderInline(prompt, ex.prompt);
  left.append(kicker, prompt);
  if (ex.hints?.length) {
    const hintBtn = document.createElement('button');
    hintBtn.className = 'btn ghost';
    hintBtn.textContent = 'Hint';
    const hintText = document.createElement('p');
    hintText.className = 'hinttext';
    hintText.hidden = true;
    let hi = 0;
    hintBtn.onclick = () => { hintText.hidden = false; renderInline(hintText, ex.hints[Math.min(hi++, ex.hints.length - 1)]); };
    left.append(hintBtn, hintText);
  }

  // right: editor + controls
  const right = document.createElement('section');
  right.className = 'pane workspace';
  right.innerHTML = `
    <div class="editor"></div>
    <div class="controls">
      <button class="run" disabled>Run ▶</button>
      <button class="check" disabled>Check ✓</button>
    </div>
    <pre class="output" aria-live="polite"></pre>
    <ul class="results" aria-live="polite"></ul>
    <div class="exscore" aria-live="polite"></div>`;
  const ta = document.createElement('textarea');
  ta.value = ex.starter || '';
  right.querySelector('.editor').appendChild(ta);
  app.append(left, right);

  const cm = window.CodeMirror.fromTextArea(ta, { mode: 'python', lineNumbers: true, indentUnit: 4 });
  requestAnimationFrame(() => cm.refresh());

  const out = right.querySelector('.output');
  const results = right.querySelector('.results');
  const exscore = right.querySelector('.exscore');
  const stateNames = (ex.checks || []).filter((c) => c.type === 'state').map((c) => c.name);

  async function run() {
    out.textContent = 'Running…';
    const r = await runExercise(pyodide, cm.getValue(), stateNames);
    out.textContent = r.error ? `${r.stdout}\n${r.error}` : (r.stdout || '(no output)');
    return r;
  }
  right.querySelector('.run').onclick = run;
  right.querySelector('.check').onclick = async () => {
    const r = await run();
    const checkResults = evaluateChecks({ stdout: r.stdout, source: cm.getValue(), globals: r.globals }, ex.checks);
    results.innerHTML = '';
    for (const cr of checkResults) {
      const li = document.createElement('li');
      li.className = cr.pass ? 'pass' : 'fail';
      li.textContent = `${cr.pass ? '✓' : '✗'} ${cr.label}`;
      results.appendChild(li);
    }
    const passed = checkResults.every((c) => c.pass) && !r.error;
    if (passed) {
      exscore.textContent = 'Solved ✓';
      exscore.classList.add('passed');
      markPassed(ex.id);
      $('#nav-next')?.classList.add('ready');
    } else {
      exscore.textContent = 'Not yet — adjust and Check again.';
      exscore.classList.remove('passed');
    }
  };
  return { cm, enable: () => right.querySelectorAll('.run, .check').forEach((b) => { b.disabled = false; }) };
}

function markPassed(exId) {
  const prog = readProgress();
  const passedIds = new Set(prog.passedIds || []);
  passedIds.add(exId);
  const requiredIds = LAB.exercises.map((e) => e.id);
  const passedRequired = requiredIds.filter((id) => passedIds.has(id)).length;
  writeProgress({
    passedIds: [...passedIds],
    passedRequired,
    requiredTotal: requiredIds.length,
    lastStep: Math.max(prog.lastStep || 0, stepIndex),
  });
}

function renderNav(step) {
  const nav = $('#stepnav');
  nav.innerHTML = '';
  // prev
  if (stepIndex > 1) {
    const prev = document.createElement('a');
    prev.className = 'btn ghost';
    prev.href = href(stepIndex - 1);
    prev.textContent = '← Back';
    nav.appendChild(prev);
  } else {
    const home = document.createElement('a');
    home.className = 'btn ghost';
    home.href = 'index.html';
    home.textContent = '← All labs';
    nav.appendChild(home);
  }
  const spacer = document.createElement('span');
  spacer.className = 'nav-spacer';
  nav.appendChild(spacer);
  // next / finish
  const next = document.createElement('a');
  next.id = 'nav-next';
  next.className = 'btn primary';
  if (stepIndex < STEPS.length) {
    next.href = href(stepIndex + 1);
    next.textContent = step.kind === 'lesson' ? 'Continue →' : 'Next →';
  } else {
    next.href = 'index.html';
    next.textContent = 'Finish ✓';
  }
  nav.appendChild(next);
}

async function boot() {
  try {
    LAB = await (await fetch(`labs/week-${week}.json`)).json();
  } catch (_) {
    $('#app').textContent = `Could not load the lab for week ${week}.`;
    return;
  }
  buildSteps();
  stepIndex = Math.min(stepIndex, STEPS.length);
  const step = STEPS[stepIndex - 1];
  document.title = `${LAB.title} · Step ${stepIndex} · CSC-211`;
  renderWeekBar();
  renderNav(step);

  if (step.kind === 'lesson') {
    renderLesson(step);
    return; // no Python needed on lesson pages
  }

  const ex = renderExercise(step);
  const statusEl = $('#status');
  statusEl.hidden = false;
  statusEl.textContent = 'Python loading… (first challenge fetches the interpreter; a few seconds)';
  pyodide = await window.loadPyodide();
  if (Array.isArray(LAB.preload)) {
    for (const mod of LAB.preload) await pyodide.runPythonAsync(mod);
  }
  statusEl.textContent = 'Python ready.';
  ex.enable();
}

boot();
