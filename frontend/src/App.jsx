import { Command, LogOut, Search, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ROLE_LABEL, hasRole, useAuth } from "./auth.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import EmployeeDrawer from "./components/EmployeeDrawer.jsx";
import { Avatar } from "./components/ui.jsx";
import { NAV, PAGE_KEY, navFor } from "./nav.js";
import Admin from "./pages/Admin.jsx";
import AtRisk from "./pages/AtRisk.jsx";
import Attendance from "./pages/Attendance.jsx";
import Audit from "./pages/Audit.jsx";
import Employees from "./pages/Employees.jsx";
import Leave from "./pages/Leave.jsx";
import Login from "./pages/Login.jsx";
import Model from "./pages/Model.jsx";
import MySpace from "./pages/MySpace.jsx";
import Overview from "./pages/Overview.jsx";

const PAGES = {
  "/": Overview, "/me": MySpace, "/at-risk": AtRisk, "/employees": Employees, "/leave": Leave,
  "/attendance": Attendance, "/audit": Audit, "/model": Model, "/admin": Admin,
};

function UserCard() {
  const { user, logout } = useAuth();
  return (
    <div className="user-card">
      <Avatar name={user.name} size={34} />
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
        <img src="/logo.svg" alt="" className="brand-logo" />
        <div>
          <div className="brand-name">WorkForceIQ</div>
          <div className="brand-sub">Workforce analytics</div>
        </div>
      </div>
      <nav>
        {navFor(user).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="nav-link">
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="nav-active" className="nav-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                )}
                <Icon size={18} className="nav-icon" />
                <span className="nav-text">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <UserCard />
    </aside>
  );
}

function TopBar({ onSearch }) {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return (
    <header className="topbar">
      <button className="search-trigger" onClick={onSearch}>
        <Search size={15} />
        <span>{["ADMIN", "MANAGER"].includes(user.role) ? "Search" : "Go to…"}</span>
        <kbd>{isMac ? <Command size={11} /> : "Ctrl"} K</kbd>
      </button>
      <div className="topbar-right">{today}</div>
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

export default function App() {
  const { user, checking } = useAuth();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);

  const navigate = useNavigate();
  const fromBackButton = useRef(false);

  // remember the current page for this tab (the address bar itself never changes)
  useEffect(() => {
    sessionStorage.setItem(PAGE_KEY, location.pathname);
  }, [location.pathname]);

  // Back / Forward buttons: each page visit gets a browser history entry whose URL stays "/",
  // with the page kept in the entry's state. Pressing Back brings that page back.
  useEffect(() => {
    const onPopState = (e) => {
      const page = e.state?.wfiqPage;
      if (page) {
        fromBackButton.current = true;
        navigate(page);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  useEffect(() => {
    if (fromBackButton.current) {            // we got here BY pressing back/forward: don't add another entry
      fromBackButton.current = false;
      return;
    }
    const current = window.history.state?.wfiqPage;
    if (current === location.pathname) return;
    if (current === undefined) window.history.replaceState({ wfiqPage: location.pathname }, "", "/");
    else window.history.pushState({ wfiqPage: location.pathname }, "", "/");
  }, [location.pathname]);

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

  if (checking) return <div className="splash"><img src="/logo.svg" alt="WorkForceIQ" className="brand-logo splash-logo" /></div>;
  if (!user) return <Login />;

  const home = user.role === "EMPLOYEE" ? "/me" : "/";

  return (
    <>
      <div className="layout">
        <Sidebar />
        <div className="main">
          <TopBar onSearch={() => setPaletteOpen(true)} />
          <AnimatePresence mode="wait">
            <motion.main
              key={location.pathname}
              className="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenEmployee={setEmployeeId} />
      <EmployeeDrawer userId={employeeId} onClose={() => setEmployeeId(null)} />
    </>
  );
}
