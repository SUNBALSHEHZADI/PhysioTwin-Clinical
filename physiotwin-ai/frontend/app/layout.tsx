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
          <div className="mb-4 rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Disclaimer:</span> This software provides decision support only and
            does not replace clinical judgment. It does not diagnose or prescribe. Clinicians remain fully responsible for care.
          </div>
          {children}
        </AppShell>
      </body>
    </html>
  );
}


