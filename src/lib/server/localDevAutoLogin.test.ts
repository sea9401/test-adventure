import { describe, expect, it } from "vitest";
import {
  authenticateLocalDevAccount,
  isLoopbackAuthRequest,
  readLocalDevAutoLoginConfig,
  shouldStartLocalDevAutoLogin,
  type LocalDevAccountUser,
} from "./localDevAutoLogin";

const DEV_ENV = {
  LOCAL_DEV_AUTO_LOGIN_USER_EMAIL: " owner@example.com ",
};

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/local-dev", { headers });
}

describe("local development auto login config", () => {
  it("development와 유효한 이메일이 함께 있을 때만 활성화한다", () => {
    expect(readLocalDevAutoLoginConfig(DEV_ENV, "development")).toEqual({
      userEmail: "owner@example.com",
    });
    expect(readLocalDevAutoLoginConfig(DEV_ENV, "production")).toBeNull();
    expect(readLocalDevAutoLoginConfig(DEV_ENV, "test")).toBeNull();
    expect(
      readLocalDevAutoLoginConfig(
        { LOCAL_DEV_AUTO_LOGIN_USER_EMAIL: "not-an-email" },
        "development",
      ),
    ).toBeNull();
    expect(readLocalDevAutoLoginConfig({}, "development")).toBeNull();
  });
});

describe("local development auto login request", () => {
  it.each([
    [{ host: "localhost:3000" }],
    [{ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }],
    [{ host: "[::1]:3000", origin: "http://[::1]:3000" }],
  ])("loopback Host와 Origin을 허용한다: %o", (headers) => {
    expect(isLoopbackAuthRequest(request(headers))).toBe(true);
  });

  it.each([
    [{ host: "dev.example.com" }],
    [{ host: "localhost:3000", origin: "https://evil.example.com" }],
    [{}],
  ])("원격 또는 출처가 불명확한 요청을 거부한다: %o", (headers) => {
    expect(isLoopbackAuthRequest(request(headers))).toBe(false);
  });

  it("가드를 통과한 요청만 개발 DB의 기존 계정을 반환한다", async () => {
    const existingUser: LocalDevAccountUser = {
      id: "owner-user-id",
      email: "owner@example.com",
      name: "운영자",
      image: null,
    };
    const lookedUpEmails: string[] = [];
    const findUserByEmail = async (email: string) => {
      lookedUpEmails.push(email);
      return existingUser;
    };

    await expect(
      authenticateLocalDevAccount(request({ host: "localhost:3000" }), {
        env: DEV_ENV,
        nodeEnv: "development",
        findUserByEmail,
      }),
    ).resolves.toEqual(existingUser);
    expect(lookedUpEmails).toEqual(["owner@example.com"]);

    await expect(
      authenticateLocalDevAccount(request({ host: "remote.example.com" }), {
        env: DEV_ENV,
        nodeEnv: "development",
        findUserByEmail,
      }),
    ).resolves.toBeNull();
    await expect(
      authenticateLocalDevAccount(request({ host: "localhost:3000" }), {
        env: DEV_ENV,
        nodeEnv: "production",
        findUserByEmail,
      }),
    ).resolves.toBeNull();
    expect(lookedUpEmails).toEqual(["owner@example.com"]);
  });

  it("설정된 이메일의 기존 계정이 없으면 인증하지 않는다", async () => {
    await expect(
      authenticateLocalDevAccount(request({ host: "localhost:3000" }), {
        env: DEV_ENV,
        nodeEnv: "development",
        findUserByEmail: async () => null,
      }),
    ).resolves.toBeNull();
  });

  it("비로그인 loopback 대문에서 이전 로그인 오류가 없을 때만 자동 로그인을 시작한다", () => {
    const localRequest = request({ host: "localhost:3000" });
    const base = {
      request: localRequest,
      env: DEV_ENV,
      nodeEnv: "development",
    };

    expect(
      shouldStartLocalDevAutoLogin({
        ...base,
        hasSession: false,
        authError: null,
      }),
    ).toBe(true);
    expect(
      shouldStartLocalDevAutoLogin({
        ...base,
        hasSession: true,
        authError: null,
      }),
    ).toBe(false);
    expect(
      shouldStartLocalDevAutoLogin({
        ...base,
        hasSession: false,
        authError: "CredentialsSignin",
      }),
    ).toBe(false);
  });
});
