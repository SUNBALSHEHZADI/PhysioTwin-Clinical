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
            PhysioTwin Clinical
          </h1>
          <div className="text-base text-muted-foreground sm:text-lg">
            Clinical Decision Support for Physiotherapy Rehabilitation
          </div>
          <div className="text-sm text-muted-foreground">
            Designed for safe home rehabilitation under clinician supervision
          </div>

          <div className="text-sm text-foreground/80">
            Real-time motion tracking with clinician-defined safe ranges and calm coaching prompts.
          </div>
          <div className="text-sm text-foreground/80">Exportable session reports support clinician review and documentation.</div>

          <div className="pt-3">
            <Button asChild size="lg">
              <Link href="/login">
                Start Rehab <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-soft">
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

      <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Disclaimer:</span> This software provides decision support only and does not
        replace clinical judgment. It does not diagnose or prescribe. For professional use under clinician supervision.
      </div>

      <footer className="border-t border-border pt-6 text-center">
        <div className="text-xs text-muted-foreground">
          © PhysioTwin Clinical — AI-Assisted Physiotherapy Decision Support
        </div>
        <div className="mt-1 text-xs text-muted-foreground">For professional use under clinician supervision</div>
      </footer>
    </div>
  );
}


