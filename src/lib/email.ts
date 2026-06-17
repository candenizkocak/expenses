// src/lib/email.ts
// Resend ile email gönderme ve şablonlar

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "InWise Kiosk <inwise@candenizkocak.com>",
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend error: ${error}`);
  }
}

// ─── Email şablonları ────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>InWise Kiosk</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: #1E8A6E; padding: 28px 32px; }
    .header-title { color: white; font-size: 18px; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
    .header-sub { color: rgba(255,255,255,0.7); font-size: 13px; margin: 4px 0 0; }
    .body { padding: 28px 32px; }
    .body p { color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .card-row:last-child { border-bottom: none; padding-bottom: 0; }
    .card-label { color: #6b7280; }
    .card-value { color: #111827; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge-approved { background: rgba(5,122,82,0.1); color: #057a52; }
    .badge-rejected { background: rgba(196,32,32,0.1); color: #c42020; }
    .badge-pending { background: rgba(160,72,0,0.1); color: #a04800; }
    .footer { padding: 20px 32px; border-top: 1px solid #e5e7eb; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    ${content}
    <div class="footer">
      <p>InWise Kiosk — Expense Management System</p>
      <p style="margin-top:4px">This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// 1. Harcama alındı emaili
export function expenseSubmittedEmail(data: {
  employeeName: string;
  merchant: string;
  totalPrice: number;
  currency: string;
  receiptDate: string;
  category: string;
  paymentMethod: string;
}): { subject: string; html: string } {
  const amount = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: data.currency || "TRY",
  }).format(data.totalPrice || 0);

  return {
    subject: `Expense received — ${data.merchant || "Unknown merchant"}`,
    html: baseTemplate(`
      <div class="header">
        <p class="header-title">Expense Received</p>
        <p class="header-sub">Your expense has been submitted for review</p>
      </div>
      <div class="body">
        <p>Hi ${data.employeeName},</p>
        <p>Your expense has been successfully submitted and is now awaiting manager approval.</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Merchant</span>
            <span class="card-value">${data.merchant || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Amount</span>
            <span class="card-value">${amount}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Date</span>
            <span class="card-value">${data.receiptDate || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Category</span>
            <span class="card-value">${data.category || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Payment method</span>
            <span class="card-value">${data.paymentMethod || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Status</span>
            <span class="badge badge-pending">Pending review</span>
          </div>
        </div>
        <p>You will receive another email once your manager reviews your expense.</p>
      </div>
    `),
  };
}

// 2. Harcama onaylandı emaili
export function expenseApprovedEmail(data: {
  employeeName: string;
  merchant: string;
  totalPrice: number;
  currency: string;
  receiptDate: string;
  plannedPaymentDate: string;
}): { subject: string; html: string } {
  const amount = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: data.currency || "TRY",
  }).format(data.totalPrice || 0);

  return {
    subject: `Expense approved — ${data.merchant || "Unknown merchant"}`,
    html: baseTemplate(`
      <div class="header" style="background: #057a52;">
        <p class="header-title">Expense Approved ✓</p>
        <p class="header-sub">Your expense has been approved</p>
      </div>
      <div class="body">
        <p>Hi ${data.employeeName},</p>
        <p>Great news! Your expense has been <strong>approved</strong> by your manager.</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Merchant</span>
            <span class="card-value">${data.merchant || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Amount</span>
            <span class="card-value">${amount}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Receipt date</span>
            <span class="card-value">${data.receiptDate || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Planned payment</span>
            <span class="card-value">${data.plannedPaymentDate || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Status</span>
            <span class="badge badge-approved">Approved</span>
          </div>
        </div>
        <p>Payment is scheduled for <strong>${data.plannedPaymentDate || "end of month"}</strong>.</p>
      </div>
    `),
  };
}

// 3. Harcama reddedildi emaili
export function expenseRejectedEmail(data: {
  employeeName: string;
  merchant: string;
  totalPrice: number;
  currency: string;
  receiptDate: string;
  rejectionReason: string;
}): { subject: string; html: string } {
  const amount = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: data.currency || "TRY",
  }).format(data.totalPrice || 0);

  return {
    subject: `Expense rejected — ${data.merchant || "Unknown merchant"}`,
    html: baseTemplate(`
      <div class="header" style="background: #c42020;">
        <p class="header-title">Expense Rejected</p>
        <p class="header-sub">Your expense could not be approved</p>
      </div>
      <div class="body">
        <p>Hi ${data.employeeName},</p>
        <p>Unfortunately, your expense has been <strong>rejected</strong> by your manager.</p>
        <div class="card">
          <div class="card-row">
            <span class="card-label">Merchant</span>
            <span class="card-value">${data.merchant || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Amount</span>
            <span class="card-value">${amount}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Receipt date</span>
            <span class="card-value">${data.receiptDate || "—"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Reason</span>
            <span class="card-value">${data.rejectionReason || "No reason provided"}</span>
          </div>
          <div class="card-row">
            <span class="card-label">Status</span>
            <span class="badge badge-rejected">Rejected</span>
          </div>
        </div>
        <p>If you have questions, please contact your manager directly.</p>
      </div>
    `),
  };
}