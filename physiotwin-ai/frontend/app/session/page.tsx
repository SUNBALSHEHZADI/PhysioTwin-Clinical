import { Suspense } from "react";

import SessionClient from "./SessionClient";

function Loading() {
  return (
    <div className="rounded-2xl border border-border bg-background p-6 text-sm text-muted-foreground">
      Loading session…
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SessionClient />
    </Suspense>
  );
}
