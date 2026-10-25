import { BrainCircuit, CalendarCheck, CalendarDays, History, LayoutDashboard, Settings2, TriangleAlert, UserRound, Users } from "lucide-react";

const ALL = ["ADMIN", "MANAGER", "EMPLOYEE"];
const STAFF = ["ADMIN", "MANAGER"];

/** Sidebar items and who may see them. The API enforces the same rules. */
export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, roles: STAFF },
  { to: "/me", label: "My Space", icon: UserRound, roles: ALL },
  { to: "/at-risk", label: "Attrition Risk", icon: TriangleAlert, roles: STAFF },
  { to: "/employees", label: "Employees", icon: Users, roles: STAFF },
  { to: "/leave", label: "Leave", icon: CalendarDays, roles: STAFF },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: STAFF },
  { to: "/audit", label: "Audit Log", icon: History, roles: ["ADMIN"] },
  { to: "/model", label: "ML Model", icon: BrainCircuit, roles: STAFF },
  { to: "/admin", label: "Administration", icon: Settings2, roles: ["ADMIN"] },
];

export const navFor = (user) => NAV.filter((n) => user && n.roles.includes(user.role));

// sessionStorage key for the current page (the address bar never shows it)
export const PAGE_KEY = "wfiq_page";
