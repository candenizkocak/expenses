"use client";

import { BarChart3, LayoutDashboard, LogOut, ScanLine } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth, db } from "@/lib/firebase/client";
import { money } from "@/lib/money";
import { duplicateFlags } from "@/lib/policy";
import type { Expense, UserProfile } from "@/lib/types";

type Bucket = { label: string; count: number; total: number };
type PeriodMode = "month" | "quarter" | "year" | "yearToDate" | "allTime" | "custom";
type PeriodRange = { label: string; start: string; end: string };

function sum(items: Expense[]) {
  return items.reduce((total, expense) => total + (expense.totalPrice || 0), 0);
}

function sumField(items: Expense[], field: "netPrice" | "taxAmount" | "totalPrice") {
  return items.reduce((total, expense) => total + (expense[field] || 0), 0);
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function addToBucket(map: Map<string, Bucket>, label: string, amount: number) {
  const current = map.get(label) || { label, count: 0, total: 0 };
  current.count += 1;
  current.total += amount;
  map.set(label, current);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function quarterOf(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function quarterRange(year: number, quarter: number) {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    label: monthKey,
    start: isoDate(new Date(year, month - 1, 1)),
    end: isoDate(new Date(year, month, 0))
  };
}

function rangeForPeriod(mode: PeriodMode, selectedMonth: string, selectedQuarter: string, selectedYear: string, customStart: string, customEnd: string): PeriodRange {
  const today = new Date();
  const year = today.getFullYear();

  if (mode === "month") {
    return monthRange(selectedMonth);
  }
  if (mode === "quarter") {
    const match = selectedQuarter.match(/^(\d{4})-Q([1-4])$/);
    const quarterYear = match ? Number(match[1]) : year;
    const quarter = match ? Number(match[2]) : quarterOf(today);
    return { label: `Q${quarter} ${quarterYear}`, ...quarterRange(quarterYear, quarter) };
  }
  if (mode === "year") {
    return { label: selectedYear, start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
  }
  if (mode === "yearToDate") {
    return { label: "Year to date", start: isoDate(new Date(year, 0, 1)), end: isoDate(today) };
  }
  if (mode === "custom") {
    return { label: "Custom range", start: customStart, end: customEnd };
  }
  return { label: "All time", start: "", end: "" };
}

function previousRange(range: PeriodRange): PeriodRange {
  if (!range.start || !range.end) return { label: "Previous period", start: "", end: "" };
  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  return { label: "Previous period", start: isoDate(previousStart), end: isoDate(previousEnd) };
}

function inRange(expense: Expense, range: PeriodRange) {
  const date = expense.receiptDate || "";
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

function quarterLabel(date: string) {
  if (!date) return "No date";
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function quarterKey(date: string) {
  if (!date) return "";
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  if (!year || !month) return "";
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function currentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuarterKey() {
  const today = new Date();
  return `${today.getFullYear()}-Q${quarterOf(today)}`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("quarter");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarterKey());
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);
  }), [router]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const currentProfile = snap.data() as UserProfile;
      setProfile(currentProfile);
      if (currentProfile?.role === "employee") router.push("/dashboard");
    });
  }, [router, user]);

  const expensesQuery = useMemo(() => {
    if (!user || !profile || profile.role === "employee") return null;
    const base = collection(db, "expenses");
    if (profile.role === "admin") return query(base, orderBy("createdAt", "desc"));
    return query(base, where("managerId", "==", user.uid), orderBy("createdAt", "desc"));
  }, [profile, user]);

  useEffect(() => {
    if (!expensesQuery) return;
    return onSnapshot(
      expensesQuery,
      (snap) => {
        setExpenses(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Expense));
        setError("");
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
  }, [expensesQuery]);

  const analytics = useMemo(() => {
    const range = rangeForPeriod(periodMode, selectedMonth, selectedQuarter, selectedYear, customStart, customEnd);
    const previous = previousRange(range);
    const periodExpenses = range.start || range.end ? expenses.filter((expense) => inRange(expense, range)) : expenses;
    const previousExpenses = previous.start || previous.end ? expenses.filter((expense) => inRange(expense, previous)) : [];
    const totalSpend = sum(periodExpenses);
    const previousSpend = sum(previousExpenses);
    const change = totalSpend - previousSpend;
    const changePercent = previousSpend > 0 ? Math.round((change / previousSpend) * 100) : 0;
    const pending = periodExpenses.filter((expense) => expense.status === "pending");
    const approved = periodExpenses.filter((expense) => expense.status === "approved");
    const paid = periodExpenses.filter((expense) => expense.status === "paid");
    const rejected = periodExpenses.filter((expense) => expense.status === "rejected");
    const confidenceValues = periodExpenses.map((expense) => expense.confidence || 0).filter((value) => value > 0);
    const averageConfidence = confidenceValues.length
      ? Math.round((confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length) * 100)
      : 0;

    const category = new Map<string, Bucket>();
    const employee = new Map<string, Bucket>();
    const month = new Map<string, Bucket>();
    const quarter = new Map<string, Bucket>();
    const status = new Map<string, Bucket>();
    const confidence = new Map<string, Bucket>();
    const risk = new Map<string, Bucket>();

    periodExpenses.forEach((expense) => {
      const amount = expense.totalPrice || 0;
      addToBucket(category, expense.category || "Uncategorized", amount);
      addToBucket(employee, expense.employeeName || "Unknown employee", amount);
      addToBucket(month, expense.receiptDate?.slice(0, 7) || "No date", amount);
      addToBucket(quarter, quarterLabel(expense.receiptDate || ""), amount);
      addToBucket(status, expense.status, amount);

      const confidencePercent = (expense.confidence || 0) * 100;
      const confidenceLabel = confidencePercent < 50 ? "<50%" : confidencePercent < 70 ? "50-70%" : confidencePercent < 90 ? "70-90%" : "90%+";
      addToBucket(confidence, confidenceLabel, amount);

      const flags = [...(expense.policyFlags || []), ...duplicateFlags(expense, periodExpenses)];
      flags.forEach((flag) => addToBucket(risk, flag.code.replace(/_/g, " "), amount));
    });

    return {
      range,
      previous,
      count: periodExpenses.length,
      totalSpend,
      netSpend: sumField(periodExpenses, "netPrice"),
      taxTotal: sumField(periodExpenses, "taxAmount"),
      pendingAmount: sum(pending),
      approvedAmount: sum(approved),
      paidAmount: sum(paid),
      rejectedAmount: sum(rejected),
      outstandingLiability: sum(approved),
      averageExpense: periodExpenses.length ? totalSpend / periodExpenses.length : 0,
      effectiveTaxRate: sumField(periodExpenses, "netPrice") > 0 ? Math.round((sumField(periodExpenses, "taxAmount") / sumField(periodExpenses, "netPrice")) * 100) : 0,
      previousSpend,
      change,
      changePercent,
      rejectionRate: percent(rejected.length, periodExpenses.length),
      averageConfidence,
      category: Array.from(category.values()).sort((a, b) => b.total - a.total),
      employee: Array.from(employee.values()).sort((a, b) => b.total - a.total).slice(0, 8),
      month: Array.from(month.values()).sort((a, b) => a.label.localeCompare(b.label)),
      quarter: Array.from(quarter.values()).sort((a, b) => a.label.localeCompare(b.label)),
      status: Array.from(status.values()).sort((a, b) => b.count - a.count),
      confidence: ["<50%", "50-70%", "70-90%", "90%+"].map((label) => confidence.get(label) || { label, count: 0, total: 0 }),
      risk: Array.from(risk.values()).sort((a, b) => b.count - a.count)
    };
  }, [customEnd, customStart, expenses, periodMode, selectedMonth, selectedQuarter, selectedYear]);

  const periodOptions = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear())]);
    const months = new Set<string>([currentMonthKey()]);
    const quarters = new Set<string>([currentQuarterKey()]);

    expenses.forEach((expense) => {
      if (!expense.receiptDate) return;
      const year = expense.receiptDate.slice(0, 4);
      const month = expense.receiptDate.slice(0, 7);
      const quarter = quarterKey(expense.receiptDate);
      years.add(year);
      months.add(month);
      if (quarter) quarters.add(quarter);
    });

    return {
      years: Array.from(years).sort((a, b) => b.localeCompare(a)),
      months: Array.from(months).sort((a, b) => b.localeCompare(a)),
      quarters: Array.from(quarters).sort((a, b) => b.localeCompare(a))
    };
  }, [expenses]);

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  const avatarLetter = (profile?.displayName || user?.email || "?")[0].toUpperCase();

  if (!profile || profile.role === "employee") {
    return <main className="shell"><div className="empty">Checking analytics access...</div></main>;
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
          <a href="/dashboard" className="sidebar-nav-item"><LayoutDashboard size={15} /> Dashboard</a>
          <a href="/analytics" className="sidebar-nav-item active"><BarChart3 size={15} /> Analytics</a>
          <a href="/kiosk" className="sidebar-nav-item"><ScanLine size={15} /> Kiosk</a>
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-avatar">{avatarLetter}</span>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{profile.displayName || user?.email}</div>
            <div className="sidebar-user-role">{profile.role}</div>
          </div>
          <ThemeToggle />
          <button className="ghost" onClick={logout} title="Log out"><LogOut size={14} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <p className="topbar-title">Expense Analytics</p>
            <p className="topbar-subtitle">
              {loading ? "Loading..." : `${analytics.count} of ${expenses.length} expense${expenses.length !== 1 ? "s" : ""} in ${analytics.range.label}`}
            </p>
          </div>
        </header>

        <div className="page-body">
          {error ? (
            <div className="empty"><p>{error}</p></div>
          ) : (
            <>
              <div className="period-panel">
                <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)}>
                  <option value="quarter">Quarter</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                  <option value="yearToDate">Year to date</option>
                  <option value="allTime">All time</option>
                  <option value="custom">Custom range</option>
                </select>
                {periodMode === "quarter" && (
                  <select value={selectedQuarter} onChange={(event) => setSelectedQuarter(event.target.value)}>
                    {periodOptions.quarters.map((quarter) => {
                      const [year, quarterName] = quarter.split("-Q");
                      return <option key={quarter} value={quarter}>{`Q${quarterName} ${year}`}</option>;
                    })}
                  </select>
                )}
                {periodMode === "month" && (
                  <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                    {periodOptions.months.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                )}
                {periodMode === "year" && (
                  <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                    {periodOptions.years.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                )}
                {periodMode === "custom" && (
                  <div className="date-filter">
                    <span>Date</span>
                    <input aria-label="Custom start date" type="text" value={customStart} onChange={(event) => setCustomStart(event.target.value)} placeholder="From" onFocus={(event) => { event.currentTarget.type = "date"; }} onBlur={(event) => { if (!event.currentTarget.value) event.currentTarget.type = "text"; }} />
                    <input aria-label="Custom end date" type="text" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} placeholder="Until" onFocus={(event) => { event.currentTarget.type = "date"; }} onBlur={(event) => { if (!event.currentTarget.value) event.currentTarget.type = "text"; }} />
                  </div>
                )}
                <span className="muted">
                  {analytics.range.start || analytics.range.end
                    ? `${analytics.range.start || "Start"} to ${analytics.range.end || "today"}`
                    : "All available receipt dates"}
                </span>
              </div>

              <div className="metric-grid">
                <Metric label="Gross spend" value={money(analytics.totalSpend, "TRY")} note={`${analytics.change >= 0 ? "+" : ""}${money(analytics.change, "TRY")} vs previous`} />
                <Metric label="Net spend" value={money(analytics.netSpend, "TRY")} note="Before tax" />
                <Metric label="Tax total" value={money(analytics.taxTotal, "TRY")} note={`${analytics.effectiveTaxRate}% effective tax rate`} />
                <Metric label="Outstanding liability" value={money(analytics.outstandingLiability, "TRY")} note="Approved but unpaid" />
                <Metric label="Pending liability" value={money(analytics.pendingAmount, "TRY")} note="Awaiting approval" />
                <Metric label="Reimbursed" value={money(analytics.paidAmount, "TRY")} note="Paid expenses" />
                <Metric label="Rejected amount" value={money(analytics.rejectedAmount, "TRY")} note={`${analytics.rejectionRate}% rejection rate`} />
                <Metric label="Average expense" value={money(analytics.averageExpense, "TRY")} note={`${analytics.count} expenses`} />
                <Metric label="Period change" value={`${analytics.changePercent >= 0 ? "+" : ""}${analytics.changePercent}%`} note={`${analytics.previous.label}: ${money(analytics.previousSpend, "TRY")}`} />
                <Metric label="Rejection rate" value={`${analytics.rejectionRate}%`} note="Rejected count share" />
                <Metric label="Avg OCR confidence" value={`${analytics.averageConfidence}%`} note="Receipt extraction quality" />
              </div>

              <div className="analytics-grid">
                <Chart title="Spend by category" rows={analytics.category} value="amount" />
                <Chart title="Employee leaderboard" rows={analytics.employee} value="amount" />
                <Chart title="Monthly spend" rows={analytics.month} value="amount" />
                <Chart title="Quarterly results" rows={analytics.quarter} value="amount" />
                <Chart title="Status pipeline" rows={analytics.status} value="count" />
                <Chart title="OCR confidence" rows={analytics.confidence} value="count" />
                <Chart title="Policy and risk flags" rows={analytics.risk} value="count" empty="No policy flags yet." />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="muted">{note}</span>
    </div>
  );
}

function Chart({ title, rows, value, empty }: { title: string; rows: Bucket[]; value: "amount" | "count"; empty?: string }) {
  const max = Math.max(...rows.map((row) => value === "amount" ? row.total : row.count), 0);
  const visibleRows = rows.filter((row) => row.count > 0);

  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      {visibleRows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{empty || "No data yet."}</p>
      ) : (
        <div className="chart-list">
          {visibleRows.map((row) => {
            const rawValue = value === "amount" ? row.total : row.count;
            const width = max > 0 ? Math.max(4, Math.round((rawValue / max) * 100)) : 0;
            return (
              <div className="chart-row" key={row.label}>
                <div className="chart-row-head">
                  <span>{row.label}</span>
                  <strong>{value === "amount" ? money(row.total, "TRY") : row.count}</strong>
                </div>
                <div className="chart-track"><span style={{ width: `${width}%` }} /></div>
                <p className="muted">{row.count} expense{row.count !== 1 ? "s" : ""}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
