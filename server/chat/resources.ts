import path from "node:path";

/**
 * Where the server finds the files it reads at request time.
 *
 * These are runtime data, not build inputs: the client bundles the same
 * prompts with `?raw`, but the server reads them from disk, so a deployment
 * has to ship resources/ alongside the code.
 */

const RESOURCES = "resources";

export function promptsDir(): string {
  return path.join(process.cwd(), RESOURCES, "prompts");
}

export function shapeLibraryDir(): string {
  return path.join(process.cwd(), RESOURCES, "shape-libraries");
}
