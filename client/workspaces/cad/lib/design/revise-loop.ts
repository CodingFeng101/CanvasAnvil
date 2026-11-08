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
/** The designer's delivery gate is 0 errors and 0 warnings; an error weighs more than any number of warnings. */
const open = (issues: DesignIssue[]) => issues.filter(issue => issue.level === 'error' || issue.level === 'warn');
const score = (issues: DesignIssue[]) => issues.reduce((sum, issue) => sum + (issue.level === 'error' ? 1000 : issue.level === 'warn' ? 1 : 0), 0);
export const MAX_REVISE_ROUNDS = 6;

/** Ask the model to fix the designer's errors and warnings until none are left, a round makes nothing better, or the rounds run out. */
export async function reviseUntilClean(args: ReviseArgs): Promise<{ design: CadDesign; issues: DesignIssue[]; rounds: number; rolledBack: boolean }> {
  let best = structuredClone(args.initial);
  let issues = await args.issuesOf(best.plan);
  let current = score(issues);
  let rounds = 0;
  const maxRounds = Math.max(0, Math.min(MAX_REVISE_ROUNDS, Math.floor(args.maxRounds ?? MAX_REVISE_ROUNDS)));
  while (current > 0 && rounds < maxRounds) {
    const pending = open(issues);
    const output = await args.askModel(pending, issueSummary(best.plan, pending));
    rounds++;
    try {
      const candidate = await args.apply(output, structuredClone(best));
      const nextIssues = await args.issuesOf(candidate.plan);
      const nextScore = score(nextIssues);
      const errorCount = issues.filter(issue => issue.level === 'error').length;
      const nextCount = nextIssues.filter(issue => issue.level === 'error').length;
      if (nextScore >= current || nextCount > errorCount) {
        const restoredIssues = await args.issuesOf(best.plan);
        return { design: best, issues: restoredIssues, rounds, rolledBack: true };
      }
      best = structuredClone(candidate);
      issues = nextIssues;
      current = nextScore;
    } catch (reason) {
      await args.issuesOf(best.plan);
      throw reason;
    }
  }
  return { design: best, issues, rounds, rolledBack: false };
}
