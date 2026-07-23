import {
  createDatabaseSslOptions,
  normalizeDatabaseUrl,
} from "../src/db/databaseTls.mjs";

const required = [
  "AUTH_SECRET",
  "AUTH_URL",
  "AUTH_KAKAO_ID",
  "AUTH_KAKAO_SECRET",
  "DATABASE_URL",
  "DATABASE_CA_CERT_PATH",
  "ADMIN_EMAILS",
  "CRON_SECRET",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAMES",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`✗ production env missing: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of ["AUTH_SECRET", "CRON_SECRET"]) {
  if (process.env[key].trim().length < 32) {
    console.error(`✗ production ${key} must be at least 32 characters`);
    process.exit(1);
  }
}

let authUrlObject;
try {
  authUrlObject = new URL(process.env.AUTH_URL.trim());
} catch {
  console.error("✗ AUTH_URL is not a valid URL");
  process.exit(1);
}
if (authUrlObject.protocol !== "https:") {
  console.error("✗ production AUTH_URL must use https");
  process.exit(1);
}

try {
  const rawDatabaseUrl = new URL(process.env.DATABASE_URL.trim());
  const urlTlsParameters = [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "sslpassword",
  ].filter((parameter) => rawDatabaseUrl.searchParams.has(parameter));
  if (urlTlsParameters.length > 0) {
    throw new Error(
      `remove TLS parameters from DATABASE_URL: ${urlTlsParameters.join(", ")}`,
    );
  }
  normalizeDatabaseUrl(rawDatabaseUrl.toString());
  createDatabaseSslOptions(process.env);
} catch (error) {
  console.error(`✗ production database TLS config invalid: ${error.message}`);
  process.exit(1);
}

const adminEmails = process.env.ADMIN_EMAILS.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (
  adminEmails.length === 0 ||
  adminEmails.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
) {
  console.error("✗ ADMIN_EMAILS must contain valid comma-separated emails");
  process.exit(1);
}

if (process.env.OPS_ALERT_WEBHOOK_URL?.trim()) {
  try {
    const opsWebhookUrl = new URL(process.env.OPS_ALERT_WEBHOOK_URL.trim());
    if (opsWebhookUrl.protocol !== "https:") throw new Error();
  } catch {
    console.error("✗ OPS_ALERT_WEBHOOK_URL must be a valid https URL");
    process.exit(1);
  }
}

const captchaKeys = ["HCAPTCHA_SITE_KEY", "HCAPTCHA_SECRET_KEY"];
const configuredCaptchaKeys = captchaKeys.filter((key) => process.env[key]?.trim());
if (
  configuredCaptchaKeys.length > 0 &&
  configuredCaptchaKeys.length !== captchaKeys.length
) {
  console.error("✗ production hCaptcha env must be configured together");
  process.exit(1);
}

const reviewLoginKeys = [
  "REVIEW_LOGIN_ID",
  "REVIEW_LOGIN_PASSWORD",
  "REVIEW_LOGIN_USER_EMAIL",
];
const configuredReviewLoginKeys = reviewLoginKeys.filter(
  (key) => process.env[key]?.trim(),
);
if (
  configuredReviewLoginKeys.length > 0 &&
  configuredReviewLoginKeys.length !== reviewLoginKeys.length
) {
  console.error("✗ production review login env must be configured together");
  process.exit(1);
}
if (configuredReviewLoginKeys.length === reviewLoginKeys.length) {
  if (process.env.REVIEW_LOGIN_ID.trim().length < 3) {
    console.error("✗ production REVIEW_LOGIN_ID must be at least 3 characters");
    process.exit(1);
  }
  if (process.env.REVIEW_LOGIN_PASSWORD.length < 12) {
    console.error(
      "✗ production REVIEW_LOGIN_PASSWORD must be at least 12 characters",
    );
    process.exit(1);
  }
  if (!process.env.REVIEW_LOGIN_USER_EMAIL.includes("@")) {
    console.error("✗ production REVIEW_LOGIN_USER_EMAIL is invalid");
    process.exit(1);
  }
}

const expectedHostnames = new Set(
  process.env.TURNSTILE_EXPECTED_HOSTNAMES.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const authHostname = authUrlObject.hostname.toLowerCase();
if (!expectedHostnames.has(authHostname)) {
  console.error("✗ TURNSTILE_EXPECTED_HOSTNAMES does not include AUTH_URL hostname");
  process.exit(1);
}

console.log("✓ production security environment configured");
