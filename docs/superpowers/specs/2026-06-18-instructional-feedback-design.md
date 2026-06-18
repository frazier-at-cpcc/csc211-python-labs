# Instructionally sound hints & feedback — design

**Date:** 2026-06-18
**Motivation:** Pilot testing showed students find the lab hints and check
feedback confusing. This redesign makes both formative and actionable:
feedback shows *what* is wrong (not just *that* it is), and hints scaffold
toward understanding instead of handing over the answer.

## Problems observed

- **Failure feedback is opaque.** A failed check renders only a red
  `✗ <label>` plus a generic "Not yet — adjust and Check again." It never
  shows what was expected vs. produced.
- **Whitespace failures are invisible.** `stdout` checks fail on leading
  spaces / missing blank lines, but the student sees output that "looks
  right." This is the single largest source of confusion.
- **Hints give away the answer in one click.** Many are the verbatim
  solution (e.g. `ports = 20 + 2`), with no conceptual step first.
- **The hint UI is unclear.** Clicking replaces the prior hint and gives no
  signal that more exist or how many remain.
- **A few prompts leak hints** (e.g. w1-e1 ends with "Hints: …").

## Design

### A. Richer check evaluation — `engine/lib/checks.mjs`

`evaluateCheck` returns `{ pass, label, detail }`. `detail` is populated only
on failure and is type-specific, plain-language guidance:

| Check | Failure `detail` |
|---|---|
| `stdout` normalized/exact | `{ kind: 'diff', expected, actual, whitespaceOnly }` — engine renders Expected vs Your output with whitespace made visible. `whitespaceOnly` true when the two match after collapsing spaces. |
| `stdout` regex | `{ kind: 'text', actual, message: "Your output didn't contain what this check looks for." }` |
| `source` uses | `"Your code doesn't use \`X\` yet."` |
| `source` calls | `"Your code doesn't call \`X(...)\` yet."` |
| `source` defines | `"Your code doesn't define \`X\` yet."` |
| `state` equals | `"\`name\` should equal \`<expected>\`, but it's currently \`<actual>\`."` / `"\`name\` isn't defined yet."` |
| `state` isType | `"\`name\` should be a <type>, but it's currently a <actualType>."` / not defined |

`detail` carries data only; all wording/markup lives in the engine renderer so
checks.mjs stays presentation-free and unit-testable.

### B. Feedback rendering — `engine/engine.mjs`

- Under each failed `<li>`, render `detail`:
  - `diff`: two labeled `pre` blocks (Expected / Your output) with spaces shown
    as `·` and trailing newlines marked, so leading-space and blank-line
    mismatches are visible. When `whitespaceOnly`, add: *"The text matches —
    check your spaces and blank lines."*
  - `text`: the message plus the actual output.
  - string details: rendered inline (with `code` for backticked names).
- **Summary messaging** (`.exscore`) becomes state-aware:
  - all pass → `Solved ✓ — all checks passed.`
  - partial → `N of M checks passing — see the notes below to close the gap.`

### C. Progressive cumulative hints — `engine/engine.mjs`

- Hints reveal **cumulatively**: each stays visible, labeled `Hint 1`,
  `Hint 2`, … in a list.
- Button label shows progress: `Show a hint (1 of 3)`; after the last is shown
  the button reads `All hints shown` and is disabled.

### D. Styles — `engine/engine.css`

- `.diff` layout (two columns on wide, stacked on narrow), `.ws-dot` styling
  for visualized spaces, `.check-detail` indentation under each result item,
  `.hintlist` stacking.

### E. Content rewrite — `labs/week-0*.json` (all 8 weeks, 48 exercises)

Rewrite `hints` as a 2–3 step progression per exercise:

1. **Concept** — which tool/idea to reach for, no code.
2. **Structure** — the construct shown on **analogous values** (not the
   student's literal answer), e.g. `total = 5 + 3` for a "add 20 + 2" task.
3. **(only when a concept can't be shown otherwise)** the exact construct,
   framed as "Putting it together."

Final hints use **analogous worked examples**, never the verbatim solution
(instructor-approved). Lightly revise check `label`s for student-facing
clarity where needed, and remove hint text that leaks into `prompt`.

## Non-goals

- No change to scoring, progress storage, or the lesson/sandbox split.
- No new check types; `evaluateChecks` signature is unchanged (still
  `(sub, checks) -> results[]`), only each result gains `detail`.

## Validation

- Drive a failing `stdout` exercise locally and confirm the Expected/Your
  output diff with visible whitespace appears.
- Confirm cumulative hints + counter behave and disable at the end.
- Confirm a passing submission still marks solved and unlocks Next.
- Spot-check 2–3 weeks for hint progression quality, then deploy to Pages.
