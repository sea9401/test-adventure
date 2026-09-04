import { describe, expect, it } from "vitest";

import {
  fetchAllowedJson,
  verifyTestDeployment,
} from "./publicVerification";

class Clock {
  value = 0;
  now = () => this.value;
  sleep = async (ms: number) => { this.value += ms; };
}

function responses(values: Array<Response | Error>) {
  return async () => {
    const value = values.shift();
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error("no response");
    return value;
  };
}

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("verifyTestDeployment", () => {
  it("requires healthy app, healthy DB, and exact full SHA", async () => {
    const sha = "c".repeat(40);
    await expect(
      verifyTestDeployment(sha, {
        fetchImpl: responses([
          json({ ok: true, db: "ok", ms: 23, time: 1 }),
          json({ buildId: sha }),
        ]),
        clock: new Clock(),
      }),
    ).resolves.toMatchObject({ ok: true, buildId: sha, expectedSha: sha });
  });

  it("rejects DB failure and another healthy SHA", async () => {
    await expect(
      verifyTestDeployment("c".repeat(40), {
        fetchImpl: responses([json({ ok: true, db: "down" })]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test health check failed");
    await expect(
      verifyTestDeployment("c".repeat(40), {
        fetchImpl: responses([
          json({ ok: true, db: "ok" }),
          json({ buildId: "d".repeat(40) }),
        ]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test buildId does not match staging SHA");
  });

  it("rejects redirects, oversized bodies, invalid JSON, and non-allowlisted URLs", async () => {
    await expect(
      fetchAllowedJson("https://example.com/api/health", {
        fetchImpl: responses([]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test verification URL is not allowlisted");
    await expect(
      fetchAllowedJson("https://test.msmsge.com/api/health", {
        fetchImpl: responses([
          new Response("", {
            status: 302,
            headers: { location: "https://example.com" },
          }),
        ]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test verification redirects are forbidden");
    await expect(
      fetchAllowedJson("https://test.msmsge.com/api/health", {
        fetchImpl: responses([
          new Response("x".repeat(65 * 1024), { status: 200 }),
        ]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test verification response is too large");
    await expect(
      fetchAllowedJson("https://test.msmsge.com/api/health", {
        fetchImpl: responses([new Response("not-json", { status: 200 })]),
        clock: new Clock(),
      }),
    ).rejects.toThrow("test verification returned invalid JSON");
  });

  it("retries transient failures but not malformed success JSON", async () => {
    const clock = new Clock();
    await expect(
      fetchAllowedJson("https://test.msmsge.com/api/health", {
        fetchImpl: responses([
          new Error("network"),
          new Response("unavailable", { status: 503 }),
          json({ ok: true, db: "ok" }),
        ]),
        clock,
        pollMs: 5,
        timeoutMs: 100,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(clock.value).toBe(10);
  });
});
