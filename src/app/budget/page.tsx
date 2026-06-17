"use client";

import { BarChart3, Download, LayoutDashboard, LogOut, PiggyBank, ScanLine, Settings, TrendingUp } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase/client";
import { money } from "@/lib/money";
import { useBudgets, calcBudgetUsage } from "@/lib/useBudgets";
import type { Expense, UserProfile } from "@/lib/types";

const CURRENT_YEAR = new Date().getFullYear();

function barColor(percent: number): string {
  if (percent >= 100) return "var(--warn)";
  if (percent >= 90) return "var(--warn)";
  if (percent >= 70) return "var(--amber)";
  return "var(--ok)";
}

function BudgetBar({ percent }: { percent: number }) {
  return (
    <div style={{ background: "var(--surface-3)", borderRadius: 999, height: 8, overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(100, percent)}%`,
          height: "100%",
          borderRadius: 999,
          background: barColor(percent),
          transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}

export default function BudgetPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);
  const { budgets, loading: budgetsLoading } = useBudgets(year);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) { router.push("/login"); return; }
      setUser(currentUser);
    });
  }, [router]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.data() as UserProfile);
    });
  }, [user]);

  const expensesQuery = useMemo(() => {
    if (!user || !profile) return null;
    const base = collection(db, "expenses");
    if (profile.role === "admin") return query(base, orderBy("createdAt", "desc"));
    if (profile.role === "manager") return query(base, where("managerId", "==", user.uid), orderBy("createdAt", "desc"));
    return query(base, where("employeeId", "==", user.uid), orderBy("createdAt", "desc"));
  }, [profile, user]);

  useEffect(() => {
    if (!expensesQuery) return;
    return onSnapshot(
      expensesQuery,
      (snap) => {
        setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense));
        setLoading(false);
      },
      (err) => {
        if (err.code === "permission-denied") return;
        setLoading(false);
      }
    );
  }, [expensesQuery]);

  const filteredExpenses = useMemo(() => {
    if (!profile || profile.role !== "employee") return expenses;
    return expenses.filter((e) => e.employeeId === user?.uid);
  }, [expenses, profile, user]);

  const usage = useMemo(
    () => calcBudgetUsage(budgets, filteredExpenses, year),
    [budgets, filteredExpenses, year]
  );

  const activeBudgets = usage.filter((u) => u.limitAmount > 0);
  const totalLimit = activeBudgets.reduce((s, u) => s + u.limitAmount, 0);
  const totalUsed = activeBudgets.reduce((s, u) => s + u.usedAmount, 0);
  const totalPercent = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;

  const isReviewer = profile?.role === "manager" || profile?.role === "admin";
  const avatarLetter = (profile?.displayName || user?.email || "?")[0].toUpperCase();

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">E</span>
          <span className="sidebar-logo-name">Expense Portal</span>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-nav-label">Navigation</span>
          <a href="/dashboard" className="sidebar-nav-item">
            <LayoutDashboard size={15} />
            {isReviewer ? "Approvals" : "My Expenses"}
          </a>
          <a href="/budget" className="sidebar-nav-item active">
            <PiggyBank size={15} />
            Budget
          </a>
          <a href="/kiosk" className="sidebar-nav-item">
            <ScanLine size={15} />
            Kiosk
          </a>
          {isReviewer && (
            <a href="/analytics" className="sidebar-nav-item">
              <BarChart3 size={15} />
              Analytics
            </a>
          )}
          {profile?.role === "admin" && (
            <a href="/finance" className="sidebar-nav-item">
              <Download size={15} />
              Finance
            </a>
          )}
          {profile?.role === "admin" && (
            <a href="/admin" className="sidebar-nav-item">
              <Settings size={15} />
              Admin
            </a>
          )}
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-avatar">{avatarLetter}</span>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{profile?.displayName || user?.email}</div>
            <div className="sidebar-user-role">{profile?.role}</div>
          </div>
          <ThemeToggle />
          <button className="ghost" onClick={logout} title="Log out">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <p className="topbar-title">Budget</p>
            <p className="topbar-subtitle">
              {budgetsLoading || loading ? "Loading..." : `${activeBudgets.length} active budget${activeBudgets.length !== 1 ? "s" : ""} — ${year}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <button
                key={y}
                className={y === year ? "primary" : "secondary"}
                style={{ minHeight: 32, padding: "4px 14px", fontSize: 12 }}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </header>

        <div className="page-body">
          {activeBudgets.length === 0 ? (
            <div className="empty">
              <PiggyBank size={36} />
              <p style={{ margin: 0, fontWeight: 600 }}>No budgets defined</p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {profile?.role === "admin"
                  ? "Go to Admin to set category budgets."
                  : "No budgets have been set for this year yet."}
              </p>
              {profile?.role === "admin" && (
                <a href="/admin" className="btn" style={{ marginTop: 8 }}>Go to Admin</a>
              )}
            </div>
          ) : (
            <>
              {/* Total summary card */}
              <div className="panel" style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <TrendingUp
                    size={22}
                    style={{ color: totalPercent >= 90 ? "var(--warn)" : "var(--brand)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Total budget {year}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        {money(totalUsed, "TRY")} / {money(totalLimit, "TRY")}
                      </span>
                    </div>
                    <BudgetBar percent={totalPercent} />
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: barColor(totalPercent), minWidth: 52, textAlign: "right" }}>
                    {totalPercent}%
                  </span>
                </div>
              </div>

              {/* Category cards */}
              <div className="grid">
                {activeBudgets.map((u) => (
                  <div className="panel" key={u.category}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 3 }}>
                          {u.category}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {money(u.usedAmount, "TRY")} used of {money(u.limitAmount, "TRY")}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: barColor(u.usagePercent),
                      }}>
                        {u.usagePercent}%
                      </span>
                    </div>

                    <BudgetBar percent={u.usagePercent} />

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {money(u.remainingAmount, "TRY")} remaining
                      </span>
                      <span style={{ fontSize: 12, color: barColor(u.usagePercent), fontWeight: 600 }}>
                        {u.usagePercent >= 100
                          ? "✕ Exceeded"
                          : u.usagePercent >= 90
                          ? "⚠ Near limit"
                          : u.usagePercent >= 70
                          ? "▲ Watch out"
                          : "✓ On track"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}