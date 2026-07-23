import { describe, expect, it } from "vitest";
import { isApiRequestBodyTooLarge } from "@/lib/apiRequestBodyLimit";

function request(method: string, contentLength?: number): Request {
  return new Request("https://example.test/api/example", {
    method,
    headers:
      contentLength === undefined
        ? undefined
        : { "content-length": String(contentLength) },
  });
}

describe("isApiRequestBodyTooLarge", () => {
  it("rejects general API mutation bodies over 256KB", () => {
    expect(
      isApiRequestBodyTooLarge(request("POST", 256 * 1024 + 1), "/api/v2/dungeon/hunt"),
    ).toBe(true);
  });

  it("accepts general API mutation bodies at the limit", () => {
    expect(
      isApiRequestBodyTooLarge(request("PATCH", 256 * 1024), "/api/account"),
    ).toBe(false);
  });

  it("allows known image upload endpoints up to 5MB", () => {
    expect(
      isApiRequestBodyTooLarge(request("POST", 5 * 1024 * 1024), "/api/profile/image"),
    ).toBe(false);
    expect(
      isApiRequestBodyTooLarge(request("POST", 5 * 1024 * 1024 + 1), "/api/profile/image"),
    ).toBe(true);
  });

  it("does not apply a body limit to reads or non-API paths", () => {
    const largeGet = request("GET", 10 * 1024 * 1024);
    expect(isApiRequestBodyTooLarge(largeGet, "/api/feedback")).toBe(false);
    expect(isApiRequestBodyTooLarge(request("POST", 10 * 1024 * 1024), "/play")).toBe(false);
  });

  it("leaves requests without a declared length to the nginx hard limit", () => {
    expect(isApiRequestBodyTooLarge(request("POST"), "/api/save")).toBe(false);
  });
});
