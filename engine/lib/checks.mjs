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
  return { pass, label };
}

export function evaluateChecks(sub, checks) {
  return (checks || []).map(c => evaluateCheck(c, sub));
}
