"use client";

import { PiggyBank, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useBudgets, calcBudgetUsage } from "@/lib/useBudgets";
import { money } from "@/lib/money";
import { CATEGORY_LABELS } from "@/lib/types";
import type { Expense } from "@/lib/types";

type Props = {
  expenses: Expense[];
  employeeId?: string;
};

const CURRENT_YEAR = new Date().getFullYear();

function barColor(percent: number): string {
  if (percent >= 100) return "var(--warn)";
  if (percent >= 90) return "var(--warn)";
  if (percent >= 70) return "var(--amber)";
  return "var(--ok)";
}

function BudgetBar({ percent }: { percent: number }) {
  return (
    <div
      style={{
        background: "var(--surface-3)",
        borderRadius: 999,
        height: 7,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, percent)}%`,
          height: "100%",
          borderRadius: 999,
          background: barColor(percent),
          transition: "width 500ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}

export function BudgetWidget({ expenses, employeeId }: Props) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const { budgets, loading } = useBudgets(year);

  const filtered = useMemo(() => {
    if (!employeeId) return expenses;
    return expenses.filter((e) => e.employeeId === employeeId);
  }, [expenses, employeeId]);

  const usage = useMemo(
    () => calcBudgetUsage(budgets, filtered, year),
    [budgets, filtered, year]
  );

  const activeBudgets = usage.filter((u) => u.limitAmount > 0);

  if (loading || activeBudgets.length === 0) return null;

  const totalLimit = activeBudgets.reduce((s, u) => s + u.limitAmount, 0);
  const totalUsed = activeBudgets.reduce((s, u) => s + u.usedAmount, 0);
  const totalPercent = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          <PiggyBank size={15} />
          Bütçe Kullanımı
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[CURRENT_YEAR - 1, CURRENT_YEAR].map((y) => (
            <button
              key={y}
              className={y === year ? "primary" : "ghost"}
              style={{ minHeight: 26, padding: "2px 10px", fontSize: 11 }}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Genel toplam */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-sm)",
          padding: "12px 14px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <TrendingUp
          size={18}
          style={{
            color: totalPercent >= 90 ? "var(--warn)" : "var(--brand)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Toplam bütçe</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {money(totalUsed, "TRY")} / {money(totalLimit, "TRY")}
            </span>
          </div>
          <BudgetBar percent={totalPercent} />
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: barColor(totalPercent),
            minWidth: 36,
            textAlign: "right",
          }}
        >
          %{totalPercent}
        </span>
      </div>

      {/* Kategori detayları */}
      <div style={{ display: "grid", gap: 12 }}>
        {activeBudgets.map((u) => (
          <div key={u.category}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 5,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {CATEGORY_LABELS[u.category] ?? u.category}
              </span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {money(u.usedAmount, "TRY")} / {money(u.limitAmount, "TRY")}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: barColor(u.usagePercent),
                    minWidth: 30,
                    textAlign: "right",
                  }}
                >
                  %{u.usagePercent}
                </span>
              </div>
            </div>
            <BudgetBar percent={u.usagePercent} />
            {u.usagePercent >= 90 && u.usagePercent < 100 && (
              <p style={{ fontSize: 11, color: "var(--amber)", margin: "4px 0 0" }}>
                ⚠ Bütçe sınırına yaklaşıldı — kalan {money(u.remainingAmount, "TRY")}
              </p>
            )}
            {u.usagePercent >= 100 && (
              <p style={{ fontSize: 11, color: "var(--warn)", margin: "4px 0 0", fontWeight: 600 }}>
                ✕ Bu kategori bütçesi aşıldı
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}