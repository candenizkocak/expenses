"use client";

import { CheckCircle, Receipt, ScanLine, Zap } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      {/* Left brand panel */}
      <div className="login-brand">
        <div className="login-brand-top">
          <div className="login-brand-logo">
            <span className="login-brand-mark">E</span>
            <span className="login-brand-name">ExpenseKit</span>
          </div>

          <div>
            <h1 className="login-brand-headline">
              Smarter expense<br />management for your team
            </h1>
            <p className="login-brand-sub">
              Capture receipts with a kiosk, auto-extract data with AI,
              and approve expenses in seconds — all in one place.
            </p>
          </div>

          <div className="login-brand-features">
            <div className="login-feature">
              <span className="login-feature-icon"><ScanLine size={17} /></span>
              <div>
                <div className="login-feature-title">RFID Kiosk</div>
                <div className="login-feature-desc">Employees scan in and submit receipts instantly at the kiosk terminal.</div>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon"><Zap size={17} /></span>
              <div>
                <div className="login-feature-title">AI-Powered OCR</div>
                <div className="login-feature-desc">Gemini extracts merchant, amount, and tax data automatically.</div>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon"><CheckCircle size={17} /></span>
              <div>
                <div className="login-feature-title">One-click approvals</div>
                <div className="login-feature-desc">Managers review and approve expenses from a clean dashboard.</div>
              </div>
            </div>
          </div>
        </div>

        <p className="login-brand-footer">© {new Date().getFullYear()} ExpenseKit</p>
      </div>

      {/* Right form panel */}
      <div className="login-form-area">
        <div className="login-form-wrap">
          <p className="login-form-eyebrow">
            <Receipt size={13} /> Manager &amp; Employee
          </p>
          <h2 className="login-form-title">Sign in to your account</h2>
          <p className="login-form-sub">Enter your credentials to access the dashboard.</p>

          <form onSubmit={login}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="primary lg"
              disabled={busy || !email || !password}
              style={{ width: "100%", marginTop: 4 }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>

            {error && <p className="error-msg">{error}</p>}
          </form>

          <div className="login-form-footer">
            Using a kiosk terminal?{" "}
            <a href="/" style={{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>
              Go to Kiosk
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
