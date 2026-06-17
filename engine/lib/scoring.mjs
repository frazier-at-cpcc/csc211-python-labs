export function computeScore(exercises, passMap) {
  const required = (exercises || []).filter(e => e.required !== false);
  const passed = required.filter(e => passMap[e.id]).length;
  const total = required.length;
  const raw = total ? Math.round((100 * passed) / total) : 0;
  return { raw, passed, total };
}

export function lessonStatus(raw, mastery = 100) {
  return raw >= mastery ? 'passed' : 'incomplete';
}
