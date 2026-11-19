import type { CSSProperties, ElementType, ReactNode } from "react";
import { useReveal } from "./motion";
import type { PortalWorkspace } from "./data";

/**
 * A heading whose words fade in one after another when it scrolls into view
 * (plan §2.5). Screen readers get the whole sentence once, from aria-label.
 */
export function Words({
  as: Tag = "h2",
  words,
  className = "",
  style,
}: {
  as?: ElementType;
  words: string[];
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useReveal<HTMLElement>();
  const joiner = /[一-鿿]/.test(words.join("")) ? "" : " ";
  return (
    <Tag ref={ref} className={`p-words ${className}`} style={style} aria-label={words.join(joiner)}>
      {words.map((w, i) => (
        <span key={i} className="p-w" aria-hidden="true" style={{ "--i": i } as CSSProperties}>
          {w}
          {joiner && i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

/** A block that rises in once it is on screen; `i` staggers siblings by 0.1s. */
export function Reveal({
  as: Tag = "div",
  i = 0,
  className = "",
  style,
  onClick,
  children,
}: {
  as?: ElementType;
  i?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref}
      className={`p-rv ${className}`}
      style={{ "--i": i, ...style } as CSSProperties}
      onClick={onClick}
      type={Tag === "button" ? "button" : undefined}
    >
      {children}
    </Tag>
  );
}

/** The anvil mark, drawn in the portal's clay instead of the app's tokens. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#C96442" />
      <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#EFB8A2" />
      <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#B4522F" />
      <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#7A3520" />
      <path d="M18.8 33.1h10.4v5.1H18.8v-5.1Z" fill="#C96442" />
      <path d="M13.2 38.1h21.6l3 5.4H10.2l3-5.4Z" fill="#A0472A" />
    </svg>
  );
}

export function Dot({ color }: { color: string }) {
  return <i className="p-dot" style={{ "--c": color } as CSSProperties} />;
}

/** Thin line icons for the four canvases (the story dock). */
export function CanvasIcon({ k }: { k: PortalWorkspace }) {
  const paths: Record<PortalWorkspace, ReactNode> = {
    diagram: <path d="M4 5h6v4H4zM14 15h6v4h-6zM14 5h6v4h-6zM7 9v3h10v3M17 9v3" />,
    cad: <path d="M4 20V9l8-5 8 5v11zM9 20v-6h6v6" />,
    ppt: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M12 16v4M8 20h8" />
      </>
    ),
    canvas: <path d="M4 18c3-6 6-9 9-9s4 3 7 1M4 4h16v16H4z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[k]}
    </svg>
  );
}

export function GithubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.6.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.1 10.1 0 0 0 22 12.2C22 6.6 17.5 2 12 2Z" />
    </svg>
  );
}
