/**
 * The docs live at `#/docs/<slug>`: a hash, so the static deploy needs no
 * server rewrite and a link can be shared or bookmarked. Kept apart from the
 * page so the shell can route without loading the docs chunk.
 */

const PREFIX = "#/docs";

export const docsHref = (slug?: string) => (slug ? `${PREFIX}/${slug}` : PREFIX);

/** The slug in the address bar ("" for the docs home), or null when not on the docs. */
export function readDocsHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (hash !== PREFIX && !hash.startsWith(`${PREFIX}/`)) return null;
  return decodeURIComponent(hash.slice(PREFIX.length + 1));
}

export function openDocs(slug?: string) {
  window.location.hash = docsHref(slug);
}

/** Back to wherever the app was, without leaving a docs entry to go "forward" into. */
export function closeDocs() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
