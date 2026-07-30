#!/usr/bin/env node
// CloudFront/WAF 로그 수집, 민감정보 제외, 90일 보존을 같은 계정에 멱등 구성한다.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const AWS_REGION = "us-east-1";
const RETENTION_DAYS = 90;
const AWS_CLI = process.env.AWS_CLI ?? "aws";

export const SAFE_CLOUDFRONT_FIELDS = Object.freeze([
  "date",
  "time",
  "x-edge-location",
  "sc-bytes",
  "c-ip",
  "cs-method",
  "cs(Host)",
  "cs-uri-stem",
  "sc-status",
  "cs(User-Agent)",
  "x-edge-result-type",
  "x-edge-request-id",
  "x-host-header",
  "cs-protocol",
  "cs-bytes",
  "time-taken",
  "ssl-protocol",
  "ssl-cipher",
  "x-edge-response-result-type",
  "cs-protocol-version",
  "c-port",
  "time-to-first-byte",
  "x-edge-detailed-result-type",
  "sc-content-type",
  "sc-content-len",
  "sc-range-start",
  "sc-range-end",
  "c-country",
  "cache-behavior-path-pattern",
]);

const SENSITIVE_CLOUDFRONT_FIELDS = new Set([
  "cs(Cookie)",
  "cs-uri-query",
  "cs(Referer)",
  "x-forwarded-for",
]);

export function buildResourceNames(distributionId) {
  return {
    cloudFrontLogGroup: "msmsge-production-cloudfront-access",
    wafLogGroup: "aws-waf-logs-msmsge-production-cloudfront",
    deliverySource: `msmsge-${distributionId}-access`,
    deliveryDestination: `msmsge-${distributionId}-cwl`,
  };
}

export function buildWafLoggingConfiguration(webAclArn, wafLogGroupArn) {
  return {
    ResourceArn: webAclArn,
    LogDestinationConfigs: [wafLogGroupArn],
    RedactedFields: [
      { SingleHeader: { Name: "authorization" } },
      { SingleHeader: { Name: "cookie" } },
      { QueryString: {} },
    ],
  };
}

export function cloudFrontFieldsArePrivate(fields) {
  return (
    Array.isArray(fields) &&
    SAFE_CLOUDFRONT_FIELDS.every((field) => fields.includes(field)) &&
    fields.every((field) => !SENSITIVE_CLOUDFRONT_FIELDS.has(field))
  );
}

export function wafRedactionsArePrivate(redactedFields) {
  if (!Array.isArray(redactedFields)) return false;
  const headers = new Set(
    redactedFields
      .map((field) => field.SingleHeader?.Name?.toLowerCase())
      .filter(Boolean),
  );
  return (
    headers.has("authorization") &&
    headers.has("cookie") &&
    redactedFields.some((field) => Object.hasOwn(field, "QueryString"))
  );
}

function usage() {
  console.log(`Usage: node infra/cloudfront-waf/configure-logging.mjs [--audit|--apply]

Required environment variables:
  DISTRIBUTION_ID  CloudFront distribution ID
  WEB_ACL_ARN      CLOUDFRONT scope WAF Web ACL ARN

  --audit  현재 로그 연결·민감정보 제외·90일 보존을 읽기 전용 확인한다. (기본값)
  --apply  안전한 표준 구성을 생성 또는 갱신하고 다시 확인한다.`);
}

function aws(args) {
  const result = spawnSync(AWS_CLI, args, {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
  });
  if (result.error) {
    throw new Error(`could not run AWS CLI: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    throw new Error(`aws ${args[0]} ${args[1]} failed: ${detail}`);
  }
  return result.stdout;
}

function awsJson(args) {
  const output = aws([...args, "--output", "json"]);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`aws ${args[0]} ${args[1]} returned invalid JSON`);
  }
}

function exactLogGroup(name) {
  const groups = awsJson([
    "logs",
    "describe-log-groups",
    "--region",
    AWS_REGION,
    "--log-group-name-prefix",
    name,
  ]).logGroups ?? [];
  return groups.find((group) => group.logGroupName === name);
}

function ensureLogGroup(name) {
  if (!exactLogGroup(name)) {
    aws(["logs", "create-log-group", "--region", AWS_REGION, "--log-group-name", name]);
  }
  aws([
    "logs",
    "put-retention-policy",
    "--region",
    AWS_REGION,
    "--log-group-name",
    name,
    "--retention-in-days",
    String(RETENTION_DAYS),
  ]);
}

function discoverDeliveryState(distributionArn, names) {
  const sources = awsJson([
    "logs",
    "describe-delivery-sources",
    "--region",
    AWS_REGION,
  ]).deliverySources ?? [];
  const destinations = awsJson([
    "logs",
    "describe-delivery-destinations",
    "--region",
    AWS_REGION,
  ]).deliveryDestinations ?? [];
  const deliveries = awsJson([
    "logs",
    "describe-deliveries",
    "--region",
    AWS_REGION,
  ]).deliveries ?? [];

  const source = sources.find((candidate) => candidate.name === names.deliverySource);
  const sourcesForDistribution = sources.filter((candidate) =>
    (candidate.resourceArns ?? []).includes(distributionArn),
  );
  const destination = destinations.find(
    (candidate) => candidate.name === names.deliveryDestination,
  );
  const delivery = destination
    ? deliveries.find(
        (candidate) =>
          candidate.deliverySourceName === names.deliverySource &&
          candidate.deliveryDestinationArn === destination.arn,
      )
    : undefined;
  return { source, sourcesForDistribution, destination, delivery };
}

function validateCollisions(state, distributionArn, cloudFrontLogGroupArn) {
  if (state.source && !(state.source.resourceArns ?? []).includes(distributionArn)) {
    throw new Error(
      `delivery source name collision: ${state.source.name} represents ${(state.source.resourceArns ?? []).join(",")}`,
    );
  }
  if (!state.source && state.sourcesForDistribution.length > 0) {
    throw new Error(
      `distribution already uses another delivery source: ${state.sourcesForDistribution.map((source) => source.name).join(",")}`,
    );
  }
  const destinationResourceArn =
    state.destination?.deliveryDestinationConfiguration?.destinationResourceArn;
  if (state.destination && destinationResourceArn !== cloudFrontLogGroupArn) {
    throw new Error(
      `delivery destination name collision: ${state.destination.name} represents ${destinationResourceArn}`,
    );
  }
}

function configureCloudFront(distributionArn, names, cloudFrontLogGroupArn) {
  let state = discoverDeliveryState(distributionArn, names);
  validateCollisions(state, distributionArn, cloudFrontLogGroupArn);

  awsJson([
    "logs",
    "put-delivery-source",
    "--region",
    AWS_REGION,
    "--name",
    names.deliverySource,
    "--resource-arn",
    distributionArn,
    "--log-type",
    "ACCESS_LOGS",
  ]);
  const destination = awsJson([
    "logs",
    "put-delivery-destination",
    "--region",
    AWS_REGION,
    "--name",
    names.deliveryDestination,
    "--delivery-destination-configuration",
    `destinationResourceArn=${cloudFrontLogGroupArn}`,
    "--output-format",
    "json",
  ]).deliveryDestination;
  if (!destination?.arn) {
    throw new Error("put-delivery-destination returned no destination ARN");
  }

  state = discoverDeliveryState(distributionArn, names);
  if (!state.delivery) {
    awsJson([
      "logs",
      "create-delivery",
      "--region",
      AWS_REGION,
      "--delivery-source-name",
      names.deliverySource,
      "--delivery-destination-arn",
      destination.arn,
      "--record-fields",
      ...SAFE_CLOUDFRONT_FIELDS,
    ]);
  } else if (
    !cloudFrontFieldsArePrivate(state.delivery.recordFields) ||
    state.delivery.recordFields.length !== SAFE_CLOUDFRONT_FIELDS.length
  ) {
    aws([
      "logs",
      "update-delivery-configuration",
      "--region",
      AWS_REGION,
      "--id",
      state.delivery.id,
      "--record-fields",
      ...SAFE_CLOUDFRONT_FIELDS,
    ]);
  }
}

function configureWaf(webAclArn, wafLogGroupArn) {
  awsJson([
    "wafv2",
    "put-logging-configuration",
    "--region",
    AWS_REGION,
    "--logging-configuration",
    JSON.stringify(buildWafLoggingConfiguration(webAclArn, wafLogGroupArn)),
  ]);
}

function audit({ accountId, distributionArn, webAclArn, names }) {
  const cloudFrontLogGroupArn =
    `arn:aws:logs:${AWS_REGION}:${accountId}:log-group:${names.cloudFrontLogGroup}`;
  const wafLogGroupArn = `arn:aws:logs:${AWS_REGION}:${accountId}:log-group:${names.wafLogGroup}`;
  const groups = [names.cloudFrontLogGroup, names.wafLogGroup].map((name) => exactLogGroup(name));
  for (const [index, group] of groups.entries()) {
    if (!group) throw new Error(`log group is missing: ${[names.cloudFrontLogGroup, names.wafLogGroup][index]}`);
    if (group.retentionInDays !== RETENTION_DAYS) {
      throw new Error(`log group retention is not 90 days: ${group.logGroupName}`);
    }
  }

  const state = discoverDeliveryState(distributionArn, names);
  validateCollisions(state, distributionArn, cloudFrontLogGroupArn);
  if (!state.source || !state.destination || !state.delivery) {
    throw new Error("CloudFront standard logging v2 delivery is incomplete");
  }
  if (state.destination.deliveryDestinationType !== "CWL") {
    throw new Error("CloudFront delivery destination is not CloudWatch Logs");
  }
  if (state.destination.outputFormat !== "json") {
    throw new Error("CloudFront delivery destination output format is not json");
  }
  if (
    !cloudFrontFieldsArePrivate(state.delivery.recordFields) ||
    state.delivery.recordFields.length !== SAFE_CLOUDFRONT_FIELDS.length
  ) {
    throw new Error("CloudFront fields include sensitive data or differ from the approved set");
  }

  const wafLogging = awsJson([
    "wafv2",
    "get-logging-configuration",
    "--region",
    AWS_REGION,
    "--resource-arn",
    webAclArn,
  ]).LoggingConfiguration;
  if (
    wafLogging?.LogDestinationConfigs?.length !== 1 ||
    wafLogging.LogDestinationConfigs[0] !== wafLogGroupArn
  ) {
    throw new Error("WAF logging destination differs from the approved log group");
  }
  if (!wafRedactionsArePrivate(wafLogging.RedactedFields)) {
    throw new Error("WAF logging does not redact authorization, cookie, and query string");
  }

  console.log(`CloudFront log group: ${names.cloudFrontLogGroup} retention=90 fields=private`);
  console.log(`WAF log group: ${names.wafLogGroup} retention=90 redactions=private`);
  console.log("EDGE LOGGING AUDIT PASS");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  if (args.length > 1 || (args[0] && !["--audit", "--apply"].includes(args[0]))) {
    usage();
    process.exitCode = 2;
    return;
  }
  const mode = args[0] === "--apply" ? "apply" : "audit";
  const distributionId = process.env.DISTRIBUTION_ID;
  const webAclArn = process.env.WEB_ACL_ARN;
  if (!distributionId || !/^[A-Z0-9]+$/.test(distributionId)) {
    throw new Error("set DISTRIBUTION_ID to a valid CloudFront distribution ID");
  }
  if (!webAclArn || !/^arn:[^:]+:wafv2:us-east-1:\d{12}:global\/webacl\//.test(webAclArn)) {
    throw new Error("set WEB_ACL_ARN to a CLOUDFRONT scope WAF Web ACL ARN in us-east-1");
  }

  const identity = awsJson(["sts", "get-caller-identity"]);
  const accountId = identity.Account;
  if (!/^\d{12}$/.test(accountId ?? "")) {
    throw new Error("could not determine the 12-digit AWS account ID");
  }
  if (!webAclArn.includes(`:${accountId}:`)) {
    throw new Error("WEB_ACL_ARN belongs to a different AWS account");
  }

  const names = buildResourceNames(distributionId);
  const distributionArn = `arn:aws:cloudfront::${accountId}:distribution/${distributionId}`;
  const cloudFrontLogGroupArn =
    `arn:aws:logs:${AWS_REGION}:${accountId}:log-group:${names.cloudFrontLogGroup}`;
  const wafLogGroupArn = `arn:aws:logs:${AWS_REGION}:${accountId}:log-group:${names.wafLogGroup}`;

  if (mode === "apply") {
    ensureLogGroup(names.cloudFrontLogGroup);
    ensureLogGroup(names.wafLogGroup);
    configureCloudFront(distributionArn, names, cloudFrontLogGroupArn);
    configureWaf(webAclArn, wafLogGroupArn);
  }
  audit({ accountId, distributionArn, webAclArn, names });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
