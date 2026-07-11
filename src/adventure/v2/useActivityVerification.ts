"use client";

import { useCallback, useState } from "react";
import type { GuardedActivity } from "@/lib/server/activityGuard";

export type ActivityVerificationChallenge = {
  activity: GuardedActivity;
  siteKey: string;
  reason: "volume" | "strong_signal";
};

export class ActivityVerificationRequiredError extends Error {
  constructor() {
    super("human_verification_required");
    this.name = "ActivityVerificationRequiredError";
  }
}

function parseChallenge(
  raw: unknown,
  activity: GuardedActivity,
): ActivityVerificationChallenge | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.error !== "human_verification_required" ||
    value.activity !== activity ||
    typeof value.siteKey !== "string" ||
    value.siteKey.length === 0
  ) {
    return null;
  }
  return {
    activity,
    siteKey: value.siteKey,
    reason: value.reason === "strong_signal" ? "strong_signal" : "volume",
  };
}

export function useActivityVerification(activity: GuardedActivity) {
  const [verification, setVerification] =
    useState<ActivityVerificationChallenge | null>(null);

  const readJson = useCallback(
    async (response: Response) => {
      const json = await response.json().catch(() => null);
      const challenge = parseChallenge(json, activity);
      if (response.status === 403 && challenge) {
        setVerification(challenge);
        throw new ActivityVerificationRequiredError();
      }
      return json;
    },
    [activity],
  );

  const verifyHuman = useCallback(
    async (token: string): Promise<boolean> => {
      const response = await fetch("/api/v2/activity-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity, token }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) return false;
      setVerification(null);
      return true;
    },
    [activity],
  );

  return { verification, verifyHuman, readJson };
}
