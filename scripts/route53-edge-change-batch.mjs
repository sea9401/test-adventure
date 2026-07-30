#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [mode, backupPath, name, distributionDomain, cloudFrontZoneId] = process.argv.slice(2);

if (!mode || !backupPath) {
  console.error("usage: route53-edge-change-batch.mjs cutover|rollback BACKUP [NAME DISTRIBUTION ZONE]");
  process.exit(2);
}

const records = JSON.parse(await readFile(backupPath, "utf8"));
if (!Array.isArray(records) || records.length !== 1 || records[0]?.Type !== "A") {
  throw new Error("backup must contain exactly one Route53 A record");
}

if (mode === "cutover") {
  if (!name || !distributionDomain || !cloudFrontZoneId) {
    throw new Error("cutover requires record name, distribution domain, and CloudFront zone ID");
  }
  const batch = {
    Comment: "msmsge CloudFront cutover",
    Changes: [
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: name,
          Type: "A",
          AliasTarget: {
            DNSName: distributionDomain,
            HostedZoneId: cloudFrontZoneId,
            EvaluateTargetHealth: false,
          },
        },
      },
    ],
  };
  console.log(JSON.stringify(batch));
} else if (mode === "rollback") {
  const batch = {
    Comment: "msmsge CloudFront rollback",
    Changes: records.map((record) => ({
      Action: "UPSERT",
      ResourceRecordSet: record,
    })),
  };
  console.log(JSON.stringify(batch));
} else {
  throw new Error(`unknown mode: ${mode}`);
}
