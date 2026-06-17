// engine.mjs — standalone (no-SCORM) Core Python lab runner.
// Reuses the same logic modules as the course's SCORM engine; reports the
// score on the page and remembers completion in localStorage instead of an LMS.
import { evaluateChecks } from './lib/checks.mjs';
import { computeScore, lessonStatus } from './lib/scoring.mjs';
import { runExercise } from './lib/runner.mjs';

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');
const scoreEl = $('#score');

const params = new URLSearchParams(location.search);
const week = String(params.get('week') || '1').padStart(2, '0');
const STORE_KEY = `csc211-lab-${week}`;

let pyodide = null;
const passMap = {};
let LAB = null;

function stateNames(ex) {
  return (ex.checks || []).filter((c) => c.type === 'state').map((c) => c.name);
}

function renderExercise(ex) {
  const card = document.createElement('section');
  card.className = 'exercise';
  card.innerHTML = `
    <h2 class="prompt"></h2>
    <div class="editor"></div>
    <div class="controls">
      <button class="run" disabled>Run ▶</button>
      <button class="check" disabled>Check ✓</button>
      <button class="hint" ${ex.hints?.length ? '' : 'disabled'}>Hint</button>
    </div>
    <pre class="output" aria-live="polite"></pre>
    <ul class="results" aria-live="polite"></ul>
    <p class="hinttext" hidden></p>`;
  const h2 = card.querySelector('.prompt');
  h2.textContent = ex.prompt;
  if (ex.required === false) {
    const span = document.createElement('span');
    span.className = 'stretch';
    span.textContent = ' (stretch)';
    h2.appendChild(span);
  }
  const ta = document.createElement('textarea');
  ta.value = ex.starter || '';
  card.querySelector('.editor').appendChild(ta);
  const cm = window.CodeMirror.fromTextArea(ta, { mode: 'python', lineNumbers: true, indentUnit: 4 });

  const out = card.querySelector('.output');
  const results = card.querySelector('.results');

  async function run() {
    out.textContent = 'Running…';
    const r = await runExercise(pyodide, cm.getValue(), stateNames(ex));
    out.textContent = r.error ? `${r.stdout}\n${r.error}` : (r.stdout || '(no output)');
    return r;
  }
  card.querySelector('.run').onclick = run;
  card.querySelector('.check').onclick = async () => {
    const r = await run();
    const submission = { stdout: r.stdout, source: cm.getValue(), globals: r.globals };
    const checkResults = evaluateChecks(submission, ex.checks);
    results.innerHTML = '';
    for (const cr of checkResults) {
      const li = document.createElement('li');
      li.className = cr.pass ? 'pass' : 'fail';
      li.textContent = `${cr.pass ? '✓' : '✗'} ${cr.label}`;
      results.appendChild(li);
    }
    passMap[ex.id] = checkResults.every((c) => c.pass) && !r.error;
    grade();
  };
  let hintIdx = 0;
  card.querySelector('.hint').onclick = () => {
    const ht = card.querySelector('.hinttext');
    ht.hidden = false;
    ht.textContent = ex.hints[Math.min(hintIdx++, ex.hints.length - 1)];
  };
  return card;
}

function grade() {
  const { raw, passed, total } = computeScore(LAB.exercises, passMap);
  const status = lessonStatus(raw, LAB.masteryPercent ?? 100);
  scoreEl.textContent = `Score: ${raw}% (${passed}/${total} required)` + (status === 'passed' ? ' — passed ✓' : '');
  scoreEl.classList.toggle('passed', status === 'passed');
  try {
    if (status === 'passed') localStorage.setItem(STORE_KEY, 'passed');
  } catch (_) { /* storage may be unavailable; non-fatal */ }
}

async function boot() {
  try {
    LAB = await (await fetch(`labs/week-${week}.json`)).json();
  } catch (_) {
    statusEl.textContent = `Could not load lab for week ${week}.`;
    return;
  }
  document.title = `${LAB.title} · CSC-211`;
  $('#lab-title').textContent = LAB.title;
  $('#lab-intro').textContent = LAB.intro || '';
  const host = $('#exercises');
  for (const ex of LAB.exercises) host.appendChild(renderExercise(ex));
  for (const ex of (LAB.stretch || [])) host.appendChild(renderExercise(ex));
  statusEl.textContent = 'Python loading… (first load fetches the interpreter; give it a few seconds)';
  pyodide = await window.loadPyodide();
  if (Array.isArray(LAB.preload)) {
    for (const mod of LAB.preload) await pyodide.runPythonAsync(mod);
  }
  statusEl.textContent = 'Python ready.';
  document.querySelectorAll('.run, .check').forEach((b) => { b.disabled = false; });
  grade();
}

boot();
