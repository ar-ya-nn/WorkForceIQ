import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import AnimatedContent from "./rb/AnimatedContent.jsx";
import BlurText from "./rb/BlurText.jsx";
import CountUp from "./rb/CountUp.jsx";
import SpotlightCard from "./rb/SpotlightCard.jsx";

// Official React Bits components live in ./rb (copied from reactbits.dev, unmodified).
// The helpers below just give them consistent settings across the dashboard.

const GLASS = {
  "--spotlight-card-surface": "rgba(15, 17, 26, 0.86)",
  "--spotlight-card-border": "rgba(255, 255, 255, 0.08)",
  "--spotlight-card-shadow": "0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 50px -20px rgba(0,0,0,0.6)",
};

const TONE_HEX = {
  violet: "#a78bfa", green: "#34d399", red: "#fb7185",
  amber: "#fbbf24", cyan: "#22d3ee", pink: "#f472b6",
};

/** Section that slides in when it scrolls into view (React Bits AnimatedContent). */
export function Reveal({ children, delay = 0, stagger = 0, className = "", ...rest }) {
  return (
    <AnimatedContent
      distance={32}
      duration={0.75}
      ease="power3.out"
      blur={4}
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
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="page-title" role="heading" aria-level={1}>
          <BlurText text={title} delay={90} direction="bottom" stepDuration={0.4} trigger="load" />
        </div>
        {subtitle && (
          <motion.p className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            {subtitle}
          </motion.p>
        )}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <SpotlightCard className={`panel ${className}`} style={GLASS} spotlightColor="#c4b5fd" intensity={0.12} borderGlow={0.5} spotlightSize={320}>
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
    </SpotlightCard>
  );
}

export function StatCard({ label, value, suffix = "", decimals, icon: Icon, tone = "violet", hint }) {
  return (
    <SpotlightCard
      className={`stat tone-${tone}`}
      style={GLASS}
      spotlightColor={TONE_HEX[tone]}
      intensity={0.2}
      borderGlow={0.8}
      spotlightSize={200}
    >
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon"><Icon size={17} /></span>}
      </div>
      <div className="stat-value">
        {value === null || value === undefined
          ? <span className="skeleton inline" />
          : <CountUp to={Number(value)} separator="," decimals={decimals} duration={1.6} mode="roll" />}
        {suffix && <span className="stat-suffix">{suffix}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
      <div className="stat-glow" />
    </SpotlightCard>
  );
}

const BADGE_TONES = {
  HIGH: "red", MEDIUM: "amber", LOW: "green",
  ACTIVE: "green", EXITED: "grey",
  PENDING: "amber", APPROVED: "green", REJECTED: "red",
  PRESENT: "green", LATE: "amber", ABSENT: "red", ON_LEAVE: "violet",
  INSERT: "green", UPDATE: "amber", DELETE: "red",
};

export function Badge({ value }) {
  return (
    <span className={`badge badge-${BADGE_TONES[value] || "grey"}`}>
      <span className="badge-dot" />
      {String(value).replace("_", " ")}
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
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={22} width={`${100 - (i % 3) * 12}%`} />)}
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
        Showing {skip + 1}–{Math.min(skip + limit, total)} of {total.toLocaleString()}
      </span>
      <div>
        <button className="btn ghost" disabled={page <= 1} onClick={() => onChange(skip - limit)}>Previous</button>
        <span className="muted small page-num">{page} / {pages}</span>
        <button className="btn ghost" disabled={page >= pages} onClick={() => onChange(skip + limit)}>Next</button>
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
    <AnimatePresence>
      {toast && (
        <motion.div
          className={`toast toast-${toast.type}`}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
        >
          <span>{toast.message}</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="drawer-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.aside
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="drawer-head">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={onClose}><X size={18} /></button>
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
  const stops = {
    violet: ["#a78bfa", "#6d28d9"],
    cyan: ["#67e8f9", "#0891b2"],
    pink: ["#f9a8d4", "#be185d"],
    red: ["#fda4af", "#e11d48"],
    green: ["#6ee7b7", "#059669"],
  };
  return (
    <defs>
      {Object.entries(stops).map(([name, [top, bottom]]) => (
        <linearGradient key={name} id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} stopOpacity={1} />
          <stop offset="100%" stopColor={bottom} stopOpacity={0.85} />
        </linearGradient>
      ))}
      {Object.entries(stops).map(([name, [top, bottom]]) => (
        <linearGradient key={`h-${name}`} id={`grad-h-${name}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={bottom} stopOpacity={0.85} />
          <stop offset="100%" stopColor={top} stopOpacity={1} />
        </linearGradient>
      ))}
      <linearGradient id="grad-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

const AVATAR_GRADIENTS = [
  ["#a78bfa", "#6d28d9"], ["#22d3ee", "#0e7490"], ["#f472b6", "#9d174d"],
  ["#34d399", "#047857"], ["#fbbf24", "#b45309"], ["#fb7185", "#be123c"],
];

/** Coloured circle with initials; the colour is stable for each name. */
export function Avatar({ name = "", size = 34 }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.38 }}>
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
