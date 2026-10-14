import { CalendarClock, Clock, Wallet, TrendingDown, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../api.js";
import { Card, ErrorBox, Loading, PageHeader, StatCard } from "../components/ui.jsx";
import { COLORS, axisProps, tooltipProps } from "./chartTheme.js";

const FACTORS = {
  overtime: "Overtime",
  job_satisfaction: "Job satisfaction",
  work_life_balance: "Work-life balance",
  environment_satisfaction: "Environment satisfaction",
  job_level: "Job level",
  business_travel: "Business travel",
  marital_status: "Marital status",
  stock_option_level: "Stock option level",
};
const SCALE = { 1: "Low", 2: "Medium", 3: "High", 4: "Very high" };
const RISK_COLORS = { HIGH: COLORS.red, MEDIUM: COLORS.amber, LOW: COLORS.green };

function factorLabel(factor, value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (factor.includes("satisfaction") || factor === "work_life_balance") return SCALE[value] ?? value;
  if (factor === "job_level") return `Level ${value}`;
  return String(value).replace("_", " ");
}

export default function Overview() {
  const overview = useApi("/analytics/overview");
  const departments = useApi("/analytics/departments");
  const jobRoles = useApi("/analytics/attrition/job-role");
  const risk = useApi("/predictions/summary");
  const [factor, setFactor] = useState("overtime");
  const byFactor = useApi(`/analytics/attrition/by/${factor}`);

  const o = overview.data;
  const riskData = ["HIGH", "MEDIUM", "LOW"]
    .map((level) => risk.data?.overall.find((r) => r.risk_level === level))
    .filter(Boolean)
    .map((r) => ({ name: r.risk_level, value: r.employees }));

  return (
    <>
      <PageHeader title="Workforce Overview" subtitle="Live numbers from the WorkForceIQ database" />

      {overview.error && <ErrorBox message={overview.error} />}
      <div className="grid stats">
        <StatCard label="Total employees" value={o?.total_employees} icon={Users} />
        <StatCard label="Active employees" value={o?.active_employees} icon={UserCheck} tone="green" />
        <StatCard label="Attrition rate" value={o?.attrition_rate_pct} suffix="%" decimals={1} icon={TrendingDown} tone="red" />
        <StatCard label="Work overtime" value={o?.overtime_pct} suffix="%" decimals={1} icon={Clock} tone="amber" />
        <StatCard label="Avg monthly income" value={o?.avg_monthly_income} decimals={0} icon={Wallet} tone="cyan" />
        <StatCard label="Pending leave" value={o?.pending_leave_requests} icon={CalendarClock} tone="violet" />
      </div>

      <div className="grid two">
        <Card title="Attrition by department" subtitle="% of employees who left">
          {departments.loading ? <Loading /> : departments.error ? <ErrorBox message={departments.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={departments.data.map((d) => ({ ...d, attrition_rate_pct: Number(d.attrition_rate_pct) }))}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="department_name" {...axisProps} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip {...tooltipProps} formatter={(v) => [`${v}%`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill={COLORS.violet} radius={[8, 8, 0, 0]} maxBarSize={70} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Current attrition risk" subtitle="ML predictions for active employees">
          {risk.loading ? <Loading /> : risk.error ? <ErrorBox message={risk.error} /> : (
            <div className="pie-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3} stroke="none">
                    {riskData.map((r) => <Cell key={r.name} fill={RISK_COLORS[r.name]} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {riskData.map((r) => (
                  <div key={r.name}><span className="dot" style={{ background: RISK_COLORS[r.name] }} />{r.name} <strong>{r.value}</strong></div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid two">
        <Card
          title="What drives attrition?"
          subtitle="Attrition rate grouped by one HR factor"
          actions={
            <select value={factor} onChange={(e) => setFactor(e.target.value)}>
              {Object.entries(FACTORS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          }
        >
          {byFactor.loading ? <Loading /> : byFactor.error ? <ErrorBox message={byFactor.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byFactor.data.groups.map((g) => ({ ...g, label: factorLabel(factor, g.value), attrition_rate_pct: Number(g.attrition_rate_pct) }))}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v}% (${p.payload.employees_left} of ${p.payload.total_employees})`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill={COLORS.cyan} radius={[8, 8, 0, 0]} maxBarSize={70} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Attrition by job role" subtitle="Highest first">
          {jobRoles.loading ? <Loading /> : jobRoles.error ? <ErrorBox message={jobRoles.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart layout="vertical" data={jobRoles.data.map((j) => ({ ...j, attrition_rate_pct: Number(j.attrition_rate_pct) }))} margin={{ left: 40 }}>
                <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                <XAxis type="number" {...axisProps} unit="%" />
                <YAxis type="category" dataKey="job_role" {...axisProps} width={150} />
                <Tooltip {...tooltipProps} formatter={(v) => [`${v}%`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill={COLORS.red} radius={[0, 8, 8, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
}
