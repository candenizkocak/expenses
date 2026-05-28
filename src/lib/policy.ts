import type { Expense, PolicyFlag, ReceiptOcr } from "@/lib/types";

type PolicyInput = Pick<ReceiptOcr, "merchant" | "receiptDate" | "totalPrice" | "confidence"> & {
  category?: string;
  imageUrl?: string;
};

export function policyFlagsForExpense(expense: PolicyInput): PolicyFlag[] {
  const flags: PolicyFlag[] = [];

  if (!expense.merchant.trim()) {
    flags.push({
      code: "missing_merchant",
      severity: "blocking",
      message: "Merchant is required before submission."
    });
  }

  if (!expense.receiptDate) {
    flags.push({
      code: "missing_date",
      severity: "blocking",
      message: "Receipt date is required before submission."
    });
  }

  if (!expense.totalPrice || expense.totalPrice <= 0) {
    flags.push({
      code: "missing_total",
      severity: "blocking",
      message: "Total amount must be greater than zero."
    });
  }

  if (!expense.category) {
    flags.push({
      code: "missing_category",
      severity: "blocking",
      message: "Category is required before submission."
    });
  }

  if ((expense.confidence || 0) < 0.7) {
    flags.push({
      code: "low_confidence",
      severity: "warning",
      message: "OCR confidence is low. Please check the fields carefully."
    });
  }

  if (expense.totalPrice > 3000) {
    flags.push({
      code: "high_amount",
      severity: "warning",
      message: "High value expense. Manager should review the receipt closely."
    });
  }

  return flags;
}

export function duplicateFlags(expense: Expense, allExpenses: Expense[]): PolicyFlag[] {
  const duplicate = allExpenses.find((candidate) => {
    if (candidate.id === expense.id) return false;
    if (candidate.employeeId !== expense.employeeId) return false;
    if (!candidate.receiptDate || candidate.receiptDate !== expense.receiptDate) return false;
    return Math.abs((candidate.totalPrice || 0) - (expense.totalPrice || 0)) < 0.01;
  });

  return duplicate
    ? [{
        code: "potential_duplicate",
        severity: "warning",
        message: `Potential duplicate of ${duplicate.merchant || "another expense"}.`
      }]
    : [];
}

export function blockingFlags(flags: PolicyFlag[]) {
  return flags.filter((flag) => flag.severity === "blocking");
}
