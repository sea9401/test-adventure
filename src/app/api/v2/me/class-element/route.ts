import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_SELECTABLE_CLASSES,
  parseV2Class,
  signaturesForClass,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  v2SkillSlotsForLevel,
} from "@/adventure/data/v2/v2Skills";
import {
  RESPEC_COOLDOWN_MS,
  isClassChange,
  isPaidRespec,
  respecGoldCost,
} from "@/adventure/data/v2/respec";
import {
  parseProficiencyForChar,
  setGrown,
  emptyProficiency,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

// POST /api/v2/me/class-element — 직업·속성 선택/변경.
// PR-6 비용 전직: 첫 선택(none/neutral 에서)은 무료. 변경은 레벨비례 골드 + 24h 쿨다운.
// 시그니처는 숙련도 학습(learn-skill)이라 여기선 자동 학습 안 함 — equipped 만
// 학습분∩새 직업 체인으로 reconcile(learned 보존, docs §6).

type CharSaveShape = {
  class?: unknown;
  element?: unknown;
  level?: number;
  gold?: number;
  lastRespecAt?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { class?: unknown; element?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nextClass: V2Class = parseV2Class(body.class);
  const nextElement: V2Element = parseV2Element(body.element);
  if (!V2_SELECTABLE_CLASSES.includes(nextClass)) {
    return Response.json({ ok: false, error: "bad_class" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    // 락 순서 통일 — character.v2 → skills.v2 (hunt·learn 라우트와 동일, 데드락 방지).
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
    const curElement = parseV2Element(charSave.element);
    const level = Math.max(1, charSave.level ?? 1);
    const gold = Math.max(0, charSave.gold ?? 0);
    const lastRespecAt =
      typeof charSave.lastRespecAt === "number" ? charSave.lastRespecAt : 0;

    // PR-7 — respec 은 직업군 단위. 같은 직업군의 1차를 골라도(2차 캐릭이 자기 군 1차 선택 등)
    // 현 직업을 유지(다운그레이드 X). 첫 선택/타 직업군 변경만 effectiveClass 가 nextClass.
    const effectiveClass: V2Class =
      curClass === "none" || isClassChange(curClass, nextClass)
        ? nextClass
        : curClass;
    // 직업군 변경(다른 직업으로 전직) = prestige 리셋 — 레벨 1·exp 0·grown 리셋(advance 와 동일).
    // 새 직업군은 숙련도 0부터라 새로 키운다. 첫 선택(none→)·속성만 변경은 레벨 유지.
    const groupChanged = isClassChange(curClass, nextClass);
    const nextLevel = groupChanged ? 1 : level;
    // 스킬은 학습+수동장착(자동부여·자동장착 폐지). 직업(군) 변경 시 learned 불변,
    // equipped 는 PRUNE 만(새 체인 밖/미학습 제거 + 슬롯 절단, 리셋 후 레벨 기준).
    const chain = new Set<string>(signaturesForClass(effectiveClass));
    const learnedSet = new Set<string>(skills.learned);
    const skillSlots = v2SkillSlotsForLevel(nextLevel);

    // PR-6 비용 전직 — 변경(none/neutral 에서의 첫 선택 제외) 시 골드+쿨다운.
    const paid = isPaidRespec(curClass, nextClass, curElement, nextElement);
    let spent = 0;
    let nextGold = gold;
    let nextLastRespecAt = lastRespecAt;
    let cooldownUntil =
      lastRespecAt > 0 ? lastRespecAt + RESPEC_COOLDOWN_MS : 0;

    if (paid) {
      if (lastRespecAt > 0 && now < lastRespecAt + RESPEC_COOLDOWN_MS) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "respec_cooldown" as const,
            cooldownUntil: lastRespecAt + RESPEC_COOLDOWN_MS,
          },
        };
      }
      const cost = respecGoldCost(
        curClass,
        nextClass,
        curElement,
        nextElement,
        level,
      );
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
      spent = cost;
      nextGold = gold - cost;
      nextLastRespecAt = now;
      cooldownUntil = now + RESPEC_COOLDOWN_MS;
    }

    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      class: effectiveClass,
      element: nextElement,
      gold: nextGold,
      lastRespecAt: nextLastRespecAt,
      // 직업군 변경 시 레벨 1·exp 0 리셋(prestige). 유지면 기존 값.
      ...(groupChanged ? { level: 1, exp: 0 } : {}),
    });

    // equipped PRUNE — 학습+새 체인 유효분만, 플레이어 선택 순서 유지, 슬롯 절단. learned 보존.
    await upsertSave(tx, userId, "skills.v2", {
      ...skills,
      equipped: skills.equipped
        .filter((s) => learnedSet.has(s) && chain.has(s))
        .slice(0, skillSlots),
    });

    // 직업군 변경 시 grown(랜덤 성장분) 리셋 — 레벨 1 = 성장분 0, floor 부터 재시작(advance 와 동일).
    // 락 순서 유지(character → skills → proficiency). earned/spent/caps/tier 는 보존.
    if (groupChanged) {
      const profSave = await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      );
      await upsertSave(
        tx,
        userId,
        "proficiency.v2",
        setGrown(parseProficiencyForChar(profSave, charSave), {}),
      );
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        class: effectiveClass,
        element: nextElement,
        gold: nextGold,
        spent,
        cooldownUntil,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
