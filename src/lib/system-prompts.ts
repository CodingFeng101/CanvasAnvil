import drawioPrompt from "../../agent/flow/system.md?raw";
import cadPrompt from "../../agent/cad/system.md?raw";
import pptOutlinePrompt from "../../agent/ppt/outline.md?raw";
import pptOutlineEditPrompt from "../../agent/ppt/outline-edit.md?raw";
import pptSlidesGeneratePrompt from "../../agent/ppt/slides-generate.md?raw";
import pptSlidesEditPrompt from "../../agent/ppt/system.md?raw";

export const DRAWIO_SYSTEM_PROMPT = drawioPrompt;
export const CAD_SYSTEM_PROMPT = cadPrompt;
export const PPT_OUTLINE_SYSTEM_PROMPT = pptOutlinePrompt;
export const PPT_OUTLINE_EDIT_SYSTEM_PROMPT = pptOutlineEditPrompt;
export const PPT_SLIDES_GENERATE_SYSTEM_PROMPT = pptSlidesGeneratePrompt;
export const PPT_SLIDES_EDIT_SYSTEM_PROMPT = pptSlidesEditPrompt;
