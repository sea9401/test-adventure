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
import {
  codexRequirement,
  countDiscoveredMaterials,
} from "@/adventure/data/v2/codex";

// POST /api/v2/me/advance-class — 다음 차수 전직(진척). 레벨 + 골드 + (3·4차) 모험의 서 게이트.
// 1→2→3→4 어느 단계든 nextTierClassOf 로 바로 위 차수로 승급. respec(직업군 변경,
// 비용+쿨다운)과 별개 — 같은 직업군 안에서의 단계 승급. 차수 전용 스킬 자동 학습.
// 3·4차는 재료 도감 등재 종 수(advanceCodexMin)를 추가 요건으로 — 직업 해금을 모험의 서
// 진척에 묶는다(설계 §11-8).

type CharSaveShape = {
  class?: unknown;
  level?: number;
  gold?: number;
  materials?: unknown;
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
    // 3·4차 모험의 서 게이트 — 재료 도감 등재 종 수가 요건 미만이면 차단.
    const codexReq = codexRequirement(V2_CLASS_DEFS[nextClass].advanceCodexMin);
    if (codexReq > 0) {
      const discovered = countDiscoveredMaterials(charSave.materials);
      if (discovered < codexReq) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "codex_incomplete" as const,
            required: codexReq,
            have: discovered,
          },
        };
      }
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
