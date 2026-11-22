import type { CadDesign, InternalPlan, DesignIssue, HouseSpec } from './types';
import type { PlanOp } from './plan-ops';
import { issueSummary } from './plan-summary';

type ReviseArgs = {
  initial: CadDesign;
  issuesOf(plan: InternalPlan): Promise<DesignIssue[]>;
  /** cad_ops, a HouseSpec or a spec patch, as the session's apply takes it. */
  /** `missed`: the last round left as many errors and was undone, so a different fix is wanted. */
  askModel(issues: DesignIssue[], summary: string, missed: boolean): Promise<PlanOp[] | HouseSpec | { patch: unknown[] }>;
  apply(output: PlanOp[] | HouseSpec | { patch: unknown[] }, current: CadDesign): Promise<CadDesign>;
  maxRounds?: number;
};
/**
 * Errors must go: the design cannot be confirmed (nor its deliverables exported) while any is
 * left. Warnings are acceptable, so they are neither sent nor waited for.
 */
const errorsOf = (issues: DesignIssue[]) => issues.filter(issue => issue.level === 'error');
export const MAX_REVISE_ROUNDS = 6;
/** Rounds in a row that may fail to take an error away before giving up: a fix often needs a second go. */
const MAX_MISSES = 2;

/**
 * Ask the model to fix the designer's errors until none are left or the rounds run out. A round
 * is kept when it leaves fewer errors (more warnings are fine); one that does not is undone and
 * the model is asked again from the best plan, up to MAX_MISSES times in a row.
 */
export async function reviseUntilClean(args: ReviseArgs): Promise<{ design: CadDesign; issues: DesignIssue[]; rounds: number; rolledBack: boolean }> {
  let best = structuredClone(args.initial);
  let issues = await args.issuesOf(best.plan);
  let rounds = 0;
  let misses = 0;
  let rolledBack = false;
  const maxRounds = Math.max(0, Math.min(MAX_REVISE_ROUNDS, Math.floor(args.maxRounds ?? MAX_REVISE_ROUNDS)));
  while (errorsOf(issues).length > 0 && rounds < maxRounds && misses < MAX_MISSES) {
    const pending = errorsOf(issues);
    const output = await args.askModel(pending, issueSummary(best.plan, pending), misses > 0);
    rounds++;
    try {
      const candidate = await args.apply(output, structuredClone(best));
      const nextIssues = await args.issuesOf(candidate.plan);
      if (errorsOf(nextIssues).length < pending.length) {
        best = structuredClone(candidate);
        issues = nextIssues;
        misses = 0;
        rolledBack = false;
        continue;
      }
      // No better: back to the best plan, and try again from it.
      issues = await args.issuesOf(best.plan);
      misses++;
      rolledBack = true;
    } catch (reason) {
      await args.issuesOf(best.plan);
      throw reason;
    }
  }
  return { design: best, issues, rounds, rolledBack };
}
