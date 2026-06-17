import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "InWise Kiosk",
  description: "RFID receipt expense kiosk and approval workflow"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Runs before hydration to prevent flash of wrong theme */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t||"dark";})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
