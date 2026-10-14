import { X } from "lucide-react";
import { useEffect } from "react";
import GradientText from "./reactbits/GradientText.jsx";
import SpotlightCard from "./reactbits/SpotlightCard.jsx";
import CountUp from "./reactbits/CountUp.jsx";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <GradientText colors={["#a78bfa", "#22d3ee", "#a78bfa", "#22d3ee", "#a78bfa"]} animationSpeed={6} className="page-title">
          {title}
        </GradientText>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <SpotlightCard className={className}>
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

export function StatCard({ label, value, suffix = "", decimals, icon: Icon, tone = "violet" }) {
  return (
    <SpotlightCard className={`stat tone-${tone}`}>
      <div className="stat-top">
        <span className="muted small">{label}</span>
        {Icon && <Icon size={18} className="stat-icon" />}
      </div>
      <div className="stat-value">
        {value === null || value === undefined ? "—" : <CountUp to={Number(value)} separator="," decimals={decimals} duration={1.4} />}
        {suffix && <span className="stat-suffix">{suffix}</span>}
      </div>
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
  return <span className={`badge badge-${BADGE_TONES[value] || "grey"}`}>{String(value).replace("_", " ")}</span>;
}

export function Loading() {
  return <div className="state muted">Loading…</div>;
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
        {skip + 1}–{Math.min(skip + limit, total)} of {total.toLocaleString()}
      </span>
      <div>
        <button className="btn ghost" disabled={page <= 1} onClick={() => onChange(skip - limit)}>Previous</button>
        <span className="muted small page-num">Page {page} / {pages}</span>
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
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span>{toast.message}</span>
      <button className="icon-btn" onClick={onClose}><X size={16} /></button>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
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
