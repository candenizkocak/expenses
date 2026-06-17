"use client";

import { BarChart3, Check, CheckSquare, ChevronDown, Download, LayoutDashboard, LogOut, PiggyBank, Receipt, ScanLine, Settings, ShieldAlert, Square, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ImageLightbox } from "@/components/ImageLightbox";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase/client";
import { endOfMonthIso } from "@/lib/date";
import { money } from "@/lib/money";
import { duplicateFlags } from "@/lib/policy";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, REJECTION_REASONS, type Expense, type UserProfile } from "@/lib/types";
import { useEmailNotification } from "@/lib/useEmailNotification";

type Tab = "all" | "pending" | "approved" | "rejected" | "paid";
type SortMode = "newest" | "oldest" | "amountDesc" | "amountAsc";
type GroupMode = "none" | "employee" | "category" | "status" | "month" | "paymentDate";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
        setError("");
        setLoading(false);
      },
      (err) => {
        if (err.code === "permission-denied") return;
        setError(err.message);
        setLoading(false);
      }
    );
  }, [expensesQuery]);

  const counts = useMemo(() => ({
    all: expenses.length,
    pending: expenses.filter((e) => e.status === "pending").length,
    approved: expenses.filter((e) => e.status === "approved").length,
    rejected: expenses.filter((e) => e.status === "rejected").length,
    paid: expenses.filter((e) => e.status === "paid").length,
  }), [expenses]);

  const employees = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.employeeName).filter(Boolean))).sort(),
    [expenses]
  );

  const metrics = useMemo(() => {
    const sum = (items: Expense[]) => items.reduce((total, expense) => total + (expense.totalPrice || 0), 0);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const paidThisMonth = expenses.filter((expense) => expense.status === "paid" && expense.receiptDate?.startsWith(month));
    const approved = expenses.filter((expense) => expense.status === "approved");
    const pending = expenses.filter((expense) => expense.status === "pending");
    const flagged = expenses.filter((expense) => (expense.policyFlags || []).length > 0 || duplicateFlags(expense, expenses).length > 0);
    return {
      pendingAmount: sum(pending),
      approvedAmount: sum(approved),
      paidThisMonth: sum(paidThisMonth),
      flaggedCount: flagged.length
    };
  }, [expenses]);

  const filtered = useMemo(() => {
    const byStatus = activeTab === "all" ? expenses : expenses.filter((e) => e.status === activeTab);
    const term = search.trim().toLowerCase();
    const min = amountMin ? Number(amountMin) : null;
    const max = amountMax ? Number(amountMax) : null;

    return byStatus
      .filter((expense) => {
        const fields = [expense.merchant, expense.employeeName, expense.category, expense.receiptDate, expense.status, expense.comment];
        const matchesTerm = !term || fields.filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
        const matchesCategory = !categoryFilter || expense.category === categoryFilter;
        const matchesPayment = !paymentFilter || expense.paymentMethod === paymentFilter;
        const matchesEmployee = !employeeFilter || expense.employeeName === employeeFilter;
        const matchesDateFrom = !dateFrom || (expense.receiptDate || "") >= dateFrom;
        const matchesDateTo = !dateTo || (expense.receiptDate || "") <= dateTo;
        const matchesMin = min === null || (expense.totalPrice || 0) >= min;
        const matchesMax = max === null || (expense.totalPrice || 0) <= max;
        const flags = [...(expense.policyFlags || []), ...duplicateFlags(expense, expenses)];
        const matchesFlag = !flaggedOnly || flags.length > 0;
        return matchesTerm && matchesCategory && matchesPayment && matchesEmployee
          && matchesDateFrom && matchesDateTo && matchesMin && matchesMax && matchesFlag;
      })
      .sort((a, b) => {
        if (sortMode === "amountDesc") return (b.totalPrice || 0) - (a.totalPrice || 0);
        if (sortMode === "amountAsc") return (a.totalPrice || 0) - (b.totalPrice || 0);
        const aDate = a.receiptDate || "";
        const bDate = b.receiptDate || "";
        return sortMode === "oldest" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
      });
  }, [activeTab, amountMax, amountMin, categoryFilter, dateFrom, dateTo, employeeFilter, expenses, flaggedOnly, paymentFilter, search, sortMode]);

  const groupSummaries = useMemo(() => {
    if (groupMode === "none") return [];
    const labelFor = (expense: Expense) => {
      if (groupMode === "employee") return expense.employeeName || "Unknown employee";
      if (groupMode === "category") return expense.category || "Uncategorized";
      if (groupMode === "status") return expense.status;
      if (groupMode === "paymentDate") return expense.plannedPaymentDate || "Unscheduled";
      return expense.receiptDate?.slice(0, 7) || "No date";
    };
    const groups = new Map<string, { label: string; count: number; total: number; flagged: number }>();
    filtered.forEach((expense) => {
      const label = labelFor(expense);
      const current = groups.get(label) || { label, count: 0, total: 0, flagged: 0 };
      current.count += 1;
      current.total += expense.totalPrice || 0;
      current.flagged += (expense.policyFlags || []).length > 0 || duplicateFlags(expense, expenses).length > 0 ? 1 : 0;
      groups.set(label, current);
    });
    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }, [expenses, filtered, groupMode]);

  const selectedExpenses = useMemo(
    () => expenses.filter((expense) => expense.id && selectedIds.includes(expense.id)),
    [expenses, selectedIds]
  );

  const pendingSelected = selectedExpenses.filter((expense) => expense.status === "pending");

  async function review(expense: Expense, status: "approved" | "rejected") {
    if (!expense.id || !user) return;
    const plannedPaymentDate = status === "approved" ? endOfMonthIso(new Date()) : "";
    await updateDoc(doc(db, "expenses", expense.id), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
      updatedAt: serverTimestamp(),
      rejectReasonCode: status === "rejected" ? reasonById[expense.id] || "Needs more explanation" : "",
      rejectionReason: status === "rejected" ? reasonById[expense.id] || "Needs more explanation" : "",
      plannedPaymentDate,
    });

    // Çalışana email gönder
    try {
      const employeeDoc = await import("firebase/firestore").then(({ getDoc, doc: fsDoc }) =>
        getDoc(fsDoc(db, "users", expense.employeeId))
      );
      const employeeEmail = employeeDoc.data()?.email;
      if (employeeEmail) {
        await sendNotification(
          status,
          { ...expense, plannedPaymentDate, rejectionReason: reasonById[expense.id] || "Needs more explanation" },
          employeeEmail,
          expense.employeeName
        );
      }
    } catch {
      // Email hatası ana akışı durdurmaz
    }

    setExpandedId(null);
  }

  async function reopen(expense: Expense) {
    if (!expense.id) return;
    await updateDoc(doc(db, "expenses", expense.id), {
      status: "pending",
      reviewedAt: null,
      reviewedBy: "",
      rejectReasonCode: "",
      rejectionReason: "",
      plannedPaymentDate: "",
      updatedAt: serverTimestamp()
    });
    setExpandedId(null);
  }

  async function markPaid(expense: Expense) {
    if (!expense.id || !user) return;
    await updateDoc(doc(db, "expenses", expense.id), {
      status: "paid",
      paidAt: serverTimestamp(),
      paidBy: user.uid,
      updatedAt: serverTimestamp()
    });
    setExpandedId(null);
  }

  function toggleSelected(expenseId: string) {
    setSelectedIds((prev) =>
      prev.includes(expenseId) ? prev.filter((id) => id !== expenseId) : [...prev, expenseId]
    );
  }

  function toggleVisibleSelected() {
    const visibleIds = filtered.map((expense) => expense.id).filter(Boolean) as string[];
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds]))
    );
  }

  async function bulkReview(status: "approved" | "rejected") {
    if (!user || pendingSelected.length === 0) return;
    await Promise.all(pendingSelected.map((expense) => updateDoc(doc(db, "expenses", expense.id || ""), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
      updatedAt: serverTimestamp(),
      rejectReasonCode: status === "rejected" ? "Bulk rejected" : "",
      rejectionReason: status === "rejected" ? "Bulk rejected" : "",
      plannedPaymentDate: status === "approved" ? endOfMonthIso(new Date()) : ""
    })));
    setSelectedIds((prev) => prev.filter((id) => !pendingSelected.some((expense) => expense.id === id)));
  }

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  const avatarLetter = (profile?.displayName || user?.email || "?")[0].toUpperCase();
  const isReviewer = profile?.role === "manager" || profile?.role === "admin";
  const { sendNotification } = useEmailNotification(user);

  return (
    <div className="app">
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Receipt" onClose={() => setLightboxSrc(null)} />
      )}

      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">E</span>
          <span className="sidebar-logo-name">Expense Portal</span>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-nav-label">Navigation</span>
          <a href="/dashboard" className="sidebar-nav-item active">
            <LayoutDashboard size={15} />
            {isReviewer ? "Approvals" : "My Expenses"}
          </a>
          <a href="/budget" className="sidebar-nav-item">
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
            <p className="topbar-title">
              {isReviewer ? "Expense Approvals" : "My Expenses"}
            </p>
            <p className="topbar-subtitle">
              {loading ? "Loading..." : `${expenses.length} expense${expenses.length !== 1 ? "s" : ""} total`}
            </p>
          </div>
          <div className="actions">
            <a href="/kiosk" className="btn"><ScanLine size={13} /> Kiosk</a>
            {profile?.role === "admin" && <a href="/finance" className="btn"><Download size={13} /> Export</a>}
            <button className="secondary" onClick={logout}><LogOut size={13} /> Log out</button>
          </div>
        </header>

        <div className="page-body">

          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-label">Pending amount</span>
              <strong>{money(metrics.pendingAmount, "TRY")}</strong>
              <span className="muted">{counts.pending} awaiting review</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Approved to pay</span>
              <strong>{money(metrics.approvedAmount, "TRY")}</strong>
              <span className="muted">{counts.approved} ready for finance</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Paid this month</span>
              <strong>{money(metrics.paidThisMonth, "TRY")}</strong>
              <span className="muted">{counts.paid} paid total</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Flagged expenses</span>
              <strong>{metrics.flaggedCount}</strong>
              <span className="muted">Warnings or duplicates</span>
            </div>
          </div>

          <div className="toolbar filter-panel">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant, employee, category, date..." />
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((employee) => <option key={employee} value={employee}>{employee}</option>)}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="">All payment methods</option>
              {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
            <div className="date-filter">
              <span>Date</span>
              <input aria-label="From date" type="text" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" onFocus={(e) => { e.currentTarget.type = "date"; }} onBlur={(e) => { if (!e.currentTarget.value) e.currentTarget.type = "text"; }} />
              <input aria-label="Until date" type="text" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="Until" onFocus={(e) => { if (!e.currentTarget.value) e.currentTarget.type = "text"; }} onBlur={(e) => { if (!e.currentTarget.value) e.currentTarget.type = "text"; }} />
            </div>
            <input type="number" min="0" step="0.01" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="Min amount" />
            <input type="number" min="0" step="0.01" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="Max amount" />
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amountDesc">Amount high to low</option>
              <option value="amountAsc">Amount low to high</option>
            </select>
            <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)}>
              <option value="none">No grouping</option>
              <option value="employee">Group by employee</option>
              <option value="category">Group by category</option>
              <option value="status">Group by status</option>
              <option value="month">Group by month</option>
              <option value="paymentDate">Group by payment date</option>
            </select>
            <label className="check-row">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
              Flagged only
            </label>
          </div>

          {groupSummaries.length > 0 && (
            <div className="group-summary-grid">
              {groupSummaries.map((group) => (
                <div className="group-summary" key={group.label}>
                  <div>
                    <span className="metric-label">{group.label}</span>
                    <strong>{money(group.total, "TRY")}</strong>
                  </div>
                  <div className="group-summary-meta">
                    <span>{group.count} expense{group.count !== 1 ? "s" : ""}</span>
                    {group.flagged > 0 && <span><ShieldAlert size={12} /> {group.flagged} flagged</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isReviewer && filtered.length > 0 && (
            <div className="bulk-bar">
              <button className="secondary" onClick={toggleVisibleSelected}>
                {filtered.every((expense) => expense.id && selectedIds.includes(expense.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select visible"}
              </button>
              <button className="primary" disabled={pendingSelected.length === 0} onClick={() => bulkReview("approved")}>
                <Check size={14} /> Approve pending
              </button>
              <button className="danger" disabled={pendingSelected.length === 0} onClick={() => bulkReview("rejected")}>
                <X size={14} /> Reject pending
              </button>
              {selectedIds.length > 0 && <button className="secondary" onClick={() => setSelectedIds([])}>Clear</button>}
            </div>
          )}

          <div className="tabs">
            {(["all", "pending", "approved", "rejected", "paid"] as Tab[]).map((tab) => (
              <button key={tab} className={`tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="tab-count">{counts[tab]}</span>
              </button>
            ))}
          </div>

          <div className="expense-table-wrap" style={{ marginTop: 16 }}>
            {error ? (
              <div className="empty"><p>{error}</p></div>
            ) : loading ? (
              <div className="empty"><p>Loading expenses...</p></div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                {groupMode === "none" ? <Receipt size={36} /> : <BarChart3 size={36} />}
                <p style={{ margin: 0, fontWeight: 600 }}>No expenses</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {expenses.length === 0 ? "No expenses have been submitted yet." : "No expenses match the current filters."}
                </p>
              </div>
            ) : (
              filtered.map((expense) => {
                const isExpanded = expandedId === expense.id;
                const isPending = expense.status === "pending";
                const flags = [...(expense.policyFlags || []), ...duplicateFlags(expense, expenses)];

                return (
                  <div key={expense.id}>
                    <div className="expense-row" onClick={() => setExpandedId(isExpanded ? null : (expense.id ?? null))}>
                      <div className="select-cell">
                        {isReviewer && expense.id && (
                          <button className="select-box" onClick={(event) => { event.stopPropagation(); toggleSelected(expense.id || ""); }} title="Select expense">
                            {selectedIds.includes(expense.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        )}
                      </div>
                      <img className="expense-thumb" src={expense.imageUrl} alt={`${expense.merchant || "Receipt"} receipt`} style={{ cursor: "zoom-in" }} onClick={(e) => { e.stopPropagation(); setLightboxSrc(expense.imageUrl); }} />
                      <div>
                        <div className="expense-merchant">{expense.merchant || "Unknown merchant"}</div>
                        <div className="expense-employee">{expense.employeeName}{expense.category ? ` - ${expense.category}` : ""}</div>
                      </div>
                      <div className="expense-amount">
                        {money(expense.totalPrice, expense.currency)}
                        <div className="expense-date">{expense.receiptDate || "-"}</div>
                      </div>
                      <div className="expense-meta">
                        <span className={`badge ${expense.status}`}>{expense.status}</span>
                        {flags.length > 0 && <div className="expense-date" style={{ marginTop: 4 }}><ShieldAlert size={12} style={{ verticalAlign: "middle" }} /> {flags.length} flag{flags.length !== 1 ? "s" : ""}</div>}
                        {expense.plannedPaymentDate && <div className="expense-date" style={{ marginTop: 4 }}>Pays {expense.plannedPaymentDate}</div>}
                      </div>
                      <div className={`chevron${isExpanded ? " open" : ""}`}><ChevronDown size={16} /></div>
                    </div>

                    {isExpanded && (
                      <div className="expense-detail">
                        <img className="expense-detail-image" src={expense.imageUrl} alt={`${expense.merchant || "Receipt"} receipt`} style={{ cursor: "zoom-in" }} onClick={() => setLightboxSrc(expense.imageUrl)} />
                        <div>
                          <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 15 }}>{expense.merchant || "Unknown merchant"}</p>
                          <div className="data-list">
                            <Data label="Net price" value={money(expense.netPrice, expense.currency)} />
                            <Data label="Tax rate" value={`${expense.taxRate || 0}%`} />
                            <Data label="Tax" value={money(expense.taxAmount, expense.currency)} />
                            <Data label="Total" value={money(expense.totalPrice, expense.currency)} />
                          </div>
                        </div>
                        <div>
                          <div className="data-list" style={{ marginBottom: 16 }}>
                            <Data label="Receipt date" value={expense.receiptDate || "-"} />
                            <Data label="Payment date" value={expense.plannedPaymentDate || "-"} />
                            <Data label="Employee" value={expense.employeeName || "-"} />
                            <Data label="Category" value={expense.category || "-"} />
                            <Data label="Payment method" value={expense.paymentMethod || "-"} />
                          </div>
                          {expense.comment && <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>Comment: {expense.comment}</p>}
                          {flags.length > 0 && (
                            <div className="flag-list" style={{ marginBottom: 14 }}>
                              {flags.map((flag) => <p key={`${expense.id}-${flag.code}`} className={`flag ${flag.severity}`}>{flag.message}</p>)}
                            </div>
                          )}
                          {expense.rejectionReason && <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>Reason: {expense.rejectionReason}</p>}
                          {isReviewer && isPending && (
                            <div>
                              <select value={reasonById[expense.id || ""] || ""} onChange={(e) => setReasonById((prev) => ({ ...prev, [expense.id || ""]: e.target.value }))} style={{ marginBottom: 10 }}>
                                <option value="">Select rejection reason</option>
                                {REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                              </select>
                              <div className="actions">
                                <button className="primary" onClick={() => review(expense, "approved")}><Check size={14} /> Approve</button>
                                <button className="danger" onClick={() => review(expense, "rejected")}><X size={14} /> Reject</button>
                              </div>
                            </div>
                          )}
                          {isReviewer && !isPending && expense.status !== "paid" && (
                            <div>
                              {expense.status === "approved" && (
                                <select value={reasonById[expense.id || ""] || ""} onChange={(e) => setReasonById((prev) => ({ ...prev, [expense.id || ""]: e.target.value }))} style={{ marginBottom: 10 }}>
                                  <option value="">Select rejection reason</option>
                                  {REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                                </select>
                              )}
                              <div className="actions">
                                {expense.status === "rejected" && <button className="primary" onClick={() => review(expense, "approved")}><Check size={14} /> Approve instead</button>}
                                {expense.status === "approved" && <button className="danger" onClick={() => review(expense, "rejected")}><X size={14} /> Reject instead</button>}
                                <button className="secondary" onClick={() => reopen(expense)}>Reopen as pending</button>
                              </div>
                            </div>
                          )}
                          {profile?.role === "admin" && expense.status === "approved" && (
                            <button className="primary" onClick={() => markPaid(expense)}><Check size={14} /> Mark paid</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}