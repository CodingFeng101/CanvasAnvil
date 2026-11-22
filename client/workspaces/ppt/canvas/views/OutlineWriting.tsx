import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";

export interface WritingPage {
  title: string;
  content: string[];
}

/**
 * The outline being written by an AI pen: page by page, line by line, with the pen at the end of
 * the line it is writing. The text arrives from the model in bursts; the pen writes it out at an
 * even pace, a little faster when it falls behind, and finishes what is left once the outline is
 * complete. Same layout as the outline it turns into, so the switch is seamless.
 */
export function OutlineWriting({
  pages,
  final,
  onDone,
  tr,
}: {
  pages: WritingPage[];
  /** The whole outline is in; once the pen has written it out, `onDone`. */
  final: boolean;
  onDone(): void;
  tr: (zh: string, en: string) => string;
}) {
  const lines = pages.flatMap((page, index) => [
    { page: index, kind: "title" as const, text: page.title },
    ...page.content.filter((line) => line.trim()).map((text) => ({ page: index, kind: "bullet" as const, text })),
  ]);
  const total = lines.reduce((sum, line) => sum + line.text.length, 0);
  const [shown, setShown] = useState(0);
  const targetRef = useRef(total);
  targetRef.current = total;
  const finalRef = useRef(final);
  finalRef.current = final;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const penRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    let value = 0;
    let finished = false;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    const tick = () => {
      const target = targetRef.current;
      const behind = target - value;
      if (behind > 0) {
        // An even hand while the model keeps up; quicker when it has run ahead, quickest once it is done.
        const pace = reduce ? behind : finalRef.current ? Math.max(1.4, behind * 0.08) : Math.min(Math.max(0.7, behind * 0.05), 6);
        value = Math.min(target, value + pace);
        setShown(Math.floor(value));
      } else if (finalRef.current && !finished && target > 0) {
        finished = true;
        window.setTimeout(() => doneRef.current(), 450);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep the pen in view as the outline grows.
  useEffect(() => {
    penRef.current?.scrollIntoView({ block: "nearest" });
  }, [shown]);

  // Which lines are (partly) written, and where the pen is.
  let left = shown;
  const written = lines.map((line) => {
    const take = Math.max(0, Math.min(line.text.length, left));
    left -= take;
    return line.text.slice(0, take);
  });
  let penAt = written.findIndex((text, index) => text.length < lines[index].text.length);
  if (penAt < 0) penAt = lines.length - 1;
  const visiblePages = lines.length ? lines[penAt].page + 1 : 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-baseline justify-between px-8 pt-6 pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          {tr("正在写大纲", "Writing the outline")}
        </h3>
        <span className="text-sm tabular-nums text-muted-foreground">{tr(`已有 ${visiblePages} 页`, `${visiblePages} so far`)}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 pb-10">
        {lines.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            <PenLine className="pen-bob mr-2 inline size-4 text-brand" />
            {tr("构思中…", "Thinking it through…")}
          </p>
        )}
        <div className="divide-y divide-border/70">
          {pages.slice(0, visiblePages).map((page, pageIndex) => (
            <div key={pageIndex} className="flex gap-4 py-6">
              <div className="w-6 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-muted-foreground">{pageIndex + 1}</div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {lines.map((line, index) => {
                  if (line.page !== pageIndex || (!written[index] && index !== penAt)) return null;
                  const pen = index === penAt && (!final || shown < total) ? (
                    <span ref={penRef} className="relative inline-block w-0 align-baseline">
                      <PenLine aria-hidden className="pen-bob absolute -top-[15px] left-0.5 size-[18px] text-brand" strokeWidth={1.8} />
                    </span>
                  ) : null;
                  return line.kind === "title" ? (
                    <p key={index} className="font-medium text-foreground">
                      {written[index]}
                      {pen}
                    </p>
                  ) : (
                    <p key={index} className="flex gap-2 text-sm leading-relaxed text-foreground/75">
                      <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/35" />
                      <span className="min-w-0">
                        {written[index]}
                        {pen}
                      </span>
                    </p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
