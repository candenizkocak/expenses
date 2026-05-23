import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Expense Kiosk",
  description: "RFID receipt expense kiosk and approval workflow"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
