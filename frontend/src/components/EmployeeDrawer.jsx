
import { Lightbulb, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt } from "../api.js";
import { Avatar, Badge, Drawer, ErrorBox, Loading } from "./ui.jsx";

const SCALE = { 1: "Low", 2: "Medium", 3: "High", 4: "Very high" };

/** Side panel with everything about one employee: profile, risk, leave balance, reviews. */
export default function EmployeeDrawer({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    setData(null);
    setError(null);

    Promise.allSettled([
      api.get(`/users/${userId}`),
      api.get(`/predictions/${userId}/explain`),
      api.get(`/leave/balance/${userId}`),
      api.get(`/users/${userId}/reviews`),
    ]).then(([details, explain, balance, reviews]) => {
      if (cancelled) return;

      if (details.status === "rejected") {
        setError(
          details.reason?.message ||
            "Unable to load employee details. Please try again."
        );
        return;
      }

      setData({
        details: details.value,
        explain: explain.status === "fulfilled" ? explain.value : null,
        explainError:
          explain.status === "rejected"
            ? explain.reason?.message ||
              "Unable to load the employee risk explanation."
            : null,
        balance: balance.status === "fulfilled" ? balance.value : [],
        balanceError:
          balance.status === "rejected"
            ? balance.reason?.message ||
              "Unable to load leave balance information."
            : null,
        reviews: reviews.status === "fulfilled" ? reviews.value : [],
        reviewsError:
          reviews.status === "rejected"
            ? reviews.reason?.message ||
              "Unable to load performance reviews."
            : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const d = data?.details;

  return (
    <Drawer
      open={Boolean(userId)}
      onClose={onClose}
      title="Employee profile"
    >
      {error && <ErrorBox message={error} />}

      {!data && !error && <Loading rows={7} />}

      {d && (
        <>
          <div className="drawer-profile">
            <Avatar name={d.full_name} size={56} />
            <div>
              <div className="drawer-name">{d.full_name}</div>
              <div className="muted small">
                {d.job_role ?? d.role_name} · #{d.user_id}
              </div>
            </div>
          </div>

          <div className="drawer-tags">
            <Badge value={d.status} />

            {data.explain && (
              <Badge
                value={data.explain.level}
                label={data.explain.headline}
              />
            )}

            <span className="muted small">
              {d.role_name} · {d.department_name ?? "No department"}
            </span>
          </div>

          {data.explain && <Explanation x={data.explain} />}

          {!data.explain && data.explainError && d.status === "ACTIVE" && (
            <p className="xai-note" style={{ marginTop: 16 }}>
              {data.explainError}
            </p>
          )}

          <h4>Profile</h4>

          <dl className="details">
            <dt>Email</dt>
            <dd>{d.email}</dd>

            <dt>Job role</dt>
            <dd>{d.job_role ?? "—"}</dd>

            <dt>Job level</dt>
            <dd>{d.job_level ?? "—"}</dd>

            <dt>Age / gender</dt>
            <dd>{d.age ?? "—"} / {d.gender ?? "—"}</dd>

            <dt>Joined</dt>
            <dd>
              {fmt.date(d.joining_date)} ({d.years_at_company ?? 0} yrs)
            </dd>

            <dt>Monthly income</dt>
            <dd>{fmt.money(d.monthly_income)}</dd>

            <dt>Overtime</dt>
            <dd>
              {d.overtime == null ? "—" : d.overtime ? "Yes" : "No"}
            </dd>

            <dt>Job satisfaction</dt>
            <dd>{SCALE[d.job_satisfaction] ?? "—"}</dd>

            <dt>Work-life balance</dt>
            <dd>{SCALE[d.work_life_balance] ?? "—"}</dd>

            <dt>Since last promotion</dt>
            <dd>{d.years_since_last_promotion ?? "—"} yrs</dd>
          </dl>

          <h4>Leave balance (this year)</h4>

          {data.balanceError ? (
            <p className="muted small">{data.balanceError}</p>
          ) : data.balance.length > 0 ? (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Taken</th>
                  <th>Pending</th>
                  <th>Left</th>
                </tr>
              </thead>

              <tbody>
                {data.balance.map((b) => (
                  <tr key={b.type_name}>
                    <td>{b.type_name}</td>
                    <td>{b.days_taken}</td>
                    <td>{b.days_pending}</td>
                    <td>
                      {b.days_remaining} / {b.max_days}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">
              No leave balance records available.
            </p>
          )}

          <h4>Performance reviews</h4>

          {data.reviewsError ? (
            <p className="muted small">{data.reviewsError}</p>
          ) : data.reviews.length > 0 ? (
            data.reviews.map((r) => (
              <div key={r.review_id} className="review">
                <div>
                  <strong>{"★".repeat(r.rating)}</strong>
                  <span className="muted">
                    {"★".repeat(Math.max(0, 5 - r.rating))}
                  </span>
                </div>

                <p>{r.feedback || "No written feedback provided."}</p>

                <span className="muted small">
                  {fmt.date(r.review_date)} · reviewer #{r.reviewer_id}
                </span>
              </div>
            ))
          ) : (
            <p className="muted small">
              No performance reviews available.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}

/** Explainable AI in plain language: why this person is (or isn't) at risk, and what could help. */
function Explanation({ x }) {
  return (
    <div className="xai">
      <div className="xai-head">
        <div className="xai-headline">
          <Sparkles size={18} /> {x.headline}
        </div>

        <p className="xai-summary">{x.summary}</p>

        {x.likelihood && (
          <p className="xai-likelihood">
            {x.likelihood}
            {x.caution ? ` ${x.caution}` : ""}
          </p>
        )}
      </div>

      {x.reasons_up?.length > 0 && (
        <div>
          <h4>What raises the risk</h4>
          <ul className="xai-list">
            {x.reasons_up.map((r) => (
              <li key={r.text}>
                <span className="xai-mark up">↑</span>
                <span>
                  {r.text}
                  {r.personal && (
                    <span className="xai-personal">
                      {" "}· personal background, not something to act on
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {x.reasons_down?.length > 0 && (
        <div>
          <h4>What keeps them here</h4>
          <ul className="xai-list">
            {x.reasons_down.map((r) => (
              <li key={r.text}>
                <span className="xai-mark down">↓</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {x.actions?.length > 0 && (
        <div>
          <h4>Suggested next steps</h4>
          <div className="stack" style={{ gap: 8 }}>
            {x.actions.map((a) => (
              <div key={a.action} className="xai-action">
                <strong>
                  <Lightbulb
                    size={14}
                    style={{ verticalAlign: -2, marginRight: 6 }}
                  />
                  {a.action}
                </strong>
                <span>{a.because}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="xai-note">
        {x.disclaimer}
        {x.method ? ` Method: ${x.method}.` : ""}
      </p>
    </div>
  );
}
