import { useState } from "react";
import { fmt, useApi } from "../api.js";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import { Badge, Card, ErrorBox, Loading, PageHeader, Pagination } from "../components/ui.jsx";

const LIMIT = 15;

export default function AtRisk() {
  const [riskLevel, setRiskLevel] = useState("HIGH");
  const [departmentId, setDepartmentId] = useState("");
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);

  const departments = useApi("/departments/");
  const summary = useApi("/predictions/summary");
  const list = useApi("/predictions/", { risk_level: riskLevel, department_id: departmentId, skip, limit: LIMIT });

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setSkip(0);
  };

  return (
    <>
      <PageHeader title="Attrition Risk" subtitle="Active employees ranked by predicted risk of leaving">
        <select value={riskLevel} onChange={changeFilter(setRiskLevel)}>
          <option value="">All risk levels</option>
          <option value="HIGH">High risk</option>
          <option value="MEDIUM">Medium risk</option>
          <option value="LOW">Low risk</option>
        </select>
        <select value={departmentId} onChange={changeFilter(setDepartmentId)}>
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
        </select>
      </PageHeader>

      {summary.data && (
        <div className="grid three">
          {summary.data.by_department.map((d) => (
            <Card key={d.department_name} title={d.department_name}>
              <div className="risk-split">
                <div><span className="big red">{d.high_risk}</span><span className="muted small">high</span></div>
                <div><span className="big amber">{d.medium_risk}</span><span className="muted small">medium</span></div>
                <div><span className="big green">{d.low_risk}</span><span className="muted small">low</span></div>
              </div>
              <p className="muted small">Average risk {(Number(d.avg_risk_score) * 100).toFixed(1)}% across {d.employees} employees</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox message={list.error} /> : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th>Employee</th><th>Department</th><th>Job role</th><th>Overtime</th><th>Years</th><th>Monthly income</th><th>Risk</th></tr>
                </thead>
                <tbody>
                  {list.data.items.map((e) => (
                    <tr key={e.user_id} onClick={() => setSelected(e.user_id)}>
                      <td><strong>{e.full_name}</strong><div className="muted small">{e.email}</div></td>
                      <td>{e.department_name}</td>
                      <td>{e.job_role}</td>
                      <td>{e.overtime ? "Yes" : "No"}</td>
                      <td>{e.years_at_company}</td>
                      <td>{fmt.money(e.monthly_income)}</td>
                      <td>
                        <div className="risk-cell">
                          <div className="bar small-bar"><div className={`bar-fill risk-${e.risk_level}`} style={{ width: `${Number(e.risk_score) * 100}%` }} /></div>
                          <span>{(Number(e.risk_score) * 100).toFixed(0)}%</span>
                          <Badge value={e.risk_level} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={list.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
          </>
        )}
      </Card>

      <EmployeeDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
