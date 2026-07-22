import { TUTORIAL_ENABLED_FLAG } from "@/adventure/tutorial/flags";
import type { SyncedKey } from "@/lib/storage/synced-keys";

// 클라이언트가 쓸 수 있는 비권위 starter만 둔다. 캐릭터·인벤토리 초기값은 /api/save
// bootstrap이 서버 상수로 직접 생성해 요청 payload로 재화가 유입되지 않게 한다.

export const STARTER_SAVES: Partial<Record<SyncedKey, unknown>> = {
  // 신규 캐릭터만 튜토리얼 활성화. 기존 캐릭터는 storyFlags.v2 가 이미 서버에 있어
  // 시드가 무시되므로 자동 트리거되지 않는다 (캐릭터 탭의 "다시 보기" 로만 진입).
  "storyFlags.v2": { flags: [TUTORIAL_ENABLED_FLAG] },
};
