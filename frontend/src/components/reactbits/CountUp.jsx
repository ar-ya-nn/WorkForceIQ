
import { useEffect, useRef, useState } from "react";

/** Counts from `from` to `to` when it scrolls into view. */
export default function CountUp({
  to,
  from = 0,
  duration = 1.5,
  separator = "",
  className = "",
  decimals,
}) {
  const [value, setValue] = useState(from);
  const ref = useRef(null);

  const places =
    decimals ??
    (String(to).includes(".")
      ? Math.min(String(to).split(".")[1].length, 2)
      : 0);

  useEffect(() => {
    const node = ref.current;
    const durationMs = Number(duration) * 1000;
    let frame = null;
    let observer;

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;

    // Skip animation for reduced motion or invalid durations.
    if (
      prefersReducedMotion ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0
    ) {
      setValue(to);
      return;
    }

    let started = false;

    const run = () => {
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / durationMs, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        setValue(from + (to - from) * eased);

        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      };

      frame = requestAnimationFrame(tick);
    };

    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        run();
      }
    });

    if (node) {
      observer.observe(node);
    }

    return () => {
      observer?.disconnect();

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [to, from, duration]);

  const text = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
    useGrouping: Boolean(separator),
  });

  return (
    <span ref={ref} className={className}>
      {separator && separator !== ","
        ? text.replace(/,/g, separator)
        : text}
    </span>
  );
}
