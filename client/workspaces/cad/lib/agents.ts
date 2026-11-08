import plan from "@prompts/cad/plan.md?raw";
import create from "@prompts/cad/design/create.md?raw";
import edit from "@prompts/cad/design/edit.md?raw";
import fix from "@prompts/cad/design/fix.md?raw";
export const CAD_PLAN_AGENT_PROMPT = plan;
export const CAD_DESIGN_CREATE_PROMPT = create;
export const CAD_DESIGN_EDIT_PROMPT = edit;
export const CAD_DESIGN_FIX_PROMPT = fix;
import specFormat from "../../../../resources/hpd/spec-format.md?raw";
import furnishing from "../../../../resources/hpd/furnishing.md?raw";
import mepRules from "../../../../resources/hpd/mep-rules.md?raw";
import cadConventions from "../../../../resources/hpd/cad-conventions.md?raw";
/** The designer's own references (its HouseSpec format, furnishing and MEP rules, CAD conventions). */
export const DESIGNER_SPEC_FORMAT = specFormat;
export const DESIGNER_FURNISHING = furnishing;
export const DESIGNER_MEP_RULES = mepRules;
export const DESIGNER_CAD_CONVENTIONS = cadConventions;

/** The references an edit request needs: always the spec format, the rules when the request is about them. */
export function designerReferences(request: string): string {
  const parts = [`# 设计器 HouseSpec 格式（cad_spec_patch 的路径和字段以此为准）\n\n${specFormat}`];
  if (/水电|插座|开关|灯|网口|电箱|管线|走线|给水|排水|热水|燃气|空调|新风|弱电|强电|审计|MEP|socket|switch|light/i.test(request)) parts.push(`# 水电规则\n\n${mepRules}`);
  if (/家具|家电|摆|布置|床|沙发|柜|桌|椅|马桶|浴|厨|furniture/i.test(request)) parts.push(`# 家具布置规则\n\n${furnishing}`);
  return parts.join("\n\n");
}
