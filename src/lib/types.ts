import type { Timestamp } from "firebase/firestore";

export type Role = "employee" | "manager" | "admin";
export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";
export type PolicySeverity = "info" | "warning" | "blocking";

export type PolicyFlag = {
  code: string;
  severity: PolicySeverity;
  message: string;
};

export type UserProfile = {
  displayName: string;
  email: string;
  role: Role;
  managerId?: string;
};

export type ReceiptOcr = {
  merchant: string;
  netPrice: number;
  taxRate: number;
  taxAmount: number;
  totalPrice: number;
  currency: string;
  receiptDate?: string;
  confidence: number;
  notes?: string;
};

export type Expense = ReceiptOcr & {
  id?: string;
  employeeId: string;
  employeeName: string;
  managerId: string;
  imageUrl: string;
  status: ExpenseStatus;
  category?: string;
  paymentMethod?: string;
  comment?: string;
  policyFlags?: PolicyFlag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  rejectionReason?: string;
  rejectReasonCode?: string;
  plannedPaymentDate?: string;
  paidAt?: Timestamp;
  paidBy?: string;
  paidReference?: string;
};

export const EXPENSE_CATEGORIES = ["Food", "Transport", "Office", "Travel", "Other"] as const;
export const PAYMENT_METHODS = ["Employee paid", "Company card", "Cash advance"] as const;
export const REJECTION_REASONS = [
  "Missing or unreadable receipt",
  "Incorrect amount",
  "Wrong category",
  "Duplicate expense",
  "Out of policy",
  "Needs more explanation",
  "Personal expense"
] as const;
