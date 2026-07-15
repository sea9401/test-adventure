"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuardedActivity } from "@/lib/server/activityGuard";

export type ActivityVerificationChallenge = {
  activity: GuardedActivity;
  siteKey: string;
  captchaSiteKey: string | null;
  reason: "volume" | "strong_signal";
};

export type ActivityVerificationSubmission = {
  turnstileToken: string;
  captchaToken?: string;
};

export class ActivityVerificationRequiredError extends Error {
  constructor() {
    super("human_verification_required");
    this.name = "ActivityVerificationRequiredError";
  }
}

export class ActivityCooldownError extends Error {
  readonly nextActionAt: number;

  constructor(nextActionAt: number) {
    super("activity_cooldown");
    this.name = "ActivityCooldownError";
    this.nextActionAt = nextActionAt;
  }
}

function cooldownUntil(
  raw: unknown,
  activity: GuardedActivity,
): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.error !== "activity_cooldown" &&
    value.error !== "fishing_friction"
  ) {
    return null;
  }
  if (typeof value.activity === "string" && value.activity !== activity) {
    return null;
  }
  const storedNextActionAt = Number(value.nextActionAt);
  if (Number.isFinite(storedNextActionAt) && storedNextActionAt > Date.now()) {
    return Math.floor(storedNextActionAt);
  }
  const retryAfterSec = Math.max(1, Math.ceil(Number(value.retryAfterSec) || 0));
  return Date.now() + retryAfterSec * 1_000;
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
    captchaSiteKey:
      typeof value.captchaSiteKey === "string" && value.captchaSiteKey.length > 0
        ? value.captchaSiteKey
        : null,
    reason: value.reason === "strong_signal" ? "strong_signal" : "volume",
  };
}

export function useActivityVerification(activity: GuardedActivity) {
  const [verification, setVerification] =
    useState<ActivityVerificationChallenge | null>(null);

  const readJson = useCallback(
    async (response: Response) => {
      const json = await response.json().catch(() => null);
      const nextActionAt = cooldownUntil(json, activity);
      if (response.status === 429 && nextActionAt !== null) {
        throw new ActivityCooldownError(nextActionAt);
      }
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
    async (submission: ActivityVerificationSubmission): Promise<boolean> => {
      const response = await fetch("/api/v2/activity-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activity,
          token: submission.turnstileToken,
          captchaToken: submission.captchaToken,
        }),
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

export function useActivityCooldown() {
  const [nextActionAt, setNextActionAt] = useState<number | null>(null);
  const [clock, setClock] = useState(0);

  const applyNextActionAt = useCallback((raw: unknown) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= Date.now()) return;
    setNextActionAt((current) => Math.max(current ?? 0, Math.floor(value)));
    setClock(Date.now());
  }, []);

  const handleCooldownError = useCallback(
    (error: unknown): boolean => {
      if (!(error instanceof ActivityCooldownError)) return false;
      applyNextActionAt(error.nextActionAt);
      return true;
    },
    [applyNextActionAt],
  );

  useEffect(() => {
    if (nextActionAt === null) return;
    const tick = () => {
      const now = Date.now();
      setClock(now);
      if (nextActionAt <= now) setNextActionAt(null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [nextActionAt]);

  return {
    applyNextActionAt,
    handleCooldownError,
    cooldownRemainingSec:
      nextActionAt === null
        ? 0
        : Math.max(0, Math.ceil((nextActionAt - clock) / 1_000)),
  };
}
