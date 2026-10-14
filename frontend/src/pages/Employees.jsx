import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ROLE_NAMES, fmt, useApi } from "../api.js";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import { Badge, Card, ErrorBox, Loading, PageHeader, Pagination } from "../components/ui.jsx";

const LIMIT = 15;

export default function Employees() {
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);

  // wait until the user stops typing before searching
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchText);
      setSkip(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const departments = useApi("/departments/");
  const deptName = Object.fromEntries((departments.data ?? []).map((d) => [d.department_id, d.department_name]));
  const users = useApi("/users/", { search, department_id: departmentId, status, skip, limit: LIMIT });

  return (
    <>
      <PageHeader title="Employees" subtitle="Everyone in the organisation">
        <div className="search">
          <Search size={16} />
          <input placeholder="Search name or email…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSkip(0); }}>
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="EXITED">Exited</option>
        </select>
      </PageHeader>

      <Card>
        {users.loading ? <Loading /> : users.error ? <ErrorBox message={users.error} /> : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Joined</th><th>Salary (yearly)</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {users.data.items.map((u) => (
                    <tr key={u.user_id} onClick={() => setSelected(u.user_id)}>
                      <td className="muted">#{u.user_id}</td>
                      <td><strong>{u.first_name} {u.last_name}</strong><div className="muted small">{u.email}</div></td>
                      <td>{ROLE_NAMES[u.role_id]}</td>
                      <td>{deptName[u.department_id] ?? "—"}</td>
                      <td>{fmt.date(u.joining_date)}</td>
                      <td>{fmt.money(u.salary)}</td>
                      <td><Badge value={u.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={users.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
          </>
        )}
      </Card>

      <EmployeeDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
