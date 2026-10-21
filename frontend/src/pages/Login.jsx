import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { ROLE_LABEL, useAuth } from "../auth.jsx";
import BlurText from "../components/rb/BlurText.jsx";
import ShinyText from "../components/rb/ShinyText.jsx";
import SpotlightCard from "../components/rb/SpotlightCard.jsx";
import { Badge } from "../components/ui.jsx";

const CARD_STYLE = {
  "--spotlight-card-surface": "rgba(15, 17, 26, 0.9)",
  "--spotlight-card-border": "rgba(255, 255, 255, 0.1)",
  "--spotlight-card-shadow": "0 30px 80px -20px rgba(0,0,0,0.7)",
};
const ROLE_TONE = { ADMIN: "HIGH", MANAGER: "MEDIUM", EMPLOYEE: "LOW" };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(null);

  useEffect(() => {
    api.get("/auth/demo-accounts").then(setDemo).catch(() => setDemo(null));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(user.role === "EMPLOYEE" ? "/me" : "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fill = (account) => {
    setEmail(account.email);
    setPassword(demo.password);
    setError(null);
  };

  return (
    <div className="login-page">
      <div className="login-intro">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <ShinyText text="WorkForceIQ" color="#cfd2ff" shineColor="#ffffff" speed={3} className="brand-name" />
            <div className="brand-sub">HR Analytics</div>
          </div>
        </div>
        <div className="login-title" role="heading" aria-level={1}>
          <BlurText text="Sign in to your workspace" delay={90} direction="bottom" trigger="load" />
        </div>
        <p className="muted">
          Access depends on your role: admins see everything, managers see their department,
          employees see their own records.
        </p>
      </div>

      <SpotlightCard className="login-card" style={CARD_STYLE} spotlightColor="#c4b5fd" intensity={0.14} borderGlow={0.6}>
        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span className="muted small">Email</span>
            <div className="input-icon">
              <Mail size={16} />
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@workforceiq.com" required />
            </div>
          </label>
          <label className="field">
            <span className="muted small">Password</span>
            <div className="input-icon">
              <Lock size={16} />
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="btn primary login-btn" disabled={busy}>
            {busy ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
          </button>
        </form>

        {demo?.enabled && demo.accounts.length > 0 && (
          <div className="demo-accounts">
            <div className="demo-head">
              <ShieldCheck size={15} />
              <span>Demo accounts · password <code>{demo.password}</code></span>
            </div>
            {demo.accounts.map((a) => (
              <button key={a.email} type="button" className="demo-account" onClick={() => fill(a)}>
                <div>
                  <div className="person-name">{a.name}</div>
                  <div className="muted small">{a.email}{a.department_name ? ` · ${a.department_name}` : ""}</div>
                </div>
                <Badge value={ROLE_TONE[a.role]} label={ROLE_LABEL[a.role]} />
              </button>
            ))}
          </div>
        )}
      </SpotlightCard>
    </div>
  );
}
