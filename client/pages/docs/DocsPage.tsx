import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, Check, Copy, Lightbulb, Menu, Search, Sparkles, StickyNote, X } from "lucide-react";
import { useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { BrandMark } from "@/pages/portal/components";
import { DEFAULT_DOC, DOC_GROUPS, DOC_PAGES, groupOf, pageTitle, type DocPage } from "./nav";
import { closeDocs, docsHref, openDocs } from "./route";
import { Diagram } from "./diagrams";
import { AnvilColophon, Flourish } from "@/shared/ui/ornaments";
import "./docs.css";

/*
 * The in-app docs, laid out after Claude's own: a quiet top bar with search,
 * the contents on the left, the article in the middle, "on this page" on the
 * right, and previous / next at the foot. Pages are markdown files; English
 * falls back to the Chinese text, with a note, until a translation exists.
 */

const SOURCES = import.meta.glob("./content/*/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function source(slug: string, lang: UiLanguage): { text: string; fallback: boolean } {
  const own = SOURCES[`./content/${lang}/${slug}.md`];
  if (own) return { text: own, fallback: false };
  return { text: SOURCES[`./content/zh/${slug}.md`] ?? "", fallback: lang !== "zh" };
}

/** Markdown inline syntax stripped down to the words. */
const plain = (s: string) =>
  s
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();

const slugify = (s: string) =>
  plain(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

type Heading = { id: string; text: string; depth: 2 | 3; line: number };

/**
 * The ## and ### headings outside code fences, for "on this page". A heading
 * that repeats (the changelog's "New" under every date) gets -2, -3 … so each
 * anchor and TOC entry stays its own.
 */
function headingsOf(md: string): Heading[] {
  const out: Heading[] = [];
  const seen = new Map<string, number>();
  let fenced = false;
  md.split("\n").forEach((line, i) => {
    if (line.startsWith("```")) fenced = !fenced;
    if (fenced) return;
    const m = /^(##|###) (.+)$/.exec(line.replace(/\r$/, ""));
    if (!m) return;
    const base = slugify(m[2]);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ id: n === 1 ? base : `${base}-${n}`, text: plain(m[2]), depth: m[1].length as 2 | 3, line: i + 1 });
  });
  return out;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The plain words of a page, for search. */
const searchText = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|_-]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ");

type CalloutKind = "note" | "tip" | "why";
const CALLOUTS: Record<CalloutKind, { zh: string; en: string; Icon: typeof StickyNote }> = {
  note: { zh: "说明", en: "Note", Icon: StickyNote },
  tip: { zh: "提示", en: "Tip", Icon: Lightbulb },
  why: { zh: "为什么这样做", en: "Why it is done this way", Icon: Sparkles },
};

/** `[!WHY]` at the head of a quote becomes a marker the renderer can see. */
const withCallouts = (md: string) => md.replace(/^> \[!(NOTE|TIP|WHY)\][ \t]*/gm, (_, k: string) => `> \`!${k.toLowerCase()}\` `);

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };
function calloutOf(node: HastNode | undefined): CalloutKind | null {
  const stack = node?.children ? [...node.children] : [];
  while (stack.length) {
    const n = stack.shift()!;
    if (n.type === "element" && n.tagName === "code") {
      const v = n.children?.[0]?.value ?? "";
      return v === "!note" || v === "!tip" || v === "!why" ? (v.slice(1) as CalloutKind) : null;
    }
    if (n.children) stack.unshift(...n.children);
  }
  return null;
}

function CodeBlock({ code, lang, children }: { code: string; lang: UiLanguage; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="doc-code group relative">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label={lang === "zh" ? "复制代码" : "Copy code"}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function markdownComponents(lang: UiLanguage, headings: Heading[]): Components {
  const idAt = new Map(headings.map((h) => [h.line, h.id]));
  const heading = (Tag: "h2" | "h3") =>
    function DocHeading({ children, node }: { children?: ReactNode; node?: { position?: { start: { line: number } } } }) {
      const id = idAt.get(node?.position?.start.line ?? -1) ?? slugify(textOf(children));
      return (
        <Tag id={id} className="group scroll-mt-24">
          {children}
          <a href={`#${id}`} aria-hidden onClick={(e) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }))} className="doc-anchor">
            #
          </a>
        </Tag>
      );
    };
  return {
    // A chapter opening: the title, a small flourish, then the opening line.
    h1({ children }) {
      return (
        <>
          <h1>{children}</h1>
          <Flourish className="doc-flourish" />
        </>
      );
    },
    h2: heading("h2"),
    h3: heading("h3"),
    a({ href = "", children }) {
      if (href.startsWith("/docs/")) return <a href={`#${href}`}>{children}</a>;
      const external = /^https?:/.test(href);
      return (
        <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {children}
        </a>
      );
    },
    pre({ node, children }) {
      const code = (node as HastNode | undefined)?.children?.[0];
      const cls = String((code as { properties?: { className?: string[] } } | undefined)?.properties?.className ?? "");
      const text = textOf(children).replace(/\n$/, "");
      if (cls.includes("language-diagram")) return <Diagram name={text.trim()} lang={lang} />;
      return (
        <CodeBlock code={text} lang={lang}>
          {children}
        </CodeBlock>
      );
    },
    code({ children, className }) {
      const text = textOf(children);
      if (!className && /^!(note|tip|why)$/.test(text)) {
        const { Icon, ...label } = CALLOUTS[text.slice(1) as CalloutKind];
        return (
          <span className="doc-callout-label">
            <Icon className="size-3.5" />
            {label[lang]}
          </span>
        );
      }
      return <code className={className}>{children}</code>;
    },
    blockquote({ node, children }) {
      const kind = calloutOf(node as HastNode | undefined);
      return <blockquote className={cn(kind && `doc-callout doc-callout-${kind}`)}>{children}</blockquote>;
    },
    table({ children }) {
      return (
        <div className="doc-table">
          <table>{children}</table>
        </div>
      );
    },
  };
}

function SearchDialog({ open, onOpenChange, lang }: { open: boolean; onOpenChange: (v: boolean) => void; lang: UiLanguage }) {
  const zh = lang === "zh";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const index = useMemo(() => DOC_PAGES.map((page) => ({ page, group: groupOf(page.slug)!, text: searchText(source(page.slug, lang).text) })), [lang]);
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return index.slice(0, 8).map((r) => ({ ...r, snippet: "" }));
    return index
      .map((r) => {
        const title = pageTitle(r.page, lang).toLowerCase();
        const at = r.text.toLowerCase().indexOf(q);
        if (!title.includes(q) && at < 0) return null;
        const snippet = at < 0 ? "" : `${at > 24 ? "…" : ""}${r.text.slice(Math.max(0, at - 24), at + q.length + 48)}…`;
        return { ...r, snippet, rank: title.includes(q) ? 0 : 1 };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10);
  }, [index, q, lang]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (slug: string) => {
    onOpenChange(false);
    openDocs(slug);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px] [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{zh ? "搜索文档" : "Search the docs"}</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border/70 px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter" && results[active]) go(results[active].page.slug);
            }}
            placeholder={zh ? "搜索文档…" : "Search the docs…"}
            className="h-12 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="aside-voice px-3 py-8 text-center text-[14px] text-muted-foreground">{zh ? "没有找到相关的页面。" : "Nothing in the docs matches that."}</li>
          )}
          {results.map((r, i) => (
            <li key={r.page.slug}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.page.slug)}
                className={cn("block w-full rounded-lg px-3 py-2 text-left", i === active && "bg-foreground/[0.05]")}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] text-foreground">{pageTitle(r.page, lang)}</span>
                  <span className="text-[12px] text-muted-foreground">{zh ? r.group.zh : r.group.en}</span>
                </div>
                {r.snippet && <div className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">{r.snippet}</div>}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function Sidebar({ slug, lang, onNavigate }: { slug: string; lang: UiLanguage; onNavigate?: () => void }) {
  return (
    <nav aria-label={lang === "zh" ? "文档目录" : "Docs contents"} className="space-y-6 text-[14px]">
      {DOC_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="mb-1 px-3 text-[14.5px] font-semibold text-foreground">{lang === "zh" ? group.zh : group.en}</div>
          <ul>
            {group.pages.map((page) => (
              <li key={page.slug}>
                <a
                  href={docsHref(page.slug)}
                  onClick={onNavigate}
                  aria-current={page.slug === slug ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
                    page.slug === slug && "bg-foreground/[0.06] font-medium text-foreground",
                  )}
                >
                  {pageTitle(page, lang)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OnThisPage({ headings, lang }: { headings: Heading[]; lang: UiLanguage }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // The last heading above the upper third of the window is the one being read.
    const onScroll = () => {
      let id = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top < window.innerHeight * 0.3) id = el.id;
      setCurrent(id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headings]);
  if (!headings.length) return null;
  return (
    <div className="text-[13px]">
      <div className="mb-2 text-[13.5px] font-semibold text-foreground">{lang === "zh" ? "本页内容" : "On this page"}</div>
      <ul className="space-y-1 border-l border-border/70">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => (e.preventDefault(), document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" }))}
              className={cn(
                "-ml-px block border-l py-0.5 leading-snug transition-colors",
                h.depth === 3 ? "pl-6 text-[12.5px]" : "pl-3",
                current === h.id
                  ? "border-foreground text-foreground"
                  : cn("border-transparent hover:text-foreground", h.depth === 3 ? "text-muted-foreground/80" : "text-foreground/75"),
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrevNext({ slug, lang }: { slug: string; lang: UiLanguage }) {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  const prev: DocPage | undefined = DOC_PAGES[i - 1];
  const next: DocPage | undefined = DOC_PAGES[i + 1];
  const zh = lang === "zh";
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {prev ? (
        <a href={docsHref(prev.slug)} className="group rounded-xl border border-border/70 px-4 py-3 transition-colors hover:border-border hover:bg-foreground/[0.02]">
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            {zh ? "上一篇" : "Previous"}
          </div>
          <div className="mt-1 font-display text-[16px] text-foreground">{pageTitle(prev, lang)}</div>
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a href={docsHref(next.slug)} className="group rounded-xl border border-border/70 px-4 py-3 text-right transition-colors hover:border-border hover:bg-foreground/[0.02]">
          <div className="flex items-center justify-end gap-1.5 text-[12.5px] text-muted-foreground">
            {zh ? "下一篇" : "Next"}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-1 font-display text-[16px] text-foreground">{pageTitle(next, lang)}</div>
        </a>
      )}
    </div>
  );
}

export default function DocsPage({ slug: requested }: { slug: string }) {
  const lang = useUiLanguage();
  const zh = lang === "zh";
  const slug = DOC_PAGES.some((p) => p.slug === requested) ? requested : DEFAULT_DOC;
  const page = DOC_PAGES.find((p) => p.slug === slug)!;
  const group = groupOf(slug)!;
  const { text, fallback } = source(slug, lang);
  const md = useMemo(() => withCallouts(text), [text]);
  const headings = useMemo(() => headingsOf(md), [md]);
  const components = useMemo(() => markdownComponents(lang, headings), [lang, headings]);
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = `${pageTitle(page, lang)} · ${zh ? "CanvasAnvil 文档" : "CanvasAnvil Docs"}`;
    return () => {
      document.title = "CanvasAnvil";
    };
  }, [page, lang, zh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
      if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea")) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div className="paper-grain min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => setMenu(!menu)} aria-label={zh ? "目录" : "Contents"} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] lg:hidden">
            {menu ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <a href={docsHref()} className="flex items-center gap-2">
            <span className="size-6 [&_svg]:size-6">
              <BrandMark />
            </span>
            <span className="hidden font-display text-[17px] tracking-[-0.01em] sm:inline">CanvasAnvil</span>
            <span className="aside-voice hidden whitespace-nowrap text-[16px] text-muted-foreground sm:inline">{zh ? "文档" : "Docs"}</span>
          </a>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border/80 bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-border sm:ml-8 sm:w-72"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">{zh ? "搜索文档" : "Search docs"}</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[11px] sm:inline">{mod} K</kbd>
          </button>
          <div className="flex items-center gap-1 sm:ml-auto">
            <button type="button" onClick={closeDocs} className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-3 text-[13px] text-background transition-opacity hover:opacity-90">
              {zh ? "回到应用" : "Back to app"}
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-y-auto bg-background px-4 py-6 lg:hidden">
          <Sidebar slug={slug} lang={lang} onNavigate={() => setMenu(false)} />
        </div>
      )}

      <div className="mx-auto flex max-w-[1440px] px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto py-8 pr-4 lg:block">
          <Sidebar slug={slug} lang={lang} />
        </aside>

        <main className="min-w-0 flex-1 py-10 lg:px-12">
          <article className="mx-auto max-w-[720px]">
            <div className="mb-3 text-[13px] text-muted-foreground">{zh ? group.zh : group.en}</div>
            {fallback && (
              <div className="mb-6 rounded-xl border border-border/80 bg-foreground/[0.03] px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                This page has not been translated yet, so it is shown in Chinese. The English version is on the way.
              </div>
            )}
            <div className="doc-prose" lang={fallback ? "zh-CN" : undefined}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {md}
              </ReactMarkdown>
            </div>
            <AnvilColophon className="mx-auto mt-16 block text-[#c96442]/75" />
            <PrevNext slug={slug} lang={lang} />
          </article>
        </main>

        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-10 xl:block">
          <OnThisPage headings={headings} lang={lang} />
        </aside>
      </div>

      <SearchDialog open={searching} onOpenChange={setSearching} lang={lang} />
    </div>
  );
}
