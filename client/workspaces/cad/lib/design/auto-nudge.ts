import type { DesignIssue, SinglePlan } from './types';

// Small, deterministic fixes for the errors models are worst at: furniture a few centimetres
// into a wall, a curtain or a neighbour. Each furniture item named by an error is shifted along
// the axes; a move is kept only if the designer's own checks then report fewer errors and no
// more warnings.
const STEPS = [25, 50, 100, 150, 200, 300, 400];
const DIRECTIONS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_PASSES = 8;

type Score = { errors: number; warnings: number };
const score = (issues: DesignIssue[]): Score => ({
  errors: issues.filter(issue => issue.level === 'error').length,
  warnings: issues.filter(issue => issue.level === 'warn').length,
});
const better = (a: Score, b: Score) => a.errors < b.errors && a.warnings <= b.warnings;

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
      let best: { plan: SinglePlan; score: Score; issues: DesignIssue[] } | undefined;
      for (const step of STEPS) {
        for (const [dx, dy] of DIRECTIONS) {
          const candidate = structuredClone(plan);
          const item = candidate.furniture[index];
          item.x += dx * step;
          item.y += dy * step;
          const nextIssues = issuesOf(candidate);
          const next = score(nextIssues);
          if (better(next, best?.score ?? current)) best = { plan: candidate, score: next, issues: nextIssues };
        }
        if (best) break; // Smallest shift that helps wins.
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
