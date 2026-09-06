import type { Language } from "prism-react-renderer";

/**
 * Turning what the model emits into something readable.
 *
 * Separate from `code-card.tsx` only so that file exports components and
 * nothing else, which is what Fast Refresh needs to swap it in place.
 */

const PRISM_ALIASES: Record<string, Language> = {
    svg: "xml",
    yml: "yaml",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    ts: "typescript",
    js: "javascript",
    md: "markdown",
};

const PRISM_SUPPORTED = new Set([
    "text",
    "xml",
    "json",
    "javascript",
    "typescript",
    "tsx",
    "jsx",
    "python",
    "bash",
    "yaml",
    "markdown",
    "css",
    "html",
]);

/** Anything Prism cannot highlight falls back to plain text, never throws. */
export function toPrismLanguage(language: string): Language {
    const lang = (language || "text").toLowerCase();
    if (PRISM_ALIASES[lang]) return PRISM_ALIASES[lang];
    return PRISM_SUPPORTED.has(lang) ? (lang as Language) : "text";
}

/**
 * Break `<a><b/></a>` onto one tag per line and indent by nesting depth. The
 * model streams draw.io XML as a single line, and no amount of wrapping makes
 * that readable.
 */
function formatXmlLike(input: string): string {
    const source = String(input || "").trim();
    if (!source) return source;

    const normalized = source.replace(/\r\n/g, "\n").replace(/>\s*</g, ">\n<");
    const lines = normalized.split("\n");
    let indent = 0;
    const unit = "  ";

    return lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            if (/^<\//.test(line)) indent = Math.max(indent - 1, 0);
            const formatted = `${unit.repeat(indent)}${line}`;

            const isOpeningTag =
                /^<[^!?/][^>]*>$/.test(line) &&
                !/\/>$/.test(line) &&
                !/^<[^>]+>.*<\/[^>]+>$/.test(line);
            if (isOpeningTag) indent += 1;

            return formatted;
        })
        .join("\n");
}

/** Indents XML/HTML and re-serialises JSON; leaves everything else alone. */
export function formatCodeForDisplay(code: string, prismLanguage: Language): string {
    if (prismLanguage === "xml" || prismLanguage === "html") return formatXmlLike(code);
    if (prismLanguage === "json") {
        try {
            return JSON.stringify(JSON.parse(code), null, 2);
        } catch {
            return code;
        }
    }
    return code;
}
