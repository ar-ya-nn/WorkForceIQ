
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId } from "react";
import AnimatedContent from "./rb/AnimatedContent.jsx";
import CountUp from "./rb/CountUp.jsx";

// Subtle motion only (Apple style): sections fade up, numbers count up (React Bits AnimatedContent / CountUp).

/** Section that slides in when it scrolls into view (React Bits AnimatedContent). */
export function Reveal({
  children,
  delay = 0,
  stagger = 0,
  className = "",
  ...rest
}) {
  return (
    <AnimatedContent
      distance={20}
      duration={0.7}
      ease="power2.out"
      threshold={0.05}
      delay={delay}
      stagger={stagger}
      className={className}
      {...rest}
    >
      {children}
    </AnimatedContent>
  );
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <motion.div
      className="page-header"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </motion.div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  suffix = "",
  decimals,
  icon: Icon,
  tone = "blue",
  hint,
}) {
  return (
    <div className={`card stat tone-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="stat-icon">
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="stat-value">
        {value === null || value === undefined ? (
          <span className="skeleton inline" />
        ) : (
          <CountUp
            to={Number(value)}
            separator=","
            decimals={decimals}
            duration={1.4}
          />
        )}
        {suffix && <span className="stat-suffix">{suffix}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

/** iOS-style segmented control with a sliding white pill. */
export function Segmented({ options, value, onChange, id = "seg" }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        const active = opt.value === value;

        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            className="segment"
            onClick={() => onChange(opt.value)}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className="segment-pill"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="segment-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Centered sheet for forms (Apple style). */
export function Modal({ open, onClose, title, wide = false, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`modal ${wide ? "wide" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="modal-head">
              <h3>{title}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BADGE_TONES = {
  HIGH: "red",
  MEDIUM: "amber",
  LOW: "green",
  ACTIVE: "green",
  EXITED: "grey",
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  PRESENT: "green",
  LATE: "amber",
  ABSENT: "red",
  ON_LEAVE: "violet",
  INSERT: "green",
  UPDATE: "amber",
  DELETE: "red",
  ADMIN: "blue",
  MANAGER: "violet",
  EMPLOYEE: "grey",
  VIEWER: "grey",
};

export function Badge({ value, label }) {
  return (
    <span className={`badge badge-${BADGE_TONES[value] || "grey"}`}>
      <span className="badge-dot" />
      {label ?? String(value).replace("_", " ")}
    </span>
  );
}

export function Skeleton({ height = 16, width = "100%", className = "" }) {
  return <div className={`skeleton ${className}`} style={{ height, width }} />;
}

/** Shimmering placeholder rows while data loads. */
export function Loading({ rows = 5, height = 280 }) {
  if (rows === 0) return <Skeleton height={height} />;

  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          height={22}
          width={`${100 - (i % 3) * 12}%`}
        />
      ))}
    </div>
  );
}

export function ChartLoading() {
  return <Loading rows={0} height={280} />;
}

export function ErrorBox({ message }) {
  return <div className="state error">⚠ {message}</div>;
}

export function Pagination({ total, skip, limit, onChange }) {
  if (!total) return null;

  const page = Math.floor(skip / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="pagination">
      <span className="muted small">
        Showing {skip + 1}–{Math.min(skip + limit, total)} of{" "}
        {total.toLocaleString()}
      </span>
      <div>
        <button
          type="button"
          className="btn ghost"
          disabled={page <= 1}
          onClick={() => onChange(skip - limit)}
        >
          Previous
        </button>
        <span className="muted small page-num">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={page >= pages}
          onClick={() => onChange(skip + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;

    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast toast-${toast.type}`}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Accessible animated drawer with Escape-key support. */
export function Drawer({ open, onClose, title, children }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="drawer-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="drawer-head">
              <h3 id={titleId}>{title}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      {children}
    </label>
  );
}

/** Shared gradient definitions for charts. Put <ChartGradients /> inside any Recharts chart. */
export function ChartGradients() {
  // All gradients are shades of the one accent colour.
  const stops = {
    violet: ["#6f88c6", "#2c4a8c"],
    cyan: ["#8ea3d6", "#4a68b0"],
    pink: ["#7d93cc", "#34559c"],
    red: ["#4a68b0", "#1c2f57"],
    green: ["#d5def2", "#9fb1dc"],
  };

  return (
    <defs>
      {Object.entries(stops).map(([name, [top, bottom]]) => (
        <linearGradient
          key={name}
          id={`grad-${name}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={top} stopOpacity={1} />
          <stop offset="100%" stopColor={bottom} stopOpacity={0.85} />
        </linearGradient>
      ))}

      {Object.entries(stops).map(([name, [top, bottom]]) => (
        <linearGradient
          key={`h-${name}`}
          id={`grad-h-${name}`}
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop offset="0%" stopColor={bottom} stopOpacity={0.85} />
          <stop offset="100%" stopColor={top} stopOpacity={1} />
        </linearGradient>
      ))}

      <linearGradient id="grad-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2c4a8c" stopOpacity={0.2} />
        <stop offset="100%" stopColor="#2c4a8c" stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

const AVATAR_GRADIENTS = [
  ["#6f88c6", "#2c4a8c"],
  ["#8ea3d6", "#4a68b0"],
  ["#5a76b8", "#1c2f57"],
  ["#9fb1dc", "#5a76b8"],
  ["#7d93cc", "#34559c"],
  ["#b3c1e4", "#6f88c6"],
];

/** Coloured circle with initials; the colour is stable for each name. */
export function Avatar({ name = "", size = 34 }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const hash = [...name].reduce(
    (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0,
    7
  );
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(180deg, ${a}, ${b})`,
        fontSize: size * 0.38,
      }}
      aria-label={name || "User avatar"}
    >
      {initials || "?"}
    </span>
  );
}

/** Name cell with avatar, used in every people table. */
export function Person({ name, sub }) {
  return (
    <div className="person">
      <Avatar name={name} />
      <div>
        <div className="person-name">{name}</div>
        {sub && <div className="muted small">{sub}</div>}
      </div>
    </div>
  );
}
