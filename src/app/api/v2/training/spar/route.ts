import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { resolveBattle } from "@/adventure/battle/engine";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { MONSTERS, SPAR_DUMMY_ID } from "@/adventure/data/monsters";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";

// POST /api/v2/training/spar — 훈련장 허수아비 모의전 (스파링).
//
// 라이브 SparringView 의 v2 이식. 보상/손실 전혀 없는 연습 전투 — DB 에 아무것도 쓰지 않는
// read-only 시뮬레이션이다. 캐릭터 combat 을 derive 한 뒤 더미와 resolveBattle 1회 굴려
// replay 페이로드만 돌려준다. 결과 표시는 사냥과 동일하게 ReplayBattleScene 이 담당.
//
// 허수아비 = 안 죽는 샌드백. HP 100만 고정 + 50턴 상한(maxTurns)으로 끊어, 그 동안 입힌
// 데미지를 보여주는 DPS 구경용 모의전이다. v2 는 전투를 서버에서 끝까지 굴린 뒤 로그를 한 번에
// 보여주는 리플레이 모델이라 턴 상한이 곧 로그 길이 — 50턴이면 적당하고, 어떤 빌드도 100만을
// 못 깎아 항상 "안 죽는" 샌드백이 된다(엔진은 maxTurns 초과 시 lose 로 종료 → 화면은 승패 대신
// "입힌 데미지"로 표기). 더미 atk/def 는 0("공격력도 방어력도 없는 허수아비" 라이브 설명 그대로):
// def 0 이라 데미지가 깔끔히 들어가고, atk 0 이라 플레이어가 죽지 않는다.
const SPAR_DUMMY_HP = 1_000_000;
const SPAR_MAX_TURNS = 50;

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const derived = await derivePlayerCombatV2(userId);
  if (!derived) {
    return Response.json(
      { ok: false, error: "no_character" },
      { status: 400 },
    );
  }

  const baseDummy = MONSTERS[SPAR_DUMMY_ID];
  if (!baseDummy) {
    return Response.json(
      { ok: false, error: "dummy_not_found" },
      { status: 500 },
    );
  }

  // 이름(전투 로그 표기) + v2 스킬(자동 발동) read — lock 불필요(read-only).
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, ["character-profile.v2", "skills.v2"]),
      ),
    );
  let profile: { name?: string } | null = null;
  let skillsRaw: unknown = emptyV2SkillsState();
  for (const r of rows) {
    if (r.key === "character-profile.v2") {
      profile = (r.value ?? null) as { name?: string } | null;
    } else if (r.key === "skills.v2") {
      skillsRaw = r.value ?? emptyV2SkillsState();
    }
  }
  const playerName = profile?.name?.trim() || "모험가";
  const v2Skills = parseV2SkillsState(skillsRaw);

  // 스파링은 만피로 시작 — 연습이라 현재 hp 와 무관(치료소 대용 악용도 무의미: 저장 안 함).
  const playerForBattle = { ...derived.player, hp: derived.maxHp };

  // 안 죽는 샌드백 — HP 100만 고정, atk/def 0(위 주석 참조).
  const dummy = { ...baseDummy, hp: SPAR_DUMMY_HP, atk: 0, def: 0 };

  const battleResult = resolveBattle(playerForBattle, dummy, playerName, {
    pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
    potions: {},
    v2Skills,
    maxTurns: SPAR_MAX_TURNS, // 50턴이면 종료(샌드백은 안 죽으니 lose 로 끝남).
  });

  // 처치 대신 입힌 누적 데미지(고정 HP − 잔여 HP)를 표시한다.
  const damageDealt = Math.max(
    0,
    SPAR_DUMMY_HP - battleResult.finalState.enemyHp,
  );

  return Response.json({
    ok: true,
    result: {
      won: battleResult.outcome === "win",
      turns: battleResult.turns,
      damageDealt,
      enemyName: baseDummy.name,
      // 사냥과 동일 — BattleScene 이 보는 필드만 추출, 로그 마지막 200 cap.
      replay: toReplayPayload(battleResult.finalState, 200),
      startPlayerHp: derived.maxHp,
    },
  });
}
