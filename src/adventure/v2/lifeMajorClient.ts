// 생활 전공 화면이 쓰는 요청·오류 문구. 응답 모양은 /api/v2/life-major 와 같다.

import type { LifeMajorActivity, LifeMajorView } from "./lifeMajor";

const ERROR_LABELS: Record<string, string> = {
  not_level_100: "Lv.100을 달성한 생활만 전공으로 고를 수 있습니다.",
  same_activity: "주전공과 부전공은 서로 다른 생활이어야 합니다.",
  major_required: "부전공을 고르려면 주전공을 먼저 정해 주세요.",
  change_cooldown: "전공은 30일에 한 번만 바꿀 수 있습니다.",
  invalid_activity: "고를 수 없는 생활입니다.",
  catalyst_locked: "채광 주전공 명장 3단계부터 단련 촉매를 만들 수 있습니다.",
  not_enough_master_product: "명장 합금이나 명장 목재가 부족합니다.",
};

export function lifeMajorErrorLabel(error: unknown): string {
  return (typeof error === "string" && ERROR_LABELS[error]) || "전공을 저장하지 못했습니다.";
}

export async function fetchLifeMajorView(): Promise<LifeMajorView | null> {
  try {
    const response = await fetch("/api/v2/life-major");
    const json = (await response.json()) as { ok?: boolean } & LifeMajorView;
    return response.ok && json.ok ? json : null;
  } catch {
    return null;
  }
}

export async function saveLifeMajors(selection: {
  major: LifeMajorActivity | null;
  minor: LifeMajorActivity | null;
}): Promise<{ ok: true; view: LifeMajorView } | { ok: false; error?: string }> {
  try {
    const response = await fetch("/api/v2/life-major", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selection),
    });
    return (await response.json()) as { ok: true; view: LifeMajorView } | { ok: false; error?: string };
  } catch {
    return { ok: false };
  }
}

/** 이미 채워진 슬롯을 다른 값(또는 빈 값)으로 바꾸면 변경(쿨다운 대상). */
export function isLifeMajorChange(
  current: { major: LifeMajorActivity | null; minor: LifeMajorActivity | null },
  next: { major: LifeMajorActivity | null; minor: LifeMajorActivity | null },
): boolean {
  return (
    (current.major !== null && current.major !== next.major) ||
    (current.minor !== null && current.minor !== next.minor)
  );
}

export async function craftTemperingCatalyst(
  quantity: number,
): Promise<{ ok: true; view: LifeMajorView } | { ok: false; error?: string }> {
  try {
    const response = await fetch("/api/v2/life-major/catalyst", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    return (await response.json()) as { ok: true; view: LifeMajorView } | { ok: false; error?: string };
  } catch {
    return { ok: false };
  }
}
