import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LiveKit Session Monitor",
  description: "Record, analyze, and score LiveKit sessions"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
