import { ArrowRight, CalendarClock, Clock, ShieldAlert, Sparkles, TrendingDown, UserCheck, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis,
  RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useApi } from "../api.js";
import AnimatedContent from "../components/rb/AnimatedContent.jsx";
import CountUp from "../components/rb/CountUp.jsx";
import { Card, ChartGradients, ChartLoading, ErrorBox, Reveal, StatCard } from "../components/ui.jsx";
import { COLORS, axisProps, tooltipProps } from "./chartTheme.js";

const FACTORS = {
  overtime: "Overtime",
  gender: "Gender",
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Turns the raw numbers into plain-English findings for the hero. */
function buildInsights({ overtime, departments, risk, jobRoles }) {
  const insights = [];
  const groups = overtime?.groups ?? [];
  const yes = groups.find((g) => g.value === true);
  const no = groups.find((g) => g.value === false);
  if (yes && no && Number(no.attrition_rate_pct) > 0) {
    const ratio = Number(yes.attrition_rate_pct) / Number(no.attrition_rate_pct);
    insights.push({ tone: "red", text: `Employees on overtime leave ${ratio.toFixed(1)}× more often` });
  }
  if (departments?.length) {
    const worst = [...departments].sort((a, b) => b.attrition_rate_pct - a.attrition_rate_pct)[0];
    insights.push({ tone: "amber", text: `${worst.department_name} has the highest attrition at ${Number(worst.attrition_rate_pct).toFixed(1)}%` });
  }
  const high = risk?.overall?.find((r) => r.risk_level === "HIGH");
  if (high) insights.push({ tone: "violet", text: `${high.employees} active employees flagged as high risk by the model` });
  if (jobRoles?.length) {
    const top = jobRoles[0];
    insights.push({ tone: "cyan", text: `${top.job_role}s churn the most (${Number(top.attrition_rate_pct).toFixed(1)}%)` });
  }
  return insights;
}

/** Men vs women at a glance: past attrition and current predicted risk, in plain words. */
function GenderCard() {
  const actual = useApi("/analytics/attrition/by/gender");
  const risk = useApi("/predictions/breakdown", { by: "gender" });
  const groups = (actual.data?.groups ?? []).map((g) => {
    const r = risk.data?.groups.find((x) => x.grp === g.value);
    return { ...g, high: r?.high, avgRisk: r?.avg_risk_pct, now: r?.employees };
  });
  const sorted = [...groups].sort((a, b) => b.attrition_rate_pct - a.attrition_rate_pct);
  const lead = sorted.length === 2
    ? (Math.abs(sorted[0].attrition_rate_pct - sorted[1].attrition_rate_pct) < 1
        ? "Men and women have left at about the same rate."
        : `${sorted[0].value === "Male" ? "Men" : "Women"} have left slightly more often than ${sorted[1].value === "Male" ? "men" : "women"}.`)
    : null;

  return (
    <Card title="Attrition by gender" subtitle="Who left in the past, and who the model thinks may leave now.">
      {actual.loading || risk.loading ? <ChartLoading /> : actual.error ? <ErrorBox message={actual.error} /> : (
        <>
          {lead && <p className="narrative"><strong>{lead}</strong> Differences describe the data, not a cause.</p>}
          <div className="compare-groups" style={{ marginBottom: 0 }}>
            {groups.map((g) => (
              <div key={g.value} className="compare-group">
                <div className="compare-group-name">{g.value === "Male" ? "Men" : g.value === "Female" ? "Women" : g.value}</div>
                <div className="compare-group-risk">{Number(g.attrition_rate_pct).toFixed(1)}%</div>
                <div className="muted small">left in the past ({g.employees_left} of {g.total_employees})</div>
                {g.high != null && <div className="compare-row"><span>Likely to leave now</span><strong className="red">{g.high} of {g.now}</strong></div>}
                {risk.error && <div className="compare-row"><span className="muted small">Run update_v2.sql to see current risk by gender.</span></div>}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Insight briefing: plain-language sentences built by rules from live SQL results and the ML model (backend/app/briefing.py). */
function Briefing() {
  const b = useApi("/analytics/briefing");
  const navigate = useNavigate();
  if (b.loading) return <Card><ChartLoading /></Card>;
  if (b.error) return <ErrorBox message={b.error} />;
  const x = b.data;
  const Section = ({ title, children }) => <div className="brief-section"><h4>{title}</h4>{children}</div>;
  const Item = ({ item }) => (
    <li>
      <span>{item.text}</span>
      {item.link && <button className="btn ghost small" onClick={() => navigate(item.link)}>{item.cta} <ArrowRight size={14} /></button>}
    </li>
  );
  return (
    <Card className="briefing">
      <div className="brief-head">
        <span className="brief-badge"><Sparkles size={14} /> Insight briefing</span>
        <span className="muted small">Updated {new Date(x.generated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <h2 className="brief-headline">{x.headline}</h2>
      {x.big_picture.map((t) => <p key={t} className="brief-lead">{t}</p>)}
      <div className="brief-grid">
        {x.drivers.length > 0 && (
          <Section title="What's driving it">
            <ul className="brief-list">{x.drivers.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
          </Section>
        )}
        {(x.focus.length > 0 || x.todos.length > 0) && (
          <Section title="Where to look next">
            <ul className="brief-list">
              {[...x.focus, ...x.todos].map((item) => <Item key={item.text} item={item} />)}
            </ul>
          </Section>
        )}
      </div>
      <p className="xai-note">{x.basis}</p>
    </Card>
  );
}

function RetentionGauge({ attrition }) {
  const retention = attrition === undefined ? 0 : 100 - Number(attrition);
  return (
    <div className="gauge">
      <ResponsiveContainer width="100%" height={210}>
        <RadialBarChart innerRadius="76%" outerRadius="100%" data={[{ value: retention }]} startAngle={220} endAngle={-40}>
          <defs>
            <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8ea3d6" />
              <stop offset="100%" stopColor="#2c4a8c" />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={20} fill="url(#gauge-grad)" background={{ fill: "rgba(120,120,128,0.12)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="gauge-center">
        <div className="gauge-value">{attrition === undefined ? "—" : <CountUp to={retention} decimals={1} duration={1.8} trigger="load" />}<span>%</span></div>
        <div className="muted small">retention rate</div>
      </div>
    </div>
  );
}

export default function Overview() {
  const overview = useApi("/analytics/overview");
  const departments = useApi("/analytics/departments");
  const jobRoles = useApi("/analytics/attrition/job-role");
  const risk = useApi("/predictions/summary");
  const overtime = useApi("/analytics/attrition/by/overtime");
  const trend = useApi("/analytics/attendance-trend");
  const [factor, setFactor] = useState("overtime");
  const [showNumbers, setShowNumbers] = useState(false);
  const byFactor = useApi(`/analytics/attrition/by/${factor}`);

  const o = overview.data;
  const insights = buildInsights({ overtime: overtime.data, departments: departments.data, risk: risk.data, jobRoles: jobRoles.data });
  const riskData = ["HIGH", "MEDIUM", "LOW"]
    .map((level) => risk.data?.overall.find((r) => r.risk_level === level))
    .filter(Boolean)
    .map((r) => ({ name: r.risk_level, value: r.employees }));
  const riskTotal = riskData.reduce((s, r) => s + r.value, 0);
  const trendData = (trend.data ?? []).map((d) => ({
    ...d,
    attendance_rate_pct: Number(d.attendance_rate_pct),
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  }));
  const trendMin = trendData.length ? Math.floor(Math.min(...trendData.map((d) => d.attendance_rate_pct)) - 2) : 80;

  return (
    <>
      {/* ---------- hero ---------- */}
      <AnimatedContent trigger="mount" distance={20} duration={0.8} className="hero">
        <div className="hero-text">
          <div className="eyebrow"><Sparkles size={14} /> {greeting()}</div>
          <h1 className="hero-title">
            Your workforce.<br />
            <span className="hero-title-2">At a glance.</span>
          </h1>
          <p className="hero-sub">
            Live analytics from PostgreSQL, with attrition risk predicted by machine learning.
          </p>
          <div className="insights">
            {insights.map((ins, i) => (
              <motion.div
                key={ins.text}
                className={`insight insight-${ins.tone}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
              >
                <span className="insight-dot" />
                {ins.text}
              </motion.div>
            ))}
          </div>
        </div>
        <RetentionGauge attrition={o?.attrition_rate_pct} />
      </AnimatedContent>

      {overview.error && <ErrorBox message={overview.error} />}

      {/* ---------- Insight briefing (replaces the number tiles; numbers on request) ---------- */}
      <Reveal delay={0.1}>
        <Briefing />
      </Reveal>

      <div>
        <button className="link small" onClick={() => setShowNumbers((v) => !v)}>
          {showNumbers ? "Hide the numbers" : "Show the numbers"}
        </button>
      </div>
      {showNumbers && (
      <Reveal stagger={0.05} className="grid stats">
        <StatCard label="Total employees" value={o?.total_employees} icon={Users} hint="in the database" />
        <StatCard label="Active" value={o?.active_employees} icon={UserCheck} tone="green" hint={o ? `${o.employees_left} have left` : ""} />
        <StatCard label="Attrition rate" value={o?.attrition_rate_pct} suffix="%" decimals={1} icon={TrendingDown} tone="red" hint="all-time" />
        <StatCard label="High-risk now" value={risk.data?.overall.find((r) => r.risk_level === "HIGH")?.employees} icon={ShieldAlert} tone="pink" hint="ML prediction" />
        <StatCard label="On overtime" value={o?.overtime_pct} suffix="%" decimals={1} icon={Clock} tone="amber" hint="of all employees" />
        <StatCard label="Avg monthly income" value={o?.avg_monthly_income} decimals={0} icon={Wallet} tone="cyan" />
        <StatCard label="Pending leave" value={o?.pending_leave_requests} icon={CalendarClock} tone="violet" hint="awaiting approval" />
      </Reveal>
      )}

      <Reveal delay={0.15}>
        <GenderCard />
      </Reveal>

      {/* ---------- attendance + risk ---------- */}
      <Reveal delay={0.2} className="grid two-one">
        <Card title="Attendance trend" subtitle="Daily attendance rate, last 30 working days">
          {trend.loading ? <ChartLoading /> : trend.error ? <ErrorBox message={trend.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ left: -10, right: 8 }}>
                <ChartGradients />
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axisProps} unit="%" domain={[trendMin, 100]} />
                <Tooltip {...tooltipProps} cursor={{ stroke: "rgba(0,113,227,0.3)" }}
                  formatter={(v, _n, p) => [`${v}%  (${p.payload.absent} absent, ${p.payload.late} late)`, "Attendance"]} />
                <Area type="monotone" dataKey="attendance_rate_pct" stroke={COLORS.cyan} strokeWidth={2.5} fill="url(#grad-area)" animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Attrition risk" subtitle="Active employees by ML risk level">
          {risk.loading ? <ChartLoading /> : risk.error ? <ErrorBox message={risk.error} /> : (
            <div className="donut">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={98} paddingAngle={4} cornerRadius={8} stroke="none" animationDuration={1200}>
                    {riskData.map((r) => <Cell key={r.name} fill={RISK_COLORS[r.name]} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <div className="donut-value"><CountUp to={riskTotal} separator="," duration={1.4} /></div>
                <div className="muted small">scored</div>
              </div>
              <div className="legend">
                {riskData.map((r) => (
                  <div key={r.name}><span className="dot" style={{ background: RISK_COLORS[r.name] }} />{r.name.toLowerCase()} <strong>{r.value}</strong></div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Reveal>

      {/* ---------- drivers ---------- */}
      <Reveal delay={0.3} className="grid two">
        <Card
          title="What drives attrition?"
          subtitle="Attrition rate grouped by one HR factor"
          actions={
            <select value={factor} onChange={(e) => setFactor(e.target.value)}>
              {Object.entries(FACTORS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          }
        >
          {byFactor.loading ? <ChartLoading /> : byFactor.error ? <ErrorBox message={byFactor.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byFactor.data.groups.map((g) => ({ ...g, label: factorLabel(factor, g.value), attrition_rate_pct: Number(g.attrition_rate_pct) }))}>
                <ChartGradients />
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v}% (${p.payload.employees_left} of ${p.payload.total_employees})`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill="url(#grad-cyan)" radius={[10, 10, 4, 4]} maxBarSize={64} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Attrition by department" subtitle="% of employees who left">
          {departments.loading ? <ChartLoading /> : departments.error ? <ErrorBox message={departments.error} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={departments.data.map((d) => ({ ...d, attrition_rate_pct: Number(d.attrition_rate_pct) }))}>
                <ChartGradients />
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="department_name" {...axisProps} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v}% · ${p.payload.total_employees} employees`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill="url(#grad-violet)" radius={[10, 10, 4, 4]} maxBarSize={72} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.4}>
        <Card title="Attrition by job role" subtitle="Which roles lose the most people">
          {jobRoles.loading ? <ChartLoading /> : jobRoles.error ? <ErrorBox message={jobRoles.error} /> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart layout="vertical" data={jobRoles.data.map((j) => ({ ...j, attrition_rate_pct: Number(j.attrition_rate_pct) }))} margin={{ left: 30, right: 20 }}>
                <ChartGradients />
                <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                <XAxis type="number" {...axisProps} unit="%" />
                <YAxis type="category" dataKey="job_role" {...axisProps} width={170} />
                <Tooltip {...tooltipProps} formatter={(v, _n, p) => [`${v}% · ${p.payload.overtime_pct}% on overtime`, "Attrition"]} />
                <Bar dataKey="attrition_rate_pct" fill="url(#grad-h-pink)" radius={[4, 10, 10, 4]} barSize={16} animationDuration={1100} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Reveal>
    </>
  );
}
