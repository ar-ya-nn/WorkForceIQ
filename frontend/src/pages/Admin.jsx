import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ROLE_NAMES, api, fmt, useApi } from "../api.js";
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, Person, Reveal, Segmented, Toast } from "../components/ui.jsx";

const TABS = [
  { value: "people", label: "People" },
  { value: "departments", label: "Departments" },
  { value: "leave-types", label: "Leave types" },
  { value: "attendance", label: "Attendance" },
  { value: "reviews", label: "Reviews" },
  { value: "model", label: "ML model" },
];
const ROLE_KEY = { 1: "ADMIN", 2: "MANAGER", 3: "EMPLOYEE" };
const SCALE = [1, 2, 3, 4];
const SCALE_LABEL = { 1: "1 · Low", 2: "2 · Medium", 3: "3 · High", 4: "4 · Very high" };
const today = () => new Date().toISOString().slice(0, 10);

/** Turns form strings into the types the API expects; empty fields are left out entirely. */
function clean(form, numbers = [], booleans = []) {
  const out = {};
  for (const [k, v] of Object.entries(form)) {
    if (v === "" || v === null || v === undefined) continue;
    if (numbers.includes(k)) out[k] = Number(v);
    else if (booleans.includes(k)) out[k] = v === true || v === "true";
    else out[k] = v;
  }
  return out;
}

// ======================================================================
// People
// ======================================================================
const PROFILE_NUMBERS = ["age", "job_level", "monthly_income", "job_satisfaction", "environment_satisfaction",
  "work_life_balance", "years_at_company", "percent_salary_hike", "stock_option_level", "distance_from_home"];

function ProfileFields({ form, set }) {
  return (
    <div className="form-grid">
      <Field label="Age"><input type="number" min="18" max="65" value={form.age ?? ""} onChange={set("age")} /></Field>
      <Field label="Gender">
        <select value={form.gender ?? ""} onChange={set("gender")}>
          <option value="">Choose…</option><option>Male</option><option>Female</option>
        </select>
      </Field>
      <Field label="Marital status">
        <select value={form.marital_status ?? ""} onChange={set("marital_status")}>
          <option value="">Choose…</option><option>Single</option><option>Married</option><option>Divorced</option>
        </select>
      </Field>
      <Field label="Job role"><input value={form.job_role ?? ""} onChange={set("job_role")} placeholder="e.g. Sales Executive" /></Field>
      <Field label="Job level (1–5)"><input type="number" min="1" max="5" value={form.job_level ?? ""} onChange={set("job_level")} /></Field>
      <Field label="Monthly income"><input type="number" min="1" value={form.monthly_income ?? ""} onChange={set("monthly_income")} /></Field>
      <Field label="Overtime">
        <select value={form.overtime === undefined || form.overtime === null ? "" : String(form.overtime)} onChange={set("overtime")}>
          <option value="">Choose…</option><option value="false">No</option><option value="true">Yes</option>
        </select>
      </Field>
      <Field label="Business travel">
        <select value={form.business_travel ?? ""} onChange={set("business_travel")}>
          <option value="">Choose…</option><option value="Non-Travel">Non-travel</option>
          <option value="Travel_Rarely">Rarely</option><option value="Travel_Frequently">Frequently</option>
        </select>
      </Field>
      <Field label="Job satisfaction">
        <select value={form.job_satisfaction ?? ""} onChange={set("job_satisfaction")}>
          <option value="">Choose…</option>{SCALE.map((n) => <option key={n} value={n}>{SCALE_LABEL[n]}</option>)}
        </select>
      </Field>
      <Field label="Environment satisfaction">
        <select value={form.environment_satisfaction ?? ""} onChange={set("environment_satisfaction")}>
          <option value="">Choose…</option>{SCALE.map((n) => <option key={n} value={n}>{SCALE_LABEL[n]}</option>)}
        </select>
      </Field>
      <Field label="Work-life balance">
        <select value={form.work_life_balance ?? ""} onChange={set("work_life_balance")}>
          <option value="">Choose…</option>{SCALE.map((n) => <option key={n} value={n}>{SCALE_LABEL[n]}</option>)}
        </select>
      </Field>
      <Field label="Years at company"><input type="number" min="0" value={form.years_at_company ?? ""} onChange={set("years_at_company")} /></Field>
    </div>
  );
}

function AccountFields({ form, set, departments, isNew }) {
  return (
    <div className="form-grid">
      <Field label="First name"><input value={form.first_name ?? ""} onChange={set("first_name")} required /></Field>
      <Field label="Last name"><input value={form.last_name ?? ""} onChange={set("last_name")} required /></Field>
      <Field label="Email"><input type="email" value={form.email ?? ""} onChange={set("email")} required /></Field>
      {isNew && <Field label="Password (min 8)"><input type="password" value={form.password ?? ""} onChange={set("password")} required /></Field>}
      <Field label="Role">
        <select value={form.role_id ?? 3} onChange={set("role_id")}>
          <option value={1}>Admin</option><option value={2}>Manager</option><option value={3}>Employee</option>
        </select>
      </Field>
      <Field label="Department">
        <select value={form.department_id ?? ""} onChange={set("department_id")}>
          <option value="">None</option>
          {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
        </select>
      </Field>
      <Field label="Manager (user ID)"><input type="number" min="1" value={form.manager_id ?? ""} onChange={set("manager_id")} placeholder="optional" /></Field>
      <Field label="Yearly salary"><input type="number" min="1" value={form.salary ?? ""} onChange={set("salary")} /></Field>
      {!isNew && (
        <Field label="Status">
          <select value={form.status ?? "ACTIVE"} onChange={set("status")}>
            <option value="ACTIVE">Active</option><option value="EXITED">Exited (can't log in)</option>
          </select>
        </Field>
      )}
    </div>
  );
}

function useForm(initial) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return [form, set, setForm];
}

function AddPersonModal({ open, onClose, departments, onDone }) {
  const [account, setAccount, resetAccount] = useForm({ role_id: 3 });
  const [profile, setProfile, resetProfile] = useForm({});
  const [withProfile, setWithProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { resetAccount({ role_id: 3 }); resetProfile({}); setError(null); } }, [open]); // eslint-disable-line

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const body = clean(account, ["role_id", "department_id", "manager_id", "salary"]);
      if (withProfile) body.profile = clean(profile, PROFILE_NUMBERS, ["overtime"]);
      const user = await api.post("/users/", body);
      onDone(`${user.first_name} ${user.last_name} was added (user #${user.user_id}).`);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a person" wide>
      <form onSubmit={save}>
        <div className="modal-section">
          <h4>Account</h4>
          <AccountFields form={account} set={setAccount} departments={departments} isNew />
        </div>
        <div className="modal-section">
          <label className="inline-edit" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={withProfile} onChange={(e) => setWithProfile(e.target.checked)} />
            <span>Add HR profile now (needed for analytics and attrition risk)</span>
          </label>
          {withProfile && <ProfileFields form={profile} set={setProfile} />}
          {withProfile && <p className="muted small">Required: age, gender, marital status, job role, job level, monthly income.</p>}
        </div>
        {error && <ErrorBox message={error} />}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Adding…" : "Add person"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditPersonModal({ person, onClose, departments, onDone }) {
  const [account, setAccount, resetAccount] = useForm({});
  const [profile, setProfile, resetProfile] = useForm({});
  const [original, setOriginal] = useState({});
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!person) return;
    setError(null); setPassword("");
    resetAccount({ ...person, department_id: person.department_id ?? "", manager_id: person.manager_id ?? "", salary: person.salary ?? "" });
    api.get(`/users/${person.user_id}`).then((d) => {
      const p = {};
      for (const k of ["age", "gender", "marital_status", "job_role", "job_level", "monthly_income", "overtime",
        "job_satisfaction", "environment_satisfaction", "work_life_balance", "years_at_company"]) {
        p[k] = d[k] === null || d[k] === undefined ? "" : String(d[k]);
      }
      resetProfile(p); setOriginal(p);
    }).catch((e) => setError(e.message));
  }, [person]); // eslint-disable-line

  const run = async (label, fn, message) => {
    setBusy(label); setError(null);
    try { await fn(); onDone(message); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const saveAccount = () => run("account", () => {
    const body = clean(account, ["role_id", "department_id", "manager_id", "salary"]);
    const allowed = ["first_name", "last_name", "email", "role_id", "department_id", "manager_id", "salary", "status"];
    return api.patch(`/users/${person.user_id}`, Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k))));
  }, "Account details saved.");

  const saveProfile = () => run("profile", () => {
    const changed = Object.fromEntries(Object.entries(profile).filter(([k, v]) => v !== original[k]));
    return api.patch(`/users/${person.user_id}/profile`, clean(changed, PROFILE_NUMBERS, ["overtime"]));
  }, "HR profile saved. Retrain the model to update this person's risk score.");

  const resetPassword = () => run("password", () => api.post(`/users/${person.user_id}/reset-password`, { new_password: password }),
    "Password reset. Share the new password with them securely.");

  return (
    <Modal open={Boolean(person)} onClose={onClose} title={person ? `${person.first_name} ${person.last_name}` : ""} wide>
      {person && (
        <>
          <div className="modal-section">
            <h4>Account</h4>
            <AccountFields form={account} set={setAccount} departments={departments} />
            <div className="form-actions">
              <button className="btn primary" onClick={saveAccount} disabled={busy === "account"}>{busy === "account" ? "Saving…" : "Save account"}</button>
            </div>
          </div>
          <div className="modal-section">
            <h4>HR profile</h4>
            <ProfileFields form={profile} set={setProfile} />
            <div className="form-actions">
              <button className="btn primary" onClick={saveProfile} disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save profile"}</button>
            </div>
          </div>
          <div className="modal-section">
            <h4>Reset password</h4>
            <div className="inline-edit">
              <input type="password" placeholder="New password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1 }} />
              <button className="btn ghost" onClick={resetPassword} disabled={password.length < 8 || busy === "password"}>Reset</button>
            </div>
          </div>
          {error && <ErrorBox message={error} />}
          <p className="muted small">Every change is recorded automatically in the Audit Log by database triggers.</p>
        </>
      )}
    </Modal>
  );
}

function PeopleTab({ notify }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [roleId, setRoleId] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setSkip(0); }, 300); return () => clearTimeout(t); }, [search]);
  const departments = useApi("/departments/");
  const deptName = Object.fromEntries((departments.data ?? []).map((d) => [d.department_id, d.department_name]));
  const users = useApi("/users/", { search: q, role_id: roleId, status, skip, limit: 15 });
  const done = (msg) => { notify(msg); users.reload(); };

  return (
    <Card>
      <div className="filter-row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div className="filter-row">
          <div className="search"><Search size={15} /><input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Segmented id="people-role" value={roleId} onChange={(v) => { setRoleId(v); setSkip(0); }}
            options={[{ value: "", label: "All" }, { value: "1", label: "Admins" }, { value: "2", label: "Managers" }, { value: "3", label: "Employees" }]} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }}>
            <option value="">Any status</option><option value="ACTIVE">Active</option><option value="EXITED">Exited</option>
          </select>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> Add person</button>
      </div>

      {users.loading ? <Loading rows={8} /> : users.error ? <ErrorBox message={users.error} /> : (
        <>
          <div className="table-wrap">
            <table className="table clickable">
              <thead><tr><th>ID</th><th>Person</th><th>Role</th><th>Department</th><th>Salary</th><th>Status</th><th /></tr></thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.user_id} onClick={() => setEditing(u)}>
                    <td className="muted">#{u.user_id}</td>
                    <td><Person name={`${u.first_name} ${u.last_name}`} sub={u.email} /></td>
                    <td><Badge value={ROLE_KEY[u.role_id]} label={ROLE_NAMES[u.role_id]} /></td>
                    <td>{deptName[u.department_id] ?? "—"}</td>
                    <td>{fmt.money(u.salary)}</td>
                    <td><Badge value={u.status} /></td>
                    <td className="row-actions"><span className="link">Edit</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={users.data.total} skip={skip} limit={15} onChange={setSkip} />
        </>
      )}

      <AddPersonModal open={adding} onClose={() => setAdding(false)} departments={departments.data ?? []} onDone={done} />
      <EditPersonModal person={editing} onClose={() => setEditing(null)} departments={departments.data ?? []} onDone={done} />
    </Card>
  );
}

// ======================================================================
// Departments and leave types (small editable tables)
// ======================================================================
function DepartmentsTab({ notify }) {
  const departments = useApi("/departments/");
  const [drafts, setDrafts] = useState({});
  const [newDept, setNewDept] = useState({ department_name: "", budget: "" });
  const [error, setError] = useState(null);

  const draft = (d) => drafts[d.department_id] ?? { department_name: d.department_name, budget: d.budget ?? "" };
  const edit = (d, key, value) => setDrafts((x) => ({ ...x, [d.department_id]: { ...draft(d), [key]: value } }));
  const act = async (fn, msg) => {
    setError(null);
    try { await fn(); notify(msg); setDrafts({}); departments.reload(); } catch (e) { setError(e.message); }
  };

  return (
    <Card title="Departments" subtitle="Department names are unique. A department can only be deleted once nobody is in it.">
      {departments.loading ? <Loading rows={3} /> : departments.error ? <ErrorBox message={departments.error} /> : (
        <table className="table">
          <thead><tr><th>ID</th><th>Name</th><th>Budget</th><th /></tr></thead>
          <tbody>
            {departments.data.map((d) => (
              <tr key={d.department_id}>
                <td className="muted">#{d.department_id}</td>
                <td><input value={draft(d).department_name} onChange={(e) => edit(d, "department_name", e.target.value)} /></td>
                <td><input type="number" min="0" value={draft(d).budget} onChange={(e) => edit(d, "budget", e.target.value)} /></td>
                <td className="row-actions">
                  <button className="btn ghost small" disabled={!drafts[d.department_id]}
                    onClick={() => act(() => api.patch(`/departments/${d.department_id}`, clean(draft(d), ["budget"])), "Department saved.")}>Save</button>
                  <button className="icon-btn" title="Delete"
                    onClick={() => window.confirm(`Delete ${d.department_name}?`) && act(() => api.del(`/departments/${d.department_id}`), "Department deleted.")}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="muted">New</td>
              <td><input placeholder="Department name" value={newDept.department_name} onChange={(e) => setNewDept({ ...newDept, department_name: e.target.value })} /></td>
              <td><input type="number" min="0" placeholder="Budget" value={newDept.budget} onChange={(e) => setNewDept({ ...newDept, budget: e.target.value })} /></td>
              <td className="row-actions">
                <button className="btn primary small" disabled={!newDept.department_name.trim()}
                  onClick={() => act(async () => { await api.post("/departments/", clean(newDept, ["budget"])); setNewDept({ department_name: "", budget: "" }); }, "Department added.")}>
                  <Plus size={14} /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

function LeaveTypesTab({ notify }) {
  const types = useApi("/leave/types");
  const [drafts, setDrafts] = useState({});
  const [newType, setNewType] = useState({ type_name: "", max_days: "" });
  const [error, setError] = useState(null);

  const draft = (t) => drafts[t.leave_type_id] ?? { type_name: t.type_name, max_days: t.max_days };
  const edit = (t, key, value) => setDrafts((x) => ({ ...x, [t.leave_type_id]: { ...draft(t), [key]: value } }));
  const act = async (fn, msg) => {
    setError(null);
    try { await fn(); notify(msg); setDrafts({}); types.reload(); } catch (e) { setError(e.message); }
  };

  return (
    <Card title="Leave types" subtitle="The yearly limit here is what the leave-validation trigger enforces.">
      {types.loading ? <Loading rows={3} /> : types.error ? <ErrorBox message={types.error} /> : (
        <table className="table">
          <thead><tr><th>Code</th><th>Days per year</th><th /></tr></thead>
          <tbody>
            {types.data.map((t) => (
              <tr key={t.leave_type_id}>
                <td><input value={draft(t).type_name} onChange={(e) => edit(t, "type_name", e.target.value)} maxLength={10} /></td>
                <td><input type="number" min="1" max="365" value={draft(t).max_days} onChange={(e) => edit(t, "max_days", e.target.value)} /></td>
                <td className="row-actions">
                  <button className="btn ghost small" disabled={!drafts[t.leave_type_id]}
                    onClick={() => act(() => api.patch(`/leave/types/${t.leave_type_id}`, clean(draft(t), ["max_days"])), "Leave type saved.")}>Save</button>
                </td>
              </tr>
            ))}
            <tr>
              <td><input placeholder="e.g. ML" value={newType.type_name} maxLength={10} onChange={(e) => setNewType({ ...newType, type_name: e.target.value })} /></td>
              <td><input type="number" min="1" max="365" placeholder="Days" value={newType.max_days} onChange={(e) => setNewType({ ...newType, max_days: e.target.value })} /></td>
              <td className="row-actions">
                <button className="btn primary small" disabled={!newType.type_name.trim() || !newType.max_days}
                  onClick={() => act(async () => { await api.post("/leave/types", clean(newType, ["max_days"])); setNewType({ type_name: "", max_days: "" }); }, "Leave type added.")}>
                  <Plus size={14} /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

// ======================================================================
// Attendance and reviews (look up a person, then record)
// ======================================================================
function usePersonLookup() {
  const [userId, setUserId] = useState("");
  const [person, setPerson] = useState(null);
  useEffect(() => {
    setPerson(null);
    if (!userId) return undefined;
    const t = setTimeout(() => {
      api.get(`/users/${userId}`).then(setPerson).catch(() => setPerson({ error: "No user with that ID" }));
    }, 300);
    return () => clearTimeout(t);
  }, [userId]);
  return [userId, setUserId, person];
}

function PersonHint({ person }) {
  if (!person) return null;
  if (person.error) return <span className="small red">{person.error}</span>;
  return <span className="small green">✓ {person.full_name} · {person.department_name ?? "no department"}</span>;
}

function AttendanceTab({ notify }) {
  const [userId, setUserId, person] = usePersonLookup();
  const [form, set, setForm] = useForm({ date: today(), status: "PRESENT", check_in: "09:00", check_out: "17:30" });
  const [error, setError] = useState(null);
  const records = useApi(person && !person.error ? "/attendance/" : null, { user_id: userId, limit: 10 });
  const present = form.status === "PRESENT" || form.status === "LATE";

  const save = async () => {
    setError(null);
    try {
      await api.put("/attendance/", {
        user_id: Number(userId), date: form.date, status: form.status,
        check_in: present && form.check_in ? `${form.date}T${form.check_in}:00` : null,
        check_out: present && form.check_out ? `${form.date}T${form.check_out}:00` : null,
      });
      notify(`Attendance for ${person.full_name} on ${fmt.date(form.date)} saved.`);
      records.reload();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="grid two">
      <Card title="Record or correct attendance" subtitle="Saving the same person and date again overwrites it (an upsert).">
        <div className="form-grid">
          <Field label="Employee ID"><input type="number" min="1" value={userId} onChange={(e) => setUserId(e.target.value)} /></Field>
          <Field label="Date"><input type="date" value={form.date} onChange={set("date")} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="PRESENT">Present</option><option value="LATE">Late</option>
              <option value="ABSENT">Absent</option><option value="ON_LEAVE">On leave</option>
            </select>
          </Field>
          {present && <Field label="Check-in"><input type="time" value={form.check_in} onChange={set("check_in")} /></Field>}
          {present && <Field label="Check-out"><input type="time" value={form.check_out} onChange={set("check_out")} /></Field>}
        </div>
        <div style={{ marginTop: 10 }}><PersonHint person={person} /></div>
        {error && <div style={{ marginTop: 12 }}><ErrorBox message={error} /></div>}
        <div className="form-actions">
          <button className="btn primary" onClick={save} disabled={!person || person.error}>Save attendance</button>
        </div>
      </Card>
      <Card title="Recent records" subtitle={person && !person.error ? person.full_name : "Enter an employee ID"}>
        {!person || person.error || !records.data ? <div className="state">No one selected.</div> : records.data.items.length === 0 ? <div className="state">No records.</div> : (
          <table className="table compact">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
            <tbody>
              {records.data.items.map((r) => (
                <tr key={r.attendance_id}><td>{fmt.date(r.date)}</td><td>{fmt.time(r.check_in)}</td><td>{fmt.time(r.check_out)}</td><td><Badge value={r.status} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ReviewsTab({ notify }) {
  const [userId, setUserId, person] = usePersonLookup();
  const [form, set, setForm] = useForm({ rating: "3", review_date: today(), feedback: "" });
  const [error, setError] = useState(null);
  const reviews = useApi(person && !person.error ? `/users/${userId}/reviews` : null);

  const save = async () => {
    setError(null);
    try {
      await api.post(`/users/${userId}/reviews`, { rating: Number(form.rating), review_date: form.review_date, feedback: form.feedback || null });
      notify(`Review added for ${person.full_name}.`);
      setForm({ ...form, feedback: "" });
      reviews.reload();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="grid two">
      <Card title="Add a performance review" subtitle="You are recorded as the reviewer.">
        <div className="form-grid">
          <Field label="Employee ID"><input type="number" min="1" value={userId} onChange={(e) => setUserId(e.target.value)} /></Field>
          <Field label="Rating">
            <select value={form.rating} onChange={set("rating")}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select>
          </Field>
          <Field label="Review date"><input type="date" value={form.review_date} onChange={set("review_date")} /></Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Feedback"><textarea value={form.feedback} onChange={set("feedback")} placeholder="Optional" /></Field>
        </div>
        <div style={{ marginTop: 10 }}><PersonHint person={person} /></div>
        {error && <div style={{ marginTop: 12 }}><ErrorBox message={error} /></div>}
        <div className="form-actions">
          <button className="btn primary" onClick={save} disabled={!person || person.error}>Add review</button>
        </div>
      </Card>
      <Card title="Past reviews" subtitle={person && !person.error ? person.full_name : "Enter an employee ID"}>
        {!person || person.error || !reviews.data ? <div className="state">No one selected.</div> : reviews.data.length === 0 ? <div className="state">No reviews yet.</div> :
          reviews.data.map((r) => (
            <div key={r.review_id} className="review">
              <div><strong>{"★".repeat(r.rating)}</strong><span className="muted">{"★".repeat(5 - r.rating)}</span></div>
              {r.feedback && <p>{r.feedback}</p>}
              <span className="muted small">{fmt.date(r.review_date)} · reviewer #{r.reviewer_id}</span>
            </div>
          ))}
      </Card>
    </div>
  );
}

// ======================================================================
// ML model: retrain from the website
// ======================================================================
function ModelTab({ notify }) {
  const info = useApi("/predictions/model-info");
  const [status, setStatus] = useState(null);

  const poll = useCallback(async () => {
    try {
      const s = await api.get("/predictions/retrain/status");
      setStatus(s);
      if (s.state === "running") setTimeout(poll, 2000);
      else if (s.state === "done") { notify(s.message); info.reload(); }
    } catch { /* ignore, next click will retry */ }
  }, []); // eslint-disable-line

  useEffect(() => { poll(); }, [poll]);

  const retrain = async () => {
    try { setStatus(await api.post("/predictions/retrain", {})); setTimeout(poll, 1500); }
    catch (e) { setStatus({ state: "failed", message: e.message }); }
  };

  const m = info.data;
  return (
    <div className="grid two">
      <Card title="Retrain the attrition model" subtitle="Uses the latest data in the database, compares two models and re-scores every active employee.">
        {info.loading ? <Loading rows={3} /> : info.error ? <ErrorBox message={info.error} /> : (
          <dl className="details" style={{ marginBottom: 18 }}>
            <dt>Current model</dt><dd>{m.model_name}</dd>
            <dt>Trained</dt><dd>{fmt.datetime(m.trained_at)}</dd>
            <dt>Training rows</dt><dd>{m.training_rows}</dd>
            <dt>ROC-AUC</dt><dd>{m.metrics.roc_auc}</dd>
            <dt>Employees scored</dt><dd>{m.active_employees_scored}</dd>
          </dl>
        )}
        {status && status.state !== "idle" && (
          <div className="retrain-status" style={{ marginBottom: 14 }}>
            {status.state === "running" && <span className="spinner" />}
            <span>{status.state === "running" ? "Training… this takes about 10–30 seconds." : status.message}</span>
          </div>
        )}
        <button className="btn primary" onClick={retrain} disabled={status?.state === "running"}>
          <RefreshCw size={15} /> {status?.state === "running" ? "Training…" : "Retrain now"}
        </button>
      </Card>
      <Card title="Training history" subtitle="Stored in the model_runs table.">
        {!m?.history?.length ? <div className="state">No runs recorded yet.</div> : (
          <table className="table compact">
            <thead><tr><th>Run</th><th>When</th><th>Model</th><th>Rows</th><th>ROC-AUC</th><th>By</th></tr></thead>
            <tbody>
              {m.history.map((h) => (
                <tr key={h.run_id}>
                  <td className="muted">#{h.run_id}</td><td>{fmt.datetime(h.trained_at)}</td><td>{h.model_name}</td>
                  <td>{h.training_rows}</td><td>{h.roc_auc}</td><td>{h.triggered_by ?? "script"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ======================================================================
export default function Admin() {
  const [tab, setTab] = useState("people");
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message) => setToast({ type: "success", message }), []);

  return (
    <>
      <PageHeader eyebrow="Admin only" title="Administration"
        subtitle="Manage people, structure and data from here. No database access needed." />
      <div className="admin-tabs">
        <Segmented id="admin-tab" options={TABS} value={tab} onChange={setTab} />
      </div>
      <Reveal key={tab}>
        {tab === "people" && <PeopleTab notify={notify} />}
        {tab === "departments" && <DepartmentsTab notify={notify} />}
        {tab === "leave-types" && <LeaveTypesTab notify={notify} />}
        {tab === "attendance" && <AttendanceTab notify={notify} />}
        {tab === "reviews" && <ReviewsTab notify={notify} />}
        {tab === "model" && <ModelTab notify={notify} />}
      </Reveal>
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}
