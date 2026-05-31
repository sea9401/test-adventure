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
} from "@/adventure/data/v2/v2Skills";
import {
  RESPEC_COOLDOWN_MS,
  isClassChange,
  isPaidRespec,
  respecGoldCost,
} from "@/adventure/data/v2/respec";

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
    // 시그니처는 숙련도로 학습(자동부여 폐지, docs §6). 직업(군) 변경 시 learned 는
    // 안 건드리고 equipped 만 학습분∩새 체인으로 reconcile — 새 직업 시그니처는 learn-skill 로 습득.
    const chain = signaturesForClass(effectiveClass);
    const learnedSet = new Set<string>(skills.learned);

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
    });

    // equipped 만 reconcile(학습분∩새 체인) — learned 는 보존(직업군 바뀌면 옛 시그니처는
    // equipped 에서만 빠지고 기록은 유지). 새 직업 시그니처는 learn-skill 로 숙련도 학습.
    await upsertSave(tx, userId, "skills.v2", {
      ...skills,
      equipped: chain.filter((s) => learnedSet.has(s)),
    });

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
