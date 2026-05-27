import { cookies } from "next/headers";

const ACCESS_TOKEN_COOKIE = "quimly-access-token";
const REFRESH_TOKEN_COOKIE = "quimly-refresh-token";
const EXPIRES_AT_COOKIE = "quimly-expires-at";

const defaultCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function storeSessionTokens(session: SessionTokens) {
  const cookieStore = await cookies();
  const maxAge = Math.max(session.expiresAt - Math.floor(Date.now() / 1000), 0);

  cookieStore.set(ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...defaultCookieOptions,
    maxAge,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    ...defaultCookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set(EXPIRES_AT_COOKIE, String(session.expiresAt), {
    ...defaultCookieOptions,
    maxAge,
  });
}

export async function clearSessionTokens() {
  const cookieStore = await cookies();

  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(EXPIRES_AT_COOKIE);
}

export async function readSessionTokens() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAtValue = cookieStore.get(EXPIRES_AT_COOKIE)?.value;
  const expiresAt = Number(expiresAtValue);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) {
    return null;
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
}
