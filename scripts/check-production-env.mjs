const required = [
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

const authUrl = process.env.AUTH_URL?.trim();
if (authUrl) {
  let authHostname;
  try {
    authHostname = new URL(authUrl).hostname.toLowerCase();
  } catch {
    console.error("✗ AUTH_URL is not a valid URL");
    process.exit(1);
  }
  if (!expectedHostnames.has(authHostname)) {
    console.error("✗ TURNSTILE_EXPECTED_HOSTNAMES does not include AUTH_URL hostname");
    process.exit(1);
  }
}

console.log("✓ production anti-macro environment configured");
