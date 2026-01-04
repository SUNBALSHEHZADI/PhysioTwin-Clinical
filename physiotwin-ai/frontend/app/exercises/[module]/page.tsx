import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ModuleKey = "knee" | "shoulder" | "arm";

const MODULES: Record<
  ModuleKey,
  {
    title: string;
    subtitle: string;
    imageSrc: string;
    bullets: string[];
  }
> = {
  knee: {
    title: "Knee Rehabilitation",
    subtitle: "Seated knee extension with clinician-defined safe range and calm coaching.",
    imageSrc: "/images/exercises/knee.svg",
    bullets: [
      "Prepare: good lighting and full body in frame (head + feet).",
      "Move slowly through the safe range. Stop if pain increases.",
      "Exportable PDF report supports clinician review."
    ]
  },
  shoulder: {
    title: "Shoulder Rehabilitation",
    subtitle: "Shoulder elevation guidance within clinician-defined ROM.",
    imageSrc: "/images/exercises/shoulder.svg",
    bullets: [
      "Keep the shoulder relaxed. Avoid trunk lean or shrugging.",
      "Control the tempo - smooth up, smooth down.",
      "Follow on-screen positioning prompts before starting reps."
    ]
  },
  arm: {
    title: "Arm Rehabilitation",
    subtitle: "Elbow motion guidance with posture control and coaching prompts.",
    imageSrc: "/images/exercises/arm.svg",
    bullets: [
      "Keep shoulder stable. Avoid compensating with the trunk.",
      "Maintain the elbow in frame (shoulder-elbow-wrist visible).",
      "Use the back camera on mobile for sharper tracking."
    ]
  }
};

function isModuleKey(v: string): v is ModuleKey {
  return v === "knee" || v === "shoulder" || v === "arm";
}

export default async function ExerciseLandingPage({ params }: { params: Promise<{ module: string }> }) {
  const { module: raw } = await params;
  const module = decodeURIComponent(raw ?? "");
  const key: ModuleKey = isModuleKey(module) ? module : "knee";
  const m = MODULES[key];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">{m.title}</CardTitle>
          <CardDescription>{m.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-soft">
            <Image
              src={m.imageSrc}
              alt={`${m.title} - PhysioTwin Clinical`}
              width={1600}
              height={900}
              priority
              quality={95}
              sizes="(max-width: 1024px) 100vw, 900px"
              className="h-[240px] w-full object-cover sm:h-[360px]"
            />
          </div>

          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-sm font-medium">Session guidance</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {m.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-muted-foreground">
              Tip: Replace this placeholder image with your DALL·E hero image by saving it as{" "}
              <span className="font-medium text-foreground">{m.imageSrc}</span>.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`/session?module=${key}`}>Start session</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


