import { createHash } from "node:crypto";

function normalizeJsonValue(value: unknown, ancestors: Set<object>): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError("value is not JSON-serializable");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("value is not JSON-serializable");
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (ancestors.has(value)) {
    throw new TypeError("cannot serialize cyclic value");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeJsonValue(entry, ancestors));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError("value is not JSON-serializable");
    }

    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalizeJsonValue(record[key], ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value, new Set<object>()));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
