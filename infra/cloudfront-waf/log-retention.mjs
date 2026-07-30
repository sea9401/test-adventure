#!/usr/bin/env node
// CloudFront/WAF에 실제 연결된 CloudWatch Logs 로그 그룹만 찾아 90일 보존을 검증·적용한다.
import { spawnSync } from "node:child_process";

const AWS_REGION = "us-east-1";
const RETENTION_DAYS = 90;
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID ?? "E2NWRUQ46FYRC";
const WEB_ACL_NAME = process.env.WEB_ACL_NAME ?? "msmsge-production-cloudfront";
const AWS_CLI = process.env.AWS_CLI ?? "aws";

function usage() {
  console.log(`Usage: node infra/cloudfront-waf/log-retention.mjs [--audit|--apply]

  --audit  연결된 CloudFront/WAF 로그 그룹의 보존 기간만 확인한다. (기본값)
  --apply  해당 로그 그룹에 90일 보존을 적용하고 다시 확인한다.

Optional environment variables:
  DISTRIBUTION_ID  CloudFront distribution ID
  WEB_ACL_NAME     CLOUDFRONT scope WAF Web ACL name`);
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

function parseLogGroupArn(resourceArn, accountId, source) {
  const match = resourceArn.match(
    /^arn:[^:]+:logs:([^:]+):(\d{12}):log-group:([A-Za-z0-9._/#-]+)(?::\*)?$/,
  );
  if (!match) {
    throw new Error(`${source} destination is not a CloudWatch Logs log group ARN: ${resourceArn}`);
  }
  if (match[2] !== accountId) {
    throw new Error(`${source} log group belongs to another account: ${resourceArn}`);
  }
  return { region: match[1], name: match[3] };
}

function addLogGroup(groups, resourceArn, accountId, source) {
  const parsed = parseLogGroupArn(resourceArn, accountId, source);
  const key = `${parsed.region}\0${parsed.name}`;
  const existing = groups.get(key);
  if (existing) {
    existing.sources.add(source);
    return;
  }
  groups.set(key, { ...parsed, sources: new Set([source]) });
}

function getRetention(region, name) {
  const response = awsJson([
    "logs",
    "describe-log-groups",
    "--region",
    region,
    "--log-group-name-prefix",
    name,
  ]);
  const exact = (response.logGroups ?? []).filter((group) => group.logGroupName === name);
  if (exact.length !== 1) {
    throw new Error(`expected one exact log group; found ${exact.length}: ${region} ${name}`);
  }
  return exact[0].retentionInDays ?? "Never expire";
}

function discoverCloudFrontGroups(groups, accountId) {
  const distributionArn = `arn:aws:cloudfront::${accountId}:distribution/${DISTRIBUTION_ID}`;
  const sourcesResponse = awsJson([
    "logs",
    "describe-delivery-sources",
    "--region",
    AWS_REGION,
  ]);
  const sourceNames = (sourcesResponse.deliverySources ?? [])
    .filter((source) => (source.resourceArns ?? []).includes(distributionArn))
    .map((source) => source.name);
  if (sourceNames.length === 0) {
    throw new Error(`CloudFront standard logging v2 is not configured for ${distributionArn}`);
  }

  const deliveries = awsJson([
    "logs",
    "describe-deliveries",
    "--region",
    AWS_REGION,
  ]).deliveries ?? [];
  const destinations = awsJson([
    "logs",
    "describe-delivery-destinations",
    "--region",
    AWS_REGION,
  ]).deliveryDestinations ?? [];
  const sourceSet = new Set(sourceNames);
  const cloudWatchDeliveries = deliveries.filter(
    (delivery) =>
      sourceSet.has(delivery.deliverySourceName) && delivery.deliveryDestinationType === "CWL",
  );
  if (cloudWatchDeliveries.length === 0) {
    throw new Error("CloudFront logging exists, but it has no CloudWatch Logs destination");
  }

  for (const delivery of cloudWatchDeliveries) {
    const matches = destinations.filter(
      (destination) =>
        destination.arn === delivery.deliveryDestinationArn &&
        destination.deliveryDestinationType === "CWL",
    );
    if (matches.length !== 1) {
      throw new Error(
        `expected one CloudFront delivery destination; found ${matches.length}: ${delivery.deliveryDestinationArn}`,
      );
    }
    const resourceArn = matches[0].deliveryDestinationConfiguration?.destinationResourceArn;
    if (!resourceArn) {
      throw new Error(`CloudFront delivery destination has no resource ARN: ${delivery.deliveryDestinationArn}`);
    }
    addLogGroup(groups, resourceArn, accountId, "CloudFront");
  }
}

function discoverWafGroups(groups, accountId) {
  const webAcls = awsJson([
    "wafv2",
    "list-web-acls",
    "--scope",
    "CLOUDFRONT",
    "--region",
    AWS_REGION,
  ]).WebACLs ?? [];
  const matches = webAcls.filter((webAcl) => webAcl.Name === WEB_ACL_NAME);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one CLOUDFRONT Web ACL named ${WEB_ACL_NAME}; found ${matches.length}`,
    );
  }

  let logging;
  try {
    logging = awsJson([
      "wafv2",
      "get-logging-configuration",
      "--resource-arn",
      matches[0].ARN,
      "--region",
      AWS_REGION,
    ]).LoggingConfiguration;
  } catch (error) {
    throw new Error(`WAF request logging is not configured for ${WEB_ACL_NAME}: ${error.message}`);
  }
  const destinationArns = logging?.LogDestinationConfigs ?? [];
  if (destinationArns.length === 0) {
    throw new Error(`WAF request logging has no destination for ${WEB_ACL_NAME}`);
  }
  const cloudWatchArns = destinationArns.filter((arn) => /^arn:[^:]+:logs:/.test(arn));
  if (cloudWatchArns.length === 0) {
    throw new Error("WAF logging exists, but it has no CloudWatch Logs destination");
  }
  for (const resourceArn of cloudWatchArns) {
    addLogGroup(groups, resourceArn, accountId, "WAF");
  }
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
  if (!/^[A-Z0-9]+$/.test(DISTRIBUTION_ID)) {
    throw new Error(`invalid DISTRIBUTION_ID: ${DISTRIBUTION_ID}`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(WEB_ACL_NAME)) {
    throw new Error(`invalid WEB_ACL_NAME: ${WEB_ACL_NAME}`);
  }

  const identity = awsJson(["sts", "get-caller-identity"]);
  const accountId = identity.Account;
  if (!/^\d{12}$/.test(accountId ?? "")) {
    throw new Error("could not determine the 12-digit AWS account ID");
  }

  const groups = new Map();
  discoverCloudFrontGroups(groups, accountId);
  discoverWafGroups(groups, accountId);

  console.log(`AWS account: ${accountId}`);
  console.log(`Mode: ${mode}`);
  console.log(`Target retention: ${RETENTION_DAYS} days`);

  let noncompliant = false;
  for (const group of groups.values()) {
    const current = getRetention(group.region, group.name);
    console.log(
      `${[...group.sources].join(",").padEnd(16)} ${group.region.padEnd(12)} ${group.name} current=${current}`,
    );
    noncompliant ||= current !== RETENTION_DAYS;
  }

  if (mode === "audit") {
    if (noncompliant) {
      throw new Error("Retention is not compliant. Re-run with --apply.");
    }
    console.log("All connected CloudFront/WAF log groups retain logs for exactly 90 days.");
    return;
  }

  for (const group of groups.values()) {
    aws([
      "logs",
      "put-retention-policy",
      "--region",
      group.region,
      "--log-group-name",
      group.name,
      "--retention-in-days",
      String(RETENTION_DAYS),
    ]);
  }
  for (const group of groups.values()) {
    const current = getRetention(group.region, group.name);
    if (current !== RETENTION_DAYS) {
      throw new Error(
        `retention verification failed: ${group.region} ${group.name} current=${current}`,
      );
    }
  }
  console.log(`Applied and verified 90-day retention on ${groups.size} exact log group(s).`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
