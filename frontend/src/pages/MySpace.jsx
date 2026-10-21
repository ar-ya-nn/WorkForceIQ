import { CalendarCheck, CalendarDays, Clock, UserRound } from "lucide-react";
import { useCallback, useState } from "react";
import { fmt, useApi } from "../api.js";
import { ROLE_LABEL, useAuth } from "../auth.jsx";
import { Avatar, Badge, Card, ErrorBox, Loading, PageHeader, Reveal, StatCard, Toast } from "../components/ui.jsx";
import { ApplyForm } from "./Leave.jsx";

const SCALE = { 1: "Low", 2: "Medium", 3: "High", 4: "Very high" };
const days = (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000) + 1;

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
        <StatCard label="Days present" value={myAttendance.data ? present : null} suffix={` / ${records.length}`} icon={CalendarCheck} tone="green" hint="last 10 records" />
        <StatCard label="Years here" value={d ? d.years_at_company ?? 0 : null} icon={Clock} tone="cyan" />
        <StatCard label="Job level" value={d ? d.job_level ?? 0 : null} icon={UserRound} tone="amber" hint={d?.job_role ?? ""} />
      </Reveal>

      <Reveal delay={0.1} className="grid two">
        <Card title="My profile">
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

      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}
