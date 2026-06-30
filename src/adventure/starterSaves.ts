import { initialCharacterState } from "@/adventure/character/useCharacterState";
import { emptyInventory } from "@/adventure/inventory/useInventory";
import { TUTORIAL_ENABLED_FLAG } from "@/adventure/tutorial/flags";
import type { SyncedKey } from "@/lib/storage/synced-keys";

// 신규 유저용 starter 값 — SaveProvider 가 부트스트랩에서 서버에 키가 없는 경우 시드한다.
//
// 배경: useRemotePatch 는 첫 마운트의 patch 를 일부러 skip 한다 ("서버 값을 되받아 쓰는 의미
// 없는 호출" 회피). 그런데 신규 유저는 서버에 character.v2 / inventory.v2 가 아예 없어서
// 클라 default(initialCharacterState 의 gold 10, emptyInventory 의 시작 포션/재료)가 영영
// 서버로 안 박힌다. 그 상태에서 서버 권위 v2 라우트(/api/v2/dungeon/hunt·me/craft 등) 가 호출되면
// character.v2 → null → gold 0, inventory → null → 빈 인벤으로 보고 insufficient_gold /
// insufficient_items 로 거절. 첫 진입 시 한 번 시드해서 차단.
// 신규 캐릭터는 HP/MP 충전약을 100,000 씩 들고 시작 (사냥 중 부족분 자동 회복용 비축).
const STARTER_CHARGE = 100_000;

export const STARTER_SAVES: Partial<Record<SyncedKey, unknown>> = {
  "character.v2": initialCharacterState,
  "inventory.v2": {
    ...emptyInventory(),
    hpCharges: STARTER_CHARGE,
    mpCharges: STARTER_CHARGE,
  },
  // 신규 캐릭터만 튜토리얼 활성화. 기존 캐릭터는 storyFlags.v2 가 이미 서버에 있어
  // 시드가 무시되므로 자동 트리거되지 않는다 (캐릭터 탭의 "다시 보기" 로만 진입).
  "storyFlags.v2": { flags: [TUTORIAL_ENABLED_FLAG] },
};
