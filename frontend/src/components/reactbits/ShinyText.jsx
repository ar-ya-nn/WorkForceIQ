
import "./ShinyText.css";

/** Text with a light sweeping across it. Props match React Bits' ShinyText. */
export default function ShinyText({
  text,
  disabled = false,
  speed = 5,
  className = "",
}) {
  const parsedSpeed = Number(speed);
  const safeSpeed =
    Number.isFinite(parsedSpeed) && parsedSpeed > 0
      ? parsedSpeed
      : 5;

  return (
    <span
      className={`shiny-text ${disabled ? "disabled" : ""} ${className}`}
      style={{ animationDuration: `${safeSpeed}s` }}
    >
      {text}
    </span>
  );
}
