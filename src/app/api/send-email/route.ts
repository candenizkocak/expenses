// src/app/api/send-email/route.ts
// Email gönderme API endpoint'i
// POST /api/send-email
// Body: { type, expense, employeeEmail, employeeName }

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  sendEmail,
  expenseSubmittedEmail,
  expenseApprovedEmail,
  expenseRejectedEmail,
} from "@/lib/email";

export async function POST(req: NextRequest) {
  // Auth kontrolü
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const { type, expense, employeeEmail, employeeName } = body;

  if (!type || !expense || !employeeEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    let emailData: { subject: string; html: string };

    if (type === "submitted") {
      emailData = expenseSubmittedEmail({
        employeeName: employeeName || expense.employeeName,
        merchant: expense.merchant,
        totalPrice: expense.totalPrice,
        currency: expense.currency || "TRY",
        receiptDate: expense.receiptDate,
        category: expense.category,
        paymentMethod: expense.paymentMethod,
      });
    } else if (type === "approved") {
      emailData = expenseApprovedEmail({
        employeeName: employeeName || expense.employeeName,
        merchant: expense.merchant,
        totalPrice: expense.totalPrice,
        currency: expense.currency || "TRY",
        receiptDate: expense.receiptDate,
        plannedPaymentDate: expense.plannedPaymentDate,
      });
    } else if (type === "rejected") {
      emailData = expenseRejectedEmail({
        employeeName: employeeName || expense.employeeName,
        merchant: expense.merchant,
        totalPrice: expense.totalPrice,
        currency: expense.currency || "TRY",
        receiptDate: expense.receiptDate,
        rejectionReason: expense.rejectionReason || expense.rejectReasonCode,
      });
    } else {
      return NextResponse.json({ error: "Invalid email type" }, { status: 400 });
    }

    await sendEmail({
      to: employeeEmail,
      subject: emailData.subject,
      html: emailData.html,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}