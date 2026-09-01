import outlineEditPrompt from "@prompts/ppt/outline-edit.md?raw";
import slidesEditPrompt from "@prompts/ppt/system.md?raw";

/**
 * The two prompts the PPT chat panel switches between: one for editing the
 * outline, one for editing generated slides.
 */
export const PPT_OUTLINE_EDIT_SYSTEM_PROMPT = outlineEditPrompt;
export const PPT_SLIDES_EDIT_SYSTEM_PROMPT = slidesEditPrompt;
