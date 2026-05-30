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
// 더미 HP 정규화 — 왜 라이브 그대로(500000)를 안 쓰는가:
//   라이브는 실시간 전투를 한 턴씩 관전하므로 "안 죽는 샌드백"(HP 50만)이 적절하다.
//   하지만 v2 는 서버에서 전투를 끝까지 굴린 뒤 로그를 한 번에 보여주는 리플레이 모델이라,
//   HP 50만이면 engine 의 turns>500 안전캡에 걸려 강제 패배 + 1뎀 반복의 무의미한 로그가 된다.
//   그래서 플레이어 공격력에 비례해 ~12턴이면 쓰러질 HP 로 환산 — 어떤 빌드든 유한하고 깔끔한
//   전투 기록이 나오고 항상 승리한다. 더미 atk/def 는 0 으로 둔다("공격력도 방어력도 없는
//   허수아비" 라이브 설명 그대로): def 0 이라 HP×12 환산이 정확하고, atk 0 이라 받는 피해가
//   거의 없다(엔진 DAMAGE_FLOOR 로 턴당 1 은 들어오지만, 도달 가능한 최저 공격력 atk~7 도
//   ~43턴이면 끝나 최소 maxHp 150 보다 한참 적게 깎이므로 어떤 빌드도 죽지 않는다).
const SPAR_TARGET_TURNS = 12;
const SPAR_MIN_HP = 150;
const SPAR_MAX_HP = 30000;

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

  // 공격력 기반 HP 정규화 (위 주석 참조). 물리 atk 만 기준으로 잡는다 — 자동 전투에서
  // 마법 빌드는 MP 가 마르기 전까지만 스킬 버스트를 내고 이후엔 약한 평타로 떨어지므로
  // magicAtk 를 HP 산정에 넣으면 물리 평타가 안전캡(500턴) 안에 못 깎아 강제 패배가 난다.
  // 물리 atk × 12 로 잡으면 마법 버스트는 처치를 앞당길 뿐 절대 캡에 닿지 않는다(항상 승리).
  const effDmg = Math.max(1, derived.player.atk);
  const dummyHp = Math.max(
    SPAR_MIN_HP,
    Math.min(effDmg * SPAR_TARGET_TURNS, SPAR_MAX_HP),
  );
  // atk/def 0 — 위 주석 참조. def 0 으로 HP 환산 정확 + atk 0 으로 받피 최소(무사망).
  const dummy = { ...baseDummy, hp: dummyHp, atk: 0, def: 0 };

  const battleResult = resolveBattle(playerForBattle, dummy, playerName, {
    pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
    potions: {},
    v2Skills,
  });

  return Response.json({
    ok: true,
    result: {
      won: battleResult.outcome === "win",
      turns: battleResult.turns,
      enemyName: baseDummy.name,
      // 사냥과 동일 — BattleScene 이 보는 필드만 추출, 로그 마지막 200 cap.
      replay: toReplayPayload(battleResult.finalState, 200),
      startPlayerHp: derived.maxHp,
    },
  });
}
