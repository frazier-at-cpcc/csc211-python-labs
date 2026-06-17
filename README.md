# CSC-211 · Core Python Labs

Interactive, in-browser Python practice labs for **CSC-211 Ethical Hacking with
Python I** (Central Piedmont Community College). Each lab runs a real Python
interpreter in the browser via [Pyodide](https://pyodide.org), lets the learner
write and run code, and auto-grades it against the exercise's goals — with **no
install, no sign-in, and nothing to submit.**

▶ **Live site:** https://frazier-at-cpcc.github.io/csc211-python-labs/

This is the standalone, public web edition. It contains **no SCORM** packaging
and reports to no LMS — completion is remembered only in the visitor's browser
(`localStorage`). The LMS/SCORM edition lives in the course repository.

## Structure

```
index.html            Landing hub — intro, ethics note, grid of the 8 labs
lab.html              Paginated lab runner (loads ?week=N&step=K)
styles.css            Landing-page styles
engine/
  engine.mjs          DOM glue: pagination + lesson/challenge rendering +
                      CodeMirror + Pyodide + grading + localStorage progress
  engine.css
  lib/
    checks.mjs        Evaluate an exercise's checks (stdout / source / state)
    scoring.mjs       Mastery score + status
    runner.mjs        Run student code in a stdout-capturing Pyodide wrapper
labs/
  manifest.json       Week list + titles (drives the hub)
  week-01.json … week-08.json   Per-week exercises + lessons
.nojekyll             Serve files as-is on GitHub Pages (no Jekyll processing)
```

The engine logic modules (`engine/lib/*`) are the same ones used and unit-tested
in the course repository; only the SCORM reporting layer was removed here.

## Flow (DataCamp-style)

Each week is a paginated sequence of one-per-page steps. For every exercise the
learner sees a **Lesson** page (a concept card: a few teaching paragraphs plus a
worked example with its output — the example is illustrative, never the
challenge's solution), then the **Challenge** page (two-pane: instructions and a
hint on the left, code editor with Run/Check on the right). Prev / progress /
Next navigation runs along the bottom; Pyodide loads only on challenge pages.

## Add or edit a lab

Edit the matching `labs/week-NN.json`, then update `labs/manifest.json` if the
title or counts change. No build step — files are served directly.

### exercises.json shape
- Top level: `week`, `title`, `intro`, optional `masteryPercent`, optional
  `preload`, `exercises` (list), optional `stretch` (list).
- Each exercise: `id`, `prompt`, `starter`, optional `required` (default true),
  `checks`, optional `hints`, and a `lesson`.
- Each `lesson`: `title`, `body` (paragraphs separated by a blank line;
  supports inline `` `code` `` and `**bold**`), `example` (a runnable snippet
  that teaches the concept — NOT the answer), `output` (the example's exact
  stdout). Lesson example outputs are verified against real CPython.

## Run locally

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

A static file server is required (ES-module imports and `fetch` do not work from
`file://`).

## Publishing (GitHub Pages)

Served from the `main` branch root. The `.nojekyll` file ensures `.mjs` and JSON
assets are served untouched.

---

*CC-BY 4.0 — Central Piedmont Community College / Frazier Smith.*
