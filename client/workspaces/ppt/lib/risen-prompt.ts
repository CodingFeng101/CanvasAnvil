type RisenPromptSections = {
  role: string;
  instructions?: string;
  input?: string;
  steps?: string;
  endGoal?: string;
  narrowing?: string;
  outputFormat?: string;
};

const renderSection = (title: string, body?: string) => {
  const content = String(body || "").trim();
  if (!content) return "";
  return `# ${title}\n${content}`;
};

export function buildRisenPrompt(sections: RisenPromptSections) {
  return [
    renderSection("R - Role", sections.role),
    renderSection("I - Instructions", sections.instructions),
    renderSection("Input", sections.input),
    renderSection("S - Steps", sections.steps),
    renderSection("E - End Goal", sections.endGoal),
    renderSection("N - Narrowing", sections.narrowing),
    renderSection("Output Format", sections.outputFormat),
  ]
    .filter(Boolean)
    .join("\n\n");
}
