// src/lib/useEmailNotification.ts
// Email bildirimi göndermek için yardımcı hook
// Kiosk ve dashboard'dan çağrılır

"use client";

import { useCallback } from "react";
import type { User } from "firebase/auth";
import type { Expense } from "@/lib/types";

type EmailType = "submitted" | "approved" | "rejected";

export function useEmailNotification(user: User | null) {
  const sendNotification = useCallback(
    async (
      type: EmailType,
      expense: Partial<Expense>,
      employeeEmail: string,
      employeeName?: string
    ) => {
      if (!user || !employeeEmail) return;

      try {
        const token = await user.getIdToken();
        await fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            type,
            expense,
            employeeEmail,
            employeeName,
          }),
        });
      } catch (err) {
        // Email hatası sessizce geçer — ana akışı durdurmaz
        console.error("Email notification failed:", err);
      }
    },
    [user]
  );

  return { sendNotification };
}