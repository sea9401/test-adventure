#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) {
  console.error("usage: render-cloudfront-real-ip.mjs /path/to/ip-ranges.json");
  process.exit(2);
}

const document = JSON.parse(await readFile(source, "utf8"));
const ipv4 = document.prefixes
  .filter((entry) => entry.service === "CLOUDFRONT_ORIGIN_FACING")
  .map((entry) => entry.ip_prefix);
const ipv6 = document.ipv6_prefixes
  .filter((entry) => entry.service === "CLOUDFRONT_ORIGIN_FACING")
  .map((entry) => entry.ipv6_prefix);
const prefixes = [...new Set([...ipv4, ...ipv6])].sort();

if (prefixes.length < 2) {
  throw new Error(`unexpected CloudFront origin-facing prefix count: ${prefixes.length}`);
}

console.log("# Generated from AWS ip-ranges.json; trust only CloudFront origin-facing proxies.");
for (const prefix of prefixes) {
  console.log(`set_real_ip_from ${prefix};`);
}
console.log("real_ip_header X-Forwarded-For;");
console.log("real_ip_recursive on;");
