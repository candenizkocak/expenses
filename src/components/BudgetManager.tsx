"use client";

import { PiggyBank, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import type { Budget } from "@/lib/types";
import { money } from "@/lib/money";

type Props = { user: User | null };

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export function BudgetManager({ user }: Props) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function getToken() {
    return user ? await user.getIdToken() : "";
  }

  async function load(y: number) {
    try {
      const res = await fetch(`/api/budgets?year=${y}`);
      const data = await res.json();
      setBudgets(data.budgets || []);
      const prefill: Record<string, string> = {};
      (data.budgets || []).forEach((b: Budget) => {
        prefill[b.category] = String(b.limitAmount);
      });
      setForm(prefill);
    } catch {
      // silent
    }
  }

  useEffect(() => { load(year); }, [year]);

  async function save() {
    setSaving(true);
    setMessage("");
    const token = await getToken();
    try {
      await Promise.all(
        EXPENSE_CATEGORIES.map(async (category) => {
          const val = form[category];
          if (!val || isNaN(Number(val))) return;
          await fetch("/api/budgets", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ category, year, limitAmount: Number(val), currency: "TRY" }),
          });
        })
      );
      setMessage("Budgets saved.");
      await load(year);
    } catch {
      setMessage("Error saving budgets.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBudget(id: string) {
    const token = await getToken();
    await fetch(`/api/budgets?id=${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    await load(year);
  }

  return (
    <section className="panel">
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PiggyBank size={15} />
        Category Budgets
      </h2>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>YEAR</span>
        <div style={{ display: "flex", gap: 4 }}>
          {YEARS.map((y) => (
            <button
              key={y}
              className={y === year ? "primary" : "secondary"}
              style={{ minHeight: 30, padding: "4px 14px", fontSize: 12 }}
              onClick={() => setYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {EXPENSE_CATEGORIES.map((category) => {
          const existing = budgets.find((b) => b.category === category);
          return (
            <div key={category} style={{ display: "grid", gridTemplateColumns: "1fr 180px 36px", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{category}</div>
                {existing && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    Current: {money(existing.limitAmount, "TRY")}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Limit (TRY)"
                  value={form[category] || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [category]: e.target.value }))}
                  style={{ paddingRight: 40 }}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--muted)", pointerEvents: "none" }}>
                  ₺
                </span>
              </div>
              {existing?.id ? (
                <button
                  className="ghost"
                  style={{ color: "var(--warn)", minHeight: 36, padding: "4px 8px" }}
                  onClick={() => deleteBudget(existing.id!)}
                  title="Delete budget"
                >
                  <Trash2 size={14} />
                </button>
              ) : <div />}
            </div>
          );
        })}
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="primary" onClick={save} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving..." : `Save ${year} budgets`}
        </button>
      </div>

      {message && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{message}</p>}
    </section>
  );
}