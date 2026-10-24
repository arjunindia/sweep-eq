// useFrameCoalesced — keep at most one update per animation frame, and flush
// the latest value synchronously when a gesture ends. Gesture handlers can
// fire faster than the display refresh; this caps the React/store work while
// preserving the final position exactly.
import { useCallback, useEffect, useRef } from "react";

export function useFrameCoalesced<T>(fn: (value: T) => void) {
  const cb = useRef(fn);
  useEffect(() => {
    cb.current = fn;
  }, [fn]);

  const rafId = useRef<number | null>(null);
  const pending = useRef<{ value: T } | null>(null);

  const emit = useCallback((value: T) => {
    pending.current = { value };
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const p = pending.current;
      pending.current = null;
      if (p) cb.current(p.value);
    });
  }, []);

  const flush = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (p) cb.current(p.value);
  }, []);

  useEffect(
    () => () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    },
    []
  );

  return { emit, flush };
}
