import { describe, expect, it } from "vitest";
import {
  hashPasswordAccountPassword,
  isValidPasswordAccountPassword,
  normalizePasswordAccountLoginId,
  verifyPasswordAccountPassword,
} from "./passwordCredentialCore.mjs";

describe("operator-issued password accounts", () => {
  it("normalizes valid login IDs and rejects unsafe values", () => {
    expect(normalizePasswordAccountLoginId(" Youn.296 ")).toEqual({
      loginId: "Youn.296",
      normalizedLoginId: "youn.296",
    });
    expect(normalizePasswordAccountLoginId("ab")).toBeNull();
    expect(normalizePasswordAccountLoginId("user name")).toBeNull();
    expect(normalizePasswordAccountLoginId("한글아이디")).toBeNull();
  });

  it("accepts passwords from six characters", () => {
    expect(isValidPasswordAccountPassword("123456")).toBe(true);
    expect(isValidPasswordAccountPassword("12345")).toBe(false);
  });

  it("stores salted scrypt hashes and verifies without exposing plaintext", async () => {
    const first = await hashPasswordAccountPassword("dbswls77");
    const second = await hashPasswordAccountPassword("dbswls77");

    expect(first).not.toBe(second);
    expect(first).not.toContain("dbswls77");
    await expect(
      verifyPasswordAccountPassword("dbswls77", first),
    ).resolves.toBe(true);
    await expect(
      verifyPasswordAccountPassword("wrong-password", first),
    ).resolves.toBe(false);
    await expect(
      verifyPasswordAccountPassword("dbswls77", "invalid"),
    ).resolves.toBe(false);
  });
});
