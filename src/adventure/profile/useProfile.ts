import { useState } from "react";
import { type Avatar, type Gender } from "@/adventure/profile/avatars";
import {
  readProfileValue,
  type Profile,
} from "@/adventure/profile/profileValue";
import { useSavedValue } from "@/lib/storage/SaveProvider";

export const DEFAULT_NAME = "모험가";
export const DEFAULT_AVATAR: Avatar = "male1";

// 하위 호환 — 기존 import 경로(@/adventure/profile/useProfile) 유지. 단일 출처는 profileValue.ts.
export type { Profile };

export type SubmitResult =
  | { ok: true }
  | { ok: false; reason: "taken" | "invalid" | "network" | "server" };

export type SubmitOptions = {
  // 자동 재시도 직전에 한 번 호출 — UI 가 "재시도 중..." 등을 표시할 수 있도록.
  onRetry?: () => void;
};

export function useProfile() {
  const initial = useSavedValue("character-profile.v2");
  const [profile, setProfile] = useState<Profile | null>(() =>
    readProfileValue(initial),
  );

  // 서버 /api/profile/setup 호출 — 중복 닉네임 검증·users.name 등록·savesKv 갱신.
  // 성공 시 로컬 state 도 갱신. 서버가 권위 — 이미 gameName 이 박힌 사용자는 서버가
  // 기존 프로필을 돌려주므로(자가 치유 경로) 사용자 입력값(next) 대신 응답 profile 을 채택.
  // Neon DB 콜드스타트 등으로 첫 호출이 실패하는 경우가 잦아 1회 자동 재시도(1초 backoff).
  // 결정적 실패(400/409)는 재시도하지 않음.
  const submit = async (
    next: Profile,
    options?: SubmitOptions,
    attempt = 0,
  ): Promise<SubmitResult> => {
    const RETRY_DELAY_MS = 1000;
    const MAX_ATTEMPTS = 2;

    let res: Response;
    try {
      res = await fetch("/api/profile/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        options?.onRetry?.();
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return submit(next, options, attempt + 1);
      }
      return { ok: false, reason: "network" };
    }
    if (res.status === 409) return { ok: false, reason: "taken" };
    if (res.status === 400) return { ok: false, reason: "invalid" };
    if (!res.ok) {
      if (attempt < MAX_ATTEMPTS - 1) {
        options?.onRetry?.();
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return submit(next, options, attempt + 1);
      }
      return { ok: false, reason: "server" };
    }
    let serverProfile: Profile = next;
    try {
      const body = (await res.json()) as { profile?: unknown };
      const parsed = readProfileValue(body?.profile);
      if (parsed) serverProfile = parsed;
    } catch {
      // body 파싱 실패 — 사용자 입력 그대로 사용 (이전 동작).
    }
    setProfile(serverProfile);
    return { ok: true };
  };

  // 기존 캐릭터의 아바타(외형)만 변경. 이름은 그대로 유지. 서버는 /api/profile/avatar.
  // setup 과 동일한 자동 재시도(network/5xx) 정책. 알 수 없는 id 는 400 → invalid.
  const submitAvatar = async (
    nextGender: Avatar,
    options?: SubmitOptions,
    attempt = 0,
  ): Promise<SubmitResult> => {
    const RETRY_DELAY_MS = 1000;
    const MAX_ATTEMPTS = 2;
    if (!profile) return { ok: false, reason: "invalid" };

    let res: Response;
    try {
      res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: nextGender }),
      });
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        options?.onRetry?.();
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return submitAvatar(nextGender, options, attempt + 1);
      }
      return { ok: false, reason: "network" };
    }
    if (res.status === 400) return { ok: false, reason: "invalid" };
    if (!res.ok) {
      if (attempt < MAX_ATTEMPTS - 1) {
        options?.onRetry?.();
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return submitAvatar(nextGender, options, attempt + 1);
      }
      return { ok: false, reason: "server" };
    }
    setProfile({ name: profile.name, gender: nextGender });
    return { ok: true };
  };

  const name = profile?.name ?? DEFAULT_NAME;
  const gender: Gender = profile?.gender ?? DEFAULT_AVATAR;
  // SaveProvider 가 children 마운트 전에 hydrate 를 끝내므로 needsSetup 은 단순.
  const needsSetup = !profile;

  return {
    profile,
    name,
    gender,
    hydrated: true,
    needsSetup,
    submit,
    submitAvatar,
  };
}
