import type { Timestamp } from "firebase/firestore";

export type Role = "employee" | "manager" | "admin";
export type ExpenseStatus = "pending" | "approved" | "rejected";

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  rejectionReason?: string;
  plannedPaymentDate?: string;
};
