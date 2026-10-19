import { BrainCircuit, CalendarCheck, CalendarDays, History, LayoutDashboard, TriangleAlert, Users } from "lucide-react";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/at-risk", label: "Attrition Risk", icon: TriangleAlert },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/audit", label: "Audit Log", icon: History },
  { to: "/model", label: "ML Model", icon: BrainCircuit },
];
