"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, ListChecks, ShieldAlert, Stethoscope } from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/LogoMark";
import { Button } from "@/components/ui/button";
import { getAuth, logout, type AuthState } from "@/utils/auth";

type NavItem = { href: string; label: string; icon: React.ReactNode; roles: Array<"patient" | "therapist"> };

const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <Home className="h-4 w-4" />, roles: ["patient"] },
  { href: "/session", label: "Start Session", icon: <ListChecks className="h-4 w-4" />, roles: ["patient"] },
  { href: "/progress", label: "Progress", icon: <BarChart3 className="h-4 w-4" />, roles: ["patient"] },
  { href: "/therapist", label: "Therapist", icon: <Stethoscope className="h-4 w-4" />, roles: ["therapist"] }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Avoid hydration mismatch: server-rendered HTML must match the first client render.
  // Read localStorage only after mount.
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAuth(getAuth());
  }, []);

  const items = nav.filter((n) => (auth?.role ? n.roles.includes(auth.role) : false));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark />
            <div className="leading-tight">
              <div className="text-sm font-semibold">PhysioTwin Clinical</div>
              <div className="text-xs text-muted-foreground">Physiotherapy CDSS • Knee Rehab</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {mounted && auth?.email ? (
              <>
                <div className="hidden text-right sm:block">
                  <div className="text-xs font-medium">{auth.email}</div>
                  <div className="text-[11px] text-muted-foreground">{auth.role}</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    logout();
                    window.location.href = "/login";
                  }}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button asChild variant="outline">
                <Link href="/login">Login</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {mounted && auth?.email ? (
        <nav className="border-b border-border bg-muted/30">
          <div className="container flex items-center gap-2 overflow-x-auto py-3">
            {items.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="h-4 w-4" />
                Select a role at login.
              </div>
            ) : (
              items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition-colors",
                      active ? "border-transparent bg-background shadow-soft" : "border-border bg-background/40 hover:bg-background"
                    )}
                  >
                    {item.icon}
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })
            )}
          </div>
        </nav>
      ) : null}

      <main className="container py-6">{children}</main>
    </div>
  );
}


