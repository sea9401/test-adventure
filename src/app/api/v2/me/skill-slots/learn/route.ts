import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import {
  V2_SKILLS,
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { V2_CLASS_DEFS, parseV2Class } from "@/adventure/data/v2/classes";

// POST /api/v2/me/skill-slots/learn — v2 스킬 학습 (교관 NPC 골드 구매).
//
// 본문: { skillId: V2SkillId }
//
// 검증 순서 (한국어 error 메시지). UX — 더 근본적인 조건 먼저 안내해
// 골드 부족이 다른 미충족 (선행/레벨/스탯) 을 가리지 않게:
// 1) 카탈로그에 존재
// 2) 학습 보유? (이미 학습 거부)
// 3) 선행 스킬 보유
// 4) 레벨 요구치
// 5) 스탯 요구치 (derivePlayerCombatV2 의 totalStats)
// 6) 골드 충분?
//
// 트랜잭션 + lockSaveForUpdate 로 동시 클릭 race 차단 (골드 2배 차감 방지).

type CharSave = {
  level?: number;
  gold?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { skillId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const skillId = typeof body.skillId === "string" ? body.skillId : "";
  if (!skillId || !(skillId in V2_SKILLS)) {
    return Response.json(
      { ok: false, error: "알 수 없는 스킬" },
      { status: 400 },
    );
  }
  const def = V2_SKILLS[skillId as V2SkillId];
  if (!def.learn) {
    // 스타터 (Tier 1) 는 자동 보유라 학습 API 호출 대상 아님.
    return Response.json(
      { ok: false, error: "학습 대상이 아닌 스킬" },
      { status: 400 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // lock 순서 통일 — character.v2 → skills.v2 (hunt·class-element 라우트와 동일).
      // 동시 hunt/전직/학습 시 AB/BA 데드락 방지. 검사는 두 행 모두 잠근 뒤 수행(순서 무관).
      const charRaw = await lockSaveForUpdate<CharSave>(
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
      if (skills.learned.includes(skillId as V2SkillId)) {
        return { ok: false as const, error: "이미 학습한 스킬", status: 400 };
      }

      // 선행 스킬 → 레벨 → 스탯 → 골드 순. 더 근본적인 조건 먼저.
      for (const preId of def.learn!.prereqSkillIds ?? []) {
        if (!skills.learned.includes(preId)) {
          const preName = V2_SKILLS[preId]?.name ?? preId;
          return {
            ok: false as const,
            error: `선행 스킬 미보유: ${preName}`,
            status: 400,
          };
        }
      }

      // PR-1 직업 전용 — requireClass 면 해당 직업이어야 학습 가능.
      const reqClass = def.learn!.requireClass;
      if (reqClass && parseV2Class(charRaw.class) !== reqClass) {
        const className =
          V2_CLASS_DEFS[parseV2Class(reqClass)]?.name ?? reqClass;
        return {
          ok: false as const,
          error: `직업 전용 스킬 (필요 직업: ${className})`,
          status: 400,
        };
      }

      const reqLevel = def.learn!.level;
      if (reqLevel != null) {
        const have = typeof charRaw.level === "number" ? charRaw.level : 1;
        if (have < reqLevel) {
          return {
            ok: false as const,
            error: `레벨 부족 (필요 Lv${reqLevel})`,
            status: 400,
          };
        }
      }

      const reqStat = def.learn!.stat;
      if (reqStat) {
        const combat = await derivePlayerCombatV2(userId, tx);
        // PR-2 — 속도(spd)는 1차 아닌 파생 스탯이라 player.spd 로 조회. 그 외는 1차 totalStats.
        const have =
          reqStat.key === "spd"
            ? combat?.player.spd ?? 0
            : combat?.totalStats?.[reqStat.key] ?? 0;
        if (have < reqStat.min) {
          return {
            ok: false as const,
            error: `스탯 부족 (필요 ${reqStat.key} ${reqStat.min})`,
            status: 400,
          };
        }
      }

      const currentGold = typeof charRaw.gold === "number" ? charRaw.gold : 0;
      if (currentGold < def.learn!.goldCost) {
        return { ok: false as const, error: "골드 부족", status: 400 };
      }

      const nextSkills: V2SkillsState = {
        learned: [...skills.learned, skillId as V2SkillId],
        equipped: skills.equipped,
      };
      const nextGold = currentGold - def.learn!.goldCost;
      await upsertSave(tx, userId, "skills.v2", nextSkills);
      await upsertSave(tx, userId, "character.v2", {
        ...charRaw,
        gold: nextGold,
      });
      return { ok: true as const, skills: nextSkills, gold: nextGold };
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }
    return Response.json({
      ok: true,
      skills: result.skills,
      gold: result.gold,
    });
  } catch (e) {
    console.error("[/api/v2/me/skill-slots/learn]", e);
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
