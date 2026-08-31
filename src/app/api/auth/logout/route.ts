import { type NextRequest, NextResponse } from "next/server";
import {
  AUTH_LOGOUT_GUARD_COOKIE,
  AUTH_LOGOUT_GUARD_MAX_AGE_SECONDS,
} from "@/lib/authSessionConfig";

const SESSION_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`),
  );
}

export function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  for (const cookie of request.cookies.getAll()) {
    if (isSessionCookie(cookie.name)) response.cookies.delete(cookie.name);
  }
  response.cookies.set(AUTH_LOGOUT_GUARD_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure:
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: AUTH_LOGOUT_GUARD_MAX_AGE_SECONDS,
  });
  return response;
}
