"use client";

import { TowerPage } from "@/adventure/tower/TowerPage";
import { useGame } from "@/adventure/GameContext";

// AdventureScreen 에서 ?sub=tower 라우팅을 받아 TowerPage 를 렌더링하는 얇은 래퍼.
// CharacterScreen 도 같은 컴포넌트를 직접 import 해서 자기 subView 라우팅에 사용.
export function TowerSubView() {
  const { character, playerStatus, back, characterStateHook, inventory, storyFlags } =
    useGame();
  return (
    <TowerPage
      onBack={back}
      playerName={character.name}
      playerStatus={playerStatus}
      onApplied={(r) => {
        // 서버가 character.v2 / inventory.v2 를 read-modify-write 했으므로 응답으로 받은
        // 값을 in-memory 에 통째 교체. 누락하면 다음 로컬 PATCH 의 last-writer-wins 로
        // 룬·재료 보상이 덮여 사라진다 (상점/제작과 동일 패턴).
        if (r.character && typeof r.character.gold === "number") {
          characterStateHook.replaceFromSaved(r.character);
        }
        if (r.inventory) {
          inventory.replaceFromSaved(r.inventory);
        }
        // 5막 PR-D2 — 고탑 F50 도달 시 Ch 29 「빈 옥좌의 그림자」 활성화. (옛 F100 →
        // F50, 메인 스토리 게이트로 너무 가팔라서 완화. 화산의 심장이 F50 보스라
        // '정규 region.boss 다 깬 사람만 환영을 본다' 흐름은 유지.)
        // Ch 25 클리어자(endgame_apex_defeated) 한정 — 4막 미완료 캐릭의 도달은
        // 의미 없으므로 가드. idempotent (storyFlags.set 이 중복 처리).
        const floor = r.tower?.run?.currentFloor;
        if (
          floor != null &&
          floor >= 50 &&
          storyFlags.has("endgame_apex_defeated") &&
          !storyFlags.has("apex_phantom_seen")
        ) {
          storyFlags.set("apex_phantom_seen");
        }
      }}
    />
  );
}
