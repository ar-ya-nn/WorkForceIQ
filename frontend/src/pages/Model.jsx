import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, useApi } from "../api.js";
import { Card, ChartGradients, ErrorBox, Loading, PageHeader, Reveal, StatCard } from "../components/ui.jsx";
import { COLORS, axisProps, tooltipProps } from "./chartTheme.js";

const CATEGORIES = ["department_name", "job_role", "business_travel", "marital_status", "education_field", "gender"];
/** "job_role_Sales Representative" -> "Job role: Sales Representative" */
const pretty = (name) => {
  const cat = CATEGORIES.find((c) => name.startsWith(c + "_"));
  const label = (x) => x.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
  return cat ? `${label(cat.replace("_name", ""))}: ${name.slice(cat.length + 1).replace(/_/g, " ")}` : label(name);
};

/** The model's quality, said in everyday words. */
function plainSummary(m) {
  const recall = m.metrics.recall, precision = m.metrics.precision, auc = m.metrics.roc_auc;
  const caught = Math.round(recall * 4);
  const right = Math.max(1, Math.round(precision * 10));
  const quality = auc >= 0.8 ? "good" : auc >= 0.7 ? "fair" : "weak";
  const warning = m.top_factors.filter((f) => (f.weight ?? f.importance) > 0).slice(0, 3).map((f) => pretty(f.feature).toLowerCase());
  return [
    `The model does a ${quality} job of telling apart people who leave from people who stay.`,
    `Out of every 4 employees who actually left, it would have flagged about ${caught}.`,
    `When it flags someone, it's right about ${right} times in 10, so treat a flag as "worth a conversation", not a certainty.`,
    warning.length ? `The strongest warning signs it learned are ${warning.slice(0, -1).join(", ")}${warning.length > 1 ? " and " : ""}${warning[warning.length - 1]}.` : null,
  ].filter(Boolean);
}

export default function Model() {
  const info = useApi("/predictions/model-info");

  if (info.loading) return <Loading rows={6} />;
  if (info.error) return <ErrorBox message={info.error} />;

  const m = info.data;
  const cm = m.metrics.confusion_matrix;
  const factors = m.top_factors.map((f) => ({
    name: pretty(f.feature),
    value: f.weight ?? f.importance,
  })).reverse();

  return (
    <>
      <PageHeader eyebrow="Machine learning" title="Attrition Model" subtitle={`${m.model_name} · trained ${fmt.datetime(m.trained_at)} on ${m.training_rows} employees`} />

      <Reveal delay={0.05}>
        <Card title="In plain words">
          {plainSummary(m).map((line, i) => (
            <p key={i} className="narrative" style={{ marginBottom: 8 }}>{i === 0 ? <strong>{line}</strong> : line}</p>
          ))}
          <p className="xai-note">Individual explanations ("why is this person at risk?") are in each employee's profile panel.
            {m.explanation_method ? ` Explanation method: ${m.explanation_method}.` : ""}</p>
        </Card>
      </Reveal>

      <Reveal delay={0.1} className="grid stats">
        <StatCard label="ROC-AUC" value={m.metrics.roc_auc} decimals={3} tone="violet" hint="0.5 = guessing, 1.0 = perfect" />
        <StatCard label="Recall" value={m.metrics.recall * 100} suffix="%" decimals={1} tone="green" hint="of leavers caught" />
        <StatCard label="Precision" value={m.metrics.precision * 100} suffix="%" decimals={1} tone="amber" hint="of flags correct" />
        <StatCard label="F1 score" value={m.metrics.f1} decimals={3} tone="cyan" />
      </Reveal>

      <Reveal delay={0.2} className="grid two">
        <Card title="Top risk factors" subtitle="Red pushes risk up, green pulls it down">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart layout="vertical" data={factors} margin={{ left: 60 }}>
              <ChartGradients />
              <CartesianGrid stroke={COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="name" {...axisProps} width={190} />
              <Tooltip {...tooltipProps} formatter={(v) => [Number(v).toFixed(3), "Weight"]} />
              <Bar dataKey="value" barSize={16} radius={6} animationDuration={1100}>
                {factors.map((f) => <Cell key={f.name} fill={f.value >= 0 ? "url(#grad-h-red)" : "url(#grad-h-green)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="stack">
          <Card title="Confusion matrix" subtitle="Out-of-fold predictions at a 50% threshold">
            <div className="confusion">
              <div />
              <div className="muted small center">Predicted stay</div>
              <div className="muted small center">Predicted leave</div>
              <div className="muted small">Actually stayed</div>
              <div className="cm good">{cm.true_negative}</div>
              <div className="cm bad">{cm.false_positive}</div>
              <div className="muted small">Actually left</div>
              <div className="cm bad">{cm.false_negative}</div>
              <div className="cm good">{cm.true_positive}</div>
            </div>
          </Card>

          <Card title="Model comparison" subtitle={m.validation}>
            <table className="table compact">
              <thead><tr><th>Model</th><th>ROC-AUC</th><th>Recall</th><th>F1</th></tr></thead>
              <tbody>
                {Object.entries(m.comparison).map(([name, r]) => (
                  <tr key={name} className={name === m.model_name ? "highlight" : ""}>
                    <td>{name}{name === m.model_name && " ✓"}</td>
                    <td>{r.roc_auc}</td><td>{r.recall}</td><td>{r.f1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </Reveal>
    </>
  );
}
