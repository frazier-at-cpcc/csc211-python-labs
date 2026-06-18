// engine.mjs — paginated, DataCamp-style Core Python lab runner (no SCORM).
// Each week is a sequence of one-per-page steps: a concept LESSON, then its
// CHALLENGE (two-pane: instructions left, editor right). Reuses the course
// engine's logic modules; Pyodide loads only on challenge pages.
import { evaluateChecks } from './lib/checks.mjs';
import { computeScore, lessonStatus } from './lib/scoring.mjs';
import { runExercise } from './lib/runner.mjs';

const $ = (sel) => document.querySelector(sel);

// Bump on every engine/content change. Must match the ?v= on engine.mjs in
// lab.html; also busts the browser cache for the per-week lab JSON below.
const VERSION = '4';

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

// ---- failure detail rendering (whitespace made visible) ----
// Build a <pre> where each space shows as a muted middot and the end of the
// text is marked, so leading-space and missing-blank-line mismatches are
// obvious — the #1 source of "it looks right but fails" confusion.
function codeBlock(text) {
  const pre = document.createElement('pre');
  pre.className = 'diff-pre';
  const str = String(text ?? '');
  if (str === '') {
    const em = document.createElement('span');
    em.className = 'diff-empty';
    em.textContent = '(no output)';
    pre.appendChild(em);
    return pre;
  }
  for (const ch of str) {
    if (ch === ' ') {
      const dot = document.createElement('span');
      dot.className = 'ws-dot';
      dot.textContent = '·';
      pre.appendChild(dot);
    } else {
      pre.appendChild(document.createTextNode(ch));
    }
  }
  const end = document.createElement('span');
  end.className = 'diff-end';
  end.textContent = '⏎';
  pre.appendChild(end);
  return pre;
}

function renderCheckDetail(detail) {
  const wrap = document.createElement('div');
  wrap.className = 'check-detail';
  if (detail.kind === 'diff') {
    const grid = document.createElement('div');
    grid.className = 'diff';
    const exCol = document.createElement('div');
    const exLbl = document.createElement('div');
    exLbl.className = 'diff-label';
    exLbl.textContent = 'Expected';
    exCol.append(exLbl, codeBlock(detail.expected));
    const acCol = document.createElement('div');
    const acLbl = document.createElement('div');
    acLbl.className = 'diff-label';
    acLbl.textContent = 'Your output';
    acCol.append(acLbl, codeBlock(detail.actual));
    grid.append(exCol, acCol);
    wrap.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'diff-note';
    note.textContent = detail.whitespaceOnly
      ? 'The text matches — check your spaces and blank lines (each · is one space).'
      : 'Compare the two side by side; each · is one space.';
    wrap.appendChild(note);
  } else if (detail.kind === 'text') {
    const msg = document.createElement('p');
    msg.className = 'detail-msg';
    msg.textContent = detail.message;
    wrap.appendChild(msg);
    wrap.appendChild(codeBlock(detail.actual));
  } else if (detail.kind === 'note') {
    const msg = document.createElement('p');
    msg.className = 'detail-msg';
    renderInline(msg, detail.message);
    wrap.appendChild(msg);
  }
  return wrap;
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
  app.className = 'app split lesson-split';
  app.innerHTML = '';
  const lesson = step.ex.lesson || { title: 'Concept', body: step.ex.prompt };

  // left: lesson card
  const card = document.createElement('section');
  card.className = 'pane lesson-card';
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

  // right: live sandbox — prefilled with the lesson example so students can
  // immediately run and tweak what they just read. No checks/grading here.
  const right = document.createElement('section');
  right.className = 'pane workspace sandbox';
  right.innerHTML = `
    <p class="kicker">Sandbox</p>
    <p class="sandbox-hint">Experiment freely — edit the code and run it. Nothing here is graded.</p>
    <div class="editor"></div>
    <div class="controls">
      <button class="run" disabled>Run ▶</button>
      <button class="reset btn ghost" type="button">Reset</button>
    </div>
    <pre class="output" aria-live="polite"></pre>`;
  const starter = lesson.example || '# Try it out — write some Python and press Run\n';
  const ta = document.createElement('textarea');
  ta.value = starter;
  right.querySelector('.editor').appendChild(ta);
  app.append(card, right);

  const cm = window.CodeMirror.fromTextArea(ta, { mode: 'python', lineNumbers: true, indentUnit: 4 });
  requestAnimationFrame(() => cm.refresh());

  const out = right.querySelector('.output');
  async function run() {
    out.textContent = 'Running…';
    const r = await runExercise(pyodide, cm.getValue(), []);
    out.textContent = r.error ? `${r.stdout}\n${r.error}` : (r.stdout || '(no output)');
  }
  right.querySelector('.run').onclick = run;
  right.querySelector('.reset').onclick = () => { cm.setValue(starter); out.textContent = ''; };
  return { cm, enable: () => { right.querySelector('.run').disabled = false; } };
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
    const total = ex.hints.length;
    const hintBtn = document.createElement('button');
    hintBtn.className = 'btn ghost';
    hintBtn.textContent = `Show a hint (1 of ${total})`;
    const hintList = document.createElement('ol');
    hintList.className = 'hintlist';
    let shown = 0;
    hintBtn.onclick = () => {
      if (shown >= total) return;
      const li = document.createElement('li');
      const lbl = document.createElement('span');
      lbl.className = 'hint-label';
      lbl.textContent = `Hint ${shown + 1}`;
      const body = document.createElement('span');
      renderInline(body, ex.hints[shown]);
      li.append(lbl, body);
      hintList.appendChild(li);
      shown += 1;
      if (shown >= total) { hintBtn.textContent = 'All hints shown'; hintBtn.disabled = true; }
      else hintBtn.textContent = `Show another hint (${shown + 1} of ${total})`;
    };
    left.append(hintBtn, hintList);
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
      const head = document.createElement('div');
      head.className = 'check-head';
      head.textContent = `${cr.pass ? '✓' : '✗'} ${cr.label}`;
      li.appendChild(head);
      if (!cr.pass && cr.detail) li.appendChild(renderCheckDetail(cr.detail));
      results.appendChild(li);
    }
    const total = checkResults.length;
    const passing = checkResults.filter((c) => c.pass).length;
    const passed = passing === total && !r.error;
    if (passed) {
      exscore.textContent = 'Solved ✓ — all checks passed.';
      exscore.classList.add('passed');
      markPassed(ex.id);
      $('#nav-next')?.classList.add('ready');
    } else if (r.error) {
      exscore.textContent = 'Your code raised an error — read the output above, then fix and Check again.';
      exscore.classList.remove('passed');
    } else {
      exscore.textContent = `${passing} of ${total} checks passing — see the notes below to close the gap.`;
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
    LAB = await (await fetch(`labs/week-${week}.json?v=${VERSION}`)).json();
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

  const view = step.kind === 'lesson' ? renderLesson(step) : renderExercise(step);

  // Both lesson sandboxes and challenges run Python in-browser via Pyodide.
  const statusEl = $('#status');
  statusEl.hidden = false;
  statusEl.textContent = step.kind === 'lesson'
    ? 'Python loading… the sandbox will be ready in a few seconds.'
    : 'Python loading… (first challenge fetches the interpreter; a few seconds)';
  pyodide = await window.loadPyodide();
  if (Array.isArray(LAB.preload)) {
    for (const mod of LAB.preload) await pyodide.runPythonAsync(mod);
  }
  statusEl.textContent = 'Python ready.';
  view.enable();
}

boot();
