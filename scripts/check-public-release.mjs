#!/usr/bin/env node

const baseUrl = new URL(
  process.env.PUBLIC_RELEASE_BASE_URL?.trim() || "https://msmsge.com",
);
const expectedBuildId =
  process.env.PUBLIC_RELEASE_EXPECTED_BUILD_ID?.trim() || "";
const retries = positiveInteger(process.env.PUBLIC_RELEASE_RETRIES, 3);
const retryDelayMs = positiveInteger(
  process.env.PUBLIC_RELEASE_RETRY_DELAY_MS,
  3_000,
);
const maintenancePolicy = maintenancePolicyFromEnv(
  process.env.PUBLIC_RELEASE_MAINTENANCE_POLICY,
);
const maintenanceMarker = "서버 점검 중입니다";

const checks = [
  {
    label: "health",
    path: "/api/health",
    status: 200,
    validate({ body }) {
      const value = parseJson(body, "/api/health");
      if (value.ok !== true || value.db !== "ok") {
        throw new Error("expected { ok: true, db: 'ok' }");
      }
    },
  },
  {
    label: "version",
    path: "/api/version",
    status: 200,
    validate({ body, response }) {
      const value = parseJson(body, "/api/version");
      if (typeof value.buildId !== "string" || value.buildId === "dev") {
        throw new Error("missing production buildId");
      }
      if (
        expectedBuildId &&
        value.buildId !== expectedBuildId &&
        !expectedBuildId.startsWith(value.buildId)
      ) {
        throw new Error(
          `buildId ${value.buildId} does not match ${expectedBuildId.slice(0, 12)}`,
        );
      }
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (!cacheControl.includes("no-store")) {
        throw new Error("/api/version must use cache-control: no-store");
      }
    },
  },
  {
    label: "anonymous root redirect",
    path: "/",
    status: 307,
    validate({ response }) {
      const location = response.headers.get("location");
      if (!location || new URL(location, baseUrl).pathname !== "/sign-in") {
        throw new Error(`expected redirect to /sign-in, received ${location}`);
      }
    },
  },
  {
    label: "sign-in",
    path: "/sign-in",
    status: 200,
    bodyIncludes: "카카오톡으로 로그인",
    validate: validateSecurityHeaders,
  },
  {
    label: "terms",
    path: "/terms",
    status: 200,
    bodyIncludes: "이용약관",
  },
  {
    label: "privacy",
    path: "/privacy",
    status: 200,
    bodyIncludes: "개인정보처리방침",
  },
  {
    label: "operations policy",
    path: "/operations",
    status: 200,
    bodyIncludes: "운영정책",
  },
  {
    label: "open source notices",
    path: "/licenses",
    status: 200,
    bodyIncludes: "오픈소스 고지",
  },
  {
    label: "third-party notice file",
    path: "/third-party-notices.txt",
    status: 200,
    bodyIncludes: "THIRD-PARTY SOFTWARE AND FONT NOTICES",
  },
  {
    label: "robots",
    path: "/robots.txt",
    status: 200,
    bodyIncludes: "Sitemap:",
  },
  {
    label: "sitemap",
    path: "/sitemap.xml",
    status: 200,
    bodyIncludes: `${baseUrl.origin}/privacy`,
  },
  { label: "development UI hidden", path: "/dev", status: 404 },
  {
    label: "coin shop page hidden",
    path: "/settings/coin-shop",
    status: 404,
  },
  {
    label: "coin shop API hidden",
    path: "/api/v2/museun-coin-shop",
    status: 404,
  },
  {
    label: "private housing page hidden",
    path: "/character/room",
    status: 404,
  },
  {
    label: "public housing page hidden",
    path: "/character/nonexistent/room",
    status: 404,
  },
  {
    label: "private housing API hidden",
    path: "/api/v2/me/housing",
    status: 404,
  },
  {
    label: "public housing API hidden",
    path: "/api/v2/player/nonexistent/housing",
    status: 404,
  },
  {
    label: "development API hidden",
    path: "/api/v2/dev/grant",
    method: "POST",
    status: 404,
    headers: { "content-type": "application/json" },
    body: "{}",
  },
];

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function maintenancePolicyFromEnv(value) {
  const normalized = value?.trim().toLowerCase() || "forbid";
  if (["forbid", "allow", "require"].includes(normalized)) {
    return normalized;
  }
  throw new Error(
    `PUBLIC_RELEASE_MAINTENANCE_POLICY must be forbid, allow, or require (received ${value})`,
  );
}

function parseJson(body, path) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${path} did not return JSON`);
  }
}

function validateSecurityHeaders({ response }) {
  const required = [
    ["content-security-policy", "default-src 'self'"],
    ["strict-transport-security", "max-age="],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
  ];
  for (const [name, marker] of required) {
    const value = response.headers.get(name) ?? "";
    if (!value.includes(marker)) {
      throw new Error(`missing ${name} header marker: ${marker}`);
    }
  }
}

async function runCheck(check) {
  let lastError = "unknown failure";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(new URL(check.path, baseUrl), {
        method: check.method ?? "GET",
        headers: {
          "user-agent": "msmsge-public-release-smoke/1.0",
          ...(check.headers ?? {}),
        },
        body: check.body,
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
      const body = await response.text();
      if (response.status !== check.status) {
        throw new Error(`HTTP ${response.status}, expected ${check.status}`);
      }
      if (check.bodyIncludes && !body.includes(check.bodyIncludes)) {
        throw new Error(`response is missing marker: ${check.bodyIncludes}`);
      }
      check.validate?.({ body, response });
      console.log(
        `PUBLIC RELEASE OK: ${check.method ?? "GET"} ${check.path} ${response.status} (try ${attempt})`,
      );
      return null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown failure";
      console.error(
        `PUBLIC RELEASE RETRY: ${check.method ?? "GET"} ${check.path} (${attempt}/${retries}) — ${lastError}`,
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  return `${check.method ?? "GET"} ${check.path}: ${lastError}`;
}

async function probeMaintenance() {
  let lastError = "unknown failure";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(new URL("/", baseUrl), {
        headers: { "user-agent": "msmsge-public-release-smoke/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
      const body = await response.text();
      if (response.status === 503 && body.includes(maintenanceMarker)) {
        console.log(
          `PUBLIC RELEASE MAINTENANCE: GET / 503 (try ${attempt})`,
        );
        return { active: true, error: null };
      }
      if (response.status !== 503) {
        return { active: false, error: null };
      }
      throw new Error(`HTTP 503 without maintenance marker: ${maintenanceMarker}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown failure";
      console.error(
        `PUBLIC RELEASE MAINTENANCE RETRY: GET / (${attempt}/${retries}) — ${lastError}`,
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  return { active: false, error: lastError };
}

function isDiscordWebhook(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "discord.com" ||
      hostname.endsWith(".discord.com") ||
      hostname === "discordapp.com" ||
      hostname.endsWith(".discordapp.com")
    );
  } catch {
    return false;
  }
}

async function notifyFailure(failures) {
  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url) {
    console.error(
      "PUBLIC RELEASE WARN: OPS_ALERT_WEBHOOK_URL 미설정 — 워크플로 실패 알림만 사용합니다.",
    );
    return;
  }
  const message = [
    "🚨 **게임 외부 접속 점검에 실패했습니다**",
    "사용자가 접속하는 공개 주소 중 정상 응답하지 않는 곳이 있습니다.",
    "",
    ...failures.map((failure) => `- ${failure}`),
    "",
    "**확인할 일**",
    "GitHub Actions의 External uptime monitor 또는 배포 로그를 확인하세요. 점검 중이라면 점검 화면이 의도한 상태로 유지되는지도 확인하세요.",
  ].join("\n");
  const payload = isDiscordWebhook(url)
    ? { content: message.slice(0, 2_000), allowed_mentions: { parse: [] } }
    : {
        text: message,
        detail: { source: "public-release-smoke", failed: failures.length },
        at: new Date().toISOString(),
      };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(
        `PUBLIC RELEASE WARN: 운영 webhook HTTP ${response.status}`,
      );
    }
  } catch (error) {
    console.error(
      `PUBLIC RELEASE WARN: 운영 webhook 전송 실패 — ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}

let failures = [];
let maintenanceAccepted = false;

if (maintenancePolicy === "forbid") {
  failures = (await Promise.all(checks.map(runCheck))).filter(Boolean);
} else {
  const [healthFailure, maintenance] = await Promise.all([
    runCheck(checks[0]),
    probeMaintenance(),
  ]);
  if (healthFailure) failures.push(healthFailure);
  if (maintenance.error) {
    failures.push(`GET / maintenance probe: ${maintenance.error}`);
  } else if (maintenance.active) {
    maintenanceAccepted = true;
  } else if (maintenancePolicy === "require") {
    failures.push("GET /: maintenance mode is not enabled");
  } else {
    failures.push(
      ...(await Promise.all(checks.slice(1).map(runCheck))).filter(Boolean),
    );
  }
}

if (failures.length > 0) {
  console.error(
    `PUBLIC RELEASE FAIL: ${baseUrl.origin} — ${failures.join(" | ")}`,
  );
  await notifyFailure(failures);
  process.exit(1);
}

if (maintenanceAccepted) {
  console.log(
    `PUBLIC RELEASE MAINTENANCE PASS: ${baseUrl.origin} · health 200 · maintenance 503`,
  );
} else {
  console.log(
    `PUBLIC RELEASE PASS: ${baseUrl.origin}${expectedBuildId ? ` · build ${expectedBuildId.slice(0, 12)}` : ""}`,
  );
}
