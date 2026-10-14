import { useEffect, useRef, useState } from "react";

/** Counts from `from` to `to` when it scrolls into view. Props match React Bits' CountUp. */
export default function CountUp({ to, from = 0, duration = 1.5, separator = "", className = "", decimals }) {
  const [value, setValue] = useState(from);
  const ref = useRef(null);
  const places = decimals ?? (String(to).includes(".") ? Math.min(String(to).split(".")[1].length, 2) : 0);

  useEffect(() => {
    const node = ref.current;
    let frame;
    let started = false;

    const run = () => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / (duration * 1000), 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(from + (to - from) * eased);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        run();
      }
    });
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, from, duration]);

  const text = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
    useGrouping: Boolean(separator),
  });

  return (
    <span ref={ref} className={className}>
      {separator && separator !== "," ? text.replace(/,/g, separator) : text}
    </span>
  );
}
