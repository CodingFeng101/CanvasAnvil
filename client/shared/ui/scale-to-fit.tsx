import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Renders children at a fixed design size, scaled to fit the parent box.
 *
 * For content that can only lay itself out at explicit pixel dimensions -- a
 * slide scene, say -- and therefore cannot be asked to fill an arbitrary
 * container. Pure CSS cannot do this: `scale()` needs a unitless ratio, and
 * `calc(100cqw / 240)` yields a length, so the declaration is simply dropped.
 * Hence the measurement.
 */
export function ScaleToFit({
  width,
  height,
  children,
  className,
}: {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !width || !height) return;

    const measure = (w: number, h: number) => {
      if (!w || !h) return;
      setScale(Math.min(w / width, h / height));
    };

    measure(box.clientWidth, box.clientHeight);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div ref={boxRef} className={cn("absolute inset-0 overflow-hidden", className)}>
      {/* Hidden until measured, so nothing flashes at full size first. */}
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
