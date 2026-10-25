import { CalendarCheck, CalendarDays, Clock, UserRound } from "lucide-react";
import { useCallback, useState } from "react";
import { api, fmt, useApi } from "../api.js";
import { ROLE_LABEL, useAuth } from "../auth.jsx";
import { Avatar, Badge, Card, ErrorBox, Field, Loading, PageHeader, Reveal, StatCard, Toast } from "../components/ui.jsx";
import { ApplyForm } from "./Leave.jsx";

const SCALE = { 1: "Low", 2: "Medium", 3: "High", 4: "Very high" };
const days = (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000) + 1;

function ChangePassword({ onDone }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const mismatch = form.confirm && form.confirm !== form.new_password;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post("/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      setForm({ current_password: "", new_password: "", confirm: "" });
      onDone({ type: "success", message: "Password changed." });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Card title="Change password">
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Current password"><input type="password" autoComplete="current-password" value={form.current_password} onChange={set("current_password")} required /></Field>
          <Field label="New password (min 8)"><input type="password" autoComplete="new-password" value={form.new_password} onChange={set("new_password")} required minLength={8} /></Field>
          <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} required /></Field>
          <button className="btn primary" disabled={busy || mismatch || form.new_password.length < 8}>{busy ? "Saving…" : "Change password"}</button>
        </div>
        {mismatch && <p className="small red">The new passwords don't match.</p>}
        {error && <div style={{ marginTop: 12 }}><ErrorBox message={error} /></div>}
      </form>
    </Card>
  );
}

export default function MySpace() {
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  const me = useApi("/users/me");
  const balance = useApi(`/leave/balance/${user.user_id}`);
  const types = useApi("/leave/types");
  const myLeave = useApi("/leave/", { user_id: user.user_id, limit: 8 });
  const myAttendance = useApi("/attendance/", { user_id: user.user_id, limit: 10 });

  const typeName = Object.fromEntries((types.data ?? []).map((t) => [t.leave_type_id, t.type_name]));
  const d = me.data;
  // system accounts (like the built-in admin) have no HR profile: no income, role, attendance...
  const hasProfile = Boolean(d && d.job_role);
  const records = myAttendance.data?.items ?? [];
  const present = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  const leaveLeft = (balance.data ?? []).reduce((sum, b) => sum + Number(b.days_remaining), 0);

  const afterApply = (t) => {
    setToast(t);
    myLeave.reload();
    balance.reload();
  };

  return (
    <>
      <PageHeader eyebrow={ROLE_LABEL[user.role]} title={`Hi, ${user.name.split(" ")[0]}`} subtitle="Your profile, leave and attendance" />

      <Reveal delay={0.05} stagger={0.06} className="grid stats">
        <StatCard label="Leave days left" value={balance.data ? leaveLeft : null} icon={CalendarDays} tone="violet" hint="all types, this year" />
        {(!d || hasProfile) && (
          <>
            <StatCard label="Days present" value={myAttendance.data ? present : null} suffix={` / ${records.length}`} icon={CalendarCheck} tone="green" hint="last 10 records" />
            <StatCard label="Years here" value={d ? d.years_at_company ?? 0 : null} icon={Clock} tone="cyan" />
            <StatCard label="Job level" value={d ? d.job_level ?? 0 : null} icon={UserRound} tone="amber" hint={d?.job_role ?? ""} />
          </>
        )}
      </Reveal>

      <Reveal delay={0.1} className="grid two">
        <Card title="My profile" subtitle={d && !hasProfile
          ? "This is a system account without an HR profile, so there's no income, attendance or job data. Company data is on Overview, Employees and Attrition Risk."
          : undefined}>
          {me.loading ? <Loading rows={6} /> : me.error ? <ErrorBox message={me.error} /> : (
            <>
              <div className="drawer-profile">
                <Avatar name={d.full_name} size={56} />
                <div>
                  <div className="drawer-name">{d.full_name}</div>
                  <div className="muted small">{d.email}</div>
                </div>
              </div>
              <dl className="details">
                <dt>Role</dt><dd>{d.role_name}</dd>
                <dt>Department</dt><dd>{d.department_name ?? "—"}</dd>
                <dt>Job role</dt><dd>{d.job_role ?? "—"}</dd>
                <dt>Joined</dt><dd>{fmt.date(d.joining_date)}</dd>
                <dt>Monthly income</dt><dd>{fmt.money(d.monthly_income)}</dd>
                <dt>Job satisfaction</dt><dd>{SCALE[d.job_satisfaction] ?? "—"}</dd>
                <dt>Work-life balance</dt><dd>{SCALE[d.work_life_balance] ?? "—"}</dd>
              </dl>
            </>
          )}
        </Card>

        <Card title="Leave balance" subtitle="This year, from the v_leave_balance view">
          {balance.loading ? <Loading rows={3} /> : balance.error ? <ErrorBox message={balance.error} /> : (
            <div className="balance-list">
              {balance.data.map((b) => {
                const used = Number(b.days_taken) + Number(b.days_pending);
                const pct = Math.min(100, (used / Number(b.max_days)) * 100);
                return (
                  <div key={b.type_name} className="balance-row">
                    <div className="balance-top">
                      <strong>{b.type_name}</strong>
                      <span className="muted small">{b.days_taken} taken · {b.days_pending} pending · <strong className="green">{b.days_remaining} left</strong> of {b.max_days}</span>
                    </div>
                    <div className="bar"><div className="bar-fill risk-LOW" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.15}>
        <ApplyForm types={types.data} onDone={afterApply} forSelf />
      </Reveal>

      <Reveal delay={0.2} className="grid two">
        <Card title="My leave requests">
          {myLeave.loading ? <Loading rows={4} /> : myLeave.error ? <ErrorBox message={myLeave.error} /> :
            myLeave.data.items.length === 0 ? <div className="state muted">No leave requests yet.</div> : (
            <table className="table compact">
              <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead>
              <tbody>
                {myLeave.data.items.map((l) => (
                  <tr key={l.leave_id}>
                    <td>{typeName[l.leave_type_id]}</td>
                    <td>{fmt.date(l.start_date)} → {fmt.date(l.end_date)}</td>
                    <td>{days(l.start_date, l.end_date)}</td>
                    <td><Badge value={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="My recent attendance">
          {myAttendance.loading ? <Loading rows={4} /> : myAttendance.error ? <ErrorBox message={myAttendance.error} /> :
            records.length === 0 ? <div className="state muted">No attendance records.</div> : (
            <table className="table compact">
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.attendance_id}>
                    <td>{fmt.date(r.date)}</td>
                    <td>{fmt.time(r.check_in)}</td>
                    <td>{fmt.time(r.check_out)}</td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Reveal>

      <Reveal delay={0.25}>
        <ChangePassword onDone={setToast} />
      </Reveal>

      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}
