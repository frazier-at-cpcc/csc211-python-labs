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
lab.html              The lab runner (loads ?week=N)
styles.css            Landing-page styles
engine/
  engine.mjs          DOM glue: CodeMirror + Pyodide + grading + localStorage
  engine.css
  lib/
    checks.mjs        Evaluate an exercise's checks (stdout / source / state)
    scoring.mjs       Mastery score + status
    runner.mjs        Run student code in a stdout-capturing Pyodide wrapper
labs/
  manifest.json       Week list + titles (drives the hub)
  week-01.json … week-08.json   Per-week exercises (prompts, starters, checks, hints)
.nojekyll             Serve files as-is on GitHub Pages (no Jekyll processing)
```

The engine logic modules (`engine/lib/*`) are the same ones used and unit-tested
in the course repository; only the SCORM reporting layer was removed here.

## Add or edit a lab

Edit the matching `labs/week-NN.json` (see the shape of any existing file), then
update `labs/manifest.json` if the title or counts change. No build step — the
files are served directly.

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
