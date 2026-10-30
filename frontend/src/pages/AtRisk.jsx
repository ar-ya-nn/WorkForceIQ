import { X } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../api.js";
import { useAuth } from "../auth.jsx";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import { Badge, Card, ChartLoading, ErrorBox, Loading, PageHeader, Pagination, Person, Reveal, Segmented } from "../components/ui.jsx";
import { COLORS, axisProps, tooltipProps } from "./chartTheme.js";

const LIMIT = 15;

const COMPARE_BY = [
  { value: "gender", label: "Gender" },
  { value: "department", label: "Department" },
  { value: "job_role", label: "Job role" },
  { value: "overtime", label: "Overtime" },
  { value: "age_band", label: "Age group" },
  { value: "marital_status", label: "Marital status" },
  { value: "business_travel", label: "Travel" },
];
const GENDER_OPTIONS = [
  { value: "", label: "Everyone" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];
const AGE_BANDS = ["Under 30", "30-39", "40-49", "50+"];
const pretty = (v) => (v == null ? "Not set" : String(v).replace(/_/g, " "));
const LEVEL_WORDS = { HIGH: "Likely to leave", MEDIUM: "Some risk", LOW: "Unlikely to leave" };
const COMPARE_NOUN = {
  gender: "gender", department: "department", job_role: "job role", overtime: "overtime",
  age_band: "age group", marital_status: "marital status", business_travel: "travel pattern",
};

/** One plain-English sentence summarising the comparison. */
function narrative(groups, by) {
  const scored = groups.filter((g) => g.avg_risk_pct != null && g.employees > 0);
  if (scored.length < 2) return null;
  const sorted = [...scored].sort((a, b) => b.avg_risk_pct - a.avg_risk_pct);
  const top = sorted[0], bottom = sorted[sorted.length - 1];
  const gap = Number(top.avg_risk_pct) - Number(bottom.avg_risk_pct);
  const size = gap < 3 ? "only slightly" : gap < 10 ? "noticeably" : "much";
  const actual = top.actual_attrition_pct != null && bottom.actual_attrition_pct != null
    ? ` In the past, ${top.actual_attrition_pct}% of ${pretty(top.grp)} employees left, compared with ${bottom.actual_attrition_pct}% of ${pretty(bottom.grp)}.`
    : "";
  if (gap < 1) return { lead: `Risk looks about the same across every ${COMPARE_NOUN[by]}.`, rest: actual };
  return {
    lead: `${pretty(top.grp)} employees are ${size} more likely to leave than ${pretty(bottom.grp)} employees.`,
    rest: actual,
  };
}

export default function AtRisk() {
  const { user } = useAuth();
  const isAdmin = user.role === "ADMIN";
  const isViewer = user.role === "VIEWER";   // viewers see group-level comparisons only, never individuals

  // ---- compare section
  const [compareBy, setCompareBy] = useState("gender");
  const [compareGender, setCompareGender] = useState("");
  const breakdown = useApi("/predictions/breakdown", { by: compareBy, gender: compareBy === "gender" ? "" : compareGender });

  // ---- list filters
  const [filters, setFilters] = useState({ risk_level: "HIGH", gender: "", department_id: "", job_role: "", overtime: "", age_band: "" });
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);
  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setSkip(0); };

  const departments = useApi("/departments/");
  const jobRoles = useApi(isViewer ? null : "/predictions/job-roles");
  const list = useApi(isViewer ? null : "/predictions/", { ...filters, skip, limit: LIMIT });

  const groups = breakdown.data?.groups ?? [];
  const chartData = groups.map((g) => ({
    name: pretty(g.grp),
    High: g.high, Medium: g.medium, Low: g.low,
    "Predicted risk %": Number(g.avg_risk_pct),
    "Actual attrition %": g.actual_attrition_pct == null ? null : Number(g.actual_attrition_pct),
  }));

  // clicking a group card applies it as a filter on the list below (where the list supports it)
  const groupFilter = (g) => {
    if (isViewer) return null;               // no list to filter for viewers
    if (compareBy === "gender") return ["gender", g.grp];
    if (compareBy === "job_role") return ["job_role", g.grp];
    if (compareBy === "age_band") return ["age_band", g.grp];
    if (compareBy === "overtime") return ["overtime", g.grp === "Overtime" ? "true" : "false"];
    if (compareBy === "department" && isAdmin) {
      const d = departments.data?.find((x) => x.department_name === g.grp);
      return d ? ["department_id", String(d.department_id)] : null;
    }
    return null;
  };
  const isSelectedGroup = (g) => {
    const f = groupFilter(g);
    return Boolean(f) && filters[f[0]] === f[1];
  };
  const pickGroup = (g) => {
    const f = groupFilter(g);
    if (!f) return;
    setFilter(f[0], filters[f[0]] === f[1] ? "" : f[1]);
  };

  const activeChips = [
    filters.gender && ["gender", filters.gender],
    filters.job_role && ["job_role", filters.job_role],
    filters.age_band && ["age_band", `Age ${filters.age_band}`],
    filters.overtime && ["overtime", filters.overtime === "true" ? "Overtime" : "No overtime"],
    filters.department_id && ["department_id", departments.data?.find((d) => String(d.department_id) === filters.department_id)?.department_name],
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="Machine learning"
        title="Attrition Risk"
        subtitle={isAdmin ? "Who is likely to leave, and how it differs across groups." : `${user.department_name}: who is likely to leave, and how it differs across groups.`}
      />

      {/* ---------------- compare by category ---------------- */}
      <Reveal delay={0.05}>
        <Card title="Compare groups" subtitle="Predicted risk for current employees, next to the real attrition rate of each group.">
          <div className="filter-row" style={{ marginBottom: 18, justifyContent: "space-between" }}>
            <Segmented id="compare-by" options={COMPARE_BY} value={compareBy} onChange={setCompareBy} />
            {compareBy !== "gender" && (
              <Segmented id="compare-gender" options={GENDER_OPTIONS} value={compareGender} onChange={setCompareGender} />
            )}
          </div>

          {breakdown.loading ? <ChartLoading /> : breakdown.error ? <ErrorBox message={breakdown.error} /> : (
            <>
              {(() => {
                const n = narrative(groups, compareBy);
                return n && <p className="narrative"><strong>{n.lead}</strong>{n.rest}</p>;
              })()}
              <div className="compare-groups">
                {groups.map((g) => {
                  const clickable = Boolean(groupFilter(g));
                  const Tag = clickable ? "button" : "div";
                  return (
                    <Tag key={String(g.grp)} type={clickable ? "button" : undefined}
                      className={`compare-group ${isSelectedGroup(g) ? "selected" : ""}`}
                      onClick={clickable ? () => pickGroup(g) : undefined}
                      title={clickable ? "Show these people in the list below" : undefined}>
                      <div className="compare-group-name">{pretty(g.grp)}</div>
                      <div className="compare-group-risk">{Number(g.avg_risk_pct).toFixed(1)}%</div>
                      <div className="muted small">average predicted risk</div>
                      <div className="compare-row"><span>Employees now</span><strong>{g.employees}</strong></div>
                      <div className="compare-row"><span>High risk</span><strong className="red">{g.high}</strong></div>
                      <div className="compare-row"><span>Actual attrition</span><strong>{g.actual_attrition_pct == null ? "—" : `${g.actual_attrition_pct}%`}</strong></div>
                    </Tag>
                  );
                })}
              </div>

              <div className="grid two">
                <div>
                  <h4>Risk levels per group</h4>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ left: -10 }}>
                      <CartesianGrid stroke={COLORS.grid} vertical={false} />
                      <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fontSize: 11 }} />
                      <YAxis {...axisProps} />
                      <Tooltip {...tooltipProps} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="High" stackId="r" fill={COLORS.red} maxBarSize={56} />
                      <Bar dataKey="Medium" stackId="r" fill={COLORS.amber} maxBarSize={56} />
                      <Bar dataKey="Low" stackId="r" fill={COLORS.green} radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h4>Predicted risk vs actual attrition</h4>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ left: -10 }}>
                      <CartesianGrid stroke={COLORS.grid} vertical={false} />
                      <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fontSize: 11 }} />
                      <YAxis {...axisProps} unit="%" />
                      <Tooltip {...tooltipProps} formatter={(v) => (v == null ? "—" : `${v}%`)} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Predicted risk %" fill={COLORS.blue} radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="Actual attrition %" fill={COLORS.teal} radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                Predicted risk is the model's estimate for people still employed. Actual attrition is the share of each
                group (everyone in the dataset) who left. Differences between groups describe patterns in the data, not causes.
              </p>
            </>
          )}
        </Card>
      </Reveal>

      {/* ---------------- list with filters (not for viewers) ---------------- */}
      {!isViewer && (
      <Reveal delay={0.1}>
        <Card title="Employees by risk" subtitle="Click anyone to see why, and what could help.">
          <div className="filter-row" style={{ marginBottom: 14 }}>
            <Segmented id="risk-level" value={filters.risk_level} onChange={(v) => setFilter("risk_level", v)}
              options={[{ value: "HIGH", label: "Likely to leave" }, { value: "MEDIUM", label: "Some risk" }, { value: "LOW", label: "Unlikely" }, { value: "", label: "All" }]} />
            <Segmented id="list-gender" value={filters.gender} onChange={(v) => setFilter("gender", v)} options={GENDER_OPTIONS} />
            {isAdmin && (
              <select value={filters.department_id} onChange={(e) => setFilter("department_id", e.target.value)}>
                <option value="">All departments</option>
                {departments.data?.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
              </select>
            )}
            <select value={filters.job_role} onChange={(e) => setFilter("job_role", e.target.value)}>
              <option value="">All job roles</option>
              {jobRoles.data?.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filters.overtime} onChange={(e) => setFilter("overtime", e.target.value)}>
              <option value="">Overtime: any</option>
              <option value="true">On overtime</option>
              <option value="false">No overtime</option>
            </select>
            <select value={filters.age_band} onChange={(e) => setFilter("age_band", e.target.value)}>
              <option value="">Any age</option>
              {AGE_BANDS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {activeChips.length > 0 && (
            <div className="filter-row" style={{ marginBottom: 12 }}>
              {activeChips.map(([key, label]) => (
                <button key={key} className="chip" onClick={() => setFilter(key, "")}>{label} <X size={13} /></button>
              ))}
            </div>
          )}

          {list.loading ? <Loading rows={8} /> : list.error ? <ErrorBox message={list.error} /> :
            list.data.items.length === 0 ? <div className="state">No employees match these filters.</div> : (
            <>
              <div className="table-wrap">
                <table className="table clickable">
                  <thead>
                    <tr><th>Employee</th><th>Gender</th><th>Department</th><th>Job role</th><th>Main reason</th><th>Outlook</th></tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((e) => (
                      <tr key={e.user_id} onClick={() => setSelected(e.user_id)}>
                        <td><Person name={e.full_name} sub={e.email} /></td>
                        <td>{e.gender}</td>
                        <td>{e.department_name}</td>
                        <td>{e.job_role}</td>
                        <td className="main-reason">{e.main_reason ?? "—"}</td>
                        <td><Badge value={e.risk_level} label={LEVEL_WORDS[e.risk_level]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={list.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
            </>
          )}
        </Card>
      </Reveal>
      )}

      {!isViewer && <EmployeeDrawer userId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
