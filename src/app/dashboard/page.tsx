"use client";

import { Check, ChevronDown, Download, LayoutDashboard, LogOut, Receipt, ScanLine, Settings, ShieldAlert, X } from "lucide-react";
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
import { REJECTION_REASONS, type Expense, type UserProfile } from "@/lib/types";

type Tab = "all" | "pending" | "approved" | "rejected" | "paid";

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

  const filtered = useMemo(
    () => {
      const byStatus = activeTab === "all" ? expenses : expenses.filter((e) => e.status === activeTab);
      const term = search.trim().toLowerCase();
      if (!term) return byStatus;
      return byStatus.filter((expense) =>
        [expense.merchant, expense.employeeName, expense.category, expense.receiptDate, expense.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    },
    [expenses, activeTab, search]
  );

  async function review(expense: Expense, status: "approved" | "rejected") {
    if (!expense.id || !user) return;
    await updateDoc(doc(db, "expenses", expense.id), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
      updatedAt: serverTimestamp(),
      rejectReasonCode: status === "rejected" ? reasonById[expense.id] || "Needs more explanation" : "",
      rejectionReason: status === "rejected" ? reasonById[expense.id] || "Needs more explanation" : "",
      plannedPaymentDate: status === "approved" ? endOfMonthIso(new Date()) : ""
    });
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

  async function logout() {
    await signOut(auth);
    router.push("/login");
  }

  const avatarLetter = (profile?.displayName || user?.email || "?")[0].toUpperCase();
  const isReviewer = profile?.role === "manager" || profile?.role === "admin";

  return (
    <div className="app">
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt="Receipt"
          onClose={() => setLightboxSrc(null)}
        />
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
          <a href="/kiosk" className="sidebar-nav-item">
            <ScanLine size={15} />
            Kiosk
          </a>
          {isReviewer && (
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
            {isReviewer && <a href="/finance" className="btn"><Download size={13} /> Export</a>}
            <button className="secondary" onClick={logout}><LogOut size={13} /> Log out</button>
          </div>
        </header>

        <div className="page-body">
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant, employee, category, date..."
            />
          </div>
          <div className="tabs">
            {(["all", "pending", "approved", "rejected", "paid"] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`tab${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
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
                <Receipt size={36} />
                <p style={{ margin: 0, fontWeight: 600 }}>No expenses</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {activeTab === "all" ? "No expenses have been submitted yet." : `No ${activeTab} expenses.`}
                </p>
              </div>
            ) : (
              filtered.map((expense) => {
                const isExpanded = expandedId === expense.id;
                const isPending = expense.status === "pending";
                const flags = [...(expense.policyFlags || []), ...duplicateFlags(expense, expenses)];

                return (
                  <div key={expense.id}>
                    <div
                      className="expense-row"
                      onClick={() => setExpandedId(isExpanded ? null : (expense.id ?? null))}
                    >
                      <img
                        className="expense-thumb"
                        src={expense.imageUrl}
                        alt={`${expense.merchant || "Receipt"} receipt`}
                        style={{ cursor: "zoom-in" }}
                        onClick={(e) => { e.stopPropagation(); setLightboxSrc(expense.imageUrl); }}
                      />

                      <div>
                        <div className="expense-merchant">{expense.merchant || "Unknown merchant"}</div>
                        <div className="expense-employee">
                          {expense.employeeName}
                          {expense.category ? ` - ${expense.category}` : ""}
                        </div>
                      </div>

                      <div className="expense-amount">
                        {money(expense.totalPrice, expense.currency)}
                        <div className="expense-date">{expense.receiptDate || "-"}</div>
                      </div>

                      <div className="expense-meta">
                        <span className={`badge ${expense.status}`}>{expense.status}</span>
                        {flags.length > 0 && (
                          <div className="expense-date" style={{ marginTop: 4 }}>
                            <ShieldAlert size={12} style={{ verticalAlign: "middle" }} /> {flags.length} flag{flags.length !== 1 ? "s" : ""}
                          </div>
                        )}
                        {expense.plannedPaymentDate && (
                          <div className="expense-date" style={{ marginTop: 4 }}>
                            Pays {expense.plannedPaymentDate}
                          </div>
                        )}
                      </div>

                      <div className={`chevron${isExpanded ? " open" : ""}`}>
                        <ChevronDown size={16} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="expense-detail">
                        <img
                          className="expense-detail-image"
                          src={expense.imageUrl}
                          alt={`${expense.merchant || "Receipt"} receipt`}
                          style={{ cursor: "zoom-in" }}
                          onClick={() => setLightboxSrc(expense.imageUrl)}
                        />

                        <div>
                          <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 15 }}>
                            {expense.merchant || "Unknown merchant"}
                          </p>
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

                          {expense.comment && (
                            <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
                              Comment: {expense.comment}
                            </p>
                          )}

                          {flags.length > 0 && (
                            <div className="flag-list" style={{ marginBottom: 14 }}>
                              {flags.map((flag) => (
                                <p key={`${expense.id}-${flag.code}`} className={`flag ${flag.severity}`}>{flag.message}</p>
                              ))}
                            </div>
                          )}

                          {expense.rejectionReason && (
                            <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
                              Reason: {expense.rejectionReason}
                            </p>
                          )}

                          {isReviewer && isPending && (
                            <div>
                              <select
                                value={reasonById[expense.id || ""] || ""}
                                onChange={(e) =>
                                  setReasonById((prev) => ({ ...prev, [expense.id || ""]: e.target.value }))
                                }
                                style={{ marginBottom: 10 }}
                              >
                                <option value="">Select rejection reason</option>
                                {REJECTION_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>{reason}</option>
                                ))}
                              </select>
                              <div className="actions">
                                <button className="primary" onClick={() => review(expense, "approved")}>
                                  <Check size={14} /> Approve
                                </button>
                                <button className="danger" onClick={() => review(expense, "rejected")}>
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            </div>
                          )}
                          {isReviewer && !isPending && expense.status !== "paid" && (
                            <div>
                              {expense.status === "approved" && (
                                <select
                                  value={reasonById[expense.id || ""] || ""}
                                  onChange={(e) =>
                                    setReasonById((prev) => ({ ...prev, [expense.id || ""]: e.target.value }))
                                  }
                                  style={{ marginBottom: 10 }}
                                >
                                  <option value="">Select rejection reason</option>
                                  {REJECTION_REASONS.map((reason) => (
                                    <option key={reason} value={reason}>{reason}</option>
                                  ))}
                                </select>
                              )}
                              <div className="actions">
                                {expense.status === "rejected" && (
                                  <button className="primary" onClick={() => review(expense, "approved")}>
                                    <Check size={14} /> Approve instead
                                  </button>
                                )}
                                {expense.status === "approved" && (
                                  <button className="danger" onClick={() => review(expense, "rejected")}>
                                    <X size={14} /> Reject instead
                                  </button>
                                )}
                                <button className="secondary" onClick={() => reopen(expense)}>
                                  Reopen as pending
                                </button>
                              </div>
                            </div>
                          )}
                          {profile?.role === "admin" && expense.status === "approved" && (
                            <button className="primary" onClick={() => markPaid(expense)}>
                              <Check size={14} /> Mark paid
                            </button>
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
