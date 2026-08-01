import { NextResponse, type NextRequest } from "next/server";

import { clearSessionTokens } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  await clearSessionTokens();

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
