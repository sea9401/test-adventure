const required = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "CRON_SECRET",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(`staging env missing: ${missing.join(", ")}`);
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const databaseName = databaseUrl.pathname.replace(/^\//, "");
if (
  databaseName !== "staging_coreloop" ||
  decodeURIComponent(databaseUrl.username) !== "adventure_staging"
) {
  throw new Error("staging must use adventure_staging@.../staging_coreloop");
}

for (const name of ["AUTH_URL", "NEXTAUTH_URL"]) {
  const url = new URL(process.env[name]);
  if (url.protocol !== "https:" || url.hostname !== "test.msmsge.com") {
    throw new Error(`${name} must point to https://test.msmsge.com`);
  }
}

if (process.env.IS_STAGING !== "true") {
  throw new Error("IS_STAGING must be true");
}

const productionOnlyKeys = [
  "OPS_ALERT_WEBHOOK_URL",
  "OPS_ALERT_SECURITY_WEBHOOK_URL",
  "OPS_ALERT_GAMEPLAY_WEBHOOK_URL",
  "BACKUP_S3_URI",
];
const sharedProductionKeys = productionOnlyKeys.filter((name) =>
  process.env[name]?.trim(),
);
if (sharedProductionKeys.length > 0) {
  throw new Error(
    `production-only integrations must be absent: ${sharedProductionKeys.join(", ")}`,
  );
}

if (process.env.R2_BUCKET && !process.env.R2_BUCKET.endsWith("-staging")) {
  throw new Error("R2_BUCKET must be a staging-only bucket");
}

console.log("staging env isolation: OK");
