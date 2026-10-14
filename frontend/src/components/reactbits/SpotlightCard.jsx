import { useRef } from "react";
import "./SpotlightCard.css";

/** Card with a soft light that follows the mouse. Props match React Bits' SpotlightCard. */
export default function SpotlightCard({ children, className = "", spotlightColor = "rgba(124, 92, 255, 0.18)" }) {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    ref.current.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    ref.current.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div ref={ref} onMouseMove={handleMouseMove} className={`card-spotlight ${className}`}>
      {children}
    </div>
  );
}
