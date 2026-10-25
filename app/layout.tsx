import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dead Night",
  description: "An agent that fills an independent café's quietest night, using Qloo taste data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
