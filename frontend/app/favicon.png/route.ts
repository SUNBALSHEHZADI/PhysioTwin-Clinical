import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  // Some clients probe /favicon.png.
  return NextResponse.redirect(new URL("/icon.svg", request.url), 307);
}


