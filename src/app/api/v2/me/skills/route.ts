import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import {
  SPELLS,
  SPELL_LEARN_THRESHOLD,
  learnedSpellsForInt,
} from "@/adventure/data/v2/spells";

// GET /api/v2/me/skills — V2SkillsView 의 자체 fetch (라이브 스킬 시스템 폐기 후 v2
// 마법 시스템 전용으로 재작성, PR-5).
//
// 응답:
//   - spells: SPELLS 카탈로그 전체 + 학습 여부
//   - learnedSpells: 현재 INT 로 학습 가능한 spell id 들 (큰 비용→작은 비용)
//   - equippedSpells: 저장된 장착 마법 (정규화된 — 학습 안 한 / 미지원 / 슬롯 초과 제거)
//   - slotCount: 라이브 layout.normalSlots 와 공유 (사용자 결정 "스킬 슬롯 공유")
//   - intStat: 현재 캐릭의 총 INT (UI 의 "다음 마법까지 N INT" 안내용)

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const combat = await derivePlayerCombatV2(userId);
  if (!combat) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  const intStat = combat.totalStats.int ?? 0;
  const slotCount = combat.layout.normalSlots;

  // 저장된 equippedSpells — 정규화는 derive 가 player.equippedSpells 에 박았으니 재활용.
  const equippedSpells = combat.player.equippedSpells ?? [];
  const learnedSpells = learnedSpellsForInt(intStat);

  // 카탈로그 — UI 가 학습 여부·임계값 표시.
  const spells = Object.values(SPELLS).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    mpCost: s.mpCost,
    intMultiplier: s.intMultiplier,
    learnThreshold: SPELL_LEARN_THRESHOLD[s.id],
    learned: intStat >= SPELL_LEARN_THRESHOLD[s.id],
  }));

  return Response.json(
    {
      ok: true,
      spells,
      learnedSpells,
      equippedSpells,
      slotCount,
      intStat,
    },
    {
      // 응답 형식이 PR-5 에서 바뀌어(skills→spells) 옛 클라 캐시 stale 위험.
      // 매번 새로 받게 강제 — 클라 자동 새로고침(PR #455)과 함께 stale 빈 카탈로그 차단.
      headers: { "cache-control": "no-store" },
    },
  );
}

