"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import type { Budget, BudgetUsage, Expense } from "@/lib/types";

export function useBudgets(year: number = new Date().getFullYear()) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "budgets"),
      where("year", "==", year)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBudgets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Budget));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [year]);

  return { budgets, loading };
}

export function calcBudgetUsage(
  budgets: Budget[],
  expenses: Expense[],
  year: number = new Date().getFullYear()
): BudgetUsage[] {
  const relevant = expenses.filter((e) => {
    if (e.status !== "approved" && e.status !== "paid") return false;
    return e.receiptDate?.slice(0, 4) === String(year);
  });

  return EXPENSE_CATEGORIES.map((category) => {
    const budget = budgets.find((b) => b.category === category);
    const limitAmount = budget?.limitAmount ?? 0;

    const usedAmount = relevant
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + (e.totalPrice || 0), 0);

    const remainingAmount = Math.max(0, limitAmount - usedAmount);
    const usagePercent = limitAmount > 0
      ? Math.min(100, Math.round((usedAmount / limitAmount) * 100))
      : 0;

    return {
      category,
      year,
      limitAmount,
      usedAmount,
      remainingAmount,
      usagePercent,
    };
  });
}