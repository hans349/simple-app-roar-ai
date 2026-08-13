import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "simple-app-roar-ai",
  description: "A minimal harness for testing database writes and email delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
