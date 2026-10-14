import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { fmt, useApi } from "../api.js";
import { Badge, Card, ErrorBox, Loading, PageHeader, Pagination } from "../components/ui.jsx";

const LIMIT = 15;

/** Lists only the fields that actually changed between old_data and new_data. */
function changes(log) {
  const before = log.old_data ?? {};
  const after = log.new_data ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .filter((k) => k !== "password_hash")
    .map((k) => ({ field: k, before: before[k], after: after[k] }));
}

const show = (v) => (v === undefined ? "—" : v === null ? "null" : String(v));

export default function Audit() {
  const [table, setTable] = useState("");
  const [action, setAction] = useState("");
  const [skip, setSkip] = useState(0);
  const [open, setOpen] = useState(null);
  const logs = useApi("/audit/", { table_name: table, action, skip, limit: LIMIT });

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Written automatically by PostgreSQL triggers on every insert, update and delete">
        <select value={table} onChange={(e) => { setTable(e.target.value); setSkip(0); }}>
          <option value="">All tables</option>
          <option value="users">users</option>
          <option value="employee_profiles">employee_profiles</option>
          <option value="leave_requests">leave_requests</option>
          <option value="performance_reviews">performance_reviews</option>
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setSkip(0); }}>
          <option value="">All actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <button className="btn ghost" onClick={logs.reload}>Refresh</button>
      </PageHeader>

      <Card>
        {logs.loading ? <Loading /> : logs.error ? <ErrorBox message={logs.error} /> : logs.data.total === 0 ? (
          <div className="state muted">
            No changes yet. Approve a leave request or update an employee's salary from the API docs, then refresh.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th /><th>When</th><th>Table</th><th>Record</th><th>Employee</th><th>Action</th><th>Changed by</th></tr>
                </thead>
                <tbody>
                  {logs.data.items.map((log) => (
                    <Fragment key={log.log_id}>
                      <tr onClick={() => setOpen(open === log.log_id ? null : log.log_id)}>
                        <td>{open === log.log_id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                        <td>{fmt.datetime(log.timestamp)}</td>
                        <td><code>{log.table_name}</code></td>
                        <td>#{log.record_id}</td>
                        <td>{log.user_id ? `#${log.user_id}` : "—"}</td>
                        <td><Badge value={log.action} /></td>
                        <td className="muted">{log.changed_by}</td>
                      </tr>
                      {open === log.log_id && (
                        <tr className="expanded">
                          <td colSpan={7}>
                            <table className="table compact diff">
                              <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                              <tbody>
                                {changes(log).map((c) => (
                                  <tr key={c.field}>
                                    <td><code>{c.field}</code></td>
                                    <td className="red">{show(c.before)}</td>
                                    <td className="green">{show(c.after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={logs.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
          </>
        )}
      </Card>
    </>
  );
}
