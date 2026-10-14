import { Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { api, fmt, useApi } from "../api.js";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import { Badge, Card, ErrorBox, Field, Loading, PageHeader, Pagination, Toast } from "../components/ui.jsx";

const LIMIT = 12;
const days = (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000) + 1;

function ApplyForm({ types, onDone }) {
  const [form, setForm] = useState({ user_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async () => {
    setBusy(true);
    try {
      const leave = await api.post("/leave/", {
        ...form,
        user_id: Number(form.user_id),
        leave_type_id: Number(form.leave_type_id),
        reason: form.reason || null,
      });
      onDone({ type: "success", message: `Leave request #${leave.leave_id} submitted for employee #${leave.user_id}.` });
      setForm({ user_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
    } catch (e) {
      // messages from the database trigger (overlap / limit) show up here
      onDone({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const ready = form.user_id && form.leave_type_id && form.start_date && form.end_date;

  return (
    <Card title="Apply for leave" subtitle="Checked by the database trigger: no overlaps, yearly limits enforced">
      <div className="form-grid">
        <Field label="Employee ID"><input type="number" min="1" value={form.user_id} onChange={set("user_id")} placeholder="e.g. 25" /></Field>
        <Field label="Leave type">
          <select value={form.leave_type_id} onChange={set("leave_type_id")}>
            <option value="">Choose…</option>
            {types?.map((t) => <option key={t.leave_type_id} value={t.leave_type_id}>{t.type_name} (max {t.max_days} days)</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" value={form.start_date} onChange={set("start_date")} /></Field>
        <Field label="To"><input type="date" value={form.end_date} onChange={set("end_date")} /></Field>
        <Field label="Reason"><input value={form.reason} onChange={set("reason")} placeholder="Optional" /></Field>
        <button className="btn primary" disabled={!ready || busy} onClick={submit}>{busy ? "Submitting…" : "Submit request"}</button>
      </div>
    </Card>
  );
}

export default function Leave() {
  const [status, setStatus] = useState("PENDING");
  const [skip, setSkip] = useState(0);
  const [approverId, setApproverId] = useState("");
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  const types = useApi("/leave/types");
  const typeName = Object.fromEntries((types.data ?? []).map((t) => [t.leave_type_id, t.type_name]));
  const admins = useApi("/users/", { role_id: 1, limit: 10 });
  const managers = useApi("/users/", { role_id: 2, limit: 50 });
  const approvers = [...(admins.data?.items ?? []), ...(managers.data?.items ?? [])];
  const approver = approverId || approvers[0]?.user_id || "";
  const leaves = useApi("/leave/", { status, skip, limit: LIMIT });

  const decide = async (leaveId, action) => {
    try {
      await api.post(`/leave/${leaveId}/${action}`, { approver_id: Number(approver) });
      setToast({
        type: "success",
        message: action === "approve"
          ? `Request #${leaveId} approved. Attendance for those days was marked ON LEAVE in the same transaction.`
          : `Request #${leaveId} rejected.`,
      });
      leaves.reload();
    } catch (e) {
      setToast({ type: "error", message: e.message });
    }
  };

  return (
    <>
      <PageHeader title="Leave Management" subtitle="Approvals run through the approve_leave stored procedure (one transaction)">
        <Field label="Acting as">
          <select value={approver} onChange={(e) => setApproverId(e.target.value)}>
            {approvers.map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name} ({u.role_id === 1 ? "Admin" : "Manager"})</option>
            ))}
          </select>
        </Field>
      </PageHeader>

      <ApplyForm types={types.data} onDone={(t) => { setToast(t); leaves.reload(); }} />

      <Card
        title="Leave requests"
        actions={
          <div className="tabs">
            {["PENDING", "APPROVED", "REJECTED"].map((s) => (
              <button key={s} className={`tab ${status === s ? "active" : ""}`} onClick={() => { setStatus(s); setSkip(0); }}>{s.toLowerCase()}</button>
            ))}
          </div>
        }
      >
        {leaves.loading ? <Loading /> : leaves.error ? <ErrorBox message={leaves.error} /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th>{status === "PENDING" && <th />}</tr>
                </thead>
                <tbody>
                  {leaves.data.items.map((l) => (
                    <tr key={l.leave_id}>
                      <td className="muted">{l.leave_id}</td>
                      <td><button className="link" onClick={() => setSelected(l.user_id)}>{l.employee_name}</button><div className="muted small">#{l.user_id}</div></td>
                      <td>{typeName[l.leave_type_id]}</td>
                      <td>{fmt.date(l.start_date)} → {fmt.date(l.end_date)}</td>
                      <td>{days(l.start_date, l.end_date)}</td>
                      <td className="muted">{l.reason ?? "—"}</td>
                      <td><Badge value={l.status} /></td>
                      {status === "PENDING" && (
                        <td className="row-actions">
                          <button className="btn success" onClick={() => decide(l.leave_id, "approve")}><Check size={15} /> Approve</button>
                          <button className="btn danger" onClick={() => decide(l.leave_id, "reject")}><X size={15} /> Reject</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={leaves.data.total} skip={skip} limit={LIMIT} onChange={setSkip} />
          </>
        )}
      </Card>

      <Toast toast={toast} onClose={closeToast} />
      <EmployeeDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
