import type { DesignIssue, SinglePlan } from './types';

// Small, deterministic fixes for the errors models are worst at: furniture a few centimetres
// into a wall, a curtain or a neighbour. Each furniture item named by an error is shifted along
// the axes, the smallest shift first; where no shift helps, it is made a little smaller about its
// middle (a ceiling rack or a cabinet a touch shorter). A change is kept when the designer's own
// checks then report fewer errors: warnings are acceptable, errors are not.
const STEPS = [25, 50, 100, 150, 200, 300, 400];
const DIRECTIONS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** How much smaller a piece may be made, in turn: a share of its width, its depth, or both. */
const SHRINKS = [0.95, 0.9, 0.85, 0.8];
const MAX_PASSES = 8;

type Score = { errors: number; warnings: number };
const score = (issues: DesignIssue[]): Score => ({
  errors: issues.filter(issue => issue.level === 'error').length,
  warnings: issues.filter(issue => issue.level === 'warn').length,
});
/** Fewer errors wins; between two with as many errors, fewer warnings. */
const better = (a: Score, b: Score) => a.errors < b.errors || (a.errors === b.errors && a.warnings < b.warnings);

type Candidate = { plan: SinglePlan; score: Score; issues: DesignIssue[] };

export function nudgeFurniture(start: SinglePlan, issuesOf: (plan: SinglePlan) => DesignIssue[]): { plan: SinglePlan; moved: number } {
  let plan = structuredClone(start);
  let issues = issuesOf(plan);
  let current = score(issues);
  let moved = 0;
  for (let pass = 0; pass < MAX_PASSES && current.errors > 0; pass++) {
    const ids = [...new Set(issues
      .filter(issue => issue.level === 'error')
      .flatMap(issue => (issue.targets ?? []).filter(target => target.kind === 'furn').map(target => target.id)))];
    // Curtains belong in front of their window: move the other item first.
    const byId = new Map(plan.furniture.map(item => [item.id, item]));
    ids.sort((a, b) => Number(byId.get(a)?.key === 'curtain') - Number(byId.get(b)?.key === 'curtain'));
    let improved = false;
    for (const id of ids) {
      const index = plan.furniture.findIndex(item => item.id === id);
      if (index < 0) continue;
      // Only a change that takes an error away counts; among those, the smallest one wins.
      const fixes = (next: Score) => next.errors < current.errors;
      const pick = (best: Candidate | undefined, candidate: SinglePlan): Candidate | undefined => {
        const nextIssues = issuesOf(candidate);
        const next = score(nextIssues);
        return fixes(next) && (!best || better(next, best.score)) ? { plan: candidate, score: next, issues: nextIssues } : best;
      };
      let best: Candidate | undefined;
      for (const step of STEPS) {
        for (const [dx, dy] of DIRECTIONS) {
          const candidate = structuredClone(plan);
          const item = candidate.furniture[index];
          item.x += dx * step;
          item.y += dy * step;
          best = pick(best, candidate);
        }
        if (best) break; // Smallest shift that helps wins.
      }
      // Nowhere to move it: a little smaller, where its size is known.
      const item = plan.furniture[index];
      if (!best && typeof item.w === 'number' && typeof item.d === 'number') {
        for (const share of SHRINKS) {
          for (const [sw, sd] of [[share, 1], [1, share], [share, share]] as const) {
            const candidate = structuredClone(plan);
            const piece = candidate.furniture[index];
            piece.w = Math.round(item.w * sw);
            piece.d = Math.round(item.d * sd);
            best = pick(best, candidate);
          }
          if (best) break; // Least shrinking that helps wins.
        }
      }
      if (best) {
        plan = best.plan;
        issues = best.issues;
        current = best.score;
        moved++;
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }
  return { plan, moved };
}
