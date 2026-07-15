const required = [
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAMES",
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
