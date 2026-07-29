import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDatabaseConnectionOptions,
  createDatabaseSslOptions,
  isLoopbackDatabaseHostname,
  normalizeDatabaseUrl,
} from "./databaseTls.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database TLS configuration", () => {
  it("removes URL SSL parameters that could override verified TLS", () => {
    const normalized = normalizeDatabaseUrl(
      "postgres://user:pass@db.example.com:5432/game?sslmode=require&sslrootcert=%2Ftmp%2Fold.pem&application_name=adventure",
    );
    const url = new URL(normalized);

    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("adventure");
  });

  it("always verifies certificates when the system trust store is used", () => {
    expect(createDatabaseSslOptions({})).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("loads a configured PEM CA bundle", () => {
    const directory = mkdtempSync(join(tmpdir(), "adventure-db-tls-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "rds-ca.pem");
    writeFileSync(
      path,
      "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n",
    );

    expect(createDatabaseSslOptions({ DATABASE_CA_CERT_PATH: path })).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n",
    });
  });

  it("fails closed for missing or malformed CA files", () => {
    expect(() =>
      createDatabaseSslOptions({
        DATABASE_CA_CERT_PATH: "/definitely/missing/rds-ca.pem",
      }),
    ).toThrow("cannot be read");

    const directory = mkdtempSync(join(tmpdir(), "adventure-db-tls-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "invalid.pem");
    writeFileSync(path, "not a certificate");
    expect(() =>
      createDatabaseSslOptions({ DATABASE_CA_CERT_PATH: path }),
    ).toThrow("does not contain a PEM certificate");
  });

  it("returns one verified configuration for Pool consumers", () => {
    expect(
      createDatabaseConnectionOptions(
        "postgresql://user:pass@db.example.com/game?sslmode=no-verify",
        {},
      ),
    ).toEqual({
      connectionString: "postgresql://user:pass@db.example.com/game",
      ssl: { rejectUnauthorized: true },
    });
  });

  it("allows plaintext connections only to loopback test databases", () => {
    for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
      expect(isLoopbackDatabaseHostname(hostname)).toBe(true);
    }
    expect(isLoopbackDatabaseHostname("db.example.com")).toBe(false);

    expect(
      createDatabaseConnectionOptions(
        "postgresql://user:pass@127.0.0.1:5432/adventure_e2e",
        { DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS: "true" },
      ),
    ).toEqual({
      connectionString:
        "postgresql://user:pass@127.0.0.1:5432/adventure_e2e",
      ssl: false,
    });
  });

  it("refuses the local TLS exception for remote hosts", () => {
    expect(() =>
      createDatabaseConnectionOptions(
        "postgresql://user:pass@db.example.com/adventure_e2e",
        { DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS: "true" },
      ),
    ).toThrow("only allowed for loopback database hosts");
  });
});
