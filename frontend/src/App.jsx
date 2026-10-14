import { Activity, BrainCircuit, CalendarCheck, CalendarDays, History, LayoutDashboard, TriangleAlert, Users } from "lucide-react";
import { NavLink, Route, Routes } from "react-router-dom";
import ShinyText from "./components/reactbits/ShinyText.jsx";
import { useApi } from "./api.js";
import AtRisk from "./pages/AtRisk.jsx";
import Attendance from "./pages/Attendance.jsx";
import Audit from "./pages/Audit.jsx";
import Employees from "./pages/Employees.jsx";
import Leave from "./pages/Leave.jsx";
import Model from "./pages/Model.jsx";
import Overview from "./pages/Overview.jsx";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/at-risk", label: "Attrition Risk", icon: TriangleAlert },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/audit", label: "Audit Log", icon: History },
  { to: "/model", label: "ML Model", icon: BrainCircuit },
];

function ApiStatus() {
  const { data, error } = useApi("/health");
  const ok = data?.status === "healthy" && !error;
  return (
    <div className={`api-status ${ok ? "ok" : "down"}`}>
      <Activity size={14} />
      {ok ? "API connected" : "API offline"}
    </div>
  );
}

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <ShinyText text="WorkForceIQ" speed={4} className="brand-name" />
        </div>
        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <ApiStatus />
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/at-risk" element={<AtRisk />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/model" element={<Model />} />
        </Routes>
      </main>
    </div>
  );
}
