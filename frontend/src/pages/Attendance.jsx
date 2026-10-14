import { useState } from "react";
import { useApi } from "../api.js";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import { Card, ErrorBox, Loading, PageHeader, Pagination } from "../components/ui.jsx";

const LIMIT = 15;

export default function Attendance() {
  const [departmentId, setDepartmentId] = useState("");
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);

  const departments = useApi("/departments/");
  const summary = useApi("/attendance/summary", { department_id: departmentId, skip, limit: LIMIT });

  return (
    <>
      <PageHeader title="Attendance" subtitle="Last 30 days per active employee, lowest attendance first">
        <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSkip(0); }}>
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
        </select>
      </PageHeader>

      <Card>
        {summary.loading ? <Loading /> : summary.error ? <ErrorBox message={summary.error} /> : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th>Employee</th><th>Present</th><th>Late</th><th>Absent</th><th>On leave</th><th>Attendance rate</th></tr>
                </thead>
                <tbody>
                  {summary.data.items.map((a) => {
                    const rate = Number(a.attendance_rate_pct ?? 0);
                    const tone = rate >= 95 ? "LOW" : rate >= 85 ? "MEDIUM" : "HIGH";
                    return (
                      <tr key={a.user_id} onClick={() => setSelected(a.user_id)}>
                        <td><strong>{a.full_name}</strong><div className="muted small">#{a.user_id}</div></td>
                        <td>{a.present_days}</td>
                        <td className={a.late_days > 3 ? "amber" : ""}>{a.late_days}</td>
                        <td className={a.absent_days > 2 ? "red" : ""}>{a.absent_days}</td>
                        <td>{a.leave_days}</td>
                        <td>
                          <div className="risk-cell">
                            <div className="bar small-bar"><div className={`bar-fill risk-${tone}`} style={{ width: `${rate}%` }} /></div>
                            <span>{rate.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={summary.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
          </>
        )}
      </Card>

      <EmployeeDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
