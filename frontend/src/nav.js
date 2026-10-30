import { BrainCircuit, CalendarCheck, CalendarDays, History, LayoutDashboard, Settings2, TriangleAlert, UserRound, Users } from "lucide-react";

const PEOPLE = ["ADMIN", "MANAGER", "EMPLOYEE"];          // roles with personal HR records
const INSIGHTS = ["ADMIN", "MANAGER", "VIEWER"];          // organisation-wide insights (viewers included)
const STAFF = ["ADMIN", "MANAGER"];

/** Sidebar items and who may see them. The API enforces the same rules. */
export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, roles: INSIGHTS },
  { to: "/me", label: "My Space", icon: UserRound, roles: PEOPLE },
  { to: "/at-risk", label: "Attrition Risk", icon: TriangleAlert, roles: INSIGHTS },
  { to: "/employees", label: "Employees", icon: Users, roles: STAFF },
  { to: "/leave", label: "Leave", icon: CalendarDays, roles: STAFF },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: STAFF },
  { to: "/audit", label: "Audit Log", icon: History, roles: ["ADMIN"] },
  { to: "/model", label: "ML Model", icon: BrainCircuit, roles: INSIGHTS },
  { to: "/admin", label: "Administration", icon: Settings2, roles: ["ADMIN"] },
];

export const navFor = (user) => NAV.filter((n) => user && n.roles.includes(user.role));

// sessionStorage key for the current page (the address bar never shows it)
export const PAGE_KEY = "wfiq_page";
