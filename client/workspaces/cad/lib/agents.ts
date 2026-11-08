import plan from "@prompts/cad/plan.md?raw";
import create from "@prompts/cad/design/create.md?raw";
import edit from "@prompts/cad/design/edit.md?raw";
import fix from "@prompts/cad/design/fix.md?raw";
import fromDraft from "@prompts/cad/design/create-from-draft.md?raw";
export const CAD_PLAN_AGENT_PROMPT = plan;
export const CAD_DESIGN_CREATE_PROMPT = create;
export const CAD_DESIGN_EDIT_PROMPT = edit;
export const CAD_DESIGN_FIX_PROMPT = fix;
/** Completing a recognized floorplan draft (GUIDE sections 2–5): symbols list, spec, furniture, what is left to confirm. */
export const CAD_DESIGN_FROM_DRAFT_PROMPT = fromDraft;
import specFormat from "../../../../resources/hpd/spec-format.md?raw";
import furnishing from "../../../../resources/hpd/furnishing.md?raw";
import mepRules from "../../../../resources/hpd/mep-rules.md?raw";
import cadConventions from "../../../../resources/hpd/cad-conventions.md?raw";
/** The designer's own references (its HouseSpec format, furnishing and MEP rules, CAD conventions). */
export const DESIGNER_SPEC_FORMAT = specFormat;
export const DESIGNER_FURNISHING = furnishing;
export const DESIGNER_MEP_RULES = mepRules;
export const DESIGNER_CAD_CONVENTIONS = cadConventions;
import routeImage from "../../../../resources/hpd/route-image.md?raw";
import routeCad from "../../../../resources/hpd/route-cad.md?raw";
import routeBuilding from "../../../../resources/hpd/route-building.md?raw";
import routeDxfLayout from "../../../../resources/hpd/route-dxf-layout.md?raw";
import routeDual from "../../../../resources/hpd/route-dual.md?raw";
import routeVilla from "../../../../resources/hpd/route-villa.md?raw";
import routeOffice from "../../../../resources/hpd/route-office.md?raw";

/** The recognizer route's own guide (the designer's reference/route-*.md), keyed by the route the recognizer took. */
const ROUTE_GUIDES: Record<string, string> = {
  image: routeImage,
  cadshot: routeImage,
  cad: routeCad,
  cadpair: routeCad,
  building: routeBuilding,
  "dxf-layout": routeDxfLayout,
  dual: routeDual,
};

/**
 * The route guide for completing a recognized drawing, plus the villa / office guides when the drawing or the
 * request is one (garage, courtyard, void; core, meeting rooms…).
 */
export function routeReference(route: string | undefined, request = ""): string {
  const parts: string[] = [];
  const guide = route ? ROUTE_GUIDES[route] : undefined;
  if (guide) parts.push(`# 本图的识别路线说明\n\n${guide}`);
  if (route === "dual" || route === "dxf-layout") parts.push(`# CAD 路线（双图 / 布置图里的原图按它读）\n\n${routeCad}`);
  if (/别墅|车库|庭院|挑空|地下室|villa|garage/i.test(request)) parts.push(`# 独栋别墅\n\n${routeVilla}`);
  if (/办公|写字楼|培训|会议|核心筒|商业|office/i.test(request)) parts.push(`# 办公 / 商业楼层\n\n${routeOffice}`);
  return parts.join("\n\n");
}

/**
 * The references a request needs: always the spec format, the rules when the request is about them;
 * `all` (reconstructing a drawing) adds the CAD conventions and legend, the furnishing and the MEP rules.
 */
export function designerReferences(request: string, options: { all?: boolean } = {}): string {
  const parts = [`# 设计器 HouseSpec 格式（cad_spec_patch 的路径和字段以此为准）\n\n${specFormat}`];
  if (options.all) return [...parts, `# CAD 画法、平面布置图图例、结构形式与承重判定\n\n${cadConventions}`, `# 家具布置规则\n\n${furnishing}`, `# 水电规则\n\n${mepRules}`].join("\n\n");
  if (/水电|插座|开关|灯|网口|电箱|管线|走线|给水|排水|热水|燃气|空调|新风|弱电|强电|审计|MEP|socket|switch|light/i.test(request)) parts.push(`# 水电规则\n\n${mepRules}`);
  if (/家具|家电|摆|布置|床|沙发|柜|桌|椅|马桶|浴|厨|furniture/i.test(request)) parts.push(`# 家具布置规则\n\n${furnishing}`);
  return parts.join("\n\n");
}
