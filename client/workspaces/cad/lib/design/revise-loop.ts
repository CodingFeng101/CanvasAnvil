import type { CadDesign, InternalPlan, DesignIssue, HouseSpec } from './types';
import type { PlanOp } from './plan-ops';
import { issueSummary } from './plan-summary';

type ReviseArgs = {
  initial: CadDesign;
  issuesOf(plan: InternalPlan): Promise<DesignIssue[]>;
  /** cad_ops, a HouseSpec or a spec patch, as the session's apply takes it. */
  askModel(issues: DesignIssue[], summary: string): Promise<PlanOp[] | HouseSpec | { patch: unknown[] }>;
  apply(output: PlanOp[] | HouseSpec | { patch: unknown[] }, current: CadDesign): Promise<CadDesign>;
  maxRounds?: number;
};
export async function reviseUntilClean(args: ReviseArgs): Promise<{ design: CadDesign; issues: DesignIssue[]; rounds: number; rolledBack: boolean }> {
  let best = structuredClone(args.initial);
  let issues = await args.issuesOf(best.plan);
  let errorCount = issues.filter(issue => issue.level === 'error').length;
  let rounds = 0;
  const maxRounds = Math.max(0, Math.min(3, Math.floor(args.maxRounds ?? 3)));
  while (errorCount > 0 && rounds < maxRounds) {
    const errors = issues.filter(issue => issue.level === 'error');
    const output = await args.askModel(errors, issueSummary(best.plan, errors));
    rounds++;
    try {
      const candidate = await args.apply(output, structuredClone(best));
      const nextIssues = await args.issuesOf(candidate.plan);
      const nextCount = nextIssues.filter(issue => issue.level === 'error').length;
      if (nextCount >= errorCount) {
        const restoredIssues = await args.issuesOf(best.plan);
        return { design: best, issues: restoredIssues, rounds, rolledBack: true };
      }
      best = structuredClone(candidate);
      issues = nextIssues;
      errorCount = nextCount;
    } catch (reason) {
      await args.issuesOf(best.plan);
      throw reason;
    }
  }
  return { design: best, issues, rounds, rolledBack: false };
}
