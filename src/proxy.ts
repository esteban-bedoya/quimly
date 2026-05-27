import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_TOKEN_COOKIE = "quimly-access-token";
const EXPIRES_AT_COOKIE = "quimly-expires-at";

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const expiresAtValue = request.cookies.get(EXPIRES_AT_COOKIE)?.value;
  const expiresAt = Number(expiresAtValue);

  if (!accessToken || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
