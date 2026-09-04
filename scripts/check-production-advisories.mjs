#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_VERSION = "2026-03-10";
const MAX_AFFECTS_PER_REQUEST = 100;
const MAX_ENCODED_AFFECTS_LENGTH = 5_500;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BLOCKING_SEVERITY = 2;

const severityRank = new Map([
  ["unknown", 0],
  ["low", 1],
  ["medium", 2],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);

function packageNameFromLocation(location, metadata) {
  if (typeof metadata.name === "string" && metadata.name.length > 0) {
    return metadata.name;
  }

  const marker = "node_modules/";
  const markerIndex = location.lastIndexOf(marker);
  if (markerIndex === -1) return null;
  const tail = location.slice(markerIndex + marker.length);
  const segments = tail.split("/");
  if (segments[0]?.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }
  return segments[0] || null;
}

function productionPackageVersions(lockfile) {
  if (!lockfile || typeof lockfile !== "object" || !lockfile.packages) {
    throw new Error("package-lock.json must use a packages-based lockfile format");
  }

  const packages = new Set();
  for (const [location, metadata] of Object.entries(lockfile.packages)) {
    if (
      !location ||
      !metadata ||
      typeof metadata !== "object" ||
      metadata.dev === true ||
      metadata.link === true ||
      typeof metadata.version !== "string" ||
      metadata.version.length === 0
    ) {
      continue;
    }
    const name = packageNameFromLocation(location, metadata);
    if (name) packages.add(`${name}@${metadata.version}`);
  }

  return [...packages].sort();
}

function chunkAffects(packages) {
  const chunks = [];
  let current = [];
  for (const packageVersion of packages) {
    const candidate = [...current, packageVersion];
    if (
      current.length > 0 &&
      (candidate.length > MAX_AFFECTS_PER_REQUEST ||
        encodeURIComponent(candidate.join(",")).length >
          MAX_ENCODED_AFFECTS_LENGTH)
    ) {
      chunks.push(current);
      current = [packageVersion];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchPage(url, headers) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response;

      const body = await response.text();
      const error = new Error(
        `GitHub advisory API returned ${response.status}: ${body.slice(0, 500)}`,
      );
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.startsWith("GitHub advisory API returned 4")
      ) {
        throw error;
      }
    }

    if (attempt < MAX_ATTEMPTS) await delay(attempt * 1_000);
  }
  throw lastError ?? new Error("GitHub advisory API request failed");
}

async function advisoriesForChunk(apiUrl, type, affects, headers) {
  const query = new URLSearchParams({
    ecosystem: "npm",
    type,
    is_withdrawn: "false",
    per_page: "100",
    affects: affects.join(","),
  });
  let url = `${apiUrl.replace(/\/$/, "")}/advisories?${query}`;
  const advisories = [];

  while (url) {
    const response = await fetchPage(url, headers);
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error("GitHub advisory API returned a non-array response");
    }
    advisories.push(...page);
    url = nextPageUrl(response.headers.get("link"));
  }
  return advisories;
}

async function main() {
  const lockfilePath = resolve(process.argv[2] ?? "package-lock.json");
  const lockfile = JSON.parse(await readFile(lockfilePath, "utf8"));
  const packages = productionPackageVersions(lockfile);
  if (packages.length === 0) {
    throw new Error("no production package versions found in package-lock.json");
  }

  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "test-adventure-production-advisory-audit",
    "X-GitHub-Api-Version": API_VERSION,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const chunks = chunkAffects(packages);
  const requests = [];
  for (const type of ["reviewed", "malware"]) {
    for (const chunk of chunks) {
      requests.push(
        advisoriesForChunk(apiUrl, type, chunk, headers).then((advisories) => ({
          type,
          advisories,
        })),
      );
    }
  }
  const results = await Promise.all(requests);

  const blocking = new Map();
  for (const { type, advisories } of results) {
    for (const advisory of advisories) {
      const rank = severityRank.get(String(advisory.severity).toLowerCase()) ?? 0;
      if (type === "malware" || rank >= BLOCKING_SEVERITY) {
        const key = advisory.ghsa_id ?? advisory.cve_id ?? advisory.html_url;
        if (key) blocking.set(key, { ...advisory, advisoryType: type });
      }
    }
  }

  if (blocking.size > 0) {
    console.error(
      `GitHub Advisory Database found ${blocking.size} blocking production advisory(s):`,
    );
    for (const advisory of blocking.values()) {
      console.error(
        `- [${advisory.advisoryType}/${advisory.severity ?? "unknown"}] ${advisory.ghsa_id ?? advisory.cve_id ?? "unknown"}: ${advisory.summary ?? "no summary"}${advisory.html_url ? ` (${advisory.html_url})` : ""}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ GitHub Advisory Database: ${packages.length} production package versions checked; no medium-or-higher reviewed advisories or malware found`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
