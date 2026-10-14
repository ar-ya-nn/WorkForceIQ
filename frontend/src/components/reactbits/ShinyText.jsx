import "./ShinyText.css";

/** Text with a light sweeping across it. Props match React Bits' ShinyText. */
export default function ShinyText({ text, disabled = false, speed = 5, className = "" }) {
  return (
    <span className={`shiny-text ${disabled ? "disabled" : ""} ${className}`} style={{ animationDuration: `${speed}s` }}>
      {text}
    </span>
  );
}
