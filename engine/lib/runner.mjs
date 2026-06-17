export const WRAPPER = `
import sys, io
_buf = io.StringIO()
_old = sys.stdout
sys.stdout = _buf
_err = None
try:
    exec(compile(__user_src, '<core-lab>', 'exec'), globals())
except Exception as _e:
    _err = repr(_e)
finally:
    sys.stdout = _old
_out = _buf.getvalue()
`;

function toJs(v) { return (v && typeof v.toJs === 'function') ? v.toJs({ dict_converter: Object.fromEntries }) : v; }

export async function runExercise(pyodide, source, stateNames = []) {
  pyodide.globals.set('__user_src', source);
  await pyodide.runPythonAsync(WRAPPER);
  const stdout = pyodide.globals.get('_out') ?? '';
  const error = pyodide.globals.get('_err') ?? null;
  const globals = {};
  for (const name of stateNames) {
    const raw = pyodide.globals.get(name);
    if (raw !== undefined) globals[name] = toJs(raw);
  }
  return { stdout: String(stdout), error: error == null ? null : String(error), globals };
}
