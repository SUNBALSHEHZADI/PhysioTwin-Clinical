import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REHAB_MODULES } from "@/components/rehab/modules";

export default function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Clinical Rehabilitation, Simplified
          </h1>
          <div className="text-base text-muted-foreground sm:text-lg">
            AI-assisted physiotherapy with real-time motion tracking and voice guidance
          </div>
          <div className="text-sm text-muted-foreground">
            Designed for safe home rehabilitation under clinician supervision
          </div>

          <div className="pt-2">
            <Button asChild size="lg">
              <Link href="/login">
                Start Rehab <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-muted/20 shadow-soft">
          <Image
            src="https://ambiq.com/wp-content/uploads/2024/02/Moving-Physical-Therapy-Forward-with-IoT-AI-exo-skeloton-1.jpg"
            alt="Clinical physiotherapy with motion tracking"
            width={1400}
            height={900}
            priority
            quality={95}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-[320px] w-full object-cover sm:h-[420px]"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-sm font-semibold">Select a rehabilitation module</div>
        <div className="grid gap-3 md:grid-cols-3">
          {REHAB_MODULES.map((m) => (
            <Card key={m.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{m.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">{m.subtitle}</div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/session?module=${m.key}`}>Start</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}


