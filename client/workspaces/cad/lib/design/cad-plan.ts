/**
 * The plan inside a cad_plan answer. The model sends `{ "type": "cad_plan", "plan": { … } }`; everything that reads
 * the plan (its decisions, the wiring preferences, the layout prompt) wants the inner object. Stored plans from
 * before this was unwrapped may be wrapped once or several times.
 */
export function unwrapCadPlan<T = any>(value: unknown): T | null {
  let plan: any = value;
  for (let depth = 0; depth < 8 && plan && typeof plan === "object" && plan.type === "cad_plan" && plan.plan && typeof plan.plan === "object"; depth += 1) plan = plan.plan;
  return plan && typeof plan === "object" ? (plan as T) : null;
}
