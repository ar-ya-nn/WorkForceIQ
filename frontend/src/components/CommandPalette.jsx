import { CornerDownLeft, Search, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { NAV } from "../nav.js";

/** Ctrl+K / Cmd+K search: jump to any page or open any employee's profile. */
export default function CommandPalette({ open, onClose, onOpenEmployee }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setPeople([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setPeople([]);
      return;
    }
    const t = setTimeout(() => {
      api.get("/users/", { search: query.trim(), limit: 6 })
        .then((d) => setPeople(d.items))
        .catch(() => setPeople([]));
    }, 220);
    return () => clearTimeout(t);
  }, [query, open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV.filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => ({ type: "page", ...n }));
    const users = people.map((u) => ({ type: "user", ...u }));
    return [...users, ...pages];
  }, [query, people]);

  const choose = (item) => {
    if (!item) return;
    if (item.type === "page") navigate(item.to);
    else onOpenEmployee(item.user_id);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="palette"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          >
            <div className="palette-input">
              <Search size={18} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search employees or jump to a page…"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-results">
              {results.length === 0 && <div className="muted small palette-empty">No matches</div>}
              {results.map((item, i) => {
                const Icon = item.type === "page" ? item.icon : User;
                return (
                  <button
                    key={item.type === "page" ? item.to : item.user_id}
                    className={`palette-item ${i === active ? "active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                  >
                    <Icon size={16} />
                    {item.type === "page" ? (
                      <span>{item.label}<span className="muted small"> · page</span></span>
                    ) : (
                      <span>{item.first_name} {item.last_name}<span className="muted small"> · #{item.user_id} · {item.email}</span></span>
                    )}
                    {i === active && <CornerDownLeft size={14} className="palette-enter" />}
                  </button>
                );
              })}
            </div>
            <div className="palette-foot muted small">↑ ↓ to move · Enter to open · type 2+ letters to search people</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
