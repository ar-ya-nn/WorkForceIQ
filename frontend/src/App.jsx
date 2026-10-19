import { Command, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useApi } from "./api.js";
import CommandPalette from "./components/CommandPalette.jsx";
import EmployeeDrawer from "./components/EmployeeDrawer.jsx";
import ClickSpark from "./components/rb/ClickSpark.jsx";
import ShinyText from "./components/rb/ShinyText.jsx";
import { NAV } from "./nav.js";
import AtRisk from "./pages/AtRisk.jsx";
import Attendance from "./pages/Attendance.jsx";
import Audit from "./pages/Audit.jsx";
import Employees from "./pages/Employees.jsx";
import Leave from "./pages/Leave.jsx";
import Model from "./pages/Model.jsx";
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

function Sidebar() {
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
        {NAV.map(({ to, label, icon: Icon }) => (
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
      <ApiStatus />
    </aside>
  );
}

function TopBar({ onSearch }) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return (
    <header className="topbar">
      <button className="search-trigger" onClick={onSearch}>
        <Search size={16} />
        <span>Search employees, pages…</span>
        <kbd>{isMac ? <Command size={12} /> : "Ctrl"} K</kbd>
      </button>
      <div className="topbar-right muted small">{today}</div>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* CSS glow instead of the WebGL Aurora: the shader rendered white on some
          browser/GPU combinations (e.g. Opera GX), which washed out the whole page. */}
      <div className="glow-bg" aria-hidden="true">
        <span className="glow glow-1" />
        <span className="glow glow-2" />
        <span className="glow glow-3" />
      </div>
      <div className="bg-grid" aria-hidden="true" />
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
                <Route path="/" element={<Overview />} />
                <Route path="/at-risk" element={<AtRisk />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/leave" element={<Leave />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/model" element={<Model />} />
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
