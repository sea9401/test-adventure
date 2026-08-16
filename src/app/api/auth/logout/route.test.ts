import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_LOGOUT_GUARD_COOKIE } from "@/lib/authSessionConfig";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("모든 Auth.js JWT 세션 쿠키만 만료하고 완료를 응답한다", async () => {
    const request = new NextRequest("https://example.com/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: [
          "authjs.session-token=plain",
          "authjs.session-token.0=chunk",
          "__Secure-authjs.session-token=secure",
          "game-device-session.v1=keep",
        ].join("; "),
      },
    });

    const response = POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.cookies.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "authjs.session-token", value: "" }),
        expect.objectContaining({ name: "authjs.session-token.0", value: "" }),
        expect.objectContaining({
          name: "__Secure-authjs.session-token",
          value: "",
        }),
        expect.objectContaining({
          name: AUTH_LOGOUT_GUARD_COOKIE,
          value: "1",
        }),
      ]),
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      "game-device-session.v1",
    );
  });
});
