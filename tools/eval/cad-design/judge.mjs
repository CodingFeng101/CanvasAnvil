import { isDeepStrictEqual } from 'node:util';

function matches(key, pattern) {
  return new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(key || '');
}
function allowed(category, item, rule) {
  if (!rule) return true;
  const colon = rule.indexOf(':');
  if (colon < 0) return rule.split('|').includes(category);
  if (category !== rule.slice(0, colon)) return false;
  return rule.slice(colon + 1).split('|').some(pattern => matches(item?.key, pattern));
}
export function changedObjects(before, after) {
  const changes = [];
  for (const category of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = before[category], newValue = after[category];
    if (isDeepStrictEqual(oldValue, newValue)) continue;
    if (Array.isArray(oldValue) && Array.isArray(newValue) && [...oldValue, ...newValue].every(item => item && typeof item.id === 'string')) {
      const oldMap = new Map(oldValue.map(item => [item.id, item]));
      const newMap = new Map(newValue.map(item => [item.id, item]));
      for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
        const oldItem = oldMap.get(id), newItem = newMap.get(id);
        if (!isDeepStrictEqual(oldItem, newItem)) changes.push({ category, id, before: oldItem, after: newItem });
      }
    } else changes.push({ category, before: oldValue, after: newValue });
  }
  return changes;
}
export function judgeEdit(before, after, edit) {
  const reasons = [];
  const changes = changedObjects(before, after);
  for (const change of changes) if (!allowed(change.category, change.before ?? change.after, edit.expectOnlyChanged)) reasons.push(`Unexpected change ${change.category}:${change.id ?? ''}`);
  if (edit.expectPreserved) {
    const selected = (before.furniture || []).filter(item => allowed('furniture', item, edit.expectPreserved));
    if (!selected.length) reasons.push(`No objects matched preserved selector ${edit.expectPreserved}`);
    for (const item of selected) if (!isDeepStrictEqual(item, after.furniture?.find(candidate => candidate.id === item.id))) reasons.push(`Manual object changed ${item.id}`);
  }
  for (const key of edit.expectKeys || []) if (!after.furniture?.some(item => item.key === key)) reasons.push(`Missing furniture key ${key}`);
  for (const key of edit.expectAddedKeys || []) if (!after.furniture?.some(item => item.key === key && !before.furniture?.some(old => old.id === item.id))) reasons.push(`No added furniture key ${key}`);
  if (edit.expectSize && !changes.some(change => change.category === 'furniture' && change.after && Object.entries(edit.expectSize).every(([field, value]) => change.after[field] === value))) reasons.push('No changed furniture has the expected dimensions');
  if (!changes.length) reasons.push('Edit produced no plan change');
  return { passed: reasons.length === 0, reasons, changed: changes.map(change => ({ category: change.category, id: change.id })) };
}
function inRegion(item, region) {
  return (region.rects || []).some(rect => item.x >= rect.x && item.x <= rect.x + rect.w && item.y >= rect.y && item.y <= rect.y + rect.h);
}
export function judgeCase(snapshot, expected, rules, specFlags = {}) {
  const reasons = [];
  const { plan, regions, issues = [], mepIssues = [], bounds, rounds = 0 } = snapshot;
  const furniture = plan.furniture || [];
  const labels = (plan.rooms || []).map(room => room.name || '');
  const errors = issues.filter(issue => issue.level === 'error');
  if (errors.length) reasons.push(`${errors.length} engine errors remain`);
  if (rounds > rules.maxFixRounds) reasons.push('Automatic repair exceeded maximum rounds');
  for (const alternatives of expected.rooms || []) if (!alternatives.some(name => labels.some(label => label.includes(name)))) reasons.push(`Missing room ${alternatives.join('/')}`);
  if (expected.totalArea) {
    const area = regions.reduce((sum, region) => sum + region.area, 0);
    if (Math.abs(area - expected.totalArea) / expected.totalArea > rules.areaTolerance) reasons.push(`Area ${area} outside expected ${expected.totalArea}`);
  }
  if (expected.outline && (!bounds || Math.abs(bounds.w - expected.outline.w) > expected.outline.tolerance || Math.abs(bounds.h - expected.outline.d) > expected.outline.tolerance)) reasons.push('Outline dimensions outside tolerance');
  for (const alternatives of expected.mustHaveKeysAnyOf || []) if (!furniture.some(item => alternatives.includes(item.key))) reasons.push(`Missing furniture ${alternatives.join('/')}`);
  for (const key of expected.mustNotHaveKeys || []) if (furniture.some(item => item.key === key)) reasons.push(`Forbidden furniture ${key}`);
  let bathrooms = 0;
  for (const region of regions) {
    const name = (region.labels || []).map(label => label.name).join(' / ');
    const items = furniture.filter(item => inRegion(item, region));
    if (/卧/.test(name) && !items.some(item => rules.bedroomNeedsAnyOf.includes(item.key))) reasons.push(`Bedroom lacks bed ${name}`);
    if (/卫|浴/.test(name)) {
      bathrooms++;
      if (!items.some(item => rules.bathroomNeedsAnyOf.includes(item.key))) reasons.push(`Bathroom lacks toilet ${name}`);
    }
    if (/厨房/.test(name) && !items.some(item => rules.kitchenNeedsAnyOf.includes(item.key))) reasons.push(`Kitchen lacks cabinetry ${name}`);
  }
  if (expected.minBathrooms && bathrooms < expected.minBathrooms) reasons.push(`Only ${bathrooms} bathrooms`);
  if (expected.minCountOfKeys) {
    const countRule = expected.minCountOfKeys;
    if (!furniture.some(item => countRule.orKeys.includes(item.key)) && furniture.filter(item => countRule.keys.includes(item.key)).length < countRule.min) reasons.push('Insufficient workstations');
  }
  for (const alternatives of expected.structsAnyOf || []) if (!plan.structs?.some(item => alternatives.includes(item.kind))) reasons.push(`Missing structural point ${alternatives.join('/')}`);
  for (const flag of expected.specMustHave || []) if (specFlags[flag] !== true) reasons.push(`Original spec did not include ${flag}=true`);
  if (expected.mepIssuesErrorMax !== undefined && mepIssues.filter(issue => issue.level === 'error').length > expected.mepIssuesErrorMax) reasons.push('MEP errors remain');
  const minPassage = expected.minDoorPassage ?? rules.minDoorPassage;
  const doors = (plan.openings || []).filter(opening => ['door', 'double', 'unequal', 'sliding', 'folding', 'pocket', 'hole', 'garage'].includes(opening.type));
  if (doors.some(opening => opening.width < minPassage)) reasons.push(`Door width below ${minPassage}mm; manual passage review required`);
  return { passed: reasons.length === 0, reasons, errors, warnings: issues.filter(issue => issue.level === 'warn'), manualReview: expected.minDoorPassage ? [`Verify unobstructed ${minPassage}mm passage manually`] : [] };
}

export function extractSpecFlags(content) {
  if (typeof content !== 'string') return undefined;
  const candidates = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  candidates.push(content, ...inspectBrackets(content).candidates);
  let flags;
  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(candidate);
      if (payload.type === 'cad_spec' && payload.spec && typeof payload.spec === 'object') flags = { autoElec: payload.spec.autoElec === true };
    } catch { /* A model response may include surrounding prose. */ }
  }
  return flags;
}
export function selectCases(cases, id) {
  if (!id) return cases;
  const selected = cases.filter(entry => entry.id === id);
  if (!selected.length) throw new Error(`Unknown CAD evaluation case ${id}`);
  return selected;
}

function inspectBrackets(text) {
  let sawOpening = false, incomplete = false;
  const candidates = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    sawOpening = true;
    const stack = [];
    let quoted = false, escaped = false;
    for (let index = start; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const opening = stack.pop();
        if ((char === '}' && opening !== '{') || (char === ']' && opening !== '[')) break;
        if (!stack.length) { candidates.push(text.slice(start, index + 1)); break; }
      }
      if (index === text.length - 1 && (stack.length || quoted)) incomplete = true;
    }
  }
  return { candidates, sawOpening, incomplete };
}
export function classifyModelResponse(content) {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) return 'empty';
  try { JSON.parse(text); return 'raw_json'; } catch { /* Try the model's surrounding formatting. */ }
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  if (/^```(?:json)?\s*/i.test(text)) fences.push(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  for (const candidate of fences) { try { JSON.parse(candidate); return 'fenced_json'; } catch { /* Try remaining candidates. */ } }
  const inspection = inspectBrackets(text);
  const rooted = /^(?:```(?:json)?\s*)?[{\[]/i.test(text);
  if (rooted && inspection.incomplete) return 'possibly_truncated';
  for (const candidate of inspection.candidates) { try { JSON.parse(candidate); return 'prose_with_json'; } catch { /* Keep the syntax evidence. */ } }
  if (inspection.incomplete) return 'possibly_truncated';
  return inspection.sawOpening || /```(?:json)/i.test(text) ? 'invalid_json' : 'prose_only';
}
export function classifyChatError(text) {
  if (/\b401\b|unauthorized|invalid.*(?:api.?key|token)|无效.*(?:令牌|密钥)|鉴权失败|认证失败/i.test(text)) return 'auth_failed';
  if (/fetch failed|failed to fetch|networkerror|network request failed/i.test(text)) return 'fetch_failed';
  if (/模型未返回完整的 CAD JSON|CAD JSON|JSON.*(?:parse|syntax)|unexpected token/i.test(text)) return 'parse_failed';
  if (/timeout|timed out|超时/i.test(text)) return 'timeout';
  if (/已停止|stopped|aborted|aborterror/i.test(text)) return 'aborted';
  if (/API.?key|api.?密钥|模型.*配置|configuration.*missing/i.test(text)) return 'configuration_missing';
  if (/校验|rejected|validation|schema/i.test(text)) return 'validation_failed';
  if (/请先.*确认户型|confirm.*design/i.test(text)) return 'confirmation_required';
  return 'chat_failed';
}
export function summarizeRun(selectedCaseIds, results, fullSuite, suiteSize) {
  const completedIds = new Set(results.map(result => result.id));
  const complete = results.length === selectedCaseIds.length && selectedCaseIds.every(id => completedIds.has(id));
  const passCount = results.filter(result => result.passed).length;
  const allEditsPassed = results.every(result => result.edits.every(edit => edit.passed));
  return {
    completed: complete,
    partial: !complete,
    passCount,
    allEditsPassed,
    selectedCasesPassed: complete && results.every(result => result.passed),
    passed: fullSuite && complete && selectedCaseIds.length === suiteSize && passCount >= 8 && allEditsPassed,
  };
}
