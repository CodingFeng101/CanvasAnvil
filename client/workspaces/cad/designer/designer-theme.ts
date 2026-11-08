// Re-skin the vendored house designer with CanvasAnvil's tokens without touching its bundle:
// its :root variables are pointed at our colours, and the colours it hardcodes in its stylesheet
// (its blue accent, white panels, grey lines and text) are rewritten per property to those variables.
// Canvas drawings are painted by its JS and keep their own colours.

const ACCENT = /rgba?\(47, 111, 237(?:, ([\d.]+))?\)/g;
const WHITE = /^rgba?\(255, 255, 255(?:, ([\d.]+))?\)$/;
const SURFACES = new Set(['rgb(247, 248, 250)', 'rgb(243, 244, 246)', 'rgb(238, 240, 243)', 'rgb(245, 246, 248)', 'rgb(236, 238, 241)']);
const LINES = new Set(['rgb(215, 219, 224)', 'rgb(207, 212, 218)', 'rgb(228, 231, 235)']);
const TEXTS = new Set(['rgb(31, 35, 41)', 'rgb(52, 58, 64)', 'rgb(75, 85, 99)']);
const BACKGROUND = new Set(['background', 'background-color']);
const BORDER = /^border(-(top|right|bottom|left))?(-color)?$/;

function token(name: string, alpha?: number) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`;
}

function variables() {
  const font = getComputedStyle(document.body).fontFamily;
  return `:root{
  --bg:${token('--background')};--panel:${token('--card')};--line:${token('--border')};
  --text:${token('--foreground')};--muted:${token('--muted-foreground')};
  --accent:${token('--primary')};--accent-soft:${token('--primary', 0.12)};--accent-fg:${token('--primary-foreground')};
  --danger:${token('--destructive')};--surface:${token('--muted')};
  --font:${font};
}
html,body{background:var(--bg);color:var(--text)}`;
}

function rewrite(rule: CSSRule) {
  if ('cssRules' in rule) for (const child of Array.from((rule as CSSGroupingRule).cssRules)) rewrite(child);
  // Rules come from the iframe's realm, so instanceof against this window's CSSStyleRule is always false.
  if (!('selectorText' in rule) || !('style' in rule)) return;
  const style = (rule as CSSStyleRule).style;
  for (const property of Array.from(style)) {
    const value = style.getPropertyValue(property);
    const priority = style.getPropertyPriority(property);
    let next = value.replace(ACCENT, (_, alpha) => alpha ? `color-mix(in srgb, var(--accent) ${Math.round(Number(alpha) * 100)}%, transparent)` : 'var(--accent)');
    if (BACKGROUND.has(property)) {
      const white = next.match(WHITE);
      if (white) next = white[1] ? `color-mix(in srgb, var(--panel) ${Math.round(Number(white[1]) * 100)}%, transparent)` : 'var(--panel)';
      else if (SURFACES.has(next)) next = 'var(--surface)';
    } else if (BORDER.test(property) && LINES.has(next)) next = 'var(--line)';
    else if (property === 'color' && TEXTS.has(next)) next = 'var(--text)';
    if (next !== value) style.setProperty(property, next, priority);
  }
}

export function applyDesignerTheme(doc: Document): () => void {
  for (const sheet of Array.from(doc.styleSheets)) {
    try { for (const rule of Array.from(sheet.cssRules)) rewrite(rule); }
    catch { /* cross-origin sheet: leave it */ }
  }
  const style = doc.createElement('style');
  style.id = '__ca_theme';
  const paint = () => { style.textContent = variables(); };
  paint();
  doc.head.appendChild(style);
  // Follow the site's light/dark switch.
  const observer = new MutationObserver(paint);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  return () => { observer.disconnect(); style.remove(); };
}
