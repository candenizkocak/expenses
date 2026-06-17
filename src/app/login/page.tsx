"use client";

import { CheckCircle, Receipt, ScanLine, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
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
      <div className="login-brand">
        <div className="login-brand-top">
          <div className="login-brand-logo">
            <span className="login-brand-mark">IW</span>
            <span className="login-brand-name">InWise Portal</span>
          </div>

          <div>
            <h1 className="login-brand-headline">
              Expense control,<br />without the noise.
            </h1>
            <p className="login-brand-sub">
              A focused workspace for receipt capture, review, and payment planning.
            </p>
          </div>

          <div className="login-brand-features">
            <div className="login-feature">
              <span className="login-feature-icon"><ScanLine size={17} /></span>
              <div>
                <div className="login-feature-title">Kiosk capture</div>
                <div className="login-feature-desc">Employees scan in and submit receipts from the terminal.</div>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon"><Zap size={17} /></span>
              <div>
                <div className="login-feature-title">Receipt reading</div>
                <div className="login-feature-desc">Merchant, amount, and tax fields are prepared for review.</div>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon"><CheckCircle size={17} /></span>
              <div>
                <div className="login-feature-title">Approvals</div>
                <div className="login-feature-desc">Managers approve or reject submissions from a clear queue.</div>
              </div>
            </div>
          </div>
        </div>

        <p className="login-brand-footer">Copyright {new Date().getFullYear()} InWise Portal</p>
      </div>

      <div className="login-form-area">
        <div className="login-form-wrap">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
            <ThemeToggle />
          </div>
          <p className="login-form-eyebrow">
            <Receipt size={13} /> Manager &amp; Employee
          </p>
          <h2 className="login-form-title">Sign in</h2>
          <p className="login-form-sub">Access approvals and expense status.</p>

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
                placeholder="Password"
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
              {busy ? "Signing in..." : "Sign in"}
            </button>

            {error && <p className="error-msg">{error}</p>}
          </form>

          <div className="login-form-footer">
            Using a kiosk terminal?{" "}
            <a href="/kiosk">
              Go to Kiosk
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
