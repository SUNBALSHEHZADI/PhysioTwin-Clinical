import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DisclaimerPage() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">Disclaimer</CardTitle>
          <CardDescription>PhysioTwin Clinical provides decision support only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            This software provides AI-assisted physiotherapy decision support and does not replace professional clinical judgment. It does not
            diagnose conditions, prescribe treatment, or provide emergency guidance.
          </p>
          <p>
            Users should follow clinician-defined protocols and stop immediately if they experience sharp pain, dizziness, instability, or new
            swelling. For urgent concerns, contact a licensed clinician or local emergency services.
          </p>
          <p>
            Pose tracking quality can vary with lighting, clothing, camera placement, and device performance. Session outputs should be reviewed by
            a qualified clinician before clinical decisions are made.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


