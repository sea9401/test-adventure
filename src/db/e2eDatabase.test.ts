import { describe, expect, it } from "vitest";
import {
  E2E_ACCOUNT_EMAIL,
  E2E_ACCOUNT_USER_ID,
  assertIsolatedE2eDatabaseUrl,
  readE2eAccountConfig,
} from "./e2eDatabase.mjs";

describe("isolated E2E database setup", () => {
  it("accepts only the dedicated loopback database", () => {
    expect(
      assertIsolatedE2eDatabaseUrl(
        "postgresql://browser_e2e:password@127.0.0.1:5432/adventure_e2e?sslmode=disable",
      ),
    ).toBe(
      "postgresql://browser_e2e:password@127.0.0.1:5432/adventure_e2e",
    );

    expect(() =>
      assertIsolatedE2eDatabaseUrl(
        "postgresql://browser_e2e:password@db.example.com/adventure_e2e",
      ),
    ).toThrow("loopback or GitHub Actions test host");
    expect(() =>
      assertIsolatedE2eDatabaseUrl(
        "postgresql://browser_e2e:password@127.0.0.1/production",
      ),
    ).toThrow("dedicated adventure_e2e database");
  });

  it("accepts the dedicated GitHub Actions service database only in Actions", () => {
    const value =
      "postgresql://browser_e2e:password@postgres:5432/adventure_e2e";
    const githubActionsEnv = { CI: "true", GITHUB_ACTIONS: "true" };

    expect(assertIsolatedE2eDatabaseUrl(value, githubActionsEnv)).toBe(value);
    expect(() => assertIsolatedE2eDatabaseUrl(value, {})).toThrow(
      "loopback or GitHub Actions test host",
    );
    expect(() =>
      assertIsolatedE2eDatabaseUrl(
        "postgresql://browser_e2e:password@postgres:5432/production",
        githubActionsEnv,
      ),
    ).toThrow("dedicated adventure_e2e database");
  });

  it("returns fixed account identity and validated credentials", () => {
    expect(E2E_ACCOUNT_USER_ID).toBe("00000000-0000-4000-8000-000000000001");
    expect(E2E_ACCOUNT_EMAIL).toBe("browser-e2e@accounts.msmsge.invalid");
    expect(
      readE2eAccountConfig({
        E2E_TEST_LOGIN_ID: "Browser-E2E",
        E2E_TEST_PASSWORD: "local-test-password",
      }),
    ).toEqual({
      loginId: "Browser-E2E",
      normalizedLoginId: "browser-e2e",
      password: "local-test-password",
    });
  });

  it("rejects missing or invalid deterministic credentials", () => {
    expect(() => readE2eAccountConfig({})).toThrow("E2E_TEST_LOGIN_ID");
    expect(() =>
      readE2eAccountConfig({
        E2E_TEST_LOGIN_ID: "browser-e2e",
        E2E_TEST_PASSWORD: "short",
      }),
    ).toThrow("E2E_TEST_PASSWORD");
  });
});
