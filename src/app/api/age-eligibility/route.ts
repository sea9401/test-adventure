import { NextResponse } from "next/server";
import {
  AGE_ELIGIBILITY_COOKIE,
  AGE_ELIGIBILITY_MAX_AGE_SECONDS,
  createAgeEligibilityToken,
} from "@/lib/server/ageEligibility";

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestUrl = new URL(request.url);
    const host =
      firstForwardedValue(request.headers.get("x-forwarded-host")) ??
      request.headers.get("host") ??
      requestUrl.host;
    const protocol =
      firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
      requestUrl.protocol.slice(0, -1);
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    (body as { confirmed?: unknown }).confirmed !== true
  ) {
    return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  }

  const token = createAgeEligibilityToken(process.env.AUTH_SECRET);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(AGE_ELIGIBILITY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AGE_ELIGIBILITY_MAX_AGE_SECONDS,
    priority: "high",
  });
  return response;
}
