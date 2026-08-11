import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { isFishId, type FishId } from "@/adventure/data/v2/fish";
import {
  FISHING_CODEX_KEY,
  extractFishRegistration,
  parseFishCodex,
  registeredFishIds,
} from "@/adventure/v2/fishingCodex";
import {
  FISH_SPECIMEN_SAVE_KEY,
  addFishSpecimen,
  fishSpecimenItemId,
  parseFishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  emptyProficiency,
  parseProficiencyForChar,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { calcSpBudget } from "@/adventure/data/v2/coreLoopConfig";
import { spCapBonusFromRaw } from "@/adventure/data/v2/spFruit";
import { jobUnlockSpBonus } from "@/adventure/data/v2/v2JobCatalog";
import { validateLoadout } from "@/adventure/data/v2/v2Loadout";
import { codexSpBonusFromRaw } from "@/lib/server/codexSpBonus";
import {
  fishSpecimenExtractionProjection,
  type FishSpecimenSpProjection,
} from "@/lib/server/fishSpecimenSp";

type Confirmation = Pick<
  FishSpecimenSpProjection,
  "fishSpBefore" | "fishSpAfter" | "totalSpBefore" | "totalSpAfter"
>;

function parseConfirmation(raw: unknown): Confirmation | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const keys: (keyof Confirmation)[] = [
    "fishSpBefore",
    "fishSpAfter",
    "totalSpBefore",
    "totalSpAfter",
  ];
  if (!keys.every((key) => Number.isSafeInteger(source[key]))) return null;
  return {
    fishSpBefore: source.fishSpBefore as number,
    fishSpAfter: source.fishSpAfter as number,
    totalSpBefore: source.totalSpBefore as number,
    totalSpAfter: source.totalSpAfter as number,
  };
}

function confirmationMatches(
  confirmation: Confirmation,
  projection: FishSpecimenSpProjection,
): boolean {
  return (
    confirmation.fishSpBefore === projection.fishSpBefore &&
    confirmation.fishSpAfter === projection.fishSpAfter &&
    confirmation.totalSpBefore === projection.totalSpBefore &&
    confirmation.totalSpAfter === projection.totalSpAfter
  );
}

function errorResult(
  status: number,
  error: string,
  detail: Record<string, unknown> = {},
) {
  return { status, body: { ok: false as const, error, ...detail } };
}

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { fishId?: unknown; confirmed?: unknown; preview?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // 아래의 동일한 입력 오류로 정규화한다.
  }
  if (typeof body.fishId !== "string" || !isFishId(body.fishId)) {
    return Response.json({ ok: false, error: "invalid_fish_id" }, { status: 400 });
  }
  const fishId: FishId = body.fishId;
  const confirmed = parseConfirmation(body.confirmed);

  const result = await db.transaction(async (tx) => {
    // 스킬 저장 라우트와 같은 순서로 잠근 뒤 도감과 표본을 잠가 교차 요청의 덮어쓰기를 막는다.
    const charSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const skills = parseV2SkillsState(
      await lockSaveForUpdate<V2SkillsState>(
        tx,
        userId,
        "skills.v2",
        emptyV2SkillsState(),
      ),
    );
    const proficiency = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );
    const fishingRaw = await lockSaveForUpdate(tx, userId, FISHING_CODEX_KEY, {});
    const equipmentRaw = await lockSaveForUpdate(tx, userId, EQUIPMENT_CODEX_KEY, {});
    const specimenRaw = await lockSaveForUpdate(
      tx,
      userId,
      FISH_SPECIMEN_SAVE_KEY,
      {},
    );

    const codex = parseFishCodex(fishingRaw);
    if (!codex.fish[fishId]?.registered) {
      return errorResult(400, "not_registered");
    }

    const codexBonus = codexSpBonusFromRaw(codex, equipmentRaw);
    const jobUnlockContext = await readJobUnlockContext(tx, userId);
    const totalSpBefore = calcSpBudget(
      proficiency.groups,
      spCapBonusFromRaw(charSave.spFruitUsed),
      codexBonus.total,
      jobUnlockSpBonus(proficiency, jobUnlockContext),
    );
    const equippedSpUsed = validateLoadout(
      skills.equipped,
      skills.learned,
      totalSpBefore,
    ).spUsed;
    const projection = fishSpecimenExtractionProjection({
      codex,
      fishId,
      totalSpBefore,
      equippedSpUsed,
    });

    if (projection.overBudget) {
      return errorResult(409, "loadout_over_budget", projection);
    }
    if (body.preview === true) {
      return errorResult(
        409,
        projection.spLoss > 0
          ? "sp_confirmation_required"
          : "confirmation_required",
        projection,
      );
    }
    if (projection.spLoss > 0 && !confirmed) {
      return errorResult(409, "sp_confirmation_required", projection);
    }
    if (projection.spLoss > 0 && confirmed && !confirmationMatches(confirmed, projection)) {
      return errorResult(409, "stale_confirmation", projection);
    }

    const extracted = extractFishRegistration(codex, fishId);
    if (!extracted.extracted) return errorResult(400, "not_registered");
    const specimens = addFishSpecimen(parseFishSpecimenInventory(specimenRaw), fishId);
    await upsertSave(tx, userId, FISHING_CODEX_KEY, extracted.codex);
    await upsertSave(tx, userId, FISH_SPECIMEN_SAVE_KEY, specimens);

    return {
      status: 200,
      body: {
        ok: true as const,
        fishId,
        specimenBalance: specimens.items[fishId] ?? 0,
        registered: false,
        registeredIds: registeredFishIds(extracted.codex),
        ...projection,
      },
    };
  });

  if (result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "fish_specimen.extract",
      itemKind: "consumable",
      itemId: fishSpecimenItemId(fishId),
      quantity: 1,
      detail: { fishId },
    });
  }
  return Response.json(result.body, { status: result.status });
}
