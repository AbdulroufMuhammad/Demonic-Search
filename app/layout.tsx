import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demonic Search",
  description: "Research and artifact engine on open models, backed by Supabase.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
