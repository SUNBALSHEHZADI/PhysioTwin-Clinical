import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "@/styles/globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Physiotherapy Clinic",
  description: "Clinical decision support for physiotherapy (CDSS)"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}


