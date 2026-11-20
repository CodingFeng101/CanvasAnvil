import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Send once the next render has landed: an example prompt is put in the
 * input and sent straight away, by the panel's own send (which reads the
 * input from state, so it has to run after that state has updated).
 */
export function useSendAfterRender(send: () => void) {
  const [tick, setTick] = useState(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (tick) sendRef.current();
  }, [tick]);
  return useCallback(() => setTick((t) => t + 1), []);
}
