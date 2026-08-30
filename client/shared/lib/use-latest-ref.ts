import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Keeps a ref pointing at the newest value.
 *
 * For long-lived effects — an event listener registered once on mount, a
 * timer, a subscription — that need the current value of something without
 * re-registering when it changes. Adding the value to the dependency array
 * would tear the subscription down and rebuild it on every change, which for
 * these is worse than the staleness it fixes.
 *
 * Read it as `ref.current` inside the callback, never during render.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
