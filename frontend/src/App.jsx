import { Command, LogOut, Search, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useApi } from "./api.js";
import { ROLE_LABEL, hasRole, useAuth } from "./auth.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import EmployeeDrawer from "./components/EmployeeDrawer.jsx";
import { Avatar } from "./components/ui.jsx";
import ClickSpark from "./components/rb/ClickSpark.jsx";
import ShinyText from "./components/rb/ShinyText.jsx";
import { NAV, navFor } from "./nav.js";
import AtRisk from "./pages/AtRisk.jsx";
import Attendance from "./pages/Attendance.jsx";
import Audit from "./pages/Audit.jsx";
import Employees from "./pages/Employees.jsx";
import Leave from "./pages/Leave.jsx";
import Login from "./pages/Login.jsx";
import Model from "./pages/Model.jsx";
import MySpace from "./pages/MySpace.jsx";
import Overview from "./pages/Overview.jsx";

function ApiStatus() {
  const { data, error } = useApi("/health");
  const ok = data?.status === "healthy" && !error;
  return (
    <div className={`api-status ${ok ? "ok" : "down"}`}>
      <span className="pulse" />
      {ok ? "Database connected" : "API offline"}
    </div>
  );
}

function UserCard() {
  const { user, logout } = useAuth();
  return (
    <div className="user-card">
      <Avatar name={user.name} size={36} />
      <div className="user-card-text">
        <div className="person-name">{user.name}</div>
        <div className="muted small">{ROLE_LABEL[user.role]}{user.department_name ? ` · ${user.department_name}` : ""}</div>
      </div>
      <button className="icon-btn" title="Sign out" onClick={logout}><LogOut size={17} /></button>
    </div>
  );
}

function Sidebar() {
  const { user } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">W</div>
        <div>
          <ShinyText text="WorkForceIQ" color="#cfd2ff" shineColor="#ffffff" speed={3} glow={0.3} className="brand-name" />
          <div className="brand-sub">HR Analytics</div>
        </div>
      </div>
      <div className="nav-label">Menu</div>
      <nav>
        {navFor(user).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="nav-link">
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="nav-active" className="nav-active" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <Icon size={18} className="nav-icon" />
                <span className="nav-text">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <UserCard />
      <ApiStatus />
    </aside>
  );
}

function TopBar({ onSearch }) {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return (
    <header className="topbar">
      <button className="search-trigger" onClick={onSearch}>
        <Search size={16} />
        <span>{user.role === "EMPLOYEE" ? "Jump to a page…" : "Search employees, pages…"}</span>
        <kbd>{isMac ? <Command size={12} /> : "Ctrl"} K</kbd>
      </button>
      <div className="topbar-right muted small">{today}</div>
    </header>
  );
}

/** Shows the page only if the logged-in role may see it (the API checks again on every request). */
function Guard({ path, children }) {
  const { user } = useAuth();
  const item = NAV.find((n) => n.to === path);
  if (item && !hasRole(user, item.roles)) {
    return (
      <div className="state no-access">
        <ShieldAlert size={28} />
        <h3>You don't have access to this page</h3>
        <p className="muted">Your role ({ROLE_LABEL[user.role]}) can't view it.</p>
      </div>
    );
  }
  return children;
}

const PAGES = {
  "/": Overview, "/me": MySpace, "/at-risk": AtRisk, "/employees": Employees,
  "/leave": Leave, "/attendance": Attendance, "/audit": Audit, "/model": Model,
};

function Splash() {
  return <div className="splash"><div className="brand-mark">W</div></div>;
}

export default function App() {
  const { user, checking } = useAuth();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  const background = (
    <div className="glow-bg" aria-hidden="true">
      <span className="glow glow-1" />
      <span className="glow glow-2" />
      <span className="glow glow-3" />
      <span className="glow glow-core" />
    </div>
  );

  if (checking) return <>{background}<Splash /></>;
  if (!user) return <>{background}<Login /></>;

  const home = user.role === "EMPLOYEE" ? "/me" : "/";

  return (
    <>
      {background}
      <ClickSpark sparkColor={["#a78bfa", "#22d3ee", "#f472b6"]} sparkCount={10} sparkRadius={26} sparkSize={12} glow={0.4}>
      <div className="layout">
        <Sidebar />
        <div className="main">
          <TopBar onSearch={() => setPaletteOpen(true)} />
          <AnimatePresence mode="wait">
            <motion.main
              key={location.pathname}
              className="content"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <Routes location={location}>
                {Object.entries(PAGES).map(([path, Page]) => (
                  <Route
                    key={path}
                    path={path}
                    element={path === "/" && user.role === "EMPLOYEE"
                      ? <Navigate to={home} replace />
                      : <Guard path={path}><Page /></Guard>}
                  />
                ))}
                <Route path="*" element={<Navigate to={home} replace />} />
              </Routes>
            </motion.main>
          </AnimatePresence>
        </div>
      </div>
      </ClickSpark>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenEmployee={setEmployeeId} />
      <EmployeeDrawer userId={employeeId} onClose={() => setEmployeeId(null)} />
    </>
  );
}
