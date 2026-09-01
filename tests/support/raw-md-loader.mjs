/**
 * Teaches Node the `?raw` import suffix.
 *
 * The client loads its agent prompts as strings with Vite's `?raw` — plain
 * Node sees a ".md" it cannot parse, which otherwise puts every module that
 * transitively reaches a prompt out of reach of the test runner.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAW = "?raw";

export async function resolve(specifier, context, next) {
  if (!specifier.endsWith(RAW)) return next(specifier, context);

  // Resolve without the suffix so the tsconfig path aliases still apply,
  // then put it back so `load` below recognises the request.
  const resolved = await next(specifier.slice(0, -RAW.length), context);
  return { ...resolved, url: `${resolved.url}${RAW}`, shortCircuit: true };
}

export async function load(url, context, next) {
  if (!url.endsWith(RAW)) return next(url, context);

  const text = await readFile(fileURLToPath(url.slice(0, -RAW.length)), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(text)};`,
  };
}
