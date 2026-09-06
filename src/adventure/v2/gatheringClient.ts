"use client";

import { type AutoGatheringActivity } from "./autoGathering";

export function parseAutoActivity(value: unknown): AutoGatheringActivity | null {
  return value === "woodcutting" || value === "mining" ? value : null;
}


export function parseMaterials(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([id, count]) => [
      id,
      Math.max(0, Math.floor(Number(count) || 0)),
    ]),
  );
}


export function parseNextActionAt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}


export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestAutoGathering<T>(
  activity: "woodcutting" | "mining",
  body: Record<string, unknown>,
  readJson: (response: Response) => Promise<T>,
): Promise<{ response: Response; json: T }> {
  const response = await fetch(`/api/v2/${activity}/auto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, json: await readJson(response) };
}
