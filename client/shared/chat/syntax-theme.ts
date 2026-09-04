import type { PrismTheme } from "prism-react-renderer";

/**
 * Syntax colours for every code block in the app.
 *
 * All three chat panels used `themes.github`, a fixed light theme that also
 * paints its own white background -- so once the surrounding panel followed the
 * dark tokens, code blocks stayed a bright island in the middle of it.
 *
 * These are CSS variable references rather than literals, so the theme reacts
 * to the token flip like everything else. The palette is deliberately narrow:
 * most code is plain foreground, and only four roles get a hue.
 */
export const syntaxTheme: PrismTheme = {
  plain: {
    color: "hsl(var(--foreground) / 0.9)",
    // Transparent so the block's own token surface shows through.
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "hsl(var(--muted-foreground) / 0.8)", fontStyle: "italic" },
    },
    {
      types: ["punctuation"],
      style: { color: "hsl(var(--muted-foreground) / 0.7)" },
    },
    {
      types: ["tag", "keyword", "selector", "at-rule", "rule"],
      style: { color: "hsl(var(--primary))" },
    },
    {
      types: ["string", "attr-value", "char", "inserted"],
      style: { color: "hsl(var(--success))" },
    },
    {
      types: ["number", "boolean", "constant", "symbol"],
      style: { color: "hsl(var(--warning))" },
    },
    {
      types: ["attr-name", "property", "variable"],
      style: { color: "hsl(var(--foreground) / 0.72)" },
    },
    {
      types: ["function", "class-name"],
      style: { color: "hsl(var(--foreground))", fontWeight: "500" },
    },
    {
      types: ["operator", "entity", "url"],
      style: { color: "hsl(var(--foreground) / 0.8)" },
    },
    {
      types: ["deleted"],
      style: { color: "hsl(var(--destructive))" },
    },
    { types: ["important", "bold"], style: { fontWeight: "600" } },
    { types: ["italic"], style: { fontStyle: "italic" } },
  ],
};
