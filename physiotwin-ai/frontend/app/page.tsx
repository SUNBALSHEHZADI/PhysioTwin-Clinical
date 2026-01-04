import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="motion-safe-only animate-fade-up inline-block text-gradient-animate">PhysioTwin Clinical</span>
          </h1>
          <div className="motion-safe-only animate-fade-up anim-delay-100 text-base text-muted-foreground sm:text-lg">
            Clinical Decision Support for Physiotherapy Rehabilitation
          </div>
          <div className="motion-safe-only animate-fade-up anim-delay-200 text-sm text-muted-foreground">
            Designed for safe home rehabilitation under clinician supervision
          </div>

          <div className="motion-safe-only animate-fade-up anim-delay-300 text-sm text-foreground/80">
            Real-time motion tracking with clinician-defined safe ranges and calm coaching prompts.
          </div>
          <div className="motion-safe-only animate-fade-up anim-delay-450 text-sm text-foreground/80">
            Exportable session reports support clinician review and documentation.
          </div>

          <div className="motion-safe-only animate-fade-up anim-delay-600 pt-3">
            <Button asChild size="lg">
              <Link href="/login">
                Start Rehab <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="motion-safe-only animate-fade-up anim-delay-200 overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-soft">
          <Image
            src="https://ambiq.com/wp-content/uploads/2024/02/Moving-Physical-Therapy-Forward-with-IoT-AI-exo-skeloton-1.jpg"
            alt="Clinical physiotherapy with motion tracking"
            width={1400}
            height={900}
            priority
            quality={95}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-[320px] w-full object-cover sm:h-[440px]"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <div className="rounded-3xl border border-border bg-muted/20 p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold tracking-tight">Prototype metrics (illustrative)</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  These numbers are placeholders for the prototype demo and will be replaced with audited production usage.
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/disclaimer">Decision support notice</Link>
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs text-muted-foreground">Patients satisfied (prototype)</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">800+</div>
                <div className="mt-1 text-xs text-muted-foreground">Illustrative demo value</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs text-muted-foreground">Clinician-reviewed reports</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">1,250+</div>
                <div className="mt-1 text-xs text-muted-foreground">PDF exports for documentation</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs text-muted-foreground">Average satisfaction</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">4.8 / 5</div>
                <div className="mt-1 text-xs text-muted-foreground">Prototype feedback sample</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-3xl border border-border bg-background p-6">
            <div className="text-lg font-semibold tracking-tight">How to use (patient)</div>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">1) Log in:</span> choose Patient and sign in with your assigned account.
              </div>
              <div>
                <span className="font-medium text-foreground">2) Select exercise:</span> open the dashboard and pick Knee / Arm / Shoulder.
              </div>
              <div>
                <span className="font-medium text-foreground">3) Start session:</span> place your phone stable, keep your full body in frame.
              </div>
              <div>
                <span className="font-medium text-foreground">4) Follow coaching:</span> stay within your clinician-defined safe range.
              </div>
              <div>
                <span className="font-medium text-foreground">5) Save results:</span> your session is recorded for progress + therapist review.
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/login">Start a guided session</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-border bg-background p-6">
            <div className="text-lg font-semibold tracking-tight">How to use (therapist)</div>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">1) Sign in:</span> choose Therapist and log in to the portal.
              </div>
              <div>
                <span className="font-medium text-foreground">2) Review alerts:</span> prioritize red/yellow flags from sessions.
              </div>
              <div>
                <span className="font-medium text-foreground">3) Open patient:</span> inspect recent sessions and trends.
              </div>
              <div>
                <span className="font-medium text-foreground">4) Document:</span> export PDF summaries for clinical documentation.
              </div>
              <div>
                <span className="font-medium text-foreground">5) Adjust plan:</span> update protocols based on observed safety + progress.
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <Link href="/therapist">Open therapist dashboard</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/disclaimer">Clinical disclaimer</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-center">
        <div className="text-xs text-muted-foreground">
          © PhysioTwin Clinical - AI-Assisted Physiotherapy Decision Support
        </div>
        <div className="mt-1 text-xs text-muted-foreground">For professional use under clinician supervision</div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Decision support only.{" "}
          <Link href="/disclaimer" className="underline underline-offset-4">
            Read disclaimer
          </Link>
        </div>
      </footer>
    </div>
  );
}


