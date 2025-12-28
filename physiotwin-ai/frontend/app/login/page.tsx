"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Stethoscope, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { setAuth, type Role } from "@/utils/auth";

const demoCreds = {
  patient: { email: "demo.patient@physiotwin.ai", password: "Password123!" },
  therapist: { email: "demo.therapist@physiotwin.ai", password: "Password123!" }
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("patient");
  const [email, setEmail] = useState<string>(demoCreds.patient.email);
  const [password, setPassword] = useState<string>(demoCreds.patient.password);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(demoCreds[role].email);
    setPassword(demoCreds[role].password);
  }, [role]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Mock auth for MVP. Token is a local placeholder.
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    setAuth({ email, role, token: "mock-token" });
    router.push(role === "patient" ? "/dashboard" : "/therapist");
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Welcome Back</CardTitle>
              <CardDescription>Sign in to continue your rehabilitation session.....</CardDescription>
            </div>
            <Badge variant="info">Demo</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("patient")}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    role === "patient" ? "border-transparent bg-background shadow-soft" : "border-border bg-muted/30 hover:bg-muted"
                  }`}
                >
                  <User className="h-4 w-4" /> Patient
                </button>
                <button
                  type="button"
                  onClick={() => setRole("therapist")}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    role === "therapist" ? "border-transparent bg-background shadow-soft" : "border-border bg-muted/30 hover:bg-muted"
                  }`}
                >
                  <Stethoscope className="h-4 w-4" /> Therapist
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                This MVP uses local mock auth (no paid services). Backend auth can be enabled later without UI changes.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-muted-foreground hover:bg-muted"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

            <Button size="lg" className="w-full" type="submit">
              Continue
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              <Link className="underline underline-offset-4" href="/">
                Back to Landing
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


