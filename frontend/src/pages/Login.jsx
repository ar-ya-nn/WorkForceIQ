import { ArrowRight, Lock, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    script.addEventListener("load", resolve);
    script.addEventListener("error", reject);
    if (!existing) { script.src = GOOGLE_SCRIPT; script.async = true; document.head.appendChild(script); }
  });
}

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const googleSlot = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const goHome = (user) => navigate(user.role === "EMPLOYEE" ? "/me" : "/", { replace: true });

  // Show "Sign in with Google" only if the server has a Google client ID configured
  useEffect(() => {
    let cancelled = false;
    api.get("/auth/config").then(async ({ google_client_id: clientId }) => {
      if (!clientId || cancelled) return;
      await loadGoogleScript();
      if (cancelled || !googleSlot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setBusy(true); setError(null);
          try { goHome(await loginWithGoogle(credential)); }
          catch (err) { setError(err.message); }
          finally { setBusy(false); }
        },
      });
      window.google.accounts.id.renderButton(googleSlot.current, {
        theme: "outline", size: "large", shape: "pill", text: "signin_with", width: 336,
      });
      setGoogleReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      goHome(await login(email, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}
      >
        <div className="brand-mark login-mark">W</div>
        <h1 className="login-title">Sign in to WorkForceIQ</h1>
        <p className="login-sub">Workforce analytics for your organisation.</p>

        <div className="card login-card">
          <form onSubmit={submit} className="login-form">
            <label className="field">
              <span>Email</span>
              <div className="input-icon">
                <Mail size={16} />
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com" required autoFocus />
              </div>
            </label>
            <label className="field">
              <span>Password</span>
              <div className="input-icon">
                <Lock size={16} />
                <input type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
              </div>
            </label>
            {error && <div className="login-error">{error}</div>}
            <button className="btn primary login-btn" disabled={busy}>
              {busy ? "Signing in…" : <>Sign in <ArrowRight size={16} /></>}
            </button>
          </form>
          <div style={{ display: googleReady ? "block" : "none" }}>
            <div className="login-divider">or</div>
            <div className="google-slot" ref={googleSlot} />
          </div>
        </div>

        <p className="login-foot">Forgot your password? Ask your administrator to reset it.</p>
      </motion.div>
    </div>
  );
}
