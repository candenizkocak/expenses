"use client";

import { Check, Download, LayoutDashboard, Receipt } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase/client";
import { money } from "@/lib/money";
import type { Expense, UserProfile } from "@/lib/types";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function FinancePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

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

  useEffect(() => {
    if (!profile || profile.role === "employee") return;
    return onSnapshot(query(collection(db, "expenses"), orderBy("createdAt", "desc")), (snap) => {
      setExpenses(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Expense));
    });
  }, [profile]);

  const financeExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "approved" || expense.status === "paid"),
    [expenses]
  );

  const approvedTotal = financeExpenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + (expense.totalPrice || 0), 0);

  function exportCsv() {
    const header = ["id", "employee", "merchant", "date", "category", "net", "tax", "total", "currency", "paymentMethod", "status", "plannedPaymentDate"];
    const rows = financeExpenses.map((expense) => [
      expense.id,
      expense.employeeName,
      expense.merchant,
      expense.receiptDate,
      expense.category,
      expense.netPrice,
      expense.taxAmount,
      expense.totalPrice,
      expense.currency,
      expense.paymentMethod,
      expense.status,
      expense.plannedPaymentDate
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `expense-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function markPaid(expense: Expense) {
    if (!expense.id || !user) return;
    await updateDoc(doc(db, "expenses", expense.id), {
      status: "paid",
      paidAt: serverTimestamp(),
      paidBy: user.uid,
      updatedAt: serverTimestamp()
    });
  }

  if (!profile || profile.role === "employee") {
    return <main className="shell"><div className="empty">Checking finance access...</div></main>;
  }

  return (
    <main className="shell">
      <div className="topbar-pill">
        <div className="brand-lockup">
          <span className="brand-mark">E</span>
          <div className="title">
            <h1>Finance Export</h1>
            <p>{financeExpenses.length} approved or paid expenses - {money(approvedTotal, "TRY")} awaiting payment</p>
          </div>
        </div>
        <div className="actions">
          <a href="/dashboard" className="btn"><LayoutDashboard size={13} /> Dashboard</a>
          <button className="primary" onClick={exportCsv} disabled={financeExpenses.length === 0}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="expense-table-wrap">
        {financeExpenses.length === 0 ? (
          <div className="empty">
            <Receipt size={36} />
            <p style={{ margin: 0, fontWeight: 600 }}>No approved expenses</p>
          </div>
        ) : financeExpenses.map((expense) => (
          <div className="expense-row finance-row" key={expense.id}>
            <img className="expense-thumb" src={expense.imageUrl} alt={`${expense.merchant || "Receipt"} receipt`} />
            <div>
              <div className="expense-merchant">{expense.merchant || "Unknown merchant"}</div>
              <div className="expense-employee">{expense.employeeName} - {expense.category || "Uncategorized"}</div>
            </div>
            <div className="expense-amount">
              {money(expense.totalPrice, expense.currency)}
              <div className="expense-date">{expense.receiptDate || "-"}</div>
            </div>
            <div className="expense-meta">
              <span className={`badge ${expense.status}`}>{expense.status}</span>
              <div className="expense-date">Pays {expense.plannedPaymentDate || "-"}</div>
            </div>
            <div className="actions">
              {expense.status === "approved" && (
                <button className="primary" onClick={() => markPaid(expense)}>
                  <Check size={14} /> Paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
