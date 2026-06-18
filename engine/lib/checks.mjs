export function normalize(s) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function esc(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function typeName(v) {
  if (Array.isArray(v)) return 'list';
  if (v === null) return 'none';
  const t = typeof v;
  if (t === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (t === 'boolean') return 'bool';
  if (t === 'object') return 'dict';
  return t; // 'string'
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// A short, readable rendering of a JS value for failure messages.
function showValue(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  return JSON.stringify(v);
}

// Collapse runs of whitespace so we can tell "wrong characters" apart from
// "right characters, wrong spacing" — drives the whitespaceOnly hint.
function collapseWs(s) { return normalize(s).replace(/[ \t]+/g, ' '); }

// Build failure `detail` for a check. Returns null on pass, or a structured
// object the engine renders. checks.mjs stays presentation-free: no markup.
function failDetail(check, sub) {
  if (check.type === 'stdout') {
    if (check.mode === 'regex') {
      return { kind: 'text', message: "Your output didn't contain what this check looks for.", actual: sub.stdout || '' };
    }
    const expected = check.mode === 'exact' ? check.expected : normalize(check.expected);
    const actual = check.mode === 'exact' ? (sub.stdout || '') : normalize(sub.stdout || '');
    const whitespaceOnly = collapseWs(expected) === collapseWs(actual);
    return { kind: 'diff', expected, actual, whitespaceOnly };
  }
  if (check.type === 'source') {
    if (check.assert === 'calls') return { kind: 'note', message: `Your code doesn't call \`${check.value}(...)\` yet.` };
    if (check.assert === 'defines') return { kind: 'note', message: `Your code doesn't define \`${check.value}\` yet.` };
    return { kind: 'note', message: `Your code doesn't use \`${check.value}\` yet.` };
  }
  if (check.type === 'state') {
    const g = sub.globals || {};
    const has = Object.prototype.hasOwnProperty.call(g, check.name);
    if (!has) return { kind: 'note', message: `\`${check.name}\` isn't defined yet.` };
    const v = g[check.name];
    if ('equals' in check) return { kind: 'note', message: `\`${check.name}\` should equal \`${showValue(check.equals)}\`, but it's currently \`${showValue(v)}\`.` };
    if ('isType' in check) return { kind: 'note', message: `\`${check.name}\` should be a ${check.isType}, but it's currently a ${typeName(v)}.` };
  }
  return null;
}

export function evaluateCheck(check, sub) {
  const label = check.label || check.type;
  let pass = false;
  if (check.type === 'stdout') {
    if (check.mode === 'regex') {
      pass = new RegExp(check.expected).test(sub.stdout);
    } else if (check.mode === 'exact') {
      pass = sub.stdout === check.expected;
    } else { // normalized (default)
      pass = normalize(sub.stdout) === normalize(check.expected);
    }
  } else if (check.type === 'source') {
    const src = sub.source || '';
    if (check.assert === 'uses') pass = new RegExp(`\\b${esc(check.value)}\\b`).test(src);
    else if (check.assert === 'calls') pass = new RegExp(`\\b${esc(check.value)}\\s*\\(`).test(src);
    else if (check.assert === 'defines') pass = new RegExp(`\\bdef\\s+${esc(check.value)}\\s*\\(`).test(src) || new RegExp(`\\b${esc(check.value)}\\s*=`).test(src);
  } else if (check.type === 'state') {
    const g = sub.globals || {};
    const has = Object.prototype.hasOwnProperty.call(g, check.name);
    const v = g[check.name];
    if ('equals' in check) pass = has && deepEqual(v, check.equals);
    else if ('isType' in check) pass = has && typeName(v) === check.isType;
    else pass = has;
  }
  return { pass, label, detail: pass ? null : failDetail(check, sub) };
}

export function evaluateChecks(sub, checks) {
  return (checks || []).map(c => evaluateCheck(c, sub));
}
