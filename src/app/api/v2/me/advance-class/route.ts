import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CLASS_DEFS,
  parseV2Class,
  nextTierClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { advanceGoldCost } from "@/adventure/data/v2/respec";

// POST /api/v2/me/advance-class — 다음 차수 전직(진척). 레벨 게이트 + 골드(쿨다운 없음).
// 1→2→3→4 어느 단계든 nextTierClassOf 로 바로 위 차수로 승급. respec(직업군 변경,
// 비용+쿨다운)과 별개 — 같은 직업군 안에서의 단계 승급. 차수 전용 스킬 자동 학습.

type CharSaveShape = {
  class?: unknown;
  level?: number;
  gold?: number;
  [k: string]: unknown;
};

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서 통일 — character.v2 → skills.v2 (hunt·learn·class-element 와 동일).
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const skills = parseV2SkillsState(skillsRaw);

    const curClass = parseV2Class(charSave.class);
    const level = Math.max(1, charSave.level ?? 1);
    const gold = Math.max(0, charSave.gold ?? 0);

    // 전직 가능한 다음 차수 직업 (none 이거나 이미 정점(4차)이면 불가).
    const nextClass: V2Class | null = nextTierClassOf(curClass);
    if (!nextClass) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_advance" as const },
      };
    }
    const reqLevel = V2_CLASS_DEFS[nextClass].advanceLevel ?? Infinity;
    if (level < reqLevel) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "level_too_low" as const,
          required: reqLevel,
          have: level,
        },
      };
    }
    const cost = advanceGoldCost(level);
    if (gold < cost) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          required: cost,
          have: gold,
        },
      };
    }

    const nextGold = gold - cost;
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      class: nextClass,
      gold: nextGold,
    });

    // 2차 전용 스킬 자동 학습 — 이미 보유면 그대로.
    const sig = V2_CLASS_DEFS[nextClass].signatureSkill;
    if (sig && !skills.learned.includes(sig)) {
      await upsertSave(tx, userId, "skills.v2", {
        ...skills,
        learned: [...skills.learned, sig],
      });
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        class: nextClass,
        gold: nextGold,
        spent: cost,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
