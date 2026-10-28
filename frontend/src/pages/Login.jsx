import { ArrowRight, Lock, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");

/** Official multicolour "G" mark */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(null);

  const goHome = (user) => navigate(user.role === "EMPLOYEE" ? "/me" : "/", { replace: true });

  // Is Google sign-in configured on the server?
  useEffect(() => {
    api.get("/auth/config").then((c) => setGoogleClientId(c.google_client_id)).catch(() => {});
  }, []);

  // Back from Google: check it's the reply to OUR request (state), then sign in with the ID token
  useEffect(() => {
    const raw = sessionStorage.getItem("wfiq_google_return");
    if (!raw) return;
    sessionStorage.removeItem("wfiq_google_return");
    const { token, state, error: googleError } = JSON.parse(raw);
    const expected = JSON.parse(sessionStorage.getItem("wfiq_google_request") || "{}");
    sessionStorage.removeItem("wfiq_google_request");
    if (googleError) { setError(googleError === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed (${googleError}).`); return; }
    if (!token || state !== expected.state) { setError("Google sign-in failed (security check). Please try again."); return; }
    setBusy(true);
    loginWithGoogle(token, expected.nonce).then(goHome).catch((err) => setError(err.message)).finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Our own button: always opens Google's account chooser (no one-click "Sign in as …")
  const signInWithGoogle = () => {
    const request = { state: random(), nonce: random() };
    sessionStorage.setItem("wfiq_google_request", JSON.stringify(request));
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: window.location.origin,
      response_type: "id_token",
      scope: "openid email profile",
      prompt: "select_account",   // always show the account chooser
      max_age: "0",               // ask Google to re-check the user (Google decides whether to ask for the password)
      state: request.state,
      nonce: request.nonce,
    });
    window.location.assign(`${GOOGLE_AUTH}?${params}`);
  };

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
        <img src="/logo.svg" alt="WorkForceIQ" className="brand-logo login-logo" />
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
          {googleClientId && (
            <>
              <div className="login-divider">or</div>
              <button type="button" className="btn ghost google-btn" onClick={signInWithGoogle} disabled={busy}>
                <GoogleMark /> Continue with Google
              </button>
            </>
          )}
        </div>

        <p className="login-foot">Forgot your password? Ask your administrator to reset it.</p>
      </motion.div>
    </div>
  );
}
