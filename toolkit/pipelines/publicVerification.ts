const HEALTH_URL = "https://test.msmsge.com/api/health";
const VERSION_URL = "https://test.msmsge.com/api/version";
const ALLOWED_URLS = new Set([HEALTH_URL, VERSION_URL]);
const MAX_BODY_BYTES = 64 * 1024;

export type PublicClock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

const defaultClock: PublicClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type PublicVerificationDependencies = {
  fetchImpl?: typeof fetch;
  clock?: PublicClock;
  pollMs?: number;
  timeoutMs?: number;
  requestTimeoutMs?: number;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("test verification returned an unknown response type");
  }
  return value as JsonObject;
}

async function oneRequest(
  url: string,
  fetchImpl: typeof fetch,
  requestTimeoutMs: number,
): Promise<JsonObject> {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { accept: "application/json" },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("test verification redirects are forbidden");
  }
  if (response.status >= 500) {
    const error = new Error(`transient test response: ${response.status}`);
    error.name = "TransientPublicVerificationError";
    throw error;
  }
  if (!response.ok) {
    throw new Error(`test verification HTTP status: ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("test verification response is too large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new Error("test verification response is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("test verification returned invalid JSON", { cause: error });
  }
  return object(parsed);
}

function transient(error: unknown): boolean {
  return (
    (error instanceof Error &&
      error.name === "TransientPublicVerificationError") ||
    (error instanceof TypeError) ||
    (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) ||
    (error instanceof Error && error.message === "network")
  );
}

export async function fetchAllowedJson(
  url: string,
  dependencies: PublicVerificationDependencies = {},
): Promise<JsonObject> {
  if (!ALLOWED_URLS.has(url)) {
    throw new Error("test verification URL is not allowlisted");
  }
  const clock = dependencies.clock ?? defaultClock;
  const startedAt = clock.now();
  while (true) {
    try {
      return await oneRequest(
        url,
        dependencies.fetchImpl ?? fetch,
        dependencies.requestTimeoutMs ?? 10_000,
      );
    } catch (error) {
      if (!transient(error)) throw error;
      if (clock.now() - startedAt >= (dependencies.timeoutMs ?? 5 * 60_000)) {
        throw new Error("test verification retry window expired", { cause: error });
      }
      await clock.sleep(dependencies.pollMs ?? 5_000);
    }
  }
}

export type PublicVerificationResult = {
  ok: true;
  expectedSha: string;
  buildId: string;
  healthLatencyMs: number;
  versionLatencyMs: number;
  responseTime?: number;
  verifiedAt: string;
};

export async function verifyTestDeployment(
  expectedSha: string,
  dependencies: PublicVerificationDependencies = {},
): Promise<PublicVerificationResult> {
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error("expected staging SHA must be lowercase and full length");
  }
  const clock = dependencies.clock ?? defaultClock;
  const healthStarted = clock.now();
  const health = await fetchAllowedJson(HEALTH_URL, dependencies);
  const healthLatencyMs = clock.now() - healthStarted;
  if (health.ok !== true || health.db !== "ok") {
    throw new Error("test health check failed");
  }
  const versionStarted = clock.now();
  const version = await fetchAllowedJson(VERSION_URL, dependencies);
  const versionLatencyMs = clock.now() - versionStarted;
  if (version.buildId !== expectedSha) {
    throw new Error("test buildId does not match staging SHA");
  }
  return {
    ok: true,
    expectedSha,
    buildId: expectedSha,
    healthLatencyMs,
    versionLatencyMs,
    ...(typeof health.ms === "number" ? { responseTime: health.ms } : {}),
    verifiedAt: new Date(clock.now()).toISOString(),
  };
}
