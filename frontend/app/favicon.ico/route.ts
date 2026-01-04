import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  // Browsers request /favicon.ico by default.
  // Redirect to the SVG icon route to avoid 404s without shipping binary assets.
  return NextResponse.redirect(new URL("/icon.svg", request.url), 307);
}


