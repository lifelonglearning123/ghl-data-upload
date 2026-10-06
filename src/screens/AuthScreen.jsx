import { useState } from "react";
import { login, signup } from "../lib/api.js";

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuthed(await (isSignup ? signup : login)(email, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <main className="card auth-card">
        <form onSubmit={submit}>
          <h1>{isSignup ? "Create your account" : "Sign in"}</h1>
          <p className="muted">
            {isSignup
              ? "Save your sub-account details once and upload contacts any time."
              : "Welcome back. Sign in to upload contacts."}
          </p>

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              required
            />
            {isSignup && <small className="muted">At least 8 characters.</small>}
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary block" disabled={busy}>
            {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>

          <p className="switch muted">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setError("");
              }}
            >
              {isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
