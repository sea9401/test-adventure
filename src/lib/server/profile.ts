import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import {
  PROFILE_STORAGE_KEY,
  CHARACTER_STATE_KEY,
} from "@/lib/storage-keys";
import { isProfileComplete } from "@/adventure/profile/profileValue";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";

// 로그인 유저가 온보딩(캐릭터 생성)을 끝냈는지 서버에서 판정.
// ⚠️ OnboardingGate(클라)의 needsOnboarding 과 "정확히" 같은 기준이어야 / ↔ /sign-in ↔
//    /create 사이 무한 리다이렉트가 안 생긴다. 클라 기준:
//      needsOnboarding = needsSetup || (!V2_CORE_LOOP_V2 && class === "none")
//    → 완료 = 프로필 있음 AND (코어루프 on 이거나, class !== none).
//    코어루프 on(현 운영·스테이징)은 모두 모험가(none)로 시작이 정상이라 프로필만으로 완료라
//    character.v2 쿼리는 건너뛴다(레거시 모드에서만 추가 조회).
// DB 오류 시엔 "미완료"(false) — 잘못 redirect("/") 해서 루프에 빠지는 것보다 대문/생성을
// 보여주는 쪽이 안전.
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const [profileRow] = await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, PROFILE_STORAGE_KEY)),
      )
      .limit(1);
    if (!isProfileComplete(profileRow?.value)) return false;

    if (!V2_CORE_LOOP_V2) {
      const [charRow] = await db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, userId),
            eq(savesKv.key, CHARACTER_STATE_KEY),
          ),
        )
        .limit(1);
      const cls = (charRow?.value as { class?: unknown } | undefined)?.class;
      if (parseV2Class(cls) === "none") return false;
    }
    return true;
  } catch {
    return false;
  }
}
